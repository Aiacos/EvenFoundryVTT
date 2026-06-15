/**
 * entity-pack-reader — Foundry compendium entity vocabulary reader.
 *
 * Quick Task 260517-k2g (parallel additive pipeline to spell-pack-reader).
 *
 * Iterates `game.packs` (WorldCollection<CompendiumCollection>) at boot and on
 * `updateCompendium` hook events, filters for dnd5e Item-type AND Actor-type
 * packs, reads the lightweight `.index` of each pack, and emits an
 * `r1.entities.available` envelope via the injected `emit` callback (wired to
 * `bridgeDeltaEmitter` in module.ts).
 *
 * ## Architecture (push-based, parallel to spell-pack)
 *
 * Push: foundry-module emits → bridge cache (POST /internal/delta) → foundry-mcp
 * GETs /v1/entities/available with a 5-minute TTL client-side cache.
 *
 * The entity-pack pipeline coexists with spell-pack and shares the `/internal/delta`
 * push channel — both handlers are multiplexed in `bridge/src/server.ts` onDelta
 * callback. Each returns `false` when the envelope type does not match, so the
 * dispatch is safe and order-independent.
 *
 * ## socketlib invariant
 *
 * NO new `socket.register(name, fn)` call. Emission uses the existing
 * `bridgeDeltaEmitter` channel. Count remains **17** (Phase 13 invariant).
 *
 * ## Hook wiring
 *
 * - `init` hook: emit at module load (Foundry guarantees packs are indexed by `init`).
 * - `updateCompendium` hook: re-emit on pack content change (T-EP-03: stale cache).
 *
 * Both hooks use a 500ms debounce so rapid `updateCompendium` bursts (e.g. when
 * a DM installs multiple packs) produce at most one re-emit per 500ms.
 *
 * ## Fault tolerance
 *
 * All errors in the reader are swallowed with `console.warn`. A reader failure
 * MUST NEVER crash the Foundry session or interrupt the hook chain.
 *
 * ## Scope (in / out)
 *
 * In-scope sub-types:
 * - Item: `weapon`, `equipment` (armours, shields, wearables), `consumable`
 *   (potions, scrolls, ammunition), `tool`, `loot` (gems, treasure),
 *   `container`, `feat`.
 * - Actor: `npc` (NPCs + monsters share this discriminator in dnd5e), `vehicle`.
 *
 * Out-of-scope (explicit):
 * - Item.spell: already covered by spell-pack-reader (parallel additive principle).
 * - Item.class, subclass, background, race: not voice-actionable.
 * - Actor.character: world-unique entities, not template-target.
 * - Actor.group: not voice-actionable.
 *
 * ## De-duplication
 *
 * Entries are keyed by `_id`. When the same `_id` appears in multiple packs
 * (e.g. a weapon re-published in an expansion pack), the FIRST pack wins
 * (SRD > expansion in iteration order — `game.packs.contents` follows load order).
 *
 * ## Memory guard (T-EP-04)
 *
 * Bestiary + homebrew can exceed several thousand entries (Monster Manual ~500
 * alone). After building the payload, the reader emits a `console.warn` when
 * `entries.length > 10000`. No hard cap — DMs see the telemetry and decide.
 *
 * @see packages/shared-protocol/src/payloads/entity-pack.ts (AvailableEntitiesPayloadSchema)
 * @see packages/bridge/src/routes/entities.ts (REST consumer)
 * @see packages/foundry-mcp/src/voice/entity-lookup-foundry.ts (MCP consumer)
 * @see packages/foundry-module/src/readers/spell-pack-reader.ts (sibling pipeline)
 * @see .planning/quick/260517-k2g-il-riconoscimento-degli-incantesimi-deve/260517-k2g-PLAN.md Task 1
 */

import type { AvailableEntitiesPayload, EntityPackEntry } from '@evf/shared-protocol';
import { R1_ENTITIES_AVAILABLE_TYPE } from '@evf/shared-protocol';

// ─── Constants ─────────────────────────────────────────────────────────────────

/** Debounce delay (ms) for `updateCompendium` hook — avoids burst re-emits. */
const DEBOUNCE_MS = 500;

/** dnd5e system identifier for filtering packs by system. */
const DND5E_SYSTEM = 'dnd5e';

/** Compendium type for item-type packs (weapons, equipment, etc.). */
const ITEM_TYPE = 'Item';

/** Compendium type for actor-type packs (npc, vehicle). */
const ACTOR_TYPE = 'Actor';

/** T-EP-04 telemetry threshold — warn DM via console when payload exceeds this. */
const LARGE_PAYLOAD_WARN_THRESHOLD = 10000;

/**
 * dnd5e Item sub-types accepted by entity-pack-reader.
 *
 * Excludes `'spell'` (covered by spell-pack-reader, parallel pipeline) and
 * non-voice-actionable types: `'class' | 'subclass' | 'background' | 'race'`.
 */
const ITEM_ENTITY_TYPES = new Set([
  'weapon',
  'equipment',
  'consumable',
  'tool',
  'loot',
  'container',
  'feat',
]);

/**
 * dnd5e Actor sub-types accepted by entity-pack-reader.
 *
 * `'npc'` covers BOTH NPCs and monsters (dnd5e uses the same discriminator).
 * Excludes `'character'` (world-unique PCs, not template-target) and
 * `'group'` (not voice-actionable).
 */
const ACTOR_ENTITY_TYPES = new Set(['npc', 'vehicle']);

// ─── readAvailableEntities ─────────────────────────────────────────────────────

