// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';

import { hashAutomationToken } from '../../minutes/automation/auth.node.ts';
import { registerLiveMcpCapabilities } from '../../minutes/automation/liveMcpCapabilities.node.ts';
import { MinutesMcpHttpServer } from '../../minutes/automation/mcpHttpServer.node.ts';
import type { RendererAutomationService } from '../../minutes/automation/rendererAutomationService.std.ts';

describe('live Signal MCP capabilities', () => {
  const token = 'live-token';
  let server: MinutesMcpHttpServer;
  let sessionId: string;

  async function request(id: number, method: string, params: unknown) {
    const response = await fetch(`${server.url}/mcp`, {
      method: 'POST',
      headers: {
        accept: 'application/json, text/event-stream',
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'mcp-session-id': sessionId,
      },
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
    });
    assert.strictEqual(response.status, 200);
    return response.json() as Promise<{
      result?: {
        tools?: Array<{ name: string }>;
        content?: Array<{ text?: string }>;
        contents?: Array<{ text?: string }>;
      };
    }>;
  }

  beforeEach(async () => {
    const live = {
      listConversations: async () => ({
        items: [{ id: 'conversation-1', title: 'Team', type: 'group' }],
      }),
      getConversation: async (id: string) => ({
        id,
        title: 'Team',
        type: 'group',
      }),
      listContacts: async () => ({ items: [] }),
      getContact: async (id: string) => ({ id, title: 'Alice' }),
      getGroup: async (id: string) => ({ id, title: 'Team' }),
      findGroupsByMember: async (options: {
        query?: string;
        contactId?: string;
      }) => ({
        items: [{ selector: options.query ?? options.contactId }],
      }),
      createGroup: async (options: Readonly<Record<string, unknown>>) => ({
        id: 'created-group',
        ...options,
      }),
      updateGroupMetadata: async (options: Readonly<Record<string, unknown>>) =>
        options,
      addGroupMembers: async (options: Readonly<Record<string, unknown>>) =>
        options,
      removeGroupMembers: async (options: Readonly<Record<string, unknown>>) =>
        options,
      setGroupMemberRoles: async (options: Readonly<Record<string, unknown>>) =>
        options,
      setGroupPermissions: async (options: Readonly<Record<string, unknown>>) =>
        options,
      setGroupDisappearingMessages: async (
        options: Readonly<Record<string, unknown>>
      ) => options,
      leaveGroup: async (id: string) => ({ id, left: true }),
      getMessages: async () => ({ items: [] }),
      searchMessages: async () => ({ items: [] }),
      sendMessage: async () => ({ queued: true }),
      setMessageReaction: async (options: Readonly<Record<string, unknown>>) =>
        options,
      getActiveCall: async () => ({ call: null }),
      startCall: async () => ({ started: true }),
      hangUpCall: async () => ({ ended: true }),
      startAudioRecording: async () => ({ started: true }),
      startVideoRecording: async () => ({ started: true }),
      pauseRecording: async () => ({ paused: true }),
      resumeRecording: async () => ({ resumed: true }),
      stopRecording: async () => ({ stopped: true }),
    } as unknown as RendererAutomationService;
    server = new MinutesMcpHttpServer({
      port: 0,
      tokenHash: hashAutomationToken(token),
      configureServer: mcp => registerLiveMcpCapabilities(mcp, live),
    });
    await server.start();
    const initialized = await fetch(`${server.url}/mcp`, {
      method: 'POST',
      headers: {
        accept: 'application/json, text/event-stream',
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-11-25',
          capabilities: {},
          clientInfo: { name: 'test', version: '1' },
        },
      }),
    });
    sessionId = initialized.headers.get('mcp-session-id') ?? '';
  });

  afterEach(async () => {
    await server.stop();
  });

  it('exposes the complete live capability set', async () => {
    const result = await request(2, 'tools/list', {});
    const names = result.result?.tools?.map(tool => tool.name) ?? [];

    assert.includeMembers(names, [
      'list_conversations',
      'list_contacts',
      'get_messages',
      'search_messages',
      'send_message',
      'set_message_reaction',
      'get_active_call',
      'start_call',
      'hang_up_call',
      'start_audio_recording',
      'start_video_recording',
      'pause_recording',
      'resume_recording',
      'stop_recording',
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
    ]);
  });

  it('reads canonical conversation resources and invokes mutations', async () => {
    const resource = await request(3, 'resources/read', {
      uri: 'minutes://conversations/conversation-1',
    });
    assert.include(
      resource.result?.contents?.[0]?.text ?? '',
      '"title":"Team"'
    );

    const sent = await request(4, 'tools/call', {
      name: 'send_message',
      arguments: { conversationId: 'conversation-1', text: 'hello' },
    });
    assert.include(sent.result?.content?.[0]?.text ?? '', '"queued":true');

    const reacted = await request(5, 'tools/call', {
      name: 'set_message_reaction',
      arguments: { messageId: 'message-1', emoji: '👍' },
    });
    assert.include(
      reacted.result?.content?.[0]?.text ?? '',
      '"messageId":"message-1","emoji":"👍"'
    );

    const removed = await request(6, 'tools/call', {
      name: 'set_message_reaction',
      arguments: { messageId: 'message-1', emoji: null },
    });
    assert.include(
      removed.result?.content?.[0]?.text ?? '',
      '"messageId":"message-1","emoji":null'
    );
  });

  it('forwards group search selectors and exact mutation IDs', async () => {
    const found = await request(5, 'tools/call', {
      name: 'find_groups_by_member',
      arguments: { query: 'Alice', limit: 20 },
    });
    assert.include(
      found.result?.content?.[0]?.text ?? '',
      '"selector":"Alice"'
    );

    const removed = await request(6, 'tools/call', {
      name: 'remove_group_members',
      arguments: {
        groupId: 'group-1',
        memberIds: ['contact-1', 'contact-2'],
      },
    });
    assert.include(
      removed.result?.content?.[0]?.text ?? '',
      '"memberIds":["contact-1","contact-2"]'
    );

    const left = await request(7, 'tools/call', {
      name: 'leave_group',
      arguments: { groupId: 'group-1' },
    });
    assert.include(left.result?.content?.[0]?.text ?? '', '"left":true');
  });
});
