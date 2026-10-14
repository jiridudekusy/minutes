// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';

import { Emoji } from '../../axo/emoji.std.ts';
import {
  selectAutomationMessageContext,
  toAutomationMessage,
} from '../../minutes/automation/automationMessage.std.ts';
import type { AutomationMessage } from '../../minutes/automation/automationContracts.std.ts';
import type { AciString } from '../../types/ServiceId.std.ts';

describe('automation message mapping', () => {
  function message(id: string): AutomationMessage {
    return {
      id,
      conversationId: 'group-1',
      source: 'incoming',
      authorId: 'alice-id',
      authorName: 'Alice',
      sentAt: 1,
      text: id,
      attachments: [],
      reactions: [],
    };
  }
  it('includes resolved reactions in the public message result', () => {
    const result = toAutomationMessage(
      {
        id: 'message-1',
        conversationId: 'conversation-1',
        type: 'incoming',
        sent_at: 100,
        received_at_ms: 110,
        body: 'Hello',
        attachments: [],
        reactions: [
          {
            emoji: Emoji.getDefaultVariant(Emoji.THUMBS_UP),
            fromId: 'alice-id',
            targetTimestamp: 100,
            timestamp: 120,
          },
        ],
      },
      authorId => (authorId === 'alice-id' ? 'Alice' : null)
    );

    assert.deepEqual(result.reactions, [
      {
        emoji: '👍',
        authorId: 'alice-id',
        authorName: 'Alice',
        timestamp: 120,
      },
    ]);
  });

  it('exposes deletion and last-edit state so clients can verify mutations', () => {
    const result = toAutomationMessage(
      {
        id: 'deleted',
        conversationId: 'group',
        type: 'outgoing',
        sent_at: 100,
        deletedForEveryone: true,
        editMessageTimestamp: 200,
      },
      () => null
    );
    assert.deepInclude(result, {
      deletedForEveryone: true,
      editedAt: 200,
      text: null,
    });
  });

  it('identifies the author of an incoming group message', () => {
    const result = toAutomationMessage(
      {
        id: 'message-2',
        conversationId: 'group-1',
        type: 'incoming',
        sourceServiceId: 'alice-aci' as AciString,
        sent_at: 200,
        received_at_ms: 215,
        body: 'Latest reply',
        attachments: [],
        reactions: [],
      },
      () => null,
      sourceServiceId =>
        sourceServiceId === 'alice-aci'
          ? { id: 'alice-id', name: 'Alice' }
          : null
    );

    assert.deepInclude(result, {
      authorId: 'alice-id',
      authorName: 'Alice',
    });
  });

  it('replaces mention placeholders with resolved contact names', () => {
    const result = toAutomationMessage(
      {
        id: 'message-with-mentions',
        conversationId: 'group-1',
        type: 'outgoing',
        sent_at: 250,
        body: 'Call \uFFFC / \uFFFC',
        bodyRanges: [
          {
            start: 5,
            length: 1,
            mentionAci: 'lukas-aci' as AciString,
          },
          {
            start: 9,
            length: 1,
            mentionAci: 'tomas-aci' as AciString,
          },
        ],
        attachments: [],
        reactions: [],
      },
      () => null,
      sourceServiceId => {
        if (sourceServiceId === 'lukas-aci') {
          return { id: 'lukas-id', name: 'Lukáš Kutík' };
        }
        if (sourceServiceId === 'tomas-aci') {
          return { id: 'tomas-id', name: 'Tomáš Lesný' };
        }
        return null;
      }
    );

    assert.equal(result.text, 'Call @Lukáš Kutík / @Tomáš Lesný');
  });

  it('returns deduplicated current poll results with resolved voters', () => {
    const result = toAutomationMessage(
      {
        id: 'poll-message-1',
        conversationId: 'group-1',
        type: 'outgoing',
        sent_at: 300,
        body: undefined,
        attachments: [],
        reactions: [],
        poll: {
          question: 'Kam na oběd?',
          options: ['Pizza', 'Sushi'],
          allowMultiple: true,
          votes: [
            {
              fromConversationId: 'alice-id',
              optionIndexes: [0],
              voteCount: 1,
              timestamp: 310,
            },
            {
              fromConversationId: 'alice-id',
              optionIndexes: [1],
              voteCount: 2,
              timestamp: 320,
            },
            {
              fromConversationId: 'bob-id',
              optionIndexes: [0, 1, 1],
              voteCount: 1,
              timestamp: 315,
            },
            {
              fromConversationId: 'carol-id',
              optionIndexes: [0],
              voteCount: 1,
              timestamp: 325,
              sendStateByConversationId: {},
            },
          ],
          terminatedAt: 350,
        },
      },
      () => null,
      () => ({ id: 'me-id', name: 'Me' }),
      voterId => {
        if (voterId === 'alice-id') {
          return { id: voterId, title: 'Alice', isMe: false };
        }
        if (voterId === 'bob-id') {
          return { id: voterId, title: 'Bob', isMe: true };
        }
        return null;
      }
    );

    assert.deepEqual(result.poll, {
      question: 'Kam na oběd?',
      allowMultiple: true,
      terminated: true,
      terminatedAt: 350,
      totalVotes: 3,
      uniqueVoters: 2,
      options: [
        {
          index: 0,
          text: 'Pizza',
          voteCount: 1,
          percentage: 50,
          voters: [{ id: 'bob-id', title: 'Bob', isMe: true }],
        },
        {
          index: 1,
          text: 'Sushi',
          voteCount: 2,
          percentage: 100,
          voters: [
            { id: 'alice-id', title: 'Alice', isMe: false },
            { id: 'bob-id', title: 'Bob', isMe: true },
          ],
        },
      ],
    });
  });

  it('returns no older context when before is zero', () => {
    const result = selectAutomationMessageContext(
      [message('older-1'), message('older-2')],
      [message('newer-1'), message('newer-2')],
      0,
      1
    );

    assert.deepEqual(result.before, []);
    assert.deepEqual(
      result.after.map(item => item.id),
      ['newer-1']
    );
  });
});
