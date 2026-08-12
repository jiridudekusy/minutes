// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { assert } from 'chai';

import { readPcmF32FileForWhisper } from '../../minutes/recordingPcmReader.node.ts';
import { preparePcmForWhisper } from '../../minutes/whisperAudioPrep.std.ts';

describe('recording PCM reader', () => {
  it('resamples incrementally across read chunk boundaries', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'minutes-pcm-reader-'));
    const path = join(directory, 'recording.pcm.f32');
    const input = Float32Array.from(
      { length: 47 },
      (_, index) => Math.sin(index / 5) * 0.2
    );
    await writeFile(
      path,
      Buffer.from(input.buffer, input.byteOffset, input.byteLength)
    );

    const actual = await readPcmF32FileForWhisper({
      path,
      inputSampleRate: 48_000,
      readChunkSamples: 5,
    });
    const expected = preparePcmForWhisper(input, 48_000);

    assert.deepEqual([...actual], [...expected]);
  });

  it('rejects an empty PCM sidecar', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'minutes-pcm-reader-'));
    const path = join(directory, 'empty.pcm.f32');
    await writeFile(path, Buffer.alloc(0));

    await assert.isRejected(
      readPcmF32FileForWhisper({ path }),
      'PCM sidecar is empty'
    );
  });
});
