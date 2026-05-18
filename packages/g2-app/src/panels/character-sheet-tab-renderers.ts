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
 */

import type { CharacterSnapshot } from '@evf/shared-protocol';
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
  // full read pipeline (schema → reader → renderer). The em-dash glyph is kept
  // for the vitals row (INI/VEL) and Senses line per CONTEXT D-Area-3 (out of
  // scope this phase — those come from `attributes.init.total` /
  // `attributes.movement.walk` / `skills.<k>.passive`, not the abilities tree).
  const dash = '—';
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

  // Row 6: vitals bar (AC / INI / VEL / INSP / COMP)
  const vitalsLine = `⛨ ${acLabel} ${ac}    ⚡ ${iniLabel} ${dash}    ⚔ ${velLabel} ${dash}    ${compLabel} ${profStr}`;
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

  // Row 16: senses
  rows.push(`${sensesLabel}  ${dash}`);

  // Row 17: blank
  rows.push('');

  return padToRowCount(rows);
}

// ─── Skills tab ───────────────────────────────────────────────────────────────

/**
 * Skill proficiency level indicator glyph.
 *
 * 0 = not proficient, 1 = proficient, 2 = expertise/mastery.
 */
type ProfLevel = 0 | 1 | 2;

/** D&D 5e skill definition. */
interface SkillDef {
  readonly abilityLabel: string; // 3-char ability abbreviation key e.g. 'FOR'
  readonly nameIt: string; // Italian skill name from dnd5e localization
  readonly nameEn: string; // English skill name
  readonly nameDe: string; // German skill name
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
 * Default D&D 5e skill list for Thorin Oakenshield (Lv 8 Fighter 3/Wizard 5).
 *
 * Used when snapshot is non-null but doesn't carry skill detail (Phase 5 uses
 * the Phase 2 schema which only has HP/AC/conditions). The list is consistent
 * with the UI-SPEC §5.3 fixture character.
 *
 * Ability key abbreviations resolve via getLabel(key, locale) at render time.
 */
const DEFAULT_SKILLS: ReadonlyArray<SkillDef> = [
  // STR
  {
    abilityLabel: 'sheet.ability.str',
    nameIt: 'Atletica',
    nameEn: 'Athletics',
    nameDe: 'Athletik',
    profLevel: 1,
    modifier: 6,
  },
  // DEX
  {
    abilityLabel: 'sheet.ability.dex',
    nameIt: 'Acrobazia',
    nameEn: 'Acrobatics',
    nameDe: 'Akrobatik',
    profLevel: 0,
    modifier: 2,
  },
  {
    abilityLabel: 'sheet.ability.dex',
    nameIt: 'Rapidità di mano',
    nameEn: 'Sleight of Hand',
    nameDe: 'Fingerfertigkeit',
    profLevel: 0,
    modifier: 2,
  },
  {
    abilityLabel: 'sheet.ability.dex',
    nameIt: 'Furtività',
    nameEn: 'Stealth',
    nameDe: 'Heimlichkeit',
    profLevel: 0,
    modifier: 2,
  },
  // INT
  {
    abilityLabel: 'sheet.ability.int',
    nameIt: 'Arcano',
    nameEn: 'Arcana',
    nameDe: 'Arkane Kunde',
    profLevel: 0,
    modifier: 0,
  },
  {
    abilityLabel: 'sheet.ability.int',
    nameIt: 'Storia',
    nameEn: 'History',
    nameDe: 'Geschichte',
    profLevel: 0,
    modifier: 0,
  },
  {
    abilityLabel: 'sheet.ability.int',
    nameIt: 'Indagare',
    nameEn: 'Investigation',
    nameDe: 'Nachforschung',
    profLevel: 0,
    modifier: 0,
  },
  {
    abilityLabel: 'sheet.ability.int',
    nameIt: 'Natura',
    nameEn: 'Nature',
    nameDe: 'Naturkunde',
    profLevel: 0,
    modifier: 0,
  },
  {
    abilityLabel: 'sheet.ability.int',
    nameIt: 'Religione',
    nameEn: 'Religion',
    nameDe: 'Religion',
    profLevel: 0,
    modifier: 0,
  },
  // WIS
  {
    abilityLabel: 'sheet.ability.wis',
    nameIt: 'Addestrare animali',
    nameEn: 'Animal Handling',
    nameDe: 'Tierführung',
    profLevel: 1,
    modifier: 4,
  },
  {
    abilityLabel: 'sheet.ability.wis',
    nameIt: 'Intuizione',
    nameEn: 'Insight',
    nameDe: 'Einblick',
    profLevel: 0,
    modifier: 1,
  },
  {
    abilityLabel: 'sheet.ability.wis',
    nameIt: 'Medicina',
    nameEn: 'Medicine',
    nameDe: 'Heilkunde',
    profLevel: 1,
    modifier: 4,
  },
  {
    abilityLabel: 'sheet.ability.wis',
    nameIt: 'Percezione',
    nameEn: 'Perception',
    nameDe: 'Wahrnehmung',
    profLevel: 0,
    modifier: 1,
  },
  {
    abilityLabel: 'sheet.ability.wis',
    nameIt: 'Sopravvivenza',
    nameEn: 'Survival',
    nameDe: 'Naturkunde',
    profLevel: 0,
    modifier: 1,
  },
  // CHA
  {
    abilityLabel: 'sheet.ability.cha',
    nameIt: 'Inganno',
    nameEn: 'Deception',
    nameDe: 'Täuschung',
    profLevel: 0,
    modifier: 1,
  },
  {
    abilityLabel: 'sheet.ability.cha',
    nameIt: 'Intimidazione',
    nameEn: 'Intimidation',
    nameDe: 'Einschüchterung',
    profLevel: 0,
    modifier: 1,
  },
  {
    abilityLabel: 'sheet.ability.cha',
    nameIt: 'Intrattenimento',
    nameEn: 'Performance',
    nameDe: 'Vorführung',
    profLevel: 0,
    modifier: 1,
  },
  {
    abilityLabel: 'sheet.ability.cha',
    nameIt: 'Persuasione',
    nameEn: 'Persuasion',
    nameDe: 'Überzeugung',
    profLevel: 0,
    modifier: 1,
  },
];

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
  const VISIBLE_ROWS = 14;
  const skills = DEFAULT_SKILLS;
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

    // Skill name localized
    const skillName =
      locale === 'it' ? skill.nameIt : locale === 'de' ? skill.nameDe : skill.nameEn;
    const skillNameCell = padRightUnicode(truncateUnicode(skillName, 30), 30);

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
interface FeatDef {
  readonly category: 'class' | 'race' | 'background' | 'feat';
  readonly name: string;
  readonly isOrigin: boolean; // true = 2024 origin feat (shows [Origine] annotation)
  readonly desc: string; // short description for display
}

