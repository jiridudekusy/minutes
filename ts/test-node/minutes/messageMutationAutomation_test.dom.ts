// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';
import type { ReadonlyMessageAttributesType } from '../../model-types.d.ts';
import type { AciString } from '../../types/ServiceId.std.ts';
import {
  editAutomationMessage,
  deleteAutomationMessage,
} from '../../minutes/automation/messageMutationAutomation.dom.ts';
import { prepareAutomationMentions } from '../../minutes/automation/messageMentionAutomation.std.ts';

describe('MCP message mutations', () => {
  const originalController = window.ConversationController;
  before(() => {
    window.ConversationController = {
      getOurConversationId: () => 'self',
    } as unknown as typeof window.ConversationController;
  });
  after(() => {
    window.ConversationController = originalController;
  });
  function message(
    overrides: Partial<ReadonlyMessageAttributesType> = {}
  ): ReadonlyMessageAttributesType {
    return {
      id: 'message',
      conversationId: 'group',
      type: 'outgoing',
      body: 'old',
      sent_at: Date.now(),
      received_at: 1,
      timestamp: Date.now(),
      ...overrides,
    };
  }
  function edits() {
    const sent: Array<unknown> = [];
    return {
      sent,
      dependencies: {
        prepareText: (text: string) => ({ body: text, bodyRanges: undefined }),
        sendEdit: async (payload: unknown) => {
          sent.push(payload);
        },
      },
    };
  }
  it('queues an edit while preserving the quote and only still-referenced link previews', async () => {
    const { sent, dependencies } = edits();
    const quote = {
      id: 100,
      authorAci: 'c68f209f-36d1-4f1f-a15b-5f522b04ee46' as AciString,
      attachments: [],
      isViewOnce: false,
      referencedMessageNotFound: false,
    };
    const keep = { url: 'https://one.test', title: 'One' };
    const result = await editAutomationMessage(
      message({ quote, preview: [keep, { url: 'https://removed.test' }] }),
      { conversationId: 'group', text: 'new https://one.test' },
      dependencies
    );
    assert.deepEqual(sent, [
      {
        body: 'new https://one.test',
        bodyRanges: undefined,
        preview: [keep],
        targetMessageId: 'message',
        quoteSentAt: 100,
        quoteAuthorAci: quote.authorAci,
      },
    ]);
    assert.deepEqual(result, {
      queued: true,
      messageId: 'message',
      conversationId: 'group',
    });
  });
  it('resolves replacement mentions before queuing an edit', async () => {
    const { sent, dependencies } = edits();
    const aci = 'c68f209f-36d1-4f1f-a15b-5f522b04ee46' as AciString;
    await editAutomationMessage(
      message(),
      {
        conversationId: 'group',
        text: 'Hi @Tomáš',
        mentions: [{ contactId: 'tomas', start: 3, length: 6 }],
      },
      {
        ...dependencies,
        prepareText: (text, mentions) =>
          prepareAutomationMentions(
            text,
            mentions,
            () => ({ aci, name: 'Tomáš Lesný' }),
            new Set([aci])
          ),
      }
    );
    assert.deepInclude(sent[0], {
      body: 'Hi \uFFFC',
      bodyRanges: [
        {
          start: 3,
          length: 1,
          mentionAci: aci,
          replacementText: 'Tomáš Lesný',
        },
      ],
    });
  });
  it('refuses to silently remove a legacy quote whose author cannot be identified', async () => {
    const { sent, dependencies } = edits();
    await assert.isRejected(
      editAutomationMessage(
        message({
          quote: {
            id: 100,
            attachments: [],
            isViewOnce: false,
            referencedMessageNotFound: true,
          },
        }),
        { conversationId: 'group', text: 'new' },
        dependencies
      ),
      'quote'
    );
    assert.isEmpty(sent);
  });
  it('allows edits of old Note to Self messages under Signal rules', async () => {
    const { sent, dependencies } = edits();
    await editAutomationMessage(
      message({ conversationId: 'self', sent_at: 1 }),
      { conversationId: 'self', text: 'new' },
      dependencies
    );
    assert.lengthOf(sent, 1);
  });
  it('does not report an edit as queued when the native send fails', async () => {
    const { dependencies } = edits();
    await assert.isRejected(
      editAutomationMessage(
        message(),
        { conversationId: 'group', text: 'new' },
        {
          ...dependencies,
          sendEdit: async () => {
            throw new Error('queue unavailable');
          },
        }
      ),
      'queue unavailable'
    );
  });
  for (const [name, target, text, code] of [
    ['missing target', undefined, 'new', 'NOT_FOUND'],
    [
      'wrong conversation',
      message({ conversationId: 'elsewhere' }),
      'new',
      'INVALID_ARGUMENT',
    ],
    ['incoming target', message({ type: 'incoming' }), 'new', 'INVALID_STATE'],
    [
      'expired target',
      message({ sent_at: Date.now() - 2 * 86400000 }),
      'new',
      'INVALID_STATE',
    ],
    [
      'exhausted edit limit',
      message({
        editHistory: Array.from({ length: 11 }, () => ({
          body: 'old',
          timestamp: 1,
          received_at: 1,
        })),
      }),
      'new',
      'INVALID_STATE',
    ],
    [
      'deleted target',
      message({ deletedForEveryone: true }),
      'new',
      'INVALID_STATE',
    ],
    ['empty text', message(), '  ', 'INVALID_ARGUMENT'],
    ['oversized text', message(), 'x'.repeat(65537), 'INVALID_ARGUMENT'],
  ] as const) {
    it(`refuses ${name} before an edit is queued`, async () => {
      const { sent, dependencies } = edits();
      let caught: unknown;
      try {
        await editAutomationMessage(
          target,
          { conversationId: 'group', text },
          dependencies
        );
      } catch (error) {
        caught = error;
      }
      assert.propertyVal(caught, 'code', code);
      assert.isEmpty(sent);
    });
  }
  function deletions(allowed: boolean) {
    const effects: Array<string> = [];
    return {
      effects,
      dependencies: {
        canDeleteForEveryone: () =>
          allowed
            ? { ok: true as const }
            : { ok: false as const, reason: 'no permission' },
        deleteForMe: async (target: ReadonlyMessageAttributesType) => {
          effects.push(`me:${target.id}`);
        },
        deleteForEveryone: async (target: ReadonlyMessageAttributesType) => {
          effects.push(`everyone:${target.id}`);
        },
      },
    };
  }
  it('uses delete-for-me for incoming messages without deleting for recipients', async () => {
    const { effects, dependencies } = deletions(false);
    const result = await deleteAutomationMessage(
      message({ type: 'incoming' }),
      { conversationId: 'group', scope: 'for_me' },
      dependencies
    );
    assert.deepEqual(effects, ['me:message']);
    assert.deepEqual(result, {
      deleted: true,
      scope: 'for_me',
      messageId: 'message',
      conversationId: 'group',
    });
  });
  it('queues delete-for-everyone only after Signal allows it', async () => {
    const { effects, dependencies } = deletions(true);
    const result = await deleteAutomationMessage(
      message(),
      { conversationId: 'group', scope: 'for_everyone' },
      dependencies
    );
    assert.deepEqual(effects, ['everyone:message']);
    assert.deepEqual(result, {
      queued: true,
      scope: 'for_everyone',
      messageId: 'message',
      conversationId: 'group',
    });
  });
  for (const scope of [undefined, 'all', 'for_everyone']) {
    it(`rejects denied or invalid deletion scope ${String(scope)} without side effects`, async () => {
      const { effects, dependencies } = deletions(false);
      await assert.isRejected(
        deleteAutomationMessage(
          message(),
          { conversationId: 'group', scope },
          dependencies
        )
      );
      assert.isEmpty(effects);
    });
  }
  it('does not enqueue a second delete for an already-deleted message', async () => {
    const { effects, dependencies } = deletions(true);
    const result = await deleteAutomationMessage(
      message({ deletedForEveryone: true }),
      { conversationId: 'group', scope: 'for_everyone' },
      dependencies
    );
    assert.deepInclude(result, { queued: false, alreadyDeleted: true });
    assert.isEmpty(effects);
  });
  for (const [name, target, conversationId] of [
    ['missing message', undefined, 'group'],
    ['wrong conversation', message(), 'different'],
    [
      'previous failed deletion',
      message({ deletedForEveryone: true, deletedForEveryoneFailed: true }),
      'group',
    ],
  ] as const) {
    it(`rejects ${name} without deletion side effects`, async () => {
      const { effects, dependencies } = deletions(true);
      await assert.isRejected(
        deleteAutomationMessage(
          target,
          { conversationId, scope: 'for_everyone' },
          dependencies
        )
      );
      assert.isEmpty(effects);
    });
  }
});
