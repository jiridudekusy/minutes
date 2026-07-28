# Signal screen-share video recording design

Date: 2026-07-22
Status: Approved for a technical spike

## Goal

Add a second, explicit call-recording action that produces a WebM file containing:

- only the screen-share stream currently carried by the Signal call;
- the local and remote call audio taken from the existing RingRTC media pipeline;
- a continuous timeline with black video while nobody is sharing.

The feature must work for direct and group calls on macOS ARM64 and Windows x64. It must not start an independent screen, microphone, or system-output capture session.

## Non-goals

- Recording participant cameras or the Signal user interface.
- Capturing a display or window outside the stream already shared through Signal.
- Replacing or changing the existing MP3 recording, transcription, or summary pipeline.
- Running audio and video recording simultaneously.
- Transcribing or summarizing a video recording in the first version.
- Recovering or silently deleting an unfinished `.webm.partial` file after an application crash.

## User-visible behavior

The call screen has two mutually exclusive recording actions:

1. the existing audio recording action;
2. a new screen-share video recording action.

The video action has Start, Pause/Resume, and Stop states matching the existing recording controls. Starting either recording disables the other action until the active recording is finalized.

Video recording may start before anybody shares. The output then contains black 1920x1080 frames and call audio. When Signal reports an active presenter, the recorder automatically follows that Signal stream. When sharing stops, it returns to black. When the presenter changes, it switches on the next available frame. This applies equally to the local user's Signal screen share and a remote participant's screen share.

Stopping the recording or ending the call finalizes the WebM file. Paused time is excluded from the output timeline. The completed file is saved in the existing `minutes/recordings` directory and shown with the existing file-saved notification pattern.

## Architecture

### Capture coordinator

A new coordinator under `ts/minutes/` owns the mutually exclusive mode:

- `idle`
- `audio-recording`
- `audio-paused`
- `video-recording`
- `video-paused`
- `finalizing`

The audio service keeps its MP3, transcription, and metadata behavior, but its only media input is the same mixed RingRTC audio track used by video recording. It does not open an independent microphone or operating-system loopback capture. Both audio and video services acquire and release their mode through the coordinator. The existing call-ended hook delegates finalization to whichever recorder is active, avoiding a second lifecycle hook in Signal calling code.

### Presentation source registry

A Minutes-owned registry tracks the current Signal presentation source without opening a new capture source. It accepts only sources whose Signal call state identifies them as presentations:

- an off-screen canvas fed only by RingRTC's outgoing-video tap while the local user is presenting;
- the direct-call remote canvas while the remote participant is `presenting`;
- a group participant canvas while that participant is `sharingScreen`.

The registry stores the source element plus a stable source identity. Unmounting, presenter changes, PiP transitions, and call changes unregister stale sources. Signal's current presenter selection is authoritative if more than one candidate is temporarily mounted.

Registration alone is not proof that a canvas already contains a presentation frame. A direct or group canvas may still hold its last camera bitmap while Signal switches the participant to screen sharing. Every presentation change therefore creates a new `not-ready` source generation. The compositor remains black until Signal's renderer explicitly marks the first frame for that generation as rendered. Remote canvas renderers call a small `markPresentationFrameRendered` hook immediately after drawing the presentation frame. The local RingRTC adapter marks the generation ready only after receiving and drawing the first active tapped frame. An explicit inactive tap event unregisters the local canvas immediately, so mute, share stop, and source transitions cannot retain a stale frame. A timeout or elapsed-time heuristic is not sufficient, because it could leak a stale camera frame.

The integration points in upstream Signal components are restricted to imports and small register/unregister calls. Selection, lifecycle, and recording logic remain in `ts/minutes/`.

### Video compositor

A Minutes-owned off-screen canvas produces a fixed 1920x1080 stream at 15 fps. Every frame starts black. If the registry has a valid presentation element with non-zero dimensions, the compositor draws it centered with aspect-fit scaling and black letterboxing. It never crops or stretches the source and never substitutes a camera canvas.

The compositor uses `HTMLCanvasElement.captureStream(15)`. If the active presentation changes or disappears, the same output track continues, preserving the MediaRecorder timeline.

### RingRTC media facade

The public RingRTC 2.69.7 Node API exposes device selection, muting controls, voice-processing configuration, and audio levels, but not PCM samples. A TypeScript-only wrapper therefore cannot satisfy the requirement.

Minutes will maintain a small, versioned RingRTC fork and distribute it behind a compatibility package, logically named `@minutes/ringrtc`. The Minutes dependency installs that package through the existing `@signalapp/ringrtc` dependency key, so current Signal imports remain unchanged. The facade preserves the full upstream API and adds versioned audio- and outgoing-video-tap capabilities.

