/**
 * Unit tests for the Quick Action `[A] Action` feedback helper
 * (`buildActionPendingToast` from `../quick-action-feedback.ts`).
 *
 * Regression cover for a live-sim defect (canvas-default boot): selecting
 * `[A] Azione` emitted only a silent `console.warn`, leaving the user with no
 * feedback. It now surfaces a non-blocking toast announcing the panel is not
 * yet available.
 *
 * @see ../quick-action-feedback.ts
 * @see ../../status-hud/toast-queue-layer.ts
 */
import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';
import { describe, expect, it, vi } from 'vitest';
import { ToastQueueLayer } from '../../status-hud/toast-queue-layer.js';
import { ToastSchema } from '../../status-hud/toast-types.js';
import { ACTION_PENDING_MESSAGE, buildActionPendingToast } from '../quick-action-feedback.js';

function makeSpyBridge() {
  return {
    textContainerUpgrade: vi.fn().mockResolvedValue(true),
    updateImageRawData: vi.fn().mockResolvedValue(true),
  } as unknown as EvenAppBridge & {
    textContainerUpgrade: ReturnType<typeof vi.fn>;
    updateImageRawData: ReturnType<typeof vi.fn>;
  };
}

describe('buildActionPendingToast', () => {
  it('produces a schema-valid info toast with the IT message for locale "it"', () => {
    const toast = buildActionPendingToast('it', 2000);
    expect(() => ToastSchema.parse(toast)).not.toThrow();
    expect(toast.severity).toBe('info');
    expect(toast.message).toBe(ACTION_PENDING_MESSAGE.it);
    expect(toast.emittedAt).toBe(2000);
    expect(toast.id).toBe('action-pending-2000');
  });

  it('falls back to the EN canonical message for every non-IT locale', () => {
    for (const locale of ['en', 'de', 'es', 'fr', 'pt-br'] as const) {
      const toast = buildActionPendingToast(locale, 1);
      expect(toast.message).toBe(ACTION_PENDING_MESSAGE.en);
    }
  });

  it('keeps both locale messages within the 38-char ToastSchema budget', () => {
    expect(ACTION_PENDING_MESSAGE.it.length).toBeLessThanOrEqual(38);
    expect(ACTION_PENDING_MESSAGE.en.length).toBeLessThanOrEqual(38);
  });

  it('surfaces a visible toast (replaces the previous silent console.warn)', async () => {
    const bridge = makeSpyBridge();
    const toastQueue = new ToastQueueLayer({ bridge });

    toastQueue.enqueue(buildActionPendingToast('en', 7));
    await toastQueue.draw();

    expect(bridge.textContainerUpgrade).toHaveBeenCalled();
    expect(bridge.updateImageRawData).not.toHaveBeenCalled();
  });
});
