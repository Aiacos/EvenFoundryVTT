/**
 * Unit tests for StatusHudLayer (Phase 4a Plan 04 Task 2).
 *
 * Covers (per 04A-04-PLAN.md `<behavior>` SHL-1..SHL-7):
 *   - SHL-1: id === 'status-hud'
 *   - SHL-2: getCaptureContainer is UNDEFINED (read-only z=1)
 *   - SHL-3: valid character.delta → debounced textContainerUpgrade with grid.toString()
 *   - SHL-4: two deltas within debounce window → single coalesced upgrade
 *   - SHL-5: 30 s heartbeat re-renders the last-known snapshot
 *   - SHL-6: malformed payload (safeParse fails) → console.warn + no upgrade, no throw
 *   - SHL-7: destroy() clears debounce + heartbeat timers + calls unsubscribe
 *
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04A-04-PLAN.md Task 2
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04a-CONTEXT.md §Area 3
 */
import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';
import type { CharacterSnapshot } from '@evf/shared-protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type CharacterDeltaEvents,
  StatusHudLayer,
  type StatusHudLayerOpts,
} from '../status-hud-layer.js';
import { StatusHudRenderer } from '../status-hud-renderer.js';

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function makeMockBridge() {
  return {
    textContainerUpgrade: vi.fn().mockResolvedValue(true),
  } as unknown as EvenAppBridge & { textContainerUpgrade: ReturnType<typeof vi.fn> };
}

interface MockWsEvents {
  subscribe: CharacterDeltaEvents['subscribe'];
  unsubscribe: ReturnType<typeof vi.fn>;
  /** Capture the most-recent subscribed callback so tests can drive deltas. */
  emit(raw: unknown): void;
}

function makeMockWsEvents(): MockWsEvents {
  let stashed: ((raw: unknown) => void) | null = null;
  const unsubscribe = vi.fn();
  // Cast to the exact subscribe signature so the wider Mock<...> type does not
  // leak into the consumer (StatusHudLayerOpts.wsEvents must satisfy
  // CharacterDeltaEvents at construction time).
  const subscribe: CharacterDeltaEvents['subscribe'] = (
    _channel: 'character.delta',
    fn: (raw: unknown) => void,
  ): (() => void) => {
    stashed = fn;
    return unsubscribe;
  };
  return {
    subscribe,
    unsubscribe,
    emit: (raw: unknown) => {
      if (stashed === null) throw new Error('emit called before subscribe');
      stashed(raw);
    },
  };
}

const VALID_SNAPSHOT: CharacterSnapshot = {
  actorId: 'actor-1',
  name: 'Thorin',
  hp: 45,
  maxHp: 68,
  tempHp: 10,
  ac: 18,
  level: 5,
  conditions: [],
  exhaustion: 0,
  death: { success: 0, failure: 0 },
  world: { modernRules: false },
  inventory: [],
  spells: { slots: [], spells: [] },
};

function makeLayer(overrides: Partial<StatusHudLayerOpts> = {}): {
  layer: StatusHudLayer;
  bridge: ReturnType<typeof makeMockBridge>;
  wsEvents: MockWsEvents;
  renderer: StatusHudRenderer;
} {
  const bridge = makeMockBridge();
  const renderer = overrides.renderer ?? new StatusHudRenderer({ locale: 'en' });
  const wsEvents = makeMockWsEvents();
  const layer = new StatusHudLayer({
    bridge,
    renderer,
    wsEvents,
    ...overrides,
  });
  return { layer, bridge, wsEvents, renderer };
}

// ──────────────────────────────────────────────────────────────────────────────
// SHL-1 / SHL-2 — identity + capture-container invariant
// ──────────────────────────────────────────────────────────────────────────────

