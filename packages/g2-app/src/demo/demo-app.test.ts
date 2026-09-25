/**
 * Demo boot with the real HUD (`startHud`) on a recording fake bridge: scene markers,
 * tour advance by real double-press / dwell, input forwarding and the fake invoke flow.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBridge } from '../debug/__fixtures__/fake-bridge.js';
import { gestureEvent } from '../debug/bridge-tap.js';
import { createDebugLog } from '../debug/debug-log.js';
import { startHud } from '../hud/index.js';
import { type DemoEnvironment, layoutOf, startDemo } from './demo-app.js';

let info: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.useFakeTimers();
  info = vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const markers = (): string[] => info.mock.calls.map((c: unknown[]) => String(c[0]));

function env(request: string, overrides: Partial<DemoEnvironment> = {}) {
  const fake = fakeBridge();
  const root = document.createElement('main');
  const log = createDebugLog();
  const e: DemoEnvironment = {
    root,
    request,
    dwellMs: null,
    log,
    deviceLanguage: () => 'it-IT',
    getBridge: async () => fake.bridge,
    startHud,
    timers: { now: () => Date.now(), setTimeout: (fn, ms) => setTimeout(fn, ms) },
    ...overrides,
  };
  return { fake, root, log, e };
}

describe('layoutOf', () => {
  it('derives the layout from the containers on the glasses', () => {
    expect(layoutOf({ 'evf-bg': ' ' })).toBe('full');
    expect(layoutOf({ 'evf-bg': ' ', 'ctx-body': 'x' })).toBe('sheet');
  });
});

// Full demo scenes run the real pixel renderer end-to-end: ~1 s each normally, but v8
// coverage instrumentation (CI gate `test:coverage`) pushed them past Vitest's 5 s default
// on slower runners — a timing flake, not a hang (reproduced on develop, 2026-09-25).
describe('startDemo', { timeout: 20_000 }, () => {
  it('plays a single scenario, emits the scene marker then EVF_READY', async () => {
    const { fake, root, e } = env('actions');
    const demo = await startDemo(e);
    await vi.advanceTimersByTimeAsync(2000);
    await demo.settled;
    expect(markers()).toEqual(['EVF_SCENE 1/1 actions sheet', 'EVF_READY']);
    expect(fake.of('create')).toHaveLength(1);
    // The scripted tap reached the real HUD: zone E shows the actions list.
    expect(demo.tap?.mirror()['ctx-head']).toMatch(/Actions|Azioni/);
    expect(root.querySelector('[data-view="connection"]')).not.toBeNull();
    // Single scenario: a real double-press goes to the HUD (actions → root), no advance.
    fake.emit(gestureEvent('double'));
    await vi.advanceTimersByTimeAsync(2000);
    expect(demo.current()).toBe('actions');
    expect(demo.tap?.mirror()['ctx-head']).not.toMatch(/Actions|Azioni/);
    demo.stop();
    expect(root.childElementCount).toBe(0);
    expect(fake.listenerCount()).toBe(0);
  });

  it('tour: a real double-press advances and restarts the HUD with a rebuild', async () => {
    const { fake, e } = env('tour');
    const demo = await startDemo(e);
    await vi.advanceTimersByTimeAsync(2000);
    expect(markers()).toEqual(['EVF_SCENE 1/12 explore sheet', 'EVF_READY']);
    fake.emit(gestureEvent('double'));
    await vi.advanceTimersByTimeAsync(2000);
    expect(demo.current()).toBe('combat-my-turn');
    expect(markers()[2]).toBe('EVF_SCENE 2/12 combat-my-turn sheet');
    expect(fake.of('create')).toHaveLength(1);
    expect(fake.of('rebuild').length).toBeGreaterThanOrEqual(1);
    expect(fake.of('shutdown')).toHaveLength(0);
    demo.stop();
  });

  it('tour: result scene runs the fake invoke end-to-end; unpaired is full-screen', async () => {
    const { e, log } = env('tour');
    const demo = await startDemo(e);
    await vi.advanceTimersByTimeAsync(2000);
    for (let i = 0; i < 5; i++) {
      void demo.next();
      await vi.advanceTimersByTimeAsync(2000);
    }
    expect(demo.current()).toBe('result');
    expect(log.entries().some((x) => x.message === 'invoke weapon-attack')).toBe(true);
    expect(demo.store.get().lastResult?.toolId).toBe('weapon-attack');
    expect(demo.tap?.mirror()['ctx-head']).toMatch(/Result|Esito/);
    for (let i = 0; i < 4; i++) {
      void demo.next();
      await vi.advanceTimersByTimeAsync(2000);
    }
    expect(markers()).toContain('EVF_SCENE 10/12 unpaired full');
    demo.stop();
  });

  it('tour: offline freezes the scene after a first live render; dwell auto-advances', async () => {
    const { e } = env('offline', { dwellMs: 3000 });
    const demo = await startDemo(e);
    await vi.advanceTimersByTimeAsync(4000);
    expect(demo.store.get().connection.status).toBe('offline');
    expect(markers()).toEqual(['EVF_SCENE 1/1 offline sheet', 'EVF_READY']);
    demo.stop();

    info.mockClear();
    const tour = env('tour', { dwellMs: 3000 });
    const t = await startDemo(tour.e);
    await vi.advanceTimersByTimeAsync(2000 + 3000 + 2000);
    expect(t.current()).toBe('combat-my-turn');
    t.stop();
  });

  it('warns on unknown scenarios and plays the tour', async () => {
    const { e, log } = env('bogus');
    const demo = await startDemo(e);
    expect(log.entries()[0]).toMatchObject({ level: 'warn', source: 'demo' });
    expect(demo.current()).toBe('explore');
    demo.stop();
  });

  it('without a bridge mounts the phone page only', async () => {
    const { e, root, log } = env('spells', { getBridge: async () => null });
    const demo = await startDemo(e);
    await demo.settled;
    await demo.next();
    expect(demo.tap).toBeNull();
    expect(demo.current()).toBe('spells');
    expect(root.querySelector('section')).not.toBeNull();
    expect(log.tail(1)[0]?.message).toMatch(/phone page only/);
    demo.stop();
    expect(root.childElementCount).toBe(0);
  });

  it('logs a failed page placement but still reports the scene', async () => {
    const { fake, e, log } = env('explore');
    fake.results.create = 1;
    const demo = await startDemo(e);
    await vi.advanceTimersByTimeAsync(6000);
    expect(log.entries().some((x) => /page placement failed/.test(x.message))).toBe(true);
    expect(markers()[0]).toMatch(/^EVF_SCENE 1\/1 explore/);
    demo.stop();
  });
});
