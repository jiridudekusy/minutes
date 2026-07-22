// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';

import { MinutesCaptureCoordinator } from '../../minutes/captureCoordinator.std.ts';
import {
  VideoRecordingServiceCore,
  type VideoMediaRecorder,
  type VideoRecordingServiceDependencies,
} from '../../minutes/videoRecordingServiceCore.std.ts';

type Deferred<T> = ReturnType<typeof Promise.withResolvers<T>>;

class FakeMediaRecorder implements VideoMediaRecorder {
  ondataavailable: ((chunk: Blob) => void) | undefined;
  onerror: ((error: unknown) => void) | undefined;
  onstop: (() => void) | undefined;
  readonly operations: Array<string>;
  autoStop = true;
  requestDataError: Error | undefined;
  startError: Error | undefined;
  startTimeslice: number | undefined;

  constructor(operations: Array<string>) {
    this.operations = operations;
  }

  start(timesliceMs: number): void {
    this.operations.push('recorder:start');
    this.startTimeslice = timesliceMs;
    if (this.startError) {
      throw this.startError;
    }
  }

  pause(): void {
    this.operations.push('recorder:pause');
  }

  resume(): void {
    this.operations.push('recorder:resume');
  }

  requestData(): void {
    this.operations.push('recorder:request-data');
    if (this.requestDataError) {
      throw this.requestDataError;
    }
  }

  stop(): void {
    this.operations.push('recorder:stop');
    if (this.autoStop) {
      this.onstop?.();
    }
  }

  emitData(data: ReadonlyArray<number>): void {
    this.ondataavailable?.(new Blob([Uint8Array.from(data)]));
  }

  emitStop(): void {
    this.onstop?.();
  }
}

function createHarness(options?: {
  audioSupported?: boolean;
  videoSupported?: boolean;
  codecSupported?: (codec: string) => boolean;
  compositorStopError?: Error;
  createWriterGate?: Deferred<void>;
  createWriterError?: Error;
  createMediaRecorder?: () => VideoMediaRecorder;
  fatalDuringAudioCreate?: Error;
  firstAppendGate?: Deferred<void>;
  audioStopError?: Error;
  maxQueuedBytes?: number;
}) {
  const operations = new Array<string>();
  const coordinator = new MinutesCaptureCoordinator();
  const recorder = new FakeMediaRecorder(operations);
  const appended = new Array<Array<number>>();
  const states = new Array<string>();
  const finalizedDurations = new Array<number>();
  const firstAppendStarted = Promise.withResolvers<void>();
  let fatalAudio: ((error: Error) => void) | undefined;
  let fatalVideo: ((error: Error) => void) | undefined;
  let compositorConversationId: string | undefined;
  let now = 1_000;
  let abortCalls = 0;
  let createWriterCalls = 0;
  let finalizeCalls = 0;

  const dependencies: VideoRecordingServiceDependencies = {
    coordinator,
    isAudioSupported: () => options?.audioSupported ?? true,
    isVideoSupported: () => options?.videoSupported ?? true,
    isCodecSupported:
      options?.codecSupported ?? (codec => codec.includes('vp9')),
    writer: {
      create: async () => {
        createWriterCalls += 1;
        operations.push('writer:create');
        await options?.createWriterGate?.promise;
        if (options?.createWriterError) {
          throw options.createWriterError;
        }
        return {
          sessionId: 'session-id',
          partialPath: '/recordings/call.webm.partial',
        };
      },
      append: async input => {
        const bytes = [...input.data];
        operations.push(`writer:append:${bytes.join(',')}`);
        appended.push(bytes);
        if (appended.length === 1) {
          firstAppendStarted.resolve();
          await options?.firstAppendGate?.promise;
        }
      },
      finalize: async input => {
        operations.push('writer:finalize');
        finalizeCalls += 1;
        finalizedDurations.push(input.recordedDurationMs);
        return {
          filePath: '/recordings/call.webm',
          metadataPath: '/recordings/call.video.json',
        };
      },
      abort: async () => {
        operations.push('writer:abort');
        abortCalls += 1;
        return { partialPath: '/recordings/call.webm.partial' };
      },
    },
    createAudioTrack: async onFatalError => {
      operations.push('audio:create');
      fatalAudio = onFatalError;
      if (options?.fatalDuringAudioCreate) {
        onFatalError(options.fatalDuringAudioCreate);
      }
      return {
        stream: { kind: 'audio' },
        pause: () => operations.push('audio:pause'),
        resume: () => operations.push('audio:resume'),
        stop: async () => {
          operations.push('audio:stop');
          if (options?.audioStopError) {
            throw options.audioStopError;
          }
        },
      };
    },
    createCompositor: (startOptions, onFatalError) => {
      compositorConversationId = startOptions.conversationId;
      fatalVideo = onFatalError;
      return {
        start: () => {
          operations.push('compositor:start');
          return { kind: 'video' };
        },
        pause: () => operations.push('compositor:pause'),
        resume: () => operations.push('compositor:resume'),
        stop: () => {
          operations.push('compositor:stop');
          if (options?.compositorStopError) {
            throw options.compositorStopError;
          }
        },
      };
    },
    combineStreams: () => ({ kind: 'combined' }),
    createMediaRecorder: () => options?.createMediaRecorder?.() ?? recorder,
    emitState: state => states.push(state.status),
    now: () => now,
    maxQueuedBytes: options?.maxQueuedBytes,
  };

  return {
    appended,
    coordinator,
    get compositorConversationId() {
      return compositorConversationId;
    },
    get abortCalls() {
      return abortCalls;
    },
    get createWriterCalls() {
      return createWriterCalls;
    },
    fatalAudio: (error: Error) => {
      assert.isDefined(fatalAudio);
      fatalAudio(error);
    },
    fatalVideo: (error: Error) => {
      assert.isDefined(fatalVideo);
      fatalVideo(error);
    },
    get finalizeCalls() {
      return finalizeCalls;
    },
    finalizedDurations,
    firstAppendStarted: firstAppendStarted.promise,
    operations,
    recorder,
    service: new VideoRecordingServiceCore(dependencies),
    setNow(value: number) {
      now = value;
    },
    states,
  };
}

