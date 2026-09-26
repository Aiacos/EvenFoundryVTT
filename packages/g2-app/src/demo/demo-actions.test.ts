import { ActionResultPayloadSchema } from '@evf/shared-protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDebugLog } from '../debug/debug-log.js';
import { createAppStore, initialState } from '../state/app-store.js';
import { createDemoTransport, DEMO_TIMING, demoResult } from './demo-actions.js';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

function setup() {
  const store = createAppStore({
    ...initialState(),
    connection: { status: 'online', server: 'demo', lastSyncAt: 0 },
  });
  const log = createDebugLog();
  const transport = createDemoTransport({
    store,
    log,
    timers: { now: () => Date.now(), setTimeout: (fn, ms) => setTimeout(fn, ms) },
    deviceLanguage: () => 'it-IT',
  });
  return { store, log, transport };
}

describe('demoResult', () => {
  it('builds schema-valid, deterministic results for protocol tools only', () => {
    const a = demoResult('weapon-attack', 1);
    expect(ActionResultPayloadSchema.parse(a)).toEqual(a);
    expect(demoResult('weapon-attack', 1)).toEqual(a);
    expect(demoResult('cast-spell', 12)?.idempotencyKey).toBe(
      '00000000-0000-4000-8000-000000000012',
    );
    for (const tool of ['weapon-attack', 'cast-spell', 'use-item', 'move-token']) {
      const r = demoResult(tool, 2);
      expect(ActionResultPayloadSchema.safeParse(r).success).toBe(true);
      expect(r?.damage === undefined).toBe(r?.outcome === 'miss');
    }
    expect(demoResult('opportunity-attack', 1)).toBeNull();
    expect(a?.outcome).toBe('hit');
  });
});

describe('createDemoTransport', () => {
  it('acknowledges invoke, then publishes lastResult; logs the call', async () => {
    const { store, log, transport } = setup();
    let ack: unknown = null;
    void transport.invoke('weapon-attack', { actor_id: 'a' }).then((r) => {
      ack = r;
    });
    await vi.advanceTimersByTimeAsync(DEMO_TIMING.ack);
    expect(ack).toEqual({ ok: true, data: { demo: true } });
    expect(store.get().lastResult).toBeNull();
    await vi.advanceTimersByTimeAsync(DEMO_TIMING.result);
    expect(store.get().lastResult?.toolId).toBe('weapon-attack');
    expect(store.get().actionEconomy).toBeNull();
    store.update({
      actionEconomy: {
        actorId: 'a',
        actionsUsed: 0,
        bonusActionsUsed: 0,
        reactionsUsed: 0,
        multiAttackInProgress: false,
        recipientUserId: 'u',
      },
    });
    void transport.invoke('weapon-attack', {});
    await vi.advanceTimersByTimeAsync(DEMO_TIMING.ack + DEMO_TIMING.result);
    expect(store.get().actionEconomy?.actionsUsed).toBe(1);
    expect(log.entries()[0]).toMatchObject({ source: 'demo', message: 'invoke weapon-attack' });
  });

  it('acknowledges non-protocol tools without a result card', async () => {
    const { store, transport } = setup();
    const done = transport.invoke('cast-shield', {});
    await vi.advanceTimersByTimeAsync(DEMO_TIMING.ack + DEMO_TIMING.result);
    await expect(done).resolves.toMatchObject({ ok: true });
    expect(store.get().lastResult).toBeNull();
  });

  it('walks reconnect / disconnect / forget / manual pairing', async () => {
    const { store, transport } = setup();
    transport.reconnect();
    expect(store.get().connection.status).toBe('connecting');
    await vi.advanceTimersByTimeAsync(DEMO_TIMING.reconnect);
    expect(store.get().connection).toMatchObject({ status: 'online', server: 'demo' });
    transport.disconnect();
    expect(store.get().connection.status).toBe('offline');
    await transport.forget();
    expect(store.get().connection).toEqual({ status: 'unpaired' });
    await transport.pairScanned('https://aiacos.github.io/EvenFoundryVTT/app/#evf=x');
    await transport.pairCode('ABCD-EFGH-IJKL-MNOP');
    expect(store.get().connection.status).toBe('connecting');
    await vi.advanceTimersByTimeAsync(DEMO_TIMING.reconnect);
    expect(store.get().connection.status).toBe('online');
  });

  it('applies settings, resolves the locale and serves static session info', () => {
    const { store, log, transport } = setup();
    expect(transport.locale()).toBe('it');
    transport.updateSettings({ locale: 'en', mapCellPx: 12 });
    expect(store.get().settings).toMatchObject({ locale: 'en', mapCellPx: 12 });
    expect(transport.locale()).toBe('en');
    transport.refresh('map');
    expect(log.tail(1)[0]?.message).toBe('refresh map');
    expect(transport.info()).toEqual({
      latencyMs: 42,
      moduleVersion: 'demo',
      diagnostics: [],
    });
    const off = transport.subscribeInfo(() => {});
    expect(off()).toBeUndefined();
  });
});
