// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';

import { hashAutomationToken } from '../../minutes/automation/auth.node.ts';
import { MinutesMcpHttpServer } from '../../minutes/automation/mcpHttpServer.node.ts';

const TOKEN = 'test-token';

function mcpHeaders(
  sessionId?: string,
  origin?: string
): Record<string, string> {
  return {
    accept: 'application/json, text/event-stream',
    authorization: `Bearer ${TOKEN}`,
    'content-type': 'application/json',
    ...(sessionId == null ? {} : { 'mcp-session-id': sessionId }),
    ...(origin == null ? {} : { origin }),
  };
}

describe('MinutesMcpHttpServer', () => {
  let server: MinutesMcpHttpServer;
  let baseUrl: string;

  beforeEach(async () => {
    server = new MinutesMcpHttpServer({
      port: 0,
      tokenHash: hashAutomationToken(TOKEN),
    });
    await server.start();
    baseUrl = server.url;
  });

  afterEach(async () => {
    await server.stop();
  });

  it('exposes a non-sensitive health endpoint', async () => {
    const response = await fetch(`${baseUrl}/health`);

    assert.strictEqual(response.status, 200);
    assert.deepEqual(await response.json(), {
      service: 'minutes-mcp',
      status: 'running',
    });
  });

  it('requires the configured bearer token', async () => {
    const response = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        accept: 'application/json, text/event-stream',
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

    assert.strictEqual(response.status, 401);
  });

  it('rejects non-loopback browser origins', async () => {
    const response = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: mcpHeaders(undefined, 'https://attacker.example'),
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

    assert.strictEqual(response.status, 403);
  });

  it('negotiates an MCP session and exposes the server status tool', async () => {
    const initialize = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: mcpHeaders(),
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

    assert.strictEqual(initialize.status, 200);
    const sessionId = initialize.headers.get('mcp-session-id');
    assert.isString(sessionId);
    const initialized = (await initialize.json()) as {
      result?: { serverInfo?: { name?: string } };
    };
    assert.strictEqual(initialized.result?.serverInfo?.name, 'minutes');

    const notification = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: mcpHeaders(sessionId ?? undefined),
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      }),
    });
    assert.oneOf(notification.status, [200, 202, 204]);

    const tools = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: mcpHeaders(sessionId ?? undefined),
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {},
      }),
    });
    assert.strictEqual(tools.status, 200);
    const listed = (await tools.json()) as {
      result?: { tools?: Array<{ name: string }> };
    };
    assert.include(
      listed.result?.tools?.map(tool => tool.name) ?? [],
      'get_server_status'
    );
  });
});
