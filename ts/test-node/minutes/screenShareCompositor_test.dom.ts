// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';

import { PresentationSourceRegistry } from '../../minutes/presentationSourceRegistry.std.ts';
import {
  SCREEN_SHARE_FRAME_RATE,
  ScreenShareCompositor,
  type PresentationCanvasSource,
  type ScreenShareCompositorDependencies,
} from '../../minutes/screenShareCompositor.dom.ts';

type DrawOperation =
  | Readonly<{ kind: 'fill'; color: string; args: ReadonlyArray<number> }>
  | Readonly<{
      kind: 'draw';
      source: CanvasImageSource;
      args: ReadonlyArray<number>;
    }>;

type CompositorHarness = {
  canvas: HTMLCanvasElement;
  dependencies: ScreenShareCompositorDependencies;
  readonly operations: Array<DrawOperation>;
  operationsAtCapture: ReadonlyArray<DrawOperation> | undefined;
  readonly outputStream: MediaStream;
  readonly outputTrackStops: Array<void>;
  readonly scheduled: Array<() => void>;
  readonly cleared: Array<unknown>;
  capturedFrameRate: number | undefined;
};

function createHarness(): CompositorHarness {
  const operations: Array<DrawOperation> = [];
  const outputTrackStops: Array<void> = [];
  const scheduled: Array<() => void> = [];
  const cleared: Array<unknown> = [];
  const outputStream = {
    getTracks: () => [
      {
        stop: () => {
          outputTrackStops.push(undefined);
        },
      },
    ],
  } as unknown as MediaStream;
  const context = {
    fillStyle: '',
    fillRect(this: { fillStyle: string }, ...args: Array<number>) {
      operations.push({ kind: 'fill', color: this.fillStyle, args });
    },
    drawImage(source: CanvasImageSource, ...args: Array<number>) {
      operations.push({ kind: 'draw', source, args });
    },
  } as unknown as CanvasRenderingContext2D;
  const harness: CompositorHarness = {
    canvas: undefined as unknown as HTMLCanvasElement,
    dependencies: undefined as unknown as ScreenShareCompositorDependencies,
    operations,
    operationsAtCapture: undefined,
    outputStream,
    outputTrackStops,
    scheduled,
    cleared,
    capturedFrameRate: undefined as number | undefined,
  };
  harness.canvas = {
    width: 0,
    height: 0,
    getContext: () => context,
    captureStream: (frameRate: number) => {
      harness.capturedFrameRate = frameRate;
      harness.operationsAtCapture = [...operations];
      return outputStream;
    },
  } as unknown as HTMLCanvasElement;
  harness.dependencies = {
    createCanvas: () => harness.canvas,
    setInterval: callback => {
      scheduled.push(callback);
      return callback;
    },
    clearInterval: handle => {
      cleared.push(handle);
    },
  };
  return harness;
}

