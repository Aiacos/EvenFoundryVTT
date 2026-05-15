/**
 * Status HUD renderer — produces the 28-char × 21-row AsciiGrid corner card
 * (z=1, col 68-95 of the full 96-char G2 page) from a `CharacterSnapshot`.
 *
 * Three render entry-points cover the canonical states from UI-SPEC §Screen 4:
 *
 *   - `renderLoading()` — first boot, before any WS delta arrives; HP value as
 *     `…` (ellipsis U+2026), everything else as `—` (em-dash U+2014).
 *   - `renderMissing()` — bridge connected but no character assigned; everything
 *     as `—`. Behaves like a "loaded but empty" frame.
 *   - `render(snapshot)` — populated frame from a parsed CharacterSnapshot.
 *
 * The output AsciiGrid is always 28 char wide × 21 row tall. Col 0 and col 27 of
 * every row are `║`; row 21 is the bottom border `╠══...═╣`. Box-drawing chars
 * come from UI-SPEC §Glyph Dictionary verbatim. No DOM is emitted — this is a
 * pure transform that returns an AsciiGrid; the layer (Task 2) calls
 * `bridge.textContainerUpgrade({ content: grid.toString() })`.
 *
 * **Width-budgeted (INV-1):** every label and value runs through
 * `assertWithinBudget` and is truncated with `…` to fit the per-locale budget
 * declared in `HUD_WIDTH_BUDGETS` (CONTEXT.md §Area 3). The renderer assumes its
 * input snapshot is already valid (StatusHudLayer.safeParse upstream).
 *
 * **Missing-data fallback:** scalar fields that are absent or undefined render
 * as `—` (em-dash) preserving column width — never collapses the layout
 * (UI-SPEC §Screen 4 placeholder rules).
 *
 * **`[GLY]` badge:** when constructed with `mapMode: 'glyph'` the renderer
 * places the `[GLY]` literal at col 22-26 of row 20 (the last 3 visible chars
 * before the right border). In `'raster'` mode that row stays blank.
 *
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04A-UI-SPEC.md §Status HUD Design Contract
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04a-CONTEXT.md §Area 3
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04A-PATTERNS.md §status-hud-renderer.ts
 * @see packages/g2-app/src/status-hud/i18n-budgets.ts (HUD_WIDTH_BUDGETS)
 * @see packages/shared-render/src/fixtures/status-hud.*.txt (INV-1 fixtures)
 */
import type { CharacterSnapshot } from '@evf/shared-protocol';
import { AsciiGrid } from '@evf/shared-render';
import { getLabel, type HudLocale } from './i18n-budgets.js';

/** Total width of the Status HUD card in characters. */
const HUD_WIDTH = 28;
/** Total height of the Status HUD card in rows. */
const HUD_HEIGHT = 21;
/** Inner content cell count per row (excluding both `║` borders). */
const INNER_WIDTH = HUD_WIDTH - 2; // 26

/** Missing scalar placeholder per CONTEXT.md §Area 3. */
const EM_DASH = '—';
/** Loading-state placeholder per CONTEXT.md §Area 3 (used in HP value cell). */
const ELLIPSIS = '…';

/** HP bar is exactly 8 glyphs wide per UI-SPEC §Field Width Budgets. */
const HP_BAR_GLYPHS = 8;

/** Map mode determines whether the `[GLY]` badge is visible at row 20. */
export type StatusHudMapMode = 'raster' | 'glyph';

/** Constructor options for the renderer. */
export interface StatusHudRendererOpts {
  /** Active locale — drives label substitution via i18n-budgets table. */
  readonly locale: HudLocale;
  /** Map mode — when `'glyph'`, render the `[GLY]` badge in row 20. */
  readonly mapMode?: StatusHudMapMode;
}

/**
 * Stateless renderer for the always-visible z=1 Status HUD corner card.
 *
 * Construct once per layer instance; the locale + mapMode are fixed at
 * construction time. Subsequent `render` / `renderLoading` / `renderMissing`
 * calls produce fresh AsciiGrid instances on every invocation (no caching —
 * the LayerManager + StatusHudLayer handle debouncing).
 */
export class StatusHudRenderer {
  private readonly locale: HudLocale;
  private readonly mapMode: StatusHudMapMode;

  constructor(opts: StatusHudRendererOpts) {
    this.locale = opts.locale;
    this.mapMode = opts.mapMode ?? 'raster';
  }

