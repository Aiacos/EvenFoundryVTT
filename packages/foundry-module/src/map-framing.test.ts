/**
 * Tests for computePartyFraming — containment, focus bias, padding, zoom floor,
 * aspect expansion, scene clamping, and the empty/fallback cases.
 */
import { describe, expect, it } from 'vitest';
import { computePartyFraming, type FramingTokenLike } from './map-framing.js';

/** Build a token rect with sensible defaults (PC, visible, not focus). */
function tok(p: Partial<FramingTokenLike> & Pick<FramingTokenLike, 'x' | 'y'>): FramingTokenLike {
  return {
    width: 100,
    height: 100,
    isPlayerCharacter: true,
    isFocus: false,
    hidden: false,
    ...p,
  };
}

/** A rect contains a token's full footprint. */
function contains(
  r: { x: number; y: number; width: number; height: number },
  t: FramingTokenLike,
): boolean {
  return (
    t.x >= r.x - 1e-6 &&
    t.y >= r.y - 1e-6 &&
    t.x + t.width <= r.x + r.width + 1e-6 &&
    t.y + t.height <= r.y + r.height + 1e-6
  );
}

describe('computePartyFraming', () => {
  it('MF-1: returns null when there are no framable tokens', () => {
    expect(computePartyFraming([])).toBeNull();
    expect(computePartyFraming([tok({ x: 0, y: 0, hidden: true })])).toBeNull();
    expect(computePartyFraming([tok({ x: 0, y: 0, width: 0, height: 0 })])).toBeNull();
  });

  it('MF-2: frame contains every party token (no focus bias)', () => {
    const tokens = [tok({ x: 0, y: 0 }), tok({ x: 1000, y: 200 }), tok({ x: 500, y: 900 })];
    const r = computePartyFraming(tokens, { focusWeight: 0, paddingFrac: 0 });
    expect(r).not.toBeNull();
    for (const t of tokens) {
      expect(contains(r as WorldRectLike, t)).toBe(true);
    }
  });

  it('MF-3: still contains everyone when the center is biased to the focus token', () => {
    const tokens = [
      tok({ x: 0, y: 0 }),
      tok({ x: 2000, y: 0, isFocus: true }), // far-right focus
      tok({ x: 1000, y: 600 }),
    ];
    const r = computePartyFraming(tokens, { focusWeight: 1, paddingFrac: 0 });
    expect(r).not.toBeNull();
    for (const t of tokens) {
      expect(contains(r as WorldRectLike, t)).toBe(true);
    }
  });

  it('MF-4: focus bias moves the center toward the focus vs. the centroid', () => {
    const tokens = [tok({ x: 0, y: 0 }), tok({ x: 2000, y: 0, isFocus: true })];
    const centroid = computePartyFraming(tokens, { focusWeight: 0, aspect: 2 });
    const biased = computePartyFraming(tokens, { focusWeight: 1, aspect: 2 });
    expect(centroid).not.toBeNull();
    expect(biased).not.toBeNull();
    const cCenter = (centroid as WorldRectLike).x + (centroid as WorldRectLike).width / 2;
    const bCenter = (biased as WorldRectLike).x + (biased as WorldRectLike).width / 2;
    // Focus is to the right (higher x); biased center must be greater.
    expect(bCenter).toBeGreaterThan(cCenter);
  });

  it('MF-5: output respects the requested aspect ratio', () => {
    const r = computePartyFraming([tok({ x: 0, y: 0 }), tok({ x: 800, y: 50 })], { aspect: 2 });
    expect(r).not.toBeNull();
    const { width, height } = r as WorldRectLike;
    expect(width / height).toBeCloseTo(2, 5);
  });

  it('MF-6: a single token is floored to the minimum zoom (not blown up)', () => {
    const r = computePartyFraming([tok({ x: 500, y: 500 })], {
      minHalfHeight: 200,
      aspect: 2,
      paddingFrac: 0,
    });
    expect(r).not.toBeNull();
    // minHalfHeight 200 → height 400; aspect 2 → width 800.
    expect((r as WorldRectLike).height).toBeGreaterThanOrEqual(400 - 1e-6);
    expect((r as WorldRectLike).width).toBeGreaterThanOrEqual(800 - 1e-6);
  });

  it('MF-7: padding enlarges the frame', () => {
    const tokens = [tok({ x: 0, y: 0 }), tok({ x: 2000, y: 800 })];
    const tight = computePartyFraming(tokens, { paddingFrac: 0, focusWeight: 0 });
    const padded = computePartyFraming(tokens, { paddingFrac: 0.5, focusWeight: 0 });
    expect((padded as WorldRectLike).width).toBeGreaterThan((tight as WorldRectLike).width);
  });

  it('MF-8: falls back to all visible tokens when there are no PC tokens', () => {
    const tokens = [
      tok({ x: 0, y: 0, isPlayerCharacter: false }),
      tok({ x: 600, y: 300, isPlayerCharacter: false }),
    ];
    const r = computePartyFraming(tokens, { paddingFrac: 0 });
    expect(r).not.toBeNull();
    for (const t of tokens) {
      expect(contains(r as WorldRectLike, t)).toBe(true);
    }
  });

  it('MF-9: hidden tokens do not affect the frame', () => {
    const visibleOnly = computePartyFraming([tok({ x: 0, y: 0 }), tok({ x: 400, y: 0 })], {
      paddingFrac: 0,
      focusWeight: 0,
    });
    const withHidden = computePartyFraming(
      [tok({ x: 0, y: 0 }), tok({ x: 400, y: 0 }), tok({ x: 9000, y: 9000, hidden: true })],
      { paddingFrac: 0, focusWeight: 0 },
    );
    expect(withHidden).toEqual(visibleOnly);
  });

  it('MF-10: clamps inside the scene bounds when provided', () => {
    // A small party near the top-left corner; the min-zoom frame would spill
    // past x=0 / y=0 without clamping.
    const r = computePartyFraming([tok({ x: 50, y: 50 })], {
      minHalfHeight: 200,
      aspect: 2,
      sceneWidth: 4000,
      sceneHeight: 3000,
    });
    expect(r).not.toBeNull();
    const { x, y, width, height } = r as WorldRectLike;
    expect(x).toBeGreaterThanOrEqual(-1e-6);
    expect(y).toBeGreaterThanOrEqual(-1e-6);
    expect(x + width).toBeLessThanOrEqual(4000 + 1e-6);
    expect(y + height).toBeLessThanOrEqual(3000 + 1e-6);
  });

  it('MF-11: a frame larger than the scene is centered on the scene', () => {
    const r = computePartyFraming([tok({ x: 0, y: 0 }), tok({ x: 5000, y: 3000 })], {
      sceneWidth: 1000,
      sceneHeight: 500,
      paddingFrac: 0,
    });
    expect(r).not.toBeNull();
    const { x, y, width, height } = r as WorldRectLike;
    // Centered: midpoint sits on the scene center.
    expect(x + width / 2).toBeCloseTo(500, 5);
    expect(y + height / 2).toBeCloseTo(250, 5);
  });
});

/** Local structural alias so tests can index the non-null rect cleanly. */
interface WorldRectLike {
  x: number;
  y: number;
  width: number;
  height: number;
}
