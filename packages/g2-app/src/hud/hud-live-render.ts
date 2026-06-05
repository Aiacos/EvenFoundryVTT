/**
 * HUD live-render orchestrator — pure subscription-glue for the raster HUD.
 *
 * Provides two exports:
 *
 * 1. `renderRasterHudFrame(snapshot, deps)` — orchestrates the render → assemble
 *    → push pipeline for a single `CharacterSnapshot`. The entire pipeline is
 *    wrapped in a try/catch that routes all errors to `deps.onError` and then
 *    resolves (never rejects). A pipeline failure leaves the last good frame
 *    on screen and does NOT stall the subscription (T-m4e-02 mitigation).
 *
 * 2. `makeSnapshotRenderHandler(deps, onParseFailure?)` — builds the WS
 *    subscription callback. Validates the raw WS payload via
 *    `CharacterSnapshotSchema.safeParse` (T-m4e-01 mitigation) before forwarding
 *    to `renderRasterHudFrame`. Parse failures call `onParseFailure` (or
 *    `console.warn`) and short-circuit — no untrusted data reaches the renderer.
 *    The handler is fire-and-forget (returns `void`); pipeline errors are
 *    swallowed inside `renderRasterHudFrame`.
 *
 * No canvas logic here — both functions depend on injected `RasterHudRenderDeps`
 * so `happy-dom` unit tests can exercise the orchestration with `vi.fn()` fakes
 * and never touch `OffscreenCanvas` / `document.createElement`.
 *
 * # Out of scope (TODO-hud-raster #2)
 *
 * TODO(ADR-0013): The ~5fps debounced `RasterController` delta loop with xxhash
 * sub-tile diffing (re-push only CHANGED tiles) is TODO-hud-raster #2 and is
 * intentionally NOT implemented here. This module naively re-pushes ALL 4 tiles
 * on every snapshot, which is correct for TODO-hud-raster #1.
 *
 * @see packages/g2-app/src/hud/boot-hud-raster-poc.ts (wiring site — Task 2)
 * @see packages/g2-app/src/hud/hud-canvas-renderer.ts (`renderHudFrame` — default render dep)
 * @see packages/g2-app/src/hud/hud-raster-frame.ts (`buildHudTiles` — default assemble dep)
 * @see packages/g2-app/src/hud/hud-poc-page.ts (`pushHudTiles` — default push dep)
 * @see docs/architecture/0013-hud-raster-rendering.md (ADR-0013 §Scope)
 */

import { type CharacterSnapshot, CharacterSnapshotSchema } from '@evf/shared-protocol';
import type { HudTile } from './hud-raster-frame.js';

// ── RasterHudRenderDeps ───────────────────────────────────────────────────────

/**
 * Injected dependencies for the render-once pipeline.
 *
 * All three pipeline stages are injected so unit tests can use `vi.fn()` fakes
 * without touching `OffscreenCanvas`, `document.createElement`, or the bridge.
 *
 * Production wiring (Task 2 / `boot-hud-raster-poc.ts`):
 * ```ts
 * {
 *   render:   (s) => renderHudFrame(s, { width: 576, height: 288 }),
 *   assemble: buildHudTiles,
 *   push:     (tiles) => pushHudTiles(bridge, tiles),
 *   onError:  (err) => console.warn('[EVF] hud-raster-poc: live re-render failed …', err),
 * }
 * ```
 */
export interface RasterHudRenderDeps {
  /**
   * Stage 1 — render the snapshot onto a canvas and return the RGBA pixel buffer.
   *
   * Called synchronously inside `renderRasterHudFrame`. Any synchronous throw is
   * caught, routed to `onError`, and short-circuits the pipeline (assemble + push
   * are skipped).
   *
   * @param snapshot The validated `CharacterSnapshot` to render.
   * @returns 576×288 RGBA `Uint8ClampedArray`.
   */
  render(snapshot: CharacterSnapshot): Uint8ClampedArray;

  /**
   * Stage 2 — slice + dither + encode the RGBA buffer into 4 PNG tiles.
   *
   * Called synchronously after `render`. Any synchronous throw is caught and
   * routed to `onError` (push is skipped).
   *
   * @param rgba RGBA pixel buffer from `render`.
   * @returns 4 `HudTile` objects ready for `pushHudTiles`.
   */
  assemble(rgba: Uint8ClampedArray): HudTile[];

