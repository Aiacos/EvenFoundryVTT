---
phase: 16-sheet-ability-scores-main-tab-data-wiring
plan: 03
subsystem: g2-app + shared-render
tags: [renderer, g2-app, inv-1-fixture-update, inv-3-atomic-ratification, tdd]
requirements: [SHEET-07]
status: complete
completed: 2026-05-18
duration_minutes: ~45
commits:
  red:           0265d22  # test(16-03): CSTR-MAIN-AB tests + 11 snapshot literals extended
  green:         170bdc4  # feat(g2-app): formatAbility helpers + renderMainTab data binding
  fixtures:      e8e7da0  # fix(shared-render): 4 INV-1 fixtures byte-updated
  ratification:  d68d7f2  # docs(phase-16): INV-3 atomic close (STATE+ROADMAP+REQ+VERIFICATION)
artifacts:
  created:
    - packages/g2-app/src/panels/character-sheet-tab-renderers.ts:95   # formatAbilityValue helper
    - packages/g2-app/src/panels/character-sheet-tab-renderers.ts:115  # formatAbilityMod helper
    - .planning/phases/EVF-16-sheet-ability-scores-main-tab-data-wiring/16-VERIFICATION.md
    - .planning/phases/EVF-16-sheet-ability-scores-main-tab-data-wiring/16-03-SUMMARY.md  # this file
  modified:
    - packages/g2-app/src/panels/character-sheet-tab-renderers.ts            # renderMainTab data binding rows 9-14
    - packages/g2-app/src/panels/__tests__/character-sheet-tab-renderers.test.ts  # snapshot2014/snapshot2024 abilities + 9 CSTR-MAIN-AB tests
    - packages/shared-render/src/fixtures/sheet.main.2014.it.txt             # CSTR consumer (Thorin)
    - packages/shared-render/src/fixtures/sheet.main.2024.it.txt             # CSTR consumer (Thorin + [M])
    - packages/shared-render/src/fixtures/sheet.main.2014.en.txt             # PSM consumer (BASE zero-default)
    - packages/shared-render/src/fixtures/sheet.main.2014.de.txt             # PSM consumer (BASE zero-default)
    - 11 downstream test files                                                # CharacterSnapshot literal extensions
    - .planning/STATE.md
    - .planning/ROADMAP.md
    - .planning/REQUIREMENTS.md
metrics:
  tests_added: 9                  # CSTR-MAIN-AB-1a..5
  tests_passing_workspace: 2648   # was 2559 Phase 15 baseline → +89 net Phase 16
  inv_1_fixtures_updated: 4
  snapshot_literal_fixups: 11     # across 11 test files in g2-app + bridge + foundry-mcp
  helper_loc_added: ~25           # formatAbilityValue + formatAbilityMod combined
gate_evidence:
  WAVE-16-03-G1: pass    # Three task commits exist in git log (0265d22 RED + 170bdc4 GREEN + e8e7da0 fixtures + d68d7f2 INV-3)
  WAVE-16-03-G2: pass    # CSTR-MAIN-AB-1a..5 all pass; 0 failures
  WAVE-16-03-G3: pass    # pnpm test 2648/2648 passing; 0 failures
  WAVE-16-03-G4: pass    # All 4 fixtures 18 rows × 66 code-points (verified [...str].length)
  WAVE-16-03-G5: pass    # git diff HEAD~3..HEAD shows ONLY rows 10-15 changed in fixtures (rows 0-8 + 13-17 byte-identical)
  WAVE-16-03-G6: pass    # grep -c 'socketlib.registerComplexHandler' = 17 (CI Gate 8 preserved)
  WAVE-16-03-G7: pass    # git log -1 --name-only HEAD lists STATE.md + ROADMAP.md + REQUIREMENTS.md + 16-VERIFICATION.md (4 files)
  WAVE-16-03-G8: pass    # No package install / no socketlib handler / no write-path added across the 3 plans
  WAVE-16-03-G9: pass    # Specs.md + README.md + docs/showcase NOT touched in Phase 16
