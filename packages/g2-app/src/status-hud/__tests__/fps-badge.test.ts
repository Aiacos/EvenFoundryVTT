/**
 * Feature 001 D4 — composited FPS badge tests (INV-1: on-screen in all 4 corners,
 * smaller font, no overlap with the status card).
 */

import { describe, expect, it, vi } from 'vitest';
import { _drawFpsBadge } from '../canvas-status-hud-layer.js';
import { FPS_CORNERS, HUD_HEIGHT, HUD_WIDTH } from '../fps-badge-geometry.js';

function fakeCtx() {
  const fillRect = vi.fn();
  const strokeRect = vi.fn();
  const fillText = vi.fn();
  const ctx = {
    fillRect,
    strokeRect,
    fillText,
    fillStyle: '',
    strokeStyle: '',
    font: '',
  } as unknown as OffscreenCanvasRenderingContext2D;
  return { ctx, fillRect, strokeRect, fillText };
}

describe('_drawFpsBadge — composited FPS badge', () => {
  it('renders fully on-screen in all four corners (no card)', () => {
    for (const corner of FPS_CORNERS) {
      const { ctx } = fakeCtx();
      const rect = _drawFpsBadge(ctx, '30fps', corner, '16px VT323', 0);
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.y).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.w).toBeLessThanOrEqual(HUD_WIDTH);
      expect(rect.y + rect.h).toBeLessThanOrEqual(HUD_HEIGHT);
    }
  });

  it('uses a smaller font than the PF/CA/LV card (13px badge vs 18px card line)', () => {
    const { ctx } = fakeCtx();
    _drawFpsBadge(ctx, '30fps', 'bottom-right', '16px VT323', 0);
    expect(ctx.font).toBe('13px VT323');
  });

  it('falls back to monospace family when the resolved font has no family', () => {
    const { ctx } = fakeCtx();
    _drawFpsBadge(ctx, '30fps', 'top-left', '16px', 0);
    expect(ctx.font).toBe('13px monospace');
  });

  it('draws the badge text + plate + border', () => {
    const { ctx, fillRect, strokeRect, fillText } = fakeCtx();
    _drawFpsBadge(ctx, '42fps', 'bottom-left', '16px VT323', 0);
    expect(fillRect).toHaveBeenCalledTimes(1);
    expect(strokeRect).toHaveBeenCalledTimes(1);
    expect(fillText).toHaveBeenCalledWith('42fps', expect.any(Number), expect.any(Number));
  });

  it('top-right: yields BELOW the status card so they never overlap', () => {
    const { ctx } = fakeCtx();
    const cardLines = 3; // PF/CA/LV
    const rect = _drawFpsBadge(ctx, '30fps', 'top-right', '16px VT323', cardLines);
    // Card top margin 6 + (pad 6*2 + 3*18) = 6 + 66 = 72 → badge must start below.
    expect(rect.y).toBeGreaterThanOrEqual(72);
    expect(rect.y + rect.h).toBeLessThanOrEqual(HUD_HEIGHT);
  });

  it('top-right with no card sits at the top margin (no yield needed)', () => {
    const { ctx } = fakeCtx();
    const rect = _drawFpsBadge(ctx, '30fps', 'top-right', '16px VT323', 0);
    expect(rect.y).toBeLessThan(20);
  });
});