  /**
   * Stage 3 — push the 4 tiles to the G2 framebuffer via `updateImageRawData`.
   *
   * Called async after `assemble`. Any rejection is caught and routed to
   * `onError`; the subscription survives to the next snapshot.
   *
   * @param tiles 4 tiles from `assemble`.
   * @returns Promise that resolves when all tiles are pushed.
   */
  push(tiles: HudTile[]): Promise<void>;

  /**
   * Error sink — called on any pipeline failure (render throw, assemble throw,
   * push rejection). The function MUST NOT throw; it is called inside the outer
   * try/catch and its own errors would be silently swallowed.
   *
   * @param err The caught error (may be any value, not only `Error` instances).
   */
  onError(err: unknown): void;
}

// ── renderRasterHudFrame ──────────────────────────────────────────────────────

/**
 * Execute one render → assemble → push cycle for a single snapshot.
 *
 * The entire pipeline body is wrapped in a single `try/catch → deps.onError`.
 * Any error (synchronous throw from `render`/`assemble` or async rejection from
 * `push`) is passed to `deps.onError` and the function then resolves normally.
 * The caller's subscription is never torn down; the last good frame stays on
 * screen (T-m4e-02 mitigation).
 *
 * Ordering guarantee: `render` is called once, its result is passed to
 * `assemble`, whose result is passed to `push`. No step is skipped on success.
 *
 * TODO(ADR-0013): xxhash sub-tile delta diffing (re-push only changed tiles)
 * is TODO-hud-raster #2 — intentionally out of scope here.
 *
 * @param snapshot Validated `CharacterSnapshot` to render.
 * @param deps     Injected pipeline stages + error sink.
 * @returns Promise that always resolves (never rejects).
 */
export async function renderRasterHudFrame(
  snapshot: CharacterSnapshot,
  deps: RasterHudRenderDeps,
): Promise<void> {
  try {
    // Stage 1: render snapshot → RGBA pixel buffer.
    const rgba = deps.render(snapshot);
    // Stage 2: slice + dither + encode → 4 PNG tiles.
    const tiles = deps.assemble(rgba);
    // Stage 3: push tiles to the G2 framebuffer.
    await deps.push(tiles);
  } catch (err) {
    deps.onError(err);
  }
}

// ── makeSnapshotRenderHandler ─────────────────────────────────────────────────

/**
 * Build the WS `character.delta` subscription callback.
 *
 * Returns a `(raw: unknown) => void` that:
 * 1. Validates `raw` via `CharacterSnapshotSchema.safeParse` (T-m4e-01 mitigation).
 *    On parse failure: calls `onParseFailure` (or `console.warn` as default) and
 *    returns — no untrusted data reaches the canvas renderer.
 * 2. On parse success: fires `renderRasterHudFrame(parsed.data, deps)` as
 *    fire-and-forget. Pipeline errors are swallowed inside `renderRasterHudFrame`
 *    (they call `deps.onError`); no unhandled rejection surfaces to the caller.
 *
 * This mirrors `StatusHudLayer._onDelta`'s `safeParse` gate (Phase 4a T-4a-04-01
 * mitigation). Pass this handler directly to `createWsEventBus(...).subscribe(
 * 'character.delta', handler)` in `boot-hud-raster-poc.ts`.
 *
 * @param deps            Injected pipeline stages + error sink.
 * @param onParseFailure  Optional override for parse-failure reporting.
 *   Defaults to `console.warn('[EVF] hud-live-render: …')` when omitted.
 * @returns WS subscription callback (fire-and-forget, never throws).
 */
export function makeSnapshotRenderHandler(
  deps: RasterHudRenderDeps,
  onParseFailure?: (issues: unknown) => void,
): (raw: unknown) => void {
  const handleParseFailure =
    onParseFailure ??
    ((issues: unknown): void => {
      console.warn(
        '[EVF] hud-live-render: malformed character.delta payload — ignoring (T-m4e-01).',
        issues,
      );
    });

  return (raw: unknown): void => {
    const parsed = CharacterSnapshotSchema.safeParse(raw);
    if (!parsed.success) {
      handleParseFailure(parsed.error.issues);
      return;
    }
    // Fire-and-forget: pipeline errors are caught inside renderRasterHudFrame.
    void renderRasterHudFrame(parsed.data, deps);
  };
}
