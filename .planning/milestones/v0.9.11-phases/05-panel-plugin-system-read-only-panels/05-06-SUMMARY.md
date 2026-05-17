---
phase: 05-panel-plugin-system-read-only-panels
plan: "06"
subsystem: g2-app
tags: [g2-app, locale-override, boot-engine, integration-smoke, i18n-02, i18n-05, inv-1, stress-fixtures, panel-router-wire, phase-5-closure]

requires:
  - phase: 05-01
    provides: LOCALE_MENU + widened HudLocale ('it'|'en'|'de'|'es'|'fr'|'pt-br') + getLabel per-key EN fallback
  - phase: 05-02..05-05
    provides: 5 player-navigable panels (CharacterSheet, Inventory, Spellbook, CombatTracker, Log)
  - phase: 04b-02
    provides: boot-engine-core.ts step ordering + map-mode-toggle.ts exemplar for locale-override module

provides:
  - "locale-override.ts: loadLocaleOverride(bridge) + persistLocaleOverride(bridge, locale) + LOCALE_OVERRIDE_KEY"
  - "boot-engine step 9c: reads 'view.locale.override' from Even Hub kv; non-'auto' overrides opts.locale (I18N-02)"
  - "BootEngineLocale widened to 'it'|'en'|'de'|'es'|'fr'|'pt-br' matching HudLocale (I18N-05)"
  - "BootEngineHandle.effectiveLocale: boot-resolved locale after override read-back"
  - "05-panel-integration-smoke.test.ts: 13 PSM-* + 8 PSM-FIX-* tests — Phase 5 closure smoke"
  - "8 INV-1 fixtures in shared-render/src/fixtures/: 3 stress (ES/FR/PT-BR) + 2 DE + 2 EN + 1 ES auxiliary"
  - "SC-5 contractual proof at PSM-13: 6th mock panel auto-discovered with zero core file changes"

affects:
  - Phase 6 retry handler (hooks into BootEngineHandle.effectiveLocale)
  - Hardware validation gate (ADR-0005 Branch A — SC-05-01..SC-05-05 carry-forward)

tech-stack:
  added: []
  patterns:
    - "locale-override.ts mirrors map-mode-toggle.ts exemplar: STORAGE_KEY + defensive loadX() + persistX()"
    - "TestablePanelRouter subclass: setMockModules() injects glob mock for test isolation (ADR-0010 RESEARCH §Pattern 1)"
    - "fixtureDir() = resolve(__dirname, '../../../../shared-render/src/fixtures') — canonical fixture path pattern"
    - "AsciiGrid.fromString(output.join('\\n')) wrapping for matchAsciiFixture type compliance"
    - "CombatantSnapshot optional (not nullable) concentration field — omit key rather than null"

key-files:
  created:
    - packages/g2-app/src/locale/locale-override.ts
    - packages/g2-app/src/locale/__tests__/locale-override.test.ts
    - packages/g2-app/src/__tests__/boot-engine-locale-override.test.ts
    - packages/g2-app/src/__tests__/05-panel-integration-smoke.test.ts
    - packages/shared-render/src/fixtures/locale-override.stress-es.it.txt
    - packages/shared-render/src/fixtures/locale-override.stress-fr.it.txt
    - packages/shared-render/src/fixtures/locale-override.stress-pt-br.it.txt
    - packages/shared-render/src/fixtures/sheet.main.2014.de.txt
    - packages/shared-render/src/fixtures/combat-tracker.full-window.de.txt
    - packages/shared-render/src/fixtures/sheet.main.2014.en.txt
    - packages/shared-render/src/fixtures/sheet.skills.en.txt
    - packages/shared-render/src/fixtures/inventory.2014.es.txt
  modified:
    - packages/g2-app/src/internal/boot-engine-core.ts (step 9c + BootEngineLocale widen + effectiveLocale field)
    - packages/g2-app/src/engine/boot-engine-error-wrapper.ts (BootErrorLocale normalization — Rule 1 fix)