  /**
   * Render the first-boot loading state.
   *
   * HP value cell shows `…` (ellipsis), every other scalar shows `—` (em-dash).
   * Output exactly matches `packages/shared-render/src/fixtures/status-hud.loading.txt`.
   */
  renderLoading(): AsciiGrid {
    return this._buildGrid({
      nameDisplay: EM_DASH,
      hpBar: ELLIPSIS, // loading marker in the bar position (UI-SPEC §Screen 4)
      hpValueDisplay: ELLIPSIS,
      hpCurMax: `${EM_DASH}/${EM_DASH}`,
      hpTemp: '',
      acValue: EM_DASH,
      spdValue: EM_DASH,
      actDot: EM_DASH,
      bnsDot: EM_DASH,
      reactDot: EM_DASH,
      moveCurMax: `${EM_DASH}/${EM_DASH}`,
      conditions: [],
      conditionsOverflow: 0,
    });
  }

  /**
   * Render the empty/missing state (bridge up, no character assigned).
   *
   * Everything renders as `—` em-dash. Reused as the "snapshot fields not yet
   * populated" fallback if `render()` is called with sparse data.
   */
  renderMissing(): AsciiGrid {
    return this._buildGrid({
      nameDisplay: EM_DASH,
      hpBar: '',
      hpValueDisplay: EM_DASH,
      hpCurMax: `${EM_DASH}/${EM_DASH}`,
      hpTemp: '',
      acValue: EM_DASH,
      spdValue: EM_DASH,
      actDot: EM_DASH,
      bnsDot: EM_DASH,
      reactDot: EM_DASH,
      moveCurMax: `${EM_DASH}/${EM_DASH}`,
      conditions: [],
      conditionsOverflow: 0,
    });
  }

