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
    addContact: async () => ({ id: 'contact-1' }),
    getGroup: async () => ({ id: 'group-1' }),
    findGroupsByMember: async () => ({ items: [] }),
    createGroup: async () => ({ id: 'group-1' }),
    updateGroupMetadata: async () => ({ id: 'group-1' }),
    addGroupMembers: async () => ({ id: 'group-1' }),
    removeGroupMembers: async () => ({ id: 'group-1' }),
    setGroupMemberRoles: async () => ({ id: 'group-1' }),
    setGroupPermissions: async () => ({ id: 'group-1' }),
    setGroupDisappearingMessages: async () => ({ id: 'group-1' }),
    terminateGroup: async () => ({ id: 'group-1' }),
    leaveGroup: async () => ({ id: 'group-1' }),
    getMessages: async () => ({ items: [] }),
    getMessage: async () => ({ message: { id: 'message-1' } }),
    searchMessages: async () => ({ items: [] }),
    getAttachmentDirectories: async () => ({
      outgoing: '/safe/outgoing',
      downloads: '/safe/downloads',
    }),
    downloadAttachment: async () => ({ path: '/safe/downloads/file' }),
    sendMessage: async () => ({ messageId: 'message-1' }),
    editMessage: async () => ({ queued: true }),
    deleteMessage: async () => ({ deleted: true }),
    createPoll: async () => ({ messageId: 'poll-message-1' }),
    getPollResults: async () => ({ messageId: 'poll-message-1' }),
    votePoll: async () => ({ queued: true }),
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

  it('reuses a completed poll creation for the same idempotency key', async () => {
    let createCount = 0;
    const capabilities = createCapabilities({
      createPoll: async () => {
        createCount += 1;
        return { messageId: 'poll-message-1' };
      },
    });
    const firstHandler = new AutomationRendererHandler(capabilities);
    const secondHandler = new AutomationRendererHandler(capabilities);
    const params = {
      conversationId: 'conversation-1',
      question: 'Kam na oběd?',
      options: ['Pizza', 'Sushi'],
      allowMultiple: false,
      idempotencyKey: 'lunch-2026-09-25',
    };

    assert.deepEqual(
      await firstHandler.handle({
        id: 'first-poll',
        method: 'createPoll',
        params,
      }),
      {
        id: 'first-poll',
        ok: true,
        result: { messageId: 'poll-message-1' },
      }
    );
    assert.deepEqual(
      await secondHandler.handle({
        id: 'retried-poll',
        method: 'createPoll',
        params,
      }),
      {
        id: 'retried-poll',
        ok: true,
        result: { messageId: 'poll-message-1' },
      }
    );
    assert.strictEqual(createCount, 1);
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

  for (const method of ['editMessage', 'deleteMessage'] as const) {
    it(`deduplicates ${method} and rejects changing its target with the same key`, async () => {
      let calls = 0;
      const handler = new AutomationRendererHandler(
        createCapabilities({
          [method]: async () => {
            calls += 1;
            return { changed: true };
          },
        })
      );
      const params = {
        conversationId: 'group',
        messageId: 'one',
        text: 'new',
        scope: 'for_me',
        idempotencyKey: `dedupe-${method}`,
      };
      const first = await handler.handle({
        id: `${method}-first`,
        method,
        params,
      });
      assert.isTrue(first.ok);
      const retry = await handler.handle({
        id: `${method}-retry`,
        method,
        params,
      });
      assert.isTrue(retry.ok);
      assert.equal(calls, 1);
      const conflict = await handler.handle({
        id: `${method}-conflict`,
        method,
        params: { ...params, messageId: 'two' },
      });
      assert.isFalse(conflict.ok);
      if (!conflict.ok) {
        assert.equal(conflict.error.code, 'IDEMPOTENCY_CONFLICT');
      }
      assert.equal(calls, 1);
    });
  }

  it('rejects reuse of an idempotency key for a different mentioned contact', async () => {
    const handler = new AutomationRendererHandler(createCapabilities());
    const params = {
      conversationId: 'group-1',
      text: 'Hi @Alex',
      idempotencyKey: 'reused-mention-key',
      mentions: [{ contactId: 'alex-1', start: 3, length: 5 }],
    };
    await handler.handle({
      id: 'mention-first',
      method: 'sendMessage',
      params,
    });
    const result = await handler.handle({
      id: 'mention-second',
      method: 'sendMessage',
      params: {
        ...params,
        mentions: [{ contactId: 'alex-2', start: 3, length: 5 }],
      },
    });
    assert.isFalse(result.ok);
    if (!result.ok) {
      assert.equal(result.error.code, 'IDEMPOTENCY_CONFLICT');
    }
  });

  it('rejects reuse of an idempotency key for different attachments', async () => {
    const handler = new AutomationRendererHandler(createCapabilities());
    await handler.handle({
      id: 'first-send',
      method: 'sendMessage',
      params: {
        conversationId: 'conversation-1',
        text: 'Report',
        attachments: [
          {
            path: '/safe/outgoing/report-a.pdf',
            contentType: 'application/pdf',
          },
        ],
        idempotencyKey: 'reused-attachment-key',
      },
    });

    const conflict = await handler.handle({
      id: 'second-send',
      method: 'sendMessage',
      params: {
        conversationId: 'conversation-1',
        text: 'Report',
        attachments: [
          {
            path: '/safe/outgoing/report-b.pdf',
            contentType: 'application/pdf',
          },
        ],
        idempotencyKey: 'reused-attachment-key',
      },
    });

    assert.deepInclude(conflict, { id: 'second-send', ok: false });
    if (!conflict.ok) {
      assert.strictEqual(conflict.error.code, 'IDEMPOTENCY_CONFLICT');
    }
  });
});
