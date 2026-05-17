/**
 * Tests for registerEvfTools() — RED phase (TDD Task 2 — Plan 11-02).
 *
 * 8 behavioral cases verifying the 6 MCP tools are registered correctly using
 * Phase 7 Zod schemas (.shape extraction) and that tool callbacks route through
 * BridgeClient.invokeTool with correct snake_case→kebab mapping.
 *
 * Test approach:
 * - Use McpServer + in-memory MCP Client for round-trip JSON-RPC tests.
 * - BridgeClient is stubbed (not a real WS connection).
 *
 * Cases:
 * 1. registerEvfTools registers exactly 6 tools
 * 2. Tool names are exactly ['cast-spell','weapon-attack','use-item','move-token','place-template','drop-concentration']
 * 3. cast-spell schema has expected property keys ['actor_id','spell_id','slot_level','targets']
 * 4. EVF_MCP_TOOL_IDS tuple contains the 6 tool IDs (exported constant)
 * 5. cast-spell callback success → { content: [{ type:'text', text: JSON.stringify(data) }] }
 * 6. cast-spell callback bridge failure → { content: [text: error], isError: true }
 * 7. cast-spell callback BridgeAuthExpiredError → callback re-throws
 * 8. cast-spell with invalid args (slot_level:'bad') → SDK -32602 before callback fires
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import pino from 'pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BridgeAuthExpiredError,
  type BridgeClient,
  type BridgeInvokeResult,
} from './bridge-client.js';
import { EVF_MCP_TOOL_IDS, registerEvfTools } from './register-tools.js';

const logger = pino({ level: 'silent' });

/** Create a stubbed BridgeClient with a controllable invokeTool mock. */
function makeBridgeStub(
  responseFactory: (tool: string, args: object) => Promise<BridgeInvokeResult>,
): Pick<BridgeClient, 'invokeTool' | 'close' | 'ready'> {
  return {
    ready: Promise.resolve(),
    invokeTool: vi.fn().mockImplementation(responseFactory),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

/** Create a connected McpServer + Client pair with 6 tools registered. */
async function createConnectedPair(
  bridgeStub: Pick<BridgeClient, 'invokeTool' | 'close' | 'ready'>,
) {
  const server = new McpServer({ name: 'test-server', version: '0.0.1' });
  registerEvfTools(server, bridgeStub as BridgeClient, logger);

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);

  const client = new Client({ name: 'test-client', version: '0.0.1' }, { capabilities: {} });
  await client.connect(clientTransport);

  return { server, client };
}

describe('registerEvfTools', () => {
  let bridgeStub: Pick<BridgeClient, 'invokeTool' | 'close' | 'ready'>;

  beforeEach(() => {
    bridgeStub = makeBridgeStub(async () => ({ success: true, data: {} }));
  });

  it('case 1: registers exactly 6 tools', async () => {
    const { client } = await createConnectedPair(bridgeStub);
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(6);
    await client.close();
  });

  it('case 2: registered tool names are exactly the 6 expected IDs', async () => {
    const { client } = await createConnectedPair(bridgeStub);
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    const expected = [
      'cast-spell',
      'drop-concentration',
      'move-token',
      'place-template',
      'use-item',
      'weapon-attack',
    ].sort();
    expect(names).toEqual(expected);
    await client.close();
  });

  it('case 3: cast-spell inputSchema has correct property keys', async () => {
    const { client } = await createConnectedPair(bridgeStub);
    const { tools } = await client.listTools();
    const castSpell = tools.find((t) => t.name === 'cast-spell');
    expect(castSpell).toBeDefined();
    const schema = castSpell?.inputSchema as { properties?: Record<string, unknown> };
    expect(schema?.properties).toBeDefined();
    expect(Object.keys(schema?.properties ?? {}).sort()).toEqual(
      ['actor_id', 'slot_level', 'spell_id', 'targets'].sort(),
    );
    await client.close();
  });

  it('case 4: EVF_MCP_TOOL_IDS is a tuple of exactly 6 tool IDs', () => {
    expect(EVF_MCP_TOOL_IDS).toHaveLength(6);
    expect(EVF_MCP_TOOL_IDS).toContain('cast-spell');
    expect(EVF_MCP_TOOL_IDS).toContain('weapon-attack');
    expect(EVF_MCP_TOOL_IDS).toContain('use-item');
    expect(EVF_MCP_TOOL_IDS).toContain('move-token');
    expect(EVF_MCP_TOOL_IDS).toContain('place-template');
    expect(EVF_MCP_TOOL_IDS).toContain('drop-concentration');
  });

  it('case 5: cast-spell callback success → MCP result with JSON stringified data', async () => {
    const chatCard = { chatCardId: 'chat-abc-123' };
    bridgeStub = makeBridgeStub(async () => ({ success: true, data: chatCard }));
    const { client } = await createConnectedPair(bridgeStub);

    const result = await client.callTool({
      name: 'cast-spell',
      arguments: { actor_id: 'actor-1', spell_id: 'fireball', slot_level: 3, targets: [] },
    });

    expect(result.isError).toBeFalsy();
    const resultContent = result.content as Array<{ type: string; text: string }>;
    expect(resultContent).toHaveLength(1);
    // biome-ignore lint/style/noNonNullAssertion: length asserted above
    const content = resultContent[0]!;
    expect(content.type).toBe('text');
    expect(JSON.parse(content.text)).toEqual(chatCard);
    await client.close();
  });

  it('case 6: cast-spell callback bridge failure → isError: true', async () => {
    bridgeStub = makeBridgeStub(async () => ({ success: false, error: 'actor_not_found' }));
    const { client } = await createConnectedPair(bridgeStub);

    const result = await client.callTool({
      name: 'cast-spell',
      arguments: { actor_id: 'actor-1', spell_id: 'fireball', slot_level: 3, targets: [] },
    });

    expect(result.isError).toBe(true);
    // biome-ignore lint/style/noNonNullAssertion: content[0] always present on tool result
    const content = (result.content as Array<{ type: string; text: string }>)[0]!;
    expect(content.text).toBe('actor_not_found');
    await client.close();
  });

  it('case 7: cast-spell callback BridgeAuthExpiredError → callback re-throws', async () => {
    bridgeStub = makeBridgeStub(async () => {
      throw new BridgeAuthExpiredError();
    });
    const { client } = await createConnectedPair(bridgeStub);

    // The SDK catches tool callback throws and returns isError: true with the error message.
    const result = await client.callTool({
      name: 'cast-spell',
      arguments: { actor_id: 'actor-1', spell_id: 'fireball', slot_level: 3, targets: [] },
    });

    // The error should propagate (MCP returns isError response or error code)
    expect(result.isError).toBe(true);
    await client.close();
  });

  it('case 8: cast-spell with invalid args (slot_level not a number) → SDK validates before callback', async () => {
    const invokeSpy = vi.fn();
    bridgeStub = {
      ready: Promise.resolve(),
      invokeTool: invokeSpy,
      close: vi.fn().mockResolvedValue(undefined),
    };
    const { client } = await createConnectedPair(bridgeStub);

    // The SDK validates the input schema BEFORE calling the tool callback.
    // Invalid args resolve with isError:true (MCP -32602 validation error),
    // never reaching invokeTool. client.callTool() does NOT reject — it
    // returns the error as a result (MCP protocol maps -32602 to isError response).
    const result = await client.callTool({
      name: 'cast-spell',
      arguments: { actor_id: 'actor-1', spell_id: 'fireball', slot_level: 'bad', targets: [] },
    });

    expect(result.isError).toBe(true);
    // biome-ignore lint/style/noNonNullAssertion: content[0] always present on tool result
    const content = (result.content as Array<{ type: string; text: string }>)[0]!;
    expect(content.text).toContain('slot_level');

    // The bridge stub should NOT have been called (validation short-circuits).
    expect(invokeSpy).not.toHaveBeenCalled();
    await client.close();
  });
});
