// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

export function requireNonEmptySummaryText(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error('AI model vrátil prázdné shrnutí.');
  }
  return trimmed;
}
