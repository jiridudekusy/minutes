// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { randomBytes, randomUUID } from 'node:crypto';

import { generateAutomationToken, hashAutomationToken } from './auth.node.ts';
import {
  DEFAULT_AUTOMATION_PORT,
  type AutomationSettingsPublic,
  type AutomationWebhookEndpointPublic,
  type StoredAutomationSettings,
  type StoredAutomationWebhookEndpoint,
} from './automationSettings.std.ts';
import type { AutomationEventType } from './events.std.ts';
import type { AutomationWebhookEndpoint } from './webhookDispatcher.node.ts';
import {
  normalizeStoredAutomationToolNames,
  validateAutomationToolNames,
} from './toolCatalog.std.ts';

type AutomationSettingsDependencies = Readonly<{
  read: () => Promise<StoredAutomationSettings | undefined>;
  write: (value: StoredAutomationSettings) => Promise<void>;
  encrypt: (value: string) => string;
  decrypt: (value: string) => string;
  generateToken?: () => string;
  generateSecret?: () => string;
  idFactory?: () => string;
}>;

function normalizePort(value: unknown): number {
  return Number.isSafeInteger(value) &&
    Number(value) >= 1 &&
    Number(value) <= 65535
    ? Number(value)
    : DEFAULT_AUTOMATION_PORT;
}

function normalizeStored(
  value: StoredAutomationSettings | undefined
): StoredAutomationSettings {
  return {
    enabled: value?.enabled === true,
    webhooksEnabled: value?.webhooksEnabled === true,
    port: normalizePort(value?.port),
    encryptedTokenHash: value?.encryptedTokenHash,
    enabledTools: normalizeStoredAutomationToolNames(value?.enabledTools),
    endpoints: value?.endpoints ?? [],
  };
}

function validateWebhookUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Invalid webhook URL');
  }
  const hostname = url.hostname.toLowerCase();
  const isLoopback =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname === '::1';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopback)) {
    throw new Error('Webhook URL must use HTTPS or loopback HTTP');
  }
  if (url.username || url.password) {
    throw new Error('Webhook URL must not contain credentials');
  }
  return url.toString();
}

function toPublic(stored: StoredAutomationSettings): AutomationSettingsPublic {
  return {
    enabled: stored.enabled === true,
    webhooksEnabled: stored.webhooksEnabled === true,
    port: normalizePort(stored.port),
    hasToken: Boolean(stored.encryptedTokenHash),
    enabledTools: normalizeStoredAutomationToolNames(stored.enabledTools),
    endpoints: (stored.endpoints ?? []).map(endpoint => ({
      id: endpoint.id,
      enabled: endpoint.enabled,
      url: endpoint.url,
      eventTypes: [...endpoint.eventTypes],
      hasSecret: Boolean(endpoint.encryptedSecret),
      lastSuccessAt: endpoint.lastSuccessAt,
      lastError: endpoint.lastError,
    })),
  };
}

export class AutomationSettingsStore {
  readonly #deps: AutomationSettingsDependencies;

  constructor(dependencies: AutomationSettingsDependencies) {
    this.#deps = dependencies;
  }

  async getPublicSettings(): Promise<AutomationSettingsPublic> {
    return toPublic(normalizeStored(await this.#deps.read()));
  }

  async getTokenHash(): Promise<string | undefined> {
    const stored = normalizeStored(await this.#deps.read());
    if (!stored.encryptedTokenHash) {
      return undefined;
    }
    return this.#deps.decrypt(stored.encryptedTokenHash);
  }

  async saveServerSettings(
    input: Readonly<{
      enabled: boolean;
      port: number;
      enabledTools: ReadonlyArray<string>;
    }>
  ): Promise<AutomationSettingsPublic> {
    const current = normalizeStored(await this.#deps.read());
    const port = normalizePort(input.port);
    if (port !== input.port) {
      throw new Error('MCP port must be an integer between 1 and 65535');
    }
    const next = {
      ...current,
      enabled: input.enabled,
      port,
      enabledTools: validateAutomationToolNames(input.enabledTools),
    };
    await this.#deps.write(next);
    return toPublic(next);
  }

  async saveWebhookSettings(
    input: Readonly<{ enabled: boolean }>
  ): Promise<AutomationSettingsPublic> {
    const current = normalizeStored(await this.#deps.read());
    const next = { ...current, webhooksEnabled: input.enabled };
    await this.#deps.write(next);
    return toPublic(next);
  }

  async regenerateToken(): Promise<
    Readonly<{
      token: string;
      settings: AutomationSettingsPublic;
    }>
  > {
    const token = (this.#deps.generateToken ?? generateAutomationToken)();
    const current = normalizeStored(await this.#deps.read());
    const next = {
      ...current,
      encryptedTokenHash: this.#deps.encrypt(hashAutomationToken(token)),
    };
    await this.#deps.write(next);
    return { token, settings: toPublic(next) };
  }

  async upsertWebhook(
    input: Readonly<{
      id?: string;
      enabled: boolean;
      url: string;
      eventTypes: ReadonlyArray<AutomationEventType>;
      regenerateSecret?: boolean;
    }>
  ): Promise<
    Readonly<{
      endpoint: AutomationWebhookEndpointPublic;
      secret?: string;
    }>
  > {
    const current = normalizeStored(await this.#deps.read());
    const endpoints = [...(current.endpoints ?? [])];
    const index =
      input.id == null
        ? -1
        : endpoints.findIndex(endpoint => endpoint.id === input.id);
    const previous = index >= 0 ? endpoints[index] : undefined;
    const shouldGenerateSecret =
      previous == null || input.regenerateSecret === true;
    const secret = shouldGenerateSecret
      ? (
          this.#deps.generateSecret ??
          (() => randomBytes(32).toString('base64url'))
        )()
      : undefined;
    const endpoint: StoredAutomationWebhookEndpoint = {
      id: previous?.id ?? (this.#deps.idFactory ?? randomUUID)(),
      enabled: input.enabled,
      url: validateWebhookUrl(input.url),
      eventTypes: [...new Set(input.eventTypes)],
      encryptedSecret:
        secret == null
          ? (previous?.encryptedSecret ?? '')
          : this.#deps.encrypt(secret),
      lastSuccessAt: previous?.lastSuccessAt,
      lastError: previous?.lastError,
    };
    if (!endpoint.encryptedSecret) {
      throw new Error('Webhook secret is missing');
    }
    if (index >= 0) {
      endpoints[index] = endpoint;
    } else {
      endpoints.push(endpoint);
    }
    const next = { ...current, endpoints };
    await this.#deps.write(next);
    const publicEndpoint = toPublic(next).endpoints.find(
      item => item.id === endpoint.id
    );
    if (publicEndpoint == null) {
      throw new Error('Failed to save webhook endpoint');
    }
    return { endpoint: publicEndpoint, secret };
  }

  async removeWebhook(id: string): Promise<AutomationSettingsPublic> {
    const current = normalizeStored(await this.#deps.read());
    const next = {
      ...current,
      endpoints: (current.endpoints ?? []).filter(
        endpoint => endpoint.id !== id
      ),
    };
    await this.#deps.write(next);
    return toPublic(next);
  }

  async getRuntimeEndpoints(): Promise<
    ReadonlyArray<AutomationWebhookEndpoint>
  > {
    const current = normalizeStored(await this.#deps.read());
    return (current.endpoints ?? []).map(endpoint => ({
      id: endpoint.id,
      enabled: endpoint.enabled,
      url: endpoint.url,
      eventTypes: [...endpoint.eventTypes],
      secret: this.#deps.decrypt(endpoint.encryptedSecret),
    }));
  }
}
