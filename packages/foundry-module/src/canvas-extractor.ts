/**
 * Foundry PIXI canvas → FramePng extractor.
 *
 * Captures the Foundry scene canvas (RenderTexture path when available, no-arg
 * `extract.pixels()` fallback), fit-downscales it to the 576×288 glasses
 * region with letterboxing and optional contrast normalization, converts it to
 * Rec.601 luma quantized to the display's 16 grey levels, and emits it as a
 * lossless PNG (`frame_png` wire payload — real map scenes ~25-40 KB vs
 * ~884 KB raw RGBA base64).
 *
 * Scheduling model:
 *   - A self-rescheduling setTimeout loop captures every
 *     `getCaptureIntervalMs()` ms (the `captureFps` world setting, read live
 *     before each wait — 1–60 fps with no scheduler-imposed cap).
 *   - The five canvas hooks (canvasReady/drawCanvas/refreshToken/updateScene/
 *     canvasPan) additionally trigger captures through a leading+trailing
 *     {@link THROTTLE_MS} throttle, so panning produces immediate frames.
 *   - Identical frames (same FNV-1a luma hash) are skipped, EXCEPT a forced
 *     keyframe at least every {@link KEYFRAME_INTERVAL_MS} so late-joining WS
 *     subscribers always receive the current frame (the bridge is push-only
 *     and keeps no frame cache).
 *
 * upng-js 2.1.0 API note: only `encode`/`decode`/`toRGBA8`/`quantize` exist;
 * `encode(..., forbidPlte=true)` yields a ctype-2 RGB PNG with exact byte
 * roundtrip (the palette path crashes `toRGBA8` under Node).
 *
 * @see packages/shared-protocol/src/payloads/frame-png.ts (frame_png wire schema)
 * @see docs/architecture/0001-layered-ui-model.md §Confirmation (z=0 map consumer)
 * @see docs/architecture/0006-raster-pipeline-library-stack.md (raster pipeline)
 */
import type { FramePng } from '@evf/shared-protocol';
import * as UPNG from 'upng-js';
import type { WorldRect } from './map-framing.js';

/**
 * Supersample factor for the framed (region-render) capture path: the
 * off-screen RenderTexture is created at `target × FRAMED_SUPERSAMPLE` so the
 * CPU fit-downscale that follows is strictly downscaling (anti-aliased), the
 * same quality rationale as the live-viewport RT path's 1.5× capture scale.
 */
const FRAMED_SUPERSAMPLE = 2;

/**
 * Leading+trailing throttle window for hook-driven captures.
 *
 * First hook fire in a window captures immediately (leading edge) and arms the
 * timer; further fires inside the window coalesce into one trailing capture
 * when the timer fires. Continuous `canvasPan` therefore emits ~5 fps instead
 * of starving (the old trailing-only debounce never fired during constant
 * hook activity).
 */
const THROTTLE_MS = 200;

/**
 * Bayer 4×4 ordered-dither threshold offsets, normalized to ±~0.47 of one
 * quantization level (row-major, indexed `((y & 3) << 2) | (x & 3)`).
 *
 * Same matrix family as the g2-app HUD dither (quick 260611-clr) — applied
 * module-side during the 16-level quantize when the `mapDither` client
 * setting is ON. Deterministic: identical input frames produce identical
 * dithered output, so the FNV-1a identical-frame skip keeps working.
 */
const BAYER_4X4: readonly number[] = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(
  (v) => (v + 0.5) / 16 - 0.5,
);

/**
 * Maximum idle time between emits before a keyframe is forced.
 *
 * The identical-frame skip would otherwise mean a glasses app that (re)connects
 * while the scene is static NEVER receives the current frame — the module is
 * push-only and cannot see WS subscribers. A forced keyframe every 5 s bounds
 * the blank-map window at ~11 KB / 5 s of idle bandwidth.
 */
const KEYFRAME_INTERVAL_MS = 5_000;

/**
 * Canonical raster-region width — FULL SCREEN 576×288 (layout B, 2026-06-10).
 * See the v0.1.14 documentation on the hardware limit and the 2×2 tile grid.
 */
const MAX_WIDTH = 576;
/** Canonical raster-region height — see {@link MAX_WIDTH}. */
const MAX_HEIGHT = 288;
/** FramePngSchema lower bound (we clamp here too). */
const MIN_DIM = 20;

/** Function used to unregister the hook listeners and intervals installed at register time. */
export type UnregisterFn = () => void;