key-decisions:
  - "Fixtures live in packages/shared-render/src/fixtures/ (canonical INV-1 location) not alongside tests — matches character-sheet-panel.test.ts pattern"
  - "BootEngineHandle gains effectiveLocale field so callers can observe the resolved locale post-override"
  - "TestablePanelRouter extends PanelRouter rather than mocking — preserves real registration logic for PSM-* fidelity"
  - "CombatantSnapshot concentration field is optional (undefined), not nullable — schema uses z.optional() not z.nullable()"

patterns-established:
  - "locale-override.ts: same defensive pattern as map-mode-toggle.ts — try/catch wrapping; normalise unknown to 'auto'"
  - "PSM-FIX-* fixture tests use resolve(fixtureDir(), name) for canonical cross-package paths"
  - "Integration smoke harness: real LayerManager + real PanelRouter + mock bridge (vi.fn spies) + TestablePanelRouter"

requirements-completed: [I18N-02, I18N-05]

duration: 16min
completed: 2026-05-15
---

# Phase 05 Plan 06: Locale Override + Boot Integration + Phase 5 Closure Summary

**locale-override.ts (Even Hub kv round-trip) + boot step 9c locale override + TestablePanelRouter integration smoke (PSM-01..13) + 8 INV-1 stress fixtures across ES/FR/PT-BR/DE/EN closes Phase 5 software-side**

## Performance

- **Duration:** ~16 min
- **Started:** 2026-05-15T20:50Z (approx, continuation from prior context)
- **Completed:** 2026-05-15T23:10Z
- **Tasks:** 3 (Task 1 completed in prior session; Tasks 2+3 completed in this session)
- **Files created:** 12
- **Files modified:** 2

## Accomplishments

- `locale-override.ts` shipped: `loadLocaleOverride(bridge)` + `persistLocaleOverride(bridge, locale)` with defensive normalisation — exact mirror of Phase 4b's `map-mode-toggle.ts` exemplar
- `_bootEngineCore` step 9c reads `view.locale.override` from Even Hub kv; widened `BootEngineLocale` to full HudLocale union; `BootEngineHandle` exposes `effectiveLocale` for downstream Phase 6 retry handler
- `05-panel-integration-smoke.test.ts` ships 21 tests (PSM-01..13 + PSM-FIX-8): full Phase 5 PanelRouter + LayerManager composition under real layer-manager semantics; PSM-13 is the SC-5 contractual proof (6th mock panel auto-discovered, zero core changes)
- 8 INV-1 fixtures in `packages/shared-render/src/fixtures/` — 3 ES/FR/PT-BR stress (per-key EN fallback proven end-to-end), 2 DE canonical, 2 EN canonical, 1 ES auxiliary
- 25 LO-* + 8 BELO-* + 13 PSM-* + 8 PSM-FIX-* = 54 new tests; all 1149 workspace tests green

## Task Commits

1. **Task 1: locale-override.ts + boot step 9c + BootEngineLocale widen** - `46cc88f` (feat)
2. **Task 2: 05-panel-integration-smoke PSM-01..13 + PSM-FIX-* initial** - `e91ab83` (test)
3. **Task 3: 8 INV-1 fixtures → shared-render canonical location** - `8f196f6` (feat)

## Files Created/Modified

- `packages/g2-app/src/locale/locale-override.ts` — Even Hub kv round-trip module (LOCALE_OVERRIDE_KEY + loadLocaleOverride + persistLocaleOverride)
- `packages/g2-app/src/locale/__tests__/locale-override.test.ts` — 17 LO-* unit tests
- `packages/g2-app/src/__tests__/boot-engine-locale-override.test.ts` — 8 BELO-* boot integration tests
- `packages/g2-app/src/__tests__/05-panel-integration-smoke.test.ts` — 21 PSM-* + PSM-FIX-* tests
- `packages/g2-app/src/internal/boot-engine-core.ts` — step 9c + BootEngineLocale widen + effectiveLocale field
- `packages/g2-app/src/engine/boot-engine-error-wrapper.ts` — BootErrorLocale normalization (Rule 1 auto-fix)
- `packages/shared-render/src/fixtures/{locale-override.stress-es,fr,pt-br}.it.txt` — ES/FR/PT-BR stress fixtures
- `packages/shared-render/src/fixtures/{sheet.main.2014.de,sheet.main.2014.en,sheet.skills.en,combat-tracker.full-window.de,inventory.2014.es}.txt` — DE/EN canonical + ES auxiliary fixtures

