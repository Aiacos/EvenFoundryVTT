/**
 * Unit tests for attachReactionPromptHandler — RPD-* (Plan 13-02, Task 2).
 *
 * Tests cover:
 * - RPD-01: malformed JSON → console.warn + no mount
 * - RPD-02: valid envelope but wrong type → silent return + no mount
 * - RPD-03: correct type but invalid inner payload → console.warn + no mount
 * - RPD-DEBOUNCE-01: single envelope → panel mounts after 500ms (debounce fires)
 * - RPD-DEBOUNCE-02: second envelope within 500ms replaces first (timer reset)
 * - RPD-DEBOUNCE-03: envelope after 600ms+ schedules a new mount
 * - RPD-CONCURRENT-01: new envelope while panel is mounted → silently dropped (no new mount)
 * - RPD-TIMEOUT-01: 5s auto-timeout fires destroy bundle on mounted panel
 * - RPD-CLEANUP-01: unsubscribe removes WS listener, clears timers, destroys any panel
 * - RPD-NO-ACTOR-01: getPlayerActorId returns null → no mount
 *
 * All timer tests use vi.useFakeTimers() for determinism.
 *
 * @see packages/g2-app/src/panels/reaction-prompt-dispatcher.ts
 * @see .planning/phases/13-v2-stretch/13-02-PLAN.md Task 2
 */

import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';
import { R1_REACTION_AVAILABLE_TYPE } from '@evf/shared-protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LayerManager } from '../engine/layer-manager.js';
import type { PanelGestureBus } from '../engine/panel-gesture-bus.js';
import { attachReactionPromptHandler } from './reaction-prompt-dispatcher.js';

// ─── Mock helpers ─────────────────────────────────────────────────────────────

function makeWs() {
  const handlers: Map<string, ((ev: { data: unknown }) => void)[]> = new Map();
  return {
    addEventListener: vi.fn((event: string, handler: (ev: { data: unknown }) => void) => {
      if (!handlers.has(event)) handlers.set(event, []);
      handlers.get(event)!.push(handler);
    }),
    removeEventListener: vi.fn((event: string, handler: (ev: { data: unknown }) => void) => {
      const hs = handlers.get(event) ?? [];
      const idx = hs.indexOf(handler);
      if (idx !== -1) hs.splice(idx, 1);
    }),
    send: vi.fn(),
    /** Test helper: fire a message event. */
    fire(data: unknown) {
      const hs = handlers.get('message') ?? [];
      for (const h of hs) {
        h({ data: typeof data === 'string' ? data : JSON.stringify(data) });
      }
    },
    /** Count listeners for 'message'. */
    messageListenerCount() {
      return (handlers.get('message') ?? []).length;
    },
  };
}

function makeLayerManager() {
  const mock = {
    bundle: vi.fn().mockResolvedValue(undefined),
  };
  return mock as unknown as LayerManager & { bundle: ReturnType<typeof vi.fn> };
}

function makeBridge() {
  const mock = {
    textContainerUpgrade: vi.fn().mockResolvedValue(true),
  };
  return mock as unknown as EvenAppBridge;
}

function makeGestureBus() {
  const mock = {
    subscribe: vi.fn(() => vi.fn()),
    publish: vi.fn(),
  };
  return mock as unknown as PanelGestureBus;
}

const VALID_UUID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

type ValidPayload = {
  kind: 'shield' | 'counterspell' | 'opportunity-attack';
  sourceName: string;
  expiresAt: number;
};

