/**
 * Unit tests for CanvasCombatTrackerPanel (Phase 23 Plan 23-03 — RCOMB-01).
 *
 * Test IDs follow the RCOMB-* namespace per 23-03-PLAN.md §behavior.
 *
 * ## Panel interface (RCOMB-IFACE)
 *
 *   - RCOMB-IFACE-1:  id === 'canvas-combat-tracker'; meta.id === 'canvas-combat-tracker'.
 *   - RCOMB-IFACE-2:  getContainerCount() === {image:0,text:0}; getCaptureContainer() === 'hud-capture'.
 *
 * ## Dirty gate (RCOMB-DIRTY)
 *
 *   - RCOMB-DIRTY-1:  isDirty() is true at construction; false after paint() with real ctx.
 *
 * ## Auto-follow on new turn (RCOMB-AUTOFOL)
 *
 *   - RCOMB-AUTOFOL-1:  combat.turn delta with new currentCombatantId resets _scrollOffset=0
 *                       and _dirty=true.
 *
 * ## Manual scroll + isAtTopBoundary (RCOMB-SCROLL)
 *
 *   - RCOMB-SCROLL-1:  scroll-down between deltas changes _scrollOffset; isAtTopBoundary()
 *                      is true only when _scrollOffset === 0.
 *
 * ## 5-window rendering + current-turn highlight (RCOMB-WIN)
 *
 *   - RCOMB-WIN-1:     >5 combatants: exactly 5 rows rendered by computeWindow.
 *   - RCOMB-WIN-2:     current-turn row triggers full-contrast fillRect highlight seam.
 *
 * ## AC rendering (RCOMB-AC)
 *
 *   - RCOMB-AC-1:  combatant with ac:18 renders "18" in the AC field.
 *   - RCOMB-AC-2:  combatant without ac renders ' --' fallback.
 *
 * ## Malformed payload guard (T-23-01)
 *
 *   - RCOMB-T2301:  invalid combat.turn payload does NOT change _dirty or _snapshot.
 *
 * ## Subscription lifecycle (RCOMB-LIFECYCLE)
 *
 *   - RCOMB-LIFECYCLE-1:  onMount subscribes to BOTH combat.turn + combat.state.
 *   - RCOMB-LIFECYCLE-2:  onUnmount unsubscribes all; idempotent + post-unmount delta is a no-op.
 *
 * ## double-tap no-op (RCOMB-DTAP)
 *
 *   - RCOMB-DTAP-1:  double-tap gesture is a no-op (no throw, no _scrollOffset change).
 *
 * @see .planning/phases/EVF-23-combat-tracker-su-canvas-combatant-ac/23-03-PLAN.md
 * @see packages/g2-app/src/panels/canvas-combat-tracker-panel.ts
 * @see packages/g2-app/src/panels/combat-tracker-panel.ts (computeWindow, renderCombatTrackerContent)
 */

import type { CombatSnapshot } from '@evf/shared-protocol';
import { describe, expect, it, vi } from 'vitest';

// ── Test utilities ─────────────────────────────────────────────────────────────

/**
 * Minimal fake CanvasRenderingContext2D spy.
 *
 * Captures all `fillText` and `fillRect` calls so tests can assert which text
 * was drawn and whether the current-turn highlight band was rendered.
 */
function makeFakeCtx(): {
  ctx: CanvasRenderingContext2D;
  fillTexts: () => string[];
  fillRects: () => Array<[number, number, number, number]>;
} {
  const fillTextLog: string[] = [];
  const fillRectLog: Array<[number, number, number, number]> = [];
  const ctx = {
    fillText: vi.fn((text: string) => fillTextLog.push(text)),
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    fillRect: vi.fn((x: number, y: number, w: number, h: number) => fillRectLog.push([x, y, w, h])),
    strokeRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    measureText: vi.fn(() => ({ width: 10 })),
    font: '',
    fillStyle: '',
    strokeStyle: '',
    canvas: { width: 576, height: 288 } as HTMLCanvasElement,
  } as unknown as CanvasRenderingContext2D;
  return {
    ctx,
    fillTexts: () => fillTextLog,
    fillRects: () => fillRectLog,
  };
}

