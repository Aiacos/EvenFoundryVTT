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
      /** Optional tooltip/help text shown beside the menu button (i18n key). */
      hint?: string;
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
      // Minimal v13 ApplicationV2 surface used by PairModal. ApplicationV2 itself is abstract
      // about rendering; a renderable subclass mixes in HandlebarsApplicationMixin (below).
      class ApplicationV2 {
        constructor(options?: object);
        /** Root content element after a render. */
        readonly element: HTMLElement;
        /** Render the application (v13 takes options, e.g. { force: true }). */
        render(options?: boolean | { force?: boolean }): Promise<this>;
        /** Close the application. */
        close(options?: { animate?: boolean }): Promise<void>;
        /** Build the template render context (override in subclass — replaces v1 getData). */
        protected _prepareContext(options?: unknown): Promise<Record<string, unknown>>;
        /** Post-render hook for listeners (override in subclass — replaces v1 _activateListeners). */
        protected _onRender(context: unknown, options: unknown): void;
        /** v13 static config (replaces v1 defaultOptions). Title is localised when an i18n key. */
        static DEFAULT_OPTIONS: Record<string, unknown>;
        /** Template parts rendered by HandlebarsApplicationMixin. */
        static PARTS: Record<string, { template: string }>;
      }

      /**
       * Mixin supplying `_renderHTML`/`_replaceHTML` by rendering `static PARTS` Handlebars
       * templates. A renderable ApplicationV2 subclass MUST use it (otherwise Foundry throws
       * "not renderable because it does not implement _renderHTML and _replaceHTML").
       * Typed as identity over the constructor so the subclass keeps ApplicationV2's members.
       */
      // biome-ignore lint/suspicious/noExplicitAny: mixin over an arbitrary constructor
      function HandlebarsApplicationMixin<T extends new (...args: any[]) => object>(Base: T): T;
    }
  }
}

/**
 * A module-scoped socket returned by `socketlib.registerModule(moduleId)`.
 *
 * This is the REAL `farling42/foundryvtt-socketlib` API shape. A module first
 * obtains its socket via `socketlib.registerModule('evenfoundryvtt')`, then
 * registers each handler on the socket with `socket.register(name, fn)` (no
 * moduleId argument — the module scope is captured by `registerModule`). The
 * bridge later invokes a handler on the GM client via
 * `socket.executeAsGM(name, ...args)`.
 *
 * The previously-declared `socketlib.registerComplexHandler(moduleId, ...)`
 * method DID NOT EXIST in the real library (it was invented here so TS compiled
 * and mocked in tests so tests passed), and threw
 * `TypeError: socketlib.registerComplexHandler is not a function` at runtime —
 * aborting the Foundry "ready" hook (Quick Task 260604-lg4).
 *
 * @see https://github.com/farling42/foundryvtt-socketlib (registerModule + socket.register/executeAsGM)
 */
interface SocketlibSocket {
  /**
   * Registers a named handler on this module's socket.
   *
   * @param name - Handler identifier (e.g. "evf.validateToken")
   * @param fn - Function executed on the GM client; may be sync or async
   */
  register(name: string, fn: (...args: unknown[]) => unknown | Promise<unknown>): void;

  /**
   * Executes a registered handler on the GM client and returns the result.
   *
   * The module side never calls this directly today (dispatchTool runs in GM
   * context); the bridge package owns the real `executeAsGM` call sites. The
   * method is declared for correctness so any future module-side caller uses
   * the real API (name first, NO moduleId argument).
   *
   * @param name - Handler identifier
   * @param args - Arguments forwarded to the handler
   * @returns Promise resolving to the handler's return value
   */
  executeAsGM(name: string, ...args: unknown[]): Promise<unknown>;
}

/**
 * Socketlib global injected by the socketlib Foundry module.
 *
 * Available after socketlib fires its `socketlib.ready` hook — the canonical
 * registration point for module handlers (registration MUST happen on
 * `Hooks.once('socketlib.ready', ...)`, NOT inside Foundry's `ready` hook).
 * socketlib is NOT on npm — declared as `relationships.requires.socketlib`
 * in module.json.
 *
 * @see https://github.com/farling42/foundryvtt-socketlib
 * @see packages/foundry-module/src/pair/socketlib-handlers.ts (registerSocketlibHandlers)
 * @see packages/foundry-module/module.json (relationships.requires)
 */
declare const socketlib: {
  /**
   * Registers this module with socketlib and returns its scoped socket.
   *
   * Call once per module (idempotent — returns the same socket for the same id).
   * All handlers are then registered on the returned socket via
   * `socket.register(name, fn)`.
   *
   * @param moduleId - The module ID (e.g. "evenfoundryvtt")
   * @returns The module-scoped {@link SocketlibSocket}
   */
  registerModule(moduleId: string): SocketlibSocket;
};

