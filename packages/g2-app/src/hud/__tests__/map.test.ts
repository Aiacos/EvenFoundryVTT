/**
 * Pixel map, viewport, tiles, glyph fallback, image pacing, background loader and
 * map controller (docs/design/g2-thirds-layout.md §Mappa pixelata).
 */

import type { MapSnapshot } from '@evf/shared-protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mapSnap } from '../../demo/fixtures.js';

/**
 * Pixel assertions need a fixed, hand-checked geometry — independent of the demo
 * dungeon in `geometrySnap()`, which may evolve for readability.
 */
function geometrySnap(extra: Partial<MapSnapshot> = {}): MapSnapshot {
  return mapSnap({
    walls: [{ c: [0, 0, 10, 0] }, { c: [10, 0, 10, 10], door: true }],
    tokens: [
      { id: 't-self', name: 'Thorin', kind: 'self', x: 20, y: 20, w: 1, h: 1 },
      { id: 't-ally', name: 'Mira', kind: 'ally', x: 22, y: 20, w: 1, h: 1, hp: 0.8 },
      { id: 't-gob', name: 'Goblin A', kind: 'enemy', x: 21, y: 21, w: 1, h: 1, hp: 0.4 },
      { id: 't-npc', name: 'Mercante', kind: 'neutral', x: 18, y: 18, w: 1, h: 1 },
    ],
    ...extra,
  });
}

import { DEFAULT_SETTINGS } from '../../state/app-store.js';
import { IMAGE } from '../layout.js';
import { BackgroundLoader, type DecodeDeps } from '../map/background.js';
import { GLYPH_COLS, GLYPH_ROWS, glyphMapLines } from '../map/glyph-map.js';
import { ImageSender, type TileUpdate } from '../map/image-sender.js';
import { MapController, MIN_RENDER_MS, RETRY_IMAGES_MS } from '../map/map-controller.js';
import { computeViewport, LEVEL, MAP_H, MAP_W, renderPixelMap } from '../map/pixel-map.js';
import { encodeTilePng, hashTile, splitTiles } from '../map/tiles.js';

const px = (p: Uint8Array, x: number, y: number): number => p[y * MAP_W + x] ?? -1;

function imageData(w: number, h: number, grey: number): ImageData {
  const data = new Uint8ClampedArray(w * h * 4).fill(grey);
  return { width: w, height: h, data, colorSpace: 'srgb' } as ImageData;
}

describe('computeViewport', () => {
  const snap = geometrySnap();
  it('centres on the own token first', () => {
    // 8 px cells → 24×36 cells view; self centre = (20.5, 20.5).
    expect(computeViewport(snap, 8, true)).toEqual({ x: 8.5, y: 2.5 });
  });

  it('keeps the view while the token stays in the middle 50 %, recentres when it leaves', () => {
    const prev = { x: 8.5, y: 2.5 };
    const moved = {
      ...snap,
      tokens: snap.tokens.map((t) => (t.id === 't-self' ? { ...t, x: 23 } : t)),
    };
    expect(computeViewport(moved, 8, true, prev)).toEqual(prev);
    const far = {
      ...snap,
      tokens: snap.tokens.map((t) => (t.id === 't-self' ? { ...t, x: 27 } : t)),
    };
    expect(computeViewport(far, 8, true, prev)).toEqual({ x: 15.5, y: 2.5 });
    expect(computeViewport(far, 8, false, prev)).toEqual(prev);
  });

  it('clamps to the scene and centres scenes smaller than the view', () => {
    const corner = {
      ...snap,
      tokens: [{ ...snap.tokens[0], x: 0, y: 0 } as (typeof snap.tokens)[0]],
    };
    expect(computeViewport(corner, 8, true)).toEqual({ x: 0, y: 0 });
    const tiny = { ...snap, cols: 10, rows: 10, tokens: [], selfTokenId: undefined };
    expect(computeViewport(tiny, 8, true)).toEqual({ x: -7, y: -13 });
  });
});