/** Options passed to {@link registerCanvasExtractor}. */
export interface CanvasExtractorOpts {
  /**
   * Callback fired with the typed `FramePng` payload after each capture that
   * passes the changed-content gate (or the periodic keyframe). The bridge
   * wraps the payload in `EnvelopeSchema` server-side with `type: 'frame_png'`.
   */
  readonly emit: (payload: FramePng) => void;
  /** Wire-format target width (defaults to {@link MAX_WIDTH}). */
  readonly targetWidth?: number;
  /** Wire-format target height (defaults to {@link MAX_HEIGHT}). */
  readonly targetHeight?: number;
  /**
   * Per-capture normalize mode supplier.
   *
   * Evaluated on EVERY call to `performExtract`, so a live toggle of the
   * `mapContrastNormalize` Foundry setting applies on the next capture without
   * re-registering.
   *
   * Return `'auto'` to apply luminance levels-stretch. Return `'off'` to pass
   * frames through unchanged. Defaults to `'off'` when absent.
   */
  readonly getNormalize?: () => 'off' | 'auto';
  /**
   * Live capture-interval supplier (ms).
   *
   * Evaluated before EVERY wait of the self-rescheduling capture loop, so the
   * DM can change the capture cadence (the `captureFps` world setting) without
   * reloading the module — the new value applies from the next cycle. There is
   * no scheduler-imposed fps cap: the loop runs at whatever interval this
   * getter returns (clamped to ≥1 ms).
   *
   * Defaults to 250 ms (4 fps) when absent.
   *
   * @see `getCaptureIntervalMs` in settings.ts (converts the `captureFps` world setting to ms).
   */
  readonly getCaptureIntervalMs?: () => number;
  /**
   * Optional telemetry sink for {@link FrameCaptureStats}, called at most
   * every 5 s (rides the keyframe cadence). The module wires this to a
   * `frame_stats` envelope on the bridge delta channel so capture-phase
   * timings are observable remotely without access to the client console.
   */
  readonly emitStats?: (stats: FrameCaptureStats) => void;
  /**
   * Per-capture dither mode supplier (the `mapDither` client setting).
   *
   * `true` applies a Bayer 4×4 ordered dither during the 16-level quantization
   * (gradients become a stippled pattern); `false`/absent quantizes to flat
   * nearest levels. Evaluated on every capture — the toggle applies live.
   */
  readonly getDither?: () => boolean;
  /**
   * Per-capture brightness supplier (the `mapBrightness` client setting),
   * −100..+100 (0 = neutral). Applied as a luma multiplier before the 16-level
   * quantize — see the `brightness` option of {@link extractCurrentFrame}.
   * Evaluated on every capture so the slider applies live (like `getDither`).
   */
  readonly getBrightness?: () => number;
  /**
   * Per-capture WebP quality supplier (the `mapWebpQuality` world setting).
   *
   * `0` (or absent) keeps the lossless PNG wire format; `1–100` asks the
   * native encoder for lossy WebP at that quality — measured ~4–7× smaller
   * than the equivalent PNG (68 KB → 10–18 KB at q75), which at 30 fps cuts
   * the per-hop wire cost from ~22 Mbit/s to ~4 Mbit/s. Hosts whose
   * `convertToBlob` cannot produce WebP (detected via `Blob.type`) fall back
   * to PNG transparently. Evaluated on every capture — applies live.
   */
  readonly getWebpQuality?: () => number;
  /**
   * Live stream-source gate, evaluated at the START of every capture.
   *
   * Module code runs on every connected Foundry client; only ONE client should
   * stream frames (duplicate viewports would alternate on the glasses). The
   * caller supplies the election logic (active GM preferred, deterministic
   * fallback otherwise — see `isStreamLeader` in module.ts). Evaluated live so
   * leadership can migrate (GM joins/leaves) without re-registering.
   *
   * Absent → always enabled.
   */
  readonly isEnabled?: () => boolean;
  /**
   * Live map-framing supplier, evaluated at the START of every capture.
   *
   * Return a world-space rectangle to capture that region (party auto-framing,
   * focus-weighted — see {@link computePartyFraming}) instead of the GM's live
   * viewport; the GM's on-screen camera is NOT disturbed. Return `null` (or omit
   * the option) to capture the live viewport. Evaluated live so the framing
   * follows token movement / a changed focus actor without re-registering.
   */
  readonly getFraming?: () => WorldRect | null;
}

/**
 * Subset of the Foundry global `canvas` that {@link extractCurrentFrame}
 * reads from. See the v0.1.14 documentation for the full RT/fallback rationale.
 */
export interface CanvasLike {
  readonly scene?: { readonly id?: string } | null;
  readonly app?: {
    readonly renderer?: {
      readonly width: number;
      readonly height: number;
      readonly screen?: { readonly width: number; readonly height: number };
      readonly extract: {
        pixels(target?: unknown): Uint8Array | Uint8ClampedArray;
      };
      render?(target: unknown, opts: { renderTexture: unknown; clear: boolean }): void;
    };
  };
  readonly stage?: unknown;
}

/** Return shape for {@link acquireSourceBytes}. */
interface AcquiredBytes {
  readonly srcBytes: Uint8Array | Uint8ClampedArray;
  readonly srcWidth: number;
  readonly srcHeight: number;
}

/** Minimal mutable 2D point (PIXI `Point`/`ObservablePoint`) used by the framing path. */
interface PixiPointLike {
  x: number;
  y: number;
  set?(x: number, y: number): void;
}

/** Minimal PIXI container transform read/written by {@link acquireFramedBytes}. */
interface StageTransformLike {
  position?: PixiPointLike | null;
  scale?: PixiPointLike | null;
  pivot?: PixiPointLike | null;
}

/** Assign a PIXI point via `.set` when available (fires the observable callback), else fields. */
function setPoint(p: PixiPointLike, x: number, y: number): void {
  if (typeof p.set === 'function') {
    p.set(x, y);
  } else {
    p.x = x;
    p.y = y;
  }
}

/**
 * Acquire RGBA bytes for a SPECIFIC world rectangle (map auto-framing) by
 * rendering `canvas.stage` to an off-screen RenderTexture under a temporary
 * fit transform, then restoring the live transform in the SAME synchronous tick
 * so the GM's on-screen camera never visibly moves.
 *
 * The stage maps world→screen as `screen = (world − pivot) · scale + position`;
 * to fit `framing` into an `RW×RH` texture we set `pivot` = rect center,
 * `position` = texture center, `scale` = `min(RW/w, RH/h)` (letterbox-fit, no
 * distortion). The original `position`/`scale`/`pivot` are ALWAYS restored in a
 * `finally`, even on render/extract failure — a botched frame must never strand
 * the GM's viewport at the framing transform.
 *
 * Returns `null` (caller falls back to the live-viewport path) when the host
 * lacks the RT/`render` primitives or the stage transform is unreadable.
 */
function acquireFramedBytes(
  RT: { create(o: { width: number; height: number; resolution?: number }): unknown } | undefined,
  renderer: NonNullable<NonNullable<CanvasLike['app']>['renderer']>,
  canvas: CanvasLike,
  framing: WorldRect,
  RW: number,
  RH: number,
): AcquiredBytes | null {
  const stage = canvas.stage as StageTransformLike | undefined | null;
  const pos = stage?.position;
  const scl = stage?.scale;
  const piv = stage?.pivot;
  if (
    RT === undefined ||
    typeof renderer.render !== 'function' ||
    stage === undefined ||
    stage === null ||
    pos === undefined ||
    pos === null ||
    scl === undefined ||
    scl === null ||
    piv === undefined ||
    piv === null
  ) {
    return null;
  }

  // Snapshot the live (GM) transform so the finally can restore it exactly.
  const saved = { px: pos.x, py: pos.y, sx: scl.x, sy: scl.y, vx: piv.x, vy: piv.y };
  try {
    const scale = Math.min(RW / framing.width, RH / framing.height);
    setPoint(piv, framing.x + framing.width / 2, framing.y + framing.height / 2);
    setPoint(pos, RW / 2, RH / 2);
    setPoint(scl, scale, scale);

    let rt: unknown;
    try {
      rt = RT.create({ width: RW, height: RH, resolution: 1 });
      renderer.render?.(stage, { renderTexture: rt, clear: true });
      const srcBytes = renderer.extract.pixels(rt);
      if (srcBytes.length === RW * RH * 4) {
        return { srcBytes, srcWidth: RW, srcHeight: RH };
      }
      console.warn(
        `[EVF canvas-extractor] framed readback length ${srcBytes.length} ≠ ${RW}x${RH} — skipping frame`,
      );
      return null;
    } finally {
      if (rt !== undefined) {
        (rt as { destroy(b: boolean): void }).destroy(true);
      }
    }
  } catch (err) {
    console.warn(
      '[EVF canvas-extractor] framed render threw, skipping frame:',
      (err as Error).message ?? err,
    );
    return null;
  } finally {
    // ALWAYS restore the GM's on-screen camera transform.
    setPoint(pos, saved.px, saved.py);
    setPoint(scl, saved.sx, saved.sy);
    setPoint(piv, saved.vx, saved.vy);
  }
}