/**
 * MidiQOL global — optional Foundry automation module (FIX-B/FIX-C, 260529-eer).
 *
 * MidiQOL is an OPTIONAL Foundry module (gitlab.com/tposney/midi-qol), NOT on
 * npm. When present it owns the full attack→damage→save→apply workflow and is
 * the ONLY layer that can headlessly auto-apply advantage / inject explicit
 * targets without mutating `game.user.targets` (the documented v13 per-user
 * pitfall). Vanilla dnd5e `activity.use()` cannot do this (research §2/§3).
 *
 * Declared **possibly-undefined**: the global can be `undefined` even when the
 * module is active-but-not-yet-initialized. The runtime source of truth is the
 * guard `typeof MidiQOL !== 'undefined' && game.modules.get('midi-qol')?.active`,
 * and `MidiQOL` is only dereferenced inside that guarded branch.
 *
 * `midiOptions.targetUuids` (string UUID array) + `advantage`/`disadvantage`
 * booleans drive the workflow against explicit targets (research §4/§5/§6).
 *
 * @see packages/foundry-module/src/write-path/handlers/weapon-attack.ts
 * @see packages/foundry-module/src/write-path/handlers/cast-spell.ts
 */
declare const MidiQOL:
  | {
      /**
       * Drives the full activity workflow (attack→damage→save→apply) against
       * the targets in `usage.midiOptions.targetUuids`, honoring
       * `midiOptions.advantage` / `midiOptions.disadvantage`.
       *
       * @param activity - The dnd5e activity to execute
       * @param usage - Usage config; `midiOptions` carries targetUuids + advantage flags
       * @param dialog - Dialog config (`configure: false` for headless EVF invocation)
       * @param message - Message config (`create: true` posts the chat card)
       * @returns Resolves with a MidiQOL Workflow object
       */
      completeActivityUse(
        activity: FoundryActivity,
        usage?: { midiOptions?: Record<string, unknown> } & Record<string, unknown>,
        dialog?: { configure?: boolean },
        message?: { create?: boolean },
      ): Promise<unknown>;
    }
  | undefined;

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
  /**
   * Initiative modifier — dnd5e prep-time computed total (Phase 21).
   * Path: `actor.system.attributes.init.total`.
   * May be undefined on freshly-created actors; reader defends with `?? 0`.
   */
  init?: { total?: number };
  /**
   * Movement speeds in feet (Phase 21).
   * Path: `actor.system.attributes.movement.walk` (walk speed).
   * Other modes (fly/swim/climb) included for completeness; all optional.
   * May be undefined on freshly-created actors; reader defends with default 30.
   */
  movement?: {
    walk?: number;
    fly?: number;
    swim?: number;
    climb?: number;
  };
}

