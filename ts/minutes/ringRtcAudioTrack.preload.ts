// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

// The native RingRTC singleton is intentionally consumed from Signal's preload.
// oxlint-disable-next-line signal-desktop/enforce-file-suffix
import { RingRTC } from '@signalapp/ringrtc';

import { createLogger } from '../logging/log.std.ts';
import {
  readRingRtcAudioTap,
  resolveRingRtcAudioTapApi,
  type RingRtcAudioTapApi,
} from './ringRtcAudioTapApi.std.ts';
import {
  RING_RTC_AUDIO_PREROLL_SAMPLE_COUNT,
  type RingRtcAudioWorkletMessage,
} from './ringRtcAudioTimeline.std.ts';
import {
  readRenderedPcmEvent,
  readRingRtcAudioReadyEvent,
} from './ringRtcRenderedPcmProgress.std.ts';
import { configureRingRtcRecordingAudioContext } from './ringRtcAudioContext.std.ts';

const log = createLogger('minutes/ringRtcAudioTrack');
const POLL_INTERVAL_MS = 10;
const MAX_SAMPLES_PER_POLL = 4_800;
const DEGRADED_START_GRACE_MS = 500;
const STARTUP_TIMEOUT_MS = 2_000;

export class RingRtcAudioTrack {
  readonly #api: RingRtcAudioTapApi;
  readonly #context: AudioContext;
  readonly #worklet: AudioWorkletNode;
  readonly #destination: MediaStreamAudioDestinationNode;
  readonly #onFatalError: (error: Error) => void;
  readonly #onPcm: ((samples: Float32Array<ArrayBuffer>) => void) | undefined;
  readonly #pollTimer: ReturnType<typeof setInterval>;
  #paused = false;
  #stopped = false;
  #fatalErrorReported = false;
  #latestWriterCursor = 0;
  #progressGeneration = 0;
  #localSamplesObserved = 0;
  #remoteSamplesObserved = 0;
  #degradedStartAllowed = false;
  #degradedStartRequested = false;
  readonly #readyPromise: Promise<void>;
  #rejectReady: ((error: Error) => void) | undefined;
  #resolveReady: (() => void) | undefined;
  #resolveWorkletStopped: (() => void) | undefined;

  private constructor(options: {
    api: RingRtcAudioTapApi;
    context: AudioContext;
    worklet: AudioWorkletNode;
    destination: MediaStreamAudioDestinationNode;
    onFatalError: (error: Error) => void;
    onPcm?: (samples: Float32Array<ArrayBuffer>) => void;
  }) {
    this.#api = options.api;
    this.#context = options.context;
    this.#worklet = options.worklet;
    this.#destination = options.destination;
    this.#onFatalError = options.onFatalError;
    this.#onPcm = options.onPcm;
    const ready = Promise.withResolvers<void>();
    this.#readyPromise = ready.promise;
    this.#rejectReady = ready.reject;
    this.#resolveReady = ready.resolve;
    this.#worklet.port.onmessage = ({ data }: MessageEvent<unknown>) => {
      if (readRingRtcAudioReadyEvent(data)) {
        this.#resolveReady?.();
        this.#resolveReady = undefined;
        this.#rejectReady = undefined;
        return;
      }
      const samples = readRenderedPcmEvent(data, this.#progressGeneration);
      if (samples !== undefined && !this.#paused) {
        this.#onPcm?.(samples);
        return;
      }
      if (
        typeof data === 'object' &&
        data != null &&
        'type' in data &&
        data.type === 'stopped' &&
        'generation' in data &&
        data.generation === this.#progressGeneration
      ) {
        this.#resolveWorkletStopped?.();
      }
    };
    this.#pollTimer = setInterval(() => this.#poll(), POLL_INTERVAL_MS);
  }

  static isSupported(): boolean {
    return resolveRingRtcAudioTapApi(RingRTC) !== undefined;
  }

  static async create(options: {
    onFatalError: (error: Error) => void;
    onPcm?: (samples: Float32Array<ArrayBuffer>) => void;
  }): Promise<RingRtcAudioTrack> {
    const api = resolveRingRtcAudioTapApi(RingRTC);
    if (!api) {
      throw new Error(
        'This RingRTC build does not support Minutes audio tap v1'
      );
    }

    const context = new AudioContext({ sampleRate: 48_000 });
    let track: RingRtcAudioTrack | undefined;
    try {
      await configureRingRtcRecordingAudioContext(context);
      await context.audioWorklet.addModule(
        'bundles/workers/minutesRingRtcAudioSource.js'
      );
      const worklet = new AudioWorkletNode(
        context,
        'minutes-ringrtc-audio-source',
        {
          numberOfInputs: 0,
          numberOfOutputs: 1,
          outputChannelCount: [1],
        }
      );
      const destination = context.createMediaStreamDestination();
      api.startAudioTap();
      worklet.connect(destination);
      await context.resume();
      track = new RingRtcAudioTrack({
        api,
        context,
        worklet,
        destination,
        onFatalError: options.onFatalError,
        onPcm: options.onPcm,
      });
      track.#poll();
      await track.#waitUntilReady();
      return track;
    } catch (error) {
      if (track) {
        await track.stop();
      } else {
        try {
          api.stopAudioTap();
        } catch {
          // The tap may not have started yet.
        }
        await context.close().catch(() => undefined);
      }
      throw error;
    }
  }

