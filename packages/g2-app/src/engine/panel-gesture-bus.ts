/**
 * In-process publish/subscribe bus for R1 ring gestures (Phase 4b foundation).
 *
 * Architectural decision (04B-RESEARCH §Q2 Pattern B): gesture routing inside
 * `packages/g2-app` is in-process — NOT a WS round-trip through the bridge.
 * Phase 6 wires the R1 source provider (which translates SDK `CLICK_EVENT` /
 * `DOUBLE_CLICK_EVENT` / `SCROLL_TOP_EVENT` / `SCROLL_BOTTOM_EVENT` into
 * `R1Gesture` literals) and `publish`-es them on the bus; Phase 4b/5 panels
 * `subscribe` from their `onMount` and `unsubscribe` from their `onUnmount`.
 *
 * Semantics:
 *   - **No buffering** — gestures published while `size() === 0` are dropped
 *     silently. Open Question 2 resolution: late-mounting panels do NOT receive
 *     historical gestures (justified by INV-5 gesture determinism — phantom
 *     replay would surprise the user).
 *   - **Per-subscriber error isolation** — a throwing subscriber gets a
 *     `console.warn` telemetry hit; OTHER subscribers still run (T-4b-01-03).
 *   - **Idempotent unsubscribe** — the unsubscribe closure is a no-op after
 *     the first call; double-call is safe (matches `AbortSignal.aborted`
 *     idempotency pattern).
 *
 * Threading: single-threaded (browser main thread / worker thread). No locks,
 * no async dispatch — `publish` is synchronous and returns after every active
 * subscriber has been invoked.
 *
 * @see .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-RESEARCH.md §Q2 Pattern B
 * @see docs/architecture/0009-layer-manager-contract.md Amendment 1
 */

import type { R1Gesture } from './layer-types.js';

/** Subscriber function — receives every published gesture in subscription order. */
export type PanelGestureHandler = (gesture: R1Gesture) => void;

/**
 * In-process R1 gesture bus.
 *
 * Construct once per app boot; share the singleton between the Phase 6 R1 source
 * provider (publisher) and Phase 4b/5 panels (subscribers). The bus owns no
 * scheduling — `publish` invokes every subscriber synchronously before returning.
 */
export class PanelGestureBus {
  /**
   * Active subscribers. `Set` keeps subscription order for predictable fan-out
   * (Set iteration follows insertion order per ECMAScript) and gives O(1)
   * unsubscribe via `delete`.
   */
  private readonly subscribers = new Set<PanelGestureHandler>();

  /**
   * Subscribe a handler.
   *
   * The returned closure unsubscribes the handler when called. Calling it more
   * than once is safe — subsequent invocations are no-ops (idempotent).
   *
   * @param fn Handler invoked synchronously with every subsequent `publish`
   * @returns Unsubscribe closure (idempotent)
   */
  subscribe(fn: PanelGestureHandler): () => void {
    this.subscribers.add(fn);
    return () => {
      this.subscribers.delete(fn);
    };
  }

  /**
   * Publish a gesture to every active subscriber in subscription order.
   *
   * Per-subscriber `try`/`catch` isolation: a throwing subscriber does NOT
   * propagate the throw out of `publish` and does NOT block subsequent
   * subscribers. The throw is captured into a `console.warn` telemetry call
   * with the offending subscriber's error.
   *
   * Gestures published while no subscribers exist are dropped silently — no
   * buffering, no replay (deliberate; see class JSDoc).
   *
   * @param gesture The R1Gesture to fan out
   */
  publish(gesture: R1Gesture): void {
    // Snapshot the active subscribers BEFORE iteration so an `onEvent` that
    // unsubscribes mid-publish does not affect the in-flight fan-out (the
    // ECMAScript `Set` iterator is live; reading from a snapshot keeps the
    // dispatch deterministic).
    const snapshot = Array.from(this.subscribers);
    for (const handler of snapshot) {
      try {
        handler(gesture);
      } catch (err) {
        // Telemetry only — do not rethrow. Per-subscriber error isolation
        // (T-4b-01-03 mitigation) keeps a faulty panel from blocking others.
        console.warn('[panel-gesture-bus] subscriber threw; continuing fan-out', err);
      }
    }
  }

  /**
   * Active subscriber count.
   *
   * Exposed for tests and diagnostics (e.g., Plan 05 conc-modal
   * `bus.size() === 0` post-unmount assertion). Production code MUST NOT
   * gate behavior on `size()` — subscriber identity is opaque by design.
   */
  size(): number {
    return this.subscribers.size;
  }
}
