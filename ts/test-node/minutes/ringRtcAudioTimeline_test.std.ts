// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';

import { RingRtcAudioTimeline } from '../../minutes/ringRtcAudioTimeline.std.ts';

describe('RingRtcAudioTimeline', () => {
  it('aligns local and remote packets by absolute sample offset and fills gaps with silence', () => {
    const timeline = new RingRtcAudioTimeline();
    timeline.enqueue('local', 2, Float32Array.from([0.25, 0.5]));
    timeline.enqueue('remote', 3, Float32Array.from([0.5, 0.75]));

    assert.deepEqual([...timeline.render(5)], [0, 0, 0.25, 1, 0.75]);
  });

  it('clips a mixed sample instead of wrapping it', () => {
    const timeline = new RingRtcAudioTimeline();
    timeline.enqueue('local', 0, Float32Array.from([0.8, -0.8]));
    timeline.enqueue('remote', 0, Float32Array.from([0.7, -0.7]));

    assert.deepEqual([...timeline.render(2)], [1, -1]);
  });

  it('drops late packets and resets to writer cursors after pause', () => {
    const timeline = new RingRtcAudioTimeline();
    timeline.enqueue('local', 0, Float32Array.from([0.5, 0.5]));
    timeline.render(2);
    timeline.enqueue('remote', 0, Float32Array.from([1, 1, 1]));
    timeline.reset(10);
    timeline.enqueue('local', 10, Float32Array.from([0.25]));

    assert.deepEqual([...timeline.render(2)], [0.25, 0]);
    assert.equal(timeline.cursor, 12);
  });
});
