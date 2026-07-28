// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';

import { RingRtcScreenShareCompositor } from '../../minutes/ringRtcScreenShareCompositor.preload.ts';

function createHarness(options?: {
  compositorStartError?: Error;
  sourceStopError?: Error;
}) {
  const operations = new Array<string>();
  const stream = { kind: 'video' };
  let sourceStopError = options?.sourceStopError;
  const compositor = new RingRtcScreenShareCompositor(
    {
      start: () => operations.push('source:start'),
      pause: () => operations.push('source:pause'),
      resume: () => operations.push('source:resume'),
      stop: () => {
        operations.push('source:stop');
        if (sourceStopError) {
          const error = sourceStopError;
          sourceStopError = undefined;
          throw error;
        }
      },
    },
    {
      start: () => {
        operations.push('canvas:start');
        if (options?.compositorStartError) {
          throw options.compositorStartError;
        }
        return stream;
      },
      pause: () => operations.push('canvas:pause'),
      resume: () => operations.push('canvas:resume'),
      stop: () => operations.push('canvas:stop'),
    }
  );
  return { compositor, operations, stream };
}

describe('RingRtcScreenShareCompositor', () => {
  it('starts the RingRTC source before the canvas compositor', () => {
    const harness = createHarness();

    assert.strictEqual(harness.compositor.start(), harness.stream);
    assert.deepEqual(harness.operations, ['source:start', 'canvas:start']);
  });

  it('removes the local source while paused and restores it before drawing', () => {
    const harness = createHarness();
    harness.compositor.start();

    harness.compositor.pause();
    harness.compositor.resume();

    assert.deepEqual(harness.operations.slice(2), [
      'canvas:pause',
      'source:pause',
      'source:resume',
      'canvas:resume',
    ]);
  });

  it('stops the RingRTC tap even when canvas startup fails', () => {
    const startError = new Error('canvas capture failed');
    const harness = createHarness({ compositorStartError: startError });

    assert.throws(() => harness.compositor.start(), startError);
    assert.deepEqual(harness.operations, [
      'source:start',
      'canvas:start',
      'source:stop',
    ]);
  });

  it('stops the canvas before the RingRTC tap and is idempotent', () => {
    const harness = createHarness();
    harness.compositor.start();

    harness.compositor.stop();
    harness.compositor.stop();

    assert.deepEqual(harness.operations.slice(2), [
      'canvas:stop',
      'source:stop',
    ]);
  });

  it('retries only the lifecycle resource whose stop failed', () => {
    const harness = createHarness({
      sourceStopError: new Error('native stop failed'),
    });
    harness.compositor.start();

    assert.throws(() => harness.compositor.stop(), 'native stop failed');
    harness.compositor.stop();
    harness.compositor.stop();

    assert.deepEqual(harness.operations.slice(2), [
      'canvas:stop',
      'source:stop',
      'source:stop',
    ]);
  });
});
