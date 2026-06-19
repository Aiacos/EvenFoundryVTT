/**
 * Unit tests for CanvasLogPanel (canvas Log fix — quick-task).
 *
 * Test IDs follow the RCLP-* namespace.
 *
 * ## Why this panel exists
 *
 * In canvas mode `LayerManager._assertContainerBudget` requires every mounted layer
 * to declare `{image:0,text:0}`. The glyph `LogPanel` declares `{image:0,text:1}`,
 * so opening `[L] Log` in canvas mode threw `panel_mount_budget_exceeded`. This
 * panel paints the same log rows onto the shared compositor canvas instead.
 *
 * ## Coverage
 *
 *   - RCLP-BUDGET:      getContainerCount() === {image:0,text:0}; getCaptureContainer()
 *                       === 'hud-capture'.
 *   - RCLP-MOUNT-CANVAS: mounting CanvasLogPanel in a canvas-mode LayerManager does
 *                       NOT throw the container-count error (the core bug).
 *   - RCLP-SC1:         attachCanvas with a null-ctx (happy-dom) degrades gracefully.
 *   - RCLP-SC2:         isDirty() true before paint(), false after.
 *   - RCLP-ROWS:        getRenderedRows() returns 18 rows reusing renderLogContent.
 *   - RCLP-DELTA:       valid log.delta updates rows; malformed payload is dropped.
 *   - RCLP-GEST:        scroll-down/up adjust scroll + dirty; double-tap/tap no-op.
 *   - RCLP-BUS:         onMount subscribes (gesture + LOG_DELTA_TYPE); onUnmount
 *                       unsubscribes and is idempotent.
 *
 * @see packages/g2-app/src/panels/canvas-log-panel.ts
 * @see packages/g2-app/src/panels/log-panel.ts (glyph panel; shared renderLogContent)
 */

import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';
import { LOG_DELTA_TYPE, type LogSnapshot } from '@evf/shared-protocol';
import { describe, expect, it, vi } from 'vitest';
import { LayerManager } from '../../engine/layer-manager.js';
import { type Layer, ZIndex } from '../../engine/layer-types.js';
import CanvasLogPanel from '../canvas-log-panel.js';

// ── Test utilities ─────────────────────────────────────────────────────────────

/** Minimal fake CanvasRenderingContext2D spy capturing fillText calls. */
function makeFakeCtx(): {
  ctx: CanvasRenderingContext2D;
  calls: Array<{ method: string; args: unknown[] }>;
} {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const ctx = {
    fillText: vi.fn((...args: unknown[]) => calls.push({ method: 'fillText', args })),
    clearRect: vi.fn((...args: unknown[]) => calls.push({ method: 'clearRect', args })),
    drawImage: vi.fn((...args: unknown[]) => calls.push({ method: 'drawImage', args })),
    fillRect: vi.fn((...args: unknown[]) => calls.push({ method: 'fillRect', args })),
    strokeRect: vi.fn((...args: unknown[]) => calls.push({ method: 'strokeRect', args })),
    measureText: vi.fn(() => ({ width: 10 })),
    font: '',
    fillStyle: '',
    strokeStyle: '',
    canvas: { width: 576, height: 288 } as HTMLCanvasElement,
  } as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
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
    setLocalStorage: vi.fn().mockResolvedValue('true'),
    getLocalStorage: vi.fn().mockResolvedValue(''),
    textContainerUpgrade: vi.fn().mockResolvedValue(undefined),
    updateImageRawData: vi.fn().mockResolvedValue(undefined),
  };
}

/** A mock WS event bus that records subscriptions and lets tests publish payloads. */
function makeMockWsBus() {
  const channels = new Map<string, Array<(payload: unknown) => void>>();
  const unsubSpies = new Map<string, ReturnType<typeof vi.fn>>();
  return {
    subscribe: vi.fn((channel: string, fn: (payload: unknown) => void) => {
      const arr = channels.get(channel) ?? [];
      arr.push(fn);
      channels.set(channel, arr);
      const unsub = vi.fn(() => {
        const cur = channels.get(channel) ?? [];
        const idx = cur.indexOf(fn);
        if (idx >= 0) cur.splice(idx, 1);
      });
      unsubSpies.set(channel, unsub);
      return unsub;
    }),
    publish(channel: string, payload: unknown) {
      for (const fn of [...(channels.get(channel) ?? [])]) fn(payload);
    },
    unsubSpyFor: (channel: string) => unsubSpies.get(channel),
    channelCount: (channel: string) => (channels.get(channel) ?? []).length,
  };
}

