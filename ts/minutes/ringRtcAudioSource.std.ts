// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import {
  RingRtcAudioTimeline,
  type RingRtcAudioWorkletMessage,
} from './ringRtcAudioTimeline.std.ts';

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
  readonly #timeline = new RingRtcAudioTimeline();
  #stopped = false;

  constructor() {
    super();
    this.port.onmessage = ({ data }: { data: RingRtcAudioWorkletMessage }) => {
      if (data.type === 'packet') {
        this.#timeline.enqueue(data.source, data.startSample, data.samples);
      } else if (data.type === 'reset') {
        this.#timeline.reset(data.cursor);
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
    output.set(this.#timeline.render(output.length));
    return true;
  }
}

registerProcessor('minutes-ringrtc-audio-source', MinutesRingRtcAudioSource);
