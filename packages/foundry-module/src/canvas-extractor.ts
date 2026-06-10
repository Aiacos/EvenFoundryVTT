/**
 * Foundry PIXI canvas → FramePixels extractor.
 *
 * Plan 4a-06 Task 2 — closes the B-5 gap by supplying the pixel data that the
 * Plan 03 raster pipeline consumes. Registers four Foundry hooks
 * (`canvasReady`, `drawCanvas`, `refreshToken`, `updateScene`) and on any fire
 * schedules a debounced (default 200 ms) call to {@link extractCurrentFrame},
 * which pulls pixels from `canvas.app.renderer.extract.pixels(canvas.stage)`,
 * fit-downscales them (whole scene, aspect preserved, box-average) onto EXACTLY
 * the canonical 400×200 raster region (ADR-0013 Amendment 1, letterboxed) and
 * dispatches the typed payload via the
 * caller-provided `emit` callback. The caller (`module.ts` ready hook) wraps
 * the payload in the existing Phase 3 `EnvelopeSchema` over the bridge WS —
 * Plan 06 does NOT introduce a new envelope schema (NF-1 closure).
 *
 * **Scaling strategy (CE-6)**
 *
 * Plan 06 documents three options (downscale + smoothing, center-crop,
 * downscale + letterbox). This implementation is **Option C — fit-downscale +
 * letterbox**, with a pure-JS box-average filter (no canvas API). Rationale:
 *   - **Whole-scene capture** — the original Option B center-crop kept only a
 *     400×200 window (~4% of a 1920×1080 render); the player saw a corner of
 *     the map instead of the map. Fit-downscale preserves the ENTIRE scene
 *     (debug map-frame-pipeline-dims, 2026-06-10).
 *   - **No DOM/OffscreenCanvas dependency** — the box filter is a plain typed
 *     array loop; it runs inside the Foundry desktop runtime (which lacks
 *     `OffscreenCanvas` in older Electron builds) AND inside happy-dom tests.
 *   - **Dither-friendly** — box averaging anti-aliases; nearest-neighbour
 *     sampling would alias grid lines and walls into noise after the worker's
 *     4-bit dither. Undersized sources are centered 1:1 (never upscaled).
 *   - **Predictable timing** — ~2M byte reads on 1920×1080, fixed budget,
 *     inside the 200 ms debounce window.
 *
 * **Debounce + idle scheduling (T-4a-06-01 mitigation)**
 *
 * Hook fires schedule a single `setTimeout(_extractAndEmit, debounceMs)`;
 * subsequent fires within the window cancel + reschedule. The actual
 * extraction is wrapped in a try/catch — failures log + skip. We prefer
 * `requestIdleCallback` when the runtime exposes it (browser) and fall back
 * to `setTimeout(0)` (Foundry desktop / happy-dom). The Foundry UI thread is
 * never blocked by a synchronous extract inside a hook callback. Real-device
 * perf is hardware-pending under ADR-0005 SC #5 (Specs §11.5.7 pitfall 11).
 *
 * **Bridge wiring**
 *
 * `module.ts` registers the extractor on `Hooks.once('ready')` and supplies a
 * `frame_pixels`-typed `emit` callback. The callback dispatches via the
 * existing `bridgeDeltaEmitter` (POST to bridge `/internal/delta` with bearer
 * auth), which wraps the payload in `EnvelopeSchema` server-side (proto / seq
 * / ts / type / session_id / payload — `session_id` from the pair registry).
 * Plan 06 reuses the existing channel; no new auth surface (T-4a-06-04).
 *
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04A-06-PLAN.md Task 2
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04a-CONTEXT.md §Area 2 (debounce)
 * @see docs/architecture/0001-layered-ui-model.md §Confirmation (z=0 map consumer)
 * @see docs/architecture/0006-raster-pipeline-library-stack.md (raster pipeline + ADR-0005 SC #5)
 * @see packages/shared-protocol/src/payloads/frame.ts (FramePixelsSchema producer-side reference)
 */
import { encodeFramePixels, type FramePixels } from '@evf/shared-protocol';

/** Default debounce window — matches Plan 03 RasterController + CONTEXT.md §Area 2. */
const DEFAULT_DEBOUNCE_MS = 200;
/**
 * Canonical raster-region width (ADR-0013 Amendment 1 — 4 image tiles of
 * 200×100 in a 2×2 layout). `raster-worker.ts` rejects any other frame width,
 * so the extractor ALWAYS emits exactly this (fit-downscale larger sources,
 * center 1:1 smaller ones, letterbox both). Supersedes the original 288
 * SDK-polyfill bound (OQ-INV2-4, superseded by INV-2 re-verification 2026-06-05).
 */
const MAX_WIDTH = 400;
/** Canonical raster-region height — see {@link MAX_WIDTH}. */
const MAX_HEIGHT = 200;
/** FramePixelsSchema lower bound (we clamp here too). */
const MIN_DIM = 20;