/** Snapshot fixture with two events for row/scroll assertions. */
const SNAPSHOT: LogSnapshot = {
  events: [
    {
      id: 'evt-1',
      timestamp: 1_000_000,
      actorName: 'THORIN',
      kind: 'attack',
      description: 'Spada lunga vs Goblin',
      result: { kind: 'hit', value: 23, damage: '12 taglio' },
    },
    {
      id: 'evt-2',
      timestamp: 1_000_500,
      actorName: 'GOBLIN',
      kind: 'attack',
      description: 'Arco corto vs Thorin',
      result: { kind: 'miss', value: 9 },
    },
  ],
};

// ══════════════════════════════════════════════════════════════════════════════
// RCLP-BUDGET / RCLP-MOUNT-CANVAS — the core fix
// ══════════════════════════════════════════════════════════════════════════════

describe('CanvasLogPanel — container budget (RCLP-BUDGET)', () => {
  it('RCLP-BUDGET: getContainerCount() === {image:0,text:0}; capture container is hud-capture', () => {
    const panel = new CanvasLogPanel(
      makeMockBridge() as unknown as EvenAppBridge,
      makeMockGestureBus() as never,
      'it',
    );
    expect(panel.getContainerCount()).toEqual({ image: 0, text: 0 });
    expect(panel.getCaptureContainer()).toBe('hud-capture');
  });
});

