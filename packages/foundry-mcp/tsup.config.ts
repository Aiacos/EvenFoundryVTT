/**
 * tsup build config for @evf/foundry-mcp.
 *
 * Two entries:
 * - src/index.ts — stdio transport entry (Claude Desktop local integration)
 * - src/http.ts  — Streamable HTTP transport entry (remote homelab via port 8911)
 *
 * Why `noExternal: ['@evf/shared-protocol']`:
 *   `@evf/shared-protocol`'s package.json points main/types/exports at
 *   `./src/index.ts` (workspace-link dev pattern). For Docker deployment,
 *   `pnpm deploy` copies that TS source into node_modules, but Node 24
 *   refuses to strip types from files under node_modules
 *   (ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING). Bundling shared-protocol
 *   into foundry-mcp's dist side-steps this — the deployed runtime
 *   never imports the workspace package at all. Same rationale as bridge.
 *
 * HTTP+SSE is FORBIDDEN — only stdio + Streamable HTTP per Specs.md §4.7
 * (confirmed 2026-05-17: modelcontextprotocol.io/specification/2025-06-18/basic/transports).
 *
 * @see Specs.md §4.7 (MCP transport), §11.5.3 (Docker deploy)
 * @see packages/bridge/tsup.config.ts (reference pattern)
 */

import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/http.ts'],
  format: ['esm'],
  target: 'node24',
  // Bundle the workspace shared-protocol package (its package.json points
  // main/exports at src/*.ts, which Node 24 cannot type-strip from node_modules).
  noExternal: ['@evf/shared-protocol'],
  clean: true,
  sourcemap: true,
});
