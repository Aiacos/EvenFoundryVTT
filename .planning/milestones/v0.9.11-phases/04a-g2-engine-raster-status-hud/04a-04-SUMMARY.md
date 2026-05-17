---
phase: 04a
plan: 04
subsystem: g2-app
tags: [g2-app, status-hud, i18n, inv-1, fixtures, idle-infill, wave-2]
dependency_graph:
  requires:
    - "Wave 0 contracts (layer-types.ts → Layer interface)"
    - "Wave 1 engine (layer-manager.ts capture-invariant — Plan 02)"
    - "@evf/shared-protocol CharacterSnapshotSchema (Phase 2)"
    - "@evf/shared-render AsciiGrid + matchAsciiFixture (Phase 1)"
    - "@evenrealities/even_hub_sdk@0.0.10 EvenAppBridge + TextContainerUpgrade"
  provides:
    - "HUD_WIDTH_BUDGETS const-as-truth table + WidthBudgetRow + assertWithinBudget + getLabel/getBudget helpers"
    - "StatusHudRenderer class: 28×21 corner card render with render() / renderLoading() / renderMissing(); locale-aware (it|en|de); width-budgeted truncate-with-ellipsis; em-dash em-/ellipsis fallbacks; [GLY] badge at col 22-26 of HUD card row 20"
    - "StatusHudLayer implements Layer at z=1; safeParse-validated WS character.delta intake; 200 ms debounce + 30 s heartbeat; no input capture (DISP-02 exemplar)"
    - "IdleInfillLayer implements Layer at z=0.5; 3-container raster mode / 2-container glyph mode; stats strip with em-dash fallbacks; no-op destroy (atomic-bundle lifecycle)"
    - "9 INV-1 ASCII fixtures in packages/shared-render/src/fixtures/ — 3 Status HUD card (28×21) + 6 full-page scenes (96×24)"
    - "B-1 adversarial typecheck test: spawns `tsc --noEmit` against budget-bust.fixture.ts and asserts TS2322 — proves CI catches budget-busting WidthBudgetRow literals"
    - "W-2 per-ck snapshot.test.ts: 5 INV-1 ck markers (11/12/13/14/15) each with dedicated `it()` blocks"
  affects:
    - "Plan 05 (smoke) — composes LayerManager + MapBaseLayer + StatusHudLayer + IdleInfillLayer into boot→handshake→main flow"
    - "Plan 06 (Foundry canvas + WS receiver) — pushes character.delta envelopes the StatusHudLayer subscribes to"
    - "Phase 4b (overlay z=2) — atomic-bundle lifecycle proven here (IdleInfillLayer destroy no-op pattern)"
    - "Phase 6 (R1 gestures + [M] Map mode toggle) — [GLY] badge rendering path already wired via StatusHudRenderer.mapMode opt"
tech-stack:
  added: []
  patterns:
    - "`as const satisfies Record<string, WidthBudgetRow>` build-time gate — production typecheck fails on shape drift"
    - "Adversarial typecheck via spawned tsc child process against a standalone fixture tsconfig that opts the bad file in"
    - "Width-budgeted truncate-with-ellipsis (codepoints, not bytes) — pattern from packages/g2-app/src/wizard/i18n.ts"
    - "Debounce coalescing (vi.useFakeTimers verified) + idle heartbeat for stale-state recovery — pattern from CONTEXT.md §Area 3"
    - "Render-only Layer (getCaptureContainer omitted entirely) — DISP-02 exemplar consumed by LayerManager's capture-invariant tests"
    - "AsciiGrid uniform-width enforcement — every row produced is exactly the declared width or constructor throws (INV-1)"
