/**
 * Unit tests for PanelGestureBus in-process pub/sub (Phase 4b Plan 01 Task 1).
 *
 * Covers PGB-1..PGB-7 from 04B-01-PLAN.md `<behavior>` block:
 *   - PGB-1: new bus reports size 0
 *   - PGB-2: subscribe returns an unsubscribe function and bumps size to 1
 *   - PGB-3: publish fans out to every active subscriber exactly once
 *   - PGB-4: a faulty subscriber does NOT block other subscribers — per-call
 *           try/catch isolation (console.warn telemetry per RESEARCH §Q2)
 *   - PGB-5: calling unsubscribe removes the subscriber + decrements size
 *   - PGB-6: unsubscribe is idempotent (no throw, size never goes below 0)
 *   - PGB-7: publish to zero subscribers is a silent drop (no buffer)
 *
 * Phase 6 Plan 04 extension: PGB-SR-01..05 — single-receiver invariant tests
 * verifying INV-5 architectural enforcement.
 *   - PGB-SR-01: zero-handler case is a silent drop (bus semantics, not r1-event-source)
 *   - PGB-SR-02: single subscriber receives all 100 gestures in order; bus.size() === 1
 *   - PGB-SR-03: subscribe + unsubscribe round-trip → bus.size() cycles 0 → 1 → 0; idempotent
 *   - PGB-SR-04: rapid subscribe + unsubscribe + re-subscribe (re-entrancy) → correct counts
 *   - PGB-SR-05: during overlayStack transition, bus.size() transiently hits 0 between
 *               unmount and mount (verified via synchronous ordering in bundle)
 *
 * @see .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-01-PLAN.md Task 1
 * @see .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-RESEARCH.md §Q2 Pattern B
 * @see .planning/phases/06-r1-integration-quick-action-inv-5/06-CONTEXT.md §Area 3
 * @see docs/architecture/INVARIANTS.md §5 INV-5 (Gesture Determinism)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { R1Gesture } from '../layer-types.js';
import { PanelGestureBus } from '../panel-gesture-bus.js';

const TAP: R1Gesture = { kind: 'tap' };
const SCROLL_UP: R1Gesture = { kind: 'scroll', direction: 'up' };

describe('PanelGestureBus', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('PGB-1: a fresh bus reports size 0', () => {
    const bus = new PanelGestureBus();
    expect(bus.size()).toBe(0);
  });

  it('PGB-2: subscribe returns a function and bumps size to 1', () => {
    const bus = new PanelGestureBus();
    const fn = vi.fn();
    const unsubscribe = bus.subscribe(fn);
    expect(typeof unsubscribe).toBe('function');
    expect(bus.size()).toBe(1);
  });

  it('PGB-3: publish fans out to every active subscriber with the gesture', () => {
    const bus = new PanelGestureBus();
    const a = vi.fn();
    const b = vi.fn();
    bus.subscribe(a);
    bus.subscribe(b);
    bus.publish(TAP);
    expect(a).toHaveBeenCalledTimes(1);
    expect(a).toHaveBeenCalledWith(TAP);
    expect(b).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledWith(TAP);
  });

  it('PGB-4: a faulty subscriber does NOT block other subscribers (per-call try/catch)', () => {
    const bus = new PanelGestureBus();
    const boom = vi.fn().mockImplementation(() => {
      throw new Error('panel subscriber boom');
    });
    const ok = vi.fn();
    bus.subscribe(boom);
    bus.subscribe(ok);
    expect(() => bus.publish(SCROLL_UP)).not.toThrow();
    expect(boom).toHaveBeenCalledTimes(1);
    expect(ok).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalled();
    const args = warnSpy.mock.calls[0];
    expect(typeof args?.[0]).toBe('string');
    expect(String(args?.[0])).toContain('panel-gesture-bus');
  });

  it('PGB-5: unsubscribe removes the subscriber and decrements size', () => {
    const bus = new PanelGestureBus();
    const fn = vi.fn();
    const unsubscribe = bus.subscribe(fn);
    expect(bus.size()).toBe(1);
    unsubscribe();
    expect(bus.size()).toBe(0);
    bus.publish(TAP);
    expect(fn).not.toHaveBeenCalled();
  });

  it('PGB-6: unsubscribe is idempotent (double-call does not throw, size pinned at 0)', () => {
    const bus = new PanelGestureBus();
    const fn = vi.fn();
    const unsubscribe = bus.subscribe(fn);
    unsubscribe();
    expect(() => unsubscribe()).not.toThrow();
    expect(bus.size()).toBe(0);
  });

  it('PGB-7: publish to zero subscribers is a silent drop (no buffer)', () => {
    const bus = new PanelGestureBus();
    expect(() => bus.publish(TAP)).not.toThrow();
    expect(bus.size()).toBe(0);
    // Late subscriber must NOT receive the previously-published gesture.
    const late = vi.fn();
    bus.subscribe(late);
    expect(late).not.toHaveBeenCalled();
  });
});

// ─── PGB-SR-* single-receiver invariant tests (Phase 6 Plan 04) ───────────────

describe('panel-gesture-bus single-receiver invariant (PGB-SR-*)', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  /**
   * PGB-SR-01: Zero-handler case is a silent drop at the bus level.
   *
   * INV-5 zero-handler rule is enforced by `r1-event-source.ts` (which checks
   * `layerManager.getTopLayer() === null` and emits a `console.warn` BEFORE
   * calling `gestureBus.publish`). The bus itself does NOT warn on zero subscribers
   * — that is by design (PGB-7). The r1-event-source tests (R1E-08) verify the
   * INV-5 telemetry path.
   *
   * @see packages/g2-app/src/engine/r1-event-source.ts (INV-5 zero-handler check)
   * @see packages/g2-app/src/engine/__tests__/r1-event-source.test.ts (R1E-08)
   */
  it('PGB-SR-01: zero-handler — publish is a silent drop; bus emits NO console.warn', () => {
    const bus = new PanelGestureBus();
    expect(bus.size()).toBe(0);
    // PGB-SR-01: the bus silently drops; no warn from the bus (warn comes from r1-event-source)
    expect(() => bus.publish(TAP)).not.toThrow();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  /**
   * PGB-SR-02: Single subscriber receives all N gestures in publication order.
   *
   * INV-5 architectural invariant: in steady state exactly one panel is subscribed
   * (panels subscribe in onMount, unsubscribe in onUnmount). This test proves the
   * bus delivers all 100 gestures to the single subscriber in insertion order
   * without duplicates.
   *
   * @see docs/architecture/INVARIANTS.md §5 INV-5
   */
  it('PGB-SR-02: single subscriber receives 100 gestures in order; bus.size() === 1 throughout', () => {
    const bus = new PanelGestureBus();
    const received: R1Gesture[] = [];
    bus.subscribe((g) => received.push(g));
    expect(bus.size()).toBe(1);

    const gestures: R1Gesture[] = Array.from({ length: 100 }, (_, i) =>
      i % 2 === 0 ? TAP : SCROLL_UP,
    );

    for (const g of gestures) {
      bus.publish(g);
      // bus.size() must remain 1 throughout publication — no leaks, no growth
      expect(bus.size()).toBe(1);
    }

    expect(received).toHaveLength(100);
    for (let i = 0; i < 100; i++) {
      expect(received[i]).toEqual(gestures[i]);
    }
  });

  /**
   * PGB-SR-03: subscribe + unsubscribe round-trip → size cycles 0 → 1 → 0.
   *
   * Idempotent unsubscribe: calling the returned closure a second time must not
   * throw or decrement size below 0.
   *
   * @see packages/g2-app/src/engine/panel-gesture-bus.ts (idempotent unsubscribe JSDoc)
   */
  it('PGB-SR-03: subscribe + unsubscribe cycles size 0→1→0; idempotent second call is safe', () => {
    const bus = new PanelGestureBus();
    expect(bus.size()).toBe(0);

    const handler = vi.fn();
    const unsub = bus.subscribe(handler);
    expect(bus.size()).toBe(1);

    unsub(); // first call — removes handler
    expect(bus.size()).toBe(0);

    // Idempotent: second call must be a no-op
    expect(() => unsub()).not.toThrow();
    expect(bus.size()).toBe(0);

    // Subsequent publish must NOT reach the removed handler
    bus.publish(TAP);
    expect(handler).not.toHaveBeenCalled();
  });

  /**
   * PGB-SR-04: rapid subscribe + unsubscribe + re-subscribe (re-entrancy).
   *
   * Simulates the onMount → onUnmount → onMount lifecycle round-trip that happens
   * when a panel is suspended and restored via `PanelRouter.pushOverlay` +
   * `PanelRouter.popOverlay`. Verifies no lost or duplicated subscriptions.
   */
  it('PGB-SR-04: rapid subscribe/unsubscribe/re-subscribe — handler counts correct (no loss or duplication)', () => {
    const bus = new PanelGestureBus();
    const calls: string[] = [];

    // Simulate onMount → onUnmount → onMount round-trip
    const unsub1 = bus.subscribe(() => calls.push('A1'));
    expect(bus.size()).toBe(1);

    bus.publish(TAP); // A1 should receive
    unsub1(); // onUnmount
    expect(bus.size()).toBe(0);

    bus.publish(TAP); // nobody receives

    const unsub2 = bus.subscribe(() => calls.push('A2')); // onMount again (same panel)
    expect(bus.size()).toBe(1);

    bus.publish(TAP); // only A2 receives
    unsub2();
    expect(bus.size()).toBe(0);

    expect(calls).toEqual(['A1', 'A2']); // exactly one call each, in order
  });

  /**
   * PGB-SR-05: bus.size() transiently hits 0 between unmount and mount.
   *
   * During `layerManager.bundle([{destroy,z:Z2},{mount,z:Z2,layer:menu}])`,
   * the `onUnmount` of the outgoing panel runs SYNCHRONOUSLY before `onMount`
   * of the incoming menu (per LayerManager bundle Step 4 then Step 5 ordering
   * — both are called synchronously in the atomic bundle before the
   * `rebuildPageContainer` flush).
   *
   * This test simulates the ordering directly:
   *   1. Panel A mounts → subscribes → bus.size() === 1
   *   2. Panel A unmounts → unsubscribes → bus.size() === 0  (transient!)
   *   3. Menu B mounts → subscribes → bus.size() === 1 (restored)
   *
   * INV-5 note: the TRANSIENT zero is acceptable — no R1 gesture is published
   * during a bundle call (the R1 event source reads from the WS, which cannot
   * interleave with synchronous JS). The dispatcher is not a panel subscriber;
   * it is a separate bus subscriber (see `quick-action-long-press-dispatcher.ts`).
   *
   * @see packages/g2-app/src/engine/layer-manager.ts (bundle — onUnmount → onMount order)
   * @see docs/architecture/INVARIANTS.md §5 INV-5 (Gesture Determinism)
   */
  it('PGB-SR-05: during push/pop overlay, bus.size() transiently hits 0 between unmount→mount', () => {
    const bus = new PanelGestureBus();
    const sizeObservations: number[] = [];

    // Step 1: Panel A mounts (simulated onMount)
    const unsubA = bus.subscribe(() => {});
    expect(bus.size()).toBe(1);

    // Simulate the bundle ordering: onUnmount runs BEFORE onMount
    // Step 2: Panel A unmounts (simulated onUnmount)
    unsubA();
    sizeObservations.push(bus.size()); // should be 0 (transient)

    // Step 3: Menu B mounts (simulated onMount of QuickActionMenuPanel)
    const unsubB = bus.subscribe(() => {});
    sizeObservations.push(bus.size()); // should be 1 (restored)

    expect(sizeObservations[0]).toBe(0); // transient zero
    expect(sizeObservations[1]).toBe(1); // restored

    // Cleanup
    unsubB();
  });
});
