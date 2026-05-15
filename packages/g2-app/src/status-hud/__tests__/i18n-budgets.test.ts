/**
 * Unit tests for HUD_WIDTH_BUDGETS const-as-truth table + assertWithinBudget +
 * getLabel runtime helpers (Phase 4a Plan 04 Task 1).
 *
 * Covers (per 04A-04-PLAN.md `<behavior>` IB-1..IB-5):
 *   - IB-1: verbatim IT/EN/DE strings for hp_label + correct max
 *   - IB-2: DE non-ASCII grapheme `Zustände` round-trips through the table
 *   - IB-3: structural compile-time guard (validated at the source level: the file
 *           contains `satisfies Record` so `pnpm typecheck` fails on shape drift)
 *   - IB-4: assertWithinBudget telemetry — no throw under budget, warn on overflow
 *   - IB-5: getLabel returns the per-locale string round-trip
 *
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04A-04-PLAN.md Task 1
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04a-CONTEXT.md §Area 3
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { assertWithinBudget, getBudget, getLabel, HUD_WIDTH_BUDGETS } from '../i18n-budgets.js';

describe('HUD_WIDTH_BUDGETS — verbatim UI-SPEC table', () => {
  it('IB-1: hp_label = PF/HP/TP @ max 2', () => {
    expect(HUD_WIDTH_BUDGETS.hp_label.it).toBe('PF');
    expect(HUD_WIDTH_BUDGETS.hp_label.en).toBe('HP');
    expect(HUD_WIDTH_BUDGETS.hp_label.de).toBe('TP');
    expect(HUD_WIDTH_BUDGETS.hp_label.max).toBe(2);
  });

  it('IB-2: conditions_section DE grapheme = Zustände @ max 10 (8 BMP chars)', () => {
    expect(HUD_WIDTH_BUDGETS.conditions_section.de).toBe('Zustände');
    expect(HUD_WIDTH_BUDGETS.conditions_section.max).toBe(10);
    // The German label fits under the IT/EN budget (Condizioni=10, Conditions=10)
    expect('Zustände'.length).toBeLessThanOrEqual(HUD_WIDTH_BUDGETS.conditions_section.max);
  });

  it('IB-3: every entry satisfies WidthBudgetRow shape (it/en/de:string + max:number)', () => {
    // Structural check at runtime — the load-bearing gate is the `satisfies`
    // clause at compile time (verified by pnpm typecheck). This runtime
    // assertion is a safety net that proves the static guard's intent.
    //
    // Phase 4b refinement: keys ending in `_template` carry a placeholder
    // pattern (`{n}` / `{name}`) whose RENDERED length is the load-bearing
    // measurement, not the template length itself. The runtime renderer
    // substitutes the placeholder before `assertWithinBudget` runs. We
    // skip the literal length check for `*_template` keys here.
    for (const [field, row] of Object.entries(HUD_WIDTH_BUDGETS)) {
      expect(typeof row.it).toBe('string');
      expect(typeof row.en).toBe('string');
      expect(typeof row.de).toBe('string');
      expect(typeof row.max).toBe('number');
      if (field.endsWith('_template')) {
        continue;
      }
      // Every non-template locale string must fit within max — this is the
      // human-authored invariant the `satisfies` brand would catch if a
      // brand were feasible.
      expect(row.it.length, `${field}.it`).toBeLessThanOrEqual(row.max);
      expect(row.en.length, `${field}.en`).toBeLessThanOrEqual(row.max);
      expect(row.de.length, `${field}.de`).toBeLessThanOrEqual(row.max);
    }
  });
});

describe('assertWithinBudget — telemetry-only guard', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('IB-4a: under-budget value does NOT warn', () => {
    assertWithinBudget('Condiz...', 'conditions_section'); // length 9, max 10
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('IB-4b: at-budget value does NOT warn', () => {
    assertWithinBudget('Condizioni', 'conditions_section'); // length 10, max 10
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('IB-4c: over-budget value warns with field + budget + value in message', () => {
    assertWithinBudget('ConditionsLong', 'conditions_section'); // length 14 > 10
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const arg = warnSpy.mock.calls[0]?.[0];
    expect(typeof arg).toBe('string');
    expect(arg).toContain('conditions_section');
    expect(arg).toContain('10'); // budget
    expect(arg).toContain('ConditionsLong');
  });

  it('IB-4d: never throws on overflow (truncate-and-warn policy)', () => {
    expect(() => assertWithinBudget('XXXXXXXXXXXXXXXX', 'hp_label')).not.toThrow();
  });
});

describe('getLabel / getBudget — per-locale lookup', () => {
  it('IB-5a: getLabel returns the per-locale string', () => {
    expect(getLabel('hp_label', 'it')).toBe('PF');
    expect(getLabel('hp_label', 'en')).toBe('HP');
    expect(getLabel('hp_label', 'de')).toBe('TP');
    expect(getLabel('speed_label', 'it')).toBe('VEL');
    expect(getLabel('concentration', 'de')).toBe('Konzentr.');
  });

  it('IB-5b: getBudget returns the numeric max budget', () => {
    expect(getBudget('hp_label')).toBe(2);
    expect(getBudget('conditions_section')).toBe(10);
    expect(getBudget('move_label')).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 4b — i18n-budgets extension (28 new keys per UI-SPEC §4.1-§4.4)
// ─────────────────────────────────────────────────────────────────────────────

/** Every Phase 4b new key, in UI-SPEC §4.1-§4.4 declaration order. */
const PHASE_4B_KEYS = [
  // §4.1 death-saves pivot (3)
  'death_saves_title',
  'death_saves_passes_label',
  'death_saves_fails_label',
  // §4.2 toast queue (2)
  'toast_squash_badge_template',
  'toast_row_padding_target',
  // §4.3 boot-error UI (17)
  'boot_error_title_handshake',
  'boot_error_title_version',
  'boot_error_title_no_char',
  'boot_error_title_bridge',
  'boot_error_title_token',
  'boot_error_hint_handshake_1',
  'boot_error_hint_handshake_2',
  'boot_error_hint_version_1',
  'boot_error_hint_version_2',
  'boot_error_hint_no_char_1',
  'boot_error_hint_no_char_2',
  'boot_error_hint_bridge_1',
  'boot_error_hint_bridge_2',
  'boot_error_hint_token_1',
  'boot_error_hint_token_2',
  'boot_error_close_label',
  // §4.4 conc-modal (6)
  'conc_modal_title',
  'conc_modal_active_label',
  'conc_modal_casting_template',
  'conc_modal_confirm_question',
  'conc_modal_y_button_template',
  'conc_modal_n_button',
] as const;

