/**
 * Ambient type declarations for the Foundry VTT globals used by evenfoundryvtt.
 *
 * These declarations describe the subset of the Foundry v13/v14 API surface
 * consumed by the evenfoundryvtt module: settings + pairing window, the direct
 * projector (socket relay, users, ownership — ADR-0012), readers and write path.
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
  set(module: string, key: string, value: unknown): Promise<unknown>;
}

/** Minimal Foundry i18n API for locale detection at module boot. */
interface FoundryI18n {
  /** The current language tag (e.g. "en", "it", "de-DE"). */
  lang: string;
  /** Localise a dot-notation key from the module's lang catalog. */
  localize(key: string): string;
  /** Localise and interpolate `{name}` placeholders. */
  format(key: string, data: Record<string, string | number>): string;
}

/**
 * Foundry UI singletons — only notifications are used (pairing window feedback).
 *
 * @see https://foundryvtt.com/api/v13/classes/foundry.applications.ui.Notifications.html
 */
declare const ui: {
  notifications?: { info(message: string): void; error(message: string): void };
};

/**
 * Foundry `foundry.*` namespace — the subset used by the pairing window.
 *
 * ApplicationV2 + HandlebarsApplicationMixin live under `foundry.applications.api`
 * (NOT bare globals in v13+). Rendering contract: `static DEFAULT_OPTIONS`
 * (`id`, `tag`, `window.title`, `position`, `actions`), `static PARTS`
 * (`{ key: { template } }`), `_prepareContext(options)` → template context,
 * `_onRender(context, options)` post-render hook; `actions` handlers are called with
 * `this` = the application and `(event, target)` where `target` carries `data-action`.
 *
 * @see https://foundryvtt.com/api/v13/classes/foundry.applications.api.ApplicationV2.html (verified 2026-09-23)
 * @see https://foundryvtt.com/api/v13/functions/foundry.applications.api.HandlebarsApplicationMixin.html
 * @see https://foundryvtt.com/api/v13/functions/foundry.utils.getRoute.html (verified 2026-09-23)
 */
declare namespace foundry {
  namespace applications {
    namespace api {
      /** Options accepted by `render()`. */
      interface RenderOptions {
        force?: boolean;
      }
      class ApplicationV2 {
        /** Root element of the rendered application. */
        readonly element: HTMLElement;
        /** Renders (or re-renders) the application. */
        render(options?: boolean | RenderOptions): Promise<this>;
        /** Closes the application. */
        close(options?: { animate?: boolean }): Promise<this>;
        /** Builds the template context (override in subclass). */
        protected _prepareContext(options: RenderOptions): Promise<object>;
        /** Post-render hook (override in subclass). */
        protected _onRender(context: object, options: RenderOptions): Promise<void>;
        /** Called when the application closes (override to release timers). */
        protected _onClose(options: object): void;
      }
      /** Mixes Handlebars `PARTS` rendering into an ApplicationV2 subclass. */
      function HandlebarsApplicationMixin<
        T extends abstract new (
          ...args: never[]
        ) => ApplicationV2,
      >(base: T): T;
    }
  }
  namespace utils {
    /**
     * Returns the URL route for `path`, including the server `routePrefix` if set
     * (e.g. `getRoute('/')` → `'/foundry/'` behind a prefix).
     */
    function getRoute(path: string, options?: { prefix?: string | null }): string;
  }
}

/**
 * Foundry `CONST` — enum values consumed by the pairing + map code.
 *
 * USER_ROLES: NONE 0 · PLAYER 1 · TRUSTED 2 · ASSISTANT 3 · GAMEMASTER 4.
 * DOCUMENT_OWNERSHIP_LEVELS: INHERIT -1 · NONE 0 · LIMITED 1 · OBSERVER 2 · OWNER 3.
 * TOKEN_DISPOSITIONS: SECRET -2 · HOSTILE -1 · NEUTRAL 0 · FRIENDLY 1.
 * WALL_DOOR_TYPES: NONE 0 · DOOR 1 · SECRET 2.
 *
 * @see https://foundryvtt.com/api/v13/modules/foundry.CONST.html
 */
declare const CONST: {
  USER_ROLES: { NONE: 0; PLAYER: 1; TRUSTED: 2; ASSISTANT: 3; GAMEMASTER: 4 };
  DOCUMENT_OWNERSHIP_LEVELS: { INHERIT: -1; NONE: 0; LIMITED: 1; OBSERVER: 2; OWNER: 3 };
  TOKEN_DISPOSITIONS: { SECRET: -2; HOSTILE: -1; NEUTRAL: 0; FRIENDLY: 1 };
  WALL_DOOR_TYPES: { NONE: 0; DOOR: 1; SECRET: 2 };
};

