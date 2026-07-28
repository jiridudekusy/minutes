// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';

import { hashAutomationToken } from '../../minutes/automation/auth.node.ts';
import { registerMeetingMcpCapabilities } from '../../minutes/automation/meetingMcpCapabilities.node.ts';
import { MinutesMcpHttpServer } from '../../minutes/automation/mcpHttpServer.node.ts';

const TOKEN = 'meeting-token';

describe('meeting MCP capabilities', () => {
  let server: MinutesMcpHttpServer;
  let sessionId: string;

  async function request(id: number, method: string, params: unknown) {
    const response = await fetch(`${server.url}/mcp`, {
      method: 'POST',
      headers: {
        accept: 'application/json, text/event-stream',
        authorization: `Bearer ${TOKEN}`,
        'content-type': 'application/json',
        'mcp-session-id': sessionId,
      },
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
    });
    assert.strictEqual(response.status, 200);
    return response.json() as Promise<{
      result?: {
        tools?: Array<{ name: string }>;
        content?: Array<{ type: string; text?: string }>;
        contents?: Array<{ uri: string; text?: string }>;
      };
    }>;
  }

  beforeEach(async () => {
    const meetingService = {
      listRecordings: async () => ({
        items: [
          {
            id: 'recording-1',
            conversationId: 'conversation-1',
            conversationTitle: 'Team',
            startedAt: 1,
            endedAt: 2,
            durationMs: 1,
            mediaKind: 'audio' as const,
            recordingPath: '/Documents/Minutes/team.mp3',
            mimeType: 'audio/mpeg' as const,
            sizeBytes: 123,
            hasTranscript: true,
            hasSummary: true,
          },
        ],
      }),
      searchRecordings: async () => ({ items: [] }),
      getRecording: async (id: string) => ({
        id,
        conversationId: 'conversation-1',
        conversationTitle: 'Team',
        startedAt: 1,
        endedAt: 2,
        durationMs: 1,
        mediaKind: 'audio' as const,
        recordingPath: '/Documents/Minutes/team.mp3',
        mimeType: 'audio/mpeg' as const,
        sizeBytes: 123,
        hasTranscript: true,
        hasSummary: true,
      }),
      readTranscript: async (id: string) => ({
        uri: `minutes://recordings/${id}/transcript`,
        mimeType: 'text/markdown' as const,
        text: 'Speaker: hello',
      }),
      readSummary: async (id: string) => ({
        uri: `minutes://recordings/${id}/summary`,
        mimeType: 'text/markdown' as const,
        text: 'Summary',
      }),
      transcribeRecording: async () => ({
        id: 'job-1',
        kind: 'transcription',
        status: 'queued' as const,
        createdAt: 1,
        updatedAt: 1,
      }),
      summarizeRecording: async () => ({
        id: 'job-2',
        kind: 'summary',
        status: 'queued' as const,
        createdAt: 1,
        updatedAt: 1,
      }),
      getJob: (id: string) => ({
        id,
        kind: 'transcription',
        status: 'completed' as const,
        createdAt: 1,
        updatedAt: 2,
        result: { transcriptPath: '/result.transcript.md' },
      }),
    };
    server = new MinutesMcpHttpServer({
      port: 0,
      tokenHash: hashAutomationToken(TOKEN),
      configureServer: mcp =>
        registerMeetingMcpCapabilities(mcp, meetingService),
    });
    await server.start();

    const initialize = await fetch(`${server.url}/mcp`, {
      method: 'POST',
      headers: {
        accept: 'application/json, text/event-stream',
        authorization: `Bearer ${TOKEN}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-11-25',
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0.0' },
        },
      }),
    });
    sessionId = initialize.headers.get('mcp-session-id') ?? '';
    await fetch(`${server.url}/mcp`, {
      method: 'POST',
      headers: {
        accept: 'application/json, text/event-stream',
        authorization: `Bearer ${TOKEN}`,
        'content-type': 'application/json',
        'mcp-session-id': sessionId,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      }),
    });
  });

  afterEach(async () => {
    await server.stop();
  });

  it('lists the public meeting tools and returns structured recording data', async () => {
    const listed = await request(2, 'tools/list', {});
    const names = listed.result?.tools?.map(tool => tool.name) ?? [];
    assert.includeMembers(names, [
      'list_recordings',
      'search_recordings',
      'get_recording',
      'transcribe_recording',
      'summarize_recording',
    ]);

    const called = await request(3, 'tools/call', {
      name: 'list_recordings',
      arguments: {},
    });
    const text = called.result?.content?.[0]?.text ?? '';
    const parsed = JSON.parse(text) as { items?: Array<{ id: string }> };
    assert.strictEqual(parsed.items?.[0]?.id, 'recording-1');
  });

  it('reads transcript and job resources by canonical URI', async () => {
    const transcript = await request(4, 'resources/read', {
      uri: 'minutes://recordings/recording-1/transcript',
    });
    assert.strictEqual(
      transcript.result?.contents?.[0]?.text,
      'Speaker: hello'
    );

    const job = await request(5, 'resources/read', {
      uri: 'minutes://jobs/job-1',
    });
    assert.include(
      job.result?.contents?.[0]?.text ?? '',
      '"status":"completed"'
    );
  });
});