/** Subset of the dnd5e 5.x actor system details used by character-reader. */
interface Dnd5eDetails {
  level: number;
  /**
   * Personality traits (Phase 22 Plan 22-02; RDATA-04).
   * Field key is 'trait' (NOT 'personality') — labeled "DND5E.PersonalityTraits".
   * The wire schema exposes this as `biography.personality` (D-22.4 naming).
   * CITED: github.com/foundryvtt/dnd5e release-5.3.3 module/data/actor/character.mjs
   *        details.trait StringField label "DND5E.PersonalityTraits"
   */
  trait?: string;
  /** Character ideals (Phase 22 Plan 22-02).
   * CITED: github.com/foundryvtt/dnd5e release-5.3.3 module/data/actor/templates/details.mjs
   *        DetailsFields.creature.ideal StringField */
  ideal?: string;
  /** Character bonds (Phase 22 Plan 22-02).
   * CITED: dnd5e release-5.3.3 module/data/actor/templates/details.mjs DetailsFields.creature.bond */
  bond?: string;
  /** Character flaws (Phase 22 Plan 22-02).
   * CITED: dnd5e release-5.3.3 module/data/actor/templates/details.mjs DetailsFields.creature.flaw */
  flaw?: string;
  /**
   * Character biography HTML (Phase 22 Plan 22-02).
   * `value` is an HTMLField — HTML-stripped by extractBiography() before the wire payload
   * (T-22-03 mitigation). `public` is the public-facing biography (not needed Phase 22).
   * CITED: dnd5e release-5.3.3 module/data/actor/templates/details.mjs DetailsFields.biography
   */
  biography?: {
    value?: string;
    public?: string;
  };
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

/**
 * Per-ability sub-object in the dnd5e 5.x actor system schema (Phase 16 Plan 16-02).
 *
 * Keyed by canonical ability codes (str/dex/con/int/wis/cha) on
 * {@link Dnd5eActorSystem}. Fresh actors lacking dnd5e prep may have
 * `abilities` undefined entirely — character-reader's `extractAbilities`
 * helper emits zero-defaults for that case (CR-AB-2).
 *
 * `save` is canonically `{value: number}` (dnd5e prep-time computed total —
 * INV-2 cross-checked 2026-05-18 against github.com/foundryvtt/dnd5e
 * release-5.3.3 module/data/actor/templates/common.mjs). All fields are
 * declared optional here because dnd5e may leave any of them absent on
 * fresh / partially-prepped actors; the reader applies per-field defensive
 * nullish-coalesce.
 *
 * `proficient` carries dnd5e's raw `0 | 0.5 | 1 | 2` (none/half/full/expertise);
 * the reader coerces to strict boolean for the Main tab wire payload
 * (Phase 17 Skills tab will introduce the full glyph spectrum).
 */
interface Dnd5eAbilityRaw {
  /** Raw ability score (0..30 — divine cap). */
  value?: number;
  /** Ability modifier — floor((value-10)/2); negative allowed. */
  mod?: number;
  /** Saving throw — dnd5e prep-time computed total wrapped in `{value}`. */
  save?: { value?: number };
  /** Save proficiency tier: 0=none, 0.5=half, 1=full, 2=expertise. */
  proficient?: 0 | 0.5 | 1 | 2;
  /** Spell save DC for this ability (≥ 0). */
  dc?: number;
}

/**
 * Per-skill sub-object in the dnd5e 5.x actor system schema (Phase 17 Plan 17-02).
 *
 * Keyed by canonical 3-char dnd5e skill codes
 * (acr/ani/arc/ath/dec/his/ins/itm/inv/med/nat/prc/prf/per/rel/slt/ste/sur)
 * on {@link Dnd5eActorSystem}. Fresh actors lacking dnd5e prep may have
 * `skills` undefined entirely — character-reader's `extractSkills` helper
 * emits zero-defaults for that case (CR-SK-2).
 *
 * Field shapes (INV-2 cross-checked 2026-05-18 against github.com/foundryvtt/
 * dnd5e release-5.3.3 module/data/actor/templates/common.mjs + dnd5e wiki
 * Roll-Formulas):
 * - `total`     — Final skill modifier (number, dnd5e prep-time computed).
 * - `ability`   — 3-char ability code driving this skill (e.g. 'dex' for acr).
 * - `proficient`— 0 (none) | 0.5 (half) | 1 (full) | 2 (expertise).
 * - `passive`   — Passive skill score (number, dnd5e prep-time computed,
 *                 typically 10 + total but magic-item / Observant bonuses
 *                 may diverge).
 *
 * All fields are declared optional because dnd5e may leave any of them
 * absent on fresh / partially-prepped actors; the reader applies per-field
 * defensive nullish-coalesce.
 *
 * Unlike `Dnd5eAbilityRaw.proficient` (which the reader coerces to boolean
 * for Main tab), `Dnd5eSkillRaw.proficient` is preserved verbatim through
 * the wire — Phase 17 Skills tab uses the full 0|0.5|1|2 spectrum for
 * ○/◉/★ glyph mapping per UI-SPEC §3.
 */
interface Dnd5eSkillRaw {
  /** Final skill modifier (dnd5e prep-time computed; includes ability + prof + bonuses). */
  total?: number;
  /** 3-char ability code driving this skill (e.g. 'dex' for acrobatics). */
  ability?: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
  /** Skill proficiency tier: 0=none, 0.5=half, 1=full, 2=expertise. */
  proficient?: 0 | 0.5 | 1 | 2;
  /** Passive skill score (dnd5e prep-time computed; ≥ 0). */
  passive?: number;
}

/** Subset of the dnd5e 5.x actor system schema (attributes + details + spells + abilities + skills). */
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
  /**
   * Ability scores keyed by `str | dex | con | int | wis | cha` (Phase 16 Plan 16-02).
   * Optional at the type level because dnd5e may leave `abilities` undefined on
   * fresh actors prior to first prep — the reader's `extractAbilities` emits
   * zero-defaults for that case.
   *
   * @see packages/foundry-module/src/readers/character-reader.ts (extractAbilities)
   * @see .planning/phases/EVF-16-sheet-ability-scores-main-tab-data-wiring/16-CONTEXT.md §Area 2
   */
  abilities?: Partial<Record<'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha', Dnd5eAbilityRaw>>;
  /**
   * Skill data keyed by 3-char dnd5e short code (Phase 17 Plan 17-02).
   * Optional at the type level because dnd5e may leave `skills` undefined
   * on fresh actors prior to first prep — the reader's `extractSkills`
   * emits zero-defaults for that case.
   *
   * The 18-key list is duplicated as a string-literal union here (not imported
   * from `@evf/shared-protocol`'s `SKILL_KEYS`) because `foundry-globals.d.ts`
   * is a pure ambient declaration file — module imports in `.d.ts` ambient files
   * conflict with global typings. Mirrors the Phase 16 `abilities?` pattern.
   *
   * @see packages/foundry-module/src/readers/character-reader.ts (extractSkills)
   * @see .planning/phases/EVF-17-sheet-skills-tab-skills-tab-data-wiring/17-CONTEXT.md §Area 2
   */
  skills?: Partial<
    Record<
      | 'acr'
      | 'ani'
      | 'arc'
      | 'ath'
      | 'dec'
      | 'his'
      | 'ins'
      | 'itm'
      | 'inv'
      | 'med'
      | 'nat'
      | 'prc'
      | 'prf'
      | 'per'
      | 'rel'
      | 'slt'
      | 'ste'
      | 'sur',
      Dnd5eSkillRaw
    >
  >;
}

// ─── Foundry Actor (minimal read shape) ───────────────────────────────────────

/**
 * Minimal dnd5e 5.x Active Effect shape — used by combat-reader.ts to detect
 * concentration via `flags.dnd5e.concentrating === true`.
 *
 * Extended in Phase 7 Plan 01 to include `delete()` for the `drop-concentration`
 * handler which removes the concentration effect via `effect.delete()`.
 *
 * @see .planning/phases/05-panel-plugin-system-read-only-panels/05-RESEARCH.md §Pattern 4
 * @see packages/foundry-module/src/write-path/handlers/drop-concentration-handler.ts (Phase 07-05)
 * @see .planning/phases/07-foundry-module-write-path/07-01-PLAN.md Task 1
 */