The native addition exposes bounded shared ring buffers rather than invoking JavaScript every 10 ms. It provides:

- local PCM from the same RingRTC audio-input path supplied to the call, after mute gating and at the latest practical PCM boundary before transport encoding;
- remote mixed PCM returned by WebRTC for RingRTC playout, before the operating-system output device;
- monotonically increasing sample counters and overflow counters;
- start, stop, and capability/version negotiation.

This definition intentionally concerns the call's PCM media boundary, not encrypted RTP packets or codec-identical reconstruction. It guarantees that the recorder does not open or sample an audio device independently. Muting the local microphone in Signal must produce silence in the local tap while leaving remote playout unaffected.

The outgoing-video tap is attached in RingRTC's Electron `sendVideoFrame` boundary immediately before the frame enters `outgoing_video_source`. It copies only the tightly packed pixel payload RingRTC consumes, never the caller's oversized reusable buffer. The tap is a bounded latest-event slot and returns either a new I420, NV12, or RGBA frame or an explicit inactive event. It captures only while RingRTC's outgoing video track is enabled and, for this feature, while RingRTC identifies that track as screen share. Enabling or disabling either gate creates a new not-ready/inactive event before any later frame can become visible.

This is the unencoded media frame Signal supplies to RingRTC, not a copy of the desktop and not an encrypted or codec-identical RTP recording. WebRTC may subsequently scale or drop frames for bandwidth adaptation. Tapping encoded RTP would couple the recorder to simulcast, retransmission, encryption, and codec internals and is outside this design.

The fork stays in the separate public `jiridudekusy/minutes-ringrtc` source repository. Its CI builds the native Node addon against the Electron version used by Minutes and publishes macOS ARM64 and Windows x64 prebuilds together with an installable package in a versioned GitHub release. Minutes pins that release tarball directly; the compatibility package then fetches only Minutes-controlled, checksum-verified native artifacts. A Minutes release must fail if the required prebuild is missing or its tap API version does not match.

### Audio rendering and WebM muxing

A Minutes AudioWorklet reads the RingRTC shared buffers, aligns them by sample counter, mixes local and remote PCM, and writes a continuous audio stream to a `MediaStreamAudioDestinationNode`. Missing short ranges become silence so the media clock does not jump. Samples accumulated while paused are discarded before resume. This destination track is shared as the sole input abstraction for both the existing MP3 recorder and the WebM recorder.

The destination audio track and compositor video track form the MediaRecorder input stream. Codec selection is deterministic:

1. `video/webm;codecs=vp9,opus`
2. `video/webm;codecs=vp8,opus`

If neither is supported, video recording does not start.

### Streaming file writer

Video data must not accumulate for the duration of a meeting in renderer memory. MediaRecorder emits approximately one-second chunks. A dedicated IPC module creates a session-specific `.webm.partial` file, serializes chunk appends, reports write failures, and finalizes only after the last chunk is durable.

Successful completion closes the file and atomically renames it to `.webm`. Sidecar metadata records the conversation, call mode, start/end timestamps, recorded duration, video dimensions, frame rate, codec, and media kind `screen-share-video`. Video metadata is separate from the existing audio/transcription catalog schema.

## Lifecycle

### Start

1. Acquire `video-recording` mode from the coordinator.
2. Verify the RingRTC audio- and video-tap API versions and a supported WebM codec.
3. Create the partial-file session.
4. Start the RingRTC audio tap, outgoing screen-share video tap, and AudioWorklet.
5. Start the black compositor stream.
6. Start MediaRecorder with one-second chunks.

Any failure unwinds already-created resources, closes the partial session, releases the coordinator, and reports an error. A recording never continues silently without its required audio track.

### Pause and resume

Pause calls `MediaRecorder.pause`, suspends compositor production, and marks the current audio and video reader positions. RingRTC continues running the call normally. Resume advances the audio reader positions to the current writers, consumes the latest video tap state, clears stale presentation readiness, resumes the recorder, and continues the shortened output timeline.

### Stop and call end

Stop is idempotent. It requests the final MediaRecorder data, waits for all queued IPC writes, stops the compositor and audio tap, closes the partial file, renames it, writes metadata, displays the saved-file notification, and releases the coordinator. Call end uses the same path.

## Error handling

- Missing or incompatible RingRTC audio tap: fail before recording starts.
- Missing or incompatible RingRTC outgoing-video tap: fail before recording starts.
- Unsupported VP9 and VP8 WebM: fail before recording starts.
- No active presentation: continue with black video and audio.
- Presentation element disappears or changes: return to black until the registry supplies the authoritative Signal presentation.
- Audio underrun or overflow: preserve the RingRTC sample-offset gap as silence, log the lost local and remote sample counts, and continue recording.
- MediaRecorder failure or IPC backpressure beyond the bounded queue: stop and report an error rather than create an apparently successful damaged recording.
- Disk write failure: stop capture, close the writer, retain the `.webm.partial` file, and report its path when available.
- Application crash: leave the `.webm.partial` file untouched. The first version neither deletes it nor lists it as a completed recording.