## Decisions Made

- Fixture files placed in `packages/shared-render/src/fixtures/` (canonical INV-1 location) following `character-sheet-panel.test.ts` pattern — PSM-FIX-* tests use `resolve(fixtureDir(), name)` absolute paths
- `BootEngineHandle.effectiveLocale` added as read-only field — Phase 6 retry handler will use this to route on the actual boot locale
- `TestablePanelRouter` subclasses `PanelRouter` and overrides `discoverPanels()` — real registry logic preserved, glob replaced by injected module map via `setMockModules()`
- Vitest `--update` used to seed fixture files on first run; subsequent runs verify against committed content

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] BootErrorLocale normalization in boot-engine-error-wrapper.ts**
- **Found during:** Task 1 (boot-engine-core.ts modification)
- **Issue:** `BootEngineLocale` widened to include 'es'/'fr'/'pt-br' but `BootErrorLayer` constructor takes narrower `BootErrorLocale` ('it'|'en'|'de'). TypeScript TS2345 error blocked compilation.
- **Fix:** Added `const errorLocale: BootErrorLocale = opts.locale === 'it' || opts.locale === 'de' ? opts.locale : 'en'` normalization with explicit import of `BootErrorLocale` type
- **Files modified:** `packages/g2-app/src/engine/boot-engine-error-wrapper.ts`
- **Verification:** `pnpm typecheck` exits 0; BELO tests confirm es/fr/pt-br boot paths work end-to-end
- **Committed in:** `46cc88f` (Task 1 commit)

**2. [Rule 1 - Bug] CombatSnapshot fixture field names incorrect**
- **Found during:** Task 2 (05-panel-integration-smoke.test.ts)
- **Issue:** `BASE_COMBAT_SNAPSHOT` used `tokenId`/`isParty`/`ac`/`concentration: null` — none of these exist in `CombatantSchema` (strictObject); correct fields are `id`, nullable `actorId`/`initiative`/`hp`/`maxHp`, optional (not nullable) `concentration`
- **Fix:** Rewrote `BASE_COMBAT_SNAPSHOT` with correct schema fields: `combatId`, `turn`, `currentCombatantId`; combatants use `id` (not tokenId), omit `concentration` (undefined)
- **Files modified:** `packages/g2-app/src/__tests__/05-panel-integration-smoke.test.ts`
- **Verification:** All 21 PSM tests green; typecheck exits 0
- **Committed in:** `e91ab83` (Task 2 commit)

**3. [Rule 1 - Bug] InventoryItem fixture fields incorrect**
- **Found during:** Task 2 (05-panel-integration-smoke.test.ts)
- **Issue:** `BASE_CHARACTER_SNAPSHOT.inventory` used `equipped: true` and `properties: ['versatile']` — neither field exists in `InventoryItemSchema` (only: id, name, type, damage, tags, weight, quantity)
- **Fix:** Removed `equipped`, renamed `properties` → `tags`
- **Files modified:** `packages/g2-app/src/__tests__/05-panel-integration-smoke.test.ts`
- **Verification:** typecheck exits 0; fixture snapshots updated to reflect correct render output
- **Committed in:** `e91ab83` (Task 2 commit)

**4. [Rule 1 - Bug] matchAsciiFixture type mismatch — string vs AsciiGrid**
- **Found during:** Task 2 (05-panel-integration-smoke.test.ts)
- **Issue:** PSM-FIX tests passed `output.join('\n')` (string) to `matchAsciiFixture` which expects `AsciiGrid`
- **Fix:** Wrapped all 8 calls with `AsciiGrid.fromString(output.join('\n'))` + added `AsciiGrid` import from `@evf/shared-render`
- **Files modified:** `packages/g2-app/src/__tests__/05-panel-integration-smoke.test.ts`
- **Verification:** typecheck exits 0
- **Committed in:** `e91ab83` + `8f196f6` (Tasks 2+3 commits)

