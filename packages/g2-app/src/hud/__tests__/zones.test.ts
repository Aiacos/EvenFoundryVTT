/**
 * Image-zone renderers and their inputs: map (viewport, palette, reticle, reach — the
 * scene-art renderer is covered by `map-art/*.test.ts`), portrait (dither, emblems, dimming), header edge cases (PF
 * digits, TEMP, chip overflow), full-screen tiles, PNG encoding and the luminance
 * loader. Pixel-exact layouts are pinned by `golden.test.ts`.
 */
import { LABEL_FONT, measure, Pixmap } from '@evf/shared-render';
import * as UPNG from 'upng-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { character, mapSnap, online } from '../../demo/fixtures.js';
import { dwarfPortrait } from '../../demo/portrait-art.js';
import { strings } from '../i18n.js';
import { type SheetModel, sheetModel } from '../model.js';
import { fullScreenOf, renderZones } from '../view.js';
import { renderFullScreen } from '../zones/fullscreen.js';
import { HEADER_BOX, renderHeader } from '../zones/header.js';
import { browserDecoder, type Luma, LumaCache, rgbaToLuma } from '../zones/luma.js';
import { computeViewport, LEVEL, MAP_VIEW, renderMap } from '../zones/map.js';
import { encodePng } from '../zones/png.js';
import { ditherInto, PICTURE, renderPortrait } from '../zones/portrait.js';
import { splitTiles } from '../zones/tiles.js';

const s = strings('it');
afterEach(() => vi.restoreAllMocks());

function flat(w: number, h: number, v: number): Luma {
  return { width: w, height: h, data: new Uint8Array(w * h).fill(v) };
}

describe('map zone', () => {
  const snap = mapSnap();
  const vp = computeViewport(snap, 12, true);
  /** Pixel of cell (gx, gy) + offset inside the zone. */
  const at = (gx: number, gy: number, dx = 6, dy = 6) =>
    [
      MAP_VIEW.x + Math.round(gx * 12 - vp.x * 12) + dx,
      MAP_VIEW.y + Math.round(gy * 12 - vp.y * 12) + dy,
    ] as const;

  it('centres the own token and draws tokens by allegiance', () => {
    const p = renderMap(
      snap,
      { cellPx: 12, viewport: vp, art: null, pixelSize: 2 as const, reach: false },
      s,
    );
    expect(p.get(...at(12, 12))).toBe(LEVEL.self);
    expect(p.get(...at(14, 12, 3, 4))).toBe(LEVEL.ally);
    expect(p.get(...at(13, 13, 3, 4))).toBe(LEVEL.enemy);
    expect(p.get(...at(13, 13, 5, 5))).toBe(0); // enemy cross
    expect(p.get(1, 70)).toBe(6); // frame
  });

  it('marks the target with a reticle and shows reach dots for weapons', () => {
    const base = { cellPx: 12, viewport: vp, art: null, pixelSize: 2 as const } as const;
    const plain = renderMap(snap, { ...base, reach: false }, s);
    const aimed = renderMap(snap, { ...base, reach: true, targetId: 't-gob' }, s);
    const [cx, cy] = at(13.5, 13.5, 0, 0);
    expect(aimed.get(cx - 9 - 3, cy)).toBe(LEVEL.reticle);
    expect(plain.get(cx - 9 - 3, cy)).not.toBe(LEVEL.reticle);
    expect(aimed.get(...at(11, 11, 5, 5))).toBe(LEVEL.reach);
  });

  it('follows the token only once it leaves the middle half; clamps small scenes', () => {
    const moved = {
      ...snap,
      tokens: snap.tokens.map((t) => (t.id === 't-self' ? { ...t, x: 13 } : t)),
    };
    expect(computeViewport(moved, 12, true, vp)).toEqual(vp);
    const far = {
      ...snap,
      tokens: snap.tokens.map((t) => (t.id === 't-self' ? { ...t, x: 20 } : t)),
    };
    expect(computeViewport(far, 12, true, vp).x).toBeGreaterThan(vp.x);
    expect(computeViewport(far, 12, false, vp)).toEqual(vp);
    const tiny = { ...snap, cols: 4, rows: 4, selfTokenId: undefined };
    expect(computeViewport(tiny, 12, true)).toEqual({
      x: (4 - 140 / 12) / 2,
      y: (4 - 140 / 12) / 2,
    });
  });

  it('draws only the frame, north mark and scale without a scene', () => {
    const p = renderMap(
      null,
      { cellPx: 8, viewport: { x: 0, y: 0 }, art: null, pixelSize: 2 as const, reach: false },
      s,
    );
    expect(p.get(70, 70)).toBe(0);
    expect(p.get(8, 134)).toBe(9);
    expect(p.get(1, 70)).toBe(6);
  });
});

