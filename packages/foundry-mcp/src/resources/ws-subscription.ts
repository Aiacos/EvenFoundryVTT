/**
 * Bridge WS delta subscription manager for the MCP resource cache.
 *
 * `subscribeToBridgeDeltas` registers a single message listener on the BridgeClient
 * that routes the 4 EVF delta envelope types into the ResourceCache:
 * - `character.delta`      → cache.set('actor://current', CharacterSnapshot)
 * - `combat.turn`          → cache.set('combat://current', CombatSnapshot)
 * - `scene.viewport`       → cache.set('scene://current', SceneViewport)
 * - `event.log.delta`      → cache.appendLog(EventLogEntry)
 *
 * All other envelope types (including `tool.result`, which is handled by BridgeClient's
 * FIFO dispatch path) are silently ignored. Invalid payloads that fail Zod parse are
 * dropped with a warn-level log entry — no cache mutation occurs (T-11-11 mitigation).
 *
 * Security (T-11-11):
 * - Per-type Zod `safeParse` validates every delta payload before cache write.
 * - Failed parses produce a warn log with the error message (no payload data logged).
 * - No BridgeClient mutation — purely reads the envelope and updates the cache.
 *
 * @see packages/foundry-mcp/src/resources/resource-cache.ts (cache)
 * @see packages/foundry-mcp/src/tools/bridge-client.ts (addMessageListener API)
 * @see .planning/phases/11-v2-foundry-mcp-server/11-03-PLAN.md Task 1
 */

import {
  CHARACTER_DELTA_TYPE,
  CharacterSnapshotSchema,
  COMBAT_TURN_DELTA_TYPE,
  CombatSnapshotSchema,
  EVENT_LOG_DELTA_TYPE,
  EventLogEntrySchema,
  SCENE_VIEWPORT_DELTA_TYPE,
  SceneViewportSchema,
} from '@evf/shared-protocol';
import type { Logger } from 'pino';
import type { BridgeClient } from '../tools/bridge-client.js';
import type { ResourceCache } from './resource-cache.js';

/**
 * Subscribe to bridge delta envelopes and route them into the resource cache.
 *
 * Installs a single message listener on `bridgeClient` that handles the 4 EVF
 * delta types and ignores everything else (especially `tool.result` which is
 * consumed by BridgeClient's FIFO dispatch path).
 *
 * @param bridgeClient - The BridgeClient instance to subscribe to.
 * @param cache        - The ResourceCache to update on each delta.
 * @param logger       - pino logger for warn-level payload validation failures.
 * @returns Unsubscribe function — call to remove the listener (e.g. on shutdown).
 */
export function subscribeToBridgeDeltas(
  bridgeClient: BridgeClient,
  cache: ResourceCache,
  logger: Logger,
): () => void {
  return bridgeClient.addMessageListener((envelope: Record<string, unknown>) => {
    const type = envelope['type'];

    switch (type) {
      case CHARACTER_DELTA_TYPE: {
        const parsed = CharacterSnapshotSchema.safeParse(envelope['payload']);
        if (parsed.success) {
          cache.set('actor://current', parsed.data);
        } else {
          logger.warn(
            { err: parsed.error.message, type: CHARACTER_DELTA_TYPE },
            'ws-subscription: character.delta payload invalid — cache not updated',
          );
        }
        return;
      }

      case COMBAT_TURN_DELTA_TYPE: {
        const parsed = CombatSnapshotSchema.safeParse(envelope['payload']);
        if (parsed.success) {
          cache.set('combat://current', parsed.data);
        } else {
          logger.warn(
            { err: parsed.error.message, type: COMBAT_TURN_DELTA_TYPE },
            'ws-subscription: combat.turn payload invalid — cache not updated',
          );
        }
        return;
      }

      case SCENE_VIEWPORT_DELTA_TYPE: {
        const parsed = SceneViewportSchema.safeParse(envelope['payload']);
        if (parsed.success) {
          cache.set('scene://current', parsed.data);
        } else {
          logger.warn(
            { err: parsed.error.message, type: SCENE_VIEWPORT_DELTA_TYPE },
            'ws-subscription: scene.viewport payload invalid — cache not updated',
          );
        }
        return;
      }

      case EVENT_LOG_DELTA_TYPE: {
        const parsed = EventLogEntrySchema.safeParse(envelope['payload']);
        if (parsed.success) {
          cache.appendLog(parsed.data);
        } else {
          logger.warn(
            { err: parsed.error.message, type: EVENT_LOG_DELTA_TYPE },
            'ws-subscription: event.log.delta payload invalid — cache not updated',
          );
        }
        return;
      }

      default:
        // Silently ignore all other types (tool.result, bearer.rotated, etc.)
        return;
    }
  });
}
