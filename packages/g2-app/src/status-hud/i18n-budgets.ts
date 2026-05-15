/**
 * Build-time i18n width-budget table for the Status HUD corner card (z=1, col 68-95).
 *
 * Each entry declares the IT/EN/DE localised string for a HUD field plus its `max`
 * character budget. The `as const satisfies Record<string, WidthBudgetRow>` clause is
 * the build-time gate per CONTEXT.md §Area 3: any future translation that breaks the
 * `WidthBudgetRow` shape (missing locale key, non-string value, non-numeric `max`)
 * fails `pnpm typecheck` at the satisfies clause — the production CI gate.
 *
 * The verbatim IT/EN/DE strings are copied from UI-SPEC §i18n Width Budget table.
 * IT strings drive width budgeting (IT canonical per CONTEXT.md §Area 3 fallback rule);
 * EN + DE must fit within the same numeric `max` budget.
 *
 * **B-1 adversarial typecheck (04A-PLAN-CHECK.md):** the colocated
 * `__tests__/i18n-budgets-adversarial.test.ts` spawns `tsc --noEmit` against a
 * fixture file that violates `WidthBudgetRow.max: number` (e.g., `max: 'NotANumber'`)
 * — `tsc` exits non-zero with a `TS2322`/`TS2741`/`TS2769`/`TS2353` error code,
 * proving the `satisfies` gate works adversarially. See SUMMARY §B-1 closure for
 * which TS error code(s) the fixture trips and why a string-length brand was not
 * adopted under TS 5.8.3.
 *
 * Runtime guard `assertWithinBudget` is log-only (truncate-and-warn policy per
 * PATTERNS.md §i18n-budgets.ts) — the renderer truncates with `…` before reaching
 * the bridge; the warning is telemetry only.
 *
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04a-CONTEXT.md §Area 3
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04A-UI-SPEC.md §i18n Width Budget
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04A-PLAN-CHECK.md §B-1
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04A-PATTERNS.md §i18n-budgets.ts
 */

/**
 * Width budget row — one entry per HUD field.
 *
 * `it` / `en` / `de` carry the localised label or value template; `max` is the
 * maximum character width (inclusive of any decoration like `°`). The renderer
 * uses `getLabel(field, locale)` to fetch the string and `assertWithinBudget`
 * to log telemetry on overflow before truncation.
 */
export interface WidthBudgetRow {
  /** Italian (MVP canonical) string. */
  readonly it: string;
  /** English (canonical fallback) string. */
  readonly en: string;
  /** German (INV-1 ck 14 best-effort) string. */
  readonly de: string;
  /** Maximum character width budget across all three locales. */
  readonly max: number;
}

/**
 * Per-HUD-field width budget table.
 *
 * Values verbatim from UI-SPEC §i18n Width Budget (IT/EN/DE per field):
 *
 * | Field                 | IT          | EN          | DE          | max |
 * |-----------------------|-------------|-------------|-------------|-----|
 * | hp_label              | `PF`        | `HP`        | `TP`        | 2   |
 * | ac_label              | `CA`        | `AC`        | `RK`        | 2   |
 * | speed_label           | `VEL`       | `SPD`       | `GES`       | 3   |
 * | conditions_section    | `Condizioni`| `Conditions`| `Zustände`  | 10  |
 * | concentration         | `Concentr.` | `Concentr.` | `Konzentr.` | 10  |
 * | slots_section         | `Slot`      | `Slots`     | `Slots`     | 5   |
 * | move_label            | `Mov`       | `Mov`       | `Bew`       | 3   |
 * | act_label             | `Az.`       | `Act`       | `Akt`       | 3   |
 * | bns_label             | `Bns`       | `Bns`       | `Bns`       | 3   |
 *
 * Note: the German non-ASCII grapheme `Zustände` (Z-u-s-t-ä-n-d-e = 8 visible
 * char-cells; JavaScript `'Zustände'.length === 8` because `ä` is a single BMP
 * code-point) fits within the 10-char budget shared with the longer IT/EN strings.
 *
 * The `as const satisfies Record<string, WidthBudgetRow>` clause is the
 * load-bearing typecheck gate (B-1). Adversarial proof: see
 * `__tests__/i18n-budgets-adversarial.test.ts`.
 */
export const HUD_WIDTH_BUDGETS = {
  hp_label: { it: 'PF', en: 'HP', de: 'TP', max: 2 },
  ac_label: { it: 'CA', en: 'AC', de: 'RK', max: 2 },
  speed_label: { it: 'VEL', en: 'SPD', de: 'GES', max: 3 },
  conditions_section: { it: 'Condizioni', en: 'Conditions', de: 'Zustände', max: 10 },
  concentration: { it: 'Concentr.', en: 'Concentr.', de: 'Konzentr.', max: 10 },
  slots_section: { it: 'Slot', en: 'Slots', de: 'Slots', max: 5 },
  move_label: { it: 'Mov', en: 'Mov', de: 'Bew', max: 3 },
  act_label: { it: 'Az.', en: 'Act', de: 'Akt', max: 3 },
  bns_label: { it: 'Bns', en: 'Bns', de: 'Bns', max: 3 },
} as const satisfies Record<string, WidthBudgetRow>;

/** Supported HUD locales (CONTEXT.md §Area 3 — INV-1 ck 14 stress set). */
export type HudLocale = 'it' | 'en' | 'de';

/** Discriminated keys of the HUD width-budget table. */
export type HudBudgetField = keyof typeof HUD_WIDTH_BUDGETS;

/**
 * Look up the localised label for a HUD field.
 *
 * Always returns a non-empty string — the build-time `satisfies` clause guarantees
 * every `(field, locale)` pair is populated. Use this in the renderer; callers
 * never index `HUD_WIDTH_BUDGETS[field][locale]` directly.
 */
export function getLabel(field: HudBudgetField, locale: HudLocale): string {
  return HUD_WIDTH_BUDGETS[field][locale];
}

/**
 * Look up the numeric budget (max character width) for a HUD field.
 *
 * Use this when truncating a runtime value (e.g., overflowed character name) —
 * the budget is the same across all three locales by construction.
 */
export function getBudget(field: HudBudgetField): number {
  return HUD_WIDTH_BUDGETS[field].max;
}

/**
 * Telemetry-only runtime guard.
 *
 * Logs `console.warn` when `value.length > HUD_WIDTH_BUDGETS[field].max`. The
 * renderer is responsible for truncating with `…` *before* sending to the bridge;
 * this guard is the development-time canary that catches budget regressions
 * during integration (e.g., a Foundry catalog string changed and now overflows).
 *
 * Never throws. Per PATTERNS.md §i18n-budgets.ts truncate-and-warn policy:
 *
 *   `[EVF] i18n-budgets: '<field>' exceeded budget <max>: "<value>"`
 *
 * @param value Rendered string ready to be placed in the HUD cell
 * @param field HUD budget table key
 */
export function assertWithinBudget(value: string, field: HudBudgetField): void {
  const budget = HUD_WIDTH_BUDGETS[field].max;
  if (value.length > budget) {
    console.warn(`[EVF] i18n-budgets: '${field}' exceeded budget ${budget}: "${value}"`);
  }
}
