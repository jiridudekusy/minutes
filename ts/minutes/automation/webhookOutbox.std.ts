// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import type { AutomationEventType } from './events.std.ts';

export type WebhookDelivery = Readonly<{
  id: string;
  endpointId: string;
  eventType: AutomationEventType;
  body: string;
  createdAt: number;
  attempts: number;
  nextAttemptAt: number;
  lastError?: string;
}>;

type PersistWebhookOutbox = (
  entries: ReadonlyArray<WebhookDelivery>
) => Promise<void>;

export class WebhookOutbox {
  readonly #persist: PersistWebhookOutbox;
  readonly #maxEntries: number;
  #entries: Array<WebhookDelivery>;
  #batchDepth = 0;
  #dirty = false;

  constructor(
    options: Readonly<{
      initialEntries: ReadonlyArray<WebhookDelivery>;
      persist: PersistWebhookOutbox;
      maxEntries: number;
    }>
  ) {
    this.#entries = [...options.initialEntries];
    this.#persist = options.persist;
    this.#maxEntries = options.maxEntries;
  }

  list(): ReadonlyArray<WebhookDelivery> {
    return this.#entries.map(entry => ({ ...entry }));
  }

  due(now: number): ReadonlyArray<WebhookDelivery> {
    return this.list().filter(entry => entry.nextAttemptAt <= now);
  }

  async add(entry: WebhookDelivery): Promise<void> {
    this.#entries.push({ ...entry });
    if (this.#entries.length > this.#maxEntries) {
      this.#entries.splice(0, this.#entries.length - this.#maxEntries);
    }
    await this.#save();
  }

  async update(entry: WebhookDelivery): Promise<void> {
    const index = this.#entries.findIndex(item => item.id === entry.id);
    if (index < 0) {
      return;
    }
    this.#entries[index] = { ...entry };
    await this.#save();
  }

  async remove(id: string): Promise<void> {
    const next = this.#entries.filter(entry => entry.id !== id);
    if (next.length === this.#entries.length) {
      return;
    }
    this.#entries = next;
    await this.#save();
  }

  async batch<T>(operation: () => Promise<T>): Promise<T> {
    this.#batchDepth += 1;
    try {
      return await operation();
    } finally {
      this.#batchDepth -= 1;
      if (this.#batchDepth === 0 && this.#dirty) {
        this.#dirty = false;
        await this.#persist(this.list());
      }
    }
  }

  async #save(): Promise<void> {
    if (this.#batchDepth > 0) {
      this.#dirty = true;
      return;
    }
    await this.#persist(this.list());
  }
}
