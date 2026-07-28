// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';

import type { CallMode } from '../../types/CallDisposition.std.ts';
import {
  MinutesCaptureCoordinator,
  minutesCaptureCoordinator,
} from '../../minutes/captureCoordinator.std.ts';
import {
  CallRecordingServiceCore,
  type CallRecordingServiceDependencies,
} from '../../minutes/callRecordingServiceCore.std.ts';

type RecorderStopResult = Readonly<{
  mp3: Uint8Array<ArrayBuffer>;
  pcm48?: Float32Array<ArrayBuffer>;
}>;

function createStream(): MediaStream {
  return {
    getTracks: () => [],
  } as unknown as MediaStream;
}

function createHarness(options?: {
  coordinator?: MinutesCaptureCoordinator;
  createRingRtcAudioTrack?: (onFatalError: (error: Error) => void) => Promise<{
    stream: MediaStream;
    pause(): void;
    resume(): void;
    stop(): Promise<void>;
  }>;
  recorderStart?: () => Promise<boolean>;
  recorderStop?: () => Promise<RecorderStopResult | undefined>;
  saveRecording?: () => Promise<unknown>;
}) {
  const coordinator = options?.coordinator ?? new MinutesCaptureCoordinator();
  const calls = {
    enqueue: 0,
    pause: 0,
    recorderStart: 0,
    recorderStop: 0,
    ringRtcCreate: 0,
    ringRtcPause: 0,
    ringRtcResume: 0,
    ringRtcStop: 0,
    resume: 0,
    save: 0,
    showError: 0,
  };
  let recorderActive = false;

  const dependencies: CallRecordingServiceDependencies = {
    coordinator,
    isRecordableCallMode: () => true,
    warmup: async () => undefined,
    recorder: {
      isActive: () => recorderActive,
      start: async () => {
        calls.recorderStart += 1;
        const started = await (options?.recorderStart?.() ?? true);
        recorderActive = started;
        return started;
      },
      pause: () => {
        calls.pause += 1;
        return recorderActive;
      },
      resume: () => {
        calls.resume += 1;
        return recorderActive;
      },
      stop: async () => {
        calls.recorderStop += 1;
        recorderActive = false;
        return (
          options?.recorderStop?.() ?? {
            mp3: new Uint8Array([1, 2, 3]),
          }
        );
      },
    },
    getConversationTitle: () => 'Alice',
    createAudioTrack: async onFatalError => {
      calls.ringRtcCreate += 1;
      if (options?.createRingRtcAudioTrack) {
        return options.createRingRtcAudioTrack(onFatalError);
      }
      return {
        stream: createStream(),
        pause: () => {
          calls.ringRtcPause += 1;
        },
        resume: () => {
          calls.ringRtcResume += 1;
        },
        stop: async () => {
          calls.ringRtcStop += 1;
        },
      };
    },
    speakerActivity: {
      onRecordingPcm: () => undefined,
      start: () => undefined,
      pause: () => undefined,
      resume: () => undefined,
      stop: () => null,
    },
    saveRecording: async () => {
      calls.save += 1;
      return options?.saveRecording?.() ?? '/recordings/call.mp3';
    },
    showError: () => {
      calls.showError += 1;
    },
    showFileSaved: () => undefined,
    enqueueRecordingTranscription: () => {
      calls.enqueue += 1;
    },
    emitState: () => undefined,
    normalizeSpeakerActivityLog: activityLog => activityLog,
    now: () => 1_000,
    log: {
      error: () => undefined,
      info: () => undefined,
      warn: () => undefined,
    },
  };

  return {
    calls,
    coordinator,
    service: new CallRecordingServiceCore(dependencies),
  };
}

const recordingOptions = {
  conversationId: 'conversation-id',
  callMode: 'Direct' as unknown as CallMode,
};

