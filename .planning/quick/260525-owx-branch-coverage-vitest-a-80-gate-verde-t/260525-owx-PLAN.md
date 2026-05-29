---
phase: quick-260525-owx
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/foundry-mcp/src/security/bearer-equals.ts
  - packages/foundry-mcp/src/security/bearer-equals.test.ts
  - packages/foundry-mcp/src/http.ts
  - vitest.config.ts
  - packages/foundry-mcp/src/tools/bridge-client.test.ts
  - packages/foundry-mcp/src/logger.test.ts
  - packages/bridge/src/routes/scene.test.ts
  - packages/bridge/src/routes/character.test.ts
  - packages/bridge/src/routes/combat.test.ts
  - packages/bridge/src/ws/tool-invoke.test.ts
autonomous: true
requirements: [COV-BRANCH-80]
must_haves:
  truths:
    - "pnpm test:coverage exits 0 with global branch coverage ≥80%"
    - "bearerEquals constant-time bearer comparison is covered by unit tests"
    - "Every new vitest exclusion carries inline migration-rule justification"
    - "No production logic changed except the minimal bearerEquals extraction"
    - "All new tests are real assertions (no skipped/empty/it.todo)"
  artifacts:
    - path: "packages/foundry-mcp/src/security/bearer-equals.ts"
      provides: "Extracted constant-time bearer comparison (T-11-02)"
      contains: "export function bearerEquals"
    - path: "packages/foundry-mcp/src/security/bearer-equals.test.ts"
      provides: "Unit tests for bearerEquals (equal/unequal/length-mismatch/empty/timing-safe)"
    - path: "vitest.config.ts"
      provides: "3 new justified coverage exclusions (worker + 2 boot entries)"
      contains: "raster-worker.ts"
  key_links:
    - from: "packages/foundry-mcp/src/http.ts"
      to: "packages/foundry-mcp/src/security/bearer-equals.ts"
      via: "import { bearerEquals }"
      pattern: "from './security/bearer-equals"
---

<objective>
Raise global Vitest branch coverage from 78.11% to ≥80% (gate green) using a hybrid of three legitimate structural exclusions + real branch tests on shipped logic. Before excluding the foundry-mcp HTTP boot entry, extract its `bearerEquals` constant-time bearer comparison (T-11-02 security primitive) into a tested module so the security branch stays under coverage.

Purpose: The Vitest CI coverage gate (80% branches) currently fails at 78.11%. Only the branch metric fails (stmts/funcs/lines all pass). Per INV-4, the fix must be real tests + justified exclusions — never metric-gaming or threshold-lowering.

Output: A green `pnpm test:coverage` (global branch ≥80% with margin), a new tested `bearer-equals.ts` security module, 3 inline-justified config exclusions, and ~+37–49 newly-covered branches across bridge-client, logger, and the 3 bridge route guards.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/quick/260525-owx-branch-coverage-vitest-a-80-gate-verde-t/260525-owx-RESEARCH.md
@.planning/codebase/TESTING.md

# Project rules
- INV-4 (CLAUDE.md): zero dead code; real tests only (no `it.skip`/`it.todo`/empty bodies to inflate); every coverage exclusion carries inline justification; Biome + `tsc --noEmit` strict must stay green.
- Branch protection: STAY on branch `feature/coverage-80pct`. Do NOT create/push branches, open PRs, or touch branch protection. The orchestrator opens the PR to develop afterward.
- Do NOT lower thresholds in vitest.config.ts. Do NOT modify product logic except the minimal bearerEquals extraction (and any tiny seam needed for testability, justified inline).

<interfaces>
<!-- Extracted from codebase — executor uses these directly, no exploration needed. -->

