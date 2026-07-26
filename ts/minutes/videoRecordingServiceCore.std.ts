// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import type {
  AbortedVideoRecordingFile,
  AppendVideoRecordingChunkInput,
  AppendVideoRecordingPcmInput,
  CreatedVideoRecordingFile,
  CreateVideoRecordingFileOptions,
  FinalizedVideoRecordingFile,
  FinalizeVideoRecordingFileInput,
  VideoRecordingCodec,
} from './videoRecordingFile.std.ts';
import {
  RecordingPauseTimeline,
  selectWebmMimeType,
  VIDEO_OUTPUT_SIZE,
} from './videoRecordingPrimitives.std.ts';
import type {
  MinutesCaptureCoordinator,
  MinutesCaptureLease,
} from './captureCoordinator.std.ts';
import type { SpeakerActivityLog } from './speakerActivity.std.ts';
import type { CallRecordingMetadata } from './types.std.ts';

export const VIDEO_RECORDING_FRAME_RATE = 15;
export const VIDEO_RECORDING_CHUNK_INTERVAL_MS = 1_000;
const DEFAULT_MAX_QUEUED_CHUNK_BYTES = 8 * 1024 * 1024;

export type VideoRecordingStartOptions = Readonly<{
  conversationId: string;
  conversationTitle: string;
  callMode: string;
  eraId?: string;
}>;

type ActiveVideoRecording = VideoRecordingStartOptions &
  Readonly<{
    startedAt: number;
    codec: VideoRecordingCodec;
  }>;

export type VideoRecordingState =
  | Readonly<{ status: 'idle' }>
  | Readonly<{ status: 'starting' }>
  | (ActiveVideoRecording & Readonly<{ status: 'recording' }>)
  | (ActiveVideoRecording & Readonly<{ status: 'paused'; pausedAt: number }>)
  | Readonly<{ status: 'finalizing' }>
  | Readonly<{
      status: 'error';
      message: string;
      partialPath?: string;
    }>;

export type VideoMediaRecorder = {
  ondataavailable: ((chunk: Blob) => void) | undefined;
  onerror: ((error: unknown) => void) | undefined;
  onstop: (() => void) | undefined;
  start(timesliceMs: number): void;
  pause(): void;
  resume(): void;
  requestData(): void;
  stop(): void;
};

type VideoRecordingWriter = Readonly<{
  create(
    options: CreateVideoRecordingFileOptions
  ): Promise<CreatedVideoRecordingFile>;
  append(input: AppendVideoRecordingChunkInput): Promise<void>;
  appendPcm(input: AppendVideoRecordingPcmInput): Promise<void>;
  finalize(
    input: FinalizeVideoRecordingFileInput
  ): Promise<FinalizedVideoRecordingFile>;
  abort(input: { sessionId: string }): Promise<AbortedVideoRecordingFile>;
}>;

type VideoCompositor = Readonly<{
  start(): unknown;
  pause(): void;
  resume(): void;
  stop(): void;
}>;

type RingRtcAudioTrack = Readonly<{
  stream: unknown;
  resetPcmProgress(): void;
  pause(): void;
  resume(): void;
  stop(): Promise<void>;
}>;

type VideoSpeakerActivity = Readonly<{
  onRecordingPcm(sampleCount: number): void;
  start(options: {
    conversationId: string;
    callMode: string;
    remoteDisplayName: string;
    recordingStartedAt: number;
  }): void;
  pause(): void;
  resume(): void;
  stop(): SpeakerActivityLog | null;
}>;

