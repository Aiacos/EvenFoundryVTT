/**
 * Unit tests for LocaleEventEmitter (Plan 06-01 Task 1).
 *
 * Covers the locale-events behavior block:
 *   - LEM-01: registered listener receives the emitted locale code
 *   - LEM-02: unsubscribe returned by on() removes the listener
 *   - LEM-03: double-call of unsubscribe is idempotent (no throw)
 *   - LEM-04: per-listener try/catch isolation — a throwing listener does NOT
 *             prevent subsequent listeners from running; console.warn called once
 *   - LEM-05: emitter.size() === 0 after off() (parity with PanelGestureBus.size())
 *   - LEM-06: multiple listeners all receive the emitted code
 *   - LEM-07: emitter starts at size 0
 *
 * @see ../locale-events.ts (source)
 * @see .planning/phases/06-r1-integration-quick-action-inv-5/06-01-PLAN.md Task 1
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocaleEventEmitter } from '../locale-events.js';

describe('LocaleEventEmitter (LEM-01..LEM-07)', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('LEM-01: registered listener receives the emitted locale code', () => {
    const emitter = new LocaleEventEmitter();
    const cb = vi.fn();
    emitter.on('changed', cb);
    emitter.emit('changed', 'it');
    expect(cb).toHaveBeenCalledWith('it');
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('LEM-02: unsubscribe returned by on() removes the listener', () => {
    const emitter = new LocaleEventEmitter();
    const cb = vi.fn();
    const off = emitter.on('changed', cb);
    off();
    emitter.emit('changed', 'en');
    expect(cb).not.toHaveBeenCalled();
  });

  it('LEM-03: double-call of unsubscribe is idempotent (no throw)', () => {
    const emitter = new LocaleEventEmitter();
    const cb = vi.fn();
    const off = emitter.on('changed', cb);
    off();
    expect(() => off()).not.toThrow();
  });

  it('LEM-04: throwing listener does NOT prevent subsequent listeners (per-listener try/catch)', () => {
    const emitter = new LocaleEventEmitter();
    const boom = vi.fn().mockImplementation(() => {
      throw new Error('listener boom');
    });
    const ok = vi.fn();
    emitter.on('changed', boom);
    emitter.on('changed', ok);
    expect(() => emitter.emit('changed', 'de')).not.toThrow();
    expect(boom).toHaveBeenCalledTimes(1);
    expect(ok).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0]?.[0])).toContain('locale-events');
  });

  it('LEM-05: size() === 0 after off()', () => {
    const emitter = new LocaleEventEmitter();
    const cb = vi.fn();
    const off = emitter.on('changed', cb);
    expect(emitter.size()).toBe(1);
    off();
    expect(emitter.size()).toBe(0);
  });

  it('LEM-06: multiple listeners all receive the emitted code', () => {
    const emitter = new LocaleEventEmitter();
    const a = vi.fn();
    const b = vi.fn();
    emitter.on('changed', a);
    emitter.on('changed', b);
    emitter.emit('changed', 'auto');
    expect(a).toHaveBeenCalledWith('auto');
    expect(b).toHaveBeenCalledWith('auto');
  });

  it('LEM-07: new emitter starts at size 0', () => {
    const emitter = new LocaleEventEmitter();
    expect(emitter.size()).toBe(0);
  });
});