interface FoundryActiveEffect {
  /**
   * Foundry document ID for this active effect.
   *
   * Added Plan 07-05: `drop-concentration` handler resolves the effect via
   * `actor.effects.contents.find(e => e.id === args.effect_id)`.
   *
   * @see packages/foundry-module/src/write-path/handlers/drop-concentration.ts
   */
  id: string;
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
  /**
   * Deletes this Active Effect document from the actor.
   *
   * Used by `drop-concentration` handler (Plan 07-05) to remove the
   * concentration effect when the player confirms dropping concentration
   * via the Phase 4b modal.
   *
   * @returns Promise resolving when the document deletion is complete
   */
  delete(): Promise<unknown>;
}

/**
 * dnd5e 5.x Activity — represents a single executable action on an item.
 *
 * Activities are the dnd5e 5.x replacement for the legacy item roll flow.
 * Items (spells, weapons, consumables) may have one or more activities
 * (e.g. a weapon may have an 'attack' activity and a 'damage' activity).
 *
 * Added in Phase 7 Plan 02 for the cast-spell, weapon-attack, and use-item handlers.
 *
 * @see packages/foundry-module/src/write-path/handlers/cast-spell.ts
 * @see packages/foundry-module/src/write-path/handlers/weapon-attack.ts
 * @see packages/foundry-module/src/write-path/handlers/use-item.ts
 * @see .planning/phases/07-foundry-module-write-path/07-02-PLAN.md Task 1
 */
interface FoundryActivity {
  /**
   * Activity type discriminant (e.g. 'attack', 'spell', 'save', 'utility', 'damage').
   * Handler for weapon-attack locates the first activity with `type === 'attack'`.
   */
  type: string;

  /**
   * Executes this activity (triggers the dnd5e activity workflow).
   *
   * Resolves when the workflow completes (chat card created, rolls resolved).
   * May reject with a user-facing error string or "No connected GM" signal.
   *
   * `configure: false` skips the configuration dialog — required for programmatic
   * invocation from the bridge (no user-facing dialog in glasses UI).
   *
   * @param config - Optional use configuration
   * @param config.configure - Skip configuration dialog (always false for EVF)
   * @param config.consume - Optional resource consumption overrides
   * @returns Resolves with a ChatMessage-like result object (id = chat card ID)
   *
   * @see .planning/phases/07-foundry-module-write-path/07-RESEARCH.md Pattern 1
   */
  use(config?: { configure?: boolean; consume?: { action?: boolean } }): Promise<unknown>;
}

/**
 * Minimal dnd5e 5.x item shape — used by character-reader.ts to build
 * inventory and spellbook snapshots.
 *
 * Extended in Phase 7 Plan 02 to include `system.activities` for handler use.
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
    /**
     * dnd5e 5.x Activity collection for this item.
     *
     * Present on items that have executable actions (spells, weapons, consumables).
     * May be undefined on passive items (loot, containers) or legacy items.
     *
     * Added in Phase 7 Plan 02 for write-path handlers.
     *
     * @see FoundryActivity
     */
    activities?: {
      contents: FoundryActivity[];
    };
    /**
     * Feature type classification (Phase 22 Plan 22-02; RDATA-03).
     * Present on feat items; may be absent on pre-categorisation legacy items (PHB 2014).
     * `value`: dnd5e featureType key ('background'|'class'|'race'|'feat'|'monster'|etc.)
     * `subtype`: sub-category ('origin'|'general'|'ki'|'fightingStyle'|etc.)
     * CITED: github.com/foundryvtt/dnd5e release-5.3.3 module/data/item/feat.mjs
     *        + module/config.mjs CONFIG.DND5E.featureTypes
     *
     * Inline declaration (no @evf/shared-protocol import) — ambient files must be
     * import-free (script-mode) to preserve global scope (Pitfall 6).
     */
    type?: {
      value?: string;
      subtype?: string;
    };
    /**
     * Item description (HTML). Present on most dnd5e items.
     * Phase 22 Plan 22-02: used by extractFeats() to populate FeatEntry.description
     * (HTML-stripped before entering the wire payload; T-22-03 mitigation).
     * CITED: github.com/foundryvtt/dnd5e release-5.3.3 module/data/item/fields/
     *        item-description.mjs (HTMLField labeled "DND5E.DescriptionValue")
     */
    description?: {
      value?: string;
    };
  };
}

/**
 * Foundry Token document — write-path shape for move-token handler.
 *
 * Extends the read-only FoundryToken shape with `update()` for position
 * mutations. The move-token handler calls `tokenDoc.update({ x, y })`
 * directly (NOT via activity.use — move is a document update, not an activity).
 *
 * Added in Phase 7 Plan 02 for the move-token handler.
 *
 * @see packages/foundry-module/src/write-path/handlers/move-token.ts
 * @see .planning/phases/07-foundry-module-write-path/07-02-PLAN.md Task 1
 */
interface FoundryTokenDoc {
  /** Foundry token document ID. */
  id: string;