describe('CanvasLogPanel — canvas-mode mount (RCLP-MOUNT-CANVAS)', () => {
  /** Minimal EvenAppBridge surface the LayerManager touches in canvas mode. */
  function makeLmBridge() {
    return {
      createStartUpPageContainer: vi.fn().mockResolvedValue(0),
      rebuildPageContainer: vi.fn().mockResolvedValue(true),
      textContainerUpgrade: vi.fn().mockResolvedValue(true),
      updateImageRawData: vi.fn().mockResolvedValue('success'),
      shutDownPageContainer: vi.fn().mockResolvedValue(true),
    };
  }

  /** A capture-providing canvas base layer so the capture invariant is satisfied. */
  function makeCaptureLayer(): Layer {
    return {
      id: 'canvas-capture',
      draw: vi.fn().mockResolvedValue(undefined),
      destroy: vi.fn(),
      getCaptureContainer: () => 'hud-capture',
      getContainerCount: () => ({ image: 0, text: 0 }),
    };
  }

  it('RCLP-MOUNT-CANVAS: mounting CanvasLogPanel in canvas mode does NOT throw panel_mount_budget_exceeded', async () => {
    const bridge = makeLmBridge();
    const lm = new LayerManager(bridge as unknown as EvenAppBridge);
    lm.setRenderMode('canvas');

    // z=0 capture layer first (satisfies capture invariant).
    await lm.bundle([{ type: 'mount', z: ZIndex.Z0_MAP, layer: makeCaptureLayer() }]);

    const panel = new CanvasLogPanel(
      bridge as unknown as EvenAppBridge,
      makeMockGestureBus() as never,
      'it',
    );

    // The bug: the glyph LogPanel ({image:0,text:1}) threw here. The canvas panel
    // ({image:0,text:0}) must mount cleanly.
    await expect(
      lm.bundle([{ type: 'mount', z: ZIndex.Z2_OVERLAY, layer: panel as unknown as Layer }]),
    ).resolves.not.toThrow();
  });

  it('RCLP-MOUNT-CONTROL: the glyph {image:0,text:1} footprint DOES throw in canvas mode (regression guard)', async () => {
    const bridge = makeLmBridge();
    const lm = new LayerManager(bridge as unknown as EvenAppBridge);
    lm.setRenderMode('canvas');
    await lm.bundle([{ type: 'mount', z: ZIndex.Z0_MAP, layer: makeCaptureLayer() }]);

    // A stand-in for the glyph LogPanel footprint — proves the assertion that the
    // canvas panel is designed to avoid is real and active.
    const glyphLike: Layer = {
      id: 'glyph-log-like',
      draw: vi.fn().mockResolvedValue(undefined),
      destroy: vi.fn(),
      getContainerCount: () => ({ image: 0, text: 1 }),
    };

    await expect(
      lm.bundle([{ type: 'mount', z: ZIndex.Z2_OVERLAY, layer: glyphLike }]),
    ).rejects.toMatchObject({ code: 'panel_mount_budget_exceeded' });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// RCLP-SC / RCLP-ROWS — CanvasLayer lifecycle + row reuse
// ══════════════════════════════════════════════════════════════════════════════

describe('CanvasLogPanel — CanvasLayer lifecycle (RCLP-SC)', () => {
  it('RCLP-SC1: attachCanvas with null-ctx degrades gracefully (no throw)', async () => {
    const panel = new CanvasLogPanel(
      makeMockBridge() as unknown as EvenAppBridge,
      makeMockGestureBus() as never,
      'it',
    );
    const nullCtxCanvas = { getContext: vi.fn(() => null) } as unknown as HTMLCanvasElement;
    await expect(panel.attachCanvas(nullCtxCanvas)).resolves.toBeUndefined();
    expect(() => panel.paint()).not.toThrow();
  });

  it('RCLP-SC2: isDirty() true before paint(); false after paint()', () => {
    const panel = new CanvasLogPanel(
      makeMockBridge() as unknown as EvenAppBridge,
      makeMockGestureBus() as never,
      'it',
    );
    const { ctx } = makeFakeCtx();
    // Inject ctx via the same shape attachCanvas would set.
    (panel as unknown as { _ctx: CanvasRenderingContext2D })._ctx = ctx;
    expect(panel.isDirty()).toBe(true);
    panel.paint();
    expect(panel.isDirty()).toBe(false);
  });

  it('RCLP-SC3: draw() resolves (compositor drives paint directly)', async () => {
    const panel = new CanvasLogPanel(
      makeMockBridge() as unknown as EvenAppBridge,
      makeMockGestureBus() as never,
      'it',
    );
    await expect(panel.draw()).resolves.toBeUndefined();
  });

  it('RCLP-ROWS: getRenderedRows() returns 18 rows reusing renderLogContent (empty state)', () => {
    const panel = new CanvasLogPanel(
      makeMockBridge() as unknown as EvenAppBridge,
      makeMockGestureBus() as never,
      'it',
    );
    const rows = panel.getRenderedRows();
    expect(rows).toHaveLength(18);
  });

  it('RCLP-PAINT: paint() draws each row via fillText after a snapshot', async () => {
    const panel = new CanvasLogPanel(
      makeMockBridge() as unknown as EvenAppBridge,
      makeMockGestureBus() as never,
      'it',
    );
    const wsBus = makeMockWsBus();
    panel.setWsEventBus(wsBus as never);
    await panel.onMount();
    wsBus.publish(LOG_DELTA_TYPE, SNAPSHOT);

    const { ctx, calls } = makeFakeCtx();
    (panel as unknown as { _ctx: CanvasRenderingContext2D })._ctx = ctx;
    panel.paint();

    const fillTexts = calls.filter((c) => c.method === 'fillText').map((c) => c.args[0] as string);
    // One actor name must appear in the painted rows.
    expect(fillTexts.some((t) => t.includes('THORIN'))).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// RCLP-DELTA — log delta validation
// ══════════════════════════════════════════════════════════════════════════════

describe('CanvasLogPanel — log delta (RCLP-DELTA)', () => {
  it('RCLP-DELTA-VALID: a valid log.delta updates the rendered rows', async () => {
    const panel = new CanvasLogPanel(
      makeMockBridge() as unknown as EvenAppBridge,
      makeMockGestureBus() as never,
      'it',
    );
    const wsBus = makeMockWsBus();
    panel.setWsEventBus(wsBus as never);
    await panel.onMount();

    wsBus.publish(LOG_DELTA_TYPE, SNAPSHOT);
    const joined = panel.getRenderedRows().join('\n');
    expect(joined).toContain('THORIN');
    expect(panel.isDirty()).toBe(true);
  });

  it('RCLP-DELTA-MALFORMED: a malformed payload is dropped (rows unchanged, no throw)', async () => {
    const panel = new CanvasLogPanel(
      makeMockBridge() as unknown as EvenAppBridge,
      makeMockGestureBus() as never,
      'it',
    );
    const wsBus = makeMockWsBus();
    panel.setWsEventBus(wsBus as never);
    await panel.onMount();

    const before = panel.getRenderedRows().join('\n');
    expect(() => wsBus.publish(LOG_DELTA_TYPE, { not: 'a log snapshot' })).not.toThrow();
    const after = panel.getRenderedRows().join('\n');
    expect(after).toBe(before);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// RCLP-GEST — gesture handling
// ══════════════════════════════════════════════════════════════════════════════

describe('CanvasLogPanel — gestures (RCLP-GEST)', () => {
  it('RCLP-GEST-SCROLL: scroll-down then scroll-up move the scroll offset (boundary tracking)', async () => {
    const bus = makeMockGestureBus();
    const panel = new CanvasLogPanel(
      makeMockBridge() as unknown as EvenAppBridge,
      bus as never,
      'it',
    );
    const wsBus = makeMockWsBus();
    panel.setWsEventBus(wsBus as never);
    await panel.onMount();
    wsBus.publish(LOG_DELTA_TYPE, SNAPSHOT);

    expect(panel.isAtTopBoundary()).toBe(true);
    bus.publish({ kind: 'scroll', direction: 'down' });
    expect(panel.isAtTopBoundary()).toBe(false);
    bus.publish({ kind: 'scroll', direction: 'up' });
    expect(panel.isAtTopBoundary()).toBe(true);
  });

  it('RCLP-GEST-NOOP: tap and double-tap are no-ops (no throw)', async () => {
    const bus = makeMockGestureBus();
    const panel = new CanvasLogPanel(
      makeMockBridge() as unknown as EvenAppBridge,
      bus as never,
      'it',
    );
    await panel.onMount();
    expect(() => bus.publish({ kind: 'tap' })).not.toThrow();
    expect(() => bus.publish({ kind: 'double-tap' })).not.toThrow();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// RCLP-BUS — subscription lifecycle
// ══════════════════════════════════════════════════════════════════════════════

describe('CanvasLogPanel — subscription lifecycle (RCLP-BUS)', () => {
  it('RCLP-BUS-1: onMount subscribes to gesture bus + LOG_DELTA_TYPE; onUnmount unsubscribes', async () => {
    const bus = makeMockGestureBus();
    const wsBus = makeMockWsBus();
    const panel = new CanvasLogPanel(
      makeMockBridge() as unknown as EvenAppBridge,
      bus as never,
      'it',
    );
    panel.setWsEventBus(wsBus as never);

    await panel.onMount();
    expect(bus.size()).toBe(1);
    expect(wsBus.channelCount(LOG_DELTA_TYPE)).toBe(1);

    await panel.onUnmount();
    expect(bus.size()).toBe(0);
    expect(wsBus.channelCount(LOG_DELTA_TYPE)).toBe(0);
  });

  it('RCLP-BUS-2: onUnmount is idempotent (no double-free, no throw)', async () => {
    const wsBus = makeMockWsBus();
    const panel = new CanvasLogPanel(
      makeMockBridge() as unknown as EvenAppBridge,
      makeMockGestureBus() as never,
      'it',
    );
    panel.setWsEventBus(wsBus as never);
    await panel.onMount();
    await panel.onUnmount();
    await expect(panel.onUnmount()).resolves.toBeUndefined();
    const unsubSpy = wsBus.unsubSpyFor(LOG_DELTA_TYPE);
    expect(unsubSpy).toHaveBeenCalledOnce();
  });

  it('RCLP-BUS-3: onMount without setWsEventBus is a no-op for log.delta (backward compat)', async () => {
    const panel = new CanvasLogPanel(
      makeMockBridge() as unknown as EvenAppBridge,
      makeMockGestureBus() as never,
      'it',
    );
    await expect(panel.onMount()).resolves.toBeUndefined();
    await expect(panel.onUnmount()).resolves.toBeUndefined();
  });
});
