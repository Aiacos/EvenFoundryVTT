/**
 * Foundry-side character snapshot reader.
 *
 * Reads from `game.actors` — the Foundry-authoritative actor collection.
 * Returns null if the actor does not exist or is not a player character ("character").
 *
 * Read-only contract (Phase 2): no `actor.update()` calls, no `game.settings.set()`.
 * Write path deferred to Phase 7.
 *
 * TypeScript notes:
 * - `noUncheckedIndexedAccess` (INV-4): all array/object accesses have explicit
 *   undefined guards — no `!` non-null assertions.
 * - `exactOptionalPropertyTypes`: all optional fields checked before access.
 *
 * Phase 16 addition (Plan 16-02): reads `actor.system.abilities.{str,dex,con,int,wis,cha}`
 * to populate the REQUIRED `abilities` field (REQ SHEET-06). Defensive defaults for
 * fresh actors lacking `system.abilities` mirror the Phase 4b death-saves nullish-coalesce
 * pattern. `proficient: 0|0.5` → false; `proficient: 1|2` → true (Main tab boolean;
 * Phase 17 Skills tab introduces the full glyph spectrum ○/◉/◈). `save` is read
 * directly from `actor.system.abilities.<k>.save.value` (dnd5e prep-time computed
 * total — NOT recomputed from base+prof) per CONTEXT D-Area-2.
 *
 * Phase 17 addition (Plan 17-02): reads `actor.system.skills.{acr,ani,...,sur}` (18
 * dnd5e short codes) to populate the REQUIRED `skills` field (REQ SHEET-09). Defensive
 * defaults via `zeroSkills()` + `SKILL_DEFAULT_ABILITY` map (no CON-based skills in
 * canonical 5e). `proficient: 0|0.5|1|2` preserved verbatim (Skills tab full glyph
 * spectrum, unlike Phase 16's boolean coercion for Main tab). `passive` read verbatim
 * from dnd5e prep-time (NOT recomputed from `10 + total` — Observant feat + magic
 * items may diverge).
 *
 * @see Specs.md §4 (read pipeline), FOUN-01 (getCharacterState reader contract)
 * @see Specs.md §7.5.2 (Main tab ability-score mockup)
 * @see Specs.md §7.5.3 (Skills tab mockup)
 * @see packages/foundry-module/src/types/foundry-globals.d.ts (actor shape declarations)
 * @see 02-05-PLAN.md Task 1 (character-reader.ts spec)
 * @see .planning/phases/EVF-16-sheet-ability-scores-main-tab-data-wiring/16-CONTEXT.md §Area 2
 * @see .planning/phases/EVF-16-sheet-ability-scores-main-tab-data-wiring/16-02-PLAN.md Task 2
 * @see .planning/phases/EVF-17-sheet-skills-tab-skills-tab-data-wiring/17-CONTEXT.md §Area 2
 * @see .planning/phases/EVF-17-sheet-skills-tab-skills-tab-data-wiring/17-02-PLAN.md Task 2
 */

import type {
  Abilities,
  AbilityKey,
  AbilityScore,
  BiographySnapshot,
  CharacterSnapshot,
  FeatEntry,
  InventoryItem,
  InventoryItemType,
  Skill,
  SkillKey,
  Skills,
  SpellActivation,
  Spellbook,
  SpellEntry,
  SpellSlot,
} from '@evf/shared-protocol';
import { INVENTORY_ITEM_TYPES, SKILL_KEYS } from '@evf/shared-protocol';

/**
 * Map a dnd5e item type string to our InventoryItemType enum.
 *
 * T-05-04-01 mitigation: unknown types return null so the reader can filter them.
 * Only types in `INVENTORY_ITEM_TYPES` pass through to the wire payload.
 *
 * @internal
 */
function mapItemType(dnd5eType: string): InventoryItemType | null {
  if ((INVENTORY_ITEM_TYPES as ReadonlyArray<string>).includes(dnd5eType)) {
    return dnd5eType as InventoryItemType;
  }
  return null;
}

/**
 * Map a dnd5e item activation type to our SpellActivation enum.
 *
 * Foundry dnd5e 5.x uses `item.system.activation.type` with values like
 * `'action'`, `'reaction'`, `'bonus'`, `'special'`, `'crew'`, etc.
 * We map to our 4-value enum; unknown types default to `'action'`.
 *
 * @internal
 */