  /**
   * Updates token document fields.
   *
   * Used by move-token handler to set position (`{ x, y }`).
   * Foundry validates canvas bounds on update — handler relies on Foundry
   * enforcement rather than duplicating coordinate validation.
   *
   * @param changes - Partial document changes to apply
   * @returns Promise resolving when the update is applied to the document
   */
  update(changes: { x?: number; y?: number; [k: string]: unknown }): Promise<unknown>;
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
  /**
   * Actor portrait image path (Plan 13-03 — STRETCH-06 Bio tab portrait).
   *
   * Canonical Foundry `actor.img` field — the portrait URL for the character.
   * Common shapes: relative path ('worlds/{world}/portraits/hero.webp'),
   * absolute external URL ('https://cdn.example.com/hero.png'), or Foundry
   * default placeholder ('icons/svg/mystery-man.svg').
   *
   * character-reader.ts passes this through as `snapshot.portrait.url` when present
   * and non-empty. Bridge validates URL safety (T-13-02 SSRF mitigation).
   *
   * @see packages/foundry-module/src/readers/character-reader.ts
   * @see .planning/phases/13-v2-stretch/13-03-PLAN.md (D-13-05)
   */
  img?: string;
  /**
   * Tests whether `user` has at least `permission` on this actor (ADR-0014).
   *
   * Canonical Foundry `Document#testUserPermission`. The `permission` argument
   * accepts the ownership-level name (e.g. `"OWNER"`, `"OBSERVER"`) or its
   * numeric `CONST.DOCUMENT_OWNERSHIP_LEVELS` value. We always pass the string
   * `"OWNER"` to derive the bearer's authorized actor set.
   *
   * @param user - The Foundry User to test permission for.
   * @param permission - Ownership level name (e.g. `"OWNER"`) or numeric level.
   * @returns true when the user holds at least the given permission.
   * @see https://foundryvtt.com/api/classes/foundry.abstract.Document.html
   * @see docs/architecture/0014-bearer-actor-authorization.md
   */
  testUserPermission(user: FoundryUser, permission: string | number): boolean;
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
  /**
   * All token documents in this scene.
   *
   * Widened from `{ contents: Array<{ id: string }> }` to
   * `FoundryCollection<FoundryTokenDoc>` in Phase 7 Plan 02 to support
   * the move-token handler's `scene.tokens.get(token_id)` call.
   *
   * `FoundryCollection<T>` exposes both `.get(id)` and `.contents` array,
   * so existing `.contents` accesses in scene-reader.ts remain valid.
   *
   * @see packages/foundry-module/src/write-path/handlers/move-token.ts
   * @see .planning/phases/07-foundry-module-write-path/07-02-PLAN.md Task 1
   */
  tokens: FoundryCollection<FoundryTokenDoc>;
  /**
   * Creates embedded documents of the given type within this scene.
   *
   * Used by `confirmTemplatePlacementHandler` (Plan 07-03) to commit
   * R1-confirmed AoE template positions as MeasuredTemplate documents.
   * Bypasses `drawPreview()` which is incompatible with the R1 input model
   * (RESEARCH §Q2 Pitfall 3).
   *
   * Foundry validates scene bounds and permissions server-side — the handler
   * relies on Foundry enforcement rather than duplicating coordinate validation
   * (T-07-03-03: x/y outside scene bounds → Foundry rejects, no crash).
   *
   * @param type  - The embedded document type to create (e.g. `'MeasuredTemplate'`)
   * @param data  - Array of document creation data objects
   * @returns Promise resolving to the created document stubs (id is always present)
   *
   * @see packages/foundry-module/src/write-path/handlers/place-template.ts
   * @see .planning/phases/07-foundry-module-write-path/07-03-PLAN.md Task 1
   * @see .planning/phases/07-foundry-module-write-path/07-RESEARCH.md §Q2
   */
  createEmbeddedDocuments(
    type: string,
    data: Array<Record<string, unknown>>,
  ): Promise<Array<{ id: string }>>;
}

// ─── Foundry Canvas (minimal read shape) ──────────────────────────────────────

/** Minimal Foundry Canvas object for viewport reads and write-path operations. */
interface FoundryCanvas {
  /** The PIXI.js stage, used for viewport position. */
  stage: {
    pivot: { x: number; y: number };
    scale: { x: number };
  };
  /**
   * The currently active scene (same reference as `game.scenes.active`).
   *
   * Added in Phase 7 Plan 03 — `confirmTemplatePlacementHandler` calls
   * `canvas.scene.createEmbeddedDocuments('MeasuredTemplate', [...])` to commit
   * R1-confirmed template positions. Using `canvas.scene` is the idiomatic
   * Foundry pattern for scene mutations inside module code.
   *
   * May be null when no scene is loaded (canvas not yet active).
   *
   * @see packages/foundry-module/src/write-path/handlers/place-template.ts
   * @see .planning/phases/07-foundry-module-write-path/07-03-PLAN.md Task 1
   */
  scene: FoundryScene | null;
}

// ─── Foundry User (minimal read shape) ────────────────────────────────────────

/**
 * Minimal Foundry User document.
 *
 * Extended in Phase 7 Plan 01 to include `isGM` + `active` flags used by
 * `writeAuditLog` to build the `whisper: gmIds` array for `ChatMessage.create`.
 *
 * Extended in Phase 7 Plan 05 to include `character` — the player's assigned
 * character. Used by `reaction-watcher.ts` to identify whose character to match
 * when detecting NPC activities targeting the player.
 *
 * @see packages/foundry-module/src/write-path/audit-log.ts
 * @see packages/foundry-module/src/write-path/reaction-watcher.ts
 * @see .planning/phases/07-foundry-module-write-path/07-01-PLAN.md Task 1
 * @see .planning/phases/07-foundry-module-write-path/07-05-PLAN.md Task 1
 */