describe('portrait zone', () => {
  const base = {
    picture: dwarfPortrait(),
    emblem: 'hammer' as const,
    level: 5,
    hot: false,
    down: false,
  };

  it('orders-dithers a gradient monotonically within the picture budget', () => {
    const grad: Luma = {
      width: 16,
      height: 1,
      data: Uint8Array.from({ length: 16 }, (_, i) => i * 17),
    };
    const p = new Pixmap(64, 4);
    ditherInto(p, grad, 0, 0, 64, 4);
    const avg = (x0: number) => {
      let n = 0;
      for (let y = 0; y < 4; y++) for (let x = x0; x < x0 + 8; x++) n += p.get(x, y);
      return n / 32;
    };
    expect(avg(0)).toBeLessThan(avg(28));
    expect(avg(28)).toBeLessThan(avg(56));
    expect(Math.max(...p.data)).toBeLessThanOrEqual(12);
  });

  it('frame at level 15 on the player turn, picture dimmed at 0 PF', () => {
    expect(renderPortrait(base, s).get(2, 70)).toBe(6);
    expect(renderPortrait({ ...base, hot: true }, s).get(2, 70)).toBe(15);
    const sum = (p: Pixmap) => {
      let n = 0;
      for (let y = PICTURE.y; y < 90; y++) for (let x = PICTURE.x; x < 90; x++) n += p.get(x, y);
      return n;
    };
    expect(sum(renderPortrait({ ...base, down: true }, s))).toBeLessThan(
      sum(renderPortrait(base, s)),
    );
  });

  it('falls back to a class emblem on a hatched field, never an empty frame', () => {
    for (const emblem of ['hammer', 'sword', 'star'] as const) {
      const p = renderPortrait({ ...base, picture: null, emblem }, s);
      expect(p.get(PICTURE.x + 6, PICTURE.y + 6)).toBe(2);
      let lit = 0;
      for (let y = 40; y < 110; y++) for (let x = 40; x < 110; x++) if (p.get(x, y) === 11) lit++;
      expect(lit, emblem).toBeGreaterThan(100);
    }
  });
});

describe('header zone edge cases', () => {
  const model = sheetModel(online(), s) as SheetModel;

  it('uses the medium face when the PF digits do not fit, hides TEMP when absent', () => {
    const big = renderHeader({ ...model, hp: 12345, hpMax: 99999 }, s);
    const small = renderHeader(model, s);
    const b = HEADER_BOX.hp;
    expect(small.get(b.x + 106, b.y + 30)).toBe(11); // TEMP badge border
    expect(renderHeader({ ...model, temp: 0 }, s).get(b.x + 106, b.y + 30)).toBe(0);
    // Large digits reach row y+39, medium ones stop at y+37.
    const lastInk = (p: Pixmap) => {
      for (let y = b.y + 42; y > b.y + 20; y--)
        for (let x = b.x + 10; x < b.x + 60; x++) if (p.get(x, y) === 15) return y;
      return 0;
    };
    expect(lastInk(small)).toBe(b.y + 39);
    expect(lastInk(big)).toBe(b.y + 37);
  });

  it('collapses overflowing chips into +N, truncates a single long chip, shows none', () => {
    const chip = (label: string) => ({ label, kind: 'good' as const });
    const many = renderHeader(
      { ...model, chips: Array.from({ length: 8 }, () => chip('BENEDETTO')) },
      s,
    );
    const one = renderHeader({ ...model, chips: [chip('X'.repeat(80))] }, s);
    const none = renderHeader({ ...model, chips: [] }, s);
    const row = (p: Pixmap, x0: number) => {
      let n = 0;
      for (let x = x0; x < 284; x++) n += p.get(x, HEADER_BOX.bottomY) > 0 ? 1 : 0;
      return n;
    };
    expect(row(many, 200)).toBeGreaterThan(0);
    expect(one.get(283, HEADER_BOX.bottomY + 9)).toBe(9); // chip reaches the right edge
    expect(none.get(8 + measure(LABEL_FONT, s.noConditions) + 4, HEADER_BOX.bottomY + 6)).toBe(0);
    expect(row(renderHeader(null, s), 0)).toBe(0);
  });
});

describe('full screens', () => {
  it('splits into four 288 × 144 tiles that reassemble the screen', () => {
    const screen = renderFullScreen(
      fullScreenOf(online('min', { connection: { status: 'revoked' } })),
      s,
    );
    const whole = new Pixmap(576, 288);
    const tiles = splitTiles(screen);
    expect(tiles.map(([t]) => t)).toEqual(['tl', 'tr', 'bl', 'br']);
    const origin = [
      [0, 0],
      [288, 0],
      [0, 144],
      [288, 144],
    ] as const;
    tiles.forEach(([, tile], i) => {
      whole.blit(tile, origin[i]?.[0] ?? 0, origin[i]?.[1] ?? 0);
    });
    expect(whole.hash()).toBe(screen.hash());
    const unpaired = renderFullScreen({ kind: 'pair', revoked: false }, s);
    expect(unpaired.hash()).not.toBe(screen.hash());
    const bare = renderFullScreen({ kind: 'connect', connection: { status: 'connecting' } }, s);
    expect(bare.get(34, 84 + 5)).toBe(14); // first step "in progress"
  });
});

