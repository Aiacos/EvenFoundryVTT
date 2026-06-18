/**
 * Pure geometry for the composited FPS badge (z=1 status layer).
 *
 * Feature 001 (D4): the FPS readout is split into a small composited badge whose
 * corner is chosen by `EVF_FPS_CORNER` (g2-app build-time `VITE_EVF_FPS_CORNER`).
 * This module holds the side-effect-free corner→rect math so it can be unit-tested
 * across all four corners (Constitution II) independently of the canvas layer.
 *
 * @see specs/001-foundry-g2-hud/contracts/fps-corner-env.md
 */

/** Compositor canvas width (G2 display, pixels). */
export const HUD_WIDTH = 576 as const;

/** Compositor canvas height (G2 display, pixels). */
export const HUD_HEIGHT = 288 as const;

/** Fixed margin between the badge and the display edge (pixels). */
export const FPS_BADGE_MARGIN = 4 as const;

/** The four valid badge corners. */
export const FPS_CORNERS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const;

/** A badge corner. */
export type FpsCorner = (typeof FPS_CORNERS)[number];

/** Default corner when the env var is absent or invalid. */
export const DEFAULT_FPS_CORNER: FpsCorner = 'bottom-right';

/** Badge size in pixels. */
export interface BadgeSize {
  /** Width in pixels. */
  readonly w: number;
  /** Height in pixels. */
  readonly h: number;
}

/** On-screen badge rectangle. */
export interface BadgeRect {
  /** X of the top-left corner (pixels). */
  readonly x: number;
  /** Y of the top-left corner (pixels). */
  readonly y: number;
  /** Width in pixels. */
  readonly w: number;
  /** Height in pixels. */
  readonly h: number;
}

/**
 * Normalize an arbitrary string (env var) to a valid {@link FpsCorner}.
 *
 * Invalid / absent input resolves to {@link DEFAULT_FPS_CORNER} (never throws).
 *
 * @param value The raw env value (e.g. `import.meta.env.VITE_EVF_FPS_CORNER`).
 * @returns A valid corner.
 */
export function normalizeFpsCorner(value: string | null | undefined): FpsCorner {
  if (value != null && (FPS_CORNERS as readonly string[]).includes(value)) {
    return value as FpsCorner;
  }
  return DEFAULT_FPS_CORNER;
}

/**
 * Compute the on-screen rectangle for the FPS badge at the given corner.
 *
 * The rect is the badge `size` inset from the chosen corner by {@link FPS_BADGE_MARGIN};
 * it is guaranteed fully on-screen for any size that fits within the display minus
 * margins (the size is clamped so the badge never spills off-screen).
 *
 * @param corner The badge corner (or any string — normalized via {@link normalizeFpsCorner}).
 * @param size   The badge width/height.
 * @returns The badge rectangle.
 */
export function fpsBadgeRect(
  corner: FpsCorner | string | null | undefined,
  size: BadgeSize,
): BadgeRect {
  const c = normalizeFpsCorner(typeof corner === 'string' ? corner : undefined);
  const maxW = HUD_WIDTH - FPS_BADGE_MARGIN * 2;
  const maxH = HUD_HEIGHT - FPS_BADGE_MARGIN * 2;
  const w = Math.max(0, Math.min(size.w, maxW));
  const h = Math.max(0, Math.min(size.h, maxH));

  const left = FPS_BADGE_MARGIN;
  const right = HUD_WIDTH - FPS_BADGE_MARGIN - w;
  const top = FPS_BADGE_MARGIN;
  const bottom = HUD_HEIGHT - FPS_BADGE_MARGIN - h;

  switch (c) {
    case 'top-left':
      return { x: left, y: top, w, h };
    case 'top-right':
      return { x: right, y: top, w, h };
    case 'bottom-left':
      return { x: left, y: bottom, w, h };
    default:
      return { x: right, y: bottom, w, h };
  }
}
