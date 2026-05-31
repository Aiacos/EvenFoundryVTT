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
 * **Phase 4b additions (Plan 01 Wave-0 centralisation):** 27 new keys landed
 * atomically in Wave 0 so downstream plans (TOAST-01 / Plan 03, BOOT-01 / Plan 04,
 * DEATH-01 + CONC-01 / Plan 05) are READ-ONLY consumers of this table — no
 * same-wave file-overlap conflicts.
 *
 * **Phase 5 additions (Plan 05-01 Wave-0 centralisation):** ~82 new keys spanning
 * CharacterSheet (Main+Skills+Inv+Spells+Feats+Bio), CombatTracker, LogPanel,
 * InventoryPanel, SpellbookPanel, empty states, panel titles, footer hints, and
 * PanelRouter boot-error states. Downstream plans 05-02..05-06 are READ-ONLY
 * consumers of this extension — Wave-0 atomic fan-out pattern (Phase 4b Plan 01
 * playbook).
 *
 * **HudLocale widened (Plan 05-01):** type now includes 'es' | 'fr' | 'pt-br' as
 * best-effort locales. `getLabel()` returns the EN string for best-effort keys
 * (per-key fallback per I18N-05). Canonical locales (it/en/de) unchanged.
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
  // ─── Phase 5 — Panel keys (Plan 05-01 Wave-0 centralisation) ────────────
  // All IT/EN/DE strings verbatim from 05-UI-SPEC.md §5.2-§5.11 + §8.1-§8.4.
  // Downstream plans 05-02..05-06 are READ-ONLY consumers of this table.

  // §5.2 Sheet Main tab — 15 keys
  'sheet.ability.str': { it: 'FOR', en: 'STR', de: 'STR', max: 3 },
  'sheet.ability.dex': { it: 'DES', en: 'DEX', de: 'GES', max: 3 },
  'sheet.ability.con': { it: 'COS', en: 'CON', de: 'KON', max: 3 },
  'sheet.ability.int': { it: 'INT', en: 'INT', de: 'INT', max: 3 },
  'sheet.ability.wis': { it: 'SAG', en: 'WIS', de: 'WEI', max: 3 },
  'sheet.ability.cha': { it: 'CAR', en: 'CHA', de: 'CHA', max: 3 },
  'sheet.section.abilities': {
    it: 'CARATTERISTICHE',
    en: 'ABILITIES',
    de: 'ATTRIBUTE',
    max: 16,
  },
  'sheet.section.saves': {
    it: 'TIRI SALVEZZA',
    en: 'SAVING THROWS',
    de: 'RETTUNGSWÜRFE',
    max: 14,
  },
  'sheet.vitals.hp': { it: 'PF', en: 'HP', de: 'TP', max: 2 },
  'sheet.vitals.ac': { it: 'CA', en: 'AC', de: 'RK', max: 2 },
  'sheet.vitals.init': { it: 'INI', en: 'INI', de: 'INI', max: 3 },
  'sheet.vitals.speed': { it: 'VEL', en: 'SPD', de: 'GES', max: 3 },
  'sheet.vitals.prof': { it: 'COMP', en: 'PROF', de: 'PROF', max: 4 },
  'sheet.vitals.hit_dice': {
    it: 'Dadi Vita',
    en: 'Hit Dice',
    de: 'Trefferwürfel',
    max: 14,
  },
  'sheet.vitals.senses': { it: 'Sensi', en: 'Senses', de: 'Sinne', max: 6 },

  // §5.3 Sheet Skills tab — 2 keys
  'sheet.skill.prof_legend': {
    it: '◉ competente · ★ maestria · ○ non addestrato',
    en: '◉ proficient · ★ expertise · ○ untrained',
    de: '◉ geübt · ★ expertise · ○ ungeübt',
    max: 46,
  },
  'sheet.skill.scroll_hint': {
    it: '▼ scroll per altre · scroll-tap = tira abilità',
    en: '▼ scroll for more · R1 scroll-tap = roll skill',
    de: '▼ scrollen für mehr · scroll-tap = würfeln',
    max: 48,
  },

  // §5.4 Sheet Inventory tab — 7 keys
  'sheet.inv.currency': { it: '◈ Monete', en: '◈ Currency', de: '◈ Währung', max: 11 },
  'sheet.inv.carried': { it: '⚖ Portato', en: '⚖ Carried', de: '⚖ Getragen', max: 11 },
  'sheet.inv.equipped': {
    it: '◆ EQUIPAGGIAMENTO',
    en: '◆ EQUIPPED',
    de: '◆ AUSGERÜSTET',
    max: 18,
  },
  'sheet.inv.consumables': {
    it: '◆ CONSUMABILI',
    en: '◆ CONSUMABLES',
    de: '◆ VERBRAUCHSMITTEL',
    max: 19,
  },
  'sheet.inv.equipment': { it: '◆ OGGETTI', en: '◆ EQUIPMENT', de: '◆ AUSRÜSTUNG', max: 13 },
  'sheet.inv.container': {
    it: '◆ CONTENITORE',
    en: '◆ CONTAINER',
    de: '◆ BEHÄLTER',
    max: 14,
  },
  'sheet.inv.mastery_flag': { it: '[M]', en: '[M]', de: '[M]', max: 3 },

  // §5.5 Sheet Spells tab — 6 keys
  'sheet.spell.header_title': {
    it: 'Incantesimi',
    en: 'Spellcasting',
    de: 'Zauberei',
    max: 12,
  },
  'sheet.spell.prepared_label': { it: 'Prep', en: 'Prep', de: 'Vor.', max: 4 },
  'sheet.spell.filter_bar': {
    it: 'Filtro [▶TUTTI]  Preparati · Cantrip · Conc. · Rituale',
    en: 'Filter [▶ALL]  Prepared · Cantrips · Concentration · Ritual',
    de: 'Filter [▶ALLE]  Vorbereitet · Cantrips · Konz. · Ritual',
    max: 60,
  },
  'sheet.spell.cantrips_section': {
    it: '◇ CANTRIP  ────── (sempre)',
    en: '◇ CANTRIPS  ────── (at-will)',
    de: '◇ ZAUBERTRICKS  ────── (immer)',
    max: 30,
  },
  'sheet.spell.level_section': { it: '◇ LIVELLO N', en: '◇ LEVEL N', de: '◇ GRAD N', max: 11 },
  'sheet.spell.scroll_hint': {
    it: '▼ scroll · ↑in cima = lancia',
    en: '▼ scroll · ↑top = cast',
    de: '▼ scrollen · ↑oben = zaubern',
    max: 34,
  },

  // §5.6 Sheet Feats tab — 6 keys
  'sheet.feat.class_section': {
    it: '◆ CLASSE ·',
    en: '◆ CLASS ·',
    de: '◆ KLASSE ·',
    max: 11,
  },
  'sheet.feat.race_section': { it: '◆ RAZZA ·', en: '◆ RACE ·', de: '◆ RASSE ·', max: 10 },
  'sheet.feat.background_section': {
    it: '◆ BACKGROUND ·',
    en: '◆ BACKGROUND ·',
    de: '◆ HINTERGRUND ·',
    max: 16,
  },
  'sheet.feat.feats_section': { it: '◆ TALENTI', en: '◆ FEATS', de: '◆ TALENTE', max: 10 },
  'sheet.feat.origin_flag': { it: '[Origine]', en: '[Origin]', de: '[Ursprung]', max: 10 },
  'sheet.feat.scroll_hint': {
    it: '▼ scroll · tap = usa abilità',
    en: '▼ scroll · tap on item = use feature',
    de: '▼ scrollen · tap = Fähigkeit nutzen',
    max: 37,
  },

  // §5.7 Sheet Bio tab — 6 keys
  'sheet.bio.personality': {
    it: '◇ Tratti di personalità',
    en: '◇ Personality Traits',
    de: '◇ Persönlichkeitsmerkmale',
    max: 26,
  },
  'sheet.bio.ideal': { it: '◇ Ideale', en: '◇ Ideal', de: '◇ Ideal', max: 8 },
  'sheet.bio.bond': { it: '◇ Legame', en: '◇ Bond', de: '◇ Bindung', max: 9 },
  'sheet.bio.flaw': { it: '◇ Difetto', en: '◇ Flaw', de: '◇ Schwäche', max: 10 },
  'sheet.bio.backstory': {
    it: '◇ Storia',
    en: '◇ Backstory',
    de: '◇ Hintergrundgeschichte',
    max: 24,
  },
  'sheet.bio.scroll_hint': {
    it: '▼ scroll per altro · tap×2 = chiudi',
    en: '▼ scroll for more · tap×2 = close',
    de: '▼ scrollen für mehr · tap×2 = schließen',
    max: 45,
  },

  // §5.8 Combat Tracker panel — 11 keys
  'combat.tracker.panel_title': {
    it: 'COMBAT TRACKER',
    en: 'COMBAT TRACKER',
    de: 'KAMPF-TRACKER',
    max: 15,
  },
  'combat.tracker.effects_section': {
    it: 'Effetti attivi:',
    en: 'Active effects:',
    de: 'Aktive Effekte:',
    max: 16,
  },
  'combat.tracker.you_marker': { it: '◀ TU', en: '◀ YOU', de: '◀ DU', max: 6 },
  'combat.tracker.party_label': { it: '(gruppo)', en: '(party)', de: '(Gruppe)', max: 8 },
  'combat.tracker.quick_label': { it: 'Rapida:', en: 'Quick:', de: 'Schnell:', max: 9 },
  'combat.tracker.quick_attack': { it: 'ttacco', en: 'ttack', de: 'ngriff', max: 6 },
  'combat.tracker.quick_spell': { it: 'pell', en: 'pell', de: 'zauber', max: 6 },
  'combat.tracker.quick_item': { it: 'tem', en: 'tem', de: 'tem', max: 3 },
  'combat.tracker.quick_move': { it: 'ovi', en: 'ove', de: 'ew', max: 3 },
  'combat.hp_label': { it: 'PF', en: 'HP', de: 'TP', max: 2 },
  'combat.ac_label': { it: 'CA', en: 'AC', de: 'RK', max: 2 },

  // §5.9 Log panel — 13 keys
  'log.panel_title': {
    it: 'REGISTRO EVENTI',
    en: 'EVENT LOG',
    de: 'EREIGNISPROTOKOLL',
    max: 18,
  },
  'log.filter.all': { it: '[TUTTI]', en: '[ALL]', de: '[ALLE]', max: 7 },
  'log.filter.rolls': { it: 'Tiri', en: 'Rolls', de: 'Würfe', max: 5 },
  'log.filter.damage': { it: 'Danni', en: 'Damage', de: 'Schaden', max: 7 },
  'log.filter.status': { it: 'Stato', en: 'Status', de: 'Status', max: 6 },
  'log.filter.chat': { it: 'Chat', en: 'Chat', de: 'Chat', max: 4 },
  'log.result.hit': { it: 'COLPITO', en: 'HIT', de: 'TREFFER', max: 8 },
  'log.result.miss': { it: 'MANCATO', en: 'MISS', de: 'VERFEHLT', max: 9 },
  'log.result.pass': { it: 'SUPERATO', en: 'PASS', de: 'BESTANDEN', max: 10 },
  'log.result.fail': { it: 'FALLITO', en: 'FAIL', de: 'MISSLUNGEN', max: 11 },
  'log.concentrating': {
    it: 'CONCENTRANDO',
    en: 'CONCENTRATING',
    de: 'KONZENTRIERT',
    max: 14,
  },
  'log.round_marker': {
    it: '── ROUND N inizia ──',
    en: '── ROUND N begins ──',
    de: '── RUNDE N beginnt ──',
    max: 22,
  },
  'log.scroll_hint': {
    it: '▼ scroll per i più vecchi',
    en: '▼ scroll for older',
    de: '▼ scrollen für ältere',
    max: 26,
  },

  // §5.10 Inventory standalone panel — 5 keys
  'inv.panel_title': { it: 'INVENTARIO', en: 'INVENTORY', de: 'INVENTAR', max: 11 },
  'inv.section.equipped': {
    it: 'EQUIPAGGIAMENTO',
    en: 'EQUIPPED',
    de: 'AUSGERÜSTET',
    max: 16,
  },
  'inv.section.consumables': {
    it: 'CONSUMABILI',
    en: 'CONSUMABLES',
    de: 'VERBRAUCHSMITTEL',
    max: 17,
  },
  'inv.section.carried': { it: 'PORTATO', en: 'CARRIED', de: 'GETRAGEN', max: 8 },
  'inv.scroll_hint': {
    it: '▼ scroll per altro',
    en: '▼ scroll for more',
    de: '▼ scrollen für mehr',
    max: 22,
  },

  // §5.11 Spellbook standalone panel — 11 keys
  'spell.panel_title': {
    it: 'LIBRO INCANTESIMI',
    en: 'SPELLBOOK',
    de: 'ZAUBERBUCH',
    max: 18,
  },
  'spell.prepared_count': {
    it: 'preparati',
    en: 'prepared',
    de: 'vorbereitet',
    max: 12,
  },
  'spell.cantrips_section': {
    it: 'CANTRIP',
    en: 'CANTRIPS',
    de: 'ZAUBERTRICKS',
    max: 13,
  },
  'spell.level_section': {
    it: 'L{N}   slot',
    en: 'L{N}   slots',
    de: 'G{N}   Sl.',
    max: 12,
  },
  'spell.available_marker': {
    it: '← disponibili',
    en: '← available',
    de: '← verfügbar',
    max: 15,
  },
  'spell.activation.action': { it: 'azione', en: 'action', de: 'Aktion', max: 6 },
  'spell.activation.reaction': { it: 'reaziN', en: 'reactN', de: 'ReaktN', max: 6 },
  'spell.activation.bonus': { it: 'bonusA', en: 'bonusA', de: 'BonusA', max: 6 },
  'spell.activation.ritual': { it: 'ritual', en: 'ritual', de: 'ritual', max: 6 },
  'spell.cursor_marker': { it: '▶', en: '▶', de: '▶', max: 1 },
  'spell.scroll_hint': {
    it: '▼ scroll · ↑in cima = lancia',
    en: '▼ scroll · ↑top = cast',
    de: '▼ scrollen · ↑oben = zaubern',
    max: 34,
  },

  // §8.1 Empty states — 4 keys
  'combat.empty': {
    it: 'Nessun combattimento attivo',
    en: 'No active combat',
    de: 'Kein aktiver Kampf',
    max: 28,
  },
  'log.empty': {
    it: 'Nessun evento nel registro',
    en: 'No events in log',
    de: 'Keine Einträge im Protokoll',
    max: 29,
  },
  'inv.empty': {
    it: "Nessun oggetto nell'inventario",
    en: 'No items in inventory',
    de: 'Keine Gegenstände',
    max: 31,
  },
  'spell.empty': {
    it: 'Nessun incantesimo disponibile',
    en: 'This character has no spells',
    de: 'Keine Zaubersprüche',
    max: 31,
  },

  // §8.2 Panel titles (header breadcrumb) — 5 keys
  'panel.title.sheet': { it: 'SCHEDA', en: 'SHEET', de: 'BLATT', max: 6 },
  'panel.title.combat': { it: 'COMBAT', en: 'COMBAT', de: 'KAMPF', max: 6 },
  'panel.title.log': { it: 'LOG', en: 'LOG', de: 'PROTOKOLL', max: 10 },
  'panel.title.inventory': { it: 'INVENTORY', en: 'INVENTORY', de: 'INVENTAR', max: 10 },
  'panel.title.spellbook': { it: 'SPELLBOOK', en: 'SPELLBOOK', de: 'ZAUBERBUCH', max: 11 },

  // §8.3 Footer hints (CTA per panel) — 5 keys
  // Note: DE strings for Combat, Log, Inventory, Spellbook exceed their IT/EN
  // budget hints slightly — assertWithinBudget warns at runtime; the renderer
  // falls back to EN for best-effort locales (es/fr/pt-br) per I18N-05.
  'footer.hint.sheet': {
    it: 'tap=prossimo tab  scroll=contenuto  tap×2=chiudi  qa=rapida',
    en: 'tap=next tab  scroll=content  tap×2=close  qa=quick',
    de: 'tap=nächster Tab  scroll=Inhalt  tap×2=schließen  qa=schnell',
    max: 63,
  },
  'footer.hint.combat': {
    it: 'scroll=iniziativa  tap=rapida  qa=rapida',
    en: 'scroll=initiative  tap=quick  qa=quick',
    de: 'scroll=Initiative  tap=schnell  qa=schnell',
    max: 46,
  },
  'footer.hint.log': {
    it: 'scroll=storia  tap=dettaglio  qa=rapida',
    en: 'scroll=history  tap=detail  qa=quick',
    de: 'scroll=Verlauf  tap=Detail  qa=schnell',
    max: 42,
  },
  'footer.hint.inventory': {
    it: 'scroll=oggetto  tap=usa  qa=rapida',
    en: 'scroll=item  tap=use  qa=quick',
    de: 'scroll=Gegenstand  tap=nutzen  qa=schnell',
    max: 45,
  },
  'footer.hint.spellbook': {
    it: 'scroll=incantesimo  tap=lancia  qa=rapida',
    en: 'scroll=spell  tap=cast  qa=quick',
    de: 'scroll=Zauber  tap=zaubern  qa=schnell',
    max: 44,
  },

  // §8.4 PanelRouter boot-error states — 2 keys
  // Note: `panel_cap_denied_template` has {panel} + {cap} placeholders; the
  // `_template` suffix exempts it from IB-3 literal-length check (Phase 4b
  // Plan 01 Deviation #2 precedent).
  panel_router_zero_panels: {
    it: 'Nessun panel caricato. Reinstalla il modulo.',
    en: 'No panels loaded. Reinstall the module.',
    de: 'Keine Panels geladen. Modul neu installieren.',
    max: 46,
  },
  panel_cap_denied_template: {
    it: '<panel> richiede <cap> — non disponibile',
    en: '<panel> requires <cap> — unavailable',
    de: '<panel> erfordert <cap> — nicht verfügbar',
    max: 42,
  },

  // ─── Phase 6 — R1 context chip vocabulary (Plan 06-01 Wave-0 centralisation) ─
  // 6 keys for the status-HUD footer chip (Plan 06-03 consumer) and the
  // boot-state chip variants. All within budget. `inv5_chip_tooltip` is reserved
  // vocabulary for a future tooltip overlay — NOT rendered in Phase 6 chip.

  /** Default `tap=` label shown when no overlay is active (main HUD state). */
  hud_r1_default_tap: { it: 'cicla', en: 'cycle', de: 'Wechsel', max: 22 },

  /** Default `scroll=` label shown when no overlay is active. */
  hud_r1_default_scroll: { it: 'nav', en: 'nav', de: 'Nav', max: 22 },

  /** Default quick-action (over-scroll) label shown when no overlay is active. */
  hud_r1_default_long: { it: 'quick', en: 'quick', de: 'Schnell', max: 22 },

  /** Boot-splash chip placeholder — quick-action (over-scroll) is a no-op during splash. */
  hud_r1_boot_label: { it: '—', en: '—', de: '—', max: 4 },

  /** Boot-error quick-action (over-scroll) label — over-scroll retries the boot sequence. */
  hud_r1_boot_error_label: { it: 'riprova', en: 'retry', de: 'erneut', max: 22 },

  /**
   * INV-5 tooltip vocabulary — centralises the Gesture Determinism chip label.
   * NOT rendered as a chip in Phase 6; reserved for a future tooltip overlay.
   * The `_tooltip` suffix exempts it from IB-3 literal-length check (same as
   * `_template` suffix exemption, Phase 4b Plan 01 Deviation #2 precedent).
   */
  inv5_chip_tooltip: {
    it: 'INV-5: ↑over-scroll apre il menu del livello attivo',
    en: 'INV-5: ↑over-scroll opens active layer menu',
    de: 'INV-5: ↑Über-Scroll öffnet Menü der aktiven Ebene',
    max: 60,
  },

  // ─── Phase 6 Plan 02 — QuickActionMenuPanel i18n keys (Wave 1 centralisation) ─
  // 20 keys for the Quick Action menu title, 9 item labels, 3 footer hints,
  // and 6 R1 hint chip labels (main mode + language sub-menu mode).
  // All strings verified within their `max` budgets per UI-SPEC §1.3 + §6.
  // Downstream consumer: packages/g2-app/src/panels/quick-action-menu-panel.ts

  /** Title row for the Quick Action main menu (Strategy A overlay-block container). */
  quick_menu_title: { it: 'AZIONE RAPIDA', en: 'QUICK ACTION', de: 'SCHNELLAKTION', max: 22 },

  /** Title row for the Language sub-menu mode (shown when [N] is tapped). */
  quick_lang_submenu_title: { it: 'LINGUA', en: 'LANGUAGE', de: 'SPRACHE', max: 22 },

  /** [S] Character Sheet menu item label. */
  quick_item_sheet: { it: 'Scheda', en: 'Sheet', de: 'Blatt', max: 22 },

  /** [C] Combat Tracker menu item label. */
  quick_item_combat: { it: 'Combatt', en: 'Combat', de: 'Kampf', max: 22 },

  /** [L] Log panel menu item label. */
  quick_item_log: { it: 'Log', en: 'Log', de: 'Log', max: 22 },

  /** [B] Spellbook menu item label. */
  quick_item_book: { it: 'Libro', en: 'Book', de: 'Buch', max: 22 },

  /** [I] Inventory panel menu item label. */
  quick_item_inventory: { it: 'Inventario', en: 'Inventory', de: 'Inventar', max: 22 },

  /** [A] Action stub menu item label (Phase 7 wires the real [A] panel). */
  quick_item_action: { it: 'Azione', en: 'Action', de: 'Aktion', max: 22 },

  /** [M] Map mode toggle menu item label. */
  quick_item_map: { it: 'Mappa', en: 'Map mode', de: 'Karte', max: 22 },

  /** [N] Language picker menu item label. */
  quick_item_language: { it: 'Lingua', en: 'Language', de: 'Sprache', max: 22 },

  /** [X] Close menu item label. Longest DE label: 'Schließen' (9 chars) — fits within budget. */
  quick_item_close: { it: 'Chiudi', en: 'Close', de: 'Schließen', max: 22 },

  /**
   * Footer hint — scroll action description (line 1 of 3 footer rows below border).
   * Budget 66 = full inner-width of the 70-char overlay-block container.
   */
  quick_hint_scroll: {
    it: 'scroll = cambia voce attiva',
    en: 'scroll = change selected item',
    de: 'scroll = Eintrag wählen',
    max: 66,
  },

  /** Footer hint — tap action description (line 2 of 3 footer rows). */
  quick_hint_tap: {
    it: 'tap = apri voce',
    en: 'tap = open item',
    de: 'tap = öffnen',
    max: 66,
  },

  /** Footer hint — cancel action description (line 3 of 3 footer rows). Cancel is double-tap per ADR-0012. */
  quick_hint_long: {
    it: 'tap×2 = annulla',
    en: 'tap×2 = cancel',
    de: 'tap×2 = abbrechen',
    max: 66,
  },

  /** R1 chip tap label — main menu mode (shown in StatusHudRenderer footer chip). */
  quick_r1_main_tap: { it: 'apri', en: 'open', de: 'öffnen', max: 22 },

  /** R1 chip scroll label — main menu mode. */
  quick_r1_main_scroll: { it: 'voce', en: 'item', de: 'Eintrag', max: 22 },

  /** R1 chip quick-action label — main menu mode (double-tap closes the menu per ADR-0012). */
  quick_r1_main_long: { it: 'annulla', en: 'cancel', de: 'Abbruch', max: 22 },

  /**
   * R1 chip tap label — language sub-menu mode (tap applies the selected locale).
   *
   * WR-01 fix: DE changed from 'anwenden' (8) to 'wählen' (6) so the assembled
   * chip `tap=wählen scroll=Sprache qa=zurück` = 35 chars ≤ 38 renderer budget.
   * IT 'applica' (7) + DE 'wählen' (6): both fit within budget.
   */
  quick_r1_lang_tap: { it: 'applica', en: 'apply', de: 'wählen', max: 22 },

  /** R1 chip scroll label — language sub-menu mode. */
  quick_r1_lang_scroll: { it: 'lingua', en: 'language', de: 'Sprache', max: 22 },

  /**
   * R1 chip quick-action label — language sub-menu mode (over-scroll returns to main menu,
   * not close — UI-SPEC §1 footer hint "qa=annulla" means "back one level"
   * when in sub-menu; double-tap closes entirely per ADR-0012).
   *
   * WR-01 fix: IT changed from 'indietro' (8) to 'dietro' (6) so the assembled
   * chip `tap=applica scroll=lingua qa=dietro` = 35 chars ≤ 38 renderer budget.
   * Verified all 3 locales post-fix (see WR-01 in 06-REVIEW.md), now 2 chars
   * shorter each since `qa=` replaces `long=`:
   *   IT: tap=applica(7) + scroll=lingua(6) + qa=dietro(6) → 35 chars ✓
   *   EN: tap=apply(5)   + scroll=language(8) + qa=back(4) → 29 chars ✓
   *   DE: tap=wählen(6)  + scroll=Sprache(7) + qa=zurück(6) → 35 chars ✓
   */
  quick_r1_lang_long: { it: 'dietro', en: 'back', de: 'zurück', max: 22 },

  // ─── Phase 6 Plan 03 — StatusHudRenderer context chip per-state strings ───────
  // 12 pre-composed, pre-truncated chip strings (RESEARCH Pitfall 6 mitigation).
  // These are the FULL `R1: …` segment content (without the `R1: ` prefix) for
  // each panel state. The renderer reads these verbatim via parseR1HintString
  // and renderContextChip — no runtime truncation logic needed.
  //
  // All strings verified ≤ 38 chars (UI-SPEC §3.2 chip budget) per locale.
  // `max: 38` for all non-boot variants (boot splash uses `max: 4`).
  //
  // Canonical IT strings — EN/DE within same budget per UI-SPEC §6 table.
  // Downstream consumers: status-hud-renderer.ts + 5 Phase 5 panels.

  /**
   * Main HUD chip (no overlay active — default navigation state).
   * IT: `tap=cycle scroll=nav qa=quick` (29 chars — fits within 38).
   */
  hud_r1_main: {
    it: 'tap=cycle scroll=nav qa=quick',
    en: 'tap=cycle scroll=nav qa=quick',
    de: 'tap=Wechsel scroll=Nav qa=Schnell',
    max: 35,
  },

  /**
   * Character Sheet overlay chip.
   * IT pre-truncated to fit 38-char budget (UI-SPEC §3.2).
   * Single-space separators — pre-authored abbreviations replace the full raw form
   * (`tap=cycle-tab  scroll=tab-content  qa=quick[sheet]` = 49 chars).
   * Token values returned by `CharacterSheetPanel.getR1Hints()` match these abbreviations.
   */
  hud_r1_sheet: {
    it: 'tap=tab scroll=cont qa=q[sheet]',
    en: 'tap=tab scroll=cont qa=q[sheet]',
    de: 'tap=Tab scroll=Inhalt qa=q[Blatt]',
    max: 36,
  },

  /**
   * Combat Tracker overlay chip.
   * IT pre-truncated: single-space format fits within 38-char budget (UI-SPEC §3.2).
   */
  hud_r1_combat: {
    it: 'scroll=iniz tap=rapida qa=q[combat]',
    en: 'scroll=init tap=quick qa=q[combat]',
    de: 'scroll=Init tap=Schnell qa=q[Kampf]',
    max: 38,
  },

  /**
   * Log panel overlay chip (fits 38-char budget with single-space separators).
   */
  hud_r1_log: {
    it: 'scroll=evento tap=apri qa=q[log]',
    en: 'scroll=event tap=open qa=q[log]',
    de: 'scroll=Eintrag tap=öffnen qa=q[Log]',
    max: 38,
  },

  /**
   * Inventory panel overlay chip (fits 38-char budget with single-space separators).
   */
  hud_r1_inv: {
    it: 'scroll=oggetto tap=usa qa=q[inv]',
    en: 'scroll=item tap=use qa=q[inv]',
    de: 'scroll=Gegenst tap=Nutzen qa=q[Inv]',
    max: 38,
  },

  /**
   * Spellbook panel overlay chip (fits 38-char budget with single-space separators).
   */
  hud_r1_spell: {
    it: 'scroll=incant tap=lancia qa=q[spell]',
    en: 'scroll=spell tap=cast qa=q[spell]',
    de: 'scroll=Zauber tap=wirken qa=q[Spell]',
    max: 38,
  },

  /**
   * Quick Action Menu overlay chip (fits 38-char budget with single-space separators).
   */
  hud_r1_menu: {
    it: 'scroll=voce tap=apri qa=annulla',
    en: 'scroll=item tap=open qa=cancel',
    de: 'scroll=Eintrag tap=öffnen qa=Abbruch',
    max: 38,
  },

  // WR-04 fix: hud_r1_lang_submenu deleted — dead code (INV-4 zero dead code).
  // The language sub-menu chip is assembled dynamically by renderContextChip from
  // separate quick_r1_lang_tap + quick_r1_lang_scroll + quick_r1_lang_long keys
  // (the `long` suffix in the key name is historical; the chip token is now `qa=`).
  // This composite entry was never consumed by any production code path; it only
  // appeared in a test-file comment. Additionally its max: 39 exceeded the 38
  // code-point renderer budget enforced by renderContextChip (line 628 of
  // status-hud-renderer.ts), making it inconsistent even as documentation.
  // Post-WR-01 fix the actual assembled chips are 37 chars for IT and DE.

  /**
   * Boot splash chip — quick-action (over-scroll) is a no-op during boot splash.
   * Single em-dash placeholder. `max: 4` (just the em-dash).
   */
  hud_r1_boot: {
    it: '—',
    en: '—',
    de: '—',
    max: 4,
  },

  /**
   * Boot error chip — over-scroll retries the boot sequence.
   * IT: `qa=riprova` (10 chars — fits 38).
   */
  hud_r1_boot_error: {
    it: 'qa=riprova',
    en: 'qa=retry',
    de: 'qa=erneut',
    max: 38,
  },

  /**
   * Concentration modal chip (shown when ConcentrationDropModalPanel is active).
   * IT: `tap=Y  scroll=—  qa=annulla` (fits 38).
   */
  hud_r1_conc_modal: {
    it: 'tap=Y  scroll=—  qa=annulla',
    en: 'tap=Y  scroll=—  qa=cancel',
    de: 'tap=Y  scroll=—  qa=Abbruch',
    max: 38,
  },

  /**
   * Death saves pivot chip — shown when the HP=0 death-saves mode is active.
   * Em-dash placeholder (no overlay panel handles gestures in death-saves mode).
   */
  hud_r1_death_saves: {
    it: '—',
    en: '—',
    de: '—',
    max: 4,
  },

  // ─── Phase 7 Plan 07-03 additions — TemplatePlacementPanel (z=2 overlay) ───
  // ACT-02 AoE template placement panel i18n keys.
  // All keys fit within their max budgets (IT canonical per CONTEXT §Area 3 rule).

  /**
   * Template placement panel title (shown in top border bracket).
   * IT max: "POSIZIONAMENTO" = 14 chars.
   */
  tmpl_title: {
    it: 'POSIZIONAMENTO',
    en: 'PLACE TEMPLATE',
    de: 'VORLAGE SETZEN',
    max: 14,
  },

  /**
   * Template placement panel spell label prefix.
   * IT max: "Incantesimo: " = 13 chars.
   */
  tmpl_spell_label: {
    it: 'Incantesimo:',
    en: 'Spell:',
    de: 'Zauber:',
    max: 12,
  },

  /**
   * Template placement panel index indicator template (e.g., "[1/3]").
   * Constructed at render time with `templateIndex+1` and `total`.
   * The static label before the number — max 4 chars each side.
   */
  tmpl_index_label: {
    it: 'Template',
    en: 'Template',
    de: 'Vorlage',
    max: 8,
  },

  /**
   * Template placement panel position label prefix.
   * IT max: "Posizione:" = 10 chars.
   */
  tmpl_position_label: {
    it: 'Posizione:',
    en: 'Position:',
    de: 'Position:',
    max: 10,
  },

  /**
   * Template placement panel tap-to-confirm hint (footer button label).
   * IT max: "[R1] Conferma" = 14 chars.
   */
  tmpl_tap_hint: {
    it: '[R1] Conferma',
    en: '[R1] Confirm',
    de: '[R1] Bestät.',
    max: 14,
  },

  /**
   * Template placement panel double-tap-to-cancel hint (footer button label).
   * Cancel is double-tap per ADR-0012. IT max: "[×2] Annulla" = 12 chars.
   */
  tmpl_long_hint: {
    it: '[×2] Annulla',
    en: '[×2] Cancel',
    de: '[×2] Abbr.',
    max: 14,
  },

  /**
   * R1 context chip for the TemplatePlacementPanel.
   * Shown in the status HUD chip when the template panel is mounted.
   * IT max: "pos" = 3 chars (scroll hint — short).
   */
  hud_r1_tmpl_scroll: {
    it: 'pos',
    en: 'pos',
    de: 'pos',
    max: 3,
  },

  /**
   * R1 context chip tap hint for TemplatePlacementPanel.
   * IT max: "conferma" = 8 chars.
   */
  hud_r1_tmpl_tap: {
    it: 'conferma',
    en: 'confirm',
    de: 'bestät.',
    max: 8,
  },

  /**
   * R1 context chip quick-action (over-scroll) label for TemplatePlacementPanel.
   * Cancel is double-tap per ADR-0012. IT max: "annulla" = 7 chars.
   */
  hud_r1_tmpl_long: {
    it: 'annulla',
    en: 'cancel',
    de: 'abbr.',
    max: 7,
  },

  // ─── Phase 8 Plan 08-01 — action result error toasts (5 keys) ─────────────
  // 5 typed error i18n keys for `error.action.<kind>` toast messages.
  // Budget: 28 chars (toast row budget per CONTEXT §Area 2 + ARD-11 spec).
  // All IT/EN/DE strings verified ≤ 28 code-points at authoring time.

  /**
   * Toast error message: no valid targets found.
   * IT: "Nessun bersaglio" (17) · EN: "No targets" (10) · DE: "Keine Ziele" (11).
   */
  'error.action.no-targets': {
    it: 'Nessun bersaglio',
    en: 'No targets',
    de: 'Keine Ziele',
    max: 28,
  },

  /**
   * Toast error message: target is outside spell/weapon range.
   * IT: "Fuori portata" (13) · EN: "Out of range" (12) · DE: "Außer Reichweite" (16).
   */
  'error.action.out-of-range': {
    it: 'Fuori portata',
    en: 'Out of range',
    de: 'Außer Reichweite',
    max: 28,
  },

  /**
   * Toast error message: insufficient spell slots / charges / uses.
   * IT: "Risorse esaurite" (16) · EN: "Out of resources" (16) · DE: "Ressourcen leer" (15).
   */
  'error.action.out-of-resource': {
    it: 'Risorse esaurite',
    en: 'Out of resources',
    de: 'Ressourcen leer',
    max: 28,
  },

  /**
   * Toast error message: action attempted outside player's turn.
   * IT: "Non il tuo turno" (16) · EN: "Not your turn" (13) · DE: "Nicht dein Zug" (14).
   */
  'error.action.wrong-turn': {
    it: 'Non il tuo turno',
    en: 'Not your turn',
    de: 'Nicht dein Zug',
    max: 28,
  },

  /**
   * Toast error message: GM blocked or rejected the action.
   * IT: "Rifiutato dal GM" (16) · EN: "GM rejected" (11) · DE: "Vom DM abgelehnt" (16).
   */
  'error.action.gm-rejected': {
    it: 'Rifiutato dal GM',
    en: 'GM rejected',
    de: 'Vom DM abgelehnt',
    max: 28,
  },

  // ─── Phase 8 Plan 08-02 — target picker labels + hints (5 keys) ───────────
  // TargetPickerPanel (z=2 overlay) i18n keys for panel title, empty state,
  // HP/AC column headers, and R1 chip composite hint string.
  // All IT/EN/DE strings verified ≤ max code-points at authoring time.

  /**
   * TargetPickerPanel title shown in the top border bracket.
   * IT: "BERSAGLIO" (9) · EN: "TARGET" (6) · DE: "ZIEL" (4).
   */
  target_picker_title: {
    it: 'BERSAGLIO',
    en: 'TARGET',
    de: 'ZIEL',
    max: 12,
  },

  /**
   * Empty-state hint rendered when no valid targets exist.
   * IT: "Nessun bersaglio" (17) · EN: "No targets" (10) · DE: "Keine Ziele" (11).
   */
  target_picker_empty_hint: {
    it: 'Nessun bersaglio',
    en: 'No targets',
    de: 'Keine Ziele',
    max: 28,
  },

  /**
   * HP column header in target row (short, fits alongside name + AC).
   * IT: "PF" (2) · EN: "HP" (2) · DE: "TP" (2).
   */
  target_picker_hp_label: {
    it: 'PF',
    en: 'HP',
    de: 'TP',
    max: 3,
  },

  /**
   * AC column header in target row.
   * IT: "CA" (2) · EN: "AC" (2) · DE: "RK" (2).
   */
  target_picker_ac_label: {
    it: 'CA',
    en: 'AC',
    de: 'RK',
    max: 3,
  },

  /**
   * R1 context chip composite hint for the TargetPickerPanel overlay.
   * Pipe-separated tap|scroll|qa format per Phase 6 parseR1HintString convention.
   * IT: "conferma|scroll|annulla" (23) · EN: "confirm|scroll|cancel" (21) · DE: "best.|scroll|abbr." (18).
   * Assembled chip: `tap=conferma scroll=scroll qa=annulla` (fits 38-char budget).
   */
  hud_r1_target_picker: {
    it: 'tap=conferma scroll=lista qa=annulla',
    en: 'tap=confirm scroll=list qa=cancel',
    de: 'tap=best. scroll=Liste qa=abbr.',
    max: 38,
  },

  // ─── Phase 8 Plan 08-03 — action options modal labels (6 keys) ───────────
  // ActionOptionsModal (z=2 overlay) i18n keys for panel title, gesture labels,
  // and R1 chip composite hint string.
  // All IT/EN/DE strings verified ≤ max code-points at authoring time.

  /**
   * ActionOptionsModal title shown inside the top border bracket.
   * IT: "AZIONE" (6) · EN: "ACTION" (6) · DE: "AKTION" (6).
   */
  action_options_title: {
    it: 'AZIONE',
    en: 'ACTION',
    de: 'AKTION',
    max: 10,
  },

  /**
   * Tap label for spell variant — instructs user to cast the selected spell.
   * IT: "Lancia incantesimo" (18) · EN: "Cast spell" (10) · DE: "Zauber wirken" (13).
   */
  action_options_tap_label_spell: {
    it: 'Lancia incantesimo',
    en: 'Cast spell',
    de: 'Zauber wirken',
    max: 24,
  },

  /**
   * Tap label for item variant — instructs user to use the selected item.
   * IT: "Usa oggetto" (11) · EN: "Use item" (8) · DE: "Gegenstand verw." (17).
   */
  action_options_tap_label_item: {
    it: 'Usa oggetto',
    en: 'Use item',
    de: 'Gegenstand verw.',
    max: 24,
  },

  /**
   * Double-tap cancel label.
   * IT: "Annulla" (7) · EN: "Cancel" (6) · DE: "Abbrechen" (9).
   */
  action_options_cancel_label: {
    it: 'Annulla',
    en: 'Cancel',
    de: 'Abbrechen',
    max: 12,
  },

  /**
   * R1 context chip composite hint for the ActionOptionsModal overlay.
   * Pipe-separated tap|scroll|qa format per Phase 6 parseR1HintString convention.
   * scroll segment is '—' because the modal ignores scroll events (AOM-08).
   * IT: "tap=conferma scroll=— qa=annulla" (32) within max 38.
   */
  hud_r1_action_options: {
    it: 'tap=conferma scroll=— qa=annulla',
    en: 'tap=confirm scroll=— qa=cancel',
    de: 'tap=best. scroll=— qa=abbr.',
    max: 38,
  },

  // ─── Phase 8 Plan 08-04 — move direction picker + status-hud movement chip ─
  // 8 new keys for MoveDirectionPicker (z=2 overlay) panel title, remaining hint
  // template, exhausted state hint, confirm/cancel footer hints, status-hud move
  // chip label, R1 chip composite hint, and chip numeric template.
  // All IT/EN/DE strings verified ≤ max code-points at authoring time.
  // Compass direction letters (N/NE/E/SE/S/SW/W/NW) are language-neutral per
  // Phase 4b Plan 03 Pitfall 6 precedent — they are NOT localised.

  /**
   * MoveDirectionPicker panel title shown in the top border.
   * IT: "MOVIMENTO" (9) · EN: "MOVEMENT" (8) · DE: "BEWEGUNG" (8).
   */
  move_picker_title: {
    it: 'MOVIMENTO',
    en: 'MOVEMENT',
    de: 'BEWEGUNG',
    max: 12,
  },

  /**
   * MoveDirectionPicker remaining movement template (with {n} placeholder).
   * IT: "rimangono {n} ft" (template, up to 22 expanded) · EN similar.
   * The `_template` suffix exempts from IB-3 literal-length check (Phase 4b precedent).
   */
  move_picker_remaining_template: {
    it: 'rimangono {n} ft',
    en: '{n} ft remaining',
    de: '{n} ft übrig',
    max: 22,
  },

  /**
   * MoveDirectionPicker exhausted state hint (remainingFeet ≤ 0).
   * IT: "Movimento esaurito" (18) · EN: "Movement exhausted" (18) · DE: "Bewegung erschöpft" (18).
   */
  move_picker_exhausted_hint: {
    it: 'Movimento esaurito',
    en: 'Movement exhausted',
    de: 'Bewegung erschöpft',
    max: 28,
  },

  /**
   * MoveDirectionPicker tap-to-confirm footer label.
   * IT: "commit" (6) · EN: "commit" (6) · DE: "bestätigen" (10).
   */
  move_picker_confirm_hint: {
    it: 'commit',
    en: 'commit',
    de: 'bestätigen',
    max: 12,
  },

  /**
   * MoveDirectionPicker double-tap cancel footer label (cancel is double-tap per ADR-0012).
   * IT: "annulla" (7) · EN: "cancel" (6) · DE: "abbrechen" (9).
   */
  move_picker_cancel_hint: {
    it: 'annulla',
    en: 'cancel',
    de: 'abbrechen',
    max: 12,
  },

  /**
   * StatusHudRenderer movement chip label prefix (shown as "Mov 25/30").
   * IT: "Mov" (3) · EN: "Mov" (3) · DE: "Bew" (3).
   * Language-neutral abbreviation (same as move_label in Phase 4a HUD).
   */
  status_hud_movement_label: {
    it: 'Mov',
    en: 'Mov',
    de: 'Bew',
    max: 4,
  },

  /**
   * R1 context chip composite hint for the MoveDirectionPicker overlay.
   * Pipe-separated tap|scroll|qa format per Phase 6 parseR1HintString convention.
   * IT: "commit|direzione|annulla" (24) · EN: "commit|direction|cancel" (23) · DE: 19.
   * Assembled chip fits within 38-char budget (`qa=` saves 2 chars vs old `long=`):
   *   IT: tap=commit scroll=direzione qa=annulla = 38 chars ✓
   *   EN: tap=commit scroll=direction qa=cancel = 37 chars ✓
   *   DE: tap=bestätigen scroll=Richtung qa=abbr. = 39 chars (≤42 budget) ✓
   */
  hud_r1_move_picker: {
    it: 'tap=commit scroll=direzione qa=annulla',
    en: 'tap=commit scroll=direction qa=cancel',
    de: 'tap=bestätigen scroll=Richtung qa=abbr.',
    max: 42,
  },

  /**
   * StatusHudRenderer movement chip numeric format template.
   * Language-neutral: `{used}/{total}` — always numeric, no localisation needed.
   * The `_template` suffix exempts from IB-3 literal-length check (Phase 4b precedent).
   * Max: 7 chars covers "999/999".
   */
  status_hud_movement_chip_template: {
    it: '{used}/{total}',
    en: '{used}/{total}',
    de: '{used}/{total}',
    max: 7,
  },

  // ─── Phase 9 Plan 09-02 — Action Economy widget i18n keys (4 new keys) ──────
  // New keys for the action economy chip in StatusHudRenderer footer row.
  // act_label ('Az.') + bns_label ('Bns') are REUSED from Phase 4a — no duplicates.
  // Only 4 new keys: reaction short, multi-attack template, and 2 error toast keys.
  //
  // Widget format (IT): `Az. ░ Bns ░ R░  Mov 25/30` (row 19, 24-char inner cell)
  // Multi-attack override: `Az. ▓ [Atk 1/2]  Mov 0/30` (24-char inner cell)

  /**
   * Action economy reaction slot short label (single char — matches 1-char column).
   * IT/EN/DE/all locales: 'R' (language-neutral single letter, same as existing `R` prefix).
   * Max: 1 char.
   */
  'econ.reaction.short': {
    it: 'R',
    en: 'R',
    de: 'R',
    max: 1,
  },

  /**
   * Multi-attack progress template for the action economy widget override mode.
   * Substituted at render time: {N} = current attack, {M} = total attacks.
   * The `_template` suffix exempts from IB-3 literal-length check (Phase 4b precedent).
   * Max: 12 chars covers `[Atk 99/99]` = 12.
   */
  'econ.multiattack.template': {
    it: '[Atk {N}/{M}]',
    en: '[Atk {N}/{M}]',
    de: '[Atk {N}/{M}]',
    max: 12,
  },

  /**
   * Client-side preconditioner error toast: Action slot already consumed this turn.
   * Shown when `actionsUsed >= 1` and `multiAttackInProgress === false`.
   * Budget: 38 chars (toast row budget per CONTEXT §Area 2).
   * IT: 'Azione già usata' (16) · EN: 'Action already used' (19) · DE: 'Aktion verwendet' (16).
   */
  'error.action.already-used-action': {
    it: 'Azione già usata',
    en: 'Action already used',
    de: 'Aktion verwendet',
    max: 38,
  },

  /**
   * Client-side preconditioner error toast: Bonus Action slot already consumed this turn.
   * Shown when `bonusActionsUsed >= 1` and `multiAttackInProgress === false`.
   * Budget: 38 chars (toast row budget per CONTEXT §Area 2).
   * IT: 'Bonus già usato' (15) · EN: 'Bonus already used' (18) · DE: 'Bonus verwendet' (15).
   */
  'error.action.already-used-bonus': {
    it: 'Bonus già usato',
    en: 'Bonus already used',
    de: 'Bonus verwendet',
    max: 38,
  },

  /**
   * Concentration drop cancelled toast: player tapped [N] on the concentration
   * drop modal (Plan 09-03). Shown via the double-tap path of ConcentrationDropModalPanel.
   * Budget: 38 chars (toast row budget per CONTEXT §Area 2).
   * IT: 'Cast annullato (conc.)' (22) · EN: 'Cast cancelled (conc.)' (22) · DE: 'Wirken abgebrochen' (18).
   * Best-effort locales (es/fr/pt-br) fall back to EN string at render time (I18N-05).
   */
  'error.action.concentration-cancelled': {
    it: 'Cast annullato (conc.)',
    en: 'Cast cancelled (conc.)',
    de: 'Wirken abgebrochen',
    max: 38,
  },

  // ─── Phase 9 Plan 09-04 — SlotPickerPanel i18n keys (7 new keys) ──────────
  // SlotPickerPanel (z=2 overlay) i18n keys for panel title, base-level label,
  // available-slots template, upcast template, confirm/cancel footer hints, and
  // R1 chip composite hint string.
  // All IT/EN/DE strings verified ≤ max code-points at authoring time.

  /**
   * SlotPickerPanel title shown in the top border bracket.
   * IT: "INCANTESIMO" (11) · EN: "SPELL" (5) · DE: "ZAUBER" (6). max 14.
   */
  'slot_picker.title': {
    it: 'INCANTESIMO',
    en: 'SPELL',
    de: 'ZAUBER',
    max: 14,
  },

  /**
   * Base-level label prefix shown on row 2 of the panel.
   * IT: "Livello base" (12) · EN: "Base level" (10) · DE: "Grundstufe" (10). max 14.
   */
  'slot_picker.base_level': {
    it: 'Livello base',
    en: 'Base level',
    de: 'Grundstufe',
    max: 14,
  },

  /**
   * Available-slots template — shown next to each slot level row.
   * Placeholders: {N} = remaining slots, {M} = max slots.
   * The `_template` suffix exempts from IB-3 literal-length check (Phase 4b precedent).
   * IT: "({N}/{M} disponibili)" (20 expanded) · EN: "({N}/{M} available)" (19) · DE: "({N}/{M} verfügbar)" (19). max 24.
   */
  'slot_picker.available_template': {
    it: '({N}/{M} disponibili)',
    en: '({N}/{M} available)',
    de: '({N}/{M} verfügbar)',
    max: 24,
  },

  /**
   * Upcast annotation shown next to each slot level above base level.
   * Placeholder: {N} = number of extra d6 dice from upcasting.
   * The `_template` suffix exempts from IB-3 literal-length check (Phase 4b precedent).
   * IT/EN/DE: "← upcast +{N}d6" (all same, 16 chars). max 20.
   */
  'slot_picker.upcast_template': {
    it: '← upcast +{N}d6',
    en: '← upcast +{N}d6',
    de: '← Upcast +{N}d6',
    max: 20,
  },

  /**
   * Tap-to-confirm footer hint in the SlotPickerPanel.
   * IT: "[tap] conferma" (14) · EN: "[tap] confirm" (13) · DE: "[tap] bestätigen" (17). max 24.
   */
  'slot_picker.confirm_hint': {
    it: '[tap] conferma',
    en: '[tap] confirm',
    de: '[tap] bestätigen',
    max: 24,
  },

  /**
   * Double-tap-to-cancel footer hint in the SlotPickerPanel (cancel is double-tap per ADR-0012).
   * IT: "[×2] annulla" (12) · EN: "[×2] cancel" (11) · DE: "[×2] abbrechen" (14). max 24.
   */
  'slot_picker.cancel_hint': {
    it: '[×2] annulla',
    en: '[×2] cancel',
    de: '[×2] abbrechen',
    max: 24,
  },

  /**
   * R1 context chip composite hint for the SlotPickerPanel overlay.
   * Pipe-separated tap|scroll|qa format per Phase 6 parseR1HintString convention.
   * scroll cycles slot levels; tap confirms; over-scroll (at router level) opens QuickAction.
   * `qa=` saves 2 chars vs old `long=`:
   * IT: "tap=conferma scroll=livello qa=annulla" (38) · EN: (34) · DE: (30). max 42.
   * Note: DE "tap=best. scroll=Grad qa=abbr." = 30 chars ≤ 42.
   */
  hud_r1_slot_picker: {
    it: 'tap=conferma scroll=livello qa=annulla',
    en: 'tap=confirm scroll=level qa=cancel',
    de: 'tap=best. scroll=Grad qa=abbr.',
    max: 42,
  },

  // ─── Phase 10 Plan 10-01 — SYNC LOST chip (2 keys, SC-1 reconnect) ───────
  // IT canonical per CONTEXT.md §Area 3. EN/DE are canonical; ES/FR/PT-BR fall
  // back to EN per I18N-05 best-effort. Budget: 38 code-points inner (same as
  // R1 chip row — the chip REPLACES the R1 chip in the footer when sync is lost).
  //
  // Template key: {N} is replaced with the countdown seconds (e.g. "4").
  // IT: "⚠ SYNC LOST (riconnetto in {N}s)" = 30+len(N) chars — ≤38 up to 30s
  // EN: "⚠ SYNC LOST (reconnect in {N}s)"  = 28+len(N) chars — ≤38 up to 30s
  // DE: falls back to EN (best-effort per I18N-05)
  //
  // In-flight sentinel (retryInMs===0): different key, no {N} substitution.
  // IT: "⚠ SYNC LOST (riconnessione…)" = 29 chars ≤38 ✓
  // EN: "⚠ SYNC LOST (reconnecting…)"  = 27 chars ≤38 ✓
  hud_sync_lost_chip_template: {
    it: '⚠ SYNC LOST (riconnetto in {N}s)',
    en: '⚠ SYNC LOST (reconnect in {N}s)',
    de: '⚠ SYNC LOST (reconnect in {N}s)',
    max: 38,
  },
  hud_sync_lost_chip_inflight: {
    it: '⚠ SYNC LOST (riconnessione…)',
    en: '⚠ SYNC LOST (reconnecting…)',
    de: '⚠ SYNC LOST (reconnecting…)',
    max: 38,
  },

  // ─── Phase 13 Plan 13-02 — Reaction Prompt Panel (8 keys, ACT-04) ────────────
  // IT canonical per CONTEXT.md §Area 3. EN/DE canonical; best-effort locales
  // fall back to EN per I18N-05. Panel width = 60 cp (same as conc modal).
  // Subject lines target ≤40 cp; Y button rows target ≤30 cp.
  //
  // Note: subject lines use `{actor}` placeholder replaced at render time with
  // `payload.sourceName` (truncated to 30 cp budget). The bracket/template is
  // kept short to stay within the 60 cp inner budget.
  reaction_prompt_title: {
    it: 'REAZIONE',
    en: 'REACTION',
    de: 'REAKTION',
    max: 10,
  },
  reaction_prompt_subject_shield: {
    it: '{actor} attacca! Usa Shield?',
    en: '{actor} attacks! Use Shield?',
    de: '{actor} greift an! Shield?',
    max: 40,
  },
  reaction_prompt_subject_counterspell: {
    it: '{actor} lancia un incantesimo.',
    en: '{actor} casts a spell.',
    de: '{actor} wirkt einen Zauber.',
    max: 40,
  },
  reaction_prompt_subject_opp_attack: {
    it: '{actor} fugge dalla tua mischia.',
    en: '{actor} flees your melee reach.',
    de: '{actor} flieht deiner Reichweite.',
    max: 40,
  },
  reaction_prompt_y_shield: {
    it: '[Y] Lancia Shield (-1 reaz)',
    en: '[Y] Cast Shield (-1 react)',
    de: '[Y] Shield wirken (-1 Reakt)',
    max: 30,
  },
  reaction_prompt_y_counterspell: {
    it: '[Y] Lancia Contromagia (-1 reaz)',
    en: '[Y] Cast Counterspell (-1 react)',
    de: '[Y] Gegenzauber (-1 Reakt)',
    max: 34,
  },
  reaction_prompt_y_opp_attack: {
    it: '[Y] Attacca opportunità (-1 reaz)',
    en: '[Y] Opportunity Attack (-1 react)',
    de: '[Y] Gelegenheitsangriff (-1 Rkt)',
    max: 35,
  },
  reaction_prompt_n_cancel: {
    it: '[N] Annulla',
    en: '[N] Cancel',
    de: '[N] Abbrechen',
    max: 14,
  },
} as const satisfies Record<string, WidthBudgetRow>;

