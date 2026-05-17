/**
 * KeytermRefresher — debounced + mutex-serialised hot-update orchestrator.
 *
 * Phase 15 Plan 03 Task 3. Wires the VOICE-09 hot-update path:
 *
 * ```
 * EntityPackCache.set(payload)
 *   → onChange listener fires (this module)
 *     → debounce DEBOUNCE_MS (250) — coalesce multi-event bursts (CONTEXT D-07)
 *       → acquire mutex (drain-then-restart)
 *         → DeepgramAdapter.refreshKeyterm() (invalidation signal)
 *       → release mutex
 * ```
 *
 * ## Why debounce 250ms?
 *
 * CONTEXT D-07 locks this value. The motivating real-world pattern is the
 * Foundry `updateCompendium` hook firing 100+ times within ~200ms when a DM
 * installs a compendium pack (verified during quick-task 260517-k2g entity
 * recognition work). 250ms is comfortably > the observed burst window while
 * still being well under the VOICE-09 "≤ 5 minutes" SLA. Implementation: a
 * single `setTimeout` that resets on each new event — simpler than RxJS,
 * zero extra deps.
 *
 * ## Why "drain-then-restart" mutex (vs a queue)?
 *
 * A queue would re-trigger `refreshKeyterm()` once per event after the
 * in-flight refresh completes. That is wasted work — the refresher's
 * semantic is "the next connect() picks up the latest cache state", not
 * "every event must be acknowledged individually". By dropping mid-flight
 * events, the drain-then-restart pattern collapses any burst into a single
 * refresh covering the latest cache state at refresh time. If new events
 * arrive AFTER `_inFlight=false`, a fresh debounced cycle starts naturally.
 *
 * ## Exception safety
 *
 * If `adapter.refreshKeyterm()` throws, the mutex flag MUST be released so
 * subsequent cycles can fire. The implementation uses a `try/catch/finally`
 * block — the `finally` guarantees release. KRF-07 exercises this contract.
 *
 * ## What this module does NOT do
 *
 * - No new WS handler (CI Gate 8 invariant: socketlib count must remain 17).
 *   The refresh path uses the existing /internal/delta multiplex via
 *   `EntityPackCache.set()` already wired in `handleEntityPackEnvelope`.
 * - No keyterm computation (delegated to `buildKeytermList` via the adapter's
 *   `keytermProvider` callback).
 * - No Deepgram-level wire reconfiguration (the streaming protocol does NOT
 *   support mid-stream keyterm hot-swap — see `DeepgramAdapter.refreshKeyterm`
 *   JSDoc; the next connect() picks up fresh keyterms lazily).
 *
 * @see ../cache/entity-pack-cache.ts (onChange producer — Task 1)
 * @see ./deepgram-stt.ts (refreshKeyterm consumer — Task 2)
 * @see ../server.ts step 10 (KeytermRefresher instantiation — Task 3 wiring)
 * @see .planning/phases/EVF-15-deepgram-keyterm-prompting-entity-pack-integration/15-03-PLAN.md
 * @see .planning/phases/EVF-15-deepgram-keyterm-prompting-entity-pack-integration/15-CONTEXT.md D-07
 */

import type { Logger } from 'pino';
import type { EntityPackCache, EntityPackCacheListener } from '../cache/entity-pack-cache.js';
import type { DeepgramAdapter } from './deepgram-stt.js';

/**
 * Debounce window for coalescing entity-pack-cache change events into a
 * single keyterm refresh. CONTEXT D-07-locked at 250 ms — chosen to
 * comfortably exceed observed Foundry `updateCompendium` burst windows
 * (~200ms) while staying well under the VOICE-09 "≤ 5 minutes" SLA.
 */
export const DEBOUNCE_MS = 250 as const;

/**
 * Construction options for {@link KeytermRefresher}.
 */
export interface KeytermRefresherOpts {
  /** The entity-pack cache instance to subscribe to via `onChange`. */
  cache: EntityPackCache;
  /** The Deepgram adapter whose keyterm list to invalidate on each refresh. */
  adapter: DeepgramAdapter;
  /** pino logger for refresh-cycle telemetry + exception reporting. */
  logger: Logger;
}

/**
 * Orchestrator: subscribes to {@link EntityPackCache} change events,
 * debounces them in a 250 ms window, and dispatches the resulting
 * {@link DeepgramAdapter.refreshKeyterm} call under a drain-then-restart
 * mutex.
 *
 * Construction is the only side effect — the cache.onChange subscription
 * is established immediately. Tear down via {@link dispose} (used in tests
 * and available for graceful-shutdown hooks if added later).
 */
export class KeytermRefresher {
  private readonly _cache: EntityPackCache;
  private readonly _adapter: DeepgramAdapter;
  private readonly _logger: Logger;
  private readonly _listener: EntityPackCacheListener;
  private _pendingTimer: ReturnType<typeof setTimeout> | null = null;
  /**
   * Mutex flag for the drain-then-restart pattern. When `true`, in-flight
   * refresh body is running; new cache events are absorbed without
   * scheduling additional timers.
   */
  private _inFlight = false;

  constructor(opts: KeytermRefresherOpts) {
    this._cache = opts.cache;
    this._adapter = opts.adapter;
    this._logger = opts.logger;
    // Bind once at construction so removeListener can detach by reference later.
    this._listener = (_payload) => this._onCacheChange();
    this._cache.onChange(this._listener);
  }

  /**
   * Tear down the refresher. Detaches the cache.onChange listener and
   * clears any pending debounce timer. Safe to call multiple times.
   */
  dispose(): void {
    this._cache.removeListener(this._listener);
    if (this._pendingTimer !== null) {
      clearTimeout(this._pendingTimer);
      this._pendingTimer = null;
    }
  }

  /**
   * Internal: handle a cache change event. Implements the debounce + mutex.
   *
   * - If a refresh is in-flight, the event is absorbed (drain-then-restart).
   * - If a debounce timer is already pending, clear it and start fresh —
   *   the new event resets the window, which is the standard "trailing-
   *   edge debounce" pattern.
   * - Otherwise schedule a new timer.
   */
  private _onCacheChange(): void {
    if (this._inFlight) {
      // Drain-then-restart: in-flight body covers the latest cache state.
      // New events arriving DURING the body are absorbed.
      return;
    }
    if (this._pendingTimer !== null) {
      clearTimeout(this._pendingTimer);
    }
    this._pendingTimer = setTimeout(() => this._doRefresh(), DEBOUNCE_MS);
  }

  /**
   * Internal: execute the refresh. Sets the in-flight flag, calls
   * `adapter.refreshKeyterm()`, catches any exception (logs warn), and
   * always releases the flag in the `finally` block — KRF-07 exercises
   * this contract.
   */
  private _doRefresh(): void {
    this._pendingTimer = null;
    this._inFlight = true;
    try {
      this._adapter.refreshKeyterm();
    } catch (err) {
      this._logger.warn(
        { err },
        'keyterm-refresher: adapter.refreshKeyterm threw — mutex released, next cycle will fire normally',
      );
    } finally {
      this._inFlight = false;
    }
  }
}