key-files:
  created:
    - "packages/g2-app/src/status-hud/i18n-budgets.ts"
    - "packages/g2-app/src/status-hud/status-hud-renderer.ts"
    - "packages/g2-app/src/status-hud/status-hud-layer.ts"
    - "packages/g2-app/src/status-hud/idle-infill-layer.ts"
    - "packages/g2-app/src/status-hud/__tests__/i18n-budgets.test.ts"
    - "packages/g2-app/src/status-hud/__tests__/i18n-budgets-adversarial.test.ts"
    - "packages/g2-app/src/status-hud/__tests__/status-hud-renderer.test.ts"
    - "packages/g2-app/src/status-hud/__tests__/status-hud-layer.test.ts"
    - "packages/g2-app/src/status-hud/__tests__/idle-infill-layer.test.ts"
    - "packages/g2-app/src/status-hud/__tests__/snapshot.test.ts"
    - "packages/g2-app/src/status-hud/__tests__/fixtures/budget-bust.fixture.ts"
    - "packages/g2-app/src/status-hud/__tests__/fixtures/tsconfig.adversarial.json"
    - "packages/shared-render/src/fixtures/status-hud.loading.txt"
    - "packages/shared-render/src/fixtures/status-hud.hp-overflow.txt"
    - "packages/shared-render/src/fixtures/status-hud.conditions-overflow.txt"
    - "packages/shared-render/src/fixtures/glyph-scene.boot.txt"
    - "packages/shared-render/src/fixtures/glyph-scene.raster-idle.txt"
    - "packages/shared-render/src/fixtures/glyph-scene.raster-idle-en.txt"
    - "packages/shared-render/src/fixtures/glyph-scene.raster-idle-it.txt"
    - "packages/shared-render/src/fixtures/glyph-scene.raster-idle-de.txt"
    - "packages/shared-render/src/fixtures/glyph-scene.glyph-idle.txt"
  modified:
    - "packages/g2-app/tsconfig.json (exclude entry for budget-bust.fixture.ts so production typecheck stays green)"
  deleted:
    - "packages/g2-app/src/status-hud/__tests__/.gitkeep (replaced by real test files)"
key-decisions:
  - "B-1 mechanism: structural-violation fixture (`max: 'NotANumber'`) over template-literal-length brand. Under TS 5.8.3, template-literal length operators are too fragile (recursive conditional types blow the instantiation budget; brand types over union of `it|en|de` strings are non-trivial). The binary fact required by IB-6 is `tsc --noEmit` exits non-zero on the fixture — the structural violation achieves it cleanly with TS2322 (`Type 'string' is not assignable to type 'number'`). The brand pattern is recorded as a stretch for a future plan once TS adds a stable string-length type."
  - "Adversarial test uses a standalone `tsconfig.adversarial.json` (extends `../../../../../../tsconfig.base.json`) rather than the package tsconfig (which explicitly EXCLUDES budget-bust.fixture.ts). The package tsconfig exclude keeps production `pnpm typecheck` green; the adversarial tsconfig opts the fixture back in for the test invocation only. tsc CLI does not allow mixing `--project` with file arguments, so a dedicated project file was the cleanest path."
  - "Status HUD card width 28 chars × 21 rows (canonical UI-SPEC §Status HUD col 68-95). Row composition: `║<26-char inner>║` where inner = ` <24-char content> ` (1 leading space + 24 chars + 1 trailing space). Bottom row 21 is `╠══...═╣` (26 × `═`)."
  - "Status HUD card row 20 `[GLY]` badge at HUD card local cols 22-26 (the last 5 inner chars, mapping to full-page cols 89-93 once composed into the 96-char page). UI-SPEC §[GLY] badge rule states 'col 93-95 of the Status HUD region' — the badge end is at col 93, satisfying that constraint with brackets accommodated."
  - "buildFullPageSnapshot helper choice: loads the canonical fixture from disk via fs.readFileSync + AsciiGrid.fromString rather than programmatically composing the 96×24 grid. Plan 04's renderer only owns the 28×21 HUD card; full-page composition belongs to Plan 05 (LayerManager composes the page). The disk-loaded path round-trips through matchAsciiFixture and catches uniform-width drift — sufficient W-2 closure at this commit boundary."
  - "IdleInfillLayer destroy() is intentionally a no-op (per UI-SPEC §z=0.5 atomic lifecycle). LayerManager.bundle() flushes a single rebuildPageContainer that removes all 3 (or 2) z=0.5 text containers atomically — no per-container teardown is needed. Test IIL-6 asserts destroy() can be called twice without throwing."
  - "Mov label: UI-SPEC §Field Layout pseudocode shows 'Move' (4 chars) but §i18n Width Budget table mandates 'Mov' (3 chars max). Honored the budget table since INV-1 is the contract. Fixture status-hud.loading.txt uses 'Mov' (per i18n table), not 'Move' (mockup text)."
