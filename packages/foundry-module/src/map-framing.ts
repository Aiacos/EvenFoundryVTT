/**
 * Map auto-framing — pure geometry for the "party fit, focus-weighted" camera.
 *
 * The map streamed to the glasses must NOT track wherever the GM's browser
 * happens to be looking. Instead the stream-leader (GM) client synthesizes a
 * framing: a world-space rectangle that contains every player-character token
 * (so "tutti i personaggi" stay on-screen) while biasing its center toward the
 * actor the player selected on the glasses (so the chosen PC sits near the
 * middle). The rectangle is then rendered to an off-screen RenderTexture by the
 * canvas-extractor WITHOUT moving the GM's on-screen camera.
 *
 * This module is intentionally Foundry-free: it consumes a minimal
 * {@link FramingTokenLike} list (world-pixel rects + a few flags) so it is fully
 * unit-testable headless. module.ts adapts the live `canvas.tokens` placeables
 * into this shape.
 *
 * @see canvas-extractor.ts (`getFraming` consumer — renders the returned rect)
 * @see docs/architecture/0001-layered-ui-model.md §z=0 map
 */

/** Axis-aligned world-space rectangle (Foundry scene pixels), top-left origin. */
export interface WorldRect {
  /** Left edge (world px). */
  readonly x: number;
  /** Top edge (world px). */
  readonly y: number;
  /** Width (world px, > 0). */
  readonly width: number;
  /** Height (world px, > 0). */
  readonly height: number;
}

/**
 * Minimal token shape consumed by {@link computePartyFraming}.
 *
 * All coordinates are world (scene) pixels — `x`/`y` is the token's top-left,
 * `width`/`height` its rendered size. module.ts derives these from the live
 * `TokenDocument` (`x`, `y`, grid-units × `grid.size`).
 */
export interface FramingTokenLike {
  /** Token top-left X (world px). */
  readonly x: number;
  /** Token top-left Y (world px). */
  readonly y: number;
  /** Token width (world px). */
  readonly width: number;
  /** Token height (world px). */
  readonly height: number;
  /** Whether the token's actor has a player owner (the "party" predicate). */
  readonly isPlayerCharacter: boolean;
  /** Whether this token's actor is the one selected on the glasses (the focus). */
  readonly isFocus: boolean;
  /** Whether the token is hidden (GM-only) — hidden tokens never drive framing. */
  readonly hidden: boolean;
}

/** Tuning knobs for {@link computePartyFraming}. All optional with sane defaults. */
export interface FramingOptions {
  /**
   * Extra margin added around the party box, as a fraction of the box
   * half-extent on each axis (0.18 → +18% breathing room). Default 0.18.
   */
  readonly paddingFrac?: number;
  /**
   * How strongly the frame center is pulled from the party centroid toward the
   * focus token, 0..1. 0 = pure centroid (focus ignored); 1 = focus exactly
   * centered (but the box is still expanded to keep everyone in frame).
   * Default 0.5.
   */
  readonly focusWeight?: number;
  /**
   * Minimum frame half-height (world px) — floors the zoom so a single,
   * isolated token does not blow up to fill the screen. Default 200.
   */
  readonly minHalfHeight?: number;
  /**
   * Target aspect ratio (width / height) the frame is expanded to so it fills
   * the glasses raster region without large letterbox bars. Default 2
   * (576 / 288).
   */
  readonly aspect?: number;
  /** Scene width (world px) — when given, the frame is clamped inside it. */
  readonly sceneWidth?: number;
  /** Scene height (world px) — when given, the frame is clamped inside it. */
  readonly sceneHeight?: number;
}

