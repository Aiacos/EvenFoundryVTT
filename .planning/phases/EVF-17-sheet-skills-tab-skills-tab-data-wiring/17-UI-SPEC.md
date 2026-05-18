# Phase 17: Sheet Skills Tab — UI Design Contract

**Authored:** 2026-05-18
**Status:** Ratified pre-implementation (autonomous mode — extension contract, not new UI)
**Binding source-of-truth:** `Specs.md` §7.5.3 (Skills tab mockup), `.planning/milestones/v0.9.11-phases/EVF-05-panel-plugin-system-read-only-panels/05-UI-SPEC.md` §5.3 (existing Skills tab UI-SPEC). This document records the *delta* contract for Phase 17 fixture+renderer changes; it does NOT re-design the Skills tab.

## 1. Scope of UI change

Phase 17 introduces **zero new visual structures**. It rewires the existing `renderSkillsTab` from a hardcoded `DEFAULT_SKILLS` array to dynamic lookup against `snapshot.skills` (the new schema field). It also fills the Main tab senses line (1 row across 4 fixtures).

Visual output stays byte-identical for IT locale (Thorin canonical spread matches existing DEFAULT_SKILLS hardcoded values per §7.5.3). New EN fixture parallels the IT fixture in the EN locale. Main tab row 17 senses line gets data where previously it had `—`.

## 2. Column anchors (existing, unchanged)

Per Phase 5 UI-SPEC §5.3 (load-bearing):

| Anchor | Col | Glyph | Note |
|--------|-----|-------|------|
| Legend row              | row 1 | `◉ competente · ★ maestria · ○ non addestrato` (IT) | unchanged |
| Ability column          | cols 1-3 | `FOR`/`DES`/`INT`/`SAG`/`CAR` | unchanged |
| Proficiency glyph       | col 6 | `○`/`◉`/`★` | data-driven from `snapshot.skills.<k>.proficient` |
| Skill name              | cols 8-37 | localized string from `SKILL_NAMES` | data-driven from snapshot key |
| Modifier value          | cols 41-44 | signed `+N`/`-N` | data-driven from `snapshot.skills.<k>.total` |
| Scroll hint             | row 18 | `▼ scroll per altre · scroll-tap = tira abilità` | unchanged |

## 3. Glyph dictionary (existing, unchanged)

- `○` (U+25CB) — proficient === 0 (not proficient)
- `◉` (U+25C9) — proficient === 1 (proficient) **AND** proficient === 0.5 (half-proficient, round-up)
- `★` (U+2605) — proficient === 2 (expertise/mastery)

The existing `PROF_GLYPHS` map in `character-sheet-tab-renderers.ts` ships these three glyphs. REQUIREMENTS.md SHEET-10 sub-criterion mentioned `◈` for expert but the shipped contract uses `★`; we honor the shipped reality. Half-proficient (`0.5`) rounds up to `◉` (rationale: half-prof still adds proficiency bonus, treating as "proficient-ish" is more honest than "untrained").

## 4. Main tab senses line

Row 17 of Main tab (currently `Sensi  —` IT / `Senses  —` EN / `Sinne  —` DE) becomes:

| Locale | Row 17 content |
|--------|----------------|
| IT     | `Sensi  PP 11 · PI 11 · IND 14` |
| EN     | `Senses  PP 11 · INS 11 · INV 14` |
| DE     | `Sinne  WN 11 · EIN 11 · UNT 14` (executor verifies DE abbreviations via `i18n-budgets.ts` catalog) |

Width budget: 66 codepoints per row. Sample IT row content = 28 codepoints, leaving 38 for trailing padding (renderer's `row66()` handles).

`PP` = passive Perception, `PI` = passive Insight (IT) / `INS` (EN), `IND` = passive Investigation (IT) / `INV` (EN).

## 5. Renderer logic delta

`renderSkillsTab(snapshot, locale, scrollOffset)` swaps `const skills = DEFAULT_SKILLS` (hardcoded array) for:

```
const skills: SkillDef[] = SKILL_KEYS.map(k => ({
  abilityLabel: 'sheet.ability.' + snapshot.skills[k].ability,
  nameIt: SKILL_NAMES[k].it,
  nameEn: SKILL_NAMES[k].en,
  nameDe: SKILL_NAMES[k].de,
  profLevel: snapshot.skills[k].proficient === 0.5 ? 1 : snapshot.skills[k].proficient as ProfLevel,
  modifier: snapshot.skills[k].total,
}));
```

`SKILL_NAMES` is a new const map keyed by `SkillKey` with `{it, en, de}` per skill. Extracted from existing DEFAULT_SKILLS (already has these strings). `SKILL_KEYS` is the new const tuple from `@evf/shared-protocol`.

When `snapshot === null`, render the existing 18 blank rows (unchanged).

## 6. Fixture deltas

| Fixture | Change | Rationale |
|---------|--------|-----------|
| `sheet.skills.it.txt` | byte-identical (no change) | DEFAULT_SKILLS Thorin matches §7.5.3 canonical; dynamic lookup preserves output |
| `sheet.skills.en.txt` | **NEW** — parallels IT in EN locale | Symmetric INV-1 coverage with Main tab |
| `sheet.main.2014.it.txt` row 17 | `Sensi  —` → `Sensi  PP 11 · PI 11 · IND 14` | Senses passives surfacing |
| `sheet.main.2024.it.txt` row 17 | same | same |
| `sheet.main.2014.en.txt` row 17 | `Senses  —` → `Senses  PP 11 · INS 11 · INV 14` | same |
| `sheet.main.2014.de.txt` row 17 | `Sinne  —` → `Sinne  WN 11 · EIN 11 · UNT 14` | same (DE abbreviations from catalog) |

Rows other than row 17 of the 4 main fixtures remain byte-identical to Phase 16 output.

## 7. INV-1 acceptance

- CSTR-SKILLS-WIDTH continues to pass: every row exactly 66 code-points.
- CSTR-FIX-SKILLS round-trips `sheet.skills.it.txt` byte-identically post-swap.
- NEW CSTR-FIX-SKILLS-EN round-trips `sheet.skills.en.txt`.
- CSTR-FIX-MAIN-2014/2024/EN/DE round-trip the row-17 update.
- NEW CSTR-SKILLS-DATA-1..5 assert dynamic snapshot-driven rendering (glyph spectrum, grouping, half-prof round-up, senses line).

## 8. Out of scope (this UI-SPEC)

- New glyphs beyond the existing 3-glyph spectrum (`○/◉/★`).
- Skill detail expansion / tap-to-roll UX.
- Skill bonus inspection beyond `total`.
- Changes to legend row 1 wording.

## 9. Sign-off

This UI-SPEC ratifies the data-binding rewire contract for Phase 17. The IT-locale fixture output is byte-identical post-swap; the only visible delta to a player is the Main tab senses line populating with real passives.

Authored by: autonomous workflow gate 3a.5
