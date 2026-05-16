---
phase: 07-foundry-module-write-path
plan: "04"
subsystem: multi-attack-tracker
tags: [multi-attack, weapon-attack, combat-tracker, inv-1, path-b, progress-dispatcher]
dependency_graph:
  requires: [07-02, 07-03]
  provides: [MULTI-01-closure, r1.multiattack.progress-wire-format, combat-tracker-chip]
  affects: [weapon-attack-handler, combat-tracker-panel, shared-protocol-payloads]
tech_stack:
  added:
    - MultiAttackProgressPayloadSchema (Zod, shared-protocol)
    - R1_MULTIATTACK_PROGRESS_TYPE constant
    - multi-attack-progress-dispatcher.ts (double trust boundary pattern)
    - INV-1 fixture: combat-tracker-multi-attack.txt
  patterns:
    - Path B client-side loop (RESEARCH §Q1 verdict: no count field in dnd5e 5.3.3)
    - Injectable progress emitter (setMultiAttackProgressEmitter, no-op default)
    - Double trust boundary (mirrors conc-conflict-dispatcher exactly)
    - panelRef mutable ref pattern for late-binding panel handle
key_files:
  created:
    - packages/shared-protocol/src/payloads/multi-attack.ts
    - packages/shared-protocol/src/payloads/multi-attack.test.ts
    - packages/g2-app/src/panels/multi-attack-progress-dispatcher.ts
    - packages/g2-app/src/panels/multi-attack-progress-dispatcher.test.ts
    - packages/g2-app/src/panels/__fixtures__/combat-tracker-multi-attack.txt
  modified:
    - packages/shared-protocol/src/tools/weapon-attack.ts
    - packages/shared-protocol/src/tools/tools.test.ts
    - packages/shared-protocol/src/index.ts
    - packages/foundry-module/src/write-path/handlers/weapon-attack.ts
    - packages/foundry-module/src/write-path/handlers/weapon-attack.test.ts
    - packages/foundry-module/src/module.ts
    - packages/g2-app/src/panels/combat-tracker-panel.ts
    - packages/g2-app/src/panels/__tests__/combat-tracker-panel.test.ts
decisions:
  - "Path B (client-side loop) confirmed mandatory — dnd5e 5.3.3 ActivityUseConfiguration has no count/times/repeat field (RESEARCH §Q1 verdict). for i in count: activity.use({ configure: false, consume: { action: i === 0 } })."
  - "Progress emitter injected via setMultiAttackProgressEmitter(fn|null); default no-op lets unit tests run without wiring. module.ts ready hook wires bridgeDeltaEmitter."
  - "No new socketlib handler registered — progress uses bridgeDeltaEmitter channel (existing). Count stays 14."
  - "[Atk N/M] chip is exactly 9 chars replacing dist+dir(6)+gap3(3) = 9 chars — INV-1 row width preserved at 66 cp."
  - "Dispatcher uses panelRef: { current: handle | null } pattern to allow late-binding panel handle without strong ref."
  - "SC-07-04 hardware-pending: Fighter L5+ Extra Attack with MidiQOL autoFastForward produces 2 chat cards + chip ticks [Atk 1/2] → [Atk 2/2] — requires hardware (G2 + Even Hub)."
metrics:
  duration_minutes: 105
  completed_date: "2026-05-16"
  tasks_completed: 2
  files_created: 5
  files_modified: 8
  tests_added: 37
  tests_total: 1532
---

# Phase 7 Plan 04: Multi-Attack Tracker (MULTI-01) Summary

**One-liner:** Path B client-side attack loop (count=1..10) + `r1.multiattack.progress` envelope + `[Atk N/M]` CombatTracker chip via double-trust-boundary dispatcher.

## What Was Built

