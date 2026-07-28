// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';

type LocalLlmReasoningPolicyModule = {
  getLocalLlmChatWrapperOptions: (reasoningEnabled: boolean) => unknown;
  requireNonEmptyLocalLlmOutput: (text: string) => string;
};

type GeneratedTextValidationModule = {
  requireNonEmptySummaryText: (text: string) => string;
};

async function loadReasoningPolicy(): Promise<LocalLlmReasoningPolicyModule | null> {
  try {
    return (await import('../../minutes/localLlmReasoning.std.ts')) as LocalLlmReasoningPolicyModule;
  } catch {
    return null;
  }
}

async function loadGeneratedTextValidation(): Promise<GeneratedTextValidationModule | null> {
  try {
    return (await import('../../minutes/generatedTextValidation.std.ts')) as GeneratedTextValidationModule;
  } catch {
    return null;
  }
}

describe('local LLM reasoning policy', () => {
  it('passes the selected reasoning mode to the Gemma 4 wrapper', async () => {
    const policy = await loadReasoningPolicy();

    assert.deepEqual(policy?.getLocalLlmChatWrapperOptions(false), {
      customWrapperSettings: {
        gemma4: {
          reasoning: false,
        },
      },
    });
    assert.deepEqual(policy?.getLocalLlmChatWrapperOptions(true), {
      customWrapperSettings: {
        gemma4: {
          reasoning: true,
        },
      },
    });
  });

  it('rejects an empty local model response', async () => {
    const policy = await loadReasoningPolicy();

    assert.isNotNull(policy);
    assert.throws(
      () => policy?.requireNonEmptyLocalLlmOutput(' \n '),
      'Lokální model vrátil prázdnou odpověď.'
    );
    assert.strictEqual(
      policy?.requireNonEmptyLocalLlmOutput('  hotovo \n'),
      'hotovo'
    );
  });

  it('rejects an empty summary before it can be persisted', async () => {
    const validation = await loadGeneratedTextValidation();

    assert.isNotNull(validation);
    assert.throws(
      () => validation?.requireNonEmptySummaryText(' \n '),
      'AI model vrátil prázdné shrnutí.'
    );
    assert.strictEqual(
      validation?.requireNonEmptySummaryText('  Shrnutí: hotovo \n'),
      'Shrnutí: hotovo'
    );
  });
});