/**
 * Acquire raw RGBA source bytes from the renderer using either the RT primary
 * path or the no-arg fallback. Unchanged from v0.1.14 (RT rationale in JSDoc).
 */
function acquireSourceBytes(
  RT: { create(o: { width: number; height: number; resolution?: number }): unknown } | undefined,
  renderer: NonNullable<NonNullable<CanvasLike['app']>['renderer']>,
  canvas: CanvasLike,
  vw: number,
  vh: number,
  targetWidth: number,
  targetHeight: number,
): AcquiredBytes | null {
  const useRTPath =
    RT !== undefined &&
    typeof renderer.render === 'function' &&
    canvas.stage !== undefined &&
    canvas.stage !== null;

  if (useRTPath) {
    let rt: unknown;
    try {
      // Downscaled-RT capture (v0.1.22 perf): a full-viewport readback is
      // ~8.3 MB at 1920×1080 and dominated the per-capture cost (~175 ms
      // measured live → ~5 fps ceiling). Creating the RT with a fractional
      // `resolution` shrinks the GPU backing store (and therefore the
      // readback + every CPU pass after it) while the stage renders with its
      // own pan/zoom transform untouched. 1.5× the final fit-scale keeps the
      // CPU fit-downscale strictly downscaling (quality preserved).
      const fitScale = Math.min(targetWidth / vw, targetHeight / vh);
      const captureScale = Math.min(1, Math.max(0.1, 1.5 * fitScale));
      rt = RT.create({ width: vw, height: vh, resolution: captureScale });
      let srcBytes: Uint8Array | Uint8ClampedArray;
      try {
        renderer.render?.(canvas.stage, { renderTexture: rt, clear: true });
        srcBytes = renderer.extract.pixels(rt);
      } finally {
        (rt as { destroy(b: boolean): void }).destroy(true);
      }
      // The returned buffer length tells us which resolution the extract
      // actually honored — PIXI versions differ. Accept either; anything else
      // is a real mismatch (skip the frame, same policy as v0.1.12 DPR fix).
      const sw = Math.round(vw * captureScale);
      const sh = Math.round(vh * captureScale);
      if (srcBytes.length === sw * sh * 4) {
        return { srcBytes, srcWidth: sw, srcHeight: sh };
      }
      if (srcBytes.length === vw * vh * 4) {
        return { srcBytes, srcWidth: vw, srcHeight: vh };
      }
      console.warn(
        `[EVF canvas-extractor] RT readback length ${srcBytes.length} matches neither ` +
          `${sw}x${sh} nor ${vw}x${vh} — skipping frame`,
      );
      return null;
    } catch (err) {
      console.warn(
        '[EVF canvas-extractor] extract.pixels threw, skipping frame:',
        (err as Error).message ?? err,
      );
      return null;
    }
  } else {
    try {
      const srcBytes = renderer.extract.pixels();
      return { srcBytes, srcWidth: renderer.width, srcHeight: renderer.height };
    } catch (err) {
      console.warn(
        '[EVF canvas-extractor] extract.pixels threw, skipping frame:',
        (err as Error).message ?? err,
      );
      return null;
    }
  }
}

/**
 * Compute FNV-1a 32-bit hash over a byte array.
 *
 * Used for identical-frame skip: if the luma hash of the current capture
 * equals `_lastEmittedHash`, the frame is skipped (no POST to the bridge).
 * Cost: one pass over the luma array (width × height bytes) — cheap vs. PNG encode.
 *
 * @internal
 */
function fnv1a32(bytes: Uint8Array): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i] ?? 0;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Pure extractor — given a Foundry canvas-like object, produce a `FramePng`
 * payload ready to send across the bridge WS. Returns `null` when the canvas is
 * not yet ready (renderer absent).
 *
 * **v0.1.15 changes vs. v0.1.14**
 *
 * The return type changed from `FramePixels` to `FramePng`. The caller
 * ({@link registerCanvasExtractor}) now maintains the FNV-1a hash and decides
 * whether to emit; this function always returns the payload (hash skip is in the
 * caller for clean separation). The PNG encoding step replaces the raw-RGBA step.
 *
 * **Encoding recipe (FRAME-PNG-01 CRITICAL)**
 *
 * 1. Fit-downscale + letterbox (unchanged from v0.1.14) → `out: Uint8ClampedArray`
 * 2. Optional contrast normalization (`normalize: 'auto'`) (unchanged)
 * 3. Alpha set to 255 everywhere (unchanged)
 * 4. Compute Rec.601 luma per pixel: `luma = round(0.299*R + 0.587*G + 0.114*B)`
 * 5. Build R=G=B=luma RGBA buffer for UPNG (greyscale content, lossless wire)
 * 6. Encode: `UPNG.encode([rgbaForPng.buffer], w, h, 0, undefined, true)`
 *    (forbidPlte=true → ctype=2 RGB; the palette path crashes `toRGBA8` under Node)
 * 7. Base64-encode the PNG ArrayBuffer (Buffer on Node, btoa+chunk on browser)
 *
 * @param canvas - Foundry canvas (or test fixture matching `CanvasLike`)
 * @param opts   - Optional target dimensions and normalization mode
 * @returns Typed FramePng payload or `null` if the canvas is not ready
 */
