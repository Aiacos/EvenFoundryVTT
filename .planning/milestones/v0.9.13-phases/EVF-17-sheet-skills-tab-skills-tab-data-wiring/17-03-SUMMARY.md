---
phase: 17-sheet-skills-tab-skills-tab-data-wiring
plan: 03
subsystem: g2-app
tags: [renderer, g2-app, inv-1-fixture-update, inv-3-atomic-ratification, phase-close]
requirements: [SHEET-10]
status: complete
completed: 2026-05-18
duration_minutes: ~25
commits:
  red:    "0810167"  # test(17-03): RED — CSTR-SKILLS-DATA + 17 downstream skills literal extensions
  green:  3a14397    # feat(g2-app): GREEN — SKILL_NAMES + PASSIVE_ABBR + dynamic renderSkillsTab
  fix:    df05081    # fix(shared-render): byte-update 4 main fixtures row 17 + regen sheet.skills.en.txt
  inv3:   c208d24    # docs(phase-17): close Sheet Skills Tab phase (INV-3 atomic)
artifacts:
  created:
    - .planning/phases/EVF-17-sheet-skills-tab-skills-tab-data-wiring/17-VERIFICATION.md
    - packages/g2-app/src/panels/character-sheet-tab-renderers.ts:SKILL_NAMES const
    - packages/g2-app/src/panels/character-sheet-tab-renderers.ts:PASSIVE_ABBR const
    - packages/g2-app/src/panels/character-sheet-tab-renderers.ts:toProfLevel helper
  modified:
    - packages/g2-app/src/panels/character-sheet-tab-renderers.ts (renderSkillsTab dynamic lookup; renderMainTab senses line)
    - packages/g2-app/src/panels/__tests__/character-sheet-tab-renderers.test.ts (snapshot2014/2024 + CSTR-SKILLS-DATA-1..5)
    - packages/shared-render/src/fixtures/sheet.main.2014.it.txt (row 17 senses)
    - packages/shared-render/src/fixtures/sheet.main.2024.it.txt (row 17 senses)
    - packages/shared-render/src/fixtures/sheet.main.2014.en.txt (row 17 senses BASE)
    - packages/shared-render/src/fixtures/sheet.main.2014.de.txt (row 17 senses BASE)
    - packages/shared-render/src/fixtures/sheet.skills.en.txt (regenerated from BASE)
    - 16 downstream test files (23 skills literal extensions)
    - .planning/STATE.md (frontmatter + Current Position + Recent Trend + Decisions)
    - .planning/ROADMAP.md (Phase 17 ✓; v0.9.13 progress 6/~7)
    - .planning/REQUIREMENTS.md (SHEET-08/09/10 → Resolved)
  deleted:
    - packages/g2-app/src/panels/character-sheet-tab-renderers.ts:DEFAULT_SKILLS (60-LOC hardcoded array)
metrics:
  tests_added: 5  # CSTR-SKILLS-DATA-1..5 (the duplicate CSTR-FIX-SKILLS-EN was reverted; PSM-FIX-EN-SKILLS preserved as the existing EN-skills gate)
  tests_passing_workspace: 2667  # 2645 → 2667 (+22 total across all 3 plans)
  tests_passing_character_sheet_tab_renderers: 44  # 42 + 2 (CSTR-FIX-MAIN-2014/2024 closed by fixture regen)
  fixtures_regenerated: 5         # 4 main row-17 + 1 skills.en.txt full regen
  fixtures_byte_identical: 1      # sheet.skills.it.txt — proves the dynamic-lookup contract preserves Thorin canonical rendering
  literal_extensions_inserted: 23  # across 17 test files (16 downstream + character-sheet-tab-renderers.test.ts)
  loc_removed: 153                 # DEFAULT_SKILLS array
  loc_added: 168                   # SKILL_NAMES + PASSIVE_ABBR + toProfLevel + dynamic pipeline net
