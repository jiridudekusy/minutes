// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

export const DEFAULT_LOCAL_LLM_CONTEXT_SIZE = 'auto' as const;

export const LOCAL_LLM_CONTEXT_SIZE_OPTIONS = [
  {
    value: DEFAULT_LOCAL_LLM_CONTEXT_SIZE,
    label: 'Automaticky (doporučeno, max. 64k)',
  },
  { value: 8192, label: '8k' },
  { value: 16_384, label: '16k' },
  { value: 32_768, label: '32k' },
  { value: 65_536, label: '64k' },
  { value: 131_072, label: '128k' },
] as const;

export type LocalLlmContextSize =
  (typeof LOCAL_LLM_CONTEXT_SIZE_OPTIONS)[number]['value'];

export type LocalLlmRuntimeContextSize =
  | number
  | Readonly<{
      min: number;
      max: number;
    }>;

export function normalizeLocalLlmContextSize(
  value: unknown
): LocalLlmContextSize {
  return LOCAL_LLM_CONTEXT_SIZE_OPTIONS.some(option => option.value === value)
    ? (value as LocalLlmContextSize)
    : DEFAULT_LOCAL_LLM_CONTEXT_SIZE;
}

export function resolveLocalLlmRuntimeContextSize(
  value: LocalLlmContextSize
): LocalLlmRuntimeContextSize {
  if (value === DEFAULT_LOCAL_LLM_CONTEXT_SIZE) {
    return {
      min: 8192,
      max: 65_536,
    };
  }

  return value;
}

const LOCAL_LLM_CONTEXT_RESERVE_TOKENS = 256;
const APPROXIMATE_CHARS_PER_TOKEN = 3;

export function fitLocalLlmPromptToContext({
  systemPrompt,
  userPrompt,
  contextSize,
  maxTokens,
}: Readonly<{
  systemPrompt: string;
  userPrompt: string;
  contextSize: number;
  maxTokens: number;
}>): Readonly<{ userPrompt: string; truncated: boolean }> {
  const inputTokenBudget =
    contextSize - maxTokens - LOCAL_LLM_CONTEXT_RESERVE_TOKENS;
  const userCharacterBudget =
    inputTokenBudget * APPROXIMATE_CHARS_PER_TOKEN - systemPrompt.length;
  if (userCharacterBudget <= 0) {
    throw new Error(
      `Local LLM context (${contextSize} tokens) is too small for the system prompt and requested output`
    );
  }
  if (userPrompt.length <= userCharacterBudget) {
    return { userPrompt, truncated: false };
  }

  const omittedCharacters = userPrompt.length - userCharacterBudget;
  const marker = `\n\n[… část přepisu vynechána kvůli limitu kontextu: přibližně ${omittedCharacters} znaků …]\n\n`;
  const retainedCharacters = userCharacterBudget - marker.length;
  if (retainedCharacters < 200) {
    throw new Error(
      `Local LLM context (${contextSize} tokens) leaves too little room for the transcript`
    );
  }
  const headCharacters = Math.floor(retainedCharacters * 0.7);
  const tailCharacters = retainedCharacters - headCharacters;
  return {
    userPrompt: `${userPrompt.slice(0, headCharacters)}${marker}${userPrompt.slice(-tailCharacters)}`,
    truncated: true,
  };
}

export function canReuseLocalLlmContext(
  loaded: Readonly<{
    modelFileName: string;
    contextSize: LocalLlmContextSize;
    reasoningEnabled?: boolean;
  }>,
  modelFileName: string,
  contextSize: LocalLlmContextSize,
  reasoningEnabled = false
): boolean {
  return (
    loaded.modelFileName === modelFileName &&
    loaded.contextSize === contextSize &&
    (loaded.reasoningEnabled ?? false) === reasoningEnabled
  );
}