export function extractCurrentFrame(
  canvas: CanvasLike,
  opts: {
    readonly targetWidth?: number;
    readonly targetHeight?: number;
    readonly normalize?: 'off' | 'auto';
    /** Bayer 4×4 ordered dither during the 16-level quantize (default false). */
    readonly dither?: boolean;
    /**
     * Luma brightness gain in percent, −100..+100 (default 0 = neutral). Applied
     * multiplicatively to the Rec.601 luma just before the 16-level quantize:
     * `luma *= 1 + brightness/100` (clamped to 0..255). +100 doubles brightness,
     * −100 floors to black. Cheap (one mul+clamp per pixel) and lets the G2's
     * fixed phosphor display be tuned without changing the scene lighting.
     */
    readonly brightness?: number;
    /**
     * Skip the (expensive) PNG encode: `pngB64` comes back empty and `_luma`
     * carries the quantized frame. Used by `performExtract` to hash-check
     * BEFORE paying for the encode and to pick the native encoder.
     */
    readonly skipEncode?: boolean;
    /**
     * Optional world-space rectangle to capture (map auto-framing). When set
     * AND the host supports the RT/`render` path, the stage is rendered to an
     * off-screen texture under a temporary fit transform for this rect (the
     * GM's on-screen camera is restored in the same tick — see
     * {@link acquireFramedBytes}). Absent / unsupported host → the live GM
     * viewport is captured (legacy behavior).
     */
    readonly framing?: WorldRect | null;
  } = {},
): FramePng | null {
  const renderer = canvas.app?.renderer;
  if (renderer === undefined) {
    return null;
  }

  const targetWidth = Math.max(MIN_DIM, Math.min(opts.targetWidth ?? MAX_WIDTH, MAX_WIDTH));
  const targetHeight = Math.max(MIN_DIM, Math.min(opts.targetHeight ?? MAX_HEIGHT, MAX_HEIGHT));

  const vw = Math.max(1, Math.floor(renderer.screen?.width ?? renderer.width));
  const vh = Math.max(1, Math.floor(renderer.screen?.height ?? renderer.height));
  if (vw <= 0 || vh <= 0) {
    return null;
  }

  const RT = (
    globalThis as {
      PIXI?: {
        RenderTexture?: {
          create(o: { width: number; height: number; resolution?: number }): unknown;
        };
      };
    }
  ).PIXI?.RenderTexture;

  const tAcquire0 = Date.now();
  // Map auto-framing: when a world rect is supplied, render that region to an
  // off-screen RT (GM camera restored in-tick). Falls back to the live-viewport
  // capture when the host lacks the RT/render primitives or the rect is empty.
  const framing = opts.framing ?? null;
  let acquired: AcquiredBytes | null = null;
  if (framing !== null && framing.width > 0 && framing.height > 0) {
    acquired = acquireFramedBytes(
      RT,
      renderer,
      canvas,
      framing,
      targetWidth * FRAMED_SUPERSAMPLE,
      targetHeight * FRAMED_SUPERSAMPLE,
    );
  }
  if (acquired === null) {
    acquired = acquireSourceBytes(RT, renderer, canvas, vw, vh, targetWidth, targetHeight);
  }
  if (acquired === null) {
    return null;
  }
  const tAcquire1 = Date.now();
  const { srcBytes, srcWidth, srcHeight } = acquired;

  // ── Byte-length sanity guard (T-fw7-01 / T-lx5-02 mitigations) ───────────
  const expected = srcWidth * srcHeight * 4;
  let effWidth = srcWidth;
  let effHeight = srcHeight;
  if (srcBytes.length !== expected) {
    const k = Math.sqrt(srcBytes.length / expected);
    const kRound = Math.round(k);
    if (
      kRound >= 2 &&
      Math.abs(k - kRound) < 1e-6 &&
      srcWidth * kRound * (srcHeight * kRound) * 4 === srcBytes.length
    ) {
      effWidth = srcWidth * kRound;
      effHeight = srcHeight * kRound;
    } else {
      console.warn(
        '[EVF canvas-extractor] pixel buffer length mismatch — expected',
        expected,
        'got',
        srcBytes.length,
        '; skipping frame',
      );
      return null;
    }
  }

  // Fit-downscale + letterbox (Option C — unchanged from v0.1.14).
  const scale = Math.min(targetWidth / effWidth, targetHeight / effHeight, 1);
  const outWidth = Math.max(1, Math.round(effWidth * scale));
  const outHeight = Math.max(1, Math.round(effHeight * scale));

  const out = new Uint8ClampedArray(targetWidth * targetHeight * 4);
  const padX = Math.floor((targetWidth - outWidth) / 2);
  const padY = Math.floor((targetHeight - outHeight) / 2);

  const invScale = 1 / scale;
  for (let dy = 0; dy < outHeight; dy++) {
    const sy0 = Math.floor(dy * invScale);
    const sy1 = Math.min(effHeight, Math.max(sy0 + 1, Math.floor((dy + 1) * invScale)));
    for (let dx = 0; dx < outWidth; dx++) {
      const sx0 = Math.floor(dx * invScale);
      const sx1 = Math.min(effWidth, Math.max(sx0 + 1, Math.floor((dx + 1) * invScale)));
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let sy = sy0; sy < sy1; sy++) {
        let si = (sy * effWidth + sx0) * 4;
        for (let sx = sx0; sx < sx1; sx++) {
          r += srcBytes[si] ?? 0;
          g += srcBytes[si + 1] ?? 0;
          b += srcBytes[si + 2] ?? 0;
          n++;
          si += 4;
        }
      }
      const di = ((padY + dy) * targetWidth + (padX + dx)) * 4;
      out[di] = r / n;
      out[di + 1] = g / n;
      out[di + 2] = b / n;
    }
  }

  // ── Contrast normalization (unchanged from v0.1.14) ───────────────────────
  if (opts.normalize === 'auto' && outWidth > 0 && outHeight > 0) {
    const hist = new Uint32Array(256);
    const contentPixelCount = outWidth * outHeight;
    for (let dy = 0; dy < outHeight; dy++) {
      for (let dx = 0; dx < outWidth; dx++) {
        const di = ((padY + dy) * targetWidth + (padX + dx)) * 4;
        const r = out[di] ?? 0;
        const g = out[di + 1] ?? 0;
        const b = out[di + 2] ?? 0;
        const luma = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
        const bin = Math.min(255, Math.max(0, luma));
        hist[bin] = (hist[bin] ?? 0) + 1;
      }
    }
    const p2Target = Math.round(contentPixelCount * 0.02);
    const p98Target = Math.round(contentPixelCount * 0.98);
    let p2 = 0;
    let p98 = 255;
    let cumulative = 0;
    let p2Found = false;
    for (let bin = 0; bin <= 255; bin++) {
      cumulative += hist[bin] ?? 0;
      if (!p2Found && cumulative >= p2Target) {
        p2 = bin;
        p2Found = true;
      }
      if (cumulative >= p98Target) {
        p98 = bin;
        break;
      }
    }
    const range = p98 - p2;
    if (range >= 8 && range < 220) {
      for (let dy = 0; dy < outHeight; dy++) {
        for (let dx = 0; dx < outWidth; dx++) {
          const di = ((padY + dy) * targetWidth + (padX + dx)) * 4;
          const r = out[di] ?? 0;
          const g = out[di + 1] ?? 0;
          const b = out[di + 2] ?? 0;
          out[di] = Math.min(255, Math.max(0, Math.round(((r - p2) * 255) / range)));
          out[di + 1] = Math.min(255, Math.max(0, Math.round(((g - p2) * 255) / range)));
          out[di + 2] = Math.min(255, Math.max(0, Math.round(((b - p2) * 255) / range)));
        }
      }
    }
  }

  // Opaque alpha everywhere.
  for (let i = 3; i < out.length; i += 4) {
    out[i] = 255;
  }

  // ── Rec.601 luma → 16-level quantize → PNG encode ──────────────────────────
  //
  // The G2 display renders 4-bit greyscale (16 levels), so quantizing the luma
  // to 16 levels HERE is lossless for what the player can see while shrinking
  // the PNG dramatically (long runs of equal bytes → DEFLATE-friendly; real
  // map scenes measured ~89 KB full-depth vs ~25-40 KB quantized). It also
  // stabilizes the FNV-1a hash: sub-level RT-capture noise no longer defeats
  // the identical-frame skip.
  // Optional Bayer 4×4 ordered dither (the `mapDither` client setting):
  // a deterministic per-position threshold offset in [-0.5, +0.4375) of one
  // quantization level. Gradients render as a stippled pattern instead of
  // flat bands; determinism preserves the identical-frame skip.
  const dither = opts.dither === true;
  // Brightness gain: −100..+100 → multiplier 0..2 (0 = neutral). Clamped so a
  // malformed setting cannot invert or explode the luma. A gain of exactly 1
  // (the common case) is branch-predicted cheap; we still multiply to keep the
  // loop body branchless.
  const brightnessGain = 1 + Math.max(-100, Math.min(100, opts.brightness ?? 0)) / 100;
  const nPixels = targetWidth * targetHeight;
  const luma = new Uint8Array(nPixels);
  for (let y = 0; y < targetHeight; y++) {
    for (let x = 0; x < targetWidth; x++) {
      const i = y * targetWidth + x;
      const oi = i * 4;
      const r = out[oi] ?? 0;
      const g = out[oi + 1] ?? 0;
      const b = out[oi + 2] ?? 0;
      const full = Math.min(255, (0.299 * r + 0.587 * g + 0.114 * b) * brightnessGain);
      // Map 0..255 → one of 16 levels spread across 0..255 (0, 17, 34, … 255).
      const offset = dither ? (BAYER_4X4[((y & 3) << 2) | (x & 3)] ?? 0) : 0;
      const level = Math.min(15, Math.max(0, Math.floor(full / 17 + 0.5 + offset)));
      luma[i] = level * 17;
    }
  }

  const tProcess1 = Date.now();

  const skipEncode = opts.skipEncode === true;
  const pngBytes = skipEncode ? new Uint8Array(0) : encodePngUpng(luma, targetWidth, targetHeight);
  const pngB64 = skipEncode ? '' : bytesToB64(pngBytes);

  const tEncode1 = Date.now();

  return {
    sceneId: canvas.scene?.id ?? '',
    width: targetWidth,
    height: targetHeight,
    pngB64,
    ts: Date.now(),
    // Non-schema diagnostics fields — the caller strips them before emit.
    // _lumaHash drives the identical-frame skip; _stats feeds the optional
    // frame_stats telemetry channel (see CanvasExtractorOpts.emitStats).
    _lumaHash: fnv1a32(luma),
    _stats: {
      acquireMs: tAcquire1 - tAcquire0,
      processMs: tProcess1 - tAcquire1,
      encodeMs: tEncode1 - tProcess1,
      srcWidth,
      srcHeight,
      viewportWidth: vw,
      viewportHeight: vh,
      pngBytes: pngBytes.length,
      encoder: 'upng',
      dither,
    },
    // Expose the quantized luma so callers (performExtract) can re-encode
    // with the native encoder without re-running the capture pipeline.
    _luma: luma,
  } as FramePng & { _lumaHash: number; _stats: FrameCaptureStats; _luma: Uint8Array };
}

