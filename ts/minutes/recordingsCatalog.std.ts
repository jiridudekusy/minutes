// Copyright 2026 minutes contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { RecordingMediaKind } from './recordingArtifacts.std.ts';

export type StoredCallRecordingMetadata = Readonly<{
  conversationId: string;
  conversationTitle: string;
  callMode?: string;
  eraId?: string;
  startedAt: number;
  endedAt: number;
  durationMs: number;
  mediaKind?: RecordingMediaKind;
  audioFile?: string;
  videoFile?: string;
  pcmFile?: string;
  speakerActivityFile?: string;
}>;

export type CallRecordingCatalogEntry = Readonly<{
  conversationId: string;
  conversationTitle: string;
  startedAt: number;
  endedAt: number;
  durationMs: number;
  mediaKind: RecordingMediaKind;
  recordingPath: string;
  hasPcmSidecar: boolean;
  hasTranscript: boolean;
  hasSummary: boolean;
  transcriptPath?: string;
  summaryPath?: string;
  transcriptWhisperModelFileName?: string;
  transcriptWhisperModelLabel?: string;
  transcriptGeneratedAt?: number;
}>;
