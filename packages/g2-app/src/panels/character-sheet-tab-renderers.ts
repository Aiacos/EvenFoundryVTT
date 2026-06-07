/**
 * Character sheet per-tab content renderers (Phase 5 Plan 05-03 — SHEET-02, SHEET-03).
 *
 * Exports the `renderTabContent` dispatcher and 4 pure per-tab renderers:
 *   - `renderMainTab`   — Hero vitals / abilities / saves / quick stats (UI-SPEC §5.2)
 *   - `renderSkillsTab` — Full skill list with proficiency glyphs (UI-SPEC §5.3)
 *   - `renderFeatsTab`  — Origin/general feats + dual-edition annotations (UI-SPEC §5.6)
 *   - `renderBioTab`    — Biography word-wrap + HTML-strip (UI-SPEC §5.7)
 *
 * Inventory and Spells tab renderers are imported from `inventory-panel.ts` and
 * `spellbook-panel.ts` respectively (Plan 05-04). The dispatcher is now complete.
 *
 * ## Phase 16 — Ability scores data binding (SHEET-07)
 *
 * `renderMainTab` consumes the new `snapshot.abilities.<k>.{value, mod, save,
 * proficient}` field (Plan 16-01 schema, Plan 16-02 reader). The 14 cells in
 * the abilities + saves boxes that previously showed `—` placeholders now bind
 * to computed values via `formatAbilityValue` (right-aligned 2-cell value) and
 * `formatAbilityMod` (always-signed 2-cell modifier). The save-row proficiency
 * glyph (`◉` / `○`) is now data-driven from `proficient: boolean` — was
 * hardcoded to STR-prof + CON-prof + WIS-not-prof in Phase 5. Vitals row INI/
 * VEL/Hit Dice and Senses line keep their `—` placeholders per CONTEXT
 * §domain (out of scope this phase).
 *
 * @see 16-CONTEXT.md §Area 3 (in-place dash→data swap, no row shift)
 * @see 16-UI-SPEC.md §3 (format helpers), §4 (glyph dictionary)
 *
 * ## Phase 17 — Skills tab data binding (SHEET-10) + Main tab senses line
 *
 * `renderSkillsTab` consumes the new `snapshot.skills.<k>.{total, ability,
 * proficient, passive}` field (Plan 17-01 schema, Plan 17-02 reader). The
 * 60-LOC hardcoded `DEFAULT_SKILLS` array is REMOVED — skill rows now built
 * dynamically from `SKILL_KEYS.map(k => ...)` indexed against `snapshot.skills`,
 * with a static `SKILL_NAMES` map providing the 3-locale skill name catalog
 * (mechanically extracted from the pre-Phase-17 DEFAULT_SKILLS strings — no
 * translation invention; same EN/IT/DE coverage). Half-proficient (0.5) rounds
 * UP to ◉ per UI-SPEC §3 (rationale: half-prof still adds the proficiency
 * bonus → "proficient-ish" is more honest than "untrained" for the glyph;
 * the modifier value already reflects the bonus).
 *
 * `renderMainTab` row 16 (0-indexed; the senses line) now emits
 * `Sensi  PP {prc.passive} · PI {ins.passive} · IND {inv.passive}` (IT) /
 * `Senses  PP {prc} · INS {ins} · INV {inv}` (EN) / `Sinne  WN/EIN/NCH …` (DE),
 * replacing the `Sensi  —` placeholder shipped since Phase 5.
 *
 * @see 17-CONTEXT.md §Area 3 (renderer wiring), §Area 4 (fixture deltas)
 * @see 17-UI-SPEC.md §3 (glyph dictionary), §4 (senses line), §5 (renderer logic)
 *
 * ## Dual-edition branching (SHEET-03 / CONTEXT.md §Area 3)
 *
 * All edition-conditional rendering branches on `snapshot.world.modernRules`:
 *   - `true`  → PHB 2024 (weapon-mastery `[M]` flags, `[Origine]` feat annotations)
 *   - `false` → PHB 2014 (no mastery flags, no origin annotations)
 *
 * Branching is **inline inside each renderer** — no per-edition subclass.
 *
 * ## Width contract (INV-1 §7.1a)
 *
 * `renderTabContent` returns **18 rows** of exactly **66 code-points** each.
 * The tab strip (row 3, 70 code-points) is produced by `buildTabStrip` from
 * `character-sheet-panel.ts` and is NOT included in the 18 rows returned here.
 *
 * Code-point counting via `[...str].length` is mandatory for all width assertions
 * (RESEARCH Pitfall 5 — `str.length` under-counts multi-byte code-points).
 *
 * ## i18n
 *
 * Every localised label is resolved via `getLabel(field, locale)` from the
 * `i18n-budgets` table (Phase 5 / Plan 05-01 keys: `sheet.ability.*`,
 * `sheet.section.*`, `sheet.vitals.*`, `sheet.skill.*`, `sheet.feat.*`,
 * `sheet.bio.*`). No string literals in render functions.
 *
 * ## Security (threat model T-05-03-01 / T-05-03-02)
 *
 * `snapshot.world.modernRules` is validated upstream by `CharacterSnapshotSchema`
 * (z.boolean()); biography HTML is stripped by a simple tag-removal regex before
 * display; output goes to `bridge.textContainerUpgrade` (plain text, no DOM).
 *
 * @see .planning/phases/05-panel-plugin-system-read-only-panels/05-03-PLAN.md
 * @see .planning/phases/05-panel-plugin-system-read-only-panels/05-UI-SPEC.md §5.2–§5.7
 * @see .planning/phases/05-panel-plugin-system-read-only-panels/05-CONTEXT.md §Area 3
 * @see packages/g2-app/src/panels/character-sheet-panel.ts (TABS / buildTabStrip)
 * @see packages/g2-app/src/status-hud/i18n-budgets.ts (HUD_WIDTH_BUDGETS keys)
 * @see packages/shared-protocol/src/payloads/character.ts (CharacterSnapshotSchema)
 *
 * ## Phase 21 — Additive canvas paint*Tab methods (RSHEET-01)
 *
 * Six additive canvas paint methods added alongside the existing string renderers:
 * `paintMainTab`, `paintSkillsTab`, `paintInventoryTab`, `paintSpellsTab`,
 * `paintFeatsTab`, `paintBioTab`. These draw tab content directly onto a
 * `CanvasRenderingContext2D` within the supplied bounds object. The existing
 * `render*Tab()` string renderers are PRESERVED INTACT — the paint*Tab methods
 * are purely additive (RSHEET-01 additive canvas path). The Main tab surfaces
 * real `snapshot.initiative` (signed) and `snapshot.speed` instead of `—`.
 *
 * @see .planning/phases/EVF-21-character-sheet-su-canvas-dati-main-tab/21-03-PLAN.md
 */

