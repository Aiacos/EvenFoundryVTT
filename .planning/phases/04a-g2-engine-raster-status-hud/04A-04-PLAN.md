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
  - packages/g2-app/src/status-hud/__tests__/status-hud-layer.test.ts
  - packages/g2-app/src/status-hud/__tests__/idle-infill-layer.test.ts
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
requirements: [DISP-01, DISP-03, I18N-04]
user_setup: []
tags: [g2-app, status-hud, i18n, inv-1, fixtures, idle-infill, wave-2]
must_haves:
  truths:
    - "Status HUD renders HP / AC / Speed / Conditions / Concentration as 5-line corner card at col 68-95 (28 char wide), always visible at z=1, never captures input"
    - "Width budget table HUD_WIDTH_BUDGETS enforces IT/EN/DE max per field at TYPE level (TypeScript satisfies guard) AND runtime (assertWithinBudget)"
    - "Missing scalar data renders as `—` (em-dash U+2014); loading state renders as `…` (ellipsis U+2026); never collapses column width"
    - "9 ASCII fixtures committed in packages/shared-render/src/fixtures/ matching UI-SPEC §Phase 4a Screen Inventory + §Fixture File Map"
    - "matchAsciiFixture snapshot tests pass for status-hud.loading.txt, status-hud.hp-overflow.txt, status-hud.conditions-overflow.txt, glyph-scene.raster-idle-it.txt, glyph-scene.raster-idle-en.txt, glyph-scene.raster-idle-de.txt"
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

Purpose: This plan closes DISP-01 (HUD persistente), DISP-03 (INV-1 ck 11-15 snapshot fixtures), and I18N-04 (per-key width budget + EN fallback). It runs in parallel with Plan 03 (raster) because files_modified do not overlap — Plan 03 owns `packages/g2-app/src/raster/*`, Plan 04 owns `packages/g2-app/src/status-hud/*` plus the 9 fixture files under `packages/shared-render/src/fixtures/`.

