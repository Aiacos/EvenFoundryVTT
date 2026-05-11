/**
 * Ambient type declarations for Foundry VTT globals used in Phase 2 Wave 0–1.
 *
 * These declarations describe the subset of the Foundry v13/v14 API surface
 * consumed by the evenfoundryvtt module in Wave 0 (skeleton + settings panel)
 * and Wave 1 (bearer registry, pair modal, socketlib handlers).
 * Each wave expands this surface; Plan 05 (readers) adds game.actors, game.combat, etc.
 *
 * Intentionally minimal: only declare what is used. noUncheckedIndexedAccess
 * and strict mode (INV-4 §0.1) require every access to be provably safe.
 *
 * @see Specs.md §3.4 (Foundry compatibility: minimum 13.347, verified 14)
 * @see CLAUDE.md §Technology Stack §1.3 (foundry-module tech decisions)
 */

/** Minimal Foundry settings API for Wave 0 (registerMenu) + Wave 1 (get/set/register). */
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
      // Foundry accepts any constructor — args vary by runtime context
      type: new (
        ...args: unknown[]
      ) => object;
      restricted: boolean;
    },
  ): void;

  /**
   * Registers a game setting (Wave 1 — bearer registry, internalSecrets).
   *
   * @param module - The module ID
   * @param key - Setting key
   * @param data - Setting definition (scope, config, type, default)
   */
  register(module: string, key: string, data: Record<string, unknown>): void;

  /**
   * Reads a game setting value.
   *
   * @param module - The module ID
   * @param key - Setting key
   * @returns The stored value (typed as unknown; callers must cast)
   */
  get(module: string, key: string): unknown;

  /**
   * Writes a game setting value.
   *
   * @param module - The module ID
   * @param key - Setting key
   * @param value - Value to store
   */
  set(module: string, key: string, value: unknown): void;
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
 *
 * @see https://foundryvtt.com/api/v13/classes/foundry.applications.api.ApplicationV2.html
 */
declare class Application {
  /** Human-readable title shown in the application window header. */
  get title(): string;
}

/**
 * Foundry ApplicationV2 — Wave 1 pair modal base class.
 *
 * ApplicationV2 is the v13+ unified application framework replacing
 * the legacy Application class. Pair modal extends this class.
 *
 * Key lifecycle:
 * - `getData()` — returns context for the Handlebars template
 * - `_activateListeners(html)` — binds DOM event listeners
 * - `close()` — closes the modal, clears timers
 * - `render(force?)` — renders or re-renders the modal
 *
 * @see https://foundryvtt.com/api/v13/classes/foundry.applications.api.ApplicationV2.html
 * @see 02-02-PLAN.md Task 2 (PairModal ApplicationV2)
 */
declare class ApplicationV2 {
  /** Renders the application (force=true ensures re-render even if already open). */
  render(force?: boolean): this | Promise<this>;
  /** Closes the application. Returns a promise that resolves when closed. */
  close(options?: { animate?: boolean }): Promise<void>;
  /** Returns template context data (override in subclass). */
  getData(): Promise<Record<string, unknown>>;
  /** Binds DOM event listeners (override in subclass). */
  _activateListeners(html: HTMLElement): void;
  /** Static default options for the application (override in subclass). */
  static get defaultOptions(): {
    id: string;
    title: string;
    template: string;
    width: number;
    height: string | number;
    resizable: boolean;
    [key: string]: unknown;
  };
}

/**
 * Socketlib global injected by the socketlib Foundry module.
 *
 * Available after Foundry's "ready" hook fires (socketlib loads before "ready").
 * NOT on npm — declared as `relationships.requires.socketlib` in module.json.
 *
 * @see https://github.com/farling42/foundryvtt-socketlib
 * @see 02-02-PLAN.md Task 2 (socketlib-handlers.ts)
 * @see packages/foundry-module/module.json (relationships.requires)
 */
declare const socketlib: {
  /**
   * Registers a complex (async, return-value) socket handler.
   *
   * @param moduleId - The module ID (e.g. "evenfoundryvtt")
   * @param handlerId - Handler identifier (e.g. "evf.validateToken")
   * @param handler - Async function executed on the GM client
   */
  registerComplexHandler(
    moduleId: string,
    handlerId: string,
    handler: (...args: unknown[]) => unknown | Promise<unknown>,
  ): void;

  /**
   * Executes a handler on the GM client and returns the result.
   *
   * @param moduleId - The module ID
   * @param handlerId - Handler identifier
   * @param args - Arguments forwarded to the handler
   * @returns Promise resolving to the handler's return value
   */
  executeAsGM(moduleId: string, handlerId: string, ...args: unknown[]): Promise<unknown>;
};

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