import { type CharacterSnapshot, SKILL_KEYS, type SkillKey } from '@evf/shared-protocol';
import { getLabel, type HudLocale } from '../status-hud/i18n-budgets.js';
import type { TabId } from './character-sheet-panel.js';
import { renderInventoryTabContent } from './inventory-panel.js';
import { renderSpellsTabContent } from './spellbook-panel.js';

// ─── Width constants ──────────────────────────────────────────────────────────

/** Inner content width in code-points (UI-SPEC §4.1 — cols 3-68 of the 70-wide panel). */
const INNER_WIDTH = 66;

/** Number of content rows per tab (rows 4-21, below the tab strip at row 3). */
const ROW_COUNT = 18;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Pad `value` on the right with spaces to reach `width` code-points.
 *
 * Uses `[...value]` to count code-points — RESEARCH Pitfall 5 guard.
 * If `value` is already at or beyond `width`, returns it unchanged.
 */
export function padRightUnicode(value: string, width: number): string {
  const len = [...value].length;
  if (len >= width) {
    return value;
  }
  return `${value}${' '.repeat(width - len)}`;
}

/**
 * Truncate `value` to fit in `budget` code-points, appending `…` if cut.
 *
 * - `codePoints.length <= budget` → returned unchanged
 * - `codePoints.length > budget`  → returns `slice(0, budget - 1) + '…'`
 */
export function truncateUnicode(value: string, budget: number): string {
  const codePoints = [...value];
  if (codePoints.length <= budget) {
    return value;
  }
  return `${codePoints.slice(0, budget - 1).join('')}…`;
}

/**
 * Right-align an ability value in a 2-cell field.
 *
 * 8 → ' 8', 16 → '16', 21 → '21'. Asserts 0 ≤ n ≤ 99 defensively; the schema
 * upstream (AbilityScoreSchema, Phase 16 Plan 16-01) clamps `value` to 0..30,
 * so values outside that range are unreachable in practice. The helper still
 * degrades gracefully to `'??'` for unexpected inputs (T-16-03-T mitigation
 * per 16-03-PLAN.md threat_model).
 *
 * @param n integer ability value (typically 0..30 per D&D 5e rules)
 * @returns 2-cell string suitable for INV-1 width-budgeted layout
 * @see 16-UI-SPEC.md §3 (format helpers)
 */
export function formatAbilityValue(n: number): string {
  if (n < 0 || n > 99 || !Number.isFinite(n)) return '??';
  return n < 10 ? ` ${n}` : String(n);
}

/**
 * Always-signed 2-cell modifier string for ability mods and saves.
 *
 * +3 → '+3', -1 → '-1', 0 → '+0'. For D&D 5e standard value range 0..30, the
 * mod is bounded by -5..+10. The +10 case requires 3 cells; this overflow is
 * documented in 16-UI-SPEC.md §3 and treated as an acceptable rare edge case
 * (value=30 is the divine cap). Range -9..+9 fits the 2-cell budget guaranteed.
 *
 * Uses ASCII hyphen-minus (U+002D) for negatives to match the dash convention
 * elsewhere in the renderer and avoid Unicode-rendering ambiguity on the G2
 * VFD-style display surface.
 *
 * @param n signed integer modifier (typically -5..+10)
 * @returns signed 2-cell string e.g. '+3', '-1', '+0'
 * @see 16-UI-SPEC.md §3 (format helpers)
 */
export function formatAbilityMod(n: number): string {
  if (!Number.isFinite(n)) return '??';
  if (n >= 0) return `+${n}`;
  return `${n}`; // ASCII '-' is part of the number literal e.g. '-1'
}

/**
 * Produce a row of exactly `INNER_WIDTH` (66) code-points.
 *
 * Pads or truncates `content` to exactly 66 code-points, ensuring the
 * INV-1 width invariant regardless of `content` length.
 */
function row66(content: string): string {
  const cps = [...content];
  if (cps.length === INNER_WIDTH) {
    return content;
  }
  if (cps.length > INNER_WIDTH) {
    return cps.slice(0, INNER_WIDTH).join('');
  }
  return `${content}${' '.repeat(INNER_WIDTH - cps.length)}`;
}

/**
 * Pad `rows` array with blank rows to ensure it contains exactly `ROW_COUNT`
 * entries, each exactly `INNER_WIDTH` code-points wide.
 */
