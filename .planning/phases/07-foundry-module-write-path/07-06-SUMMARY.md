---
phase: "07-foundry-module-write-path"
plan: "06"
subsystem: "foundry-module/pair"
tags: [bearer-rotation, integration-smoke, phase-closure, wave-4, adr-0011, adr-0005]
dependency_graph:
  requires: ["07-02", "07-03", "07-04", "07-05"]
  provides: ["bearer-rotation-scheduler", "phase-7-integration-smoke", "phase-7-closed"]
  affects: ["packages/foundry-module/src/pair/*", "packages/foundry-module/src/__tests__/*", ".planning/STATE.md", ".planning/ROADMAP.md"]
tech_stack:
  added:
    - "bearer-rotation.ts — recursive setTimeout chain for 24h bearer rotation"
    - "getActiveBearer() helper — exported from bearer-registry.ts"
    - "TTL_24H_MS, GRACE_60S_MS — now exported from bearer-registry.ts"
  patterns:
    - "Recursive setTimeout chain with cancel() closure (idempotent)"
    - "vi.useFakeTimers() + mockReturnValueOnce chain termination for timer-based TDD"
    - "webcrypto.subtle from node:crypto injected into vi.stubGlobal('crypto') for SHA-256 in happy-dom"
    - "defer-hardware-tests closure pattern (ADR-0005 Branch A human_needed carry)"
key_files:
  created:
    - "packages/foundry-module/src/pair/bearer-rotation.ts"
    - "packages/foundry-module/src/pair/bearer-rotation.test.ts"
    - "packages/foundry-module/src/__tests__/07-write-path-integration-smoke.test.ts"
  modified:
    - "packages/foundry-module/src/pair/bearer-registry.ts"
    - "packages/foundry-module/src/pair/bearer-registry.test.ts"
    - "packages/foundry-module/src/module.ts"
    - "packages/foundry-module/src/module.test.ts"
    - ".planning/STATE.md"
    - ".planning/ROADMAP.md"
decisions:
  - "RESEARCH §Q6 confirmed: generateBearer(refresh=true) already shortens old token expiresAt to now+GRACE_60S_MS — no structural validateBearer change needed"
  - "scheduleBearerRotation returns no-op cancel (T-07-06-01) when no active bearer at boot — safe for cold-start without pairing"
  - "registerComplexHandler count stays at exactly 14 — bearer rotation uses setTimeout, not a new socketlib handler"
  - "Chain termination in vi.useFakeTimers() tests: mockReturnValueOnce(active)x2 + mockReturnValue(null) stops recursive setTimeout after one rotation cycle"
  - "webcrypto.subtle from node:crypto must be injected into vi.stubGlobal('crypto') stub for SHA-256 in happy-dom environment"
  - "place-template handler uses local spell_id field (not shared-protocol item_id) — ISM-W7-05/06 tests must use spell_id"
  - "Phase 7 hardware-pending SCs SC-07-01..05 carry to ADR-0005 Branch A human_needed; running total 23"
metrics:
  duration: "~2h (context-split session)"
  completed_date: "2026-05-16"
  tasks_completed: 4
  files_created: 3
  files_modified: 6
---

# Phase 7 Plan 06: Bearer Rotation + Integration Smoke + Phase Closure Summary

**One-liner:** 24h recursive bearer rotation via `generateBearer(refresh=true)` + 10-test ISM-W7 smoke harness covering full write-path round-trip across all 5 Wave 1-3 handlers + Phase 7 STATE/ROADMAP closed.

## Tasks Completed

| Task | Name | Commit | Status |
|------|------|--------|--------|
| 1 | Bearer rotation scheduler + getActiveBearer + module.ts wiring | `e3fe4de` | Complete |
| 2 | Write-path integration smoke ISM-W7-01..08 | `ceb95e9` | Complete |
| 3 | checkpoint:human-verify | auto-approved (defer-hardware-tests) | Complete |
| 4 | STATE.md PHASE_7_CLOSED + ROADMAP.md Phase 7 flip | (INV-3 final commit) | Complete |

## What Was Built

### Task 1 — Bearer Rotation Scheduler

