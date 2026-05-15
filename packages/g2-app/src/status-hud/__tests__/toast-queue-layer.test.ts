/**
 * Unit tests for ToastQueueLayer (Phase 4b Plan 03 Task 1).
 *
 * Covers (per 04B-03-PLAN.md `<behavior>`):
 *   - TT-1..TT-5: ToastSchema + SEVERITY_PREFIX + runtime constants
 *   - TQL-FIFO-01..08: visibility, FIFO ordering, squash badge, dwell cycle
 *   - TQL-PARSE-01..02: safeParse trust boundary
 *   - TQL-CAP-01: soft cap drop-oldest
 *   - TQL-LAYER-01..04: Layer interface contract + destroy timer cleanup
 *   - TQL-DELTA-01..02: bridge call short-circuit on identical content
 *
 * The Fireball + 8 saves stress (SC #3) lives in TQL-FIFO-05 (9 toasts → visible
 * 2 + `[+7]` badge on head).
 *
 * @see .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-03-PLAN.md Task 1
 * @see .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04b-CONTEXT.md §Area 5
 * @see .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-RESEARCH.md §Q5
 */
import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastQueueLayer } from '../toast-queue-layer.js';
import {
  SEVERITY_PREFIX,
  TOAST_BUFFER_SOFT_CAP,
  TOAST_DWELL_MS,
  TOAST_ROW_WIDTH,
  TOAST_VISIBLE_CAPACITY,
  type Toast,
  ToastSchema,
} from '../toast-types.js';

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function makeMockBridge() {
  return {
    textContainerUpgrade: vi.fn().mockResolvedValue(true),
  } as unknown as EvenAppBridge & { textContainerUpgrade: ReturnType<typeof vi.fn> };
}

function makeToast(overrides: Partial<Toast> = {}): Toast {
  return {
    id: overrides.id ?? `toast-${Math.random().toString(36).slice(2, 10)}`,
    severity: overrides.severity ?? 'info',
    message: overrides.message ?? 'Default message',
    emittedAt: overrides.emittedAt ?? 0,
  };
}

/**
 * Extract the most recent textContainerUpgrade call's content payload.
 * Returns null when the bridge has not been called.
 */
function lastCallContent(
  bridge: EvenAppBridge & { textContainerUpgrade: ReturnType<typeof vi.fn> },
): string | null {
  const calls = bridge.textContainerUpgrade.mock.calls;
  if (calls.length === 0) {
    return null;
  }
  const lastCall = calls[calls.length - 1];
  if (lastCall === undefined) {
    return null;
  }
  const arg = lastCall[0] as { content?: string };
  return arg?.content ?? null;
}

/**
 * Flush only the microtask queue without advancing fake-timer time.
 *
 * `enqueue()` schedules `void this._redrawIfChanged()` (a pending async call) —
 * we need to let that resolve so the bridge mock captures the call. Using
 * `vi.runAllTimersAsync()` instead would also fire the 3-second dwell timer
 * and destroy the test state. `advanceTimersByTimeAsync(0)` is the documented
 * Vitest idiom for "drain pending microtasks but don't advance virtual time".
 */
async function flushMicrotasks(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
}

// ──────────────────────────────────────────────────────────────────────────────
// TT — toast-types module
// ──────────────────────────────────────────────────────────────────────────────

