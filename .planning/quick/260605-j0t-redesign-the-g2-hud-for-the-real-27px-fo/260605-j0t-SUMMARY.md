---
phase: quick-260605-j0t
plan: 01
subsystem: g2-app/status-hud
tags: [hud, layout, 27px, renderer, fixtures, inv1, inv3, specs, adr]
dependency_graph:
  requires: []
  provides: [full-width-status-sheet, 27px-container-geometry, status-sheet-as-default-base]
  affects: [status-hud-renderer, container-registry, boot-engine-core, status-hud-layer, Specs.md, ADR-0001]
tech_stack:
  added: ["@evenrealities/pretext@0.1.4 (devDependency — font metrics for width budgeting)"]
  patterns: ["pretext getTextWidth + pxTruncate for pixel-accurate line budgeting", "TDD RED/GREEN renderer rewrite", "INV-3 atomic doc coherence (same commit)"]
key_files:
  created: []
  modified:
    - packages/g2-app/src/status-hud/status-hud-renderer.ts
    - packages/g2-app/src/status-hud/__tests__/status-hud-renderer.test.ts
    - packages/g2-app/src/status-hud/i18n-budgets.ts
    - packages/g2-app/src/engine/container-registry.ts
    - packages/g2-app/src/internal/boot-engine-core.ts
    - packages/g2-app/src/status-hud/status-hud-layer.ts
    - packages/g2-app/src/status-hud/__tests__/status-hud-layer.test.ts
    - packages/g2-app/src/status-hud/__tests__/i18n-budgets.test.ts
    - packages/g2-app/src/status-hud/__tests__/snapshot.test.ts
    - packages/g2-app/src/__tests__/example-status-hud.test.ts
    - packages/g2-app/src/__tests__/sync-lost-chip.test.ts
    - packages/shared-render/src/fixtures/status-hud.loading.txt
    - packages/shared-render/src/fixtures/status-hud.hp-overflow.txt
    - packages/shared-render/src/fixtures/status-hud.conditions-overflow.txt
    - packages/shared-render/src/fixtures/status-hud.sync-lost.it.txt
    - packages/shared-render/src/fixtures/status-hud.sync-lost.en.txt
    - Specs.md
    - docs/architecture/0001-layered-ui-model.md
    - README.md
    - docs/showcase/index.html
decisions:
  - "StatusHudRenderer now returns string (not AsciiGrid) — multi-line \n-separated, 9 rows for the full-width status sheet"
  - "pretext getTextWidth used for pixel-accurate width enforcement; pxTruncate for overflow"
  - "MapBaseLayer + IdleInfillLayer preserved (mounted, not drawn) at boot — deferred map-mode can re-activate via finalizeIdleRender"
  - "class/speed/turn render as — (em-dash) with TODO(HUD-27PX) markers — data-gap surfaced, not faked"
  - "sync-lost chip appended only when syncLostState non-null; normal 9-row sheet has R1 hint built in as row 8"
metrics:
  duration: "~45 min"
  completed: "2026-06-05"
  tasks_completed: 3
  files_changed: 20
---

# Phase quick-260605-j0t Plan 01: HUD 27px Grid Redesign Summary

**One-liner:** Rewrite StatusHudRenderer to a full-width 9-row 27px-grid character status sheet, fix the "scritte troppo grandi" glasses readability bug, and update INV-1 fixtures + Specs v0.9.14 atomically.

## What Was Built

The G2 LVGL font has a fixed 27px line height. The old StatusHudRenderer produced a 28×21 corner card designed for a ~12px/24-row grid — on real glasses this appeared ~2.25× too big, overlapping, and clipping. This task fixes the default always-on glasses view.

### Task 1: Renderer Rewrite (TDD RED → GREEN)

`packages/g2-app/src/status-hud/status-hud-renderer.ts` rewritten:

