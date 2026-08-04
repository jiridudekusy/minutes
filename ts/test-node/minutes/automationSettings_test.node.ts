// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';

import { AutomationSettingsStore } from '../../minutes/automation/automationSettings.node.ts';
import type { StoredAutomationSettings } from '../../minutes/automation/automationSettings.std.ts';

describe('AutomationSettingsStore', () => {
  async function expectRejected(
    promise: Promise<unknown>,
    expectedMessage: string
  ): Promise<void> {
    let caught: unknown;
    try {
      await promise;
    } catch (error) {
      caught = error;
    }
    assert.instanceOf(caught, Error);
    assert.include(caught.message, expectedMessage);
  }

  function createStore(initial?: StoredAutomationSettings) {
    let stored = initial;
    const saved: Array<StoredAutomationSettings> = [];
    const store = new AutomationSettingsStore({
      read: async () => stored,
      write: async value => {
        stored = value;
        saved.push(value);
      },
      encrypt: value => Buffer.from(value, 'utf8').toString('base64'),
      decrypt: value => Buffer.from(value, 'base64').toString('utf8'),
      generateToken: () => 'plain-token',
      generateSecret: () => 'plain-secret',
      idFactory: () => 'endpoint-1',
    });
    return { saved, store };
  }

  it('defaults to an explicitly disabled server on the fixed default port', async () => {
    const { store } = createStore();

    assert.deepEqual(await store.getPublicSettings(), {
      enabled: false,
      webhooksEnabled: false,
      port: 37221,
      hasToken: false,
      enabledTools: [
        'list_recordings',
        'search_recordings',
        'get_recording',
        'transcribe_recording',
        'summarize_recording',
        'list_conversations',
        'list_contacts',
        'get_messages',
        'search_messages',
        'send_message',
        'set_message_reaction',
        'get_group',
        'find_groups_by_member',
        'create_group',
        'update_group_metadata',
        'add_group_members',
        'remove_group_members',
        'set_group_member_roles',
        'set_group_permissions',
        'set_group_disappearing_messages',
        'leave_group',
        'get_active_call',
        'start_call',
        'hang_up_call',
        'start_audio_recording',
        'start_video_recording',
        'pause_recording',
        'resume_recording',
        'stop_recording',
      ],
      endpoints: [],
    });
  });

  it('persists the webhook master switch independently of MCP', async () => {
    const { saved, store } = createStore({ enabled: true });

    const settings = await store.saveWebhookSettings({ enabled: true });

    assert.strictEqual(settings.enabled, true);
    assert.strictEqual(settings.webhooksEnabled, true);
    assert.strictEqual(saved.at(-1)?.webhooksEnabled, true);
  });

  it('persists an explicit MCP tool selection with the server settings', async () => {
    const { saved, store } = createStore();

    const settings = await store.saveServerSettings({
      enabled: true,
      port: 37221,
      enabledTools: ['list_recordings', 'send_message'],
    });

    assert.deepEqual(settings.enabledTools, [
      'list_recordings',
      'send_message',
    ]);
    assert.deepEqual(saved.at(-1)?.enabledTools, [
      'list_recordings',
      'send_message',
    ]);
  });

  it('rejects unknown MCP tool names before writing settings', async () => {
    const { saved, store } = createStore();

    await expectRejected(
      store.saveServerSettings({
        enabled: true,
        port: 37221,
        enabledTools: ['list_recordings', 'delete_everything'],
      }),
      'Unknown MCP tool: delete_everything'
    );
    assert.isEmpty(saved);
  });

  it('returns a generated token once and persists only its encrypted hash', async () => {
    const { saved, store } = createStore();

    const result = await store.regenerateToken();

    assert.strictEqual(result.token, 'plain-token');
    assert.strictEqual(result.settings.hasToken, true);
    const savedSettings = saved.at(-1);
    if (savedSettings == null) {
      throw new Error('Expected saved settings');
    }
    const serialized = JSON.stringify(savedSettings);
    assert.notInclude(serialized, 'plain-token');
    const tokenHash = await store.getTokenHash();
    if (tokenHash == null) {
      throw new Error('Expected token hash');
    }
    assert.match(tokenHash, /^[a-f0-9]{64}$/);
  });

  it('stores webhook secrets encrypted and never returns them publicly', async () => {
    const { saved, store } = createStore();

    const created = await store.upsertWebhook({
      enabled: true,
      url: 'https://hooks.example.test/minutes',
      eventTypes: ['message.received', 'summary.completed'],
    });

    assert.strictEqual(created.secret, 'plain-secret');
    assert.notProperty(created.endpoint, 'secret');
    const savedSettings = saved.at(-1);
    if (savedSettings == null) {
      throw new Error('Expected saved settings');
    }
    const serialized = JSON.stringify(savedSettings);
    assert.notInclude(serialized, 'plain-secret');
    assert.deepInclude((await store.getRuntimeEndpoints())[0], {
      id: 'endpoint-1',
      enabled: true,
      secret: 'plain-secret',
    });
  });

  it('rejects webhook targets outside HTTPS and loopback HTTP', async () => {
    const { store } = createStore();

    await expectRejected(
      store.upsertWebhook({
        enabled: true,
        url: 'http://example.com/hook',
        eventTypes: ['call.started'],
      }),
      'Webhook URL must use HTTPS or loopback HTTP'
    );
    await store.upsertWebhook({
      enabled: true,
      url: 'http://127.0.0.1:8080/hook',
      eventTypes: ['call.started'],
    });
  });

  it('persists webhook delivery success and error status', async () => {
    const { store } = createStore();
    await store.upsertWebhook({
      enabled: true,
      url: 'https://hooks.example.test/minutes',
      eventTypes: ['call.started'],
    });

    await store.recordWebhookDeliveryResult('endpoint-1', {
      successAt: 123,
    });
    assert.deepInclude((await store.getPublicSettings()).endpoints[0], {
      lastSuccessAt: 123,
      lastError: undefined,
    });

    await store.recordWebhookDeliveryResult('endpoint-1', {
      error: 'HTTP 500',
    });
    assert.deepInclude((await store.getPublicSettings()).endpoints[0], {
      lastSuccessAt: 123,
      lastError: 'HTTP 500',
    });
  });
});