/**
 * Per-capture timing/size diagnostics carried on the `frame_stats` telemetry
 * envelope (emitted at most every 5 s via `CanvasExtractorOpts.emitStats`).
 *
 * `acquireMs` = scene render-to-texture + GPU readback; `processMs` =
 * downscale + normalize + luma + quantize; `encodeMs` = PNG encode + base64.
 * `srcWidth/srcHeight` reveal whether the downscaled-RT capture (fractional
 * PIXI `resolution`) was honored by the host PIXI version. `encoder` says
 * which encoder produced the frame: `'webp'` = native lossy WebP
 * (`mapWebpQuality` > 0 and the host honored `image/webp`), `'native'` =
 * browser-native PNG, `'upng'` = upng-js fallback. `dither` echoes the
 * `mapDither` setting as read on the streaming client (remote verification
 * of the toggle).
 */
export interface FrameCaptureStats {
  readonly acquireMs: number;
  readonly processMs: number;
  readonly encodeMs: number;
  readonly srcWidth: number;
  readonly srcHeight: number;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly pngBytes: number;
  readonly encoder: 'upng' | 'native' | 'webp';
  readonly dither: boolean;
}

/** Expand quantized luma to the R=G=B=luma RGBA buffer PNG encoders consume. */
function lumaToRgba(luma: Uint8Array): Uint8Array {
  const rgba = new Uint8Array(luma.length * 4);
  for (let i = 0; i < luma.length; i++) {
    const v = luma[i] ?? 0;
    const pi = i * 4;
    rgba[pi] = v;
    rgba[pi + 1] = v;
    rgba[pi + 2] = v;
    rgba[pi + 3] = 255;
  }
  return rgba;
}

/**
 * Encode quantized luma to PNG via upng-js (synchronous fallback path).
 *
 * forbidPlte=true forces ctype-2 RGB output — the palette path corrupts
 * toRGBA8 under Node (upng-js 2.1.0; see module-level JSDoc API note).
 */
