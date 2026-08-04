// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';

import {
  canReuseLocalLlmContext,
  fitLocalLlmPromptToContext,
  LOCAL_LLM_CONTEXT_SIZE_OPTIONS,
  normalizeLocalLlmContextSize,
  resolveLocalLlmRuntimeContextSize,
} from '../../minutes/localLlmContextSize.std.ts';
import { parseStoredLocalLlmExtension } from '../../minutes/localLlmExtensionSettings.std.ts';

describe('local LLM context size', () => {
  it('defaults missing and invalid stored values to automatic mode', () => {
    assert.strictEqual(normalizeLocalLlmContextSize(undefined), 'auto');
    assert.strictEqual(normalizeLocalLlmContextSize(null), 'auto');
    assert.strictEqual(normalizeLocalLlmContextSize('65536'), 'auto');
    assert.strictEqual(normalizeLocalLlmContextSize(12_345), 'auto');
  });

  it('accepts every context size offered by settings', () => {
    assert.deepEqual(
      LOCAL_LLM_CONTEXT_SIZE_OPTIONS.map(option => option.value),
      ['auto', 8192, 16_384, 32_768, 65_536, 131_072]
    );

    for (const value of [8192, 16_384, 32_768, 65_536, 131_072] as const) {
      assert.strictEqual(normalizeLocalLlmContextSize(value), value);
    }
  });

  it('caps automatic runtime sizing at 64k while preserving explicit choices', () => {
    assert.deepEqual(resolveLocalLlmRuntimeContextSize('auto'), {
      min: 8192,
      max: 65_536,
    });
    assert.strictEqual(resolveLocalLlmRuntimeContextSize(32_768), 32_768);
    assert.strictEqual(resolveLocalLlmRuntimeContextSize(131_072), 131_072);
  });

  it('truncates oversized prompts with an explicit marker before inference', () => {
    const systemPrompt = 'system '.repeat(500);
    const userPrompt = `START\n${'meeting '.repeat(20_000)}\nEND`;

    const fitted = fitLocalLlmPromptToContext({
      systemPrompt,
      userPrompt,
      contextSize: 8192,
      maxTokens: 1100,
    });

    assert.strictEqual(fitted.truncated, true);
    assert.include(fitted.userPrompt, 'START');
    assert.include(fitted.userPrompt, 'END');
    assert.include(fitted.userPrompt, '[… část přepisu vynechána');
    assert.isAtMost(
      Math.ceil((systemPrompt.length + fitted.userPrompt.length) / 3) + 1100,
      8192 - 256
    );
  });

  it('does not reuse a loaded context after its size changes', () => {
    assert.isTrue(
      canReuseLocalLlmContext(
        {
          modelFileName: 'gemma.gguf',
          contextSize: 65_536,
        },
        'gemma.gguf',
        65_536
      )
    );
    assert.isFalse(
      canReuseLocalLlmContext(
        {
          modelFileName: 'gemma.gguf',
          contextSize: 8192,
        },
        'gemma.gguf',
        65_536
      )
    );
    assert.isFalse(
      canReuseLocalLlmContext(
        {
          modelFileName: 'other.gguf',
          contextSize: 65_536,
        },
        'gemma.gguf',
        65_536
      )
    );
  });

  it('does not reuse a loaded context after its reasoning mode changes', () => {
    const canReuseWithReasoning = canReuseLocalLlmContext as unknown as (
      loaded: {
        modelFileName: string;
        contextSize: number;
        reasoningEnabled: boolean;
      },
      modelFileName: string,
      contextSize: number,
      reasoningEnabled: boolean
    ) => boolean;

    assert.isFalse(
      canReuseWithReasoning(
        {
          modelFileName: 'gemma.gguf',
          contextSize: 65_536,
          reasoningEnabled: false,
        },
        'gemma.gguf',
        65_536,
        true
      )
    );
  });

  it('migrates stored extension settings to automatic context with reasoning disabled', () => {
    assert.deepEqual(
      parseStoredLocalLlmExtension({
        activated: true,
        modelFileName: 'gemma.gguf',
        installedAt: 123,
      }),
      {
        activated: true,
        modelFileName: 'gemma.gguf',
        installedAt: 123,
        contextSize: 'auto',
        reasoningEnabled: false,
      }
    );
  });

  it('normalizes invalid stored local inference settings without losing the model', () => {
    assert.deepEqual(
      parseStoredLocalLlmExtension({
        activated: true,
        modelFileName: 'gemma.gguf',
        contextSize: 12_345,
        reasoningEnabled: 'yes',
      }),
      {
        activated: true,
        modelFileName: 'gemma.gguf',
        installedAt: undefined,
        contextSize: 'auto',
        reasoningEnabled: false,
      }
    );
  });

  it('preserves explicitly enabled reasoning in stored settings', () => {
    assert.deepEqual(
      parseStoredLocalLlmExtension({
        activated: true,
        modelFileName: 'gemma.gguf',
        contextSize: 32_768,
        reasoningEnabled: true,
      }),
      {
        activated: true,
        modelFileName: 'gemma.gguf',
        installedAt: undefined,
        contextSize: 32_768,
        reasoningEnabled: true,
      }
    );
  });
});