function padToRowCount(rows: string[]): string[] {
  const result = rows.map((r) => row66(r));
  while (result.length < ROW_COUNT) {
    result.push(' '.repeat(INNER_WIDTH));
  }
  return result.slice(0, ROW_COUNT);
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

/**
 * Dispatch to the per-tab content renderer.
 *
 * Returns **18 rows** of exactly **66 code-points** each. The tab strip
 * (row 3 of the full panel body) is produced separately by `buildTabStrip`
 * and is NOT included in the returned array.
 *
 * Inventory tab: delegates to `renderInventoryTabContent` (inventory-panel.ts, Plan 05-04).
 * Spells tab: delegates to `renderSpellsTabContent` (spellbook-panel.ts, Plan 05-04).
 *
 * @param tab          Active tab identifier (from `TABS` constant)
 * @param snapshot     Current character snapshot (may be `null` before first WS delta)
 * @param locale       Active HUD locale
 * @param scrollOffset Scroll position within the tab's content
 * @returns Array of 18 strings, each exactly 66 code-points wide
 */
export function renderTabContent(
  tab: TabId,
  snapshot: CharacterSnapshot | null,
  locale: HudLocale,
  scrollOffset: number,
): string[] {
  switch (tab) {
    case 'main':
      return renderMainTab(snapshot, locale);
    case 'skills':
      return renderSkillsTab(snapshot, locale, scrollOffset);
    case 'inventory':
      return renderInventoryTabContent(snapshot, locale, scrollOffset);
    case 'spells':
      return renderSpellsTabContent(snapshot, locale, scrollOffset);
    case 'feats':
      return renderFeatsTab(snapshot, locale, scrollOffset);
    case 'bio':
      return renderBioTab(snapshot, locale, scrollOffset);
  }
}

// ─── Main tab ─────────────────────────────────────────────────────────────────

/**
 * Render the Main tab content — hero vitals, ability scores, saves.
 *
 * Per UI-SPEC §5.2: 18 rows covering:
 *   - Rows 0-4: hero name / race-class line / XP bar / portrait placeholder / HP vitals
 *   - Row 5:    vitals bar (CA / INI / VEL / INSP / COMP)
 *   - Row 6:    blank separator
 *   - Rows 7-13: ability scores + saving throws (side by side)
 *   - Row 14:   hit dice
 *   - Row 15:   senses
 *   - Rows 16-17: blank
 *
 * Dual-edition delta: when `snapshot.world.modernRules === true`, weapon rows
 * in the vitals attack summary display a `[M]` mastery flag after weapon name.
 * NOTE: the Main tab mockup in UI-SPEC §5.2 does not include a weapon list
 * (weapon mastery `[M]` is part of the Inventory tab §5.4). The modernRules
 * branch is wired but the Main tab does NOT render a weapon list — the flag
 * difference is represented by including/excluding `[M]` in the hit-dice row
 * visual marker line. Actual weapon list lives in Inventory (05-04).
 *
 * When `snapshot` is null, all 18 rows are blank placeholders.
 *
 * @param snapshot Character snapshot or null
 * @param locale   Active HUD locale
 * @returns 18 strings, each exactly 66 code-points wide
 */
export function renderMainTab(snapshot: CharacterSnapshot | null, locale: HudLocale): string[] {
  if (snapshot === null) {
    return Array.from({ length: ROW_COUNT }, () => ' '.repeat(INNER_WIDTH));
  }

  const strLabel = getLabel('sheet.ability.str', locale);
  const dexLabel = getLabel('sheet.ability.dex', locale);
  const conLabel = getLabel('sheet.ability.con', locale);
  const intLabel = getLabel('sheet.ability.int', locale);
  const wisLabel = getLabel('sheet.ability.wis', locale);
  const chaLabel = getLabel('sheet.ability.cha', locale);
  const abilitiesSection = getLabel('sheet.section.abilities', locale);
  const savesSection = getLabel('sheet.section.saves', locale);
  const hpLabel = getLabel('sheet.vitals.hp', locale);
  const acLabel = getLabel('sheet.vitals.ac', locale);
  const iniLabel = getLabel('sheet.vitals.init', locale);
  const velLabel = getLabel('sheet.vitals.speed', locale);
  const compLabel = getLabel('sheet.vitals.prof', locale);
  const hitDiceLabel = getLabel('sheet.vitals.hit_dice', locale);
  const sensesLabel = getLabel('sheet.vitals.senses', locale);

  // Derived values from snapshot
  const hp = snapshot.hp;
  const maxHp = snapshot.maxHp;
  const tempHp = snapshot.tempHp;
  const ac = snapshot.ac;
  const level = snapshot.level;
  const name = truncateUnicode(snapshot.name.toUpperCase(), 30);

  // HP bar (12-glyph, proportional)
  const hpRatio = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
  const hpFull = Math.round(hpRatio * 12);
  const hpBar = `${'█'.repeat(hpFull)}${'░'.repeat(12 - hpFull)}`;
  const tempStr = tempHp > 0 ? `+${tempHp} temp` : '';

  // Ability scores — Phase 16 data binding (snapshot.abilities.<k>).
  // Phase 5 emitted `—` placeholders here; Plan 16-01 + 16-02 + 16-03 land the
  // full read pipeline (schema → reader → renderer). The em-dash glyph was kept
  // for the vitals row (INI/VEL) per CONTEXT D-Area-3 (out of scope Phase 16).
  // Phase 21 Plan 21-05: INI/VEL now use real snapshot.initiative/speed values.
  const dash = '—'; // retained for Hit Dice placeholder (still pending)
  const abilities = snapshot.abilities;
  const profGlyph = (proficient: boolean): string => (proficient ? '◉' : '○');

  // Proficiency bonus (standard 5e progression: 1-4=+2, 5-8=+3, 9-12=+4, 13-16=+5, 17-20=+6)
  const profBonus = Math.ceil(level / 4) + 1;
  const profStr = `+${profBonus}`;

  // modernRules indicator — shown in the vitals line (INV-1: 2014 vs 2024 main tab delta)
  const masteryIndicator = snapshot.world.modernRules ? ' [M]' : '';

  const rows: string[] = [];

  // Row 0: name + portrait placeholder start
  rows.push(`┌──────────┐  ${padRightUnicode(name, 34)}`);

  // Row 1: portrait + race/class line
  const raceClass = `Lv ${level}${masteryIndicator}`;
  rows.push(`│ portrait │  ${padRightUnicode(raceClass, 34)}`);

  // Row 2: portrait
  rows.push(`│ image    │  ${padRightUnicode('', 34)}`);

  // Row 3: portrait + level
  rows.push(`│ 100×60   │  ${padRightUnicode('', 34)}`);

  // Row 4: portrait close
  rows.push(`└──────────┘  ${padRightUnicode('', 34)}`);

  // Row 5: HP bar line
  const hpLine = `♥ ${hpLabel}    ${hpBar}  ${hp}/${maxHp}    ${padRightUnicode(tempStr, 10)}`;
  rows.push(hpLine);

  // Row 6: vitals bar (AC / INI / VEL / COMP)
  // Phase 21 Plan 21-05: INI uses formatAbilityMod (signed +N/-N/+0); VEL uses
  // String(snapshot.speed) — replaces the em-dash placeholders (RDATA-01/02).
  const vitalsLine = `⛨ ${acLabel} ${ac}    ⚡ ${iniLabel} ${formatAbilityMod(snapshot.initiative)}    ⚔ ${velLabel} ${String(snapshot.speed)}    ${compLabel} ${profStr}`;
  rows.push(vitalsLine);

  // Row 7: blank separator
  rows.push('');

  // Row 8: Section headers
  rows.push(
    `┌── ${padRightUnicode(abilitiesSection, 14)} ─┐  ┌── ${padRightUnicode(savesSection, 12)} ──┐`,
  );

  // Rows 9-14 abilities box + rows 9-11 saves box — Phase 16 data binding.
  //
  // Width budget per 16-UI-SPEC.md §2 column anchors:
  //   - Abilities cell: `│ LBL VV +M          │` = 1+1+3+1+2+1+2+10+1 = 22 cells
  //   - Saves cell:     `│ ◉ LBL  +M  LBR  +N │` = 1+1+1+1+3+2+2+2+3+2+2+1+1 = 22 cells
  //
  // The 4-space inter-column separator in the saves box (Phase 5 era, between
  // the em-dash and the right-side label) shrinks to 2-space here because
  // each `—` 1-cell placeholder grows to a 2-cell `+N`/`-N` value (net +2 per
  // row, absorbed by the inter-column gap).
  //
  // The proficient glyph (col 3 of each save row) is now data-driven from
  // `abilities.<k>.proficient` — pre-Phase-16 had hardcoded `◉` on STR + CON
  // saves and blank on WIS. With Thorin's Fighter prof spread the glyphs land
  // exactly as Phase 5 had them, but for any other character with different
  // prof choices the renderer now reflects reality (CSTR-MAIN-AB-4a covers).
  //
  // Row 9: STR ability  +  STR / DEX save
  rows.push(
    `│ ${strLabel} ${formatAbilityValue(abilities.str.value)} ${formatAbilityMod(abilities.str.mod)}          │  │ ${profGlyph(abilities.str.proficient)} ${strLabel}  ${formatAbilityMod(abilities.str.save)}  ${dexLabel}  ${formatAbilityMod(abilities.dex.save)} │`,
  );

  // Row 10: DEX ability  +  CON / INT save
  rows.push(
    `│ ${dexLabel} ${formatAbilityValue(abilities.dex.value)} ${formatAbilityMod(abilities.dex.mod)}          │  │ ${profGlyph(abilities.con.proficient)} ${conLabel}  ${formatAbilityMod(abilities.con.save)}  ${intLabel}  ${formatAbilityMod(abilities.int.save)} │`,
  );

  // Row 11: CON ability  +  WIS / CHA save
  rows.push(
    `│ ${conLabel} ${formatAbilityValue(abilities.con.value)} ${formatAbilityMod(abilities.con.mod)}          │  │ ${profGlyph(abilities.wis.proficient)} ${wisLabel}  ${formatAbilityMod(abilities.wis.save)}  ${chaLabel}  ${formatAbilityMod(abilities.cha.save)} │`,
  );

  // Row 12: INT ability  +  close saves box
  rows.push(
    `│ ${intLabel} ${formatAbilityValue(abilities.int.value)} ${formatAbilityMod(abilities.int.mod)}          │  └${'─'.repeat(26)}┘`,
  );

  // Row 13: WIS ability  +  blank to right
  rows.push(
    `│ ${wisLabel} ${formatAbilityValue(abilities.wis.value)} ${formatAbilityMod(abilities.wis.mod)}          │`,
  );

  // Row 14: CHA ability  +  Hit Dice (still placeholder per CONTEXT D-Area-3)
  rows.push(
    `│ ${chaLabel} ${formatAbilityValue(abilities.cha.value)} ${formatAbilityMod(abilities.cha.mod)}          │  ${hitDiceLabel}  ${dash}`,
  );

  // Row 15: close abilities box
  rows.push(`└${'─'.repeat(20)}┘`);

  // Row 16: senses — Phase 17 data binding (UI-SPEC §4)
  // Source: snapshot.skills.{prc, ins, inv}.passive — dnd5e prep-time computed
  // passive scores (NOT recomputed from 10+mod; Observant feat / magic items
  // can introduce static bonuses that don't flow through the base mod).
  // Locale-specific abbreviations via PASSIVE_ABBR (renderer-side const map;
  // not promoted to the i18n-budgets catalog because no other consumer needs
  // these tokens — see PASSIVE_ABBR JSDoc).
  const passivePrc = snapshot.skills.prc.passive;
  const passiveIns = snapshot.skills.ins.passive;
  const passiveInv = snapshot.skills.inv.passive;
  const abbr = PASSIVE_ABBR[locale] ?? PASSIVE_ABBR.en;
  const sensesContent = `${abbr.prc} ${passivePrc} · ${abbr.ins} ${passiveIns} · ${abbr.inv} ${passiveInv}`;
  rows.push(`${sensesLabel}  ${sensesContent}`);

  // Row 17: blank
  rows.push('');

  return padToRowCount(rows);
}

// ─── Skills tab ───────────────────────────────────────────────────────────────

/**
 * Skill proficiency level indicator glyph.
 *
 * 0 = not proficient, 1 = proficient, 2 = expertise/mastery.
 *
 * Half-proficient (0.5 — Jack of All Trades, Bard) is NOT a separate `ProfLevel`
 * — it rounds UP to 1 (◉) per UI-SPEC §3. See `toProfLevel` for the mapping.
 */
type ProfLevel = 0 | 1 | 2;

/**
 * Map raw dnd5e `proficient` value (0|0.5|1|2 — closed enum per
 * SkillSchema) to the renderer's 3-glyph spectrum.
 *
 * Half-prof (0.5) rounds UP to 1 (◉) per UI-SPEC §3 rationale: half-prof
 * still adds the proficiency bonus to the modifier, so "proficient-ish" is
 * more honest than "untrained" for the glyph. The actual modifier total
 * already reflects the half-prof bonus — this mapping only chooses the
 * visual indicator.
 */
function toProfLevel(proficient: 0 | 0.5 | 1 | 2): ProfLevel {
  if (proficient === 2) return 2;
  if (proficient === 0) return 0;
  return 1; // 1 (full) AND 0.5 (half, round-up) both render as ◉
}

/** D&D 5e skill row, pre-localised, ready for emission. */
interface SkillDef {
  readonly abilityLabel: string; // i18n key e.g. 'sheet.ability.dex'
  readonly name: string; // localised skill name (from SKILL_NAMES)
  readonly profLevel: ProfLevel; // 0 = untrained, 1 = proficient, 2 = expertise
  readonly modifier: number; // total modifier value (e.g. +6, -1)
}

/** Proficiency level → display glyph mapping (UI-SPEC §5.3). */
const PROF_GLYPHS: Record<ProfLevel, string> = {
  0: '○',
  1: '◉',
  2: '★',
} as const;

/**
 * Per-skill name catalog keyed by SkillKey, with 3-locale coverage
 * (it/en/de). Phase 17 Plan 17-03 — UI-SPEC §5.
 *
 * Renderer-side static map: plugin-side has no Foundry runtime, so we cannot
 * resolve dnd5e localization keys at render time. Strings are extracted
 * mechanically from the pre-Phase-17 `DEFAULT_SKILLS` hardcoded array (no
 * translation invention — same byte-for-byte EN/IT/DE coverage).
 *
 * The DE collision `nat/sur → 'Naturkunde'` (Nature and Survival both
 * rendered as "Naturkunde" in DE) was present in the pre-Phase-17 array and
 * is preserved verbatim. Correcting it is a separate Phase 18 milestone-close
 * polish task if surface demands; out of scope here.
 *
 * @see .planning/phases/EVF-17-sheet-skills-tab-skills-tab-data-wiring/17-UI-SPEC.md §5
 * @see .planning/phases/EVF-17-sheet-skills-tab-skills-tab-data-wiring/17-CONTEXT.md §Area 3
 */
const SKILL_NAMES: Record<
  SkillKey,
  { readonly it: string; readonly en: string; readonly de: string }
> = {
  acr: { it: 'Acrobazia', en: 'Acrobatics', de: 'Akrobatik' },
  ani: { it: 'Addestrare animali', en: 'Animal Handling', de: 'Tierführung' },
  arc: { it: 'Arcano', en: 'Arcana', de: 'Arkane Kunde' },
  ath: { it: 'Atletica', en: 'Athletics', de: 'Athletik' },
  dec: { it: 'Inganno', en: 'Deception', de: 'Täuschung' },
  his: { it: 'Storia', en: 'History', de: 'Geschichte' },
  ins: { it: 'Intuizione', en: 'Insight', de: 'Einblick' },
  itm: { it: 'Intimidazione', en: 'Intimidation', de: 'Einschüchterung' },
  inv: { it: 'Indagare', en: 'Investigation', de: 'Nachforschung' },
  med: { it: 'Medicina', en: 'Medicine', de: 'Heilkunde' },
  nat: { it: 'Natura', en: 'Nature', de: 'Naturkunde' },
  prc: { it: 'Percezione', en: 'Perception', de: 'Wahrnehmung' },
  prf: { it: 'Intrattenimento', en: 'Performance', de: 'Vorführung' },
  per: { it: 'Persuasione', en: 'Persuasion', de: 'Überzeugung' },
  rel: { it: 'Religione', en: 'Religion', de: 'Religion' },
  slt: { it: 'Rapidità di mano', en: 'Sleight of Hand', de: 'Fingerfertigkeit' },
  ste: { it: 'Furtività', en: 'Stealth', de: 'Heimlichkeit' },
  sur: { it: 'Sopravvivenza', en: 'Survival', de: 'Naturkunde' },
} as const;

/**
 * Per-locale abbreviations for the Main tab senses-line passives
 * (Phase 17 Plan 17-03 — UI-SPEC §4).
 *
 * Renderer-side static map — these tokens are NOT promoted to the
 * i18n-budgets catalog because no other consumer needs them. If Phase 18
 * milestone-close demands broader use, promote at that time.
 *
 * IT: PP (Percezione Passiva), PI (Passiva Intuizione), IND (INDagare)
 * EN: PP (Passive Perception), INS (Passive Insight), INV (Passive Investigation)
 * DE: WN (Wahrnehmung passiv), EIN (Einblick passiv), NCH (NaChforschung)
 *
 * DE choice rationale: SKILL_NAMES.inv.de is "Nachforschung" — the
 * abbreviation MUST match that name (NCH); UI-SPEC §4's draft `UNT 14` was
 * illustrative and gets overridden here per UI-SPEC §4 executor-discretion
 * clause + UI-SPEC §3 SKILL_NAMES.inv.de alignment.
 */
const PASSIVE_ABBR: Record<
  HudLocale,
  { readonly prc: string; readonly ins: string; readonly inv: string }
> = {
  it: { prc: 'PP', ins: 'PI', inv: 'IND' },
  en: { prc: 'PP', ins: 'INS', inv: 'INV' },
  de: { prc: 'WN', ins: 'EIN', inv: 'NCH' },
  // best-effort locales fall back to EN below; entries here keep the type total
  es: { prc: 'PP', ins: 'INS', inv: 'INV' },
  fr: { prc: 'PP', ins: 'INS', inv: 'INV' },
  'pt-br': { prc: 'PP', ins: 'INS', inv: 'INV' },
} as const;

/**
 * Render the Skills tab content per UI-SPEC §5.3.
 *
 * Column layout within the 66-char inner row:
 * - Cols 0-3:  ability label (4 chars, space-padded: e.g. `FOR `)
 * - Col  4:    1 space
 * - Col  5:    proficiency glyph (`◉` / `★` / `○`)
 * - Col  6:    1 space
 * - Cols 7-36: skill name (30 chars, left-aligned, truncated with `…`)
 * - Col  37:   1 space
 * - Cols 38-41: modifier right-aligned (4 chars: ` +6`, `+10`, ` -1`)
 * - Cols 42-65: spaces (pad to 66)
 *
 * Rows outside the visible window (controlled by `scrollOffset`) are skipped.
 *
 * @param snapshot     Character snapshot (null → blank rows)
 * @param locale       Active HUD locale
 * @param scrollOffset First visible skill index (0 = show from first skill)
 * @returns 18 strings, each exactly 66 code-points wide
 */
export function renderSkillsTab(
  snapshot: CharacterSnapshot | null,
  locale: HudLocale,
  scrollOffset: number,
): string[] {
  if (snapshot === null) {
    return Array.from({ length: ROW_COUNT }, () => ' '.repeat(INNER_WIDTH));
  }

  const profLegend = getLabel('sheet.skill.prof_legend', locale);
  const scrollHint = getLabel('sheet.skill.scroll_hint', locale);

  const rows: string[] = [];

  // Row 0: proficiency legend
  rows.push(truncateUnicode(profLegend, INNER_WIDTH));

  // Row 1: blank separator
  rows.push('');

  // Content rows 2-15: visible skill window (14 rows of skills)
  //
  // Phase 17 — dynamic snapshot-driven lookup (REPLACES the pre-Plan-17-03
  // hardcoded DEFAULT_SKILLS array). Iterate SKILL_KEYS in canonical dnd5e
  // order, then sort by ability column (STR / DEX / CON / INT / WIS / CHA)
  // to match the pre-Phase-17 visual grouping in `sheet.skills.it.txt`.
  //
  // The sort within each ability bucket preserves SKILL_KEYS order, which
  // matches the pre-Plan-17-03 DEFAULT_SKILLS hardcoded ordering exactly
  // (verified row-by-row against the fixture: STR:ath; DEX:acr,slt,ste;
  // INT:arc,his,inv,nat,rel; WIS:ani,ins,med,prc,sur; CHA:dec,itm,prf,per).
  // This is the byte-identity round-trip contract for CSTR-FIX-SKILLS +
  // CSTR-FIX-SKILLS-EN per UI-SPEC §7.
  const VISIBLE_ROWS = 14;
  const ABILITY_ORDER = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
  const skills: ReadonlyArray<SkillDef> = ABILITY_ORDER.flatMap((ab) =>
    SKILL_KEYS.filter((k) => snapshot.skills[k].ability === ab).map((k) => {
      const sk = snapshot.skills[k];
      const name =
        locale === 'it'
          ? SKILL_NAMES[k].it
          : locale === 'de'
            ? SKILL_NAMES[k].de
            : SKILL_NAMES[k].en;
      return {
        abilityLabel: `sheet.ability.${sk.ability}`,
        name,
        profLevel: toProfLevel(sk.proficient),
        modifier: sk.total,
      };
    }),
  );
  const clampedOffset = Math.max(
    0,
    Math.min(scrollOffset, Math.max(0, skills.length - VISIBLE_ROWS)),
  );
  const visibleSkills = skills.slice(clampedOffset, clampedOffset + VISIBLE_ROWS);

  // Track whether we need to show the ability label on each row
  let lastAbility = '';
  for (let i = 0; i < VISIBLE_ROWS; i++) {
    const skill = visibleSkills[i];
    if (skill === undefined) {
      rows.push('');
      continue;
    }

    const abilityKey = skill.abilityLabel as Parameters<typeof getLabel>[0];
    const abilityLabel = getLabel(abilityKey, locale);

    // Show ability label only on first occurrence in visible window
    const showAbility = abilityLabel !== lastAbility;
    if (showAbility) {
      lastAbility = abilityLabel;
    }
    const abilityCell = showAbility ? padRightUnicode(abilityLabel, 4) : '    ';

    // Skill name already locale-resolved during the SKILL_KEYS.map projection above
    const skillNameCell = padRightUnicode(truncateUnicode(skill.name, 30), 30);

    // Modifier: right-aligned in 4-char field (e.g. `  +6`, ` +10`, `  -1`)
    const modStr = skill.modifier >= 0 ? `+${skill.modifier}` : `${skill.modifier}`;
    const modCellRight =
      modStr.length >= 4 ? modStr.slice(-4) : ' '.repeat(4 - modStr.length) + modStr;

    const glyph = PROF_GLYPHS[skill.profLevel];

    // Build skill row: 4 + 1 + 1 + 1 + 30 + 1 + 4 + 24 = 66 chars
    const skillRow = `${abilityCell} ${glyph} ${skillNameCell} ${modCellRight}`;
    rows.push(skillRow);
  }

  // Row 16: scroll hint
  rows.push(truncateUnicode(scrollHint, INNER_WIDTH));

  // Row 17: blank
  rows.push('');

  return padToRowCount(rows);
}

// ─── Feats tab ────────────────────────────────────────────────────────────────

/**
 * Sample feat list for Thorin Oakenshield (consistent across fixtures).
 *
 * Since CharacterSnapshot does not yet carry feat detail (Phase 5 uses Phase 2
 * schema: HP/AC/conditions only), the renderer uses this representative list.
 * Plan 05-07+ can extend CharacterSnapshot with feats for live data.
 *
 * Each entry: category, name, originFeat (2024 origin feat flag), description (short).
 */
/**
 * Internal display record for a single feat/feature row.
 *
 * Phase 22 Plan 22-03: `category` widened to `string` (was `'class'|'race'|'background'|'feat'`
 * union) to match `FeatEntrySchema.category: z.string()` — dnd5e featureTypes is an open
 * taxonomy (includes 'monster', 'supernaturalGift', 'enchantment', 'vehicle', etc.).
 * RDATA-03 resolution.
 */
interface FeatDef {
  readonly category: string;
  readonly name: string;
  readonly isOrigin: boolean; // true = 2024 origin feat (shows [Origine] annotation)
  readonly desc: string; // short description for display
}

/**
 * Known section categories rendered in display order.
 *
 * Categories not in this list are bucketed under the last entry ('feat' / general).
 * Widened to `string` in Phase 22 per Open Question 1 resolution.
 */
const FEAT_SECTION_ORDER: ReadonlyArray<string> = [
  'class',
  'race',
  'background',
  'feat',
  'general',
];

/**
 * Render the Feats tab content per UI-SPEC §5.6.
 *
 * Section headers from i18n keys `sheet.feat.*_section`. Feat rows show:
 *   - 2014: feat name without annotation
 *   - 2024 (`modernRules === true`): origin feats prefixed with `[Origine]` (IT)
 *
 * @param snapshot     Character snapshot (null → blank rows)
 * @param locale       Active HUD locale
 * @param scrollOffset First visible feat index
 * @returns 18 strings, each exactly 66 code-points wide
 */
export function renderFeatsTab(
  snapshot: CharacterSnapshot | null,
  locale: HudLocale,
  scrollOffset: number,
): string[] {
  if (snapshot === null) {
    return Array.from({ length: ROW_COUNT }, () => ' '.repeat(INNER_WIDTH));
  }

  const modernRules = snapshot.world.modernRules;
  const originFlag = modernRules ? getLabel('sheet.feat.origin_flag', locale) : '';

  const classSection = getLabel('sheet.feat.class_section', locale);
  const raceSection = getLabel('sheet.feat.race_section', locale);
  const bgSection = getLabel('sheet.feat.background_section', locale);
  const featsSection = getLabel('sheet.feat.feats_section', locale);
  const scrollHint = getLabel('sheet.feat.scroll_hint', locale);

  const rows: string[] = [];

  // Build a flat list of renderable lines (section header + feat rows)
  interface FeatLine {
    isHeader: boolean;
    content: string;
  }
  const lines: FeatLine[] = [];

  // Build FeatDef list from real snapshot.feats (RDATA-03 — INV-4 dead-code rule: no fixture fallback).
  // Unknown categories (exotic dnd5e featureTypes) are normalised to 'general' for bucketing.
  const featSource: ReadonlyArray<FeatDef> = (snapshot.feats ?? []).map((f) => ({
    category: f.category.length > 0 ? f.category : 'general',
    name: f.name,
    isOrigin: f.isOrigin,
    desc: truncateUnicode(f.description, 40),
  }));

  const sectionLabelMap: ReadonlyMap<string, string> = new Map([
    ['class', classSection],
    ['race', raceSection],
    ['background', bgSection],
    ['feat', featsSection],
    ['general', featsSection],
  ]);

  // Collect all distinct categories in FEAT_SECTION_ORDER, then any remainder
  const orderedCats = [
    ...FEAT_SECTION_ORDER.filter((c) => featSource.some((f) => f.category === c)),
    ...[...new Set(featSource.map((f) => f.category))].filter(
      (c) => !FEAT_SECTION_ORDER.includes(c),
    ),
  ];

  for (const cat of orderedCats) {
    const featsInCat = featSource.filter((f) => f.category === cat);
    if (featsInCat.length === 0) continue;

    const label = sectionLabelMap.get(cat) ?? featsSection;
    lines.push({ isHeader: true, content: label });
    for (const feat of featsInCat) {
      const prefix = modernRules && feat.isOrigin ? `${originFlag} ` : '  ';
      const nameCell = truncateUnicode(feat.name, 36);
      lines.push({ isHeader: false, content: `${prefix}${nameCell}` });
    }
  }

  // Apply scroll offset
  const clampedOffset = Math.max(
    0,
    Math.min(scrollOffset, Math.max(0, lines.length - (ROW_COUNT - 1))),
  );
  const visibleLines = lines.slice(clampedOffset, clampedOffset + ROW_COUNT - 1);

  for (const line of visibleLines) {
    rows.push(line.content);
  }

  // Last row: scroll hint
  rows.push(truncateUnicode(scrollHint, INNER_WIDTH));

  return padToRowCount(rows);
}

// ─── Bio tab ──────────────────────────────────────────────────────────────────

/**
 * Strip HTML tags from a string (T-05-03-02 mitigation).
 *
 * Uses a simple tag-removal regex; this is sufficient because the output goes
 * to `bridge.textContainerUpgrade` (plain text, no DOM) — not an HTML context.
 * The biography value is producer-trusted (validated upstream by the WS handler
 * via CharacterSnapshotSchema, UTF-8 JSON). Named HTML entities are NOT decoded
 * (e.g. `&amp;` stays as `&amp;`) — acceptable for the G2 text display surface.
 *
 * T-05-03-03 (DoS via large biography): word-wrap windowing ensures only 18
 * rows × 66 chars are processed per render call — O(n) but bounded output.
 */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '');
}

