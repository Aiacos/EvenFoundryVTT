---
phase: 23-combat-tracker-su-canvas-combatant-ac
plan: 02
subsystem: foundry-module
tags: [foundry-module, combat-reader, tdd, rdata-05, ac-extraction]

# Dependency graph
requires:
  - phase: 23-combat-tracker-su-canvas-combatant-ac
    plan: 01
    provides: CombatantSchema.ac optional field (z.number().int().nonnegative().optional())
provides:
  - extractCombatantAc() helper in combat-reader.ts
  - getCombatSnapshot() emits ac per linked combatant (RDATA-05 reader half)
affects:
  - 23-03-PLAN (g2-app canvas panel — CanvasCombatTrackerPanel consumes Combatant.ac)
  - bridge WS delta: combat.delta now carries ac for each linked combatant

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "extractCombatantAc: null-safe optional-field reader — typeof !== 'number' || !Number.isFinite guard, Math.max(0, Math.round(val)) normalisation; mirrors extractWalkSpeed pattern (Phase 21)"
    - "conditional spread ...(acVal !== undefined ? { ac: acVal } : {}) — mirrors concentration spread (Phase 5)"

key-files:
  created: []
  modified:
    - packages/foundry-module/src/readers/combat-reader.ts
    - packages/foundry-module/src/readers/readers.test.ts

key-decisions:
  - "Read actor.system.attributes.ac.value only (D-23.4 — no flat+bonus+armor derivation)"
  - "foundry-globals.d.ts NOT modified — Dnd5eAttributes.ac: { value: number } was already declared at line 254 (research finding 2, confirmed by grep guard)"
  - "NaN guard: !Number.isFinite(val) catches NaN and ±Infinity; typeof guard catches string/undefined/null"
  - "Clamp to 0 + round: ensures result satisfies CombatantSchema.ac .int().nonnegative() invariant"

requirements-completed: [RDATA-05]

# Metrics
duration: 2min
completed: 2026-06-08
---

# Phase 23 Plan 02: extractCombatantAc + Wire AC into getCombatSnapshot Summary

**`extractCombatantAc()` reads `actor.system.attributes.ac.value` null-safely; `getCombatSnapshot()` now emits `ac` per linked combatant via conditional spread — RDATA-05 reader half complete**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-06-08T05:44:37Z
- **Completed:** 2026-06-08T05:46:45Z
- **Tasks:** 2 (TDD: RED test + GREEN implementation)
- **Files modified:** 2

## Accomplishments

- Added `extractCombatantAc(actor: FoundryActor | null): number | undefined` to `combat-reader.ts`:
  - Reads `actor?.system.attributes.ac?.value` (optional chain, null-safe)
  - Returns `undefined` when `typeof val !== 'number' || !Number.isFinite(val)` (guards string, NaN, Infinity, undefined, null)
  - Returns `Math.max(0, Math.round(val))` for valid numbers (clamps negatives to 0, rounds fractional)
  - JSDoc with `@param`, `@returns`, `@see` per INV-4
- Wired `acVal = extractCombatantAc(c.actor)` into the combatant `.map(...)` callback
- Appended `...(acVal !== undefined ? { ac: acVal } : {})` conditional spread (after concentration spread, mirrors Phase 5 pattern)
- Added 4 RDATA-05 reader tests in `readers.test.ts` under `describe('ac extraction (RDATA-05)')`:
  - R1: `ac.value === 18` → `combatant.ac === 18`
  - R2: `actor === null` (unlinked) → `'ac' in combatant === false`
  - R3: `ac.value` is string `'18'` → `'ac' in combatant === false`
  - R4: `18.6` → `19` (round); `-5` → `0` (clamp)
- Confirmed `foundry-globals.d.ts` unchanged (grep guard: `UNCHANGED`)
- Full suite: **562/562 tests pass**; `tsc --noEmit` exit 0

## Task Commits

1. **Task 1: RDATA-05 reader tests (RED)** - `c77d299` (test)
2. **Task 2: extractCombatantAc + wire ac (GREEN)** - `9c38944` (feat)

## Files Created/Modified

- `packages/foundry-module/src/readers/combat-reader.ts` — added `extractCombatantAc()` helper + `acVal` wiring in combatant map (35 lines added)
- `packages/foundry-module/src/readers/readers.test.ts` — added `describe('ac extraction (RDATA-05)')` block with 4 test cases (161 lines added)

## Decisions Made

- `foundry-globals.d.ts` left untouched — `Dnd5eAttributes.ac: { value: number }` was already declared at line 254 (Phase 23 research finding 2). The grep guard `git diff --quiet foundry-globals.d.ts && echo UNCHANGED` passes.
- Single field read (`ac.value`) per D-23.4 (no flat+bonus+armor derivation — deferred idea, not in scope).
- `!Number.isFinite` guard chosen over `isNaN` alone to also exclude `Infinity`/`-Infinity` edge cases.
- `extractCombatantAc` is module-scoped (not exported) — it is a reader-internal helper, not part of the public API.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — this plan adds the reader path only. The `' --'` fallback for absent AC is the renderer's responsibility (Plan 23-03, `CanvasCombatTrackerPanel`).

## Threat Flags

None — read-only data extraction from Foundry actor attributes; no new network endpoints, auth paths, or trust boundary changes.

## TDD Gate Compliance

- RED gate: `c77d299` (`test(23-02): add failing RDATA-05 ac reader tests (RED)`) — 2 tests failed before implementation
- GREEN gate: `9c38944` (`feat(23-02): extractCombatantAc + wire ac into getCombatSnapshot (GREEN)`) — all 562 tests pass

## Self-Check

**Files exist:**
- `packages/foundry-module/src/readers/combat-reader.ts` — FOUND (contains `extractCombatantAc`, ≥2 occurrences)
- `packages/foundry-module/src/readers/readers.test.ts` — FOUND (contains `ac extraction (RDATA-05)`)

**Commits exist:**
- `c77d299` — FOUND (test(23-02): add failing RDATA-05 ac reader tests)
- `9c38944` — FOUND (feat(23-02): extractCombatantAc + wire ac into getCombatSnapshot)

**foundry-globals.d.ts unchanged:**
- `git diff --quiet foundry-globals.d.ts && echo UNCHANGED` → UNCHANGED

## Self-Check: PASSED

## Next Phase Readiness

- **Plan 23-03 (g2-app):** `getCombatSnapshot()` now emits `ac?: number` per combatant; `CanvasCombatTrackerPanel.renderCombatantRow` can reference `c.ac` and use `c.ac?.toString() ?? ' --'` fallback per D-23.2
- No blockers. RDATA-05 reader half is complete.

---
*Phase: 23-combat-tracker-su-canvas-combatant-ac*
*Completed: 2026-06-08*