export type VideoRecordingServiceDependencies = Readonly<{
  coordinator: MinutesCaptureCoordinator;
  isAudioSupported(): boolean;
  isVideoSupported(): boolean;
  isCodecSupported(codec: string): boolean;
  writer: VideoRecordingWriter;
  createAudioTrack(
    onFatalError: (error: Error) => void,
    onPcm: (samples: Float32Array<ArrayBuffer>) => void
  ): Promise<RingRtcAudioTrack>;
  createCompositor(
    options: VideoRecordingStartOptions,
    onFatalError: (error: Error) => void
  ): VideoCompositor;
  combineStreams(videoStream: unknown, audioStream: unknown): unknown;
  createMediaRecorder(
    stream: unknown,
    codec: VideoRecordingCodec
  ): VideoMediaRecorder;
  speakerActivity: VideoSpeakerActivity;
  normalizeSpeakerActivityLog(
    activityLog: SpeakerActivityLog | null,
    recordedDurationMs: number
  ): SpeakerActivityLog | null;
  onFinalized(metadata: CallRecordingMetadata): void;
  emitState(state: VideoRecordingState): void;
  now(): number;
  maxQueuedBytes?: number;
}>;

type TerminationKind = 'finalize' | 'abort';

export class VideoRecordingServiceCore {
  readonly #dependencies: VideoRecordingServiceDependencies;
  readonly #maxQueuedBytes: number;

  #state: VideoRecordingState = { status: 'idle' };
  #captureLease: MinutesCaptureLease | undefined;
  #writerSession: CreatedVideoRecordingFile | undefined;
  #audioTrack: RingRtcAudioTrack | undefined;
  #compositor: VideoCompositor | undefined;
  #recorder: VideoMediaRecorder | undefined;
  #speakerActivityStarted = false;
  #recorderStarted = false;
  #resolveRecorderStop: (() => void) | undefined;
  #recorderStopPromise: Promise<void> | undefined;
  #timeline: RecordingPauseTimeline | undefined;
  #chunkQueue = new Array<Blob>();
  #pcmQueue = new Array<Float32Array<ArrayBuffer>>();
  #queuedChunkBytes = 0;
  #queuedPcmBytes = 0;
  #chunkDrainPromise: Promise<void> | undefined;
  #pcmDrainPromise: Promise<void> | undefined;
  #writeError: Error | undefined;
  #fatalError: Error | undefined;
  #terminationKind: TerminationKind | undefined;
  #terminationPromise: Promise<FinalizedVideoRecordingFile | null> | undefined;
  #coordinatorFinalizationPromise: Promise<void> | undefined;

  constructor(dependencies: VideoRecordingServiceDependencies) {
    this.#dependencies = dependencies;
    this.#maxQueuedBytes =
      dependencies.maxQueuedBytes ?? DEFAULT_MAX_QUEUED_CHUNK_BYTES;
  }

  getState(): VideoRecordingState {
    return this.#state;
  }

  async startRecording(options: VideoRecordingStartOptions): Promise<boolean> {
    if (this.#state.status !== 'idle' && this.#state.status !== 'error') {
      return false;
    }

    let captureLease: MinutesCaptureLease;
    try {
      captureLease = this.#dependencies.coordinator.acquire(
        'video',
        async () => {
          await this.#terminateFromCoordinator();
        }
      );
    } catch {
      return false;
    }

    this.#resetForStart(captureLease);
    this.#setState({ status: 'starting' });
    let startupSucceeded = false;

