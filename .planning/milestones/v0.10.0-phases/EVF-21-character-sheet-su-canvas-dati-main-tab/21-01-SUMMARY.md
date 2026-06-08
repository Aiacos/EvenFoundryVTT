---
plan: 21-01
phase: 21
title: Schema class/initiative/speed + readers + downstream literals
status: complete
completed: 2026-06-06
requirements: [RDATA-01, RDATA-02]
key_files:
  created: []
  modified:
    - packages/shared-protocol/src/payloads/character.ts
    - packages/foundry-module/src/readers/character-reader.ts
    - packages/foundry-module/src/types/foundry-globals.d.ts
    - packages/g2-app/src/hud/boot-hud-raster-poc.ts
    - packages/g2-app/src/panels/__tests__/character-sheet-panel.test.ts
    - packages/g2-app/src/panels/__tests__/spellbook-panel.test.ts
    - packages/g2-app/src/panels/__tests__/inventory-panel.test.ts
    - packages/g2-app/src/panels/__tests__/character-sheet-tab-renderers.test.ts
    - packages/bridge/src/ws/initial-snapshot.test.ts
    - packages/foundry-mcp/src/resources/register-resources.test.ts
---

# Plan 21-01 Summary — Schema class/initiative/speed + Readers + Downstream Literals

## What was built

Extended `CharacterSnapshotSchema` (`packages/shared-protocol/src/payloads/character.ts`)
with three **REQUIRED** fields (Phase 16/17 precedent):

- `class: z.string()` — display name(s); multiclass joined with `' / '`. `level` stays separate.
- `initiative: z.number().int()` — initiative modifier (may be negative).
- `speed: z.number().int().nonnegative()` — walking speed in feet.

Added three `foundry-module` readers mirroring `extractAbilities`/`extractSkills`:
`extractClass` (class items `type === 'class'`, names joined), `extractInitiativeModifier`
(`actor.system.attributes.init.total ?? 0`), `extractWalkSpeed`
(`actor.system.attributes.movement.walk ?? 30`), wired into `getCharacterSnapshot`.
`Dnd5eAttributes` d.ts gained `init?: {total?:number}` + `movement?: {walk?:number}`.

Updated the downstream CharacterSnapshot-literal blast radius (~26 test/source files
across g2-app/bridge/foundry-mcp) so the REQUIRED fields are satisfied everywhere.

## Tasks

1. ✅ RED+GREEN schema fields (commits `7925651`, `406f952`)
2. ✅ RED+GREEN readers + d.ts (commits `2288ba7`, `7597868`)
3. ✅ Downstream literals + reader cast fix (commit `ddcdb04`) — **completed by the
   orchestrator inline** after the executor subagent was interrupted by an account-level
   monthly spend-limit mid-Task-3 (4 commits had already landed; ~13 tsc errors / literals
   remained, finished here).

## Verification

- `tsc --noEmit` exits 0 across all 6 packages.
- `pnpm test -- --run` → **235 files / 3199 tests pass** (+19 vs Phase 20's 3180:
  CS-CIS-1..7 schema + CR-CLS/CR-INI/CR-SPD reader tests).
- socketlib handler count unchanged (read-path-only extension).
- `panel-gesture-bus.ts` untouched.

## Deviations

- **Task 3 finished by orchestrator** (not the executor) due to the spend-limit
  interruption — same content, same `class: 'Fighter', initiative: 2, speed: 30`
  convention the executor used in the already-committed files. Field insertion order
  varies (order-independent for TS/Zod).
- foundry-module reader `extractClass` needed an `as unknown as` cast (TS2352) — fixed.

## Notes for downstream plans (21-02..21-05)

- The schema substrate is ready; `CanvasCharacterSheetPanel` (21-03) can consume
  real `class`/`initiative`/`speed`.
- 21-02 (ditherTile extraction), 21-03 (CanvasCharacterSheetPanel), 21-04 (portrait),
  21-05 (INV-1 fixtures) remain to execute.
