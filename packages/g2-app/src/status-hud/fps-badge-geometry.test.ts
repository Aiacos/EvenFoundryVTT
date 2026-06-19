import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FPS_CORNER,
  FPS_BADGE_MARGIN,
  fpsBadgeRect,
  HUD_HEIGHT,
  HUD_WIDTH,
  normalizeFpsCorner,
} from './fps-badge-geometry.js';

const SIZE = { w: 40, h: 16 };

function fullyOnScreen(r: { x: number; y: number; w: number; h: number }): boolean {
  return r.x >= 0 && r.y >= 0 && r.x + r.w <= HUD_WIDTH && r.y + r.h <= HUD_HEIGHT;
}

describe('normalizeFpsCorner', () => {
  it('passes through the four valid corners', () => {
    for (const c of ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const) {
      expect(normalizeFpsCorner(c)).toBe(c);
    }
  });

  it('falls back to bottom-right for invalid / absent input', () => {
    expect(normalizeFpsCorner(undefined)).toBe(DEFAULT_FPS_CORNER);
    expect(normalizeFpsCorner(null)).toBe(DEFAULT_FPS_CORNER);
    expect(normalizeFpsCorner('')).toBe(DEFAULT_FPS_CORNER);
    expect(normalizeFpsCorner('middle')).toBe(DEFAULT_FPS_CORNER);
    expect(DEFAULT_FPS_CORNER).toBe('bottom-right');
  });
});

describe('fpsBadgeRect', () => {
  it('places each corner fully on-screen with the fixed margin', () => {
    const tl = fpsBadgeRect('top-left', SIZE);
    expect(tl).toEqual({ x: FPS_BADGE_MARGIN, y: FPS_BADGE_MARGIN, w: 40, h: 16 });

    const tr = fpsBadgeRect('top-right', SIZE);
    expect(tr).toEqual({ x: HUD_WIDTH - FPS_BADGE_MARGIN - 40, y: FPS_BADGE_MARGIN, w: 40, h: 16 });

    const bl = fpsBadgeRect('bottom-left', SIZE);
    expect(bl).toEqual({
      x: FPS_BADGE_MARGIN,
      y: HUD_HEIGHT - FPS_BADGE_MARGIN - 16,
      w: 40,
      h: 16,
    });

    const br = fpsBadgeRect('bottom-right', SIZE);
    expect(br).toEqual({
      x: HUD_WIDTH - FPS_BADGE_MARGIN - 40,
      y: HUD_HEIGHT - FPS_BADGE_MARGIN - 16,
      w: 40,
      h: 16,
    });

    for (const r of [tl, tr, bl, br]) {
      expect(fullyOnScreen(r)).toBe(true);
    }
  });

  it('defaults to bottom-right when the corner is invalid/absent', () => {
    expect(fpsBadgeRect('nonsense', SIZE)).toEqual(fpsBadgeRect('bottom-right', SIZE));
    expect(fpsBadgeRect(undefined, SIZE)).toEqual(fpsBadgeRect('bottom-right', SIZE));
  });

  it('clamps an oversized badge so it never spills off-screen', () => {
    const r = fpsBadgeRect('top-left', { w: 9999, h: 9999 });
    expect(fullyOnScreen(r)).toBe(true);
  });
});