From packages/foundry-mcp/src/http.ts (the bearerEquals to extract verbatim):
```typescript
import { timingSafeEqual } from 'node:crypto';
function bearerEquals(provided: string, expected: string): boolean {
  if (provided.length !== expected.length) {
    return false;
  }
  const a = Buffer.from(provided, 'utf-8');
  const b = Buffer.from(expected, 'utf-8');
  return timingSafeEqual(a, b);
}
// Call site (http.ts:110): if (!bearerEquals(providedBearer, env.bearer)) { ... 401 ... }
```

From packages/foundry-mcp/src/logger.ts:
```typescript
export interface BuildLoggerOptions { level: string; destination?: 'stderr'; }
export function buildLogger(opts: BuildLoggerOptions): pino.Logger;
// Branches: opts.destination === 'stderr' (→ pino.destination(2)) vs default (→ stdout).
// BEARER_REDACT_PATHS is module-private (not exported) — assert via logger behavior, not the const.
```

From packages/foundry-mcp/src/tools/bridge-client.ts:
```typescript
export class BridgeClient {
  constructor(opts: { bridgeUrl: string; bearer: string; logger: Logger; wsFactory?: (url: string) => WebSocket });
  readonly ready: Promise<void>;
  isConnected(): boolean;
  markUnreachable(): void;
  addMessageListener(cb: (e: Record<string, unknown>) => void): () => void;
  getCharacterSnapshot(actorId?: string): Promise<CharacterSnapshot | null>;  // uses global fetch
  getCombatSnapshot(): Promise<CombatSnapshot | null>;
  getSceneViewport(): Promise<SceneViewport | null>;
  getEventLog(limit: number): Promise<EventLogEntry[]>;
  invokeTool(snakeName: string, args: object): Promise<BridgeInvokeResult>;  // never rejects except BridgeAuthExpiredError
  close(): Promise<void>;
}
export class BridgeAuthExpiredError extends Error {}
export interface BridgeInvokeResult { success: boolean; data?: unknown; error?: string; }
// Existing sibling test (extend it): packages/foundry-mcp/src/tools/bridge-client.test.ts
//   — has createMockWebSocket() with .send/.close/.simulateOpen/.simulateMessage/.simulateClose,
//     makeServerHello(), makeToolResult(). Reuse these helpers.
```

From packages/bridge/src/routes/{scene,character,combat}.ts (registration signatures — args are positional):
```typescript
// scene.ts
export async function registerSceneRoute(app: FastifyInstance, tokenCache: TokenCache, foundryFn: FoundrySnapshotFn): Promise<void>;
// GET /v1/scene/viewport — guards: 401 (no Bearer/invalid) · 503 (reason==='foundry_unreachable') · 200 zero-state (schema mismatch)

// character.ts
export async function registerCharacterRoute(app: FastifyInstance, tokenCache: TokenCache, foundryFn: FoundrySnapshotFn): Promise<void>;
// GET /v1/character/:actorId — guards: 401 · 503 · 404 (null snapshot OR schema mismatch) · 200
export type FoundrySnapshotFn = (handler: string, ...args: unknown[]) => Promise<any>;

// combat.ts
export async function registerCombatRoute(app: FastifyInstance, tokenCache: TokenCache, foundryFn: FoundrySnapshotFn): Promise<void>;
// GET /v1/combat/current — guards: 401 · 503 · 204 (null snapshot OR schema mismatch) · 200
```

Bridge route test pattern (from portrait.test.ts — adapt, simpler positional signature):
```typescript
import Fastify from 'fastify';
import { TokenCache } from '../auth/token-cache.js';
import { registerSceneRoute } from './scene.js';
const VALID_TOKEN = 'valid-bearer';
const makeValidateFn = () => async (t: string) =>
  t === VALID_TOKEN
    ? { valid: true as const, entry: { alias: 'G2', expiresAt: Date.now() + 86_400_000, worldId: 'w1' } }
    : { valid: false as const, reason: 'unknown_token' as const };
// For 503: validate fn returns { valid: false as const, reason: 'foundry_unreachable' as const }
const app = Fastify({ logger: false });
const cache = new TokenCache(makeValidateFn());
await registerSceneRoute(app, cache, async () => ({ /* shape-mismatch or valid */ }));
await app.ready();
const res = await app.inject({ method: 'GET', url: '/v1/scene/viewport', headers: { authorization: `Bearer ${VALID_TOKEN}` } });
```
</interfaces>