/** Function used to unregister the 4 hook listeners installed at register time. */
export type UnregisterFn = () => void;

/** Options passed to {@link registerCanvasExtractor}. */
export interface CanvasExtractorOpts {
  /**
   * Callback fired with the typed `FramePixels` payload after each debounced
   * extraction. The producer side (this module) emits ONLY the typed payload;
   * the bridge wraps it in `EnvelopeSchema` server-side with `type:
   * 'frame_pixels'` and the appropriate `session_id`.
   */
  readonly emit: (payload: FramePixels) => void;
  /** Debounce window in milliseconds; default {@link DEFAULT_DEBOUNCE_MS}. */
  readonly debounceMs?: number;
  /** Wire-format target width (defaults to {@link MAX_WIDTH}). */
  readonly targetWidth?: number;
  /** Wire-format target height (defaults to {@link MAX_HEIGHT}). */
  readonly targetHeight?: number;
}

/**
 * Subset of the Foundry global `canvas` that {@link extractCurrentFrame}
 * reads from. The narrow shape lets tests build cheap fixtures without
 * importing fvtt-types (which is out-of-scope until Phase 2+ stabilises it).
 */
export interface CanvasLike {
  readonly scene?: { readonly id?: string } | null;
  readonly app?: {
    readonly renderer?: {
      readonly width: number;
      readonly height: number;
      readonly extract: {
        pixels(target?: unknown): Uint8Array | Uint8ClampedArray;
      };
    };
  };
  readonly stage?: unknown;
}

/**
 * Pure extractor — given a Foundry canvas-like object, produce a
 * `FramePixels` payload ready to send across the bridge WS. Returns `null`
 * when the canvas is not yet ready (renderer absent).
 *
 * Scaling strategy: **fit-downscale (box-average) + letterbox** to exactly
 * `targetWidth × targetHeight` — the whole scene is captured, aspect preserved.
 * Trade-offs are documented in the module-level JSDoc.
 *
 * @param canvas - Foundry canvas (or test fixture matching `CanvasLike`)
 * @param opts   - Optional target dimensions (defaults to the canonical 400×200)
 * @returns Typed FramePixels payload or `null` if the canvas is not ready
 */
