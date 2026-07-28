// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

export const DEFAULT_LOCAL_LLM_REASONING_ENABLED = false;

export function normalizeLocalLlmReasoningEnabled(value: unknown): boolean {
  return value === true;
}

export function getLocalLlmChatWrapperOptions(
  reasoningEnabled: boolean
): Readonly<{
  customWrapperSettings: {
    gemma4: {
      reasoning: boolean;
    };
  };
}> {
  return {
    customWrapperSettings: {
      gemma4: {
        reasoning: reasoningEnabled,
      },
    },
  };
}

export function requireNonEmptyLocalLlmOutput(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error('Lokální model vrátil prázdnou odpověď.');
  }
  return trimmed;
}
