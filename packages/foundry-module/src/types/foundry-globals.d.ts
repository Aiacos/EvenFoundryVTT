/**
 * Ambient type declarations for Foundry VTT globals used in Phase 2 Wave 0.
 *
 * These declarations describe the subset of the Foundry v13/v14 API surface
 * consumed by the evenfoundryvtt module in Wave 0 (skeleton + settings panel).
 * Each wave expands this surface; Plan 02 (pair modal) adds socketlib and
 * ApplicationV2 shapes; Plan 05 (readers) adds game.actors, game.combat, etc.
 *
 * Intentionally minimal: only declare what is used. noUncheckedIndexedAccess
 * and strict mode (INV-4 §0.1) require every access to be provably safe.
 *
 * @see Specs.md §3.4 (Foundry compatibility: minimum 13.347, verified 14)
 * @see CLAUDE.md §Technology Stack §1.3 (foundry-module tech decisions)
 */

/** Minimal Foundry settings API for Wave 0 (registerMenu). */
interface FoundrySettings {
  /**
   * Registers a settings menu button that opens an Application.
   *
   * @param module - The module ID (e.g. "evenfoundryvtt")
   * @param key - Unique key for this menu entry
   * @param data - Menu registration data
   */
  registerMenu(
    module: string,
    key: string,
    data: {
      name: string;
      label: string;
      icon: string;
      type: new () => Application;
      restricted: boolean;
    },
  ): void;
}

/** Minimal Foundry i18n API for locale detection at module boot. */
interface FoundryI18n {
  /** The current language tag (e.g. "en", "it", "de-DE"). */
  lang: string;
  /** Localise a dot-notation key from the module's lang catalog. */
  localize(key: string): string;
}

/**
 * Foundry Application base class — minimal surface for Wave 0.
 * Plan 02 (Wave 1) extends this with ApplicationV2 full signature.
 *
 * @see https://foundryvtt.com/api/v13/classes/foundry.applications.api.ApplicationV2.html
 */
declare class Application {
  /** Human-readable title shown in the application window header. */
  get title(): string;
}

/** Foundry game singleton — available globally after the "init" hook fires. */
declare const game: {
  settings: FoundrySettings;
  i18n: FoundryI18n;
};

/**
 * Foundry Hooks registry — global event bus for module lifecycle events.
 *
 * @see https://foundryvtt.com/api/v13/classes/foundry.Hooks.html
 */
declare const Hooks: {
  /**
   * Register a one-time handler for a hook event.
   *
   * @param event - Hook name (e.g. "init", "ready")
   * @param fn - Handler called once when the event fires
   */
  once(event: string, fn: (...args: unknown[]) => void): void;

  /**
   * Register a persistent handler for a hook event.
   *
   * @param event - Hook name
   * @param fn - Handler called on every invocation; returns hook ID
   */
  on(event: string, fn: (...args: unknown[]) => void): number;
};
