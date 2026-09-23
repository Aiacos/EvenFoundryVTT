/**
 * startHud integration with a recording fake bridge: page lifecycle (create once,
 * rebuild only on mode/locale change), flicker-free diff updates, gestures, map
 * pacing + glyph fallback, invoke round-trip, reaction clearing, dispose.
 */
import type { EvenAppBridge, EvenHubEvent } from '@evenrealities/even_hub_sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type AppActions,
  type AppState,
  type AppStore,
  createAppStore,
  initialState,
} from '../../state/app-store.js';
import { BRIDGE_CALL_TIMEOUT_MS, createBridgeQueue } from '../bridge-queue.js';
import { startHud, TICK_MS } from '../index.js';
import { menuIdOf } from '../input/state-machine.js';
import { online } from './fixtures.js';

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
const tap = { sysEvent: {} } as EvenHubEvent;
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

  it('creates the start-up page once (M09), then rebuilds into the thirds layout when online', async () => {
    store = createAppStore(initialState());
    dispose = startHud(fb.bridge, store, actions);
    await flush();
    expect(fb.of('create')).toHaveLength(1);
    expect(fb.names(fb.of('create')[0])).toEqual(['evf-bg', 'full']);
    store.update(itState());
    await flush();
    expect(fb.of('create')).toHaveLength(1);
    expect(fb.of('rebuild')).toHaveLength(1);
    expect(fb.names(fb.of('rebuild')[0])).toEqual([
      'evf-bg',
      'a-head',
      'a-body',
      'c-head',
      'c-body',
      'c-foot',
    ]);
  });

  it('pushes only changed regions with textContainerUpgrade', async () => {
    store = createAppStore(itState());
    dispose = startHud(fb.bridge, store, actions);
    await flush();
    const before = fb.texts().length;
    store.update({
      log: {
        events: [{ id: 'e', timestamp: 1, actorName: 'Mira', kind: 'chat', description: 'ciao' }],
      },
    });
    await flush();
    const changed = fb.texts().slice(before);
    expect(changed.map((t) => t.containerName)).toEqual(['c-body']);
    expect(changed[0]?.content).toContain('Mira: ciao');
    await vi.advanceTimersByTimeAsync(TICK_MS * 3);
    expect(fb.texts().length).toBe(before + 1);
  });

  it('double-tap at root opens the system exit dialog; tap opens actions', async () => {
    store = createAppStore(itState());
    dispose = startHud(fb.bridge, store, actions);
    await flush();
    fb.emit(tap);
    await flush();
    expect(
      fb.texts().some((t) => t.containerName === 'c-head' && t.content.startsWith('AZIONI')),
    ).toBe(true);
    fb.emit(down);
    await flush();
    const body =
      fb
        .texts()
        .filter((t) => t.containerName === 'c-body')
        .at(-1)?.content ?? '';
    expect(body.split('\n')[1]).toMatch(/^▶/);
    fb.emit(dbl); // back to root
    fb.emit(dbl); // exit dialog
    await flush();
    expect(fb.of('shutdown').map((c) => c.arg)).toEqual([1]);
  });

  it('invokes tools via AppActions and shows the outcome (ok and failure)', async () => {
    store = createAppStore(itState({ map: null }));
    dispose = startHud(fb.bridge, store, actions);
    await flush();
    fb.emit(tap); // actions
    fb.emit(tap); // weapon → target
    fb.emit(tap); // no target → invoke
    await flush();
    expect(actions.invoke).toHaveBeenCalledWith(
      'weapon-attack',
      expect.objectContaining({ item_id: 'w1', targets: [] }),
    );
    expect(fb.texts().at(-1)?.content).toBe('eseguito');
    actions.invoke.mockResolvedValueOnce({ ok: false, error: { code: 'x', message: 'rifiutato' } });
    fb.emit(tap); // result → actions
    fb.emit(tap);
    fb.emit(tap);
    await flush();
    expect(fb.texts().at(-1)?.content).toBe('non riuscito\nrifiutato');
    actions.invoke.mockRejectedValueOnce(new Error('socket'));
    fb.emit(tap);
    fb.emit(tap);
    fb.emit(tap);
    await flush();
    expect(fb.texts().at(-1)?.content).toBe('non riuscito\nsocket');
    actions.invoke.mockRejectedValueOnce('raw');
    fb.emit(tap);
    fb.emit(tap);
    fb.emit(tap);
    await flush();
    expect(fb.texts().at(-1)?.content).toBe('non riuscito\nraw');
  });

  it('routes settings and reconnect effects to AppActions; clears handled reactions', async () => {
    store = createAppStore(itState());
    dispose = startHud(fb.bridge, store, actions);
    await flush();
    fb.emit({ menuItemClickEvent: { itemID: 2 } } as EvenHubEvent);
    expect(actions.updateSettings).toHaveBeenCalledWith({ mapCellPx: 12 });
    fb.emit({ menuItemClickEvent: { itemID: menuIdOf('reconnect') } } as EvenHubEvent);
    expect(actions.reconnect).toHaveBeenCalledTimes(1);
    store.update({ reaction: { kind: 'shield', sourceName: 'Orco', expiresAt: 60_000 } });
    await flush();
    expect(
      fb.texts().some((t) => t.containerName === 'c-head' && t.content.includes('REAZIONE')),
    ).toBe(true);
    fb.emit(dbl);
    expect(store.get().reaction).toBeNull();
  });

  it('streams map tiles paced and falls back to glyphs after repeated failures', async () => {
    store = createAppStore(itState());
    dispose = startHud(fb.bridge, store, actions);
    await vi.advanceTimersByTimeAsync(300);
    expect(fb.of('image').map((c) => (c.arg as { containerID: number }).containerID)).toEqual([
      7, 8,
    ]);
    fb.results.image = 'sendFailed';
    fb.emit({ sysEvent: { eventType: 4 } } as EvenHubEvent); // foreground → resend (fails, retried once)
    await vi.advanceTimersByTimeAsync(2600);
    const glyph = fb.of('rebuild').at(-1);
    expect(fb.names(glyph)).toContain('map-glyph');
    fb.results.image = 'success';
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fb.names(fb.of('rebuild').at(-1))).not.toContain('map-glyph');
  });

  it('rebuilds when the language changes and dims the sheet offline', async () => {
    store = createAppStore(itState());
    dispose = startHud(fb.bridge, store, actions);
    await flush();
    store.update({ settings: { ...store.get().settings, locale: 'en' } });
    await flush();
    expect(fb.of('rebuild')).toHaveLength(1);
    store.update({ connection: { status: 'offline' } });
    await flush();
    expect(fb.texts().find((t) => t.containerName === 'a-body')?.textColor).toBe(2);
  });

  it('retries a rejected start-up page and a failed text upgrade', async () => {
    fb.results.create = 1;
    store = createAppStore(itState());
    dispose = startHud(fb.bridge, store, actions);
    await flush();
    fb.results.create = new Error('ble');
    await vi.advanceTimersByTimeAsync(TICK_MS);
    fb.results.create = 0;
    await vi.advanceTimersByTimeAsync(TICK_MS);
    expect(fb.of('create')).toHaveLength(3);
    fb.results.text = false;
    fb.emit(tap);
    await flush();
    const failed = fb.texts().length;
    fb.results.text = new Error('ble');
    await vi.advanceTimersByTimeAsync(TICK_MS);
    fb.results.text = true;
    await vi.advanceTimersByTimeAsync(TICK_MS);
    expect(fb.texts().length).toBeGreaterThan(failed + 1);
    fb.results.rebuild = false;
    store.update({ settings: { ...store.get().settings, locale: 'en' } });
    await flush();
    expect(console.warn).toHaveBeenCalled();
    fb.results.rebuild = new Error('x');
    fb.results.image = new Error('x');
    fb.emit({ sysEvent: { eventType: 5 } } as EvenHubEvent);
    await vi.advanceTimersByTimeAsync(TICK_MS);
  });

  it('logs a failed exit call and stops everything on dispose', async () => {
    store = createAppStore(itState());
    dispose = startHud(fb.bridge, store, actions);
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
