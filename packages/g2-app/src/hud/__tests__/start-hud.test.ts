/**
 * startHud integration with a recording fake bridge: page lifecycle (create once,
 * rebuild only on mode/locale change), flicker-free text diffs, paced image zones
 * (priority, hash skip, retry), gestures, invoke round-trip, reaction / roll-request
 * clearing, offline dimming, dispose.
 */
import type { EvenAppBridge, EvenHubEvent } from '@evenrealities/even_hub_sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { character, online } from '../../demo/fixtures.js';
import { demoDecoder } from '../../demo/portrait-art.js';
import {
  type AppActions,
  type AppState,
  type AppStore,
  createAppStore,
  initialState,
} from '../../state/app-store.js';
import { BRIDGE_CALL_TIMEOUT_MS, createBridgeQueue } from '../bridge-queue.js';
import { PLACE_RETRY_MS, startHud, TICK_MS } from '../index.js';
import { menuIdOf } from '../input/state-machine.js';

interface Call {
  method: string;
  arg: unknown;
}

function fakeBridge() {
  const calls: Call[] = [];
  let listener: ((e: EvenHubEvent) => void) | null = null;
  const results = {
    create: 0 as unknown,
    rebuild: true as unknown,
    text: true as unknown,
    image: 'success' as unknown,
  };
  const rec =
    (method: string, key?: keyof typeof results) =>
    async (arg: unknown): Promise<unknown> => {
      calls.push({ method, arg });
      const r = key ? results[key] : true;
      if (r instanceof Error) throw r;
      return r;
    };
  const bridge = {
    createStartUpPageContainer: rec('create', 'create'),
    rebuildPageContainer: rec('rebuild', 'rebuild'),
    textContainerUpgrade: rec('text', 'text'),
    updateImageRawData: rec('image', 'image'),
    shutDownPageContainer: rec('shutdown'),
    onEvenHubEvent: (cb: (e: EvenHubEvent) => void) => {
      listener = cb;
      return () => {
        listener = null;
      };
    },
  };
  return {
    bridge: bridge as unknown as EvenAppBridge,
    calls,
    results,
    emit: (e: EvenHubEvent) => listener?.(e),
    hasListener: () => listener !== null,
    of: (m: string) => calls.filter((c) => c.method === m),
    names: (c: Call | undefined) =>
      ((c?.arg as { textObject?: Array<{ containerName?: string }> })?.textObject ?? []).map(
        (t) => t.containerName,
      ),
    texts: () =>
      calls
        .filter((c) => c.method === 'text')
        .map((c) => c.arg as { containerName: string; content: string; textColor: number }),
  };
}

function fakeActions(): AppActions & { invoke: ReturnType<typeof vi.fn> } {
  return {
    invoke: vi.fn(async () => ({ ok: true as const, data: null })),
    refresh: vi.fn(),
    reconnect: vi.fn(),
    updateSettings: vi.fn(),
  };
}

const flush = () => vi.advanceTimersByTimeAsync(0);
const tap = { sysEvent: { eventSource: 2 } } as EvenHubEvent;
const dbl = { sysEvent: { eventType: 3 } } as EvenHubEvent;
const down = { textEvent: { eventType: 2 } } as EvenHubEvent;

function itState(patch: Partial<AppState> = {}): AppState {
  const s = online('min', patch);
  return { ...s, settings: { ...s.settings, locale: 'it' } };
}