function encodePngUpng(luma: Uint8Array, width: number, height: number): Uint8Array {
  const rgba = lumaToRgba(luma);
  return new Uint8Array(UPNG.encode([rgba.buffer], width, height, 0, undefined, true));
}

/** Result of a successful native encode — bytes + which encoder label applies. */
interface NativeEncodeResult {
  readonly bytes: Uint8Array;
  readonly encoder: 'native' | 'webp';
}

/**
 * Encode quantized luma via the browser-native encoder
 * (`OffscreenCanvas.convertToBlob`) — measured ~10× faster than upng-js for
 * the 576×288 frame (the live telemetry showed encode dominating the capture
 * cycle at 66-122 ms).
 *
 * `webpQuality` > 0 requests lossy `image/webp` at that quality (0–100 scale,
 * mapped to the 0–1 `quality` option). Hosts that cannot encode WebP return a
 * PNG blob instead (per spec `convertToBlob` falls back to the default type);
 * the actual format is detected via `Blob.type` so the `encoder` label in the
 * telemetry is always truthful. Returns `null` when the host has no
 * OffscreenCanvas (Node test environment) or anything in the chain fails —
 * the caller falls back to {@link encodePngUpng}.
 */
async function encodeFrameNative(
  luma: Uint8Array,
  width: number,
  height: number,
  webpQuality: number,
): Promise<NativeEncodeResult | null> {
  try {
    const g = globalThis as {
      OffscreenCanvas?: new (
        w: number,
        h: number,
      ) => {
        getContext(t: '2d'): {
          putImageData(d: unknown, x: number, y: number): void;
        } | null;
        convertToBlob(o: {
          type: string;
          quality?: number;
        }): Promise<{ readonly type?: string; arrayBuffer(): Promise<ArrayBuffer> }>;
      };
      ImageData?: new (data: Uint8ClampedArray, w: number, h: number) => unknown;
    };
    if (typeof g.OffscreenCanvas !== 'function' || typeof g.ImageData !== 'function') {
      return null;
    }
    const oc = new g.OffscreenCanvas(width, height);
    const ctx = oc.getContext('2d');
    if (ctx === null) {
      return null;
    }
    ctx.putImageData(
      new g.ImageData(new Uint8ClampedArray(lumaToRgba(luma).buffer), width, height),
      0,
      0,
    );
    const wantWebp = webpQuality > 0;
    const blob = await oc.convertToBlob(
      wantWebp
        ? { type: 'image/webp', quality: Math.min(100, webpQuality) / 100 }
        : { type: 'image/png' },
    );
    const gotWebp = wantWebp && blob.type === 'image/webp';
    return {
      bytes: new Uint8Array(await blob.arrayBuffer()),
      encoder: gotWebp ? 'webp' : 'native',
    };
  } catch {
    return null;
  }
}

/** Synchronous feature detection for the browser-native PNG encoder. */
function hasNativeEncoder(): boolean {
  const g = globalThis as { OffscreenCanvas?: unknown; ImageData?: unknown };
  return typeof g.OffscreenCanvas === 'function' && typeof g.ImageData === 'function';
}

/** Base64-encode bytes — dual-environment (Node Buffer / browser btoa+chunk). */
function bytesToB64(bytes: Uint8Array): string {
  const BufferCtor = (
    globalThis as {
      Buffer?: { from(b: Uint8Array): { toString(e: string): string } };
    }
  ).Buffer;
  if (BufferCtor !== undefined) {
    return BufferCtor.from(bytes).toString('base64');
  }
  const btoaFn = (globalThis as { btoa?: (s: string) => string }).btoa;
  if (btoaFn === undefined) {
    throw new Error('[EVF canvas-extractor] no Buffer or btoa available');
  }
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, Math.min(i + CHUNK, bytes.length));
    binary += String.fromCharCode.apply(null, slice as unknown as number[]);
  }
  return btoaFn(binary);
}

/** Internal module state — single registration is enforced (CE-7 idempotency). */
interface RegistrationState {
  readonly handlers: ReadonlyArray<{ readonly event: string; readonly fn: () => void }>;
  /**
   * Canonical teardown for THIS registration: `Hooks.off`s all 5 listeners,
   * clears the throttle + capture-loop timers, and resets the singleton state.
   * Stored so {@link _resetCanvasExtractor} (and any caller) tears down via the
   * exact same path as the returned unregister fn — preventing listener leaks
   * across register → reset → register.
   */
  readonly teardown: () => void;
}

let _registered: RegistrationState | null = null;

/** FNV-1a hash of the last emitted luma array (for identical-frame skip). */
let _lastEmittedHash: number | null = null;

/**
 * WebP quality of the last emitted frame (for the identical-frame skip).
 *
 * The luma hash captures dither + brightness + normalize (they all change
 * pixel luma) but NOT `webpQuality` — a lossless↔lossy toggle does not alter
 * luma, so on a static scene the hash-only skip would suppress re-emit until
 * the 5 s keyframe, contradicting the "applies live on the next capture"
 * contract. Folding the quality into the skip key forces an immediate re-emit
 * when only the quality changed.
 */
let _lastEmittedWebpQuality: number | null = null;

/** Timestamp of the last emit — drives the {@link KEYFRAME_INTERVAL_MS} keyframe. */
let _lastEmitTs = 0;

/** Timestamp of the last frame_stats telemetry emit (throttled to every 5 s). */
let _lastStatsTs = 0;

/** One quantized frame waiting for (or undergoing) native encode. */
interface EncodeJob {
  readonly luma: Uint8Array;
  readonly width: number;
  readonly height: number;
  readonly sceneId: string;
  readonly stats: FrameCaptureStats | undefined;
  readonly dither: boolean;
  /** WebP quality 1–100 as read at capture time; 0 = lossless PNG. */
  readonly webpQuality: number;
}

/** Whether a native encode is in flight (single-flight encode queue). */
let _encodeBusy = false;

/** One-time guard for the upng-fallback perf warning (issue #37). */
let _upngFallbackWarned = false;

/** Latest frame queued behind the in-flight encode (latest-wins). */
let _pendingEncode: EncodeJob | null = null;

/** Leading+trailing throttle timer handle for hook-driven captures. */
let _throttleTimer: ReturnType<typeof setTimeout> | null = null;

/** Whether a trailing emit is pending (throttle re-arm flag). */
let _pendingTrailing = false;

