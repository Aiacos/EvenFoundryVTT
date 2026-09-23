import UPNG from 'upng-js';
import { describe, expect, it } from 'vitest';
import {
  type ConsoleEntry,
  checkGutters,
  checkScene,
  columnLitCounts,
  decodePng,
  diffPixels,
  findConsoleErrors,
  GUTTER_COLUMNS,
  gutterSignature,
  hasMarker,
  lastId,
  parseSceneMarker,
  type RgbaImage,
  SCREEN_H,
  SCREEN_W,
} from './sim-lib.js';

/** Blank simulator-style frame (green, alpha 0) with `lit` pixels set opaque. */
function frame(lit: ReadonlyArray<readonly [number, number]>, w = SCREEN_W, h = SCREEN_H) {
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) data[i * 4 + 1] = 255;
  for (const [x, y] of lit) data[(y * w + x) * 4 + 3] = 255;
  return { width: w, height: h, data } satisfies RgbaImage;
}

/** Thirds frame: both frame borders drawn full-height + one lit pixel per column. */
function thirds(extra: ReadonlyArray<readonly [number, number]> = []): RgbaImage {
  const lit: [number, number][] = [];
  for (let y = 0; y < SCREEN_H; y++) lit.push([191, y], [384, y]);
  return frame([...lit, [10, 10], [300, 150], [500, 20], ...extra]);
}

const marker = (layout: 'full' | 'thirds', name = 'explore') => ({
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
    expect(columnLitCounts(img)).toEqual([1, 0, 1]);
  });
});

describe('column analysis', () => {
  it('counts lit pixels per 192 px column', () => {
    expect(
      columnLitCounts(
        frame([
          [191, 0],
          [192, 0],
          [383, 5],
          [384, 5],
          [575, 1],
        ]),
      ),
    ).toEqual([1, 2, 2]);
  });

  it('signs the gutter columns row by row', () => {
    expect(GUTTER_COLUMNS).toEqual([191, 384]);
    const sig = gutterSignature(
      frame([
        [191, 0],
        [384, 287],
      ]),
    );
    const [a, c] = sig.split('|');
    expect(a).toBe(`1${'0'.repeat(287)}`);
    expect(c).toBe(`${'0'.repeat(287)}1`);
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
    expect(parseSceneMarker('EVF_SCENE 3/11 combat-my-turn thirds')).toEqual({
      index: 3,
      total: 11,
      name: 'combat-my-turn',
      layout: 'thirds',
    });
    expect(parseSceneMarker(' EVF_SCENE 9/11 unpaired full ')?.layout).toBe('full');
    expect(parseSceneMarker('EVF_SCENE 1/1 x thirds-glyph')?.layout).toBe('thirds-glyph');
    expect(parseSceneMarker('EVF_SCENE 1/1 x diagonal')).toBeNull();
    expect(parseSceneMarker('EVF_READY')).toBeNull();
  });

  it('requires lit pixels in all three thirds columns', () => {
    expect(checkScene(marker('thirds'), thirds())).toEqual([]);
    const noMap = frame([
      [10, 10],
      [500, 10],
    ]);
    expect(checkScene(marker('thirds', 'offline'), noMap)).toEqual([
      'offline: column B has no lit pixels',
    ]);
  });

  it('requires something lit on full screens and the 576×288 size', () => {
    expect(checkScene(marker('full'), frame([[300, 100]]))).toEqual([]);
    expect(checkScene(marker('full', 'unpaired'), frame([]))).toEqual([
      'unpaired: glasses display is blank',
    ]);
    expect(checkScene(marker('thirds'), frame([], 10, 10))).toEqual([
      'explore: screenshot 10×10, expected 576×288',
    ]);
  });

  it('flags scenes whose gutter pixels deviate from the first thirds scene', () => {
    const ok = gutterSignature(thirds());
    const broken = gutterSignature(frame([[191, 0]]));
    expect(checkGutters([])).toEqual([]);
    expect(
      checkGutters([
        { name: 'explore', signature: ok },
        { name: 'actions', signature: gutterSignature(thirds([[300, 1]])) },
        { name: 'spells', signature: broken },
      ]),
    ).toEqual(['spells: gutter pixels differ from explore (575 px)']);
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
