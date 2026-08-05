// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';

import * as ringRtcAudioTimeline from '../../minutes/ringRtcAudioTimeline.std.ts';
import { RingRtcPcmChunker } from '../../minutes/ringRtcPcmChunker.std.ts';
import {
  readRenderedPcmEvent,
  readRingRtcAudioReadyEvent,
} from '../../minutes/ringRtcRenderedPcmProgress.std.ts';

const { RingRtcAudioTimeline } = ringRtcAudioTimeline;

describe('RingRtcAudioTimeline', () => {
  it('prerolls both sources and never advances into temporarily late packets', () => {
    const timeline = new RingRtcAudioTimeline(960);

    assert.isFalse(timeline.ready);
    assert.deepEqual([...timeline.render(128)], Array(128).fill(0));
    assert.equal(timeline.cursor, 0);

    timeline.enqueue('local', 0, new Float32Array(960).fill(0.25));
    assert.deepEqual([...timeline.render(128)], Array(128).fill(0));
    assert.equal(timeline.cursor, 0);

    timeline.enqueue('remote', 0, new Float32Array(960).fill(0.5));
    assert.isTrue(timeline.ready);
    assert.deepEqual([...timeline.render(128)], Array(128).fill(0.75));
    assert.equal(timeline.cursor, 128);

    assert.deepEqual([...timeline.render(832)], Array(832).fill(0.75));
    assert.equal(timeline.cursor, 960);

    assert.deepEqual([...timeline.render(128)], Array(128).fill(0));
    assert.equal(timeline.cursor, 960);

    timeline.enqueue('local', 960, new Float32Array(960).fill(0.25));
    timeline.enqueue('remote', 960, new Float32Array(960).fill(0.5));
    assert.deepEqual([...timeline.render(128)], Array(128).fill(0.75));
    assert.equal(timeline.cursor, 1088);
  });

  it('can start with one available source and add the other one later', () => {
    const timeline = new RingRtcAudioTimeline(4);
    timeline.enqueue('remote', 0, new Float32Array(4).fill(0.5));

    assert.isFalse(timeline.ready);
    assert.isTrue(timeline.startWithAvailableSource());
    assert.isTrue(timeline.ready);
    assert.deepEqual([...timeline.render(4)], Array(4).fill(0.5));

    timeline.enqueue('local', 0, new Float32Array(4).fill(0.25));
    timeline.enqueue('remote', 4, new Float32Array(4).fill(0.5));
    assert.deepEqual([...timeline.render(4)], Array(4).fill(0.75));
  });

  it('does not force a degraded start without a full preroll', () => {
    const timeline = new RingRtcAudioTimeline(4);
    timeline.enqueue('remote', 0, new Float32Array(3).fill(0.5));

    assert.isFalse(timeline.startWithAvailableSource());
    assert.isFalse(timeline.ready);
  });

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

  it('rebases a source whose native counter starts after the other source', () => {
    const timeline = new RingRtcAudioTimeline();
    timeline.enqueue('remote', 0, Float32Array.from([0.125, 0.125]));
    assert.deepEqual([...timeline.render(2)], [0.125, 0.125]);

    timeline.enqueue('remote', 2, Float32Array.from([0.125, 0.125]));
    timeline.enqueue('local', 0, Float32Array.from([0.5, 0.5]));
    assert.deepEqual([...timeline.render(2)], [0.625, 0.625]);

    timeline.enqueue('remote', 4, Float32Array.from([0.125, 0.125]));
    timeline.enqueue('local', 2, Float32Array.from([0.5, 0.5]));
    assert.deepEqual([...timeline.render(2)], [0.625, 0.625]);
  });

  it('continues a healthy source after a bounded one-sided stall', () => {
    const TimelineWithStallTolerance = RingRtcAudioTimeline as new (
      prerollSamples: number,
      stallToleranceSamples: number
    ) => InstanceType<typeof RingRtcAudioTimeline>;
    const timeline = new TimelineWithStallTolerance(4, 4);
    timeline.enqueue('local', 0, new Float32Array(4).fill(0.25));
    timeline.enqueue('remote', 0, new Float32Array(4).fill(0.5));
    assert.deepEqual([...timeline.render(4)], Array(4).fill(0.75));

    timeline.enqueue('local', 4, new Float32Array(4).fill(0.25));
    assert.deepEqual([...timeline.render(2)], [0, 0]);
    assert.equal(timeline.cursor, 4);
    assert.deepEqual([...timeline.render(2)], [0.25, 0.25]);
    assert.equal(timeline.cursor, 8);

    timeline.enqueue('local', 8, new Float32Array(2).fill(0.5));
    assert.deepEqual([...timeline.render(2)], [0.5, 0.5]);
    assert.equal(timeline.cursor, 10);
  });

  it('rebases a source when its native sample counter resets', () => {
    const timeline = new RingRtcAudioTimeline();
    timeline.enqueue('local', 0, new Float32Array(5_000).fill(0.25));
    assert.deepEqual([...timeline.render(5_000)], Array(5_000).fill(0.25));

    timeline.enqueue('local', 0, new Float32Array(4).fill(0.75));

    assert.deepEqual([...timeline.render(2)], [0.75, 0.75]);
    assert.equal(timeline.cursor, 5_002);
  });

  it('resumes at the live cursor without a second preroll delay', () => {
    const timeline = new RingRtcAudioTimeline(4);
    timeline.enqueue('local', 0, new Float32Array(4).fill(0.25));
    timeline.enqueue('remote', 0, new Float32Array(4).fill(0.5));
    assert.deepEqual([...timeline.render(4)], Array(4).fill(0.75));

    const resetWithoutPreroll = timeline.reset.bind(timeline) as (
      cursor: number,
      requirePreroll: boolean
    ) => void;
    resetWithoutPreroll(100, false);

    assert.deepEqual([...timeline.render(2)], [0, 0]);
    assert.equal(timeline.cursor, 102);
  });
});