/**
 * Supported HUD locales.
 *
 * Canonical locales (it/en/de) have full IT/EN/DE row entries in
 * `HUD_WIDTH_BUDGETS`. Best-effort locales (es/fr/pt-br) fall back to the EN
 * string for each key at render time via `getLabel()`.
 *
 * @see CONTEXT.md §Area 4 — locale set with budget tiers
 * @see 05-UI-SPEC.md §8.5 — LOCALE_MENU source of truth
 * @see I18N-05 — per-key EN fallback rule for best-effort locales
 */
export type HudLocale = 'it' | 'en' | 'de' | 'es' | 'fr' | 'pt-br';

/** Discriminated keys of the HUD width-budget table. */
export type HudBudgetField = keyof typeof HUD_WIDTH_BUDGETS;

/**
 * Look up the localised label for a HUD field.
 *
 * Canonical locales (it/en/de) return the verbatim string from the budget row.
 * Best-effort locales (es/fr/pt-br) return the EN string for each key (per-key
 * fallback per I18N-05). This is NOT a full-locale fallback — it is per-key,
 * meaning a given es/fr/pt-br translation may be better in a future extension
 * without breaking the budget contract.
 *
 * Always returns a non-empty string — the build-time `satisfies` clause
 * guarantees every `(field, canonical-locale)` pair is populated.
 *
 * @see I18N-05 — per-key EN fallback rule
 * @see 05-UI-SPEC.md §4.4 — footer hint i18n fallback scope
 */
export function getLabel(field: HudBudgetField, locale: HudLocale): string {
  const row = HUD_WIDTH_BUDGETS[field];
  if (locale === 'it') return row.it;
  if (locale === 'en') return row.en;
  if (locale === 'de') return row.de;
  // Best-effort locales (es, fr, pt-br): per-key EN fallback per I18N-05.
  return row.en;
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
