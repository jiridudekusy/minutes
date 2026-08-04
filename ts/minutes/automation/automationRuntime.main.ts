// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { app, ipcMain, safeStorage, type BrowserWindow } from 'electron';

import { createLogger } from '../../logging/log.std.ts';
import {
  generateCallRecordingSummary,
  transcribeCallRecording,
} from '../callSummaryExtension.main.ts';
import {
  listCallRecordings,
  loadCallRecordingOutput,
} from '../recordingsCatalog.main.ts';
import { AutomationSettingsStore } from './automationSettings.node.ts';
import type {
  AutomationRuntimeStatus,
  StoredAutomationSettings,
} from './automationSettings.std.ts';
import { AutomationRendererBridge } from './automationRendererBridge.node.ts';
import type {
  AutomationRendererRequest,
  AutomationRendererResponse,
} from './automationContracts.std.ts';
import { EncryptedAutomationFile } from './encryptedAutomationFile.std.ts';
import { AutomationEventBus, type AutomationEvent } from './events.std.ts';
import { AutomationJobRegistry } from './jobRegistry.std.ts';
import { registerLiveMcpCapabilities } from './liveMcpCapabilities.node.ts';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { MeetingAutomationService } from './meetingAutomationService.node.ts';
import { registerMeetingMcpCapabilities } from './meetingMcpCapabilities.node.ts';
import { MinutesMcpHttpServer } from './mcpHttpServer.node.ts';
import { RendererAutomationService } from './rendererAutomationService.std.ts';
import { SerializedAsyncRunner } from './serializedAsyncRunner.std.ts';
import {
  WebhookDispatcher,
  type AutomationWebhookEndpoint,
} from './webhookDispatcher.node.ts';
import { WebhookOutbox, type WebhookDelivery } from './webhookOutbox.std.ts';

const log = createLogger('minutes/automation');
const SETTINGS_FILE = 'minutes/automation-settings.json';
const OUTBOX_FILE = 'minutes/automation-webhook-outbox.enc';
const OUTBOX_LIMIT = 1_000;

type MainWindowProvider = () => BrowserWindow | undefined;

let runtime: MinutesAutomationRuntime | undefined;

function encrypt(value: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('OS secure storage is unavailable');
  }
  return safeStorage.encryptString(value).toString('hex');
}

function decrypt(value: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('OS secure storage is unavailable');
  }
  return safeStorage.decryptString(Buffer.from(value, 'hex'));
}

async function readOptionalText(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (
      error != null &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      return undefined;
    }
    throw error;
  }
}

async function writePrivateText(path: string, value: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, value, { encoding: 'utf8', mode: 0o600 });
  await rename(temporaryPath, path);
}

function createSettingsStore(): AutomationSettingsStore {
  const path = join(app.getPath('userData'), SETTINGS_FILE);
  return new AutomationSettingsStore({
    read: async () => {
      const text = await readOptionalText(path);
      return text == null
        ? undefined
        : (JSON.parse(text) as StoredAutomationSettings);
    },
    write: value => writePrivateText(path, JSON.stringify(value, null, 2)),
    encrypt,
    decrypt,
  });
}

function createOutboxFile(): EncryptedAutomationFile<
  ReadonlyArray<WebhookDelivery>
> {
  const path = join(app.getPath('userData'), OUTBOX_FILE);
  return new EncryptedAutomationFile({
    readText: () => readOptionalText(path),
    writeText: value => writePrivateText(path, value),
    encrypt,
    decrypt,
  });
}

function isAutomationEvent(value: unknown): value is AutomationEvent {
  return (
    value != null &&
    typeof value === 'object' &&
    'id' in value &&
    typeof value.id === 'string' &&
    'type' in value &&
    typeof value.type === 'string' &&
    'occurredAt' in value &&
    typeof value.occurredAt === 'string' &&
    'data' in value &&
    value.data != null &&
    typeof value.data === 'object'
  );
}

function eventForArtifact(
  type: 'transcript.completed' | 'summary.completed',
  recordingId: string
): AutomationEvent {
  return type === 'transcript.completed'
    ? {
        id: randomUUID(),
        type,
        occurredAt: new Date().toISOString(),
        data: { recordingId, transcriptId: recordingId },
      }
    : {
        id: randomUUID(),
        type,
        occurredAt: new Date().toISOString(),
        data: { recordingId, summaryId: recordingId },
      };
}

