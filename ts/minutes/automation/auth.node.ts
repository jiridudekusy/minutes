// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const TOKEN_BYTES = 32;
const SHA256_HEX_LENGTH = 64;

export function generateAutomationToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

export function hashAutomationToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function verifyAutomationToken(
  token: string,
  expectedHash: string
): boolean {
  if (!/^[a-f0-9]{64}$/.test(expectedHash)) {
    return false;
  }

  const actual = Buffer.from(hashAutomationToken(token), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return (
    actual.length === SHA256_HEX_LENGTH / 2 &&
    expected.length === SHA256_HEX_LENGTH / 2 &&
    timingSafeEqual(actual, expected)
  );
}
