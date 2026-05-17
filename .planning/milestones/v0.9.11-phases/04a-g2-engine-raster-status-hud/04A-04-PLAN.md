---
phase: 04a
plan: 04
type: execute
wave: 2
depends_on: ["04a-02"]
files_modified:
  - packages/g2-app/src/status-hud/status-hud-layer.ts
  - packages/g2-app/src/status-hud/status-hud-renderer.ts
  - packages/g2-app/src/status-hud/i18n-budgets.ts
  - packages/g2-app/src/status-hud/idle-infill-layer.ts
  - packages/g2-app/src/status-hud/__tests__/status-hud-renderer.test.ts
  - packages/g2-app/src/status-hud/__tests__/i18n-budgets.test.ts
  - packages/g2-app/src/status-hud/__tests__/i18n-budgets-adversarial.test.ts
  - packages/g2-app/src/status-hud/__tests__/status-hud-layer.test.ts
  - packages/g2-app/src/status-hud/__tests__/idle-infill-layer.test.ts
  - packages/g2-app/src/status-hud/__tests__/snapshot.test.ts
  - packages/g2-app/src/status-hud/__tests__/fixtures/budget-bust.fixture.ts
  - packages/shared-render/src/fixtures/glyph-scene.boot.txt
  - packages/shared-render/src/fixtures/glyph-scene.raster-idle.txt
  - packages/shared-render/src/fixtures/glyph-scene.raster-idle-it.txt
  - packages/shared-render/src/fixtures/glyph-scene.raster-idle-en.txt
  - packages/shared-render/src/fixtures/glyph-scene.raster-idle-de.txt
  - packages/shared-render/src/fixtures/glyph-scene.glyph-idle.txt
  - packages/shared-render/src/fixtures/status-hud.loading.txt
  - packages/shared-render/src/fixtures/status-hud.hp-overflow.txt
  - packages/shared-render/src/fixtures/status-hud.conditions-overflow.txt
autonomous: true
requirements: [DISP-01, DISP-02, DISP-03, I18N-04]
user_setup: []
tags: [g2-app, status-hud, i18n, inv-1, fixtures, idle-infill, wave-2]
must_haves:
  truths:
    - "Status HUD renders HP / AC / Speed / Conditions / Concentration as 5-line corner card at col 68-95 (28 char wide), always visible at z=1, never captures input"
    - "Width budget table HUD_WIDTH_BUDGETS enforces IT/EN/DE max per field at TYPE level (TypeScript satisfies guard) AND runtime (assertWithinBudget)"
    - "Adversarial typecheck test in i18n-budgets-adversarial.test.ts constructs a budget-violating `satisfies Record<string, WidthBudgetRow>` literal in a fixture file and asserts `tsc --noEmit` FAILS against it (B-1 verification — proves CI catches budget-busting strings)"
    - "Missing scalar data renders as `—` (em-dash U+2014); loading state renders as `…` (ellipsis U+2026); never collapses column width"
    - "9 ASCII fixtures committed in packages/shared-render/src/fixtures/ matching UI-SPEC §Phase 4a Screen Inventory + §Fixture File Map"
    - "matchAsciiFixture snapshot tests pass for INV-1 ck 11 (hp-overflow + conditions-overflow), ck 12 (raster-idle), ck 13 (glyph-idle + [GLY] badge), ck 14 (raster-idle-it + raster-idle-en + raster-idle-de), ck 15 (status-hud.loading) — each mapped to a dedicated named test in snapshot.test.ts per W-2"
    - "IdleInfillLayer implements Layer interface with 3 text containers (z05-combat-log, z05-label, z05-stats); no getCaptureContainer (render-only)"
  artifacts:
    - path: "packages/g2-app/src/status-hud/i18n-budgets.ts"
      provides: "HUD_WIDTH_BUDGETS const-as-truth table + assertWithinBudget runtime guard"
      exports: ["HUD_WIDTH_BUDGETS", "assertWithinBudget", "WidthBudgetRow"]
    - path: "packages/g2-app/src/status-hud/status-hud-renderer.ts"
      provides: "StatusHudRenderer class: render(snapshot), renderLoading(), renderMissing(); locale-aware (it|en|de); width-budgeted; AsciiGrid output"
      exports: ["StatusHudRenderer"]
    - path: "packages/g2-app/src/status-hud/status-hud-layer.ts"
      provides: "StatusHudLayer implements Layer; z=1 always visible; subscribes to WS character.delta with 200 ms debounce + 30 s heartbeat; no capture"
      exports: ["StatusHudLayer"]
    - path: "packages/g2-app/src/status-hud/idle-infill-layer.ts"
      provides: "IdleInfillLayer implements Layer; z=0.5 rows 17-19; auto-demolished by LayerManager.bundle on overlay mount"
      exports: ["IdleInfillLayer"]
    - path: "packages/g2-app/src/status-hud/__tests__/i18n-budgets-adversarial.test.ts"
      provides: "B-1 adversarial test: runs tsc against budget-busting fixture and asserts non-zero exit + matching error code (proves satisfies gate works)"
      contains: "tsc --noEmit"
    - path: "packages/g2-app/src/status-hud/__tests__/fixtures/budget-bust.fixture.ts"
      provides: "Intentionally-bad TypeScript fixture: `satisfies Record<string, WidthBudgetRow>` literal with a string longer than declared max (ts-expect-error eliminated to force compile failure when included)"
      contains: "satisfies Record<string, WidthBudgetRow>"
    - path: "packages/g2-app/src/status-hud/__tests__/snapshot.test.ts"
      provides: "Per-ck INV-1 snapshot tests (W-2): one named test per checklist item ck 11/12/13/14/15 mapping to the corresponding fixture(s)"
      contains: "INV-1 ck"
    - path: "packages/shared-render/src/fixtures/*.txt"
      provides: "9 INV-1 ASCII fixtures spanning boot, raster-idle (3 locales), glyph-idle, status-hud loading + 2 overflow states"
      contains: "character-perfect grids matching UI-SPEC ASCII mockups verbatim"
  key_links:
    - from: "packages/g2-app/src/status-hud/status-hud-renderer.ts"
      to: "packages/g2-app/src/status-hud/i18n-budgets.ts"
      via: "HUD_WIDTH_BUDGETS lookup + assertWithinBudget truncate-with-ellipsis"
      pattern: "HUD_WIDTH_BUDGETS"
    - from: "packages/g2-app/src/status-hud/status-hud-renderer.ts"
      to: "@evf/shared-render AsciiGrid"
      via: "AsciiGrid constructor builds the 28-char-wide × 21-row corner card"
      pattern: "new AsciiGrid"
    - from: "packages/g2-app/src/status-hud/status-hud-layer.ts"
      to: "@evf/shared-protocol CharacterSnapshotSchema"
      via: "WS delta payload parsed via safeParse, snapshot passed to renderer"
      pattern: "CharacterSnapshotSchema"
    - from: "packages/g2-app/src/status-hud/__tests__/*.test.ts"
      to: "packages/shared-render/src/fixtures/*.txt"
      via: "matchAsciiFixture with '../../../../shared-render/src/fixtures/<file>.txt' path"
      pattern: "matchAsciiFixture"
    - from: "packages/g2-app/src/status-hud/idle-infill-layer.ts"
      to: "packages/g2-app/src/engine/layer-types.ts Layer interface"
      via: "implements Layer; getCaptureContainer omitted (render-only)"
      pattern: "implements Layer"
    - from: "packages/g2-app/src/status-hud/__tests__/i18n-budgets-adversarial.test.ts"
      to: "packages/g2-app/src/status-hud/__tests__/fixtures/budget-bust.fixture.ts"
      via: "spawnSync('pnpm', ['exec', 'tsc', '--noEmit', fixturePath]) — exit non-zero + stderr contains expected TS error"
      pattern: "tsc.*noEmit"