function mapActivationType(dnd5eActivation: string | undefined): SpellActivation {
  switch (dnd5eActivation) {
    case 'reaction':
      return 'reaction';
    case 'bonus':
      return 'bonus';
    case 'special':
    case 'ritual':
      return 'ritual';
    default:
      return 'action';
  }
}

/**
 * Extract inventory items from actor.items.contents.
 *
 * Filters to player-visible item types (weapon, armor, consumable, equipment,
 * container, currency). Unknown types are silently dropped (T-05-04-01).
 * Defensive nullish-coalesce for each field — fresh items may lack certain system fields.
 *
 * @internal
 */
function extractInventory(actor: ReturnType<typeof game.actors.get>): InventoryItem[] {
  if (actor === undefined) return [];

  const items: InventoryItem[] = [];
  const contents: unknown[] = actor.items?.contents ?? [];

  for (const raw of contents) {
    const item = raw as Record<string, unknown>;
    const type = mapItemType((item.type as string | undefined) ?? '');
    if (type === null) continue;
    // Note: 'spell' is not in INVENTORY_ITEM_TYPES so mapItemType returns null for spells.
    // The null-guard above already excludes them — no redundant spell check needed.

    const system = (item.system as Record<string, unknown>) ?? {};
    const damage = (system.damage as Record<string, unknown>) ?? {};
    // CR-02 fix: use base.formula directly when present (dnd5e 5.x modern field);
    // fall back to parts[0] only when base.formula is absent.
    const baseFormula = (damage.base as Record<string, unknown> | undefined)?.formula as
      | string
      | undefined;
    const partsFirst = (
      (damage as Record<string, unknown>).parts as [string, string][] | undefined
    )?.[0];
    const damageFormula: string | undefined =
      baseFormula !== undefined
        ? baseFormula
        : partsFirst !== undefined
          ? `${partsFirst[0]} ${partsFirst[1]}` // WR-01 fix: space-separated "formula type"
          : undefined;

    const quantity = (system.quantity as number | undefined) ?? 1;
    const weight = (system.weight as Record<string, unknown> | undefined)?.value as
      | number
      | undefined;

    // Build tags from item properties (e.g. versatile, thrown, finesse)
    const propertiesRaw = (system.properties as Set<string> | string[] | undefined) ?? [];
    const tags: string[] = Array.isArray(propertiesRaw)
      ? (propertiesRaw as string[])
      : propertiesRaw instanceof Set
        ? Array.from(propertiesRaw as Set<string>)
        : [];

    const entry: InventoryItem = {
      id: (item.id as string | undefined) ?? String(Math.random()),
      name: (item.name as string | undefined) ?? 'Unknown Item',
      type,
      ...(damageFormula !== undefined && { damage: damageFormula }),
      ...(tags.length > 0 && { tags }),
      ...(weight !== undefined && { weight }),
      ...(quantity !== 1 && { quantity }),
    };

    items.push(entry);
  }

  return items;
}

/**
 * Extract spellbook data from actor.system.spells + actor.items spell entries.
 *
 * Spell slots: reads `actor.system.spells.spell{1-9}` + `actor.system.spells.pact`
 * for warlock pact slots. Defensive nullish-coalesce for fresh actors.
 *
 * Spell entries: filters actor.items.contents to type==='spell', then builds
 * SpellEntry objects. Concentration detection uses assumption A2 from RESEARCH.md:
 * `item.system.components?.concentration === true`.
 *
 * @internal
 */
