/**
 * Tests for registerEvfResources — RED phase (TDD Task 2 — Plan 11-03).
 *
 * registerEvfResources wires 4 MCP resources onto the McpServer with read callbacks
 * that check the cache first and fall back to bridge REST calls on miss.
 *
 * Test case index:
 * 1. registerEvfResources registers EXACTLY 4 resources (URIs: EVF_MCP_RESOURCE_URIS)
 * 2. resources/read actor://current with cache hit → result.contents[0].text = JSON of snapshot
 * 3. resources/read actor://current with cache miss → bridgeClient.getCharacterSnapshot called once
 * 4. resources/read combat://current cache miss + null (no active combat) → result text = 'null'
 * 5. resources/read log://recent → JSON array from LogRing.toArray()
 * 6. EVF_MCP_RESOURCE_URIS exported as readonly tuple with 4 URIs
 * 7. After cache.set('actor://current', x), server.sendResourceUpdated called once
 */

import type {
  CharacterSnapshot,
  CombatSnapshot,
  EventLogEntry,
  SceneViewport,
} from '@evf/shared-protocol';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import pino from 'pino';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EVF_MCP_RESOURCE_URIS, registerEvfResources } from './register-resources.js';
import { ResourceCache } from './resource-cache.js';

// ─── Mock BridgeClient ────────────────────────────────────────────────────────

function createMockBridgeClient(overrides?: {
  getCharacterSnapshot?: () => Promise<CharacterSnapshot | null>;
  getCombatSnapshot?: () => Promise<CombatSnapshot | null>;
  getSceneViewport?: () => Promise<SceneViewport | null>;
  getEventLog?: (limit: number) => Promise<EventLogEntry[]>;
}) {
  return {
    getCharacterSnapshot: overrides?.getCharacterSnapshot ?? vi.fn().mockResolvedValue(null),
    getCombatSnapshot: overrides?.getCombatSnapshot ?? vi.fn().mockResolvedValue(null),
    getSceneViewport: overrides?.getSceneViewport ?? vi.fn().mockResolvedValue(null),
    getEventLog: overrides?.getEventLog ?? vi.fn().mockResolvedValue([]),
  };
}

// ─── Fixture helpers ──────────────────────────────────────────────────────────

function makeSnapshot(hp: number): CharacterSnapshot {
  return {
    actorId: 'actor-1',
    name: 'Tester',
    hp,
    maxHp: 20,
    tempHp: 0,
    ac: 14,
    level: 5,
    conditions: [],
    exhaustion: 0,
    death: { success: 0, failure: 0 },
    world: { modernRules: false },
    inventory: [],
    spells: { slots: [], spells: [] },
    abilities: {
      str: { value: 10, mod: 0, save: 0, proficient: false, dc: 10 },
      dex: { value: 10, mod: 0, save: 0, proficient: false, dc: 10 },
      con: { value: 10, mod: 0, save: 0, proficient: false, dc: 10 },
      int: { value: 10, mod: 0, save: 0, proficient: false, dc: 10 },
      wis: { value: 10, mod: 0, save: 0, proficient: false, dc: 10 },
      cha: { value: 10, mod: 0, save: 0, proficient: false, dc: 10 },
    },
  };
}

function makeLogEntry(seq: number): EventLogEntry {
  return {
    seq,
    ts: Date.now(),
    type: 'chat',
    actorId: null,
    content: `Entry ${seq}`,
  };
}

// ─── Helpers to build a connected server + client pair ────────────────────────

