---
phase: 17-sheet-skills-tab-skills-tab-data-wiring
closed: 2026-05-18
status: passed
plans: 3
commit_red_17_01: d2e0403
commit_green_17_01: 79564d9
commit_red_17_02: c19320c
commit_green_17_02: 54e577e
commit_red_17_03: "0810167"
commit_green_17_03: 3a14397
commit_fix_17_03: df05081
commit_inv3_atomic: <pending — set after commit>
workspace_tests_pre: 2645
workspace_tests_post: 2667
tests_added: 22
ci_gate_8_socketlib_count: 17
hardware_pending_new: 0
adr_branch_a_carry: 35
---

# Phase 17: Sheet Skills Tab (Skills tab data wiring) — VERIFICATION

**Closed:** 2026-05-18
**Commits:** d2e0403 / 79564d9 (17-01) · c19320c / 54e577e (17-02) · 0810167 / 3a14397 / df05081 (17-03) · INV-3 atomic close (this commit)
**Workspace tests:** 2645 → 2667 (+22 new tests)

## Success Criteria (5/5 ✓)

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Player Sheet → Skills tab shows 18 real skill modifiers sourced from `actor.system.skills.<k>.total` formatted with sign | ✓ | CSTR-SKILLS-DATA-1 (snapshot drives modifiers; byte-identical IT fixture round-trip via dynamic `SKILL_KEYS.map`); commit 3a14397 |
| 2 | Each skill row carries the correct proficiency glyph: ○/◉/★ for 0/1/2; half-proficient (0.5) rendered per UI-SPEC §3 (round-up to ◉) | ✓ | CSTR-SKILLS-DATA-2 (★ for prof=2 Athletics expertise) + CSTR-SKILLS-DATA-3 (◉ for prof=0.5 Jack of All Trades round-up); commit 3a14397 |
| 3 | Main tab senses line surfaces passive Perception / Insight / Investigation from `actor.system.skills.{prc,ins,inv}.passive` — replaces `Sensi  —` placeholder | ✓ | CSTR-SKILLS-DATA-5 (`Sensi  PP 11 · PI 11 · IND 14` IT / `Senses  PP 11 · INS 11 · INV 14` EN / `Sinne  WN 11 · EIN 11 · NCH 14` DE); commit 3a14397 |
| 4 | `CharacterSnapshotSchema` extended with `skills` field; reader validates and emits the new field; all existing snapshot tests remain green | ✓ | Plan 17-01 (CS-SK-1..8 + REQUIRED field; commit 79564d9) + Plan 17-02 (CR-SK-1..6 + extractSkills reader + getCharacterSnapshot wiring; commit 54e577e); shared-protocol 347/347 + foundry-module 474/474 |
| 5 | INV-1 fixtures updated for Skills tab state (IT + EN locales); width-budget preserved (66 code-points per row); UI-SPEC §5.3 cross-reference unchanged | ✓ | Plan 17-03 Task 2 + 3 (sheet.skills.it.txt byte-identical post-swap; sheet.skills.en.txt regenerated from BASE consumer; 4 sheet.main.*.txt row-17 senses-line byte-updates; all 6 fixtures × 18 rows × 66 codepoints verified); commit df05081 |

## Requirements Closed (3/3 ✓)

| REQ-ID | Description | Status | Phase 17 Plan |
|--------|-------------|--------|----------------|
| SHEET-08 | Extend `CharacterSnapshotSchema` with `skills` field — 18 sub-objects × `{total, ability, proficient, passive}` (proficient closed 0\|0.5\|1\|2 enum) | ✓ Resolved | 17-01 (79564d9) |
| SHEET-09 | Extend `character-reader.ts` to read `actor.system.skills.*` and emit the new `skills` snapshot field | ✓ Resolved | 17-02 (54e577e) |
| SHEET-10 | Update `renderSkillsTab()` — replace mockup placeholders with `snapshot.skills.<k>.total` + proficiency glyph (○/◉/★ for 0/1/2; ◉ for 0.5 round-up per UI-SPEC §3); Main tab senses line passive surfacing | ✓ Resolved | 17-03 (3a14397 + df05081) |

## ADR-0005 Branch A carry-forward

**No new hardware-pending SCs introduced in Phase 17.** The phase is software-only (schema + reader + renderer + INV-1 fixtures + atomic ratification). The existing 35 hardware-pending SCs from v0.9.11 carry forward unchanged under ADR-0005 Branch A (G2-display gated on Even Hub developer access; no field-test execution required for Phase 17 close).

## CI Gate 8 evidence (socketlib handler count = 17)

```bash
$ grep -c 'socketlib.registerComplexHandler' packages/foundry-module/src/pair/socketlib-handlers.ts
17
```

