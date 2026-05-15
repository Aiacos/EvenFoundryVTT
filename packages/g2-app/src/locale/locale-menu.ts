/**
 * Locale override menu data model (Phase 5 Wave-0 — I18N-02).
 *
 * Exports the `LOCALE_MENU` constant consumed by the Phase 6 Quick Action
 * `[N] Language` picker (Phase 5 ships the data model; Phase 6 wires the UI).
 *
 * Override persistence: `hub.setLocalStorage('view.locale.override', code)`.
 * Boot read-back: Plan 05-06. Device-local — never modifies Foundry world settings.
 *
 * Budget tier semantics (I18N-05 + CONTEXT.md §Area 4):
 *   - `'canonical'`  — IT/EN/DE strings are curated and width-budget verified for
 *                      every key in HUD_WIDTH_BUDGETS (zero fallback needed).
 *   - `'best-effort'` — ES/FR/PT-BR: renderer falls back to EN string per-key
 *                      when the native translation would overflow its `max` budget.
 *                      See `getLabel` in `i18n-budgets.ts` for the fallback impl.
 *
 * @see .planning/phases/05-panel-plugin-system-read-only-panels/05-CONTEXT.md §Area 4
 * @see .planning/phases/05-panel-plugin-system-read-only-panels/05-UI-SPEC.md §8.5
 * @see packages/g2-app/src/status-hud/i18n-budgets.ts (getLabel per-key fallback)
 * @see docs/architecture/0010-panel-plugin-registry.md (ADR-0010)
 */

/**
 * A single locale entry in the override menu.
 *
 * `code`        — BCP-47-like locale identifier used as the storage value and
 *                 runtime locale key. `'auto'` means "follow `game.i18n.lang`".
 * `nativeLabel` — Native-language name shown in the picker UI (not i18n-keyed;
 *                 self-describing in its own language).
 * `budget`      — Tier determines per-key fallback policy in `getLabel()`.
 */
export type LocaleMenuEntry = {
  readonly code: 'auto' | 'it' | 'en' | 'de' | 'es' | 'fr' | 'pt-br';
  readonly nativeLabel: string;
  readonly budget: 'canonical' | 'best-effort';
};

/**
 * Ordered locale selection list for the `[N] Language` Quick Action.
 *
 * 7 entries verbatim from UI-SPEC §8.5:
 *   - `auto`  — follow `game.i18n.lang` (canonical, always first)
 *   - `it`    — Italiano  (canonical MVP)
 *   - `en`    — English   (canonical fallback)
 *   - `de`    — Deutsch   (canonical INV-1 stress locale)
 *   - `es`    — Español   (best-effort)
 *   - `fr`    — Français  (best-effort)
 *   - `pt-br` — Português (best-effort)
 *
 * `as const satisfies ReadonlyArray<LocaleMenuEntry>` provides:
 *   1. Literal type narrowing — `code` infers to the union literal, not `string`.
 *   2. Shape validation — missing/extra fields fail `pnpm typecheck`.
 *   3. Immutability — downstream consumers can never mutate the list.
 */
export const LOCALE_MENU = [
  { code: 'auto', nativeLabel: 'Auto', budget: 'canonical' },
  { code: 'it', nativeLabel: 'Italiano', budget: 'canonical' },
  { code: 'en', nativeLabel: 'English', budget: 'canonical' },
  { code: 'de', nativeLabel: 'Deutsch', budget: 'canonical' },
  { code: 'es', nativeLabel: 'Español', budget: 'best-effort' },
  { code: 'fr', nativeLabel: 'Français', budget: 'best-effort' },
  { code: 'pt-br', nativeLabel: 'Português', budget: 'best-effort' },
] as const satisfies ReadonlyArray<LocaleMenuEntry>;