/**
 * Read all available entities from `game.packs` and return an
 * AvailableEntitiesPayload.
 *
 * Iterates all compendium packs, filters for dnd5e Item-type or Actor-type
 * packs (rejecting other systems and pack types), reads the `.index.contents`
 * of each pack, and maps allowed sub-type entries to EntityPackEntry objects.
 * De-duplicates by `_id` (first-pack-wins).
 *
 * Locale: uses `game.i18n.localize(entry.name)` for `nameLocalized`.
 * When no translation key matches, Foundry returns the key itself — which
 * is the canonical English name. The result is always a non-empty string.
 *
 * @returns AvailableEntitiesPayload with all deduplicated entity entries.
 */
export function readAvailableEntities(): AvailableEntitiesPayload {
  /** Map keyed by compendium _id for de-duplication (first-pack-wins). */
  const seen = new Map<string, EntityPackEntry>();

  try {
    // game.packs may be undefined before the init hook — defensive check.
    const packs = game.packs;
    if (packs === undefined || packs === null) {
      return { entries: [], source: 'foundry-packs', count: 0, generatedAt: Date.now() };
    }

    for (const pack of packs.contents) {
      // Filter: only dnd5e packs
      if (pack.metadata.system !== DND5E_SYSTEM) {
        continue;
      }

      // Resolve pack-level kind + accepted sub-type set
      let entityKind: 'item' | 'actor';
      let allowedTypes: Set<string>;
      if (pack.metadata.type === ITEM_TYPE) {
        entityKind = 'item';
        allowedTypes = ITEM_ENTITY_TYPES;
      } else if (pack.metadata.type === ACTOR_TYPE) {
        entityKind = 'actor';
        allowedTypes = ACTOR_ENTITY_TYPES;
      } else {
        // Not Item, not Actor → skip (e.g., JournalEntry, RollTable packs)
        continue;
      }

      // Defensive: index may be empty or not yet loaded
      const indexContents = pack.index?.contents ?? [];

      for (const entry of indexContents) {
        // Only allowed sub-types for this pack-kind
        if (!allowedTypes.has(entry.type)) continue;

        // De-duplication: skip if we've already seen this _id
        if (seen.has(entry._id)) continue;

        // Locale: game.i18n.localize falls back to the key itself when not found
        let nameLocalized: string;
        try {
          nameLocalized = game.i18n.localize(entry.name);
          // Ensure non-empty (localize should never return empty, but defensive)
          if (!nameLocalized || nameLocalized.length === 0) {
            nameLocalized = entry.name;
          }
        } catch {
          nameLocalized = entry.name;
        }

        seen.set(entry._id, {
          id: entry._id,
          packId: pack.collection,
          entityKind,
          entityType: entry.type,
          name: entry.name,
          nameLocalized,
        });
      }
    }
  } catch (err) {
    // Defensive: swallow all errors — reader failure must not crash Foundry
    // console.warn allowed per biome.jsonc noConsole allow:[error,warn]
    console.warn('[EVF entity-pack-reader] readAvailableEntities threw:', err);
  }

  const entries = Array.from(seen.values());

  // T-EP-04 memory guard: telemetry-only warn (no hard cap)
  if (entries.length > LARGE_PAYLOAD_WARN_THRESHOLD) {
    console.warn(
      `[EVF entity-pack-reader] payload entries=${entries.length} exceeds 10000 — large compendia detected`,
    );
  }

  return {
    entries,
    source: 'foundry-packs',
    count: entries.length,
    generatedAt: Date.now(),
  };
}

// ─── registerEntityPackReader ──────────────────────────────────────────────────

/**
 * Register the entity-pack reader hooks and emit the initial vocabulary.
 *
 * Called by `module.ts` in `Hooks.once('init', ...)` so the vocabulary is
 * available at the earliest possible point in the Foundry lifecycle (parallel
 * to spell-pack reader registration).
 *
 * Registers:
 * - immediate emit (called synchronously by this function).
 * - `updateCompendium` hook (persistent): re-emits on pack content change,
 *   debounced at 500ms to avoid burst re-emits (T-EP-03).
 *
 * Both handlers catch all exceptions internally — a reader failure must NEVER
 * crash the Foundry session or interrupt the hook chain.
 *
 * @param emit - Callback to emit the payload via bridgeDeltaEmitter.
 *               Signature: `(type: string, payload: unknown) => void`.
 * @returns Unsubscribe closure — calls `Hooks.off(updateCompendiumHookId)`.
 *          Discarded by module.ts for MVP (lifecycle is for-the-session).
 */
export function registerEntityPackReader(
  emit: (type: string, payload: unknown) => void,
): () => void {
  // Emit on demand (init + post-debounce)
  function emitVocab(): void {
    try {
      const payload = readAvailableEntities();
      emit(R1_ENTITIES_AVAILABLE_TYPE, payload);
    } catch (err) {
      console.warn('[EVF entity-pack-reader] emitVocab threw:', err);
    }
  }

  // Initial emit — called immediately on registration
  emitVocab();

  // Debounce state for updateCompendium
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  function debouncedEmit(): void {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      emitVocab();
    }, DEBOUNCE_MS);
  }

  // Register persistent hook for pack content changes (T-EP-03: stale cache)
  const updateHookId = Hooks.on('updateCompendium', (): void => {
    try {
      debouncedEmit();
    } catch (err) {
      console.warn('[EVF entity-pack-reader] updateCompendium hook threw:', err);
    }
    // NEVER return false — would prevent Foundry from updating the compendium
  });

  // Return unsubscribe closure
  return (): void => {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    Hooks.off(updateHookId);
  };
}
