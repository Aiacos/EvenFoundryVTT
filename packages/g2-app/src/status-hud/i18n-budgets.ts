/**
 * Build-time i18n width-budget table for the Status HUD corner card (z=1, col 68-95)
 * AND all Phase 4b new feature surfaces (toast queue z=1.5, boot-error overlay z=2,
 * conc-modal panel z=2, death-saves status HUD pivot z=1).
 *
 * Each entry declares the IT/EN/DE localised string for a HUD field plus its `max`
 * character budget. The `as const satisfies Record<string, WidthBudgetRow>` clause is
 * the build-time gate per CONTEXT.md §Area 3: any future translation that breaks the
 * `WidthBudgetRow` shape (missing locale key, non-string value, non-numeric `max`)
 * fails `pnpm typecheck` at the satisfies clause — the production CI gate.
 *
 * The verbatim IT/EN/DE strings are copied from UI-SPEC §i18n Width Budget (Phase 4a
 * 9 keys) + 04B-UI-SPEC.md §4.1-§4.4 (Phase 4b 28 keys). IT strings drive width
 * budgeting (IT canonical per CONTEXT.md §Area 3 fallback rule); EN + DE must fit
 * within the same numeric `max` budget.
 *
 * **Phase 4b additions (Plan 01 Wave-0 centralisation):** 28 new keys landed
 * atomically in Wave 0 so downstream plans (TOAST-01 / Plan 03, BOOT-01 / Plan 04,
 * DEATH-01 + CONC-01 / Plan 05) are READ-ONLY consumers of this table — no
 * same-wave file-overlap conflicts.
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
 * @see .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-UI-SPEC.md §4.1-§4.4 (Phase 4b additions)
 * @see .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-01-PLAN.md Task 3
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
  // ─── Phase 4a — Status HUD corner card (9 keys) ──────────────────────────
  hp_label: { it: 'PF', en: 'HP', de: 'TP', max: 2 },
  ac_label: { it: 'CA', en: 'AC', de: 'RK', max: 2 },
  speed_label: { it: 'VEL', en: 'SPD', de: 'GES', max: 3 },
  conditions_section: { it: 'Condizioni', en: 'Conditions', de: 'Zustände', max: 10 },
  concentration: { it: 'Concentr.', en: 'Concentr.', de: 'Konzentr.', max: 10 },
  slots_section: { it: 'Slot', en: 'Slots', de: 'Slots', max: 5 },
  move_label: { it: 'Mov', en: 'Mov', de: 'Bew', max: 3 },
  act_label: { it: 'Az.', en: 'Act', de: 'Akt', max: 3 },
  bns_label: { it: 'Bns', en: 'Bns', de: 'Bns', max: 3 },

  // ─── Phase 4b §4.1 — Death-saves pivot (3 keys, Plan 05 consumer) ────────
  death_saves_title: { it: 'DEATH SAVES', en: 'DEATH SAVES', de: 'RETTUNG GG. TOD', max: 16 },
  death_saves_passes_label: { it: 'Riusciti', en: 'Passes', de: 'Erfolge', max: 8 },
  death_saves_fails_label: { it: 'Falliti', en: 'Fails', de: 'Misserfolge', max: 11 },

  // ─── Phase 4b §4.2 — Toast queue (2 keys, Plan 03 consumer) ──────────────
  toast_squash_badge_template: { it: '[+{n}]', en: '[+{n}]', de: '[+{n}]', max: 5 },
  toast_row_padding_target: { it: '', en: '', de: '', max: 42 },

  // ─── Phase 4b §4.3 — Boot-error UI (17 keys, Plan 04 consumer) ───────────
  boot_error_title_handshake: {
    it: 'HANDSHAKE FALLITO',
    en: 'HANDSHAKE FAILED',
    de: 'HANDSHAKE FEHLGESCHLAGEN',
    max: 24,
  },
  boot_error_title_version: {
    it: 'VERSIONE INCOMPATIBILE',
    en: 'VERSION MISMATCH',
    de: 'VERSION INKOMPATIBEL',
    max: 24,
  },
  boot_error_title_no_char: {
    it: 'NESSUN PERSONAGGIO',
    en: 'NO CHARACTER',
    de: 'KEIN CHARAKTER',
    max: 24,
  },
  boot_error_title_bridge: {
    it: 'BRIDGE NON RAGGIUNGIBILE',
    en: 'BRIDGE UNREACHABLE',
    de: 'BRIDGE NICHT ERREICHBAR',
    max: 24,
  },
  boot_error_title_token: {
    it: 'TOKEN SCADUTO',
    en: 'TOKEN EXPIRED',
    de: 'TOKEN ABGELAUFEN',
    max: 24,
  },
  boot_error_hint_handshake_1: {
    it: 'Risposta del bridge non valida.',
    en: 'Bridge response was invalid.',
    de: 'Bridge-Antwort ungültig.',
    max: 50,
  },
  boot_error_hint_handshake_2: {
    it: 'Verifica versione del modulo.',
    en: 'Check module version.',
    de: 'Modulversion prüfen.',
    max: 50,
  },
  boot_error_hint_version_1: {
    it: 'Il bridge parla un protocollo diverso.',
    en: 'Bridge speaks a different protocol.',
    de: 'Bridge nutzt anderes Protokoll.',
    max: 50,
  },
  boot_error_hint_version_2: {
    it: 'Aggiorna il modulo Foundry.',
    en: 'Update the Foundry module.',
    de: 'Foundry-Modul aktualisieren.',
    max: 50,
  },
  boot_error_hint_no_char_1: {
    it: 'Nessun PG assegnato a questo player.',
    en: 'No PC assigned to this player.',
    de: 'Kein SC zugewiesen.',
    max: 50,
  },
  boot_error_hint_no_char_2: {
    it: 'Assegna un PG da Foundry.',
    en: 'Assign one from Foundry.',
    de: 'Einen SC in Foundry zuweisen.',
    max: 50,
  },
  boot_error_hint_bridge_1: {
    it: 'Connessione al bridge fallita.',
    en: 'Connection to bridge failed.',
    de: 'Bridge-Verbindung fehlgeschlagen.',
    max: 50,
  },
  boot_error_hint_bridge_2: {
    it: 'Verifica URL e rete LAN.',
    en: 'Check URL and LAN.',
    de: 'URL und LAN prüfen.',
    max: 50,
  },
  boot_error_hint_token_1: {
    it: 'La sessione è scaduta (24h).',
    en: 'Session expired (24h).',
    de: 'Sitzung abgelaufen (24h).',
    max: 50,
  },
  boot_error_hint_token_2: {
    it: 'Riaccoppia con un nuovo QR.',
    en: 'Re-pair via the QR.',
    de: 'Neu pairen via QR.',
    max: 50,
  },
  boot_error_close_label: {
    it: '[X] Chiudi',
    en: '[X] Close',
    de: '[X] Schließen',
    max: 14,
  },

  // ─── Phase 4b §4.4 — Conc-modal (6 keys, Plan 05 consumer) ───────────────
  conc_modal_title: {
    it: 'CONCENTRATION CONFLICT',
    en: 'CONCENTRATION CONFLICT',
    de: 'KONZENTRATIONSKONFLIKT',
    max: 26,
  },
  conc_modal_active_label: {
    it: 'Spell attivo:',
    en: 'Active spell:',
    de: 'Aktiver Zauber:',
    max: 16,
  },
  conc_modal_casting_template: {
    it: 'Castando {name} verrà rimosso.',
    en: 'Casting {name} will drop it.',
    de: '{name} wirken lässt ihn fallen.',
    max: 50,
  },
  conc_modal_confirm_question: {
    it: 'Continuare?',
    en: 'Continue?',
    de: 'Fortfahren?',
    max: 12,
  },
  conc_modal_y_button_template: {
    it: '[Y] Drop & cast {name}',
    en: '[Y] Drop & cast {name}',
    de: '[Y] Ablegen & wirken {name}',
    max: 30,
  },
  conc_modal_n_button: {
    it: '[N] Cancel',
    en: '[N] Cancel',
    de: '[N] Abbrechen',
    max: 14,
  },
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
