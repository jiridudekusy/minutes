# Video Transcription and Summary Design

**Date:** 2026-07-24

## Goal

New screen-share video recordings must support the same automatic
transcription and optional AI summary flow as audio recordings. Transcription
uses the RingRTC audio mix and the existing speaker-activity timeline; it does
not inspect video frames.

Only videos recorded after this change are required to be transcribable.
Existing WebM recordings without a PCM sidecar remain valid recordings but
cannot be transcribed.

## User Experience

- Finishing a video recording continues to show the saved-file toast.
- When the call-summary extension is active, the completed video is
  automatically added to the existing transcription queue, exactly like an
  audio recording.
- When the extension is inactive, the video is saved normally and can be
  transcribed manually after the extension is activated.
- Video entries appear in the existing recording history and are visibly
  identified as video.
- A transcribable video offers the same actions as audio: transcribe, generate
  summary, send transcript, send summary, and reveal the recording file.
- An older WebM without PCM remains visible if discovered by the catalog, but
  its transcription action is disabled with an explanation that PCM data is
  unavailable.

Generated files use the video recording's base path:

```text
<base>.webm
<base>.pcm.f32
<base>.speaker-activity.json
<base>.json
<base>.transcript.whisper.md
<base>.transcript.md
<base>.transcript-meta.json
<base>.summary.md                 # only when summary generation is enabled
```

## Architecture

### Single RingRTC Audio Source

The existing RingRTC AudioWorklet already renders the exact mono mix of local
and remote audio used as the WebM audio track. It remains the only audio
source.

The worklet event is extended to deliver bounded PCM chunks instead of only
rendered-sample progress. `RingRtcAudioTrack` exposes those chunks to the video
recording service. No microphone, macOS system capture, second media capture,
WebM decoder, or ffmpeg process is introduced.

PCM chunks are emitted in batches of approximately 250 milliseconds. The
speaker-activity clock advances from the length of those same rendered chunks,
which keeps PCM, WebM audio, and speaker attribution on one timeline.

### Streaming Video File Writer

The existing video file writer owns both media streams for a recording
session:

- WebM chunks are appended to `<base>.webm.partial`.
- Float32 PCM chunks are appended to `<base>.pcm.f32.partial`.

Both streams have bounded, serialized write queues. Finalization waits for both
queues, synchronizes and closes both files, writes metadata and speaker
activity through partial files, and then atomically promotes the recording
artifacts to their final names.

Video metadata records the PCM sidecar filename in addition to the existing
video and speaker-activity filenames.

### Media-Neutral Recording Model

Minutes-owned transcription and catalog types are generalized from
MP3-specific naming to:

- `recordingPath`
- `mediaKind: 'audio' | 'screen-share-video'`

A shared recording-path helper derives the base path for both `.mp3` and
`.webm`. Transcript, summary, PCM, speaker-activity, and transcript-metadata
paths are derived from that base path.

The catalog accepts both existing audio metadata (`audioFile`) and video
metadata (`videoFile`, `mediaKind: 'screen-share-video'`). Legacy standalone
MP3 discovery remains unchanged. WebM discovery relies on Minutes video
metadata rather than guessing conversation data from its filename.

The refactor stays inside `ts/minutes/` and
`app/minutes_video_recording_channel.main.ts`; it does not require another
Signal upstream hook.

### Shared Transcription Pipeline

After successful video finalization, the video service constructs the same
recording metadata consumed by the transcription queue and enqueues a normal
transcription job.

The existing main-process pipeline then:

1. Loads `<base>.pcm.f32`.
2. Loads `<base>.speaker-activity.json`.
3. Runs Whisper and aligns segments with speaker activity.
4. Applies the existing optional AI transcript correction.
5. Writes transcript artifacts beside the WebM.
6. Runs the existing optional AI summary generation.

The queue, progress reporting, cancellation, retry behavior, saved-result UI,
and send-to-chat behavior are shared with audio recordings.

## Pause and Resume

While a video recording is paused:

- MediaRecorder remains paused.
- RingRTC PCM callbacks are not persisted.
- Speaker activity does not advance.

On resume, the existing RingRTC timeline generation is reset. Pending worklet
events from the previous generation are ignored. Consequently, neither the PCM
sidecar nor the transcript contains artificial silence corresponding to the
wall-clock pause.

## Failure Handling

- A WebM or PCM append failure terminates the video recording as an error.
- A finalization failure does not enqueue transcription.
- Diagnostic `.partial` files are retained when the recording cannot be
  finalized.
- Promotion of one artifact followed by a later promotion failure is rolled
  back to avoid presenting an incomplete finalized recording.
- A missing or empty PCM sidecar makes transcription unavailable but does not
  make an already finalized WebM unplayable.
- Whisper, transcript correction, or summary failure never deletes or changes
  the completed recording. The queue reports failure and allows retry using
  the existing behavior.
- Automatic enqueue is performed exactly once and only after all recording
  artifacts are finalized successfully.

## Testing

Unit and integration tests cover:

1. AudioWorklet PCM chunk contents, ordering, generation filtering, and
   rendered-sample counts.
2. Pause and resume without persisted pause-time silence.
3. Serialized and bounded WebM and PCM writer queues.
4. Successful atomic finalization of WebM, PCM, metadata, and speaker activity.
5. Writer failure rollback and retained partial-file behavior.
6. Automatic enqueue exactly once after successful video finalization and no
   enqueue after failure.
7. Catalog entries and derived artifact paths for MP3 and WebM.
8. Disabled transcription for old WebM recordings without PCM.
9. Video transcription and summary using the PCM and speaker-activity
   sidecars.
10. Existing audio recording, catalog, transcription, and summary behavior as
    regression coverage.

## Acceptance Criteria

- A newly recorded screen-share video produces a non-empty PCM sidecar aligned
  with its speaker-activity sidecar.
- With the call-summary extension active, stopping the video automatically
  creates one transcription job.
- The resulting transcript identifies speakers using the same rules as audio
  recordings.
- Optional transcript correction and summary generation behave identically for
  MP3 and WebM recordings.
- Paused time is absent from the PCM and speaker timeline.
- Existing audio recording and transcription behavior remains unchanged.
- No new Signal upstream source file is modified.
