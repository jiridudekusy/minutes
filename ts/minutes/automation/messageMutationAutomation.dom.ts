// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only
import type { ReadonlyMessageAttributesType } from '../../model-types.d.ts';
import type { DraftBodyRanges } from '../../types/BodyRange.std.ts';
import type { LinkPreviewType } from '../../types/message/LinkPreviews.std.ts';
import type { AciString } from '../../types/ServiceId.std.ts';
import {
  canEditMessage,
  isWithinMaxEdits,
} from '../../util/canEditMessage.dom.ts';

function fail(code: string, message: string): never {
  throw Object.assign(new Error(message), { code });
}

function requireTarget(
  message: ReadonlyMessageAttributesType | undefined,
  conversationId: string
): ReadonlyMessageAttributesType {
  if (message == null) {
    return fail('NOT_FOUND', 'Message not found');
  }
  if (message.conversationId !== conversationId) {
    return fail(
      'INVALID_ARGUMENT',
      'Message does not belong to conversationId'
    );
  }
  if (
    (message.type !== 'outgoing' && message.type !== 'incoming') ||
    message.storyId != null
  ) {
    return fail('INVALID_ARGUMENT', 'Only chat messages are supported');
  }
  return message;
}

export type AutomationEditPayload = Readonly<{
  body: string;
  bodyRanges?: DraftBodyRanges;
  preview: Array<LinkPreviewType>;
  targetMessageId: string;
  quoteSentAt?: number;
  quoteAuthorAci?: AciString;
}>;

export async function editAutomationMessage(
  target: ReadonlyMessageAttributesType | undefined,
  params: { conversationId: string; text: unknown; mentions?: unknown },
  dependencies: Readonly<{
    prepareText: (
      text: string,
      mentions: unknown
    ) => Readonly<{
      body: string | undefined;
      bodyRanges: DraftBodyRanges | undefined;
    }>;
    sendEdit: (payload: AutomationEditPayload) => Promise<void>;
  }>
): Promise<
  Readonly<{ queued: true; messageId: string; conversationId: string }>
> {
  const message = requireTarget(target, params.conversationId);
  const { text } = params;
  if (
    typeof text !== 'string' ||
    text.trim().length === 0 ||
    text.length > 65_536
  ) {
    return fail(
      'INVALID_ARGUMENT',
      'text must contain between 1 and 65536 UTF-16 units'
    );
  }
  if (!canEditMessage(message) || !isWithinMaxEdits(message)) {
    return fail(
      'INVALID_STATE',
      'Signal does not allow editing this message (author, age, message type or edit limit)'
    );
  }
  const prepared = dependencies.prepareText(text, params.mentions);
  if (
    message.quote != null &&
    (message.quote.id == null || message.quote.authorAci == null)
  ) {
    return fail(
      'INVALID_STATE',
      'Cannot preserve a quote without its timestamp and author identity'
    );
  }
  if (prepared.body == null) {
    return fail('INVALID_ARGUMENT', 'Missing edit text');
  }
  await dependencies.sendEdit({
    body: prepared.body,
    bodyRanges: prepared.bodyRanges,
    preview: (message.preview ?? []).filter(preview =>
      text.includes(preview.url)
    ),
    targetMessageId: message.id,
    quoteSentAt: message.quote?.id ?? undefined,
    quoteAuthorAci: message.quote?.authorAci,
  });
  return {
    queued: true,
    messageId: message.id,
    conversationId: message.conversationId,
  };
}

export async function deleteAutomationMessage(
  target: ReadonlyMessageAttributesType | undefined,
  params: { conversationId: string; scope: unknown },
  dependencies: Readonly<{
    canDeleteForEveryone: (
      message: ReadonlyMessageAttributesType
    ) => Readonly<{ ok: true }> | Readonly<{ ok: false; reason: string }>;
    deleteForMe: (message: ReadonlyMessageAttributesType) => Promise<void>;
    deleteForEveryone: (
      message: ReadonlyMessageAttributesType
    ) => Promise<void>;
  }>
): Promise<Readonly<Record<string, unknown>>> {
  const message = requireTarget(target, params.conversationId);
  const { scope } = params;
  if (scope !== 'for_me' && scope !== 'for_everyone') {
    return fail('INVALID_ARGUMENT', 'scope must be for_me or for_everyone');
  }
  const result = {
    scope,
    messageId: message.id,
    conversationId: message.conversationId,
  };
  if (scope === 'for_me') {
    await dependencies.deleteForMe(message);
    return { deleted: true, ...result };
  }
  if (message.deletedForEveryone) {
    if (message.deletedForEveryoneFailed) {
      return fail(
        'INVALID_STATE',
        'A previous delete-for-everyone failed; inspect its state before retrying'
      );
    }
    return { queued: false, alreadyDeleted: true, ...result };
  }
  const permission = dependencies.canDeleteForEveryone(message);
  if (!permission.ok) {
    return fail(
      'PERMISSION_DENIED',
      `Signal does not allow delete-for-everyone: ${permission.reason}`
    );
  }
  await dependencies.deleteForEveryone(message);
  return { queued: true, ...result };
}
