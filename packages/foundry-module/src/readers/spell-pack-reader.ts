/**
 * spell-pack-reader — Foundry compendium spell vocabulary reader.
 *
 * Quick Task 20260517-spell-lookup-foundry-derived.
 *
 * Iterates `game.packs` (WorldCollection<CompendiumCollection>) at boot and on
 * `updateCompendium` hook events, filters for dnd5e Item-type packs, reads the
 * lightweight `.index` of each pack, and emits an `r1.spells.available` envelope
 * via the injected `emit` callback (wired to `bridgeDeltaEmitter` in module.ts).
 *
 * ## Architecture (push-based)
 *
 * Push: foundry-module emits → bridge cache (POST /internal/delta) → foundry-mcp
 * polls GET /v1/spells/available with a 5-minute TTL client-side cache.
 *
 * ## socketlib invariant
 *
 * NO new `registerComplexHandler` call. Emission uses the existing
 * `bridgeDeltaEmitter` channel. Count remains **17** (Phase 13 invariant).
 *
 * ## Hook wiring
 *
 * - `init` hook: emit at module load (Foundry guarantees packs are indexed by `init`).
 * - `updateCompendium` hook: re-emit on pack content change (T-SP-03: stale cache).
 *
 * Both hooks use a 500ms debounce so rapid `updateCompendium` bursts (e.g. when
 * a DM installs multiple packs) produce at most one re-emit per 500ms.
 *
 * ## Fault tolerance
 *
 * All errors in the reader are swallowed with `console.warn`. A reader failure
 * MUST NEVER crash the Foundry session or interrupt the hook chain.
 *
 * ## De-duplication
 *
 * Entries are keyed by `_id`. When the same `_id` appears in multiple packs
 * (e.g. a spell re-published in an expansion pack), the FIRST pack wins
 * (SRD > expansion in iteration order — `game.packs.contents` follows load order).
 *
 * @see packages/shared-protocol/src/payloads/spell-pack.ts (AvailableSpellsPayloadSchema)
 * @see packages/bridge/src/routes/spells.ts (REST consumer)
 * @see packages/foundry-mcp/src/voice/spell-lookup-foundry.ts (MCP consumer)
 * @see .planning/quick/20260517-spell-lookup-foundry-derived/PLAN.md Task 1
 */

import type { AvailableSpellsPayload, SpellPackEntry } from '@evf/shared-protocol';
import { R1_SPELLS_AVAILABLE_TYPE } from '@evf/shared-protocol';

// ─── Constants ─────────────────────────────────────────────────────────────────

/** Debounce delay (ms) for `updateCompendium` hook — avoids burst re-emits. */
const DEBOUNCE_MS = 500;

/** dnd5e system identifier for filtering packs by system. */
const DND5E_SYSTEM = 'dnd5e';

/** Compendium type for item-type packs (spells, weapons, etc.). */
const ITEM_TYPE = 'Item';

/** Spell type discriminant within Item-type packs. */
const SPELL_TYPE = 'spell';

// ─── readAvailableSpells ───────────────────────────────────────────────────────

/**
 * Read all available spells from `game.packs` and return an AvailableSpellsPayload.
 *
 * Iterates all compendium packs, filters for dnd5e Item-type packs,
 * reads the `.index.contents` of each pack, and maps spell-type entries
 * to SpellPackEntry objects. De-duplicates by `_id` (first-pack-wins).
 *
 * Locale: uses `game.i18n.localize(entry.name)` for `nameLocalized`.
 * When no translation key matches, Foundry returns the key itself — which
 * is the canonical English name. The result is always a non-empty string.
 *
 * @returns AvailableSpellsPayload with all deduplicated spell entries.
 */
export function readAvailableSpells(): AvailableSpellsPayload {
  /** Map keyed by compendium _id for de-duplication (first-pack-wins). */
  const seen = new Map<string, SpellPackEntry>();

  try {
    // game.packs may be undefined before the init hook — defensive check.
    const packs = game.packs;
    if (packs === undefined || packs === null) {
      return { entries: [], source: 'foundry-packs', count: 0, generatedAt: Date.now() };
    }

    for (const pack of packs.contents) {
      // Filter: only dnd5e Item-type packs
      if (pack.metadata.type !== ITEM_TYPE || pack.metadata.system !== DND5E_SYSTEM) {
        continue;
      }

      // Defensive: index may be empty or not yet loaded
      const indexContents = pack.index?.contents ?? [];

      for (const entry of indexContents) {
        // Only spell-type entries
        if (entry.type !== SPELL_TYPE) continue;

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

        // We don't have level/school in the index — use defaults (0/'').
        // Foundry v13/v14 index entries for spells include only _id, name, type, img.
        // Full doc loading is expensive and out of scope for vocabulary-building.
        // The level/school fields are included in the schema for future use but
        // default to safe values here per the PLAN.md defensiveness requirement.
        seen.set(entry._id, {
          id: entry._id,
          packId: pack.collection,
          name: entry.name,
          nameLocalized,
          level: 0, // Index does not expose level; consumers use name matching only
          school: '', // Index does not expose school
        });
      }
    }
  } catch (err) {
    // Defensive: swallow all errors — reader failure must not crash Foundry
    // console.warn allowed per biome.jsonc noConsole allow:[error,warn]
    console.warn('[EVF spell-pack-reader] readAvailableSpells threw:', err);
  }

  const entries = Array.from(seen.values());
  return {
    entries,
    source: 'foundry-packs',
    count: entries.length,
    generatedAt: Date.now(),
  };
}

// ─── registerSpellPackReader ───────────────────────────────────────────────────

/**
 * Register the spell-pack reader hooks and emit the initial vocabulary.
 *
 * Called by `module.ts` in `Hooks.once('init', ...)` so the vocabulary is
 * available at the earliest possible point in the Foundry lifecycle.
 *
 * Registers:
 * - `init` hook (one-time): emits the initial vocabulary.
 * - `updateCompendium` hook (persistent): re-emits on pack content change,
 *   debounced at 500ms to avoid burst re-emits (T-SP-03).
 *
 * Both handlers catch all exceptions internally — a reader failure must NEVER
 * crash the Foundry session or interrupt the hook chain.
 *
 * @param emit - Callback to emit the payload via bridgeDeltaEmitter.
 *               Signature: `(type: string, payload: unknown) => void`.
 * @returns Unsubscribe closure — calls `Hooks.off(updateCompendiumHookId)`.
 *          Discarded by module.ts for MVP (lifecycle is for-the-session).
 */
export function registerSpellPackReader(
  emit: (type: string, payload: unknown) => void,
): () => void {
  // Emit at init (called synchronously by the init hook)
  function emitVocab(): void {
    try {
      const payload = readAvailableSpells();
      emit(R1_SPELLS_AVAILABLE_TYPE, payload);
    } catch (err) {
      console.warn('[EVF spell-pack-reader] emitVocab threw:', err);
    }
  }

  // Initial emit — called immediately by the init hook
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

  // Register persistent hook for pack content changes (T-SP-03: stale cache)
  const updateHookId = Hooks.on('updateCompendium', (): void => {
    try {
      debouncedEmit();
    } catch (err) {
      console.warn('[EVF spell-pack-reader] updateCompendium hook threw:', err);
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