Test environments (per-package vitest.config.ts):
- `packages/foundry-mcp` + `packages/bridge`: `environment: 'node'` → bridge-client, logger, bearer-equals, route, tool-invoke tests all go here.
- `packages/g2-app`: `happy-dom` (irrelevant — raster-worker is excluded, not tested).
</context>

<tasks>

<task type="auto">
  <name>Task 1: Extract bearerEquals into a tested security module + rewire http.ts</name>
  <files>packages/foundry-mcp/src/security/bearer-equals.ts, packages/foundry-mcp/src/security/bearer-equals.test.ts, packages/foundry-mcp/src/http.ts</files>
  <action>
Create `packages/foundry-mcp/src/security/bearer-equals.ts` exporting `bearerEquals(provided: string, expected: string): boolean` — move the function verbatim from http.ts (keep the `node:crypto` `timingSafeEqual` import, the length-mismatch fast-reject, and the full TSDoc block documenting T-11-02 / the constant-time property). This is the only production-logic change permitted (locked decision 2); it preserves the security primitive under coverage even though the boot file gets excluded in Task 2.

Update `packages/foundry-mcp/src/http.ts`: delete the local `bearerEquals` function and its `import { timingSafeEqual } from 'node:crypto'` (timingSafeEqual is not referenced elsewhere in the file — confirm before removing), then add `import { bearerEquals } from './security/bearer-equals.js';`. The call site at line ~110 (`if (!bearerEquals(providedBearer, env.bearer))`) is unchanged. Do NOT touch `readBody` or any other http.ts logic — http.ts is being excluded anyway, so minimize its diff to the import swap.

Create `packages/foundry-mcp/src/security/bearer-equals.test.ts` (node env) with real assertions covering every branch and the security property:
- equal tokens → true (e.g. `bearerEquals('abc123', 'abc123')`)
- unequal same-length tokens → false (`bearerEquals('abc123', 'xyz789')`)
- length mismatch → false, exercising the fast-reject branch (e.g. `bearerEquals('short', 'longer-token')`)
- empty provided vs non-empty expected → false (length mismatch)
- both empty strings → true (degenerate equal-length case)
- timing-safe property: same-length inputs differing only in the last char return false (`bearerEquals('aaaaaa', 'aaaaab')` → false) — documents the constant-time intent (no early-return on first-differing byte).

No `it.skip`/`it.todo`/empty bodies (INV-4).
  </action>
  <verify>
    <automated>pnpm --filter @evf/foundry-mcp exec vitest --run src/security/bearer-equals.test.ts && pnpm --filter @evf/foundry-mcp exec tsc --noEmit && pnpm lint:ci</automated>
  </verify>
  <done>bearer-equals.ts exports a TSDoc'd bearerEquals; http.ts imports it (no local copy, no orphaned node:crypto import); bearer-equals.test.ts passes with ≥6 real cases; typecheck + biome ci green.</done>
</task>

<task type="auto">
  <name>Task 2: Add 3 justified coverage exclusions to vitest.config.ts</name>
  <files>vitest.config.ts</files>
  <action>
Append three entries to the `coverage.exclude` array, each with an inline comment in the existing migration-rule style (mirror the `packages/bridge/src/index.ts // Phase 3` line and the foundry-module-removal comment block). Place them after the existing placeholder block. Use the locked justifications (locked decision 1):