function extractSpellbook(actor: ReturnType<typeof game.actors.get>): Spellbook {
  if (actor === undefined) return { slots: [], spells: [] };

  const slotsRaw = (actor.system?.spells as Record<string, unknown>) ?? {};

  // Build slot array for levels 1-9 (standard slots)
  const slots: SpellSlot[] = [];
  for (let level = 1; level <= 9; level++) {
    const slotKey = `spell${level}`;
    const slotData = (slotsRaw[slotKey] as Record<string, unknown>) ?? {};
    const max = (slotData.max as number | undefined) ?? 0;
    if (max > 0) {
      slots.push({
        level,
        value: (slotData.value as number | undefined) ?? 0,
        max,
      });
    }
  }

  // Extract spell entries from items (type === 'spell')
  const contents: unknown[] = actor.items?.contents ?? [];
  const spells: SpellEntry[] = [];

  for (const raw of contents) {
    const item = raw as Record<string, unknown>;
    if ((item.type as string | undefined) !== 'spell') continue;

    const system = (item.system as Record<string, unknown>) ?? {};
    const components = (system.components as Record<string, unknown>) ?? {};
    const activationRaw = (system.activation as Record<string, unknown>) ?? {};
    const activationType = (activationRaw.type as string | undefined) ?? 'action';

    const level = Math.max(0, Math.min(9, (system.level as number | undefined) ?? 0));
    const preparationMode = (system.preparation as Record<string, unknown>)?.mode ?? 'prepared';
    const isPrepared =
      (system.preparation as Record<string, unknown>)?.prepared === true ||
      preparationMode === 'always' ||
      preparationMode === 'innate' ||
      level === 0; // cantrips are always prepared

    const isAlwaysPrepared = preparationMode === 'always' || preparationMode === 'innate';

    // Assumption A2: concentration flag lives at item.system.components.concentration
    const isConcentration = (components.concentration as boolean | undefined) === true;

    // Range extraction
    const rangeRaw = (system.range as Record<string, unknown>) ?? {};
    const rangeValue = (rangeRaw.value as number | undefined) ?? '';
    const rangeUnit = (rangeRaw.units as string | undefined) ?? '';
    // A range.value of 0 with a non-self/non-touch unit is not a real distance
    // (it represents "no range"), so it must render as '--', never '0m'.
    const rangeStr =
      rangeUnit === 'self' || rangeUnit === 'touch'
        ? rangeUnit
        : typeof rangeValue === 'number' && rangeValue > 0
          ? `${rangeValue}m`
          : '--';

    // Damage/effect summary
    const damageRaw = (system.damage as Record<string, unknown>) ?? {};
    const damageParts = (damageRaw.parts as [string, string][] | undefined) ?? [];
    const damageStr =
      damageParts.length > 0
        ? damageParts
            .slice(0, 1)
            .map(([formula, type]) => `${formula} ${type}`)
            .join(', ')
        : (system.description as Record<string, unknown>)?.value !== undefined
          ? '' // leave blank — description is HTML, will be stripped later
          : '';

    const entry: SpellEntry = {
      id: (item.id as string | undefined) ?? String(Math.random()),
      name: (item.name as string | undefined) ?? 'Unknown Spell',
      level,
      school: (system.school as string) ?? '',
      activation: mapActivationType(activationType),
      range: rangeStr,
      effect: damageStr,
      prepared: isPrepared,
      alwaysPrepared: isAlwaysPrepared,
      concentration: isConcentration,
    };

    spells.push(entry);
  }

  // Sort spells by level, then name
  spells.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));

  return { slots, spells };
}

/**
 * Canonical ability key list (closed enum — D&D 5e core rules).
 *
 * Note: Phase 17 Plan 17-02 added `AbilityKey` as a re-exported type from
 * `@evf/shared-protocol` (single source of truth — Plan 17-01 GREEN gate).
 * We keep this local `ABILITY_KEYS` runtime tuple to avoid a redundant
 * import; the imported type and the local tuple's `[number]` are
 * structurally identical (both `'str'|'dex'|'con'|'int'|'wis'|'cha'`).
 */
const ABILITY_KEYS = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;

/**
 * Build a 6-keyed zero-default `Abilities` payload for fresh actors lacking
 * `system.abilities`. Each ability emits `{value:10, mod:0, save:0,
 * proficient:false, dc:10}` — the dnd5e baseline (mod = 0 at score 10, no
 * save bonus, non-proficient, baseline DC 10). Mirrors the Phase 4b
 * death-saves defensive-default pattern (CR-DS-3) — never throws, never
 * returns null for the field.
 *
 * @internal
 */
function zeroAbilities(): Abilities {
  const zero: AbilityScore = { value: 10, mod: 0, save: 0, proficient: false, dc: 10 };
  return {
    str: { ...zero },
    dex: { ...zero },
    con: { ...zero },
    int: { ...zero },
    wis: { ...zero },
    cha: { ...zero },
  };
}

/**
 * Extract a single dnd5e ability sub-object into our wire-payload AbilityScore.
 *
 * Reads `value`, `mod`, `save.value`, `proficient`, `dc` with defensive
 * nullish-coalesce per field. `save` shape is dnd5e canonical `{value: number}`
 * (INV-2 cross-checked 2026-05-18 against github.com/foundryvtt/dnd5e
 * release-5.3.3 module/data/actor/templates/common.mjs). `proficient` is
 * dnd5e's raw `0 | 0.5 | 1 | 2` (none/half/full/expertise) — Main tab uses
 * strict boolean: 0|0.5 → false, 1|2 → true (CONTEXT D-Area-2). Phase 17
 * Skills tab will introduce the full glyph spectrum (○/◉/◈).
 *
 * @internal
 */
