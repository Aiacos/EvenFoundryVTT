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
import { R1_ACTION_ECONOMY_TYPE, R1_MOVEMENT_BUDGET_TYPE } from '@evf/shared-protocol';
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
  /** Drive the movement budget channel directly (SHL-MV-* tests). */
  emitMovement(raw: unknown): void;
  /** Drive the action economy channel directly (SHL-AE-* tests). */
  emitEconomy(raw: unknown): void;
}

function makeMockWsEvents(): MockWsEvents {
  let stashed: ((raw: unknown) => void) | null = null;
  let movementStashed: ((raw: unknown) => void) | null = null;
  let economyStashed: ((raw: unknown) => void) | null = null;
  const unsubscribe = vi.fn();
  // Cast to the exact subscribe signature so the wider Mock<...> type does not
  // leak into the consumer (StatusHudLayerOpts.wsEvents must satisfy
  // CharacterDeltaEvents at construction time).
  // Phase 08-04: channel widened to string (movement budget + character delta).
  // Phase 09-02: economy channel added (action economy widget).
  const subscribe: CharacterDeltaEvents['subscribe'] = (
    channel: string,
    fn: (raw: unknown) => void,
  ): (() => void) => {
    if (channel === 'character.delta') {
      stashed = fn;
    } else if (channel === R1_MOVEMENT_BUDGET_TYPE) {
      movementStashed = fn;
    } else if (channel === R1_ACTION_ECONOMY_TYPE) {
      economyStashed = fn;
    }
    return unsubscribe;
  };
  return {
    subscribe,
    unsubscribe,
    emit: (raw: unknown) => {
      if (stashed === null) throw new Error('emit called before subscribe');
      stashed(raw);
    },
    emitMovement: (raw: unknown) => {
      if (movementStashed === null) throw new Error('emitMovement called before subscribe');
      movementStashed(raw);
    },
    emitEconomy: (raw: unknown) => {
      if (economyStashed === null) throw new Error('emitEconomy called before subscribe');
      economyStashed(raw);
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
  abilities: {
    str: { value: 10, mod: 0, save: 0, proficient: false, dc: 10 },
    dex: { value: 10, mod: 0, save: 0, proficient: false, dc: 10 },
    con: { value: 10, mod: 0, save: 0, proficient: false, dc: 10 },
    int: { value: 10, mod: 0, save: 0, proficient: false, dc: 10 },
    wis: { value: 10, mod: 0, save: 0, proficient: false, dc: 10 },
    cha: { value: 10, mod: 0, save: 0, proficient: false, dc: 10 },
  },
  skills: {
    acr: { total: 0, ability: 'dex' as const, proficient: 0 as const, passive: 10 },
    ani: { total: 0, ability: 'wis' as const, proficient: 0 as const, passive: 10 },
    arc: { total: 0, ability: 'int' as const, proficient: 0 as const, passive: 10 },
    ath: { total: 0, ability: 'str' as const, proficient: 0 as const, passive: 10 },
    dec: { total: 0, ability: 'cha' as const, proficient: 0 as const, passive: 10 },
    his: { total: 0, ability: 'int' as const, proficient: 0 as const, passive: 10 },
    ins: { total: 0, ability: 'wis' as const, proficient: 0 as const, passive: 10 },
    itm: { total: 0, ability: 'cha' as const, proficient: 0 as const, passive: 10 },
    inv: { total: 0, ability: 'int' as const, proficient: 0 as const, passive: 10 },
    med: { total: 0, ability: 'wis' as const, proficient: 0 as const, passive: 10 },
    nat: { total: 0, ability: 'int' as const, proficient: 0 as const, passive: 10 },
    prc: { total: 0, ability: 'wis' as const, proficient: 0 as const, passive: 10 },
    prf: { total: 0, ability: 'cha' as const, proficient: 0 as const, passive: 10 },
    per: { total: 0, ability: 'cha' as const, proficient: 0 as const, passive: 10 },
    rel: { total: 0, ability: 'int' as const, proficient: 0 as const, passive: 10 },
    slt: { total: 0, ability: 'dex' as const, proficient: 0 as const, passive: 10 },
    ste: { total: 0, ability: 'dex' as const, proficient: 0 as const, passive: 10 },
    sur: { total: 0, ability: 'wis' as const, proficient: 0 as const, passive: 10 },
  },
  class: 'Fighter',
  initiative: 2,
  speed: 30,
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
    // Sheet content is multi-line and contains the name + divider line
    // HUD-27PX: old ║ border is replaced by ─ divider (full-width status sheet)
    expect(arg?.content).toContain('─');
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
    // Phase 08-04: destroy() calls unsubscribe twice — once for character.delta
    // and once for r1.movement.budget (both share the same mock unsubscribe fn).
    // Phase 09-02: destroy() calls unsubscribe THREE times — economy subscription added.
    expect(wsEvents.unsubscribe).toHaveBeenCalledTimes(3);
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

// ──────────────────────────────────────────────────────────────────────────────
// Phase 8 Plan 08-05 movement budget subscription (SHL-MV-01..03)
//
// StatusHudLayer subscribes to R1_MOVEMENT_BUDGET_TYPE channel.
// _onMovementBudget validates via MovementBudgetPayloadSchema.safeParse and
// calls renderer.setMovementBudget with { remaining, total }.
//
// @see packages/g2-app/src/status-hud/status-hud-layer.ts _onMovementBudget
// @see .planning/phases/08-manual-action-ux/08-05-PLAN.md Task 1
// ──────────────────────────────────────────────────────────────────────────────

describe('StatusHudLayer — Phase 8 movement budget subscription (SHL-MV-01..03)', () => {
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

  /** Full MovementBudgetPayload fixture (all 4 required fields). */
  const validMovementPayload = {
    actorId: 'actor-test-1',
    walkSpeed: 30,
    usedThisTurn: 5,
    remainingFeet: 25,
  };

  it('SHL-MV-01: valid r1.movement.budget payload → renderer.setMovementBudget called immediately', () => {
    const bridge = makeMockBridge();
    const renderer = new StatusHudRenderer({ locale: 'en' });
    const setMovementBudgetSpy = vi.spyOn(renderer, 'setMovementBudget');
    const wsEvents = makeMockWsEvents();
    const layer = new StatusHudLayer({ bridge, renderer, wsEvents });
    activeLayer = layer;

    // Emit a valid movement budget payload — setMovementBudget is synchronous (no debounce)
    wsEvents.emitMovement(validMovementPayload);

    expect(setMovementBudgetSpy).toHaveBeenCalledWith({ remaining: 25, total: 30 });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('SHL-MV-02: remainingFeet=0 → setMovementBudget called (exhausted state)', () => {
    const bridge = makeMockBridge();
    const renderer = new StatusHudRenderer({ locale: 'en' });
    const setMovementBudgetSpy = vi.spyOn(renderer, 'setMovementBudget');
    const wsEvents = makeMockWsEvents();
    const layer = new StatusHudLayer({ bridge, renderer, wsEvents });
    activeLayer = layer;

    // remainingFeet=0 means movement exhausted — still forwards to renderer (renderer clears chip)
    wsEvents.emitMovement({ ...validMovementPayload, remainingFeet: 0, usedThisTurn: 30 });

    // Called once synchronously
    expect(setMovementBudgetSpy).toHaveBeenCalledTimes(1);
    expect(setMovementBudgetSpy).toHaveBeenCalledWith({ remaining: 0, total: 30 });
  });

  it('SHL-MV-03: malformed movement budget payload → console.warn + no renderer call', () => {
    const bridge = makeMockBridge();
    const renderer = new StatusHudRenderer({ locale: 'en' });
    const setMovementBudgetSpy = vi.spyOn(renderer, 'setMovementBudget');
    const wsEvents = makeMockWsEvents();
    const layer = new StatusHudLayer({ bridge, renderer, wsEvents });
    activeLayer = layer;

    // Bogus payload missing required actorId/walkSpeed — fails MovementBudgetPayloadSchema.safeParse
    expect(() => wsEvents.emitMovement({ bogus: true })).not.toThrow();

    expect(setMovementBudgetSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    const warnMsg = warnSpy.mock.calls[0]?.[0] as string;
    expect(warnMsg).toContain('status-hud-layer');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Phase 9 Plan 09-02 — action economy subscription (SHL-AE-01..04)
//
// StatusHudLayer subscribes to R1_ACTION_ECONOMY_TYPE channel.
// _onActionEconomy validates via ActionEconomyPayloadSchema.safeParse and
// calls renderer.setActionEconomy with the parsed widget state.
//
// SHL-AE-01: valid action economy payload → renderer.setActionEconomy called
// SHL-AE-02: malformed payload → console.warn + setActionEconomy NOT called
// SHL-AE-03: other envelope types → setActionEconomy NOT called (silent return)
// SHL-AE-04: multiAttackInProgress=false → standard widget state forwarded
//
// @see packages/g2-app/src/status-hud/status-hud-layer.ts _onActionEconomy
// @see .planning/phases/09-action-economy-edge-cases/09-02-PLAN.md Task 2
// ──────────────────────────────────────────────────────────────────────────────

describe('StatusHudLayer — Phase 9 action economy subscription (SHL-AE-01..04)', () => {
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

  /** Full ActionEconomyPayload fixture (all 6 required fields). */
  const validEconomyPayload = {
    actorId: 'actor-test-1',
    actionsUsed: 1,
    bonusActionsUsed: 0,
    reactionsUsed: 0,
    multiAttackInProgress: false,
    recipientUserId: 'user-player-1',
  };

  it('SHL-AE-01: valid r1.action.economy payload → renderer.setActionEconomy called', () => {
    const bridge = makeMockBridge();
    const renderer = new StatusHudRenderer({ locale: 'en' });
    const setEconomySpy = vi.spyOn(renderer, 'setActionEconomy');
    const wsEvents = makeMockWsEvents();
    const layer = new StatusHudLayer({ bridge, renderer, wsEvents });
    activeLayer = layer;

    wsEvents.emitEconomy(validEconomyPayload);

    expect(setEconomySpy).toHaveBeenCalledOnce();
    // Should be called with actionsUsed:1, bonusActionsUsed:0, reactionsUsed:0, multiAttackInProgress:false
    const arg = setEconomySpy.mock.calls[0]?.[0];
    expect(arg).not.toBeNull();
    expect(arg?.actionsUsed).toBe(1);
    expect(arg?.bonusActionsUsed).toBe(0);
    expect(arg?.multiAttackInProgress).toBe(false);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('SHL-AE-02: malformed payload → console.warn + renderer.setActionEconomy NOT called', () => {
    const bridge = makeMockBridge();
    const renderer = new StatusHudRenderer({ locale: 'en' });
    const setEconomySpy = vi.spyOn(renderer, 'setActionEconomy');
    const wsEvents = makeMockWsEvents();
    const layer = new StatusHudLayer({ bridge, renderer, wsEvents });
    activeLayer = layer;

    // Missing required fields — fails ActionEconomyPayloadSchema.safeParse
    expect(() => wsEvents.emitEconomy({ bogus: true })).not.toThrow();

    expect(setEconomySpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    const warnMsg = warnSpy.mock.calls[0]?.[0] as string;
    expect(warnMsg).toContain('status-hud-layer');
  });

  it('SHL-AE-03: character.delta envelope (wrong type) → setActionEconomy NOT called', () => {
    const bridge = makeMockBridge();
    const renderer = new StatusHudRenderer({ locale: 'en' });
    const setEconomySpy = vi.spyOn(renderer, 'setActionEconomy');
    const wsEvents = makeMockWsEvents();
    const layer = new StatusHudLayer({ bridge, renderer, wsEvents });
    activeLayer = layer;

    // Push a valid character snapshot via the character.delta channel — should NOT call setActionEconomy
    wsEvents.emit(VALID_SNAPSHOT);

    expect(setEconomySpy).not.toHaveBeenCalled();
  });

  it('SHL-AE-04: multiAttackInProgress=false payload → standard widget state forwarded (no multi-attack)', () => {
    const bridge = makeMockBridge();
    const renderer = new StatusHudRenderer({ locale: 'en' });
    const setEconomySpy = vi.spyOn(renderer, 'setActionEconomy');
    const wsEvents = makeMockWsEvents();
    const layer = new StatusHudLayer({ bridge, renderer, wsEvents });
    activeLayer = layer;

    wsEvents.emitEconomy({ ...validEconomyPayload, actionsUsed: 0, multiAttackInProgress: false });

    expect(setEconomySpy).toHaveBeenCalledOnce();
    const arg = setEconomySpy.mock.calls[0]?.[0];
    expect(arg?.multiAttackInProgress).toBe(false);
    // Standard chip: no multiAttack property expected (multi-attack is progress-dispatcher domain)
    expect(arg?.actionsUsed).toBe(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// SHL-REBIND — rebindWsEvents (quick-task 260529-khy Wave 1 Task 2 — R1 reconnect)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Richer wsEvents source that tracks per-source subscribe + unsub call counts so a
 * rebind test can assert the old source drops to zero subscribers and the new source
 * gains exactly one per channel (no double-subscribe / no leak).
 */
function makeTrackedSource() {
  let subCount = 0;
  let unsubCount = 0;
  const handlers: Record<string, (raw: unknown) => void> = {};
  const subscribe: CharacterDeltaEvents['subscribe'] = (channel, fn) => {
    subCount += 1;
    handlers[channel] = fn;
    return () => {
      unsubCount += 1;
    };
  };
  return {
    src: { subscribe } as CharacterDeltaEvents,
    get subCount() {
      return subCount;
    },
    get unsubCount() {
      return unsubCount;
    },
    emit(channel: string, raw: unknown): void {
      handlers[channel]?.(raw);
    },
  };
}

describe('StatusHudLayer — rebindWsEvents (R1 reconnect)', () => {
  let activeLayer: StatusHudLayer | null = null;

  afterEach(() => {
    activeLayer?.destroy();
    activeLayer = null;
  });

  it('SHL-REBIND-1: rebind drops all 3 old subscriptions and re-subscribes the new source once each', () => {
    const original = makeTrackedSource();
    const replacement = makeTrackedSource();
    const bridge = makeMockBridge();
    const layer = new StatusHudLayer({
      bridge,
      renderer: new StatusHudRenderer({ locale: 'en' }),
      wsEvents: original.src,
    });
    activeLayer = layer;

    // Constructor subscribed 3 channels on the original source.
    expect(original.subCount).toBe(3);
    expect(original.unsubCount).toBe(0);

    layer.rebindWsEvents(replacement.src);

    // Old source: all 3 unsubscribed (back to zero live subscriptions).
    expect(original.unsubCount).toBe(3);
    // New source: exactly 3 fresh subscriptions, none yet unsubscribed.
    expect(replacement.subCount).toBe(3);
    expect(replacement.unsubCount).toBe(0);
  });

  it('SHL-REBIND-2: after rebind a delta on the NEW source updates the HUD cache', () => {
    const original = makeTrackedSource();
    const replacement = makeTrackedSource();
    const bridge = makeMockBridge();
    const layer = new StatusHudLayer({
      bridge,
      renderer: new StatusHudRenderer({ locale: 'en' }),
      wsEvents: original.src,
    });
    activeLayer = layer;

    layer.rebindWsEvents(replacement.src);

    // Cache is empty before any new-source delta.
    expect(layer.getCachedSnapshot()).toBeNull();
    // Delta on the NEW source is cached (proves the character.delta channel is wired to it).
    replacement.emit('character.delta', VALID_SNAPSHOT);
    expect(layer.getCachedSnapshot()?.actorId).toBe(VALID_SNAPSHOT.actorId);
  });

  it('SHL-REBIND-3: destroy() after a rebind disposes the CURRENT (new-source) subscriptions', () => {
    const original = makeTrackedSource();
    const replacement = makeTrackedSource();
    const bridge = makeMockBridge();
    const layer = new StatusHudLayer({
      bridge,
      renderer: new StatusHudRenderer({ locale: 'en' }),
      wsEvents: original.src,
    });

    layer.rebindWsEvents(replacement.src);
    layer.destroy();

    // destroy() must unsubscribe the 3 NEW-source closures (not re-call the old ones).
    expect(replacement.unsubCount).toBe(3);
    // Old source already fully unsubscribed at rebind time — not double-called.
    expect(original.unsubCount).toBe(3);
  });
});
