// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import {
  RING_RTC_AUDIO_PREROLL_SAMPLE_COUNT,
  RingRtcAudioTimeline,
  type RingRtcAudioWorkletMessage,
} from './ringRtcAudioTimeline.std.ts';
import { type RingRtcAudioWorkletEvent } from './ringRtcRenderedPcmProgress.std.ts';
import { RingRtcPcmChunker } from './ringRtcPcmChunker.std.ts';

type AudioWorkletProcessor = Readonly<{ port: MessagePort }>;

declare const AudioWorkletProcessor: {
  prototype: AudioWorkletProcessor;
  new (): AudioWorkletProcessor;
};

type AudioWorkletProcessorImpl = AudioWorkletProcessor &
  Readonly<{
    process(
      inputs: Array<Array<Float32Array<ArrayBuffer>>>,
      outputs: Array<Array<Float32Array<ArrayBuffer>>>
    ): boolean;
  }>;

declare function registerProcessor(
  name: string,
  processorCtor: Readonly<{ new (): AudioWorkletProcessorImpl }>
): void;

class MinutesRingRtcAudioSource
  extends AudioWorkletProcessor
  implements AudioWorkletProcessorImpl
{
  readonly #timeline = new RingRtcAudioTimeline(
    RING_RTC_AUDIO_PREROLL_SAMPLE_COUNT
  );
  readonly #pcmChunker = new RingRtcPcmChunker();
  #progressGeneration = 0;
  #readyReported = false;
  #paused = false;
  #stopped = false;

  constructor() {
    super();
    this.port.onmessage = ({ data }: { data: RingRtcAudioWorkletMessage }) => {
      if (data.type === 'packet') {
        this.#timeline.enqueue(data.source, data.startSample, data.samples);
        if (!this.#readyReported && this.#timeline.ready) {
          this.#readyReported = true;
          this.port.postMessage({
            type: 'ready',
          } satisfies RingRtcAudioWorkletEvent);
        }
      } else if (data.type === 'start-degraded') {
        if (!this.#readyReported && this.#timeline.startWithAvailableSource()) {
          this.#readyReported = true;
          this.port.postMessage({
            type: 'ready',
          } satisfies RingRtcAudioWorkletEvent);
        }
      } else if (data.type === 'start-generation') {
        this.#pcmChunker.reset();
        this.#progressGeneration = data.generation;
      } else if (data.type === 'reset') {
        this.#timeline.reset(data.cursor, false);
        this.#pcmChunker.reset();
        this.#progressGeneration = data.generation;
        this.#paused = false;
      } else if (data.type === 'pause') {
        this.#paused = true;
        this.#pcmChunker.reset();
      } else {
        const samples = this.#pcmChunker.flush();
        if (samples) {
          this.#postPcm(samples);
        }
        this.#stopped = true;
        this.port.postMessage({
          type: 'stopped',
          generation: this.#progressGeneration,
        } satisfies RingRtcAudioWorkletEvent);
      }
    };
  }

  process(
    _inputs: Array<Array<Float32Array<ArrayBuffer>>>,
    outputs: Array<Array<Float32Array<ArrayBuffer>>>
  ): boolean {
    if (this.#stopped) {
      return false;
    }

    const output = outputs[0]?.[0];
    if (!output) {
      return true;
    }
    const renderedPcm = this.#timeline.render(output.length);
    output.set(renderedPcm);
    if (!this.#paused && this.#readyReported) {
      for (const samples of this.#pcmChunker.add(renderedPcm)) {
        this.#postPcm(samples);
      }
    }
    return true;
  }

  #postPcm(samples: Float32Array<ArrayBuffer>): void {
    this.port.postMessage(
      {
        type: 'rendered-pcm',
        generation: this.#progressGeneration,
        samples,
      } satisfies RingRtcAudioWorkletEvent,
      [samples.buffer]
    );
  }
}

registerProcessor('minutes-ringrtc-audio-source', MinutesRingRtcAudioSource);
