/**
 * Register 4 MCP resources on the McpServer.
 *
 * Implemented in Plan 11-03 Task 2.
 *
 * @see .planning/phases/11-v2-foundry-mcp-server/11-03-PLAN.md Task 2
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Logger } from 'pino';
import type { BridgeClient } from '../tools/bridge-client.js';
import type { ResourceCache } from './resource-cache.js';

/**
 * Readonly tuple of all 4 EVF MCP resource URIs.
 * Used by Plan 11-04 verification grep.
 */
export const EVF_MCP_RESOURCE_URIS = [
  'actor://current',
  'combat://current',
  'scene://current',
  'log://recent',
] as const;

export type EvfMcpResourceUri = (typeof EVF_MCP_RESOURCE_URIS)[number];

/**
 * Register the 4 EVF MCP resources (actor, combat, scene, log) on the MCP server.
 *
 * Each resource has a read callback that returns the cached value or falls back
 * to a REST call to the bridge if the cache is cold.
 *
 * Wires `server.sendResourceUpdated` notifications to cache change events.
 */
export function registerEvfResources(
  _server: McpServer,
  _cache: ResourceCache,
  _bridgeClient: BridgeClient,
  _logger: Logger,
): void {
  // Implemented in Task 2 — placeholder to satisfy Task 1 typecheck.
}