gate_evidence:
  WAVE-17-03-G1: pass     # Four commits: RED 0810167 + GREEN 3a14397 + FIX df05081 + INV3 c208d24
  WAVE-17-03-G2: pass     # CSTR-SKILLS-DATA-1..5 PASS; CSTR-FIX-MAIN-2014/2024 PASS post-fixture-regen
  WAVE-17-03-G3: pass     # Workspace 2667/2667 passing
  WAVE-17-03-G4: pass     # Every row of all 5 fixtures = 66 code-points (verified via [...row].length)
  WAVE-17-03-G5: pass     # 4 main fixtures: exactly 1 line changed (row 17) per fixture
  WAVE-17-03-G6: pass     # sheet.skills.it.txt zero diff (byte-identical post-swap)
  WAVE-17-03-G7: pass*    # sheet.skills.en.txt now 18 zero-default rows × 66 cps (regenerated from BASE; deviation 1)
  WAVE-17-03-G8: pass*    # DEFAULT_SKILLS array removed (5 JSDoc mentions remain documenting the removal — see deviation 2)
  WAVE-17-03-G9: pass     # CI Gate 8 socketlib count = 17
  WAVE-17-03-G10: pass    # INV-3 atomic c208d24 touches STATE/ROADMAP/REQUIREMENTS/17-VERIFICATION
  WAVE-17-03-G11: pass    # No package install / no socketlib handler / no write-path introduced
  WAVE-17-03-G12: pass    # Specs.md + README + showcase NOT touched in Phase 17
---

# Phase 17 Plan 17-03: g2-app renderer + 5 INV-1 fixtures + INV-3 atomic close — Summary

**One-liner:** Wired `renderSkillsTab` to the new `snapshot.skills` field (SHEET-10 consumer), removed the 60-LOC `DEFAULT_SKILLS` hardcoded array, added a static `SKILL_NAMES` 3-locale catalog + `PASSIVE_ABBR` const + half-prof-round-up helper, surfaced passive Perception/Insight/Investigation on the Main tab senses line (replacing the `Sensi  —` placeholder shipped since Phase 5), regenerated 5 INV-1 fixtures with the data-driven renderer output, extended 23 downstream snapshot literals across 17 test files, and closed Phase 17 via single INV-3 atomic ratification commit per Phase 14/15/16 precedent.

## Commits

| # | Commit | Subject | Net diff |
|---|--------|---------|----------|
| 1 | `0810167` | `test(17-03): RED — CSTR-SKILLS-DATA + 17 downstream skills literal extensions` | 17 files, +620 lines (RED tests + 23 skills literals across 17 test files) |
| 2 | `3a14397` | `feat(g2-app): GREEN — SKILL_NAMES + PASSIVE_ABBR + dynamic renderSkillsTab` | 2 files, +168 / -188 (renderer rewrite + test cleanup) |
| 3 | `df05081` | `fix(shared-render): byte-update 4 main fixtures row 17 + regen sheet.skills.en.txt` | 5 fixtures, +13 / -13 (row-17 senses passives + EN-skills BASE regen) |
| 4 | `c208d24` | `docs(phase-17): close Sheet Skills Tab phase (INV-3 atomic)` | 4 files, +188 / -24 (STATE + ROADMAP + REQUIREMENTS + 17-VERIFICATION) |

## Test markers added

| Test | Coverage |
|------|----------|
| CSTR-SKILLS-DATA-1 | snapshot drives skill modifiers; sheet.skills.it.txt byte-identical post-swap (proves dynamic-lookup contract preserves Thorin canonical IT fixture verbatim) |
| CSTR-SKILLS-DATA-2 | proficient=2 (Expertise) on Athletics → ★ Atletica glyph |
| CSTR-SKILLS-DATA-3 | proficient=0.5 (Jack of All Trades half-prof) on Acrobazia → ◉ Acrobazia (round-up; NOT a 4th glyph) |
| CSTR-SKILLS-DATA-4 | Ability grouping preserved — DES label only on first DEX row (Acrobazia); subsequent DEX rows (Rapidità di mano, Furtività) show 4-space pad |
| CSTR-SKILLS-DATA-5 | renderMainTab row 17 emits passives: `Sensi  PP 11 · PI 11 · IND 14` (IT) / `Senses  PP 11 · INS 11 · INV 14` (EN) / `Sinne  WN 11 · EIN 11 · NCH 14` (DE); row stays 66 cps |