describe('RingRtc rendered PCM progress', () => {
  it('recognizes only the worklet ready event', () => {
    assert.isTrue(readRingRtcAudioReadyEvent({ type: 'ready' }));
    assert.isFalse(
      readRingRtcAudioReadyEvent({ type: 'stopped', generation: 0 })
    );
    assert.isFalse(
      readRingRtcAudioReadyEvent({ type: 'ready', unexpected: true })
    );
    assert.isFalse(readRingRtcAudioReadyEvent(null));
  });

  it('emits the exact rendered PCM in bounded chunks', () => {
    const chunker = new RingRtcPcmChunker(4);
    assert.deepEqual(chunker.add(Float32Array.from([1, 2])), []);
    assert.deepEqual(
      chunker.add(Float32Array.from([3, 4, 5])).map(chunk => [...chunk]),
      [[1, 2, 3, 4]]
    );
    assert.deepEqual(
      chunker.add(Float32Array.from([6, 7, 8])).map(chunk => [...chunk]),
      [[5, 6, 7, 8]]
    );

    chunker.add(Float32Array.from([9, 10]));
    chunker.reset();
    assert.deepEqual(chunker.add(Float32Array.from([11, 12, 13, 14])), [
      Float32Array.from([11, 12, 13, 14]),
    ]);
  });

  it('flushes a final partial PCM chunk when recording stops', () => {
    const chunker = new RingRtcPcmChunker(4);
    chunker.add(Float32Array.from([0.1, 0.2]));
    assert.isFunction(chunker.flush);

    assert.deepEqual(
      [...(chunker.flush() ?? [])],
      [0.10000000149011612, 0.20000000298023224]
    );
    assert.isUndefined(chunker.flush());
  });

  it('accepts PCM only from the active resume generation', () => {
    const delayed = Float32Array.from([0.1, 0.2]);
    assert.isUndefined(
      readRenderedPcmEvent(
        { type: 'rendered-pcm', generation: 3, samples: delayed },
        4
      )
    );

    const current = Float32Array.from([0.3, 0.4]);
    assert.strictEqual(
      readRenderedPcmEvent(
        { type: 'rendered-pcm', generation: 4, samples: current },
        4
      ),
      current
    );
  });
});