---

# Phase 16 Plan 03: g2-app renderer data binding + 4 INV-1 fixtures + INV-3 atomic close — Summary

**One-liner:** Wires the consumer half of SHEET-07 — `formatAbilityValue`/
`formatAbilityMod` pure helpers + `renderMainTab` consumes
`snapshot.abilities.<k>.{value, mod, save, proficient}` replacing 14 cells
of em-dash placeholder with real data + 4 INV-1 fixtures byte-updated for IT
(Thorin canonical) and EN/DE (BASE zero-default) consumer-snapshot identity
+ single INV-3 atomic ratification commit closing Phase 16 (3/3 plans) per
Phase 14 `3a0c5cf` + Phase 15 `dc161d6` precedent.

## What was built

Four atomic commits closed Plan 16-03 — RED for the renderer's 9 new tests,
GREEN for the helpers + data binding, fixtures byte-update via tsx-generated
re-emission, and the INV-3 atomic ratification touching STATE.md +
ROADMAP.md + REQUIREMENTS.md + 16-VERIFICATION.md.

| Step | Commit | What | Tests state |
|------|--------|------|-------------|
| RED            | `0265d22` | 9 failing CSTR-MAIN-AB-* + Thorin canonical spread on snapshot2014/snapshot2024 + 11 minimal-abilities extensions on downstream CharacterSnapshot literals (g2-app + bridge + foundry-mcp) | 9 fails (new CSTR-MAIN-AB-*); 2639 pass (8 schema-validation atomic-extension-gap failures from Plan 16-02 now closed) |
| GREEN          | `170bdc4` | formatAbilityValue (right-align 2-cell) + formatAbilityMod (signed 2-cell) + renderMainTab rows 9-14 data binding + data-driven `profGlyph(prof)` glyph + 11 more snapshot-literal abilities extensions (caught by `tsc --noEmit` workspace-wide typecheck) | 9 CSTR-MAIN-AB pass; 4 fixture round-trips RED (Task 2 gate); 2644/2648 pass |
| FIXTURES       | `e8e7da0` | 4 INV-1 fixtures generated via one-shot tsx script invoking real `renderMainTab`; IT fixtures use Thorin CSTR consumer (tempHp:10), EN/DE use BASE PSM consumer (tempHp:0) preserving pre-Phase-16 row-6 HP-bar byte-identity | All 4 round-trips green; workspace 2648/2648 pass |
| INV-3 ATOMIC   | `d68d7f2` | STATE.md frontmatter + Current Position + Recent Trend + 7 new D-Area-1..4 decisions · ROADMAP.md Phase 16 ✓ + v0.9.13 progress 3/~7 · REQUIREMENTS.md SHEET-05/06/07 → Resolved · 16-VERIFICATION.md created (5/5 SC + 3/3 REQ verified + ADR-0005 Branch A carry-forward note) — single commit per Phase 14/15 precedent | 2648/2648 stable; typecheck + lint exit 0 |

### Format helpers (UI-SPEC §3)

Two pure functions added to `character-sheet-tab-renderers.ts` between
`truncateUnicode` and the dispatcher:

```typescript
/** Right-align value in 2-cell field: 8 → ' 8', 16 → '16'. Defensive '??' for n > 99. */
export function formatAbilityValue(n: number): string;

/** Always-signed 2-cell mod: +3 → '+3', -1 → '-1', 0 → '+0'. ASCII '-' (U+002D). */
export function formatAbilityMod(n: number): string;
```

Both have JSDoc citing UI-SPEC §3 (format helpers) + threat-model
T-16-03-T mitigation (defensive `'??'` for out-of-range; schema clamps
upstream so unreachable in practice). The mod helper uses ASCII
`U+002D` (NOT Unicode `U+2212 MINUS SIGN`) to match the existing dash
convention and avoid rendering ambiguity on G2's VFD-style display
(CSTR-MAIN-AB-1d explicitly asserts `charCodeAt(0) === 0x2d`).