MULTI-01 closure: the weapon-attack handler now supports multi-attack sequences (Extra Attack, TWF, haste) via a client-side `for` loop. RESEARCH §Q1 confirmed: `count` does NOT exist in dnd5e 5.3.3 `ActivityUseConfiguration` — Path B (loop in handler) is the only valid implementation.

### Task 1 — WeaponAttackInputSchema + Path B loop + progress emitter

- **WeaponAttackInputSchema**: added `count: z.number().int().min(1).max(10).default(1)`. Backward-compatible — callers omitting `count` receive default 1 (all Phase 07-02 tests unchanged).
- **MultiAttackProgressPayloadSchema** + `R1_MULTIATTACK_PROGRESS_TYPE` exported from `@evf/shared-protocol/payloads/multi-attack.ts` (separate file to avoid index.ts merge conflict with Plan 07-03).
- **weaponAttackHandler.handle()**: wraps `activity.use` in Path B loop. `consume.action: true` only on `i === 0` (action economy — Extra Attack doesn't double-spend the Action). Returns `{ attackId: UUID, attacks: Array<{attackIndex, chatCardId}> }`. `attackId` is stable across all iterations of one invocation.
- **setMultiAttackProgressEmitter(fn|null)**: injectable module-level emitter. Default no-op allows unit tests without injection. `module.ts` ready hook wires `bridgeDeltaEmitter('r1.multiattack.progress', payload)`.
- **No new socketlib handler** — count stays at 14 (verified with `grep -c 'socketlib\.registerComplexHandler'`).

Commit: `f58af37`

### Task 2 — CombatTrackerPanel chip + multi-attack-progress-dispatcher + INV-1 fixture

- **MultiAttackState interface** exported from `combat-tracker-panel.ts`: `{ current, total, attackId, actorId }`.
- **setMultiAttackState(state|null)** public method: sets private field + fires `void this.draw()`. Called by dispatcher.
- **Chip rendering**: when `multiAttackState !== null && combatant.actorId === multiAttackState.actorId`, the 9-char `distDirGap3` field (dist=6 + gap3=3) is replaced by `[Atk N/M]` (exactly 9 chars). INV-1 row width preserved at 66 cp.
- **Phase 5 INV-1 fixtures unchanged** — `multiAttackState` defaults to `null`, no chip = identical output.
- **multi-attack-progress-dispatcher.ts**: mirrors `conc-conflict-dispatcher.ts` exactly. Double trust boundary: `EnvelopeSchema.safeParse` (outer) → type narrow on `R1_MULTIATTACK_PROGRESS_TYPE` → `MultiAttackProgressPayloadSchema.safeParse` (inner). On `current === total`: calls `panel.setMultiAttackState(null)` (chip auto-clears). Uses `panelRef: { current: handle | null }` mutable ref for late-binding.
- **INV-1 fixture** `combat-tracker-multi-attack.txt`: generated via Vitest `toMatchFileSnapshot` with `renderCombatTrackerContent` + multiAttackState showing GOBLIN ARCHER row with `[Atk 1/2]` chip. Auto-generated correct content on first run via `vitest -u`.

Commit: `9d8785a`

## Test Coverage

| Suite | Tests Added | Total |
|-------|-------------|-------|
| shared-protocol/payloads/multi-attack.test.ts | 12 (MAT-1..12) | new |
| shared-protocol/tools/tools.test.ts | 6 (WAIS-COUNT-1..6) | extended |
| foundry-module/handlers/weapon-attack.test.ts | 6 (WA-MULTI-1..6) | extended |
| g2-app/combat-tracker-panel.test.ts | 7 (CTP-MULTI-1..6, CTP-FIX-MULTI) | extended |
| g2-app/multi-attack-progress-dispatcher.test.ts | 9 (MAPD-1..9) | new |
| **Total added** | **~37** | **1532 total** |

## Verification Gates (all passed)

- `pnpm --filter @evf/shared-protocol test`: 282/282
- `pnpm --filter @evf/foundry-module test`: 282/282
- `pnpm --filter @evf/g2-app test`: 898/898 (snapshot regenerated via `vitest -u`)
- `pnpm typecheck`: clean
- `grep -c 'socketlib\.registerComplexHandler' socketlib-handlers.ts`: **14** (unchanged)
- `grep -q 'Atk 1/2' combat-tracker-multi-attack.txt`: confirmed
- `! grep -rE 'activity\.use\(' packages/g2-app packages/bridge`: Gate 8 clean

## Hardware-Pending Scenario

**SC-07-04** (hardware-pending — requires G2 + Even Hub):
- Fighter L5+ with Extra Attack equipped weapon
- MidiQOL autoFastForward enabled
- Issue `weapon-attack` tool call with `count: 2`
- Expected: 2 chat cards appear, combat tracker chip ticks `[Atk 1/2]` then `[Atk 2/2]` then clears
- Cannot simulate in unit tests (requires real Foundry + dnd5e Activity system)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] args.count undefined in direct handle() calls**
- **Found during:** Task 1 WA-MULTI tests
- **Issue:** When `handle()` is called directly in tests without going through `argsSchema.safeParse`, `args.count` is `undefined`. `for (let i = 0; i < undefined; i++)` never runs — handler returned empty attacks array.
- **Fix:** Added `const count = args.count ?? 1` defensive fallback. JSDoc documents this explicitly.
- **Files modified:** `packages/foundry-module/src/write-path/handlers/weapon-attack.ts`
- **Commit:** `f58af37`

