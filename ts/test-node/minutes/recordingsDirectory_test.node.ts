// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { strict as assert } from 'node:assert';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  migrateLegacyRecordingsDirectory,
  resolveMinutesRecordingsDir,
} from '../../minutes/recordingsDirectory.node.ts';

describe('Minutes recordings directory', () => {
  let rootDir: string;

  beforeEach(async () => {
    rootDir = await mkdtemp(join(tmpdir(), 'minutes-recordings-directory-'));
  });

  afterEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  it('resolves only recordings under the Documents directory', async () => {
    assert.equal(
      resolveMinutesRecordingsDir('/Users/test/Documents'),
      '/Users/test/Documents/Minutes'
    );
  });

  it('moves the complete legacy directory when the target is absent', async () => {
    const legacyDir = join(rootDir, 'Application Support', 'recordings');
    const targetDir = join(rootDir, 'Documents', 'Minutes');
    await mkdir(legacyDir, { recursive: true });
    await writeFile(join(legacyDir, 'call.mp3'), 'audio');

    const result = await migrateLegacyRecordingsDirectory({
      legacyDir,
      targetDir,
    });

    assert.deepEqual(result, {
      migratedFiles: ['call.mp3'],
      conflicts: [],
    });
    assert.equal(await readFile(join(targetDir, 'call.mp3'), 'utf8'), 'audio');
    await assert.rejects(readFile(join(legacyDir, 'call.mp3')));
  });

  it('does not migrate operating-system directory metadata', async () => {
    const legacyDir = join(rootDir, 'legacy');
    const targetDir = join(rootDir, 'Documents', 'Minutes');
    await mkdir(legacyDir, { recursive: true });
    await writeFile(join(legacyDir, 'call.mp3'), 'audio');
    await writeFile(join(legacyDir, '.DS_Store'), 'finder metadata');

    const result = await migrateLegacyRecordingsDirectory({
      legacyDir,
      targetDir,
    });

    assert.deepEqual(result, {
      migratedFiles: ['call.mp3'],
      conflicts: [],
    });
    await assert.rejects(readFile(join(targetDir, '.DS_Store')));
  });

  it('merges without overwriting conflicting recordings', async () => {
    const legacyDir = join(rootDir, 'legacy');
    const targetDir = join(rootDir, 'Documents', 'Minutes');
    await mkdir(legacyDir, { recursive: true });
    await mkdir(targetDir, { recursive: true });
    await writeFile(join(legacyDir, 'new.webm'), 'new-video');
    await writeFile(join(legacyDir, 'same.mp3'), 'legacy-audio');
    await writeFile(join(targetDir, 'same.mp3'), 'existing-audio');

    const result = await migrateLegacyRecordingsDirectory({
      legacyDir,
      targetDir,
    });

    assert.deepEqual(result, {
      migratedFiles: ['new.webm'],
      conflicts: ['same.mp3'],
    });
    assert.equal(
      await readFile(join(targetDir, 'new.webm'), 'utf8'),
      'new-video'
    );
    assert.equal(
      await readFile(join(targetDir, 'same.mp3'), 'utf8'),
      'existing-audio'
    );
    assert.equal(
      await readFile(join(legacyDir, 'same.mp3'), 'utf8'),
      'legacy-audio'
    );
  });

  it('falls back to copy-then-delete across filesystems', async () => {
    const legacyDir = join(rootDir, 'legacy');
    const targetDir = join(rootDir, 'Documents', 'Minutes');
    await mkdir(legacyDir, { recursive: true });
    await writeFile(join(legacyDir, 'call.json'), '{}');

    const result = await migrateLegacyRecordingsDirectory({
      legacyDir,
      targetDir,
      renameDirectory: async () => {
        throw Object.assign(new Error('cross-device move'), { code: 'EXDEV' });
      },
    });

    assert.deepEqual(result, {
      migratedFiles: ['call.json'],
      conflicts: [],
    });
    assert.equal(await readFile(join(targetDir, 'call.json'), 'utf8'), '{}');
    await assert.rejects(readFile(join(legacyDir, 'call.json')));
  });

  it('is safe to retry after migration', async () => {
    const legacyDir = join(rootDir, 'legacy');
    const targetDir = join(rootDir, 'Documents', 'Minutes');

    const first = await migrateLegacyRecordingsDirectory({
      legacyDir,
      targetDir,
    });
    const second = await migrateLegacyRecordingsDirectory({
      legacyDir,
      targetDir,
    });

    assert.deepEqual(first, { migratedFiles: [], conflicts: [] });
    assert.deepEqual(second, { migratedFiles: [], conflicts: [] });
  });
});
