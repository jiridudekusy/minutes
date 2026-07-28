// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import type { VideoRecordingCodec } from './videoRecordingFile.std.ts';
import type { VideoMediaRecorder } from './videoRecordingServiceCore.std.ts';

type MediaStreamConstructor = new (
  tracks?: ReadonlyArray<MediaStreamTrack>
) => MediaStream;

type MediaRecorderConstructor = new (
  stream: MediaStream,
  options?: MediaRecorderOptions
) => MediaRecorder;

export function combinePresentationAndRingRtcStreams(
  presentationStream: MediaStream,
  ringRtcStream: MediaStream,
  MediaStreamClass: MediaStreamConstructor
): MediaStream {
  return new MediaStreamClass([
    ...presentationStream.getVideoTracks(),
    ...ringRtcStream.getAudioTracks(),
  ]);
}

export type BrowserVideoMediaRecorder = VideoMediaRecorder &
  Readonly<{ recorder: MediaRecorder }>;

export function createVideoMediaRecorder(
  stream: MediaStream,
  codec: VideoRecordingCodec,
  MediaRecorderClass: MediaRecorderConstructor
): BrowserVideoMediaRecorder {
  const recorder = new MediaRecorderClass(stream, { mimeType: codec });
  const adapter: BrowserVideoMediaRecorder = {
    recorder,
    ondataavailable: undefined,
    onerror: undefined,
    onstop: undefined,
    start: timesliceMs => recorder.start(timesliceMs),
    pause: () => recorder.pause(),
    resume: () => recorder.resume(),
    requestData: () => recorder.requestData(),
    stop: () => recorder.stop(),
  };
  recorder.ondataavailable = event => adapter.ondataavailable?.(event.data);
  recorder.onerror = event => adapter.onerror?.(event);
  recorder.onstop = () => adapter.onstop?.();
  return adapter;
}
