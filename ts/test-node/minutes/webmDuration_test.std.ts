// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';

import {
  addWebmDurationPlaceholder,
  encodeWebmDuration,
} from '../../minutes/webmDuration.std.ts';

describe('WebM duration', () => {
  it('adds an eight-byte duration placeholder to a MediaRecorder-style header', () => {
    const input = createMinimalWebmHeader();

    const prepared = addWebmDurationPlaceholder(input);

    assert.isDefined(prepared);
    if (!prepared) {
      assert.fail('duration placeholder was not added');
    }
    assert.strictEqual(prepared.data.byteLength, input.byteLength + 11);
    assert.deepEqual(
      [
        ...prepared.data.subarray(
          prepared.durationValueOffset - 3,
          prepared.durationValueOffset
        ),
      ],
      [0x44, 0x89, 0x88]
    );
    assert.deepEqual(
      [
        ...prepared.data.subarray(
          prepared.durationValueOffset,
          prepared.durationValueOffset + 8
        ),
      ],
      [0, 0, 0, 0, 0, 0, 0, 0]
    );
    assert.strictEqual(prepared.data[21], 0x8b);
  });

  it('encodes the duration as a big-endian float', () => {
    const encoded = encodeWebmDuration(12_345.5);

    assert.strictEqual(
      new DataView(encoded.buffer).getFloat64(0, false),
      12_345.5
    );
  });

  it('leaves an existing Duration element untouched', () => {
    const prepared = addWebmDurationPlaceholder(
      Uint8Array.from([
        0x1a, 0x45, 0xdf, 0xa3, 0x80, 0x18, 0x53, 0x80, 0x67, 0x01, 0xff, 0xff,
        0xff, 0xff, 0xff, 0xff, 0xff, 0x15, 0x49, 0xa9, 0x66, 0x8b, 0x44, 0x89,
        0x88, 0, 0, 0, 0, 0, 0, 0, 0,
      ])
    );

    assert.isUndefined(prepared);
  });
});

function createMinimalWebmHeader(): Uint8Array<ArrayBuffer> {
  return Uint8Array.from([
    0x1a, 0x45, 0xdf, 0xa3, 0x80, 0x18, 0x53, 0x80, 0x67, 0x01, 0xff, 0xff,
    0xff, 0xff, 0xff, 0xff, 0xff, 0x15, 0x49, 0xa9, 0x66, 0x80, 0x16, 0x54,
    0xae, 0x6b, 0x80,
  ]);
}