const DEFAULT_PADDING_FRAC = 0.18;
const DEFAULT_FOCUS_WEIGHT = 0.5;
const DEFAULT_MIN_HALF_HEIGHT = 200;
const DEFAULT_ASPECT = 2;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/**
 * Compute the "party fit, focus-weighted" world rectangle for the map frame.
 *
 * Returns `null` when there is nothing to frame (no visible tokens) — the
 * caller then falls back to the live GM viewport. The returned rect is
 * guaranteed to:
 *  - contain the full bounding box of the framed pool (every party token, or
 *    every visible token when no PC tokens exist), even after the center is
 *    biased toward the focus token;
 *  - have the requested aspect ratio (expanded, never cropped);
 *  - respect the minimum zoom floor;
 *  - lie inside the scene bounds when `sceneWidth`/`sceneHeight` are supplied
 *    (unless it is larger than the scene, in which case it is centered).
 *
 * @param tokens - All candidate tokens (hidden ones are ignored internally).
 * @param opts   - Optional tuning (see {@link FramingOptions}).
 * @returns The framing rectangle, or `null` if nothing is framable.
 */
export function computePartyFraming(
  tokens: readonly FramingTokenLike[],
  opts: FramingOptions = {},
): WorldRect | null {
  const paddingFrac = Math.max(0, opts.paddingFrac ?? DEFAULT_PADDING_FRAC);
  const focusWeight = clamp(opts.focusWeight ?? DEFAULT_FOCUS_WEIGHT, 0, 1);
  const minHalfHeight = Math.max(1, opts.minHalfHeight ?? DEFAULT_MIN_HALF_HEIGHT);
  const aspect = Math.max(0.1, opts.aspect ?? DEFAULT_ASPECT);
  const minHalfWidth = minHalfHeight * aspect;

  // Drop hidden/degenerate tokens; prefer the player-character subset, falling
  // back to every visible token when the scene has no PC tokens (e.g. an
  // exploration scene) so the map is never blank.
  const visible = tokens.filter((t) => !t.hidden && t.width > 0 && t.height > 0);
  if (visible.length === 0) {
    return null;
  }
  const pcs = visible.filter((t) => t.isPlayerCharacter);
  const pool = pcs.length > 0 ? pcs : visible;

  // Party bounding box (world px).
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const t of pool) {
    minX = Math.min(minX, t.x);
    minY = Math.min(minY, t.y);
    maxX = Math.max(maxX, t.x + t.width);
    maxY = Math.max(maxY, t.y + t.height);
  }

  const centroidX = (minX + maxX) / 2;
  const centroidY = (minY + maxY) / 2;

  // Focus center: the selected-actor token if present (searched across ALL
  // visible tokens, not just the pool, so a focus that is somehow not flagged
  // as a PC still pulls the camera). Absent → centroid (no bias).
  const focus = visible.find((t) => t.isFocus);
  const focusX = focus !== undefined ? focus.x + focus.width / 2 : centroidX;
  const focusY = focus !== undefined ? focus.y + focus.height / 2 : centroidY;

  const centerX = centroidX + focusWeight * (focusX - centroidX);
  const centerY = centroidY + focusWeight * (focusY - centroidY);

  // Half-extents that still cover the whole bbox AFTER recentring: take the
  // larger gap to each side so no token is clipped by the focus bias.
  let halfW = Math.max(centerX - minX, maxX - centerX);
  let halfH = Math.max(centerY - minY, maxY - centerY);

  // Breathing room, then the zoom floor.
  halfW *= 1 + paddingFrac;
  halfH *= 1 + paddingFrac;
  halfW = Math.max(halfW, minHalfWidth);
  halfH = Math.max(halfH, minHalfHeight);

  // Expand (never crop) to the target aspect so the frame fills the raster.
  if (halfW / halfH < aspect) {
    halfW = halfH * aspect;
  } else {
    halfH = halfW / aspect;
  }

  let cx = centerX;
  let cy = centerY;

  // Clamp inside the scene when its dimensions are known. If the frame is wider
  // or taller than the scene on an axis, center on that axis instead.
  if (opts.sceneWidth !== undefined && opts.sceneWidth > 0) {
    cx =
      2 * halfW <= opts.sceneWidth
        ? clamp(cx, halfW, opts.sceneWidth - halfW)
        : opts.sceneWidth / 2;
  }
  if (opts.sceneHeight !== undefined && opts.sceneHeight > 0) {
    cy =
      2 * halfH <= opts.sceneHeight
        ? clamp(cy, halfH, opts.sceneHeight - halfH)
        : opts.sceneHeight / 2;
  }

  return { x: cx - halfW, y: cy - halfH, width: 2 * halfW, height: 2 * halfH };
}
