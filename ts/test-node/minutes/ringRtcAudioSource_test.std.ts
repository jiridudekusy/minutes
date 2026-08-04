// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { strict as assert } from 'node:assert';

type WorkletMessage = Readonly<{
  data: unknown;
}>;

class FakeMessagePort {
  onmessage: ((event: WorkletMessage) => void) | null = null;
  readonly events = new Array<unknown>();

  postMessage(data: unknown): void {
    this.events.push(data);
  }
}

type AudioSourceProcessor = Readonly<{
  port: FakeMessagePort;
  process: (
    inputs: Array<Array<Float32Array<ArrayBuffer>>>,
    outputs: Array<Array<Float32Array<ArrayBuffer>>>
  ) => boolean;
}>;

describe('Minutes RingRTC audio worklet', () => {
  it('supports one-sided startup and reports rendered PCM exactly', async () => {
    let ProcessorClass: (new () => AudioSourceProcessor) | undefined;
    const globals = globalThis as typeof globalThis & {
      AudioWorkletProcessor?: unknown;
      registerProcessor?: (
        name: string,
        processor: new () => AudioSourceProcessor
      ) => void;
    };
    const previousProcessor = globals.AudioWorkletProcessor;
    const previousRegister = globals.registerProcessor;

    class FakeAudioWorkletProcessor {
      readonly port = new FakeMessagePort();
    }

    globals.AudioWorkletProcessor = FakeAudioWorkletProcessor;
    globals.registerProcessor = (name, processor) => {
      assert.equal(name, 'minutes-ringrtc-audio-source');
      ProcessorClass = processor;
    };

    try {
      await import('../../minutes/ringRtcAudioSource.std.ts');
      assert.ok(ProcessorClass);

      const degradedProcessor = new ProcessorClass();
      assert.ok(degradedProcessor.port.onmessage);
      degradedProcessor.port.onmessage({
        data: {
          type: 'packet',
          source: 'remote',
          startSample: 0,
          samples: new Float32Array(4_800).fill(0.5),
        },
      });
      assert.deepEqual(degradedProcessor.port.events, []);
      degradedProcessor.port.onmessage({ data: { type: 'start-degraded' } });
      assert.deepEqual(degradedProcessor.port.events, [{ type: 'ready' }]);
      const degradedOutput = new Float32Array(128);
      degradedProcessor.process([], [[degradedOutput]]);
      assert.deepEqual([...degradedOutput], Array(128).fill(0.5));

      const processor = new ProcessorClass();
      assert.ok(processor.port.onmessage);

      processor.port.onmessage({
        data: {
          type: 'packet',
          source: 'local',
          startSample: 0,
          samples: new Float32Array(30_400).fill(0.25),
        },
      });
      processor.port.onmessage({
        data: {
          type: 'packet',
          source: 'remote',
          startSample: 0,
          samples: new Float32Array(4_800).fill(0.5),
        },
      });

      processor.process([], [[new Float32Array(128)]]);
      processor.port.onmessage({
        data: { type: 'start-generation', generation: 1 },
      });

      const renderCount = 200;
      const samplesPerRender = 128;
      for (let index = 0; index < renderCount; index += 1) {
        processor.process([], [[new Float32Array(samplesPerRender)]]);
      }
      processor.port.onmessage({ data: { type: 'stop' } });

      const reportedPcmSamples = processor.port.events.reduce<number>(
        (total, event) => {
          if (
            typeof event === 'object' &&
            event != null &&
            'type' in event &&
            event.type === 'rendered-pcm' &&
            'generation' in event &&
            event.generation === 1 &&
            'samples' in event &&
            event.samples instanceof Float32Array
          ) {
            return total + event.samples.length;
          }
          return total;
        },
        0
      );
      assert.equal(reportedPcmSamples, renderCount * samplesPerRender);
    } finally {
      if (previousProcessor === undefined) {
        delete globals.AudioWorkletProcessor;
      } else {
        globals.AudioWorkletProcessor = previousProcessor;
      }
      if (previousRegister === undefined) {
        delete globals.registerProcessor;
      } else {
        globals.registerProcessor = previousRegister;
      }
    }
  });
});
