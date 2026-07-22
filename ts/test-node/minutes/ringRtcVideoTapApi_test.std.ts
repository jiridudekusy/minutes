// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';

import {
  MAX_RING_RTC_VIDEO_TAP_DIMENSION,
  RING_RTC_VIDEO_TAP_VERSION,
  resolveRingRtcVideoTapApi,
  validateRingRtcVideoTapFrame,
} from '../../minutes/ringRtcVideoTapApi.std.ts';

describe('resolveRingRtcVideoTapApi', () => {
  const validApi = {
    isVideoTapSupported: () => true,
    videoTapVersion: () => RING_RTC_VIDEO_TAP_VERSION,
    startVideoTap: () => undefined,
    readVideoTap: (_lastSequence: number) => undefined,
    stopVideoTap: () => undefined,
  };

  it('accepts the exact supported video tap contract', () => {
    assert.strictEqual(resolveRingRtcVideoTapApi(validApi), validApi);
  });

  it('rejects RingRTC without all video tap methods', () => {
    assert.isUndefined(resolveRingRtcVideoTapApi({}));
    assert.isUndefined(
      resolveRingRtcVideoTapApi({ ...validApi, readVideoTap: undefined })
    );
  });

  it('rejects unsupported and incompatible video taps', () => {
    assert.isUndefined(
      resolveRingRtcVideoTapApi({
        ...validApi,
        isVideoTapSupported: () => false,
      })
    );
    assert.isUndefined(
      resolveRingRtcVideoTapApi({
        ...validApi,
        videoTapVersion: () => RING_RTC_VIDEO_TAP_VERSION + 1,
      })
    );
  });

  it('rejects a throwing native API object instead of propagating', () => {
    const throwingApi = new Proxy(
      {},
      {
        get: () => {
          throw new Error('native getter failed');
        },
      }
    );

    assert.doesNotThrow(() => resolveRingRtcVideoTapApi(throwingApi));
    assert.isUndefined(resolveRingRtcVideoTapApi(throwingApi));
  });
});

describe('validateRingRtcVideoTapFrame', () => {
  it('accepts tightly packed frames in each supported pixel format', () => {
    const cases = [
      { format: 'rgba', width: 4, height: 2, byteLength: 32 },
      { format: 'i420', width: 4, height: 2, byteLength: 12 },
      { format: 'nv12', width: 4, height: 2, byteLength: 12 },
      { format: 'i420', width: 3, height: 3, byteLength: 17 },
      { format: 'nv12', width: 3, height: 3, byteLength: 17 },
    ] as const;

    for (const { format, width, height, byteLength } of cases) {
      const frame = {
        sequence: 7,
        timestampUs: 123_456,
        active: true,
        width,
        height,
        format,
        data: new Uint8Array(byteLength),
      };

      assert.strictEqual(validateRingRtcVideoTapFrame(frame, 6), frame);
    }
  });

  it('accepts an inactive marker without pixel fields', () => {
    const inactive = {
      sequence: 8,
      timestampUs: 223_456,
      active: false,
    } as const;

    assert.strictEqual(validateRingRtcVideoTapFrame(inactive, 7), inactive);
    assert.isUndefined(
      validateRingRtcVideoTapFrame(
        {
          ...inactive,
          width: 2,
          height: 2,
          format: 'rgba',
          data: new Uint8Array(16),
        },
        7
      )
    );
  });

  it('rejects a negative last-sequence cursor', () => {
    const frame = {
      sequence: 1,
      timestampUs: 1,
      active: false,
    } as const;

    assert.isUndefined(validateRingRtcVideoTapFrame(frame, -1));
  });

  it('rejects non-object frames and unsupported pixel formats', () => {
    assert.isUndefined(validateRingRtcVideoTapFrame(null, 0));
    assert.isUndefined(validateRingRtcVideoTapFrame('frame', 0));
    assert.isUndefined(
      validateRingRtcVideoTapFrame(
        {
          sequence: 1,
          timestampUs: 1,
          active: true,
          width: 2,
          height: 2,
          format: 'rgb',
          data: new Uint8Array(12),
        },
        0
      )
    );
    assert.isUndefined(
      validateRingRtcVideoTapFrame(
        {
          sequence: 1,
          timestampUs: 1,
          active: true,
          width: 2,
          height: 2,
          format: 'bgra',
          data: new Uint8Array(16),
        },
        0
      )
    );
  });

  it('rejects a throwing native frame object instead of propagating', () => {
    const throwingFrame = new Proxy(
      {},
      {
        get: () => {
          throw new Error('native getter failed');
        },
      }
    );

    assert.doesNotThrow(() => validateRingRtcVideoTapFrame(throwingFrame, 0));
    assert.isUndefined(validateRingRtcVideoTapFrame(throwingFrame, 0));
  });

  it('rejects unsafe frame dimensions', () => {
    const validFrame = {
      sequence: 1,
      timestampUs: 1,
      active: true,
      width: 2,
      height: 2,
      format: 'rgba',
      data: new Uint8Array(16),
    };

    for (const dimensions of [
      { width: 0, height: 2 },
      { width: 2, height: 0 },
      { width: 1.5, height: 2 },
      { width: MAX_RING_RTC_VIDEO_TAP_DIMENSION + 1, height: 2 },
    ]) {
      assert.isUndefined(
        validateRingRtcVideoTapFrame({ ...validFrame, ...dimensions }, 0)
      );
    }
  });

  it('rejects missing or incorrectly sized pixel data', () => {
    const frame = {
      sequence: 1,
      timestampUs: 1,
      active: true,
      width: 2,
      height: 2,
      format: 'rgba',
    };

    assert.isUndefined(
      validateRingRtcVideoTapFrame({ ...frame, data: new ArrayBuffer(16) }, 0)
    );
    assert.isUndefined(
      validateRingRtcVideoTapFrame({ ...frame, data: new Uint8Array(15) }, 0)
    );
    assert.isUndefined(
      validateRingRtcVideoTapFrame(
        { ...frame, data: new Uint8Array(new SharedArrayBuffer(16)) },
        0
      )
    );
    assert.isUndefined(
      validateRingRtcVideoTapFrame(
        { ...frame, format: 'i420', data: new Uint8Array(5) },
        0
      )
    );
  });

  it('rejects stale or unsafe sequence and timestamp counters', () => {
    const frame = {
      sequence: 7,
      timestampUs: 123_456,
      active: true,
      width: 2,
      height: 2,
      format: 'rgba',
      data: new Uint8Array(16),
    };

    assert.isUndefined(validateRingRtcVideoTapFrame(frame, 7));
    assert.isUndefined(
      validateRingRtcVideoTapFrame({ ...frame, sequence: 1.5 }, 0)
    );
    assert.isUndefined(
      validateRingRtcVideoTapFrame({ ...frame, timestampUs: -1 }, 0)
    );
    assert.isUndefined(
      validateRingRtcVideoTapFrame(
        { ...frame, timestampUs: Number.MAX_SAFE_INTEGER + 1 },
        0
      )
    );
  });
});
