// Copyright 2026 minutes contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { DAY } from '../util/durations/index.std.ts';
import { createLogger } from '../logging/log.std.ts';
import type { StorageInterface } from '../types/Storage.d.ts';

const log = createLogger('minutes/buildExpiration');

// Within Signal's allowed window (≤ 91 days) so sanity checks pass.
const ROLLING_BUILD_EXPIRATION = 30 * DAY;

export function isMinutesBuildExpirationDisabled(): boolean {
  return true;
}

export function getMinutesConnectHasBuildExpired(): boolean {
  return false;
}

export async function prepareMinutesBuildExpiration(
  storage: StorageInterface
): Promise<void> {
  log.info('disabling Signal build expiration for minutes fork builds');

  window.getBuildExpiration = () => Date.now() + ROLLING_BUILD_EXPIRATION;

  const remoteBuildExpiration = storage.get('remoteBuildExpiration');
  if (remoteBuildExpiration != null) {
    log.warn(
      `clearing stored remoteBuildExpiration (${String(remoteBuildExpiration)})`
    );
    await storage.remove('remoteBuildExpiration');
  }
}

export async function applyMinutesBuildExpirationPolicy({
  storage,
  signalHasBuildExpired,
}: Readonly<{
  storage: StorageInterface;
  signalHasBuildExpired: boolean;
}>): Promise<{
  hasBuildExpired: boolean;
  observeSignalExpiration: boolean;
}> {
  await prepareMinutesBuildExpiration(storage);

  const expirationDisabled = isMinutesBuildExpirationDisabled();
  return {
    hasBuildExpired: expirationDisabled
      ? getMinutesConnectHasBuildExpired()
      : signalHasBuildExpired,
    observeSignalExpiration: !expirationDisabled,
  };
}

/** @deprecated use prepareMinutesBuildExpiration */
export function initializeMinutesBuildExpiration(): void {
  window.getBuildExpiration = () => Date.now() + ROLLING_BUILD_EXPIRATION;
}
