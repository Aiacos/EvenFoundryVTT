---
phase: 11-v2-foundry-mcp-server
plan: "03"
subsystem: mcp
tags: [mcp, resources, cache, websocket, zod, bridge-client, ring-buffer]

# Dependency graph
requires:
  - phase: 11-v2-foundry-mcp-server/11-02
    provides: BridgeClient WS proxy + FIFO queue + 6 MCP tools + BridgeAuthExpiredError
  - phase: 02-foundry-module-bridge
    provides: CharacterSnapshotSchema, CombatSnapshotSchema, SceneViewportSchema, EventLogEntrySchema, delta type constants, REST endpoints (/v1/character, /v1/combat/current, /v1/scene/viewport, /v1/events)

provides:
  - ResourceCache class — in-memory store for 4 MCP resource URIs with LogRing(50), onUpdate subscribers, clear()
  - subscribeToBridgeDeltas — Zod safeParse routing of 4 delta envelope types into ResourceCache (T-11-11 defense-in-depth)
  - registerEvfResources — 4 McpServer resources (actor, combat, scene, log) with cache-or-REST-fallback read callbacks
  - BridgeClient.addMessageListener — fan-out WS message listener API (non-tool.result messages only)
  - BridgeClient REST fallback methods — getCharacterSnapshot, getCombatSnapshot, getSceneViewport, getEventLog
  - EVF_MCP_RESOURCE_URIS readonly tuple — ['actor://current','combat://current','scene://current','log://recent']
  - EVF_ACTOR_ID optional env var support in env.ts

affects:
  - 11-04 (smoke test verifies 4 resources exposed; grep-gate checks EVF_MCP_RESOURCE_URIS)
  - 11-04 (server-factory integration tested end-to-end in Inspector smoke test)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Read-through cache pattern: cache hit returns snapshot; cache miss falls back to REST endpoint then populates implicitly on next WS delta"
    - "Pub/sub via onUpdate(uri, cb): ResourceCache notifies per-URI subscribers; register-resources wires sendResourceUpdated to those callbacks"
    - "Local LogRing(50) pattern: FIFO ring buffer capped at 50 entries; oldest evicted on overflow (FIFO shift); no shared-protocol dep needed"
    - "BridgeClient fan-out: non-tool.result WS messages fan out to addMessageListener subscribers; tool.result exclusively consumed by pending Promise queue"
    - "Zod safeParse per delta type: on failure drop + warn, never mutate cache (T-11-11 defense-in-depth)"

key-files:
  created:
    - packages/foundry-mcp/src/resources/resource-cache.ts
    - packages/foundry-mcp/src/resources/resource-cache.test.ts
    - packages/foundry-mcp/src/resources/ws-subscription.ts
    - packages/foundry-mcp/src/resources/ws-subscription.test.ts
    - packages/foundry-mcp/src/resources/register-resources.ts
    - packages/foundry-mcp/src/resources/register-resources.test.ts
    - packages/foundry-mcp/src/resources/index.ts
  modified:
    - packages/foundry-mcp/src/tools/bridge-client.ts
    - packages/foundry-mcp/src/server-factory.ts
    - packages/foundry-mcp/src/env.ts
    - packages/foundry-mcp/src/env.test.ts

key-decisions:
  - "Used EventLogEntry (event.log.delta) NOT Phase 5 LogEvent for log://recent — EventLog is the bridge-level event tail used for replay; more general-purpose for LLM grounding"
  - "Local LogRing class (~15 LOC) in resource-cache.ts — NOT promoted to shared-protocol (separate processes, Phase 11 scope boundary)"
  - "cache.get('log://recent') returns undefined on empty ring (not []) so REST fallback triggers on cold start"
  - "sendResourceUpdated accessed via server.server.sendResourceUpdated — McpServer wraps underlying Server; sendResourceUpdated only exists on Server"
  - "COMBAT_TURN_DELTA_TYPE='combat.turn' and SCENE_VIEWPORT_DELTA_TYPE='scene.viewport' (actual shared-protocol values, different from plan interface docs)"
  - "EVF_ACTOR_ID optional env var added — empty string means auto-detect; getCharacterSnapshot(actorId?) passes env value when present"

