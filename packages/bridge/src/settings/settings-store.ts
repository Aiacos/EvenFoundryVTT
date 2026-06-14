/**
 * settings-store — in-memory state for the bidirectional display-settings sync.
 *
 * Latency-audit follow-up 2026-06-14. Holds two pieces of single-world state:
 *
 * 1. **`latest`** — the most recent FULL settings snapshot pushed by the Foundry
 *    module over the `settings.display` delta. Served to each WS session on
 *    connect so the glasses menu reflects the live Foundry values immediately,
 *    even when the app connects after the last change (the replay buffer only
 *    covers reconnects, not first connects).
 *
 * 2. **`pending`** — a partial edit accumulated from glasses `client_setting`
 *    WS messages, waiting to be delivered UPSTREAM to the module. The module is
 *    push-only / zero-polling, so the bridge cannot call it; instead it returns
 *    the pending edit in the HTTP response of the module's next `frame_png`
 *    POST and clears it ({@link drainPending}). Frame POSTs come only from the
 *    stream-leader client, making the response a leader-only carrier.
 *
 * Single-tenant homelab scope: one world, one store instance per bridge server
 * (injected via `BuildServerOptions`). Last-write-wins on `latest`; partial
 * merge on `pending` (later edits to the same key override earlier ones).
 *
 * @see packages/shared-protocol/src/payloads/settings-display.ts (schema)
 * @see packages/bridge/src/routes/internal-delta.ts (cache write + piggyback)
 * @see packages/foundry-module/src/module.ts (upstream apply)
 */

import type { SettingsDisplay } from '@evf/shared-protocol';

/**
 * In-memory display-settings state for one world.
 *
 * A single instance is created in `buildServer()` and shared between the
 * `/internal/delta` route (cache write + pending drain), the `/ws` connect
 * push, and the `client_setting` inbound handler (pending queue).
 */
export class SettingsStore {
  /** Latest full snapshot pushed by the module, or null when cold (no push yet). */
  private _latest: SettingsDisplay | null = null;

  /** Partial edit awaiting upstream delivery, or null when nothing is queued. */
  private _pending: SettingsDisplay | null = null;

  /**
   * Replace the cached downstream snapshot (last-write-wins).
   *
   * Called from the `/internal/delta` route when a `settings.display` envelope
   * arrives from the module.
   */
  setLatest(snapshot: SettingsDisplay): void {
    this._latest = snapshot;
  }

  /** Return the cached snapshot, or null when the cache is cold (no push yet). */
  getLatest(): SettingsDisplay | null {
    return this._latest;
  }

  /**
   * Merge a partial edit into the pending upstream box.
   *
   * Called from the `client_setting` WS inbound handler. Later edits to the
   * same key override earlier ones (latest-wins per key), so a burst of glasses
   * adjustments collapses to one delivery.
   */
  queuePending(edit: SettingsDisplay): void {
    this._pending = { ...(this._pending ?? {}), ...edit };
  }

  /**
   * Return the pending edit and clear it atomically.
   *
   * Returns `null` when nothing is queued. Called from the `/internal/delta`
   * route on each frame POST: the module receives + applies the returned edit.
   */
  drainPending(): SettingsDisplay | null {
    const out = this._pending;
    this._pending = null;
    return out;
  }

  /** Reset both pieces of state (test isolation). */
  clear(): void {
    this._latest = null;
    this._pending = null;
  }
}
