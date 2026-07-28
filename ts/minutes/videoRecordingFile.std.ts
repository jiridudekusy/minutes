// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import type { SpeakerActivityLog } from './speakerActivity.std.ts';

export const MINUTES_VIDEO_RECORDING_IPC = {
  create: 'minutes:create-video-recording-file',
  append: 'minutes:append-video-recording-chunk',
  finalize: 'minutes:finalize-video-recording-file',
  abort: 'minutes:abort-video-recording-file',
} as const;

export type VideoRecordingCodec =
  | 'video/webm;codecs=vp9,opus'
  | 'video/webm;codecs=vp8,opus';

export type CreateVideoRecordingFileOptions = Readonly<{
  conversationId: string;
  conversationTitle: string;
  callMode: string;
  eraId?: string;
  startedAt: number;
  codec: VideoRecordingCodec;
  width: number;
  height: number;
  frameRate: number;
}>;

export type CreatedVideoRecordingFile = Readonly<{
  sessionId: string;
  partialPath: string;
}>;

export type AppendVideoRecordingChunkInput = Readonly<{
  sessionId: string;
  data: Uint8Array<ArrayBuffer>;
}>;

export type FinalizeVideoRecordingFileInput = Readonly<{
  sessionId: string;
  endedAt: number;
  recordedDurationMs: number;
  speakerActivityLog: SpeakerActivityLog;
}>;

export type FinalizedVideoRecordingFile = Readonly<{
  filePath: string;
  metadataPath: string;
  speakerActivityPath: string;
}>;

export type AbortVideoRecordingFileInput = Readonly<{
  sessionId: string;
}>;

export type AbortedVideoRecordingFile = Readonly<{
  partialPath: string;
}>;

export type VideoRecordingFileOperationResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{
      ok: false;
      error: string;
      partialPath: string;
    }>;