function readAbility(raw: Dnd5eAbilityRaw | undefined): AbilityScore {
  const value = raw?.value ?? 10;
  const mod = raw?.mod ?? 0;

  // dnd5e canonical: save is { value: number }. Defensive fallback to 0
  // when `save` itself is undefined or `save.value` is undefined.
  const save = raw?.save?.value ?? 0;

  // CONTEXT D-Area-2: strict `=== 1 || === 2` coercion. dnd5e raw values are
  // 0 (none) | 0.5 (half-prof) | 1 (full) | 2 (expertise); we render Main
  // tab as boolean so both 0 and 0.5 → false, both 1 and 2 → true.
  // Phase 17 Skills tab will introduce the full numeric/glyph spectrum.
  const proficientRaw = raw?.proficient;
  const proficient = proficientRaw === 1 || proficientRaw === 2;

  const dc = raw?.dc ?? 10;

  return { value, mod, save, proficient, dc };
}

/**
 * Extract all 6 D&D 5e ability scores from `actor.system.abilities`.
 *
 * Returns a complete 6-keyed Abilities object on every call — defensive
 * defaults for fresh actors (zeroAbilities) when `system.abilities` is
 * `undefined`. Per-field defaults (per readAbility) defend against partial
 * shapes (e.g. `system.abilities.str` exists but `proficient` missing).
 *
 * Read order: value → mod → save.value → proficient → dc. Iteration is
 * bounded to the 6 canonical keys (T-16-02-D — no recursion, constant-time).
 *
 * @internal
 */
function extractAbilities(actor: ReturnType<typeof game.actors.get>): Abilities {
  if (actor === undefined) return zeroAbilities();

  const abilitiesRaw = actor.system?.abilities;
  if (abilitiesRaw === undefined) return zeroAbilities();

  const out = zeroAbilities();
  for (const key of ABILITY_KEYS) {
    out[key as AbilityKey] = readAbility(abilitiesRaw[key]);
  }
  return out;
}

/**
 * Canonical D&D 5e default ability driving each skill (Phase 17 Plan 17-02).
 *
 * Used as the fallback `ability` field when `actor.system.skills.<k>.ability`
 * is missing (fresh actor / un-prepped). No CON-based skills exist in
 * canonical D&D 5e (verified via dnd5e wiki Roll-Formulas 2026-05-18 + dnd5e
 * 5.3.3 module/data/actor/templates/common.mjs). Mapping:
 *
 *   acr/ste/slt → dex (Acrobatics, Stealth, Sleight of Hand)
 *   ath         → str (Athletics — the only STR-based skill)
 *   arc/his/inv/nat/rel → int (knowledge-style skills)
 *   ani/ins/med/prc/sur → wis (wisdom-based perception/insight family)
 *   dec/itm/prf/per     → cha (social skills)
 *
 * @see .planning/phases/EVF-17-sheet-skills-tab-skills-tab-data-wiring/17-CONTEXT.md §Specifics
 * @internal
 */
const SKILL_DEFAULT_ABILITY: Record<SkillKey, AbilityKey> = {
  acr: 'dex',
  ani: 'wis',
  arc: 'int',
  ath: 'str',
  dec: 'cha',
  his: 'int',
  ins: 'wis',
  itm: 'cha',
  inv: 'int',
  med: 'wis',
  nat: 'int',
  prc: 'wis',
  prf: 'cha',
  per: 'cha',
  rel: 'int',
  slt: 'dex',
  ste: 'dex',
  sur: 'wis',
};

/**
 * Defensive default for fresh / un-prepped actors lacking `actor.system.skills`
 * (Phase 17 Plan 17-02).
 *
 * Returns an 18-keyed object where each skill carries `total: 0`, the
 * canonical default ability per {@link SKILL_DEFAULT_ABILITY}, `proficient: 0`,
 * and `passive: 10` (D&D 5e passive floor for a level-1 character with ability
 * mod +0 — `10 + 0 = 10`). Mirrors Phase 16 zeroAbilities() defensive-default
 * pattern; never throws, never returns null for the field.
 *
 * @internal
 */