- `render()`/`renderLoading()`/`renderMissing()` now return a multi-line `string` (9 lines, `\n`-separated) instead of `AsciiGrid`
- Width-budgeted via `@evenrealities/pretext` `getTextWidth` + `pxTruncate` against 576px
- Layout (9 rows): `name/Lv | ─── | HP bar/CA/VEL | Turno/Round | Cond: | ─── | Slot | TS morte | R1 hint`
- Data-gap: class/speed/turn render as `—` with `// TODO(HUD-27PX)` markers (not faked)
- 6 new i18n keys added to `i18n-budgets.ts` (`hud27_turn_label`, `hud27_round_label`, `hud27_your_turn_label`, `hud27_cond_prefix`, `hud27_death_saves_label`, `hud27_r1_hint`)
- Preserved for overlay callers: `setMode`, `setMovementBudget`, `setActionEconomy`, `renderContextChip`, `locale` field
- 33 new tests (`SHR27-*`) including WIDTH-ASSERTION (every line ≤576px enforced)

### Task 2: Container Geometry + Boot Default

`container-registry.ts` — new 27px geometry:
- header (id4): height 12→27px
- footer (id5): y=264→261, height 24→27px
- **status-hud (id6): FULL-WIDTH x=0,w=576** (was narrow x=408,w=168), y=27,h=234
- map-capture (id7): full-width, PRESERVED (deferred map mode)
- z05-* (ids 8-10): y positions updated for 27px grid, PRESERVED

`boot-engine-core.ts` — `finalizeIdleRender(idleInfill, mapBase)` call removed for the default view:
- Status sheet (StatusHudLayer) is now the visible base
- MapBaseLayer + IdleInfillLayer still constructed, mounted in `lm.bundle()`, but NOT drawn at boot
- Reversible: comment + deferred TODO(HUD-27PX) for Phase 20 map-mode gesture toggle

`status-hud-layer.ts` — `_renderNow` updated to consume `string` (not `AsciiGrid.toString()`):
- Normal path: 9-row sheet pushed directly (no chip concatenation)
- Sync-lost path: chip appended only when `syncLostState != null`

### Task 3: INV-1 Fixtures + INV-3 Docs (Atomic)

Default-view INV-1 fixtures regenerated to new 9-row layout:
- `status-hud.loading.txt` — loading state with `…` markers
- `status-hud.hp-overflow.txt` — name + HP=99999/99999 overflow
- `status-hud.conditions-overflow.txt` — 7 conditions (all fit in pretext budget, no truncation needed)
- `status-hud.sync-lost.it.txt` / `.en.txt` — Aiacos snapshot IT/EN

INV-3 atomic doc coherence (same commit):
- **Specs.md v0.9.13→v0.9.14** — §7.4 rewritten: new "Status-default view (27px grid)" subsection with approved 9-line mockup; old map+HUD mockup reframed as "DEFERRED Map mode (gesture-opened, future)"; changelog stanza v0.9.14
- **ADR-0001 Amendment 2** — records that z=1 StatusHudLayer is now the default base layer; z=0 map is deferred gesture-opened mode
- **README.md** — badges updated v0.9.13→v0.9.14
- **docs/showcase/index.html** — version stat updated

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `buildHudCard` in test helpers returned wrong type**
- **Found during:** Task 3 fixture updates
- **Issue:** `buildHudCard` returned `AsciiGrid` but renderer now returns `string`; `matchAsciiFixture(grid, ...)` type-errored
- **Fix:** Renamed to `buildHudSheet`, updated ck 11/15 tests to use `toMatchFileSnapshot` directly
- **Files modified:** `snapshot.test.ts`, `example-status-hud.test.ts`, `sync-lost-chip.test.ts`
- **Commit:** e78d552

**2. [Rule 1 - Bug] `SHL-3` status-hud-layer test asserted `║` (old border char)**
- **Found during:** Task 2
- **Issue:** Test checked for old AsciiGrid `║` border; new renderer uses `─` divider
- **Fix:** Updated assertion to `─` (new full-width divider)
- **Files modified:** `status-hud-layer.test.ts`
- **Commit:** a8294bf

