/**
 * Barrel export for @evf/foundry-mcp resources module.
 *
 * Re-exports the three primary consumers:
 * - `ResourceCache`         — in-memory cache for the 4 MCP resource URIs.
 * - `subscribeToBridgeDeltas` — wires BridgeClient WS deltas into ResourceCache.
 * - `registerEvfResources`  — registers the 4 MCP resources on the McpServer.
 * - `EVF_MCP_RESOURCE_URIS` — readonly tuple used by Plan 11-04 verification grep.
 *
 * @see packages/foundry-mcp/src/resources/resource-cache.ts
 * @see packages/foundry-mcp/src/resources/ws-subscription.ts
 * @see packages/foundry-mcp/src/resources/register-resources.ts
 */

export type { EvfMcpResourceUri } from './register-resources.js';
export { EVF_MCP_RESOURCE_URIS, registerEvfResources } from './register-resources.js';
export type { ResourceUri, ResourceValueOf } from './resource-cache.js';
export { ResourceCache } from './resource-cache.js';
export { subscribeToBridgeDeltas } from './ws-subscription.js';
