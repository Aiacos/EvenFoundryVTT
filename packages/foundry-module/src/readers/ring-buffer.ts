/**
 * Foundry-side 200-entry ring buffer for the event log (D-2.16).
 *
 * Purpose: cursor-based pagination of Foundry chat/combat events for
 * `GET /v1/events?since=N` REST calls. Oldest entries are evicted silently
 * when capacity is reached.
 *
 * This is distinct from the bridge-side `ReplayBuffer` (T-02-05):
 * - Ring buffer: Foundry-side, 200-entry capacity, monotonic integer cursor,
 *   used for REST `/v1/events` pagination.
 * - Replay buffer: bridge-side, 60s TTL, wall-clock eviction,
 *   used for WS reconnect gap-fill.
 *
 * @see 02-05-PLAN.md Task 1 (RingBuffer spec)
 * @see packages/bridge/src/ws/replay-buffer.ts (bridge-side replay buffer — different concern)
 * @see Specs.md §11.5.8.1 (reconnect / replay buffer — bridge side)
 */

/**
 * Generic fixed-capacity ring buffer.
 *
 * Items must expose a `seq: number` field for cursor-based reads.
 * Capacity defaults to 200 (D-2.16) but is configurable for testing.
 *
 * Internal layout: fixed-length backing array + head/tail pointers.
 * - `head` points to the oldest item's slot.
 * - `tail` points to the next-write slot.
 * - When full, push overwrites the oldest entry (head advances).
 *
 * @template T - Item type; must have a `seq: number` property.
 *
 * @example
 * ```ts
 * const buf = new RingBuffer<EventLogEntry>(200);
 * buf.push({ seq: 1, ts: Date.now(), type: 'chat', actorId: null, content: 'Hello' });
 * const newEntries = buf.since(0); // All entries with seq > 0
 * ```
 */
export class RingBuffer<T extends { seq: number }> {
  private readonly capacity: number;
  private readonly items: Array<T | undefined>;
  private head = 0; // Oldest item index
  private tail = 0; // Next write index
  private count = 0; // Current number of items

  constructor(capacity = 200) {
    this.capacity = capacity;
    this.items = new Array<T | undefined>(capacity).fill(undefined);
  }

  /**
   * Push an item into the buffer.
   *
   * If the buffer is at capacity, the oldest item is silently evicted
   * (head advances to the next slot).
   *
   * @param item - Item to push (must have `seq: number`)
   */
  push(item: T): void {
    if (this.count === this.capacity) {
      // Buffer is full — evict oldest by advancing head
      this.head = (this.head + 1) % this.capacity;
    } else {
      this.count++;
    }

    this.items[this.tail] = item;
    this.tail = (this.tail + 1) % this.capacity;
  }

  /**
   * Returns all items in insertion order (oldest first).
   *
   * Returns an empty array if the buffer is empty.
   */
  toArray(): T[] {
    if (this.count === 0) return [];

    const result: T[] = [];
    for (let i = 0; i < this.count; i++) {
      const idx = (this.head + i) % this.capacity;
      const item = this.items[idx];
      if (item !== undefined) {
        result.push(item);
      }
    }
    return result;
  }

  /**
   * Returns items with `seq > cursor`, in insertion order.
   *
   * Used by `GET /v1/events?since=N` for cursor-based pagination.
   * Returns an empty array if no items exist with `seq > cursor`.
   *
   * @param cursor - Exclusive lower bound on `seq`
   */
  since(cursor: number): T[] {
    return this.toArray().filter((item) => item.seq > cursor);
  }

  /**
   * Current number of items in the buffer.
   *
   * Useful for testing capacity eviction behaviour.
   */
  get size(): number {
    return this.count;
  }

  /**
   * Clear all items from the buffer.
   *
   * Resets head, tail, and count to 0.
   * Useful for test isolation.
   */
  clear(): void {
    this.items.fill(undefined);
    this.head = 0;
    this.tail = 0;
    this.count = 0;
  }
}