interface FoundryUser {
  id: string;
  /**
   * User display name (e.g. "Aiacos", "Gamemaster"). Used by the PairModal user
   * selector (ADR-0014) to label each option.
   */
  name: string;
  /** Set of currently targeted tokens for this user. */
  targets: Set<FoundryToken>;
  /**
   * Whether this user has the GM role.
   * Used by writeAuditLog to filter `game.users.contents` for `whisper: gmIds`.
   */
  isGM: boolean;
  /** Whether this user is currently active (connected to the session). */
  active: boolean;
  /**
   * The player's assigned character actor, or null if no character is assigned.
   *
   * Added Plan 07-05: reaction-watcher reads `game.user?.character?.id` to
   * identify the player character to match against NPC activities. May be null
   * for GMs or players who have not yet selected a character.
   */
  character?: { id: string } | null;
}

// ─── Collection helper (Foundry Collection<T>) ────────────────────────────────

/** Foundry Collection — Map-like with `.get(id)` and iteration. */
interface FoundryCollection<T> {
  get(id: string): T | undefined;
  contents: T[];
}

/**
 * Minimal Foundry ChatMessage shape used by log-reader.ts.
 *
 * Only the fields accessed by the log reader are declared here.
 * Typed defensively — all fields that may be absent are optional.
 *
 * @see packages/foundry-module/src/readers/log-reader.ts
 * @see .planning/phases/05-panel-plugin-system-read-only-panels/05-RESEARCH.md §Assumption A4
 */
interface FoundryChatMessage {
  id: string;
  timestamp?: number;
  speaker?: { alias?: string };
  flags?: Record<string, unknown>;
  rolls?: Array<{ total?: number }>;
}

/**
 * Foundry ChatMessage namespace — write-path audit log creation.
 *
 * Declared as an ambient namespace to allow `ChatMessage.create(...)` calls
 * from `writeAuditLog` (Phase 7 Plan 01). The static `create` method issues
 * a GM-only chat message with `whisper: gmIds` (T-07-04 mitigation).
 *
 * `whisper` is an array of user IDs — only those users can see the message.
 * `flags.evf.audit` stores the structured audit entry for GM-side queries.
 *
 * @see packages/foundry-module/src/write-path/audit-log.ts (consumer)
 * @see Specs.md §5.2 (bridge logging pattern — analogous GM-side audit)
 * @see .planning/phases/07-foundry-module-write-path/07-01-PLAN.md Task 1
 */
declare namespace ChatMessage {
  /**
   * Creates a new Foundry ChatMessage document.
   *
   * @param data - Chat message creation data. Key fields for EVF audit log:
   *   - `whisper` — array of User IDs who can see the message (GM-only for audit)
   *   - `flags.evf.audit` — structured audit entry (queryable via Foundry chat filter)
   *   - `speaker` — display alias (e.g. 'EVF Audit')
   *   - `content` — HTML content of the message
   * @returns Promise resolving to the created ChatMessage document (typed as unknown —
   *          callers do not need to inspect the return value for audit purposes)
   */
  function create(data: {
    user?: string;
    whisper?: string[];
    speaker?: { alias?: string };
    content?: string;
    flags?: Record<string, unknown>;
  }): Promise<unknown>;
}

/**
 * dnd5e 5.x namespace extensions — write-path AoE template placement.
 *
 * Declares the `AbilityTemplate.fromActivity` static method consumed by
 * the `place-template` handler (Plan 07-04 Wave 2). Declared here per
 * Phase 7 Wave 0 PLAN requirement so the foundry-globals.d.ts extension
 * is established before handlers land.
 *
 * `fromActivity` is synchronous and returns an array of AbilityTemplate
 * objects (or null for activities with no template). Templates initialize
 * at x:0, y:0 — the handler must call `canvas.scene.createEmbeddedDocuments`
 * with the R1-confirmed coordinates to finalize placement.
 *
 * @see .planning/phases/07-foundry-module-write-path/07-RESEARCH.md §Q2
 * @see github.com/foundryvtt/dnd5e/blob/release-5.3.3/module/canvas/ability-template.mjs
 * @see .planning/phases/07-foundry-module-write-path/07-01-PLAN.md Task 1
 */