/**
 * Word-wrap `text` at `maxWidth` code-points per line.
 *
 * Splits on word boundaries first; if a single word exceeds `maxWidth` it is
 * hard-wrapped. Returns an array of lines (each ≤ `maxWidth` code-points).
 */
function wordWrap(text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const lines: string[] = [];
  let currentLine = '';
  let currentLen = 0;

  for (const word of words) {
    const wordCps = [...word].length;
    if (currentLen === 0) {
      if (wordCps > maxWidth) {
        // Hard wrap: split the word
        const cps = [...word];
        let i = 0;
        while (i < cps.length) {
          lines.push(cps.slice(i, i + maxWidth).join(''));
          i += maxWidth;
        }
      } else {
        currentLine = word;
        currentLen = wordCps;
      }
    } else if (currentLen + 1 + wordCps <= maxWidth) {
      currentLine += ` ${word}`;
      currentLen += 1 + wordCps;
    } else {
      lines.push(currentLine);
      if (wordCps > maxWidth) {
        const cps = [...word];
        let i = 0;
        while (i < cps.length) {
          lines.push(cps.slice(i, i + maxWidth).join(''));
          i += maxWidth;
        }
        currentLine = '';
        currentLen = 0;
      } else {
        currentLine = word;
        currentLen = wordCps;
      }
    }
  }
  if (currentLen > 0) {
    lines.push(currentLine);
  }
  return lines;
}

