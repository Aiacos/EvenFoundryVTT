/**
 * Foundry PIXI canvas → FramePng extractor (v0.1.15).
 *
 * Quick Task 260611-e71 replaces the `frame_pixels` emit pipeline with the
 * lighter `frame_png` wire format: greyscale lossless PNG ~1-5 KB vs ~884 KB
 * RGBA. Changes introduced in this file:
 *
 *   1. **PNG encode pipeline** — `extractCurrentFrame` now produces a
 *      `FramePng` payload instead of `FramePixels`. The Rec.601 luma of the
 *      RGBA frame is computed, a FNV-1a hash is taken for identical-frame
 *      skipping, and the result is encoded via:
 *        `UPNG.encode([rgbaLuma.buffer], w, h, 0, undefined, true)`
 *      (forbidPlte=true → ctype=2 RGB, exact roundtrip; do NOT use
 *      encodeLL — it does not exist in upng-js 2.1.0).
 *
 *   2. **Identical-frame skip** — a module-level `_lastEmittedHash` compares
 *      the FNV-1a 32-bit hash of the luma array between consecutive captures.
 *      If unchanged, `performExtract` returns without calling `opts.emit`.
 *
 *   3. **Leading+trailing throttle on hook fires** — replaces the trailing-
 *      only debounce. Continuous `canvasPan` fires immediately emit on the
 *      leading edge AND re-arm a 200 ms timer for a trailing emit, so the
 *      glasses see ~5 fps during panning instead of zero. Modelled on
 *      `HudDeltaDriver._schedule` (quick 260611-dg5).
 *
 *   4. **Live capture cadence (`captureFps` world setting)** — replaces the
 *      fixed 1000 ms `setInterval` with a self-rescheduling setTimeout loop
 *      that reads `opts.getCaptureIntervalMs?.() ?? 250` before every wait,
 *      so the DM can change the capture rate (1–60 fps) without reloading
 *      the module and with no scheduler-imposed fps cap.
 *
 * The PIXI canvas extraction, scaling, letterboxing, and contrast normalization
 * logic is unchanged from v0.1.14. The extractor still respects `targetWidth`,
 * `targetHeight`, and `getNormalize` options.
 *
 * **Render-to-texture (RT) primary capture path** (quick-task 260610-lx5, 2026-06-10)
 *
 * See the v0.1.14 module-level JSDoc for the full RT vs no-arg fallback
 * rationale. Short version: `PIXI.RenderTexture` path is used when available
 * (production Foundry), no-arg fallback for test fixtures / exotic hosts.
 *
 * **Debounce + idle scheduling** (T-4a-06-01 mitigation)
 *
 * The leading+trailing throttle replaces the old trailing-only debounce on
 * Foundry hook fires. A separate self-rescheduling timeout loop fires
 * `performExtract` every `getCaptureIntervalMs()` ms (the `captureFps` world
 * setting, read live before each wait), so idle scenes still refresh at the
 * configured rate (default 4 fps) and there is NO artificial scheduler cap —
 * the effective ceiling is GPU readback + upstream bandwidth.
 *
 * @see .planning/quick/260611-e71-modulo-v0-1-15-frame-png-captureinterval/260611-e71-PLAN.md
 * @see packages/shared-protocol/src/payloads/frame-png.ts (FRAME-PNG-01 wire schema, FRAME_PNG_TYPE)
 * @see docs/architecture/0001-layered-ui-model.md §Confirmation (z=0 map consumer)
 * @see docs/architecture/0006-raster-pipeline-library-stack.md (raster pipeline + ADR-0005 SC #5)
 */
import type { FramePng } from '@evf/shared-protocol';
import * as UPNG from 'upng-js';

/**
 * Leading+trailing throttle window for hook-driven captures.
 *
 * On hook fire: if no throttle timer is running, run performExtract immediately
 * (leading edge) AND arm a `THROTTLE_MS` timer. If the timer is already
 * running, set `_pendingTrailing = true`. When the timer fires: if
 * `_pendingTrailing` is set, run performExtract and re-arm the timer (trailing).
 *
 * This emits ~5 fps during continuous canvasPan instead of zero emits
 * (the old trailing-only debounce never drained during constant firing).
 * Modelled on `HudDeltaDriver._schedule` (quick 260611-dg5, packages/g2-app).
 */