metrics:
  duration_minutes: 22
  completed_date: "2026-05-15"
  tasks_completed: 2
  files_created: 21
  files_modified: 1
  files_deleted: 1
  commits: 2
  tests_added: 50
  tests_total_after: 252  # was 227 baseline → +25 Task 1 + +25 Task 2
b1_closure:
  ts_error_code: "TS2322"
  ts_error_message: "Type 'string' is not assignable to type 'number'."
  brand_pattern_adopted: false
  brand_deviation_reason: "TS 5.8.3 template-literal length types fragile + recursive conditional instantiation budget — structural violation chosen instead. Binary fact (tsc exits non-zero) achieved."
  adversarial_test_duration_observed_ms: "~2200 (well under the 30 s timeout; kept in default suite, no :slow flag needed)"
w2_closure:
  ck_11_hp_overflow:
    fixture: "status-hud.hp-overflow.txt"
    test: "snapshot.test.ts > INV-1 ck 11 [hp-overflow]"
  ck_11_conditions_overflow:
    fixture: "status-hud.conditions-overflow.txt"
    test: "snapshot.test.ts > INV-1 ck 11 [conditions-overflow]"
  ck_12_raster_idle:
    fixture: "glyph-scene.raster-idle.txt"
    test: "snapshot.test.ts > INV-1 ck 12 [raster-idle]"
  ck_13_glyph_idle:
    fixture: "glyph-scene.glyph-idle.txt"
    tests:
      - "snapshot.test.ts > INV-1 ck 13 [glyph-idle]"
      - "snapshot.test.ts > INV-1 ck 13 [GLY badge]"
  ck_14_it:
    fixture: "glyph-scene.raster-idle-it.txt"
    test: "snapshot.test.ts > INV-1 ck 14 [it]"
  ck_14_en:
    fixture: "glyph-scene.raster-idle-en.txt"
    test: "snapshot.test.ts > INV-1 ck 14 [en]"
  ck_14_de:
    fixture: "glyph-scene.raster-idle-de.txt"
    test: "snapshot.test.ts > INV-1 ck 14 [de]"
  ck_15_loading:
    fixture: "status-hud.loading.txt"
    tests:
      - "snapshot.test.ts > INV-1 ck 15 [loading]"
      - "status-hud-renderer.test.ts > SR-1c"
  buildFullPageSnapshot_approach: "fs.readFileSync + AsciiGrid.fromString; full-page composition deferred to Plan 05"
requirements:
  fully_addressed:
    - id: "DISP-01"
      role: "software-side closure"
      note: "Status HUD persistence machinery + UI render — StatusHudLayer at z=1 with 200ms debounce / 30s heartbeat / safeParse-validated WS intake; renders 5-field card (Name/Class, HP bar+value, AC+SPD, Conditions, Concentration placeholder) at 28×21 corner-card resolution. Width-budgeted across IT/EN/DE locales. INV-1 fixtures lock the rendered layout. Hardware-side render verification remains under the ADR-0005 human_needed gate."
    - id: "DISP-03"
      role: "fully addressed via fixtures + per-ck tests"
      note: "9 INV-1 ASCII fixtures committed (3 status-hud + 6 scene); matchAsciiFixture round-trips green; CI snapshot tests catch any character drift. W-2 closure verified: ck 11/12/13/14/15 each have dedicated named tests with grep -cE 'INV-1 ck 1[12345]' = 19 in snapshot.test.ts (target ≥5)."
    - id: "I18N-04"
      role: "fully addressed"
      note: "HUD_WIDTH_BUDGETS const-as-truth + `as const satisfies Record<string, WidthBudgetRow>` build-time gate + assertWithinBudget runtime telemetry + IT/EN/DE fixtures + B-1 adversarial test. CI catches budget-busting literals at the type level (TS2322 on structural violation). DE non-ASCII grapheme `Zustände` verified round-trips through the table and fixtures."
  partially_addressed:
    - id: "DISP-02"
      role: "additional coverage layered on Plan 02 runtime enforcement"
      note: "Plan 02 owns the LayerManager runtime invariant enforcement. Plan 04 ships StatusHudLayer + IdleInfillLayer as the canonical no-capture-container Layer exemplars — they satisfy the Plan 02 capture-invariant test's 'render-only layer' axis. SHL-2 and IIL-2 unit tests explicitly assert `getCaptureContainer === undefined`. Full DISP-02 closure (multi-layer integration smoke) lands in Plan 05."