describe('renderPixelMap', () => {
  const snap = geometrySnap();
  const vp = { x: 8, y: 2 };
  const draw = (extra = {}) =>
    renderPixelMap(snap, { cellPx: 8, follow: true, viewport: vp, ...extra });

  it('returns 192×288 grey-4 levels', () => {
    const p = draw();
    expect(p).toHaveLength(MAP_W * MAP_H);
    expect(Math.max(...p)).toBeLessThanOrEqual(15);
  });

  it('maps cells to pixels and colours tokens by kind', () => {
    const p = draw();
    // self at cell (20,20) → px ((20-8)*8, (20-2)*8) = (96,144): ring at edge, gap, core.
    expect(px(p, 96, 144)).toBe(LEVEL.self);
    expect(px(p, 97, 145)).toBe(0);
    expect(px(p, 99, 147)).toBe(LEVEL.self);
    // ally at (22,20) → (112,144): filled from inset 1.
    expect(px(p, 113, 145)).toBe(LEVEL.ally);
    expect(px(p, 112, 144)).not.toBe(LEVEL.ally);
    // enemy at (21,21) → (104,152): dark diagonal cross over the fill.
    expect(px(p, 106, 154)).toBe(0);
    expect(px(p, 106, 153)).toBe(LEVEL.enemy);
    // neutral at (18,18) → (80,128).
    expect(px(p, 82, 130)).toBe(LEVEL.neutral);
  });

  it('draws walls solid and doors dashed', () => {
    const p = draw({ viewport: { x: 0, y: 0 } });
    expect(px(p, 5, 0)).toBe(LEVEL.wall);
    const door = [0, 1, 2, 3].map((i) => px(p, 80, 1 + i));
    expect(door.filter((v) => v === LEVEL.wall).length).toBe(2);
  });

  it('shows grid dots without a background, nothing outside the scene', () => {
    const p = renderPixelMap(geometrySnap({ tokens: [], walls: [] }), {
      cellPx: 8,
      follow: true,
      viewport: { x: -1, y: 0 },
    });
    expect(px(p, 0, 0)).toBe(0);
    expect(px(p, 8, 0)).toBe(LEVEL.grid);
    expect(px(p, 9, 0)).toBe(0);
  });

  it('dithers the background to levels 0–5 and dims it with darkness', () => {
    const empty = geometrySnap({ tokens: [], walls: [] });
    const bright = renderPixelMap(empty, {
      cellPx: 8,
      follow: true,
      viewport: vp,
      background: imageData(4, 4, 255),
    });
    expect(Math.max(...bright)).toBe(LEVEL.bgMax);
    const mid = renderPixelMap(empty, {
      cellPx: 8,
      follow: true,
      viewport: vp,
      background: imageData(4, 4, 128),
    });
    expect(new Set(mid).size).toBeGreaterThan(1);
    const dark = renderPixelMap(
      { ...empty, darkness: 1 },
      { cellPx: 8, follow: true, viewport: vp, background: imageData(4, 4, 255) },
    );
    const sum = (a: Uint8Array) => a.reduce((s, v) => s + v, 0);
    expect(sum(dark)).toBeLessThan(sum(bright));
  });

  it('draws the reticle around the target (option overrides the snapshot)', () => {
    const withTarget = renderPixelMap(geometrySnap({ targetId: 't-gob' }), {
      cellPx: 8,
      follow: true,
      viewport: vp,
    });
    expect(withTarget.filter((v) => v === LEVEL.reticle).length).toBeGreaterThan(
      draw().filter((v) => v === LEVEL.reticle).length,
    );
    const override = draw({ targetId: 't-npc' });
    // tick left of the neutral token centre (84,132) at radius 6 → x = 84-6-3.
    expect(px(override, 75, 132)).toBe(LEVEL.reticle);
  });

  it('computes the viewport when none is given', () => {
    expect(renderPixelMap(snap, { cellPx: 8, follow: true })).toEqual(
      renderPixelMap(snap, { cellPx: 8, follow: true, viewport: computeViewport(snap, 8, true) }),
    );
  });
});

