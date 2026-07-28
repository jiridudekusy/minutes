// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';

import {
  planMessageReactionChange,
  toAutomationReactions,
} from '../../minutes/automation/messageReactionAutomation.std.ts';

describe('message reaction automation', () => {
  it('returns only each author latest active reaction with resolved names', () => {
    const reactions = toAutomationReactions(
      [
        {
          emoji: '👍',
          fromId: 'alice-id',
          targetTimestamp: 1,
          timestamp: 10,
        },
        {
          emoji: '❤️',
          fromId: 'unknown-id',
          targetTimestamp: 1,
          timestamp: 20,
        },
        {
          emoji: undefined,
          fromId: 'alice-id',
          targetTimestamp: 1,
          timestamp: 30,
        },
      ],
      authorId => (authorId === 'alice-id' ? 'Alice' : null)
    );

    assert.deepEqual(reactions, [
      {
        emoji: '❤️',
        authorId: 'unknown-id',
        authorName: null,
        timestamp: 20,
      },
    ]);
  });

  it('does nothing when the requested reaction already matches', () => {
    assert.deepEqual(
      planMessageReactionChange({
        reactions: [
          {
            emoji: '👍',
            fromId: 'our-id',
            targetTimestamp: 1,
            timestamp: 10,
          },
        ],
        ourConversationId: 'our-id',
        requestedEmoji: '👍',
      }),
      { changed: false }
    );
  });

  it('plans adding, replacing, and removing the local reaction', () => {
    const reactions = [
      {
        emoji: '👍',
        fromId: 'our-id',
        targetTimestamp: 1,
        timestamp: 10,
      },
    ];

    assert.deepEqual(
      planMessageReactionChange({
        reactions: [],
        ourConversationId: 'our-id',
        requestedEmoji: '❤️',
      }),
      { changed: true, emoji: '❤️', remove: false }
    );
    assert.deepEqual(
      planMessageReactionChange({
        reactions,
        ourConversationId: 'our-id',
        requestedEmoji: '😂',
      }),
      { changed: true, emoji: '😂', remove: false }
    );
    assert.deepEqual(
      planMessageReactionChange({
        reactions,
        ourConversationId: 'our-id',
        requestedEmoji: null,
      }),
      { changed: true, emoji: '👍', remove: true }
    );
  });

  it('does nothing when removing an absent or already pending removal', () => {
    for (const reactions of [
      [],
      [
        {
          emoji: undefined,
          fromId: 'our-id',
          targetTimestamp: 1,
          timestamp: 20,
        },
      ],
    ]) {
      assert.deepEqual(
        planMessageReactionChange({
          reactions,
          ourConversationId: 'our-id',
          requestedEmoji: null,
        }),
        { changed: false }
      );
    }
  });

  it('rejects a string that is not one supported emoji', () => {
    const error = assert.throws(
      () =>
        planMessageReactionChange({
          reactions: [],
          ourConversationId: 'our-id',
          requestedEmoji: 'thumbs up',
        }),
      'emoji must be one supported emoji or null'
    );
    assert.propertyVal(error, 'code', 'INVALID_ARGUMENT');
  });
});