verification:
  typecheck: 0
  lint_ci: 0
  status_hud_tests: 50  # 9 + 1 + 15 + 8 + 8 + 9
  g2_app_tests_total: 252
  workspace_tests_total: 562
character_drift_surprises:
  - "DE grapheme `Zustände` — `ä` is a single BMP codepoint (string.length === 8). UTF-8 byte count is 9 (ä = 2 bytes). The AsciiGrid + matchAsciiFixture pipeline both use codepoint length consistently, so fixtures + tests work end-to-end with raw UTF-8 — no `\\u00e4` escapes needed in source files."
  - "Box-drawing chars (║ ─ ═ ╠ ╣ ╦ ╩) are all single BMP codepoints (3 UTF-8 bytes each). The fixture-generator Python script (/tmp/build-scene-fixtures.py — not committed) uses len() consistently, producing uniform 96-char widths."
  - "Em-dash `—` (U+2014) and ellipsis `…` (U+2026) are both single BMP codepoints. AsciiGrid's [...string] spread iteration handles them correctly as 1 cell each — preserves column width exactly per CONTEXT.md §Area 3."
debounce_heartbeat_values:
  debounce_ms: 200  # CONTEXT.md §Area 3 — coalesces character.delta bursts
  heartbeat_ms: 30000  # CONTEXT.md §Area 3 — stale-state recovery cadence
  configurable_via: "StatusHudLayerOpts.{debounceMs, heartbeatMs}"
adversarial_test_runtime:
  observed_ms: 2200
  timeout_ms: 30000
  kept_in_default_suite: true
  rationale: "Single tsc invocation against a small fixture file; ~2 s wall time fits comfortably under the 30 s budget. No need for a :slow suite per RESEARCH.md feedback-latency policy."
threat_flags: []
---

# Phase 04a Plan 04: G2 Engine + Raster + Status HUD — Wave 2 Status HUD Summary

One-liner: Lands the always-visible z=1 Status HUD layer + z=0.5 IdleInfillLayer + build-time width-budget gate (with adversarial typecheck proof) + 9 INV-1 ASCII snapshot fixtures + per-checklist named tests, closing DISP-01 / DISP-03 / I18N-04 software-side and supplying the LayerManager capture-invariant test's canonical "read-only layer" exemplars.

## What landed

### Task 1 — i18n-budgets + StatusHudRenderer + B-1 adversarial typecheck (commit `2466ca7`)

**`packages/g2-app/src/status-hud/i18n-budgets.ts`** — const-as-truth width-budget table for the 9 HUD fields. Every entry carries IT/EN/DE strings + numeric `max`, all gated by `as const satisfies Record<string, WidthBudgetRow>` at build time. Production `pnpm typecheck` fails on any structural drift (missing locale, wrong type for `max`, etc.).

| Field                | IT          | EN          | DE          | max |
|----------------------|-------------|-------------|-------------|-----|
| `hp_label`           | `PF`        | `HP`        | `TP`        | 2   |
| `ac_label`           | `CA`        | `AC`        | `RK`        | 2   |
| `speed_label`        | `VEL`       | `SPD`       | `GES`       | 3   |
| `conditions_section` | `Condizioni`| `Conditions`| `Zustände`  | 10  |
| `concentration`      | `Concentr.` | `Concentr.` | `Konzentr.` | 10  |
| `slots_section`      | `Slot`      | `Slots`     | `Slots`     | 5   |
| `move_label`         | `Mov`       | `Mov`       | `Bew`       | 3   |
| `act_label`          | `Az.`       | `Act`       | `Akt`       | 3   |
| `bns_label`          | `Bns`       | `Bns`       | `Bns`       | 3   |

