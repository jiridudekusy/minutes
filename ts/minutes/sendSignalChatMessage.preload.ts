// Copyright 2026 minutes contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { createLogger } from '../logging/log.std.ts';
import { ToastType } from '../types/Toast.dom.tsx';
import * as Errors from '../types/errors.std.ts';
import type { AttachmentType } from '../types/Attachment.std.ts';
import { formatMarkdownForSignalMessage } from './signalChatText.std.ts';

const log = createLogger('minutes/sendSignalChat');

const MAX_MESSAGE_BODY_LENGTH = 64 * 1024;

export async function sendSignalChatMessage(
  conversationId: string,
  text: string | undefined,
  logLabel: string,
  attachments: Array<AttachmentType> = []
): Promise<boolean> {
  const conversation = window.ConversationController.get(conversationId);
  if (!conversation) {
    log.warn(`${logLabel}: conversation not found (${conversationId})`);
    window.reduxActions.toast.showToast({
      toastType: ToastType.InvalidConversation,
    });
    return false;
  }

  const formatted =
    text == null
      ? { body: undefined, bodyRanges: undefined }
      : formatMarkdownForSignalMessage(text);
  if (!formatted.body && attachments.length === 0) {
    window.reduxActions.toast.showToast({ toastType: ToastType.Error });
    return false;
  }

  if (
    formatted.body != null &&
    formatted.body.length > MAX_MESSAGE_BODY_LENGTH
  ) {
    window.reduxActions.toast.showToast({
      toastType: ToastType.MessageBodyTooLong,
    });
    return false;
  }

  try {
    await conversation.enqueueMessageForSend(
      {
        body: formatted.body,
        attachments,
        bodyRanges: formatted.bodyRanges,
      },
      {
        dontClearDraft: true,
      }
    );
    log.info(`${logLabel}: queued message for ${conversationId}`);
    return true;
  } catch (error) {
    log.error(`${logLabel} failed: ${Errors.toLogFormat(error)}`);
    window.reduxActions.toast.showToast({ toastType: ToastType.Error });
    return false;
  }
}

export function truncateSignalChatMessage(
  header: string,
  body: string,
  suffix = '\n\n… (text pokračuje v uloženém souboru)'
): string {
  const maxBodyLength = MAX_MESSAGE_BODY_LENGTH - header.length - suffix.length - 80;
  if (body.length <= maxBodyLength) {
    return `${header}${body}`;
  }
  return `${header}${body.slice(0, maxBodyLength)}${suffix}`;
}