patterns-established:
  - "ResourceCache is the central coordination point for all 4 MCP resources — always obtain snapshot via cache.get() then REST fallback, never bypass the cache"
  - "All WS subscriptions installed via subscribeToBridgeDeltas — never install raw ws.onmessage handlers in resource layers"

requirements-completed: [VOICE-02, VOICE-03]

# Metrics
duration: 90min
completed: 2026-05-17
---

# Phase 11 Plan 03: MCP Resources + WS Subscription Summary

**ResourceCache + WS delta subscription + 4 MCP resources (actor/combat/scene/log) with cache-or-REST-fallback reads and live `sendResourceUpdated` notifications wired via LogRing(50)**

## Performance

- **Duration:** ~90 min (across 2 sessions)
- **Started:** 2026-05-17T05:30:00Z
- **Completed:** 2026-05-17T07:46:00Z
- **Tasks:** 2 (both TDD: RED + GREEN each)
- **Files modified:** 11

## Accomplishments

- ResourceCache in-memory store with typed get/set API, 50-entry FIFO LogRing, per-URI onUpdate subscriber registry, and clear() preserving subscribers
- subscribeToBridgeDeltas routes 4 delta envelope types (character.delta, combat.turn, scene.viewport, event.log.delta) via per-type Zod safeParse; invalid payloads dropped + warn logged without cache mutation (T-11-11)
- 4 MCP resources registered: actor://current, combat://current, scene://current, log://recent — each with cache hit path and REST fallback via 4 new BridgeClient methods
- sendResourceUpdated fires on every cache.set and appendLog via onUpdate subscribers
- BridgeClient.addMessageListener fan-out added — non-tool.result messages reach WS subscription listeners without interfering with tool dispatch queue

## Task Commits

1. **Task 1: ResourceCache + WS subscription RED** - `1ff0dc7` (test)
2. **Task 1: ResourceCache + WS subscription GREEN** - `f6ca2e6` (feat)
3. **Task 2: registerEvfResources + REST fallback RED** - `fc259d0` (test)
4. **Task 2: registerEvfResources + REST fallback GREEN** - `10b70a4` (feat)

## Files Created/Modified

- `packages/foundry-mcp/src/resources/resource-cache.ts` — ResourceCache class with LogRing(50), typed get/set/appendLog/onUpdate/clear
- `packages/foundry-mcp/src/resources/resource-cache.test.ts` — 7 test cases (ring eviction, subscriber isolation, clear preserving subs)
- `packages/foundry-mcp/src/resources/ws-subscription.ts` — subscribeToBridgeDeltas routing 4 delta types with per-type Zod safeParse
- `packages/foundry-mcp/src/resources/ws-subscription.test.ts` — 8 test cases including tool.result coexistence test
- `packages/foundry-mcp/src/resources/register-resources.ts` — EVF_MCP_RESOURCE_URIS, RESOURCE_META, registerEvfResources with readResource (cache-or-REST)
- `packages/foundry-mcp/src/resources/register-resources.test.ts` — 7 test cases using InMemoryTransport pair
- `packages/foundry-mcp/src/resources/index.ts` — barrel export for all resources module exports
- `packages/foundry-mcp/src/tools/bridge-client.ts` — addMessageListener fan-out + _restGet helper + 4 REST fallback methods
- `packages/foundry-mcp/src/server-factory.ts` — wires ResourceCache + subscribeToBridgeDeltas + registerEvfResources after registerEvfTools
- `packages/foundry-mcp/src/env.ts` — EVF_ACTOR_ID optional field (string, default '')
- `packages/foundry-mcp/src/env.test.ts` — updated case 1 (actorId: ''), added case 1b (EVF_ACTOR_ID passthrough)

## Decisions Made

