// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { randomUUID } from 'node:crypto';

import type {
  AutomationRendererMethod,
  AutomationRendererRequest,
  AutomationRendererResponse,
} from './automationContracts.std.ts';

export type { AutomationRendererResponse } from './automationContracts.std.ts';

type PendingRequest = Readonly<{
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}>;

/* eslint-disable max-classes-per-file */
class AutomationRendererError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export class AutomationRendererBridge {
  readonly #send: (request: AutomationRendererRequest) => void;
  readonly #idFactory: () => string;
  readonly #timeoutMs: number;
  readonly #pending = new Map<string, PendingRequest>();

  constructor(
    options: Readonly<{
      send: (request: AutomationRendererRequest) => void;
      idFactory?: () => string;
      timeoutMs?: number;
    }>
  ) {
    this.#send = options.send;
    this.#idFactory = options.idFactory ?? randomUUID;
    this.#timeoutMs = options.timeoutMs ?? 15_000;
  }

  request(method: AutomationRendererMethod, params: unknown): Promise<unknown> {
    const id = this.#idFactory();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.#pending.delete(id);
        const isMessageSend = method === 'sendMessage';
        reject(
          new AutomationRendererError(
            isMessageSend ? 'QUEUE_STATUS_UNKNOWN' : 'TIMEOUT',
            isMessageSend
              ? 'Renderer did not confirm whether the message was queued; retry only with the same idempotencyKey'
              : 'Renderer request timed out'
          )
        );
      }, this.#timeoutMs);
      this.#pending.set(id, { resolve, reject, timeout });
      try {
        this.#send({ id, method, params });
      } catch (error) {
        clearTimeout(timeout);
        this.#pending.delete(id);
        reject(
          new AutomationRendererError(
            'RENDERER_UNAVAILABLE',
            error instanceof Error ? error.message : 'Renderer unavailable'
          )
        );
      }
    });
  }

  handleResponse(response: AutomationRendererResponse): boolean {
    if (
      response == null ||
      typeof response !== 'object' ||
      !('id' in response) ||
      typeof response.id !== 'string' ||
      !('ok' in response) ||
      typeof response.ok !== 'boolean'
    ) {
      return false;
    }
    const pending = this.#pending.get(response.id);
    if (pending == null) {
      return false;
    }
    clearTimeout(pending.timeout);
    this.#pending.delete(response.id);
    if (response.ok) {
      pending.resolve(response.result);
    } else {
      pending.reject(
        new AutomationRendererError(response.error.code, response.error.message)
      );
    }
    return true;
  }

  rendererUnavailable(): void {
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(
        new AutomationRendererError(
          'RENDERER_UNAVAILABLE',
          'Renderer unavailable'
        )
      );
    }
    this.#pending.clear();
  }
}
