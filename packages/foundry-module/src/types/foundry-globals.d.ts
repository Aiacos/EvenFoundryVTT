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
 * Foundry ApplicationV2 — Wave 1 pair modal base class.
 *
 * ApplicationV2 is the v13+ unified application framework replacing
 * the legacy Application class. Lives at `foundry.applications.api.ApplicationV2`
 * — NOT a bare global (verified at runtime against Foundry v13/v14; the bare-global
 * declaration that previously sat here lied about the runtime and caused
 * `ReferenceError: ApplicationV2 is not defined` at module-load).
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
declare namespace foundry {
  namespace applications {
    namespace api {
      class ApplicationV2 {
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
    }
  }
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

// ─── dnd5e 5.x actor system shape ─────────────────────────────────────────────
// Read-only fields consumed by character-reader.ts (Phase 2 — no writes).
// Migration alert: dnd5e 5.3.0+ uses object-iteration for advancement data.

/** Subset of the dnd5e 5.x actor system attributes used by character-reader. */
interface Dnd5eAttributes {
  hp: {
    value: number;
    max: number;
    temp: number;
    tempmax: number;
  };
  ac: { value: number };
  exhaustion: number;
  /**
   * Death saving throw progress (Phase 4b). May be undefined on freshly-created
   * actors that have never rolled a death save — character-reader.ts defends
   * with nullish-coalesce defaults of 0 per counter.
   */
  death?: {
    success: number;
    failure: number;
  };
}

/** Subset of the dnd5e 5.x actor system details used by character-reader. */
interface Dnd5eDetails {
  level: number;
}

/**
 * Spell slot entry in the dnd5e 5.x actor system.
 * Keyed by spell level (e.g. 'spell1', 'spell2', …, 'spell9').
 * May be undefined on non-spellcasting actors or if the level is not used.
 */
interface Dnd5eSpellSlotEntry {
  /** Spell slots currently available. */
  value: number;
  /** Maximum spell slots for this level. */
  max: number;
}

/** Subset of the dnd5e 5.x actor system schema (attributes + details + spells). */
interface Dnd5eActorSystem {
  attributes: Dnd5eAttributes;
  details: Dnd5eDetails;
  /**
   * Spell slot data keyed by spell level (spell1–spell9).
   * Character-reader reads value/max for each level.
   * Each entry may be undefined for non-casters or unused levels.
   *
   * @see packages/foundry-module/src/readers/character-reader.ts (extractSpellbook)
   * @see .planning/phases/05-panel-plugin-system-read-only-panels/05-RESEARCH.md §Pattern 5
   */
  spells?: Record<string, Dnd5eSpellSlotEntry | undefined>;
}

// ─── Foundry Actor (minimal read shape) ───────────────────────────────────────

/**
 * Minimal dnd5e 5.x Active Effect shape — used by combat-reader.ts to detect
 * concentration via `flags.dnd5e.concentrating === true`.
 *
 * @see .planning/phases/05-panel-plugin-system-read-only-panels/05-RESEARCH.md §Pattern 4
 */
interface FoundryActiveEffect {
  /** Effect display name (e.g. 'Bless', 'Hunter's Mark'). */
  name: string;
  /**
   * Module-namespace flags. The dnd5e module sets
   * `flags.dnd5e.concentrating: true` on the effect that represents
   * concentration (RESEARCH assumption A2 — verified at Phase 5 execution time).
   */
  flags: {
    dnd5e?: {
      concentrating?: boolean;
    };
    [key: string]: unknown;
  };
  /**
   * Duration information for the effect.
   * The `label` property is a human-readable string (e.g. '1 minute', '8 hours').
   */
  duration?: {
    label?: string;
  };
}

/**
 * Minimal dnd5e 5.x item shape — used by character-reader.ts to build
 * inventory and spellbook snapshots.
 *
 * @see packages/foundry-module/src/readers/character-reader.ts (extractInventory, extractSpellbook)
 * @see .planning/phases/05-panel-plugin-system-read-only-panels/05-RESEARCH.md §Pattern 5
 */
interface FoundryItem {
  /** Foundry document ID. */
  id: string;
  /** Item display name. */
  name: string;
  /**
   * Item type. dnd5e 5.x types include:
   * 'weapon', 'equipment', 'consumable', 'tool', 'loot', 'spell', 'feat', 'background', 'class', 'subclass', 'container'.
   */
  type: string;
  /** dnd5e 5.x system data for this item. */
  system: {
    /**
     * Quantity of this item the actor carries.
     * Undefined for items that have no quantity (e.g. some class features).
     */
    quantity?: number;
    /** Weight of a single item unit. */
    weight?: number | { value?: number };
    /** Damage formula (weapons). May be undefined for non-damaging items. */
    damage?: {
      base?: { formula?: string };
      parts?: Array<[string, string]>;
    };
    /** Item properties set (weapons: finesse, versatile, light; spells: concentration). */
    properties?: Set<string>;
    /** Spell components (used for concentration detection in older dnd5e versions). */
    components?: {
      concentration?: boolean;
    };
    /**
     * Activation cost for spells and items.
     * The `type` field matches SPELL_ACTIVATION_TYPES from shared-protocol.
     */
    activation?: {
      type?: string;
    };
    /**
     * Range data for spells.
     * Value is in feet; units is the distance unit string.
     */
    range?: {
      value?: number | null;
      units?: string;
    };
    /** Spell level (0 = cantrip, 1-9 = leveled). */
    level?: number;
    /** Spell school identifier (e.g. 'evo', 'ill', 'div'). */
    school?: string;
    /** Whether the spell is prepared (leveled spells only). */
    preparation?: {
      mode?: string;
      prepared?: boolean;
    };
  };
}

/** Minimal Foundry Actor document shape consumed by character-reader and combat-reader. */
interface FoundryActor {
  /** Foundry document ID. */
  id: string;
  /** Actor display name. */
  name: string;
  /** Actor type ("character", "npc", "vehicle", etc.). */
  type: string;
  /** dnd5e 5.x system data. */
  system: Dnd5eActorSystem;
  /**
   * Active condition IDs (Foundry v13+ Set<string>).
   * Examples: "poisoned", "prone", "blinded".
   */
  statuses: Set<string>;
  /**
   * Active effects collection (Foundry v13+).
   * Used by combat-reader.ts to detect concentration effects.
   * The collection is iterable.
   *
   * @see .planning/phases/05-panel-plugin-system-read-only-panels/05-RESEARCH.md §Pattern 4
   */
  effects: {
    contents: FoundryActiveEffect[];
  };
  /**
   * Actor items collection (Foundry v13+).
   * Used by character-reader.ts to build inventory and spellbook snapshots.
   * Items include weapons, equipment, consumables, spells, feats, etc.
   *
   * @see packages/foundry-module/src/readers/character-reader.ts (extractInventory, extractSpellbook)
   * @see .planning/phases/05-panel-plugin-system-read-only-panels/05-RESEARCH.md §Pattern 5
   */
  items?: {
    contents: FoundryItem[];
  };
}

// ─── Foundry Token (minimal read shape) ───────────────────────────────────────

/** Minimal Foundry Token shape used by targetToken hook and scene-reader. */
interface FoundryToken {
  /** Token document ID. */
  id: string;
  /** Token display name. */
  name: string;
  /** Linked actor document, or null for unlinked tokens. */
  document: {
    actorId: string | null;
  };
}

// ─── Foundry Combatant (minimal read shape) ────────────────────────────────────

/** Minimal Foundry Combatant document shape. */
interface FoundryCombatant {
  id: string;
  name: string;
  /** Linked actor ID (null for unlinked combatants). */
  actorId: string | null;
  /** Actor reference (may be null if actor not found in world). */
  actor: FoundryActor | null;
  /** Initiative roll result (null if not yet rolled). */
  initiative: number | null;
}

// ─── Foundry Combat (minimal read shape) ──────────────────────────────────────

/** Minimal Foundry Combat encounter document. */
interface FoundryCombat {
  id: string;
  /** Current round number (1-indexed). */
  round: number;
  /** Current turn index within the round (0-indexed). */
  turn: number;
  /** The combatant whose turn it currently is (null between rounds). */
  combatant: FoundryCombatant | null;
  /** All combatants in initiative order. */
  combatants: { contents: FoundryCombatant[] };
}

// ─── Foundry Scene (minimal read shape) ───────────────────────────────────────

/** Minimal Foundry Scene document. */
interface FoundryScene {
  id: string;
  name: string;
  /** All token documents in this scene. */
  tokens: { contents: Array<{ id: string }> };
}

// ─── Foundry Canvas (minimal read shape) ──────────────────────────────────────

/** Minimal Foundry Canvas object for viewport reads. */
interface FoundryCanvas {
  /** The PIXI.js stage, used for viewport position. */
  stage: {
    pivot: { x: number; y: number };
    scale: { x: number };
  };
}

// ─── Foundry User (minimal read shape) ────────────────────────────────────────

/** Minimal Foundry User document. */
interface FoundryUser {
  id: string;
  /** Set of currently targeted tokens for this user. */
  targets: Set<FoundryToken>;
}

// ─── Collection helper (Foundry Collection<T>) ────────────────────────────────

/** Foundry Collection — Map-like with `.get(id)` and iteration. */
interface FoundryCollection<T> {
  get(id: string): T | undefined;
  contents: T[];
}

/** Foundry game singleton — available globally after the "init" hook fires. */
declare const game: {
  settings: FoundrySettings;
  i18n: FoundryI18n;
  /** All actor documents in the active world. */
  actors: FoundryCollection<FoundryActor>;
  /** Active combat encounter (null when no combat is active). */
  combat: FoundryCombat | null;
  /** All scene documents in the active world. */
  scenes: FoundryCollection<FoundryScene> & { active: FoundryScene | null };
  /** The current logged-in user. */
  user: FoundryUser;
};

/**
 * Foundry canvas singleton — available after the "canvasReady" hook fires.
 *
 * May be null/undefined before the canvas is initialised.
 */
declare const canvas: FoundryCanvas | null | undefined;

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

  /**
   * Remove a persistent handler by its hook ID.
   *
   * @param hookId - ID returned by `Hooks.on(...)`
   */
  off(hookId: number): void;
};