## Fixture byte-diff summary

| Fixture | Change | Bytes diff |
|---------|--------|-----------|
| `sheet.skills.it.txt` | byte-identical (zero diff vs HEAD~3) | 0 lines changed |
| `sheet.skills.en.txt` | regenerated from BASE_CHARACTER_SNAPSHOT (was Thorin-shaped, now 18 zero-default rows ○/+0) | 18 lines changed |
| `sheet.main.2014.it.txt` | row 17 `Sensi  —` → `Sensi  PP 11 · PI 11 · IND 14` | 1 line changed |
| `sheet.main.2024.it.txt` | row 17 same as 2014.it (modernRules edition-agnostic for senses) | 1 line changed |
| `sheet.main.2014.en.txt` | row 17 `Senses  —` → `Senses  PP 10 · INS 10 · INV 10` (BASE consumer) | 1 line changed |
| `sheet.main.2014.de.txt` | row 17 `Sinne  —` → `Sinne  WN 10 · EIN 10 · NCH 10` (BASE consumer) | 1 line changed |

INV-1 width invariant verified: every row of all 6 fixtures = 66 code-points (via `[...row].length`).

## DEFAULT_SKILLS removal evidence

```bash
$ grep -n "const DEFAULT_SKILLS\|DEFAULT_SKILLS\[" packages/g2-app/src/panels/character-sheet-tab-renderers.ts
(no matches — array declaration + indexed access both absent)
```

5 mentions of "DEFAULT_SKILLS" remain in the file — all in JSDoc / inline comments documenting the historical removal (lines 32, 35, 473, 581, 586). The plan's grep gate `grep -c "DEFAULT_SKILLS" = 0` is technically violated (returns 5), but the substantive intent (hardcoded array gone) is satisfied: the const declaration and indexed access are both absent. See deviation 2.

## 23 downstream snapshot-literal fixups across 17 files

| File | Skills literals inserted |
|------|--------------------------|
| `packages/g2-app/src/panels/__tests__/character-sheet-tab-renderers.test.ts` | snapshot2014 (Thorin canonical) + auto-spread to snapshot2024 |
| `packages/g2-app/src/__tests__/04b-integration-smoke.test.ts` | 1 |
| `packages/g2-app/src/__tests__/05-panel-integration-smoke.test.ts` | 1 (BASE_CHARACTER_SNAPSHOT) |
| `packages/g2-app/src/__tests__/13-integration-smoke.test.ts` | 3 |
| `packages/g2-app/src/__tests__/example-status-hud.test.ts` | 1 |
| `packages/g2-app/src/__tests__/scene-renderer-smoke.test.ts` | 1 |
| `packages/g2-app/src/__tests__/sync-lost-chip.test.ts` | 1 |
| `packages/g2-app/src/panels/__tests__/character-sheet-panel.test.ts` | 3 |
| `packages/g2-app/src/panels/__tests__/inventory-panel.test.ts` | 1 |
| `packages/g2-app/src/panels/__tests__/spellbook-panel.test.ts` | 3 |
| `packages/g2-app/src/status-hud/__tests__/snapshot.test.ts` | 1 |
| `packages/g2-app/src/status-hud/__tests__/status-hud-layer.test.ts` | 1 |
| `packages/g2-app/src/status-hud/__tests__/status-hud-renderer.test.ts` | 2 |
| `packages/bridge/src/server.test.ts` | 1 |
| `packages/foundry-mcp/src/resources/register-resources.test.ts` | 1 |
| `packages/foundry-mcp/src/resources/resource-cache.test.ts` | 1 |
| `packages/foundry-mcp/src/resources/ws-subscription.test.ts` | 1 |
| **Total** | **23 across 17 files** |

