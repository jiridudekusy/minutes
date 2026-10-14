// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';
import type { AciString } from '../../types/ServiceId.std.ts';
import { prepareAutomationMentions } from '../../minutes/automation/messageMentionAutomation.std.ts';
import { sendSignalChatMessage } from '../../minutes/sendSignalChatMessage.preload.ts';

describe('automation outgoing mentions', () => {
  const aci = 'c68f209f-36d1-4f1f-a15b-5f522b04ee46' as AciString;
  const otherAci = 'b70e4327-3127-4c36-ae64-a21aafae37f0' as AciString;
  const members = new Set([aci, otherAci]);
  const resolve = (id: string) => {
    if (id === 'tomas') {
      return { aci, name: 'Tomáš Lesný' };
    }
    if (id === 'lukas') {
      return { aci: otherAci, name: 'Lukáš Kutík' };
    }
    return null;
  };

  it('queues real mentions using UTF-16 positions without changing literal text', async () => {
    const prepared = prepareAutomationMentions(
      '  👋 **Call** @Tomáš / @Lukáš  ',
      [
        { contactId: 'lukas', start: 23, length: 6 },
        { contactId: 'tomas', start: 14, length: 6 },
      ],
      resolve,
      members
    );
    const expectedRanges = [
      { start: 14, length: 1, mentionAci: aci, replacementText: 'Tomáš Lesný' },
      {
        start: 18,
        length: 1,
        mentionAci: otherAci,
        replacementText: 'Lukáš Kutík',
      },
    ];
    assert.deepEqual(prepared, {
      body: '  👋 **Call** \uFFFC / \uFFFC  ',
      bodyRanges: expectedRanges,
    });

    const originalController = window.ConversationController;
    let queued: unknown;
    window.ConversationController = {
      get: () => ({
        enqueueMessageForSend: async (message: unknown) => {
          queued = message;
        },
      }),
    } as unknown as typeof window.ConversationController;
    try {
      assert.isTrue(
        await sendSignalChatMessage(
          'group',
          prepared.body,
          'test',
          [],
          prepared.bodyRanges
        )
      );
      assert.deepEqual(queued, {
        body: '  👋 **Call** \uFFFC / \uFFFC  ',
        bodyRanges: expectedRanges,
        attachments: [],
      });
    } finally {
      window.ConversationController = originalController;
    }
  });

  it('preserves the existing no-mention path', () => {
    assert.deepEqual(
      prepareAutomationMentions('**Call**', undefined, resolve, undefined),
      {
        body: '**Call**',
        bodyRanges: undefined,
      }
    );
    assert.deepEqual(
      prepareAutomationMentions(undefined, [], resolve, undefined),
      {
        body: undefined,
        bodyRanges: undefined,
      }
    );
  });

  for (const [name, text, mentions, memberAcis] of [
    [
      'missing text',
      undefined,
      [{ contactId: 'tomas', start: 0, length: 1 }],
      members,
    ],
    [
      'unknown contact',
      '@A',
      [{ contactId: 'unknown', start: 0, length: 2 }],
      members,
    ],
    [
      'non-member',
      '@A',
      [{ contactId: 'tomas', start: 0, length: 2 }],
      new Set([otherAci]),
    ],
    [
      'direct conversation',
      '@A',
      [{ contactId: 'tomas', start: 0, length: 2 }],
      undefined,
    ],
    [
      'out of bounds',
      '@A',
      [{ contactId: 'tomas', start: 1, length: 2 }],
      members,
    ],
    [
      'overlap',
      '@ABC',
      [
        { contactId: 'tomas', start: 0, length: 3 },
        { contactId: 'lukas', start: 2, length: 2 },
      ],
      members,
    ],
    [
      'split emoji',
      '👋A',
      [{ contactId: 'tomas', start: 1, length: 1 }],
      members,
    ],
    [
      'negative start',
      '@A',
      [{ contactId: 'tomas', start: -1, length: 2 }],
      members,
    ],
    [
      'empty range',
      '@A',
      [{ contactId: 'tomas', start: 0, length: 0 }],
      members,
    ],
    ['malformed list', '@A', 'tomas', members],
  ] as const) {
    it(`rejects ${name} before sending`, () => {
      assert.throws(() =>
        prepareAutomationMentions(text, mentions, resolve, memberAcis)
      );
    });
  }
});