declare namespace dnd5e {
  namespace canvas {
    /**
     * AbilityTemplate — Foundry MeasuredTemplate for dnd5e AoE spells.
     *
     * Constructed via the static `fromActivity` factory. The resulting objects
     * contain the template document data ready for `createEmbeddedDocuments`.
     *
     * Updated in Phase 7 Plan 03 to include the typed `document` sub-object
     * with `t`, `distance`, `angle`, and `toObject()` — fields consumed by
     * `placeTemplateHandler` and `confirmTemplatePlacementHandler`.
     *
     * @see packages/foundry-module/src/write-path/handlers/place-template.ts
     * @see .planning/phases/07-foundry-module-write-path/07-03-PLAN.md Task 1
     */
    interface AbilityTemplate {
      /**
       * Template document data.
       *
       * Contains the MeasuredTemplate fields initialised by `fromActivity`.
       * `x` and `y` are 0/0 placeholders — the handler must override them
       * with R1-confirmed coordinates before calling `createEmbeddedDocuments`.
       *
       * `toObject()` serialises the document to a plain record suitable for
       * `createEmbeddedDocuments` (including all hidden fields like `_id`,
       * `flags`, etc. that Foundry expects).
       */
      document: {
        /** Current X position (placeholder 0 — overridden before commit). */
        x: number;
        /** Current Y position (placeholder 0 — overridden before commit). */
        y: number;
        /**
         * Template shape type.
         * Matches Foundry's MeasuredTemplate `t` field:
         * - `'circle'` — radius-based (e.g. Fireball)
         * - `'cone'`   — cone with `distance` length + `angle` width (e.g. Burning Hands)
         * - `'rect'`   — rectangle (e.g. Wall of Fire)
         * - `'ray'`    — line/ray (e.g. Lightning Bolt)
         */
        t: 'circle' | 'cone' | 'rect' | 'ray';
        /** Template radius/length in scene units (feet). */
        distance: number;
        /** Cone angle in degrees (only present for `t: 'cone'`). */
        angle?: number;
        /**
         * Serialises the template document to a plain object.
         *
         * Used by `confirmTemplatePlacementHandler` to build the data array
         * for `canvas.scene.createEmbeddedDocuments('MeasuredTemplate', [...])`.
         * The caller then overwrites `x` and `y` with confirmed coordinates
         * before passing to Foundry.
         *
         * @returns Plain record with all MeasuredTemplate fields
         */
        toObject(): Record<string, unknown>;
      };
    }

    namespace AbilityTemplate {
      /**
       * Factory method: constructs AbilityTemplate instances from a dnd5e Activity.
       *
       * **CRITICAL: This method is SYNCHRONOUS.** Never `await` the return value.
       * Per RESEARCH §Q2 and Pitfall 3 — the sync return contract is authoritative.
       *
       * Returns one AbilityTemplate per target (e.g., Magic Missile with 3 targets
       * returns 3 templates). Each template's `document.x` and `document.y` are
       * initialized to 0 — the handler must position them via R1 input before
       * committing via `canvas.scene.createEmbeddedDocuments`.
       *
       * Returns `null` for activities without AoE templates (melee attacks, utility
       * spells, etc.). Handler must check for null + empty array.
       *
       * @param activity - The dnd5e 5.x Activity document (cast, weapon, etc.)
       * @param options  - Optional template options (currently unused by EVF)
       * @returns Array of AbilityTemplate instances (may be empty) or null
       *
       * @see .planning/phases/07-foundry-module-write-path/07-RESEARCH.md §Q2
       * @see .planning/phases/07-foundry-module-write-path/07-03-PLAN.md Task 1 (NO drawPreview)
       */
      function fromActivity(activity: unknown, options?: unknown): AbilityTemplate[] | null;
    }
  }
}

// ─── Compendium Collection (minimal read shape) ────────────────────────────────

/**
 * A single entry in a CompendiumCollection index.
 *
 * The index is a lightweight listing of all documents in the pack without
 * loading the full document data. Used by spell-pack-reader.ts to enumerate
 * available spells without expensive full-document fetches.
 *
 * @see packages/foundry-module/src/readers/spell-pack-reader.ts
 * @see https://foundryvtt.com/api/v13/classes/foundry.CompendiumCollection.html
 */
interface CompendiumIndexEntry {
  /** Foundry document ID (unique within the pack; globally unique within a world). */
  _id: string;
  /** Document display name (canonical English for dnd5e SRD packs). */
  name: string;
  /**
   * Document type discriminant.
   * For Item-type packs: 'spell', 'weapon', 'feat', 'equipment', 'consumable', etc.
   * spell-pack-reader filters for `entry.type === 'spell'`.
   */
  type: string;
  /** Document icon path (not used by spell-pack-reader; included for completeness). */
  img?: string;
}

/**
 * Compendium pack metadata fields consumed by spell-pack-reader.ts.
 *
 * @see https://foundryvtt.com/api/v13/classes/foundry.CompendiumCollection.html
 */
interface CompendiumMetadata {
  /**
   * Document type of entries in this pack.
   * spell-pack-reader filters for `metadata.type === 'Item'`.
   */
  type: string;
  /**
   * Game system this pack belongs to (e.g. 'dnd5e', 'pf2e').
   * spell-pack-reader filters for `metadata.system === 'dnd5e'`.
   */
  system: string;
  /** Human-readable pack name. */
  label?: string;
}

/**
 * Minimal CompendiumCollection shape consumed by spell-pack-reader.ts.
 *
 * The full Foundry CompendiumCollection has many more methods; only the
 * fields accessed by the reader are declared here (INV-4 minimal surface).
 *
 * @see https://foundryvtt.com/api/v13/classes/foundry.CompendiumCollection.html
 * @see packages/foundry-module/src/readers/spell-pack-reader.ts
 */