### renderMainTab rows 9-14 (data binding)

| Row | Pre-Phase-16 | Phase 16 | Width budget |
|-----|--------------|----------|--------------|
| 9 abilities | `│ FOR  —  —          │` | `│ FOR 16 +3          │` | 22 cells (1-cell label-value gap, 2-cell mod, 10 trailing) |
| 9 saves     | `│ ◉ FOR  —    DES  — │` | `│ ◉ FOR  +5  DES  +2 │` | 22 cells (2-cell inter-column gap, was 4-cell) |
| 10..12      | Same pattern + `◉ COS`/`  SAG` hardcoded | `${profGlyph(prof)} LBL  ${formatAbilityMod(save)}` data-driven | 22 cells preserved |
| 13..14      | Em-dash only (no saves) | `${formatAbilityValue(val)} ${formatAbilityMod(mod)}` | 22 cells preserved |

The 2-cell inter-column gap on saves-row (vs pre-Phase-16's 4-cell gap)
absorbs the net +2-cell growth from each `—` (1-cell) becoming `+N`/`-N`
(2-cell). The proficient-glyph column (col 3) is now data-driven from
`abilities.<k>.proficient`; pre-Phase-16 had hardcoded `◉ STR ◉ CON
WIS (blank)`. With Thorin's Fighter prof spread the rendered glyphs land
exactly as Phase 5 had them, but for any other character profile (or a
different ruleset) the renderer now reflects reality (CSTR-MAIN-AB-4a
verifies WIS not-prof → `○` was visually blank pre-Phase-16).

### CSTR-MAIN-AB-1..5 test coverage

| Test | Asserts |
|------|---------|
| CSTR-MAIN-AB-1a | `formatAbilityValue(8)` = `' 8'`, `(0)` = `' 0'`, `(9)` = `' 9'` (single-digit right-align) |
| CSTR-MAIN-AB-1b | `formatAbilityValue(10)` = `'10'`, `(16)` = `'16'`, `(21)` = `'21'`, `(30)` = `'30'` (two-digit verbatim) |
| CSTR-MAIN-AB-1c | `formatAbilityMod(0)` = `'+0'`, `(3)` = `'+3'`, `(9)` = `'+9'` (signed positives + zero) |
| CSTR-MAIN-AB-1d | `formatAbilityMod(-1)` = `'-1'`, `(-5)` = `'-5'`; `charCodeAt(0) === 0x2d` (ASCII hyphen-minus, NOT U+2212) |
| CSTR-MAIN-AB-2  | STR row binds `FOR 16 +3` AND `◉ FOR  +5` (IT locale); em-dash placeholder removed |
| CSTR-MAIN-AB-3  | CHA negative mod binds `CAR  8 -1` (ability row) AND `CAR  -1` (save row) |
| CSTR-MAIN-AB-4a | WIS not-prof emits `○ SAG  +1` (was hardcoded blank pre-Phase-16) |
| CSTR-MAIN-AB-4b | DEX save +2 emits `DES  +2` on STR/DEX save row (IT) |
| CSTR-MAIN-AB-5  | EN locale parity: `STR 16 +3` + `◉ STR  +5` + `CHA  8 -1` |

All 9 CSTR-MAIN-AB tests pass. CSTR-MAIN-WIDTH (pre-Phase-16 invariant
test) continues to pass — every row exactly 66 code-points. CSTR-HOT-SWAP
still passes — only row 1 differs between 2014 and 2024 ([M] flag).
CSTR-DISP-NULL still passes — null snapshot returns 18 blank rows
(defensive guard precedes helper calls).

### 4 INV-1 fixtures byte-updated

| Fixture | Consumer | Snapshot identity | Generation |
|---------|----------|-------------------|------------|
| `sheet.main.2014.it.txt` | CSTR-FIX-MAIN-2014 | snapshot2014 (Thorin: STR 16/+3/+5 prof, DEX 14/+2/+2, CON 14/+2/+5 prof, INT 18/+4/+4, WIS 12/+1/+1, CHA 8/-1/-1, tempHp:10) | `renderMainTab(snapshot2014, 'it')` |
| `sheet.main.2024.it.txt` | CSTR-FIX-MAIN-2024 | snapshot2024 = `{...snapshot2014, world: {modernRules: true}}` | `renderMainTab(snapshot2024, 'it')` |
| `sheet.main.2014.en.txt` | PSM-FIX-EN-MAIN | BASE_CHARACTER_SNAPSHOT (zero-default abilities all 10/+0/+0 ○, tempHp:0) | `renderMainTab(BASE, 'en')` |
| `sheet.main.2014.de.txt` | PSM-FIX-DE-MAIN | Same BASE | `renderMainTab(BASE, 'de')` |

EN/DE consumer-snapshot choice keeps row-6 HP-bar byte-identical to
pre-Phase-16 (no `+10 temp` suffix); IT consumer-snapshot retains the
`+10 temp` byte that Phase 5 already shipped. `git diff HEAD~1` on each
fixture shows changes ONLY in rows 10-15 (1-indexed) abilities/saves
block; rows 0-8 + 13-17 byte-identical to pre-Phase-16.

Fixture generation method: one-shot `packages/g2-app/scripts/
generate-main-fixtures.ts` invoked the actual `renderMainTab` exported
from g2-app and wrote the joined 18-row output verbatim to disk (Phase 5
Plan 05-04 precedent — fixtures generated by running real renderers,
never hand-authored). Script DELETED post-generation; no developer-
utility tooling shipped with the commit.

### Width invariant verification

```bash
$ node -e "for (const f of [...]) { for (let i=0;i<18;i++) if ([...lines[i]].length !== 66) ... }"
sheet.main.2014.it.txt: all 18 rows = 66 code-points
sheet.main.2024.it.txt: all 18 rows = 66 code-points
sheet.main.2014.en.txt: all 18 rows = 66 code-points
sheet.main.2014.de.txt: all 18 rows = 66 code-points
```

All 4 fixtures × 18 rows × 66 code-points (INV-1 invariant) preserved.

### 11 downstream snapshot-literal fixups

The atomic-extension-gap inherited from Plan 16-02 (`abilities` REQUIRED
on CharacterSnapshotSchema since `e13136b`) cascades into 17 workspace
tests that constructed `CharacterSnapshot` literals without the new
field. Plan 16-03 closes these via inlined zero-default abilities
literals (`value: 10, mod: 0, save: 0, proficient: false, dc: 10` × 6
keys) on the affected snapshot literals:

| File | Use |
|------|-----|
| `packages/g2-app/src/panels/__tests__/character-sheet-tab-renderers.test.ts` | snapshot2014 (Thorin canonical) — used by CSTR-FIX-* |
| `packages/g2-app/src/panels/__tests__/inventory-panel.test.ts` | snapshot2014 (inventory-test contextual) |
| `packages/g2-app/src/panels/__tests__/spellbook-panel.test.ts` | snapshotCaster + snapshotHalfCaster + snapshotWithSpell (3 literals) |
| `packages/g2-app/src/panels/__tests__/character-sheet-panel.test.ts` | mockSnapshot ×2 + bioSnapshot (3 literals) |
| `packages/g2-app/src/status-hud/__tests__/status-hud-layer.test.ts` | VALID_SNAPSHOT |
| `packages/g2-app/src/status-hud/__tests__/snapshot.test.ts` | IDLE_SNAPSHOT |
| `packages/g2-app/src/status-hud/__tests__/status-hud-renderer.test.ts` | makeSnapshot + makeDeathSnapshot (2 factory functions) |
| `packages/g2-app/src/__tests__/04b-integration-smoke.test.ts` | BASE_SNAPSHOT |
| `packages/g2-app/src/__tests__/scene-renderer-smoke.test.ts` | inline WS character.delta payload |
| `packages/g2-app/src/__tests__/05-panel-integration-smoke.test.ts` | BASE_CHARACTER_SNAPSHOT |
| `packages/g2-app/src/__tests__/13-integration-smoke.test.ts` | inline panel.onSnapshot ×3 (3 literals) |
| `packages/g2-app/src/__tests__/example-status-hud.test.ts` | IDLE_SNAPSHOT |
| `packages/g2-app/src/__tests__/sync-lost-chip.test.ts` | IDLE_SNAPSHOT |
| `packages/bridge/src/server.test.ts` | mockSnapshot |
| `packages/foundry-mcp/src/resources/ws-subscription.test.ts` | makeCharacterPayload |
| `packages/foundry-mcp/src/resources/resource-cache.test.ts` | makeSnapshot |
| `packages/foundry-mcp/src/resources/register-resources.test.ts` | makeSnapshot |

The total surface touched is 16+ files (11 distinct file paths; some
file paths have multiple literals to extend). Workspace `pnpm test`
ends Phase 16 at 2648/2648 passing.

### CI Gate 8 evidence

```bash
$ grep -c 'socketlib.registerComplexHandler' packages/foundry-module/src/pair/socketlib-handlers.ts
17
```

Phase 16 introduces **zero new socketlib handlers**. The handler count of
17 (established at v0.9.12 close) is preserved end-to-end. Both Plan 16-02
(reader) and Plan 16-03 (renderer + fixtures) are read-path-only — no
write surface, no GM-side `executeAsGM` plumbing added.

## Deviations from plan

### 1. Snapshot-literal fixup scope (Rule 3 auto-fix — blocking typecheck across packages)

The plan's Task 1 step (e) called for extending only `snapshot2014` and
`snapshot2024` in `character-sheet-tab-renderers.test.ts`. However, when
the workspace-wide `pnpm typecheck` ran during the GREEN phase, 11+
additional CharacterSnapshot literals across g2-app + bridge + foundry-mcp
test files surfaced as TS2741 errors (Property 'abilities' is missing) —
because Plan 16-01 (`e13136b`) made `abilities` REQUIRED on the schema,
and TypeScript's structural typing flows through all consumer test files.

Per deviation Rule 3 (blocking typecheck): extended each literal inline
with zero-default abilities (`value: 10, mod: 0, save: 0, proficient:
false, dc: 10` × 6 keys). This is the cleanest possible fix — no shared
test helper or factory introduced, each literal stays self-contained, and
the diff per literal is exactly the 6-line block. Total LOC added: ~10
lines × 17 literals = ~170 lines of test fixture extension.

The plan's `<files>` list named only 2 files; the actual touched-file
count is 11 + 1 (renderer source) + 1 (renderer test) = 13 production +
test code paths. Documented here for traceability; the fixup is a direct
consequence of Plan 16-01's atomic REQUIRED-field decision and was
expected (Plan 16-02 SUMMARY enumerated 17 anticipated failures).

### 2. Fixture generation script created and deleted (clean Phase close)

Plan Task 2 step (2) allowed creating `scripts/generate-main-fixtures.ts`
either as a one-shot or kept as a developer utility. Created it under
`packages/g2-app/scripts/` (mirroring the package's structure; isolates
the tsx-import path from the workspace root); ran it via `pnpm exec tsx`;
DELETED post-generation. No developer-utility tooling shipped with the
commit — keeps the diff clean and signals that fixture generation is a
one-shot byte-update, not a CI step.

### 3. EN/DE fixture consumer-snapshot identity drift correction

The plan's Task 2 done criterion calls for "Rows 0-8 + 13-17 byte-
identical to pre-Plan-16 fixtures". The initial fixture generation used
`snapshot2014` (CSTR consumer, tempHp:10) for all 4 fixtures, which
changed row 6 (HP bar) in EN/DE to include `+10 temp` — a byte-deviation
outside the abilities/saves block.

Root cause: PSM-FIX-EN-MAIN + PSM-FIX-DE-MAIN consume the EN/DE fixtures
via `BASE_CHARACTER_SNAPSHOT` (tempHp:0, zero-default abilities), NOT
`snapshot2014`. The pre-Phase-16 fixtures were generated with PSM
consumer identity. Updated the generator to use snapshot identity
matching each fixture's consumer; re-ran; verified `git diff` shows ONLY
rows 10-15 changed in all 4 fixtures. Result: Thorin canonical numbers
land in IT fixtures (CSTR consumer), zero-default `10 +0` numbers land
in EN/DE fixtures (PSM consumer). Both round-trip tests pass.

Documented here for transparency; this is consumer-snapshot identity
discipline (each fixture's tempHp + abilities byte-values come from the
consumer snapshot, not a single canonical snapshot).

### 4. Specs.md NOT bumped (intentional; Phase 18 milestone-close scope)

Plan correctly anticipated this (`CONTEXT §Claude's Discretion`: "defer
milestone-close bump to Phase 18 per ROADMAP convention 'atomic per
phase, milestone-close bump in Phase 18'"). README.md + showcase NOT
touched either — those are cross-cutting milestone-close artifacts;
Phase 18 will handle Specs.md v0.9.12 → v0.9.13 + README hardware badge
bump + showcase stat strip update + INV-3 milestone-close commit.

## Known stubs

None. This plan wires real ability data end-to-end (schema → reader →
renderer → fixtures). No placeholder data introduced; no UI element
left rendering hardcoded sample data.

## Threat surface

No new threat surface introduced. Per plan `<threat_model>`:

- All STRIDE categories `accept` except T-16-03-T (Tampering) and
  T-16-03-D (DoS), both `mitigate` and landed as planned:
  - **T-16-03-T**: `formatAbilityValue` returns `'??'` for `n < 0`,
    `n > 99`, or non-finite (NaN, Infinity); `formatAbilityMod` returns
    `'??'` for non-finite. Schema clamps upstream (`value 0..30`) so the
    guards are unreachable in practice but defensive — never crashes the
    render path.
  - **T-16-03-D**: Bounded 6-key loop over `abilities`; format helpers
    are O(1); no recursion or unbounded iteration introduced.
- T-16-03-SC (supply-chain): **0 package installs.** Only schema /
  reader / renderer / fixture / doc edits — RESEARCH.md Package
  Legitimacy Audit not required.
- No new auth, network, or file boundary; no write surface.
- CI Gate 8: socketlib handler count = 17 preserved (read-path-only).

## TDD Gate Compliance

- ✓ `test(16-03): RED — …` commit exists (`0265d22`)
- ✓ `feat(g2-app): GREEN — …` commit exists after RED (`170bdc4`)
- ✓ `fix(shared-render): byte-update …` follows GREEN (`e8e7da0`)
  — this is the fixture-as-test-data update, not a refactor; the
  fixtures ARE the test inputs for the round-trip assertion.
- ✓ `docs(phase-16): close … (INV-3 atomic)` (`d68d7f2`) closes the
  phase with the ratification commit per Phase 14/15 precedent.

The fixture-byte commit is conceptually a "test data update" not a
behavior change — the renderer's behavior was already correct after
GREEN, but the round-trip tests asserted against pre-Phase-16 fixture
bytes. The fix() commit type was chosen because the deliverable is a
byte-level alignment between fixture (on disk) and renderer output
(produced fresh) — this is a "fix" of the fixture-disk staleness.

## Pitfall 3 verification (atomic schema extension preserved)

```bash
$ grep -cE "abilities[^:]*\.optional\(\)" packages/shared-protocol/src/payloads/character.ts
0
```

The new `abilities` field landed REQUIRED across the 3-plan wave (Phase
4b precedent: Wave-1 schema + Wave-2 producer + Wave-3 consumer all
atomic within the same milestone), with zero `.optional()` drift window.
Phase 16 closes the atomic-extension contract clean.

## Forward pointers

### Phase 17 (Sheet Skills Tab — next plannable)

- `CharacterSnapshotSchema.skills` extension (18 keys × `{total, ability,
  proficient, passive}`) — `proficient` is `0 | 0.5 | 1 | 2` per dnd5e
  canonical (Phase 16 reader's boolean coercion is Main-tab-only; Skills
  tab needs the full 4-level spectrum for ○/◉/◈ glyphs + half-tone).
- `extractSkills(actor)` reader helper next to extractAbilities/extractInventory.
- `renderSkillsTab` data binding consuming the new field; PSM-FIX-EN-
  SKILLS fixture round-trip preserved.
- **Side-benefit**: `actor.system.skills.{prc,ins,inv}.passive` lands in
  the snapshot, allowing the Main tab Senses line to replace its `—`
  placeholder with real passive Perception/Insight/Investigation values
  (closes the remaining em-dash on the Main tab vitals row).

### Phase 18 (milestone-close)

- Specs.md v0.9.12 → v0.9.13 version bump (changelog entry + INV-3
  pre-bump checklist verification).
- README.md badge update + showcase v0.9.13 stat strip + hero stat
  version update.
- INFILL-14.1-A/B/C UI-SPEC §2/§10 numeric drift cleanup + IT locale
  leak fix in `glyph-scene.glyph-idle-z05.it.txt` rows 1/17 + Z05-INV-
  02b triade IT extension.
- INV-3 milestone-close atomic commit (Specs.md + README + showcase +
  STATE.md + ROADMAP.md + REQUIREMENTS.md + 18-VERIFICATION.md +
  v0.9.13-MILESTONE-AUDIT.md).

## Self-Check: PASSED

- ✓ Four commits exist in git log: `0265d22` (RED) + `170bdc4` (GREEN) +
  `e8e7da0` (fixtures) + `d68d7f2` (INV-3 atomic ratification)
- ✓ `packages/g2-app/src/panels/character-sheet-tab-renderers.ts` exports
  `formatAbilityValue` + `formatAbilityMod` with JSDoc citing UI-SPEC §3
- ✓ renderMainTab rows 9-14 emit real `snapshot.abilities.<k>.value` +
  signed mod values; proficient glyph data-driven from `.proficient`
- ✓ `packages/shared-render/src/fixtures/sheet.main.2014.{it,en,de}.txt`
  + `sheet.main.2024.it.txt` updated; all 4 fixtures × 18 rows × 66
  code-points; `git diff` shows ONLY rows 10-15 changed
- ✓ 9 new CSTR-MAIN-AB-1a..5 tests pass; CSTR-FIX-MAIN-2014 +
  CSTR-FIX-MAIN-2024 + PSM-FIX-EN-MAIN + PSM-FIX-DE-MAIN round-trip
  green
- ✓ Workspace `pnpm test`: 2648/2648 passing (was 2559 Phase 15 baseline
  → +89 across Phase 16); 0 failures
- ✓ `pnpm typecheck`: exit 0 across all packages
- ✓ `pnpm lint:ci`: exit 0 (291 pre-existing warnings unrelated; 0
  errors)
- ✓ CI Gate 8: `grep -c 'socketlib.registerComplexHandler'
  packages/foundry-module/src/pair/socketlib-handlers.ts` = 17 (no
  new handlers)
- ✓ INV-3 atomic ratification commit `d68d7f2` touches STATE.md +
  ROADMAP.md + REQUIREMENTS.md + 16-VERIFICATION.md (4 files; single
  commit per Phase 14 `3a0c5cf` + Phase 15 `dc161d6` precedent)
- ✓ Specs.md + README.md + docs/showcase NOT touched in Phase 16
  (milestone-close artifacts; Phase 18 scope)
