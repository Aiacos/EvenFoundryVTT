---
phase: "05"
plan: "01"
subsystem: "panel-plugin-system"
tags: [panel-router, i18n, schema-extension, wave-0, adr-0010]
dependency_graph:
  requires: []
  provides:
    - PanelRouter (g2-app engine)
    - PanelMetaSchema (shared validation)
    - LOCALE_MENU constant (7 locales)
    - HUD_WIDTH_BUDGETS Phase 5 keys (134 total)
    - HudLocale widened (es/fr/pt-br added)
    - WorldStateSchema + CharacterSnapshot.world (required)
    - ConcentrationSchema + Combatant.concentration (optional)
    - FoundryActiveEffect type declaration
  affects:
    - packages/shared-protocol (character.ts, combat.ts)
    - packages/foundry-module (character-reader.ts, combat-reader.ts, foundry-globals.d.ts)
    - packages/g2-app (engine, locale, status-hud i18n)
    - packages/bridge (server.test.ts fixture update)
    - All downstream consumer test fixtures (world field back-fill)
tech_stack:
  added:
    - Zod WorldStateSchema (z.object open, forward-compat)
    - Zod ConcentrationSchema (z.object open, forward-compat)
    - ADR-0010 (Panel Plugin Registry, MADR 4.0)
  patterns:
    - Wave-0 atomic fan-out (shared files extended once, downstream plans are READ-ONLY)
    - TestablePanelRouter subclass (overrides discoverPanels for import.meta.glob testability)
    - Required schema field + atomic commit (Phase 4b precedent: no optional drift window)
    - as const satisfies ReadonlyArray<LocaleMenuEntry> (compile-time locale brand)
    - Per-key EN fallback for best-effort locales (es/fr/pt-br use row.en, not full locale)
key_files:
  created:
    - packages/g2-app/src/engine/panel-router.ts
    - packages/g2-app/src/engine/__tests__/panel-router.test.ts
    - packages/g2-app/src/locale/locale-menu.ts
    - packages/g2-app/src/locale/__tests__/locale-menu.test.ts
    - packages/shared-protocol/src/payloads/combat.test.ts
    - docs/architecture/0010-panel-plugin-registry.md
  modified:
    - packages/g2-app/src/status-hud/i18n-budgets.ts (36 → 134 keys, HudLocale widened)
    - packages/g2-app/src/status-hud/__tests__/i18n-budgets.test.ts (IB-ALL-1 + 14 IB-P5-* tests)
    - packages/shared-protocol/src/payloads/character.ts (WorldStateSchema + world field)
    - packages/shared-protocol/src/payloads/character.test.ts (CHAR-MR-1..6)
    - packages/shared-protocol/src/payloads/combat.ts (ConcentrationSchema + concentration)
    - packages/foundry-module/src/types/foundry-globals.d.ts (FoundryActiveEffect + effects)
    - packages/foundry-module/src/readers/character-reader.ts (modernRules detection)
    - packages/foundry-module/src/readers/combat-reader.ts (concentration detection)
    - packages/foundry-module/src/readers/readers.test.ts (CHRD-MR-1..3 + CMRD-CONC-1..4)
    - docs/architecture/README.md (ADR-0010 row)
    - packages/bridge/src/server.test.ts (world fixture back-fill)
    - packages/g2-app/src/__tests__/04b-integration-smoke.test.ts (world fixture)
    - packages/g2-app/src/__tests__/example-status-hud.test.ts (world fixture)
    - packages/g2-app/src/__tests__/scene-renderer-smoke.test.ts (world fixture)
    - packages/g2-app/src/status-hud/__tests__/snapshot.test.ts (world fixture)
    - packages/g2-app/src/status-hud/__tests__/status-hud-layer.test.ts (world fixture)
    - packages/g2-app/src/status-hud/__tests__/status-hud-renderer.test.ts (world fixture)
decisions:
  - PanelRouter uses import.meta.glob (ADR-0010 Option C) — filesystem scan and parallel registry rejected
  - WorldStateSchema.world is REQUIRED (not optional) — atomic commit closes drift window, Phase 4b precedent
  - ConcentrationSchema uses z.object (not z.strictObject) — open for forward-compat with Phase 7+ spellId
  - HudLocale widened to 6 locales; best-effort (es/fr/pt-br) use per-key EN fallback (I18N-05)
  - TestablePanelRouter subclass overrides discoverPanels() to inject _mockModules map
metrics:
  duration: "~16 minutes"
  completed: "2026-05-15T19:32:08Z"
  tasks_completed: 3
  tasks_total: 3
  files_created: 6
  files_modified: 17
---

# Phase 5 Plan 01: Wave-0 Atomic Foundation — Panel Router + i18n + Schema Extensions

