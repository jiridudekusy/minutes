// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { ipcRenderer } from 'electron';

import type {
  AutomationRuntimeStatus,
  AutomationSettingsPublic,
  AutomationWebhookEndpointPublic,
} from './automationSettings.std.ts';
import type { AutomationEventType } from './events.std.ts';

export function getAutomationSettings(): Promise<AutomationSettingsPublic> {
  return ipcRenderer.invoke('minutes:get-automation-settings');
}

export function getAutomationStatus(): Promise<AutomationRuntimeStatus> {
  return ipcRenderer.invoke('minutes:get-automation-status');
}

export function saveAutomationServerSettings(input: {
  enabled: boolean;
  port: number;
  enabledTools: ReadonlyArray<string>;
}): Promise<{
  settings: AutomationSettingsPublic;
  status: AutomationRuntimeStatus;
}> {
  return ipcRenderer.invoke('minutes:save-automation-server-settings', input);
}

export function regenerateAutomationToken(): Promise<{
  token: string;
  settings: AutomationSettingsPublic;
  status: AutomationRuntimeStatus;
}> {
  return ipcRenderer.invoke('minutes:regenerate-automation-token');
}

export function upsertAutomationWebhook(input: {
  id?: string;
  enabled: boolean;
  url: string;
  eventTypes: ReadonlyArray<AutomationEventType>;
  regenerateSecret?: boolean;
}): Promise<{
  endpoint: AutomationWebhookEndpointPublic;
  secret?: string;
}> {
  return ipcRenderer.invoke('minutes:upsert-automation-webhook', input);
}

export function saveAutomationWebhookSettings(input: {
  enabled: boolean;
}): Promise<AutomationSettingsPublic> {
  return ipcRenderer.invoke('minutes:save-automation-webhook-settings', input);
}

export function removeAutomationWebhook(
  id: string
): Promise<AutomationSettingsPublic> {
  return ipcRenderer.invoke('minutes:remove-automation-webhook', id);
}

export function testAutomationWebhook(id: string): Promise<void> {
  return ipcRenderer.invoke('minutes:test-automation-webhook', id);
}