Cleanup paths must never stop or mutate Signal's own media tracks. The recorder releases only its compositor track, RingRTC tap readers, AudioWorklet, MediaRecorder, and file session.

## Minimal Signal Desktop integration

The intended upstream footprint is:

- `package.json` and package metadata: select the compatible Minutes RingRTC build;
- the already-modified `CallScreen.dom.tsx`: host video controls and publish presentation authority;
- `DirectCallRemoteParticipant.dom.tsx`: a small presentation-canvas registration hook;
- `GroupCallRemoteParticipant.dom.tsx`: a small presentation-canvas registration hook;
- the existing call-end Minutes hook: delegate through the shared capture coordinator.

All business logic lives under `ts/minutes/`, a dedicated `app/minutes_video_recording_channel.main.ts`, and the separately maintained RingRTC fork. Every upstream touch is recorded in `docs/MINUTES-PATCHES.md`.

## Technical spike

Implementation begins with an isolated RingRTC spike. It must prove all of the following before application-level video work proceeds:

1. No second screen, microphone, or system-output capture API is opened.
2. Local and remote PCM are available during direct and group calls.
3. Signal mute removes local voice from the tap while remote audio continues.
4. Starting and stopping the tap does not change call audio, device selection, or latency perceptibly.
5. Buffer overflow is observable and bounded.
6. The patched addon builds and loads with Minutes' Electron version on macOS ARM64 and Windows x64.
7. Native and facade tests pass on both platforms.

If any of these criteria cannot be met with a maintainable, isolated patch, work stops before adding the Minutes video recorder and the audio architecture is reconsidered.

## Testing

Development follows red-green-refactor. Production behavior is introduced only after a focused failing test demonstrates the missing behavior.

### Native and facade tests

- ring-buffer ordering, wraparound, overflow, and concurrent read/write;
- tap capability and version negotiation;
- outgoing-video enabled and screen-share-only gating;
- bounded latest-frame replacement, exact tight payload lengths, and explicit inactive transitions;
- local/remote channel separation and sample counters;
- mute gating;
- repeated start/stop and teardown during a call;
- platform prebuild loading on macOS ARM64 and Windows x64.

### Minutes unit tests

- coordinator state transitions and audio/video mutual exclusion;
- authoritative presentation selection and stale-source removal;
- a newly registered presentation remains black until its first confirmed frame, preventing stale camera-frame leakage;
- aspect-fit geometry for landscape, portrait, and changing dimensions;
- black output without a presentation;
- codec fallback;
- pause/resume buffer-position behavior;
- idempotent stop and call-end finalization.

### IPC and integration tests

- ordered chunk writes and bounded backpressure;
- partial-file retention on failure;
- atomic final rename and metadata creation;
- cleanup after failures at each start stage;
- direct and group calls with local and remote sharing;
- presenter changes, PiP transitions, pauses, and call end.

### Manual acceptance matrix

Run on macOS ARM64 and Windows x64:

- direct call: no share, local share, remote share;
- group call: no share, local share, remote share, presenter switch;
- mute/unmute and pause/resume;
- call ends while recording and while paused;
- at least one 30-minute recording.

The 30-minute recording must remain playable, contain no camera or Signal UI frames, contain no audio captured through an independently opened device, and keep audio/video drift within 250 ms.

## Delivery sequence

1. Complete and review the isolated RingRTC audio-tap spike.
2. Establish the Minutes-controlled RingRTC prebuild workflow for macOS ARM64 and Windows x64.
3. Add the capture coordinator and presentation registry with their tests.
4. Add the compositor, AudioWorklet, and MediaRecorder pipeline with their tests.
5. Add streaming file IPC, metadata, and failure handling.
6. Add call-screen controls and minimal Signal hooks.
7. Run the complete automated and manual acceptance matrix.
8. Update `docs/MINUTES-PATCHES.md`, user documentation, changelog, and release packaging.

## Effort and maintenance expectation

The expected implementation effort is 14-26 working days for one developer, including the native spike, cross-platform prebuilds, application integration, automated coverage, and real-call validation. The RingRTC spike alone is expected to take 2-4 days.

A routine RingRTC upgrade is expected to add approximately 0.5-2 working days for rebasing the isolated tap patch and rebuilding both platform artifacts. A redesign of RingRTC's audio-device boundary may require more and must be treated as a new spike rather than hidden inside an upstream sync.
