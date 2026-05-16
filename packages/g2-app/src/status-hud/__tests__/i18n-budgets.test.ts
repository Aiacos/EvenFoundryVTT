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
      // Phase 9 Plan 09-02: also skip keys ending in `.template` (same rationale —
      // placeholder pattern whose rendered length is the load-bearing measurement).
      if (field.endsWith('_template') || field.endsWith('.template')) {
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
  it('IB-ALL-1: HUD_WIDTH_BUDGETS contains 9 Phase 4a + 27 Phase 4b + 98 Phase 5 + 6 Phase 6 Plan-01 + 20 Phase 6 Plan-02 + 11 Phase 6 Plan-03 + 9 Phase 7 Plan-03 + 5 Phase 8 Plan-01 + 5 Phase 8 Plan-02 + 6 Phase 8 Plan-03 + 8 Phase 8 Plan-04 + 4 Phase 9 Plan-02 + 1 Phase 9 Plan-03 = 209 keys', () => {
    // Phase 4b totals: 3 death-saves + 2 toast + 16 boot-error + 6 conc-modal
    // = 27 new keys. Plan summary text said 28 (assumed 17 boot-error keys)
    // but UI-SPEC §4.3 enumerates 16 — see SUMMARY Deviations §Rule-1.
    // Phase 5 totals: 15 Main + 2 Skills + 7 Inv-sheet + 6 Spells-sheet +
    // 6 Feats + 6 Bio + 11 Combat + 13 Log + 5 Inv-panel + 11 Spellbook +
    // 4 empty-states + 5 panel-titles + 5 footer-hints + 2 router = 98 new keys.
    // Phase 6 Plan 01 totals: 6 R1 chip vocabulary keys.
    // Phase 6 Plan 02 totals: 20 QuickActionMenuPanel keys (2 titles + 9 items + 3 hints + 6 R1 chip).
    // Phase 6 Plan 03 totals: 11 per-state chip strings (hud_r1_main, hud_r1_sheet,
    //   hud_r1_combat, hud_r1_log, hud_r1_inv, hud_r1_spell, hud_r1_menu,
    //   hud_r1_boot, hud_r1_boot_error, hud_r1_conc_modal, hud_r1_death_saves).
    //   WR-04 fix: hud_r1_lang_submenu deleted (dead code — INV-4 zero dead code).
    //   The chip is assembled dynamically from quick_r1_lang_{tap,scroll,long} keys.
    // Phase 7 Plan 03 totals: 9 TemplatePlacementPanel keys (tmpl_title, tmpl_spell_label,
    //   tmpl_index_label, tmpl_position_label, tmpl_tap_hint, tmpl_long_hint,
    //   hud_r1_tmpl_scroll, hud_r1_tmpl_tap, hud_r1_tmpl_long).
    // Phase 8 Plan 01 totals: 5 action result error toast keys
    //   (error.action.no-targets, error.action.out-of-range, error.action.out-of-resource,
    //    error.action.wrong-turn, error.action.gm-rejected).
    // Phase 8 Plan 02 totals: 5 TargetPickerPanel keys
    //   (target_picker_title, target_picker_empty_hint, target_picker_hp_label,
    //    target_picker_ac_label, hud_r1_target_picker).
    // Phase 8 Plan 03 totals: 6 ActionOptionsModal keys
    //   (action_options_title, action_options_tap_label_spell, action_options_tap_label_item,
    //    action_options_long_label, action_options_cancel_label, hud_r1_action_options).
    // Phase 8 Plan 04 totals: 8 MoveDirectionPicker + StatusHud movement chip keys
    //   (move_picker_title, move_picker_remaining_template, move_picker_exhausted_hint,
    //    move_picker_confirm_hint, move_picker_cancel_hint, status_hud_movement_label,
    //    hud_r1_move_picker, status_hud_movement_chip_template).
    // Phase 9 Plan 02 totals: 4 action economy widget keys
    //   (econ.reaction.short, econ.multiattack.template,
    //    error.action.already-used-action, error.action.already-used-bonus).
    //   NOTE: econ.action.short and econ.bonus.short reused from Phase 4a (act_label, bns_label).
    // Phase 9 Plan 03 totals: 1 concentration-cancelled error toast key
    //   (error.action.concentration-cancelled).
    // Phase 9 Plan 04 totals: 7 SlotPickerPanel keys
    //   (slot_picker.title, slot_picker.base_level, slot_picker.available_template,
    //    slot_picker.upcast_template, slot_picker.confirm_hint, slot_picker.cancel_hint,
    //    hud_r1_slot_picker).
    expect(Object.keys(HUD_WIDTH_BUDGETS).length).toBe(216);
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

// ─────────────────────────────────────────────────────────────────────────────
// Phase 5 — i18n-budgets extension (98 new keys per UI-SPEC §5.2-§5.11 + §8)
// ─────────────────────────────────────────────────────────────────────────────

describe('Phase 5 i18n-budgets extension + HudLocale widening', () => {
  // ─── Count ────────────────────────────────────────────────────────────────
  it('IB-P5-COUNT: 98 Phase 5 keys added (36 existing + 98 + 6+20+11 Phase 6 = 171 total; WR-04: -1 dead key; +9 P7 +5+5+6 P8 Plans01-03 +8 P8 Plan04 +4 P9 Plan02 +1 P9 Plan03 = 209 total)', () => {
    // Sentinel spot-check — a few representative keys from each UI-SPEC section.
    const PHASE_5_SAMPLE_KEYS = [
      'sheet.ability.str',
      'sheet.ability.cha',
      'sheet.section.abilities',
      'sheet.section.saves',
      'sheet.vitals.hit_dice',
      'sheet.vitals.senses',
      'sheet.skill.prof_legend',
      'sheet.skill.scroll_hint',
      'sheet.inv.mastery_flag',
      'sheet.inv.consumables',
      'sheet.spell.header_title',
      'sheet.spell.filter_bar',
      'sheet.feat.origin_flag',
      'sheet.feat.scroll_hint',
      'sheet.bio.personality',
      'sheet.bio.backstory',
      'combat.tracker.panel_title',
      'combat.tracker.you_marker',
      'combat.tracker.quick_attack',
      'combat.hp_label',
      'log.panel_title',
      'log.result.hit',
      'log.concentrating',
      'inv.panel_title',
      'inv.section.equipped',
      'spell.panel_title',
      'spell.activation.action',
      'combat.empty',
      'log.empty',
      'inv.empty',
      'spell.empty',
      'panel.title.sheet',
      'panel.title.spellbook',
      'footer.hint.sheet',
      'footer.hint.combat',
      'panel_router_zero_panels',
      'panel_cap_denied_template',
    ];
    for (const key of PHASE_5_SAMPLE_KEYS) {
      expect(HUD_WIDTH_BUDGETS, `missing Phase 5 key: ${key}`).toHaveProperty(key);
    }
    // Updated to 171 after Phase 6 Plan 03 (12 per-state chip strings) then WR-04
    // deleted the dead hud_r1_lang_submenu entry (172 - 1 = 171).
    // Updated to 180 after Phase 7 Plan 03 (9 TemplatePlacementPanel keys).
    // Updated to 185 after Phase 8 Plan 01 (5 error.action.* toast keys).
    // Updated to 190 after Phase 8 Plan 02 (5 TargetPickerPanel keys).
    // Updated to 196 after Phase 8 Plan 03 (6 ActionOptionsModal keys).
    // Updated to 204 after Phase 8 Plan 04 (8 MoveDirectionPicker keys).
    // Updated to 208 after Phase 9 Plan 02 (4 action economy widget keys).
    // Updated to 209 after Phase 9 Plan 03 (1 error.action.concentration-cancelled key).
    // Updated to 216 after Phase 9 Plan 04 (7 SlotPickerPanel keys).
    expect(Object.keys(HUD_WIDTH_BUDGETS).length).toBe(216);
  });

  // ─── Sheet Main tab ───────────────────────────────────────────────────────
  it('IB-P5-SHEET-MAIN: sheet.ability.str = FOR/STR/STR @ max 3', () => {
    expect(HUD_WIDTH_BUDGETS['sheet.ability.str'].it).toBe('FOR');
    expect(HUD_WIDTH_BUDGETS['sheet.ability.str'].en).toBe('STR');
    expect(HUD_WIDTH_BUDGETS['sheet.ability.str'].de).toBe('STR');
    expect(HUD_WIDTH_BUDGETS['sheet.ability.str'].max).toBe(3);
    expect(getLabel('sheet.ability.str', 'it')).toBe('FOR');
  });

  // ─── Sheet Skills tab ─────────────────────────────────────────────────────
  it('IB-P5-SHEET-SKILLS: sheet.skill.prof_legend IT verbatim @ max 46', () => {
    expect(HUD_WIDTH_BUDGETS['sheet.skill.prof_legend'].it).toBe(
      '◉ competente · ★ maestria · ○ non addestrato',
    );
    expect(HUD_WIDTH_BUDGETS['sheet.skill.prof_legend'].max).toBe(46);
    expect(getLabel('sheet.skill.prof_legend', 'it')).toBe(
      '◉ competente · ★ maestria · ○ non addestrato',
    );
  });

  // ─── Sheet Inventory tab ──────────────────────────────────────────────────
  it('IB-P5-INVENTORY: sheet.inv.mastery_flag = [M] @ max 3', () => {
    expect(HUD_WIDTH_BUDGETS['sheet.inv.mastery_flag'].it).toBe('[M]');
    expect(HUD_WIDTH_BUDGETS['sheet.inv.mastery_flag'].max).toBe(3);
    expect(getLabel('sheet.inv.mastery_flag', 'it')).toBe('[M]');
  });

  // ─── Spellbook panel ─────────────────────────────────────────────────────
  it('IB-P5-SPELL: spell.activation.action = azione/action/Aktion @ max 6', () => {
    expect(HUD_WIDTH_BUDGETS['spell.activation.action'].it).toBe('azione');
    expect(HUD_WIDTH_BUDGETS['spell.activation.action'].en).toBe('action');
    expect(HUD_WIDTH_BUDGETS['spell.activation.action'].de).toBe('Aktion');
    expect(HUD_WIDTH_BUDGETS['spell.activation.action'].max).toBe(6);
    expect(getLabel('spell.activation.action', 'it')).toBe('azione');
  });

  // ─── Combat tracker panel ────────────────────────────────────────────────
  it('IB-P5-COMBAT: combat.tracker.panel_title = COMBAT TRACKER/KAMPF-TRACKER @ max 15', () => {
    expect(HUD_WIDTH_BUDGETS['combat.tracker.panel_title'].it).toBe('COMBAT TRACKER');
    expect(HUD_WIDTH_BUDGETS['combat.tracker.panel_title'].de).toBe('KAMPF-TRACKER');
    expect(HUD_WIDTH_BUDGETS['combat.tracker.panel_title'].max).toBe(15);
    expect(getLabel('combat.tracker.panel_title', 'it')).toBe('COMBAT TRACKER');
  });

  // ─── Log panel ────────────────────────────────────────────────────────────
  it('IB-P5-LOG: log.result.hit = COLPITO/HIT/TREFFER @ max 8', () => {
    expect(HUD_WIDTH_BUDGETS['log.result.hit'].it).toBe('COLPITO');
    expect(HUD_WIDTH_BUDGETS['log.result.hit'].en).toBe('HIT');
    expect(HUD_WIDTH_BUDGETS['log.result.hit'].de).toBe('TREFFER');
    expect(HUD_WIDTH_BUDGETS['log.result.hit'].max).toBe(8);
    expect(getLabel('log.result.hit', 'it')).toBe('COLPITO');
  });

  // ─── Footer hints ─────────────────────────────────────────────────────────
  it('IB-P5-FOOTER: footer.hint.combat IT verbatim', () => {
    expect(getLabel('footer.hint.combat', 'it')).toBe('scroll=iniziativa  tap=rapida  long=rapida');
  });

  // ─── Empty states ─────────────────────────────────────────────────────────
  it('IB-P5-EMPTY: combat.empty = Nessun combattimento attivo @ max 28', () => {
    expect(HUD_WIDTH_BUDGETS['combat.empty'].it).toBe('Nessun combattimento attivo');
    expect(HUD_WIDTH_BUDGETS['combat.empty'].max).toBe(28);
    expect(getLabel('combat.empty', 'it')).toBe('Nessun combattimento attivo');
  });

  // ─── Best-effort locale fallback ─────────────────────────────────────────
  it('IB-P5-FALLBACK-ES: getLabel(key, "es") returns the EN string', () => {
    expect(getLabel('sheet.ability.str', 'es')).toBe('STR');
    expect(getLabel('log.result.hit', 'es')).toBe('HIT');
    expect(getLabel('combat.empty', 'es')).toBe('No active combat');
  });

  it('IB-P5-FALLBACK-FR: getLabel(key, "fr") returns the EN string', () => {
    expect(getLabel('combat.tracker.panel_title', 'fr')).toBe('COMBAT TRACKER');
    expect(getLabel('spell.activation.action', 'fr')).toBe('action');
  });

  it('IB-P5-FALLBACK-PT-BR: getLabel(key, "pt-br") returns the EN string', () => {
    expect(getLabel('log.panel_title', 'pt-br')).toBe('EVENT LOG');
    expect(getLabel('inv.panel_title', 'pt-br')).toBe('INVENTORY');
  });

  // ─── Canonical DE — not a fallback ───────────────────────────────────────
  it('IB-P5-CANONICAL-DE: getLabel(key, "de") returns the DE string (not EN fallback)', () => {
    // DE is a canonical locale — must return DE string, not EN
    expect(getLabel('sheet.ability.str', 'de')).toBe('STR'); // same as EN for this key
    expect(getLabel('sheet.ability.dex', 'de')).toBe('GES'); // differs from EN (DEX)
    expect(getLabel('combat.tracker.panel_title', 'de')).toBe('KAMPF-TRACKER');
    // This proves DE dispatch is correct, not fallback to EN
    expect(getLabel('sheet.ability.dex', 'de')).not.toBe(getLabel('sheet.ability.dex', 'en'));
  });

  // ─── Regression: canonical locales unchanged ──────────────────────────────
  it('IB-P5-FALLBACK-DOES-NOT-AFFECT-IT-EN-DE: Phase 4a/4b keys return correct locale strings', () => {
    // Phase 4a key — unchanged
    expect(getLabel('hp_label', 'it')).toBe('PF');
    expect(getLabel('hp_label', 'en')).toBe('HP');
    expect(getLabel('hp_label', 'de')).toBe('TP');
    // Phase 4b key — unchanged
    expect(getLabel('death_saves_title', 'it')).toBe('DEATH SAVES');
    expect(getLabel('conc_modal_n_button', 'de')).toBe('[N] Abbrechen');
    // Best-effort fallback on Phase 4a key — returns EN
    expect(getLabel('hp_label', 'es')).toBe('HP');
    expect(getLabel('hp_label', 'pt-br')).toBe('HP');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 9 Plan 09-02 — i18n-budgets extension (4 new keys)
//
// New keys:
//   - econ.reaction.short  (IT 'R'  / EN 'R'  / DE 'R'  / max 1)
//   - econ.multiattack.template  (IT '[Atk {N}/{M}]' / max 12)
//   - error.action.already-used-action  (IT 'Azione già usata' / max 38)
//   - error.action.already-used-bonus   (IT 'Bonus già usato'  / max 38)
//
// NOTE: act_label ('Az.') and bns_label ('Bns') are REUSED from Phase 4a — no
// duplicate keys added. Only the 4 keys above are new.
// ─────────────────────────────────────────────────────────────────────────────

describe('Phase 9 Plan 09-02 — i18n-budgets extension (4 new keys)', () => {
  it('I18N-09-01a: econ.reaction.short = R/R/R @ max 1', () => {
    expect(HUD_WIDTH_BUDGETS['econ.reaction.short'].it).toBe('R');
    expect(HUD_WIDTH_BUDGETS['econ.reaction.short'].en).toBe('R');
    expect(HUD_WIDTH_BUDGETS['econ.reaction.short'].de).toBe('R');
    expect(HUD_WIDTH_BUDGETS['econ.reaction.short'].max).toBe(1);
    expect(getLabel('econ.reaction.short', 'it')).toBe('R');
  });

  it('I18N-09-01b: econ.multiattack.template contains {N} and {M} placeholders @ max 12', () => {
    const row = HUD_WIDTH_BUDGETS['econ.multiattack.template'];
    expect(row.it).toContain('{N}');
    expect(row.it).toContain('{M}');
    expect(row.max).toBe(12);
    // Template keys are exempt from literal-length check (same as `_template` pattern).
    // Rendered output (after {N}/{M} substitution) fits within max (e.g. '[Atk 1/2]' = 9 chars).
    const rendered = row.it.replace('{N}', '1').replace('{M}', '2');
    expect(rendered.length).toBeLessThanOrEqual(row.max);
  });

  it('I18N-09-01c: error.action.already-used-action IT/EN/DE fit within max 38', () => {
    const row = HUD_WIDTH_BUDGETS['error.action.already-used-action'];
    expect(typeof row.it).toBe('string');
    expect(typeof row.en).toBe('string');
    expect(typeof row.de).toBe('string');
    expect(row.max).toBe(38);
    expect(row.it.length).toBeLessThanOrEqual(38);
    expect(row.en.length).toBeLessThanOrEqual(38);
    expect(row.de.length).toBeLessThanOrEqual(38);
    expect(getLabel('error.action.already-used-action', 'it')).toBeDefined();
  });

  it('I18N-09-01d: error.action.already-used-bonus IT/EN/DE fit within max 38', () => {
    const row = HUD_WIDTH_BUDGETS['error.action.already-used-bonus'];
    expect(typeof row.it).toBe('string');
    expect(typeof row.en).toBe('string');
    expect(typeof row.de).toBe('string');
    expect(row.max).toBe(38);
    expect(row.it.length).toBeLessThanOrEqual(38);
    expect(row.en.length).toBeLessThanOrEqual(38);
    expect(row.de.length).toBeLessThanOrEqual(38);
    expect(getLabel('error.action.already-used-bonus', 'it')).toBeDefined();
  });

  it('I18N-09-02: total key count updated to 208 (204 + 4 new Phase 9 Plan 09-02 keys)', () => {
    // 204 existing + 4 new (econ.reaction.short, econ.multiattack.template,
    // error.action.already-used-action, error.action.already-used-bonus) = 208.
    // act_label + bns_label are REUSED from Phase 4a (no new duplicate keys).
    // Note: after Plan 09-03, total is 209 (208 + 1 concentration-cancelled key).
    // Note: after Plan 09-04, total is 216 (209 + 7 SlotPickerPanel keys).
    expect(Object.keys(HUD_WIDTH_BUDGETS).length).toBe(216);
  });
});
