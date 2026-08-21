// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { assert } from 'chai';

import {
  buildFfmpegMp4Args,
  getMp4ExportPath,
  parseFfmpegProgress,
  VideoMp4Exporter,
} from '../../minutes/videoMp4Export.node.ts';

describe('VideoMp4Exporter', () => {
  it('builds an H.264/AAC MP4 command without a shell command string', () => {
    const args = buildFfmpegMp4Args('/tmp/input.webm', '/tmp/output.partial');

    assert.includeMembers(
      [...args],
      ['libx264', 'aac', 'yuv420p', '+faststart', 'pipe:1']
    );
    assert.equal(args.at(-2), 'mp4');
    assert.equal(args.at(-1), '/tmp/output.partial');
  });

  it('parses microsecond progress and caps it until finalization', () => {
    assert.equal(parseFfmpegProgress('out_time_us=2500000\n', 10_000), 25);
    assert.equal(parseFfmpegProgress('out_time_us=20000000\n', 10_000), 99);
    assert.isUndefined(parseFfmpegProgress('progress=continue\n', 10_000));
  });

  it('derives the MP4 path beside the canonical WebM', () => {
    assert.equal(
      getMp4ExportPath('/tmp/team.call.webm'),
      join('/tmp', 'team.call.mp4')
    );
  });

  it('rejects a WebM outside the recordings directory before spawning', async () => {
    const root = await mkdtemp(join(tmpdir(), 'minutes-mp4-export-'));
    const recordingsDir = join(root, 'recordings');
    const outsidePath = join(root, 'outside.webm');
    await mkdir(recordingsDir, { recursive: true });
    await writeFile(outsidePath, Uint8Array.from([1]));
    const exporter = new VideoMp4Exporter({
      recordingsDir,
      resolveFfmpegPath: async () => join(root, 'missing-ffmpeg'),
    });

    let error: unknown;
    try {
      await exporter.export(
        { recordingPath: outsidePath, durationMs: 1_000 },
        () => undefined
      );
    } catch (caught) {
      error = caught;
    } finally {
      await rm(root, { recursive: true, force: true });
    }

    assert.match(String(error), /pouze WebM nahrávky/);
  });
});
