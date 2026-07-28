// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import type { MessageType } from '../../sql/Interface.std.ts';
import type { AutomationMessage } from './automationContracts.std.ts';
import { toAutomationReactions } from './messageReactionAutomation.std.ts';

type AutomationMessageSource = Pick<
  MessageType,
  | 'id'
  | 'conversationId'
  | 'type'
  | 'sent_at'
  | 'received_at_ms'
  | 'body'
  | 'attachments'
  | 'reactions'
>;

type MessageAttachment = NonNullable<
  AutomationMessageSource['attachments']
>[number];

function attachmentId(
  messageId: string,
  attachment: MessageAttachment,
  index: number
): string {
  return (
    attachment.clientUuid ??
    attachment.digest ??
    attachment.cdnKey ??
    `${messageId}:${index}`
  );
}

export function toAutomationMessage(
  message: AutomationMessageSource,
  resolveReactionAuthorName: (authorId: string) => string | null
): AutomationMessage {
  return {
    id: message.id,
    conversationId: message.conversationId,
    source: message.type === 'incoming' ? 'incoming' : 'outgoing',
    sentAt: message.sent_at,
    receivedAt: message.received_at_ms,
    text: message.body ?? null,
    attachments: (message.attachments ?? []).map((attachment, index) => ({
      id: attachmentId(message.id, attachment, index),
      contentType: attachment.contentType,
      fileName: attachment.fileName,
      size: attachment.size,
    })),
    reactions: toAutomationReactions(
      message.reactions ?? [],
      resolveReactionAuthorName
    ),
  };
}