class MinutesAutomationRuntime {
  readonly #settings = createSettingsStore();
  readonly #events = new AutomationEventBus();
  readonly #getMainWindow: MainWindowProvider;
  readonly #recordingsDir: string;
  readonly #bridge: AutomationRendererBridge;
  readonly #live: RendererAutomationService;
  readonly #meetings: MeetingAutomationService;
  readonly #dispatcher: WebhookDispatcher;
  #server: MinutesMcpHttpServer | undefined;
  #rendererReady = false;
  #status: AutomationRuntimeStatus = { state: 'stopped' };
  #flushTimer: ReturnType<typeof setInterval> | undefined;
  readonly #reconcileRunner = new SerializedAsyncRunner();

  private constructor(options: {
    recordingsDir: string;
    getMainWindow: MainWindowProvider;
    outbox: WebhookOutbox;
  }) {
    this.#recordingsDir = options.recordingsDir;
    this.#getMainWindow = options.getMainWindow;
    this.#bridge = new AutomationRendererBridge({
      send: (request: AutomationRendererRequest) => {
        const window = this.#getMainWindow();
        if (window == null || window.webContents.isDestroyed()) {
          throw new Error('Renderer unavailable');
        }
        window.webContents.send('minutes:automation-request', request);
      },
    });
    this.#live = new RendererAutomationService(this.#bridge);
    const jobs = new AutomationJobRegistry({ maxConcurrent: 1 });
    this.#meetings = new MeetingAutomationService({
      jobRegistry: jobs,
      listRecordings: () => listCallRecordings(this.#recordingsDir),
      loadRecordingOutput: loadCallRecordingOutput,
      getFileSize: async path => (await stat(path)).size,
      transcribeRecording: async (entry, context) => {
        const recordingId = MeetingAutomationService.getRecordingId(entry);
        const result = await transcribeCallRecording({
          ...entry,
          onProgress: update =>
            context.reportProgress(update.percent, update.detail),
        });
        await this.#events.emit(
          eventForArtifact('transcript.completed', recordingId)
        );
        if (result.summaryPath) {
          await this.#events.emit(
            eventForArtifact('summary.completed', recordingId)
          );
        }
        return result;
      },
      summarizeRecording: async (entry, context) => {
        const recordingId = MeetingAutomationService.getRecordingId(entry);
        const result = await generateCallRecordingSummary({
          recordingPath: entry.recordingPath,
          conversationTitle: entry.conversationTitle,
          onProgress: update =>
            context.reportProgress(update.percent, update.detail),
        });
        await this.#events.emit(
          eventForArtifact('summary.completed', recordingId)
        );
        return result;
      },
    });
    this.#dispatcher = new WebhookDispatcher({
      outbox: options.outbox,
      isEnabled: async () =>
        (await this.#settings.getPublicSettings()).webhooksEnabled,
      getEndpoints: () => this.#settings.getRuntimeEndpoints(),
    });
    this.#events.subscribe(event => this.#dispatcher.enqueue(event));
  }

  static async create(options: {
    recordingsDir: string;
    getMainWindow: MainWindowProvider;
  }): Promise<MinutesAutomationRuntime> {
    const outboxFile = createOutboxFile();
    let initialEntries: ReadonlyArray<WebhookDelivery> = [];
    try {
      initialEntries = (await outboxFile.read()) ?? [];
    } catch (error) {
      log.error('failed to restore encrypted webhook outbox', error);
    }
    const outbox = new WebhookOutbox({
      initialEntries,
      persist: entries => outboxFile.write(entries),
      maxEntries: OUTBOX_LIMIT,
    });
    return new MinutesAutomationRuntime({ ...options, outbox });
  }

  get status(): AutomationRuntimeStatus {
    return this.#status;
  }

  get settings(): AutomationSettingsStore {
    return this.#settings;
  }

  rendererReady(): void {
    this.#rendererReady = true;
    void this.reconcile();
  }

  rendererUnavailable(): void {
    this.#rendererReady = false;
    this.#bridge.rendererUnavailable();
  }

  handleRendererResponse(response: AutomationRendererResponse): void {
    this.#bridge.handleResponse(response);
  }

  async emit(event: AutomationEvent): Promise<void> {
    await this.#events.emit(event);
  }

  reconcile(): Promise<void> {
    return this.#reconcileRunner.run(() => this.#reconcile());
  }

  async #reconcile(): Promise<void> {
    await this.#server?.stop();
    this.#server = undefined;
    this.#status = { state: 'stopped' };
    const settings = await this.#settings.getPublicSettings();
    const tokenHash = await this.#settings.getTokenHash();
    if (!settings.enabled || !this.#rendererReady || tokenHash == null) {
      return;
    }
    const server = new MinutesMcpHttpServer({
      port: settings.port,
      tokenHash,
      configureServer: (mcp: McpServer) => {
        const enabledTools = new Set(settings.enabledTools);
        registerMeetingMcpCapabilities(mcp, this.#meetings, enabledTools);
        registerLiveMcpCapabilities(mcp, this.#live, enabledTools);
      },
    });
    try {
      await server.start();
      this.#server = server;
      this.#status = { state: 'running', url: `${server.url}/mcp` };
      log.info(`MCP server listening at ${server.url}/mcp`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.#status = {
        state: message.includes('EADDRINUSE') ? 'port-unavailable' : 'error',
        error: message,
      };
      log.error('failed to start MCP server', error);
    }
  }

  startWebhookLoop(): void {
    if (this.#flushTimer != null) {
      return;
    }
    this.#flushTimer = setInterval(() => {
      void this.#dispatcher.flushDue();
    }, 30_000);
    this.#flushTimer.unref();
    void this.#dispatcher.flushDue();
  }

  async stop(): Promise<void> {
    if (this.#flushTimer != null) {
      clearInterval(this.#flushTimer);
      this.#flushTimer = undefined;
    }
    await this.#reconcileRunner.close(async () => {
      await this.#server?.stop();
      this.#server = undefined;
      this.#bridge.rendererUnavailable();
      this.#status = { state: 'stopped' };
    });
  }

  async testWebhook(endpointId: string): Promise<void> {
    const endpoints = await this.#settings.getRuntimeEndpoints();
    const endpoint = endpoints.find(item => item.id === endpointId);
    if (endpoint == null) {
      throw new Error('Webhook endpoint not found');
    }
    const outbox = new WebhookOutbox({
      initialEntries: [],
      persist: async () => undefined,
      maxEntries: 1,
    });
    const testDispatcher = new WebhookDispatcher({
      outbox,
      getEndpoints: async (): Promise<
        ReadonlyArray<AutomationWebhookEndpoint>
      > => [endpoint],
    });
    await testDispatcher.enqueue({
      id: randomUUID(),
      type: 'call.started',
      occurredAt: new Date().toISOString(),
      data: {
        callId: 'test',
        conversationId: 'test',
        callMode: 'test',
      },
    });
    await testDispatcher.flushDue();
    const pending = outbox.list()[0];
    if (pending != null) {
      throw new Error(pending.lastError ?? 'Webhook test delivery failed');
    }
  }
}

