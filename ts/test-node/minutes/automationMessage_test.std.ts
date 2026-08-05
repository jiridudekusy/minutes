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
