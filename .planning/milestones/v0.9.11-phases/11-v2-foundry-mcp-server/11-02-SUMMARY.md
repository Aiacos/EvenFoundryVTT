---
phase: "11"
plan: "02"
subsystem: foundry-mcp
tags: [mcp, tools, bridge-client, tdd, websocket, zod-shape]
dependency_graph:
  requires:
    - "11-01"  # scaffold — McpServer, stdio/HTTP entries, env, logger
    - "07"     # shared-protocol Zod schemas (CastSpellInputSchema etc.)
    - "bridge ws/tool-invoke" # bridge WS endpoint for tool.invoke envelope
  provides:
    - "registerEvfTools — 6 MCP tools wired to BridgeClient"
    - "BridgeClient — WS proxy with FIFO queue and BridgeAuthExpiredError"
    - "EVF_MCP_TOOL_IDS — const tuple for Plan 11-04 grep"
  affects:
    - "packages/foundry-mcp/src/server-factory.ts (updated)"
    - "packages/foundry-mcp/src/tools/* (new)"
tech_stack:
  added:
    - "@modelcontextprotocol/sdk InMemoryTransport + Client — round-trip test transport"
  patterns:
    - "Zod .shape extraction — zero schema duplication, all 6 schemas from @evf/shared-protocol"
    - "wsFactory injection — testable BridgeClient without real WS connections"
    - "FIFO queue — one in-flight WS call at a time (bridge lacks idempotencyKey echo)"
    - "snakeToKebab — cast_spell → cast-spell for bridge toolId field"
key_files:
  created:
    - "packages/foundry-mcp/src/tools/bridge-client.ts"
    - "packages/foundry-mcp/src/tools/bridge-client.test.ts"
    - "packages/foundry-mcp/src/tools/tool-descriptions.ts"
    - "packages/foundry-mcp/src/tools/register-tools.ts"
    - "packages/foundry-mcp/src/tools/register-tools.test.ts"
    - "packages/foundry-mcp/src/tools/index.ts"
  modified:
    - "packages/foundry-mcp/src/server-factory.ts (bridgeClientFactory injection + registerEvfTools wiring)"
    - "packages/foundry-mcp/src/env.ts (Number.isNaN fix)"
    - "packages/foundry-mcp/src/http.ts (unused biome-ignore removed, catch binding fix)"
    - "packages/foundry-mcp/src/tools/bridge-client.ts (template literal + catch binding fixes)"
decisions:
  - "All 6 tools route WS-only via tool.invoke — REST /v1/tools/:name returns phase-07-pending stubs and drop_concentration has no REST route"
  - "FIFO queue design because bridge tool.result has no idempotencyKey echo field"
  - "BridgeClient.ready always resolves (never rejects) for safe await in entrypoints"
  - "MCP client.callTool() does NOT reject on -32602 — returns isError:true (MCP protocol spec)"
  - "catch {} (no binding) preferred over catch (err) when error is not used"
metrics:
  duration: "~2h (continuation of 11-01 session)"
  completed: "2026-05-17"
  tasks_completed: 2
  files_modified: 10
---

# Phase 11 Plan 02: BridgeClient + 6 MCP Tools Summary

**One-liner:** WS proxy BridgeClient with FIFO queue and 6 MCP tools registered via Phase 7 Zod `.shape` extraction — zero schema duplication, 29/29 tests pass.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | BridgeClient WS proxy (TDD) | `bf471c2` (RED) + `b298529` (GREEN) | bridge-client.ts, bridge-client.test.ts |
| 2 | Register 6 MCP tools + wire server-factory (TDD) | `962e95c` (RED) + `bec1f2d` (GREEN) | register-tools.ts, tool-descriptions.ts, tools/index.ts, server-factory.ts (updated) |

## Test Results

```
Test Files  4 passed (4)
     Tests  29 passed (29)
  Duration  515ms
```

- `env.test.ts` — 7 cases (parseMcpEnv, BootError, bearer validation)
- `server-factory.test.ts` — 4 cases (McpServer construction, tool registration, factory injection)
- `bridge-client.test.ts` — 10 cases (WS handshake, FIFO, auth error, bridge_unreachable, kebab toolId)
- `register-tools.test.ts` — 8 cases (6 tools count/names, schema properties, callbacks, auth error, validation)

## Verification Checks