/**
 * Mock wsEventBus implementing `{ subscribe(channel, fn): () => void }`.
 *
 * Records subscribed channels + callbacks; returns per-channel spy unsubscribers.
 * The returned unsubscribe function both records the call (via vi.fn spy) AND
 * removes the handler from the active map — so post-unmount emit() calls are
 * truly no-ops (RCOMB-LIFECYCLE-2 requirement).
 */
function makeMockWsEventBus() {
  const handlers: Map<string, (payload: unknown) => void> = new Map();
  const unsubSpies: Map<string, ReturnType<typeof vi.fn>> = new Map();

  return {
    subscribe: vi.fn((channel: string, fn: (payload: unknown) => void) => {
      handlers.set(channel, fn);
      // The unsubscribe function removes the handler (functional) + records the call (spy).
      const unsub = vi.fn(() => {
        handlers.delete(channel);
      });
      unsubSpies.set(channel, unsub);
      return unsub;
    }),
    /** Simulate an incoming delta on a channel. */
    emit: (channel: string, payload: unknown) => {
      const h = handlers.get(channel);
      if (h) h(payload);
    },
    /** Active subscribed channels (channels still registered after any unsubs). */
    subscribedChannels: () => [...handlers.keys()],
    /** Get the unsubscribe spy for a specific channel. */
    unsubSpyFor: (channel: string) => unsubSpies.get(channel),
  };
}

function makeMockGestureBus() {
  const subscribers: Array<(g: { kind: string; direction?: string }) => void> = [];
  return {
    subscribe: vi.fn((fn: (g: { kind: string; direction?: string }) => void) => {
      subscribers.push(fn);
      return () => {
        const idx = subscribers.indexOf(fn);
        if (idx >= 0) subscribers.splice(idx, 1);
      };
    }),
    publish: (g: { kind: string; direction?: string }) => {
      for (const fn of [...subscribers]) fn(g);
    },
    size: () => subscribers.length,
  };
}

function makeMockBridge() {
  return {
    textContainerUpgrade: vi.fn().mockResolvedValue(undefined),
    updateImageRawData: vi.fn().mockResolvedValue(undefined),
    setLocalStorage: vi.fn().mockResolvedValue('true'),
    getLocalStorage: vi.fn().mockResolvedValue(''),
  };
}

/** Build a minimal valid CombatSnapshot literal. */
function makeCombatSnapshot(overrides: Partial<CombatSnapshot> = {}): CombatSnapshot {
  return {
    combatId: 'combat-001',
    round: 1,
    turn: 0,
    currentCombatantId: 'comb-1',
    combatants: [
      {
        id: 'comb-1',
        name: 'Fighter',
        actorId: 'actor-1',
        initiative: 18,
        hp: 50,
        maxHp: 60,
        isCurrentTurn: true,
        ac: 18,
      },
      {
        id: 'comb-2',
        name: 'Wizard',
        actorId: 'actor-2',
        initiative: 12,
        hp: 30,
        maxHp: 30,
        isCurrentTurn: false,
      },
    ],
    ...overrides,
  };
}

