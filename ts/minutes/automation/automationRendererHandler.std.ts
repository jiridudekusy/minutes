// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import type {
  AutomationRendererMethod,
  AutomationRendererRequest,
  AutomationRendererResponse,
} from './automationContracts.std.ts';

type Capability = (
  params: Readonly<Record<string, unknown>>
) => Promise<unknown>;

export type AutomationRendererCapabilities = Readonly<
  Record<AutomationRendererMethod, Capability>
>;

const inFlightRequests = new Map<string, Promise<AutomationRendererResponse>>();
const IDEMPOTENCY_TTL_MS = 5 * 60_000;
const IDEMPOTENCY_CACHE_LIMIT = 1_000;
const idempotentSendRequests = new Map<
  string,
  Readonly<{
    signature: string;
    expiresAt: number;
    pending: Promise<AutomationRendererResponse>;
  }>
>();

function responseWithId(
  response: AutomationRendererResponse,
  id: string
): AutomationRendererResponse {
  return response.ok
    ? { id, ok: true, result: response.result }
    : { id, ok: false, error: response.error };
}

function errorResponse(
  id: string,
  code: string,
  message: string
): AutomationRendererResponse {
  return { id, ok: false, error: { code, message } };
}

function errorCode(error: unknown): string {
  if (
    error != null &&
    typeof error === 'object' &&
    'code' in error &&
    typeof error.code === 'string'
  ) {
    return error.code;
  }
  return 'INTERNAL_ERROR';
}

export class AutomationRendererHandler {
  readonly #capabilities: AutomationRendererCapabilities;

  constructor(capabilities: AutomationRendererCapabilities) {
    this.#capabilities = capabilities;
  }

  async handle(
    request: AutomationRendererRequest
  ): Promise<AutomationRendererResponse> {
    const existing = inFlightRequests.get(request.id);
    if (existing != null) {
      return existing;
    }

    const pending = this.#handleIdempotentSend(request);
    inFlightRequests.set(request.id, pending);
    try {
      return await pending;
    } finally {
      if (inFlightRequests.get(request.id) === pending) {
        inFlightRequests.delete(request.id);
      }
    }
  }

  async #handleIdempotentSend(
    request: AutomationRendererRequest
  ): Promise<AutomationRendererResponse> {
    if (
      request.method !== 'sendMessage' ||
      request.params == null ||
      typeof request.params !== 'object' ||
      Array.isArray(request.params) ||
      !('idempotencyKey' in request.params)
    ) {
      return this.#handle(request);
    }
    const { idempotencyKey } = request.params;
    if (
      typeof idempotencyKey !== 'string' ||
      idempotencyKey.length === 0 ||
      idempotencyKey.length > 256
    ) {
      return errorResponse(
        request.id,
        'INVALID_ARGUMENT',
        'idempotencyKey must contain between 1 and 256 characters'
      );
    }

    const now = Date.now();
    for (const [key, entry] of idempotentSendRequests) {
      if (entry.expiresAt <= now) {
        idempotentSendRequests.delete(key);
      }
    }
    const signature = JSON.stringify({
      conversationId: Reflect.get(request.params, 'conversationId'),
      text: Reflect.get(request.params, 'text'),
      attachments: Reflect.get(request.params, 'attachments'),
    });
    const existing = idempotentSendRequests.get(idempotencyKey);
    if (existing != null) {
      if (existing.signature !== signature) {
        return errorResponse(
          request.id,
          'IDEMPOTENCY_CONFLICT',
          'idempotencyKey was already used for different message content'
        );
      }
      return responseWithId(await existing.pending, request.id);
    }

    while (idempotentSendRequests.size >= IDEMPOTENCY_CACHE_LIMIT) {
      const oldestKey = idempotentSendRequests.keys().next().value;
      if (oldestKey == null) {
        break;
      }
      idempotentSendRequests.delete(oldestKey);
    }
    const pending = this.#handle(request);
    idempotentSendRequests.set(idempotencyKey, {
      signature,
      expiresAt: now + IDEMPOTENCY_TTL_MS,
      pending,
    });
    const response = await pending;
    if (!response.ok) {
      const cached = idempotentSendRequests.get(idempotencyKey);
      if (cached?.pending === pending) {
        idempotentSendRequests.delete(idempotencyKey);
      }
    }
    return response;
  }

  async #handle(
    request: AutomationRendererRequest
  ): Promise<AutomationRendererResponse> {
    try {
      if (
        request.params == null ||
        typeof request.params !== 'object' ||
        Array.isArray(request.params)
      ) {
        const error = new Error('Renderer request params must be an object');
        Object.assign(error, { code: 'INVALID_ARGUMENT' });
        throw error;
      }
      const capability = this.#capabilities[request.method];
      if (capability == null) {
        const error = new Error('Unsupported renderer capability');
        Object.assign(error, { code: 'NOT_FOUND' });
        throw error;
      }
      const result = await capability(
        request.params as Readonly<Record<string, unknown>>
      );
      return { id: request.id, ok: true, result };
    } catch (error) {
      return {
        id: request.id,
        ok: false,
        error: {
          code: errorCode(error),
          message: error instanceof Error ? error.message : 'Renderer error',
        },
      };
    }
  }
}
