// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';

import type { RingRtcVideoTapApi } from '../../minutes/ringRtcVideoTapApi.std.ts';
import {
  RING_RTC_VIDEO_POLL_INTERVAL_MS,
  RingRtcOutgoingVideoSource,
  type RingRtcOutgoingVideoSourceDependencies,
} from '../../minutes/ringRtcOutgoingVideoSource.preload.ts';

type ActiveFrame = Readonly<{
  sequence: number;
  timestampUs: number;
  active: true;
  width: number;
  height: number;
  format: 'rgba' | 'i420' | 'nv12';
  data: Uint8Array<ArrayBuffer>;
}>;

function createHarness() {
  const reads = new Array<number>();
  const startCalls = new Array<ReadonlyArray<unknown>>();
  const stoppedTaps = new Array<void>();
  const registrations = new Array<string>();
  const unregisters = new Array<void>();
  const rendered = new Array<HTMLCanvasElement>();
  const draws = new Array<ReadonlyArray<unknown>>();
  const videoFrames = new Array<{
    data: AllowSharedBufferSource;
    init: VideoFrameBufferInit;
    closed: boolean;
  }>();
  const scheduled = new Array<{
    callback: () => void;
    intervalMs: number;
  }>();
  const cleared = new Array<unknown>();
  const fatalErrors = new Array<Error>();
  const events = new Array<unknown>();
  const operations = new Array<string>();
  const renderResults = new Array<boolean>();
  let readError: Error | undefined;
  let stopError: Error | undefined;

  const context = {
    drawImage: (...args: ReadonlyArray<unknown>) => {
      operations.push('draw');
      draws.push(args);
    },
    clearRect: () => undefined,
  } as unknown as CanvasRenderingContext2D;
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => context,
  } as unknown as HTMLCanvasElement;
  const api = {
    isVideoTapSupported: () => true,
    videoTapVersion: () => 1,
    startVideoTap: (...args: ReadonlyArray<unknown>) => {
      startCalls.push(args);
    },
    readVideoTap: (lastSequence: number) => {
      reads.push(lastSequence);
      if (readError) {
        throw readError;
      }
      return events.shift();
    },
    stopVideoTap: () => {
      stoppedTaps.push(undefined);
      if (stopError) {
        const error = stopError;
        stopError = undefined;
        throw error;
      }
    },
  } as RingRtcVideoTapApi;
  const dependencies: RingRtcOutgoingVideoSourceDependencies = {
    createCanvas: () => canvas,
    createVideoFrame: (data, init) => {
      const record = { data, init, closed: false };
      videoFrames.push(record);
      return {
        close: () => {
          record.closed = true;
        },
      } as unknown as VideoFrame;
    },
    setInterval: (callback, intervalMs) => {
      const timer = { callback, intervalMs };
      scheduled.push(timer);
      return timer;
    },
    clearInterval: timer => {
      cleared.push(timer);
    },
  };
  const source = new RingRtcOutgoingVideoSource({
    api,
    conversationId: 'conversation-id',
    controller: {
      register: (identity, registeredCanvas) => {
        assert.strictEqual(registeredCanvas, canvas);
        operations.push('register');
        registrations.push(identity);
        return () => unregisters.push(undefined);
      },
      markRendered: renderedCanvas => {
        operations.push('mark-rendered');
        rendered.push(renderedCanvas);
        return renderResults.shift() ?? true;
      },
    },
    dependencies,
    onFatalError: error => fatalErrors.push(error),
  });

  return {
    api,
    canvas,
    cleared,
    draws,
    events,
    fatalErrors,
    failNextStop(error: Error) {
      stopError = error;
    },
    operations,
    reads,
    registrations,
    renderResults,
    rendered,
    scheduled,
    setReadError(error: Error) {
      readError = error;
    },
    source,
    startCalls,
    stoppedTaps,
    unregisters,
    videoFrames,
  };
}

function activeFrame(
  sequence: number,
  format: ActiveFrame['format'] = 'rgba',
  width = 2,
  height = 1
): ActiveFrame {
  const byteLength =
    format === 'rgba'
      ? width * height * 4
      : width * height + 2 * Math.ceil(width / 2) * Math.ceil(height / 2);
  return {
    sequence,
    timestampUs: sequence * 1_000,
    active: true,
    width,
    height,
    format,
    data: new Uint8Array(byteLength),
  };
}