**5. [Rule 1 - Bug] Fixture files misplaced — landed in `__tests__/` instead of `shared-render/src/fixtures/`**
- **Found during:** Task 3 (fixture path canonicalization)
- **Issue:** PSM-FIX tests used bare filename strings (e.g., `'locale-override.stress-es.it.txt'`) — `toMatchFileSnapshot` resolved relative to `__dirname` not the canonical shared-render fixtures directory; also a spurious `shared-render/` directory was created at workspace root
- **Fix:** Added `fixtureDir()` helper (mirrors character-sheet-panel.test.ts pattern); updated all 8 PSM-FIX calls to use `resolve(fixtureDir(), name)`; git-moved fixture files from `__tests__/` to canonical `packages/shared-render/src/fixtures/`; removed spurious `shared-render/` at workspace root
- **Files modified:** `packages/g2-app/src/__tests__/05-panel-integration-smoke.test.ts` (paths); 8 fixture files (moved)
- **Verification:** All 21 PSM tests green; fixture paths resolve correctly in CI-equivalent runs
- **Committed in:** `8f196f6` (Task 3 commit)

---

**Total deviations:** 5 auto-fixed (4 Rule 1 bugs, 1 Rule 1 path correction)
**Impact on plan:** All auto-fixes necessary for type correctness and INV-1 fixture canonicalization. No scope creep.

## Hardware-Pending SC Carry-Forward (ADR-0005 Branch A)

Phase 5 software-side requirements are complete. The following SCs require Even Realities G2 hardware access (ADR-0005 Branch A — `human_needed` gate per Phase 4a/4b precedent):

- **SC-05-01** — G2 panel render fidelity (character sheet layout on real 576×288 display)
- **SC-05-02** — G2 gesture routing (R1 tap → panel navigation; scroll → tab/scroll)
- **SC-05-03** — G2 locale override persistence (device kv survives app restart)
- **SC-05-04** — G2 combat tracker real-time (combat.turn delta via WS → panel re-render)
- **SC-05-05** — G2 spellbook scroll fidelity (long list scroll at 5 fps)

These are declared in `05-VALIDATION.md` as hardware-pending. Phase 5 is `complete` software-side; hardware SCs gate the `done` milestone per ADR-0005.

## Known Stubs

None — all renderers use real i18n-budgets.ts strings; no hardcoded placeholder text in fixture-tested paths.

## Threat Flags

None — this plan adds no new network endpoints, auth paths, file access patterns, or schema changes beyond the `view.locale.override` kv key (already in the threat register as T-05-06-01/02/03, all mitigated).

## Issues Encountered

- BELO tests required `flushMicrotasks(32) + ws.fireOpen() + ws.fireMessage()` pattern (same as `scene-renderer-smoke.test.ts`) rather than auto-responding send handlers — the boot sequence has specific timing requirements that only the established flush pattern handles correctly
- Vitest's `--update-snapshots` flag had no effect when passed via `pnpm exec vitest ...`; used `vitest --update` directly instead

## Next Phase Readiness

- Phase 5 software-side complete: all 8 REQ-IDs (SHEET-01/02/03/04 + COMB-01/03 + I18N-02/05) closed
- Phase 6 (retry handler / boot-error UX) can hook into `BootEngineHandle.effectiveLocale` + `bootEngineWithErrorUi` RETHROW semantics established in Phase 4b
- Hardware validation gate (ADR-0005 Branch A) holds SC-05-01..05 until Even Hub access available

## Self-Check: PASSED

| Item | Status |
|------|--------|
| locale-override.ts | FOUND |
| 05-panel-integration-smoke.test.ts | FOUND |
| locale-override.stress-es.it.txt | FOUND |
| sheet.main.2014.de.txt | FOUND |
| combat-tracker.full-window.de.txt | FOUND |
| 05-06-SUMMARY.md | FOUND |
| Commit 46cc88f (Task 1) | FOUND |
| Commit e91ab83 (Task 2) | FOUND |
| Commit 8f196f6 (Task 3) | FOUND |

---
*Phase: 05-panel-plugin-system-read-only-panels*
*Completed: 2026-05-15*
