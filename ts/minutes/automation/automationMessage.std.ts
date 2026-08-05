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
  | 'sourceServiceId'
  | 'sent_at'
  | 'received_at_ms'
  | 'body'
  | 'attachments'
  | 'reactions'
>;

type MessageAttachment = NonNullable<
  AutomationMessageSource['attachments']
>[number];

export function getAutomationAttachmentId(
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
  resolveReactionAuthorName: (authorId: string) => string | null,
  resolveMessageAuthor: (
    sourceServiceId: string | undefined,
    source: 'incoming' | 'outgoing'
  ) => Readonly<{ id: string; name: string }> | null = () => null
): AutomationMessage {
  const source = message.type === 'incoming' ? 'incoming' : 'outgoing';
  const author = resolveMessageAuthor(message.sourceServiceId, source);
  return {
    id: message.id,
    conversationId: message.conversationId,
    source,
    authorId: author?.id ?? null,
    authorName: author?.name ?? null,
    sentAt: message.sent_at,
    receivedAt: message.received_at_ms,
    text: message.body ?? null,
    attachments: (message.attachments ?? []).map((attachment, index) => ({
      id: getAutomationAttachmentId(message.id, attachment, index),
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

export function selectAutomationMessageContext(
  older: ReadonlyArray<AutomationMessage>,
  newer: ReadonlyArray<AutomationMessage>,
  before: number,
  after: number
): Readonly<{
  before: ReadonlyArray<AutomationMessage>;
  after: ReadonlyArray<AutomationMessage>;
}> {
  return {
    before: before === 0 ? [] : older.slice(-before),
    after: newer.slice(0, after),
  };
}