threat_model:
  trust_boundaries:
    - description: "Bridge WS character.delta envelope → status-hud-layer: payload must be safeParse-validated before reaching the renderer"
    - description: "Foundry i18n catalog strings (potentially unicode-pathological) flow through HUD render path"
  threats:
    - id: "T-4a-04-01"
      category: "T"
      component: "status-hud-layer.ts WS delta receive"
      disposition: "mitigate"
      mitigation_plan: "Every delta passed through CharacterSnapshotSchema.safeParse before forwarding to renderer; on failure log + ignore (no throw, no crash). Renderer never receives unvalidated input."
    - id: "T-4a-04-02"
      category: "T"
      component: "i18n string injection via Foundry world translation override"
      disposition: "mitigate"
      mitigation_plan: "All HUD strings width-truncated to per-field budget with `…` (assertWithinBudget runtime guard); G2 firmware renders plain text (no code execution surface); zero-width / RTL marks neutralized by AsciiGrid uniform-width enforcement"
    - id: "T-4a-04-03"
      category: "D"
      component: "Heartbeat timer leak on destroy"
      disposition: "mitigate"
      mitigation_plan: "StatusHudLayer.destroy() clears both debounceTimer and heartbeatTimer; unit-tested via vi.useFakeTimers + assert timer count = 0 post-destroy"
---

<objective>
Deliver the always-visible Status HUD (z=1), z=0.5 IdleInfillLayer, the build-time i18n width-budget gate, and the 9 INV-1 ASCII snapshot fixtures.

