// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import {
  normalizeLocalLlmContextSize,
  type LocalLlmContextSize,
} from './localLlmContextSize.std.ts';
import { normalizeLocalLlmReasoningEnabled } from './localLlmReasoning.std.ts';

export type StoredLocalLlmExtension = {
  activated: boolean;
  modelFileName: string;
  installedAt?: number;
  contextSize: LocalLlmContextSize;
  reasoningEnabled: boolean;
};

export function parseStoredLocalLlmExtension(
  value: unknown
): StoredLocalLlmExtension | null {
  if (value == null || typeof value !== 'object') {
    return null;
  }

  const parsed = value as Partial<StoredLocalLlmExtension>;
  if (
    typeof parsed.modelFileName !== 'string' ||
    parsed.modelFileName.length === 0
  ) {
    return null;
  }

  return {
    activated: Boolean(parsed.activated),
    modelFileName: parsed.modelFileName,
    installedAt:
      typeof parsed.installedAt === 'number' ? parsed.installedAt : undefined,
    contextSize: normalizeLocalLlmContextSize(parsed.contextSize),
    reasoningEnabled: normalizeLocalLlmReasoningEnabled(
      parsed.reasoningEnabled
    ),
  };
}