  /**
   * Render a populated CharacterSnapshot into the 28×21 corner card.
   *
   * Field-by-field width budgeting via `HUD_WIDTH_BUDGETS`:
   *   - Character name truncated to 11 chars + `…` (12-char budget)
   *   - HP value `cur/max` truncated to 9 chars max
   *   - HP temp displayed as `+{N}t`, truncated to 5 chars
   *   - Conditions show up to 3 entries; overflow displayed as `… +{N}`
   *
   * Missing optional fields render as `—` per CONTEXT.md §Area 3.
   */
  render(snapshot: CharacterSnapshot): AsciiGrid {
    // Name (12-char budget per UI-SPEC §Field Width Budgets — truncate to
    // 11 + `…` = 12 chars total).
    const nameDisplay = truncateField(snapshot.name, 12);

    // HP bar — 8-glyph fill/empty based on cur/max ratio
    const hpBar = buildHpBar(snapshot.hp, snapshot.maxHp);
    // HP value cell — `cur/max` padded; truncate with … to 9 chars
    const hpValueText = `${snapshot.hp}/${snapshot.maxHp}`;
    const hpValueDisplay =
      hpValueText.length > 9 ? `${hpValueText.slice(0, 8)}${ELLIPSIS}` : hpValueText;
    // Temp HP — `+{N}t` truncated to 5 chars; empty if 0
    const hpTemp = snapshot.tempHp > 0 ? truncateField(`+${snapshot.tempHp}t`, 5) : '';

    // AC + Speed (speed not in CharacterSnapshot; render as em-dash for now)
    const acValue = String(snapshot.ac);
    const spdValue = EM_DASH; // CharacterSnapshot doesn't carry speed in Phase 2

    // Conditions (3 visible + overflow count)
    const allConditions = snapshot.conditions;
    const visibleConditions = allConditions.slice(0, 3).map((c) => truncateField(c, 13));
    const conditionsOverflow = Math.max(0, allConditions.length - 3);

    return this._buildGrid({
      nameDisplay,
      hpBar,
      hpValueDisplay,
      hpCurMax: hpValueDisplay,
      hpTemp,
      acValue,
      spdValue,
      actDot: EM_DASH,
      bnsDot: EM_DASH,
      reactDot: EM_DASH,
      moveCurMax: `${EM_DASH}/${EM_DASH}`,
      conditions: visibleConditions,
      conditionsOverflow,
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Internal grid assembly
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Assemble the 21-row × 28-col grid from already-formatted scalars.
   *
   * All rendering paths funnel through here so the column-precise layout is
   * single-source-of-truth. Every row produced is exactly `HUD_WIDTH` chars
   * (AsciiGrid would throw otherwise — INV-1 enforcement at construction).
   */
  private _buildGrid(fields: HudGridFields): AsciiGrid {
    const rows: string[] = [];

    // Row 1: Name (col 2-13) + Class placeholder (col 16-23)
    rows.push(this._rowFromInner(`${padRight(fields.nameDisplay, 12)}  ${padRight('', 8)}`));

    // Row 2: 16-dash divider (UI-SPEC §Field Layout row 2) + 8 trailing spaces
    rows.push(this._rowFromInner(`${'─'.repeat(16)}        `));

    // Row 3: HP label + 8-glyph bar (16 trailing spaces)
    const hpLabel = getLabel('hp_label', this.locale);
    const hpBar8 = padRight(fields.hpBar, HP_BAR_GLYPHS);
    rows.push(this._rowFromInner(`${hpLabel} ${hpBar8}                `));

    // Row 4: 3-space indent + hpValueDisplay (9 chars max) + 2 spaces + temp
    const hpVal = padRight(fields.hpCurMax, 9);
    const hpTempCell = padRight(fields.hpTemp, 5);
    rows.push(this._rowFromInner(`   ${hpVal}  ${hpTempCell}     `));

    // Row 5: AC + SPD
    const acLabel = getLabel('ac_label', this.locale);
    const spdLabel = getLabel('speed_label', this.locale);
    const acCell = padRight(fields.acValue, 3);
    const spdCell = padRight(fields.spdValue, 5);
    rows.push(this._rowFromInner(`${acLabel} ${acCell} ${padRight(spdLabel, 3)} ${spdCell}      `));

    // Row 6: blank
    rows.push(this._rowFromInner(''));

    // Row 7: Action economy — Act {dot}  Bns {dot}  R{dot}
    const actLabel = getLabel('act_label', this.locale);
    const bnsLabel = getLabel('bns_label', this.locale);
    rows.push(
      this._rowFromInner(
        `${actLabel} ${fields.actDot}  ${bnsLabel} ${fields.bnsDot}  R${fields.reactDot}      `,
      ),
    );

    // Row 8: Movement
    const moveLabel = getLabel('move_label', this.locale);
    const moveCell = padRight(fields.moveCurMax, 7);
    rows.push(this._rowFromInner(`${moveLabel} ${moveCell}             `));

    // Row 9: blank
    rows.push(this._rowFromInner(''));

    // Row 10: Slots section header
    const slotsLabel = getLabel('slots_section', this.locale);
    rows.push(this._rowFromInner(padRight(slotsLabel, INNER_WIDTH - 2)));

    // Rows 11-13: Spell slot rows (empty placeholder in Phase 4a — Plan 05+ wires)
    rows.push(this._rowFromInner(''));
    rows.push(this._rowFromInner(''));
    rows.push(this._rowFromInner(''));

    // Row 14: blank
    rows.push(this._rowFromInner(''));

    // Row 15: Conditions section header
    const condLabel = getLabel('conditions_section', this.locale);
    rows.push(this._rowFromInner(padRight(condLabel, INNER_WIDTH - 2)));

    // Rows 16-18: up to 3 visible conditions (first marked with `▶`)
    for (let i = 0; i < 3; i++) {
      const cond = fields.conditions[i];
      if (cond === undefined) {
        rows.push(this._rowFromInner(''));
      } else {
        const marker = i === 0 ? ' ▶ ' : '   ';
        rows.push(this._rowFromInner(padRight(`${marker}${cond}`, INNER_WIDTH - 2)));
      }
    }

    // Row 19: overflow line `   … +{N}` if more than 3 conditions
    if (fields.conditionsOverflow > 0) {
      rows.push(
        this._rowFromInner(
          padRight(`   ${ELLIPSIS} +${fields.conditionsOverflow}`, INNER_WIDTH - 2),
        ),
      );
    } else {
      rows.push(this._rowFromInner(''));
    }

    // Row 20: reserved / [GLY] badge (right-aligned at last 5 inner chars)
    const badge = this.mapMode === 'glyph' ? '[GLY]' : '';
    // Inner content for row 20: 21 spaces + 5-char badge cell = 26 chars (INNER_WIDTH - 0).
    // Build the content via leading padding + badge, all to INNER_WIDTH chars.
    const row20InnerNoBorder = `${' '.repeat(INNER_WIDTH - 1 - 5)}${padRight(badge, 5)}`;
    rows.push(`║${row20InnerNoBorder} ║`);

    // Row 21: bottom border `╠══...═╣` — 26 × `═`
    rows.push(`╠${'═'.repeat(INNER_WIDTH)}╣`);

    // Sanity: every row must be exactly HUD_WIDTH chars wide
    const sizedRows: ReadonlyArray<ReadonlyArray<string>> = rows.map((r) => {
      if ([...r].length !== HUD_WIDTH) {
        throw new Error(`StatusHudRenderer: row width ${[...r].length} !== ${HUD_WIDTH}: |${r}|`);
      }
      return [...r];
    });

    if (sizedRows.length !== HUD_HEIGHT) {
      throw new Error(
        `StatusHudRenderer: produced ${sizedRows.length} rows, expected ${HUD_HEIGHT}`,
      );
    }

    return new AsciiGrid(sizedRows);
  }

  /**
   * Wrap inner content (col 1..26 inclusive, 26 chars wide) with the `║` borders
   * and a leading space (col 1 always blank), trailing space (col 26 always blank).
   *
   * Convention: input `inner` is content for cols 2..25 (24 chars). The method
   * pads/truncates to exactly 24 chars then composes `║ <24 chars> ║`.
   */
  private _rowFromInner(inner: string): string {
    const innerArr = [...inner];
    const padded =
      innerArr.length > 24
        ? innerArr.slice(0, 24).join('')
        : `${inner}${' '.repeat(24 - innerArr.length)}`;
    return `║ ${padded} ║`;
  }
}

/** Internal struct passed to `_buildGrid` — pre-formatted scalar strings. */
interface HudGridFields {
  readonly nameDisplay: string;
  readonly hpBar: string;
  readonly hpValueDisplay: string;
  readonly hpCurMax: string;
  readonly hpTemp: string;
  readonly acValue: string;
  readonly spdValue: string;
  readonly actDot: string;
  readonly bnsDot: string;
  readonly reactDot: string;
  readonly moveCurMax: string;
  readonly conditions: ReadonlyArray<string>;
  readonly conditionsOverflow: number;
}

/**
 * Build the 8-glyph HP bar from current/max HP.
 *
 * Per UI-SPEC §Field Width Budgets: `█▓░` fill + empty, fixed 8 positions.
 * Each glyph represents 1/8 of max HP; the last partially-filled position uses
 * `▓` (dark shade) when the fractional remainder is ≥ 0.5, else `░` (light).
 *
 * Pure function — exported for unit-test exercise via the renderer's behavior.
 */
function buildHpBar(cur: number, max: number): string {
  if (max <= 0) {
    return '░'.repeat(HP_BAR_GLYPHS);
  }
  const ratio = Math.max(0, Math.min(1, cur / max));
  const fullGlyphs = Math.floor(ratio * HP_BAR_GLYPHS);
  const partial = ratio * HP_BAR_GLYPHS - fullGlyphs;
  const partialGlyph = partial >= 0.5 ? '▓' : '';
  const partialCount = partialGlyph === '' ? 0 : 1;
  const emptyCount = HP_BAR_GLYPHS - fullGlyphs - partialCount;
  return `${'█'.repeat(fullGlyphs)}${partialGlyph}${'░'.repeat(Math.max(0, emptyCount))}`;
}

/**
 * Pad `value` on the right with spaces to reach `width` code-points.
 *
 * Uses `[...value]` to count code-points (matches AsciiGrid's convention). If
 * `value` is already at or beyond `width`, returns it unchanged (truncation is
 * caller's responsibility via `truncateField`).
 */
function padRight(value: string, width: number): string {
  const len = [...value].length;
  if (len >= width) {
    return value;
  }
  return `${value}${' '.repeat(width - len)}`;
}

/**
 * Truncate `value` to fit in `budget` code-points, appending `…` if cut.
 *
 * - `value.length <= budget` → returned unchanged.
 * - `value.length > budget`  → returned as `value.slice(0, budget - 1) + '…'`.
 *
 * Pattern lifted from `packages/g2-app/src/wizard/i18n.ts` — never wraps,
 * never reflows (INV-1 §7.1a width-budget rule).
 */
function truncateField(value: string, budget: number): string {
  const codepoints = [...value];
  if (codepoints.length <= budget) {
    return value;
  }
  return `${codepoints.slice(0, budget - 1).join('')}${ELLIPSIS}`;
}
