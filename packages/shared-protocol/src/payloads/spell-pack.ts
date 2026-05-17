/**
 * Spell-pack payload schemas (Quick Task 20260517-spell-lookup-foundry-derived).
 *
 * Emitted by the Foundry module's `spell-pack-reader.ts` when the `init` or
 * `updateCompendium` hook fires. Carries the full available-spell vocabulary
 * derived from `game.packs` (dnd5e Item-type packs).
 *
 * The bridge caches the latest payload in `spell-pack-cache.ts` (last-write-wins).
 * foundry-mcp's `spell-lookup-foundry.ts` GETs the cache via `/v1/spells/available`
 * with a 5-minute client-side TTL, then performs Levenshtein fuzzy matching on the
 * dynamic `name` + `nameLocalized` columns.
 *
 * ## Push-based architecture (no new socketlib handler)
 *
 * The Foundry module pushes vocabulary updates via the existing
 * `bridgeDeltaEmitter` channel (POST /internal/delta). This preserves the
 * `registerComplexHandler` count invariant (= 17 as of Phase 13).
 *
 * ## Security
 *
 * - **T-SP-01 (Injection):** `name` and `nameLocalized` are verbatim strings from
 *   the compendium index — no eval, no shell, no template injection downstream.
 * - **T-SP-02 (Cache poisoning):** Payload validated with `AvailableSpellsPayloadSchema.safeParse`
 *   at the bridge WS-receive boundary before writing to cache.
 *
 * @see packages/foundry-module/src/readers/spell-pack-reader.ts (emitter)
 * @see packages/bridge/src/routes/spells.ts (REST consumer)
 * @see packages/foundry-mcp/src/voice/spell-lookup-foundry.ts (MCP consumer)
 * @see .planning/quick/20260517-spell-lookup-foundry-derived/PLAN.md
 */

import { z } from 'zod';

/**
 * WS envelope `type` discriminant for spell-pack vocabulary pushes.
 *
 * Used by the bridge's `spell-pack-handler.ts` to narrow from the outer
 * `/internal/delta` body before applying `AvailableSpellsPayloadSchema`.
 */
export const R1_SPELLS_AVAILABLE_TYPE = 'r1.spells.available' as const;

/**
 * Single spell entry in the available-spells vocabulary.
 *
 * Fields:
 * - `id`            — dnd5e compendium entry `_id` (unique within a pack; globally
 *                     unique after de-duplication across packs).
 * - `packId`        — Compendium pack ID (e.g. `'dnd5e.spells'`, `'dnd5e.tashas'`).
 * - `name`          — Canonical English name from the compendium index entry.
 * - `nameLocalized` — Localised name via `game.i18n.localize(entry.name)`.
 *                     Equals `name` when no translation key maps to the entry name.
 * - `level`         — Spell level 0 (cantrip) … 9.
 * - `school`        — dnd5e spell school abbreviation (e.g. 'evo', 'ill', 'div').
 *                     May be empty string for homebrew entries without a school.
 */
export const SpellPackEntrySchema = z.object({
  /** Compendium entry _id — unique key after de-duplication across packs. */
  id: z.string().min(1),
  /** Source compendium pack ID (e.g. 'dnd5e.spells'). */
  packId: z.string().min(1),
  /** Canonical English name from the compendium index. */
  name: z.string().min(1),
  /**
   * Localised name via game.i18n.localize. Equals `name` when no translation
   * maps to the entry name string (i18n key not found returns the key itself).
   */
  nameLocalized: z.string().min(1),
  /** Spell level 0 (cantrip) … 9. */
  level: z.number().int().min(0).max(9),
  /**
   * dnd5e spell school abbreviation (e.g. 'evo', 'ill', 'div').
   * May be empty string for homebrew entries that omit this field.
   */
  school: z.string(),
});

/** TypeScript type inferred from {@link SpellPackEntrySchema}. */
export type SpellPackEntry = z.infer<typeof SpellPackEntrySchema>;

/**
 * Full available-spells payload emitted by spell-pack-reader.ts.
 *
 * Fields:
 * - `entries`     — Deduplicated spell entries from all active dnd5e packs.
 * - `source`      — Always `'foundry-packs'` for module-pushed payloads;
 *                   `'empty'` for cold-cache bridge responses.
 * - `count`       — Convenience count (= entries.length; allows consumer to log
 *                   without iterating the array again).
 * - `generatedAt` — Unix timestamp (ms) when the reader built this payload.
 *                   Used by foundry-mcp TTL logic (`Date.now() - generatedAt > 300_000`).
 */
export const AvailableSpellsPayloadSchema = z.object({
  /** Deduplicated spell entries across all active dnd5e Item-type packs. */
  entries: z.array(SpellPackEntrySchema),
  /**
   * Source discriminant:
   * - `'foundry-packs'` — pushed by foundry-module spell-pack-reader.ts
   * - `'empty'`          — cold-cache bridge response (no push received yet)
   */
  source: z.enum(['foundry-packs', 'empty']),
  /** Count of entries (= entries.length). */
  count: z.number().int().min(0),
  /** Unix timestamp (ms) when this payload was generated. */
  generatedAt: z.number().int().min(0),
});

/** TypeScript type inferred from {@link AvailableSpellsPayloadSchema}. */
export type AvailableSpellsPayload = z.infer<typeof AvailableSpellsPayloadSchema>;