describe('ScreenShareCompositor', () => {
  it('uses browser canvas and timer dependencies by default', () => {
    const registry = new PresentationSourceRegistry<PresentationCanvasSource>();
    const harness = createHarness();
    const originalDocument = globalThis.document;
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: { createElement: () => harness.canvas },
    });

    try {
      assert.instanceOf(
        new ScreenShareCompositor(registry),
        ScreenShareCompositor
      );
    } finally {
      if (originalDocument === undefined) {
        Reflect.deleteProperty(globalThis, 'document');
      } else {
        Object.defineProperty(globalThis, 'document', {
          configurable: true,
          value: originalDocument,
        });
      }
    }
  });

  it('starts a fixed 15 fps 1920x1080 stream with a black frame', () => {
    const registry = new PresentationSourceRegistry<PresentationCanvasSource>();
    const harness = createHarness();
    const compositor = new ScreenShareCompositor(
      registry,
      harness.dependencies
    );

    assert.strictEqual(compositor.start(), harness.outputStream);
    assert.strictEqual(harness.canvas.width, 1920);
    assert.strictEqual(harness.canvas.height, 1080);
    assert.strictEqual(harness.capturedFrameRate, SCREEN_SHARE_FRAME_RATE);
    assert.deepEqual(harness.operationsAtCapture, [
      { kind: 'fill', color: '#000000', args: [0, 0, 1920, 1080] },
    ]);
    assert.deepEqual(harness.operations, [
      { kind: 'fill', color: '#000000', args: [0, 0, 1920, 1080] },
    ]);
  });

  it('does not draw an authoritative source before its generation is ready', () => {
    const registry = new PresentationSourceRegistry<PresentationCanvasSource>();
    const source = { width: 1280, height: 720 } as HTMLCanvasElement;
    registry.registerSource('alice', source);
    registry.setAuthoritativePresenter('alice');
    const harness = createHarness();
    const compositor = new ScreenShareCompositor(
      registry,
      harness.dependencies
    );

    compositor.start();
    harness.scheduled[0]?.();

    assert.isEmpty(harness.operations.filter(({ kind }) => kind === 'draw'));
  });

  it('draws a ready authoritative source aspect-fit after clearing the frame to black', () => {
    const registry = new PresentationSourceRegistry<PresentationCanvasSource>();
    const source = { width: 2560, height: 1600 } as HTMLCanvasElement;
    const registration = registry.registerSource('alice', source);
    const presentation = registry.setAuthoritativePresenter('alice');
    registration.markPresentationFrameRendered(presentation);
    const harness = createHarness();
    const compositor = new ScreenShareCompositor(
      registry,
      harness.dependencies
    );

    compositor.start();

    assert.deepEqual(harness.operations, [
      { kind: 'fill', color: '#000000', args: [0, 0, 1920, 1080] },
      {
        kind: 'draw',
        source,
        args: [96, 0, 1728, 1080],
      },
    ]);
  });

  it('pauses, resumes, and stops only its own compositor stream', () => {
    const registry = new PresentationSourceRegistry<PresentationCanvasSource>();
    const sourceTrackStops: Array<void> = [];
    const source = {
      videoWidth: 1920,
      videoHeight: 1080,
      srcObject: {
        getTracks: () => [
          {
            stop: () => {
              sourceTrackStops.push(undefined);
            },
          },
        ],
      },
    } as unknown as HTMLVideoElement;
    const registration = registry.registerSource('alice', source);
    const presentation = registry.setAuthoritativePresenter('alice');
    registration.markPresentationFrameRendered(presentation);
    const harness = createHarness();
    const compositor = new ScreenShareCompositor(
      registry,
      harness.dependencies
    );

    compositor.start();
    const firstTimer = harness.scheduled[0];
    compositor.pause();
    assert.deepEqual(harness.cleared, [firstTimer]);
    assert.isEmpty(sourceTrackStops);
    assert.isEmpty(harness.outputTrackStops);

    const operationCountWhilePaused = harness.operations.length;
    compositor.resume();
    assert.lengthOf(harness.scheduled, 2);
    assert.isAbove(harness.operations.length, operationCountWhilePaused);
    assert.isEmpty(sourceTrackStops);
    assert.isEmpty(harness.outputTrackStops);

    compositor.stop();
    compositor.stop();
    assert.deepEqual(harness.cleared, [firstTimer, harness.scheduled[1]]);
    assert.lengthOf(harness.outputTrackStops, 1);
    assert.isEmpty(sourceTrackStops);
  });

  it('fails clearly when canvas stream capture is unavailable', () => {
    const registry = new PresentationSourceRegistry<PresentationCanvasSource>();
    const harness = createHarness();
    const canvasWithoutCapture = {
      width: 0,
      height: 0,
      getContext: harness.canvas.getContext.bind(harness.canvas),
    } as HTMLCanvasElement;
    const compositor = new ScreenShareCompositor(registry, {
      ...harness.dependencies,
      createCanvas: () => canvasWithoutCapture,
    });

    assert.throws(
      () => compositor.start(),
      'Canvas stream capture is not supported'
    );
    assert.isEmpty(harness.scheduled);
  });

  it('fails before capture when a 2D canvas context is unavailable', () => {
    const registry = new PresentationSourceRegistry<PresentationCanvasSource>();
    const harness = createHarness();
    const canvasWithoutContext = {
      width: 0,
      height: 0,
      getContext: () => null,
      captureStream: () => harness.outputStream,
    } as unknown as HTMLCanvasElement;

    assert.throws(
      () =>
        new ScreenShareCompositor(registry, {
          ...harness.dependencies,
          createCanvas: () => canvasWithoutContext,
        }),
      'Screen-share compositor requires a 2D canvas context'
    );
    assert.isEmpty(harness.scheduled);
  });

  it('does not schedule frames when captureStream throws', () => {
    const registry = new PresentationSourceRegistry<PresentationCanvasSource>();
    const harness = createHarness();
    const captureError = new Error('capture failed');
    const canvasWithFailingCapture = {
      width: 0,
      height: 0,
      getContext: harness.canvas.getContext.bind(harness.canvas),
      captureStream: () => {
        throw captureError;
      },
    } as unknown as HTMLCanvasElement;
    const compositor = new ScreenShareCompositor(registry, {
      ...harness.dependencies,
      createCanvas: () => canvasWithFailingCapture,
    });

    assert.throws(() => compositor.start(), captureError);
    assert.isEmpty(harness.scheduled);
  });
});