/**
 * Foundry `CONFIG` — only the User document class is used (to create the "(G2)" user
 * without relying on the deprecated bare `User` global).
 *
 * @see https://foundryvtt.com/api/v13/classes/foundry.documents.User.html
 */
declare const CONFIG: {
  User: {
    documentClass: {
      create(data: Record<string, unknown>): Promise<FoundryUser | undefined>;
    };
  };
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
   * invocation from the projector (no user-facing dialog in glasses UI).
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
  /** Token display name (map-reader). */
  name?: string;
  /** Top-left position in canvas pixels (includes scene padding). */
  x?: number;
  y?: number;
  /** Size in grid units (1 = medium). */
  width?: number;
  height?: number;
  /** `CONST.TOKEN_DISPOSITIONS` value. */
  disposition?: number;
  /** Hidden from players (GM-only token). */
  hidden?: boolean;
  /** Base actor id, or null for tokens without an actor. */
  actorId?: string | null;
  /** Token actor (synthetic for unlinked tokens), null when missing. */
  actor?: FoundryActor | null;

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
  /**
   * Per-user ownership map `{ [userId | 'default']: DOCUMENT_OWNERSHIP_LEVELS }`.
   * Read by map-reader (ally detection) and written by g2-user (OWNER grant).
   */
  ownership?: Record<string, number>;
  /**
   * Updates the actor document (g2-user writes `{ ownership: { [userId]: level } }`).
   *
   * @see https://foundryvtt.com/api/v13/classes/foundry.abstract.Document.html#update
   */
  update?(changes: Record<string, unknown>): Promise<unknown>;
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
   * and non-empty. The G2 app fetches it same-origin (T-13-02).
   *
   * @see packages/foundry-module/src/readers/character-reader.ts
   * @see .planning/phases/13-v2-stretch/13-03-PLAN.md (D-13-05)
   */
  img?: string;
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
  /** Grid configuration (v12+: `scene.grid.size` in pixels). */
  grid?: { size: number };
  /**
   * Computed canvas dimensions (`Scene#dimensions`): `sceneX/sceneY` is the padding
   * offset of the scene rectangle, `sceneWidth/sceneHeight` its size in pixels.
   */
  dimensions?: { sceneX: number; sceneY: number; sceneWidth: number; sceneHeight: number };
  /** Background texture (v12+: `scene.background.src`). */
  background?: { src?: string | null };
  /** Environment (v12+: `scene.environment.darknessLevel` 0–1). */
  environment?: { darknessLevel?: number };
  /** Wall documents: `c` = [x0, y0, x1, y1] in canvas px, `door` = WALL_DOOR_TYPES. */
  walls?: { contents: Array<{ id: string; c: number[]; door?: number }> };
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
  /** User display name. */
  name?: string;
  /** `CONST.USER_ROLES` value. */
  role?: number;
  /** Module flags (`flags.evenfoundryvtt.g2For` marks a dedicated "(G2)" user). */
  flags?: Record<string, Record<string, unknown> | undefined>;
  /**
   * Updates the user document (`{ password }`, `{ role }`).
   *
   * @see https://foundryvtt.com/api/v13/classes/foundry.documents.BaseUser.html (password is a schema field)
   */
  update?(changes: Record<string, unknown>): Promise<unknown>;
  /** Deletes the user document (GM only). */
  delete?(): Promise<unknown>;
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
  users: FoundryCollection<FoundryUser> & {
    /**
     * One active GM (non-assistant if possible) or null — the projector runs only on
     * that client when several GMs are online.
     *
     * @see https://foundryvtt.com/api/v13/classes/foundry.documents.collections.Users.html#activegm
     */
    activeGM?: FoundryUser | null;
  };
  /** World metadata (`game.world.title` is shown on the glasses welcome). */
  world?: { title: string };
  /**
   * socket.io client. `emit('module.<id>', data)` is relayed by the server to all
   * other connected clients; `on('module.<id>', fn)` receives them.
   *
   * @see https://foundryvtt.com/article/module-development/ (§Socket)
   */
  socket?: {
    /** socket.io connection state. */
    connected?: boolean;
    on(event: string, fn: (data: unknown) => void): void;
    off?(event: string, fn: (data: unknown) => void): void;
    emit(event: string, data: unknown): void;
  };
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