describe('tiles', () => {
  it('splits into two 192×144 tiles and rejects wrong sizes', () => {
    const p = new Uint8Array(MAP_W * MAP_H);
    p[MAP_W * 144] = 7;
    const [top, bottom] = splitTiles(p);
    expect(top).toHaveLength(192 * 144);
    expect(bottom[0]).toBe(7);
    expect(() => splitTiles(new Uint8Array(10))).toThrow('expected 55296 pixels, got 10');
  });

  it('hashes deterministically and detects changes', () => {
    const a = new Uint8Array(100);
    const b = new Uint8Array(100);
    expect(hashTile(a)).toBe(hashTile(b));
    b[50] = 1;
    expect(hashTile(a)).not.toBe(hashTile(b));
  });

  it('encodes an indexed PNG of 192×144 with ≤ 4-bit depth', () => {
    const tile = new Uint8Array(192 * 144).map((_, i) => i % 16);
    const png = encodeTilePng(tile);
    expect([...png.slice(1, 4)].map((c) => String.fromCharCode(c)).join('')).toBe('PNG');
    const view = new DataView(png.buffer, png.byteOffset);
    expect(view.getUint32(16)).toBe(192);
    expect(view.getUint32(20)).toBe(144);
    expect(png[24]).toBeLessThanOrEqual(4);
    expect(png[25]).toBe(3); // colour type 3 = indexed palette
  });
});

describe('glyphMapLines', () => {
  it('down-samples to 12×10 characters by element priority', () => {
    const p = new Uint8Array(MAP_W * MAP_H);
    const set = (x: number, y: number, v: number) => {
      p[y * MAP_W + x] = v;
    };
    set(0, 0, LEVEL.self);
    set(16, 0, LEVEL.enemy);
    set(32, 0, LEVEL.ally);
    set(48, 0, LEVEL.neutral);
    set(64, 0, LEVEL.wall);
    set(80, 0, 4);
    set(96, 0, 1);
    const lines = glyphMapLines(p);
    expect(lines).toHaveLength(GLYPH_ROWS);
    expect(lines[0]).toBe('@gan#.      ');
    expect(lines[1]).toHaveLength(GLYPH_COLS);
  });
});

