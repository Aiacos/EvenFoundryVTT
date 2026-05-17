---
phase: 11-v2-foundry-mcp-server
plan: "01"
subsystem: foundry-mcp
tags: [mcp, stdio, streamable-http, scaffold, bearer-auth, pino, tsup]
dependency_graph:
  requires: []
  provides:
    - "@evf/foundry-mcp workspace package — 7th workspace package alongside g2-app, bridge, foundry-module, shared-protocol, shared-render, validation-harness"
    - "buildMcpServer({ logger, bridgeUrl, bearer }) factory returning McpServer"
    - "StdioServerTransport entry (dist/index.js) with pino→stderr to avoid JSON-RPC collision"
    - "StreamableHTTPServerTransport entry (dist/http.js) port 8911 with timingSafeEqual bearer check"
    - "parseMcpEnv() env loader with BootError (bearer never in message — T-11-01)"
    - "buildLogger() pino factory with BEARER_REDACT_PATHS"
  affects:
    - "vitest.config.ts (root) — new package auto-discovered via packages/* glob"
    - "pnpm-lock.yaml — @modelcontextprotocol/sdk@1.29.0 + pino + zod added"
tech_stack:
  added:
    - "@modelcontextprotocol/sdk@1.29.0"
    - "pino@10.3.1 (package dep)"
    - "zod@4.4.3 (package dep)"
  patterns:
    - "TDD RED→GREEN per task (2 tasks × 2 commits each)"
    - "Dependency injection pattern (logger + bridgeUrl + bearer passed to factory)"
    - "exactOptionalPropertyTypes workaround: SDK onclose type mismatch via `as unknown as Transport` cast"
key_files:
  created:
    - packages/foundry-mcp/package.json
    - packages/foundry-mcp/tsconfig.json
    - packages/foundry-mcp/tsup.config.ts
    - packages/foundry-mcp/vitest.config.ts
    - packages/foundry-mcp/README.md
    - packages/foundry-mcp/src/env.ts
    - packages/foundry-mcp/src/env.test.ts
    - packages/foundry-mcp/src/logger.ts
    - packages/foundry-mcp/src/server-factory.ts
    - packages/foundry-mcp/src/server-factory.test.ts
    - packages/foundry-mcp/src/index.ts
    - packages/foundry-mcp/src/http.ts
  modified:
    - pnpm-lock.yaml
decisions:
  - "Omit sessionIdGenerator (not pass undefined) per exactOptionalPropertyTypes — stateless behaviour achieved without explicit undefined"
  - "biome-ignore cast for StreamableHTTPServerTransport.onclose type mismatch — upstream SDK typing issue with strict TS"
  - "pino destination:'stderr' for stdio entry — prevents JSON-RPC frame corruption on stdout"
  - "McpServer.tools/list handler is lazy (setToolRequestHandlers only called on first registerTool) — test 4 changed to verify connect() succeeds, not empty tools list"
metrics:
  duration_minutes: 10
  tasks_completed: 2
  files_created: 12
  files_modified: 1
  completed_date: "2026-05-17"
---

# Phase 11 Plan 01: foundry-mcp scaffold + transports + env bearer Summary

Scaffolded `packages/foundry-mcp/` as the 7th workspace package with stdio and Streamable HTTP MCP server entries, env-var bearer loading, pino logger with redaction, and tsup build config mirroring the bridge.

## Tasks

| Task | Type | Status | Commit |
|------|------|--------|--------|
| 1: Workspace scaffold + env-loader + logger | TDD | DONE | 85a3a43 |
| 2: MCP server factory + stdio + HTTP entries | TDD | DONE | da6c728 |

## TDD Cycle

**Task 1:**
- RED commit: `9b48984` — env.test.ts 7 cases (fail: env.ts not yet created)
- GREEN commit: `85a3a43` — env.ts + logger.ts (7/7 tests pass)

