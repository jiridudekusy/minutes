// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { ipcRenderer } from 'electron';

import type { MessageModel } from '../../models/messages.preload.ts';
import type { AutomationEvent } from './events.std.ts';

export function emitRendererAutomationEvent(event: AutomationEvent): void {
  ipcRenderer.send('minutes:automation-event', event);
}

export function emitAutomationMessageEvent(message: MessageModel): void {
  const attributes = message.attributes;
  if (attributes.type !== 'incoming' && attributes.type !== 'outgoing') {
    return;
  }
  emitRendererAutomationEvent({
    id: globalThis.crypto.randomUUID(),
    type: attributes.type === 'incoming' ? 'message.received' : 'message.sent',
    occurredAt: new Date().toISOString(),
    data: {
      messageId: attributes.id,
      conversationId: attributes.conversationId,
      text: attributes.body ?? null,
      attachments: (attributes.attachments ?? []).map((attachment, index) => ({
        id:
          attachment.clientUuid ??
          attachment.digest ??
          attachment.cdnKey ??
          `${attributes.id}:${index}`,
        contentType: attachment.contentType,
        fileName: attachment.fileName,
        size: attachment.size,
      })),
    },
  });
}