describe('startHud', () => {
  let fb: ReturnType<typeof fakeBridge>;
  let store: AppStore;
  let actions: ReturnType<typeof fakeActions>;
  let dispose: () => void;
  const options = { decoder: demoDecoder };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    fb = fakeBridge();
    actions = fakeActions();
  });
  afterEach(() => {
    dispose?.();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  const imageNames = () =>
    fb.of('image').map((c) => (c.arg as { containerName: string }).containerName);

  it('creates the start-up page once (S10 full screen), then rebuilds into the sheet layout', async () => {
    store = createAppStore(initialState());
    dispose = startHud(fb.bridge, store, actions, options);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fb.of('create')).toHaveLength(1);
    expect(fb.names(fb.of('create')[0])).toEqual(['evf-bg']);
    expect(imageNames()).toEqual(['img-tl', 'img-tr', 'img-bl', 'img-br']);
    store.update(itState());
    await flush();
    expect(fb.of('create')).toHaveLength(1);
    expect(fb.of('rebuild')).toHaveLength(1);
    expect(fb.names(fb.of('rebuild')[0])).toEqual(['evf-bg', 'ctx-head', 'ctx-body', 'ctx-foot']);
  });

  it('sends the three sheet tiles one at a time in priority order, ≥100 ms apart, per-tile hash skip', async () => {
    store = createAppStore(itState());
    dispose = startHud(fb.bridge, store, actions, options);
    await vi.advanceTimersByTimeAsync(1000);
    const first = imageNames();
    expect(first).toEqual(['img-tl', 'img-tr', 'img-bl']);
    expect(fb.of('image').map((c) => (c.arg as { containerID: number }).containerID)).toEqual([
      0, 1, 2,
    ]);
    const n = fb.of('image').length;
    await vi.advanceTimersByTimeAsync(TICK_MS * 3);
    expect(fb.of('image').length).toBe(n);
    // CA lives in tile tl only → one send.
    store.update({ character: { ...character(), ac: 19 } });
    await vi.advanceTimersByTimeAsync(500);
    expect(imageNames().slice(n)).toEqual(['img-tl']);
    // The PF box straddles the two top tiles → two sends.
    const m = fb.of('image').length;
    store.update({ character: { ...character(), ac: 19, hp: 20 } });
    await vi.advanceTimersByTimeAsync(500);
    expect(imageNames().slice(m)).toEqual(['img-tl', 'img-tr']);
  });

  it('holds map frames to ≤ 1 fps inside tile tr without delaying header changes', async () => {
    store = createAppStore(itState());
    dispose = startHud(fb.bridge, store, actions, options);
    await vi.advanceTimersByTimeAsync(1000);
    const map = store.get().map;
    if (!map) throw new Error('fixture has a map');
    const moved = (dx: number) => ({
      ...map,
      tokens: map.tokens.map((t, i) => (i === 0 ? { ...t, x: t.x + dx } : t)),
    });
    const n = fb.of('image').length;
    store.update({ map: moved(1) });
    await vi.advanceTimersByTimeAsync(150);
    store.update({ map: moved(2) });
    await vi.advanceTimersByTimeAsync(150);
    const early = imageNames().slice(n);
    expect(early.filter((x) => x === 'img-tr')).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1200);
    expect(
      imageNames()
        .slice(n)
        .filter((x) => x === 'img-tr'),
    ).toHaveLength(2);
  });

  it('pushes only changed text regions with textContainerUpgrade', async () => {
    store = createAppStore(itState());
    dispose = startHud(fb.bridge, store, actions, options);
    await flush();
    const before = fb.texts().length;
    store.update({
      log: {
        events: [{ id: 'e', timestamp: 1, actorName: 'Mira', kind: 'chat', description: 'ciao' }],
      },
    });
    await flush();
    const changed = fb.texts().slice(before);
    expect(changed.map((t) => t.containerName)).toEqual(['ctx-body']);
    expect(changed[0]?.content).toContain('Mira: ciao');
    await vi.advanceTimersByTimeAsync(TICK_MS * 3);
    expect(fb.texts().length).toBe(before + 1);
  });

  it('double-tap at root opens the system exit dialog; tap opens actions', async () => {
    store = createAppStore(itState());
    dispose = startHud(fb.bridge, store, actions, options);
    await flush();
    fb.emit(tap);
    await flush();
    expect(
      fb.texts().some((t) => t.containerName === 'ctx-head' && t.content.startsWith('Azioni')),
    ).toBe(true);
    fb.emit(down);
    await flush();
    const body =
      fb
        .texts()
        .filter((t) => t.containerName === 'ctx-body')
        .at(-1)?.content ?? '';
    expect(body.split('\n')[1]).toMatch(/^▶/);
    fb.emit(dbl); // back to root
    fb.emit(dbl); // exit dialog
    await flush();
    expect(fb.of('shutdown').map((c) => c.arg)).toEqual([1]);
  });

  it('invokes tools via AppActions and shows the outcome (ok and failure)', async () => {
    store = createAppStore(itState({ map: null }));
    dispose = startHud(fb.bridge, store, actions, options);
    await flush();
    const body = () =>
      fb
        .texts()
        .filter((t) => t.containerName === 'ctx-body')
        .at(-1)?.content;
    fb.emit(tap); // actions
    fb.emit(tap); // weapon → target
    fb.emit(tap); // no target → invoke
    await flush();
    expect(actions.invoke).toHaveBeenCalledWith(
      'weapon-attack',
      expect.objectContaining({ item_id: 'w1', targets: [] }),
    );
    expect(body()).toBe('eseguito');
    actions.invoke.mockResolvedValueOnce({ ok: false, error: { code: 'x', message: 'rifiutato' } });
    fb.emit(tap); // result → actions
    fb.emit(tap);
    fb.emit(tap);
    await flush();
    expect(body()).toBe('non riuscito\nrifiutato');
    actions.invoke.mockRejectedValueOnce(new Error('socket'));
    fb.emit(tap);
    fb.emit(tap);
    fb.emit(tap);
    await flush();
    expect(body()).toBe('non riuscito\nsocket');
    actions.invoke.mockRejectedValueOnce('raw');
    fb.emit(tap);
    fb.emit(tap);
    fb.emit(tap);
    await flush();
    expect(body()).toBe('non riuscito\nraw');
  });

  it('routes settings and reconnect effects; clears handled reactions and roll requests', async () => {
    const mid = itState();
    store = createAppStore({ ...mid, settings: { ...mid.settings, mapCellPx: 8 } });
    dispose = startHud(fb.bridge, store, actions, options);
    await flush();
    fb.emit({ menuItemClickEvent: { itemID: 2 } } as EvenHubEvent);
    expect(actions.updateSettings).toHaveBeenCalledWith({ mapCellPx: 12 });
    fb.emit({ menuItemClickEvent: { itemID: menuIdOf('reconnect') } } as EvenHubEvent);
    expect(actions.reconnect).toHaveBeenCalledTimes(1);
    store.update({ reaction: { kind: 'shield', sourceName: 'Orco', expiresAt: 60_000 } });
    await flush();
    expect(
      fb.texts().some((t) => t.containerName === 'ctx-head' && t.content.includes('Reazione')),
    ).toBe(true);
    fb.emit(dbl);
    expect(store.get().reaction).toBeNull();
    store.update({ rollRequest: { messageId: 'm', kind: 'save', ability: 'wis', dc: 15 } });
    await flush();
    expect(
      fb
        .texts()
        .some((t) => t.containerName === 'ctx-head' && t.content.includes('Prova richiesta')),
    ).toBe(true);
    fb.emit(tap);
    expect(store.get().rollRequest).toBeNull();
  });

  it('retries a failed image send and re-sends every zone after returning to the foreground', async () => {
    store = createAppStore(itState());
    dispose = startHud(fb.bridge, store, actions, options);
    await vi.advanceTimersByTimeAsync(1000);
    const n = fb.of('image').length;
    fb.results.image = 'sendFailed';
    fb.emit({ sysEvent: { eventType: 4 } } as EvenHubEvent); // foreground → resend
    await vi.advanceTimersByTimeAsync(1000);
    expect(fb.of('image').length).toBeGreaterThan(n);
    fb.results.image = 'success';
    await vi.advanceTimersByTimeAsync(5000);
    const last = imageNames().slice(-3).sort();
    expect(last).toEqual(['img-bl', 'img-tl', 'img-tr']);
    expect(console.warn).toHaveBeenCalledWith('[hud] image tl rejected: sendFailed');
  });

  it('rebuilds when the language changes and dims the zones offline', async () => {
    store = createAppStore(itState());
    dispose = startHud(fb.bridge, store, actions, options);
    await vi.advanceTimersByTimeAsync(1000);
    store.update({ settings: { ...store.get().settings, locale: 'en' } });
    await flush();
    expect(fb.of('rebuild')).toHaveLength(1);
    const n = fb.of('image').length;
    store.update({ connection: { status: 'offline', cause: 'network' } });
    await vi.advanceTimersByTimeAsync(1500);
    expect(imageNames().slice(n).sort()).toEqual(['img-bl', 'img-tl', 'img-tr']);
    expect(fb.texts().at(-3)?.content).toContain('Offline');
  });

  it('falls back to the full-screen 2×2 layout when the host rejects the sheet start-up page', async () => {
    const real = fb.bridge.createStartUpPageContainer.bind(fb.bridge);
    let calls = 0;
    // First call (sheet) → StartUpPageCreateResult.invalid, then success.
    (fb.bridge as { createStartUpPageContainer: unknown }).createStartUpPageContainer = async (
      arg: Parameters<typeof real>[0],
    ) => {
      const r = await real(arg);
      calls += 1;
      return calls === 1 ? 1 : r;
    };
    store = createAppStore(itState());
    dispose = startHud(fb.bridge, store, actions, options);
    await vi.advanceTimersByTimeAsync(1000);
    const creates = fb.of('create');
    expect(creates).toHaveLength(2);
    expect(fb.names(creates[0])).toEqual(['evf-bg', 'ctx-head', 'ctx-body', 'ctx-foot']);
    expect(fb.names(creates[1])).toEqual(['evf-bg']);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('createStartUpPageContainer rejected the sheet page'),
    );
    // The sheet is still drawn: three sheet tiles + zone E as pixels in tile br.
    expect(imageNames().sort()).toEqual(['img-bl', 'img-br', 'img-tl', 'img-tr']);
    const n = fb.of('image').length;
    fb.emit(tap); // actions list → context tile changes, no text container exists
    await vi.advanceTimersByTimeAsync(500);
    expect(imageNames().slice(n)).toContain('img-br');
    expect(fb.of('text')).toHaveLength(0);
    // The fallback is sticky: a later locale change rebuilds `full` again.
    store.update({ settings: { ...store.get().settings, locale: 'en' } });
    await flush();
    expect(fb.names(fb.of('rebuild')[0])).toEqual(['evf-bg']);
  });

  it('falls back when a rebuild into the sheet layout is rejected or fails', async () => {
    fb.results.rebuild = false;
    store = createAppStore(initialState());
    dispose = startHud(fb.bridge, store, actions, options);
    await flush();
    store.update(itState());
    await flush();
    fb.results.rebuild = true;
    await vi.advanceTimersByTimeAsync(1000);
    const rebuilds = fb.of('rebuild');
    expect(fb.names(rebuilds[0])).toEqual(['evf-bg', 'ctx-head', 'ctx-body', 'ctx-foot']);
    expect(fb.names(rebuilds[1])).toEqual(['evf-bg']);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('rebuildPageContainer rejected the sheet page (false)'),
    );
  });

  it('retries a rejected full-screen page after the backoff, and a failed text upgrade', async () => {
    fb.results.create = 1;
    store = createAppStore(initialState());
    dispose = startHud(fb.bridge, store, actions, options);
    await flush();
    fb.results.create = new Error('ble');
    await vi.advanceTimersByTimeAsync(TICK_MS);
    expect(fb.of('create')).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(PLACE_RETRY_MS);
    expect(fb.of('create')).toHaveLength(2);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('rejected the full page (Error: ble) — retrying'),
    );
    fb.results.create = 0;
    await vi.advanceTimersByTimeAsync(PLACE_RETRY_MS + TICK_MS);
    expect(fb.of('create')).toHaveLength(3);
    store.update(itState());
    await flush();
    fb.results.text = false;
    fb.emit(tap);
    await flush();
    const failed = fb.texts().length;
    fb.results.text = new Error('ble');
    await vi.advanceTimersByTimeAsync(TICK_MS);
    fb.results.text = true;
    await vi.advanceTimersByTimeAsync(TICK_MS);
    expect(fb.texts().length).toBeGreaterThan(failed + 1);
    fb.results.image = new Error('x');
    fb.emit({ sysEvent: { eventType: 5 } } as EvenHubEvent);
    await vi.advanceTimersByTimeAsync(TICK_MS);
  });

  it('survives a store that replays its state synchronously inside subscribe (TDZ, 0601238)', async () => {
    // Real iPhone WebView crash: a bus replaying cached state inside `subscribe` fired a
    // callback before a later `const` was initialised → ReferenceError, white page.
    const inner = createAppStore(itState());
    const replaying: AppStore = {
      ...inner,
      subscribe(listener) {
        listener(inner.get(), inner.get());
        return inner.subscribe(listener);
      },
    };
    store = replaying;
    expect(() => {
      dispose = startHud(fb.bridge, replaying, actions, options);
    }).not.toThrow();
    await vi.advanceTimersByTimeAsync(1000);
    expect(fb.of('create')).toHaveLength(1);
    expect(imageNames()).toEqual(['img-tl', 'img-tr', 'img-bl']);
  });

  it('relies on a store that never replays synchronously on subscribe', () => {
    const s = createAppStore(itState());
    const listener = vi.fn();
    s.subscribe(listener);
    expect(listener).not.toHaveBeenCalled();
  });

  it('logs a failed exit call and stops everything on dispose', async () => {
    store = createAppStore(itState());
    dispose = startHud(fb.bridge, store, actions, options);
    await flush();
    (
      fb.bridge as unknown as { shutDownPageContainer: () => Promise<boolean> }
    ).shutDownPageContainer = async () => {
      throw new Error('gone');
    };
    fb.emit(dbl);
    await flush();
    expect(console.warn).toHaveBeenCalledWith(
      '[hud] shutDownPageContainer failed',
      expect.any(Error),
    );
    dispose();
    expect(fb.hasListener()).toBe(false);
    const n = fb.calls.length;
    store.update({ log: null });
    await vi.advanceTimersByTimeAsync(TICK_MS * 5);
    expect(fb.calls.length).toBe(n);
  });

  it('falls back to the class emblem when no decoder is available', async () => {
    store = createAppStore(itState());
    dispose = startHud(fb.bridge, store, actions);
    await vi.advanceTimersByTimeAsync(1000);
    expect(imageNames()).toContain('img-tl');
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('[hud] image decode failed'),
      expect.any(Error),
    );
  });
});

describe('createBridgeQueue', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('runs calls one at a time and times out hung calls', async () => {
    const q = createBridgeQueue();
    const order: string[] = [];
    const hung = q.run(() => new Promise<never>(() => undefined));
    const next = q.run(async () => {
      order.push('next');
      return 1;
    });
    const hungResult = hung.catch((e: Error) => e.message);
    await vi.advanceTimersByTimeAsync(BRIDGE_CALL_TIMEOUT_MS);
    expect(await hungResult).toBe(`bridge call timed out after ${BRIDGE_CALL_TIMEOUT_MS} ms`);
    expect(await next).toBe(1);
    expect(order).toEqual(['next']);
    await expect(q.run(async () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
  });
});
