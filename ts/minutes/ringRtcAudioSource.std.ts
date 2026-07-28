// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import {
  RING_RTC_AUDIO_PREROLL_SAMPLE_COUNT,
  RingRtcAudioTimeline,
  type RingRtcAudioWorkletMessage,
} from './ringRtcAudioTimeline.std.ts';
import {
  RingRtcRenderedPcmProgress,
  type RingRtcAudioWorkletEvent,
} from './ringRtcRenderedPcmProgress.std.ts';

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
  readonly #renderedPcmProgress = new RingRtcRenderedPcmProgress();
  #progressGeneration = 0;
  #readyReported = false;
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
      } else if (data.type === 'reset') {
        this.#timeline.reset(data.cursor);
        this.#renderedPcmProgress.reset();
        this.#progressGeneration = data.generation;
      } else {
        this.#stopped = true;
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
    const cursorBeforeRender = this.#timeline.cursor;
    output.set(this.#timeline.render(output.length));
    if (this.#timeline.cursor === cursorBeforeRender) {
      return true;
    }
    const renderedSamples = this.#renderedPcmProgress.addRenderedSamples(
      output.length
    );
    if (renderedSamples > 0) {
      this.port.postMessage({
        type: 'rendered-samples',
        generation: this.#progressGeneration,
        sampleCount: renderedSamples,
      } satisfies RingRtcAudioWorkletEvent);
    }
    return true;
  }
}

registerProcessor('minutes-ringrtc-audio-source', MinutesRingRtcAudioSource);
