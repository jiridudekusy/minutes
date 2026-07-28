// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

export type AutomationEventType =
  | 'call.started'
  | 'call.ended'
  | 'recording.started'
  | 'recording.completed'
  | 'recording.failed'
  | 'transcript.completed'
  | 'summary.completed'
  | 'message.received'
  | 'message.sent';

export type AutomationAttachment = Readonly<{
  id: string;
  contentType?: string;
  fileName?: string;
  size?: number;
}>;

type EventBase<TType extends AutomationEventType, TData> = Readonly<{
  id: string;
  type: TType;
  occurredAt: string;
  data: Readonly<TData>;
}>;

export type AutomationEvent =
  | EventBase<
      'call.started',
      { callId: string; conversationId: string; callMode?: string }
    >
  | EventBase<
      'call.ended',
      {
        callId: string;
        conversationId: string;
        callMode?: string;
        reason?: string;
      }
    >
  | EventBase<
      'recording.started',
      {
        recordingId: string;
        conversationId: string;
        mediaKind: 'audio' | 'screen-share-video';
      }
    >
  | EventBase<
      'recording.completed',
      {
        recordingId: string;
        conversationId: string;
        mediaKind: 'audio' | 'screen-share-video';
      }
    >
  | EventBase<
      'recording.failed',
      {
        recordingId?: string;
        conversationId: string;
        mediaKind: 'audio' | 'screen-share-video';
        error: string;
      }
    >
  | EventBase<
      'transcript.completed',
      { recordingId: string; transcriptId: string }
    >
  | EventBase<'summary.completed', { recordingId: string; summaryId: string }>
  | EventBase<
      'message.received' | 'message.sent',
      {
        messageId: string;
        conversationId: string;
        text: string | null;
        attachments: ReadonlyArray<AutomationAttachment>;
      }
    >;

export function buildWebhookBody(event: AutomationEvent): string {
  return JSON.stringify({
    id: event.id,
    type: event.type,
    occurredAt: event.occurredAt,
    data: event.data,
  });
}

export type AutomationEventListener = (
  event: AutomationEvent
) => void | Promise<void>;

export class AutomationEventBus {
  readonly #listeners = new Set<AutomationEventListener>();

  subscribe(listener: AutomationEventListener): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  async emit(event: AutomationEvent): Promise<void> {
    await Promise.allSettled(
      [...this.#listeners].map(listener => Promise.resolve(listener(event)))
    );
  }
}
