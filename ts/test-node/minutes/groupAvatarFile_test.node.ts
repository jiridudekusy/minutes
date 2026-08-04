// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { assert } from 'chai';

import { readConfinedGroupAvatar } from '../../minutes/automation/groupAvatarFile.node.ts';

describe('readConfinedGroupAvatar', () => {
  const temporaryDirectories: Array<string> = [];

  afterEach(async () => {
    await Promise.all(
      temporaryDirectories
        .splice(0)
        .map(path => rm(path, { recursive: true, force: true }))
    );
  });

  async function makeDirectory(): Promise<string> {
    const path = await mkdtemp(join(tmpdir(), 'minutes-avatar-test-'));
    temporaryDirectories.push(path);
    return path;
  }

  it('reads a regular file inside the designated directory', async () => {
    const directory = await makeDirectory();
    const path = join(directory, 'avatar.png');
    await writeFile(path, Uint8Array.from([1, 2, 3]));

    assert.deepEqual(
      [...(await readConfinedGroupAvatar(path, directory, 10))],
      [1, 2, 3]
    );
  });

  it('rejects files outside the designated directory', async () => {
    const directory = await makeDirectory();
    const outsideDirectory = await makeDirectory();
    const path = join(outsideDirectory, 'private.png');
    await writeFile(path, Uint8Array.from([1, 2, 3]));

    await assert.isRejected(
      readConfinedGroupAvatar(path, directory, 10),
      'designated avatar directory'
    );
  });

  it('rejects symbolic links even when their target is inside the directory', async () => {
    const directory = await makeDirectory();
    const targetPath = join(directory, 'target.png');
    const linkPath = join(directory, 'avatar.png');
    await writeFile(targetPath, Uint8Array.from([1, 2, 3]));
    await symlink(targetPath, linkPath);

    await assert.isRejected(
      readConfinedGroupAvatar(linkPath, directory, 10),
      'symbolic link'
    );
  });

  it('checks the size before reading the file', async () => {
    const directory = await makeDirectory();
    const path = join(directory, 'avatar.png');
    await writeFile(path, Uint8Array.from([1, 2, 3]));

    await assert.isRejected(
      readConfinedGroupAvatar(path, directory, 2),
      'exceeds'
    );
  });
});
