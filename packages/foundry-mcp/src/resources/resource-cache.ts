/**
 * ResourceCache — in-memory store for the 4 MCP resource URIs.
 *
 * Holds the latest snapshot for each resource:
 * - `actor://current`  → CharacterSnapshot (single value, replaced on each delta)
 * - `combat://current` → CombatSnapshot    (single value, replaced on each delta)
 * - `scene://current`  → SceneViewport     (single value, replaced on each delta)
 * - `log://recent`     → EventLogEntry[]   (FIFO ring buffer, capacity=50)
 *
 * Cache updates notify subscribers via `onUpdate` callbacks so `registerEvfResources`
 * can call `server.sendResourceUpdated({ uri })` on each change.
 *
 * Memory bounds (T-11-13 mitigation):
 * - Per-resource single-snapshot: one replace per delta, no unbounded growth.
 * - Log ring: capacity=50 entries; oldest entry evicted on overflow (FIFO).
 * - No background GC needed — bounded by construction.
 *
 * Thread safety: Node.js is single-threaded; no locking required.
 *
 * @see packages/foundry-mcp/src/resources/ws-subscription.ts (updater)
 * @see packages/foundry-mcp/src/resources/register-resources.ts (consumer)
 * @see .planning/phases/11-v2-foundry-mcp-server/11-03-PLAN.md Task 1
 */

import type {
  CharacterSnapshot,
  CombatSnapshot,
  EventLogEntry,
  SceneViewport,
} from '@evf/shared-protocol';

// ─── URI type ─────────────────────────────────────────────────────────────────

export type ResourceUri =
  | 'actor://current'
  | 'combat://current'
  | 'scene://current'
  | 'log://recent';

/** Conditional value type for each URI. */
export type ResourceValueOf<U extends ResourceUri> = U extends 'actor://current'
  ? CharacterSnapshot
  : U extends 'combat://current'
    ? CombatSnapshot
    : U extends 'scene://current'
      ? SceneViewport
      : U extends 'log://recent'
        ? EventLogEntry[]
        : never;

// ─── Local LogRing ────────────────────────────────────────────────────────────

/**
 * FIFO ring buffer for EventLogEntry items.
 *
 * Local-only for Phase 11 — the Phase 2 `foundry-module` ring-buffer class is not
 * promoted to `shared-protocol` in this phase (separate processes; no shared dep).
 * Implementation is ~15 LOC and matches the Phase 2 RingBuffer<T> contract exactly.
 *
 * T-11-13 mitigation: capacity=50 hard-caps memory growth from delta floods.
 */
class LogRing {
  private buf: EventLogEntry[] = [];

  constructor(private readonly capacity: number) {}

  push(entry: EventLogEntry): void {
    this.buf.push(entry);
    if (this.buf.length > this.capacity) {
      this.buf.shift();
    }
  }

  /** Returns a shallow copy in insertion (FIFO) order. */
  toArray(): EventLogEntry[] {
    return [...this.buf];
  }

  clear(): void {
    this.buf = [];
  }
}

// ─── ResourceCache ────────────────────────────────────────────────────────────

/**
 * In-memory cache for all 4 EVF MCP resource URIs.
 *
 * Usage:
 * ```ts
 * const cache = new ResourceCache();
 * cache.set('actor://current', snapshot);
 * const value = cache.get('actor://current');   // CharacterSnapshot | undefined
 * cache.appendLog(logEntry);                     // pushes to log://recent ring
 * cache.onUpdate('actor://current', () => ...);  // subscriber for change notifications
 * cache.clear();                                 // resets data; preserves subscribers
 * ```
 */
export class ResourceCache {
  private readonly store = new Map<ResourceUri, unknown>();
  private readonly subscribers = new Map<ResourceUri, Set<() => void>>();
  private readonly logRing = new LogRing(50);

  /**
   * Get the current cached value for a resource URI.
   *
   * Returns `undefined` if no value has been set yet (cold cache).
   * Callers should fall back to the REST endpoint on `undefined`.
   */
  get<U extends ResourceUri>(uri: U): ResourceValueOf<U> | undefined {
    if (uri === 'log://recent') {
      const arr = this.logRing.toArray();
      if (arr.length === 0) return undefined;
      return arr as ResourceValueOf<U>;
    }
    return this.store.get(uri) as ResourceValueOf<U> | undefined;
  }

  /**
   * Set a snapshot for a non-log resource URI (actor, combat, scene).
   *
   * Overwrites the previous value and notifies subscribers.
   */
  set<U extends Exclude<ResourceUri, 'log://recent'>>(uri: U, value: ResourceValueOf<U>): void {
    this.store.set(uri, value);
    this._notify(uri);
  }

  /**
   * Append a log entry to the `log://recent` ring buffer.
   *
   * Oldest entry is evicted when the ring exceeds 50 entries.
   * Notifies `log://recent` subscribers after push.
   */
  appendLog(entry: EventLogEntry): void {
    this.logRing.push(entry);
    this._notify('log://recent');
  }

  /**
   * Register a callback to be invoked whenever `uri` is updated.
   *
   * Returns an unsubscribe function that removes the callback.
   *
   * @param uri - The resource URI to watch.
   * @param cb  - Zero-argument callback fired on each update.
   * @returns   Unsubscribe function.
   */
  onUpdate(uri: ResourceUri, cb: () => void): () => void {
    let subs = this.subscribers.get(uri);
    if (!subs) {
      subs = new Set();
      this.subscribers.set(uri, subs);
    }
    subs.add(cb);
    return () => {
      subs?.delete(cb);
    };
  }

  /**
   * Clear all cached data.
   *
   * Subscribers are preserved — `clear()` is for state reset (e.g. session restart),
   * not for unregistering observers.
   */
  clear(): void {
    this.store.clear();
    this.logRing.clear();
  }

  private _notify(uri: ResourceUri): void {
    const subs = this.subscribers.get(uri);
    if (!subs) return;
    for (const cb of subs) {
      cb();
    }
  }
}
