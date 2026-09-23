import { describe, expect, it, vi } from 'vitest';
import { initialState } from '../state/app-store.js';
import { captureConsole, captureGlobalErrors, emitMarker, formatConsoleArgs } from './capture.js';
import { activeDebugLog, createDebugLog, setActiveDebugLog } from './debug-log.js';
import { type DevtoolsHost, installDevtools, toTapGesture } from './devtools.js';
import { MIN_DWELL_MS, parseDebugFlags } from './flags.js';

describe('createDebugLog', () => {
  it('keeps the newest entries in order and numbers them monotonically', () => {
    let t = 100;
    const log = createDebugLog({ capacity: 3, now: () => t++ });
    for (const m of ['a', 'b', 'c', 'd']) log.push('info', 'test', m);
    expect(log.entries().map((e) => [e.seq, e.ts, e.message])).toEqual([
      [2, 101, 'b'],
      [3, 102, 'c'],
      [4, 103, 'd'],
    ]);
    expect(log.tail(2).map((e) => e.message)).toEqual(['c', 'd']);
    expect(log.tail(0)).toEqual([]);
  });

  it('stores data only when given and notifies subscribers until unsubscribed', () => {
    const log = createDebugLog();
    const seen: string[] = [];
    const off = log.subscribe((e) => seen.push(e.message));
    log.push('warn', 'hud', 'x', { id: 1 });
    log.push('warn', 'hud', 'y');
    off();
    log.push('warn', 'hud', 'z');
    expect(seen).toEqual(['x', 'y']);
    expect(log.entries()[0]?.data).toEqual({ id: 1 });
    expect('data' in (log.entries()[1] ?? {})).toBe(false);
  });

  it('clamps a non-positive capacity to one entry', () => {
    const log = createDebugLog({ capacity: 0 });
    log.push('info', 's', '1');
    log.push('info', 's', '2');
    expect(log.entries().map((e) => e.message)).toEqual(['2']);
  });

  it('registers the active buffer (fail-closed default null)', () => {
    expect(activeDebugLog()).toBeNull();
    const log = createDebugLog();
    setActiveDebugLog(log);
    expect(activeDebugLog()).toBe(log);
    setActiveDebugLog(null);
    expect(activeDebugLog()).toBeNull();
  });
});

describe('parseDebugFlags', () => {
  it('is off unless debug=1 or a demo is requested', () => {
    expect(parseDebugFlags('')).toEqual({ debug: false, demo: null, dwellMs: null });
    expect(parseDebugFlags('?debug=true').debug).toBe(false);
    expect(parseDebugFlags('?debug=0').debug).toBe(false);
    expect(parseDebugFlags('?demo=').demo).toBeNull();
    expect(parseDebugFlags('?debug=1')).toEqual({ debug: true, demo: null, dwellMs: null });
    expect(parseDebugFlags('demo=tour')).toEqual({ debug: true, demo: 'tour', dwellMs: null });
  });

  it('accepts only integer dwell periods ≥ 1 s', () => {
    expect(parseDebugFlags(`?demo=tour&dwell=${MIN_DWELL_MS}`).dwellMs).toBe(MIN_DWELL_MS);
    expect(parseDebugFlags('?demo=tour&dwell=999').dwellMs).toBeNull();
    expect(parseDebugFlags('?demo=tour&dwell=abc').dwellMs).toBeNull();
    expect(parseDebugFlags('?demo=tour&dwell=1500.5').dwellMs).toBeNull();
  });
});

