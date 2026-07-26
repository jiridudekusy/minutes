// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';

import {
  readRingRtcAudioTap,
  resolveRingRtcAudioTapApi,
} from '../../minutes/ringRtcAudioTapApi.std.ts';

describe('resolveRingRtcAudioTapApi', () => {
  const validApi = {
    isAudioTapSupported: () => true,
    audioTapVersion: () => 1,
    startAudioTap: () => undefined,
    readAudioTap: () => ({
      sampleRate: 48_000,
      channels: 1,
      localInputStartSample: 0,
      remotePlayoutStartSample: 0,
      localInputPcm: new Uint8Array(),
      remotePlayoutPcm: new Uint8Array(),
      droppedLocalInputSamples: 0,
      droppedRemotePlayoutSamples: 0,
    }),
    stopAudioTap: () => undefined,
  };

  it('accepts the exact supported audio tap contract', () => {
    assert.equal(resolveRingRtcAudioTapApi(validApi), validApi);
  });

  it('rejects upstream RingRTC without the Minutes tap', () => {
    assert.equal(resolveRingRtcAudioTapApi({}), undefined);
  });

  it('rejects an incompatible tap API version or unsupported backend', () => {
    assert.equal(
      resolveRingRtcAudioTapApi({ ...validApi, audioTapVersion: () => 2 }),
      undefined
    );
    assert.equal(
      resolveRingRtcAudioTapApi({
        ...validApi,
        isAudioTapSupported: () => false,
      }),
      undefined
    );
  });

  it('continues across repeated native overflows and reports each lost range', () => {
    let readCount = 0;
    const droppedSamples: Array<{
      localInputSamples: number;
      remotePlayoutSamples: number;
    }> = [];
    const overflowingApi = {
      ...validApi,
      readAudioTap: () => {
        readCount += 1;
        return {
          sampleRate: 48_000,
          channels: 1,
          localInputStartSample: readCount * 480,
          remotePlayoutStartSample: readCount * 480,
          localInputPcm: Uint8Array.from([0, 64]),
          remotePlayoutPcm: Uint8Array.from([0, 32]),
          droppedLocalInputSamples: readCount,
          droppedRemotePlayoutSamples: readCount * 2,
        };
      },
    };

    for (let index = 0; index < 3; index += 1) {
      const packets = readRingRtcAudioTap(overflowingApi, 4_800, event =>
        droppedSamples.push(event)
      );
      assert.lengthOf(packets.local.samples, 1);
      assert.lengthOf(packets.remote.samples, 1);
    }

    assert.equal(readCount, 3);
    assert.deepEqual(droppedSamples, [
      { localInputSamples: 1, remotePlayoutSamples: 2 },
      { localInputSamples: 2, remotePlayoutSamples: 4 },
      { localInputSamples: 3, remotePlayoutSamples: 6 },
    ]);
  });
});
