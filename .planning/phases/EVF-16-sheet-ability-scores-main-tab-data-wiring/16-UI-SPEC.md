# Phase 16: Sheet Ability Scores — UI Design Contract

**Authored:** 2026-05-18
**Status:** Ratified pre-implementation (autonomous mode — extension contract, not new UI)
**Binding source-of-truth:** `Specs.md` §7.5.2 (Main tab mockup), `.planning/milestones/v0.9.11-phases/EVF-05-panel-plugin-system-read-only-panels/05-UI-SPEC.md` §5.2 (existing Main tab UI-SPEC). This document records the *delta* contract for Phase 16 fixture byte-updates; it does NOT re-design the Main tab.

## 1. Scope of UI change

Phase 16 introduces **zero new visual elements**. It replaces 14 cells of `—` placeholder with computed data values inside the existing Main tab layout:

- 6 ability **value** cells (cols 7-8 inside the abilities box) — `STR/DEX/CON/INT/WIS/CHA`
- 6 ability **mod** cells (cols 10-11 inside the abilities box) — signed `+N`/`-N`
- 6 ability **save** cells (interleaved across rows 9-11 of the saves box) — signed `+N`/`-N`
- 6 ability **proficiency glyphs** on saves (col 3 of each save row) — `◉` (proficient) / `○` (not)

The ASCII frame, column anchors, row count (18), and inner-width invariant (66 code-points) all carry forward unchanged.

## 2. Column anchors (existing, unchanged)

Per Phase 5 UI-SPEC §5.2 (load-bearing, do not modify):

| Anchor | Col | Glyph | Note |
|--------|-----|-------|------|
| Abilities-box left edge  | 1  | `│` | unchanged |
| Ability label start      | 3  | `FOR`/`STR`/`DES`/… | 3-cell budget |
| Ability **value** cell   | 7-8 | digits | NEW — 2-cell budget, right-aligned (` 8` for single-digit) |
| Ability **mod** cell     | 10-11 | signed `+N`/`-N` | NEW — 2-cell budget, always signed |
| Abilities-box right edge | 22 | `│` | unchanged |
| Saves-box left edge      | 25 | `│` | unchanged |
| Save **prof glyph**      | 27 | `◉`/`○` | NEW (was always `◉` in 2 rows, blank in 1; now data-driven) |
| Save left **label**      | 29-31 | `FOR`/`STR`/`DES`/… | unchanged |
| Save left **value**      | 33-34 | signed `+N`/`-N` | NEW — 2-cell budget |
| Save right **label**     | 39-41 | `DES`/`DEX`/`INT`/… | unchanged |
| Save right **value**     | 43-44 | signed `+N`/`-N` | NEW — 2-cell budget |
| Saves-box right edge     | 46 | `│` | unchanged |

The pre-Phase-16 layout already reserved these cell positions (occupied by 1-char `—`); Phase 16 fills them with 2-char data without shifting any anchor.

## 3. Format helpers

Two pure functions added inside `character-sheet-tab-renderers.ts`:

- `formatAbilityValue(n: number): string` — right-align in 2-cell field. `8` → `' 8'`, `16` → `'16'`, `21` → `'21'`. Asserts `0 ≤ n ≤ 30` (matches schema bound).
- `formatAbilityMod(n: number): string` — always-signed 2-cell. `+3` → `'+3'`, `-1` → `'-1'`, `0` → `'+0'`. For range `-9..+9` (standard ±9 mod cap from value ∈ 0..30 → mod ∈ -5..+10; the +10 case for value=30 is `+10` 3-cell → field expands to 3 cells in that rare case; treat as overflow per renderer convention).

Same helpers reused for save formatting (saves are computed mods in the same ±N format).

## 4. Glyph dictionary (proficiency)

- `◉` (U+25C9) — proficient on save (`abilities.<k>.proficient === true`)
- `○` (U+25CB) — not proficient

No new glyphs introduced. Existing renderer already uses these two for save proficiency markers (currently hardcoded as `◉ STR ◉ CON   WIS`; Phase 16 wires the boolean per ability).

## 5. Expected fixture byte deltas

Canonical Thorin Oakenshield ability spread (per Specs.md §7.5.2):

| Ability | Value | Mod | Save | Prof |
|---------|-------|-----|------|------|
| STR | 16 | +3 | +5 | ◉ |
| DEX | 14 | +2 | +2 | ○ |
| CON | 14 | +2 | +5 | ◉ |
| INT | 18 | +4 | +4 | ○ |
| WIS | 12 | +1 | +1 | ○ |
| CHA |  8 | −1 | −1 | ○ |

Phase 16 updates 4 fixtures:

- `packages/shared-render/src/fixtures/sheet.main.2014.it.txt` (rows 10-15 abilities box; rows 10-12 saves box)
- `packages/shared-render/src/fixtures/sheet.main.2024.it.txt` (same rows)
- `packages/shared-render/src/fixtures/sheet.main.2014.en.txt` (same rows)
- `packages/shared-render/src/fixtures/sheet.main.2014.de.txt` (same rows)

Other rows (name, portrait box, HP bar, vitals row INI/VEL/HD, senses) remain byte-identical to pre-Phase-16 fixtures — these are explicit non-goals.

## 6. INV-1 acceptance

- CSTR-MAIN-WIDTH continues to pass: every row exactly 66 code-points.
- CSTR-FIX-MAIN-2014 / -2024 round-trip the updated fixtures byte-identically.
- CSTR-HOT-SWAP remains valid: only `[M]` flag at row 2 differs between 2014/2024 renders (ability data is edition-agnostic).
- New CSTR-MAIN-AB-* tests assert the format helpers (`formatAbilityValue`, `formatAbilityMod`) handle the value/mod/save range correctly.

## 7. Out of scope (this UI-SPEC)

- INI / VEL / Hit Dice values on row 7 — deferred (not ability fields).
- Senses passive Perception/Insight/Investigation on row 17 — deferred to Phase 17 (skills snapshot).
- XP bar, race/class line beyond `Lv N`, dual-edition mastery `[M]` content — unchanged.
- Skills tab — Phase 17.

## 8. Sign-off

This UI-SPEC ratifies the data-binding contract for Phase 16 without re-litigating Phase 5's Main tab design. The 14 cells named in §1 are the entire visual delta; everything else is byte-stable.

Authored by: autonomous workflow gate 3a.5