  get stream(): MediaStream {
    return this.#destination.stream;
  }

  startPcmGeneration(): void {
    if (this.#stopped) {
      return;
    }
    this.#progressGeneration += 1;
    this.#worklet.port.postMessage({
      type: 'start-generation',
      generation: this.#progressGeneration,
    } satisfies RingRtcAudioWorkletMessage);
  }

  pause(): void {
    this.#paused = true;
    this.#worklet.port.postMessage({
      type: 'pause',
    } satisfies RingRtcAudioWorkletMessage);
  }

  resume(): void {
    if (!this.#paused || this.#stopped) {
      return;
    }
    this.#paused = false;
    this.#progressGeneration += 1;
    this.#worklet.port.postMessage({
      type: 'reset',
      cursor: this.#latestWriterCursor,
      generation: this.#progressGeneration,
    } satisfies RingRtcAudioWorkletMessage);
  }

  async stop(): Promise<void> {
    if (this.#stopped) {
      return;
    }
    this.#stopped = true;
    clearInterval(this.#pollTimer);
    try {
      this.#api.stopAudioTap();
    } finally {
      const { promise, resolve } = Promise.withResolvers<void>();
      this.#resolveWorkletStopped = resolve;
      this.#worklet.port.postMessage({
        type: 'stop',
      } satisfies RingRtcAudioWorkletMessage);
      let timeout: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        promise,
        new Promise<void>(resolveTimeout => {
          timeout = setTimeout(resolveTimeout, 250);
        }),
      ]);
      if (timeout) {
        clearTimeout(timeout);
      }
      this.#resolveWorkletStopped = undefined;
      this.#worklet.port.onmessage = null;
      this.#worklet.disconnect();
      for (const track of this.#destination.stream.getTracks()) {
        track.stop();
      }
      await this.#context.close().catch(error => {
        log.warn('Failed to close RingRTC recording AudioContext', error);
      });
    }
  }

  #poll(): void {
    if (this.#stopped) {
      return;
    }

    try {
      const packets = readRingRtcAudioTap(
        this.#api,
        MAX_SAMPLES_PER_POLL,
        droppedSamples => {
          log.warn(
            'RingRTC audio tap dropped samples; recording the gap as silence',
            droppedSamples
          );
        }
      );
      this.#latestWriterCursor = Math.max(
        packets.local.startSample + packets.local.samples.length,
        packets.remote.startSample + packets.remote.samples.length
      );
      this.#localSamplesObserved += packets.local.samples.length;
      this.#remoteSamplesObserved += packets.remote.samples.length;
      this.#requestDegradedStartIfNeeded();

      if (this.#paused) {
        return;
      }

      this.#postPacket('local', packets.local);
      this.#postPacket('remote', packets.remote);
    } catch (error) {
      this.#reportFatalError(
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  #postPacket(
    source: 'local' | 'remote',
    packet: Readonly<{
      startSample: number;
      samples: Float32Array<ArrayBuffer>;
    }>
  ): void {
    if (packet.samples.length === 0) {
      return;
    }
    this.#worklet.port.postMessage(
      {
        type: 'packet',
        source,
        startSample: packet.startSample,
        samples: packet.samples,
      } satisfies RingRtcAudioWorkletMessage,
      [packet.samples.buffer]
    );
  }

  #reportFatalError(error: Error): void {
    if (this.#fatalErrorReported) {
      return;
    }
    this.#fatalErrorReported = true;
    this.#rejectReady?.(error);
    this.#resolveReady = undefined;
    this.#rejectReady = undefined;
    this.#onFatalError(error);
  }

  async #waitUntilReady(): Promise<void> {
    let degradedStartTimer: ReturnType<typeof setTimeout> | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      degradedStartTimer = setTimeout(() => {
        this.#degradedStartAllowed = true;
        this.#requestDegradedStartIfNeeded();
      }, DEGRADED_START_GRACE_MS);
      await Promise.race([
        this.#readyPromise,
        new Promise<void>((_resolve, reject) => {
          timeout = setTimeout(() => {
            reject(
              new Error(
                'RingRTC recording audio did not become ready in time ' +
                  `(local samples: ${this.#localSamplesObserved}, ` +
                  `remote samples: ${this.#remoteSamplesObserved})`
              )
            );
          }, STARTUP_TIMEOUT_MS);
        }),
      ]);
    } finally {
      if (degradedStartTimer) {
        clearTimeout(degradedStartTimer);
      }
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }

  #requestDegradedStartIfNeeded(): void {
    if (
      !this.#degradedStartAllowed ||
      this.#degradedStartRequested ||
      (this.#localSamplesObserved < RING_RTC_AUDIO_PREROLL_SAMPLE_COUNT &&
        this.#remoteSamplesObserved < RING_RTC_AUDIO_PREROLL_SAMPLE_COUNT)
    ) {
      return;
    }

    this.#degradedStartRequested = true;
    const availableSources = [
      this.#localSamplesObserved > 0 ? 'local' : undefined,
      this.#remoteSamplesObserved > 0 ? 'remote' : undefined,
    ].filter(Boolean);
    log.warn(
      `RingRTC audio startup is using available source(s): ${availableSources.join(', ')}`
    );
    this.#worklet.port.postMessage({
      type: 'start-degraded',
    } satisfies RingRtcAudioWorkletMessage);
  }
}
