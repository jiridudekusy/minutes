// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { createHmac } from 'node:crypto';

import { assert } from 'chai';

import {
  buildWebhookBody,
  type AutomationEvent,
} from '../../minutes/automation/events.std.ts';
import {
  WebhookDispatcher,
  createWebhookSignature,
} from '../../minutes/automation/webhookDispatcher.node.ts';
import { WebhookOutbox } from '../../minutes/automation/webhookOutbox.std.ts';

describe('Minutes automation webhooks', () => {
  it('includes message text but keeps transcript completion metadata-only', () => {
    const message: AutomationEvent = {
      id: 'event-message',
      type: 'message.received',
      occurredAt: '2026-07-25T10:00:00.000Z',
      data: {
        messageId: 'message-1',
        conversationId: 'conversation-1',
        text: 'Hello from Signal',
        attachments: [{ id: 'attachment-1', contentType: 'image/png' }],
      },
    };
    const transcript: AutomationEvent = {
      id: 'event-transcript',
      type: 'transcript.completed',
      occurredAt: '2026-07-25T10:01:00.000Z',
      data: {
        recordingId: 'recording-1',
        transcriptId: 'transcript-1',
      },
    };

    assert.strictEqual(
      JSON.parse(buildWebhookBody(message)).data.text,
      'Hello from Signal'
    );
    const transcriptPayload = JSON.parse(buildWebhookBody(transcript)) as {
      data: Record<string, unknown>;
    };
    assert.deepEqual(transcriptPayload.data, {
      recordingId: 'recording-1',
      transcriptId: 'transcript-1',
    });
    assert.notProperty(transcriptPayload.data, 'text');
  });

  it('signs the exact request body with HMAC-SHA-256', () => {
    const body = '{"id":"delivery-1"}';
    const expected = createHmac('sha256', 'secret')
      .update(body, 'utf8')
      .digest('hex');

    assert.strictEqual(
      createWebhookSignature('secret', body),
      `sha256=${expected}`
    );
  });

  it('retries with one stable delivery ID and removes successful deliveries', async () => {
    let now = 1_000;
    const persisted: Array<ReadonlyArray<unknown>> = [];
    const outbox = new WebhookOutbox({
      initialEntries: [],
      persist: async entries => {
        persisted.push(entries);
      },
      maxEntries: 100,
    });
    const requests: Array<{
      deliveryId: string | null;
      signature: string | null;
    }> = [];
    let responseStatus = 500;
    const dispatcher = new WebhookDispatcher({
      outbox,
      now: () => now,
      idFactory: () => 'delivery-1',
      getEndpoints: async () => [
        {
          id: 'endpoint-1',
          enabled: true,
          url: 'https://hooks.example.test/minutes',
          secret: 'webhook-secret',
          eventTypes: ['message.received'],
        },
      ],
      fetch: async (_url, init) => {
        const headers = new Headers(init?.headers);
        requests.push({
          deliveryId: headers.get('x-minutes-delivery'),
          signature: headers.get('x-minutes-signature'),
        });
        return new Response(responseStatus === 204 ? null : '', {
          status: responseStatus,
        });
      },
    });
    const event: AutomationEvent = {
      id: 'event-1',
      type: 'message.received',
      occurredAt: '2026-07-25T10:00:00.000Z',
      data: {
        messageId: 'message-1',
        conversationId: 'conversation-1',
        text: 'Hello',
        attachments: [],
      },
    };

    await dispatcher.enqueue(event);
    await dispatcher.flushDue();

    assert.lengthOf(outbox.list(), 1);
    assert.deepInclude(outbox.list()[0], {
      id: 'delivery-1',
      endpointId: 'endpoint-1',
      attempts: 1,
      nextAttemptAt: 61_000,
    });
    const firstRequest = requests[0];
    if (firstRequest == null) {
      throw new Error('Expected webhook request');
    }
    assert.strictEqual(firstRequest.deliveryId, 'delivery-1');
    assert.match(firstRequest.signature ?? '', /^sha256=[a-f0-9]{64}$/);

    now = 61_000;
    responseStatus = 204;
    await dispatcher.flushDue();

    assert.deepEqual(outbox.list(), []);
    assert.deepEqual(
      requests.map(request => request.deliveryId),
      ['delivery-1', 'delivery-1']
    );
    assert.isAtLeast(persisted.length, 3);
  });

  it('ignores disabled and unsubscribed webhook endpoints', async () => {
    const outbox = new WebhookOutbox({
      initialEntries: [],
      persist: async () => undefined,
      maxEntries: 100,
    });
    const dispatcher = new WebhookDispatcher({
      outbox,
      getEndpoints: async () => [
        {
          id: 'disabled',
          enabled: false,
          url: 'https://disabled.example.test',
          secret: 'secret',
          eventTypes: ['call.started'],
        },
        {
          id: 'other-event',
          enabled: true,
          url: 'https://other.example.test',
          secret: 'secret',
          eventTypes: ['call.ended'],
        },
      ],
    });

    await dispatcher.enqueue({
      id: 'event-1',
      type: 'call.started',
      occurredAt: '2026-07-25T10:00:00.000Z',
      data: { callId: 'call-1', conversationId: 'conversation-1' },
    });

    assert.deepEqual(outbox.list(), []);
  });
});