**One-liner:** PanelRouter + import.meta.glob registry (ADR-0010) + 134 i18n keys + WorldStateSchema (required) + ConcentrationSchema (optional) — all shared files extended atomically so Wave 1-3 plans are READ-ONLY consumers.

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | PanelRouter + PanelMetaSchema + LOCALE_MENU + ADR-0010 | `2a349c9` | panel-router.ts, locale-menu.ts, 0010-panel-plugin-registry.md, ADR README |
| 2 | HUD_WIDTH_BUDGETS Phase 5 keys + HudLocale widening + EN fallback | `c615b77` | i18n-budgets.ts + test |
| 3 | CharacterSnapshot.world + Combatant.concentration + reader extensions (atomic) | `2a123b3` | 15 files across 4 packages |

## Key Decisions

### ADR-0010: Panel Plugin Registry (import.meta.glob)

Three options evaluated:
- **Option A** (filesystem scan via Node `fs.readdir`): rejected — no fs access in Even Realities WebView
- **Option B** (parallel registry alongside LayerManager): rejected — duplicates routing surface
- **Option C** (import.meta.glob auto-discovery): CHOSEN — Vite-native, zero runtime overhead, single entry point

### WorldStateSchema Required (not optional)

Phase 4b established the pattern: adding a required field to `CharacterSnapshotSchema` must be done atomically (schema + reader + all consumer tests in one commit). Making `world` optional would create a drift window where tests pass with missing data. All 7 consumer fixtures were back-filled in the same commit (Rule 1 auto-fix — direct consequence of required field).

### ConcentrationSchema open z.object

`ConcentrationSchema` and `WorldStateSchema` both use `z.object` (not `z.strictObject`) for forward-compatibility. Phase 7+ may add `spellId` or `worldEdition` without breaking Phase 5 consumers. Tests CHAR-MR-4 and COMB-CONC-5 verify extra fields pass.

### Per-key EN fallback for best-effort locales

`getLabel(field, 'es')` returns `row.en`, not a locale-switched fallback. This is intentional (I18N-05): es/fr/pt-br budgets are not computed, so using their hypothetical translations would overflow width constraints. EN is the safe fallback.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] World fixture back-fill across consumer packages**
- **Found during:** Task 3 verification (test run)
- **Issue:** Making `CharacterSnapshot.world` REQUIRED caused 11 test failures across g2-app (SHL-PIVOT-3..6 + 7 other suites) and 1 in bridge — `VALID_SNAPSHOT`/`IDLE_SNAPSHOT`/`BASE_SNAPSHOT`/`makeSnapshot()`/`makeDeathSnapshot()`/inline JSON fixtures all missing `world` field
- **Fix:** Added `world: { modernRules: false }` to all consumer fixtures (7 g2-app test files + 1 bridge test file)
- **Files modified:** status-hud-layer.test.ts, example-status-hud.test.ts, 04b-integration-smoke.test.ts, scene-renderer-smoke.test.ts, snapshot.test.ts, status-hud-renderer.test.ts (×2 factories), server.test.ts
- **Commits:** included in `2a123b3`

**2. [Rule 1 - Bug] Biome format fix on readers.test.ts after CMRD-CONC-3 quote style**
- **Found during:** Task 3 `pnpm lint:ci` (1 error)
- **Issue:** Test name string used double-quotes where Biome expects single quotes
- **Fix:** `pnpm format` applied (1 file fixed automatically)
- **Commits:** included in `2a123b3`

## Test Coverage

| Suite | Tests Added | IDs |
|-------|-------------|-----|
| shared-protocol character.test.ts | 6 | CHAR-MR-1..6 |
| shared-protocol combat.test.ts (NEW) | 5 | COMB-CONC-1..5 |
| foundry-module readers.test.ts | 7 | CHRD-MR-1..3, CMRD-CONC-1..4 |
| g2-app i18n-budgets.test.ts | 15 | IB-ALL-1 update + IB-P5-1..14 |
| g2-app panel-router.test.ts (NEW) | 21 | PRT-DISC-01..04, PRT-OPEN-01..04, PRT-CLOSE-01..02, PRT-IS-OPEN, PanelMetaSchema |
| g2-app locale-menu.test.ts (NEW) | 5 | LM-1..5 |
| **Total added** | **59** | |

**Final test run:** 865 passed, 0 failed (62 test files)

## Known Stubs

None — all data sources are wired. `PanelRouter.openPanel()` is fully implemented; no hardcoded mock data flows to consumers.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries. The `world.modernRules` field reads from `game.settings.get()` (Foundry-internal, read-only).

## Self-Check: PASSED

Created files verified:
- packages/g2-app/src/engine/panel-router.ts — FOUND
- packages/g2-app/src/locale/locale-menu.ts — FOUND
- packages/shared-protocol/src/payloads/combat.test.ts — FOUND
- docs/architecture/0010-panel-plugin-registry.md — FOUND

Commits verified:
- 2a349c9 (Task 1) — FOUND
- c615b77 (Task 2) — FOUND
- 2a123b3 (Task 3) — FOUND

Tests: 865/865 passing. Lint: 0 errors. Typecheck: clean.
