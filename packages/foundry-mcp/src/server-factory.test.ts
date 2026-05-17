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
    const server = buildMcpServer({ logger, bridgeUrl: 'http://localhost:8910', bearer: 'test-token' });
    expect(server).toBeInstanceOf(McpServer);
  });

  it('case 2: server has correct name and version in server info', async () => {
    const logger = pino({ level: 'silent' });
    const server = buildMcpServer({ logger, bridgeUrl: 'http://localhost:8910', bearer: 'test-token' });

    // Verify via in-memory transport: send initialize request and check serverInfo
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);

    // Send initialize request manually
    let receivedMessage: unknown = null;
    clientTransport.onmessage = (msg) => { receivedMessage = msg; };
    await clientTransport.start();

    await clientTransport.send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '0.0.1' },
      },
    });

    // Give it a moment to respond
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(receivedMessage).toBeDefined();
    // @ts-expect-error — dynamic JSON-RPC result
    const result = (receivedMessage as { result: { serverInfo: { name: string; version: string } } }).result;
    expect(result.serverInfo.name).toBe('evf-foundry-mcp');
    expect(result.serverInfo.version).toBe('0.1.0-alpha.0');

    await clientTransport.close();
  });

  it('case 3: boot log includes bridgeUrl but NOT the bearer value (T-11-01)', () => {
    const logMessages: Array<Record<string, unknown>> = [];
    const logger = pino({ level: 'info' }, {
      write(chunk: string) {
        try {
          logMessages.push(JSON.parse(chunk) as Record<string, unknown>);
        } catch { /* ignore */ }
      },
    });

    const secret = 'super-secret-bearer-xyz';
    buildMcpServer({ logger, bridgeUrl: 'http://localhost:8910', bearer: secret });

    // The boot log must include the bridgeUrl
    expect(logMessages.length).toBeGreaterThan(0);
    const raw = JSON.stringify(logMessages);
    expect(raw).toContain('http://localhost:8910');

    // The bearer must never appear in any log output
    expect(raw).not.toContain(secret);
  });

  it('case 4: server with no tools registers cleanly; tools/list returns empty array', async () => {
    const logger = pino({ level: 'silent' });
    const server = buildMcpServer({ logger, bridgeUrl: 'http://localhost:8910', bearer: 'test-token' });

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);

    const responses: unknown[] = [];
    clientTransport.onmessage = (msg) => { responses.push(msg); };
    await clientTransport.start();

    // First: initialize
    await clientTransport.send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '0.0.1' },
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Send initialized notification
    await clientTransport.send({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    });

    // Then: tools/list
    await clientTransport.send({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {},
    });
    await new Promise((resolve) => setTimeout(resolve, 10));

    const toolsListResponse = responses.find(
      // @ts-expect-error — dynamic JSON-RPC lookup
      (r) => (r as { id?: number }).id === 2,
    ) as { result: { tools: unknown[] } } | undefined;

    expect(toolsListResponse).toBeDefined();
    expect(toolsListResponse?.result.tools).toEqual([]);

    await clientTransport.close();
  });
});
