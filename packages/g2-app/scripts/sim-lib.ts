/**
 * Pure helpers for `sim-check.ts`: glasses screenshot analysis (INV-1 pixel checks) and
 * simulator console filtering. No I/O — unit-tested in `sim-lib.test.ts`.
 *
 * Screenshot format (evenhub-simulator `/api/screenshot/glasses`): 576×288 RGBA PNG,
 * background `alpha = 0`, lit pixels `alpha > 0` (never convert to RGB).
 *
 * @see everything-evenhub:simulator-automation (API + RGBA format)
 * @see docs/design/g2-thirds-layout.md (three 192 px columns)
 */
import UPNG from 'upng-js';

export const SCREEN_W = 576;
export const SCREEN_H = 288;
export const COLUMN_W = 192;

/**
 * Pixel columns checked for INV-1 gutter consistency: the frame borders flanking the map
 * column (column A right border x=191 at the x=192 gutter, column C left border x=384).
 * The map column's own edge pixels (192, 383) carry map content and legitimately vary.
 */
export const GUTTER_COLUMNS: readonly number[] = [COLUMN_W - 1, 2 * COLUMN_W];

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

/** Lit pixel count of each 192 px column `[A, B, C]`. */
export function columnLitCounts(img: RgbaImage): [number, number, number] {
  const counts: [number, number, number] = [0, 0, 0];
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (!isLit(img, x, y)) continue;
      const col = Math.min(2, Math.floor(x / COLUMN_W)) as 0 | 1 | 2;
      counts[col] += 1;
    }
  }
  return counts;
}

/** Lit mask of the gutter columns: one `0/1` string per column, joined with `|`. */
export function gutterSignature(img: RgbaImage, columns = GUTTER_COLUMNS): string {
  return columns
    .map((x) => {
      let bits = '';
      for (let y = 0; y < img.height; y++) bits += isLit(img, x, y) ? '1' : '0';
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

export type SceneLayout = 'full' | 'thirds' | 'thirds-glyph';

/** Parsed `EVF_SCENE <i>/<n> <name> <layout>` marker. */
export interface SceneMarker {
  index: number;
  total: number;
  name: string;
  layout: SceneLayout;
}

const SCENE = /^EVF_SCENE (\d+)\/(\d+) ([\w-]+) (full|thirds|thirds-glyph)$/;

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
 * Per-scene checks: screen size; thirds layouts light each of the three columns; full
 * screens light something.
 *
 * @returns Problems (empty = pass).
 */
export function checkScene(marker: SceneMarker, img: RgbaImage): string[] {
  if (img.width !== SCREEN_W || img.height !== SCREEN_H) {
    return [`${marker.name}: screenshot ${img.width}×${img.height}, expected 576×288`];
  }
  const counts = columnLitCounts(img);
  if (marker.layout === 'full') {
    return counts.some((c) => c > 0) ? [] : [`${marker.name}: glasses display is blank`];
  }
  return (['A', 'B', 'C'] as const).flatMap((col, i) =>
    (counts[i] ?? 0) > 0 ? [] : [`${marker.name}: column ${col} has no lit pixels`],
  );
}

/**
 * INV-1 pixel check: every thirds scene must share the same gutter signature.
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
