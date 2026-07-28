# RingRTC recording audio preroll design

## Problem

Minutes polls the native RingRTC tap every 20 ms while the AudioWorklet renders
128-sample blocks every 2.67 ms. The worklet starts advancing its timeline
without any buffered audio. Normal scheduling jitter therefore makes it reach
samples that have not crossed the renderer-to-worklet boundary yet. Those
samples are rendered as silence and the real packets are discarded as late.
This creates repeated 10–40 ms holes and audible clicks in audio and video
recordings even when the live call sounds clean.

## Design

The shared RingRTC recording track will use a 100 ms (4,800 sample) preroll.
The AudioWorklet will keep outputting unrecorded silence without advancing the
RingRTC timeline until both local-input and remote-playout streams are known to
be buffered through the preroll boundary. It then emits a `ready` event.

`RingRtcAudioTrack.create()` will wait for that event before resolving, so the
audio-only or video recorder starts with the first buffered call sample rather
than recording the preroll silence. Native polling will run every 10 ms to keep
the buffer replenished with the same cadence as RingRTC capture frames.

After startup, the timeline may render a quantum only when both sources have
reported data through its end. If JavaScript scheduling briefly delays the next
poll, the worklet outputs silence to its live destination but does not advance
the recording timeline or report those temporary samples to the PCM sidecar.
Once data arrives, rendering resumes from the correct sample. Explicit native
sample-offset gaps caused by a reported tap overflow remain timeline-preserving
silence and continue to be logged.

Startup fails through the existing fatal-error path if preroll does not become
ready within two seconds. Stop remains safe during startup and unblocks the
readiness wait.

## Tests

- Simulate 20 ms packet delivery and 128-sample worklet pulls; no source sample
  may be skipped after readiness.
- Verify the cursor does not advance while initial or transient data is late.
- Require both local and remote source horizons before rendering mixed audio.
- Verify reset/pause and explicit offset-gap behavior remains unchanged.
- Run the existing audio-only and video recording coordination tests.
