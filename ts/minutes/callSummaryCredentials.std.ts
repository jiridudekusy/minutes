// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import type { AiProvider } from './aiSettings.std.ts';

type AiApiKeyReader = (provider: AiProvider) => Promise<string | null>;

export async function resolveCallSummaryCredential(
  provider: AiProvider,
  readApiKey: AiApiKeyReader
): Promise<string | null> {
  if (provider === 'local') {
    return '';
  }

  return readApiKey(provider);
}
