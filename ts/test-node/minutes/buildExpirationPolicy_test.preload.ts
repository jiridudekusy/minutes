// Copyright 2026 minutes contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';

import type { StorageInterface } from '../../types/Storage.d.ts';
import { applyMinutesBuildExpirationPolicy } from '../../minutes/buildExpiration.preload.ts';

describe('applyMinutesBuildExpirationPolicy', () => {
  it('keeps Minutes connected and clears a stale Signal expiration', async () => {
    const removedKeys: Array<string> = [];
    const storage = {
      get: (key: string) =>
        key === 'remoteBuildExpiration' ? Date.now() - 1 : undefined,
      remove: async (key: string) => {
        removedKeys.push(key);
      },
    } as unknown as StorageInterface;

    const before = Date.now();
    const policy = await applyMinutesBuildExpirationPolicy({
      storage,
      signalHasBuildExpired: true,
    });

    assert.deepEqual(policy, {
      hasBuildExpired: false,
      observeSignalExpiration: false,
    });
    assert.deepEqual(removedKeys, ['remoteBuildExpiration']);
    assert.isAbove(window.getBuildExpiration(), before);
  });
});