Phase 17 is a read-path-only extension (schema + reader + renderer + fixtures). Zero socketlib handler additions; zero write-path additions. Phase 13 close baseline preserved byte-for-byte.

## Workspace test delta

| Layer | Pre-Phase-17 | Post-Phase-17 | Δ |
|-------|--------------|---------------|---|
| `@evf/shared-protocol` | 339 | 347 | +8 (CS-SK-1..8 — Plan 17-01) |
| `@evf/foundry-module`  | 468 | 474 | +6 (CR-SK-1..6 — Plan 17-02) |
| `@evf/g2-app`          | 1547 | 1555 | +8 (5 CSTR-SKILLS-DATA + 3 misc round-trip via senses-line + grouping; Plan 17-03 net delta after removing the duplicate CSTR-FIX-SKILLS-EN) |
| Other packages         | 291 | 291 | 0 (no behavior changes) |
| **Workspace total**    | **2645** | **2667** | **+22** |

(Plan-quoted baseline 2648 was a forward estimate before Plan 17-01 schema landing introduced the literal-extension RED gate; the actual workspace count after each plan's RED commit transiently dipped before the matching GREEN closure. 2667 is the final post-Phase-17 count.)

## INV-1 fixture update summary

| Fixture | Change | Consumer | Verification |
|---------|--------|----------|--------------|
| `sheet.skills.it.txt` | **byte-identical** (zero diff) | snapshot2014 (Thorin canonical) via CSTR-FIX-SKILLS | `git diff HEAD~3 -- packages/shared-render/src/fixtures/sheet.skills.it.txt` = 0 |
| `sheet.skills.en.txt` | **regenerated from BASE** (18 lines changed; was Thorin-shaped, now zero-default ○/+0 to match PSM-FIX-EN-SKILLS BASE consumer) | BASE_CHARACTER_SNAPSHOT via PSM-FIX-EN-SKILLS | All 18 rows × 66 cps verified; PSM-FIX-EN-SKILLS GREEN |
| `sheet.main.2014.it.txt` | row 17 senses line: `Sensi  —` → `Sensi  PP 11 · PI 11 · IND 14` | snapshot2014 (Thorin) via CSTR-FIX-MAIN-2014 | 1 line changed; rows 0-16 byte-identical to Phase 16 baseline |
| `sheet.main.2024.it.txt` | row 17 same as 2014.it (modernRules edition-agnostic for senses) | snapshot2024 (Thorin 2024) via CSTR-FIX-MAIN-2024 | 1 line changed; rows 0-16 byte-identical |
| `sheet.main.2014.en.txt` | row 17 senses line: `Senses  —` → `Senses  PP 10 · INS 10 · INV 10` | BASE_CHARACTER_SNAPSHOT via PSM-FIX-EN-MAIN | 1 line changed; rows 0-16 byte-identical |
| `sheet.main.2014.de.txt` | row 17 senses line: `Sinne  —` → `Sinne  WN 10 · EIN 10 · NCH 10` | BASE_CHARACTER_SNAPSHOT via PSM-FIX-DE-MAIN | 1 line changed; rows 0-16 byte-identical |

INV-1 width invariant verified across all 6 fixtures: every row exactly 66 code-points (`[...row].length` per row). DEFAULT_SKILLS hardcoded array removed: `grep -c "DEFAULT_SKILLS" packages/g2-app/src/panels/character-sheet-tab-renderers.ts = 0`.

## Downstream snapshot-literal extension surface

Phase 17 Plan 17-03 closed the atomic-extension gap opened by Plan 17-01's REQUIRED `skills` field. 16 downstream test files needed the new `skills` field on inline `CharacterSnapshot` literals:

| File | Literals extended |
|------|-------------------|
| `packages/g2-app/src/panels/__tests__/character-sheet-tab-renderers.test.ts` | snapshot2014 (Thorin canonical) — extended automatically via spread to snapshot2024 |
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
| **Total** | **23 literals across 17 files** (16 downstream + character-sheet-tab-renderers.test.ts) |

All inserted literals use `ability: '<key>' as const, proficient: 0 as const` to narrow widening from `string`/`number` to the closed enum members (Plan 17-01 schema: AbilityKey + 0\|0.5\|1\|2 closed enum). The 3 files in the Phase 16 atomic-extension precedent list (`@evf/foundry-mcp/server-factory.test.ts`, `mcp-inspector-smoke.test.ts`, `register-tools.test.ts`) had no `abilities: {` snapshot literals — they use `capabilities: {}` (MCP client) instead.

## Deviations from plan

### 1. Removed the new `CSTR-FIX-SKILLS-EN` test in favour of preserving `PSM-FIX-EN-SKILLS`

**Plan said:** Task 3 — add new `sheet.skills.en.txt` fixture from `snapshot2014` (Thorin canonical) + new `CSTR-FIX-SKILLS-EN` round-trip test mirroring CSTR-FIX-SKILLS.

**What landed:** Removed the new `CSTR-FIX-SKILLS-EN` test. Regenerated `sheet.skills.en.txt` from BASE_CHARACTER_SNAPSHOT (zero-default skills) instead of from Thorin.

**Rationale:** `sheet.skills.en.txt` was NOT a new fixture — it has existed since Phase 5 (`8f196f6 feat(g2-app): 05-06 8 INV-1 fixtures …`) with a Thorin-shaped content. It was ALREADY round-tripped by `PSM-FIX-EN-SKILLS` in `05-panel-integration-smoke.test.ts` using BASE_CHARACTER_SNAPSHOT as consumer. The fixture round-tripped pre-Phase-17 by accident: `renderSkillsTab` ignored its snapshot input and always returned the hardcoded `DEFAULT_SKILLS` (Thorin spread). Now that the renderer is data-driven, the fixture must match its declared consumer.

Two equally valid resolutions:
- (a) Keep fixture as Thorin-shaped + change PSM-FIX-EN-SKILLS consumer to Thorin snapshot
- (b) Regenerate fixture from BASE + drop the duplicate CSTR-FIX-SKILLS-EN test

Chose (b) for **two reasons**:
1. Minimal test-file churn (the 05-panel-integration-smoke.test.ts test is unchanged; no new constants added).
2. Matches the Phase 16 D-3 consumer-snapshot identity pattern (EN/DE fixtures consume BASE; IT fixtures consume Thorin) — same pattern applied uniformly to skills fixtures.

Side effect: the EN skills fixture now shows 18 zero-default rows instead of Thorin's Atletica +6 / Animal Handling +4 / Medicine +4 (proficient with glyphs). INV-1 visual coverage of the proficient-glyph rendering in EN remains via CSTR-SKILLS-DATA-2 (★ for prof=2 Athletics) + CSTR-SKILLS-DATA-3 (◉ for prof=0.5) + the existing IT fixture (sheet.skills.it.txt — Thorin with full glyph spectrum).

### 2. Test markers extended within character-sheet-tab-renderers.test.ts only (no separate test files)

Plan implied tests could go in either a dedicated describe block or inline with existing skills tests. Implementation chose inline in the existing test file at the end (after CSTR-MAIN-AB block) for visual locality with the renderer being tested.

### 3. DE abbreviation choice (NCH not UNT) for passive Investigation

**Plan said:** UI-SPEC §4 listed `UNT 14` as illustrative DE abbreviation; executor verifies via i18n-budgets.ts catalog. Plan PASSIVE_ABBR template had `de: { ..., inv: 'NCH' }` already (the plan's `<interfaces>` block §6 documented the NCH choice rationale ahead of execution).

**What landed:** `NCH` (matches `SKILL_NAMES.inv.de = 'Nachforschung'`). UI-SPEC §4's `UNT` was kept as a draft note; the executor-discretion clause permits alignment with the actual SKILL_NAMES string. The shipped renderer emits `Sinne  WN 11 · EIN 11 · NCH 14` (DE with Thorin) / `Sinne  WN 10 · EIN 10 · NCH 10` (DE with BASE).

## TDD Gate Compliance

- ✓ `test(17-03): RED — …` commit exists (`0810167`)
- ✓ `feat(g2-app): GREEN — …` commit exists after RED (`3a14397`)
- ✓ `fix(shared-render): byte-update …` commit closes the fixture RED gates (`df05081`)
- ✓ `docs(phase-17): close Sheet Skills Tab phase` INV-3 atomic ratification commit (this commit)

No `refactor(17-03)` commit needed — the GREEN implementation was clean on first pass (one Biome formatter retry was required, folded inline into the GREEN commit).

## Phase 14 / Phase 15 / Phase 16 precedent honored

Single INV-3 atomic ratification commit closes Phase 17, per:
- Phase 14 close: `3a0c5cf` (Plan 14-03 — ADR-0001 Amendment 1 RATIFIED + cross-cutting doc updates in one commit)
- Phase 15 close: `dc161d6` (Wave 5 — Specs.md §3.6/§5.2 + README + showcase + STATE + ROADMAP + REQUIREMENTS + 15-VERIFICATION in one commit)
- Phase 16 close: `d68d7f2` (Plan 16-03 + INV-3 atomic — abilities phase close per same pattern)

`Specs.md` NOT bumped in Phase 17 (milestone-close convention is Phase 18 per CONTEXT §Claude's Discretion). `README.md` + `docs/showcase/index.html` NOT touched (milestone-close artifacts; Phase 18 handles them).
