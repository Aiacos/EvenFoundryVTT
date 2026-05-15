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
 * @see .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-01-PLAN.md Task 1
 * @see .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-RESEARCH.md §Q2 Pattern B
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
