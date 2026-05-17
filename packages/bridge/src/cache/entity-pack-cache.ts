/**
 * entity-pack-cache — in-memory singleton for available entity vocabulary.
 *
 * Quick Task 260517-k2g (parallel additive pipeline to spell-pack-cache).
 *
 * Stores the latest `AvailableEntitiesPayload` pushed by the Foundry module
 * via the `r1.entities.available` envelope (received at POST /internal/delta,
 * processed by `entity-pack-handler.ts`).
 *
 * ## Design
 *
 * - Last-write-wins: every push from the module replaces the cached payload.
 * - Cold-cache: `get()` returns `null` when no push has been received yet.
 *   The REST route handles null → returns `{ entries: [], source: 'empty',
 *   count: 0, generatedAt: 0 }` cold-cache sentinel.
 * - Module-level singleton: one `EntityPackCache` instance per bridge server.
 *   Injected into the REST route and WS handler via `BuildServerOptions`
 *   (same pattern as `SpellPackCache`, `IdempotencyStore`, `PortraitCache`).
 *
 * ## Phase 15 Plan 03 — Change-notification API (VOICE-09 hot-update path)
 *
 * `onChange(listener)` / `removeListener(listener)` expose a synchronous
 * subscription channel on top of the cache's state. The contract:
 *
 * - Listeners fire **synchronously** in registration order **after** the
 *   internal payload is updated. A listener calling `cache.get()` therefore
 *   observes the new state, not the previous one (EPC-SUB-01).
 * - `set(payload)` fires listeners with the new payload (EPC-SUB-01..02).
 * - `clear()` fires listeners with `null` — the new state is `null`, so the
 *   contract "listeners observe the new state" extends uniformly (EPC-SUB-05).
 * - Exception isolation: each listener is wrapped in try/catch so a throwing
 *   subscriber cannot block subsequent listeners (EPC-SUB-04). The fallback
 *   surface is `console.warn` because the cache has no injected logger; the
 *   production consumer (`KeytermRefresher`) owns its own logger and catches
 *   inside its own `_doRefresh()` body — the console.warn here is a safety
 *   net for misuse, not a normal-flow log channel.
 * - `removeListener(listener)` detaches by reference (Array.indexOf + splice;
 *   EPC-SUB-03). No-op when the listener was never registered.
 *
 * The notify loop iterates over a *copy* of the listeners array so a listener
 * that calls `removeListener(self)` during invocation does not corrupt the
 * iteration index. (Same pattern as Node's EventEmitter.)
 *
 * The single production consumer is `KeytermRefresher` (15-03 Task 3) which
 * debounces these notifications to a 250ms window and serialises the resulting
 * `DeepgramAdapter.refreshKeyterm()` call via a drain-then-restart mutex.
 *
 * ## Security (T-EP-02)
 *
 * Cache writes are gated by `AvailableEntitiesPayloadSchema.safeParse` in
 * `entity-pack-handler.ts` BEFORE calling `set()`. The cache itself stores
 * pre-validated objects — no additional validation needed at read time.
 *
 * @see packages/bridge/src/ws/entity-pack-handler.ts (writer)
 * @see packages/bridge/src/routes/entities.ts (reader)
 * @see packages/bridge/src/cache/spell-pack-cache.ts (sibling pipeline)
 * @see packages/bridge/src/voice/keyterm-refresher.ts (subscription consumer; Phase 15 Plan 03)
 * @see .planning/quick/260517-k2g-il-riconoscimento-degli-incantesimi-deve/260517-k2g-PLAN.md Task 2
 * @see .planning/phases/EVF-15-deepgram-keyterm-prompting-entity-pack-integration/15-03-PLAN.md Task 1
 */

import type { AvailableEntitiesPayload } from '@evf/shared-protocol';

/**
 * Listener invoked by {@link EntityPackCache} on every `set` / `clear` call.
 *
 * Receives the new cache state — the payload just written for `set()`, or
 * `null` for `clear()`. Listeners run synchronously in registration order.
 */