    try {
      if (!this.#dependencies.isAudioSupported()) {
        throw new Error('RingRTC audio tap is not supported');
      }
      if (!this.#dependencies.isVideoSupported()) {
        throw new Error('RingRTC video tap is not supported');
      }

      const codec = selectWebmMimeType(this.#dependencies.isCodecSupported);
      if (!codec) {
        throw new Error('No supported WebM video codec');
      }

      const startedAt = this.#dependencies.now();
      this.#timeline = new RecordingPauseTimeline(startedAt);
      this.#writerSession = await this.#dependencies.writer.create({
        ...options,
        startedAt,
        codec,
        width: VIDEO_OUTPUT_SIZE.width,
        height: VIDEO_OUTPUT_SIZE.height,
        frameRate: VIDEO_RECORDING_FRAME_RATE,
      });
      this.#audioTrack = await this.#dependencies.createAudioTrack(
        error => {
          this.#signalFatalError(error);
        },
        samples => {
          this.#dependencies.speakerActivity.onRecordingPcm(samples.length);
          this.#enqueuePcm(samples);
        }
      );
      this.#throwIfFatalError();
      this.#compositor = this.#dependencies.createCompositor(options, error => {
        this.#signalFatalError(error);
      });
      const videoStream = this.#compositor.start();
      const combinedStream = this.#dependencies.combineStreams(
        videoStream,
        this.#audioTrack.stream
      );
      this.#recorder = this.#dependencies.createMediaRecorder(
        combinedStream,
        codec
      );
      this.#attachRecorderEvents();
      this.#recorder.start(VIDEO_RECORDING_CHUNK_INTERVAL_MS);
      this.#recorderStarted = true;
      this.#throwIfFatalError();
      this.#speakerActivityStarted = true;
      this.#dependencies.speakerActivity.start({
        conversationId: options.conversationId,
        callMode: options.callMode,
        remoteDisplayName: options.conversationTitle,
        recordingStartedAt: startedAt,
      });
      this.#audioTrack.resetPcmProgress();

      this.#setState({
        status: 'recording',
        ...options,
        startedAt,
        codec,
      });
      startupSucceeded = true;
      return true;
    } catch (error) {
      const partialPath = await this.#unwindFailedStart(getPartialPath(error));
      this.#setError(error, partialPath);
      return false;
    } finally {
      if (!startupSucceeded) {
        captureLease.release();
        if (this.#captureLease === captureLease) {
          this.#captureLease = undefined;
        }
      }
    }
  }

  pauseRecording(): boolean {
    if (this.#state.status !== 'recording') {
      return false;
    }

    try {
      this.#recorder?.pause();
      this.#compositor?.pause();
      this.#audioTrack?.pause();
      const pausedAt = this.#dependencies.now();
      this.#timeline?.pause(pausedAt);
      this.#captureLease?.pause();
      this.#dependencies.speakerActivity.pause();
      this.#setState({ ...this.#state, status: 'paused', pausedAt });
      return true;
    } catch (error) {
      this.#signalFatalError(toError(error));
      return false;
    }
  }

  resumeRecording(): boolean {
    if (this.#state.status !== 'paused') {
      return false;
    }

    try {
      this.#audioTrack?.resume();
      this.#compositor?.resume();
      this.#recorder?.resume();
      this.#timeline?.resume(this.#dependencies.now(), {
        localSample: 0n,
        remoteSample: 0n,
      });
      this.#captureLease?.resume();
      this.#dependencies.speakerActivity.resume();
      this.#setState({
        status: 'recording',
        conversationId: this.#state.conversationId,
        conversationTitle: this.#state.conversationTitle,
        callMode: this.#state.callMode,
        eraId: this.#state.eraId,
        startedAt: this.#state.startedAt,
        codec: this.#state.codec,
      });
      return true;
    } catch (error) {
      this.#signalFatalError(toError(error));
      return false;
    }
  }

  async stopRecording(): Promise<FinalizedVideoRecordingFile | null> {
    if (
      this.#state.status !== 'recording' &&
      this.#state.status !== 'paused' &&
      this.#state.status !== 'finalizing'
    ) {
      return null;
    }
    this.#terminationKind ??= 'finalize';
    const captureLease = this.#captureLease;
    if (!captureLease) {
      return null;
    }

    this.#coordinatorFinalizationPromise ??= captureLease.finalize();
    const resultPromise = this.#getTerminationPromise();
    await this.#coordinatorFinalizationPromise;
    return resultPromise ?? null;
  }

  async onCallEnded(): Promise<FinalizedVideoRecordingFile | null> {
    return this.stopRecording();
  }

  #resetForStart(captureLease: MinutesCaptureLease): void {
    this.#captureLease = captureLease;
    this.#writerSession = undefined;
    this.#audioTrack = undefined;
    this.#compositor = undefined;
    this.#recorder = undefined;
    this.#speakerActivityStarted = false;
    this.#recorderStarted = false;
    this.#resolveRecorderStop = undefined;
    this.#recorderStopPromise = undefined;
    this.#timeline = undefined;
    this.#chunkQueue = [];
    this.#pcmQueue = [];
    this.#queuedChunkBytes = 0;
    this.#queuedPcmBytes = 0;
    this.#chunkDrainPromise = undefined;
    this.#pcmDrainPromise = undefined;
    this.#writeError = undefined;
    this.#fatalError = undefined;
    this.#terminationKind = undefined;
    this.#terminationPromise = undefined;
    this.#coordinatorFinalizationPromise = undefined;
  }

  #attachRecorderEvents(): void {
    const recorder = this.#recorder;
    if (!recorder) {
      throw new Error('MediaRecorder is not available');
    }
    const { promise, resolve } = Promise.withResolvers<void>();
    this.#recorderStopPromise = promise;
    this.#resolveRecorderStop = resolve;
    recorder.ondataavailable = chunk => this.#enqueueChunk(chunk);
    recorder.onerror = error => this.#signalFatalError(toError(error));
    recorder.onstop = () => this.#resolveRecorderStop?.();
  }

  #enqueueChunk(chunk: Blob): void {
    if (chunk.size === 0 || !this.#writerSession) {
      return;
    }
    if (this.#queuedChunkBytes + chunk.size > this.#maxQueuedBytes) {
      this.#signalFatalError(
        new Error('Video recording chunk queue exceeded its memory limit')
      );
      return;
    }

    this.#chunkQueue.push(chunk);
    this.#queuedChunkBytes += chunk.size;
    this.#chunkDrainPromise ??= this.#drainChunks();
  }

  async #drainChunks(): Promise<void> {
    try {
      await this.#writeQueuedChunks();
    } catch (error) {
      this.#writeError = toError(error);
      this.#chunkQueue = [];
      this.#queuedChunkBytes = 0;
      this.#signalFatalError(this.#writeError);
    } finally {
      this.#chunkDrainPromise = undefined;
    }
  }

  async #writeQueuedChunks(): Promise<void> {
    const chunk = this.#chunkQueue.shift();
    if (!chunk) {
      return;
    }

    try {
      const buffer = await chunk.arrayBuffer();
      const writerSession = this.#writerSession;
      if (!writerSession) {
        throw new Error('Video writer session disappeared');
      }
      await this.#dependencies.writer.append({
        sessionId: writerSession.sessionId,
        data: new Uint8Array(buffer),
      });
    } finally {
      this.#queuedChunkBytes -= chunk.size;
    }

    await this.#writeQueuedChunks();
  }

  #enqueuePcm(samples: Float32Array<ArrayBuffer>): void {
    if (samples.length === 0 || !this.#writerSession) {
      return;
    }
    if (this.#queuedPcmBytes + samples.byteLength > this.#maxQueuedBytes) {
      this.#signalFatalError(
        new Error('Video recording PCM queue exceeded its memory limit')
      );
      return;
    }

    this.#pcmQueue.push(samples);
    this.#queuedPcmBytes += samples.byteLength;
    this.#pcmDrainPromise ??= this.#drainPcm();
  }

  async #drainPcm(): Promise<void> {
    try {
      await this.#writeQueuedPcm();
    } catch (error) {
      this.#writeError = toError(error);
      this.#pcmQueue = [];
      this.#queuedPcmBytes = 0;
      this.#signalFatalError(this.#writeError);
    } finally {
      this.#pcmDrainPromise = undefined;
    }
  }

  async #writeQueuedPcm(): Promise<void> {
    const samples = this.#pcmQueue.shift();
    if (!samples) {
      return;
    }

    try {
      const writerSession = this.#writerSession;
      if (!writerSession) {
        throw new Error('Video writer session disappeared');
      }
      await this.#dependencies.writer.appendPcm({
        sessionId: writerSession.sessionId,
        samples,
      });
    } finally {
      this.#queuedPcmBytes -= samples.byteLength;
    }

    await this.#writeQueuedPcm();
  }

  async #waitForPendingWrites(): Promise<void> {
    const pendingChunkDrain = this.#chunkDrainPromise;
    const pendingPcmDrain = this.#pcmDrainPromise;
    await Promise.all(
      [pendingChunkDrain, pendingPcmDrain].filter(
        (promise): promise is Promise<void> => promise !== undefined
      )
    );
    if (
      (this.#chunkDrainPromise &&
        this.#chunkDrainPromise !== pendingChunkDrain) ||
      (this.#pcmDrainPromise && this.#pcmDrainPromise !== pendingPcmDrain)
    ) {
      await this.#waitForPendingWrites();
    }
    if (this.#writeError) {
      throw this.#writeError;
    }
  }

  #signalFatalError(error: Error): void {
    this.#fatalError ??= error;
    this.#terminationKind = 'abort';
    if (this.#state.status === 'starting') {
      return;
    }
    const captureLease = this.#captureLease;
    if (!captureLease) {
      return;
    }

    this.#coordinatorFinalizationPromise ??= captureLease.finalize();
    void this.#ignoreFinalizationError(this.#coordinatorFinalizationPromise);
  }

  async #ignoreFinalizationError(finalization: Promise<void>): Promise<void> {
    try {
      await finalization;
    } catch {
      // Fatal termination is surfaced through service state.
    }
  }

  async #terminateFromCoordinator(): Promise<void> {
    const kind = this.#terminationKind ?? 'finalize';
    this.#terminationKind = kind;
    this.#terminationPromise ??= this.#terminate(kind);
    await this.#terminationPromise;
  }

  #getTerminationPromise():
    | Promise<FinalizedVideoRecordingFile | null>
    | undefined {
    return this.#terminationPromise;
  }

  async #terminate(
    initialKind: TerminationKind
  ): Promise<FinalizedVideoRecordingFile | null> {
    const activeRecording =
      this.#state.status === 'recording' || this.#state.status === 'paused'
        ? this.#state
        : undefined;
    this.#setState({ status: 'finalizing' });
    let result: FinalizedVideoRecordingFile | null = null;
    let completedMetadata: CallRecordingMetadata | undefined;
    let partialPath = this.#writerSession?.partialPath;

    try {
      if (this.#speakerActivityStarted) {
        this.#dependencies.speakerActivity.pause();
      }
      await this.#stopRecorder(initialKind === 'finalize');
      await this.#stopAudioTrack();
      try {
        await this.#waitForPendingWrites();
      } catch (error) {
        this.#fatalError ??= toError(error);
        this.#terminationKind = 'abort';
      }

      if (
        this.#terminationKind === 'finalize' &&
        !this.#fatalError &&
        this.#writerSession
      ) {
        const endedAt = this.#dependencies.now();
        const recordedDurationMs =
          this.#timeline?.getRecordedDuration(endedAt) ?? 0;
        const rawSpeakerActivityLog = this.#stopSpeakerActivity();
        const speakerActivityLog =
          this.#dependencies.normalizeSpeakerActivityLog(
            rawSpeakerActivityLog,
            recordedDurationMs
          );
        if (!speakerActivityLog) {
          throw new Error('Video speaker activity log is unavailable');
        }
        result = await this.#dependencies.writer.finalize({
          sessionId: this.#writerSession.sessionId,
          endedAt,
          recordedDurationMs,
          speakerActivityLog,
        });
        if (activeRecording) {
          completedMetadata = {
            conversationId: activeRecording.conversationId,
            conversationTitle: activeRecording.conversationTitle,
            eraId: activeRecording.eraId,
            startedAt: activeRecording.startedAt,
            endedAt,
            filePath: result.filePath,
            durationMs: recordedDurationMs,
          };
        }
        partialPath = undefined;
      } else {
        partialPath = await this.#abortWriter(partialPath);
      }
    } catch (error) {
      this.#fatalError ??= toError(error);
      partialPath = await this.#abortWriter(partialPath);
    } finally {
      try {
        this.#stopSpeakerActivity();
      } catch (error) {
        this.#speakerActivityStarted = false;
        this.#fatalError ??= toError(error);
      }
      try {
        this.#compositor?.stop();
      } catch (error) {
        this.#fatalError ??= toError(error);
      }
      try {
        await this.#stopAudioTrack();
      } catch (error) {
        this.#fatalError ??= toError(error);
      }
      this.#detachRecorderEvents();
      this.#captureLease = undefined;
      if (this.#fatalError) {
        this.#setError(this.#fatalError, partialPath);
      } else {
        this.#setState({ status: 'idle' });
      }
    }

    if (result && completedMetadata && !this.#fatalError) {
      this.#dependencies.onFinalized(completedMetadata);
    }
    return result;
  }

  async #stopRecorder(requestFinalData: boolean): Promise<void> {
    if (!this.#recorder || !this.#recorderStarted) {
      return;
    }

    let requestDataError: Error | undefined;
    if (requestFinalData) {
      try {
        this.#recorder.requestData();
      } catch (error) {
        requestDataError = toError(error);
      }
    }

    try {
      this.#recorder.stop();
      await this.#recorderStopPromise;
    } finally {
      this.#recorderStarted = false;
    }

    if (requestDataError) {
      throw requestDataError;
    }
  }

  async #abortWriter(
    fallbackPartialPath: string | undefined
  ): Promise<string | undefined> {
    const writerSession = this.#writerSession;
    if (!writerSession) {
      return fallbackPartialPath;
    }

    try {
      const aborted = await this.#dependencies.writer.abort({
        sessionId: writerSession.sessionId,
      });
      return aborted.partialPath;
    } catch (error) {
      this.#fatalError ??= toError(error);
      return fallbackPartialPath ?? getPartialPath(error);
    }
  }

  async #unwindFailedStart(
    fallbackPartialPath?: string
  ): Promise<string | undefined> {
    if (this.#recorderStarted) {
      try {
        this.#recorder?.stop();
        await this.#recorderStopPromise;
      } catch {
        // Continue unwinding the remaining resources.
      } finally {
        this.#recorderStarted = false;
      }
    }
    this.#detachRecorderEvents();
    try {
      this.#stopSpeakerActivity();
    } catch {
      this.#speakerActivityStarted = false;
    }

    try {
      this.#compositor?.stop();
    } catch {
      // Continue unwinding the remaining resources.
    }
    try {
      await this.#stopAudioTrack();
    } catch {
      // Continue to retain the partial file.
    }
    return this.#abortWriter(
      this.#writerSession?.partialPath ?? fallbackPartialPath
    );
  }

  #throwIfFatalError(): void {
    if (this.#fatalError) {
      throw this.#fatalError;
    }
  }

  #detachRecorderEvents(): void {
    if (!this.#recorder) {
      return;
    }
    this.#recorder.ondataavailable = undefined;
    this.#recorder.onerror = undefined;
    this.#recorder.onstop = undefined;
  }

  #stopSpeakerActivity(): SpeakerActivityLog | null {
    if (!this.#speakerActivityStarted) {
      return null;
    }
    const activityLog = this.#dependencies.speakerActivity.stop();
    this.#speakerActivityStarted = false;
    return activityLog;
  }

  async #stopAudioTrack(): Promise<void> {
    const audioTrack = this.#audioTrack;
    this.#audioTrack = undefined;
    await audioTrack?.stop();
  }

  #setError(error: unknown, partialPath?: string): void {
    this.#setState({
      status: 'error',
      message: toError(error).message,
      partialPath,
    });
  }

  #setState(state: VideoRecordingState): void {
    this.#state = state;
    this.#dependencies.emitState(state);
  }
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function getPartialPath(error: unknown): string | undefined {
  if (
    typeof error === 'object' &&
    error != null &&
    'partialPath' in error &&
    typeof error.partialPath === 'string'
  ) {
    return error.partialPath;
  }
  return undefined;
}
