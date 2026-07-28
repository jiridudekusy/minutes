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