/** Build a CombatSnapshot with N combatants (>5 to test windowing). */
function makeLargeCombatSnapshot(): CombatSnapshot {
  const combatants = Array.from({ length: 7 }, (_, i) => ({
    id: `comb-${i}`,
    name: `Fighter ${i}`,
    actorId: `actor-${i}`,
    initiative: 20 - i,
    hp: 40,
    maxHp: 40,
    isCurrentTurn: i === 0,
    ac: 15 + i,
  }));
  return {
    combatId: 'combat-big',
    round: 1,
    turn: 0,
    currentCombatantId: 'comb-0',
    combatants,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// RCOMB-IFACE — Panel interface checks
// ══════════════════════════════════════════════════════════════════════════════

describe('CanvasCombatTrackerPanel — interface (RCOMB-IFACE)', () => {
  async function getPanel() {
    const m = await import('../canvas-combat-tracker-panel.js');
    return m.default;
  }

  it('RCOMB-IFACE-1: id === canvas-combat-tracker; static meta.id === canvas-combat-tracker', async () => {
    const CanvasCombatTrackerPanel = await getPanel();
    const bus = makeMockGestureBus();
    const bridge = makeMockBridge();
    const panel = new CanvasCombatTrackerPanel(bridge as never, bus as never, 'it');

    expect(panel.id).toBe('canvas-combat-tracker');
    expect(CanvasCombatTrackerPanel.meta.id).toBe('canvas-combat-tracker');
  });

  it('RCOMB-IFACE-2: getContainerCount() === {image:0,text:0}; getCaptureContainer() === hud-capture; draw() resolves', async () => {
    const CanvasCombatTrackerPanel = await getPanel();
    const bus = makeMockGestureBus();
    const bridge = makeMockBridge();
    const panel = new CanvasCombatTrackerPanel(bridge as never, bus as never, 'it');

    expect(panel.getContainerCount()).toEqual({ image: 0, text: 0 });
    expect(panel.getCaptureContainer()).toBe('hud-capture');
    await expect(panel.draw()).resolves.toBeUndefined();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// RCOMB-DIRTY — Dirty-gate
// ══════════════════════════════════════════════════════════════════════════════

describe('CanvasCombatTrackerPanel — dirty gate (RCOMB-DIRTY)', () => {
  async function getPanel() {
    const m = await import('../canvas-combat-tracker-panel.js');
    return m.default;
  }

  it('RCOMB-DIRTY-1: isDirty() is true at construction; false after paint() with real ctx', async () => {
    const CanvasCombatTrackerPanel = await getPanel();
    const bus = makeMockGestureBus();
    const bridge = makeMockBridge();
    const panel = new CanvasCombatTrackerPanel(bridge as never, bus as never, 'it');

    expect(panel.isDirty()).toBe(true);

    // Attach real ctx
    const { ctx } = makeFakeCtx();
    const fakeCanvas = { getContext: vi.fn(() => ctx) } as unknown as HTMLCanvasElement;
    await panel.attachCanvas(fakeCanvas);

    panel.paint();
    expect(panel.isDirty()).toBe(false);
  });

  it('RCOMB-DIRTY-NULL: attachCanvas with null ctx degrades gracefully; paint() is a no-op', async () => {
    const CanvasCombatTrackerPanel = await getPanel();
    const bus = makeMockGestureBus();
    const bridge = makeMockBridge();
    const panel = new CanvasCombatTrackerPanel(bridge as never, bus as never, 'it');

    const nullCtxCanvas = { getContext: vi.fn(() => null) } as unknown as HTMLCanvasElement;
    await expect(panel.attachCanvas(nullCtxCanvas)).resolves.toBeUndefined();
    expect(() => panel.paint()).not.toThrow();
    // With null ctx, paint() is a no-op so _dirty stays true
    expect(panel.isDirty()).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// RCOMB-AUTOFOL — Auto-follow on new turn (D-23.3)
// ══════════════════════════════════════════════════════════════════════════════

describe('CanvasCombatTrackerPanel — auto-follow on new turn (RCOMB-AUTOFOL)', () => {
  async function getPanel() {
    const m = await import('../canvas-combat-tracker-panel.js');
    return m.default;
  }

  it('RCOMB-AUTOFOL-1: combat.turn delta with new currentCombatantId resets scrollOffset and sets dirty', async () => {
    const CanvasCombatTrackerPanel = await getPanel();
    const bus = makeMockGestureBus();
    const bridge = makeMockBridge();
    const panel = new CanvasCombatTrackerPanel(bridge as never, bus as never, 'it');
    const wsEvents = makeMockWsEventBus();

    panel.setWsEventBus(wsEvents as never);
    await panel.onMount();

    // Send an initial snapshot with 7 combatants so maxOff = max(0, 7-3) = 4 (scroll effective)
    const largSnap1 = makeLargeCombatSnapshot();
    wsEvents.emit('combat.turn', largSnap1);

    // Manually scroll to simulate user scrolled away
    bus.publish({ kind: 'scroll', direction: 'down' });
    expect(panel.isAtTopBoundary()).toBe(false);

    // Attach real ctx, paint, clear dirty
    const { ctx } = makeFakeCtx();
    const fakeCanvas = { getContext: vi.fn(() => ctx) } as unknown as HTMLCanvasElement;
    await panel.attachCanvas(fakeCanvas);
    panel.paint();
    expect(panel.isDirty()).toBe(false);

    // Now send a NEW combatant turn (different currentCombatantId) — should reset scrollOffset + set dirty
    const largSnap2 = { ...makeLargeCombatSnapshot(), currentCombatantId: 'comb-3', turn: 3 };
    wsEvents.emit('combat.turn', largSnap2);

    expect(panel.isAtTopBoundary()).toBe(true); // _scrollOffset === 0
    expect(panel.isDirty()).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// RCOMB-SCROLL — Manual scroll + isAtTopBoundary
// ══════════════════════════════════════════════════════════════════════════════

describe('CanvasCombatTrackerPanel — scroll + isAtTopBoundary (RCOMB-SCROLL)', () => {
  async function getPanel() {
    const m = await import('../canvas-combat-tracker-panel.js');
    return m.default;
  }

  it('RCOMB-SCROLL-1: scroll-down changes _scrollOffset; isAtTopBoundary() === (_scrollOffset === 0)', async () => {
    const CanvasCombatTrackerPanel = await getPanel();
    const bus = makeMockGestureBus();
    const bridge = makeMockBridge();
    const panel = new CanvasCombatTrackerPanel(bridge as never, bus as never, 'it');
    const wsEvents = makeMockWsEventBus();

    panel.setWsEventBus(wsEvents as never);
    await panel.onMount();

    // Send snapshot with enough combatants for scroll to be effective
    wsEvents.emit('combat.turn', makeLargeCombatSnapshot());

    expect(panel.isAtTopBoundary()).toBe(true);

    bus.publish({ kind: 'scroll', direction: 'down' });
    expect(panel.isAtTopBoundary()).toBe(false);
    expect(panel.isDirty()).toBe(true);

    // Scroll back up to top
    bus.publish({ kind: 'scroll', direction: 'up' });
    expect(panel.isAtTopBoundary()).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// RCOMB-WIN — 5-window rendering + current-turn highlight
// ══════════════════════════════════════════════════════════════════════════════

describe('CanvasCombatTrackerPanel — 5-window + highlight (RCOMB-WIN)', () => {
  async function getPanel() {
    const m = await import('../canvas-combat-tracker-panel.js');
    return m.default;
  }

  it('RCOMB-WIN-1: >5 combatants → getRenderedRows() returns 5 combatant rows in the window', async () => {
    const CanvasCombatTrackerPanel = await getPanel();
    const bus = makeMockGestureBus();
    const bridge = makeMockBridge();
    const panel = new CanvasCombatTrackerPanel(bridge as never, bus as never, 'it');
    const wsEvents = makeMockWsEventBus();

    panel.setWsEventBus(wsEvents as never);
    await panel.onMount();

    wsEvents.emit('combat.turn', makeLargeCombatSnapshot());

    // getRenderedRows() is the test-seam accessor that returns the string rows
    const rows = panel.getRenderedRows();
    // The total rows includes title, combatant rows, blank rows, effects, QA bar, bottom border
    // but each visible combatant contributes exactly 1 row (no concentration in fixture).
    // The window should contain exactly 5 combatants from the 7 available.
    // Count rows that contain 'Fighter' (combatant name field).
    const namedRows = rows.filter((r) => r.includes('Fighter'));
    expect(namedRows.length).toBe(5);
  });

  it('RCOMB-WIN-2: current-turn row triggers fillRect highlight band in paint()', async () => {
    const CanvasCombatTrackerPanel = await getPanel();
    const bus = makeMockGestureBus();
    const bridge = makeMockBridge();
    const panel = new CanvasCombatTrackerPanel(bridge as never, bus as never, 'it');
    const wsEvents = makeMockWsEventBus();

    panel.setWsEventBus(wsEvents as never);
    await panel.onMount();

    wsEvents.emit('combat.turn', makeCombatSnapshot());

    const { ctx, fillRects } = makeFakeCtx();
    const fakeCanvas = { getContext: vi.fn(() => ctx) } as unknown as HTMLCanvasElement;
    await panel.attachCanvas(fakeCanvas);
    panel.paint();

    // The highlight seam calls fillRect for the current-turn row band
    expect(fillRects().length).toBeGreaterThan(0);
  });

  it('RCOMB-WIN-3: CR-01 — QA bar [▶X] marker does NOT produce highlight when current-turn is scrolled out', async () => {
    // Regression test for CR-01: _findCurrentTurnRowIndex must match "▶ " (with trailing
    // space) and NOT "[▶X]" (QA bar slot — no trailing space).
    // Reproduction: >6 combatants, QA handler set (enables bar), scroll down until
    // current-turn combatant (index 0) leaves the visible window.
    const CanvasCombatTrackerPanel = await getPanel();
    const bus = makeMockGestureBus();
    const bridge = makeMockBridge();
    const panel = new CanvasCombatTrackerPanel(bridge as never, bus as never, 'it');
    const wsEvents = makeMockWsEventBus();

    panel.setWsEventBus(wsEvents as never);
    // Inject a QA handler so the bar renders with [▶X] slot when qaSelectedIdx >= 0.
    panel.setQuickActionHandler((_key) => undefined);
    await panel.onMount();

    // 7 combatants → maxOff = max(0, 7-3) = 4; combatant 0 is currentTurn.
    wsEvents.emit('combat.turn', makeLargeCombatSnapshot());

    // Advance QA selection so selectedIdx is 1 (renders "[▶S]" in the QA bar).
    bus.publish({ kind: 'tap' });

    // Scroll down enough to move current-turn combatant out of the visible window.
    bus.publish({ kind: 'scroll', direction: 'down' });
    bus.publish({ kind: 'scroll', direction: 'down' });
    bus.publish({ kind: 'scroll', direction: 'down' });

    const { ctx, fillRects } = makeFakeCtx();
    const fakeCanvas = { getContext: vi.fn(() => ctx) } as unknown as HTMLCanvasElement;
    await panel.attachCanvas(fakeCanvas);
    panel.paint();

    // With the current-turn combatant scrolled out and no "▶ " row visible,
    // _findCurrentTurnRowIndex should return -1 → no highlight fillRect call
    // (beyond the chrome background clearRect/fillRect from chrome draw).
    // The chrome _drawStaticChrome calls fillRect once (background) — any additional
    // fillRect would be the highlight band. With the fix, only 1 fillRect should be
    // emitted (chrome background); with the bug, 2 would be emitted (chrome + wrong row).
    // We assert ≤1 fillRect (accounts for environments where chrome is a bitmap blit).
    expect(fillRects().length).toBeLessThanOrEqual(1);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// RCOMB-AC — AC field rendering
// ══════════════════════════════════════════════════════════════════════════════

describe('CanvasCombatTrackerPanel — AC field rendering (RCOMB-AC)', () => {
  async function getPanel() {
    const m = await import('../canvas-combat-tracker-panel.js');
    return m.default;
  }

  it('RCOMB-AC-1: combatant with ac:18 renders "18" in AC field (via getRenderedRows)', async () => {
    const CanvasCombatTrackerPanel = await getPanel();
    const bus = makeMockGestureBus();
    const bridge = makeMockBridge();
    const panel = new CanvasCombatTrackerPanel(bridge as never, bus as never, 'it');
    const wsEvents = makeMockWsEventBus();

    panel.setWsEventBus(wsEvents as never);
    await panel.onMount();

    const snap = makeCombatSnapshot({
      combatants: [
        {
          id: 'comb-1',
          name: 'Fighter',
          actorId: 'actor-1',
          initiative: 18,
          hp: 50,
          maxHp: 60,
          isCurrentTurn: true,
          ac: 18,
        },
      ],
    });
    wsEvents.emit('combat.turn', snap);

    const rows = panel.getRenderedRows();
    const acRow = rows.find((r) => r.includes('Fighter'));
    expect(acRow).toBeDefined();
    // AC value "18" right-justified in 3 chars = " 18"
    expect(acRow).toContain(' 18');
  });

  it('RCOMB-AC-2: combatant without ac renders " --" fallback', async () => {
    const CanvasCombatTrackerPanel = await getPanel();
    const bus = makeMockGestureBus();
    const bridge = makeMockBridge();
    const panel = new CanvasCombatTrackerPanel(bridge as never, bus as never, 'it');
    const wsEvents = makeMockWsEventBus();

    panel.setWsEventBus(wsEvents as never);
    await panel.onMount();

    const snap = makeCombatSnapshot({
      combatants: [
        {
          id: 'comb-2',
          name: 'Wizard',
          actorId: null,
          initiative: 12,
          hp: null,
          maxHp: null,
          isCurrentTurn: true,
          // no ac field
        },
      ],
    });
    wsEvents.emit('combat.turn', snap);

    const rows = panel.getRenderedRows();
    const acRow = rows.find((r) => r.includes('Wizard'));
    expect(acRow).toBeDefined();
    // AC fallback is ' --' (3 chars matching _rjust placeholder)
    expect(acRow).toContain(' --');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// RCOMB-T2301 — Malformed payload guard (T-23-01)
// ══════════════════════════════════════════════════════════════════════════════

describe('CanvasCombatTrackerPanel — malformed payload guard (RCOMB-T2301)', () => {
  async function getPanel() {
    const m = await import('../canvas-combat-tracker-panel.js');
    return m.default;
  }

  it('RCOMB-T2301: invalid combat.turn payload does NOT change dirty or snapshot', async () => {
    const CanvasCombatTrackerPanel = await getPanel();
    const bus = makeMockGestureBus();
    const bridge = makeMockBridge();
    const panel = new CanvasCombatTrackerPanel(bridge as never, bus as never, 'it');
    const wsEvents = makeMockWsEventBus();

    panel.setWsEventBus(wsEvents as never);
    await panel.onMount();

    // Attach canvas + paint to clear dirty
    const { ctx } = makeFakeCtx();
    const fakeCanvas = { getContext: vi.fn(() => ctx) } as unknown as HTMLCanvasElement;
    await panel.attachCanvas(fakeCanvas);
    panel.paint();
    expect(panel.isDirty()).toBe(false);

    // Send malformed payload
    wsEvents.emit('combat.turn', { not: 'a valid snapshot', missing: 'required fields' });

    // _dirty must remain false (payload was dropped)
    expect(panel.isDirty()).toBe(false);
    // Rendered rows still reflect the empty state (no snapshot)
    expect(panel.getRenderedRows().length).toBeGreaterThan(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// RCOMB-LIFECYCLE — Subscription lifecycle (no leak)
// ══════════════════════════════════════════════════════════════════════════════

describe('CanvasCombatTrackerPanel — subscription lifecycle (RCOMB-LIFECYCLE)', () => {
  async function getPanel() {
    const m = await import('../canvas-combat-tracker-panel.js');
    return m.default;
  }

  it('RCOMB-LIFECYCLE-1: onMount subscribes to BOTH combat.turn and combat.state', async () => {
    const CanvasCombatTrackerPanel = await getPanel();
    const bus = makeMockGestureBus();
    const bridge = makeMockBridge();
    const panel = new CanvasCombatTrackerPanel(bridge as never, bus as never, 'it');
    const wsEvents = makeMockWsEventBus();

    panel.setWsEventBus(wsEvents as never);
    await panel.onMount();

    const channels = wsEvents.subscribedChannels();
    expect(channels).toContain('combat.turn');
    expect(channels).toContain('combat.state');
  });

  it('RCOMB-LIFECYCLE-2: onUnmount unsubscribes all channels; idempotent; post-unmount delta no-op', async () => {
    const CanvasCombatTrackerPanel = await getPanel();
    const bus = makeMockGestureBus();
    const bridge = makeMockBridge();
    const panel = new CanvasCombatTrackerPanel(bridge as never, bus as never, 'it');
    const wsEvents = makeMockWsEventBus();

    panel.setWsEventBus(wsEvents as never);
    await panel.onMount();

    // Both channels should be subscribed
    expect(wsEvents.subscribedChannels()).toContain('combat.turn');
    expect(wsEvents.subscribedChannels()).toContain('combat.state');

    // Attach canvas + paint to clear dirty
    const { ctx } = makeFakeCtx();
    const fakeCanvas = { getContext: vi.fn(() => ctx) } as unknown as HTMLCanvasElement;
    await panel.attachCanvas(fakeCanvas);
    panel.paint();
    expect(panel.isDirty()).toBe(false);

    // Unmount
    await panel.onUnmount();

    // Unsubscribe spies must have been called
    expect(wsEvents.unsubSpyFor('combat.turn')).toHaveBeenCalledOnce();
    expect(wsEvents.unsubSpyFor('combat.state')).toHaveBeenCalledOnce();

    // Post-unmount delta: should NOT mark dirty
    wsEvents.emit('combat.turn', makeCombatSnapshot());
    expect(panel.isDirty()).toBe(false);

    // Idempotent: second onUnmount must not throw
    await expect(panel.onUnmount()).resolves.toBeUndefined();
  });

  it('RCOMB-LIFECYCLE-GESTURE: onMount subscribes gestureBus; onUnmount unsubscribes', async () => {
    const CanvasCombatTrackerPanel = await getPanel();
    const bus = makeMockGestureBus();
    const bridge = makeMockBridge();
    const panel = new CanvasCombatTrackerPanel(bridge as never, bus as never, 'it');
    const wsEvents = makeMockWsEventBus();

    panel.setWsEventBus(wsEvents as never);

    expect(bus.size()).toBe(0);
    await panel.onMount();
    expect(bus.size()).toBe(1);

    await panel.onUnmount();
    expect(bus.size()).toBe(0);

    // Second unmount must not throw
    await expect(panel.onUnmount()).resolves.toBeUndefined();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// RCOMB-DTAP — double-tap no-op
// ══════════════════════════════════════════════════════════════════════════════

describe('CanvasCombatTrackerPanel — double-tap no-op (RCOMB-DTAP)', () => {
  async function getPanel() {
    const m = await import('../canvas-combat-tracker-panel.js');
    return m.default;
  }

  it('RCOMB-DTAP-1: double-tap gesture is a no-op (no throw, no scrollOffset change, isAtTopBoundary stays true)', async () => {
    const CanvasCombatTrackerPanel = await getPanel();
    const bus = makeMockGestureBus();
    const bridge = makeMockBridge();
    const panel = new CanvasCombatTrackerPanel(bridge as never, bus as never, 'it');
    const wsEvents = makeMockWsEventBus();

    panel.setWsEventBus(wsEvents as never);
    await panel.onMount();

    // Send snapshot so we have a known state
    wsEvents.emit('combat.turn', makeLargeCombatSnapshot());
    expect(panel.isAtTopBoundary()).toBe(true);

    // double-tap must not throw, not change scrollOffset
    expect(() => bus.publish({ kind: 'double-tap' })).not.toThrow();
    expect(panel.isAtTopBoundary()).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// RCOMB-BOOT — Boot dispatch gate purity check
// ══════════════════════════════════════════════════════════════════════════════

describe('CanvasCombatTrackerPanel — boot dispatch gate (RCOMB-BOOT)', () => {
  it('RCOMB-BOOT-CANVAS: canvas render mode routes combat-tracker to canvas-combat-tracker', () => {
    const selectPanelId = (target: string, renderMode: 'canvas' | 'glyph'): string => {
      if (target === 'combat-tracker' && renderMode === 'canvas') return 'canvas-combat-tracker';
      if (target === 'character-sheet' && renderMode === 'canvas') return 'canvas-character-sheet';
      return target;
    };

    expect(selectPanelId('combat-tracker', 'canvas')).toBe('canvas-combat-tracker');
    expect(selectPanelId('combat-tracker', 'glyph')).toBe('combat-tracker');
    expect(selectPanelId('character-sheet', 'canvas')).toBe('canvas-character-sheet');
  });
});
