// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';

import { handleActiveCallOnScreenLock } from '../../minutes/screenLockCallPolicy.std.ts';

describe('handleActiveCallOnScreenLock', () => {
  it('keeps the active call connected in Minutes', () => {
    const hangupReasons: Array<string> = [];

    const result = handleActiveCallOnScreenLock({
      isMinutesBuild: true,
      hangUpActiveCall: reason => hangupReasons.push(reason),
    });

    assert.strictEqual(result, 'kept');
    assert.deepEqual(hangupReasons, []);
  });

  it('preserves the upstream Signal hangup behavior outside Minutes', () => {
    const hangupReasons: Array<string> = [];

    const result = handleActiveCallOnScreenLock({
      isMinutesBuild: false,
      hangUpActiveCall: reason => hangupReasons.push(reason),
    });

    assert.strictEqual(result, 'hung-up');
    assert.deepEqual(hangupReasons, ['powerMonitorLockScreen']);
  });
});