**3. [Rule 1 - Bug] i18n-budgets key count test expected 225, got 231**
- **Found during:** Task 2 (after adding 6 new `hud27_*` keys)
- **Fix:** Updated count 225→231 in `i18n-budgets.test.ts`
- **Files modified:** `i18n-budgets.test.ts`
- **Commit:** a8294bf

**4. [Rule 2 - Missing] `_mapMode` field unused after rename to `_mapMode`**
- **Found during:** Task 1 typecheck
- **Fix:** Added `getMapMode()` accessor to expose the field and satisfy `noUnusedLocals`
- **Files modified:** `status-hud-renderer.ts`
- **Commit:** b778672

### Out-of-Scope Items (Not Fixed)

- Pre-existing lint error in `deploy/sync-app-whitelist.mjs` (pre-existing, not our task)
- `glyph-scene.raster-idle*.txt` full-page scene fixtures — not updated (tests pass by self-comparison; full page format is 96×24 monospace grid, different from the new 27px variable-width format; defer to "g2-app UI 27px density rework" phase)

## Known Stubs / TODOs

The following placeholder values were intentionally introduced (data-gap surfaced, not faked):
- `class label` → `—` with `// TODO(HUD-27PX): wire class into CharacterSnapshot (#issue)`
- `speed/VEL` → `—` with `// TODO(HUD-27PX): wire speed/VEL into CharacterSnapshot (#issue)`
- `turn/round/your-turn` → `—` with `// TODO(HUD-27PX): wire turn/round/your-turn into CharacterSnapshot (#issue)`

These are visible in `status-hud.loading.txt` / `status-hud.sync-lost.*.txt` as `—` placeholders.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries introduced. `@evenrealities/pretext@0.1.4` is a devDependency (build/test only — not shipped in the g2-app bundle). The pretext library is by verified Even Realities engineers (same npm scope as `@evenrealities/even_hub_sdk` already in use; MIT license).

## Boot-Overlap Fix (quick-260605-j0t-04)

**Root cause discovered post-commit:** After the HUD-27PX redesign, `map-capture` (id7) and `status-hud` (id6) both occupy the identical full rect (x=0, y=27, w=576, h=234). The G2 host rejects a `createStartUpPageContainer` payload that declares two text containers occupying the same rectangle when one has `isEventCapture=1` — it returns non-success, causing `createBootPage@page-lifecycle.ts:99` to throw `bootEngine failed`.

**Fix (commit `082a6d3`):**
- Added `buildStatusViewTextContainers()` to `container-registry.ts`: returns only header (id4), footer (id5), status-hud (id6) — the 3 containers that tile perfectly within 576×288 with zero overlap
- Added `BOOT_CONTAINER_TOTAL=3` constant for the default boot schema
- `buildBootPageSchema()` now returns 0 image + 3 text (was 4 image + 7 text); map-capture, z05-*, and image map-tiles are excluded but remain in registry for the deferred map-mode page (Phase 20)
- Updated `page-lifecycle.test.ts` PL-1..PL-3c to reflect new schema; added PL-3d asserting no overlaps and 576×288 budget

**No Specs change needed:** The §7 mockup describes the rendered status sheet (content), not which containers the boot page declares. The fix is an implementation detail of the page schema.

## Self-Check: PASSED

Key file existence verified:
- `/home/aiacos/workspace/EvenFoundryVTT/packages/g2-app/src/status-hud/status-hud-renderer.ts` — FOUND
- `/home/aiacos/workspace/EvenFoundryVTT/packages/shared-render/src/fixtures/status-hud.loading.txt` — FOUND
- `/home/aiacos/workspace/EvenFoundryVTT/Specs.md` — FOUND (v0.9.14)
- `/home/aiacos/workspace/EvenFoundryVTT/docs/architecture/0001-layered-ui-model.md` — FOUND (Amendment 2 added)
- `/home/aiacos/workspace/EvenFoundryVTT/packages/g2-app/src/engine/container-registry.ts` — FOUND (buildStatusViewTextContainers + BOOT_CONTAINER_TOTAL added)
- `/home/aiacos/workspace/EvenFoundryVTT/packages/g2-app/src/engine/page-lifecycle.ts` — FOUND (buildBootPageSchema uses 3-container schema)

