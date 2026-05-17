/**
 * Barrel export for @evf/foundry-mcp tools module.
 *
 * Re-exports the two primary consumers:
 * - `registerEvfTools` — called by buildMcpServer to register 6 MCP tools.
 * - `BridgeClient` — WS proxy to the bridge's tool.invoke envelope path.
 * - `EVF_MCP_TOOL_IDS` — readonly tuple used by Plan 11-04 verification grep.
 *
 * @see packages/foundry-mcp/src/tools/register-tools.ts
 * @see packages/foundry-mcp/src/tools/bridge-client.ts
 */

export type {
  BridgeAuthExpiredError,
  BridgeClientOptions,
  BridgeInvokeResult,
} from './bridge-client.js';
export { BridgeClient } from './bridge-client.js';
export { EVF_MCP_TOOL_IDS, registerEvfTools } from './register-tools.js';
export type { EvfMcpToolId } from './tool-descriptions.js';
