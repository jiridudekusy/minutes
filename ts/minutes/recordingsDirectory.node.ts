// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { COPYFILE_EXCL } from 'node:constants';
import {
  copyFile,
  mkdir,
  readdir,
  rename,
  rmdir,
  stat,
  unlink,
} from 'node:fs/promises';
import { dirname, join } from 'node:path';

import pMap from 'p-map';

export const RECORDINGS_DOCUMENTS_DIR_NAME = 'Minutes';

const OPERATING_SYSTEM_METADATA_FILES = new Set([
  '.DS_Store',
  'Thumbs.db',
  'desktop.ini',
]);

type NodeError = Error & Readonly<{ code?: string }>;

export type RecordingsMigrationResult = Readonly<{
  migratedFiles: ReadonlyArray<string>;
  conflicts: ReadonlyArray<string>;
}>;

export type RecordingsDirectoryInitializationResult = Readonly<{
  recordingsDir: string;
  migration: RecordingsMigrationResult;
  migrationError?: unknown;
}>;

function errorCode(error: unknown): string | undefined {
  return error instanceof Error ? (error as NodeError).code : undefined;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (errorCode(error) === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

export function resolveMinutesRecordingsDir(documentsDir: string): string {
  return join(documentsDir, RECORDINGS_DOCUMENTS_DIR_NAME);
}

export async function initializeMinutesRecordingsDirectory({
  legacyDir,
  targetDir,
  migrate = migrateLegacyRecordingsDirectory,
}: {
  legacyDir: string;
  targetDir: string;
  migrate?: typeof migrateLegacyRecordingsDirectory;
}): Promise<RecordingsDirectoryInitializationResult> {
  try {
    return {
      recordingsDir: targetDir,
      migration: await migrate({ legacyDir, targetDir }),
    };
  } catch (migrationError) {
    return {
      recordingsDir: legacyDir,
      migration: { migratedFiles: [], conflicts: [] },
      migrationError,
    };
  }
}

export async function migrateLegacyRecordingsDirectory({
  legacyDir,
  targetDir,
  renameDirectory = rename,
}: {
  legacyDir: string;
  targetDir: string;
  renameDirectory?: (source: string, target: string) => Promise<void>;
}): Promise<RecordingsMigrationResult> {
  let entries;
  try {
    entries = await readdir(legacyDir, { withFileTypes: true });
  } catch (error) {
    if (errorCode(error) !== 'ENOENT') {
      throw error;
    }
    return { migratedFiles: [], conflicts: [] };
  }

  const metadataEntries = entries.filter(
    entry => entry.isFile() && OPERATING_SYSTEM_METADATA_FILES.has(entry.name)
  );
  await pMap(metadataEntries, entry => unlink(join(legacyDir, entry.name)), {
    concurrency: 1,
  });
  entries = entries.filter(entry => !metadataEntries.includes(entry));

  const entryNames = entries.map(entry => entry.name).sort();
  await mkdir(dirname(targetDir), { recursive: true });

  if (!(await pathExists(targetDir))) {
    try {
      await renameDirectory(legacyDir, targetDir);
      return { migratedFiles: entryNames, conflicts: [] };
    } catch (error) {
      if (!['EEXIST', 'ENOTEMPTY', 'EXDEV'].includes(errorCode(error) ?? '')) {
        throw error;
      }
    }
  }

  await mkdir(targetDir, { recursive: true });
  const migratedFiles = new Array<string>();
  const conflicts = new Array<string>();

  await pMap(
    entries,
    async entry => {
      if (!entry.isFile()) {
        conflicts.push(entry.name);
        return;
      }

      const sourcePath = join(legacyDir, entry.name);
      const targetPath = join(targetDir, entry.name);
      try {
        await copyFile(sourcePath, targetPath, COPYFILE_EXCL);
      } catch (error) {
        if (errorCode(error) === 'EEXIST') {
          conflicts.push(entry.name);
          return;
        }
        throw error;
      }
      await unlink(sourcePath);
      migratedFiles.push(entry.name);
    },
    { concurrency: 1 }
  );

  try {
    await rmdir(legacyDir);
  } catch (error) {
    if (!['ENOENT', 'ENOTEMPTY'].includes(errorCode(error) ?? '')) {
      throw error;
    }
  }

  return {
    migratedFiles: migratedFiles.sort(),
    conflicts: conflicts.sort(),
  };
}