/**
 * Render the Bio tab content per UI-SPEC §5.7.
 *
 * Reads biography fields from `snapshot.biography` (Phase 22 RDATA-04).
 * Empty/absent biography → graceful empty state (all sections skipped, scroll
 * hint + blank rows).
 *
 * Sections with empty text are omitted (no header line emitted) per D-22.4.
 * Backstory is HTML-stripped reader-side; the renderer applies stripHtml as
 * an additional safety layer (T-05-03-02 defence-in-depth).
 *
 * T-05-03-03 (DoS via large biography): word-wrap windowing ensures only 18
 * rows × 66 chars are processed per render call — O(n) but bounded output.
 *
 * @param snapshot     Character snapshot (null → blank rows)
 * @param locale       Active HUD locale
 * @param scrollOffset First visible row index
 * @returns 18 strings, each exactly 66 code-points wide
 */
export function renderBioTab(
  snapshot: CharacterSnapshot | null,
  locale: HudLocale,
  scrollOffset: number,
): string[] {
  if (snapshot === null) {
    return Array.from({ length: ROW_COUNT }, () => ' '.repeat(INNER_WIDTH));
  }

  const personalityHeader = getLabel('sheet.bio.personality', locale);
  const idealHeader = getLabel('sheet.bio.ideal', locale);
  const bondHeader = getLabel('sheet.bio.bond', locale);
  const flawHeader = getLabel('sheet.bio.flaw', locale);
  const backstoryHeader = getLabel('sheet.bio.backstory', locale);
  const scrollHint = getLabel('sheet.bio.scroll_hint', locale);

  // Real biography fields from snapshot.biography (RDATA-04).
  // biography is optional (D-22.1); absent/empty-string → section skipped (D-22.4).
  // Backstory is HTML-stripped reader-side; stripHtml here is defence-in-depth (T-05-03-02).
  const personalityText = snapshot.biography?.personality ?? '';
  const idealText = snapshot.biography?.ideal ?? '';
  const bondText = snapshot.biography?.bond ?? '';
  const flawText = snapshot.biography?.flaw ?? '';
  const backstoryText = snapshot.biography?.backstory ?? '';

  // Build flat lines list; sections with empty text are OMITTED (D-22.4).
  const allLines: string[] = [];

  const addSection = (header: string, text: string): void => {
    if (text.length === 0) return; // skip empty fields per D-22.4
    allLines.push(header);
    const cleaned = stripHtml(text); // defence-in-depth; reader already strips
    const wrapped = wordWrap(cleaned, INNER_WIDTH);
    allLines.push(...wrapped);
    allLines.push(''); // blank separator
  };

  addSection(personalityHeader, personalityText);
  addSection(idealHeader, idealText);
  addSection(bondHeader, bondText);
  addSection(flawHeader, flawText);
  addSection(backstoryHeader, backstoryText);

  // Apply scroll offset
  const clampedOffset = Math.max(
    0,
    Math.min(scrollOffset, Math.max(0, allLines.length - (ROW_COUNT - 1))),
  );
  const visibleLines = allLines.slice(clampedOffset, clampedOffset + ROW_COUNT - 1);

  const rows: string[] = [...visibleLines];

  // Last row: scroll hint
  rows.push(truncateUnicode(scrollHint, INNER_WIDTH));

  return padToRowCount(rows);
}