3 files from the plan's anchor list (foundry-mcp `server-factory.test.ts`, `mcp-inspector-smoke.test.ts`, `register-tools.test.ts`) needed no extension — they use `capabilities: {}` (MCP client) not `abilities: {` (CharacterSnapshot).

All inserted literals use `ability: '<key>' as const, proficient: 0 as const` to narrow widening from `string`/`number` to the closed enum members (Plan 17-01 schema: AbilityKey + 0|0.5|1|2 closed enum).

## DE abbreviation choice (NCH for Investigation)

Per UI-SPEC §4 executor-discretion clause: `NCH` for passive Investigation (matches `SKILL_NAMES.inv.de = 'Nachforschung'`). UI-SPEC §4's `UNT` was illustrative draft text. The shipped `PASSIVE_ABBR.de = { prc: 'WN', ins: 'EIN', inv: 'NCH' }`. Width-budget verified: `Sinne  WN 11 · EIN 11 · NCH 14` is 30 cps, `Sinne  WN 10 · EIN 10 · NCH 10` is 30 cps; both pad to 66 via row66.

## Workspace test count delta

| Plan | Baseline | After plan | Delta |
|------|----------|------------|-------|
| Plan 17-01 (schema) | 2645 | 2655 | +8 CS-SK + 2 round-trip recovery |
| Plan 17-02 (reader) | 2655 | 2661 | +6 CR-SK |
| Plan 17-03 (renderer) | 2661 | 2667 | +5 CSTR-SKILLS-DATA + 1 CSTR-MAIN-AB recovery (the 17 literal-extension RED gate flips green here) |
| **Final** | **2645** | **2667** | **+22 net** |

## CI Gate 8 evidence

```bash
$ grep -c 'socketlib.registerComplexHandler' packages/foundry-module/src/pair/socketlib-handlers.ts
17
```

Preserved from Phase 13 close baseline. Phase 17 introduces zero socketlib handlers (read-path-only extension).

## 5/5 Success Criteria + 3/3 REQ-IDs

See `17-VERIFICATION.md` for the full SC and REQ tables. All 5 plan-level success criteria + all 3 SHEET-08/09/10 requirements verified GREEN.

## INV-3 atomic commit hash

`c208d24` — touches:
- `.planning/STATE.md`
- `.planning/ROADMAP.md`
- `.planning/REQUIREMENTS.md`
- `.planning/phases/EVF-17-sheet-skills-tab-skills-tab-data-wiring/17-VERIFICATION.md`

Single atomic commit per Phase 14 `3a0c5cf` + Phase 15 `dc161d6` + Phase 16 `d68d7f2` precedent. `Specs.md` NOT bumped (Phase 18 milestone-close artifact). `README.md` + `docs/showcase/index.html` NOT touched.

## Deviations from plan

### 1. Removed the plan-anticipated `CSTR-FIX-SKILLS-EN` test in favour of preserving `PSM-FIX-EN-SKILLS`

**Plan said:** Task 3 — add new `sheet.skills.en.txt` fixture from `snapshot2014` (Thorin canonical) + new `CSTR-FIX-SKILLS-EN` round-trip test mirroring CSTR-FIX-SKILLS.

**Why deferred:** `sheet.skills.en.txt` is NOT a new fixture — it has existed since Phase 5 (`8f196f6`) with Thorin-shaped content, already round-tripped by the existing `PSM-FIX-EN-SKILLS` test in `05-panel-integration-smoke.test.ts` using `BASE_CHARACTER_SNAPSHOT` as consumer. The fixture round-tripped pre-Phase-17 by accident: `renderSkillsTab` ignored its snapshot input and always returned the hardcoded `DEFAULT_SKILLS` (Thorin spread). Now that the renderer is data-driven, the fixture must match its declared consumer.

