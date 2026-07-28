// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

export type ScreenLockCallResult = 'kept' | 'hung-up';

export function handleActiveCallOnScreenLock({
  isMinutesBuild,
  hangUpActiveCall,
}: Readonly<{
  isMinutesBuild: boolean;
  hangUpActiveCall: (reason: string) => void;
}>): ScreenLockCallResult {
  if (isMinutesBuild) {
    return 'kept';
  }

  hangUpActiveCall('powerMonitorLockScreen');
  return 'hung-up';
}
