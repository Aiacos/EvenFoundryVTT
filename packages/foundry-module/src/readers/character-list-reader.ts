/**
 * character-list-reader — Foundry player-character roster reader for bridge push.
 *
 * Quick Task 260604-eyf — wire push-based character-list path for real pairing.
 *
 * Iterates `game.actors` at boot (`ready` hook) and on actor lifecycle hooks
 * (`createActor`, `updateActor`, `deleteActor`), filters for player character
 * type, and emits an `r1.characters.available` envelope via the injected `emit`
 * callback (wired to `bridgeDeltaEmitter` in module.ts).
 *
 * ## Architecture (push-based)
 *
 * Push: foundry-module emits → bridge cache (POST /internal/delta) → bridge
 * serves GET /v1/characters from cache without a socketlib roundtrip.
 *
 * ## socketlib invariant
 *
 * NO new `socket.register(name, fn)` call. Emission uses the existing
 * `bridgeDeltaEmitter` channel. Count remains **17** (Phase 13 invariant).
 * See also module.ts file-level note on the socketlib handler count.
 *
 * ## Hook wiring
 *
 * - `ready` hook (via registerCharacterListReader): emit initial roster.
 * - `createActor` hook (persistent): debounced re-emit when a new actor is created.
 * - `updateActor` hook (persistent): debounced re-emit when an actor is updated.
 * - `deleteActor` hook (persistent): debounced re-emit when an actor is deleted.
 *
 * All three actor lifecycle hooks use a 500ms debounce to avoid burst re-emits
 * when bulk operations are performed (e.g. importing multiple characters).
 *
 * ## Fault tolerance
 *
 * All errors in the reader are swallowed with `console.warn`. A reader failure
 * MUST NEVER crash the Foundry session or interrupt the hook chain.
 *
 * @see packages/shared-protocol/src/payloads/character-list.ts (schema)
 * @see packages/bridge/src/cache/character-list-cache.ts (bridge cache)
 * @see packages/bridge/src/ws/character-list-handler.ts (bridge handler)
 * @see packages/foundry-module/src/readers/character-reader.ts (listPlayerCharacters source)
 * @see .planning/quick/260604-eyf-wire-bridge-foundry-real-pairing-push-ba/260604-eyf-PLAN.md Task 2
 */

import type { CharacterListSnapshot } from '@evf/shared-protocol';
import { R1_CHARACTERS_AVAILABLE_TYPE } from '@evf/shared-protocol';
import { listPlayerCharacters } from './character-reader.js';

/** Debounce delay (ms) for actor lifecycle hooks — avoids burst re-emits. */
const DEBOUNCE_MS = 500;

// ─── readCharacterList ─────────────────────────────────────────────────────────

/**
 * Read all player characters from `game.actors` and return a CharacterListSnapshot.
 *
 * Delegates to `listPlayerCharacters()` which filters for type==='character'
 * and sorts by name ascending.
 *
 * On any throw → returns an empty snapshot with source 'foundry-world' and
 * a console.warn (never throws; reader failure MUST NOT crash Foundry).
 *
 * @returns CharacterListSnapshot with all player characters sorted by name.
 */
export function readCharacterList(): CharacterListSnapshot {
  try {
    const characters = listPlayerCharacters();
    return {
      characters,
      source: 'foundry-world',
      count: characters.length,
      generatedAt: Date.now(),
    };
  } catch (err) {
    // Defensive: swallow all errors — reader failure must not crash Foundry
    // console.warn allowed per biome.jsonc noConsole allow:[error,warn]
    console.warn('[EVF character-list-reader] readCharacterList threw:', err);
    return {
      characters: [],
      source: 'foundry-world',
      count: 0,
      generatedAt: Date.now(),
    };
  }
}

// ─── registerCharacterListReader ───────────────────────────────────────────────

/**
 * Register the character-list reader hooks and emit the initial roster.
 *
 * Called by `module.ts` in `Hooks.once('ready', ...)` so the character roster
 * is available as soon as Foundry's actor collection is loaded.
 *
 * Registers:
 * - `createActor` hook (persistent): debounced re-emit when a new actor is created.
 * - `updateActor` hook (persistent): debounced re-emit when an actor is updated.
 * - `deleteActor` hook (persistent): debounced re-emit when an actor is deleted.
 *
 * All three hooks are debounced at 500ms to coalesce burst operations.
 * Hook callbacks NEVER return false — would prevent Foundry from completing the operation.
 *
 * @param emit - Callback to emit the payload via bridgeDeltaEmitter.
 *               Signature: `(type: string, payload: unknown) => void`.
 * @returns Unsubscribe closure — calls `Hooks.off` for all three hook IDs.
 *          Discarded by module.ts for MVP (lifecycle is for-the-session).
 */
export function registerCharacterListReader(
  emit: (type: string, payload: unknown) => void,
): () => void {
  /** Emit the current character roster snapshot. */
  function emitRoster(): void {
    try {
      const payload = readCharacterList();
      emit(R1_CHARACTERS_AVAILABLE_TYPE, payload);
    } catch (err) {
      console.warn('[EVF character-list-reader] emitRoster threw:', err);
    }
  }

  // Initial emit — immediately push the current roster to the bridge cache.
  emitRoster();

  // Debounce state for actor lifecycle hooks
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  function debouncedEmit(): void {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      emitRoster();
    }, DEBOUNCE_MS);
  }

  // Register persistent hooks for actor lifecycle changes
  const createHookId = Hooks.on('createActor', (): void => {
    try {
      debouncedEmit();
    } catch (err) {
      console.warn('[EVF character-list-reader] createActor hook threw:', err);
    }
    // NEVER return false — would prevent Foundry from creating the actor
  });

  const updateHookId = Hooks.on('updateActor', (): void => {
    try {
      debouncedEmit();
    } catch (err) {
      console.warn('[EVF character-list-reader] updateActor hook threw:', err);
    }
    // NEVER return false — would prevent Foundry from updating the actor
  });

  const deleteHookId = Hooks.on('deleteActor', (): void => {
    try {
      debouncedEmit();
    } catch (err) {
      console.warn('[EVF character-list-reader] deleteActor hook threw:', err);
    }
    // NEVER return false — would prevent Foundry from deleting the actor
  });

  // Return unsubscribe closure
  return (): void => {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    Hooks.off(createHookId);
    Hooks.off(updateHookId);
    Hooks.off(deleteHookId);
  };
}
