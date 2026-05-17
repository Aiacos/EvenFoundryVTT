/**
 * MCP server factory for @evf/foundry-mcp.
 *
 * Provides `buildMcpServer` — the shared seam used by BOTH transport entries
 * (stdio: src/index.ts, Streamable HTTP: src/http.ts). Dependency-injected so
 * tests can pass a silent logger without touching process.env.
 *
 * Phase 11-03 state: ResourceCache + WS subscription + 4 MCP resources wired in
 * addition to the 6 tools from Phase 11-02. Cache and subscription are lifecycle-
 * managed here so the entrypoints don't need to know about them.
 *
 * Security:
 * - The bearer is accepted as a constructor parameter and forwarded to BridgeClient.
 *   It is NEVER logged here (T-11-01).
 * - T-11-01: only `bridgeUrl` appears in the boot log, never `bearer`.
 * - BridgeAuthExpiredError from tool callbacks triggers process.exit(1) via the
 *   uncaughtException handler installed in the entrypoints.
 *
 * @see packages/foundry-mcp/src/index.ts (stdio entry)
 * @see packages/foundry-mcp/src/http.ts (Streamable HTTP entry)
 * @see packages/foundry-mcp/src/tools/bridge-client.ts (WS proxy)
 * @see packages/foundry-mcp/src/tools/register-tools.ts (6 tool registrations)
 * @see packages/foundry-mcp/src/resources/index.ts (4 resource registrations)
 * @see .planning/phases/11-v2-foundry-mcp-server/11-01-PLAN.md Task 2
 * @see .planning/phases/11-v2-foundry-mcp-server/11-02-PLAN.md Task 2
 * @see .planning/phases/11-v2-foundry-mcp-server/11-03-PLAN.md Task 2
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Logger } from 'pino';
import { ResourceCache, registerEvfResources, subscribeToBridgeDeltas } from './resources/index.js';
import { BridgeClient, type BridgeClientOptions } from './tools/bridge-client.js';
import { registerEvfTools } from './tools/register-tools.js';

/**
 * Dependency injection bag for `buildMcpServer`.
 *
 * All three fields are required. The bearer is forwarded to BridgeClient
 * for the WS handshake; it is never logged.
 */
export interface BuildMcpServerOptions {
  /** pino logger (with bearer-redacting config applied — T-11-01). */
  logger: Logger;
  /** HTTP URL of the EVF bridge, e.g. `http://localhost:8910`. */
  bridgeUrl: string;
  /**
   * Opaque 24h bearer token used to authenticate with the bridge.
   *
   * SECURITY: never pass this value to the logger or include it in an
   * error message. Forwarded to BridgeClient for the WS handshake.
   */
  bearer: string;
  /**
   * Optional BridgeClient factory for test injection.
   *
   * Production default: `new BridgeClient({ bridgeUrl, bearer, logger })`.
   * Tests: inject a stub that doesn't open real WS connections.
   */
  bridgeClientFactory?: (opts: BridgeClientOptions) => BridgeClient;
}

/**
 * Build and return a configured McpServer instance with 6 tools registered.
 *
 * Constructs a BridgeClient, registers all 6 EVF tools via registerEvfTools,
 * and returns the server ready to be connected to a transport.
 *
 * NOTE: This function is synchronous. BridgeClient.ready is a Promise that
 * the entrypoints (index.ts, http.ts) should await before connecting the
 * transport if they need to guarantee the WS connection is established.
 * For the skeleton, we register tools immediately — the BridgeClient will
 * resolve ready in the background and handle in-flight calls appropriately.
 *
 * @param opts - Dependency injection bag (logger + bridgeUrl + bearer + optional factory).
 * @returns Configured McpServer with 6 tools registered.
 */
export function buildMcpServer(opts: BuildMcpServerOptions): McpServer {
  const { logger, bridgeUrl } = opts;
  // NOTE: opts.bearer is NOT destructured here to prevent accidental
  // inclusion in template literals or log calls below (T-11-01).

  const server = new McpServer({
    name: 'evf-foundry-mcp',
    version: '0.1.0-alpha.0',
  });

  // Log the boot event with bridgeUrl only — bearer is intentionally absent.
  logger.info(
    { bridgeUrl },
    'MCP server initialising — connecting BridgeClient and registering tools + resources',
  );

  // Construct BridgeClient (real or injected stub for tests).
  const factory = opts.bridgeClientFactory ?? ((o: BridgeClientOptions) => new BridgeClient(o));
  const bridgeClient = factory({ bridgeUrl, bearer: opts.bearer, logger });

  // Register all 6 EVF tools — uses .shape extraction from Phase 7 Zod schemas.
  registerEvfTools(server, bridgeClient, logger);

  // Phase 11-03: wire resource cache + WS delta subscription + 4 MCP resources.
  const cache = new ResourceCache();
  subscribeToBridgeDeltas(bridgeClient, cache, logger);
  registerEvfResources(server, cache, bridgeClient, logger);

  return server;
}