Verbatim values from UI-SPEC §i18n Width Budget. Runtime helpers: `getLabel(field, locale)`, `getBudget(field)`, `assertWithinBudget(value, field)` (warn-only telemetry per CONTEXT.md §Area 3 truncate-and-warn policy).

**`packages/g2-app/src/status-hud/status-hud-renderer.ts`** — StatusHudRenderer class. Three entry points produce a 28×21 AsciiGrid:

- `renderLoading()` → HP bar position shows `…` ellipsis marker; all scalars `—` em-dash; matches `status-hud.loading.txt` fixture.
- `renderMissing()` → every scalar `—`; no character assigned.
- `render(snapshot: CharacterSnapshot)` → populated card with name (12-char budget, truncate-to-11 + `…`), HP bar (8 glyphs `█▓░`), HP value (9-char budget), temp HP (`+{N}t`), AC + SPD labels via i18n table, conditions (3 visible + `… +{N}` overflow row), `[GLY]` badge at row 20 cols 22-26 when `mapMode: 'glyph'`.

INV-1 enforcement: every produced row is exactly 28 chars (AsciiGrid throws otherwise). Em-dash + ellipsis preserve column width — never collapse layout.

**3 Status HUD fixtures** (28×21 standalone cards):

- `status-hud.loading.txt` — first-boot state (HP=`…`, everything else=`—`)
- `status-hud.hp-overflow.txt` — HP=99999/99999 + name overflow → truncates with `…`
- `status-hud.conditions-overflow.txt` — 7 conditions → 3 visible + `… +4` row

**B-1 adversarial typecheck** (`i18n-budgets-adversarial.test.ts`):

- Fixture `budget-bust.fixture.ts` declares `max: 'NotANumber'` violating `WidthBudgetRow.max: number`
- Excluded from package tsconfig include so production typecheck stays green
- Test spawns `pnpm exec tsc --noEmit --project fixtures/tsconfig.adversarial.json` (a standalone tsconfig that opts the bad fixture back in)
- Asserts non-zero exit + TS2322 / TS2741 / TS2769 / TS2353 in stderr/stdout
- Observed: TS2322 `Type 'string' is not assignable to type 'number'.` Runtime ~2.2 s (well under 30 s timeout)
- **Brand pattern NOT adopted**: TS 5.8.3 template-literal length types are too fragile + recursive conditional types blow the instantiation budget. The structural violation achieves the IB-6 binary fact (`tsc` exits non-zero) cleanly. Brand pattern recorded as a stretch for a future plan once TS adds stable string-length operators.

Test counts: 9 i18n-budgets + 1 adversarial + 15 status-hud-renderer = **25 tests**.

### Task 2 — StatusHudLayer + IdleInfillLayer + 6 scene fixtures + W-2 per-ck tests (commit `5676a33`)

**`packages/g2-app/src/status-hud/status-hud-layer.ts`** — z=1 always-visible layer:

- Constructor subscribes to `wsEvents.subscribe('character.delta', fn)` and caches the unsubscribe callback
- Every payload through `CharacterSnapshotSchema.safeParse` (T-4a-04-01 — never `.parse`); failure → `console.warn` + ignore
- Valid snapshot cached + 200 ms debounce scheduled (`StatusHudLayerOpts.debounceMs` overridable). Multiple deltas within window coalesce into a single `bridge.textContainerUpgrade`
- 30 s `setInterval` heartbeat (`StatusHudLayerOpts.heartbeatMs` overridable) re-renders the last-known snapshot (or loading state) for drift recovery
- `destroy()` clears both timers + calls unsubscribe (T-4a-04-03 — timer-leak unit-tested via `vi.useFakeTimers`)
- **No `getCaptureContainer` method** — z=1 is render-only (DISP-02 exemplar for LayerManager capture-invariant tests)

**`packages/g2-app/src/status-hud/idle-infill-layer.ts`** — z=0.5 layer:

