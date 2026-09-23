import { describe, expect, it } from 'vitest';
import { MAX_MAP_TILES, MapSnapshotSchema, MapTileSchema } from './map.js';

const base = {
  sceneId: 's',
  name: 'Cripta',
  cols: 30,
  rows: 30,
  gridPx: 100,
  darkness: 0,
  walls: [{ c: [5, 0, 5, 5], door: true, open: true }],
  tokens: [
    {
      id: 't',
      name: 'Thorin',
      kind: 'self',
      x: 3,
      y: 4,
      w: 1,
      h: 1,
      img: 'tokens/thorin.webp',
      sight: 12,
    },
  ],
  selfTokenId: 't',
};

describe('MapSnapshot scene art', () => {
  it('accepts background, tiles, token art and sight', () => {
    const snap = {
      ...base,
      background: { src: 'maps/crypt.webp', x: 0, y: 0, w: 3000, h: 3000 },
      tiles: [{ src: 'tiles/table.webp', x: 1200, y: 1300, w: 200, h: 100, z: 1 }],
    };
    expect(MapSnapshotSchema.parse(snap)).toEqual(snap);
  });

  it('rejects the legacy string background and malformed art', () => {
    expect(MapSnapshotSchema.safeParse({ ...base, background: 'maps/crypt.webp' }).success).toBe(
      false,
    );
    const bad = { src: 'a.webp', x: 0, y: 0, w: 0, h: 10, z: 0 };
    expect(MapTileSchema.safeParse(bad).success).toBe(false);
    expect(MapTileSchema.safeParse({ ...bad, w: 1, extra: 1 }).success).toBe(false);
    const neg = { ...base, tokens: [{ ...base.tokens[0], sight: -1 }] };
    expect(MapSnapshotSchema.safeParse(neg).success).toBe(false);
  });

  it('bounds the tile list', () => {
    const tile = { src: 't.webp', x: 0, y: 0, w: 1, h: 1, z: 0 };
    const tiles = Array.from({ length: MAX_MAP_TILES + 1 }, () => tile);
    expect(MapSnapshotSchema.safeParse({ ...base, tiles }).success).toBe(false);
  });
});
