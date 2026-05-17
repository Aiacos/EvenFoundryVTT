/**
 * Register 4 MCP resources on the McpServer.
 *
 * Each resource exposes Phase 2 reader pipeline data + Phase 5 log via MCP:
 * - `actor://current`  → CharacterSnapshot (player-controlled actor)
 * - `combat://current` → CombatSnapshot (null when no combat active)
 * - `scene://current`  → SceneViewport (current canvas camera position)
 * - `log://recent`     → EventLogEntry[] (last 50 entries from ring buffer)
 *
 * Read strategy: cache-or-REST-fallback
 * 1. Check ResourceCache.get(uri) — primed by WS delta subscription.
 * 2. On cache miss (undefined), call the appropriate BridgeClient REST method.
 * 3. REST fallback gracefully returns null / [] on bridge unreachable (soft-fail).
 *
 * Change notifications (T-11-13 mitigation against stale data):
 * - `cache.onUpdate(uri, cb)` fires on each cache write.
 * - Callback calls `server.server.sendResourceUpdated({ uri })` so subscribed
 *   MCP clients receive resource-updated notifications.
 *
 * Security (T-11-12): LLM has same view as paired player's actor (no cross-player).
 * Multi-player isolation is Phase 13 stretch; single-actor for MVP.
 *
 * @see packages/foundry-mcp/src/resources/resource-cache.ts
 * @see packages/foundry-mcp/src/resources/ws-subscription.ts
 * @see packages/foundry-mcp/src/tools/bridge-client.ts (REST methods)
 * @see .planning/phases/11-v2-foundry-mcp-server/11-03-PLAN.md Task 2
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Logger } from 'pino';
import type { BridgeClient } from '../tools/bridge-client.js';
import type { ResourceCache } from './resource-cache.js';

// ─── Resource URIs ────────────────────────────────────────────────────────────

/**
 * Readonly tuple of all 4 EVF MCP resource URIs.
 * Used by Plan 11-04 verification grep and tests.
 */
export const EVF_MCP_RESOURCE_URIS = [
  'actor://current',
  'combat://current',
  'scene://current',
  'log://recent',
] as const;

export type EvfMcpResourceUri = (typeof EVF_MCP_RESOURCE_URIS)[number];

// ─── Resource metadata ────────────────────────────────────────────────────────

const RESOURCE_META: Record<
  EvfMcpResourceUri,
  { name: string; title: string; description: string }
> = {
  'actor://current': {
    name: 'actor-current',
    title: 'Current Actor',
    description:
      'Latest CharacterSnapshot of the player-controlled actor — HP, AC, conditions, level, death saves, modernRules, inventory, spellbook. Updated live via WS character.delta envelopes from FoundryVTT.',
  },
  'combat://current': {
    name: 'combat-current',
    title: 'Current Combat',
    description:
      'Active combat tracker state — round, turn, initiative order, current combatant, concentration. Null when no combat is active.',
  },
  'scene://current': {
    name: 'scene-current',
    title: 'Current Scene',
    description:
      'Scene viewport — dimensions, grid, current camera position. Source for token placement coordinates passed to move-token.',
  },
  'log://recent': {
    name: 'log-recent',
    title: 'Recent Event Log',
    description:
      'Last 50 event-log entries (chat, damage, heal, death). Use to ground tool calls in recent narrative context.',
  },
};

// ─── REST fallback dispatch ───────────────────────────────────────────────────

async function readResource(
  uri: EvfMcpResourceUri,
  cache: ResourceCache,
  bridgeClient: BridgeClient,
  logger: Logger,
): Promise<unknown> {
  const cached = cache.get(uri);
  if (cached !== undefined) {
    return cached;
  }

  // Cache miss — fall back to REST
  switch (uri) {
    case 'actor://current': {
      const snapshot = await bridgeClient.getCharacterSnapshot();
      if (snapshot === null) {
        logger.warn({ uri }, 'register-resources: actor://current cache miss + REST returned null');
      }
      return snapshot;
    }
    case 'combat://current': {
      return await bridgeClient.getCombatSnapshot();
    }
    case 'scene://current': {
      return await bridgeClient.getSceneViewport();
    }
    case 'log://recent': {
      return await bridgeClient.getEventLog(50);
    }
  }
}

// ─── registerEvfResources ─────────────────────────────────────────────────────

/**
 * Register the 4 EVF MCP resources (actor, combat, scene, log) on the MCP server.
 *
 * Wires cache change notifications to `server.server.sendResourceUpdated` so
 * subscribed MCP clients receive live updates when the bridge pushes deltas.
 *
 * @param server       - McpServer instance (tools already registered by registerEvfTools).
 * @param cache        - ResourceCache primed by WS subscriptions.
 * @param bridgeClient - BridgeClient for REST fallback on cache miss.
 * @param logger       - pino logger for warn-level REST fallback events.
 */
export function registerEvfResources(
  server: McpServer,
  cache: ResourceCache,
  bridgeClient: BridgeClient,
  logger: Logger,
): void {
  for (const uri of EVF_MCP_RESOURCE_URIS) {
    const meta = RESOURCE_META[uri];

    // Register the resource with a read callback
    server.registerResource(
      meta.name,
      uri,
      {
        title: meta.title,
        description: meta.description,
        mimeType: 'application/json',
      },
      async (url) => {
        const value = await readResource(uri, cache, bridgeClient, logger);
        return {
          contents: [
            {
              uri: url.toString(),
              mimeType: 'application/json',
              text: JSON.stringify(value),
            },
          ],
        };
      },
    );

    // Wire cache change notifications to sendResourceUpdated
    cache.onUpdate(uri, () => {
      // Use server.server (underlying Server instance) for sendResourceUpdated
      // McpServer only exposes sendResourceListChanged; sendResourceUpdated lives
      // on the underlying Server (verified: mcp.d.ts McpServer.server is Server).
      server.server.sendResourceUpdated({ uri }).catch((err: unknown) => {
        logger.warn(
          { err, uri },
          'register-resources: sendResourceUpdated failed (client may not be subscribed)',
        );
      });
    });
  }
}
