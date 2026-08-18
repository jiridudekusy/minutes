// Copyright 2026 minutes contributors
// SPDX-License-Identifier: AGPL-3.0-only

import * as Bytes from '../Bytes.std.ts';
import { createLogger } from '../logging/log.std.ts';
import type { RendererMessageType } from '../types/AudioRecorder.std.ts';
import { configureRingRtcRecordingAudioContext } from './ringRtcAudioContext.std.ts';

const log = createLogger('minutes/callRecorder');

export type MinutesWorkletMessage = Readonly<
  | {
      type: 'chunk';
      chunk: Uint8Array<ArrayBuffer>;
    }
  | {
      type: 'pcm';
      samples: Float32Array<ArrayBuffer>;
    }
  | {
      type: 'complete';
      lametagFrame: Uint8Array<ArrayBuffer>;
      finalFrame: Uint8Array<ArrayBuffer>;
    }
>;

export type CallRecordingStopResult = Readonly<{
  mp3: Uint8Array<ArrayBuffer>;
  pcm48?: Float32Array<ArrayBuffer>;
}>;

let contextPromise: Promise<AudioContext> | undefined;

async function initContext(): Promise<AudioContext> {
  const context = new AudioContext({ sampleRate: 48_000 });
  await configureRingRtcRecordingAudioContext(context);
  await context.audioWorklet.addModule('bundles/workers/minutesMp3Encoder.js');
  return context;
}

type ActiveState = Readonly<{
  sources: Array<MediaStreamAudioSourceNode>;
  streams: Array<MediaStream>;
  promise: Promise<CallRecordingStopResult>;
  worklet: AudioWorkletNode;
  merger?: ChannelMergerNode;
  context: AudioContext;
  onPcm?: (sampleCount: number) => void;
}>;

type State =
  | Readonly<{ type: 'idle' }>
  | (ActiveState & Readonly<{ type: 'running' }>)
  | (ActiveState & Readonly<{ type: 'paused' }>);

function concatenatePcm(chunks: ReadonlyArray<Float32Array>): Float32Array {
  if (chunks.length === 0) {
    return new Float32Array(0);
  }
  if (chunks.length === 1) {
    return chunks[0]!.slice();
  }
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Float32Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

/**
 * Records one or more MediaStreams into a single MP3 using Signal's existing
 * lame-based audio worklet. Supports pause / resume without finalizing.
 */
export class CallRecorder {
  #state: State = { type: 'idle' };

  static async warmup(): Promise<void> {
    if (contextPromise == null) {
      contextPromise = initContext();
    }
    await contextPromise;
  }

  #connectSources(active: ActiveState): void {
    const { sources, worklet, merger } = active;
    if (sources.length === 1) {
      sources[0]!.connect(worklet);
      return;
    }
    if (merger) {
      sources.forEach((source, index) => {
        source.connect(merger, 0, index);
      });
      merger.connect(worklet);
    }
  }

  #disconnectSources(active: ActiveState): void {
    for (const source of active.sources) {
      source.disconnect();
    }
    active.merger?.disconnect();
  }

  async start(
    streams: ReadonlyArray<MediaStream>,
    options?: Readonly<{ onPcm?: (sampleCount: number) => void }>
  ): Promise<boolean> {
    if (this.#state.type !== 'idle') {
      throw new Error('CallRecorder already started');
    }

    const audioStreams = streams.filter(
      stream => stream.getAudioTracks().length > 0
    );
    if (audioStreams.length === 0) {
      log.warn('start: no audio tracks in provided streams');
      return false;
    }

    if (contextPromise == null) {
      contextPromise = initContext();
    }
    const context = await contextPromise;

    const worklet = new AudioWorkletNode(context, 'minutes-mp3-encoder', {
      numberOfInputs: 1,
      numberOfOutputs: 0,
      channelCount: 2,
      channelCountMode: 'max',
    });

    const { promise, resolve } =
      Promise.withResolvers<CallRecordingStopResult>();
    const chunks = new Array<Uint8Array<ArrayBuffer>>();
    const pcmChunks = new Array<Float32Array<ArrayBuffer>>();

    worklet.port.onmessage = ({ data }: { data: MinutesWorkletMessage }) => {
      if (data.type === 'chunk') {
        chunks.push(data.chunk);
        return;
      }
      if (data.type === 'pcm') {
        pcmChunks.push(data.samples);
        options?.onPcm?.(data.samples.length);
        return;
      }
      if (data.type === 'complete') {
        this.#state = { type: 'idle' };
        chunks.push(data.finalFrame);
        const mp3 = Bytes.concatenate(chunks);
        mp3.set(data.lametagFrame);
        const pcm48 = concatenatePcm(pcmChunks);
        resolve({
          mp3,
          pcm48:
            pcm48.length > 0 ? (pcm48 as Float32Array<ArrayBuffer>) : undefined,
        });
      }
    };

    const sources = audioStreams.map(stream =>
      context.createMediaStreamSource(stream)
    );

    let merger: ChannelMergerNode | undefined;
    if (sources.length > 1) {
      merger = context.createChannelMerger(sources.length);
    }

    const active: ActiveState = {
      sources,
      streams: [...audioStreams],
      promise,
      worklet,
      merger,
      context,
      onPcm: options?.onPcm,
    };

    this.#connectSources(active);
    this.#state = { type: 'running', ...active };

    log.info(`start: recording ${audioStreams.length} audio stream(s)`);
    return true;
  }

  pause(): boolean {
    if (this.#state.type !== 'running') {
      return false;
    }
    this.#disconnectSources(this.#state);
    const active = this.#state;
    this.#state = { ...active, type: 'paused' };
    return true;
  }

  resume(): boolean {
    if (this.#state.type !== 'paused') {
      return false;
    }
    this.#connectSources(this.#state);
    const active = this.#state;
    this.#state = { ...active, type: 'running' };
    return true;
  }

  isActive(): boolean {
    return this.#state.type === 'running' || this.#state.type === 'paused';
  }

  async stop(): Promise<CallRecordingStopResult | undefined> {
    if (this.#state.type !== 'running' && this.#state.type !== 'paused') {
      return undefined;
    }

    this.#disconnectSources(this.#state);
    this.#state.worklet.port.postMessage({
      type: 'stop',
    } satisfies RendererMessageType);

    for (const stream of this.#state.streams) {
      stream.getTracks().forEach(track => track.stop());
    }

    return this.#state.promise;
  }
}