`packages/foundry-module/src/pair/bearer-rotation.ts` — new file:
- `scheduleBearerRotation(opts)` reads `getActiveBearer()` at boot; if null, returns no-op cancel (safe cold-start)
- Computes `remaining = Math.max(0, TTL_24H_MS - elapsed)` for first rotation delay
- `rotateNow()` calls `generateBearer(alias, bridgeUrl, worldId, true)` → emits `bearer.rotated` envelope via `bridgeDeltaEmitter` → `writeAuditLog` → chains `scheduleNext()` in `finally`
- Returns idempotent `cancel()` closure (`cancelled=true` + `clearTimeout(timer)`)

`packages/foundry-module/src/pair/bearer-registry.ts` — exported:
- `TTL_24H_MS`, `GRACE_60S_MS` — now `export const` (previously module-private)
- `getActiveBearer()` — new helper returning first non-revoked, non-expired `BearerEntry | null`

`packages/foundry-module/src/module.ts` — wired:
- `import { BEARER_ROTATED_TYPE, scheduleBearerRotation } from './pair/bearer-rotation.js'`
- Inside `Hooks.once('ready')` after `registerReactionWatcher(...)`: `scheduleBearerRotation({ emit: (payload) => bridgeDeltaEmitter(BEARER_ROTATED_TYPE, payload) })`

### Task 2 — Integration Smoke ISM-W7-01..08

`packages/foundry-module/src/__tests__/07-write-path-integration-smoke.test.ts` — 10 tests:

| ID | Handler | What is asserted |
|----|---------|-----------------|
| ISM-W7-01 | cast-spell | `activity.use({ configure: false })` called once; chatCardId extracted; audit log whisper gmIds |
| ISM-W7-02 | weapon-attack count=2 | `activity.use` called twice with `consume.action: true/false`; 2 progress envelopes |
| ISM-W7-03 | use-item | single `activity.use` |
| ISM-W7-04 | move-token | `tokenDoc.update({ x: 300, y: 450 })` |
| ISM-W7-05 | place-template (request) | `fromActivity` 3 templates → `{ placementId, total: 3 }` |
| ISM-W7-06 | confirm-template-placement | `createEmbeddedDocuments('MeasuredTemplate', [{x,y,...}])` |
| ISM-W7-07 | reaction-watcher hook | `emitSpy` once with `kind: 'shield'`; return `undefined` |
| ISM-W7-08 | drop-concentration | `effect.delete()` called once |
| IDEMPOTENCY-01 | same bearer+key | `activity.use` called once total (cache hit) |
| IDEMPOTENCY-02 | different bearers same key | `activity.use` called twice (different cache buckets per T-03-05) |

### Task 4 — Phase 7 Closure

- `STATE.md` updated with `PHASE_7_CLOSED` status, `completed_plans: 45`, `percent: 60`, Phase 7 closure section with SC-07-01..05, running total 23 hardware-pending SCs
- `ROADMAP.md` Phase 7 checkbox flipped `[ ]` → `[x]` with annotation: 6/6 plans complete 2026-05-16; SC-07-01..05 deferred; ADR-0011 ACCEPTED; registerComplexHandler count = 14

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Recursive timer chain ran indefinitely in vi.useFakeTimers tests**
- **Found during:** Task 1 TDD GREEN phase (T-RR-05 showed writeAuditLog called 33 times)
- **Issue:** `vi.advanceTimersByTimeAsync(24h)` with `mockReturnValue(active)` creates a recursive `setTimeout(fn, 0)` loop because `elapsed > TTL` makes `remaining = 0`
- **Fix:** Termination pattern `mockReturnValueOnce(active).mockReturnValueOnce(active).mockReturnValue(null)` — stops chain after expected call count
- **Files modified:** `bearer-rotation.test.ts`
- **Commit:** `e3fe4de`

**2. [Rule 2 - Missing critical] crypto.subtle undefined in happy-dom integration smoke**
- **Found during:** Task 2 ISM-W7-01 failing with `crypto.subtle.digest is not a function`
- **Issue:** `vi.stubGlobal('crypto', { randomUUID, getRandomValues })` overrides `crypto` but omits `subtle` — `hashBearer()` in `idempotency-cache.ts` calls `crypto.subtle.digest('SHA-256', ...)`
- **Fix:** Import `webcrypto` from `node:crypto` and add `subtle: webcrypto.subtle` to the stub object
- **Files modified:** `07-write-path-integration-smoke.test.ts`
- **Commit:** `ceb95e9`

