// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';

import { createRingRtcAudioPackets } from '../../minutes/ringRtcAudioMixer.std.ts';

describe('createRingRtcAudioPackets', () => {
  it('decodes signed little-endian PCM and preserves source sample offsets', () => {
    const result = createRingRtcAudioPackets({
      sampleRate: 48_000,
      channels: 1,
      localInputStartSample: 120,
      remotePlayoutStartSample: 240,
      localInputPcm: Uint8Array.from([0x00, 0x80, 0xff, 0x7f]),
      remotePlayoutPcm: Uint8Array.from([0x00, 0x00, 0x00, 0x40]),
      droppedLocalInputSamples: 0,
      droppedRemotePlayoutSamples: 0,
    });

    assert.equal(result.local.startSample, 120);
    assert.equal(result.remote.startSample, 240);
    assert.deepEqual([...result.local.samples], [-1, 32767 / 32768]);
    assert.deepEqual([...result.remote.samples], [0, 0.5]);
    assert.equal(result.droppedSamples, 0);
  });

  it('reports native overflow without hiding it from the recorder', () => {
    const result = createRingRtcAudioPackets({
      sampleRate: 48_000,
      channels: 1,
      localInputStartSample: 3,
      remotePlayoutStartSample: 5,
      localInputPcm: new Uint8Array(),
      remotePlayoutPcm: new Uint8Array(),
      droppedLocalInputSamples: 2,
      droppedRemotePlayoutSamples: 4,
    });

    assert.equal(result.droppedSamples, 6);
  });

  it('rejects an incompatible native tap contract', () => {
    assert.throws(
      () =>
        createRingRtcAudioPackets({
          sampleRate: 44_100,
          channels: 2,
          localInputStartSample: 0,
          remotePlayoutStartSample: 0,
          localInputPcm: new Uint8Array(),
          remotePlayoutPcm: new Uint8Array(),
          droppedLocalInputSamples: 0,
          droppedRemotePlayoutSamples: 0,
        }),
      /48 kHz mono/
    );
  });

  it('rejects malformed odd-length PCM', () => {
    assert.throws(
      () =>
        createRingRtcAudioPackets({
          sampleRate: 48_000,
          channels: 1,
          localInputStartSample: 0,
          remotePlayoutStartSample: 0,
          localInputPcm: Uint8Array.from([1]),
          remotePlayoutPcm: new Uint8Array(),
          droppedLocalInputSamples: 0,
          droppedRemotePlayoutSamples: 0,
        }),
      /16-bit PCM/
    );
  });
});
