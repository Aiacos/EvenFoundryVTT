/**
 * PortraitRenderer — server-side Floyd-Steinberg dither pipeline for portrait images (Plan 13-03).
 *
 * Produces a 100×60 4-bit indexed-palette PNG from any HTTP(S) image URL.
 *
 * ## Pipeline (D-13-06)
 *
 * 1. `fetch(url)` → `Buffer` (via injected `_fetchFn` for testability; production uses
 *    Node 24 LTS native `globalThis.fetch`).
 * 2. Response body size guard: >5 MB → `PortraitTooLargeError` (T-13-02a).
 * 3. `sharp(buffer).resize(100, 60, { fit: 'cover' }).raw().toBuffer()` → RGBA `Buffer`.
 *    `fit: 'cover'` crops the image to fill the target dimensions (portrait crop).
 * 4. `image-q PointContainer.fromUint8Array(rgba, 100, 60)` → quantize against the
 *    16-step greyscale palette via Floyd-Steinberg dither.
 * 5. `UPNG.encode([ditheredRgba.buffer], 100, 60, 16)` → 4-bit indexed-palette PNG ArrayBuffer.
 * 6. Return `{ pngBytes: Uint8Array, urlHash: sha256Hex(url) }`.
 *
 * ## Node-side vs browser-side
 *
 * The browser pipeline (packages/g2-app/src/raster/raster-worker.ts) uses
 * `OffscreenCanvas` for resize (Stage 2). This server-side variant substitutes
 * `sharp` — same mathematical output (Floyd-Steinberg + 16-step greyscale palette),
 * different resize runtime (D-13-06 decision: sharp@0.34.x, zero-build native).
 *
 * ## Error types
 *
 * - `PortraitFetchError` — `fetch()` returned non-2xx status.
 * - `PortraitTooLargeError` — response body exceeds MAX_BODY_BYTES (5 MB).
 * - `PortraitDecodeError` — `sharp` or `image-q` failed to process the image.
 *
 * @see packages/bridge/src/portrait/portrait-cache.ts (cache consumer)
 * @see packages/bridge/src/routes/portrait.ts (route consumer)
 * @see packages/g2-app/src/raster/raster-worker.ts (browser-side reference pipeline)
 * @see .planning/phases/13-v2-stretch/13-03-PLAN.md Task 2
 */

import * as ImageQ from 'image-q';
import sharp from 'sharp';
import * as UPNG from 'upng-js';

// ─── Constants ────────────────────────────────────────────────────────────────

const PORTRAIT_W = 100;
const PORTRAIT_H = 60;
const PALETTE_STEPS = 16;
const MAX_BODY_BYTES = 5 * 1024 * 1024; // 5 MB (T-13-02a)

// ─── Error types ──────────────────────────────────────────────────────────────

/** Thrown when the upstream fetch returns a non-2xx status. */
export class PortraitFetchError extends Error {
  constructor(
    public readonly url: string,
    public readonly status: number,
  ) {
    super(`[portrait-renderer] fetch failed: ${status} ${url}`);
    this.name = 'PortraitFetchError';
  }
}

/** Thrown when the response body exceeds MAX_BODY_BYTES (5 MB). */
export class PortraitTooLargeError extends Error {
  constructor(public readonly url: string) {
    super(`[portrait-renderer] response body too large (>5 MB): ${url}`);
    this.name = 'PortraitTooLargeError';
  }
}

/** Thrown when sharp or image-q fails to decode/process the image. */
export class PortraitDecodeError extends Error {
  /** The underlying error that caused the decode failure. */
  public readonly originalCause: unknown;