async function buildConnected(
  server: McpServer,
): Promise<{ client: Client; cleanup: () => Promise<void> }> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: 'test-client', version: '0.0.1' }, { capabilities: {} });
  await client.connect(clientTransport);
  return {
    client,
    cleanup: async () => {
      await client.close();
    },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('registerEvfResources', () => {
  const logger = pino({ level: 'silent' });
  let server: McpServer;
  let cache: ResourceCache;

  beforeEach(() => {
    server = new McpServer({ name: 'test', version: '0.0.1' });
    cache = new ResourceCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('case 1: registers EXACTLY 4 resources with correct URIs', async () => {
    const bridgeClient = createMockBridgeClient();
    registerEvfResources(server, cache, bridgeClient as never, logger);

    const { client, cleanup } = await buildConnected(server);
    try {
      const result = await client.listResources();
      expect(result.resources).toHaveLength(4);

      const uris = result.resources.map((r) => r.uri).sort();
      expect(uris).toEqual([...EVF_MCP_RESOURCE_URIS].sort());
    } finally {
      await cleanup();
    }
  });

  it('case 2: resources/read actor://current with cache hit → returns cached JSON', async () => {
    const snapshot = makeSnapshot(12);
    cache.set('actor://current', snapshot);

    const bridgeClient = createMockBridgeClient();
    registerEvfResources(server, cache, bridgeClient as never, logger);

    const { client, cleanup } = await buildConnected(server);
    try {
      const result = await client.readResource({ uri: 'actor://current' });
      expect(result.contents).toHaveLength(1);
      const content = result.contents[0]! as { uri: string; mimeType?: string; text: string };
      expect(content.mimeType).toBe('application/json');
      expect(JSON.parse(content.text)).toEqual(snapshot);
    } finally {
      await cleanup();
    }
  });

  it('case 3: resources/read actor://current with cache miss → bridgeClient.getCharacterSnapshot called once', async () => {
    const snapshot = makeSnapshot(8);
    const getCharacterSnapshot = vi.fn().mockResolvedValue(snapshot);
    const bridgeClient = createMockBridgeClient({ getCharacterSnapshot });

    registerEvfResources(server, cache, bridgeClient as never, logger);

    const { client, cleanup } = await buildConnected(server);
    try {
      const result = await client.readResource({ uri: 'actor://current' });
      expect(getCharacterSnapshot).toHaveBeenCalledTimes(1);
      const content = result.contents[0]! as { uri: string; mimeType?: string; text: string };
      expect(JSON.parse(content.text)).toEqual(snapshot);
    } finally {
      await cleanup();
    }
  });

  it('case 4: resources/read combat://current cache miss + REST returns null → text = "null"', async () => {
    const getCombatSnapshot = vi.fn().mockResolvedValue(null);
    const bridgeClient = createMockBridgeClient({ getCombatSnapshot });

    registerEvfResources(server, cache, bridgeClient as never, logger);

    const { client, cleanup } = await buildConnected(server);
    try {
      const result = await client.readResource({ uri: 'combat://current' });
      expect(getCombatSnapshot).toHaveBeenCalledTimes(1);
      const content = result.contents[0]! as { uri: string; mimeType?: string; text: string };
      expect(content.text).toBe('null');
    } finally {
      await cleanup();
    }
  });

  it('case 5: resources/read log://recent → returns JSON array from LogRing', async () => {
    cache.appendLog(makeLogEntry(1));
    cache.appendLog(makeLogEntry(2));

    const bridgeClient = createMockBridgeClient();
    registerEvfResources(server, cache, bridgeClient as never, logger);

    const { client, cleanup } = await buildConnected(server);
    try {
      const result = await client.readResource({ uri: 'log://recent' });
      const content = result.contents[0]! as { uri: string; mimeType?: string; text: string };
      const entries = JSON.parse(content.text) as EventLogEntry[];
      expect(entries).toHaveLength(2);
      expect(entries[0]!.seq).toBe(1);
      expect(entries[1]!.seq).toBe(2);
    } finally {
      await cleanup();
    }
  });

  it('case 6: EVF_MCP_RESOURCE_URIS is a readonly tuple with 4 correct URIs', () => {
    expect(EVF_MCP_RESOURCE_URIS).toHaveLength(4);
    expect(EVF_MCP_RESOURCE_URIS).toContain('actor://current');
    expect(EVF_MCP_RESOURCE_URIS).toContain('combat://current');
    expect(EVF_MCP_RESOURCE_URIS).toContain('scene://current');
    expect(EVF_MCP_RESOURCE_URIS).toContain('log://recent');
    // Verify it's a readonly tuple (TypeScript level check — confirmed by type)
    expect(Array.isArray(EVF_MCP_RESOURCE_URIS)).toBe(true);
  });

  it('case 7: after cache.set actor://current, server.server.sendResourceUpdated called once', async () => {
    const bridgeClient = createMockBridgeClient();
    registerEvfResources(server, cache, bridgeClient as never, logger);

    // Spy on sendResourceUpdated on the underlying Server instance
    const sendSpy = vi.spyOn(server.server, 'sendResourceUpdated').mockResolvedValue(undefined);

    // Now set a value in cache — should trigger the notification
    cache.set('actor://current', makeSnapshot(15));

    // Give any microtasks a chance to run
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy).toHaveBeenCalledWith({ uri: 'actor://current' });
  });
});