interface CompendiumCollection {
  /** Pack identifier (e.g. 'dnd5e.spells', 'dnd5e.tashas'). */
  collection: string;
  /** Pack metadata — type, system, label. */
  metadata: CompendiumMetadata;
  /**
   * Index of all entries in this pack (loaded lazily by Foundry at init).
   *
   * The index is a Collection of lightweight entry stubs — much faster than
   * loading full documents. spell-pack-reader reads `.index.contents` directly.
   *
   * Note: `.index` may be an empty Collection before the pack is fully indexed.
   * The reader defends against this with `?? []` in the spread pattern.
   */
  index: {
    contents: CompendiumIndexEntry[];
    size: number;
  };
}

/**
 * WorldCollection<CompendiumCollection> — `game.packs` global.
 *
 * Provides `get(packId)` for direct lookup and `contents` for iteration.
 * `game.packs.get('dnd5e.spells')` returns the SRD spells pack OR undefined
 * (e.g. when the system is not loaded or the pack is not installed).
 *
 * @see https://foundryvtt.com/api/v13/classes/foundry.WorldCollection.html
 */
interface FoundryWorldPacks {
  /** Get a compendium pack by its full pack ID (e.g. 'dnd5e.spells'). */
  get(packId: string): CompendiumCollection | undefined;
  /** All registered compendium packs. */
  contents: CompendiumCollection[];
  /** Number of packs registered. */
  size: number;
}

/** Foundry game singleton — available globally after the "init" hook fires. */
declare const game: {
  settings: FoundrySettings;
  i18n: FoundryI18n;
  /** All actor documents in the active world. */
  actors: FoundryCollection<FoundryActor>;
  /** Active combat encounter (null when no combat is active). */
  combat: FoundryCombat | null;
  /** Chat message collection (Phase 5 — log-reader.ts). */
  messages: FoundryCollection<FoundryChatMessage>;
  /**
   * All registered compendium packs (WorldCollection<CompendiumCollection>).
   *
   * Added in Quick Task 20260517: spell-pack-reader.ts iterates this to build
   * the dynamic spell vocabulary. Filters for `metadata.type === 'Item'` +
   * `metadata.system === 'dnd5e'` to extract dnd5e spell packs only.
   *
   * @see packages/foundry-module/src/readers/spell-pack-reader.ts
   * @see https://foundryvtt.com/api/v13/classes/foundry.WorldCollection.html
   */
  packs: FoundryWorldPacks;
  /** All scene documents in the active world. */
  scenes: FoundryCollection<FoundryScene> & { active: FoundryScene | null };
  /** The current logged-in user. */
  user: FoundryUser;
  /**
   * All user documents in the active world.
   *
   * Used by `writeAuditLog` (Phase 7 Plan 01) to build the `whisper: gmIds`
   * array for `ChatMessage.create`. Filtered via:
   * `game.users.contents.filter(u => u.isGM).map(u => u.id)`
   *
   * @see packages/foundry-module/src/write-path/audit-log.ts
   * @see .planning/phases/07-foundry-module-write-path/07-01-PLAN.md Task 1
   */
  users: FoundryCollection<FoundryUser>;
  /**
   * Module registry — capability detection for optional module dependencies.
   *
   * Added by FIX-B/FIX-C (260529-eer): the write-path handlers query
   * `game.modules.get('midi-qol')?.active` to decide between the MidiQOL
   * automation path (advantage + explicit targets) and the vanilla
   * `activity.use` path. `get` returns `undefined` for unknown / not-installed
   * module IDs.
   *
   * @see packages/foundry-module/src/write-path/handlers/weapon-attack.ts
   * @see packages/foundry-module/src/write-path/handlers/cast-spell.ts
   * @see https://foundryvtt.com/api/v13/classes/foundry.helpers.ModuleManagement.html
   */
  modules: { get(id: string): { active: boolean } | undefined };
  /**
   * The active world descriptor. `world.id` is the world identifier provisioned to the
   * bridge alongside a bearer (PairModal reads it at render time on the no-arg
   * registerMenu construction path).
   *
   * @see packages/foundry-module/src/pair/PairModal.ts
   * @see https://foundryvtt.com/api/v13/classes/foundry.packages.BaseWorld.html
   */
  world: { id: string };
};

/**
 * Foundry canvas singleton — available after the "canvasReady" hook fires.
 *
 * May be null/undefined before the canvas is initialised.
 */
declare const canvas: FoundryCanvas | null | undefined;

/**
 * Foundry UI singleton — global access to interface managers.
 *
 * Added Quick Task 260604-mjr for the BridgeConfigModal Save/error feedback.
 * Only the `notifications` manager is declared (the minimal surface used:
 * transient toast notifications). `info`/`error`/`warn` post a toast; they are
 * declared optional-chainable on `ui.notifications` because Foundry may not have
 * initialised the notifications manager in very early lifecycle phases.
 *
 * @see https://foundryvtt.com/api/v13/classes/foundry.helpers.interaction.Notifications.html
 * @see packages/foundry-module/src/pair/BridgeConfigModal.ts
 */
declare const ui: {
  notifications?: {
    /** Post an informational (success) toast. */
    info(message: string): void;
    /** Post a warning toast. */
    warn(message: string): void;
    /** Post an error toast. */
    error(message: string): void;
  };
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

  /**
   * Remove a persistent handler by its hook ID.
   *
   * @param hookId - ID returned by `Hooks.on(...)`
   */
  off(hookId: number): void;
};