const THROTTLE_MS = 200;

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
   * passes the FNV-1a hash check (changed-content gate). The module emits
   * ONLY `FramePng` payloads (v0.1.15+); the bridge wraps the payload in
   * `EnvelopeSchema` server-side with `type: 'frame_png'`.
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

  // ── Legacy / test-compat knobs ─────────────────────────────────────────────
  /**
   * @deprecated Kept for test backward-compat only. The production path uses
   * `getCaptureIntervalMs` instead. When `intervalMs` is provided AND
   * `getCaptureIntervalMs` is absent, the fixed value is used. Ignored when
   * `getCaptureIntervalMs` is supplied.
   */
  readonly intervalMs?: number;
  /**
   * @deprecated Kept for test backward-compat only. The leading+trailing throttle
   * uses the module constant `THROTTLE_MS = 200`. This option is ignored.
   */
  readonly debounceMs?: number;
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

/**
 * Acquire raw RGBA source bytes from the renderer using either the RT primary
 * path or the no-arg fallback. Unchanged from v0.1.14 (RT rationale in JSDoc).
 */
function acquireSourceBytes(
  RT: { create(o: { width: number; height: number }): unknown } | undefined,
  renderer: NonNullable<NonNullable<CanvasLike['app']>['renderer']>,
  canvas: CanvasLike,
  vw: number,
  vh: number,
): AcquiredBytes | null {
  const useRTPath =
    RT !== undefined &&
    typeof renderer.render === 'function' &&
    canvas.stage !== undefined &&
    canvas.stage !== null;

  if (useRTPath) {
    let rt: unknown;
    try {
      rt = RT.create({ width: vw, height: vh });
      let srcBytes: Uint8Array | Uint8ClampedArray;
      try {
        renderer.render?.(canvas.stage, { renderTexture: rt, clear: true });
        srcBytes = renderer.extract.pixels(rt);
      } finally {
        (rt as { destroy(b: boolean): void }).destroy(true);
      }
      return { srcBytes, srcWidth: vw, srcHeight: vh };
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
      PIXI?: { RenderTexture?: { create(o: { width: number; height: number }): unknown } };
    }
  ).PIXI?.RenderTexture;

  const acquired = acquireSourceBytes(RT, renderer, canvas, vw, vh);
  if (acquired === null) {
    return null;
  }
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

  // ── v0.1.15: Rec.601 luma → FNV-1a hash + PNG encode ─────────────────────
  //
  // (1) Compute per-pixel Rec.601 luma into a Uint8Array (1 byte/px).
  //     luma = round(0.299*R + 0.587*G + 0.114*B)
  // (2) Build an R=G=B=luma RGBA buffer for UPNG (greyscale content).
  // (3) Encode via the VERIFIED recipe:
  //     UPNG.encode([rgbaLuma.buffer], w, h, 0, undefined, true)
  //     (forbidPlte=true → ctype=2 RGB, exact roundtrip, no Node crash)
  // (4) Base64-encode the PNG ArrayBuffer.
  const nPixels = targetWidth * targetHeight;
  const luma = new Uint8Array(nPixels);
  for (let i = 0; i < nPixels; i++) {
    const oi = i * 4;
    const r = out[oi] ?? 0;
    const g = out[oi + 1] ?? 0;
    const b = out[oi + 2] ?? 0;
    luma[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  }

  // Build R=G=B=luma RGBA for UPNG (greyscale content, exact reconstructable luma).
  const rgbaForPng = new Uint8Array(nPixels * 4);
  for (let i = 0; i < nPixels; i++) {
    const v = luma[i] ?? 0;
    const pi = i * 4;
    rgbaForPng[pi] = v;
    rgbaForPng[pi + 1] = v;
    rgbaForPng[pi + 2] = v;
    rgbaForPng[pi + 3] = 255;
  }

  // PNG encode via the VERIFIED recipe (forbidPlte=true → ctype=2 RGB, exact roundtrip).
  // Do NOT use UPNG.encodeLL — it does not exist in upng-js 2.1.0.
  const pngBuf = UPNG.encode([rgbaForPng.buffer], targetWidth, targetHeight, 0, undefined, true);
  const pngBytes = new Uint8Array(pngBuf);

  // Base64: dual-environment (Node Buffer / browser btoa+chunk).
  let pngB64: string;
  const BufferCtor = (
    globalThis as { Buffer?: { from(b: ArrayBuffer): { toString(e: string): string } } }
  ).Buffer;
  if (BufferCtor !== undefined) {
    pngB64 = BufferCtor.from(pngBuf).toString('base64');
  } else {
    const btoaFn = (globalThis as { btoa?: (s: string) => string }).btoa;
    if (btoaFn === undefined) {
      throw new Error('[EVF canvas-extractor] no Buffer or btoa available');
    }
    const CHUNK = 0x8000;
    let binary = '';
    for (let i = 0; i < pngBytes.length; i += CHUNK) {
      const slice = pngBytes.subarray(i, Math.min(i + CHUNK, pngBytes.length));
      binary += String.fromCharCode.apply(null, slice as unknown as number[]);
    }
    pngB64 = btoaFn(binary);
  }

  return {
    sceneId: canvas.scene?.id ?? '',
    width: targetWidth,
    height: targetHeight,
    pngB64,
    ts: Date.now(),
    // Expose the luma hash so the caller can do identical-frame skip.
    // We attach it as a non-schema field — the caller reads it before emit.
    _lumaHash: fnv1a32(luma),
  } as FramePng & { _lumaHash: number };
}

/** Internal module state — single registration is enforced (CE-7 idempotency). */
interface RegistrationState {
  readonly handlers: ReadonlyArray<{ readonly event: string; readonly fn: () => void }>;
}

let _registered: RegistrationState | null = null;

/** FNV-1a hash of the last emitted luma array (for identical-frame skip). */
let _lastEmittedHash: number | null = null;

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
 * **v0.1.15 behavior changes vs v0.1.14:**
 * - Emits `FramePng` instead of `FramePixels`.
 * - Identical-frame skip via FNV-1a luma hash (no POST when content unchanged).
 * - Hook fires use leading+trailing throttle (continuous pan emits ~5fps).
 * - Self-rescheduling loop at the live `getCaptureIntervalMs()` cadence (the
 *   `captureFps` world setting) — no scheduler-imposed fps cap.
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

  const performExtract = (): void => {
    try {
      if (typeof canvas === 'undefined' || canvas === null) {
        return;
      }
      const normalize: 'off' | 'auto' = opts.getNormalize?.() ?? 'off';
      const result = extractCurrentFrame(canvas as CanvasLike, {
        ...(opts.targetWidth !== undefined ? { targetWidth: opts.targetWidth } : {}),
        ...(opts.targetHeight !== undefined ? { targetHeight: opts.targetHeight } : {}),
        normalize,
      });
      if (result === null) {
        return;
      }
      // Identical-frame skip: compare FNV-1a luma hash.
      const withHash = result as FramePng & { _lumaHash?: number };
      const hash = withHash._lumaHash;
      if (hash !== undefined && hash === _lastEmittedHash) {
        return; // unchanged content — skip POST
      }
      if (hash !== undefined) {
        _lastEmittedHash = hash;
      }
      // Emit without the internal _lumaHash field (not part of FramePng schema).
      const payload: FramePng = {
        sceneId: result.sceneId,
        width: result.width,
        height: result.height,
        pngB64: result.pngB64,
        ts: result.ts,
      };
      opts.emit(payload);
    } catch (err) {
      console.warn('[EVF canvas-extractor] extract failed:', (err as Error).message ?? err);
    }
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
  // Each cycle reads the live captureIntervalMs (from opts.getCaptureIntervalMs —
  // the `captureFps` world setting — or legacy opts.intervalMs) BEFORE arming the
  // next wait, so a DM setting change applies from the next cycle. setTimeout
  // chaining (not setInterval) means the cadence is exactly the configured
  // interval with no scheduler-imposed ceiling: 60 fps → a 17 ms wait.
  const scheduleNextCapture = (): void => {
    const interval =
      opts.getCaptureIntervalMs?.() ?? (opts.intervalMs !== undefined ? opts.intervalMs : 250);
    _captureLoopTimer = setTimeout(
      () => {
        performExtract();
        scheduleNextCapture();
      },
      Math.max(1, interval),
    );
  };
  scheduleNextCapture();

  _registered = { handlers };

  return () => {
    if (_throttleTimer !== null) {
      clearTimeout(_throttleTimer);
      _throttleTimer = null;
    }
    _pendingTrailing = false;
    if (_captureLoopTimer !== null) {
      clearTimeout(_captureLoopTimer);
      _captureLoopTimer = null;
    }
    for (const { event, fn } of handlers) {
      (Hooks as unknown as { off(e: string, f: () => void): void }).off(event, fn);
    }
    _registered = null;
    _lastEmittedHash = null;
  };
}

/** @internal Test-only reset to clear the singleton between vitest runs. */
export function _resetCanvasExtractor(): void {
  _registered = null;
  _lastEmittedHash = null;
  _throttleTimer = null;
  _pendingTrailing = false;
  if (_captureLoopTimer !== null) {
    clearTimeout(_captureLoopTimer);
    _captureLoopTimer = null;
  }
}
