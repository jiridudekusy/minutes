// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { randomUUID } from 'node:crypto';
import {
  createServer,
  type IncomingMessage,
  type Server as HttpServer,
  type ServerResponse,
} from 'node:http';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';

import { verifyAutomationToken } from './auth.node.ts';

const HOST = '127.0.0.1';
const MAX_REQUEST_BYTES = 1_048_576;

type Session = Readonly<{
  server: McpServer;
  transport: StreamableHTTPServerTransport;
}>;

function sendJson(
  response: ServerResponse,
  status: number,
  body: unknown
): void {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(JSON.stringify(body));
}

function sendMcpError(
  response: ServerResponse,
  status: number,
  message: string
): void {
  sendJson(response, status, {
    jsonrpc: '2.0',
    error: { code: -32000, message },
    id: null,
  });
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Array<Buffer<ArrayBuffer>> = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_REQUEST_BYTES) {
      throw new Error('REQUEST_TOO_LARGE');
    }
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function createProtocolServer(
  configureServer: ((server: McpServer) => void) | undefined
): McpServer {
  const server = new McpServer({
    name: 'minutes',
    version: '1.0.0',
    description: 'Local automation for Minutes',
  });
  server.registerTool(
    'get_server_status',
    {
      title: 'Get Minutes MCP server status',
      description: 'Returns non-sensitive status for the local Minutes server.',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async () => ({
      content: [
        {
          type: 'text',
          text: JSON.stringify({ service: 'minutes-mcp', status: 'running' }),
        },
      ],
    })
  );
  configureServer?.(server);
  return server;
}

export class MinutesMcpHttpServer {
  readonly #configuredPort: number;
  readonly #tokenHash: string;
  readonly #configureServer: ((server: McpServer) => void) | undefined;
  readonly #sessions = new Map<string, Session>();
  #httpServer: HttpServer | undefined;
  #listeningPort: number | undefined;

  constructor(
    options: Readonly<{
      port: number;
      tokenHash: string;
      configureServer?: (server: McpServer) => void;
    }>
  ) {
    if (
      !Number.isSafeInteger(options.port) ||
      options.port < 0 ||
      options.port > 65_535
    ) {
      throw new Error('Invalid MCP port');
    }
    this.#configuredPort = options.port;
    this.#tokenHash = options.tokenHash;
    this.#configureServer = options.configureServer;
  }

  get url(): string {
    if (this.#listeningPort == null) {
      throw new Error('MCP server is not running');
    }
    return `http://${HOST}:${this.#listeningPort}`;
  }

  async start(): Promise<void> {
    if (this.#httpServer != null) {
      throw new Error('MCP server is already running');
    }
    const server = createServer((request, response) => {
      void this.#handleRequest(request, response);
    });
    this.#httpServer = server;

    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error): void => {
        server.off('listening', onListening);
        reject(error);
      };
      const onListening = (): void => {
        server.off('error', onError);
        resolve();
      };
      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(this.#configuredPort, HOST);
    });

    const address = server.address();
    if (address == null || typeof address === 'string') {
      await this.stop();
      throw new Error('MCP server has no TCP address');
    }
    this.#listeningPort = address.port;
  }

  async stop(): Promise<void> {
    const sessions = [...this.#sessions.values()];
    this.#sessions.clear();
    await Promise.allSettled(
      sessions.map(async session => {
        await session.server.close();
      })
    );

    const server = this.#httpServer;
    this.#httpServer = undefined;
    this.#listeningPort = undefined;
    if (server == null) {
      return;
    }
    await new Promise<void>((resolve, reject) => {
      server.close(error => {
        if (error != null) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  async #handleRequest(
    request: IncomingMessage,
    response: ServerResponse
  ): Promise<void> {
    try {
      const pathname = new URL(request.url ?? '/', this.url).pathname;
      if (pathname === '/health' && request.method === 'GET') {
        sendJson(response, 200, {
          service: 'minutes-mcp',
          status: 'running',
        });
        return;
      }
      if (pathname !== '/mcp') {
        sendJson(response, 404, { error: 'Not found' });
        return;
      }
      if (!this.#hasValidHost(request)) {
        sendMcpError(response, 403, 'Invalid Host header');
        return;
      }
      if (!this.#hasValidOrigin(request)) {
        sendMcpError(response, 403, 'Invalid Origin header');
        return;
      }
      if (!this.#isAuthorized(request)) {
        response.setHeader('www-authenticate', 'Bearer realm="minutes-mcp"');
        sendMcpError(response, 401, 'Unauthorized');
        return;
      }

      if (request.method === 'POST') {
        await this.#handlePost(request, response);
        return;
      }
      if (request.method === 'GET' || request.method === 'DELETE') {
        await this.#handleSessionRequest(request, response);
        return;
      }
      response.setHeader('allow', 'GET, POST, DELETE');
      sendMcpError(response, 405, 'Method not allowed');
    } catch (error) {
      if (response.headersSent) {
        response.end();
        return;
      }
      if (error instanceof Error && error.message === 'REQUEST_TOO_LARGE') {
        sendMcpError(response, 413, 'Request body too large');
        return;
      }
      sendMcpError(response, 500, 'Internal server error');
    }
  }

  async #handlePost(
    request: IncomingMessage,
    response: ServerResponse
  ): Promise<void> {
    let body: unknown;
    try {
      body = await readJsonBody(request);
    } catch (error) {
      if (error instanceof Error && error.message === 'REQUEST_TOO_LARGE') {
        throw error;
      }
      sendMcpError(response, 400, 'Invalid JSON request');
      return;
    }

    const sessionId = this.#getSessionId(request);
    if (sessionId != null) {
      const session = this.#sessions.get(sessionId);
      if (session == null) {
        sendMcpError(response, 404, 'Unknown MCP session');
        return;
      }
      await session.transport.handleRequest(request, response, body);
      return;
    }

    if (!isInitializeRequest(body)) {
      sendMcpError(response, 400, 'Missing MCP session');
      return;
    }

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: randomUUID,
      enableJsonResponse: true,
      onsessioninitialized: id => {
        const session = this.#sessions.get(id);
        if (session == null) {
          this.#sessions.set(id, { server, transport });
        }
      },
    });
    const server = createProtocolServer(this.#configureServer);
    transport.onclose = () => {
      const id = transport.sessionId;
      if (id != null) {
        this.#sessions.delete(id);
      }
    };
    await server.connect(transport);
    await transport.handleRequest(request, response, body);
  }

  async #handleSessionRequest(
    request: IncomingMessage,
    response: ServerResponse
  ): Promise<void> {
    const sessionId = this.#getSessionId(request);
    const session =
      sessionId == null ? undefined : this.#sessions.get(sessionId);
    if (session == null) {
      sendMcpError(response, 400, 'Invalid or missing MCP session');
      return;
    }
    await session.transport.handleRequest(request, response);
  }

  #getSessionId(request: IncomingMessage): string | undefined {
    const value = request.headers['mcp-session-id'];
    return typeof value === 'string' ? value : undefined;
  }

  #isAuthorized(request: IncomingMessage): boolean {
    const authorization = request.headers.authorization;
    if (authorization == null || !authorization.startsWith('Bearer ')) {
      return false;
    }
    return verifyAutomationToken(authorization.slice(7), this.#tokenHash);
  }

  #hasValidHost(request: IncomingMessage): boolean {
    const host = request.headers.host;
    if (host == null || this.#listeningPort == null) {
      return false;
    }
    return (
      host === `${HOST}:${this.#listeningPort}` ||
      host === `localhost:${this.#listeningPort}`
    );
  }

  #hasValidOrigin(request: IncomingMessage): boolean {
    const origin = request.headers.origin;
    if (origin == null) {
      return true;
    }
    if (this.#listeningPort == null) {
      return false;
    }
    try {
      const parsed = new URL(origin);
      return (
        parsed.protocol === 'http:' &&
        (parsed.hostname === HOST || parsed.hostname === 'localhost') &&
        parsed.port === String(this.#listeningPort)
      );
    } catch {
      return false;
    }
  }
}