describe('toast-types — Zod schema + constants', () => {
  it('TT-1: ToastSchema accepts a well-formed payload', () => {
    const parsed = ToastSchema.safeParse({
      id: 'a',
      severity: 'info',
      message: 'x',
      emittedAt: 0,
    });
    expect(parsed.success).toBe(true);
  });

  it('TT-2: ToastSchema rejects invalid severity', () => {
    const parsed = ToastSchema.safeParse({
      id: 'a',
      severity: 'fatal',
      message: 'x',
      emittedAt: 0,
    });
    expect(parsed.success).toBe(false);
  });

  it('TT-3: ToastSchema rejects message > 38 chars', () => {
    const parsed = ToastSchema.safeParse({
      id: 'a',
      severity: 'info',
      message: 'x'.repeat(39),
      emittedAt: 0,
    });
    expect(parsed.success).toBe(false);
  });

  it('TT-4: SEVERITY_PREFIX has language-neutral 3-char prefixes', () => {
    expect(SEVERITY_PREFIX.info).toBe('i: ');
    expect(SEVERITY_PREFIX.warn).toBe('!: ');
    expect(SEVERITY_PREFIX.error).toBe('x: ');
  });

  it('TT-5: Runtime constants match UI-SPEC §3.2 budgets', () => {
    expect(TOAST_VISIBLE_CAPACITY).toBe(2);
    expect(TOAST_DWELL_MS).toBe(3000);
    expect(TOAST_BUFFER_SOFT_CAP).toBe(100);
    expect(TOAST_ROW_WIDTH).toBe(42);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// TQL-FIFO — visibility + FIFO ordering + squash badge + dwell cycle
// ──────────────────────────────────────────────────────────────────────────────

describe('ToastQueueLayer — FIFO + squash + dwell', () => {
  let activeLayer: ToastQueueLayer | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    activeLayer?.destroy();
    activeLayer = null;
    vi.useRealTimers();
  });

  it('TQL-FIFO-01: fresh layer has empty visible + buffered counts', () => {
    const bridge = makeMockBridge();
    const layer = new ToastQueueLayer({ bridge });
    activeLayer = layer;
    expect(layer.getVisibleCount()).toBe(0);
    expect(layer.getBufferedCount()).toBe(0);
  });

  it('TQL-FIFO-02: 1 enqueue → 1 visible + padded row1 + 1 bridge call', async () => {
    const bridge = makeMockBridge();
    const layer = new ToastQueueLayer({ bridge });
    activeLayer = layer;
    layer.enqueue(makeToast({ id: 't1', severity: 'info', message: 'Danno 12 slashing' }));
    await flushMicrotasks();

    expect(layer.getVisibleCount()).toBe(1);
    expect(layer.getBufferedCount()).toBe(0);
    expect(bridge.textContainerUpgrade).toHaveBeenCalledTimes(1);
    const content = lastCallContent(bridge);
    expect(content).not.toBeNull();
    const lines = (content as string).split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe(
      `i: Danno 12 slashing${' '.repeat(TOAST_ROW_WIDTH - 'i: Danno 12 slashing'.length)}`,
    );
    expect(lines[1]).toBe(' '.repeat(TOAST_ROW_WIDTH));
  });

  it('TQL-FIFO-03: 2 enqueues → 2 visible / 0 buffered / both rows populated', async () => {
    const bridge = makeMockBridge();
    const layer = new ToastQueueLayer({ bridge });
    activeLayer = layer;
    layer.enqueue(makeToast({ id: 't1', message: 'Tiro Salv. DES superato' }));
    layer.enqueue(makeToast({ id: 't2', message: 'Danno 12 slashing' }));
    await flushMicrotasks();

    expect(layer.getVisibleCount()).toBe(2);
    expect(layer.getBufferedCount()).toBe(0);
    const content = lastCallContent(bridge) as string;
    const lines = content.split('\n');
    expect(lines[0]?.startsWith('i: Tiro Salv. DES superato')).toBe(true);
    expect(lines[1]?.startsWith('i: Danno 12 slashing')).toBe(true);
    // No squash badge on the head when buffered=0
    expect(lines[0]?.includes('[+')).toBe(false);
  });

  it('TQL-FIFO-04: 3rd enqueue when 2 visible → buffered=1 + head row has " [+1]" suffix', async () => {
    const bridge = makeMockBridge();
    const layer = new ToastQueueLayer({ bridge });
    activeLayer = layer;
    for (let i = 0; i < 3; i++) {
      layer.enqueue(makeToast({ id: `t${i}`, message: `m${i}` }));
    }
    await flushMicrotasks();

    expect(layer.getVisibleCount()).toBe(2);
    expect(layer.getBufferedCount()).toBe(1);
    const content = lastCallContent(bridge) as string;
    const lines = content.split('\n');
    expect(lines[0]?.includes(' [+1]')).toBe(true);
    expect(lines[1]?.includes(' [+')).toBe(false);
  });

  it('TQL-FIFO-05: Fireball + 8 saves stress (9 toasts) → visible 2 / buffered 7 / head " [+7]" badge', async () => {
    const bridge = makeMockBridge();
    const layer = new ToastQueueLayer({ bridge });
    activeLayer = layer;
    for (let i = 0; i < 9; i++) {
      layer.enqueue(makeToast({ id: `fireball-${i}`, message: `Save ${i}` }));
    }
    await flushMicrotasks();

    expect(layer.getVisibleCount()).toBe(2);
    expect(layer.getBufferedCount()).toBe(7);
    const content = lastCallContent(bridge) as string;
    expect(content.split('\n')[0]?.includes(' [+7]')).toBe(true);
  });

  it('TQL-FIFO-06: dwell-out cycle promotes buffered → visible, badge resolves', async () => {
    const bridge = makeMockBridge();
    const layer = new ToastQueueLayer({ bridge });
    activeLayer = layer;
    layer.enqueue(makeToast({ id: 'h', message: 'head' }));
    layer.enqueue(makeToast({ id: 't', message: 'tail' }));
    layer.enqueue(makeToast({ id: 'q', message: 'queued' }));
    await flushMicrotasks();
    // 2 visible + 1 buffered; head row has [+1]
    expect(layer.getBufferedCount()).toBe(1);
    expect((lastCallContent(bridge) as string).split('\n')[0]?.includes(' [+1]')).toBe(true);

    // Advance one full dwell window — head (id=h) expires; tail promotes; queued
    // promotes to fill the new visible slot.
    await vi.advanceTimersByTimeAsync(TOAST_DWELL_MS);

    expect(layer.getVisibleCount()).toBe(2);
    expect(layer.getBufferedCount()).toBe(0);
    const content = lastCallContent(bridge) as string;
    const lines = content.split('\n');
    // After dwell: head is 'tail', tail is 'queued'; no badge.
    expect(lines[0]?.startsWith('i: tail')).toBe(true);
    expect(lines[1]?.startsWith('i: queued')).toBe(true);
    expect(content.includes(' [+')).toBe(false);
  });

  it('TQL-FIFO-07: badge decrements as buffered drains across dwell ticks', async () => {
    const bridge = makeMockBridge();
    const layer = new ToastQueueLayer({ bridge });
    activeLayer = layer;
    // 2 visible + 3 buffered = 5 total; head shows [+3]
    for (let i = 0; i < 5; i++) {
      layer.enqueue(makeToast({ id: `n${i}`, message: `m${i}` }));
    }
    await flushMicrotasks();
    expect(layer.getBufferedCount()).toBe(3);
    expect((lastCallContent(bridge) as string).split('\n')[0]?.includes(' [+3]')).toBe(true);

    // One dwell tick: head expires, one buffered promotes → buffered=2 → [+2]
    await vi.advanceTimersByTimeAsync(TOAST_DWELL_MS);
    expect(layer.getBufferedCount()).toBe(2);
    expect((lastCallContent(bridge) as string).split('\n')[0]?.includes(' [+2]')).toBe(true);
  });

  it('TQL-FIFO-08: no badge when buffered=0 (1 or 2 visible only)', async () => {
    const bridge = makeMockBridge();
    const layer = new ToastQueueLayer({ bridge });
    activeLayer = layer;
    layer.enqueue(makeToast({ id: 'a', message: 'a' }));
    layer.enqueue(makeToast({ id: 'b', message: 'b' }));
    await flushMicrotasks();
    const content = lastCallContent(bridge) as string;
    expect(content.includes('[+')).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// TQL-PARSE — safeParse trust boundary
// ──────────────────────────────────────────────────────────────────────────────

describe('ToastQueueLayer — safeParse trust boundary', () => {
  let activeLayer: ToastQueueLayer | null = null;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    activeLayer?.destroy();
    activeLayer = null;
    warnSpy.mockRestore();
    vi.useRealTimers();
  });

  it('TQL-PARSE-01: invalid severity payload → warn + no state change', async () => {
    const bridge = makeMockBridge();
    const layer = new ToastQueueLayer({ bridge });
    activeLayer = layer;
    layer.enqueue({
      id: 'bad',
      severity: 'fatal' as unknown as Toast['severity'],
      message: 'oops',
      emittedAt: 0,
    });
    await flushMicrotasks();
    expect(layer.getVisibleCount()).toBe(0);
    expect(layer.getBufferedCount()).toBe(0);
    expect(bridge.textContainerUpgrade).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    // Confirm the warn payload is the layer's own message (not a thrown error).
    const messages: string[] = warnSpy.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(messages.some((m) => m.includes('invalid Toast payload'))).toBe(true);
  });

  it('TQL-PARSE-02: severity "warn" renders the "!: " prefix', async () => {
    const bridge = makeMockBridge();
    const layer = new ToastQueueLayer({ bridge });
    activeLayer = layer;
    layer.enqueue(makeToast({ id: 'w1', severity: 'warn', message: 'HP basso' }));
    await flushMicrotasks();
    const content = lastCallContent(bridge) as string;
    expect(content.startsWith('!: HP basso')).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// TQL-CAP — soft cap drop-oldest
// ──────────────────────────────────────────────────────────────────────────────

describe('ToastQueueLayer — soft cap DoS mitigation', () => {
  let activeLayer: ToastQueueLayer | null = null;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    activeLayer?.destroy();
    activeLayer = null;
    warnSpy.mockRestore();
    vi.useRealTimers();
  });

  it('TQL-CAP-01: enqueueing past the soft cap drops oldest queued + warns', async () => {
    const bridge = makeMockBridge();
    const layer = new ToastQueueLayer({ bridge });
    activeLayer = layer;
    // 2 visible + 100 buffered = 102 total at cap (one slot above the 99
    // badge-display ceiling — the head will display [+99] and emit the
    // display-cap telemetry warn, which is orthogonal to the soft-cap warn).
    const total = TOAST_VISIBLE_CAPACITY + TOAST_BUFFER_SOFT_CAP;
    for (let i = 0; i < total; i++) {
      layer.enqueue(makeToast({ id: `c${i}`, message: `m${i % 10}` }));
    }
    await flushMicrotasks();
    expect(layer.getVisibleCount()).toBe(TOAST_VISIBLE_CAPACITY);
    expect(layer.getBufferedCount()).toBe(TOAST_BUFFER_SOFT_CAP);
    // No soft-cap warn yet — we are AT the cap, not over it. (A separate
    // display-cap warn at count>99 may already have fired; we filter for the
    // specific soft-cap message.)
    const messagesBefore: string[] = warnSpy.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(messagesBefore.some((m) => m.includes('soft cap exceeded'))).toBe(false);

    // One more enqueue exceeds the cap — oldest in buffered drops + soft-cap warn fires.
    layer.enqueue(makeToast({ id: 'overflow', message: 'extra' }));
    await flushMicrotasks();
    expect(layer.getBufferedCount()).toBe(TOAST_BUFFER_SOFT_CAP);
    const messagesAfter: string[] = warnSpy.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(messagesAfter.some((m) => m.includes('soft cap exceeded'))).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// TQL-LAYER — Layer interface contract + destroy
// ──────────────────────────────────────────────────────────────────────────────

describe('ToastQueueLayer — Layer interface contract', () => {
  it('TQL-LAYER-01: id === "toast-queue"', () => {
    const layer = new ToastQueueLayer({ bridge: makeMockBridge() });
    expect(layer.id).toBe('toast-queue');
    layer.destroy();
  });

  it('TQL-LAYER-02: getCaptureContainer is undefined (render-only z=1.5)', () => {
    const layer = new ToastQueueLayer({ bridge: makeMockBridge() });
    expect(
      (layer as unknown as { getCaptureContainer?: unknown }).getCaptureContainer,
    ).toBeUndefined();
    layer.destroy();
  });

  it('TQL-LAYER-03: getContainerCount returns { image: 0, text: 1 } (Plan 01 Strategy A)', () => {
    const layer = new ToastQueueLayer({ bridge: makeMockBridge() });
    expect(layer.getContainerCount()).toEqual({ image: 0, text: 1 });
    layer.destroy();
  });

  it('TQL-LAYER-04: destroy() clears every active dwell timer + is idempotent', async () => {
    vi.useFakeTimers();
    try {
      const bridge = makeMockBridge();
      const layer = new ToastQueueLayer({ bridge });
      layer.enqueue(makeToast({ id: 't1', message: 'a' }));
      layer.enqueue(makeToast({ id: 't2', message: 'b' }));
      // Drain microtasks (the pending bridge upgrade promise) without firing
      // the 3 s dwell timer — we want the dwell timers to still be pending so
      // destroy() has work to do.
      await vi.advanceTimersByTimeAsync(0);
      // Before destroy, two dwell timers are pending (one per visible toast).
      expect(vi.getTimerCount()).toBeGreaterThan(0);

      layer.destroy();
      expect(vi.getTimerCount()).toBe(0);
      expect(layer.getVisibleCount()).toBe(0);
      expect(layer.getBufferedCount()).toBe(0);

      // Idempotent — second call is a no-op (no throw).
      expect(() => {
        layer.destroy();
      }).not.toThrow();
    } finally {
      vi.useRealTimers();
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// TQL-DELTA — bridge call short-circuit on identical content
// ──────────────────────────────────────────────────────────────────────────────

describe('ToastQueueLayer — delta short-circuit', () => {
  let activeLayer: ToastQueueLayer | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    activeLayer?.destroy();
    activeLayer = null;
    vi.useRealTimers();
  });

  it('TQL-DELTA-01: identical content produces a single bridge call', async () => {
    const bridge = makeMockBridge();
    const layer = new ToastQueueLayer({ bridge });
    activeLayer = layer;
    layer.enqueue(makeToast({ id: 'd1', message: 'same' }));
    await flushMicrotasks();
    // Calling draw() explicitly with no state change should NOT issue another upgrade.
    await layer.draw();
    expect(bridge.textContainerUpgrade).toHaveBeenCalledTimes(1);
  });

  it('TQL-DELTA-02: badge appearance on 3rd enqueue triggers another bridge call', async () => {
    const bridge = makeMockBridge();
    const layer = new ToastQueueLayer({ bridge });
    activeLayer = layer;
    layer.enqueue(makeToast({ id: 'a', message: 'm-a' }));
    layer.enqueue(makeToast({ id: 'b', message: 'm-b' }));
    await flushMicrotasks();
    const callsAfterTwo = bridge.textContainerUpgrade.mock.calls.length;
    // 3rd enqueue triggers buffered=1 → squash badge appears on head; content changes.
    layer.enqueue(makeToast({ id: 'c', message: 'm-c' }));
    await flushMicrotasks();
    expect(bridge.textContainerUpgrade.mock.calls.length).toBeGreaterThan(callsAfterTwo);
  });
});