describe('StatusHudLayer — identity + capture contract', () => {
  let activeLayer: StatusHudLayer | null = null;

  afterEach(() => {
    activeLayer?.destroy();
    activeLayer = null;
  });

  it('SHL-1: id === "status-hud"', () => {
    const { layer } = makeLayer();
    activeLayer = layer;
    expect(layer.id).toBe('status-hud');
  });

  it('SHL-2: getCaptureContainer is undefined (no input capture — z=1 read-only)', () => {
    const { layer } = makeLayer();
    activeLayer = layer;
    expect(
      (layer as unknown as { getCaptureContainer?: unknown }).getCaptureContainer,
    ).toBeUndefined();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// SHL-3 / SHL-4 — debounced render on delta
// ──────────────────────────────────────────────────────────────────────────────

describe('StatusHudLayer — debounced render', () => {
  let activeLayer: StatusHudLayer | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    activeLayer?.destroy();
    activeLayer = null;
    vi.useRealTimers();
  });

  it('SHL-3: valid character.delta + 200 ms → textContainerUpgrade called with grid', async () => {
    const { layer, bridge, wsEvents } = makeLayer();
    activeLayer = layer;
    wsEvents.emit(VALID_SNAPSHOT);
    // Before debounce expires, no upgrade
    expect(bridge.textContainerUpgrade).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200);
    expect(bridge.textContainerUpgrade).toHaveBeenCalledTimes(1);
    const arg = bridge.textContainerUpgrade.mock.calls[0]?.[0] as
      | { containerName: string; content: string }
      | undefined;
    expect(arg?.containerName).toBe('status-hud');
    // Grid content is multi-row and contains the box-drawing border
    expect(arg?.content).toContain('║');
    expect(arg?.content).toContain('Thorin');
  });

  it('SHL-4: two deltas within debounce → single coalesced upgrade', async () => {
    const { layer, bridge, wsEvents } = makeLayer();
    activeLayer = layer;
    wsEvents.emit(VALID_SNAPSHOT);
    await vi.advanceTimersByTimeAsync(100);
    wsEvents.emit({ ...VALID_SNAPSHOT, hp: 40 });
    await vi.advanceTimersByTimeAsync(100);
    // Still inside the 200 ms window from the 2nd delta — no upgrade yet
    expect(bridge.textContainerUpgrade).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100); // 200 ms total since 2nd delta
    expect(bridge.textContainerUpgrade).toHaveBeenCalledTimes(1);
    // The single render reflects the LATEST snapshot (hp=40)
    const arg = bridge.textContainerUpgrade.mock.calls[0]?.[0] as { content: string } | undefined;
    expect(arg?.content).toContain('40/68');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// SHL-5 — heartbeat
// ──────────────────────────────────────────────────────────────────────────────

describe('StatusHudLayer — heartbeat', () => {
  let activeLayer: StatusHudLayer | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    activeLayer?.destroy();
    activeLayer = null;
    vi.useRealTimers();
  });

  it('SHL-5: heartbeat (30 s) re-renders the last-known snapshot', async () => {
    const { layer, bridge, wsEvents } = makeLayer();
    activeLayer = layer;
    wsEvents.emit(VALID_SNAPSHOT);
    await vi.advanceTimersByTimeAsync(200); // first debounced render
    expect(bridge.textContainerUpgrade).toHaveBeenCalledTimes(1);

    // Advance 30 s → heartbeat fires, re-renders the same snapshot
    await vi.advanceTimersByTimeAsync(30_000);
    expect(bridge.textContainerUpgrade).toHaveBeenCalledTimes(2);
    const arg2 = bridge.textContainerUpgrade.mock.calls[1]?.[0] as { content: string } | undefined;
    expect(arg2?.content).toContain('Thorin');
  });

  it('SHL-5b: heartbeat without prior snapshot → renders loading state', async () => {
    const { layer, bridge } = makeLayer();
    activeLayer = layer;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(bridge.textContainerUpgrade).toHaveBeenCalledTimes(1);
    const arg = bridge.textContainerUpgrade.mock.calls[0]?.[0] as { content: string } | undefined;
    // Loading state includes the `…` ellipsis marker in HP row
    expect(arg?.content).toContain('…');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// SHL-6 — malformed payload
// ──────────────────────────────────────────────────────────────────────────────

describe('StatusHudLayer — malformed payload safety', () => {
  let activeLayer: StatusHudLayer | null = null;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    activeLayer?.destroy();
    activeLayer = null;
    vi.useRealTimers();
    warnSpy.mockRestore();
  });

  it('SHL-6: malformed delta → console.warn + no textContainerUpgrade + no throw', async () => {
    const { layer, bridge, wsEvents } = makeLayer();
    activeLayer = layer;
    // Bogus payload — fails Zod safeParse
    expect(() => wsEvents.emit({ not: 'a snapshot' })).not.toThrow();
    expect(warnSpy).toHaveBeenCalled();
    const warnArg = warnSpy.mock.calls[0]?.[0];
    expect(typeof warnArg).toBe('string');
    expect(warnArg).toContain('status-hud-layer');
    // After debounce window, no upgrade should have happened
    await vi.advanceTimersByTimeAsync(200);
    expect(bridge.textContainerUpgrade).not.toHaveBeenCalled();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// SHL-7 — destroy() cleanup
// ──────────────────────────────────────────────────────────────────────────────

describe('StatusHudLayer — destroy', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('SHL-7: destroy() clears debounce + heartbeat timers and calls unsubscribe', async () => {
    const { layer, bridge, wsEvents } = makeLayer();
    wsEvents.emit(VALID_SNAPSHOT);
    layer.destroy();
    // The unsubscribe callback returned by subscribe() must have been invoked.
    expect(wsEvents.unsubscribe).toHaveBeenCalledTimes(1);
    // After destroy, advancing time should NOT fire the debounced render
    // (debounce timer cleared) NOR the heartbeat (interval cleared).
    await vi.advanceTimersByTimeAsync(60_000);
    expect(bridge.textContainerUpgrade).not.toHaveBeenCalled();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Phase 4b death-saves pivot trigger (DEATH-01 — Plan 05 Task 1)
//
// SHL-PIVOT-1..7 verify the `_onDelta` latch behaviour: `hp === 0 &&
// death.failure < 3` flips renderer.setMode('death-saves'); HP > 0 recovery
// flips back. Latch is transition-driven (renderer.setMode called only on
// state change), and dead state (failure === 3) keeps the pivot latched.
//
// @see 04b-CONTEXT.md §Area 7 + 04B-RESEARCH.md §Q4 + 04B-05-PLAN.md Task 1
// ──────────────────────────────────────────────────────────────────────────────

describe('StatusHudLayer — Phase 4b death-saves pivot trigger', () => {
  let activeLayer: StatusHudLayer | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    activeLayer?.destroy();
    activeLayer = null;
    vi.useRealTimers();
  });

  /** Build a layer with a setMode spy on the renderer. */
  function makeLayerWithModeSpy() {
    const bridge = makeMockBridge();
    const renderer = new StatusHudRenderer({ locale: 'en' });
    const setModeSpy = vi.spyOn(renderer, 'setMode');
    const wsEvents = makeMockWsEvents();
    const layer = new StatusHudLayer({ bridge, renderer, wsEvents });
    return { layer, bridge, renderer, setModeSpy, wsEvents };
  }

  it('SHL-PIVOT-1: initial state — getPivotLatched() === false', () => {
    const { layer } = makeLayerWithModeSpy();
    activeLayer = layer;
    expect(layer.getPivotLatched()).toBe(false);
  });

  it('SHL-PIVOT-2: HP=0 + failure=2 → setMode("death-saves") called once; latched', async () => {
    const { layer, setModeSpy, wsEvents } = makeLayerWithModeSpy();
    activeLayer = layer;
    wsEvents.emit({ ...VALID_SNAPSHOT, hp: 0, death: { success: 0, failure: 2 } });
    await vi.advanceTimersByTimeAsync(200);
    expect(setModeSpy).toHaveBeenCalledWith('death-saves');
    expect(setModeSpy).toHaveBeenCalledTimes(1);
    expect(layer.getPivotLatched()).toBe(true);
  });

  it('SHL-PIVOT-3: HP recovery (HP > 0) → setMode("standard") called; latch OFF', async () => {
    const { layer, setModeSpy, wsEvents } = makeLayerWithModeSpy();
    activeLayer = layer;
    // Enter death-saves
    wsEvents.emit({ ...VALID_SNAPSHOT, hp: 0, death: { success: 0, failure: 2 } });
    await vi.advanceTimersByTimeAsync(200);
    expect(setModeSpy).toHaveBeenLastCalledWith('death-saves');
    // Recover — HP > 0
    wsEvents.emit({ ...VALID_SNAPSHOT, hp: 5, death: { success: 0, failure: 2 } });
    await vi.advanceTimersByTimeAsync(200);
    expect(setModeSpy).toHaveBeenLastCalledWith('standard');
    expect(setModeSpy).toHaveBeenCalledTimes(2);
    expect(layer.getPivotLatched()).toBe(false);
  });

  it('SHL-PIVOT-4: failure=3 (PC dead) → pivot stays latched (no setMode("standard"))', async () => {
    const { layer, setModeSpy, wsEvents } = makeLayerWithModeSpy();
    activeLayer = layer;
    // Enter death-saves at failure=2
    wsEvents.emit({ ...VALID_SNAPSHOT, hp: 0, death: { success: 0, failure: 2 } });
    await vi.advanceTimersByTimeAsync(200);
    expect(setModeSpy).toHaveBeenCalledWith('death-saves');
    // Third fail → PC dead (failure === 3). Latch must stay ON; renderer
    // stays in death-saves mode until a future revive event (Phase 7+).
    wsEvents.emit({ ...VALID_SNAPSHOT, hp: 0, death: { success: 0, failure: 3 } });
    await vi.advanceTimersByTimeAsync(200);
    // setMode was called ONCE (the initial transition); the second delta is
    // a no-op for the latch (already true → still true).
    expect(setModeSpy).toHaveBeenCalledTimes(1);
    expect(layer.getPivotLatched()).toBe(true);
  });

  it('SHL-PIVOT-5: HP=0 with 0p/0f on first delta → pivot triggers immediately', async () => {
    const { layer, setModeSpy, wsEvents } = makeLayerWithModeSpy();
    activeLayer = layer;
    wsEvents.emit({ ...VALID_SNAPSHOT, hp: 0, death: { success: 0, failure: 0 } });
    await vi.advanceTimersByTimeAsync(200);
    expect(setModeSpy).toHaveBeenCalledWith('death-saves');
    expect(setModeSpy).toHaveBeenCalledTimes(1);
    expect(layer.getPivotLatched()).toBe(true);
  });

  it('SHL-PIVOT-6: two deltas with same pivot state → setMode called only ONCE', async () => {
    const { layer, setModeSpy, wsEvents } = makeLayerWithModeSpy();
    activeLayer = layer;
    // Two HP=0 deltas in a row — both `inDeathSaves === true`, but the latch
    // state is unchanged between them so setMode is only called once.
    wsEvents.emit({ ...VALID_SNAPSHOT, hp: 0, death: { success: 0, failure: 1 } });
    await vi.advanceTimersByTimeAsync(200);
    wsEvents.emit({ ...VALID_SNAPSHOT, hp: 0, death: { success: 0, failure: 2 } });
    await vi.advanceTimersByTimeAsync(200);
    expect(setModeSpy).toHaveBeenCalledTimes(1);
    expect(setModeSpy).toHaveBeenCalledWith('death-saves');
    expect(layer.getPivotLatched()).toBe(true);
  });

  it('SHL-PIVOT-7: malformed delta (death missing) → safeParse fails; pivot unchanged', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { layer, setModeSpy, wsEvents } = makeLayerWithModeSpy();
      activeLayer = layer;
      // Missing `death` field — CharacterSnapshotSchema.safeParse fails.
      expect(() =>
        wsEvents.emit({
          ...VALID_SNAPSHOT,
          death: undefined as unknown as typeof VALID_SNAPSHOT.death,
        }),
      ).not.toThrow();
      await vi.advanceTimersByTimeAsync(200);
      expect(setModeSpy).not.toHaveBeenCalled();
      expect(layer.getPivotLatched()).toBe(false);
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });
});
