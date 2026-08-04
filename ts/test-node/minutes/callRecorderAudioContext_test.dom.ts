// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { strict as assert } from 'node:assert';

describe('CallRecorder AudioContext', () => {
  it('uses a silent sink before loading the MP3 encoder worklet', async () => {
    const operations = new Array<string>();
    const globals = globalThis as typeof globalThis & {
      AudioContext: typeof AudioContext;
    };
    const PreviousAudioContext = globals.AudioContext;

    class FakeAudioContext {
      readonly audioWorklet = {
        addModule: async (url: string) => {
          operations.push(`worklet:${url}`);
        },
      };

      constructor(options: AudioContextOptions) {
        operations.push(`context:${options.sampleRate}`);
      }

      async setSinkId(sinkId: Readonly<{ type: 'none' }>): Promise<void> {
        operations.push(`sink:${sinkId.type}`);
      }
    }

    globals.AudioContext = FakeAudioContext as unknown as typeof AudioContext;
    try {
      const { CallRecorder } =
        await import('../../minutes/callRecorder.dom.ts');

      await CallRecorder.warmup();

      assert.deepEqual(operations, [
        'context:48000',
        'sink:none',
        'worklet:bundles/workers/minutesMp3Encoder.js',
      ]);
    } finally {
      if (PreviousAudioContext === undefined) {
        delete (globals as { AudioContext?: typeof AudioContext }).AudioContext;
      } else {
        globals.AudioContext = PreviousAudioContext;
      }
    }
  });
});