describe('console capture', () => {
  it('formats a leading [tag] as the source', () => {
    expect(formatConsoleArgs(['[hud] rebuild failed', new Error('boom')])).toEqual({
      source: 'hud',
      message: 'rebuild failed Error: boom',
    });
    expect(formatConsoleArgs(['plain', { a: 1 }, 3])).toEqual({
      source: 'console',
      message: 'plain {"a":1} 3',
    });
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(formatConsoleArgs([circular]).message).toBe('[object Object]');
    expect(formatConsoleArgs([undefined]).message).toBe('undefined');
  });

  it('records warn/error, still calls the originals and restores them', () => {
    const log = createDebugLog();
    const warn = vi.fn();
    const error = vi.fn();
    const target = { warn, error, info: vi.fn() };
    const restore = captureConsole(log, target);
    target.warn('[hud] slow');
    target.error('bad', 1);
    expect(warn).toHaveBeenCalledWith('[hud] slow');
    expect(error).toHaveBeenCalledWith('bad', 1);
    expect(log.entries().map((e) => [e.level, e.source, e.message])).toEqual([
      ['warn', 'hud', 'slow'],
      ['error', 'console', 'bad 1'],
    ]);
    restore();
    expect(target.warn).toBe(warn);
    expect(target.error).toBe(error);
  });

  it('records uncaught errors and unhandled rejections until removed', () => {
    const log = createDebugLog();
    const target = new EventTarget() as unknown as Window;
    const remove = captureGlobalErrors(log, target);
    target.dispatchEvent(new ErrorEvent('error', { message: 'msg only' }));
    target.dispatchEvent(new ErrorEvent('error', { error: new TypeError('typed') }));
    const rejection = new Event('unhandledrejection') as PromiseRejectionEvent;
    Object.defineProperty(rejection, 'reason', { value: 'nope' });
    target.dispatchEvent(rejection);
    remove();
    target.dispatchEvent(new ErrorEvent('error', { message: 'ignored' }));
    expect(log.entries().map((e) => [e.source, e.message])).toEqual([
      ['uncaught', 'msg only'],
      ['uncaught', 'TypeError: typed'],
      ['unhandledrejection', 'nope'],
    ]);
  });

  it('emits marker lines on the sink and in the log', () => {
    const log = createDebugLog();
    const sink = { info: vi.fn() };
    emitMarker(log, 'EVF_READY', '', sink);
    emitMarker(log, 'EVF_SCENE', '1/2 explore thirds', sink);
    expect(sink.info.mock.calls).toEqual([['EVF_READY'], ['EVF_SCENE 1/2 explore thirds']]);
    expect(log.entries().map((e) => e.source)).toEqual(['marker', 'marker']);
  });
});

describe('window.__evf devtools', () => {
  it('validates gestures', () => {
    expect(toTapGesture('down')).toBe('down');
    expect(toTapGesture('long')).toBeNull();
    expect(toTapGesture({ menu: 2 })).toEqual({ menu: 2 });
    expect(toTapGesture({ menu: 0 })).toBeNull();
    expect(toTapGesture({ menu: 1.5 })).toBeNull();
    expect(toTapGesture({ menu: '1' })).toBeNull();
    expect(toTapGesture(null)).toBeNull();
    expect(toTapGesture(3)).toBeNull();
  });

  it('exposes state/events/dispatch and removes the handle', () => {
    const host: DevtoolsHost = {};
    const log = createDebugLog();
    log.push('info', 'x', 'hello');
    let inject: ((g: unknown) => void) | null = null;
    const remove = installDevtools(host, {
      state: () => ({ app: initialState(), display: { full: 'hi' } }),
      events: () => log.entries(),
      injector: () => inject,
    });
    const evf = host.__evf;
    if (evf === undefined) throw new Error('not installed');
    expect(evf.state().display).toEqual({ full: 'hi' });
    expect(evf.events()[0]?.message).toBe('hello');
    expect(evf.dispatch('tap')).toBe(false);
    const got: unknown[] = [];
    inject = (g) => got.push(g);
    expect(evf.dispatch('up')).toBe(true);
    expect(evf.dispatch({ menu: 3 })).toBe(true);
    expect(got).toEqual(['up', { menu: 3 }]);
    expect(() => evf.dispatch('swipe' as never)).toThrow(/unknown gesture "swipe"/);
    remove();
    expect(host.__evf).toBeUndefined();
  });
});