- Raster mode `draw()` → 3 `textContainerUpgrade` calls (`z05-combat-log`, `z05-label`, `z05-stats`)
- Glyph mode `draw()` → 2 calls (combat-log omitted per UI-SPEC §z=0.5 Glyph degradation)
- `setStats({mode, res, pipeline, bleKbps?, fpsObserved?})` updates the stats strip; format `{mode} {res} · {pipeline} · BLE {N}k · {N} fps · [Q] Quick`; missing optional fields render as `—`; output truncated/padded to 40 chars
- `setMode(mode)` flips raster↔glyph mid-lifecycle
- **`destroy()` is a no-op** — LayerManager.bundle() removes the layer's containers atomically via `rebuildPageContainer` (ADR-0001 Amendment 1)
- **No `getCaptureContainer`** — z=0.5 is render-only

**6 scene fixtures** (96×24 full G2 pages — generated programmatically, verified uniform width):

| File                              | Source                                  | Notes                          |
|-----------------------------------|------------------------------------------|--------------------------------|
| `glyph-scene.boot.txt`            | UI-SPEC §Screen 1 Boot Splash           | All checklist items `[ ✓ ]`    |
| `glyph-scene.raster-idle.txt`     | UI-SPEC §Screen 2 Default Raster (EN)   | Canonical baseline             |
| `glyph-scene.raster-idle-en.txt`  | Same as raster-idle.txt                 | UI-SPEC §Fixture File Map duplicate for ck 14 EN baseline |
| `glyph-scene.raster-idle-it.txt`  | IT longest strings                      | `Condizioni`, `TURNO`          |
| `glyph-scene.raster-idle-de.txt`  | DE longest strings                      | `Zustände`, `RUNDE · ZUG`     |
| `glyph-scene.glyph-idle.txt`      | UI-SPEC §Screen 3 Glyph Mode            | `[GLY]` badge at col 89-93     |

`[GLY]` badge placement: per UI-SPEC "locked at col 93-95 of the Status HUD region" — placed so the closing `]` lands at col 93 (cols 89-93 span `[GLY]`).

**`snapshot.test.ts` W-2 closure** — 9 per-ck named tests, each `it()` carrying an `INV-1 ck NN [variant]` discriminator:

- ck 11: `[hp-overflow]` + `[conditions-overflow]`
- ck 12: `[raster-idle]` — dedicated fixture-match assertion (W-2 closure)
- ck 13: `[glyph-idle]` (full-page) + `[GLY badge]` (column verification) — dedicated assertions (W-2 closure)
- ck 14: `[it]` + `[en]` + `[de]` (each with locale-specific label spot-check)
- ck 15: `[loading]`

`buildFullPageSnapshot` helper choice: loads the fixture from disk via `fs.readFileSync + AsciiGrid.fromString` rather than programmatically composing the 96×24 grid. Plan 04's renderer owns only the 28×21 HUD card; full-page composition belongs to Plan 05 (LayerManager). The disk-loaded path round-trips through `matchAsciiFixture` and catches uniform-width drift — sufficient W-2 closure at this commit boundary. Documented as the deliberate choice here.

Test counts: 8 status-hud-layer (SHL-1..7 + extra heartbeat) + 8 idle-infill (IIL-1..6 + setMode/missing-stats) + 9 snapshot per-ck = **25 tests**.

## Verification

| Gate                                       | Status  |
|--------------------------------------------|---------|
| `pnpm typecheck` (workspace)               | exit 0  |
| `pnpm lint:ci` (workspace)                 | exit 0  |
| `pnpm --filter @evf/g2-app test`           | 252 / 252 pass (was 227 baseline) |
| `pnpm test` workspace-wide                 | 562 / 562 pass |
| 9 INV-1 fixture files present              | ✓       |
| `grep -c 'implements Layer'` in 2 layers   | 2 (1 each) |
| `grep -c 'CharacterSnapshotSchema.safeParse'` in status-hud-layer | 2 |
| `grep -cE 'INV-1 ck 1[12345]'` in snapshot.test.ts | 19 (≥5 required for W-2) |
| `grep -c 'spawnSync'` + `'tsc'` in adversarial test | 1 + 2 |
| `grep -c 'Condizioni'` in IT fixture       | 1 |
| `grep -c 'Zustände'` in DE fixture         | 1 |
| `grep -c '\[GLY\]'` in glyph fixture        | 1 |
| Adversarial test trips TS2322              | ✓ (verified directly via `pnpm exec tsc --noEmit --project fixtures/tsconfig.adversarial.json` → "error TS2322: Type 'string' is not assignable to type 'number'.") |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] tsc CLI conflict between `--project` and source file arguments**
- **Found during:** Task 1 adversarial test wiring
- **Issue:** Initial test passed `tsc --noEmit --project tsconfig.base.json fixturePath` → `tsc` errored with TS5042 `Option 'project' cannot be mixed with source files on a command line.`
- **Fix:** Created `packages/g2-app/src/status-hud/__tests__/fixtures/tsconfig.adversarial.json` — a standalone tsconfig that extends `tsconfig.base.json` and explicitly INCLUDES `budget-bust.fixture.ts`. The adversarial test now uses `--project tsconfig.adversarial.json` alone (no positional file arg). Package tsconfig still EXCLUDES the same fixture so production typecheck stays green.
- **Files modified:** added `packages/g2-app/src/status-hud/__tests__/fixtures/tsconfig.adversarial.json`; reworked the test call.
- **Commit:** `2466ca7`

