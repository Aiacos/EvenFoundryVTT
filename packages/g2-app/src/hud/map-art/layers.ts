/**
 * Scene-art layers of the pixelated map: which pictures to decode for a
 * {@link MapSnapshot} (background → tiles → token art) and where they sit, in grid
 * cells. The decode requests are sized to {@link ART_PX_PER_CELL} so a picture never
 * carries more detail than the most zoomed-in map can show.
 */
import type { MapImage, MapSnapshot } from '@evf/shared-protocol';
import type { DecodeRequest } from '../zones/luma.js';
import type { ArtImage, ArtState } from './image.js';

/** Source pixels decoded per scene cell (= the largest map zoom, 12 px per cell). */
export const ART_PX_PER_CELL = 12;
/** Largest decoded side of the background. */
const MAX_BACKGROUND_SIDE = 2048;
/** Largest decoded side of a tile or a token picture. */
const MAX_PIECE_SIDE = 256;

/** A decoded picture placed on the scene, in cells relative to the scene's top-left. */
export interface ArtLayer {
  image: ArtImage;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Cache lookup (starts the decode on first request). */
export type ArtLookup = (req: DecodeRequest) => ArtState;

/** Decode size of `w × h` cells, the longest side capped at `max` (aspect kept). */
function decodeSize(w: number, h: number, max: number): { width: number; height: number } {
  const scale = Math.min(ART_PX_PER_CELL, max / Math.max(w, h));
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
  };
}

function place(
  img: MapImage,
  gridPx: number,
  max: number,
  lookup: ArtLookup,
): { state: ArtState['state']; layer?: ArtLayer } {
  const x = img.x / gridPx;
  const y = img.y / gridPx;
  const w = img.w / gridPx;
  const h = img.h / gridPx;
  const st = lookup({ url: img.src, ...decodeSize(w, h, max), fit: 'stretch' });
  return st.state === 'ready' ? { state: 'ready', layer: { image: st.image, x, y, w, h } } : st;
}

/**
 * Collects the decoded art layers of `snap`, bottom to top: background, tiles
 * (ascending `z`), other tokens' art, then the own token's art.
 *
 * @param lookup - Decoded-picture lookup (starts missing decodes).
 * @returns The layers, or null when the art cannot be shown yet — no background, the
 *          background still loading or failed, or no own token on the scene (without a
 *          viewpoint the art could reveal the whole map) — and the schematic map is
 *          drawn instead. Tiles and token pictures still loading or failed are skipped.
 */
export function collectArt(snap: MapSnapshot, lookup: ArtLookup): ArtLayer[] | null {
  const self = snap.tokens.find((t) => t.id === snap.selfTokenId);
  if (!snap.background || !self) return null;
  const bg = place(snap.background, snap.gridPx, MAX_BACKGROUND_SIDE, lookup);
  if (!bg.layer) return null;
  const layers: ArtLayer[] = [bg.layer];
  const tiles = [...(snap.tiles ?? [])].sort((a, b) => a.z - b.z);
  for (const tile of tiles) {
    const t = place(tile, snap.gridPx, MAX_PIECE_SIDE, lookup);
    if (t.layer) layers.push(t.layer);
  }
  const tokens = [...snap.tokens.filter((t) => t !== self), self];
  for (const token of tokens) {
    if (token.img === undefined) continue;
    const st = lookup({
      url: token.img,
      ...decodeSize(token.w, token.h, MAX_PIECE_SIDE),
      fit: 'stretch',
    });
    if (st.state === 'ready') {
      layers.push({ image: st.image, x: token.x, y: token.y, w: token.w, h: token.h });
    }
  }
  return layers;
}