function zeroSkills(): Skills {
  const out = {} as Skills;
  for (const k of SKILL_KEYS) {
    out[k] = {
      total: 0,
      ability: SKILL_DEFAULT_ABILITY[k],
      proficient: 0,
      passive: 10,
    };
  }
  return out;
}

/**
 * Extract a single dnd5e skill sub-object into our wire-payload Skill
 * (Phase 17 Plan 17-02).
 *
 * Reads `total`, `ability`, `proficient`, `passive` with defensive
 * nullish-coalesce per field. Unlike Phase 16's readAbility which coerces
 * `proficient: 0|0.5|1|2 → boolean` for Main tab, this helper preserves the
 * raw 0|0.5|1|2 enum verbatim — Skills tab uses the full glyph spectrum
 * (○/◉/★) per UI-SPEC §3, with half-prof rounded up to ◉ at render time
 * (renderer's job, not reader's).
 *
 * `ability` falls back to `SKILL_DEFAULT_ABILITY[key]` when dnd5e leaves the
 * field absent. The `ability` value is also validated against the 6-key
 * AbilityKey enum and clamped to the canonical default if a homebrew system
 * writes a non-canonical value (T-17-02-T mitigation — schema would reject
 * otherwise). `proficient` is clamped to the valid 4-value enum (0|0.5|1|2);
 * any malformed value defaults to 0. `passive` reads dnd5e's prep-time
 * computed value verbatim (NOT recomputed from `10 + total` — magic-item
 * bonuses, Observant feat, half-prof bonus may diverge) and is clamped
 * non-negative (T-17-02-T mitigation).
 *
 * @internal
 */
function readSkill(raw: Dnd5eSkillRaw | undefined, key: SkillKey): Skill {
  const total = raw?.total ?? 0;

  // Validate ability against the 6-key set; fallback to canonical default
  // when dnd5e omits the field OR when a homebrew system writes a value
  // outside the 6-key AbilityKey enum (T-17-02-T mitigation).
  const abilityRaw = raw?.ability ?? SKILL_DEFAULT_ABILITY[key];
  const ability: AbilityKey =
    abilityRaw === 'str' ||
    abilityRaw === 'dex' ||
    abilityRaw === 'con' ||
    abilityRaw === 'int' ||
    abilityRaw === 'wis' ||
    abilityRaw === 'cha'
      ? abilityRaw
      : SKILL_DEFAULT_ABILITY[key];

  // Clamp proficient to the closed 0|0.5|1|2 enum (T-17-02-T mitigation).
  // CONTEXT D-Area-2: NO boolean coercion (explicit difference from Phase 16
  // readAbility) — Skills tab UI-SPEC §3 needs the full glyph spectrum.
  const proficientRaw = raw?.proficient ?? 0;
  const proficient: 0 | 0.5 | 1 | 2 =
    proficientRaw === 0 || proficientRaw === 0.5 || proficientRaw === 1 || proficientRaw === 2
      ? proficientRaw
      : 0;

  // passive read-through (NOT recomputed). Clamp non-negative per schema
  // (z.number().int().nonnegative() from Plan 17-01).
  const passiveRaw = raw?.passive ?? 10;
  const passive = passiveRaw < 0 ? 0 : passiveRaw;

  return { total, ability, proficient, passive };
}

/**
 * Extract all 18 D&D 5e skills from `actor.system.skills` (Phase 17 Plan 17-02).
 *
 * Returns a complete 18-keyed Skills object on every call — defensive defaults
 * for fresh actors ({@link zeroSkills}) when `system.skills` is `undefined`.
 * Per-field defaults (per {@link readSkill}) defend against partial shapes
 * (e.g. `system.skills.acr` exists but `ability` missing).
 *
 * Read order per skill: total → ability → proficient → passive. Iteration is
 * bounded to the 18 canonical keys (T-17-02-D — no recursion, constant-time).
 *
 * @internal
 */
function extractSkills(actor: ReturnType<typeof game.actors.get>): Skills {
  if (actor === undefined) return zeroSkills();

  const skillsRaw = actor.system?.skills;
  if (skillsRaw === undefined) return zeroSkills();

  const out = {} as Skills;
  for (const key of SKILL_KEYS) {
    out[key] = readSkill(skillsRaw[key], key);
  }
  return out;
}

