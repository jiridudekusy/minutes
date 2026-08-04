// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { strict as assert } from 'node:assert';

import {
  LocalLlmModelScheduler,
  type LoadedLocalModel,
} from '../../minutes/localLlmInference.main.ts';

const PROMPT_OPTIONS = {
  systemPrompt: 'system',
  userPrompt: 'user',
  maxTokens: 16,
  temperature: 0,
} as const;

describe('LocalLlmModelScheduler', () => {
  it('keeps a model alive until its queued prompt finishes', async () => {
    const firstPrompt = Promise.withResolvers<void>();
    const firstPromptStarted = Promise.withResolvers<void>();
    const events = new Array<string>();
    const scheduler = new LocalLlmModelScheduler(async request => {
      events.push(`load:${request.modelFileName}`);
      return {
        modelPath: request.modelPath,
        modelFileName: request.modelFileName,
        contextSize: request.contextSize,
        reasoningEnabled: request.reasoningEnabled,
        dispose: async () => {
          events.push(`dispose:${request.modelFileName}`);
        },
        prompt: async _options => {
          events.push(`prompt:${request.modelFileName}:start`);
          if (request.modelFileName === 'first.gguf') {
            firstPromptStarted.resolve();
            await firstPrompt.promise;
          }
          events.push(`prompt:${request.modelFileName}:end`);
          return request.modelFileName;
        },
      };
    });

    const firstResult = scheduler.generate(
      {
        modelPath: '/models/first.gguf',
        modelFileName: 'first.gguf',
        contextSize: 'auto',
        reasoningEnabled: false,
      },
      (model: LoadedLocalModel) => model.prompt(PROMPT_OPTIONS)
    );
    await firstPromptStarted.promise;

    const secondResult = scheduler.generate(
      {
        modelPath: '/models/second.gguf',
        modelFileName: 'second.gguf',
        contextSize: 'auto',
        reasoningEnabled: false,
      },
      (model: LoadedLocalModel) => model.prompt(PROMPT_OPTIONS)
    );
    await Promise.resolve();
    assert.deepEqual(events, ['load:first.gguf', 'prompt:first.gguf:start']);

    firstPrompt.resolve();
    assert.equal(await firstResult, 'first.gguf');
    assert.equal(await secondResult, 'second.gguf');
    assert.deepEqual(events, [
      'load:first.gguf',
      'prompt:first.gguf:start',
      'prompt:first.gguf:end',
      'dispose:first.gguf',
      'load:second.gguf',
      'prompt:second.gguf:start',
      'prompt:second.gguf:end',
    ]);
  });
});
