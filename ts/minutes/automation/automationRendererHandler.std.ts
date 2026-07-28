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

    const pending = this.#handle(request);
    inFlightRequests.set(request.id, pending);
    try {
      return await pending;
    } finally {
      if (inFlightRequests.get(request.id) === pending) {
        inFlightRequests.delete(request.id);
      }
    }
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