**Task 2:**
- RED commit: `aabf2b9` — server-factory.test.ts 4 cases (fail: server-factory.js not yet created)
- GREEN commit: `da6c728` — server-factory.ts + index.ts + http.ts (11/11 tests pass)

## Verification Results

- `pnpm --filter @evf/foundry-mcp test`: 11/11 PASS
- `pnpm --filter @evf/foundry-mcp typecheck`: CLEAN
- `pnpm lint:ci`: No errors (178 pre-existing warnings across repo)
- `pnpm --filter @evf/foundry-mcp build`: dist/index.js + dist/http.js produced
- `EVF_BEARER='' node dist/index.js`: exits 2 with `BOOT_ERROR: EVF_BEARER required`
- `grep -rE "^import.*server/sse" src/`: NO MATCHES (HTTP+SSE forbidden gate)
- `pnpm list -r --depth 0 | grep foundry-mcp`: `@evf/foundry-mcp@0.1.0-alpha.0` FOUND

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] McpServer.tools/list is lazy — not registered until registerTool() called**
- **Found during:** Task 2, test case 4
- **Issue:** The plan expected tools/list to return `{ tools: [] }` from a skeleton server. The SDK only registers the tools/list handler via `setToolRequestHandlers()` which is called from the first `registerTool()` call. Without tools, tools/list returns `-32601 Method not found`.
- **Fix:** Updated test 4 to verify `client.connect()` succeeds and `getServerVersion()` returns correct name/version. The empty-tools-list test is deferred to register-tools.test.ts in Plan 11-02.
- **Files modified:** `src/server-factory.test.ts`
- **Impact:** No production code change — test expectation adjusted to match actual SDK behavior.

**2. [Rule 1 - Bug] exactOptionalPropertyTypes TS error for sessionIdGenerator**
- **Found during:** Task 2, typecheck
- **Issue:** `new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })` is a type error with `exactOptionalPropertyTypes: true` — passing `undefined` explicitly is not the same as omitting the property.
- **Fix:** Changed to `new StreamableHTTPServerTransport({})` (omit property entirely — stateless behaviour is the default when property is absent).
- **Files modified:** `src/http.ts`

**3. [Rule 1 - Bug] exactOptionalPropertyTypes TS error for Transport.onclose**
- **Found during:** Task 2, typecheck
- **Issue:** `StreamableHTTPServerTransport.onclose` is typed as `(() => void) | undefined` but `server.connect()` expects `Transport` where `onclose: () => void`. Upstream SDK type inconsistency.
- **Fix:** Cast `transport as unknown as Transport` with biome-ignore annotation explaining the upstream issue.
- **Files modified:** `src/http.ts`

## Known Stubs

None — this is a pure scaffold plan. No data flows yet (tools registered in Plan 11-02).

## Threat Surface Scan

| Flag | File | Description |
|------|------|-------------|
| threat_flag: bearer-env-var | src/env.ts | EVF_BEARER env var — operator must use Docker secrets / systemd EnvironmentFile to avoid ps-visible secrets. Documented in README.md. |
| threat_flag: http-port-8911 | src/http.ts | New HTTP listener on 0.0.0.0:8911. Bearer pre-check (timingSafeEqual) protects all routes before transport.handleRequest. T-11-02 mitigation applied. |

## Self-Check: PASSED

- [x] packages/foundry-mcp/src/env.ts — EXISTS
- [x] packages/foundry-mcp/src/logger.ts — EXISTS
- [x] packages/foundry-mcp/src/server-factory.ts — EXISTS
- [x] packages/foundry-mcp/src/index.ts — EXISTS
- [x] packages/foundry-mcp/src/http.ts — EXISTS
- [x] packages/foundry-mcp/dist/index.js — EXISTS (tsup build)
- [x] packages/foundry-mcp/dist/http.js — EXISTS (tsup build)
- [x] Commit 9b48984 — RED Task 1
- [x] Commit 85a3a43 — GREEN Task 1
- [x] Commit aabf2b9 — RED Task 2
- [x] Commit da6c728 — GREEN Task 2