**3. [Rule 1 - Bug] place-template handler uses local spell_id, not shared-protocol item_id**
- **Found during:** Task 2 ISM-W7-05 failing with `success: false`
- **Issue:** Initial test code passed `item_id: 'spell-missile'` but `PlaceTemplateArgs` local schema uses `spell_id`
- **Fix:** Changed `item_id` → `spell_id` in both ISM-W7-05 and ISM-W7-06 test args
- **Files modified:** `07-write-path-integration-smoke.test.ts`
- **Commit:** `ceb95e9`

**4. [Rule 1 - Bug] Mock state accumulation across bearer-rotation tests**
- **Found during:** Task 1 TDD — `writeAuditLog` accumulated calls from previous tests
- **Issue:** `vi.resetModules()` does not clear mock call history; cross-test contamination
- **Fix:** Added `vi.clearAllMocks()` to `beforeEach` in `bearer-rotation.test.ts`
- **Files modified:** `bearer-rotation.test.ts`
- **Commit:** `e3fe4de`

**5. [Rule 1 - Bug] TypeScript TS6133 unused variable in bearer-registry.test.ts**
- **Found during:** Task 1 typecheck
- **Issue:** `const e1 =` in "returns newest entry" test — unused variable
- **Fix:** Removed assignment (`const e1 =`), kept bare `generateBearer(...)` call
- **Files modified:** `bearer-registry.test.ts`
- **Commit:** `e3fe4de`

## Invariants Confirmed

| Invariant | Value | Verified |
|-----------|-------|---------|
| `registerComplexHandler` count | 14 (7 read + 7 tool) | Yes — module.test.ts T3 |
| `validateBearer` unchanged | No structural change | Yes — RESEARCH §Q6 confirmed |
| `generateBearer(refresh=true)` reuse | Yes — no new bearer primitive | Yes |
| ADR-0011 single-workflow-origin | All writes via `dispatchTool` → socketlib.executeAsGM | Yes |
| CI Gate 8 (`activity.use(` ban) | No `activity.use(` in g2-app or bridge | Yes |

## Hardware-Pending SCs (ADR-0005 Branch A Carry)

| SC ID | Description | Disposition |
|-------|-------------|-------------|
| SC-07-01 | cast-spell on live G2 — visible toast + damage roll | human_needed |
| SC-07-02 | multi-attack weapon-attack on live G2 — 2 progress envelopes | human_needed |
| SC-07-03 | bearer rotation on paired device — new token accepted after 24h | human_needed |
| SC-07-04 | reaction-watcher live BLE — shield toast latency ≤250ms | human_needed |
| SC-07-05 | concentration drop on live G2 — ConcentrationDropModal visible | human_needed |

Running hardware-pending SC total: **23** (18 prior phases + 5 Phase 7)

## Known Stubs

None. All 8 ISM-W7 handlers call real implementation code with mocked Foundry globals. No hardcoded empty values or placeholder returns flow to UI rendering.

## Threat Surface Scan

No new network endpoints, auth paths, or file access patterns beyond those already documented in the Phase 7 threat model. `bearer-rotation.ts` uses the existing `generateBearer` + `bridgeDeltaEmitter` channels — no new trust boundary.

## Self-Check

### Files Created/Modified
- `packages/foundry-module/src/pair/bearer-rotation.ts` — FOUND (Task 1 commit `e3fe4de`)
- `packages/foundry-module/src/pair/bearer-rotation.test.ts` — FOUND (Task 1 commit `e3fe4de`)
- `packages/foundry-module/src/__tests__/07-write-path-integration-smoke.test.ts` — FOUND (Task 2 commit `ceb95e9`)
- `packages/foundry-module/src/pair/bearer-registry.ts` — MODIFIED (Task 1 commit `e3fe4de`)
- `packages/foundry-module/src/module.ts` — MODIFIED (Task 1 commit `e3fe4de`)

### Commits
- `e3fe4de` feat(07-06): bearer rotation scheduler + getActiveBearer + module.ts wiring — FOUND
- `ceb95e9` test(07-06): Phase 7 write-path integration smoke ISM-W7-01..08 — FOUND

### Test Suite
- Total workspace: 1616 tests passing (105 test files)
- All green at commit time

## Self-Check: PASSED