/** Self-rescheduling capture-loop timer handle (continuous periodic capture). */
let _captureLoopTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Register the five Foundry hooks (canvasReady, drawCanvas, refreshToken, updateScene,
 * canvasPan) and a continuous self-rescheduling capture loop that drives canvas extraction.
 *
 * Returns an unregister function that calls `Hooks.off` for each registered
 * handler, clears timers, and resets the internal singleton. Idempotent — a
 * second register call while one is active is a no-op.
 *
 * Emits `FramePng` payloads at the live `getCaptureIntervalMs()` cadence plus
 * hook-driven captures; identical frames are skipped except the periodic
 * keyframe (see the module-level JSDoc for the full scheduling model).
 *
 * @param opts - Caller-supplied emit + tuning knobs
 * @returns Unregister function (idempotent on repeat call)
 */
export function registerCanvasExtractor(opts: CanvasExtractorOpts): UnregisterFn {
  if (_registered !== null) {
    return () => {
      /* prior registration owns teardown */
    };
  }

  // Fully synchronous from the caller's point of view: the native-encoder
  // path hands the frame to the single-flight encode queue WITHOUT returning
  // its promise, so the capture loop re-arms after acquire+process only and
  // the encode genuinely overlaps the next capture (the upng fallback path
  // stays synchronous so the Node test environment observes emits in the
  // same tick).
  const performExtract = (): void => {
    try {
      // Stream-source election gate — only the elected client captures.
      // Evaluated per capture so leadership can migrate live.
      if (opts.isEnabled?.() === false) {
        return;
      }
      if (typeof canvas === 'undefined' || canvas === null) {
        return;
      }
      const normalize: 'off' | 'auto' = opts.getNormalize?.() ?? 'off';
      const dither = opts.getDither?.() === true;
      const brightness = opts.getBrightness?.() ?? 0;
      const webpQuality = opts.getWebpQuality?.() ?? 0;
      const framing = opts.getFraming?.() ?? null;
      // skipEncode: hash-check FIRST, pay for the PNG encode only on frames
      // that will actually be emitted (live telemetry showed encode dominating
      // the cycle at 66-122 ms — and it ran even for skipped frames).
      const result = extractCurrentFrame(canvas as CanvasLike, {
        ...(opts.targetWidth !== undefined ? { targetWidth: opts.targetWidth } : {}),
        ...(opts.targetHeight !== undefined ? { targetHeight: opts.targetHeight } : {}),
        normalize,
        dither,
        brightness,
        framing,
        skipEncode: true,
      });
      if (result === null) {
        return;
      }
      const enriched = result as FramePng & {
        _lumaHash?: number;
        _stats?: FrameCaptureStats;
        _luma?: Uint8Array;
      };
      // Identical-frame skip with periodic keyframe: unchanged content is not
      // re-sent UNLESS more than KEYFRAME_INTERVAL_MS passed since the last
      // emit — late-joining WS subscribers must receive the current frame even
      // on a static scene (the bridge is push-only, no frame cache).
      const hash = enriched._lumaHash;
      const now = Date.now();
      // Skip identical frames UNLESS the keyframe interval elapsed OR the
      // WebP quality changed (a lossless↔lossy toggle does not alter luma, so
      // the hash alone would wrongly suppress it — see _lastEmittedWebpQuality).
      if (
        hash !== undefined &&
        hash === _lastEmittedHash &&
        webpQuality === _lastEmittedWebpQuality &&
        now - _lastEmitTs < KEYFRAME_INTERVAL_MS
      ) {
        return;
      }
      if (hash !== undefined) {
        _lastEmittedHash = hash;
      }
      _lastEmittedWebpQuality = webpQuality;
      _lastEmitTs = now;

      const luma = enriched._luma;
      if (luma === undefined) {
        return;
      }
      const job: EncodeJob = {
        luma,
        width: result.width,
        height: result.height,
        sceneId: result.sceneId,
        stats: enriched._stats,
        dither,
        webpQuality,
      };

      // Synchronous upng fallback (Node tests + exotic hosts) — the whole
      // call stack stays synchronous so tests observe emits in the same tick.
      if (!hasNativeEncoder()) {
        const t0 = Date.now();
        emitEncoded(job, encodePngUpng(luma, result.width, result.height), 'upng', t0);
        return;
      }

      // Native path: hand the frame to the single-flight encode queue and
      // return WITHOUT awaiting (fire-and-forget) — the capture loop only
      // pays acquire+process (~20 ms), so the cycle period stays at the
      // configured interval while the encode genuinely overlaps the next
      // capture (safe: `luma` is allocated fresh per frame, nothing is
      // shared between an in-flight encode and the next acquire).
      // Latest-wins: if an encode is already running, this frame replaces
      // any queued one (the glasses only ever want the newest frame; order
      // is guaranteed by the single flight).
      if (_encodeBusy) {
        _pendingEncode = job;
        return;
      }
      void runEncodeJob(job);
    } catch (err) {
      console.warn('[EVF canvas-extractor] extract failed:', (err as Error).message ?? err);
    }
  };

  /** Emit one encoded frame + (throttled) telemetry. */
  const emitEncoded = (
    job: EncodeJob,
    pngBytes: Uint8Array,
    encoder: 'upng' | 'native' | 'webp',
    tEncode0: number,
  ): void => {
    const payload: FramePng = {
      sceneId: job.sceneId,
      width: job.width,
      height: job.height,
      pngB64: bytesToB64(pngBytes),
      ts: Date.now(),
    };
    // Telemetry (≤1 every 5s): real encode timing + which encoder ran +
    // the dither flag as read on THIS (streaming) client.
    if (opts.emitStats !== undefined && job.stats !== undefined) {
      const tNow = Date.now();
      if (tNow - _lastStatsTs >= 5_000) {
        _lastStatsTs = tNow;
        opts.emitStats({
          ...job.stats,
          encodeMs: tNow - tEncode0,
          pngBytes: pngBytes.length,
          encoder,
          dither: job.dither,
        });
      }
    }
    opts.emit(payload);
  };

  /** Run one native encode; on completion drain the latest queued frame. */
  const runEncodeJob = (job: EncodeJob): Promise<void> => {
    _encodeBusy = true;
    const t0 = Date.now();
    return encodeFrameNative(job.luma, job.width, job.height, job.webpQuality)
      .then((res) => {
        if (res !== null) {
          emitEncoded(job, res.bytes, res.encoder, t0);
        } else {
          // One-time warn (issue #37): the upng fallback is ~50-120 ms/frame (~8 fps)
          // vs the native encoder's ~6-8 ms. Surface the silent perf cliff on hosts
          // without a working OffscreenCanvas so it is diagnosable from the console.
          if (!_upngFallbackWarned) {
            _upngFallbackWarned = true;
            console.warn(
              '[EVF canvas-extractor] native encoder unavailable — using slow upng fallback (~8 fps cap). frame_stats.encoder=upng.',
            );
          }
          emitEncoded(job, encodePngUpng(job.luma, job.width, job.height), 'upng', t0);
        }
      })
      .catch((err: unknown) => {
        console.warn('[EVF canvas-extractor] native encode failed:', err);
      })
      .then(() => {
        _encodeBusy = false;
        const next = _pendingEncode;
        if (next !== null) {
          _pendingEncode = null;
          void runEncodeJob(next);
        }
      });
  };

  // ── Leading+trailing throttle for hook fires ───────────────────────────────
  //
  // Replaces the old trailing-only debounce. Continuous canvasPan fires:
  //   1. First fire: run performExtract immediately (leading), arm THROTTLE_MS timer.
  //   2. Subsequent fires within the window: set _pendingTrailing = true.
  //   3. Timer fires: if _pendingTrailing → run performExtract (trailing) + re-arm.
  //
  // This emits ~5 fps during continuous panning vs. zero emits from the old debounce.
  const armThrottle = (): void => {
    _throttleTimer = setTimeout(() => {
      _throttleTimer = null;
      if (_pendingTrailing) {
        _pendingTrailing = false;
        performExtract();
        armThrottle();
      }
    }, THROTTLE_MS);
  };

  const onHookFire = (): void => {
    if (_throttleTimer === null) {
      // Leading edge — emit immediately and arm the timer.
      performExtract();
      armThrottle();
    } else {
      // Within throttle window — request a trailing emit.
      _pendingTrailing = true;
    }
  };

  // Register 5 Foundry hooks.
  Hooks.on('canvasReady', onHookFire);
  Hooks.on('drawCanvas', onHookFire);
  Hooks.on('refreshToken', onHookFire);
  Hooks.on('updateScene', onHookFire);
  Hooks.on('canvasPan', onHookFire);
  const handlers = [
    { event: 'canvasReady' as const, fn: onHookFire },
    { event: 'drawCanvas' as const, fn: onHookFire },
    { event: 'refreshToken' as const, fn: onHookFire },
    { event: 'updateScene' as const, fn: onHookFire },
    { event: 'canvasPan' as const, fn: onHookFire },
  ];

  // ── Continuous capture loop (self-rescheduling, no fps cap) ────────────────
  //
  // Each cycle reads the live interval (the `captureFps` world setting) BEFORE
  // arming the next wait, so a DM setting change applies from the next cycle.
  // Trailing re-arm (same fix as HudDeltaDriver, quick 260611-dg5): the next
  // wait is `interval − cycleCost`, so the period is max(interval, cost) and
  // NEVER interval + cost. cycleCost here is acquire+process ONLY — the
  // native encode is fire-and-forget behind the single-flight latest-wins
  // queue (see performExtract), so the loop period no longer absorbs the
  // encode time (pre-v0.1.27 it did: period = acquire+process+encode, which
  // capped the live chain at 1000/(25–55 ms) ≈ 18–30 fps on encode spikes).
  const scheduleNextCapture = (delayMs: number): void => {
    _captureLoopTimer = setTimeout(
      () => {
        const t0 = Date.now();
        performExtract();
        const interval = opts.getCaptureIntervalMs?.() ?? 250;
        scheduleNextCapture(Math.max(1, interval - (Date.now() - t0)));
      },
      Math.max(1, delayMs),
    );
  };
  scheduleNextCapture(opts.getCaptureIntervalMs?.() ?? 250);

  // Canonical teardown — idempotent. `Hooks.off`s all 5 listeners, clears the
  // throttle + capture-loop timers, and resets the singleton state. Both the
  // returned unregister fn AND _resetCanvasExtractor route through this so a
  // reset never leaves the listeners attached (no leak across re-registration).
  const teardown = (): void => {
    if (_registered === null) {
      return;
    }
    if (_throttleTimer !== null) {
      clearTimeout(_throttleTimer);
      _throttleTimer = null;
    }
    _pendingTrailing = false;
    if (_captureLoopTimer !== null) {
      clearTimeout(_captureLoopTimer);
      _captureLoopTimer = null;
    }
    // Guard the Hooks global: teardown can run after the Foundry environment is
    // gone (module reload, test global-unstub), where `Hooks` is undefined —
    // detaching from an absent registry is a no-op, not an error.
    const hooksOff = (globalThis as { Hooks?: { off(e: string, f: () => void): void } }).Hooks;
    if (hooksOff !== undefined) {
      for (const { event, fn } of handlers) {
        hooksOff.off(event, fn);
      }
    }
    _registered = null;
    _lastEmittedHash = null;
    _lastEmittedWebpQuality = null;
    _lastEmitTs = 0;
    _lastStatsTs = 0;
    _encodeBusy = false;
    _pendingEncode = null;
  };

  _registered = { handlers, teardown };

  return teardown;
}

/**
 * @internal Test-only reset to clear the singleton between vitest runs.
 *
 * Routes through the live registration's {@link RegistrationState.teardown} so
 * the 5 hook listeners are actually `Hooks.off`'d (not just nulled) — otherwise
 * they leak across register → reset → register and keep firing into a stale
 * closure (double streams / emit to a dead emitter). Safe no-op when nothing is
 * registered.
 */
export function _resetCanvasExtractor(): void {
  // Tear down the active registration (Hooks.off + timer clears) if present.
  _registered?.teardown();
  // Defensive belt-and-braces in case there was no active registration: clear
  // any orphaned timer/state directly (teardown already did this when present).
  _registered = null;
  _lastEmittedHash = null;
  _lastEmittedWebpQuality = null;
  _lastEmitTs = 0;
  _lastStatsTs = 0;
  _encodeBusy = false;
  _pendingEncode = null;
  _upngFallbackWarned = false;
  _throttleTimer = null;
  _pendingTrailing = false;
  if (_captureLoopTimer !== null) {
    clearTimeout(_captureLoopTimer);
    _captureLoopTimer = null;
  }
}
