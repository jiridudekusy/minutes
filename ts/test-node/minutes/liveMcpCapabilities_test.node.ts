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
        tools?: Array<{
          name: string;
          description?: string;
          inputSchema?: {
            properties?: Record<
              string,
              { description?: string; examples?: unknown; properties?: unknown }
            >;
          };
          annotations?: { destructiveHint?: boolean };
        }>;
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
      addContact: async (options: Readonly<Record<string, unknown>>) => ({
        id: 'contact-added',
        title: 'Added contact',
        ...options,
      }),
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
      terminateGroup: async (id: string) => ({ id, terminated: true }),
      leaveGroup: async (id: string) => ({ id, left: true }),
      getMessages: async (options: Readonly<Record<string, unknown>>) => ({
        items: [],
        query: options,
      }),
      getMessage: async (options: Readonly<Record<string, unknown>>) => ({
        message: { id: options.messageId },
        before: [],
        after: [],
      }),
      searchMessages: async () => ({ items: [] }),
      getAttachmentDirectories: async () => ({
        outgoing: '/safe/outgoing',
        downloads: '/safe/downloads',
      }),
      downloadAttachment: async (
        options: Readonly<Record<string, unknown>>
      ) => ({ path: '/safe/downloads/report.pdf', ...options }),
      sendMessage: async (options: Readonly<Record<string, unknown>>) => ({
        queued: true,
        ...options,
      }),
      editMessage: async (options: Readonly<Record<string, unknown>>) => ({
        queued: true,
        ...options,
      }),
      deleteMessage: async (options: Readonly<Record<string, unknown>>) => ({
        deleted: true,
        ...options,
      }),
      createPoll: async (options: Readonly<Record<string, unknown>>) => ({
        messageId: 'poll-message-1',
        ...options,
      }),
      getPollResults: async (options: Readonly<Record<string, unknown>>) => ({
        messageId: options.messageId,
        question: 'Kam na oběd?',
        totalVotes: 3,
      }),
      votePoll: async (options: Readonly<Record<string, unknown>>) => ({
        queued: true,
        ...options,
      }),
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
      'add_contact',
      'get_messages',
      'get_message',
      'search_messages',
      'get_attachment_directories',
      'download_attachment',
      'send_message',
      'edit_message',
      'delete_message',
      'create_poll',
      'get_poll_results',
      'vote_poll',
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
      'terminate_group',
      'leave_group',
    ]);
  });

  it('advertises mention guidance in the send schema', async () => {
    const listed = await request(2, 'tools/list', {});
    const tool = listed.result?.tools?.find(
      item => item.name === 'send_message'
    );
    assert.match(tool?.description?.split('.')[0] ?? '', /@mentions/);
    assert.isNotEmpty(tool?.inputSchema?.properties?.mentions?.description);
    assert.isNotEmpty(tool?.inputSchema?.properties?.text?.description);
  });

  it('edits a message by exact conversation/message IDs with mentions', async () => {
    const result = await request(3, 'tools/call', {
      name: 'edit_message',
      arguments: {
        conversationId: 'group-1',
        messageId: 'message-1',
        text: 'Hi @Tomáš',
        mentions: [{ contactId: 'tomas', start: 3, length: 6 }],
        idempotencyKey: 'edit-message-1',
      },
    });
    assert.deepInclude(JSON.parse(result.result?.content?.[0]?.text ?? '{}'), {
      conversationId: 'group-1',
      messageId: 'message-1',
      text: 'Hi @Tomáš',
      mentions: [{ contactId: 'tomas', start: 3, length: 6 }],
      idempotencyKey: 'edit-message-1',
    });
  });

  it('requires an explicit delete scope and marks message mutations destructive', async () => {
    const listed = await request(2, 'tools/list', {});
    for (const name of ['edit_message', 'delete_message']) {
      assert.isTrue(
        listed.result?.tools?.find(item => item.name === name)?.annotations
          ?.destructiveHint
      );
    }
    const invalid = await request(3, 'tools/call', {
      name: 'delete_message',
      arguments: { conversationId: 'group-1', messageId: 'message-1' },
    });
    assert.notInclude(
      invalid.result?.content?.[0]?.text ?? '',
      '"deleted":true'
    );
    await Promise.all(
      ['for_me', 'for_everyone'].map(async (scope, index) => {
        const result = await request(4 + index, 'tools/call', {
          name: 'delete_message',
          arguments: {
            conversationId: 'group-1',
            messageId: 'message-1',
            scope,
          },
        });
        assert.deepInclude(
          JSON.parse(result.result?.content?.[0]?.text ?? '{}'),
          { scope, deleted: true }
        );
      })
    );
  });

  it('adds a Signal contact by an exact phone number', async () => {
    const added = await request(3, 'tools/call', {
      name: 'add_contact',
      arguments: { phoneNumber: '+420123456789' },
    });

    assert.include(
      added.result?.content?.[0]?.text ?? '',
      '"id":"contact-added"'
    );
    assert.include(
      added.result?.content?.[0]?.text ?? '',
      '"phoneNumber":"+420123456789"'
    );
  });

  it('creates a poll and reads its current results', async () => {
    const created = await request(11, 'tools/call', {
      name: 'create_poll',
      arguments: {
        conversationId: 'conversation-1',
        question: 'Kam na oběd?',
        options: ['Pizza', 'Sushi'],
        allowMultiple: false,
        idempotencyKey: 'lunch-2026-09-25',
      },
    });
    const createdText = created.result?.content?.[0]?.text ?? '';
    assert.include(createdText, '"messageId":"poll-message-1"');
    assert.include(createdText, '"options":["Pizza","Sushi"]');
    assert.include(createdText, '"idempotencyKey":"lunch-2026-09-25"');

    const results = await request(12, 'tools/call', {
      name: 'get_poll_results',
      arguments: { messageId: 'poll-message-1' },
    });
    const resultsText = results.result?.content?.[0]?.text ?? '';
    assert.include(resultsText, '"question":"Kam na oběd?"');
    assert.include(resultsText, '"totalVotes":3');
  });

  it('accepts poll text at the Signal grapheme limit', async () => {
    const question = '👍'.repeat(100);
    const created = await request(13, 'tools/call', {
      name: 'create_poll',
      arguments: {
        conversationId: 'conversation-1',
        question,
        options: ['Ano', 'Ne'],
      },
    });

    assert.include(
      created.result?.content?.[0]?.text ?? '',
      '"messageId":"poll-message-1"'
    );
  });

  it('casts and clears a poll vote through Signal', async () => {
    const voted = await request(14, 'tools/call', {
      name: 'vote_poll',
      arguments: {
        messageId: 'poll-message-1',
        optionIndexes: [0, 1],
      },
    });
    assert.include(voted.result?.content?.[0]?.text ?? '', '"queued":true');
    assert.include(
      voted.result?.content?.[0]?.text ?? '',
      '"optionIndexes":[0,1]'
    );

    const cleared = await request(15, 'tools/call', {
      name: 'vote_poll',
      arguments: {
        messageId: 'poll-message-1',
        optionIndexes: [],
      },
    });
    assert.include(cleared.result?.content?.[0]?.text ?? '', '"queued":true');
    assert.include(
      cleared.result?.content?.[0]?.text ?? '',
      '"optionIndexes":[]'
    );
  });

  it('accepts mention identities and ranges in send_message', async () => {
    const sent = await request(4, 'tools/call', {
      name: 'send_message',
      arguments: {
        conversationId: 'group-1',
        text: 'Hi @Tomáš',
        mentions: [{ contactId: 'tomas', start: 3, length: 6 }],
      },
    });
    assert.deepInclude(JSON.parse(sent.result?.content?.[0]?.text ?? '{}'), {
      mentions: [{ contactId: 'tomas', start: 3, length: 6 }],
    });
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
      arguments: {
        conversationId: 'conversation-1',
        attachments: [
          {
            path: '/safe/outgoing/report.pdf',
            contentType: 'application/pdf',
          },
        ],
        idempotencyKey: 'send-hello-once',
      },
    });
    assert.include(sent.result?.content?.[0]?.text ?? '', '"queued":true');
    assert.include(
      sent.result?.content?.[0]?.text ?? '',
      '"idempotencyKey":"send-hello-once"'
    );
    assert.include(
      sent.result?.content?.[0]?.text ?? '',
      '"path":"/safe/outgoing/report.pdf"'
    );

    const directories = await request(5, 'tools/call', {
      name: 'get_attachment_directories',
      arguments: {},
    });
    assert.include(
      directories.result?.content?.[0]?.text ?? '',
      '"outgoing":"/safe/outgoing"'
    );

    const downloaded = await request(6, 'tools/call', {
      name: 'download_attachment',
      arguments: { messageId: 'message-1', attachmentId: 'attachment-1' },
    });
    assert.include(
      downloaded.result?.content?.[0]?.text ?? '',
      '"path":"/safe/downloads/report.pdf"'
    );

    const reacted = await request(7, 'tools/call', {
      name: 'set_message_reaction',
      arguments: { messageId: 'message-1', emoji: '👍' },
    });
    assert.include(
      reacted.result?.content?.[0]?.text ?? '',
      '"messageId":"message-1","emoji":"👍"'
    );

    const removed = await request(8, 'tools/call', {
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

    const terminated = await request(7, 'tools/call', {
      name: 'terminate_group',
      arguments: { groupId: 'group-1' },
    });
    assert.include(
      terminated.result?.content?.[0]?.text ?? '',
      '"terminated":true'
    );

    const left = await request(8, 'tools/call', {
      name: 'leave_group',
      arguments: { groupId: 'group-1' },
    });
    assert.include(left.result?.content?.[0]?.text ?? '', '"left":true');
  });

  it('forwards rich message lookup parameters without client-built cursors', async () => {
    const result = await request(9, 'tools/call', {
      name: 'get_message',
      arguments: { messageId: 'message-1', before: 2, after: 3 },
    });

    assert.include(result.result?.content?.[0]?.text ?? '', '"id":"message-1"');
  });

  it('forwards message discovery filters as one query', async () => {
    const result = await request(10, 'tools/call', {
      name: 'get_messages',
      arguments: {
        conversationId: 'group-1',
        search: 'odpověď',
        senderContactId: 'alice-id',
        direction: 'incoming',
        from: 1_786_000_000_000,
        to: 1_786_086_400_000,
        order: 'newest',
        limit: 1,
      },
    });
    const text = result.result?.content?.[0]?.text ?? '';

    assert.include(text, '"search":"odpověď"');
    assert.include(text, '"senderContactId":"alice-id"');
    assert.include(text, '"direction":"incoming"');
    assert.include(text, '"order":"newest"');
  });
});
