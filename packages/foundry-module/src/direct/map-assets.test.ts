import { AssetSchema, type MapSnapshot, MapSnapshotSchema } from '@evf/shared-protocol';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type AssetEncoder,
  assetIdOf,
  BACKGROUND_MAX_SIDE,
  fitSize,
  MapAssetCache,
  PIECE_MAX_SIDE,
} from './map-assets.js';

const SNAP: MapSnapshot = {
  sceneId: 's',
  name: 'Crypt',
  cols: 10,
  rows: 10,
  gridPx: 100,
  background: { src: 'worlds/w/bg.webp', x: 0, y: 0, w: 1000, h: 1000 },
  tiles: [
    { src: 'worlds/w/table.png', x: 100, y: 100, w: 200, h: 100, z: 1 },
    { src: 'broken.png', x: 0, y: 0, w: 100, h: 100, z: 2 },
  ],
  darkness: 0,
  walls: [],
  tokens: [
    { id: 't1', name: 'Thorin', kind: 'self', x: 1, y: 1, w: 1, h: 1, img: 'tokens/thorin.png' },
    { id: 't2', name: 'Gob', kind: 'enemy', x: 3, y: 3, w: 1, h: 1, img: 'tokens/thorin.png' },
    { id: 't3', name: 'Rat', kind: 'enemy', x: 4, y: 4, w: 1, h: 1 },
  ],
  selfTokenId: 't1',
};

const DATA = 'data:image/png;base64,iVBORw0KGgo=';

afterEach(() => vi.restoreAllMocks());

describe('map assets', () => {
  it('MA-01 fitSize never upscales and keeps the aspect', () => {
    expect(fitSize(2000, 1000, 768)).toEqual({ width: 768, height: 384 });
    expect(fitSize(50, 20, 128)).toEqual({ width: 50, height: 20 });
    expect(fitSize(0, 0, 128)).toEqual({ width: 1, height: 1 });
  });

  it('MA-02 asset ids are stable 22-char base64url digests', async () => {
    const a = await assetIdOf('x');
    expect(a).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(await assetIdOf('x')).toBe(a);
    expect(await assetIdOf('y')).not.toBe(a);
  });

  it('MA-03 rewrites pictures to evf-asset refs, dedupes, drops failures, keeps order', async () => {
    const encode = vi.fn<AssetEncoder>(async (src) => {
      if (src === 'broken.png') throw new Error('HTTP 404');
      return DATA;
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const cache = new MapAssetCache(encode);
    const { map, assets } = await cache.prepare(SNAP);
    expect(MapSnapshotSchema.safeParse(map).success).toBe(true);
    expect(map.background?.src).toMatch(/^evf-asset:/);
    expect(map.tiles).toHaveLength(1);
    expect(map.tiles?.[0]?.z).toBe(1);
    expect(map.tokens[0]?.img).toBe(map.tokens[1]?.img);
    expect(map.tokens[2]?.img).toBeUndefined();
    expect(assets).toHaveLength(3);
    for (const a of assets) {
      expect(AssetSchema.safeParse({ t: 'asset', ...a }).success).toBe(true);
    }
    expect(encode).toHaveBeenCalledWith('worlds/w/bg.webp', BACKGROUND_MAX_SIDE, 'jpeg');
    expect(encode).toHaveBeenCalledWith('tokens/thorin.png', PIECE_MAX_SIDE, 'png');
    // Second pass hits the cache.
    await cache.prepare(SNAP);
    expect(encode).toHaveBeenCalledTimes(4);
  });

  it('MA-04 no background / tiles stay absent', async () => {
    const cache = new MapAssetCache(async () => DATA);
    const { background: _b, tiles: _t, ...bare } = SNAP;
    const { map, assets } = await cache.prepare({ ...bare, tokens: [] });
    expect(map.background).toBeUndefined();
    expect(map.tiles).toBeUndefined();
    expect(assets).toEqual([]);
  });

  it('MA-05 evicts the oldest encoded pictures beyond the cache size', async () => {
    const encode = vi.fn<AssetEncoder>(async () => DATA);
    const cache = new MapAssetCache(encode);
    const tokens = Array.from({ length: 100 }, (_, i) => ({
      id: `t${i}`,
      name: '',
      kind: 'neutral' as const,
      x: 0,
      y: 0,
      w: 1,
      h: 1,
      img: `tok${i}.png`,
    }));
    const { background: _b, tiles: _t, ...bare } = SNAP;
    await cache.prepare({ ...bare, tokens });
    expect(encode).toHaveBeenCalledTimes(100);
    await cache.prepare({ ...bare, tokens: tokens.slice(0, 1) });
    expect(encode).toHaveBeenCalledTimes(101);
  });
});
