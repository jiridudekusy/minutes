// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { createHmac, randomUUID } from 'node:crypto';

import {
  buildWebhookBody,
  type AutomationEvent,
  type AutomationEventType,
} from './events.std.ts';
import type { WebhookDelivery, WebhookOutbox } from './webhookOutbox.std.ts';

export type AutomationWebhookEndpoint = Readonly<{
  id: string;
  enabled: boolean;
  url: string;
  secret: string;
  eventTypes: ReadonlyArray<AutomationEventType>;
}>;

const RETRY_DELAYS_MS = [
  60_000,
  5 * 60_000,
  30 * 60_000,
  2 * 60 * 60_000,
  12 * 60 * 60_000,
] as const;

export function createWebhookSignature(secret: string, body: string): string {
  const digest = createHmac('sha256', secret)
    .update(body, 'utf8')
    .digest('hex');
  return `sha256=${digest}`;
}

export class WebhookDispatcher {
  readonly #outbox: WebhookOutbox;
  readonly #getEndpoints: () => Promise<
    ReadonlyArray<AutomationWebhookEndpoint>
  >;
  readonly #fetch: typeof fetch;
  readonly #now: () => number;
  readonly #idFactory: () => string;
  #flushPromise: Promise<void> | undefined;

  constructor(
    options: Readonly<{
      outbox: WebhookOutbox;
      getEndpoints: () => Promise<ReadonlyArray<AutomationWebhookEndpoint>>;
      fetch?: typeof fetch;
      now?: () => number;
      idFactory?: () => string;
    }>
  ) {
    this.#outbox = options.outbox;
    this.#getEndpoints = options.getEndpoints;
    this.#fetch = options.fetch ?? fetch;
    this.#now = options.now ?? Date.now;
    this.#idFactory = options.idFactory ?? randomUUID;
  }

  async enqueue(event: AutomationEvent): Promise<void> {
    const endpoints = await this.#getEndpoints();
    for (const endpoint of endpoints) {
      if (!endpoint.enabled || !endpoint.eventTypes.includes(event.type)) {
        continue;
      }
      const id = this.#idFactory();
      // Persistence is intentionally serialized to keep outbox writes ordered.
      // eslint-disable-next-line no-await-in-loop
      await this.#outbox.add({
        id,
        endpointId: endpoint.id,
        eventType: event.type,
        body: buildWebhookBody({ ...event, id } as AutomationEvent),
        createdAt: this.#now(),
        attempts: 0,
        nextAttemptAt: this.#now(),
      });
    }
  }

  flushDue(): Promise<void> {
    if (this.#flushPromise != null) {
      return this.#flushPromise;
    }
    const flushPromise = this.#flushDue().finally(() => {
      if (this.#flushPromise === flushPromise) {
        this.#flushPromise = undefined;
      }
    });
    this.#flushPromise = flushPromise;
    return flushPromise;
  }

  async #flushDue(): Promise<void> {
    const endpoints = new Map(
      (await this.#getEndpoints()).map(endpoint => [endpoint.id, endpoint])
    );
    const now = this.#now();
    for (const delivery of this.#outbox.due(now)) {
      const endpoint = endpoints.get(delivery.endpointId);
      if (
        endpoint == null ||
        !endpoint.enabled ||
        !endpoint.eventTypes.includes(delivery.eventType)
      ) {
        // eslint-disable-next-line no-await-in-loop
        await this.#outbox.remove(delivery.id);
        continue;
      }
      // eslint-disable-next-line no-await-in-loop
      await this.#deliver(delivery, endpoint, now);
    }
  }

  async #deliver(
    delivery: WebhookDelivery,
    endpoint: AutomationWebhookEndpoint,
    now: number
  ): Promise<void> {
    try {
      const response = await this.#fetch(endpoint.url, {
        method: 'POST',
        redirect: 'error',
        headers: {
          'content-type': 'application/json',
          'x-minutes-event': delivery.eventType,
          'x-minutes-delivery': delivery.id,
          'x-minutes-signature': createWebhookSignature(
            endpoint.secret,
            delivery.body
          ),
        },
        body: delivery.body,
        signal: AbortSignal.timeout(15_000),
      });
      if (response.status >= 200 && response.status < 300) {
        await this.#outbox.remove(delivery.id);
        return;
      }
      await this.#scheduleRetry(delivery, now, `HTTP ${response.status}`);
    } catch (error) {
      await this.#scheduleRetry(
        delivery,
        now,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  async #scheduleRetry(
    delivery: WebhookDelivery,
    now: number,
    lastError: string
  ): Promise<void> {
    const attempts = delivery.attempts + 1;
    const delay =
      RETRY_DELAYS_MS[Math.min(attempts - 1, RETRY_DELAYS_MS.length - 1)] ??
      12 * 60 * 60_000;
    await this.#outbox.update({
      ...delivery,
      attempts,
      nextAttemptAt: now + delay,
      lastError,
    });
  }
}
