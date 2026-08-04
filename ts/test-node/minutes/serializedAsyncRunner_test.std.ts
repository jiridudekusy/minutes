// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';

import { SerializedAsyncRunner } from '../../minutes/automation/serializedAsyncRunner.std.ts';

describe('SerializedAsyncRunner', () => {
  it('does not overlap queued tasks', async () => {
    const events: Array<string> = [];
    let releaseFirst: (() => void) | undefined;
    const firstBlocked = new Promise<void>(resolve => {
      releaseFirst = resolve;
    });
    const runner = new SerializedAsyncRunner();

    const first = runner.run(async () => {
      events.push('first-start');
      await firstBlocked;
      events.push('first-end');
    });
    const second = runner.run(async () => {
      events.push('second');
    });
    await Promise.resolve();

    assert.deepEqual(events, ['first-start']);
    releaseFirst?.();
    await Promise.all([first, second]);
    assert.deepEqual(events, ['first-start', 'first-end', 'second']);
  });

  it('queues final cleanup and prevents later tasks from starting', async () => {
    const events: Array<string> = [];
    let releaseTask: (() => void) | undefined;
    const taskBlocked = new Promise<void>(resolve => {
      releaseTask = resolve;
    });
    const runner = new SerializedAsyncRunner();

    const task = runner.run(async () => {
      events.push('task-start');
      await taskBlocked;
      events.push('task-end');
    });
    const close = runner.close(async () => {
      events.push('cleanup');
    });
    await runner.run(async () => {
      events.push('late-task');
    });
    await Promise.resolve();

    assert.deepEqual(events, ['task-start']);
    releaseTask?.();
    await Promise.all([task, close]);
    assert.deepEqual(events, ['task-start', 'task-end', 'cleanup']);
  });
});