1. `'packages/g2-app/src/raster/raster-worker.ts',` — comment: g2-app raster Web Worker; body runs in a separate thread via `new Worker(new URL(...))` and is never imported under Vitest (`self.onmessage` at module top). v8 cannot instrument worker-thread code. Pure-helper extraction to raster-pipeline.ts is logged future debt (CONCERNS.md §Raster Worker Isolation).
2. `'packages/foundry-mcp/src/http.ts',` — comment: foundry-mcp Streamable HTTP entry; top-level async IIFE binds 0.0.0.0:port + connects MCP transport on import (mirrors the already-excluded `bridge/src/index.ts`). Un-instrumentable as a unit. Its testable security primitive `bearerEquals` was extracted to `security/bearer-equals.ts` and is unit-tested (Task 1).
3. `'packages/foundry-mcp/src/index.ts',` — comment: foundry-mcp stdio entry; top-level async IIFE connecting StdioServerTransport on import (mirrors `bridge/src/index.ts`). Un-instrumentable as a unit.

Do NOT modify `thresholds` (stay 80/80/80). Do NOT touch `include`. Keep the existing migration-rule header comment intact.
  </action>
  <verify>
    <automated>node --input-type=commonjs -e "const c=require('fs').readFileSync('vitest.config.ts','utf8'); for (const f of ['raster/raster-worker.ts','foundry-mcp/src/http.ts','foundry-mcp/src/index.ts']) if(!c.includes(f)){console.error('missing exclude '+f);process.exit(1);} if(!/branches:\s*80/.test(c)){console.error('branch threshold changed');process.exit(1);} console.log('exclusions present, threshold=80 intact');"</automated>
  </verify>
  <done>vitest.config.ts excludes the 3 files, each with an inline migration-rule-style justification; branches threshold unchanged at 80.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Add real branch tests (bridge-client, logger, 3 route guards) and iterate to green ≥80%</name>
  <files>packages/foundry-mcp/src/tools/bridge-client.test.ts, packages/foundry-mcp/src/logger.test.ts, packages/bridge/src/routes/scene.test.ts, packages/bridge/src/routes/character.test.ts, packages/bridge/src/routes/combat.test.ts, packages/bridge/src/ws/tool-invoke.test.ts</files>
  <behavior>
    - bridge-client.ts REST branches (mock global `fetch` via `vi.stubGlobal('fetch', vi.fn())`): 401 → throws BridgeAuthExpiredError; 404 → null (character/scene/combat) and `[]` (events); 204 → null (combat/characters-list); array body vs `{entries:[...]}` body for getEventLog; auto-detect path (getCharacterSnapshot() with no actorId → GET /v1/characters, returns first / null on empty array); network throw (fetch rejects) → default (null / []) via the `_restGet` catch arm.
    - bridge-client.ts WS branches (reuse existing createMockWebSocket/makeServerHello/makeToolResult helpers): invokeTool when `!_connected` → `{success:false,error:'bridge_unreachable'}`; FIFO queue branch (second invokeTool while one pending → queued, then resolved in order after first tool.result); `bearer.rotated` envelope → warn, no pending effect; non-tool.result envelope → fans out to addMessageListener; close() on already-null ws and close() where ws.close throws (try/catch arm).
    - logger.ts: `buildLogger({level:'info'})` returns a logger (default/stdout branch); `buildLogger({level:'info',destination:'stderr'})` returns a logger (stderr branch → pino.destination(2)). Assert both return truthy pino instances with `.info`/`.warn` methods.
    - scene route: 401 (no Authorization header) · 503 (validate reason 'foundry_unreachable') · 200 zero-state (foundryFn returns a shape that fails SceneViewportSchema.safeParse).
    - character route: 401 · 503 · 404 (foundryFn returns null) · 404 (foundryFn returns schema-mismatch object).
    - combat route: 401 · 503 · 204 (foundryFn returns null) · 204 (schema-mismatch).
    - tool-invoke.ts (OPTIONAL — add only if step-by-step coverage below comes in under 80% with margin): cover the uncovered error/guard arm (~line 106) with 1–2 cases.
  </behavior>
  <action>
