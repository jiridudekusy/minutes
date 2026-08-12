// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';
import { request as httpRequest } from 'node:http';

import { hashAutomationToken } from '../../minutes/automation/auth.node.ts';
import { MinutesMcpHttpServer } from '../../minutes/automation/mcpHttpServer.node.ts';

const TOKEN = 'test-token';

async function getHealthWithHost(
  baseUrl: string,
  host: string
): Promise<number | undefined> {
  const url = new URL(baseUrl);
  return new Promise((resolve, reject) => {
    const request = httpRequest(
      {
        hostname: url.hostname,
        port: url.port,
        path: '/health',
        method: 'GET',
        headers: {
          authorization: `Bearer ${TOKEN}`,
          host,
        },
      },
      response => {
        response.resume();
        response.once('end', () => resolve(response.statusCode));
      }
    );
    request.once('error', reject);
    request.end();
  });
}

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

  it('protects the health endpoint with the same bearer token', async () => {
    const unauthorized = await fetch(`${baseUrl}/health`);
    assert.strictEqual(unauthorized.status, 401);

    const response = await fetch(`${baseUrl}/health`, {
      headers: { authorization: `Bearer ${TOKEN}` },
    });

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

  it('accepts an explicitly allowed Docker Desktop host', async () => {
    await server.stop();
    server = new MinutesMcpHttpServer({
      port: 0,
      tokenHash: hashAutomationToken(TOKEN),
      allowedHosts: ['host.docker.internal'],
    });
    await server.start();
    baseUrl = server.url;
    const port = new URL(baseUrl).port;

    const status = await getHealthWithHost(
      baseUrl,
      `host.docker.internal:${port}`
    );

    assert.strictEqual(status, 200);
  });

  it('rejects a Docker Desktop host unless it is explicitly allowed', async () => {
    const port = new URL(baseUrl).port;
    const status = await getHealthWithHost(
      baseUrl,
      `host.docker.internal:${port}`
    );

    assert.strictEqual(status, 403);
  });

  it('derives the allowed browser origin from an allowed host', async () => {
    await server.stop();
    server = new MinutesMcpHttpServer({
      port: 0,
      tokenHash: hashAutomationToken(TOKEN),
      allowedHosts: ['host.docker.internal'],
    });
    await server.start();
    baseUrl = server.url;
    const port = new URL(baseUrl).port;

    const allowed = await fetch(`${baseUrl}/health`, {
      headers: {
        authorization: `Bearer ${TOKEN}`,
        origin: `http://host.docker.internal:${port}`,
      },
    });
    const rejected = await fetch(`${baseUrl}/health`, {
      headers: {
        authorization: `Bearer ${TOKEN}`,
        origin: `http://other.example:${port}`,
      },
    });
    const malformed = await fetch(`${baseUrl}/health`, {
      headers: {
        authorization: `Bearer ${TOKEN}`,
        origin: `http://host.docker.internal:${port}/path`,
      },
    });

    assert.strictEqual(allowed.status, 200);
    assert.strictEqual(rejected.status, 403);
    assert.strictEqual(malformed.status, 403);
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
