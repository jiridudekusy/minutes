// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { assert } from 'chai';

import {
  inferAttachmentContentType,
  readConfinedAttachmentFile,
  writeConfinedAttachmentFile,
} from '../../minutes/automation/attachmentFiles.node.ts';

describe('automation attachment files', () => {
  const temporaryDirectories: Array<string> = [];

  afterEach(async () => {
    await Promise.all(
      temporaryDirectories
        .splice(0)
        .map(path => rm(path, { recursive: true, force: true }))
    );
  });

  async function makeDirectory(): Promise<string> {
    const path = await mkdtemp(join(tmpdir(), 'minutes-attachment-test-'));
    temporaryDirectories.push(path);
    return path;
  }

  it('reads a regular file only from the designated outgoing directory', async () => {
    const directory = await makeDirectory();
    const path = join(directory, 'report.pdf');
    await writeFile(path, Uint8Array.from([1, 2, 3]));

    assert.deepEqual(
      [...(await readConfinedAttachmentFile(path, directory, 10))],
      [1, 2, 3]
    );

    const outsideDirectory = await makeDirectory();
    const outsidePath = join(outsideDirectory, 'private.txt');
    await writeFile(outsidePath, 'private');
    await assert.isRejected(
      readConfinedAttachmentFile(outsidePath, directory, 10),
      'designated outgoing attachment directory'
    );
  });

  it('rejects symbolic links and oversized outgoing attachments', async () => {
    const directory = await makeDirectory();
    const targetPath = join(directory, 'target.pdf');
    const linkPath = join(directory, 'report.pdf');
    await writeFile(targetPath, Uint8Array.from([1, 2, 3]));
    await symlink(targetPath, linkPath);

    await assert.isRejected(
      readConfinedAttachmentFile(linkPath, directory, 10),
      'symbolic link'
    );
    await assert.isRejected(
      readConfinedAttachmentFile(targetPath, directory, 2),
      'exceeds'
    );
  });

  it('writes downloads with a safe unique filename without overwriting', async () => {
    const directory = await makeDirectory();
    const first = await writeConfinedAttachmentFile({
      data: Uint8Array.from([1, 2, 3]),
      directory,
      fileName: '../report.pdf',
    });
    const second = await writeConfinedAttachmentFile({
      data: Uint8Array.from([4, 5, 6]),
      directory,
      fileName: 'report.pdf',
    });

    assert.strictEqual(first, join(directory, 'report.pdf'));
    assert.strictEqual(second, join(directory, 'report-1.pdf'));
    assert.deepEqual([...(await readFile(first))], [1, 2, 3]);
    assert.deepEqual([...(await readFile(second))], [4, 5, 6]);
  });

  it('infers common content types and honors an explicit type', () => {
    assert.strictEqual(
      inferAttachmentContentType('report.pdf'),
      'application/pdf'
    );
    assert.strictEqual(inferAttachmentContentType('photo.JPG'), 'image/jpeg');
    assert.strictEqual(
      inferAttachmentContentType('unknown.data'),
      'application/octet-stream'
    );
    assert.strictEqual(
      inferAttachmentContentType('report.pdf', 'application/custom'),
      'application/custom'
    );
  });
});
