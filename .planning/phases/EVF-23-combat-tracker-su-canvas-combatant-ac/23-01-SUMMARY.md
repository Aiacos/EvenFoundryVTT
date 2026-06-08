---
phase: 23-combat-tracker-su-canvas-combatant-ac
plan: 01
subsystem: api
tags: [zod, shared-protocol, combat, schema, tdd]

# Dependency graph
requires:
  - phase: 05-panel-plugin-system-read-only-panels
    provides: CombatantSchema base (id/name/actorId/initiative/hp/maxHp/isCurrentTurn/concentration)
provides:
  - CombatantSchema.ac optional field (z.number().int().nonnegative().optional()) in shared-protocol
  - RDATA-05 schema half satisfied — ready for Plan 23-02 (reader) and 23-03 (canvas panel)
affects:
  - 23-02-PLAN (foundry-module AC reader — consumes Combatant.ac? type)
  - 23-03-PLAN (g2-app canvas panel — consumes CombatantSchema.ac for rendering)
  - All packages that import CombatantSchema (bridge, g2-app, foundry-module)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Optional Zod field on strictObject: ac: z.number().int().nonnegative().optional() — mirrors concentration precedent (Phase 5)"

key-files:
  created: []
  modified:
    - packages/shared-protocol/src/payloads/combat.ts
    - packages/shared-protocol/src/payloads/combat.test.ts

key-decisions:
  - "ac field is OPTIONAL (.optional()) not required — 31+ existing test literals construct Combatant without ac; making it required would break them all (Pitfall 1 from research)"
  - "Field position: after concentration field, mirrors Phase 5 concentration optional precedent"
  - "No Combatant type export change needed — z.infer automatically picks up the new optional field"

patterns-established:
  - "Pattern: optional Zod extension on strictObject avoids downstream literal mass-updates — use .optional() for any new optional CombatantSchema field"

requirements-completed: [RDATA-05]

# Metrics
duration: 4min
completed: 2026-06-08
---

# Phase 23 Plan 01: CombatantSchema.ac Optional Field Summary

**`ac: z.number().int().nonnegative().optional()` added to CombatantSchema in shared-protocol via TDD RED/GREEN — 0 downstream Combatant literals required updating**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-06-08T07:37:51Z
- **Completed:** 2026-06-08T07:41:39Z
- **Tasks:** 2 (TDD: RED test + GREEN implementation)
- **Files modified:** 2

## Accomplishments

- Extended `CombatantSchema` (z.strictObject) with `ac: z.number().int().nonnegative().optional()` — the single source of truth for Armor Class in the shared-protocol
- Added 5 RDATA-05 test cases (AC-1..AC-5): backward-compat, positive parse, nonnegative guard, int guard, optional semantics
- Confirmed 0 downstream literals required updates — the `.optional()` choice means all 31+ existing `Combatant` test literals continue to parse without modification
- Full workspace suite: **3268/3268 tests pass** (no regressions); `tsc --noEmit` clean

## Task Commits

1. **Task 1: Add RDATA-05 ac tests to combat.test.ts (RED)** - `9c5727e` (test)
2. **Task 2: Add optional ac field to CombatantSchema (GREEN)** - `889f256` (feat)

## Files Created/Modified

- `packages/shared-protocol/src/payloads/combat.ts` — added `ac: z.number().int().nonnegative().optional()` field with JSDoc (Phase 23 addition, RDATA-05, D-23.4, `' --'` fallback note, producer reference)
- `packages/shared-protocol/src/payloads/combat.test.ts` — added `describe('CombatantSchema.ac (RDATA-05)')` block with 5 test cases (AC-1..AC-5)

## Decisions Made

- `ac` is OPTIONAL per Pitfall 1 from research: `CombatantSchema` is a `z.strictObject`; a required field would break 31+ existing test literals that construct `Combatant` without `ac`. The `.optional()` strategy mirrors the `concentration` field precedent from Phase 5.
- Field placed after `concentration` in the schema declaration (natural grouping of optional fields).
- No change to `Combatant` or `CombatSnapshot` type exports — `z.infer` picks up `ac?: number` automatically.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — this plan adds a schema field only. No rendering stubs introduced. The `' --'` fallback is the *renderer's* responsibility (Plan 23-03), not a stub in this schema.

## Threat Flags

None — schema field extension only; no new network endpoints, auth paths, file access patterns, or trust boundary changes introduced.

## Self-Check

**Files exist:**
- `packages/shared-protocol/src/payloads/combat.ts` — FOUND (modified, contains `ac: z.number().int().nonnegative().optional()`)
- `packages/shared-protocol/src/payloads/combat.test.ts` — FOUND (modified, contains `describe('CombatantSchema.ac (RDATA-05)')`)

**Commits exist:**
- `9c5727e` — FOUND (test(23-01): add failing RDATA-05 ac tests)
- `889f256` — FOUND (feat(23-01): add optional ac field)

## Self-Check: PASSED

## Issues Encountered

None. The TDD RED/GREEN cycle worked as expected: AC-2 (`ac: 18`) correctly failed on the `strictObject` unknown-key rejection before the field was added, and passed immediately after.

## Next Phase Readiness

- **Plan 23-02 (foundry-module):** `Combatant.ac?: number` is now in the type — `extractCombatantAc()` reader can be written and `getCombatSnapshot()` can emit `ac` per combatant.
- **Plan 23-03 (g2-app):** `CanvasCombatTrackerPanel` can reference `c.ac` in `renderCombatantRow` and use `c.ac?.toString() ?? ' --'` fallback per D-23.2.
- No blockers. RDATA-05 schema half is complete.

---
*Phase: 23-combat-tracker-su-canvas-combatant-ac*
*Completed: 2026-06-08*