Write the tests above following TESTING.md patterns: Vitest `describe/it`, `vi.fn()` DI, Fastify `.inject()` for routes, mocked global `fetch` for bridge-client REST. Extend the EXISTING `bridge-client.test.ts` (reuse its mock-WS helpers — do not duplicate them). Create new `logger.test.ts`, `scene.test.ts`, `character.test.ts`, `combat.test.ts` co-located beside their sources. For routes, construct `Fastify({ logger: false })` + `new TokenCache(makeValidateFn())` + `registerXRoute(app, cache, foundryFn)` then `await app.ready()` and `app.inject(...)` — positional args per the interfaces block (NOT the object-arg form portrait.ts uses).

ITERATION PROTOCOL (research §"Re-run cadence"): after writing the bridge-client + logger batch, run `pnpm test:coverage` and read the global branch line. v8 may count fewer branches than the source suggests. Add the 3 route-guard test files next; re-run. STOP adding tests at the first observation of branch ≥81% (green-with-margin) to keep the diff minimal per INV-4. Add the optional `tool-invoke.test.ts` ONLY if branch is still <80.5% after the routes. Every test must be a real assertion — no `it.skip`/`it.todo`/empty bodies, no assertions designed solely to touch a line without checking behavior.

Record the before (78.11%) and after branch numbers in the SUMMARY.
  </action>
  <verify>
    <automated>pnpm test:coverage > /tmp/owx-cov.txt 2>&1; echo "exit=$?"; grep -E 'Branches' /tmp/owx-cov.txt; awk '/Branches/{gsub(/%/,"",$3); if($3+0<80){print "FAIL branch="$3; exit 1} print "GATE GREEN branch="$3}' /tmp/owx-cov.txt</automated>
    <note>The `pnpm test:coverage` exit code is itself authoritative — Vitest enforces the 80/80/80 thresholds and exits non-zero if branches are below 80. The awk line is a secondary explicit assert + prints the achieved percentage. Both must indicate ≥80 (target ≥81 with margin).</note>
  </verify>
  <done>`pnpm test:coverage` exits 0; the printed global Branches percentage is ≥80% (target ≥81% with margin); all new tests pass; SUMMARY records before (78.11%) → after branch numbers; `pnpm lint:ci` + `pnpm typecheck` green.</done>
</task>

</tasks>

<verification>
- `pnpm test:coverage` exits 0 (Vitest enforces 80/80/80 thresholds internally).
- Global Branches ≥80% (research budget projects ~80.9–81.1%).
- `pnpm typecheck` and `pnpm lint:ci` exit 0 (INV-4: strict TS + Biome).
- `bearerEquals` is no longer defined in http.ts; it lives in security/bearer-equals.ts and is unit-tested.
- The 3 new vitest exclusions each carry an inline migration-rule-style justification comment.
- No `it.skip` / `it.todo` / empty test bodies introduced (grep the new test files).
- No threshold lowered; no product logic changed beyond the bearerEquals extraction + http.ts import swap.
- Branch stays `feature/coverage-80pct` — no new branches, no PR, no push.
</verification>

<success_criteria>
- Vitest branch coverage gate green: global branches ≥80% (from 78.11% baseline), `pnpm test:coverage` exit 0.
- Security primitive (`bearerEquals`, T-11-02) preserved under coverage via extracted tested module.
- 3 structurally-un-instrumentable files excluded with inline justification (raster-worker, foundry-mcp http + index boot entries).
- Real tests added on shipped logic (bridge-client REST/WS, logger destination, 3 bridge route guards; optional tool-invoke).
- INV-4 satisfied: no dead code, no metric-gaming, no skipped tests, every exclusion justified.
</success_criteria>

<output>
Create `.planning/quick/260525-owx-branch-coverage-vitest-a-80-gate-verde-t/260525-owx-SUMMARY.md` when done.
Record: baseline branch 78.11% → final branch %; which test files added; which optional tests were/weren't needed; the 3 exclusions; confirmation that http.ts diff is import-swap-only.
</output>