**2. [Rule 1 - Bug] Existing happy-path test shape mismatch**
- **Found during:** Task 1 GREEN verification
- **Issue:** Phase 07-02 happy-path test expected `{ data: { chatCardId } }` but new handler returns `{ data: { attackId, attacks } }`. Also expected `activity.use({ configure: false })` but now `{ configure: false, consume: { action: true } }`.
- **Fix:** Updated test expectations to match new multi-attack return shape and consume.action flag.
- **Files modified:** `packages/foundry-module/src/write-path/handlers/weapon-attack.test.ts`
- **Commit:** `f58af37`

**3. [Rule 1 - Bug] INV-1 fixture had stale/wrong content**
- **Found during:** Task 2 CTP-FIX-MULTI test first run
- **Issue:** Fixture pre-created with non-chip content (showed `--       ` instead of `[Atk 1/2]` chip and was missing trailing spaces required by the renderer).
- **Fix:** Used `npx vitest --run -u` to auto-regenerate via `toMatchFileSnapshot`'s update mechanism. Correct content committed.
- **Files modified:** `packages/g2-app/src/panels/__fixtures__/combat-tracker-multi-attack.txt`
- **Commit:** `9d8785a`

## Known Stubs

None. All chip rendering is wired through to real `renderCombatantRow` → `renderCombatTrackerContent` → `draw()`. Dispatcher connects to real `EnvelopeSchema` + `MultiAttackProgressPayloadSchema` validation.

## Threat Surface Scan

No new network endpoints, auth paths, or schema changes at trust boundaries beyond those already declared in the plan's threat model (T-07-04-01 through T-07-04-05). `count` field DoS mitigation (T-07-04-01) implemented via `max(10)` in schema.

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| packages/shared-protocol/src/payloads/multi-attack.ts | FOUND |
| packages/shared-protocol/src/payloads/multi-attack.test.ts | FOUND |
| packages/g2-app/src/panels/multi-attack-progress-dispatcher.ts | FOUND |
| packages/g2-app/src/panels/multi-attack-progress-dispatcher.test.ts | FOUND |
| packages/g2-app/src/panels/__fixtures__/combat-tracker-multi-attack.txt | FOUND |
| .planning/phases/07-foundry-module-write-path/07-04-SUMMARY.md | FOUND |
| Commit f58af37 (Task 1) | FOUND |
| Commit 9d8785a (Task 2) | FOUND |
