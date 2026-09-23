/**
 * Pure helpers for `sim-check.ts`: glasses screenshot analysis (INV-1 pixel checks) and
 * simulator console filtering. No I/O — unit-tested in `sim-lib.test.ts`.
 *
 * Screenshot format (evenhub-simulator `/api/screenshot/glasses`): 576×288 RGBA PNG,
 * background `alpha = 0`, lit pixels `alpha > 0` (never convert to RGB).
 *
 * @see everything-evenhub:simulator-automation (API + RGBA format)
 * @see docs/design/g2-sheet-ux.html §Architettura della schermata (zones A–E)
 */
import UPNG from 'upng-js';

export const SCREEN_W = 576;
export const SCREEN_H = 288;

/** A named screen rectangle. */
export interface Rect {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Sheet-layout zones (A portrait, B header, C map, D sheet, E context). */
export const ZONE_RECTS: readonly Rect[] = [
  { name: 'A', x: 0, y: 0, w: 144, h: 144 },
  { name: 'B', x: 144, y: 0, w: 288, h: 144 },
  { name: 'C', x: 432, y: 0, w: 144, h: 144 },
  { name: 'D', x: 0, y: 144, w: 288, h: 144 },
  { name: 'E', x: 288, y: 144, w: 288, h: 144 },
];

/** A one-pixel-wide vertical probe `x`, rows `y0 … y1`. */
export interface Gutter {
  x: number;
  y0: number;
  y1: number;
}

/**
 * Pixel columns checked for INV-1 consistency on sheet scenes: the zone gutters
 * (x = 144 / 432 in the top band, x = 288 in the bottom band) and the frame columns next
 * to them (portrait frame x = 141, map frame x = 433, context body border x = 288).
 * Their lit masks must be identical in every sheet scene — a zone that moved or grew
 * changes them.
 */
export const GUTTERS: readonly Gutter[] = [
  { x: 141, y0: 0, y1: 143 },
  { x: 143, y0: 0, y1: 143 },
  { x: 144, y0: 0, y1: 143 },
  { x: 431, y0: 0, y1: 143 },
  { x: 432, y0: 0, y1: 143 },
  { x: 433, y0: 0, y1: 143 },
  { x: 287, y0: 144, y1: 287 },
  { x: 288, y0: 144, y1: 287 },
];

/** Decoded RGBA image. */
export interface RgbaImage {
  width: number;
  height: number;
  /** Row-major RGBA, 4 bytes per pixel. */
  data: Uint8Array;
}

/** Decodes a PNG byte stream to 8-bit RGBA. */
export function decodePng(bytes: Uint8Array): RgbaImage {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const png = UPNG.decode(buffer as ArrayBuffer);
  const frame = UPNG.toRGBA8(png)[0];
  if (frame === undefined) throw new Error('PNG has no frame');
  return { width: png.width, height: png.height, data: new Uint8Array(frame) };
}

/** True when the pixel at (x, y) is lit (alpha > 0). */
export function isLit(img: RgbaImage, x: number, y: number): boolean {
  return (img.data[(y * img.width + x) * 4 + 3] ?? 0) > 0;
}

/** Lit pixel count inside each rectangle. */
export function litCounts(img: RgbaImage, rects: readonly Rect[] = ZONE_RECTS): number[] {
  return rects.map((r) => {
    let n = 0;
    for (let y = r.y; y < r.y + r.h; y++)
      for (let x = r.x; x < r.x + r.w; x++) if (isLit(img, x, y)) n++;
    return n;
  });
}

/** Lit mask of the gutter probes: one `0/1` string per probe, joined with `|`. */
export function gutterSignature(img: RgbaImage, gutters: readonly Gutter[] = GUTTERS): string {
  return gutters
    .map((g) => {
      let bits = '';
      for (let y = g.y0; y <= g.y1; y++) bits += isLit(img, g.x, y) ? '1' : '0';
      return bits;
    })
    .join('|');
}

/** Number of pixels whose lit state differs (images of different size: `Infinity`). */
export function diffPixels(a: RgbaImage, b: RgbaImage): number {
  if (a.width !== b.width || a.height !== b.height) return Number.POSITIVE_INFINITY;
  let n = 0;
  for (let y = 0; y < a.height; y++) {
    for (let x = 0; x < a.width; x++) if (isLit(a, x, y) !== isLit(b, x, y)) n += 1;
  }
  return n;
}

export type SceneLayout = 'full' | 'sheet';

/** Parsed `EVF_SCENE <i>/<n> <name> <layout>` marker. */
export interface SceneMarker {
  index: number;
  total: number;
  name: string;
  layout: SceneLayout;
}

const SCENE = /^EVF_SCENE (\d+)\/(\d+) ([\w-]+) (full|sheet)$/;

/** Parses a scene marker line, or `null` for any other message. */
export function parseSceneMarker(message: string): SceneMarker | null {
  const m = SCENE.exec(message.trim());
  if (m === null) return null;
  return {
    index: Number(m[1]),
    total: Number(m[2]),
    name: m[3] ?? '',
    layout: m[4] as SceneLayout,
  };
}

/** Simulator `/api/console` entry. */
export interface ConsoleEntry {
  id: number;
  level: string;
  message: string;
  ts: number;
}

/** Entries reporting uncaught exceptions or unhandled rejections. */
export function findConsoleErrors(entries: readonly ConsoleEntry[]): ConsoleEntry[] {
  return entries.filter(
    (e) => e.message.startsWith('[uncaught]') || e.message.startsWith('[unhandledrejection]'),
  );
}

/** True when some entry is exactly `marker` (e.g. `EVF_READY`). */
export function hasMarker(entries: readonly ConsoleEntry[], marker: string): boolean {
  return entries.some((e) => e.message.trim() === marker);
}

/** Highest entry id (`since_id` for the next poll); `null` when empty. */
export function lastId(entries: readonly ConsoleEntry[]): number | null {
  return entries.reduce<number | null>((max, e) => (max === null || e.id > max ? e.id : max), null);
}

/**
 * Per-scene checks: screen size; sheet layouts light each of the five zones; full
 * screens light something.
 *
 * @returns Problems (empty = pass).
 */
export function checkScene(marker: SceneMarker, img: RgbaImage): string[] {
  if (img.width !== SCREEN_W || img.height !== SCREEN_H) {
    return [`${marker.name}: screenshot ${img.width}×${img.height}, expected 576×288`];
  }
  if (marker.layout === 'full') {
    return litCounts(img, [{ name: 'screen', x: 0, y: 0, w: SCREEN_W, h: SCREEN_H }])[0]
      ? []
      : [`${marker.name}: glasses display is blank`];
  }
  const counts = litCounts(img);
  return ZONE_RECTS.flatMap((z, i) =>
    (counts[i] ?? 0) > 0 ? [] : [`${marker.name}: zone ${z.name} has no lit pixels`],
  );
}

/**
 * INV-1 pixel check: every sheet scene must share the same gutter signature.
 *
 * @returns Problems naming the scenes that deviate from the first one.
 */
export function checkGutters(scenes: ReadonlyArray<{ name: string; signature: string }>): string[] {
  const reference = scenes[0];
  if (reference === undefined) return [];
  return scenes.slice(1).flatMap((s) => {
    if (s.signature === reference.signature) return [];
    let rows = 0;
    for (let i = 0; i < s.signature.length; i++) {
      if (s.signature[i] !== reference.signature[i]) rows += 1;
    }
    return [`${s.name}: gutter pixels differ from ${reference.name} (${rows} px)`];
  });
}