// ─── Canvas paint bounds type ─────────────────────────────────────────────────

/**
 * Axis-aligned bounding rectangle for canvas paint*Tab methods (Phase 21 Plan 21-03).
 *
 * All coordinates are in canvas pixels. The paint*Tab methods draw within
 * this rectangle (origin = top-left corner, w/h = width/height in pixels).
 *
 * @see Phase 21 Plan 21-03 §Open Q 4 (paintMainTab signature recommendation)
 * @see packages/g2-app/src/panels/canvas-character-sheet-panel.ts (caller)
 */
export interface PaintBounds {
  /** X coordinate of the top-left corner (pixels). */
  readonly x: number;
  /** Y coordinate of the top-left corner (pixels). */
  readonly y: number;
  /** Width in pixels. */
  readonly w: number;
  /** Height in pixels. */
  readonly h: number;
}

/** Phosphor-green foreground color (#ffffff → quantized to brightest G2 palette step). */
const CANVAS_FG = '#ffffff';

/** Line height (pixels) for the G2 VT323 27px fixed grid (Phase 21). */
const CANVAS_LINE_H = 27;

// ─── Canvas paint*Tab methods — ADDITIVE (string renderers preserved intact) ──

/**
 * Paint the Main tab content onto `ctx` within `bounds`.
 *
 * Draws real `snapshot.initiative` (signed +N/-N format via {@link formatAbilityMod})
 * and `snapshot.speed` in the vitals row, replacing the `—` placeholders used
 * by the glyph path's `renderMainTab`. Also surfaces `snapshot.class` and
 * `snapshot.level` on the identity line.
 *
 * When `snapshot` is `null`, the method is a no-op — the compositor's chrome
 * is already drawn and the content area is left blank.
 *
 * @param ctx      2D rendering context to draw on.
 * @param snapshot Latest `CharacterSnapshot` or `null`.
 * @param bounds   Paint region `{x, y, w, h}` in canvas pixels.
 * @param font     CSS font string (e.g. `'27px VT323'`) resolved by `ensureVt323Loaded`.
 *
 * @see packages/g2-app/src/panels/canvas-character-sheet-panel.ts (caller)
 * @see Phase 21 Plan 21-03 §Task 1 (RSHEET-01 additive canvas renderers)
 */