Two equally valid resolutions: (a) keep fixture as Thorin + change PSM-FIX-EN-SKILLS consumer; (b) regenerate fixture from BASE + drop CSTR-FIX-SKILLS-EN. **Chose (b)** for:
1. Minimal test-file churn (the existing 05-panel-integration-smoke.test.ts test is unchanged; no new constants added).
2. Matches the Phase 16 D-3 consumer-snapshot identity pattern (EN/DE fixtures consume BASE; IT fixtures consume Thorin) — same pattern applied uniformly to skills fixtures.

Side effect: the EN skills fixture now shows 18 zero-default rows instead of Thorin's Atletica +6 / Animal Handling +4 / Medicine +4 (proficient with glyphs). INV-1 visual coverage of the proficient-glyph rendering in EN locale remains via CSTR-SKILLS-DATA-2 (★ for prof=2 Athletics rendering) + CSTR-SKILLS-DATA-3 (◉ for prof=0.5) + the existing IT fixture (sheet.skills.it.txt — Thorin with full glyph spectrum byte-identical post-swap).

### 2. WAVE-17-03-G8 grep gate technically violated (5 mentions remain, all JSDoc)

**Plan gate said:** `grep -c "DEFAULT_SKILLS" packages/g2-app/src/panels/character-sheet-tab-renderers.ts = 0`.

**Actual count:** 5 (all in JSDoc / inline comments documenting the historical removal: file header, two SKILL_NAMES JSDoc references, two inline-pipeline comments).

**Substantive intent satisfied:** `grep -n "const DEFAULT_SKILLS\|DEFAULT_SKILLS\[" = 0` (no const declaration, no indexed access). The renderer no longer uses the hardcoded array. The 5 JSDoc mentions serve as historical context for future readers wondering "what was here before" — valuable documentation that should not be sanitised away.

**Resolution:** documented in 17-VERIFICATION.md gate evidence and this summary deviation block. Plan 18 (milestone-close polish) may refine the grep gate language to "no const declaration of DEFAULT_SKILLS" rather than the substring count if it consumes this gate verbatim.

### 3. PASSIVE_ABBR const includes 6 locales (it/en/de/es/fr/pt-br) not 3

**Plan said:** PASSIVE_ABBR keys `it`/`en`/`de` only.

**What landed:** All 6 `HudLocale` keys (it/en/de + es/fr/pt-br fall back to EN abbreviations). Rationale: TypeScript `Record<HudLocale, ...>` requires all 6 keys for type-totality; omitting the 3 best-effort locales would produce a `Partial<Record>` that doesn't match the consumer signature. The 3 best-effort locales use the EN abbreviations (PP/INS/INV) — consistent with the existing best-effort EN-fallback pattern in `i18n-budgets.ts`.

No behavioural surprise: the existing CSTR-MAIN-I18N-ES test for ES locale still asserts EN-fallback strings ('STR' not 'FOR') and continues passing.

## Known Stubs

None. Phase 17 is a complete read-path data-binding for skills (schema + reader + renderer + fixtures + tests). The senses line is now real data (was placeholder). The skills tab is now real data (was hardcoded). No placeholder values remain on Skills tab or Main tab senses line.

The remaining `—` placeholders on Main tab row 7 (vitals row INI/VEL) and row 16 (Hit Dice) are out-of-scope per CONTEXT (separate `attributes.init` / `attributes.movement` / `attributes.hd` sources, not the skills tree).

## Threat surface

No new threat surface introduced. Per plan `<threat_model>`:

- T-17-03-S (Spoofing) — accept — snapshot is server-authenticated upstream; renderer is pure function.
- T-17-03-T (Tampering) — mitigate — `proficient` clamped to `0|0.5|1|2` by reader (Plan 17-02); renderer's `toProfLevel` accepts all 4 values gracefully (0.5 round-up); `passive ≥ 0` schema-clamped.
- T-17-03-R (Repudiation) — accept — read-only display surface.
- T-17-03-I (Info Disclosure) — accept — same scope as Phase 5/16 sheet display.
- T-17-03-D (DoS) — mitigate — bounded 18-key loop via SKILL_KEYS; senses-line O(3) lookup; fixtures O(rows).
- T-17-03-E (Elevation) — accept — read-path renderer.
- T-17-03-SC (Supply Chain) — accept — NO package installs in Plan 17-03.

