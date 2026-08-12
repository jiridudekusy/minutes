// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import type { AutomationEventType } from './events.std.ts';
import type { AutomationToolName } from './toolCatalog.std.ts';

export const DEFAULT_AUTOMATION_PORT = 37221;

export type AutomationServerState =
  | 'running'
  | 'stopped'
  | 'port-unavailable'
  | 'error';

export type AutomationRuntimeStatus = Readonly<{
  state: AutomationServerState;
  url?: string;
  error?: string;
}>;

export type AutomationWebhookEndpointPublic = Readonly<{
  id: string;
  enabled: boolean;
  url: string;
  eventTypes: ReadonlyArray<AutomationEventType>;
  hasSecret: boolean;
  lastSuccessAt?: number;
  lastError?: string;
}>;

export type AutomationSettingsPublic = Readonly<{
  enabled: boolean;
  webhooksEnabled: boolean;
  port: number;
  allowedHosts: ReadonlyArray<string>;
  hasToken: boolean;
  enabledTools: ReadonlyArray<AutomationToolName>;
  endpoints: ReadonlyArray<AutomationWebhookEndpointPublic>;
}>;

export type StoredAutomationWebhookEndpoint = Readonly<{
  id: string;
  enabled: boolean;
  url: string;
  eventTypes: ReadonlyArray<AutomationEventType>;
  encryptedSecret: string;
  lastSuccessAt?: number;
  lastError?: string;
}>;

export type StoredAutomationSettings = Readonly<{
  enabled?: boolean;
  webhooksEnabled?: boolean;
  port?: number;
  allowedHosts?: ReadonlyArray<string>;
  encryptedTokenHash?: string;
  enabledTools?: ReadonlyArray<string>;
  endpoints?: ReadonlyArray<StoredAutomationWebhookEndpoint>;
}>;