  constructor(url: string, originalCause: unknown) {
    super(`[portrait-renderer] decode failed for ${url}`);
    this.name = 'PortraitDecodeError';
    this.originalCause = originalCause;
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

/** Rendered portrait output. */
export interface PortraitRenderResult {
  /** 4-bit indexed-palette PNG bytes (100×60 px). */
  pngBytes: Uint8Array;
  /** SHA-256 hex of the resolved absolute URL that was fetched (64 chars). */
  urlHash: string;
}

/** Minimal fetch function shape (native fetch or injected test double). */
export type PortraitFetchFn = (url: string) => Promise<Response>;

/** Factory options for {@link createPortraitRenderer}. */
export interface PortraitRendererOpts {
  /** Optional pino-like logger (duck-typed for test isolation). */
  logger?: { warn: (obj: unknown, msg?: string) => void };
  /**
   * Optional fetch function override for tests.
   * Defaults to Node 24 LTS native `globalThis.fetch`.
   */
  _fetchFn?: PortraitFetchFn;
}

/** Portrait renderer returned by {@link createPortraitRenderer}. */
export interface PortraitRenderer {
  /**
   * Fetch + resize + dither + encode a portrait image.
   *
   * @param url — Resolved absolute URL of the portrait image.
   * @throws {PortraitFetchError} on non-2xx status.
   * @throws {PortraitTooLargeError} on body > 5 MB.
   * @throws {PortraitDecodeError} on image processing failure.
   */
  renderPortrait(url: string): Promise<PortraitRenderResult>;
}

// ─── SHA-256 helper ───────────────────────────────────────────────────────────

/** Compute SHA-256 hex of a URL string using Node 24 LTS native `crypto`. */
async function sha256Hex(str: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await (
    globalThis as unknown as {
      crypto: { subtle: { digest(alg: string, data: Uint8Array): Promise<ArrayBuffer> } };
    }
  ).crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ─── Palette ──────────────────────────────────────────────────────────────────

/** Build the canonical 16-step phosphor-green greyscale palette (mirrors raster-worker.ts). */
function buildGreyscalePalette(): ImageQ.utils.Palette {
  const pal = new ImageQ.utils.Palette();
  for (let i = 0; i < PALETTE_STEPS; i++) {
    const v = i * 16; // 0, 16, 32, ..., 240
    pal.add(ImageQ.utils.Point.createByRGBA(v, v, v, 255));
  }
  return pal;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create a portrait renderer with injected dependencies.
 *
 * @param opts — Logger and optional fetch function override.
 * @returns `{ renderPortrait(url) }` — async pipeline.
 */
export function createPortraitRenderer(opts: PortraitRendererOpts = {}): PortraitRenderer {
  const { logger, _fetchFn } = opts;
  const fetchFn: PortraitFetchFn =
    _fetchFn ??
    ((url: string) =>
      (globalThis as unknown as { fetch: (url: string) => Promise<Response> }).fetch(url));

  const palette = buildGreyscalePalette();

  return {
    async renderPortrait(url: string): Promise<PortraitRenderResult> {
      // Step 1 — fetch
      let resp: Response;
      try {
        resp = await fetchFn(url);
      } catch {
        throw new PortraitFetchError(url, 0);
      }

      if (!resp.ok) {
        throw new PortraitFetchError(url, resp.status);
      }

      // Step 2 — body size guard (T-13-02a)
      const contentLength = Number(resp.headers.get('content-length') ?? '0');
      if (contentLength > MAX_BODY_BYTES) {
        throw new PortraitTooLargeError(url);
      }

      let bodyBuffer: Buffer;
      try {
        const arrayBuf = await resp.arrayBuffer();
        if (arrayBuf.byteLength > MAX_BODY_BYTES) {
          throw new PortraitTooLargeError(url);
        }
        bodyBuffer = Buffer.from(arrayBuf);
      } catch (err) {
        if (err instanceof PortraitTooLargeError) throw err;
        throw new PortraitDecodeError(url, err);
      }

      // Step 3 — resize to 100×60 RGBA via sharp
      let rgbaBuffer: Buffer;
      try {
        const { data } = await sharp(bodyBuffer)
          .resize(PORTRAIT_W, PORTRAIT_H, { fit: 'cover' })
          .raw()
          .ensureAlpha()
          .toBuffer({ resolveWithObject: true });
        rgbaBuffer = data;
      } catch (err) {
        logger?.warn({ url, err }, '[portrait-renderer] sharp resize failed');
        throw new PortraitDecodeError(url, err);
      }

      // Step 4 — image-q Floyd-Steinberg dither against 16-step greyscale palette
      // Uses ImageQ.applyPaletteSync (mirrors raster-worker.ts Stage 3).
      let ditheredRgba: Uint8Array;
      try {
        const inContainer = ImageQ.utils.PointContainer.fromUint8Array(
          new Uint8ClampedArray(rgbaBuffer.buffer, rgbaBuffer.byteOffset, rgbaBuffer.length),
          PORTRAIT_W,
          PORTRAIT_H,
        );
        const outContainer = ImageQ.applyPaletteSync(inContainer, palette, {
          imageQuantization: 'floyd-steinberg',
          colorDistanceFormula: 'euclidean-bt709',
        });
        ditheredRgba = outContainer.toUint8Array();
      } catch (err) {
        logger?.warn({ url, err }, '[portrait-renderer] image-q dither failed');
        throw new PortraitDecodeError(url, err);
      }

      // Step 5 — UPNG encode 4-bit indexed PNG
      // ditheredRgba is Uint8Array; .buffer gives the underlying ArrayBuffer for UPNG
      const pngArrayBuffer = UPNG.encode(
        [ditheredRgba.buffer as ArrayBuffer],
        PORTRAIT_W,
        PORTRAIT_H,
        PALETTE_STEPS,
      );
      const pngBytes = new Uint8Array(pngArrayBuffer);

      // Step 6 — compute urlHash
      const urlHash = await sha256Hex(url);

      return { pngBytes, urlHash };
    },
  };
}