describe('CallRecordingService capture coordination', () => {
  it('exports the shared capture coordinator singleton', () => {
    assert.instanceOf(minutesCaptureCoordinator, MinutesCaptureCoordinator);
  });

  it('reserves audio synchronously before awaiting a capture source', async () => {
    const { promise, resolve } = Promise.withResolvers<{
      stream: MediaStream;
      pause(): void;
      resume(): void;
      stop(): Promise<void>;
    }>();
    const { coordinator, service } = createHarness({
      createRingRtcAudioTrack: () => promise,
    });

    const startPromise = service.startRecording(recordingOptions);

    assert.strictEqual(coordinator.state, 'audio-recording');
    assert.throws(
      () => coordinator.acquire('video', async () => undefined),
      'Cannot start capture while coordinator is audio-recording'
    );

    resolve({
      stream: createStream(),
      pause: () => undefined,
      resume: () => undefined,
      stop: async () => undefined,
    });
    assert.strictEqual(await startPromise, true);
  });

  it('records MP3 solely from the RingRTC call stream', async () => {
    const { calls, service } = createHarness();

    assert.strictEqual(await service.startRecording(recordingOptions), true);
    assert.strictEqual(calls.ringRtcCreate, 1);
    assert.strictEqual(calls.recorderStart, 1);
  });

  it('releases audio when the RingRTC source is unavailable', async () => {
    const { coordinator, service } = createHarness({
      createRingRtcAudioTrack: async () => {
        throw new Error('RingRTC unavailable');
      },
    });

    assert.strictEqual(await service.startRecording(recordingOptions), false);
    assert.strictEqual(coordinator.state, 'idle');
  });

  it('releases audio when the recorder rejects the streams', async () => {
    const { coordinator, service } = createHarness({
      recorderStart: async () => false,
    });

    assert.strictEqual(await service.startRecording(recordingOptions), false);
    assert.strictEqual(coordinator.state, 'idle');
  });

  it('releases audio when startup throws', async () => {
    const { coordinator, service } = createHarness({
      createRingRtcAudioTrack: async () => {
        throw new Error('capture failed');
      },
    });

    assert.strictEqual(await service.startRecording(recordingOptions), false);
    assert.strictEqual(coordinator.state, 'idle');
  });

  it('does not open capture sources when another capture mode owns the coordinator', async () => {
    const coordinator = new MinutesCaptureCoordinator();
    const videoLease = coordinator.acquire('video', async () => undefined);
    let sourceCalls = 0;
    const { service } = createHarness({
      coordinator,
      createRingRtcAudioTrack: async () => {
        sourceCalls += 1;
        return {
          stream: createStream(),
          pause: () => undefined,
          resume: () => undefined,
          stop: async () => undefined,
        };
      },
    });

    assert.strictEqual(await service.startRecording(recordingOptions), false);
    assert.strictEqual(sourceCalls, 0);
    videoLease.release();
  });

  it('keeps recorder and coordinator pause states aligned', async () => {
    const { calls, coordinator, service } = createHarness();
    assert.strictEqual(await service.startRecording(recordingOptions), true);

    assert.strictEqual(service.pauseRecording(), true);
    assert.strictEqual(calls.pause, 1);
    assert.strictEqual(calls.ringRtcPause, 1);
    assert.strictEqual(coordinator.state, 'audio-paused');

    assert.strictEqual(service.resumeRecording(), true);
    assert.strictEqual(calls.resume, 1);
    assert.strictEqual(calls.ringRtcResume, 1);
    assert.strictEqual(coordinator.state, 'audio-recording');
  });

  it('stops and reports a RingRTC audio failure during recording', async () => {
    let reportFatalError: ((error: Error) => void) | undefined;
    const { calls, coordinator, service } = createHarness({
      createRingRtcAudioTrack: async onFatalError => {
        reportFatalError = onFatalError;
        return {
          stream: createStream(),
          pause: () => undefined,
          resume: () => undefined,
          stop: async () => {
            calls.ringRtcStop += 1;
          },
        };
      },
    });
    assert.strictEqual(await service.startRecording(recordingOptions), true);

    reportFatalError?.(new Error('tap overflow'));
    await new Promise(resolve => setTimeout(resolve, 0));

    assert.strictEqual(calls.showError, 1);
    assert.strictEqual(calls.recorderStop, 1);
    assert.strictEqual(calls.ringRtcStop, 1);
    assert.strictEqual(coordinator.state, 'idle');
  });

  it('keeps finalizing through durable save and deduplicates concurrent stops', async () => {
    const { promise, resolve } = Promise.withResolvers<unknown>();
    const { promise: saveStarted, resolve: markSaveStarted } =
      Promise.withResolvers<void>();
    const { calls, coordinator, service } = createHarness({
      saveRecording: () => {
        markSaveStarted();
        return promise;
      },
    });
    assert.strictEqual(await service.startRecording(recordingOptions), true);

    const firstStop = service.stopRecording();
    const secondStop = service.stopRecording();

    assert.strictEqual(coordinator.state, 'finalizing');
    assert.strictEqual(calls.recorderStop, 1);
    await saveStarted;
    assert.strictEqual(calls.ringRtcStop, 1);
    assert.strictEqual(calls.save, 1);

    resolve('/recordings/call.mp3');
    const [first, second] = await Promise.all([firstStop, secondStop]);

    assert.deepEqual(second, first);
    assert.deepInclude(first, {
      conversationId: 'conversation-id',
      conversationTitle: 'Alice',
      filePath: '/recordings/call.mp3',
    });
    assert.strictEqual(calls.recorderStop, 1);
    assert.strictEqual(calls.save, 1);
    assert.strictEqual(calls.enqueue, 1);
    assert.strictEqual(coordinator.state, 'idle');
    assert.deepEqual(service.getState(), { status: 'idle' });
  });
});