Commits verified:
- `1d3b48f` — RED test commit
- `b778672` — GREEN renderer commit
- `a8294bf` — Task 2 geometry + boot commit
- `e78d552` — Task 3 fixtures + docs commit
- `082a6d3` — j0t-04 boot-overlap fix (default schema = 3 text, 0 image)
- `d05574c` — j0t-05 flush status-view schema + 8-row sheet (no overlap, no overflow)

## Continuation Fix — j0t-05 (2026-06-05)

Two residual artifacts fixed after live sim observation:

**Bug 1 — "Text" ghosting/overlap fixed:**
- `LayerManager._flushPage()` was using `buildBaseTextContainers()` (7 text + 4 image = 11 containers). After every bundle flush it re-declared `map-capture` (id7, identical rect as `status-hud` id6) and `z05-*` (ids 8-10). The G2 host rendered these as "Text" placeholder strings overlapping the status sheet.
- Fix: `_flushPage()` now uses `buildStatusViewTextContainers()` (3 containers: header id4, footer id5, status-hud id6; 0 image; `containerTotalNum:3`) — identical to `buildBootPageSchema()`. Imports updated from `buildBaseTextContainers`/`buildBaseImageContainers`/`BASE_CONTAINER_TOTAL` to `buildStatusViewTextContainers`/`BOOT_CONTAINER_TOTAL`.
- `map-capture` and `z05-*` remain in the registry for the deferred map-mode page (Phase 20). A `TODO(j0t-05)` comment marks the divergence point for Phase 20.

**Bug 2 — 8-row sheet (was 9-row, caused overflow + duplicate R1 hint):**
- `SHEET_ROWS=9` → 9×27=243px > h=234px (`status-hud` id6) → row 9 overflowed into the footer strip. The footer (id5) already rendered R1 hints via `renderContextChip` / hud-chrome — duplicated in the body.
- Fix: `SHEET_ROWS=8` (8×27=216px ≤ 234px). Row 8 (R1 hint `R1: ^v scorri  tap ping  oo menu`) removed from `_buildSheet()`. Footer continues to render R1 hints.

**Tests updated:**
- `Test 8b` in `layer-manager.test.ts`: asserts 3-container status-view schema (containerTotalNum=3, textObject.length=3, imageObject.length=0, no isEventCapture=1, containers header/footer/status-hud in id order).
- `NEW_HUD_ROWS` in `status-hud-renderer.test.ts`: 9→8; `SHR27-P8` updated to assert last line is death saves (not R1 hint).
- 5 INV-1 fixtures regenerated to 8-row layout (removed R1 hint last line): `status-hud.loading.txt`, `status-hud.hp-overflow.txt`, `status-hud.conditions-overflow.txt`, `status-hud.sync-lost.it.txt`, `status-hud.sync-lost.en.txt`.

**INV-3 (atomic doc coherence):**
- `Specs.md` v0.9.14→v0.9.15: §7.4 mockup updated from 9 to 8 rows (R1 hint line removed from mockup and Riga 8 description); container table note `9 righe` → `8 righe × 27px=216px ≤ 234px`; note on j0t-05 reasoning added; changelog stanza v0.9.15 added; boot-splash mockup version updated.
- `README.md` badges updated to v0.9.15.
- `docs/showcase/index.html` version stat updated to v0.9.15.

**Suite result:** 1435 tests GREEN. TypeScript typecheck clean. Lint unchanged (pre-existing errors in `deploy/sync-app-whitelist.mjs` and `packages/bridge/` are out-of-scope, documented in prior SUMMARY).
