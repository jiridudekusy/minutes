// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { ipcRenderer, type IpcRendererEvent } from 'electron';

import type {
  VideoMp4ExportProgress,
  VideoMp4ExportResult,
} from './videoMp4Export.std.ts';
import type {
  VideoMp4SupportProgress,
  VideoMp4SupportPublic,
} from './videoMp4Support.std.ts';

const progressListeners = new Set<(progress: VideoMp4ExportProgress) => void>();
const supportProgressListeners = new Set<
  (progress: VideoMp4SupportProgress) => void
>();

ipcRenderer.on(
  'minutes:recording-mp4-export-progress',
  (_event: IpcRendererEvent, progress: VideoMp4ExportProgress) => {
    for (const listener of progressListeners) {
      listener(progress);
    }
  }
);

ipcRenderer.on(
  'minutes:recording-mp4-support-progress',
  (_event: IpcRendererEvent, progress: VideoMp4SupportProgress) => {
    for (const listener of supportProgressListeners) {
      listener(progress);
    }
  }
);

export async function getRecordingMp4Support(): Promise<VideoMp4SupportPublic> {
  return ipcRenderer.invoke('minutes:get-recording-mp4-support');
}

export async function installRecordingMp4Support(
  recordingPath: string
): Promise<VideoMp4SupportPublic> {
  return ipcRenderer.invoke('minutes:install-recording-mp4-support', {
    recordingPath,
  });
}

export function subscribeVideoMp4SupportProgress(
  listener: (progress: VideoMp4SupportProgress) => void
): () => void {
  supportProgressListeners.add(listener);
  return () => {
    supportProgressListeners.delete(listener);
  };
}

export async function exportRecordingToMp4(
  options: Readonly<{
    recordingPath: string;
    durationMs: number;
  }>
): Promise<VideoMp4ExportResult> {
  return ipcRenderer.invoke('minutes:export-recording-mp4', options);
}

export async function cancelRecordingMp4Export(
  recordingPath: string
): Promise<boolean> {
  return ipcRenderer.invoke('minutes:cancel-recording-mp4-export', {
    recordingPath,
  });
}

export function subscribeVideoMp4ExportProgress(
  listener: (progress: VideoMp4ExportProgress) => void
): () => void {
  progressListeners.add(listener);
  return () => {
    progressListeners.delete(listener);
  };
}
