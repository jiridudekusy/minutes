// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

export type VideoMp4ExportProgress = Readonly<{
  recordingPath: string;
  percent: number;
}>;

export type VideoMp4ExportResult = Readonly<{
  outputPath: string;
}>;
