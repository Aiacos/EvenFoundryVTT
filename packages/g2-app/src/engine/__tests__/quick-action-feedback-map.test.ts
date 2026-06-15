/**
 * Unit tests for the Quick Action `[M] Map control` canvas-mode feedback helper
 * (`buildMapAlreadyFullscreenToast` from `../quick-action-feedback.ts`).
 *
 * Regression cover for a live-sim defect (canvas-default boot): selecting
 * `[M] Mappa` routed into the legacy glyph raster toggle, which floods
 * `updateImageRawData ... sendFailed` and blanks the display until restart. In
 * canvas mode the map is ALREADY the z=0 full-screen background, so `[M]` MUST
 * be a no-op that surfaces a toast and NEVER pushes glyph tiles.
 *
 * The "no glyph raster push" guarantee is asserted by feeding the canvas-mode
 * toast through a real `ToastQueueLayer` against a spy bridge and verifying ONLY
 * `textContainerUpgrade` is called — `updateImageRawData` (the glyph tile push
 * that floods `sendFailed`) is never invoked.
 *
 * @see ../quick-action-feedback.ts
 * @see ../../status-hud/toast-queue-layer.ts
 */
import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';
import { describe, expect, it, vi } from 'vitest';
import { ToastQueueLayer } from '../../status-hud/toast-queue-layer.js';
import { ToastSchema } from '../../status-hud/toast-types.js';
import {
  buildMapAlreadyFullscreenToast,
  MAP_ALREADY_FULLSCREEN_MESSAGE,
} from '../quick-action-feedback.js';

function makeSpyBridge() {
  return {
    textContainerUpgrade: vi.fn().mockResolvedValue(true),
    updateImageRawData: vi.fn().mockResolvedValue(true),
  } as unknown as EvenAppBridge & {
    textContainerUpgrade: ReturnType<typeof vi.fn>;
    updateImageRawData: ReturnType<typeof vi.fn>;
  };
}

describe('buildMapAlreadyFullscreenToast', () => {
  it('produces a schema-valid info toast with the IT message for locale "it"', () => {
    const toast = buildMapAlreadyFullscreenToast('it', 1000);
    expect(() => ToastSchema.parse(toast)).not.toThrow();
    expect(toast.severity).toBe('info');
    expect(toast.message).toBe(MAP_ALREADY_FULLSCREEN_MESSAGE.it);
    expect(toast.emittedAt).toBe(1000);
    expect(toast.id).toBe('map-mode-canvas-1000');
  });

  it('falls back to the EN canonical message for every non-IT locale', () => {
    for (const locale of ['en', 'de', 'es', 'fr', 'pt-br'] as const) {
      const toast = buildMapAlreadyFullscreenToast(locale, 1);
      expect(toast.message).toBe(MAP_ALREADY_FULLSCREEN_MESSAGE.en);
    }
  });

  it('keeps both locale messages within the 38-char ToastSchema budget', () => {
    expect(MAP_ALREADY_FULLSCREEN_MESSAGE.it.length).toBeLessThanOrEqual(38);
    expect(MAP_ALREADY_FULLSCREEN_MESSAGE.en.length).toBeLessThanOrEqual(38);
  });

  it('renders via the toast text surface only — never the glyph image-raster push', async () => {
    const bridge = makeSpyBridge();
    const toastQueue = new ToastQueueLayer({ bridge });

    // Simulate the canvas-mode `[M]` no-op: enqueue the feedback toast.
    toastQueue.enqueue(buildMapAlreadyFullscreenToast('it', 5));
    await toastQueue.draw();

    // Toast surface used (the user gets feedback)...
    expect(bridge.textContainerUpgrade).toHaveBeenCalled();
    // ...and the glyph raster tile push (the path that floods sendFailed and
    // blanks the display) is NEVER touched.
    expect(bridge.updateImageRawData).not.toHaveBeenCalled();
  });
});