const startOptions = {
  conversationId: 'conversation-id',
  conversationTitle: 'Team call',
  callMode: 'Group',
};

describe('VideoRecordingServiceCore', () => {
  it('reserves video synchronously before awaiting writer creation', async () => {
    const writerGate = Promise.withResolvers<void>();
    const harness = createHarness({ createWriterGate: writerGate });

    const startPromise = harness.service.startRecording(startOptions);

    assert.strictEqual(harness.coordinator.state, 'video-recording');
    assert.deepEqual(harness.service.getState(), { status: 'starting' });
    assert.throws(
      () => harness.coordinator.acquire('audio', async () => undefined),
      'Cannot start capture while coordinator is video-recording'
    );

    writerGate.resolve();
    assert.strictEqual(await startPromise, true);
    assert.strictEqual(harness.recorder.startTimeslice, 1_000);
  });

  it('checks RingRTC audio, video, and codec support before creating a partial writer', async () => {
    const noAudio = createHarness({ audioSupported: false });
    assert.strictEqual(
      await noAudio.service.startRecording(startOptions),
      false
    );
    assert.strictEqual(noAudio.createWriterCalls, 0);
    assert.strictEqual(noAudio.coordinator.state, 'idle');

    const noVideo = createHarness({ videoSupported: false });
    assert.strictEqual(
      await noVideo.service.startRecording(startOptions),
      false
    );
    assert.strictEqual(noVideo.createWriterCalls, 0);
    assert.strictEqual(noVideo.coordinator.state, 'idle');

    const noCodec = createHarness({ codecSupported: () => false });
    assert.strictEqual(
      await noCodec.service.startRecording(startOptions),
      false
    );
    assert.strictEqual(noCodec.createWriterCalls, 0);
    assert.strictEqual(noCodec.coordinator.state, 'idle');
  });

  it('passes call identity and fatal reporting to the RingRTC compositor', async () => {
    const harness = createHarness();
    assert.strictEqual(
      await harness.service.startRecording(startOptions),
      true
    );
    assert.strictEqual(harness.compositorConversationId, 'conversation-id');

    harness.fatalVideo(new Error('video tap failed'));
    assert.isNull(await harness.service.stopRecording());
    assert.strictEqual(harness.abortCalls, 1);
    assert.deepInclude(harness.service.getState(), {
      status: 'error',
      message: 'video tap failed',
    });
  });

  it('unwinds startup in reverse order and retains an opened partial file', async () => {
    const harness = createHarness({
      createMediaRecorder: () => {
        harness.operations.push('recorder:create');
        throw new Error('recorder failed');
      },
    });

    assert.strictEqual(
      await harness.service.startRecording(startOptions),
      false
    );
    assert.deepEqual(harness.operations, [
      'writer:create',
      'audio:create',
      'compositor:start',
      'recorder:create',
      'compositor:stop',
      'audio:stop',
      'writer:abort',
    ]);
    assert.strictEqual(harness.abortCalls, 1);
    assert.deepInclude(harness.service.getState(), {
      status: 'error',
      partialPath: '/recordings/call.webm.partial',
    });
    assert.strictEqual(harness.coordinator.state, 'idle');
  });

  it('detaches MediaRecorder callbacks when recorder start fails', async () => {
    const harness = createHarness();
    harness.recorder.startError = new Error('start failed');

    assert.strictEqual(
      await harness.service.startRecording(startOptions),
      false
    );
    assert.isUndefined(harness.recorder.ondataavailable);
    assert.isUndefined(harness.recorder.onerror);
    assert.isUndefined(harness.recorder.onstop);
    assert.strictEqual(harness.abortCalls, 1);
    assert.strictEqual(harness.coordinator.state, 'idle');
  });

  it('preserves a partial path reported by writer creation failure', async () => {
    const writerError = Object.assign(new Error('disk full'), {
      partialPath: '/recordings/orphan.webm.partial',
    });
    const harness = createHarness({ createWriterError: writerError });

    assert.strictEqual(
      await harness.service.startRecording(startOptions),
      false
    );
    assert.deepInclude(harness.service.getState(), {
      status: 'error',
      message: 'disk full',
      partialPath: '/recordings/orphan.webm.partial',
    });
    assert.strictEqual(harness.coordinator.state, 'idle');
  });

  it('unwinds instead of starting when RingRTC reports fatal during creation', async () => {
    const harness = createHarness({
      fatalDuringAudioCreate: new Error('initial audio overflow'),
    });

    assert.strictEqual(
      await harness.service.startRecording(startOptions),
      false
    );
    assert.strictEqual(harness.abortCalls, 1);
    assert.notInclude(harness.operations, 'recorder:start');
    assert.deepInclude(harness.service.getState(), {
      status: 'error',
      message: 'initial audio overflow',
      partialPath: '/recordings/call.webm.partial',
    });
    assert.strictEqual(harness.coordinator.state, 'idle');
  });

  it('serializes one-second chunks and waits for the final chunk before finalize', async () => {
    const firstAppend = Promise.withResolvers<void>();
    const harness = createHarness({ firstAppendGate: firstAppend });
    assert.strictEqual(
      await harness.service.startRecording(startOptions),
      true
    );

    harness.recorder.emitData([1]);
    harness.recorder.emitData([2]);
    harness.recorder.autoStop = false;
    const stopPromise = harness.service.stopRecording();
    harness.recorder.emitData([3]);
    harness.recorder.emitStop();

    await harness.firstAppendStarted;
    assert.deepEqual(harness.appended, [[1]]);
    assert.strictEqual(harness.finalizeCalls, 0);
    assert.strictEqual(harness.coordinator.state, 'finalizing');

    firstAppend.resolve();
    const result = await stopPromise;
    assert.deepEqual(harness.appended, [[1], [2], [3]]);
    assert.deepEqual(result, {
      filePath: '/recordings/call.webm',
      metadataPath: '/recordings/call.video.json',
    });
    assert.strictEqual(harness.finalizeCalls, 1);
    assert.strictEqual(harness.coordinator.state, 'idle');
  });

  it('pauses every media component and excludes paused time from duration', async () => {
    const harness = createHarness();
    assert.strictEqual(
      await harness.service.startRecording(startOptions),
      true
    );

    harness.setNow(2_000);
    assert.strictEqual(harness.service.pauseRecording(), true);
    harness.setNow(7_000);
    assert.strictEqual(harness.service.resumeRecording(), true);
    harness.setNow(9_000);
    await harness.service.stopRecording();

    const pauseIndex = harness.operations.indexOf('recorder:pause');
    assert.deepEqual(harness.operations.slice(pauseIndex, pauseIndex + 6), [
      'recorder:pause',
      'compositor:pause',
      'audio:pause',
      'audio:resume',
      'compositor:resume',
      'recorder:resume',
    ]);
    assert.deepEqual(harness.finalizedDurations, [3_000]);
  });

  it('deduplicates concurrent stop and call-end finalization', async () => {
    const harness = createHarness();
    assert.strictEqual(
      await harness.service.startRecording(startOptions),
      true
    );

    const [stopped, callEnded] = await Promise.all([
      harness.service.stopRecording(),
      harness.service.onCallEnded(),
    ]);

    assert.deepEqual(callEnded, stopped);
    assert.strictEqual(harness.finalizeCalls, 1);
    assert.strictEqual(
      harness.operations.filter(value => value === 'recorder:stop').length,
      1
    );
  });

  it('makes a fatal media error win the termination race and retains partial data', async () => {
    const harness = createHarness();
    assert.strictEqual(
      await harness.service.startRecording(startOptions),
      true
    );

    harness.fatalAudio(new Error('audio overflow'));
    const stopped = await harness.service.stopRecording();

    assert.isNull(stopped);
    assert.strictEqual(harness.abortCalls, 1);
    assert.strictEqual(harness.finalizeCalls, 0);
    assert.strictEqual(
      harness.operations.filter(value => value === 'recorder:stop').length,
      1
    );
    assert.deepInclude(harness.service.getState(), {
      status: 'error',
      message: 'audio overflow',
      partialPath: '/recordings/call.webm.partial',
    });
    assert.strictEqual(harness.coordinator.state, 'idle');
  });

  it('still stops MediaRecorder when final requestData throws', async () => {
    const harness = createHarness();
    assert.strictEqual(
      await harness.service.startRecording(startOptions),
      true
    );
    harness.recorder.requestDataError = new Error('requestData failed');

    assert.isNull(await harness.service.stopRecording());
    assert.include(harness.operations, 'recorder:stop');
    assert.strictEqual(harness.abortCalls, 1);
    assert.strictEqual(harness.service.getState().status, 'error');
    assert.strictEqual(harness.coordinator.state, 'idle');
  });

  it('continues media cleanup when one cleanup adapter throws', async () => {
    const harness = createHarness({
      compositorStopError: new Error('compositor cleanup failed'),
    });
    assert.strictEqual(
      await harness.service.startRecording(startOptions),
      true
    );

    await harness.service.stopRecording();

    assert.include(harness.operations, 'audio:stop');
    assert.deepInclude(harness.service.getState(), {
      status: 'error',
      message: 'compositor cleanup failed',
    });
    assert.strictEqual(harness.coordinator.state, 'idle');
  });

  it('aborts when the bounded in-memory chunk queue would overflow', async () => {
    const firstAppend = Promise.withResolvers<void>();
    const harness = createHarness({
      firstAppendGate: firstAppend,
      maxQueuedBytes: 2,
    });
    assert.strictEqual(
      await harness.service.startRecording(startOptions),
      true
    );

    harness.recorder.emitData([1, 2]);
    harness.recorder.emitData([3]);
    firstAppend.resolve();
    await harness.service.stopRecording();

    assert.strictEqual(harness.abortCalls, 1);
    assert.strictEqual(harness.finalizeCalls, 0);
    assert.strictEqual(harness.service.getState().status, 'error');
  });
});