export function paintMainTab(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  snapshot: CharacterSnapshot | null,
  bounds: PaintBounds,
  font: string,
): void {
  if (snapshot === null) return;

  ctx.fillStyle = CANVAS_FG;
  ctx.font = font;

  const { x, y } = bounds;
  let lineY = y + CANVAS_LINE_H;

  // Row 0: class + level identity line (real class from snapshot.class)
  const classLevel =
    snapshot.class.length > 0 ? `${snapshot.class} Lv ${snapshot.level}` : `Lv ${snapshot.level}`;
  ctx.fillText(classLevel, x, lineY);
  lineY += CANVAS_LINE_H;

  // Row 1: HP bar
  const hpRatio = snapshot.maxHp > 0 ? Math.max(0, Math.min(1, snapshot.hp / snapshot.maxHp)) : 0;
  const hpFull = Math.round(hpRatio * 12);
  const hpBar = `${'█'.repeat(hpFull)}${'░'.repeat(12 - hpFull)}`;
  ctx.fillText(`PF ${hpBar} ${snapshot.hp}/${snapshot.maxHp}`, x, lineY);
  lineY += CANVAS_LINE_H;

  // Row 2: vitals — real initiative (signed) + real speed (plain integer)
  const ini = formatAbilityMod(snapshot.initiative); // e.g. '+3', '-1', '+0'
  const vel = String(snapshot.speed); // e.g. '30', '25'
  ctx.fillText(`CA ${snapshot.ac}  INI ${ini}  VEL ${vel}`, x, lineY);
  lineY += CANVAS_LINE_H;

  // Row 3: abbreviated ability scores
  const abs = snapshot.abilities;
  ctx.fillText(
    `FOR ${formatAbilityValue(abs.str.value)} DES ${formatAbilityValue(abs.dex.value)}` +
      ` COS ${formatAbilityValue(abs.con.value)} INT ${formatAbilityValue(abs.int.value)}` +
      ` SAG ${formatAbilityValue(abs.wis.value)} CAR ${formatAbilityValue(abs.cha.value)}`,
    x,
    lineY,
  );
}