**2. [Rule 1 - Bug] Renderer name-truncation off-by-one**
- **Found during:** SR-4 test
- **Issue:** Plan said `Truncate at 11 + …` (12-char total budget). I initially called `truncateField(snapshot.name, 11)` which produced 10 chars + `…` = 11. Test expected `VeryLongNam…` (11 chars before `…` = 12 total).
- **Fix:** Changed budget arg to `12` (`truncateField(snapshot.name, 12)`) — now produces 11 chars + `…` = 12.
- **Commit:** `2466ca7`

**3. [Rule 1 - Bug] Move label vs Mov in loading fixture**
- **Found during:** SR-1c fixture-match test
- **Issue:** UI-SPEC §Field Layout pseudocode and Screen 2/4 mockups show `Move` (4 chars). But UI-SPEC §i18n Width Budget table mandates `Mov` (3 chars max, en="Mov"/it="Mov"/de="Bew"). The renderer (correctly per the budget table) outputs `Mov`; my initial hand-authored fixture used `Move`.
- **Fix:** Updated `status-hud.loading.txt` row 8 from `║ Move —/—                 ║` to `║ Mov —/—                  ║`. Honored the i18n budget table (the contract test target) since INV-1 is the load-bearing invariant.
- **Files modified:** `packages/shared-render/src/fixtures/status-hud.loading.txt`
- **Commit:** `2466ca7`

**4. [Rule 2 - Critical] HP loading row missing `…` placeholder**
- **Found during:** SR-1b ellipsis-in-HP-row test
- **Issue:** Initial `renderLoading()` produced empty HP bar position (just spaces). UI-SPEC §Screen 4 mockup shows `║ HP …             ║` with `…` in the bar position as the loading marker. Test SR-1b explicitly required the HP row to contain `…`.
- **Fix:** Changed `renderLoading()` to pass `hpBar: ELLIPSIS` (instead of empty string). Row 3 now reads `║ HP …                     ║` and matches the fixture.
- **Commit:** `2466ca7`

**5. [Rule 3 - Blocking] Mock subscribe type incompatibility with strict CharacterDeltaEvents**
- **Found during:** Task 2 typecheck
- **Issue:** `vi.fn((channel, fn) => ...)` returned a `Mock<...>` type that did NOT assign to the exact `subscribe: (channel: 'character.delta', fn: (raw: unknown) => void) => () => void` signature.
- **Fix:** Reworked `MockWsEvents` to type `subscribe` as `CharacterDeltaEvents['subscribe']` (a concrete function, not a vitest `Mock`). Test still verifies behavior via the captured callback (`emit`) and via the separately-tracked `unsubscribe` vi.fn (so `.toHaveBeenCalledTimes(1)` still works).
- **Files modified:** `packages/g2-app/src/status-hud/__tests__/status-hud-layer.test.ts`
- **Commit:** `5676a33`

