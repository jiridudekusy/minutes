// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';

import {
  AutomationRendererHandler,
  type AutomationRendererCapabilities,
} from '../../minutes/automation/automationRendererHandler.std.ts';

function createCapabilities(
  overrides: Partial<AutomationRendererCapabilities> = {}
): AutomationRendererCapabilities {
  return {
    listConversations: async () => ({ items: [] }),
    getConversation: async () => ({ id: 'conversation-1' }),
    listContacts: async () => ({ items: [] }),
    getContact: async () => ({ id: 'contact-1' }),
    getGroup: async () => ({ id: 'group-1' }),
    findGroupsByMember: async () => ({ items: [] }),
    createGroup: async () => ({ id: 'group-1' }),
    updateGroupMetadata: async () => ({ id: 'group-1' }),
    addGroupMembers: async () => ({ id: 'group-1' }),
    removeGroupMembers: async () => ({ id: 'group-1' }),
    setGroupMemberRoles: async () => ({ id: 'group-1' }),
    setGroupPermissions: async () => ({ id: 'group-1' }),
    setGroupDisappearingMessages: async () => ({ id: 'group-1' }),
    leaveGroup: async () => ({ id: 'group-1' }),
    getMessages: async () => ({ items: [] }),
    searchMessages: async () => ({ items: [] }),
    sendMessage: async () => ({ messageId: 'message-1' }),
    setMessageReaction: async () => ({ changed: true }),
    getActiveCall: async () => ({ call: null }),
    startCall: async () => ({ started: true }),
    hangUpCall: async () => ({ ended: true }),
    startAudioRecording: async () => ({ started: true }),
    startVideoRecording: async () => ({ started: true }),
    pauseRecording: async () => ({ paused: true }),
    resumeRecording: async () => ({ resumed: true }),
    stopRecording: async () => ({ stopped: true }),
    ...overrides,
  };
}

describe('AutomationRendererHandler', () => {
  it('dispatches only the fixed capability set and returns structured errors', async () => {
    const calls: Array<string> = [];
    const handler = new AutomationRendererHandler(
      createCapabilities({
        listConversations: async () => {
          calls.push('list');
          return { items: [] };
        },
        findGroupsByMember: async params => {
          calls.push(`find:${String(params.query)}`);
          return { items: [] };
        },
      })
    );

    assert.deepEqual(
      await handler.handle({
        id: 'one',
        method: 'listConversations',
        params: {},
      }),
      { id: 'one', ok: true, result: { items: [] } }
    );
    assert.deepEqual(calls, ['list']);

    assert.deepEqual(
      await handler.handle({
        id: 'groups',
        method: 'findGroupsByMember',
        params: { query: 'Alice' },
      }),
      { id: 'groups', ok: true, result: { items: [] } }
    );
    assert.deepEqual(calls, ['list', 'find:Alice']);

    const failure = await handler.handle({
      id: 'two',
      method: 'sendMessage',
      params: null,
    });
    assert.deepInclude(failure, {
      id: 'two',
      ok: false,
    });
    if (!failure.ok) {
      assert.strictEqual(failure.error.code, 'INVALID_ARGUMENT');
    }
  });

  it('executes one capability for a duplicate in-flight request across handlers', async () => {
    let sendCount = 0;
    const sendGate = Promise.withResolvers<void>();
    const capabilities = createCapabilities({
      sendMessage: async () => {
        sendCount += 1;
        await sendGate.promise;
        return { queued: true };
      },
    });
    const firstHandler = new AutomationRendererHandler(capabilities);
    const secondHandler = new AutomationRendererHandler(capabilities);
    const request = {
      id: 'duplicate-send',
      method: 'sendMessage',
      params: {
        conversationId: 'conversation-1',
        text: 'Only once',
      },
    } as const;

    const first = firstHandler.handle(request);
    const duplicate = secondHandler.handle(request);
    sendGate.resolve();

    assert.deepEqual(await duplicate, await first);
    assert.strictEqual(sendCount, 1);
  });

  it('reuses a completed send result for the same idempotency key', async () => {
    let sendCount = 0;
    const capabilities = createCapabilities({
      sendMessage: async () => {
        sendCount += 1;
        return { queued: true };
      },
    });
    const firstHandler = new AutomationRendererHandler(capabilities);
    const secondHandler = new AutomationRendererHandler(capabilities);
    const params = {
      conversationId: 'conversation-1',
      text: 'Only once',
      idempotencyKey: 'campaign-2026-08-04-alice',
    };

    assert.deepEqual(
      await firstHandler.handle({
        id: 'first-send',
        method: 'sendMessage',
        params,
      }),
      { id: 'first-send', ok: true, result: { queued: true } }
    );
    assert.deepEqual(
      await secondHandler.handle({
        id: 'retried-send',
        method: 'sendMessage',
        params,
      }),
      { id: 'retried-send', ok: true, result: { queued: true } }
    );
    assert.strictEqual(sendCount, 1);
  });

  it('rejects reuse of an idempotency key for different message content', async () => {
    const handler = new AutomationRendererHandler(createCapabilities());
    await handler.handle({
      id: 'first-send',
      method: 'sendMessage',
      params: {
        conversationId: 'conversation-1',
        text: 'First message',
        idempotencyKey: 'reused-key',
      },
    });

    const conflict = await handler.handle({
      id: 'second-send',
      method: 'sendMessage',
      params: {
        conversationId: 'conversation-1',
        text: 'Different message',
        idempotencyKey: 'reused-key',
      },
    });

    assert.deepInclude(conflict, { id: 'second-send', ok: false });
    if (!conflict.ok) {
      assert.strictEqual(conflict.error.code, 'IDEMPOTENCY_CONFLICT');
    }
  });
});