/**
 * Paint the Skills tab content onto `ctx` within `bounds`.
 *
 * Delegates to `renderSkillsTab` with the supplied `locale` to obtain
 * localised lines and renders each via `fillText`. Phase 22 may replace
 * this with a richer layout.
 *
 * @param ctx      2D rendering context.
 * @param snapshot Latest `CharacterSnapshot` or `null`.
 * @param bounds   Paint region.
 * @param font     CSS font string.
 * @param locale   Active HUD locale forwarded to the string renderer.
 */
export function paintSkillsTab(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  snapshot: CharacterSnapshot | null,
  bounds: PaintBounds,
  font: string,
  locale: HudLocale = 'en',
): void {
  if (snapshot === null) return;

  ctx.fillStyle = CANVAS_FG;
  ctx.font = font;

  const { x, y } = bounds;
  let lineY = y + CANVAS_LINE_H;

  const rows = renderSkillsTab(snapshot, locale, 0);
  for (const row of rows) {
    ctx.fillText(row.trimEnd(), x, lineY);
    lineY += CANVAS_LINE_H;
    if (lineY > y + bounds.h) break;
  }
}

/**
 * Paint the Inventory tab content onto `ctx` within `bounds`.
 *
 * @param ctx      2D rendering context.
 * @param snapshot Latest `CharacterSnapshot` or `null`.
 * @param bounds   Paint region.
 * @param font     CSS font string.
 * @param locale   Active HUD locale forwarded to the string renderer.
 */
export function paintInventoryTab(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  snapshot: CharacterSnapshot | null,
  bounds: PaintBounds,
  font: string,
  locale: HudLocale = 'en',
): void {
  if (snapshot === null) return;

  ctx.fillStyle = CANVAS_FG;
  ctx.font = font;

  const { x, y } = bounds;
  let lineY = y + CANVAS_LINE_H;

  const rows = renderTabContent('inventory', snapshot, locale, 0);
  for (const row of rows) {
    ctx.fillText(row.trimEnd(), x, lineY);
    lineY += CANVAS_LINE_H;
    if (lineY > y + bounds.h) break;
  }
}

/**
 * Paint the Spells tab content onto `ctx` within `bounds`.
 *
 * @param ctx      2D rendering context.
 * @param snapshot Latest `CharacterSnapshot` or `null`.
 * @param bounds   Paint region.
 * @param font     CSS font string.
 * @param locale   Active HUD locale forwarded to the string renderer.
 */
export function paintSpellsTab(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  snapshot: CharacterSnapshot | null,
  bounds: PaintBounds,
  font: string,
  locale: HudLocale = 'en',
): void {
  if (snapshot === null) return;

  ctx.fillStyle = CANVAS_FG;
  ctx.font = font;

  const { x, y } = bounds;
  let lineY = y + CANVAS_LINE_H;

  const rows = renderTabContent('spells', snapshot, locale, 0);
  for (const row of rows) {
    ctx.fillText(row.trimEnd(), x, lineY);
    lineY += CANVAS_LINE_H;
    if (lineY > y + bounds.h) break;
  }
}

/**
 * Paint the Feats tab content onto `ctx` within `bounds`.
 *
 * @param ctx      2D rendering context.
 * @param snapshot Latest `CharacterSnapshot` or `null`.
 * @param bounds   Paint region.
 * @param font     CSS font string.
 * @param locale   Active HUD locale forwarded to the string renderer.
 */
export function paintFeatsTab(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  snapshot: CharacterSnapshot | null,
  bounds: PaintBounds,
  font: string,
  locale: HudLocale = 'en',
  scrollOffset = 0,
): void {
  if (snapshot === null) return;

  ctx.fillStyle = CANVAS_FG;
  ctx.font = font;

  const { x, y } = bounds;
  let lineY = y + CANVAS_LINE_H;

  const rows = renderFeatsTab(snapshot, locale, scrollOffset);
  for (const row of rows) {
    ctx.fillText(row.trimEnd(), x, lineY);
    lineY += CANVAS_LINE_H;
    if (lineY > y + bounds.h) break;
  }
}

/**
 * Paint the Biography tab content onto `ctx` within `bounds`.
 *
 * @param ctx      2D rendering context.
 * @param snapshot Latest `CharacterSnapshot` or `null`.
 * @param bounds   Paint region.
 * @param font     CSS font string.
 * @param locale   Active HUD locale forwarded to the string renderer.
 */
export function paintBioTab(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  snapshot: CharacterSnapshot | null,
  bounds: PaintBounds,
  font: string,
  locale: HudLocale = 'en',
  scrollOffset = 0,
): void {
  if (snapshot === null) return;

  ctx.fillStyle = CANVAS_FG;
  ctx.font = font;

  const { x, y } = bounds;
  let lineY = y + CANVAS_LINE_H;

  const rows = renderBioTab(snapshot, locale, scrollOffset);
  for (const row of rows) {
    ctx.fillText(row.trimEnd(), x, lineY);
    lineY += CANVAS_LINE_H;
    if (lineY > y + bounds.h) break;
  }
}
