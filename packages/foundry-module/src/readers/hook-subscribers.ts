/**
 * Foundry hook subscribers — 5 hooks per D-2.14.
 *
 * Registers Foundry hooks that observe game state changes and push delta
 * payloads to the bridge via the provided `emitFn`. The `emitFn` is injected
 * from `module.ts` for testability — no real HTTP calls in unit tests.
 *
 * Hooks registered (D-2.14):
 * 1. `updateActor`      → emit `character.delta` (HP, AC, conditions, exhaustion)
 * 2. `updateCombat`     → emit `combat.turn` + `combat.state`
 * 3. `canvasReady`      → emit `scene.viewport` on scene load
 * 4. `controlToken`     → emit `scene.viewport` on token selection
 * 5. `createChatMessage` → emit `event.log.delta` + push to ring buffer
 * 6. `targetToken`      → emit `combat.targets` (FOUN-04 read-side)
 *
 * Read-only contract (Phase 2): no `actor.update()`, no `game.settings.set()`,
 * no `combat.advance()`. Only reading Foundry state. Writes deferred to Phase 7.
 *
 * Performance (D-2.15 zero polling): push-only via hooks. No `setInterval` polling.
 * The `updateActor` guard (changes.system?.attributes or changes.statuses) prevents
 * spurious emits on unrelated actor changes (e.g. macro flag updates).
 *
 * Security (T-02-01): emitFn is fire-and-forget. A failed bridge POST logs a warning
 * but MUST NOT throw — a network error must not crash the Foundry session.
 *
 * @see 02-CONTEXT.md D-2.14 (hook list), D-2.15 (zero polling)
 * @see 02-05-PLAN.md Task 1 (hook-subscribers.ts spec)
 * @see packages/foundry-module/src/readers/character-reader.ts
 * @see packages/foundry-module/src/readers/combat-reader.ts
 * @see packages/foundry-module/src/readers/scene-reader.ts
 * @see packages/foundry-module/src/readers/event-log-reader.ts
 */

import {
  CHARACTER_DELTA_TYPE,
  COMBAT_STATE_DELTA_TYPE,
  COMBAT_TARGETS_DELTA_TYPE,
  COMBAT_TURN_DELTA_TYPE,
  EVENT_LOG_DELTA_TYPE,
  type EventLogEntry,
  type EventType,
  SCENE_VIEWPORT_DELTA_TYPE,
} from '@evf/shared-protocol';
import { getCharacterSnapshot } from './character-reader.js';
import { getCombatSnapshot } from './combat-reader.js';
import { eventLogBuffer } from './event-log-reader.js';
import { getSceneViewport } from './scene-reader.js';

/**
 * Function that emits a typed delta to the bridge.
 *
 * Injected from `module.ts` — the concrete implementation POSTs to
 * bridge `/internal/delta`. During tests, a spy function is injected instead.
 *
 * Must be fire-and-forget (returns void, not Promise<void>): hook callbacks
 * are synchronous; the emit happens in the background. Errors are logged
 * but never re-thrown.
 */
export type EmitFn = (type: string, payload: unknown) => void;

// ─── Monotonic ring-buffer sequence counter ────────────────────────────────────

/**
 * Module-level monotonic counter for event log entries.
 * Incremented on every createChatMessage emission.
 * Exported for test isolation (tests can reset it via the setter below).
 */
let _eventSeq = 0;

/** @internal For testing only. */
export function _resetEventSeq(): void {
  _eventSeq = 0;
}

// ─── Hook handlers ─────────────────────────────────────────────────────────────

/**
 * Handles the `updateActor` hook.
 *
 * Guard: only emit if the changed fields include HP, AC, statuses, or exhaustion.
 * This prevents spurious emits for unrelated actor changes (e.g. flag updates,
 * folder changes). The `changes` parameter is a partial diff object.
 *
 * @param actor   - The actor document (post-update)
 * @param changes - Partial diff of what changed (noUncheckedIndexedAccess-safe checks)
 * @param emitFn  - Delta emission function
 */
function handleUpdateActor(actor: FoundryActor, changes: unknown, emitFn: EmitFn): void {
  // Type-guard: changes must be an object for attribute inspection
  if (typeof changes !== 'object' || changes === null) {
    return;
  }

  const changesObj = changes as Record<string, unknown>;

  // Emit only when HP/AC/exhaustion or statuses changed (D-2.15 performance guard).
  // HP, AC and exhaustion all live under `system.attributes`, so a bare
  // `system` change with no `attributes` sub-key (e.g. a flag or currency tweak)
  // is NOT relevant and must be skipped.
  const statusesChanged = 'statuses' in changesObj;
  const systemObj =
    typeof changesObj.system === 'object' && changesObj.system !== null
      ? (changesObj.system as Record<string, unknown>)
      : null;
  const attributesChanged =
    systemObj !== null && typeof systemObj.attributes === 'object' && systemObj.attributes !== null;

  if (!attributesChanged && !statusesChanged) {
    return;
  }

  const snapshot = getCharacterSnapshot(actor.id);
  if (snapshot !== null) {
    emitFn(CHARACTER_DELTA_TYPE, snapshot);
  }
}

/**
 * Handles the `updateCombat` hook.
 * Emits `combat.turn` on every round/turn change.
 *
 * Note: `combat.state` (full snapshot on combat creation) is emitted separately by
 * the `combatStart` hook lambda in `registerHookSubscribers`. This function only
 * emits `combat.turn`.
 *
 * @param _combat  - Combat document (unused; we always read from game.combat)
 * @param emitFn   - Delta emission function
 */
function handleUpdateCombat(_combat: unknown, emitFn: EmitFn): void {
  const snapshot = getCombatSnapshot();
  if (snapshot !== null) {
    emitFn(COMBAT_TURN_DELTA_TYPE, snapshot);
  }
}