describe('Phase 4b i18n-budgets extension (28 new keys)', () => {
  // ─── Death-saves pivot ────────────────────────────────────────────────────
  it('IB-DS-1: death_saves_title = DEATH SAVES @ max 16', () => {
    expect(HUD_WIDTH_BUDGETS.death_saves_title.it).toBe('DEATH SAVES');
    expect(HUD_WIDTH_BUDGETS.death_saves_title.en).toBe('DEATH SAVES');
    expect(HUD_WIDTH_BUDGETS.death_saves_title.de).toBe('RETTUNG GG. TOD');
    expect(HUD_WIDTH_BUDGETS.death_saves_title.max).toBe(16);
  });

  it('IB-DS-2: death_saves_passes_label DE = Erfolge', () => {
    expect(HUD_WIDTH_BUDGETS.death_saves_passes_label.de).toBe('Erfolge');
  });

  it('IB-DS-3: death_saves_fails_label IT = Falliti @ max 11', () => {
    expect(HUD_WIDTH_BUDGETS.death_saves_fails_label.it).toBe('Falliti');
    expect(HUD_WIDTH_BUDGETS.death_saves_fails_label.max).toBe(11);
  });

  // ─── Toast queue ─────────────────────────────────────────────────────────
  it('IB-TQ-1: toast_squash_badge_template = [+{n}] @ max 5', () => {
    expect(HUD_WIDTH_BUDGETS.toast_squash_badge_template.it).toBe('[+{n}]');
    expect(HUD_WIDTH_BUDGETS.toast_squash_badge_template.max).toBe(5);
  });

  it('IB-TQ-2: toast_row_padding_target max = 42', () => {
    expect(HUD_WIDTH_BUDGETS.toast_row_padding_target.max).toBe(42);
  });

  // ─── Boot-error UI ────────────────────────────────────────────────────────
  it('IB-BE-1: boot_error_title_handshake IT = HANDSHAKE FALLITO @ max 24', () => {
    expect(HUD_WIDTH_BUDGETS.boot_error_title_handshake.it).toBe('HANDSHAKE FALLITO');
    expect(HUD_WIDTH_BUDGETS.boot_error_title_handshake.max).toBe(24);
  });

  it('IB-BE-2: boot_error_hint_handshake_1 IT verbatim @ max 50', () => {
    expect(HUD_WIDTH_BUDGETS.boot_error_hint_handshake_1.it).toBe(
      'Risposta del bridge non valida.',
    );
    expect(HUD_WIDTH_BUDGETS.boot_error_hint_handshake_1.max).toBe(50);
  });

  it('IB-BE-3: boot_error_close_label IT = [X] Chiudi @ max 14', () => {
    expect(HUD_WIDTH_BUDGETS.boot_error_close_label.it).toBe('[X] Chiudi');
    expect(HUD_WIDTH_BUDGETS.boot_error_close_label.max).toBe(14);
  });

  it('IB-BE-4: all 16 boot-error keys exist in HUD_WIDTH_BUDGETS', () => {
    // 5 title keys + 10 hint keys (5 pairs ×2) + 1 close label = 16.
    // Plan summary text said "17 keys" but the UI-SPEC §4.3 table enumerates
    // 16 rows verbatim — we follow UI-SPEC (the design contract). See SUMMARY
    // Deviations §Rule-1 for the rationale.
    const bootErrorKeys = PHASE_4B_KEYS.filter((k) => k.startsWith('boot_error_'));
    expect(bootErrorKeys.length).toBe(16);
    for (const key of bootErrorKeys) {
      expect(HUD_WIDTH_BUDGETS, `missing ${key}`).toHaveProperty(key);
    }
  });

  // ─── Conc-modal ──────────────────────────────────────────────────────────
  it('IB-CM-1: conc_modal_title = CONCENTRATION CONFLICT @ max 26', () => {
    expect(HUD_WIDTH_BUDGETS.conc_modal_title.it).toBe('CONCENTRATION CONFLICT');
    expect(HUD_WIDTH_BUDGETS.conc_modal_title.max).toBe(26);
  });

  it('IB-CM-2: conc_modal_n_button DE = [N] Abbrechen @ max 14', () => {
    expect(HUD_WIDTH_BUDGETS.conc_modal_n_button.de).toBe('[N] Abbrechen');
    expect(HUD_WIDTH_BUDGETS.conc_modal_n_button.max).toBe(14);
  });

  it('IB-CM-3: conc_modal_y_button_template IT = [Y] Drop & cast {name} @ max 30', () => {
    expect(HUD_WIDTH_BUDGETS.conc_modal_y_button_template.it).toBe('[Y] Drop & cast {name}');
    expect(HUD_WIDTH_BUDGETS.conc_modal_y_button_template.max).toBe(30);
  });

  // ─── Aggregate shape ──────────────────────────────────────────────────────
  it('IB-ALL-1: HUD_WIDTH_BUDGETS contains 9 Phase 4a + 27 Phase 4b = 36 keys', () => {
    // Phase 4b totals: 3 death-saves + 2 toast + 16 boot-error + 6 conc-modal
    // = 27 new keys. Plan summary text said 28 (assumed 17 boot-error keys)
    // but UI-SPEC §4.3 enumerates 16 — see SUMMARY Deviations §Rule-1.
    expect(Object.keys(HUD_WIDTH_BUDGETS).length).toBe(36);
  });

  it('IB-ALL-2: every Phase 4b key is present (parametric)', () => {
    for (const key of PHASE_4B_KEYS) {
      expect(HUD_WIDTH_BUDGETS, `missing key: ${key}`).toHaveProperty(key);
    }
  });

  it('IB-ALL-3: every Phase 4b key has it/en/de strings + max number', () => {
    for (const key of PHASE_4B_KEYS) {
      const row = HUD_WIDTH_BUDGETS[key];
      expect(typeof row.it, `${key}.it`).toBe('string');
      expect(typeof row.en, `${key}.en`).toBe('string');
      expect(typeof row.de, `${key}.de`).toBe('string');
      expect(typeof row.max, `${key}.max`).toBe('number');
    }
  });
});