export async function initializeMinutesAutomationRuntime(options: {
  recordingsDir: string;
  getMainWindow: MainWindowProvider;
}): Promise<void> {
  if (runtime != null) {
    return;
  }
  runtime = await MinutesAutomationRuntime.create(options);
  runtime.startWebhookLoop();

  ipcMain.on('minutes:automation-renderer-ready', event => {
    if (event.sender === options.getMainWindow()?.webContents) {
      runtime?.rendererReady();
      event.sender.once('destroyed', () => {
        runtime?.rendererUnavailable();
      });
    }
  });
  ipcMain.on(
    'minutes:automation-response',
    (event, response: AutomationRendererResponse) => {
      if (event.sender === options.getMainWindow()?.webContents) {
        runtime?.handleRendererResponse(response);
      }
    }
  );
  ipcMain.on('minutes:automation-event', (event, value: unknown) => {
    if (
      event.sender === options.getMainWindow()?.webContents &&
      isAutomationEvent(value)
    ) {
      void runtime?.emit(value);
    }
  });

  ipcMain.handle('minutes:get-automation-settings', () =>
    runtime?.settings.getPublicSettings()
  );
  ipcMain.handle(
    'minutes:save-automation-server-settings',
    async (
      _event,
      input: {
        enabled: boolean;
        port: number;
        enabledTools: ReadonlyArray<string>;
      }
    ) => {
      const settings = await runtime?.settings.saveServerSettings(input);
      await runtime?.reconcile();
      return { settings, status: runtime?.status };
    }
  );
  ipcMain.handle('minutes:regenerate-automation-token', async () => {
    const result = await runtime?.settings.regenerateToken();
    await runtime?.reconcile();
    return { ...result, status: runtime?.status };
  });
  ipcMain.handle('minutes:upsert-automation-webhook', (_event, input) =>
    runtime?.settings.upsertWebhook(input)
  );
  ipcMain.handle(
    'minutes:save-automation-webhook-settings',
    (_event, input: { enabled: boolean }) =>
      runtime?.settings.saveWebhookSettings(input)
  );
  ipcMain.handle('minutes:remove-automation-webhook', (_event, id: string) =>
    runtime?.settings.removeWebhook(id)
  );
  ipcMain.handle('minutes:test-automation-webhook', (_event, id: string) =>
    runtime?.testWebhook(id)
  );
  ipcMain.handle('minutes:get-automation-status', () => runtime?.status);

  app.once('before-quit', () => {
    void runtime?.stop();
  });
}

export async function emitMinutesAutomationEvent(
  event: AutomationEvent
): Promise<void> {
  await runtime?.emit(event);
}
