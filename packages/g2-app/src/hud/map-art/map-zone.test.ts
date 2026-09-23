/**
 * Zone C with scene art: markers over the art, walls only out of sight, reach dots,
 * the schematic fallback and the frame (INV-1) staying put.
 */
import type { MapSnapshot } from '@evf/shared-protocol';
import { describe, expect, it } from 'vitest';
import { mapSnap } from '../../demo/fixtures.js';
import { strings } from '../i18n.js';
import { computeViewport, LEVEL, MAP_VIEW, type MapZoneOptions, renderMap } from '../zones/map.js';
import type { ArtLayer } from './layers.js';
import { MAP_TONE } from './pixelate.js';

const s = strings('it');
const flat = (v: number): ArtLayer => ({
  image: {
    width: 4,
    height: 4,
    luma: new Uint8Array(16).fill(v),
    alpha: new Uint8Array(16).fill(255),
  },
  x: 0,
  y: 0,
  w: 30,
  h: 30,
});

describe('map zone over scene art', () => {
  const snap = mapSnap();
  const vp = computeViewport(snap, 12, true);
  const base: MapZoneOptions = {
    cellPx: 12,
    viewport: vp,
    art: [flat(128)],
    pixelSize: 2,
    reach: false,
  };
  /** Zone pixel of cell (gx, gy) + offset. */
  const at = (gx: number, gy: number, dx = 0, dy = 0) =>
    [
      MAP_VIEW.x + Math.round(gx * 12 - vp.x * 12) + dx,
      MAP_VIEW.y + Math.round(gy * 12 - vp.y * 12) + dy,
    ] as const;

  it('keeps the art at or under its tone max, markers above it', () => {
    const p = renderMap(snap, base, s);
    expect(p.get(...at(15, 9, 6, 6))).toBeLessThanOrEqual(MAP_TONE.max);
    expect(p.get(...at(15, 9, 6, 6))).toBeGreaterThan(0);
    // Own token: double ring at 15 with a dark halo, the art visible in the middle.
    expect(p.get(...at(12, 12, 6, 0))).toBe(LEVEL.self);
    expect(p.get(...at(12, 12, 6, 1))).toBe(LEVEL.self);
    expect(p.get(...at(12, 12, 6, -1))).toBe(0);
    expect(p.get(...at(12, 12, 6, 6))).toBeLessThanOrEqual(MAP_TONE.max);
    // Ally ring, enemy cross (not filled blocks).
    expect(p.get(...at(14, 12, 6, 1))).toBe(LEVEL.ally);
    expect(p.get(...at(13, 13, 1, 1))).toBe(LEVEL.enemy);
    expect(p.get(...at(13, 13, 6, 1))).not.toBe(LEVEL.enemy);
  });

  it('marks neutral tokens with corner ticks', () => {
    const withNeutral: MapSnapshot = {
      ...snap,
      tokens: [...snap.tokens, { id: 'n', name: 'Rat', kind: 'neutral', x: 10, y: 14, w: 1, h: 1 }],
    };
    const p = renderMap(withNeutral, base, s);
    expect(p.get(...at(10, 14, 0, 0))).toBe(LEVEL.neutral);
    expect(p.get(...at(10, 14, 11, 11))).toBe(LEVEL.neutral);
    expect(p.get(...at(10, 14, 6, 0))).not.toBe(LEVEL.neutral);
  });

  it('draws walls only out of sight, closed doors everywhere', () => {
    const lit = renderMap(snap, base, s);
    const [wx, wy] = at(9, 12);
    expect(lit.get(wx, wy)).not.toBe(LEVEL.wall); // room wall, in sight: the art shows it
    const blind: MapSnapshot = {
      ...snap,
      tokens: snap.tokens.map((t) => (t.id === 't-self' ? { ...t, sight: 0.5 } : t)),
      walls: snap.walls.map((w) => (w.door ? { c: w.c, door: true } : w)),
    };
    const dark = renderMap(blind, base, s);
    expect(dark.get(wx, wy)).toBe(LEVEL.wall);
    const [dx, dy] = at(16, 11, 0, 1);
    expect(dark.get(dx, dy)).toBe(LEVEL.door);
    expect(lit.get(dx, dy)).not.toBe(LEVEL.door); // open door: not drawn
  });

  it('shows bright reach dots on dark plates', () => {
    const p = renderMap(snap, { ...base, reach: true }, s);
    expect(p.get(...at(11, 11, 5, 5))).toBe(LEVEL.reachArt);
    expect(p.get(...at(11, 11, 4, 4))).toBe(0);
  });

  it('falls back to the schematic map (grid dots, filled tokens) without art', () => {
    const p = renderMap(snap, { ...base, art: null }, s);
    expect(p.get(...at(12, 12, 6, 6))).toBe(LEVEL.self);
    expect(p.get(...at(10, 9))).toBe(LEVEL.grid);
    const withArt = renderMap(snap, base, s);
    expect(withArt.get(...at(10, 9))).not.toBe(LEVEL.grid);
  });

  it('never moves the frame, north mark or scale bar', () => {
    const a = renderMap(snap, base, s);
    const b = renderMap(snap, { ...base, art: null }, s);
    for (const [x, y] of [
      [1, 70],
      [70, 1],
      [142, 70],
      [8, 134],
      [132, 18],
    ] as const) {
      expect(a.get(x, y)).toBe(b.get(x, y));
    }
  });

  it('reuses the dithered window while nothing moved, re-dithers on a new view', () => {
    const a = renderMap(snap, base, s);
    const again = renderMap(snap, base, s);
    expect(again.data).toEqual(a.data);
    const px1 = renderMap(snap, { ...base, pixelSize: 1 }, s);
    expect(px1.data).not.toEqual(a.data);
  });
});