describe('RingRtcOutgoingVideoSource', () => {
  it('starts the privacy-scoped tap without a runtime capture selector', () => {
    const harness = createHarness();

    harness.source.start();

    assert.deepEqual(harness.startCalls, [[]]);
    assert.deepEqual(harness.reads, [0]);
    assert.lengthOf(harness.scheduled, 1);
    assert.strictEqual(
      harness.scheduled[0]?.intervalMs,
      RING_RTC_VIDEO_POLL_INTERVAL_MS
    );

    harness.scheduled[0]?.callback();
    assert.deepEqual(harness.reads, [0, 0]);
  });

  it('publishes an active RingRTC frame only after drawing it', () => {
    const harness = createHarness();
    harness.events.push(activeFrame(1));

    harness.source.start();

    assert.deepEqual(harness.registrations, ['local:conversation-id']);
    assert.strictEqual(harness.canvas.width, 2);
    assert.strictEqual(harness.canvas.height, 1);
    assert.lengthOf(harness.draws, 1);
    assert.strictEqual(harness.rendered[0], harness.canvas);
    assert.deepEqual(harness.operations.slice(0, 3), [
      'draw',
      'register',
      'mark-rendered',
    ]);
    assert.deepEqual(harness.videoFrames[0]?.init, {
      format: 'RGBA',
      codedWidth: 2,
      codedHeight: 1,
      timestamp: 1_000,
    });
    assert.isTrue(harness.videoFrames[0]?.closed);

    harness.events.push(activeFrame(2));
    harness.scheduled[0]?.callback();
    assert.deepEqual(harness.reads, [0, 1]);
    assert.lengthOf(harness.registrations, 1);
  });

  it('maps every native pixel format to tightly packed WebCodecs input', () => {
    const cases = [
      {
        format: 'rgba',
        videoFormat: 'RGBA',
        width: 2,
        height: 1,
        byteLength: 8,
      },
      {
        format: 'i420',
        videoFormat: 'I420',
        width: 4,
        height: 2,
        byteLength: 12,
      },
      {
        format: 'nv12',
        videoFormat: 'NV12',
        width: 3,
        height: 3,
        byteLength: 17,
      },
    ] as const;

    for (const testCase of cases) {
      const harness = createHarness();
      harness.events.push(
        activeFrame(1, testCase.format, testCase.width, testCase.height)
      );

      harness.source.start();

      const videoFrame = harness.videoFrames[0];
      if (!videoFrame) {
        throw new Error('Expected the native frame to reach WebCodecs');
      }
      assert.strictEqual(
        (videoFrame.data as Uint8Array<ArrayBuffer>).byteLength,
        testCase.byteLength
      );
      assert.deepEqual(videoFrame.init, {
        format: testCase.videoFormat,
        codedWidth: testCase.width,
        codedHeight: testCase.height,
        timestamp: 1_000,
      });
    }
  });

  it('keeps the current frame when no newer event is available', () => {
    const harness = createHarness();
    harness.events.push(activeFrame(1), undefined);
    harness.source.start();

    harness.scheduled[0]?.callback();

    assert.lengthOf(harness.draws, 1);
    assert.isEmpty(harness.unregisters);
  });

  it('retries readiness without requiring another native frame', () => {
    const harness = createHarness();
    harness.renderResults.push(false, true);
    harness.events.push(activeFrame(1));
    harness.source.start();
    assert.lengthOf(harness.rendered, 1);

    harness.scheduled[0]?.callback();

    assert.lengthOf(harness.draws, 1);
    assert.lengthOf(harness.registrations, 1);
    assert.lengthOf(harness.rendered, 2);
  });

  it('returns to black on an inactive event and starts a fresh generation', () => {
    const harness = createHarness();
    harness.events.push(activeFrame(1));
    harness.source.start();

    harness.events.push({ sequence: 2, timestampUs: 2_000, active: false });
    harness.scheduled[0]?.callback();
    assert.lengthOf(harness.unregisters, 1);

    harness.events.push(activeFrame(3));
    harness.scheduled[0]?.callback();
    assert.deepEqual(harness.registrations, [
      'local:conversation-id',
      'local:conversation-id',
    ]);
    assert.lengthOf(harness.rendered, 2);
  });

  it('tears down the tap and source across pause, resume, and stop', () => {
    const harness = createHarness();
    harness.events.push(activeFrame(1));
    harness.source.start();
    const firstTimer = harness.scheduled[0];

    harness.source.pause();
    assert.deepEqual(harness.cleared, [firstTimer]);
    assert.lengthOf(harness.stoppedTaps, 1);
    assert.lengthOf(harness.unregisters, 1);
    firstTimer?.callback();
    assert.deepEqual(harness.reads, [0]);

    harness.events.push(activeFrame(2));
    harness.source.resume();
    assert.deepEqual(harness.startCalls, [[], []]);
    assert.deepEqual(harness.reads, [0, 0]);
    assert.lengthOf(harness.registrations, 2);

    harness.source.stop();
    harness.source.stop();
    assert.lengthOf(harness.stoppedTaps, 2);
    assert.lengthOf(harness.unregisters, 2);
    assert.lengthOf(harness.cleared, 2);
  });

  it('retries native tap cleanup after stopVideoTap throws', () => {
    const harness = createHarness();
    harness.source.start();
    harness.failNextStop(new Error('native stop failed'));

    assert.throws(() => harness.source.stop(), 'native stop failed');
    harness.source.stop();
    harness.source.stop();

    assert.lengthOf(harness.stoppedTaps, 2);
    assert.lengthOf(harness.cleared, 1);
  });

  it('reports polling failures once and tears the source down', () => {
    const harness = createHarness();
    harness.setReadError(new Error('native read failed'));

    harness.source.start();
    harness.scheduled[0]?.callback();

    assert.lengthOf(harness.fatalErrors, 1);
    assert.strictEqual(harness.fatalErrors[0]?.message, 'native read failed');
    assert.lengthOf(harness.stoppedTaps, 1);
    assert.lengthOf(harness.cleared, 1);
  });

  it('rejects malformed native events at the adapter boundary', () => {
    const harness = createHarness();
    harness.events.push({
      sequence: 1,
      timestampUs: 1,
      active: true,
      width: 2,
      height: 1,
      format: 'rgba',
      data: new Uint8Array(7),
    });

    harness.source.start();

    assert.lengthOf(harness.fatalErrors, 1);
    assert.strictEqual(
      harness.fatalErrors[0]?.message,
      'RingRTC video tap returned an incompatible event'
    );
    assert.lengthOf(harness.stoppedTaps, 1);
  });
});
