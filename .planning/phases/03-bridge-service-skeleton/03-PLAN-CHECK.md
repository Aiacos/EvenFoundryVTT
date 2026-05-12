---
phase: 03-bridge-service-skeleton
checked: 2026-05-12
verdict: findings
plans_reviewed: [01, 02, 03, 04, 05]
blockers: 1
highs: 1
mediums: 2
lows: 1
---

# Phase 03 Plan Check — Goal-Backward Audit

**Checked by:** gsd-plan-checker (Claude Sonnet 4.6)
**Date:** 2026-05-12
**Phase goal:** "Bridge service skeleton — production-grade Fastify+ws bridge with Docker Compose
orchestration, idempotency middleware, Tool Registry (7 tools, stub dispatch), WS resume/replay
protocol, and ops endpoints (/healthz, /readyz, /metrics)."

---

## 1. Goal-Backward Analysis

| # | Success Criterion | Covering Plan(s) | Status | Notes |
|---|------------------|-----------------|--------|-------|
| SC-1 | Docker Compose + /healthz/readyz/metrics + bearer rejection | 03-03 + 03-05 | COVERED | /healthz+/readyz+/metrics in 03-03; Docker + index.ts startup guard in 03-05; bearer rejection unchanged from Phase 02 |
| SC-2 | POST /v1/actor/* round-trips | 03-04 | COVERED (with note) | Implemented as POST /v1/tools/:name per ADR-0003 CONTEXT note 6; plan explicitly states this is SC-2 + SC-4 combined |
| SC-3 | Idempotency 60s LRU | 03-02 | COVERED | RFC draft-04 correct; TTL_MS = 60_000; MAX_ENTRIES = 10_000; /internal/delta excluded; non-POST pass-through |
| SC-4 | Tool Registry 7 tools listed and callable | 03-04 | COVERED | 7 Zod schemas, TOOL_REGISTRY, GET /v1/tools + POST /v1/tools/:name, stub dispatch, JSON-Schema via native .toJSONSchema() |
| SC-5 | WS replay/resume with 60s LRU, full snapshot on gap | 03-01 | COVERED | ClientResumeSchema, ReplayBuffer.hasGap, handleResume, resume_full_snapshot, end-to-end integration test |

---

## 2. Requirement Coverage

| Requirement | Plans Claiming It | Frontmatter `requirements:` | Status |
|-------------|------------------|-----------------------------|--------|
| FOUN-02 | 01, 02, 03, 04, 05 | All 5 plans list [FOUN-02] | COVERED |

FOUN-02 is the single requirement mapped to Phase 03 per REQUIREMENTS.md. All plans correctly
claim it.

---

## 3. Dependency Graph Verification

```
Plan 01 (Wave 0, depends_on: [])
  └── Plan 02 (Wave 1, depends_on: ["01"]) ─────┐
  └── Plan 03 (Wave 1, depends_on: ["01"]) ─────┤ (parallel)
                                                  └── Plan 04 (Wave 2, depends_on: ["02","03"])
                                                        └── Plan 05 (Wave 3, depends_on: ["04"])
```

No cycles. No missing plan references. Wave assignments consistent with depends_on topology.

---

## 4. Wave 1 Parallelism Safety Check

Plans 02 and 03 are Wave 1 — both depend only on Plan 01.

**Plan 02 files_modified:**
```
packages/bridge/src/middleware/idempotency.ts
packages/bridge/src/middleware/idempotency.test.ts
packages/bridge/src/types/fastify.d.ts           ← shared augmentation file
packages/bridge/src/server.ts
packages/bridge/src/server.test.ts
.changeset/03-02-idempotency-middleware.md
```

**Plan 03 files_modified:**
```
packages/bridge/src/metrics/registry.ts
packages/bridge/src/metrics/registry.test.ts
packages/bridge/src/routes/metrics.ts
packages/bridge/src/routes/healthz.ts
packages/bridge/src/routes/readyz.ts
packages/bridge/src/server.ts                    ← shared!
packages/bridge/src/server.test.ts               ← shared!
packages/bridge/package.json
pnpm-lock.yaml
.changeset/03-03-ops-endpoints-and-metrics.md
```

**Shared files: `server.ts` and `server.test.ts`** are touched by both Plan 02 and Plan 03.

The plans are aware of this: Plan 02 adds `registerIdempotencyHooks + IdempotencyStore` to
`server.ts`; Plan 03 adds `createMetricsRegistry + 3 ops routes + HTTP duration hooks + WS session
gauge + dedup counter callback` to `server.ts`. Both also extend `server.test.ts`.

The coordination is documented via the `onDedup?` optional callback contract: Plan 02 ships
`registerIdempotencyHooks(app, store, { onDedup?: () => void })` with a default no-op; Plan 03
passes `{ onDedup: () => metrics.idempotencyDedupTotal.inc() }`. This is an intentional
bidirectional contract — Plan 02 defines the option-bag, Plan 03 passes the callback.

**However:** `packages/bridge/src/types/fastify.d.ts` is listed in **Plan 02's** `files_modified`
but NOT in Plan 03's, even though Plan 03's `server.ts` Task 2 **reads** `request.evfStartTime`
(which is declared in that file). Plan 03's action text treats `evfStartTime` as
"already declared in Plan 03-02's fastify.d.ts" — this is by design and correct: Plan 03 depends
on Plan 02 for the shared augmentation. No actual parallel write conflict exists on `fastify.d.ts`
because only Plan 02 writes it; Plan 03 only reads it.

**`server.ts` parallel write risk**: Both plans 02 and 03 modify `server.ts` in Wave 1. Because
they are parallel, an executor running them concurrently would produce a merge conflict. The GSD
execute-plan workflow runs each plan's tasks serially and in wave order, so in practice the
executor will run 02 fully before 03 starts (or vice versa, not literally in parallel). This is
acceptable, but there is no explicit sequencing instruction in the plan frontmatter to tell the
executor which of the two Wave 1 plans must land first. **Finding M-1 below.**

---

## 5. Cross-Plan Contract Verification

### 5a. Plan 02 ↔ Plan 03 idempotency counter hook

Plan 02 ships:
```typescript
export async function registerIdempotencyHooks(
  app: FastifyInstance,
  store: IdempotencyStore,
): Promise<void>;
```

Plan 03 action text says: "extend `registerIdempotencyHooks` (Plan 03-02) signature to accept an
optional `onDedup?: () => void` callback." The Plan 03 description states Plan 02 writes the
option-bag form and Plan 03 wires the callback. BUT Plan 02's interface block shows the signature
WITHOUT the `onDedup` parameter. Plan 02's `IdempotencyStore` interface also does not expose any
callback slot.

**There is a cross-plan signature mismatch.** Plan 02 defines
`registerIdempotencyHooks(app, store)` with no third argument; Plan 03 uses
`registerIdempotencyHooks(app, idempotencyStore, { onDedup: () => ... })` which would fail
TypeScript compilation. See Finding H-1 below.

### 5b. Plan 03 ↔ Plan 04 tool label cardinality

Plan 03's `createMetricsRegistry` defines an HTTP request duration histogram with labels
`method | route | status_code`. The `tool` label is mentioned in the RESEARCH §Label Cardinality
Budget as a "safe label" but is NOT included in Plan 03's `EvfMetrics` interface or the histogram
`labelNames`. Plan 04 does not add any per-tool metric dimension. This is consistent — the plan
correctly uses only `route` (which for `/v1/tools/:name` yields a single bounded label value).
No issue here.

### 5c. Plan 04 tool dispatch override in BuildServerOptions

Plan 04 adds `toolDispatchOverride?: Partial<Record<ToolName, ToolHandler>>` to `BuildServerOptions`
for test injection. This modifies `server.ts` which was last touched in Wave 1 (Plans 02+03).
Plan 04 is Wave 2 — serial after both Wave 1 plans complete. No conflict.

### 5d. Plan 03's `registerIdempotencyHooks` signature — onDedup placement

The plan 03 action says Plan 02 "ships the optional parameter (with a default `onDedup: () => void = () => {}`)"
and Plan 03 passes a real one. But Plan 02's interfaces block does NOT include this option. The
interfaces block is the contract the executor follows, not the prose description. **This is the
same issue as 5a / H-1.**

### 5e. Plan 03 modifies `token-cache.ts` (Phase 02 file)

Plan 03 Task 2 adds `metricsHooks?: { onHit?: () => void; onMiss?: () => void }` to
`TokenCache`'s constructor. `token-cache.ts` is NOT listed in Plan 03's `files_modified`
frontmatter. This is a missing file entry — analogous to Phase 02's M-1 finding.
See Finding M-2 below.

### 5f. handleResume rawData parameter signature discrepancy

Plan 03-01 interfaces block shows `handleResume` signature as:
```typescript
export function handleResume(
  socket: WebSocket,
  sessionId: string,
  replayBuffer: ReplayBuffer,
  rawData: Buffer | ArrayBuffer | string,
): void;
```

But the RESEARCH §Critical Wiring Fix shows the server.ts wiring as:
```typescript
socket.on('message', (rawData) => handleResume(socket, sessionId, replayBuffer, sessionStore));
```
— passing `sessionStore` as the 4th arg instead of `rawData`. This appears to be a typo in the
RESEARCH copy-paste. Plan 03-01's interfaces block is correct (rawData as 4th arg). The plan
action text specifies the correct wiring:
```typescript
socket.on('message', (rawData) => {
  handleResume(socket, sessionId, replayBuffer, rawData);
});
```
No issue here — the interfaces block governs and is correct.

### 5g. Plan 05 smoke.sh includes /readyz 503 vs 200 assertion

The smoke.sh script (Plan 03-05 Task 2) generates an ephemeral `.env` with a real
`EVF_INTERNAL_SECRET` value, then asserts `/readyz returns 200 (secret IS set)`. This is correct:
the script provides a secret, so readyz should return 200.

The Plan 03-05 must_haves truth says: "503 to GET /readyz when no EVF_INTERNAL_SECRET". The
smoke test does NOT test this path (by design — the script sets the secret). The 503 path is
covered by the unit test in server.test.ts (Plan 03-03). This is internally consistent.

---

## 6. Threat Model Coverage

| Threat | Plan | Severity | Addressed? |
|--------|------|----------|------------|
| T-03-01 Gap-injection on WS resume | 01 | HIGH | YES — hasGap + resume_full_snapshot |
| T-03-02 Stale-session memory exhaustion | 01 | HIGH | YES — socket.on('close') cleanup all 3 stores |
| T-03-03 Malformed post-handshake messages | 01 | MEDIUM | YES — try/catch + safeParse no-op |
| T-03-04 Replay buffer leak on reconnect | 01 | LOW | YES — covered by T-03-02 fix |
| T-03-05 Idempotency replay attack | 02 | HIGH | YES — documented; bearer is trust root; Phase 07 deferred |
| T-03-06 Key-flood DoS | 02 | HIGH | YES — MAX_ENTRIES = 10_000 + oldest-entry eviction |
| T-03-07 Idempotency-Key in logs | 02 | MEDIUM | YES — redact + 8-char debug truncation |
| T-03-08 Replay race at TTL boundary | 02 | LOW | YES — cachedAt reset on set |
| T-03-09 Unbounded metric cardinality | 03 | HIGH | YES — label allowlist + routeOptions.url pattern |
| T-03-10 prom-client global registry collision | 03 | HIGH | YES — per-Registry factory + registers: [registry] |
| T-03-11 /metrics public on LAN | 03 | MEDIUM | YES — documented in README (acceptable MVP) |
| T-03-12 /readyz env-var presence leak | 03 | LOW | YES — acknowledged acceptable |
| T-03-13 Unbounded tool name URL parameter | 04 | HIGH | YES — 404 before Zod parse |
| T-03-14 Phase 07 write-path pre-emption | 04 | HIGH | YES — stubs only; grep gate |
| T-03-15 JSON Schema drift from Zod schema | 04 | MEDIUM | YES — drift test + module-load recompute |
| T-03-16 Tool name leakage in logs | 04 | LOW | YES — acknowledged acceptable |
| T-03-17 Docker build-arg secret leak | 05 | HIGH | YES — env_file only; grep gate for ARG lines |
| T-03-18 deploy/.env committed to git | 05 | HIGH | YES — gitignore + .env.example |
| T-03-19 /metrics public port binding | 05 | MEDIUM | YES — documented single-host binding advice |
| T-03-20 pnpm workspace symlink leak in Docker | 05 | MEDIUM | YES — pnpm -r build before pnpm --prod deploy |
| T-03-21 NODE_ENV not set in compose | 05 | LOW | YES — explicit in compose env block |

All 21 threats have documented mitigations.

---

## 7. must_haves Validity

| Plan | Truths | Testability | Notes |
|------|--------|-------------|-------|
| 01 | 8 | All verifiable via grep + Vitest | Concrete, codebase-observable, not vague |
| 02 | 8 | All verifiable via Vitest integration tests | RFC truth table coverage correct |
| 03 | 8 | All verifiable via app.inject + grep | Pitfall 2 isolation truth testable in parallel describe blocks |
| 04 | 8 | All verifiable via Vitest + grep | T-03-14 grep gate is strong; idempotency dedup round-trip provable |
| 05 | 9 | Structural (file existence + greps) + Docker conditional | Smoke test conditional on Docker availability — correctly handled |

No implementation-level-only truths found. All truths are system-observable.

---

## 8. Scope Assessment

| Plan | Tasks | Files Modified | Wave | Assessment |
|------|-------|----------------|------|------------|
| 01 | 2 | 12 | 0 | Good (2 tasks); files slightly above target but tightly coupled |
| 02 | 1 | 6 | 1 | Excellent |
| 03 | 2 | 10 | 1 | Good (right at guideline boundary — 10 files) |
| 04 | 2 | 17 | 2 | Warning: 17 files above 15-file guideline; acceptable — all tightly coupled to Tool Registry |
| 05 | 2 | 12 | 3 | Good (deploy files are mostly config, low cognitive weight) |

Plan 04's 17 files is borderline but the coupling is tight (7 tool schema files + index + test + 2
bridge routes + 1 Foundry module + 2 server changes + changeset). No split recommended — splitting
the tool schemas from the route dispatch would create a wave dependency that gains nothing.

---

## 9. Anti-Pattern Checks

| Anti-Pattern | Plans | Status |
|-------------|-------|--------|
| `fastify-metrics` usage | 03 | CLEAN — explicitly prohibited by Pitfall 5 and grep gate |
| `zod-to-json-schema` usage | 04 | CLEAN — Zod 4 native `.toJSONSchema()` used |
| `vi.mock` in `beforeEach` | All | CLEAN — `vi.fn()` injection used throughout |
| Vitest `defineProject` extends:true | All | CLEAN — no per-project config changes proposed |
| New full-state-dump WS message | 01 | CLEAN — `resume_full_snapshot` tells client to refetch REST, per ADR-0002 |
| JWT semantics | All | CLEAN — bearer remains 32-byte opaque base64url per D-2.12 |
| `ARG EVF_INTERNAL_SECRET` in Dockerfile | 05 | CLEAN — grep gate explicitly required; secrets via env_file only |
| Polling (setInterval) | All | CLEAN — no polling introduced |
| Redis in MVP | All | CLEAN — in-memory Map throughout |
| React/Vue in g2-app | All | N/A — Phase 03 does not touch g2-app |

---

## 10. Specific Concern Deep-Dives

### Concern A: handleResume called with sessionStore not rawData (RESEARCH §Critical Wiring Fix)

The RESEARCH §Critical Wiring Fix shows:
```typescript
socket.on('message', (rawData) => handleResume(socket, sessionId, replayBuffer, sessionStore));
```
This passes `sessionStore` (a 4th arg not in the function signature) instead of `rawData`.
Plan 03-01's interfaces block is authoritative and correct (4th param = rawData). This is a
RESEARCH copy-paste error, NOT a plan error. The plan action text specifies the correct call.
No issue.

### Concern B: ReplayBuffer.hasGap and last_seq=0 edge case

The resume decision tree in Plan 03-01 action text:
```
if (missed.length === 0 && last_seq > 0) → buffer_expired
```
When `last_seq === 0` AND `missed.length === 0` (new connection, nothing to replay), the code
falls through to the `else` branch which sends `resume_replay { count: 0 }`. This is correct
per ADR-0002 — a `last_seq=0` resume from a fresh session means "nothing to replay" and the
client is considered up-to-date. The zero-count replay is a no-op (no subsequent envelope sends).
No issue.

### Concern C: /readyz runtime EVF_PLUGIN_HOST_URL check missing (TODO #42)

`server.ts` has `// TODO (#42): enforce EVF_PLUGIN_HOST_URL as required in Docker entrypoint.`
Plan 03-05 closes this via the startup guard in `index.ts`, but the guard only checks
`EVF_INTERNAL_SECRET`, not `EVF_PLUGIN_HOST_URL`. The RESEARCH §Secrets Handling says "Phase 03
resolves it: fail-fast if not set in NODE_ENV=production." Plan 03-05's interfaces block and
plan 03-05's index.ts code only guard EVF_INTERNAL_SECRET.

However, `EVF_PLUGIN_HOST_URL` has a safe dev fallback (`http://localhost:5173`) already in
`server.ts` and is not security-critical (it's a CORS allowlist — worst case is overly permissive
dev fallback). The TODO's priority is documented but Plan 03-05 not implementing it is
acceptable. **Finding L-1 below** (low priority, no execution blocker).

### Concern D: `onDedup` callback in `registerIdempotencyHooks` — cross-plan interface mismatch

This is the most significant coordination gap. Plan 02's **interfaces block** (the authoritative
contract) defines:
```typescript
export async function registerIdempotencyHooks(
  app: FastifyInstance,
  store: IdempotencyStore,
): Promise<void>;
```

Plan 03's **action text** says to extend this to:
```typescript
registerIdempotencyHooks(app, idempotencyStore, { onDedup: () => metrics.idempotencyDedupTotal.inc() })
```

The Plan 03 body text acknowledges: "Plan 03-02 ships the optional parameter (with a default
`onDedup: () => void = () => {}`); Plan 03 passes a real one." But Plan 02's interfaces block
does NOT include this — the executor writing Plan 02 will produce the 2-arg signature. When
Plan 03 executes and tries to pass a 3rd arg, TypeScript will reject it (`TS2554: Expected 2
arguments, but got 3`). **This is a cross-plan interface mismatch that will cause Plan 03's
typecheck to fail.** See Finding H-1.

### Concern E: `token-cache.ts` not in Plan 03's files_modified

Plan 03 Task 2 prose explicitly modifies `packages/bridge/src/auth/token-cache.ts` (adds
`metricsHooks` constructor parameter + `onHit`/`onMiss` calls). This file is NOT listed in
Plan 03's `files_modified` frontmatter. If the executor treats `files_modified` as authoritative,
the token-cache change will be silently skipped. This is the same failure mode as Phase 02 M-1.
See Finding M-2.

### Concern F: Dockerfile copies `biome.jsonc` and `vitest.config.ts` into builder — but Plan 03-05 interfaces block omits them

Plan 03-05 interfaces block shows the Dockerfile builder stage copying:
```dockerfile
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY tsconfig.base.json ./
COPY biome.jsonc ./
COPY vitest.config.ts ./
COPY packages/ ./packages/
```

But it then runs `pnpm install --frozen-lockfile --ignore-scripts` and `pnpm -r build` —
`biome.jsonc` and `vitest.config.ts` are NOT needed for the build (only for dev/CI). Copying them
is harmless (just slightly larger build context). The `.dockerignore` in the interfaces block
does exclude `*.md` but does NOT exclude `biome.jsonc` or `vitest.config.ts` from the context
copied to the builder stage. Minor inefficiency only — no correctness concern. Not a finding.

### Concern G: RESEARCH §Critical Wiring Fix vs deltaEmitter.registerSession call location

The plan correctly places `deltaEmitter.registerSession` in `server.ts` after handshake resolves
— NOT inside `handleHandshake`. This is architecturally correct. The `handleHandshake` function
receives a `deltaEmitter` parameter (indirectly via server.ts orchestrating the `.then()`), so
no signature pollution occurs. Verified in Plan 03-01 Task 2 action text:
```typescript
handleHandshake(socket, req, tokenCache, replayBuffer, sessionStore, app.log as Logger)
  .then((sessionId) => {
    if (sessionId === null) return;
    deltaEmitter.registerSession(sessionId, socket);
    ...
  })
```
No issue.

### Concern H: TypeScript version pin check

CONTEXT.md locks TypeScript to 5.8.3 (the actual pinned version per CLAUDE.md drift note).
The plans do not add TypeScript as a new dependency — it's already in the workspace root. No
new `typescript` version pin is introduced in any plan. No issue.

---

## 11. Findings

---

### CRITICAL

*None.*

---

### HIGH

**H-1: Cross-plan interface mismatch — `registerIdempotencyHooks` signature**

- **Where:** Plan 02 `packages/bridge/src/middleware/idempotency.ts` (interfaces block) vs
  Plan 03 `packages/bridge/src/server.ts` Task 2 (action text)
- **What:** Plan 02's authoritative `<interfaces>` block declares:
  ```typescript
  export async function registerIdempotencyHooks(
    app: FastifyInstance,
    store: IdempotencyStore,
  ): Promise<void>;
  ```
  Plan 03's action text passes a third `{ onDedup: () => void }` argument that is not in
  this signature. TypeScript strict mode (`TS2554: Expected 2 arguments, but got 3`) will
  reject Plan 03's call when `pnpm typecheck` runs after Plan 03 executes.
- **Risk:** `pnpm typecheck` fails after Plan 03 execution. The idempotency dedup counter
  never increments (`evf_idempotency_dedup_total` will always be 0 in metrics). The Plan 03-03
  must_have truth "evf_idempotency_dedup_total counter increments by exactly 1 on each cache
  replay" cannot be achieved.
- **Fix required:** Update Plan 02's `<interfaces>` block to add the optional third argument:
  ```typescript
  export async function registerIdempotencyHooks(
    app: FastifyInstance,
    store: IdempotencyStore,
    opts?: { onDedup?: () => void },
  ): Promise<void>;
  ```
  And correspondingly update Plan 02's Task 1 action to call `opts?.onDedup?.()` in the
  "existing entry + matching hash" preHandler branch. Plan 03 can then pass
  `{ onDedup: () => metrics.idempotencyDedupTotal.inc() }` without TypeScript errors.

---

### MEDIUM

**M-1: Wave 1 implicit sequencing — Plans 02 and 03 both modify `server.ts` and `server.test.ts`**

- **Where:** Plan 02 `files_modified` + Plan 03 `files_modified` both list `server.ts` and
  `server.test.ts`
- **What:** Both plans are Wave 1 (depends_on: ["01"]) and are theoretically runnable in
  parallel. An executor agent that naively runs Wave 1 plans in parallel would produce a merge
  conflict on `server.ts`. The plans document the coordination contract (onDedup callback,
  sequential server.ts extension) but do not specify which plan must land first.
- **Risk:** Executor confusion or merge conflict if plans run concurrently. The actual GSD
  execute-plan workflow runs plans sequentially within a wave, but this is implicit.
- **Fix recommended:** Add a `NOTE: execute Plan 02 before Plan 03 within Wave 1` comment to
  Plan 03's frontmatter (or a `wave_sequence_hint` field), OR convert one plan to Wave 1b
  (depends_on: ["01", "02"]). The latter is cleaner but changes the DAG. The simpler approach
  is to ensure Plan 02 → Plan 03 ordering in the execute-phase workflow comment.

**M-2: `token-cache.ts` not in Plan 03's `files_modified` frontmatter**

- **Where:** Plan 03 `files_modified` vs Plan 03 Task 2 action text
- **What:** Plan 03 Task 2 explicitly modifies `packages/bridge/src/auth/token-cache.ts` (adds
  `metricsHooks?: { onHit?: () => void; onMiss?: () => void }` constructor parameter + hook
  calls in `validate()`). This file is NOT listed in Plan 03's `files_modified` frontmatter.
- **Risk:** The executor agent may skip the token-cache modification if it reads `files_modified`
  as the authoritative scope. The `evf_token_cache_hits_total` and `evf_token_cache_misses_total`
  metrics will then always be 0. Plan 03 must_have truth 8 ("Token cache hit/miss counters
  increment correctly") cannot be achieved.
- **Fix required:** Add `packages/bridge/src/auth/token-cache.ts` to Plan 03's `files_modified`
  frontmatter. Also add `packages/bridge/src/auth/token-cache.test.ts` (the plan body mentions
  adding 2 new test cases for `onHit`/`onMiss` callbacks).

---

### LOW

**L-1: TODO #42 (`EVF_PLUGIN_HOST_URL` required in production) not closed by Plan 03-05**

- **Where:** `packages/bridge/src/server.ts` line ~84: `// TODO (#42): enforce EVF_PLUGIN_HOST_URL as required in Docker entrypoint.`
- **What:** RESEARCH §Secrets Handling says "Phase 03 resolves it: fail-fast if not set in
  NODE_ENV=production." Plan 03-05's startup guard in `index.ts` only checks `EVF_INTERNAL_SECRET`.
  `EVF_PLUGIN_HOST_URL` is not guarded.
- **Risk:** A production deployment with a missing/wrong `EVF_PLUGIN_HOST_URL` will silently use
  the dev fallback `http://localhost:5173` instead of failing fast. CORS origin will be wrong in
  production — plugin host requests will be rejected. The `/readyz` endpoint would still return
  200 because only `EVF_INTERNAL_SECRET` is checked.
- **Fix recommended:** Either (a) add `EVF_PLUGIN_HOST_URL` to the startup guard in `index.ts`,
  or (b) explicitly document in Plan 03-05 that TODO #42 remains open and is deferred to Phase 05
  (ops hardening). Both are acceptable for MVP. The omission is low risk for single-tenant
  homelab where the operator sets up `.env` manually.

---

## 12. Coverage Summary (SC → Plans → Verdict)

| SC | Description | Primary Plan | Key Evidence | Verdict |
|----|-------------|-------------|--------------|---------|
| SC-1 | Docker Compose + ops endpoints + bearer rejection | 03-03, 03-05 | /healthz (Plan 03-03 T1), /readyz (Plan 03-03 T1), /metrics (Plan 03-03 T1), docker-compose.yml + smoke.sh (Plan 03-05) | COVERED |
| SC-2 | POST /v1/actor/* round-trips | 03-04 | POST /v1/tools/:name dispatch (Plan 03-04 T2); stub returns 200 + phase-07-pending envelope | COVERED (via /v1/tools/:name per ADR-0003) |
| SC-3 | Idempotency 60s LRU | 03-02 | IdempotencyStore 60s TTL, MAX_ENTRIES=10_000, RFC 422 on conflict, /internal/delta excluded | COVERED |
| SC-4 | Tool Registry 7 tools listed and callable | 03-04 | TOOL_REGISTRY 7 entries, GET /v1/tools JSON Schema, POST dispatch, JSON-Schema drift test | COVERED |
| SC-5 | WS replay/resume + full snapshot on gap | 03-01 | handleResume, ReplayBuffer.hasGap, 3 new envelope schemas, end-to-end integration test | COVERED |

---

## 13. Pre-Execute Readiness Verdict

**READY WITH MINOR FIXES**

The 5 plans collectively and coherently deliver all Phase 03 success criteria. The dependency graph
is clean, wave assignments are consistent, threat model is complete, and all must_haves truths are
codebase-verifiable.

**Fix before executing (HIGH):**

H-1 (Cross-plan interface mismatch on `registerIdempotencyHooks`): Update Plan 02's
`<interfaces>` block to add the `opts?: { onDedup?: () => void }` third parameter, and update
Plan 02's Task 1 action to call `opts?.onDedup?.()` on dedup hit. This is a 2-line change in the
interfaces definition and a 1-line change in the preHandler branch. Without this fix, Plan 03's
typecheck will fail and the dedup counter will never increment.

**Fix before executing (MEDIUM):**

M-1 (Wave 1 implicit sequencing): Add an explicit sequencing instruction to Plan 03's objective
or frontmatter indicating that Plan 02 must complete before Plan 03 begins. This prevents
executor confusion on the shared `server.ts` write.

M-2 (Missing file in Plan 03's files_modified): Add `packages/bridge/src/auth/token-cache.ts`
(and `token-cache.test.ts`) to Plan 03's `files_modified` frontmatter. Without this, the token
cache hit/miss metric callbacks will not be wired.

**Can proceed with awareness (LOW):**

L-1 (TODO #42 not closed): Document that `EVF_PLUGIN_HOST_URL` production guard is deferred;
add a comment in Plan 03-05's action text or carry the TODO forward.

**Summary:** One blocking HIGH finding (interface mismatch, simple fix), two medium housekeeping
issues. No CRITICAL findings — no plan would produce fundamentally broken or wrong code if executed
as-written, only a failed typecheck at Plan 03 boundary. Fix H-1 + M-1 + M-2, then execute.
