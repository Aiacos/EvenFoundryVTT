import UPNG from 'upng-js';
import { describe, expect, it } from 'vitest';
import {
  type ConsoleEntry,
  checkGutters,
  checkScene,
  decodePng,
  diffPixels,
  findConsoleErrors,
  GUTTERS,
  gutterSignature,
  hasMarker,
  lastId,
  litCounts,
  parseSceneMarker,
  type RgbaImage,
  SCREEN_H,
  SCREEN_W,
  SEAM_POINTS,
  ZONE_RECTS,
} from './sim-lib.js';

/** Blank simulator-style frame (green, alpha 0) with `lit` pixels set opaque. */
function frame(lit: ReadonlyArray<readonly [number, number]>, w = SCREEN_W, h = SCREEN_H) {
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) data[i * 4 + 1] = 255;
  for (const [x, y] of lit) data[(y * w + x) * 4 + 3] = 255;
  return { width: w, height: h, data } satisfies RgbaImage;
}

/** Sheet frame: portrait / map frame columns, header rules + one lit pixel per zone. */
function sheet(extra: ReadonlyArray<readonly [number, number]> = []): RgbaImage {
  const lit: [number, number][] = [];
  for (let y = 2; y < 142; y++) lit.push([141, y], [433, y]);
  for (let x = 150; x <= 426; x++) lit.push([x, 40], [x, 106]);
  return frame([...lit, [10, 10], [300, 20], [500, 20], [100, 200], [400, 200], ...extra]);
}

const marker = (layout: 'full' | 'sheet', name = 'explore') => ({
  index: 1,
  total: 2,
  name,
  layout,
});

describe('PNG decoding', () => {
  it('round-trips an RGBA screenshot and keeps alpha', () => {
    const src = frame([
      [0, 0],
      [575, 287],
    ]);
    const png = new Uint8Array(UPNG.encode([src.data.buffer], SCREEN_W, SCREEN_H, 0));
    const img = decodePng(png);
    expect(img.width).toBe(SCREEN_W);
    expect(img.height).toBe(SCREEN_H);
    expect(diffPixels(img, src)).toBe(0);
    expect(litCounts(img)).toEqual([1, 0, 0, 0, 1]);
  });
});

describe('zone analysis', () => {
  it('counts lit pixels per sheet zone', () => {
    expect(ZONE_RECTS.map((z) => z.name)).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(
      litCounts(
        frame([
          [143, 0],
          [144, 0],
          [431, 5],
          [432, 5],
          [287, 144],
          [288, 287],
        ]),
      ),
    ).toEqual([1, 2, 1, 1, 1]);
  });

  it('signs the gutter probes row by row', () => {
    expect(GUTTERS.map((g) => g.x)).toEqual([141, 143, 144, 431, 432, 433, 287, 288]);
    const sig = gutterSignature(
      frame([
        [141, 0],
        [288, 287],
      ]),
    ).split('|');
    expect(sig[0]).toBe(`1${'0'.repeat(143)}`);
    expect(sig[7]).toBe(`${'0'.repeat(143)}1`);
  });

  it('diffs lit states, infinitely for size mismatches', () => {
    expect(
      diffPixels(
        frame([[1, 1]]),
        frame([
          [1, 1],
          [2, 2],
        ]),
      ),
    ).toBe(1);
    expect(diffPixels(frame([], 10, 10), frame([]))).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('scene checks', () => {
  it('parses scene markers', () => {
    expect(parseSceneMarker('EVF_SCENE 3/12 combat-my-turn sheet')).toEqual({
      index: 3,
      total: 12,
      name: 'combat-my-turn',
      layout: 'sheet',
    });
    expect(parseSceneMarker(' EVF_SCENE 10/12 unpaired full ')?.layout).toBe('full');
    expect(parseSceneMarker('EVF_SCENE 1/1 x thirds')).toBeNull();
    expect(parseSceneMarker('EVF_SCENE 1/1 x diagonal')).toBeNull();
    expect(parseSceneMarker('EVF_READY')).toBeNull();
  });

  it('requires lit pixels in all five sheet zones', () => {
    expect(checkScene(marker('sheet'), sheet())).toEqual([]);
    const noMap = frame([
      [10, 10],
      [300, 10],
      [100, 200],
      [400, 200],
      ...SEAM_POINTS.map((p) => [p.x, p.y] as const),
    ]);
    expect(checkScene(marker('sheet', 'offline'), noMap)).toEqual([
      'offline: zone C has no lit pixels',
    ]);
  });

  it('requires the header rules to stay continuous across the top-tile seam', () => {
    expect(SEAM_POINTS).toHaveLength(8);
    const broken = frame([
      [10, 10],
      [300, 20],
      [500, 20],
      [100, 200],
      [400, 200],
      [286, 40],
      [287, 40],
      [286, 106],
      [287, 106],
    ]);
    expect(checkScene(marker('sheet', 'seam'), broken)).toEqual([
      'seam: header rule broken at the top-tile seam (288,40 288,106 289,40 289,106)',
    ]);
  });

  it('requires something lit on full screens and the 576×288 size', () => {
    expect(checkScene(marker('full'), frame([[300, 100]]))).toEqual([]);
    expect(checkScene(marker('full', 'unpaired'), frame([]))).toEqual([
      'unpaired: glasses display is blank',
    ]);
    expect(checkScene(marker('sheet'), frame([], 10, 10))).toEqual([
      'explore: screenshot 10×10, expected 576×288',
    ]);
  });

  it('flags scenes whose gutter pixels deviate from the first sheet scene', () => {
    const ok = gutterSignature(sheet());
    const broken = gutterSignature(frame([[141, 2]]));
    expect(checkGutters([])).toEqual([]);
    expect(
      checkGutters([
        { name: 'explore', signature: ok },
        { name: 'actions', signature: gutterSignature(sheet([[300, 1]])) },
        { name: 'spells', signature: broken },
      ]),
    ).toEqual(['spells: gutter pixels differ from explore (279 px)']);
  });
});

describe('console filtering', () => {
  const entries: ConsoleEntry[] = [
    { id: 4, level: 'info', message: 'EVF_READY', ts: 1 },
    { id: 7, level: 'error', message: '[uncaught] TypeError: x', ts: 2 },
    { id: 5, level: 'error', message: '[unhandledrejection] nope', ts: 3 },
    { id: 6, level: 'warn', message: '[hud] rebuild failed', ts: 4 },
    { id: 8, level: 'error', message: '[fetch] 404 /x', ts: 5 },
  ];

  it('finds uncaught errors and unhandled rejections only', () => {
    expect(findConsoleErrors(entries).map((e) => e.id)).toEqual([7, 5]);
  });

  it('matches markers exactly and tracks the last id', () => {
    expect(hasMarker(entries, 'EVF_READY')).toBe(true);
    expect(hasMarker(entries, 'EVF_READ')).toBe(false);
    expect(lastId(entries)).toBe(8);
    expect(lastId([])).toBeNull();
  });
});