describe('renderZones', () => {
  it('dims every zone offline and renders an empty sheet before the first snapshot', () => {
    const ui = {
      view: 'root',
      cursor: 0,
      scroll: 0,
      sheetPage: 'abilities',
      advantage: 'normal',
      pending: null,
      result: null,
      reactionDeadline: null,
    } as const;
    const extras = { portrait: null, art: null, viewport: null, reach: false };
    const on = renderZones({ app: online(), ui, strings: s, now: 0 }, extras);
    const off = renderZones(
      { app: online('min', { connection: { status: 'offline' } }), ui, strings: s, now: 0 },
      extras,
    );
    expect(Math.max(...off.header.data)).toBeLessThan(Math.max(...on.header.data));
    const empty = renderZones(
      { app: online('min', { character: null, map: null }), ui, strings: s, now: 0 },
      extras,
    );
    expect(Math.max(...empty.sheet.data)).toBe(0);
  });
});

describe('PNG encoding', () => {
  it('round-trips levels as grey × 17 in a ≤ 4-bit indexed PNG', () => {
    const p = new Pixmap(24, 20);
    for (let i = 0; i < 16; i++) p.fillRect(i, 0, 1, 20, i);
    const png = encodePng(p);
    const img = UPNG.decode(
      png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength) as ArrayBuffer,
    );
    expect(img.depth).toBeLessThanOrEqual(4);
    const rgba = new Uint8Array(UPNG.toRGBA8(img)[0] as ArrayBuffer);
    for (let i = 1; i < 16; i++) expect(rgba[i * 4]).toBe(i * 17);
    expect(rgba[3]).toBe(0); // level 0 = transparent black (off)
    expect(rgba[0]).toBe(0);
  });
});

describe('luminance loader', () => {
  it('converts RGBA (alpha-weighted) to luminance', () => {
    const l = rgbaToLuma(
      Uint8Array.from([255, 255, 255, 255, 255, 0, 0, 255, 255, 255, 255, 0]),
      3,
      1,
    );
    expect(Array.from(l.data)).toEqual([255, 76, 0]);
  });

  it('caches decodes, reports failures once and evicts the oldest entries', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const settled = vi.fn();
    const decode = vi.fn(async (req: { url: string }) => {
      if (req.url === 'bad') throw new Error('404');
      return flat(2, 2, 9);
    });
    const cache = new LumaCache(decode, settled);
    const req = (url: string) => ({ url, width: 2, height: 2, fit: 'cover' as const });
    expect(cache.get(req('a')).state).toBe('loading');
    expect(cache.get(req('bad')).state).toBe('loading');
    await Promise.resolve();
    await Promise.resolve();
    expect(cache.get(req('a'))).toMatchObject({ state: 'ready' });
    expect(cache.get(req('bad'))).toEqual({ state: 'failed' });
    expect(settled).toHaveBeenCalledTimes(2);
    expect(console.warn).toHaveBeenCalledTimes(1);
    for (const u of ['b', 'c', 'd', 'e']) cache.get(req(u));
    cache.get(req('a'));
    expect(decode).toHaveBeenCalledTimes(7);
  });

  it('browser decoder: same-origin fetch, cover crop, errors on HTTP / missing context', async () => {
    const drawImage = vi.fn();
    const close = vi.fn();
    const ctx = {
      drawImage,
      getImageData: () => ({ data: new Uint8ClampedArray(4 * 4).fill(255) }),
    };
    const deps = {
      fetch: vi.fn(
        async () =>
          ({ ok: true, status: 200, blob: async () => new Blob() }) as unknown as Response,
      ),
      createImageBitmap: vi.fn(
        async () => ({ width: 200, height: 100, close }) as unknown as ImageBitmap,
      ),
      OffscreenCanvas: class {
        getContext() {
          return ctx;
        }
      } as unknown as new (
        w: number,
        h: number,
      ) => OffscreenCanvas,
    };
    const luma = await browserDecoder(deps)({ url: 'p.webp', width: 2, height: 2, fit: 'cover' });
    expect(deps.fetch).toHaveBeenCalledWith('p.webp', { credentials: 'same-origin' });
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 50, 0, 100, 100, 0, 0, 2, 2);
    expect(close).toHaveBeenCalled();
    expect(Array.from(luma.data)).toEqual([255, 255, 255, 255]);
    await browserDecoder(deps)({ url: 'p', width: 2, height: 2, fit: 'stretch' });
    expect(drawImage).toHaveBeenLastCalledWith(expect.anything(), 0, 0, 200, 100, 0, 0, 2, 2);
    deps.fetch.mockResolvedValueOnce({ ok: false, status: 404 } as unknown as Response);
    await expect(
      browserDecoder(deps)({ url: 'x', width: 2, height: 2, fit: 'cover' }),
    ).rejects.toThrow('404');
    const noCtx = {
      ...deps,
      OffscreenCanvas: class {
        getContext() {
          return null;
        }
      } as unknown as new (
        w: number,
        h: number,
      ) => OffscreenCanvas,
    };
    await expect(
      browserDecoder(noCtx)({ url: 'x', width: 2, height: 2, fit: 'cover' }),
    ).rejects.toThrow('2d context');
  });
});

it('fixture character is the design persona', () => {
  expect(character().details?.className).toBe('Chierico');
});