describe('ImageSender', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
  });
  afterEach(() => vi.useRealTimers());

  const tile = (id: number, v = 0): TileUpdate => ({
    id,
    name: `t${id}`,
    data: new Uint8Array([v]),
  });

  it('serialises sends ≥ 100 ms apart and ≤ 1 frame per second', async () => {
    const times: number[] = [];
    const sender = new ImageSender(async () => {
      times.push(Date.now());
      return 'success';
    });
    sender.submit([tile(7), tile(8)]);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(100);
    sender.submit([tile(7, 1)]);
    await vi.advanceTimersByTimeAsync(2000);
    expect(times).toEqual([10_000, 10_100, 11_000]);
  });

  it('drops stale tiles (latest wins per container)', async () => {
    const sent: number[] = [];
    const sender = new ImageSender(async (t) => {
      sent.push(t.data[0] ?? -1);
      return 'success';
    });
    sender.submit([tile(7, 1)]);
    await vi.advanceTimersByTimeAsync(0);
    sender.submit([tile(7, 2)]);
    sender.submit([tile(7, 3)]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(sent).toEqual([1, 3]);
  });

  it('falls back after two consecutive failed frames; success resets the streak', async () => {
    const onFallback = vi.fn();
    const onFrame = vi.fn();
    let result = 'sendFailed';
    const sender = new ImageSender(
      async () => {
        if (result === 'throw') throw new Error('ble');
        return result;
      },
      { onFallback, onFrame },
    );
    sender.submit([tile(7)]);
    await vi.advanceTimersByTimeAsync(0);
    result = 'success';
    sender.submit([tile(7)]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(onFallback).not.toHaveBeenCalled();
    result = 'throw';
    sender.submit([tile(7)]);
    await vi.advanceTimersByTimeAsync(1000);
    result = 'imageException';
    sender.submit([tile(7)]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(onFrame.mock.calls.map((c) => c[0])).toEqual([false, true, false, false]);
    expect(onFallback).toHaveBeenCalledTimes(1);
  });

  it('reset drops queued tiles; dispose stops sending', async () => {
    const send = vi.fn(async () => 'success');
    const sender = new ImageSender(send);
    sender.submit([tile(7)]);
    sender.reset();
    await vi.advanceTimersByTimeAsync(0);
    expect(send).not.toHaveBeenCalled();
    sender.submit([tile(7), tile(8)]);
    await vi.advanceTimersByTimeAsync(0);
    sender.dispose();
    await vi.advanceTimersByTimeAsync(500);
    expect(send).toHaveBeenCalledTimes(1);
    sender.submit([tile(7)]);
    await vi.advanceTimersByTimeAsync(2000);
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe('BackgroundLoader', () => {
  const snap = geometrySnap({ background: 'worlds/w/bg.webp' });

  function deps(overrides: Partial<DecodeDeps> = {}): DecodeDeps {
    const ctx = {
      drawImage: vi.fn(),
      getImageData: (_x: number, _y: number, w: number, h: number) => imageData(w, h, 200),
    };
    return {
      fetch: vi.fn(
        async () => ({ ok: true, status: 200, blob: async () => new Blob() }) as Response,
      ),
      createImageBitmap: vi.fn(
        async () => ({ width: 1000, height: 800, close: vi.fn() }) as unknown as ImageBitmap,
      ),
      OffscreenCanvas: class {
        getContext() {
          return ctx;
        }
      } as unknown as NonNullable<DecodeDeps['OffscreenCanvas']>,
      ...overrides,
    };
  }

  it('returns null without a background URL', () => {
    expect(new BackgroundLoader(vi.fn(), deps()).get(geometrySnap())).toBeNull();
  });

  it('loads, down-scales, caches and notifies', async () => {
    const onLoaded = vi.fn();
    const d = deps();
    const loader = new BackgroundLoader(onLoaded, d);
    expect(loader.get(snap)).toBeNull();
    expect(loader.get(snap)).toBeNull();
    await vi.waitFor(() => expect(onLoaded).toHaveBeenCalledTimes(1));
    const img = loader.get(snap);
    expect(img?.width).toBe(480);
    expect(img?.height).toBe(480);
    expect(d.fetch).toHaveBeenCalledTimes(1);
    expect(d.fetch).toHaveBeenCalledWith('worlds/w/bg.webp', { credentials: 'same-origin' });
  });

  it('degrades to no background when decode APIs are missing or fetch fails', async () => {
    const onLoaded = vi.fn();
    const noApi = new BackgroundLoader(onLoaded, { fetch: vi.fn() });
    noApi.get(snap);
    await vi.waitFor(() => expect(onLoaded).toHaveBeenCalled());
    expect(noApi.get(snap)).toBeNull();

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const failing = new BackgroundLoader(
      onLoaded,
      deps({ fetch: vi.fn(async () => ({ ok: false, status: 404 }) as Response) }),
    );
    failing.get(snap);
    await vi.waitFor(() => expect(warn).toHaveBeenCalled());
    expect(failing.get(snap)).toBeNull();
    warn.mockRestore();

    const noCtx = new BackgroundLoader(
      onLoaded,
      deps({
        OffscreenCanvas: class {
          getContext() {
            return null;
          }
        } as unknown as NonNullable<DecodeDeps['OffscreenCanvas']>,
      }),
    );
    noCtx.get(snap);
    await vi.waitFor(() => expect(onLoaded).toHaveBeenCalledTimes(3));
    expect(noCtx.get(snap)).toBeNull();
  });

  it('ignores a stale load after the scene changed', async () => {
    let release: () => void = () => undefined;
    const onLoaded = vi.fn();
    const loader = new BackgroundLoader(
      onLoaded,
      deps({
        fetch: vi.fn(
          () =>
            new Promise<Response>((r) => {
              release = () =>
                r({ ok: true, status: 200, blob: async () => new Blob() } as Response);
            }),
        ),
      }),
    );
    loader.get(snap);
    const first = release;
    loader.get({ ...snap, sceneId: 'other' });
    first();
    await vi.waitFor(() => expect(onLoaded).toHaveBeenCalledTimes(0));
  });
});

describe('MapController', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });
  afterEach(() => vi.useRealTimers());

  const noBg = { get: () => null } as unknown as BackgroundLoader;
  const input = (patch = {}) => ({
    map: geometrySnap(),
    settings: DEFAULT_SETTINGS,
    active: true,
    ...patch,
  });

  it('renders both tiles once, then only changed tiles, throttled to 1/s', async () => {
    const sent: number[] = [];
    const c = new MapController({
      send: async (t) => {
        sent.push(t.id);
        return 'success';
      },
      background: noBg,
      onFallbackChange: vi.fn(),
    });
    const first = input();
    c.update(first);
    await vi.advanceTimersByTimeAsync(200);
    expect(sent).toEqual([IMAGE.mapTop.id, IMAGE.mapBottom.id]);
    c.update(first);
    c.update({ ...first });
    await vi.advanceTimersByTimeAsync(2000);
    expect(sent).toHaveLength(2);
    // Target override on the neutral token changes the top tile only.
    c.update(input({ map: first.map, targetId: 't-npc' }));
    await vi.advanceTimersByTimeAsync(MIN_RENDER_MS);
    expect(sent).toEqual([7, 8, 7]);
    c.resetImages();
    await vi.advanceTimersByTimeAsync(MIN_RENDER_MS + 200);
    expect(sent).toHaveLength(5);
    c.dispose();
  });

  it('stays frozen while inactive or without a map', async () => {
    const send = vi.fn(async () => 'success');
    const c = new MapController({ send, background: noBg, onFallbackChange: vi.fn() });
    c.update(input({ active: false }));
    c.update(input({ map: null }));
    c.resetImages();
    await vi.advanceTimersByTimeAsync(3000);
    expect(send).not.toHaveBeenCalled();
    expect(c.glyphLines(input({ map: null }))).toEqual([]);
    expect(c.glyphLines(input())).toHaveLength(GLYPH_ROWS);
  });

  it('switches to glyphs after two failed frames and retries images later', async () => {
    const onFallbackChange = vi.fn();
    const send = vi.fn(async () => 'sendFailed');
    const c = new MapController({ send, background: noBg, onFallbackChange });
    c.update(input());
    // First frame fails, is repainted once automatically, fails again → glyphs.
    await vi.advanceTimersByTimeAsync(1500);
    expect(onFallbackChange).toHaveBeenCalledWith(true);
    // The HUD deactivates column B images while in glyph mode.
    c.update(input({ active: false }));
    const sent = send.mock.calls.length;
    await vi.advanceTimersByTimeAsync(RETRY_IMAGES_MS);
    expect(send.mock.calls.length).toBe(sent);
    expect(onFallbackChange).toHaveBeenLastCalledWith(false);
    c.dispose();
  });

  it('dispose clears pending render and retry timers', async () => {
    const send = vi.fn(async () => 'success');
    const c = new MapController({ send, background: noBg, onFallbackChange: vi.fn() });
    c.update(input());
    c.dispose();
    await vi.advanceTimersByTimeAsync(3000);
    expect(send).not.toHaveBeenCalled();
  });
});