export type EntityPackCacheListener = (payload: AvailableEntitiesPayload | null) => void;

/**
 * In-memory cache for the latest available-entities vocabulary payload.
 *
 * A single instance is created in `buildServer()` and shared between
 * `registerEntitiesRoute`, `handleEntityPackEnvelope`, and the Phase 15
 * `KeytermRefresher` (which subscribes via `onChange`).
 */
export class EntityPackCache {
  /** The latest validated payload, or null when cache is cold (no push yet). */
  private _payload: AvailableEntitiesPayload | null = null;

  /**
   * Registered change listeners. Iterated over a copy on every notify so that
   * a listener calling `removeListener(self)` during invocation does not
   * corrupt the loop index. (Same pattern as Node's EventEmitter.)
   */
  private _listeners: EntityPackCacheListener[] = [];

  /**
   * Store a new payload (last-write-wins) and notify all registered listeners.
   *
   * Called by `entity-pack-handler.ts` after schema validation. Replaces any
   * previously cached payload atomically. Listeners are then invoked
   * synchronously in registration order, each in its own try/catch so a
   * throwing subscriber cannot block subsequent listeners.
   *
   * @param payload - Validated `AvailableEntitiesPayload` from the Foundry module.
   */
  set(payload: AvailableEntitiesPayload): void {
    this._payload = payload;
    this._notify(payload);
  }

  /**
   * Retrieve the cached payload.
   *
   * @returns The latest cached `AvailableEntitiesPayload`, or `null` when cold.
   */
  get(): AvailableEntitiesPayload | null {
    return this._payload;
  }

  /**
   * Clear the cache and notify listeners with `null`.
   *
   * Listeners are invoked synchronously after the internal state is reset.
   */
  clear(): void {
    this._payload = null;
    this._notify(null);
  }

  /**
   * Register a change listener. The listener is invoked synchronously after
   * every `set()` / `clear()` call, in registration order, after the cache
   * state has been updated.
   *
   * Idempotency: registering the same listener reference twice will cause it
   * to be invoked twice per change. Callers must avoid double-registration if
   * that is undesired. (Matches Node EventEmitter semantics.)
   *
   * @param listener - Callback receiving the new cache state.
   * @see .planning/phases/EVF-15-deepgram-keyterm-prompting-entity-pack-integration/15-03-PLAN.md
   */
  onChange(listener: EntityPackCacheListener): void {
    this._listeners.push(listener);
  }

  /**
   * Detach a listener by reference. No-op when the listener was never
   * registered (or has already been removed).
   *
   * Implementation: removes only the first matching reference (mirrors
   * `EventEmitter.removeListener`). If a listener was registered twice,
   * `removeListener` must be called twice to fully detach it.
   *
   * @param listener - The exact callback reference previously passed to {@link onChange}.
   */
  removeListener(listener: EntityPackCacheListener): void {
    const idx = this._listeners.indexOf(listener);
    if (idx !== -1) {
      this._listeners.splice(idx, 1);
    }
  }

  /**
   * Invoke all listeners with the new cache state. Each invocation is wrapped
   * in try/catch so a throwing subscriber cannot block subsequent listeners.
   *
   * Iterates over a *copy* of the listeners array so a listener that calls
   * `removeListener(self)` during invocation does not corrupt the iteration
   * index. (Same pattern as Node's EventEmitter.)
   */
  private _notify(payload: AvailableEntitiesPayload | null): void {
    // Snapshot to tolerate in-flight removals during iteration.
    const snapshot = this._listeners.slice();
    for (const listener of snapshot) {
      try {
        listener(payload);
      } catch (err) {
        // No injected logger here; fall back to console.warn. The production
        // consumer (KeytermRefresher) wraps its own body in a try/catch with a
        // pino logger — this fallback is only for misuse / non-production
        // subscribers and is asserted by EPC-SUB-04.
        console.warn('[entity-pack-cache] listener threw', err);
      }
    }
  }
}