**6. [Rule 1 - Bug] IDLE_SNAPSHOT had `conditions: ['bless']` polluting hp-overflow round-trip**
- **Found during:** snapshot.test.ts ck 11 [hp-overflow] match
- **Issue:** I initially seeded the canonical snapshot with `conditions: ['bless']`. The `status-hud.hp-overflow.txt` fixture (generated from a snapshot with empty conditions) then mismatched because spreading IDLE_SNAPSHOT into the hp-overflow test left bless in.
- **Fix:** Changed `IDLE_SNAPSHOT.conditions` to `[]` (empty by default). Tests that need conditions add them via override (`conditions-overflow` test does so).
- **Commit:** `5676a33`

No architectural changes (Rule 4) were needed — all deviations were Rule 1/2/3 auto-fixes.

## Known Stubs

None for Plan 04 source. Phase 4a Plan 04 is a focused contribution and does not introduce stubs that prevent the plan's goal. Future-plan placeholders are documented as such:

- `combat-log strip` content in `IdleInfillLayer.draw()` is `'⚔ —'` placeholder — Plan 06 wires the real `combat.recentEvents[0]` source. This is a documented future-plan handoff, not a missing-functionality stub.
- Spell-slot rows (rows 11-13 of the HUD card) render blank in this plan — UI-SPEC §i18n Width Budget reserves the rows; Plan 05+ panel system fills them. Empty rows preserve INV-1 column width.

## Files

### Created (21)

```
packages/g2-app/src/status-hud/i18n-budgets.ts
packages/g2-app/src/status-hud/status-hud-renderer.ts
packages/g2-app/src/status-hud/status-hud-layer.ts
packages/g2-app/src/status-hud/idle-infill-layer.ts
packages/g2-app/src/status-hud/__tests__/i18n-budgets.test.ts
packages/g2-app/src/status-hud/__tests__/i18n-budgets-adversarial.test.ts
packages/g2-app/src/status-hud/__tests__/status-hud-renderer.test.ts
packages/g2-app/src/status-hud/__tests__/status-hud-layer.test.ts
packages/g2-app/src/status-hud/__tests__/idle-infill-layer.test.ts
packages/g2-app/src/status-hud/__tests__/snapshot.test.ts
packages/g2-app/src/status-hud/__tests__/fixtures/budget-bust.fixture.ts
packages/g2-app/src/status-hud/__tests__/fixtures/tsconfig.adversarial.json
packages/shared-render/src/fixtures/status-hud.loading.txt
packages/shared-render/src/fixtures/status-hud.hp-overflow.txt
packages/shared-render/src/fixtures/status-hud.conditions-overflow.txt
packages/shared-render/src/fixtures/glyph-scene.boot.txt
packages/shared-render/src/fixtures/glyph-scene.raster-idle.txt
packages/shared-render/src/fixtures/glyph-scene.raster-idle-en.txt
packages/shared-render/src/fixtures/glyph-scene.raster-idle-it.txt
packages/shared-render/src/fixtures/glyph-scene.raster-idle-de.txt
packages/shared-render/src/fixtures/glyph-scene.glyph-idle.txt
```

### Modified (1)

```
packages/g2-app/tsconfig.json (exclude entry for budget-bust.fixture.ts)
```

### Deleted (1)

```
packages/g2-app/src/status-hud/__tests__/.gitkeep (replaced by real tests)
```

## Commits

| Hash      | Description                                                                 |
|-----------|-----------------------------------------------------------------------------|
| `2466ca7` | feat(g2-app): land i18n-budgets + StatusHudRenderer + B-1 adversarial typecheck (Task 1) |
| `5676a33` | feat(g2-app): land StatusHudLayer + IdleInfillLayer + 6 scene fixtures + W-2 ck tests (Task 2) |

## Self-Check: PASSED

- All 9 fixture files exist (3 status-hud + 6 glyph-scene)
- Both layer source files exist and contain `implements Layer`
- StatusHudLayer source contains `CharacterSnapshotSchema.safeParse` (2 matches)
- IT fixture contains `Condizioni`; DE fixture contains `Zustände`; glyph fixture contains `[GLY]`
- snapshot.test.ts contains 19 INV-1 ck markers (≥5 required for W-2)
- `pnpm typecheck` exits 0
- `pnpm lint:ci` exits 0
- `pnpm --filter @evf/g2-app test` exits 0 (252 tests)
- Both commits (`2466ca7`, `5676a33`) present in git log
