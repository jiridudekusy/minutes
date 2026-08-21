// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import {
  chmod,
  mkdir,
  mkdtemp,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';

import { assert } from 'chai';

import { VideoMp4Support } from '../../minutes/videoMp4Support.main.ts';

describe('VideoMp4Support', () => {
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
