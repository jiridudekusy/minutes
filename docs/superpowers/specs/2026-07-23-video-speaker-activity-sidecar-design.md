# Video Speaker Activity Sidecar Design

**Date:** 2026-07-23

## Goal

Every successfully finalized video recording must have the same
`.speaker-activity.json` sidecar that audio recordings already produce. The
sidecar must identify local and remote speakers and keep their speaking
activity aligned with the recorded video timeline, including pause and resume.

This change applies only to video recording. The existing audio sidecar format
and behavior remain unchanged.

## Output

For a finalized recording such as:

```text
2026-07-23T12-00-00-000Z_Team_call_abcd1234_1234abcd.webm
```

Minutes writes:

```text
2026-07-23T12-00-00-000Z_Team_call_abcd1234_1234abcd.json
2026-07-23T12-00-00-000Z_Team_call_abcd1234_1234abcd.speaker-activity.json
```

The speaker sidecar uses the existing versioned `SpeakerActivityLog` schema:

- participant identities and display names;
- local/remote identity for direct calls;
- participant ACI and demux ID where available for group calls;
- 250 ms speaking-level samples on the recorded, pause-free timeline;
- simultaneous speakers represented by simultaneous active levels.

The video metadata JSON gains `speakerActivityFile`, containing only the
sidecar filename.

## Architecture and Data Flow

The existing preload `speakerActivityLogger` is shared by audio and video.
Minutes' capture coordinator prevents audio and video recording from running at
the same time, so the singleton logger cannot have two owners concurrently.

Video recording starts the logger only after the MediaRecorder and RingRTC
audio track have started successfully. It supplies the same conversation ID,
call mode, remote display name, and wall-clock start time as audio recording.

The RingRTC audio worklet reports rendered PCM progress in bounded 250 ms
increments. The video service forwards this progress to
`speakerActivityLogger.onRecordingPcm()`. This ties speaker samples to the
actual audio timeline embedded in the WebM instead of a renderer timer that can
drift or be throttled.

Video pause and resume call the logger's existing pause and resume methods.
PCM progress received while paused is ignored, so paused time is excluded from
the sidecar exactly as it is from the WebM.

During successful finalization, the video service stops the logger, clamps the
log to the finalized recording duration, and passes it through the typed video
writer IPC. The main-process writer creates the sidecar with a partial filename
and publishes it alongside the WebM and metadata. A completed WebM is therefore
never reported with a missing speaker sidecar.

## Failure Handling

- Failed startup stops and discards any partially started activity log.
- Fatal recording errors and explicit aborts stop and discard the activity log;
  they do not publish a sidecar for a partial WebM.
- A sidecar or metadata write failure makes finalization fail and retains the
  WebM as a `.partial` recording, following the existing durable writer policy.
- Finalization cleanup is idempotent so concurrent stop and call-end paths
  cannot stop the logger twice or publish duplicate files.
- No audio samples or additional personal data are added to the sidecar beyond
  the existing audio `SpeakerActivityLog` format.

## Testing

Automated tests cover:

- rendered PCM progress reporting from the RingRTC audio worklet;
- video logger start, pause, resume, stop, and failed-start cleanup;
- forwarding the finalized activity log and clamping it to video duration;
- writing the correctly named sidecar and metadata reference;
- rollback behavior when sidecar publication fails;
- abort and fatal-error paths producing no completed sidecar;
- direct and group participant data remaining in the existing schema.

The existing audio speaker-activity and recording tests remain unchanged and
must continue to pass.
