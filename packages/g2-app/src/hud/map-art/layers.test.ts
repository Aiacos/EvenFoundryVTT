import type { MapSnapshot } from '@evf/shared-protocol';
import { describe, expect, it } from 'vitest';
import type { DecodeRequest } from '../zones/luma.js';
import type { ArtImage, ArtState } from './image.js';
import { collectArt } from './layers.js';

const img = (tag: number): ArtImage => ({
  width: 1,
  height: 1,
  luma: Uint8Array.of(tag),
  alpha: Uint8Array.of(255),
});

function snap(extra: Partial<MapSnapshot> = {}): MapSnapshot {
  return {
    sceneId: 's',
    name: 'S',
    cols: 40,
    rows: 20,
    gridPx: 50,
    background: { src: 'bg.webp', x: 25, y: -50, w: 2000, h: 1000 },
    tiles: [
      { src: 'top.webp', x: 100, y: 100, w: 100, h: 50, z: 2 },
      { src: 'low.webp', x: 0, y: 0, w: 50, h: 50, z: 1 },
    ],
    darkness: 0,
    walls: [],
    tokens: [
      { id: 'me', name: 'Me', kind: 'self', x: 5, y: 6, w: 1, h: 1, img: 'me.webp' },
      { id: 'big', name: 'Ogre', kind: 'enemy', x: 8, y: 6, w: 2, h: 2, img: 'ogre.webp' },
      { id: 'bare', name: 'Rat', kind: 'enemy', x: 9, y: 9, w: 1, h: 1 },
    ],
    selfTokenId: 'me',
    ...extra,
  };
}

/** Lookup resolving every URL except those listed as loading / failed. */
function lookup(opts: { loading?: string[]; failed?: string[] } = {}) {
  const requests: DecodeRequest[] = [];
  const tags: Record<string, number> = {
    'bg.webp': 1,
    'low.webp': 2,
    'top.webp': 3,
    'me.webp': 4,
    'ogre.webp': 5,
  };
  const fn = (req: DecodeRequest): ArtState => {
    requests.push(req);
    if (opts.loading?.includes(req.url)) return { state: 'loading' };
    if (opts.failed?.includes(req.url)) return { state: 'failed' };
    return { state: 'ready', image: img(tags[req.url] ?? 0) };
  };
  return { fn, requests };
}

describe('collectArt', () => {
  it('orders background → tiles by z → other tokens → own token, in cells', () => {
    const { fn, requests } = lookup();
    const layers = collectArt(snap(), fn);
    expect(layers?.map((l) => l.image.luma[0])).toEqual([1, 2, 3, 5, 4]);
    expect(layers?.[0]).toMatchObject({ x: 0.5, y: -1, w: 40, h: 20 });
    expect(layers?.[2]).toMatchObject({ x: 2, y: 2, w: 2, h: 1 });
    expect(layers?.[3]).toMatchObject({ x: 8, y: 6, w: 2, h: 2 });
    // Decode sizes: 12 px per cell, background capped at 2048 on its long side.
    expect(requests[0]).toEqual({ url: 'bg.webp', width: 480, height: 240, fit: 'stretch' });
    expect(requests.find((r) => r.url === 'ogre.webp')).toMatchObject({ width: 24, height: 24 });
  });

  it('caps huge backgrounds, keeping the aspect ratio', () => {
    const { fn, requests } = lookup();
    collectArt(
      snap({ cols: 400, rows: 100, background: { src: 'bg.webp', x: 0, y: 0, w: 20000, h: 5000 } }),
      fn,
    );
    expect(requests[0]).toMatchObject({ width: 2048, height: 512 });
  });

  it('falls back (null) without background, own token, or a ready background', () => {
    expect(collectArt(snap({ background: undefined }), lookup().fn)).toBeNull();
    expect(collectArt(snap({ selfTokenId: undefined }), lookup().fn)).toBeNull();
    expect(collectArt(snap(), lookup({ loading: ['bg.webp'] }).fn)).toBeNull();
    expect(collectArt(snap(), lookup({ failed: ['bg.webp'] }).fn)).toBeNull();
  });

  it('skips tiles and token pictures still loading or failed', () => {
    const layers = collectArt(snap(), lookup({ loading: ['top.webp'], failed: ['me.webp'] }).fn);
    expect(layers?.map((l) => l.image.luma[0])).toEqual([1, 2, 5]);
  });
});