/**
 * Handles the `canvasReady` hook.
 * Emits scene.viewport when a new scene canvas has finished loading.
 *
 * @param emitFn - Delta emission function
 */
function handleCanvasReady(emitFn: EmitFn): void {
  const viewport = getSceneViewport();
  emitFn(SCENE_VIEWPORT_DELTA_TYPE, viewport);
}

/**
 * Handles the `controlToken` hook.
 * Emits scene.viewport when a token is selected/deselected (viewport may shift).
 *
 * @param emitFn - Delta emission function
 */
function handleControlToken(emitFn: EmitFn): void {
  const viewport = getSceneViewport();
  emitFn(SCENE_VIEWPORT_DELTA_TYPE, viewport);
}

/**
 * Handles the `createChatMessage` hook.
 * Classifies the message, pushes to ring buffer, and emits event.log.delta.
 *
 * Message type classification:
 * - Type 5 = roll (may contain damage/heal markers in content)
 * - All others = "chat" for Phase 2 (fine-grained classification in Phase 7)
 *
 * @param message - The created chat message document
 * @param emitFn  - Delta emission function
 */
function handleCreateChatMessage(message: unknown, emitFn: EmitFn): void {
  if (typeof message !== 'object' || message === null) {
    return;
  }

  const msg = message as Record<string, unknown>;

  const content =
    typeof msg.content === 'string'
      ? msg.content
      : typeof msg.flavor === 'string'
        ? msg.flavor
        : '';

  // Derive actor ID from speaker object (may be null for out-of-combat messages)
  let actorId: string | null = null;
  if (typeof msg.speaker === 'object' && msg.speaker !== null) {
    const speaker = msg.speaker as Record<string, unknown>;
    actorId = typeof speaker.actor === 'string' ? speaker.actor : null;
  }

  // Simple type classification for Phase 2 (Phase 7 will refine damage/heal detection)
  const type: EventType = 'chat';

  const entry: EventLogEntry = {
    seq: ++_eventSeq,
    ts: Date.now(),
    type,
    actorId,
    content,
  };

  eventLogBuffer.push(entry);
  emitFn(EVENT_LOG_DELTA_TYPE, entry);
}

/**
 * Handles the `targetToken` hook (FOUN-04 — read-side observation).
 *
 * Emits `combat.targets` with the user's current target set.
 * Read-only in Phase 2: we observe targets but never call `setTargets()`.
 * Write path (setTargets mutation) deferred to Phase 7.
 *
 * @param user     - The Foundry user who changed their targets
 * @param token    - The token that was targeted/untargeted
 * @param targeted - Whether the token was targeted (true) or untargeted (false)
 * @param emitFn   - Delta emission function
 */
function handleTargetToken(user: unknown, token: unknown, targeted: unknown, emitFn: EmitFn): void {
  if (typeof user !== 'object' || user === null) {
    return;
  }

  const userDoc = user as FoundryUser;
  const userId = userDoc.id;

  // Read current targets from the user's targets Set (game.user.targets)
  const targets = Array.from(userDoc.targets).map((t: FoundryToken) => ({
    tokenId: t.id,
    actorId: t.document.actorId,
    name: t.name,
  }));

  // Suppress unused variable warnings — hook args are needed for TS signature
  void token;
  void targeted;

  emitFn(COMBAT_TARGETS_DELTA_TYPE, { userId, targets });
}

// ─── Registration ──────────────────────────────────────────────────────────────

/**
 * Registers all 5 (+ FOUN-04 targetToken) Foundry hook subscribers.
 *
 * Returns a cleanup function that calls `Hooks.off(id)` for all registered hooks.
 * Call the cleanup function to deregister (e.g. on module teardown or in tests).
 *
 * @param emitFn - Delta emission function (injected; fire-and-forget)
 * @returns Cleanup function that removes all registered hooks
 *
 * @example
 * ```ts
 * // module.ts ready hook:
 * const cleanup = registerHookSubscribers(bridgeDeltaEmitter);
 * // On teardown (rarely needed in Foundry modules):
 * cleanup();
 * ```
 */
export function registerHookSubscribers(emitFn: EmitFn): () => void {
  const hookIds: number[] = [];

  hookIds.push(
    Hooks.on('updateActor', (actor: unknown, changes: unknown) => {
      handleUpdateActor(actor as FoundryActor, changes, emitFn);
    }),
  );

  hookIds.push(
    Hooks.on('updateCombat', (_combat: unknown) => {
      handleUpdateCombat(_combat, emitFn);
    }),
  );

  hookIds.push(
    Hooks.on('combatStart', (_combat: unknown) => {
      // combatStart fires on new combat creation — emit full state
      const snapshot = getCombatSnapshot();
      if (snapshot !== null) {
        emitFn(COMBAT_STATE_DELTA_TYPE, snapshot);
      }
    }),
  );

  hookIds.push(
    Hooks.on('canvasReady', (_canvas: unknown) => {
      handleCanvasReady(emitFn);
    }),
  );

  hookIds.push(
    Hooks.on('controlToken', (_token: unknown, _controlled: unknown) => {
      handleControlToken(emitFn);
    }),
  );

  hookIds.push(
    Hooks.on('createChatMessage', (message: unknown) => {
      handleCreateChatMessage(message, emitFn);
    }),
  );

  hookIds.push(
    Hooks.on('targetToken', (user: unknown, token: unknown, targeted: unknown) => {
      handleTargetToken(user, token, targeted, emitFn);
    }),
  );

  // Cleanup: deregister all hooks
  return () => {
    for (const id of hookIds) {
      Hooks.off(id);
    }
  };
}