function makeValidEnvelope(
  payload: ValidPayload = {
    kind: 'shield',
    sourceName: 'Goblin',
    expiresAt: Date.now() + 10000,
  },
) {
  return JSON.stringify({
    proto: 'evf-v1',
    seq: 1,
    ts: Date.now(),
    type: R1_REACTION_AVAILABLE_TYPE,
    session_id: VALID_UUID,
    payload,
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('attachReactionPromptHandler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ── Envelope rejection paths ────────────────────────────────────────────────

  it('RPD-01: malformed JSON logs console.warn and does not mount', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ws = makeWs();
    const layerManager = makeLayerManager();
    const bridge = makeBridge();
    const gestureBus = makeGestureBus();

    attachReactionPromptHandler({
      ws,
      layerManager,
      bridge,
      gestureBus,
      locale: 'it',
      sessionId: 'sess-1',
      getPlayerActorId: () => 'actor-1',
      getPlayerWeaponId: () => null,
    });

    ws.fire('not-json!!!');
    await vi.runAllTimersAsync();
    expect(warnSpy).toHaveBeenCalled();
    expect(layerManager.bundle).not.toHaveBeenCalled();
  });

  it('RPD-02: valid envelope with wrong type → silent return, no mount', async () => {
    const ws = makeWs();
    const layerManager = makeLayerManager();

    attachReactionPromptHandler({
      ws,
      layerManager,
      bridge: makeBridge(),
      gestureBus: makeGestureBus(),
      locale: 'it',
      sessionId: 'sess-1',
      getPlayerActorId: () => 'actor-1',
      getPlayerWeaponId: () => null,
    });

    ws.fire(
      JSON.stringify({
        proto: 'evf-v1',
        seq: 1,
        ts: Date.now(),
        type: 'some.other.type',
        session_id: VALID_UUID,
        payload: { kind: 'shield', sourceName: 'X', expiresAt: 0 },
      }),
    );
    await vi.runAllTimersAsync();
    expect(layerManager.bundle).not.toHaveBeenCalled();
  });

  it('RPD-03: correct type but invalid inner payload → console.warn, no mount', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ws = makeWs();
    const layerManager = makeLayerManager();

    attachReactionPromptHandler({
      ws,
      layerManager,
      bridge: makeBridge(),
      gestureBus: makeGestureBus(),
      locale: 'it',
      sessionId: 'sess-1',
      getPlayerActorId: () => 'actor-1',
      getPlayerWeaponId: () => null,
    });

    ws.fire(
      JSON.stringify({
        proto: 'evf-v1',
        seq: 1,
        ts: Date.now(),
        type: R1_REACTION_AVAILABLE_TYPE,
        session_id: VALID_UUID,
        payload: { kind: 'invalid-kind', sourceName: '', expiresAt: 'not-a-number' },
      }),
    );
    await vi.runAllTimersAsync();
    expect(warnSpy).toHaveBeenCalled();
    expect(layerManager.bundle).not.toHaveBeenCalled();
  });

  // ── Debounce tests ──────────────────────────────────────────────────────────

  it('RPD-DEBOUNCE-01: single envelope mounts panel after 500ms', async () => {
    const ws = makeWs();
    const layerManager = makeLayerManager();

    attachReactionPromptHandler({
      ws,
      layerManager,
      bridge: makeBridge(),
      gestureBus: makeGestureBus(),
      locale: 'it',
      sessionId: 'sess-1',
      getPlayerActorId: () => 'actor-1',
      getPlayerWeaponId: () => 'item-sword',
    });

    ws.fire(makeValidEnvelope());

    // Before 500ms: not yet mounted
    vi.advanceTimersByTime(499);
    expect(layerManager.bundle).not.toHaveBeenCalled();

    // After 500ms: should mount
    vi.advanceTimersByTime(1);
    await Promise.resolve();
    expect(layerManager.bundle).toHaveBeenCalledTimes(1);
    const bundleCall = layerManager.bundle.mock.calls[0];
    expect(bundleCall).toBeDefined();
    const arg = bundleCall![0] as Array<{ type: string; z: number }>;
    expect(arg[0]?.type).toBe('mount');
  });

  it('RPD-DEBOUNCE-02: second envelope within 500ms replaces first (timer reset)', async () => {
    const ws = makeWs();
    const layerManager = makeLayerManager();

    attachReactionPromptHandler({
      ws,
      layerManager,
      bridge: makeBridge(),
      gestureBus: makeGestureBus(),
      locale: 'it',
      sessionId: 'sess-1',
      getPlayerActorId: () => 'actor-1',
      getPlayerWeaponId: () => null,
    });

    // First envelope at t=0
    ws.fire(makeValidEnvelope({ kind: 'shield', sourceName: 'Goblin 1', expiresAt: 0 }));
    // At t=300ms, fire a second envelope (within debounce window)
    vi.advanceTimersByTime(300);
    ws.fire(makeValidEnvelope({ kind: 'counterspell', sourceName: 'Enemy Mage', expiresAt: 0 }));

    // At t=600ms (300 + 300): first timer was cancelled, so no mount yet
    vi.advanceTimersByTime(300);
    expect(layerManager.bundle).not.toHaveBeenCalled();

    // At t=800ms (300 + 500): second timer fires
    vi.advanceTimersByTime(200);
    await Promise.resolve();
    expect(layerManager.bundle).toHaveBeenCalledTimes(1);
  });

  it('RPD-DEBOUNCE-03: envelope after 600ms+ schedules a new mount', async () => {
    const ws = makeWs();
    const layerManager = makeLayerManager();

    attachReactionPromptHandler({
      ws,
      layerManager,
      bridge: makeBridge(),
      gestureBus: makeGestureBus(),
      locale: 'it',
      sessionId: 'sess-1',
      getPlayerActorId: () => 'actor-1',
      getPlayerWeaponId: () => null,
    });

    // First envelope → fires after 500ms
    ws.fire(makeValidEnvelope());
    vi.advanceTimersByTime(500);
    await Promise.resolve();
    // Panel is now mounted. Let it time out after 5s — the 5s auto-timeout fires destroy.
    // After that, a new envelope should schedule a fresh mount.
    vi.advanceTimersByTime(5000);
    await Promise.resolve();
    // Now the panel is gone (timeout destroyed it); a new envelope should schedule fresh mount
    layerManager.bundle.mockClear();
    ws.fire(makeValidEnvelope({ kind: 'shield', sourceName: 'New Goblin', expiresAt: 0 }));
    vi.advanceTimersByTime(500);
    await Promise.resolve();
    expect(layerManager.bundle).toHaveBeenCalledTimes(1);
    const call = layerManager.bundle.mock.calls[0]![0] as Array<{ type: string }>;
    // After timeout destroyed, the destroy bundle was the most recent, and the new envelope triggers a new mount
    // (destroy happens at t=5500ms, new mount at t=6000ms)
    expect(call[0]?.type).toBe('mount');
  });

  // ── Concurrent envelope drop ───────────────────────────────────────────────

  it('RPD-CONCURRENT-01: new envelope while panel is mounted is silently dropped', async () => {
    const ws = makeWs();
    const layerManager = makeLayerManager();

    attachReactionPromptHandler({
      ws,
      layerManager,
      bridge: makeBridge(),
      gestureBus: makeGestureBus(),
      locale: 'it',
      sessionId: 'sess-1',
      getPlayerActorId: () => 'actor-1',
      getPlayerWeaponId: () => null,
    });

    // Mount first panel
    ws.fire(makeValidEnvelope());
    vi.advanceTimersByTime(500);
    await Promise.resolve();
    expect(layerManager.bundle).toHaveBeenCalledTimes(1);

    layerManager.bundle.mockClear();

    // Second envelope while panel is mounted → dropped
    ws.fire(makeValidEnvelope({ kind: 'counterspell', sourceName: 'Mage', expiresAt: 0 }));
    vi.advanceTimersByTime(500);
    await Promise.resolve();
    expect(layerManager.bundle).not.toHaveBeenCalled();
  });

  // ── Auto-timeout ───────────────────────────────────────────────────────────

  it('RPD-TIMEOUT-01: 5s auto-timeout fires destroy bundle on mounted panel', async () => {
    const ws = makeWs();
    const layerManager = makeLayerManager();

    attachReactionPromptHandler({
      ws,
      layerManager,
      bridge: makeBridge(),
      gestureBus: makeGestureBus(),
      locale: 'it',
      sessionId: 'sess-1',
      getPlayerActorId: () => 'actor-1',
      getPlayerWeaponId: () => null,
    });

    ws.fire(makeValidEnvelope());
    vi.advanceTimersByTime(500);
    await Promise.resolve();
    expect(layerManager.bundle).toHaveBeenCalledTimes(1);

    layerManager.bundle.mockClear();

    // Advance 5 more seconds → timeout fires destroy
    vi.advanceTimersByTime(5000);
    await Promise.resolve();
    expect(layerManager.bundle).toHaveBeenCalledTimes(1);
    const arg = layerManager.bundle.mock.calls[0]![0] as Array<{ type: string }>;
    expect(arg[0]?.type).toBe('destroy');
  });

  // ── Cleanup ────────────────────────────────────────────────────────────────

  it('RPD-CLEANUP-01: unsubscribe removes WS listener and clears pending timers', async () => {
    const ws = makeWs();
    const layerManager = makeLayerManager();

    const unsub = attachReactionPromptHandler({
      ws,
      layerManager,
      bridge: makeBridge(),
      gestureBus: makeGestureBus(),
      locale: 'it',
      sessionId: 'sess-1',
      getPlayerActorId: () => 'actor-1',
      getPlayerWeaponId: () => null,
    });

    // Fire an envelope (debounce timer pending)
    ws.fire(makeValidEnvelope());
    expect(ws.messageListenerCount()).toBe(1);

    // Unsubscribe: removes listener, clears timer
    unsub();
    expect(ws.messageListenerCount()).toBe(0);

    // Advance past debounce — no mount should happen
    vi.advanceTimersByTime(1000);
    await Promise.resolve();
    expect(layerManager.bundle).not.toHaveBeenCalled();
  });

  // ── No actor ───────────────────────────────────────────────────────────────

  it('RPD-NO-ACTOR-01: null playerActorId → panel not mounted', async () => {
    const ws = makeWs();
    const layerManager = makeLayerManager();

    attachReactionPromptHandler({
      ws,
      layerManager,
      bridge: makeBridge(),
      gestureBus: makeGestureBus(),
      locale: 'it',
      sessionId: 'sess-1',
      getPlayerActorId: () => null,
      getPlayerWeaponId: () => null,
    });

    ws.fire(makeValidEnvelope());
    vi.advanceTimersByTime(500);
    await Promise.resolve();

    // No mount bundle should be called (null actor guard)
    expect(layerManager.bundle).not.toHaveBeenCalled();
  });
});