export function extractCurrentFrame(
  canvas: CanvasLike,
  opts: { readonly targetWidth?: number; readonly targetHeight?: number } = {},
): FramePixels | null {
  const renderer = canvas.app?.renderer;
  if (renderer === undefined) {
    return null;
  }
  const srcWidth = renderer.width;
  const srcHeight = renderer.height;
  if (srcWidth <= 0 || srcHeight <= 0) {
    return null;
  }
  const targetWidth = Math.max(MIN_DIM, Math.min(opts.targetWidth ?? MAX_WIDTH, MAX_WIDTH));
  const targetHeight = Math.max(MIN_DIM, Math.min(opts.targetHeight ?? MAX_HEIGHT, MAX_HEIGHT));

  // Source RGBA bytes (PIXI v7 extract.pixels returns Uint8Array, top-left origin).
  let srcBytes: Uint8Array | Uint8ClampedArray;
  try {
    srcBytes = renderer.extract.pixels(canvas.stage);
  } catch (err) {
    // Real-device perf failure or context-lost — log + skip frame; no retry storm.
    console.warn(
      '[EVF canvas-extractor] extract.pixels threw, skipping frame:',
      (err as Error).message ?? err,
    );
    return null;
  }

  // Fit-downscale: scale the WHOLE source to fit inside the target, preserving
  // aspect ratio. `Math.min(..., 1)` never upscales — undersized sources are
  // centered 1:1 (upscaling adds no detail and blurs the dither input).
  // This replaced the original center-crop, which on a typical 1920×1080
  // Foundry render captured only a 400×200 window (~4% of the scene area)
  // instead of the full map (debug map-frame-pipeline-dims, 2026-06-10).
  const scale = Math.min(targetWidth / srcWidth, targetHeight / srcHeight, 1);
  const outWidth = Math.max(1, Math.round(srcWidth * scale));
  const outHeight = Math.max(1, Math.round(srcHeight * scale));

  // Emit EXACTLY targetWidth×targetHeight: the scaled source is center-aligned
  // onto an opaque-black letterbox canvas of the target size. `raster-worker.ts`
  // rejects any frame that is not the canonical 400×200.
  const out = new Uint8ClampedArray(targetWidth * targetHeight * 4); // zero-filled; alpha forced below
  const padX = Math.floor((targetWidth - outWidth) / 2);
  const padY = Math.floor((targetHeight - outHeight) / 2);

  // Box-average downscale — pure JS, no OffscreenCanvas (Foundry's Electron
  // runtime is not guaranteed to expose it; see module JSDoc rationale). Each
  // destination pixel averages its source box: anti-aliased detail survives the
  // 4-bit dither far better than nearest-neighbour point sampling. Cost on a
  // 1920×1080 source ≈ 2M byte reads inside a 200 ms debounce window — negligible.
  const invScale = 1 / scale;
  for (let dy = 0; dy < outHeight; dy++) {
    const sy0 = Math.floor(dy * invScale);
    const sy1 = Math.min(srcHeight, Math.max(sy0 + 1, Math.floor((dy + 1) * invScale)));
    for (let dx = 0; dx < outWidth; dx++) {
      const sx0 = Math.floor(dx * invScale);
      const sx1 = Math.min(srcWidth, Math.max(sx0 + 1, Math.floor((dx + 1) * invScale)));
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let sy = sy0; sy < sy1; sy++) {
        let si = (sy * srcWidth + sx0) * 4;
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
  // Opaque alpha everywhere — content pixels AND letterbox bands. The G2
  // pipeline has no transparency; un-set alpha would dither unpredictably.
  for (let i = 3; i < out.length; i += 4) {
    out[i] = 255;
  }

  return {
    sceneId: canvas.scene?.id ?? '',
    width: targetWidth,
    height: targetHeight,
    pixelsB64: encodeFramePixels(out),
    ts: Date.now(),
  };
}

/** Internal module state — single registration is enforced (CE-7 idempotency). */
interface RegistrationState {
  readonly handlers: ReadonlyArray<{ readonly event: string; readonly fn: () => void }>;
}

let _registered: RegistrationState | null = null;

/**
 * Register the four Foundry hooks that drive canvas extraction.
 *
 * Returns an unregister function that calls `Hooks.off` for each registered
 * handler and resets the internal singleton so a subsequent register call
 * works. A second register call while one is already active is a no-op —
 * the existing registration's unregister is returned unchanged. Idempotency
 * matters because `module.ts` may run the registration code more than once
 * in test scenarios that drive `vi.resetModules()` between assertions.
 *
 * @param opts - Caller-supplied emit + tuning knobs
 * @returns Unregister function (idempotent on repeat call)
 */
export function registerCanvasExtractor(opts: CanvasExtractorOpts): UnregisterFn {
  if (_registered !== null) {
    // Idempotent: hand back a no-op unregister that the caller can safely invoke.
    return () => {
      /* prior registration owns teardown */
    };
  }

  const debounceMs = opts.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const performExtract = (): void => {
    try {
      if (typeof canvas === 'undefined' || canvas === null) {
        return;
      }
      const frame = extractCurrentFrame(canvas as CanvasLike, {
        ...(opts.targetWidth !== undefined ? { targetWidth: opts.targetWidth } : {}),
        ...(opts.targetHeight !== undefined ? { targetHeight: opts.targetHeight } : {}),
      });
      if (frame !== null) {
        opts.emit(frame);
      }
    } catch (err) {
      // Hook callbacks must NOT throw — Foundry treats a thrown hook as a
      // module bug and may unload us. Log + drop is the right behaviour.
      console.warn(
        '[EVF canvas-extractor] debounced extract failed:',
        (err as Error).message ?? err,
      );
    }
  };

  // The debounce timer itself is the non-blocking scheduler — by the time it
  // fires the original hook handler's call stack has already returned. T-4a-06-01
  // mitigation is satisfied by the debounce window (200 ms); we do NOT need a
  // secondary `requestIdleCallback`/`setTimeout(0)` indirection (an earlier
  // iteration tried that and broke happy-dom fake-timer determinism in tests).
  // If real-device Foundry desktop perf measurement (ADR-0005 SC #5) shows the
  // synchronous extract inside the 200 ms window still stutters the UI thread,
  // we can add an idle-scheduled stage in a focused follow-up.
  const onHookFire = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = null;
      performExtract();
    }, debounceMs);
  };

  // Explicit registration calls — each event listed verbatim so static greps
  // can verify the four-hook contract (plan verify gate + B-5 closure check).
  Hooks.on('canvasReady', onHookFire);
  Hooks.on('drawCanvas', onHookFire);
  Hooks.on('refreshToken', onHookFire);
  Hooks.on('updateScene', onHookFire);
  const handlers = [
    { event: 'canvasReady' as const, fn: onHookFire },
    { event: 'drawCanvas' as const, fn: onHookFire },
    { event: 'refreshToken' as const, fn: onHookFire },
    { event: 'updateScene' as const, fn: onHookFire },
  ];

  _registered = { handlers };

  return () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    for (const { event, fn } of handlers) {
      // The real Foundry Hooks.off signature is `(hookId)` but our type
      // declaration in foundry-globals.d.ts takes the (event, fn) shape that
      // happy-dom mocks honour. Both signatures are supported by Foundry at
      // runtime (the source uses `Hooks.off(event, fn)` overloads).
      (Hooks as unknown as { off(e: string, f: () => void): void }).off(event, fn);
    }
    _registered = null;
  };
}

/** @internal Test-only reset to clear the singleton between vitest runs. */
export function _resetCanvasExtractor(): void {
  _registered = null;
}
