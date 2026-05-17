/**
 * Stdio transport entry for @evf/foundry-mcp.
 *
 * Usage (Claude Desktop claude_desktop_config.json):
 *   EVF_BEARER=<token> EVF_BRIDGE_URL=http://localhost:8910 node dist/index.js
 *
 * This file is intentionally minimal — a 5-line shim that composes the
 * shared pieces: env loading → logger → MCP server → stdio transport.
 *
 * IMPORTANT: The logger uses `destination: 'stderr'` so pino output does NOT
 * collide with the MCP stdio transport (which reads/writes JSON-RPC frames
 * on stdin/stdout). Any pino output to stdout would corrupt the MCP framing.
 *
 * Exit codes:
 * - 2 — BootError (missing/invalid env vars — D-11-01-AUTH convention)
 * - 1 — Unexpected runtime error
 * - 0 — Clean shutdown (Ctrl-C or client disconnect)
 *
 * HTTP+SSE is FORBIDDEN — only stdio transport used here.
 * (MCP spec rev 2025-06-18: Streamable HTTP replaced HTTP+SSE)
 *
 * @see packages/foundry-mcp/src/http.ts (Streamable HTTP entry)
 * @see .planning/phases/11-v2-foundry-mcp-server/11-01-PLAN.md Task 2
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { BootError, parseMcpEnv } from './env.js';
import { buildLogger } from './logger.js';
import { buildMcpServer } from './server-factory.js';

// Top-level async IIFE — stdio transport connects here.
(async () => {
  try {
    const env = parseMcpEnv();
    // CRITICAL: use destination:'stderr' so pino output does not collide with
    // the MCP stdio transport's JSON-RPC frames on stdout.
    const logger = buildLogger({ level: env.logLevel, destination: 'stderr' });
    const server = buildMcpServer({ logger, bridgeUrl: env.bridgeUrl, bearer: env.bearer });
    const transport = new StdioServerTransport();
    await server.connect(transport);
    logger.info('MCP stdio ready');
  } catch (err) {
    if (err instanceof BootError) {
      process.stderr.write(`BOOT_ERROR: ${err.message}\n`);
      process.exit(2);
    }
    process.stderr.write(`UNEXPECTED: ${String(err)}\n`);
    process.exit(1);
  }
})();