- **EventLogEntry for log://recent** — Used Phase 2 EventLogEntry (event.log.delta) not Phase 5 LogEvent. EventLog is the bridge-level replay buffer; more general-purpose for LLM context grounding. Phase 5 LogEvent serves g2-app panel display which has different shape requirements.
- **Local LogRing** — Implemented ~15-LOC local class instead of importing from foundry-module. The packages run in separate processes; adding a cross-package dep to access a 15-line utility would be over-engineering.
- **cache.get('log://recent') returns undefined on empty ring** — Ensures REST fallback fires on cold start rather than returning an empty array that looks like "no events".
- **server.server.sendResourceUpdated** — McpServer is a wrapper; sendResourceUpdated only exists on the underlying Server instance. Discovered by reading SDK type declarations.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Plan interface docs listed wrong delta type constants**
- **Found during:** Task 1 (ws-subscription implementation)
- **Issue:** Plan's `<interfaces>` section listed `COMBAT_TURN_DELTA_TYPE = 'combat.turn.delta'` and `SCENE_VIEWPORT_DELTA_TYPE = 'scene.viewport.delta'` but actual constants in shared-protocol are `'combat.turn'` and `'scene.viewport'`
- **Fix:** Read actual source files (combat.ts, scene.ts) before wiring; used correct constant values
- **Files modified:** ws-subscription.ts (used actual constants)
- **Verification:** All 8 ws-subscription tests pass with real envelope types

**2. [Rule 1 - Bug] McpServer.sendResourceUpdated does not exist**
- **Found during:** Task 2 (register-resources implementation + test case 7)
- **Issue:** Plan showed `server.sendResourceUpdated({ uri })` but McpServer class does not have this method — only the underlying `server.server` (Server instance) does
- **Fix:** Used `server.server.sendResourceUpdated({ uri })` throughout register-resources.ts; test spy targets `server.server`
- **Files modified:** register-resources.ts, register-resources.test.ts
- **Verification:** Test case 7 passes (spy on server.server.sendResourceUpdated confirmed called once)

**3. [Rule 1 - Bug] env.test.ts case 1 shape mismatch after actorId added**
- **Found during:** Task 2 (env.ts extension)
- **Issue:** Adding `actorId` to McpEnv return broke case 1's `toEqual` exact-shape assertion
- **Fix:** Updated case 1 to include `actorId: ''`; added new case 1b asserting EVF_ACTOR_ID passthrough
- **Files modified:** env.test.ts
- **Verification:** All env tests pass

---

**Total deviations:** 3 auto-fixed (all Rule 1 — bugs in plan interface docs / SDK API discovery)
**Impact on plan:** All fixes correct plan doc errors; no scope change. All 52 tests pass.

## Issues Encountered

- Biome 2.4.15 required explicit formatting pass after initial implementation (`pnpm exec biome check --write` on 7 files). Long REST method chains and `await (res.json()) as T` parenthesization needed.
- SDK `ReadResourceResult.contents[0]` is a union type `{ text: string } | { blob: string }` — test assertions required explicit type cast to access `.text`.

## Verification Gates Passed

- 4 resources registered: `actor://current`, `combat://current`, `scene://current`, `log://recent`
- 52/52 foundry-mcp tests passing
- TypeScript strict: PASS
- Lint CI: 0 errors (201 pre-existing warnings in workspace, unrelated)
- 14-socketlib-handler invariant: STILL 14 (`grep -c registerComplexHandler packages/foundry-module/src/pair/socketlib-handlers.ts`)
- No HTTP+SSE imports: PASS (comment in http.ts is not an import)
- No external package edits: PASS (`git diff packages/bridge packages/foundry-module packages/shared-protocol packages/g2-app` = empty)

## Known Stubs

None — all 4 resources have live cache + REST fallback wired. EVF_ACTOR_ID="" means getCharacterSnapshot is called without actorId argument; bridge's Phase 2 character endpoint handles actor resolution server-side.

## Threat Surface Scan

No new network endpoints introduced. All additions are within the foundry-mcp process boundary (in-process cache, MCP resource registration). Bridge REST calls use existing Phase 2 endpoints. No new trust boundaries introduced beyond those documented in the plan's threat model (T-11-11 through T-11-14).

## Next Phase Readiness

- Plan 11-04 can proceed immediately: registerEvfResources is wired, EVF_MCP_RESOURCE_URIS is exported (needed for smoke test grep gate), server-factory integrates both tools and resources
- bridge-soft-fail refinement (11-04 Task 1): BridgeClient has the addMessageListener API needed to test connectivity; `isConnected()` / `markUnreachable()` extension points available
- Inspector smoke test (11-04 Task 2): dist/index.js will expose 6 tools + 4 resources when compiled

---
*Phase: 11-v2-foundry-mcp-server*
*Completed: 2026-05-17*
