// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { SPEAKER_ACTIVITY_FILE_SUFFIX } from './constants.std.ts';
import { RECORDING_PCM_SIDECAR_SUFFIX } from './whisperSettings.std.ts';

export type RecordingMediaKind = 'audio' | 'screen-share-video';

export function getRecordingBasePath(recordingPath: string): string {
  return recordingPath.replace(/\.(?:mp3|webm)$/i, '');
}

export function getRecordingArtifactPaths(recordingPath: string): Readonly<{
  basePath: string;
  pcmPath: string;
  speakerActivityPath: string;
  transcriptPath: string;
  whisperTranscriptPath: string;
  transcriptMetadataPath: string;
  summaryPath: string;
}> {
  const basePath = getRecordingBasePath(recordingPath);
  return {
    basePath,
    pcmPath: `${basePath}${RECORDING_PCM_SIDECAR_SUFFIX}`,
    speakerActivityPath: `${basePath}${SPEAKER_ACTIVITY_FILE_SUFFIX}`,
    transcriptPath: `${basePath}.transcript.md`,
    whisperTranscriptPath: `${basePath}.transcript.whisper.md`,
    transcriptMetadataPath: `${basePath}.transcript-meta.json`,
    summaryPath: `${basePath}.summary.md`,
  };
}
