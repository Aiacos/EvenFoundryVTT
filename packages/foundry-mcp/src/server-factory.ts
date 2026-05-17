/**
 * MCP server factory for @evf/foundry-mcp.
 *
 * Provides `buildMcpServer` — the shared seam used by BOTH transport entries
 * (stdio: src/index.ts, Streamable HTTP: src/http.ts). Dependency-injected so
 * tests can pass a silent logger without touching process.env.
 *
 * Phase 11-01 state: no tools or resources registered yet.
 * Plan 11-02 extends this factory by calling `registerEvfTools(server, ...)`.
 *
 * Security:
 * - The bearer is accepted as a constructor parameter and stored on the closure
 *   for Plan 11-02 to pass to `BridgeClient`. It is NEVER logged here.
 * - T-11-01: only `bridgeUrl` appears in the boot log, never `bearer`.
 *
 * @see packages/foundry-mcp/src/index.ts (stdio entry)
 * @see packages/foundry-mcp/src/http.ts (Streamable HTTP entry)
 * @see .planning/phases/11-v2-foundry-mcp-server/11-01-PLAN.md Task 2
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Logger } from 'pino';

/**
 * Dependency injection bag for `buildMcpServer`.
 *
 * All three fields are required. The bearer is stored on the closure for
 * Plan 11-02 to use when constructing `BridgeClient`; it is never logged.
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
   * error message. Plan 11-02 forwards it to BridgeClient for the WS
   * handshake and tool.invoke envelope path.
   */
  bearer: string;
}

/**
 * Build and return a configured McpServer instance.
 *
 * The returned server has no tools or resources registered — Plan 11-02
 * extends this factory by calling `registerEvfTools(server, bridgeClient, logger)`
 * after the BridgeClient WS connection is established.
 *
 * @param opts - Dependency injection bag (logger + bridgeUrl + bearer).
 * @returns Configured McpServer ready to be connected to a transport.
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
    'MCP server initialised (no tools registered yet — Plan 11-02 wires Tool Registry)',
  );

  return server;
}
