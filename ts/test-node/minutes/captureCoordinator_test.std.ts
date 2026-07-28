// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';

import { MinutesCaptureCoordinator } from '../../minutes/captureCoordinator.std.ts';

describe('MinutesCaptureCoordinator', () => {
  it('reserves the requested mode synchronously before startup awaits', async () => {
    const coordinator = new MinutesCaptureCoordinator();
    let finishStartup: (() => void) | undefined;
    const startupGate = new Promise<void>(resolve => {
      finishStartup = resolve;
    });

    const startVideo = async () => {
      const lease = coordinator.acquire('video', async () => undefined);
      await startupGate;
      return lease;
    };

    const pendingLease = startVideo();

    assert.strictEqual(coordinator.state, 'video-recording');
    assert.throws(
      () => coordinator.acquire('audio', async () => undefined),
      'Cannot start capture while coordinator is video-recording'
    );

    assert.isDefined(finishStartup);
    finishStartup();
    const lease = await pendingLease;
    lease.release();
  });

  it('moves an audio lease between recording and paused states', () => {
    const coordinator = new MinutesCaptureCoordinator();
    const lease = coordinator.acquire('audio', async () => undefined);

    assert.strictEqual(coordinator.state, 'audio-recording');
    assert.strictEqual(lease.pause(), true);
    assert.strictEqual(coordinator.state, 'audio-paused');
    assert.strictEqual(lease.pause(), false);
    assert.strictEqual(lease.resume(), true);
    assert.strictEqual(coordinator.state, 'audio-recording');
    assert.strictEqual(lease.resume(), false);
  });

  it('finalizes at most once and blocks acquisition until finalization settles', async () => {
    const coordinator = new MinutesCaptureCoordinator();
    let finalizeCalls = 0;
    let finishFinalization: (() => void) | undefined;
    const finalizationGate = new Promise<void>(resolve => {
      finishFinalization = resolve;
    });
    const lease = coordinator.acquire('video', async () => {
      finalizeCalls += 1;
      await finalizationGate;
    });

    const first = lease.finalize();
    const second = lease.finalize();

    assert.strictEqual(first, second);
    assert.strictEqual(finalizeCalls, 1);
    assert.strictEqual(coordinator.state, 'finalizing');
    assert.strictEqual(coordinator.activeMode, 'video');
    assert.throws(
      () => coordinator.acquire('audio', async () => undefined),
      'Cannot start capture while coordinator is finalizing'
    );

    assert.isDefined(finishFinalization);
    finishFinalization();
    await first;
    assert.strictEqual(coordinator.state, 'idle');
    assert.isUndefined(coordinator.activeMode);
  });

  it('delegates call-end finalization to the active lease', async () => {
    const coordinator = new MinutesCaptureCoordinator();
    let finalizeCalls = 0;
    coordinator.acquire('audio', async () => {
      finalizeCalls += 1;
    });

    await coordinator.finalizeActive();
    await coordinator.finalizeActive();

    assert.strictEqual(finalizeCalls, 1);
    assert.strictEqual(coordinator.state, 'idle');
  });

  it('makes release idempotent and ignores a stale lease', () => {
    const coordinator = new MinutesCaptureCoordinator();
    const oldLease = coordinator.acquire('audio', async () => undefined);

    assert.strictEqual(oldLease.release(), true);
    assert.strictEqual(oldLease.release(), false);

    const currentLease = coordinator.acquire('video', async () => undefined);
    assert.strictEqual(oldLease.release(), false);
    assert.strictEqual(coordinator.state, 'video-recording');

    currentLease.release();
    assert.strictEqual(coordinator.state, 'idle');
  });

  it('releases the mode even when finalization fails', async () => {
    const coordinator = new MinutesCaptureCoordinator();
    const lease = coordinator.acquire('video', async () => {
      throw new Error('writer failed');
    });

    await assert.isRejected(lease.finalize(), 'writer failed');
    assert.strictEqual(coordinator.state, 'idle');
  });
});
