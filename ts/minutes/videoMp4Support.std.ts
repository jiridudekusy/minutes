// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

export type VideoMp4SupportPublic = Readonly<{
  source: 'system' | 'downloaded' | 'missing';
  ffmpegPath?: string;
  version?: string;
  downloadLabel?: string;
}>;

export type VideoMp4SupportProgress = Readonly<{
  recordingPath: string;
  percent: number;
  detail: string;
}>;
