/**
 * CanvasToastLayer tests — queue/dwell semantics, dirty + onDirty triggers,
 * canvas paint (strip when visible / cleared when empty), and the degraded
 * (null-context) test-env path.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CanvasToastLayer } from './canvas-toast-layer.js';
import { TOAST_DWELL_MS, type Toast } from './toast-types.js';

function toast(id: string, message = 'hello', severity: Toast['severity'] = 'info'): Toast {
  return { id, severity, message, emittedAt: 1 };
}

/** Minimal mock 2D context capturing the draw calls. */
function makeMockCanvas() {
  const ctx = {
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    fillText: vi.fn(),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    font: '',
  };
  return {
    canvas: { getContext: () => ctx } as unknown as OffscreenCanvas,
    ctx,
  };
}

describe('CanvasToastLayer', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('CTL-1: enqueue shows the toast immediately, marks dirty, calls onDirty', () => {
    const onDirty = vi.fn();
    const layer = new CanvasToastLayer({ onDirty });
    layer.enqueue(toast('a'));
    expect(layer.getVisibleForTest()?.id).toBe('a');
    expect(layer.isDirty()).toBe(true);
    expect(onDirty).toHaveBeenCalledTimes(1);
  });

  it('CTL-2: a second enqueue buffers (visible unchanged) and FIFO-promotes on dwell-out', () => {
    const onDirty = vi.fn();
    const layer = new CanvasToastLayer({ onDirty });
    layer.enqueue(toast('a'));
    layer.enqueue(toast('b'));
    expect(layer.getVisibleForTest()?.id).toBe('a'); // still the first
    vi.advanceTimersByTime(TOAST_DWELL_MS);
    expect(layer.getVisibleForTest()?.id).toBe('b'); // promoted
    expect(onDirty).toHaveBeenCalledTimes(2); // activate a, activate b
  });

  it('CTL-3: dwell-out with empty buffer clears the strip + marks dirty + onDirty', () => {
    const onDirty = vi.fn();
    const layer = new CanvasToastLayer({ onDirty });
    layer.enqueue(toast('a'));
    onDirty.mockClear();
    vi.advanceTimersByTime(TOAST_DWELL_MS);
    expect(layer.getVisibleForTest()).toBeNull();
    expect(layer.isDirty()).toBe(true);
    expect(onDirty).toHaveBeenCalledTimes(1);
  });

  it('CTL-4: malformed payload is dropped, nothing becomes visible', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const layer = new CanvasToastLayer();
    // empty message violates ToastSchema (min 1)
    layer.enqueue({ id: 'x', severity: 'info', message: '', emittedAt: 1 } as Toast);
    expect(layer.getVisibleForTest()).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('CTL-5: getContainerCount is {image:0, text:0} (canvas layer, not a capture provider)', () => {
    const layer = new CanvasToastLayer();
    expect(layer.getContainerCount()).toEqual({ image: 0, text: 0 });
  });

  it('CTL-6: destroy clears the dwell timer (no late expiry after destroy)', () => {
    const onDirty = vi.fn();
    const layer = new CanvasToastLayer({ onDirty });
    layer.enqueue(toast('a'));
    onDirty.mockClear();
    layer.destroy();
    vi.advanceTimersByTime(TOAST_DWELL_MS * 2);
    expect(onDirty).not.toHaveBeenCalled();
    expect(layer.getVisibleForTest()).toBeNull();
  });

  it('CTL-7: paint draws the strip (fillRect + fillText) when a toast is visible', async () => {
    const { canvas, ctx } = makeMockCanvas();
    const layer = new CanvasToastLayer();
    await layer.attachCanvas(canvas);
    layer.enqueue(toast('a', 'Ciao'));
    layer.paint();
    expect(ctx.clearRect).toHaveBeenCalled();
    expect(ctx.fillRect).toHaveBeenCalled(); // the strip background
    expect(ctx.fillText).toHaveBeenCalled(); // the message text
    expect(layer.isDirty()).toBe(false); // reset at end of paint
  });

  it('CTL-8: paint clears (no strip) when no toast is visible', async () => {
    const { canvas, ctx } = makeMockCanvas();
    const layer = new CanvasToastLayer();
    await layer.attachCanvas(canvas);
    layer.paint(); // nothing enqueued
    expect(ctx.clearRect).toHaveBeenCalled();
    expect(ctx.fillRect).not.toHaveBeenCalled();
    expect(ctx.fillText).not.toHaveBeenCalled();
  });

  it('CTL-9: degraded mode (getContext returns null) — attachCanvas + paint never throw', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const nullCanvas = { getContext: () => null } as unknown as OffscreenCanvas;
    const layer = new CanvasToastLayer();
    await expect(layer.attachCanvas(nullCanvas)).resolves.toBeUndefined();
    layer.enqueue(toast('a'));
    expect(() => layer.paint()).not.toThrow();
    warn.mockRestore();
  });
});