/**
 * Strip HTML tags from a string using a simple regex.
 *
 * Used by {@link extractFeats} and {@link extractBiography} to sanitise dnd5e HTMLField
 * content (biography.value, item.system.description.value) before it enters the wire
 * payload. Mirrors the `stripHtml` in `character-sheet-tab-renderers.ts`; duplicated
 * here because `foundry-module` has no dep on `g2-app` (T-22-03 mitigation).
 *
 * Block-level tags (`<p>`, `<br>`, `<li>`, `<ul>`, `<ol>`, `<h1>`–`<h6>`, `<div>`,
 * `<blockquote>`) are replaced with a single space before the generic strip pass to
 * prevent adjacent sentence content from merging (WR-03 fix).
 *
 * @internal
 */
function stripHtml(html: string): string {
  return html
    .replace(/<\/?(p|br|li|ul|ol|h[1-6]|div|blockquote)[^>]*>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Extract character feats/features from `actor.items.contents` (Phase 22 Plan 22-02;
 * RDATA-03).
 *
 * Filters items to `type === 'feat'`, determines category from `item.system.type.value`
 * (dnd5e 2024 path; falls back to `'general'` for PHB 2014 items where the field is absent
 * or blank — Pitfall 1 mitigation). `isOrigin` is `true` only when
 * `system.type.value === 'feat' && system.type.subtype === 'origin'` (PHB 2024 origin feat).
 * Feat description is HTML-stripped reader-side (T-22-03 mitigation).
 *
 * Never throws on missing structure — mirrors the null-safety style of
 * {@link extractClass} and {@link extractWalkSpeed}.
 *
 * @param actor - Foundry actor document (may be `undefined` for fresh/missing actors)
 * @returns Array of {@link FeatEntry} objects; `[]` for classless or undefined actors
 * @remarks Exported for unit-test access within the `foundry-module` package only.
 *          Not part of the stable public API — prefer {@link getCharacterSnapshot}.
 */
export function extractFeats(actor: ReturnType<typeof game.actors.get>): FeatEntry[] {
  if (actor === undefined) return [];
  const contents = (actor.items?.contents ?? []) as unknown as Array<Record<string, unknown>>;
  const feats: FeatEntry[] = [];
  for (const item of contents) {
    if ((item.type as string | undefined) !== 'feat') continue;
    const sys = (item.system as Record<string, unknown> | undefined) ?? {};
    const typeObj = (sys.type as Record<string, unknown> | undefined) ?? {};
    const typeValue = (typeObj.value as string | undefined) ?? '';
    const typeSubtype = (typeObj.subtype as string | undefined) ?? '';
    const descObj = (sys.description as Record<string, unknown> | undefined) ?? {};
    const rawDesc = (descObj.value as string | undefined) ?? '';
    feats.push({
      category: typeValue.length > 0 ? typeValue : 'general',
      name: (item.name as string | undefined) ?? 'Unknown Feat',
      isOrigin: typeValue === 'feat' && typeSubtype === 'origin',
      description: stripHtml(rawDesc),
    });
  }
  return feats;
}

/**
 * Extract character biography from `actor.system.details.*` (Phase 22 Plan 22-02;
 * RDATA-04).
 *
 * Maps `details.trait` → `personality` (NOT `details.personality` — Pitfall 2: dnd5e
 * names the field `trait`, labeled "DND5E.PersonalityTraits"). Reads `ideal`, `bond`,
 * and `flaw` verbatim. HTML-strips `details.biography.value` before storage
 * (T-22-03 mitigation; Pitfall 3).
 *
 * Never throws on missing structure — mirrors null-safety of {@link extractWalkSpeed}.
 * Returns all-empty-string {@link BiographySnapshot} for `undefined` actors or actors
 * with no biography data.
 *
 * @param actor - Foundry actor document (may be `undefined` for fresh/missing actors)
 * @returns {@link BiographySnapshot} with five string fields
 * @remarks Exported for unit-test access within the `foundry-module` package only.
 *          Not part of the stable public API — prefer {@link getCharacterSnapshot}.
 */
export function extractBiography(actor: ReturnType<typeof game.actors.get>): BiographySnapshot {
  const EMPTY: BiographySnapshot = {
    personality: '',
    ideal: '',
    bond: '',
    flaw: '',
    backstory: '',
  };
  if (actor === undefined) return EMPTY;
  // biography.value is an HTMLField; stripped before wire payload (T-05-03-02 mirror).
  const details = (actor.system?.details as unknown as Record<string, unknown> | undefined) ?? {};
  const bioField = (details.biography as Record<string, unknown> | undefined) ?? {};
  const rawBackstory = (bioField.value as string | undefined) ?? '';
  return {
    personality: (details.trait as string | undefined) ?? '',
    ideal: (details.ideal as string | undefined) ?? '',
    bond: (details.bond as string | undefined) ?? '',
    flaw: (details.flaw as string | undefined) ?? '',
    backstory: stripHtml(rawBackstory),
  };
}

/**
 * Extract character class display name(s) from `actor.items.contents` (Phase 21 Plan 21-01;
 * RDATA-01).
 *
 * Filters items to `type === 'class'`, maps `.name`, joins with `' / '` for multiclass.
 * Returns `""` for classless or fresh actors (zero class items — valid for new characters
 * before class assignment). The `level` field on the snapshot carries the numeric level
 * separately; this field is class name(s) only.
 *
 * Defensive: `undefined` actor returns `""`. Items without a truthy `name` are filtered out.
 *
 * @internal
 */
function extractClass(actor: ReturnType<typeof game.actors.get>): string {
  if (actor === undefined) return '';
  const classItems = (actor.items?.contents ?? []) as unknown as Array<Record<string, unknown>>;
  const names = classItems
    .filter((item) => item.type === 'class')
    .map((item) => item.name as string)
    .filter((n) => typeof n === 'string' && n.length > 0);
  return names.join(' / ');
}

/**
 * Extract the initiative modifier from `actor.system.attributes.init.total` (Phase 21 Plan
 * 21-01; RDATA-02).
 *
 * Returns the dnd5e prep-time computed total initiative modifier (may be negative for
 * characters with a DEX penalty). Defensive `?? 0` for fresh actors where `init` is
 * undefined before the first preparation run (INV-2 safety net — standard dnd5e 5.x path).
 *
 * @internal
 */
function extractInitiativeModifier(actor: ReturnType<typeof game.actors.get>): number {
  if (actor === undefined) return 0;
  return actor.system?.attributes?.init?.total ?? 0;
}

/**
 * Extract the walking speed in feet from `actor.system.attributes.movement.walk` (Phase 21
 * Plan 21-01; RDATA-02).
 *
 * Returns the walk speed when it is a non-negative number; otherwise returns 30 (the D&D 5e
 * standard default) to handle fresh actors, actors with no movement field, or actors with
 * an invalid negative value (T-21-DATA-01 mitigation). Other movement modes (fly/swim/climb)
 * are deferred to a future phase.
 *
 * @internal
 */
function extractWalkSpeed(actor: ReturnType<typeof game.actors.get>): number {
  if (actor === undefined) return 30;
  const walk = actor.system?.attributes?.movement?.walk;
  return typeof walk === 'number' && walk >= 0 ? walk : 30;
}

/**
 * Returns a character snapshot for the given actor ID, or null.
 *
 * Returns null if:
 * - Actor does not exist in `game.actors`
 * - Actor type is not "character" (NPCs, vehicles excluded — Phase 2 is PC-only)
 *
 * Phase 4b addition: reads `actor.system.attributes.death.{success,failure}` and
 * emits the `death` field on the snapshot. Defensive nullish-coalesce defaults
 * each counter to 0 — fresh dnd5e 5.x actors may have `attributes.death`
 * undefined until the first death save is rolled.
 *
 * Phase 5 addition: reads `game.settings.get('dnd5e', 'rulesVersion')` to populate
 * `world.modernRules`. Maps `'modern'` → `true`, all other values (including `'legacy'`
 * and `undefined`) → `false`. Defensive default of `false` (PHB 2014) is consistent
 * with the Phase 4b death-saves pattern. RESEARCH §Pattern 3 assumption A1 verified:
 * dnd5e 5.x uses `'modern'` / `'legacy'` string values for `rulesVersion`.
 *
 * Phase 5 Plan 05-04 addition: reads `actor.items.contents` to populate `inventory`
 * (T-05-04-01 mitigation — InventoryItemSchema gates the wire payload) and
 * `actor.system.spells` to populate `spells` (T-05-04-02 mitigation).
 * Defensive empty-array defaults for non-casters and fresh actors.
 *
 * Phase 21 Plan 21-01 addition: reads `class`/`initiative`/`speed` via the new
 * {@link extractClass}, {@link extractInitiativeModifier}, and {@link extractWalkSpeed}
 * readers (RDATA-01, RDATA-02).
 *
 * Phase 22 Plan 22-02 addition: reads `actor.items` feats via {@link extractFeats}
 * and `actor.system.details.*` biography via {@link extractBiography} (RDATA-03,
 * RDATA-04). Both fields are OPTIONAL on the schema — absent when all content is
 * empty or actor not yet synced (D-22.1/D-22.4 contract).
 *
 * @param actorId - Foundry actor document ID
 * @returns CharacterSnapshot or null
 */
export function getCharacterSnapshot(actorId: string): CharacterSnapshot | null {
  const actor = game.actors.get(actorId);

  if (actor === undefined) {
    return null;
  }

  // Only player characters in Phase 2
  if (actor.type !== 'character') {
    return null;
  }

  const hp = actor.system.attributes.hp;
  const ac = actor.system.attributes.ac;

  // Death-save counters (Phase 4b) — defensive defaults for fresh actors where
  // dnd5e may leave `attributes.death` undefined until the first save is rolled.
  const death = {
    success: actor.system.attributes.death?.success ?? 0,
    failure: actor.system.attributes.death?.failure ?? 0,
  };

  // World-state: PHB edition detection (Phase 5 Plan 05-01).
  // `game.settings.get('dnd5e', 'rulesVersion')` returns 'modern' (PHB 2024) or
  // 'legacy' (PHB 2014). Any non-'modern' value (including undefined on fresh
  // worlds) defaults to false. RESEARCH §Pattern 3, assumption A1.
  const rulesVersionRaw = game.settings.get('dnd5e', 'rulesVersion');
  const modernRules = typeof rulesVersionRaw === 'string' && rulesVersionRaw === 'modern';

  // Conditions come from Foundry v13+ actor.statuses (Set<string>)
  const conditions = Array.from(actor.statuses);

  // Portrait URL passthrough (Plan 13-03 — STRETCH-06): emit portrait.url when
  // actor.img is a non-empty string. Bridge validates URL safety (T-13-02 SSRF).
  // Per D-13-05: placeholder ('icons/svg/mystery-man.svg') is passed through
  // unchanged — bridge decides whether to render or skip.
  const img = actor.img;
  const portraitField = typeof img === 'string' && img.length > 0 ? { portrait: { url: img } } : {};

  return {
    actorId: actor.id,
    name: actor.name,
    hp: hp.value,
    maxHp: hp.max,
    tempHp: hp.temp,
    ac: ac.value,
    level: actor.system.details.level,
    conditions,
    exhaustion: actor.system.attributes.exhaustion,
    death,
    world: { modernRules },
    inventory: extractInventory(actor),
    spells: extractSpellbook(actor),
    abilities: extractAbilities(actor),
    skills: extractSkills(actor),
    class: extractClass(actor),
    initiative: extractInitiativeModifier(actor),
    speed: extractWalkSpeed(actor),
    feats: extractFeats(actor),
    biography: extractBiography(actor),
    ...portraitField,
  };
}

/**
 * Returns a list of all player characters in the active world.
 *
 * Used by `GET /v1/characters?world=` (wizard Step 3 character picker).
 * Filters to type==="character" only.
 *
 * @returns Array of { actorId, name, level } objects, sorted by name ascending.
 */
export function listPlayerCharacters(): Array<{ actorId: string; name: string; level: number }> {
  const actors = game.actors.contents;

  return actors
    .filter((a) => a.type === 'character')
    .map((a) => ({
      actorId: a.id,
      name: a.name,
      level: a.system.details.level,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Returns the player-character roster filtered to actors the given user OWNs
 * (ADR-0014).
 *
 * Same shape/sort as {@link listPlayerCharacters}, but additionally restricts
 * the result to actors whose ids are in `authorizedActorIds` (the live owned set
 * computed by Foundry via `actor.testUserPermission(user, "OWNER")`). Used by the
 * token-validated `evf.listCharacters` socketlib handler so the roster a paired
 * device receives is already scoped to the bound user — closing the cross-player
 * roster-enumeration surface (T8) on the pull path. The push-path global cache is
 * filtered bridge-side (ADR-0014 §4).
 *
 * Fail-closed: an empty `authorizedActorIds` yields an empty roster.
 *
 * @param authorizedActorIds - Actor ids the bound user owns (possibly empty).
 * @returns Owned player characters, sorted by name ascending.
 */
export function listPlayerCharactersForUser(
  authorizedActorIds: readonly string[],
): Array<{ actorId: string; name: string; level: number }> {
  const allowed = new Set(authorizedActorIds);
  return listPlayerCharacters().filter((c) => allowed.has(c.actorId));
}
