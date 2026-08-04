// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { access } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { RECORDING_PCM_SIDECAR_SUFFIX } from './whisperSettings.std.ts';

export const RECORDING_PCM_STORAGE_DIR = 'minutes/recording-pcm';

export function getPrivateRecordingPcmPath(
  userDataPath: string,
  recordingPath: string
): string {
  const recordingName = basename(recordingPath).replace(/\.(?:mp3|webm)$/i, '');
  return join(
    userDataPath,
    RECORDING_PCM_STORAGE_DIR,
    `${recordingName}${RECORDING_PCM_SIDECAR_SUFFIX}`
  );
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function resolveRecordingPcmPath({
  privatePath,
  legacyPath,
  exists = pathExists,
}: {
  privatePath: string;
  legacyPath: string;
  exists?: (path: string) => Promise<boolean>;
}): Promise<string | undefined> {
  if (await exists(privatePath)) {
    return privatePath;
  }
  if (await exists(legacyPath)) {
    return legacyPath;
  }
  return undefined;
}
