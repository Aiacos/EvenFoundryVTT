/**
 * Tests for buildMcpServer() — RED phase (TDD Task 2 — Plan 11-01).
 *
 * 4 behavioral cases:
 * 1. buildMcpServer returns an McpServer instance (instanceof check)
 * 2. The server has name='evf-foundry-mcp', version='0.1.0-alpha.0'
 * 3. Boot log includes bridgeUrl but NOT the bearer (T-11-01)
 * 4. An empty server (no tools) can be constructed; tools/list returns { tools: [] }
 *    (verified via in-memory transport pair from @modelcontextprotocol/sdk/inMemory.js)
 *
 * NOTE: In 11-02, Task 2, this test file is extended by register-tools.test.ts — a
 * separate file that tests the 6-tool registration. The server-factory tests here
 * remain skeleton-level (no tools registered).
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import pino from 'pino';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildMcpServer } from './server-factory.js';

describe('buildMcpServer', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('case 1: returns an McpServer instance', () => {
    const logger = pino({ level: 'silent' });
    const server = buildMcpServer({
      logger,
      bridgeUrl: 'http://localhost:8910',
      bearer: 'test-token',
    });
    expect(server).toBeInstanceOf(McpServer);
  });

  it('case 2: server has correct name and version in server info', async () => {
    const logger = pino({ level: 'silent' });
    const server = buildMcpServer({
      logger,
      bridgeUrl: 'http://localhost:8910',
      bearer: 'test-token',
    });

    // Verify via in-memory transport: connect client and read serverVersion.
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);

    const client = new Client({ name: 'test-client', version: '0.0.1' }, { capabilities: {} });
    await client.connect(clientTransport);

    // After connect(), the client has the server's info from the initialize handshake.
    const serverVersion = client.getServerVersion();
    expect(serverVersion?.name).toBe('evf-foundry-mcp');
    expect(serverVersion?.version).toBe('0.1.0-alpha.0');

    await client.close();
  });

  it('case 3: boot log includes bridgeUrl but NOT the bearer value (T-11-01)', () => {
    const logMessages: Array<Record<string, unknown>> = [];
    const logger = pino(
      { level: 'info' },
      {
        write(chunk: string) {
          try {
            logMessages.push(JSON.parse(chunk) as Record<string, unknown>);
          } catch {
            /* ignore */
          }
        },
      },
    );

    const secret = 'super-secret-bearer-xyz';
    buildMcpServer({ logger, bridgeUrl: 'http://localhost:8910', bearer: secret });

    // The boot log must include the bridgeUrl
    expect(logMessages.length).toBeGreaterThan(0);
    const raw = JSON.stringify(logMessages);
    expect(raw).toContain('http://localhost:8910');

    // The bearer must never appear in any log output
    expect(raw).not.toContain(secret);
  });

  it('case 4: server with no tools registers cleanly; connect succeeds and server responds to initialize', async () => {
    // NOTE: McpServer only registers the tools/list handler after the first registerTool()
    // call (setToolRequestHandlers() is lazy). With zero tools, tools/list returns -32601
    // Method not found. This is the SDK's documented behavior for skeleton servers.
    // Plan 11-02 adds tools; the tools/list test lives in register-tools.test.ts.
    // This test only verifies: server constructs + transport connect completes cleanly.
    const logger = pino({ level: 'silent' });
    const server = buildMcpServer({
      logger,
      bridgeUrl: 'http://localhost:8910',
      bearer: 'test-token',
    });

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);

    // Use the high-level MCP Client for proper protocol handshake.
    const client = new Client({ name: 'test-client', version: '0.0.1' }, { capabilities: {} });
    // connect() completes the initialize handshake — if the server doesn't respond
    // correctly, this throws. A successful connect proves the skeleton is functional.
    await client.connect(clientTransport);

    // Server info is available after successful connect.
    const serverVersion = client.getServerVersion();
    expect(serverVersion).toBeDefined();
    expect(serverVersion?.name).toBe('evf-foundry-mcp');

    await client.close();
  });
});
