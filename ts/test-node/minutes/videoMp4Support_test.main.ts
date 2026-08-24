// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';

import { assert } from 'chai';

import {
  buildWindowsExpandArchiveArgs,
  extractFfmpegArchive,
  VideoMp4Support,
} from '../../minutes/videoMp4Support.main.ts';

describe('VideoMp4Support', () => {
  it('passes Windows archive paths as script-block parameters', () => {
    assert.deepEqual(buildWindowsExpandArchiveArgs(), [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      "$ErrorActionPreference = 'Stop'; Expand-Archive -LiteralPath $env:MINUTES_MP4_ARCHIVE_PATH -DestinationPath $env:MINUTES_MP4_DESTINATION_PATH -Force",
    ]);
  });

  it('extracts a partial Windows ZIP archive with spaces in its path', async function () {
    if (process.platform !== 'win32') {
      this.skip();
    }
    const root = await mkdtemp(join(tmpdir(), 'minutes mp4 zip support '));
    const archivePath = join(root, 'ffmpeg.partial.zip');
    const destination = join(root, 'extract destination');
    const zipBase64 =
      'UEsDBBQAAAAIAKBGGF2soacVIAAAAB4AAAAVAAAAbWludXRlcy16aXAtcHJvYmUudHh0e797f25mXmlJarFueWZeSn55sW5qRUFiXopufjYvFwBQSwECFAAUAAAACACgRhhdrKGnFSAAAAAeAAAAFQAAAAAAAAAAAAAAAAAAAAAAbWludXRlcy16aXAtcHJvYmUudHh0UEsFBgAAAAABAAEAQwAAAFMAAAAAAA==';
    try {
      await writeFile(archivePath, Buffer.from(zipBase64, 'base64'));
      await extractFfmpegArchive('zip', archivePath, destination);
      assert.equal(
        (
          await readFile(join(destination, 'minutes-zip-probe.txt'), 'utf8')
        ).trim(),
        'minutes-windows-expand-ok'
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('prefers a compatible FFmpeg from PATH without downloading', async function () {
    if (process.platform === 'win32') {
      this.skip();
    }
    const root = await mkdtemp(join(tmpdir(), 'minutes-mp4-support-'));
    const binDir = join(root, 'bin');
    const ffmpegPath = join(binDir, 'ffmpeg');
    const previousPath = process.env.PATH;
    await mkdir(binDir, { recursive: true });
    await writeFile(
      ffmpegPath,
      [
        '#!/bin/sh',
        'if [ "$1" = "-version" ]; then',
        '  echo "ffmpeg version system-test"',
        'elif [ "$1" = "-hide_banner" ]; then',
        '  echo " V....D libx264 H.264 encoder"',
        '  echo " A....D aac AAC encoder"',
        'elif [ "$1" = "-L" ]; then',
        '  echo "--enable-nonfree"',
        'fi',
        '',
      ].join('\n'),
      'utf8'
    );
    await chmod(ffmpegPath, 0o755);
    process.env.PATH = `${binDir}${delimiter}${previousPath ?? ''}`;
    try {
      const support = new VideoMp4Support(join(root, 'user-data'));
      const result = await support.getPublic();

      assert.equal(result.source, 'system');
      assert.equal(result.ffmpegPath, await realpath(ffmpegPath));
      assert.match(result.version ?? '', /system-test/);
    } finally {
      process.env.PATH = previousPath;
      await rm(root, { recursive: true, force: true });
    }
  });
});