const DEFAULT_FEATS: ReadonlyArray<FeatDef> = [
  {
    category: 'class',
    name: 'Second Wind',
    isOrigin: false,
    desc: 'bonus action: recover 1d10+3 HP',
  },
  { category: 'class', name: 'Action Surge', isOrigin: false, desc: 'extra action 1/short rest' },
  { category: 'race', name: 'Stonecunning', isOrigin: false, desc: '+10 History (stonework)' },
  { category: 'race', name: 'Darkvision', isOrigin: false, desc: '18m dark/dim vision' },
  {
    category: 'background',
    name: 'Military Rank',
    isOrigin: false,
    desc: 'authority over soldiers',
  },
  {
    category: 'feat',
    name: 'War Caster',
    isOrigin: true,
    desc: 'conc advantage + somatic w/weapons',
  },
  { category: 'feat', name: 'Tough', isOrigin: false, desc: '+16 HP max' },
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

  const categories: Array<{ cat: FeatDef['category']; label: string }> = [
    { cat: 'class', label: classSection },
    { cat: 'race', label: raceSection },
    { cat: 'background', label: bgSection },
    { cat: 'feat', label: featsSection },
  ];

  for (const { cat, label } of categories) {
    const featsInCat = DEFAULT_FEATS.filter((f) => f.category === cat);
    if (featsInCat.length === 0) continue;

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
 * Strips HTML from `actor.system.details.biography.value`, then word-wraps at
 * 66 chars per row. Subsection headers for personality / ideal / bond / flaw /
 * backstory are inserted between sections.
 *
 * Since CharacterSnapshot (Phase 2 schema) does not carry biography text, this
 * renderer generates a placeholder structure using the section headers from
 * i18n-budgets. Live data wiring defers to Phase 7+ schema extension.
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

  // Representative bio text for Thorin Oakenshield (used when snapshot lacks bio data)
  // HTML-strip + word-wrap used on any real biography value supplied in the snapshot.
  // CharacterSnapshot schema (Phase 2) doesn't carry biography; we use representative text.
  const personalityText = 'Sono un guerriero onesto che non si ferma davanti agli ostacoli.';
  const idealText = 'Lealtà: la fedeltà ai compagni è tutto.';
  const bondText = 'Difenderò la mia dimora ancestrale costi quel che costi.';
  const flawText = "L'orgoglio mi rende spesso testardo e chiuso al compromesso.";
  const backstoryText = 'Ex soldato del reggimento di montagna, veterano di tre campagne.';

  // Build flat lines list
  const allLines: string[] = [];

  const addSection = (header: string, text: string): void => {
    allLines.push(header);
    const cleaned = stripHtml(text);
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
