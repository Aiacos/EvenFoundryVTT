/**
 * forced-leader-tracker — tracks whether a headless forced-leader client is
 * currently streaming frames (ADR-0015 §C P2c).
 *
 * The headless player-view client (launched with `?evfLeader=1`) tags its frame
 * POSTs with the `X-EVF-Forced-Leader` header. The internal-delta route calls
 * {@link mark} on each such frame and {@link isActive} to decide whether to DROP
 * a non-forced (GM) frame from the broadcast — so while the headless session
 * streams, the glasses show ITS view, not the GM's. When the headless stops
 * (no forced frame within the TTL), `isActive()` falls false and the GM's frames
 * flow again automatically.
 *
 * @see packages/bridge/src/routes/internal-delta.ts (consumer)
 * @see docs/architecture/0015-player-view-map-capture.md §C
 */

/** Default forced-leader liveness window (ms): ~3× a slow keyframe interval. */
const DEFAULT_TTL_MS = 10_000;

/** Tracks the timestamp of the last forced-leader frame, with a TTL. */
export class ForcedLeaderTracker {
  private _lastForcedTs = 0;

  /** @param ttlMs - How long a forced-leader is considered active after its last frame. */
  constructor(private readonly ttlMs: number = DEFAULT_TTL_MS) {}

  /** Record that a forced-leader frame just arrived. */
  mark(now: number = Date.now()): void {
    this._lastForcedTs = now;
  }

  /** True when a forced-leader frame arrived within the TTL (so it owns the stream). */
  isActive(now: number = Date.now()): boolean {
    return this._lastForcedTs > 0 && now - this._lastForcedTs < this.ttlMs;
  }
}
