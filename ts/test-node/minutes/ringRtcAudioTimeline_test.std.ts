// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';

import * as ringRtcAudioTimeline from '../../minutes/ringRtcAudioTimeline.std.ts';
import * as renderedPcmProgress from '../../minutes/ringRtcRenderedPcmProgress.std.ts';

const { RingRtcAudioTimeline } = ringRtcAudioTimeline;
const { RingRtcRenderedPcmProgress } = renderedPcmProgress;

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
});

describe('RingRtc rendered PCM progress', () => {
  it('recognizes only the worklet ready event', () => {
    const readReadyEvent = (
      renderedPcmProgress as typeof renderedPcmProgress & {
        readRingRtcAudioReadyEvent?: (event: unknown) => boolean;
      }
    ).readRingRtcAudioReadyEvent;
    assert.isFunction(readReadyEvent);
    if (!readReadyEvent) {
      return;
    }

    assert.isTrue(readReadyEvent({ type: 'ready' }));
    assert.isFalse(readReadyEvent({ type: 'stopped', generation: 0 }));
    assert.isFalse(readReadyEvent({ type: 'ready', unexpected: true }));
    assert.isFalse(readReadyEvent(null));
  });
  it('reports rendered samples in bounded 250 ms increments', () => {
    const progress = new RingRtcRenderedPcmProgress();

    assert.strictEqual(progress.addRenderedSamples(11_999), 0);
    assert.strictEqual(progress.addRenderedSamples(1), 12_000);
    assert.strictEqual(progress.addRenderedSamples(12_032), 12_000);
    assert.strictEqual(progress.addRenderedSamples(11_968), 12_000);
  });

  it('drops partial progress when the recording timeline resets', () => {
    const progress = new RingRtcRenderedPcmProgress();
    progress.addRenderedSamples(11_999);

    progress.reset();

    assert.strictEqual(progress.addRenderedSamples(1), 0);
    assert.strictEqual(progress.addRenderedSamples(11_999), 12_000);
  });

  it('rejects delayed progress events from an older resume generation', () => {
    const readEvent = (
      renderedPcmProgress as typeof renderedPcmProgress & {
        readRenderedPcmProgressEvent?: (
          event: unknown,
          generation: number
        ) => number | undefined;
      }
    ).readRenderedPcmProgressEvent;
    assert.isFunction(readEvent);
    if (!readEvent) {
      return;
    }

    assert.isUndefined(
      readEvent(
        { type: 'rendered-samples', generation: 3, sampleCount: 12_000 },
        4
      )
    );
    assert.strictEqual(
      readEvent(
        { type: 'rendered-samples', generation: 4, sampleCount: 12_000 },
        4
      ),
      12_000
    );
  });
});
