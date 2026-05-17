/**
 * Entity-pack payload schemas (Quick Task 260517-k2g).
 *
 * Parallel additive pipeline to `spell-pack.ts`: emits the available-entity
 * vocabulary (non-spell Items + Actor npc/vehicle) derived from `game.packs`.
 * Spell-pack remains untouched; this pipeline covers everything spell-pack
 * does NOT cover (weapons, equipment, consumables, tools, loot, containers,
 * feats, NPCs, monsters, vehicles).
 *
 * Emitted by the Foundry module's `entity-pack-reader.ts` on the `init` and
 * `updateCompendium` hooks. The bridge caches the latest payload in
 * `entity-pack-cache.ts` (last-write-wins). foundry-mcp's
 * `entity-lookup-foundry.ts` GETs the cache via `/v1/entities/available`
 * with a 5-minute client-side TTL, then performs Levenshtein fuzzy matching
 * on the dynamic `name` + `nameLocalized` columns.
 *
 * ## Push-based architecture (no new socketlib handler)
 *
 * The Foundry module pushes vocabulary updates via the existing
 * `bridgeDeltaEmitter` channel (POST /internal/delta). This preserves the
 * `registerComplexHandler` count invariant (= 17 as of Phase 13).
 *
 * ## No offline fallback
 *
 * Unlike `spell-pack` (which has a 70-entry static SRD subset for offline
 * resolution), entity-pack has NO static fallback — there is no canonical
 * SRD list of weapons / armours / monsters small enough to ship verbatim,
 * and dnd5e content is highly modular (homebrew, expansions). When the
 * bridge is unreachable or the cache is cold, `lookupEntityFromBridge`
 * returns `null` and callers must handle it gracefully.
 *
 * ## Security
 *
 * - **T-EP-01 (Injection):** `name` and `nameLocalized` are verbatim strings
 *   from the compendium index — no eval, no shell, no template injection
 *   downstream. Same pattern as T-SP-01.
 * - **T-EP-02 (Cache poisoning):** Payload validated with
 *   `AvailableEntitiesPayloadSchema.safeParse` at the bridge WS-receive
 *   boundary (handler) AND at the foundry-mcp fetch boundary (consumer)
 *   BEFORE building the lookup map. Same pattern as T-SP-02.
 * - **T-EP-03 (Stale cache after pack uninstall/update):** the
 *   `updateCompendium` hook re-emits, debounced 500ms. Same pattern as T-SP-03.
 * - **T-EP-04 (Memory blowup on large compendia):** complete bestiary +
 *   homebrew can exceed 10k entries. Schema imposes no hard cap; reader
 *   emits a `console.warn` when `entries.length > 10000` so DMs see the
 *   telemetry in the Foundry console.
 *
 * @see packages/foundry-module/src/readers/entity-pack-reader.ts (emitter)
 * @see packages/bridge/src/routes/entities.ts (REST consumer)
 * @see packages/foundry-mcp/src/voice/entity-lookup-foundry.ts (MCP consumer)
 * @see .planning/quick/260517-k2g-il-riconoscimento-degli-incantesimi-deve/260517-k2g-PLAN.md
 */

import { z } from 'zod';

/**
 * WS envelope `type` discriminant for entity-pack vocabulary pushes.
 *
 * Used by the bridge's `entity-pack-handler.ts` to narrow from the outer
 * `/internal/delta` body before applying `AvailableEntitiesPayloadSchema`.
 */
export const R1_ENTITIES_AVAILABLE_TYPE = 'r1.entities.available' as const;

/**
 * Single entity entry in the available-entities vocabulary.
 *
 * Fields:
 * - `id`            — Compendium entry `_id` (unique within a pack; globally
 *                     unique after de-duplication across packs).
 * - `packId`        — Compendium pack ID (e.g. `'dnd5e.items'`, `'dnd5e.monsters'`).
 * - `entityKind`    — Pack-level discriminator: `'item'` for Item-type packs,
 *                     `'actor'` for Actor-type packs. Mirrors the Foundry
 *                     compendium metadata.type (Item|Actor), lower-cased.
 * - `entityType`    — dnd5e sub-type discriminant from the compendium index
 *                     entry: `'weapon' | 'equipment' | 'consumable' | 'tool'
 *                     | 'loot' | 'container' | 'feat'` for items, `'npc' |
 *                     'vehicle'` for actors. Caller dispatches on this.
 * - `name`          — Canonical English name from the compendium index entry.
 * - `nameLocalized` — Localised name via `game.i18n.localize(entry.name)`.
 *                     Equals `name` when no translation key maps to the entry name.
 */
export const EntityPackEntrySchema = z.object({
  /** Compendium entry _id — unique key after de-duplication across packs. */
  id: z.string().min(1),
  /** Source compendium pack ID (e.g. 'dnd5e.items', 'dnd5e.monsters'). */
  packId: z.string().min(1),
  /**
   * Pack-level discriminator. `'item'` ⇄ pack.metadata.type === 'Item';
   * `'actor'` ⇄ pack.metadata.type === 'Actor'.
   */
  entityKind: z.enum(['item', 'actor']),
  /**
   * dnd5e sub-type from the compendium index entry. Examples:
   * - items: 'weapon', 'equipment', 'consumable', 'tool', 'loot',
   *   'container', 'feat'
   * - actors: 'npc', 'vehicle'
   */
  entityType: z.string().min(1),
  /** Canonical English name from the compendium index. */
  name: z.string().min(1),
  /**
   * Localised name via game.i18n.localize. Equals `name` when no translation
   * maps to the entry name string (i18n key not found returns the key itself).
   */
  nameLocalized: z.string().min(1),
});

/** TypeScript type inferred from {@link EntityPackEntrySchema}. */
export type EntityPackEntry = z.infer<typeof EntityPackEntrySchema>;

/**
 * Full available-entities payload emitted by entity-pack-reader.ts.
 *
 * Fields:
 * - `entries`     — Deduplicated entity entries from all active dnd5e
 *                   Item-type AND Actor-type packs (excluding Item.spell,
 *                   Actor.character, and other non-voice-actionable subtypes).
 * - `source`      — `'foundry-packs'` for module-pushed payloads; `'empty'`
 *                   for cold-cache bridge responses.
 * - `count`       — Convenience count (= entries.length; allows consumer
 *                   to log without iterating the array again).
 * - `generatedAt` — Unix timestamp (ms) when the reader built this payload.
 *                   Used by foundry-mcp TTL logic
 *                   (`Date.now() - generatedAt > 300_000`).
 */
export const AvailableEntitiesPayloadSchema = z.object({
  /** Deduplicated entity entries across all active dnd5e Item-type AND Actor-type packs. */
  entries: z.array(EntityPackEntrySchema),
  /**
   * Source discriminant:
   * - `'foundry-packs'` — pushed by foundry-module entity-pack-reader.ts
   * - `'empty'`          — cold-cache bridge response (no push received yet)
   */
  source: z.enum(['foundry-packs', 'empty']),
  /** Count of entries (= entries.length). */
  count: z.number().int().min(0),
  /** Unix timestamp (ms) when this payload was generated. */
  generatedAt: z.number().int().min(0),
});

/** TypeScript type inferred from {@link AvailableEntitiesPayloadSchema}. */
export type AvailableEntitiesPayload = z.infer<typeof AvailableEntitiesPayloadSchema>;
