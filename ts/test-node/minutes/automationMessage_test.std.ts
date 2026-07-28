// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';

import { Emoji } from '../../axo/emoji.std.ts';
import { toAutomationMessage } from '../../minutes/automation/automationMessage.std.ts';

describe('automation message mapping', () => {
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
});