Purpose: This plan closes DISP-01 (HUD persistente), DISP-03 (INV-1 ck 11-15 snapshot fixtures), I18N-04 (per-key width budget + EN fallback), and DISP-02 (layout layered with exactly 1 capture container — StatusHudLayer is the canonical z=1 read-only layer that LayerManager's capture-invariant test relies on as the "no-capture" exemplar; Plan 02 owns the runtime invariant enforcement, this plan delivers the layer instance that proves the invariant in practice). It runs in parallel with Plan 03 (raster) and Plan 06 (Foundry canvas extraction) because files_modified do not overlap — Plan 03 owns `packages/g2-app/src/raster/*`, Plan 04 owns `packages/g2-app/src/status-hud/*` plus the 9 fixture files under `packages/shared-render/src/fixtures/`, Plan 06 owns `packages/foundry-module/src/canvas-extractor.ts` + `packages/shared-protocol/src/payloads/frame.ts` + a new `packages/g2-app/src/scene-input.ts`.

REVISION 1 (2026-05-15) — per 04A-PLAN-CHECK.md B-1 + W-2:
- **B-1 (split):** Plan 01 dropped DISP-02 (it had no behavioral enforcement there). DISP-02 stays in Plan 02 (LayerManager runtime invariant enforcement) AND is added here (this plan ships StatusHudLayer + IdleInfillLayer instances — the "read-only layer" pattern proves the capture-invariant works against multi-layer configurations). The I18N-04 `satisfies Record<string, WidthBudgetRow>` build-time gate is now ADVERSARIALLY TESTED by a new test file `i18n-budgets-adversarial.test.ts` that runs `tsc --noEmit` against a fixture file with a budget-violating literal and asserts a non-zero exit + expected error code. This proves CI would catch a budget-busting string at the type level, not just at runtime.
- **W-2 (per-ck testing):** A new `snapshot.test.ts` file maps each of the 5 INV-1 checklist items (ck 11-15) to a dedicated named `it()` block. ck 12 (raster-idle) and ck 13 (glyph-idle + [GLY] badge) each get their own `matchAsciiFixture` assertion — closing the gap noted in 04A-PLAN-CHECK.md W-2 where all INV-1 ck mapped to a single VALIDATION.md row.

Output: 4 source modules + **6 test files** (added: i18n-budgets-adversarial.test.ts and snapshot.test.ts) + 1 budget-bust fixture (TS source) + 9 INV-1 fixture text files. StatusHudLayer implements the Layer interface and is mountable at ZIndex.Z1_STATUS_HUD. IdleInfillLayer is mountable at ZIndex.Z0_5_IDLE_INFILL. All 9 fixtures are character-perfect copies of the UI-SPEC ASCII mockups, ready for Plan 05 integration smoke + ongoing CI snapshot drift detection.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/04a-g2-engine-raster-status-hud/04a-CONTEXT.md
@.planning/phases/04a-g2-engine-raster-status-hud/04A-RESEARCH.md
@.planning/phases/04a-g2-engine-raster-status-hud/04A-PATTERNS.md
@.planning/phases/04a-g2-engine-raster-status-hud/04A-UI-SPEC.md
@.planning/phases/04a-g2-engine-raster-status-hud/04a-01-SUMMARY.md
@.planning/phases/04a-g2-engine-raster-status-hud/04a-02-SUMMARY.md
@packages/g2-app/src/engine/layer-types.ts
@packages/g2-app/src/engine/layer-manager.ts
@packages/g2-app/src/wizard/i18n.ts
@packages/g2-app/src/wizard/wizard.ts
@packages/g2-app/src/__tests__/example-status-hud.test.ts
@packages/shared-render/src/ascii-grid.ts
@packages/shared-render/src/snapshot.ts
@packages/shared-render/src/fixtures/status-hud-baseline.txt
@packages/shared-protocol/src/payloads/character.ts
@packages/shared-protocol/src/index.ts

<interfaces>
<!-- Key types this plan consumes and exposes. -->

From packages/g2-app/src/engine/layer-types.ts (Plan 01):
- `enum ZIndex { ..., Z0_5_IDLE_INFILL = 0.5, Z1_STATUS_HUD = 1, ... }`
- `interface Layer { id: string; draw(): Promise<void>; destroy(): void; getCaptureContainer?(): string }`
  - StatusHudLayer + IdleInfillLayer implement Layer but OMIT getCaptureContainer (read-only)

From @evf/shared-render:
- `class AsciiGrid` — char grid with constructor enforcing uniform row width; `toString()` returns rows joined by '\n' + trailing '\n'
- `async matchAsciiFixture(grid: AsciiGrid, fixturePath: string): Promise<void>` — wraps Vitest `expect(...).toMatchFileSnapshot(path)`

From @evf/shared-protocol:
- `const CharacterSnapshotSchema = z.object(...)` — full shape in packages/shared-protocol/src/payloads/character.ts (read this file for actual fields)
- `type CharacterSnapshot = z.infer<typeof CharacterSnapshotSchema>` — exposes hp, ac, speed, conditions[], concentration, name, class/level, etc.

UI-SPEC §Status HUD Design Contract §Field Layout (canonical 28-char × 21-row layout — every field has a row index):
- Row 1: `║ {NAME 12}  {CLASS 8} ║`
- Row 2: `║ ─────────────────────── ║` (16 × `─`)
- Row 3: `║ HP {bar 8}              ║`
- Row 4: `║    {cur/max}  {temp}    ║`
- Row 5: `║ AC {ac 2}  SPD {spd 2}  ║`
- Row 7: `║ Act {dot}  Bns {dot}  R{dot} ║`
- Row 8: `║ Move {cur}/{max}        ║`
- Row 10: `║ Slots                   ║`
- Rows 11-13: 3 spell slot rows
- Row 15: `║ Conditions              ║`
- Rows 16-18: 3 condition rows (active marker ▶ on first)
- Row 19: overflow `… +{N}`
- Row 20: reserved / [GLY] badge col 93-95
- Row 21: border

UI-SPEC §i18n Width Budget table (IT/EN/DE per HUD field) — verbatim:
- hp_label IT='PF' EN='HP' DE='TP' max=2
- ac_label IT='CA' EN='AC' DE='RK' max=2
- speed_label IT='VEL' EN='SPD' DE='GES' max=3
- conditions_section IT='Condizioni' EN='Conditions' DE='Zustände' max=10
- concentration IT='Concentr.' EN='Concentr.' DE='Konzentr.' max=10
- slots_section IT='Slot' EN='Slots' DE='Slots' max=5
- move_label IT='Mov' EN='Mov' DE='Bew' max=3
- act_label IT='Az.' EN='Act' DE='Akt' max=3
- bns_label IT='Bns' EN='Bns' DE='Bns' max=3

INV-1 checklist mapping (W-2 per-ck named tests in snapshot.test.ts):
- ck 11 → status-hud.hp-overflow.txt + status-hud.conditions-overflow.txt (numeric + conditions overflow handling)
- ck 12 → glyph-scene.raster-idle.txt (default raster view alignment baseline)
- ck 13 → glyph-scene.glyph-idle.txt (glyph mode with [GLY] badge at canonical column)
- ck 14 → glyph-scene.raster-idle-it.txt + raster-idle-en.txt + raster-idle-de.txt (i18n longest-string stress)
- ck 15 → status-hud.loading.txt (loading placeholder state)
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: i18n-budgets + status-hud-renderer (TDD with INV-1 fixtures) + B-1 adversarial typecheck test</name>
  <read_first>
    - packages/g2-app/src/wizard/i18n.ts (lines 117-127 — pure transform function pattern + missing-data em-dash precedent; PATTERNS.md §status-hud-renderer.ts analog)
    - packages/g2-app/src/wizard/wizard.ts (lines 41-91 — ALL_I18N_KEYS const-as-truth pattern; PATTERNS.md §i18n-budgets.ts analog)
    - packages/shared-render/src/ascii-grid.ts (full file — constructor signature, row width enforcement)
    - packages/shared-render/src/snapshot.ts (matchAsciiFixture path resolution; Plan 04 fixture path offsets: tests in `packages/g2-app/src/status-hud/__tests__/` are 4 dirs up = `../../../../shared-render/src/fixtures/<file>.txt`)
    - packages/shared-render/src/fixtures/status-hud-baseline.txt (existing fixture format reference — character precision, uniform width, trailing newline)
    - packages/shared-protocol/src/payloads/character.ts (CharacterSnapshotSchema exact shape — match the actual exported field names; do not invent fields)
    - packages/g2-app/src/__tests__/example-status-hud.test.ts (PATTERNS.md exact-match analog for INV-1 snapshot test wiring; fixture path offset format)
    - .planning/phases/04a-g2-engine-raster-status-hud/04A-UI-SPEC.md §Status HUD Design Contract §Field Layout + §Field Width Budgets + §i18n Width Budget (canonical tables; values verbatim)
    - .planning/phases/04a-g2-engine-raster-status-hud/04A-UI-SPEC.md §Screen 4 Loading State (the exact ASCII mockup the loading fixture must match)
    - .planning/phases/04a-g2-engine-raster-status-hud/04A-UI-SPEC.md §Copywriting Contract (IT/EN translation tables for every HUD label)
    - .planning/phases/04a-g2-engine-raster-status-hud/04a-CONTEXT.md §Area 3 (missing data fallback rules: `—` em-dash for scalars, `…` ellipsis loading state)
    - .planning/phases/04a-g2-engine-raster-status-hud/04A-PATTERNS.md §i18n-budgets.ts + §status-hud-renderer.ts (verbatim const + class patterns)
    - .planning/phases/04a-g2-engine-raster-status-hud/04A-PLAN-CHECK.md §B-1 (adversarial typecheck requirement for satisfies gate)
  </read_first>
  <files>packages/g2-app/src/status-hud/i18n-budgets.ts, packages/g2-app/src/status-hud/status-hud-renderer.ts, packages/g2-app/src/status-hud/__tests__/i18n-budgets.test.ts, packages/g2-app/src/status-hud/__tests__/i18n-budgets-adversarial.test.ts, packages/g2-app/src/status-hud/__tests__/fixtures/budget-bust.fixture.ts, packages/g2-app/src/status-hud/__tests__/status-hud-renderer.test.ts, packages/shared-render/src/fixtures/status-hud.loading.txt, packages/shared-render/src/fixtures/status-hud.hp-overflow.txt, packages/shared-render/src/fixtures/status-hud.conditions-overflow.txt</files>
  <behavior>
    i18n-budgets:
    - Test IB-1: HUD_WIDTH_BUDGETS.hp_label.it === 'PF' && .en === 'HP' && .de === 'TP' && .max === 2 (verbatim from UI-SPEC table)
    - Test IB-2: HUD_WIDTH_BUDGETS.conditions_section.de === 'Zustände' && .max === 10
    - Test IB-3: All keys in HUD_WIDTH_BUDGETS satisfy `WidthBudgetRow` shape (compile-time `satisfies` guard means TypeScript build fails if the structural fields are wrong — verifiable at unit-test time as the source compiles)
    - Test IB-4: `assertWithinBudget('Condiz...', 'conditions_section')` does NOT throw (under budget); `assertWithinBudget('ConditionsLong', 'conditions_section')` warns via console.warn (over budget but length 14 > 10)
    - Test IB-5: A `getLabel(field, locale)` helper (if implemented) returns the per-locale string for the budget table key
    - **Test IB-6 (B-1 adversarial typecheck — in `i18n-budgets-adversarial.test.ts`):** Spawn `pnpm exec tsc --noEmit packages/g2-app/src/status-hud/__tests__/fixtures/budget-bust.fixture.ts` from the test (using `node:child_process spawnSync` with the workspace-root cwd; honor `tsconfig.base.json`). Assert the process exit code is non-zero AND stderr contains "TS2322" or "TS2769" (assignment/satisfaction error class) or the literal substring "is not assignable" (a specific phrase TypeScript emits when a `satisfies` clause fails). Use a 10-second timeout. The fixture file `budget-bust.fixture.ts` is intentionally bad source: it imports the real `WidthBudgetRow` interface and declares `const bad = { conditions_section: { it: 'Condizioni', en: 'Conditions', de: 'EinExtremLangeZustandsbezeichnungUndDannNoch', max: 10 } } as const satisfies Record<string, WidthBudgetRow>`. Because TypeScript checks the literal width vs `max` ONLY when an explicit branded type forces it, the adversarial fixture instead violates a STRUCTURAL constraint: the `max` is declared as the literal type `2` for `hp_label` while `de: 'TPTPTP'` (6 chars) is constrained via a brand interface `WidthBudgetRow & WidthFitsBudget<TBudget>`. Implementation note: the planner expects the executor to add a `type WidthFitsBudget<T extends WidthBudgetRow> = (T['it'] | T['en'] | T['de'])['length'] extends LessOrEqual<T['max']> ? T : 'BUDGET_EXCEEDED'` brand pattern to the production i18n-budgets.ts so the `satisfies` clause becomes type-level enforceable. If the brand pattern proves infeasible under TS 5.8.3 (template-literal length is non-trivial), the executor MUST document the deviation in 04a-04-SUMMARY.md and fall back to a runtime-only assertion in the fixture (still exits non-zero via a `throw` block, but lose the build-time guarantee). The IB-6 test contract is the binary fact: `tsc --noEmit` exits non-zero on the fixture. The mechanism is the implementer's choice given TS 5.8.3 constraints.

    status-hud-renderer:
    - Test SR-1: `new StatusHudRenderer({ locale: 'en' }).renderLoading()` returns AsciiGrid with:
      - col 0 of every row is `║` and col 27 is `║` (uniform 28-char border)
      - HP value cells show `…` placeholder
      - 0 throws; the fixture path `../../../../shared-render/src/fixtures/status-hud.loading.txt` matches the output via matchAsciiFixture
    - Test SR-2: `renderer.render({hp: {current:45, max:68, temp: 10}, ac: 18, speed: 30, name: 'Thorin', class: 'F3/W5'})` produces AsciiGrid matching the row 3-5 fields with HP bar of 8 glyphs, AC 18, SPD 30
    - Test SR-3: Missing snapshot field (e.g., `ac: undefined`) renders `—` (em-dash) in the AC column without collapsing the row width (col 27 still `║`)
    - Test SR-4: Long name ('VeryLongNameOverflow') truncates to 11 chars + `…` per UI-SPEC §Field Width Budgets table
    - Test SR-5: 7 conditions overflow → renders 3 visible + `… +4` row per UI-SPEC §Status HUD Field Layout row 19; fixture status-hud.conditions-overflow.txt matches
    - Test SR-6: HP=700 (numeric overflow) — renders truncated `…` per HP value budget; fixture status-hud.hp-overflow.txt matches
    - Test SR-7: Locale switching (`new StatusHudRenderer({locale:'it'})`) replaces HP→PF, AC→CA, SPD→VEL labels per i18n table
    - Test SR-8: `[GLY]` badge — when renderer is constructed with `mapMode: 'glyph'`, col 93-95 of row 20 contains `[GL` (or full `[GLY]` if HUD column extends, depending on layout choice); in raster mode, those columns are spaces
  </behavior>
  <action>
    Implement two source modules + 2 test files + 1 new adversarial test + 1 budget-bust fixture + 3 status-hud fixture files in this task. The fixtures are authored by hand from UI-SPEC §Status HUD Design Contract — they are the contract, not generated from the renderer.

    **1. `packages/g2-app/src/status-hud/i18n-budgets.ts`:**
    Module JSDoc citing CONTEXT.md Area 3 + UI-SPEC §i18n Width Budget table.

    Exports:
    - `export interface WidthBudgetRow { it: string; en: string; de: string; max: number }`
    - `export const HUD_WIDTH_BUDGETS = { ... } as const satisfies Record<string, WidthBudgetRow>` — populated VERBATIM from UI-SPEC §i18n Width Budget table (hp_label, ac_label, speed_label, conditions_section, concentration, slots_section, move_label, act_label, bns_label; copy every value letter-for-letter including non-ASCII `Zustände`). The `satisfies` clause is the build-time gate per CONTEXT.md Area 3.
    - `export function assertWithinBudget(value: string, field: keyof typeof HUD_WIDTH_BUDGETS): void` — if `value.length > HUD_WIDTH_BUDGETS[field].max` → console.warn(`[EVF] i18n-budgets: '${field}' exceeded budget ${budget}: "${value}"`). Per PATTERNS.md §i18n-budgets.ts — no throw at runtime (truncate-and-warn policy).
    - `export function getLabel(field: keyof typeof HUD_WIDTH_BUDGETS, locale: 'it'|'en'|'de'): string` — returns per-locale string.
    - **B-1 enforcement attempt:** Optionally introduce a brand type `WidthFitsBudget<T>` that enforces `T['it'|'en'|'de']['length'] <= T['max']` at the type level using TS 5.8 conditional/template-literal types. If feasible under TS 5.8.3 (template-literal length operators are limited; a tuple-decomposition trick may be needed), declare `HUD_WIDTH_BUDGETS satisfies Record<string, WidthBudgetRow & WidthFitsBudget<...>>`. If infeasible, keep `satisfies Record<string, WidthBudgetRow>` and document the deviation in 04a-04-SUMMARY.md; the IB-6 adversarial test still proves SOME form of build-time gate works (the bound the fixture violates may shift from the literal-length brand to the structural-extra-field brand — see fixture below).

    **2. `packages/g2-app/src/status-hud/status-hud-renderer.ts`:**
    Module JSDoc citing UI-SPEC §Status HUD Design Contract + CONTEXT.md Area 3 (missing data fallback) + ascii-grid.ts as render target.

    Imports: `import { AsciiGrid } from '@evf/shared-render'; import type { CharacterSnapshot } from '@evf/shared-protocol'; import { HUD_WIDTH_BUDGETS, getLabel, assertWithinBudget } from './i18n-budgets.js'`.

    Exports:
    - `export interface StatusHudRendererOpts { locale: 'it'|'en'|'de'; mapMode?: 'raster'|'glyph' }`
    - `export class StatusHudRenderer { constructor(private readonly opts: StatusHudRendererOpts); render(snapshot: CharacterSnapshot): AsciiGrid; renderLoading(): AsciiGrid; renderMissing(): AsciiGrid }` — three render methods covering the three states from UI-SPEC §Screen 4 + canonical raster/glyph modes.
    - Internal helpers (private methods or module-private functions): `buildHpBar(current, max): string` (8-glyph bar per UI-SPEC §Field Width Budgets HP bar), `truncateField(value, budget)`, `formatSnapshot(snap, locale)`, `formatMissing(locale)`, `formatLoading(locale)`.
    - The AsciiGrid is always 28 chars wide × 21 rows tall (per UI-SPEC §Status HUD §Field Layout). Col 0 and col 27 are `║`. Em-dash `—` for missing scalars; ellipsis `…` for loading. `[GLY]` badge at col 93-95 of the full-page coordinate space — but since this renderer only produces the 28-char card, the [GLY] badge is at col 25-27 of the local card (last 3 chars of row 20).

    **3. Three fixture files (hand-authored to match UI-SPEC verbatim):**

    - `packages/shared-render/src/fixtures/status-hud.loading.txt` — 28-char × 21-row card showing `…` in HP/Loading area and `—` everywhere else. Exactly matches UI-SPEC §Screen 4 Status HUD region (the right-side block, col 68-95).
    - `packages/shared-render/src/fixtures/status-hud.hp-overflow.txt` — Status HUD card with name='VeryLongNameOver' (truncated to 11 + `…`) and HP=999/999 + temp+999t; tests SR-6 + INV-1 ck 11.
    - `packages/shared-render/src/fixtures/status-hud.conditions-overflow.txt` — 7-condition snapshot showing 3 visible + `… +4` row; tests SR-5 + INV-1 ck 11.

    Each fixture: uniform 28-char width, rows joined by LF, trailing newline (snapshot.ts line 22 convention). Use box-drawing chars `║─` from UI-SPEC §Glyph Dictionary verbatim.

    **4. Test files:**

    - `packages/g2-app/src/status-hud/__tests__/i18n-budgets.test.ts` — 5 tests matching IB-1..IB-5.
    - `packages/g2-app/src/status-hud/__tests__/status-hud-renderer.test.ts` — 8 tests matching SR-1..SR-8 (RED then GREEN). Use `matchAsciiFixture(grid, '../../../../shared-render/src/fixtures/status-hud.loading.txt')` — the 4-dirs-up path is correct for this test file location per PATTERNS.md §Fixture path offset table.

    **5. B-1 adversarial typecheck test + fixture (NEW per revision 1):**

    - `packages/g2-app/src/status-hud/__tests__/fixtures/budget-bust.fixture.ts` — intentionally-bad TypeScript source. The file is NOT included in the normal `tsconfig.base.json` `include` glob — add an `exclude` entry (`"packages/g2-app/src/status-hud/__tests__/fixtures/budget-bust.fixture.ts"`) in `tsconfig.base.json` (or in a per-package tsconfig override) so the normal `pnpm typecheck` passes. The fixture imports `WidthBudgetRow` and the brand type from `../../i18n-budgets.js` and declares a literal that violates the brand:
      ```
      // Adversarial fixture for IB-6 (04A-PLAN-CHECK.md B-1).
      // tsc --noEmit MUST fail on this file.
      // @ts-nocheck is FORBIDDEN here — the failure is the assertion.
      import type { WidthBudgetRow } from '../../i18n-budgets.js';
      // Intentionally violates: de length > max (the brand catches it; if brand infeasible,
      // we violate `max` field type narrowing with a literal mismatch).
      const bad = {
        hp_label: { it: 'PF', en: 'HP', de: 'TPTPTP', max: 2 },  // de.length=6 > max=2
      } as const satisfies Record<string, WidthBudgetRow>;
      export { bad };
      ```
      If the WidthFitsBudget brand pattern is implemented in i18n-budgets.ts, the `satisfies Record<string, WidthBudgetRow & WidthFitsBudget<...>>` (used in the fixture as well) will fail at type-level. If the brand is infeasible, the executor must change the fixture to violate a different type constraint that DOES fail under plain `WidthBudgetRow` (e.g., `max: 'NotANumber' as const` — that fails the `max: number` constraint). Document the chosen approach in 04a-04-SUMMARY.md.
    - `packages/g2-app/src/status-hud/__tests__/i18n-budgets-adversarial.test.ts` — Vitest test that spawns `tsc --noEmit` against the fixture:
      ```
      import { spawnSync } from 'node:child_process';
      import { resolve } from 'node:path';
      describe('I18N-04 satisfies gate adversarial typecheck (B-1)', () => {
        it('rejects budget-busting WidthBudgetRow literal at compile time', () => {
          const fixturePath = resolve(__dirname, 'fixtures/budget-bust.fixture.ts');
          const repoRoot = resolve(__dirname, '../../../../..');  // 5 dirs up from __tests__
          const result = spawnSync('pnpm', ['exec', 'tsc', '--noEmit', '--project', resolve(repoRoot, 'tsconfig.base.json'), fixturePath], { encoding: 'utf-8', timeout: 30000, cwd: repoRoot });
          expect(result.status).not.toBe(0);
          // Accept any of the TS error codes that catch satisfies failures:
          const acceptableErrorCodes = ['TS2322', 'TS2741', 'TS2769', 'TS2353'];
          const stderrOrStdout = (result.stderr ?? '') + (result.stdout ?? '');
          const matchedCode = acceptableErrorCodes.find(c => stderrOrStdout.includes(c));
          expect(matchedCode, `tsc must fail with a satisfies-class error; got: ${stderrOrStdout.slice(0, 500)}`).toBeDefined();
        });
      });
      ```
      Note: this test consumes ~5-15 s wall time (tsc invocation); mark with `it.concurrent` or accept the latency. Document in 04a-04-SUMMARY.md whether the test was kept in the default suite or moved to a `:slow` suite per RESEARCH.md feedback-latency policy.

    Constraints:
    - All snapshots in CharacterSnapshot are processed through `safeParse` upstream (Task 2's StatusHudLayer); the renderer assumes its input is already valid `CharacterSnapshot`.
    - INV-4 JSDoc on every export.
    - No `// TODO` without `(#issue)` or `(ADR-NNNN)` — if a field is unknown, document with `// TODO(ADR-0009): clarify ...` and a follow-up note.
    - **B-1 adversarial test is autonomous-tagged: it spawns a child process but does so deterministically against a stable fixture; no flaky behavior expected. If the test is flaky in CI, the executor must investigate (likely tsc PATH or pnpm exec resolution issue) and document — NOT remove or skip.**
  </action>
  <verify>
    <automated>pnpm --filter @evf/g2-app test --run -- src/status-hud/__tests__/status-hud-renderer.test.ts src/status-hud/__tests__/i18n-budgets.test.ts src/status-hud/__tests__/i18n-budgets-adversarial.test.ts && test -f packages/shared-render/src/fixtures/status-hud.loading.txt && test -f packages/shared-render/src/fixtures/status-hud.hp-overflow.txt && test -f packages/shared-render/src/fixtures/status-hud.conditions-overflow.txt && test -f packages/g2-app/src/status-hud/__tests__/fixtures/budget-bust.fixture.ts && grep -c 'PF' packages/g2-app/src/status-hud/i18n-budgets.ts && grep -c 'Zustände' packages/g2-app/src/status-hud/i18n-budgets.ts && grep -c 'satisfies Record' packages/g2-app/src/status-hud/i18n-budgets.ts && grep -c '—' packages/g2-app/src/status-hud/status-hud-renderer.ts && grep -c 'spawnSync' packages/g2-app/src/status-hud/__tests__/i18n-budgets-adversarial.test.ts && grep -c 'tsc' packages/g2-app/src/status-hud/__tests__/i18n-budgets-adversarial.test.ts && pnpm typecheck</automated>
  </verify>
  <done>
    Three test files green (14 tests minimum: 5 IB + 1 IB-6 adversarial + 8 SR); 3 status-hud fixture files + 1 budget-bust fixture exist; i18n-budgets.ts contains the verbatim IT label `PF`, the DE non-ASCII string `Zustände`, and the `satisfies Record` build-time gate; renderer uses em-dash `—`; adversarial test calls spawnSync + tsc and asserts non-zero exit; pnpm typecheck exits 0 (which proves the production source compiles AND the budget-bust.fixture.ts is excluded from the default tsconfig include).
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: StatusHudLayer + IdleInfillLayer + 6 scene fixtures + W-2 per-ck snapshot tests (Layer wiring + INV-1)</name>
  <read_first>
    - packages/g2-app/src/wizard/wizard.ts (lines 114-219 — store subscribe + delegate-to-renderer + destroy cleanup pattern; PATTERNS.md §status-hud-layer.ts analog)
    - packages/g2-app/src/engine/layer-types.ts (Layer interface — both layers implement)
    - packages/shared-protocol/src/payloads/character.ts (CharacterSnapshotSchema — used for safeParse at WS receive)
    - packages/shared-protocol/src/envelope.ts (envelope shape for `character.delta` typed messages)
    - .planning/phases/04a-g2-engine-raster-status-hud/04A-PATTERNS.md §status-hud-layer.ts + §idle-infill-layer.ts (verbatim Layer-implements pattern with cleanup)
    - .planning/phases/04a-g2-engine-raster-status-hud/04A-UI-SPEC.md §Screen 1 Boot Splash + §Screen 2 Raster + §Screen 3 Glyph (the 6 remaining fixtures: boot, raster-idle, raster-idle-{it,en,de}, glyph-idle)
    - .planning/phases/04a-g2-engine-raster-status-hud/04A-UI-SPEC.md §z=0.5 Idle Content Infill Design Contract (3 containers, atomic lifecycle, glyph-mode degradation to 2 containers)
    - .planning/phases/04a-g2-engine-raster-status-hud/04a-CONTEXT.md §Area 3 update cadence (200 ms debounce + 30 s heartbeat) + §Area 1 z=0.5↔z=2 bundle atomic
    - docs/architecture/0001-layered-ui-model.md §Amendment 1 (z=0.5 spec)
    - .planning/phases/04a-g2-engine-raster-status-hud/04A-PLAN-CHECK.md §W-2 (per-ck named tests required)
  </read_first>
  <files>packages/g2-app/src/status-hud/status-hud-layer.ts, packages/g2-app/src/status-hud/idle-infill-layer.ts, packages/g2-app/src/status-hud/__tests__/status-hud-layer.test.ts, packages/g2-app/src/status-hud/__tests__/idle-infill-layer.test.ts, packages/g2-app/src/status-hud/__tests__/snapshot.test.ts, packages/shared-render/src/fixtures/glyph-scene.boot.txt, packages/shared-render/src/fixtures/glyph-scene.raster-idle.txt, packages/shared-render/src/fixtures/glyph-scene.raster-idle-it.txt, packages/shared-render/src/fixtures/glyph-scene.raster-idle-en.txt, packages/shared-render/src/fixtures/glyph-scene.raster-idle-de.txt, packages/shared-render/src/fixtures/glyph-scene.glyph-idle.txt</files>
  <behavior>
    status-hud-layer:
    - Test SHL-1: `new StatusHudLayer({bridge, renderer, wsEvents, locale:'en'}).id === 'status-hud'`
    - Test SHL-2: `getCaptureContainer` is UNDEFINED (read-only; status HUD never captures input)
    - Test SHL-3: When `wsEvents` fires a `character.delta` event with a valid CharacterSnapshot payload → after 200 ms debounce, `bridge.textContainerUpgrade` is called with containerName 'status-hud' and content from renderer.render(snapshot).toString()
    - Test SHL-4: Two character.delta events within 200 ms → only one textContainerUpgrade call after the debounce (debounce coalescing verified via vi.useFakeTimers)
    - Test SHL-5: Idle (no event for 30 s) → heartbeat re-renders the last-known snapshot to recover from any drift; verify via vi.advanceTimersByTime
    - Test SHL-6: Malformed delta payload (fails CharacterSnapshotSchema.safeParse) → logged + ignored, NO textContainerUpgrade call, NO throw
    - Test SHL-7: `destroy()` clears debounceTimer + heartbeatTimer + calls the unsubscribe returned by wsEvents.subscribe (no leaks; verify timer count + unsubscribe.mock.calls)

    idle-infill-layer:
    - Test IIL-1: `new IdleInfillLayer({bridge, mode:'raster'}).id === 'idle-infill'`
    - Test IIL-2: `getCaptureContainer` is UNDEFINED (render-only)
    - Test IIL-3: `draw()` issues 3 textContainerUpgrade calls in raster mode (containerNames: 'z05-combat-log', 'z05-label', 'z05-stats')
    - Test IIL-4: `draw()` in glyph mode issues 2 textContainerUpgrade calls (combat-log omitted per UI-SPEC §z=0.5 Idle §In glyph mode)
    - Test IIL-5: `setStats({mode, res, pipeline, bleKbps, fpsObserved})` updates internal state; next draw() renders the stats strip with `raster 400×200 · FS+RLE+delta · BLE {N}k · {N} fps · [Q] Quick` format per UI-SPEC §Stats strip format
    - Test IIL-6: `destroy()` is idempotent — no individual teardown required because LayerManager.bundle() removes containers via rebuildPageContainer (per PATTERNS.md §idle-infill-layer.ts JSDoc)

    snapshot.test.ts (W-2 per-ck mapping):
    - Test INV1-ck11-hp-overflow: `renderer.render({...hpOverflowSnapshot})` matches fixture `status-hud.hp-overflow.txt` via matchAsciiFixture
    - Test INV1-ck11-conditions-overflow: `renderer.render({...conditionsOverflowSnapshot})` matches `status-hud.conditions-overflow.txt`
    - Test INV1-ck12-raster-idle: A canonical raster-idle scene composed by buildFullPage helper matches `glyph-scene.raster-idle.txt` (the canonical EN raster default; map area + Status HUD + z=0.5 strips all painted)
    - Test INV1-ck13-glyph-idle: Glyph-mode scene with `[GLY]` badge visible at col 93-95 of the full page matches `glyph-scene.glyph-idle.txt` (this test specifically checks the `[GLY]` literal at canonical column — proves W-2 ck 13 has dedicated assertion)
    - Test INV1-ck14-it: IT-locale longest-string scene matches `glyph-scene.raster-idle-it.txt`
    - Test INV1-ck14-en: EN-canonical scene matches `glyph-scene.raster-idle-en.txt`
    - Test INV1-ck14-de: DE-locale `Zustände`/`Konzentr.` scene matches `glyph-scene.raster-idle-de.txt`
    - Test INV1-ck15-loading: `renderer.renderLoading()` matches `status-hud.loading.txt`
    - Each test has a discriminator string `INV-1 ck NN` in its `it()` name for grep-ability.
  </behavior>
  <action>
    Implement two source modules + 3 test files + 6 scene fixture files.

    **1. `packages/g2-app/src/status-hud/status-hud-layer.ts`:**
    Module JSDoc citing UI-SPEC §Status HUD Corner Card, CONTEXT.md Area 3 (update cadence), ADR-0001 (z=1 always visible).

    Imports: `import type { EvenAppBridge } from '@evenrealities/even_hub_sdk'; import type { Layer } from '../engine/layer-types.js'; import { StatusHudRenderer } from './status-hud-renderer.js'; import { CharacterSnapshotSchema, type CharacterSnapshot } from '@evf/shared-protocol'`.

    Exports:
    - `export interface StatusHudLayerOpts { bridge: EvenAppBridge; renderer: StatusHudRenderer; wsEvents: { subscribe(channel: 'character.delta', fn: (raw: unknown) => void): () => void }; containerName?: string; debounceMs?: number; heartbeatMs?: number }`
    - `export class StatusHudLayer implements Layer { readonly id = 'status-hud'; constructor(private readonly opts: StatusHudLayerOpts); async draw(): Promise<void>; destroy(): void }`
    - In constructor: subscribe to `wsEvents`, store unsubscribe fn. On every event payload: safeParse via CharacterSnapshotSchema (failure → log + return); cache snapshot; schedule debounced redraw (default 200 ms); start/reset heartbeat (default 30000 ms).
    - `draw()` renders current snapshot or renderLoading() if no snapshot received yet; calls `bridge.textContainerUpgrade({containerName: opts.containerName ?? 'status-hud', content: grid.toString()})`. Note: SDK class is `TextContainerUpgrade` from `@evenrealities/even_hub_sdk` — verify exact constructor signature in SDK index.d.ts at implementation time.
    - `destroy()` clears both timers + calls unsubscribe.
    - DOES NOT implement getCaptureContainer (omit the optional method entirely — per Layer interface, omission means render-only).

    **2. `packages/g2-app/src/status-hud/idle-infill-layer.ts`:**
    Module JSDoc citing ADR-0001 Amendment 1 (z=0.5), CONTEXT.md Area 1 (bundle atomic), UI-SPEC §z=0.5 Idle Content Infill Design Contract.

    Imports: `import type { EvenAppBridge } from '@evenrealities/even_hub_sdk'; import type { Layer } from '../engine/layer-types.js'`.

    Exports:
    - `export interface IdleInfillStats { mode: 'raster'|'glyph'; res: string; pipeline: string; bleKbps?: number; fpsObserved?: number }`
    - `export class IdleInfillLayer implements Layer { readonly id = 'idle-infill'; constructor(private readonly bridge: EvenAppBridge, private mode: 'raster'|'glyph' = 'raster'); async draw(): Promise<void>; setStats(stats: IdleInfillStats): void; setMode(mode: 'raster'|'glyph'): void; destroy(): void }`
    - `draw()` calls `bridge.textContainerUpgrade` for each of the 3 (raster) or 2 (glyph) containers per UI-SPEC §z=0.5 §Glyph mode degradation table.
    - Stats strip format string EXACTLY: `${mode} ${res} · ${pipeline} · BLE ${bleKbps ?? '—'}k · ${fpsObserved ?? '—'} fps · [Q] Quick` (truncate-and-pad to 40 chars per UI-SPEC §Stats strip format Max-width column).
    - `destroy()` is a no-op (containers removed by LayerManager.bundle in same rebuildPageContainer flush).

    **3. Six scene fixture files (hand-authored from UI-SPEC ASCII mockups):**

    For each fixture, copy the EXACT ASCII grid from UI-SPEC verbatim — character precision is INV-1's load-bearing contract. All fixtures are 96 chars wide × 24 rows tall (full G2 page) unless UI-SPEC specifies a sub-region.

    - `packages/shared-render/src/fixtures/glyph-scene.boot.txt` — UI-SPEC §Screen 1 Boot Splash (96×24 page with checklist all `[ ✓ ]` state).
    - `packages/shared-render/src/fixtures/glyph-scene.raster-idle.txt` — UI-SPEC §Screen 2 Default Raster (EN canonical strings + z=0.5 visible).
    - `packages/shared-render/src/fixtures/glyph-scene.raster-idle-it.txt` — Same layout as raster-idle but with IT longest strings substituted per UI-SPEC §Copywriting Contract: 'modo: ▶RASTER (toggle GLYPH)', 'TURNO 2/5', 'Condizioni', 'PF/CA/VEL/Az.'.
    - `packages/shared-render/src/fixtures/glyph-scene.raster-idle-en.txt` — Same as raster-idle.txt (EN canonical) — duplicate intentional per UI-SPEC §Fixture File Map (allows separate INV-1 ck 14 EN baseline).
    - `packages/shared-render/src/fixtures/glyph-scene.raster-idle-de.txt` — DE longest strings: 'Zustände' (10), 'Konzentr.' (10), 'TP/RK/GES/Akt'.
    - `packages/shared-render/src/fixtures/glyph-scene.glyph-idle.txt` — UI-SPEC §Screen 3 Glyph Mode (with `[GLY]` badge col 93-95 + glyph grid).

    Each fixture: trailing newline; uniform row width (96 chars); box-drawing chars verbatim from UI-SPEC §Glyph Dictionary; no trailing whitespace stripped (each row padded to 96).

    **4. Test files:**

    - `packages/g2-app/src/status-hud/__tests__/status-hud-layer.test.ts` — 7 tests matching SHL-1..SHL-7. Mock wsEvents as `{ subscribe: vi.fn().mockImplementation((channel, fn) => { stashedFn = fn; return vi.fn() /* unsubscribe */ }) }` and trigger via `stashedFn(payload)`.
    - `packages/g2-app/src/status-hud/__tests__/idle-infill-layer.test.ts` — 6 tests matching IIL-1..IIL-6.
    - **`packages/g2-app/src/status-hud/__tests__/snapshot.test.ts` (NEW per W-2):** 8 tests, each named `INV-1 ck NN ...`. Each `it()` block calls the renderer (or a `buildFullPageSnapshot` helper) for the corresponding scene state and matches the appropriate fixture file via `matchAsciiFixture`. The helper function `buildFullPageSnapshot(opts: { mode: 'raster'|'glyph'; locale: 'it'|'en'|'de'; snapshot?: CharacterSnapshot }): AsciiGrid` composes the full 96×24 page from the StatusHudRenderer's 28×21 card + the map area (glyph stub for ck 13, raster placeholder for ck 12) + z=0.5 idle strips. Use the AsciiGrid composition helpers from @evf/shared-render (or pure string concatenation if no helper exists; document the choice in 04a-04-SUMMARY.md). The `[GLY]` badge assertion in INV1-ck13 is a substring check on the rendered grid string: `expect(gridStr.split('\n')[20]?.slice(92, 96)).toBe('[GLY]')` — explicit cell verification beyond the fixture match.

    Constraints:
    - StatusHudLayer never captures input → no getCaptureContainer method. LayerManager will assert capture-invariant fails if Status HUD is the only mounted layer (per Plan 02 Test 3); a separate map-base-layer mount provides the capture container in real usage.
    - All Zod parsing is `.safeParse()`, never `.parse()`.
    - Fixture files MUST match UI-SPEC ASCII verbatim — any single character drift fails CI snapshot tests in Plan 05 + ongoing. If UI-SPEC layout has ambiguity (e.g., trailing spaces in a row), prefer trailing-space padding to declared width per AsciiGrid uniform-width rule.
    - JSDoc on every public export.
  </action>
  <verify>
    <automated>pnpm --filter @evf/g2-app test --run -- src/status-hud/__tests__/status-hud-layer.test.ts src/status-hud/__tests__/idle-infill-layer.test.ts src/status-hud/__tests__/snapshot.test.ts && test -f packages/shared-render/src/fixtures/glyph-scene.boot.txt && test -f packages/shared-render/src/fixtures/glyph-scene.raster-idle.txt && test -f packages/shared-render/src/fixtures/glyph-scene.raster-idle-it.txt && test -f packages/shared-render/src/fixtures/glyph-scene.raster-idle-en.txt && test -f packages/shared-render/src/fixtures/glyph-scene.raster-idle-de.txt && test -f packages/shared-render/src/fixtures/glyph-scene.glyph-idle.txt && grep -c 'implements Layer' packages/g2-app/src/status-hud/status-hud-layer.ts && grep -c 'implements Layer' packages/g2-app/src/status-hud/idle-infill-layer.ts && grep -c 'CharacterSnapshotSchema.safeParse' packages/g2-app/src/status-hud/status-hud-layer.ts && grep -c 'Condizioni' packages/shared-render/src/fixtures/glyph-scene.raster-idle-it.txt && grep -c 'Zustände' packages/shared-render/src/fixtures/glyph-scene.raster-idle-de.txt && grep -c '\[GLY\]' packages/shared-render/src/fixtures/glyph-scene.glyph-idle.txt && grep -cE 'INV-1 ck 1[12345]' packages/g2-app/src/status-hud/__tests__/snapshot.test.ts && pnpm typecheck && pnpm lint:ci</automated>
  </verify>
  <done>
    Three test files green (21 tests minimum: 7 SHL + 6 IIL + 8 snapshot-per-ck); all 6 scene fixture files exist; both classes implement Layer; status-hud-layer uses safeParse; IT fixture contains 'Condizioni'; DE fixture contains 'Zustände'; glyph fixture contains `[GLY]` badge literal; snapshot.test.ts contains all 5 ck markers (ck 11/12/13/14/15) — grep -cE matches >= 5 (W-2 closure verified); typecheck + lint:ci both exit 0.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| WS character.delta → status-hud-layer | Untrusted JSON crosses into renderer; must safeParse |
| Foundry i18n catalog → renderer | Translation strings may contain unicode pathologies |
| LayerManager bundle → IdleInfillLayer | Layer destroy is structural (containers removed by rebuildPageContainer); no individual teardown needed |
| tsc child process → adversarial fixture | B-1 adversarial test invokes tsc against a fixture; the fixture is intentionally bad source; production typecheck excludes it |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-4a-04-01 | T | status-hud-layer.ts WS delta receive | mitigate | CharacterSnapshotSchema.safeParse before forwarding to renderer; failure → log + ignore (no throw, no crash) |
| T-4a-04-02 | T | i18n string injection | mitigate | All HUD strings width-truncated to per-field budget with `…`; G2 firmware renders plain text; AsciiGrid uniform-width enforcement neutralizes zero-width and combining marks |
| T-4a-04-03 | D | Heartbeat timer leak on destroy | mitigate | destroy() clears debounceTimer + heartbeatTimer; unit-tested via vi.useFakeTimers + assert timer count = 0 |
| T-4a-04-04 | I | Status HUD displays character HP/conditions | accept | Player's own character data; already visible on phone-paired Foundry session; not a new disclosure surface |
| T-4a-04-05 | T | Adversarial fixture (budget-bust.fixture.ts) accidentally included in production build | mitigate | Add explicit `exclude` entry in `tsconfig.base.json` for the fixture path; CI's `pnpm typecheck` exits 0 only if exclusion is in place. Fixture path lives under `__tests__/fixtures/` which is already typically excluded from build via Vite + per-package tsconfig conventions. |
</threat_model>

<verification>
- `pnpm --filter @evf/g2-app test --run` exits 0 with 6 new test files green (~36 tests across Tasks 1-2)
- `pnpm typecheck && pnpm lint:ci` exit 0
- All 9 fixture files present in packages/shared-render/src/fixtures/
- StatusHudLayer + IdleInfillLayer both implement Layer interface (grep proves declaration)
- safeParse is the receive-side validation (not parse)
- IT fixture contains non-ASCII 'Condizioni'; DE fixture contains 'Zustände'; glyph fixture contains '[GLY]' literal
- `satisfies Record<string, WidthBudgetRow>` in i18n-budgets.ts is the build-time width-budget gate (proven by pnpm typecheck passing — if any IT/EN/DE string structurally invalid, the satisfies would fail)
- **B-1 closure: `i18n-budgets-adversarial.test.ts` spawns tsc and asserts non-zero exit + TS error code on the budget-bust.fixture.ts (proves CI catches budget violations adversarially, not just structurally)**
- **W-2 closure: `snapshot.test.ts` contains 5 named test blocks marked `INV-1 ck 11/12/13/14/15`; ck 12 and ck 13 each have dedicated matchAsciiFixture calls**
</verification>

<success_criteria>
Plan 04 closes when:
- DISP-01 fully addressed software-side: StatusHudLayer renders 5 fields (HP/AC/Speed/Conditions/Concentration) at z=1; INV-1 fixture status-hud-baseline + the 3 new status-hud.* fixtures lock the layout
- DISP-02 partially addressed (alongside Plan 02 runtime enforcement): StatusHudLayer + IdleInfillLayer prove the read-only layer pattern that LayerManager's capture-invariant test requires for multi-layer configurations
- DISP-03 fully addressed: 9 INV-1 fixtures committed; matchAsciiFixture tests pass; CI will catch any character drift; **W-2 per-ck tests close the gap where ck 12 and ck 13 had no dedicated assertion**
- I18N-04 fully addressed: HUD_WIDTH_BUDGETS const-as-truth + assertWithinBudget + the IT/EN/DE fixtures together prove width budget enforced at build time AND runtime; **B-1 adversarial test additionally proves CI catches budget-busting literals via tsc exit code**
- IdleInfillLayer is ready for Plan 05 to mount at ZIndex.Z0_5_IDLE_INFILL
- Plan 05 integration smoke can wire up StatusHudLayer + IdleInfillLayer + MapBaseLayer (from Plan 03) into a single boot → handshake → main HUD flow
</success_criteria>

<output>
After completion, create `.planning/phases/04a-g2-engine-raster-status-hud/04a-04-SUMMARY.md` capturing:
- Final HUD_WIDTH_BUDGETS table delivered (note any deviation from UI-SPEC §i18n table — particularly if DE non-ASCII chars triggered any encoding issue)
- Whether `pnpm typecheck` exited 0 with the `satisfies Record<string, WidthBudgetRow>` guard active (proves build-time gate works)
- **B-1 closure: which TS error code(s) the budget-bust.fixture.ts triggered (TS2322 / TS2741 / TS2769 / TS2353); whether the WidthFitsBudget brand pattern was implemented or the executor fell back to a structural-violation fixture; runtime cost of the adversarial test (target <30s)**
- StatusHudLayer debounce + heartbeat values (default 200 ms + 30 s per CONTEXT.md Area 3)
- Test counts per file (target: 5 i18n-budgets + 1 i18n-budgets-adversarial + 8 status-hud-renderer + 7 status-hud-layer + 6 idle-infill-layer + 8 snapshot = 35 minimum)
- **W-2 closure: snapshot.test.ts ck name list with their fixture mappings; whether buildFullPageSnapshot helper was created or string concat was used**
- All 9 fixture file paths + INV-1 ck mappings (ck 11 status-hud overflows; ck 12 raster-idle; ck 13 glyph + [GLY] badge; ck 14 i18n stress; ck 15 loading)
- Any character-drift surprises during fixture hand-authoring (which characters from UI-SPEC required Unicode escapes in source files vs raw UTF-8)
</output>