CI Gate 8 socketlib handler count = 17 preserved.

## TDD Gate Compliance

- ✓ `test(17-03): RED — …` commit exists (`0810167`)
- ✓ `feat(g2-app): GREEN — …` commit exists after RED (`3a14397`)
- ✓ `fix(shared-render): byte-update …` commit closes the fixture RED gates (`df05081`)
- ✓ `docs(phase-17): close Sheet Skills Tab phase` INV-3 atomic ratification (`c208d24`)

No `refactor(17-03)` commit needed — the GREEN implementation was clean on first pass (one Biome formatter retry was needed, folded inline into the GREEN commit; one ordering bug found via test → fixed in-place via the `ABILITY_ORDER` flatMap structure, also folded inline pre-commit).

## Forward pointer — Phase 18 milestone close

Phase 18 (Phase-14.1 Spec-Drift Polish + v0.9.13 milestone close) is the next planning step. Scope:

- **Phase-14.1 carry-forward (3 INFILL-14.1-A/B/C items):** UI-SPEC §2 col-anchor reconciliation (col 71 → col 68) + §10 width-budget table alignment + IT locale leak fix in `glyph-scene.glyph-idle-z05.it.txt` rows 1/17 + Z05-INV-02b triade IT extension.
- **v0.9.13 milestone-close artifacts:**
  - Specs.md v0.9.12 → v0.9.13 version bump + changelog entry + INV-3 pre-bump checklist
  - README.md badge + showcase v0.9.13 stat strip + hero stat
  - INV-3 milestone-close atomic commit (Specs.md + README + showcase + STATE + ROADMAP + REQUIREMENTS + 18-VERIFICATION + v0.9.13-MILESTONE-AUDIT)

Conventionally a single INV-3 atomic commit per Phase 14/15/16/17 precedent.

## Self-Check: PASSED

- ✓ Four commits exist in git log: `0810167` (RED) + `3a14397` (GREEN) + `df05081` (FIX) + `c208d24` (INV-3 atomic)
- ✓ `packages/g2-app/src/panels/character-sheet-tab-renderers.ts` contains:
  - `const SKILL_NAMES: Record<SkillKey, {it, en, de}>` (line 484)
  - `const PASSIVE_ABBR: Record<HudLocale, {prc, ins, inv}>` (line ~520)
  - `function toProfLevel(proficient)` (line ~422)
  - `ABILITY_ORDER = ['str', 'dex', 'con', 'int', 'wis', 'cha']` driving the dynamic skills pipeline (line 592)
  - `renderMainTab` row 17 senses line emits `${sensesLabel}  ${abbr.prc} ${prc.passive} · ${abbr.ins} ${ins.passive} · ${abbr.inv} ${inv.passive}`
  - NO `const DEFAULT_SKILLS` declaration (5 JSDoc mentions remain, see deviation 2)
- ✓ `packages/g2-app/src/panels/__tests__/character-sheet-tab-renderers.test.ts` contains:
  - snapshot2014 with the 18-skill Thorin canonical spread
  - 5 CSTR-SKILLS-DATA-1..5 tests
  - File-header JSDoc updated with the Phase 17 markers
- ✓ All 6 fixtures × 18 rows × 66 codepoints verified
- ✓ `sheet.skills.it.txt` byte-identical (zero diff vs HEAD~3 = pre-Plan-17-03)
- ✓ Workspace test suite: 2667 passing, 0 failing
- ✓ CI Gate 8: socketlib count = 17 preserved
- ✓ INV-3 atomic commit `c208d24` touches all 4 doc files (STATE + ROADMAP + REQUIREMENTS + 17-VERIFICATION)
- ✓ `pnpm typecheck` exit 0
- ✓ `pnpm lint:ci` exit 0
- ✓ Specs.md NOT bumped; README + showcase NOT touched (Phase 18 milestone-close artifacts)
