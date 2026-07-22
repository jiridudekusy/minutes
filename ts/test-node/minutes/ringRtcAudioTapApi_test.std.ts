// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';

import { resolveRingRtcAudioTapApi } from '../../minutes/ringRtcAudioTapApi.std.ts';

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
});