- Zero `z.object` schema duplication in `packages/foundry-mcp/src/`: `grep -rE '^\s*z\.object' src/` = 0 matches
- All 6 schemas use `.shape`: 6 matches for `InputSchema\.shape` in `register-tools.ts`
- No SSE import: `grep -rE "^import.*server/sse" src/` = 0 matches
- Build: `dist/http.js` (3.49 KB) + `dist/index.js` (811 B) + `dist/chunk-3QSP4BK4.js` (35.59 KB)

## Architecture: BridgeClient Design

```
MCP tool callback
  │
  └─► bridgeClient.invokeTool('cast_spell', args)
        │  (snake→kebab: 'cast-spell' in envelope toolId)
        │
        ▼
      FIFO queue (one in-flight at a time)
        │
        ▼
      WS send: { proto:'evf-v1', type:'tool.invoke', payload: { toolId, idempotencyKey, args } }
        │
        ▼
      Await tool.result from bridge
        │
        ├─ success → { success: true, data }
        ├─ error → { success: false, error: '<code>' }
        └─ WS close 4001 → throws BridgeAuthExpiredError
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] MCP SDK case 8 test expectation — client.callTool() resolves on -32602**
- **Found during:** Task 2 GREEN verification
- **Issue:** Test case 8 expected `client.callTool()` to reject (`.rejects.toThrow()`) on invalid args. The MCP SDK maps -32602 Invalid Params to a resolved `{ isError: true }` result — it never rejects.
- **Fix:** Changed case 8 to assert `result.isError === true` and `content.text` contains 'slot_level', verify `invokeSpy` not called
- **Commit:** `bec1f2d`

**2. [Rule 1 - Bug] Unused `catch` bindings in bridge-client.ts**
- **Found during:** Task 2 lint check (`noUnusedVariables`)
- **Issue:** Two `catch (err)` blocks where `err` was never used
- **Fix:** Changed to `catch {}` (ES2019 optional binding)
- **Commit:** `bec1f2d`

**3. [Rule 1 - Bug] `isNaN` → `Number.isNaN` in env.ts**
- **Found during:** Task 2 lint check (`noGlobalIsNan` — error-level rule)
- **Issue:** Global `isNaN` coerces before checking, `Number.isNaN` is exact
- **Fix:** `Number.isNaN(parsed)`
- **Commit:** `bec1f2d`

**4. [Rule 1 - Bug] Unused biome-ignore suppression in http.ts**
- **Found during:** Task 2 lint check (`suppressions/unused` — error-level rule)
- **Issue:** `biome-ignore lint/suspicious/noExplicitAny` on a line that used `as unknown as Type`, not `any`
- **Fix:** Removed suppression comment, kept explanatory prose comment
- **Commit:** `bec1f2d`

**5. [Rule 1 - Bug] String concatenation → template literal in bridge-client.ts**
- **Found during:** Task 2 lint check (`useTemplate` info rule)
- **Issue:** `opts.bridgeUrl.replace(/^http/, 'ws') + '/ws'` should be template literal
- **Fix:** `` `${opts.bridgeUrl.replace(/^http/, 'ws')}/ws` ``
- **Commit:** `bec1f2d`

**6. [Rule 1 - Bug] TS18046 `result.content` is unknown — cast needed in test assertions**
- **Found during:** Task 2 typecheck after case 8 test fix
- **Issue:** `CallToolResult.content` is typed as `unknown` — array index access returned `unknown`
- **Fix:** Cast to `Array<{ type: string; text: string }>` with `[0]!` non-null assertion + biome-ignore
- **Commit:** `bec1f2d`

## Known Stubs

None. All 6 MCP tools route through real BridgeClient.invokeTool — no placeholders.

## Threat Flags

None. No new network endpoints or auth surfaces beyond what was planned. BridgeClient WS uses the existing bearer (CONN-05) and bridge validates at WS-receive boundary. Three-layer validation: SDK Zod → bridge ToolInvocationEnvelopePayloadSchema → foundry-module argsSchema.

## TDD Gate Compliance

| Phase | RED commit | GREEN commit |
|-------|-----------|-------------|
| Task 1: BridgeClient | `bf471c2` test(11-02): RED | `b298529` feat(11-02): GREEN |
| Task 2: registerEvfTools | `962e95c` test(11-02): RED | `bec1f2d` feat(11-02): GREEN |

## Self-Check: PASSED

All 7 required files found on disk. All 4 commits (bf471c2, b298529, 962e95c, bec1f2d) verified in git log. Build produces correct output. 29/29 tests pass. Zero lint errors in foundry-mcp package.