Output: 4 source modules + 4 test files + 9 INV-1 fixture text files. StatusHudLayer implements the Layer interface and is mountable at ZIndex.Z1_STATUS_HUD. IdleInfillLayer is mountable at ZIndex.Z0_5_IDLE_INFILL. All 9 fixtures are character-perfect copies of the UI-SPEC ASCII mockups, ready for Plan 05 integration smoke + ongoing CI snapshot drift detection.
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
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: i18n-budgets + status-hud-renderer (TDD with INV-1 fixtures)</name>
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
  </read_first>
  <files>packages/g2-app/src/status-hud/i18n-budgets.ts, packages/g2-app/src/status-hud/status-hud-renderer.ts, packages/g2-app/src/status-hud/__tests__/i18n-budgets.test.ts, packages/g2-app/src/status-hud/__tests__/status-hud-renderer.test.ts, packages/shared-render/src/fixtures/status-hud.loading.txt, packages/shared-render/src/fixtures/status-hud.hp-overflow.txt, packages/shared-render/src/fixtures/status-hud.conditions-overflow.txt</files>
  <behavior>
    i18n-budgets:
    - Test IB-1: HUD_WIDTH_BUDGETS.hp_label.it === 'PF' && .en === 'HP' && .de === 'TP' && .max === 2 (verbatim from UI-SPEC table)
    - Test IB-2: HUD_WIDTH_BUDGETS.conditions_section.de === 'Zustände' && .max === 10
    - Test IB-3: All keys in HUD_WIDTH_BUDGETS satisfy `WidthBudgetRow` shape (compile-time `satisfies` guard means TypeScript build fails if any locale string exceeds max — verifiable at unit-test time as the source compiles)
    - Test IB-4: `assertWithinBudget('Condiz...', 'conditions_section')` does NOT throw (under budget); `assertWithinBudget('ConditionsLong', 'conditions_section')` warns via console.warn (over budget but length 14 > 10)
    - Test IB-5: A `getLabel(field, locale)` helper (if implemented) returns the per-locale string for the budget table key

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
    Implement two source modules + 2 test files + 3 status-hud fixture files in this task. The fixtures are authored by hand from UI-SPEC §Status HUD Design Contract — they are the contract, not generated from the renderer.

    **1. `packages/g2-app/src/status-hud/i18n-budgets.ts`:**
    Module JSDoc citing CONTEXT.md Area 3 + UI-SPEC §i18n Width Budget table.

    Exports:
    - `export interface WidthBudgetRow { it: string; en: string; de: string; max: number }`
    - `export const HUD_WIDTH_BUDGETS = { ... } as const satisfies Record<string, WidthBudgetRow>` — populated VERBATIM from UI-SPEC §i18n Width Budget table (hp_label, ac_label, speed_label, conditions_section, concentration, slots_section, move_label, act_label, bns_label; copy every value letter-for-letter including non-ASCII `Zustände`). The `satisfies` clause is the build-time gate per CONTEXT.md Area 3 (CI fails if any IT/EN/DE string exceeds max).
    - `export function assertWithinBudget(value: string, field: keyof typeof HUD_WIDTH_BUDGETS): void` — if `value.length > HUD_WIDTH_BUDGETS[field].max` → console.warn(`[EVF] i18n-budgets: '${field}' exceeded budget ${budget}: "${value}"`). Per PATTERNS.md §i18n-budgets.ts — no throw at runtime (truncate-and-warn policy).
    - `export function getLabel(field: keyof typeof HUD_WIDTH_BUDGETS, locale: 'it'|'en'|'de'): string` — returns per-locale string.

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

    Test file: `packages/g2-app/src/status-hud/__tests__/status-hud-renderer.test.ts` — write the 8 tests first matching `<behavior>` (RED phase). Use `matchAsciiFixture(grid, '../../../../shared-render/src/fixtures/status-hud.loading.txt')` — the 4-dirs-up path is correct for this test file location per PATTERNS.md §Fixture path offset table.

    Test file: `packages/g2-app/src/status-hud/__tests__/i18n-budgets.test.ts` — 5 tests matching IB-1..IB-5.

    Constraints:
    - All snapshots in CharacterSnapshot are processed through `safeParse` upstream (Task 2's StatusHudLayer); the renderer assumes its input is already valid `CharacterSnapshot`.
    - INV-4 JSDoc on every export.
    - No `// TODO` without `(#issue)` or `(ADR-NNNN)` — if a field is unknown, document with `// TODO(ADR-0009): clarify ...` and a follow-up note.
  </action>
  <verify>
    <automated>pnpm --filter @evf/g2-app test --run -- src/status-hud/__tests__/status-hud-renderer.test.ts src/status-hud/__tests__/i18n-budgets.test.ts && test -f packages/shared-render/src/fixtures/status-hud.loading.txt && test -f packages/shared-render/src/fixtures/status-hud.hp-overflow.txt && test -f packages/shared-render/src/fixtures/status-hud.conditions-overflow.txt && grep -c 'PF' packages/g2-app/src/status-hud/i18n-budgets.ts && grep -c 'Zustände' packages/g2-app/src/status-hud/i18n-budgets.ts && grep -c 'satisfies Record' packages/g2-app/src/status-hud/i18n-budgets.ts && grep -c '—' packages/g2-app/src/status-hud/status-hud-renderer.ts && pnpm typecheck</automated>
  </verify>
  <done>
    Both test files green (13 tests minimum); 3 status-hud fixture files exist; i18n-budgets.ts contains the verbatim IT label `PF`, the DE non-ASCII string `Zustände`, and the `satisfies Record` build-time gate; renderer uses em-dash `—`; pnpm typecheck exits 0 (which is the second proof that the `satisfies` budget gate compiles).
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: StatusHudLayer + IdleInfillLayer + 6 scene fixtures (Layer wiring + INV-1)</name>
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
  </read_first>
  <files>packages/g2-app/src/status-hud/status-hud-layer.ts, packages/g2-app/src/status-hud/idle-infill-layer.ts, packages/g2-app/src/status-hud/__tests__/status-hud-layer.test.ts, packages/g2-app/src/status-hud/__tests__/idle-infill-layer.test.ts, packages/shared-render/src/fixtures/glyph-scene.boot.txt, packages/shared-render/src/fixtures/glyph-scene.raster-idle.txt, packages/shared-render/src/fixtures/glyph-scene.raster-idle-it.txt, packages/shared-render/src/fixtures/glyph-scene.raster-idle-en.txt, packages/shared-render/src/fixtures/glyph-scene.raster-idle-de.txt, packages/shared-render/src/fixtures/glyph-scene.glyph-idle.txt</files>
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
  </behavior>
  <action>
    Implement two source modules + 2 test files + 6 scene fixture files.

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

    Test file: `packages/g2-app/src/status-hud/__tests__/status-hud-layer.test.ts` — 7 tests matching SHL-1..SHL-7. Mock wsEvents as `{ subscribe: vi.fn().mockImplementation((channel, fn) => { stashedFn = fn; return vi.fn() /* unsubscribe */ }) }` and trigger via `stashedFn(payload)`.

    Test file: `packages/g2-app/src/status-hud/__tests__/idle-infill-layer.test.ts` — 6 tests matching IIL-1..IIL-6.

    Constraints:
    - StatusHudLayer never captures input → no getCaptureContainer method. LayerManager will assert capture-invariant fails if Status HUD is the only mounted layer (per Plan 02 Test 3); a separate map-base-layer mount provides the capture container in real usage.
    - All Zod parsing is `.safeParse()`, never `.parse()`.
    - Fixture files MUST match UI-SPEC ASCII verbatim — any single character drift fails CI snapshot tests in Plan 05 + ongoing. If UI-SPEC layout has ambiguity (e.g., trailing spaces in a row), prefer trailing-space padding to declared width per AsciiGrid uniform-width rule.
    - JSDoc on every public export.
  </action>
  <verify>
    <automated>pnpm --filter @evf/g2-app test --run -- src/status-hud/__tests__/status-hud-layer.test.ts src/status-hud/__tests__/idle-infill-layer.test.ts && test -f packages/shared-render/src/fixtures/glyph-scene.boot.txt && test -f packages/shared-render/src/fixtures/glyph-scene.raster-idle.txt && test -f packages/shared-render/src/fixtures/glyph-scene.raster-idle-it.txt && test -f packages/shared-render/src/fixtures/glyph-scene.raster-idle-en.txt && test -f packages/shared-render/src/fixtures/glyph-scene.raster-idle-de.txt && test -f packages/shared-render/src/fixtures/glyph-scene.glyph-idle.txt && grep -c 'implements Layer' packages/g2-app/src/status-hud/status-hud-layer.ts && grep -c 'implements Layer' packages/g2-app/src/status-hud/idle-infill-layer.ts && grep -c 'CharacterSnapshotSchema.safeParse' packages/g2-app/src/status-hud/status-hud-layer.ts && grep -c 'Condizioni' packages/shared-render/src/fixtures/glyph-scene.raster-idle-it.txt && grep -c 'Zustände' packages/shared-render/src/fixtures/glyph-scene.raster-idle-de.txt && grep -c '\[GLY\]' packages/shared-render/src/fixtures/glyph-scene.glyph-idle.txt && pnpm typecheck && pnpm lint:ci</automated>
  </verify>
  <done>
    Both test files green (13 tests minimum); all 6 scene fixture files exist; both classes implement Layer; status-hud-layer uses safeParse; IT fixture contains 'Condizioni'; DE fixture contains 'Zustände'; glyph fixture contains `[GLY]` badge literal; typecheck + lint:ci both exit 0.
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

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-4a-04-01 | T | status-hud-layer.ts WS delta receive | mitigate | CharacterSnapshotSchema.safeParse before forwarding to renderer; failure → log + ignore (no throw, no crash) |
| T-4a-04-02 | T | i18n string injection | mitigate | All HUD strings width-truncated to per-field budget with `…`; G2 firmware renders plain text; AsciiGrid uniform-width enforcement neutralizes zero-width and combining marks |
| T-4a-04-03 | D | Heartbeat timer leak on destroy | mitigate | destroy() clears debounceTimer + heartbeatTimer; unit-tested via vi.useFakeTimers + assert timer count = 0 |
| T-4a-04-04 | I | Status HUD displays character HP/conditions | accept | Player's own character data; already visible on phone-paired Foundry session; not a new disclosure surface |
</threat_model>

<verification>
- `pnpm --filter @evf/g2-app test --run` exits 0 with 4 new test files green (~26 tests across Tasks 1-2)
- `pnpm typecheck && pnpm lint:ci` exit 0
- All 9 fixture files present in packages/shared-render/src/fixtures/
- StatusHudLayer + IdleInfillLayer both implement Layer interface (grep proves declaration)
- safeParse is the receive-side validation (not parse)
- IT fixture contains non-ASCII 'Condizioni'; DE fixture contains 'Zustände'; glyph fixture contains '[GLY]' literal
- `satisfies Record<string, WidthBudgetRow>` in i18n-budgets.ts is the build-time width-budget gate (proven by pnpm typecheck passing — if any IT/EN/DE string exceeded max, the satisfies would fail)
</verification>

<success_criteria>
Plan 04 closes when:
- DISP-01 fully addressed software-side: StatusHudLayer renders 5 fields (HP/AC/Speed/Conditions/Concentration) at z=1; INV-1 fixture status-hud-baseline + the 3 new status-hud.* fixtures lock the layout
- DISP-03 fully addressed: 9 INV-1 fixtures committed; matchAsciiFixture tests pass; CI will catch any character drift
- I18N-04 fully addressed: HUD_WIDTH_BUDGETS const-as-truth + assertWithinBudget + the IT/EN/DE fixtures together prove width budget enforced at build time AND runtime
- IdleInfillLayer is ready for Plan 05 to mount at ZIndex.Z0_5_IDLE_INFILL
- Plan 05 integration smoke can wire up StatusHudLayer + IdleInfillLayer + MapBaseLayer (from Plan 03) into a single boot → handshake → main HUD flow
</success_criteria>

<output>
After completion, create `.planning/phases/04a-g2-engine-raster-status-hud/04a-04-SUMMARY.md` capturing:
- Final HUD_WIDTH_BUDGETS table delivered (note any deviation from UI-SPEC §i18n table — particularly if DE non-ASCII chars triggered any encoding issue)
- Whether `pnpm typecheck` exited 0 with the `satisfies Record<string, WidthBudgetRow>` guard active (proves build-time gate works)
- StatusHudLayer debounce + heartbeat values (default 200 ms + 30 s per CONTEXT.md Area 3)
- Test counts per file (target: 5 i18n-budgets + 8 status-hud-renderer + 7 status-hud-layer + 6 idle-infill-layer = 26 minimum)
- All 9 fixture file paths + INV-1 ck mappings (ck 11 status-hud overflows; ck 12 raster-idle; ck 13 glyph; ck 14 i18n stress; ck 15 loading)
- Any character-drift surprises during fixture hand-authoring (which characters from UI-SPEC required Unicode escapes in source files vs raw UTF-8)
</output>
