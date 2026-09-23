import type { MapSnapshot } from '@evf/shared-protocol';
import { describe, expect, it } from 'vitest';
import { type ArtView, renderArtWindow } from './art.js';
import type { ArtImage } from './image.js';
import type { ArtLayer } from './layers.js';
import { MAP_TONE } from './pixelate.js';

/** Picture from a luminance function of normalized (u, v). */
function picture(w: number, h: number, f: (u: number, v: number) => number, alpha = 255): ArtImage {
  const luma = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) luma[y * w + x] = f((x + 0.5) / w, (y + 0.5) / h);
  return { width: w, height: h, luma, alpha: new Uint8Array(w * h).fill(alpha) };
}

const ME = { id: 'me', name: 'Me', kind: 'self', x: 14, y: 14, w: 1, h: 1, sight: 30 } as const;

function snap(extra: Partial<MapSnapshot> = {}): MapSnapshot {
  return {
    sceneId: 's',
    name: 'S',
    cols: 30,
    rows: 30,
    gridPx: 100,
    darkness: 0,
    walls: [],
    tokens: [ME],
    selfTokenId: 'me',
    ...extra,
  };
}

/** Background: black left of scene x = 15 cells, white right of it. */
const halves: ArtLayer = {
  image: picture(60, 60, (u) => (u < 0.5 ? 0 : 255)),
  x: 0,
  y: 0,
  w: 30,
  h: 30,
};
/** View centred on cell (14.5, 14.5), 12 px per cell, 140 px. */
const view: ArtView = {
  ox: 14.5 * 12 - 70,
  oy: 14.5 * 12 - 70,
  cellPx: 12,
  size: 140,
  pixelSize: 1,
};
const lvl = (f: { levels: Uint8Array; size: number }, x: number, y: number) =>
  f.levels[y * f.size + x];

describe('renderArtWindow — crop / zoom', () => {
  it('places scene art at (cell · cellPx − origin): the edge at x = 15 cells lands on px 76', () => {
    const f = renderArtWindow(snap(), [halves], view);
    // 15 · 12 − 104 = 76.
    expect(lvl(f, 75, 70)).toBe(MAP_TONE.lift);
    expect(lvl(f, 76, 70)).toBe(MAP_TONE.max);
  });

  it('zooms: at 6 px per cell the same edge moves to 15 · 6 − origin', () => {
    const ox = 14.5 * 6 - 70;
    const f = renderArtWindow(snap(), [halves], { ...view, ox, oy: ox, cellPx: 6 });
    expect(lvl(f, 90 - ox - 1, 70)).toBe(MAP_TONE.lift);
    expect(lvl(f, 90 - ox, 70)).toBe(MAP_TONE.max);
  });

  it('pixelates in blocks anchored to scene pixels', () => {
    const noise = picture(360, 360, (u, v) =>
      Math.floor((Math.sin(u * 900) + Math.cos(v * 700) + 2) * 60),
    );
    const layer = { ...halves, image: noise };
    for (const b of [2, 3] as const) {
      const f = renderArtWindow(snap(), [layer], { ...view, pixelSize: b });
      for (let y = 20; y < 120; y++) {
        for (let x = 20; x < 120; x++) {
          const bx = Math.floor((x + view.ox) / b) * b - view.ox;
          const by = Math.floor((y + view.oy) / b) * b - view.oy;
          expect(lvl(f, x, y)).toBe(lvl(f, bx, by));
        }
      }
    }
  });

  it('is deterministic', () => {
    const a = renderArtWindow(snap(), [halves], { ...view, pixelSize: 2 });
    const b = renderArtWindow(snap(), [halves], { ...view, pixelSize: 2 });
    expect(a.levels).toEqual(b.levels);
  });
});

describe('renderArtWindow — compositing', () => {
  it('draws opaque token art over the background, transparent pixels let it through', () => {
    const black: ArtLayer = { ...halves, image: picture(4, 4, () => 0) };
    const token: ArtLayer = { image: picture(12, 12, () => 255), x: 14, y: 14, w: 1, h: 1 };
    const clear: ArtLayer = { image: picture(12, 12, () => 255, 0), x: 13, y: 14, w: 1, h: 1 };
    const f = renderArtWindow(snap(), [black, token, clear], view);
    expect(lvl(f, 70, 70)).toBe(MAP_TONE.max); // inside (14, 14)
    expect(lvl(f, 58, 70)).toBe(MAP_TONE.lift); // inside (13, 14): transparent
  });

  it('dims with the scene darkness', () => {
    const white: ArtLayer = { ...halves, image: picture(4, 4, () => 255) };
    const sum = (d: number) =>
      renderArtWindow(snap({ darkness: d }), [white], view).levels.reduce((a, b) => a + b, 0);
    expect(sum(1)).toBeLessThan(sum(0) * 0.5);
  });
});

describe('renderArtWindow — privacy mask', () => {
  const white: ArtLayer = { ...halves, image: picture(4, 4, () => 255) };

  it('blacks out beyond the sight radius', () => {
    const s = snap({ tokens: [{ ...ME, sight: 2 }] });
    const f = renderArtWindow(s, [white], view);
    expect(lvl(f, 70, 70)).toBe(MAP_TONE.max);
    expect(f.lit[70 * 140 + 70]).toBe(1);
    expect(lvl(f, 70, 70 + 3 * 12)).toBe(0);
    expect(f.lit[(70 + 3 * 12) * 140 + 70]).toBe(0);
  });

  it('uses the default radius (12 cells) without sight info', () => {
    const s = snap({
      tokens: [{ id: 'me', name: 'Me', kind: 'self', x: 14, y: 14, w: 1, h: 1 }],
      cols: 60,
      rows: 60,
    });
    const far = { ...view, ox: view.ox + 11 * 12, oy: view.oy };
    const f = renderArtWindow(s, [{ ...white, w: 60, h: 60 }], far);
    expect(lvl(f, 70, 70)).toBe(MAP_TONE.max); // 11 cells away
    expect(lvl(f, 70 + 2 * 12, 70)).toBe(0); // 13 cells away
  });

  it('hides what is behind a wall', () => {
    const s = snap({ walls: [{ c: [16, 0, 16, 30] }] });
    const f = renderArtWindow(s, [white], view);
    expect(lvl(f, 70 + 12, 70)).toBe(MAP_TONE.max); // cell 15
    expect(lvl(f, 70 + 2 * 12, 70)).toBe(0); // cell 16.5
  });

  it('is fully black outside the scene', () => {
    const s = snap({ cols: 15, rows: 15 });
    const f = renderArtWindow(s, [white], view);
    expect(lvl(f, 70 + 2 * 12, 70)).toBe(0);
    expect(f.lit[70 * 140 + 70 + 24]).toBe(0);
  });

  it('shows nothing without an own token', () => {
    const f = renderArtWindow(snap({ selfTokenId: undefined }), [white], view);
    expect(Math.max(...f.levels)).toBe(0);
  });
});
