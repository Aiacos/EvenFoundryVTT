/**
 * HUD canvas renderer — draws the character status sheet onto a 576×288 2D
 * canvas with a COMPACT font (deliberately denser than the SDK's fixed 27px).
 *
 * This is the canvas analogue of `status-hud-renderer`'s `render()` method:
 * the CONTENT logic (field selection, formatting, fallbacks) is reused from
 * the j0t status-hud-renderer; only the OUTPUT TARGET changes from
 * `\n`-joined strings to canvas draw calls.
 *
 * The density vs. the SDK 27px font is the entire point of this PoC:
 * - Canvas font: 14px monospace → ~20 rows in 288px vs. ~10 rows with SDK text.
 * - HP bar: drawn as a filled rectangle (not glyphs) — image rendering lets us
 *   draw a real proportional bar.
 *
 * Environment handling:
 * - In WebView/sim (document available): uses `document.createElement('canvas')`.
 * - In Web Worker (OffscreenCanvas available): uses `new OffscreenCanvas(w,h)`.
 * - In test environment (neither): this function is NOT called by unit tests
 *   (canvas rendering is not unit-testable in happy-dom). Tests only cover
 *   the pure assembler logic in `hud-raster-frame.ts`.
 *
 * @see docs/architecture/0013-hud-raster-rendering.md (ADR-0013)
 * @see packages/g2-app/src/status-hud/status-hud-renderer.ts (j0t content logic source)
 * @see packages/g2-app/src/hud/hud-raster-frame.ts (downstream consumer)
 */

import type { CharacterSnapshot } from '@evf/shared-protocol';

/** Em-dash placeholder for missing/unavailable data. */
const EM_DASH = '—';

/** Canvas background color (black — dithered to phosphor green on device). */
const BG_COLOR = '#000';

/** Canvas foreground color (white — quantized to brightest palette step). */
const FG_COLOR = '#fff';

/**
 * Compact monospace font used for the status sheet.
 *
 * 14px delivers ~20 rows in 288px height (vs. SDK's fixed 27px → ~10 rows).
 * This density IS the point of the raster HUD PoC (ADR-0013).
 */
const HUD_FONT = '14px monospace';

/** Line pitch in pixels (font size + 2px leading). */
const LINE_PITCH = 16;

/** Horizontal left margin for text. */
const TEXT_LEFT = 4;

/** Width of the HP bar in pixels. */
const HP_BAR_WIDTH = 200;

/** Height of the HP bar in pixels. */
const HP_BAR_HEIGHT = 10;

/** Number of visible spell-slot levels to render on the slots row. */
const MAX_SLOT_LEVELS = 6;

/**
 * Build the HP bar text representation for the text HUD (j0t reuse).
 *
 * Returns a fraction string `cur/max` alongside the bar drawing position.
 */
function hpFraction(hp: number, maxHp: number): string {
  return `${hp}/${maxHp}`;
}

/**
 * Build the conditions display string.
 *
 * @param conditions Array of condition ID strings from `actor.statuses`.
 * @returns Comma-joined condition list, or `—` when none are active.
 */
function formatConditions(conditions: ReadonlyArray<string>): string {
  return conditions.length > 0 ? conditions.join(', ') : EM_DASH;
}

/**
 * Build the spell-slots row text: `L●○  L●●○` format (j0t content logic).
 *
 * @param slots Spell slot array from `CharacterSnapshot.spells.slots`.
 * @returns Formatted slot string, or `—` for non-casters.
 */
function formatSlots(slots: ReadonlyArray<{ level: number; value: number; max: number }>): string {
  const active = slots.filter((s) => s.max > 0 && s.level > 0 && s.level <= 9);
  if (active.length === 0) {
    return EM_DASH;
  }
  const shown = active.slice(0, MAX_SLOT_LEVELS);
  return shown
    .map((s) => {
      const filled = '●'.repeat(s.value);
      const empty = '○'.repeat(s.max - s.value);
      return `${s.level}${filled}${empty}`;
    })
    .join('  ');
}

/**
 * Build the death-saves row text: `TS morte ●●○ / ○○○` format (j0t content logic).
 *
 * @param death Death saving throw counters from `CharacterSnapshot.death`.
 * @returns Formatted death-saves string.
 */
function formatDeathSaves(death: { success: number; failure: number }): string {
  const successes = '●'.repeat(death.success) + '○'.repeat(3 - death.success);
  const failures = '●'.repeat(death.failure) + '○'.repeat(3 - death.failure);
  return `TS morte ${successes} / ${failures}`;
}

/**
 * Acquire a 2D canvas rendering context for the given dimensions.
 *
 * Environment resolution order:
 * 1. `document.createElement('canvas')` — WebView/simulator (DOM available).
 * 2. `new OffscreenCanvas(w,h)` — Web Worker context.
 * 3. Throws a guarded Error — test environment (unit tests never call this).
 *
 * @param width  Canvas width in pixels.
 * @param height Canvas height in pixels.
 * @returns A 2D rendering context ready for drawing.
 * @throws Error when no canvas API is available in the current environment.
 */
function acquireCanvas2d(
  width: number,
  height: number,
): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D {
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (ctx === null) {
      throw new Error('[EVF] hud-canvas-renderer: getContext("2d") returned null');
    }
    return ctx;
  }

  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (ctx === null) {
      throw new Error('[EVF] hud-canvas-renderer: OffscreenCanvas getContext("2d") returned null');
    }
    return ctx as OffscreenCanvasRenderingContext2D;
  }

  throw new Error(
    '[EVF] hud-canvas-renderer: no canvas API available in this environment ' +
      '(neither document nor OffscreenCanvas). Unit tests must not call renderHudFrame.',
  );
}

/**
 * Render the character status sheet onto a 576×288 2D canvas with a compact
 * 14px monospace font and return the raw RGBA pixel data.
 *
 * The canvas is rendered with a black background and white text/graphics.
 * The downstream `buildHudTiles` function converts the RGBA to greyscale,
 * applies Floyd-Steinberg dithering, and encodes to 4-bit indexed PNG tiles
 * for upload to the G2 framebuffer.
 *
 * **Content drawn (j0t field selection, reused):**
 * - Row 0: `{name}  Lv{N}`
 * - Row 1: `────────────────────────────`
 * - Row 2: `PF {cur}/{max}` + HP bar (filled rect)
 * - Row 3: `CA {ac}   VEL —`
 * - Row 4: `Turno —   Round —   [—]`
 * - Row 5: `Cond: {conditions}`
 * - Row 6: `────────────────────────────`
 * - Row 7: `Slot {slots}`
 * - Row 8: `{deathSaves}`
 *
 * **Canvas note:** this function is NOT called by unit tests (canvas text is
 * not testable in happy-dom). The live sim screenshot is the real visual gate.
 *
 * @param snapshot The character snapshot to render (or a minimal fallback).
 * @param dims     Canvas dimensions; expected to be `{width: 576, height: 288}`.
 * @returns RGBA Uint8ClampedArray of length `width * height * 4`.
 *
 * @see docs/architecture/0013-hud-raster-rendering.md (ADR-0013)
 * @see packages/g2-app/src/status-hud/status-hud-renderer.ts (j0t content source)
 */
export function renderHudFrame(
  snapshot: CharacterSnapshot,
  dims: { width: number; height: number },
): Uint8ClampedArray {
  const { width, height } = dims;
  const ctx = acquireCanvas2d(width, height);

  // ── Background ────────────────────────────────────────────────────────────
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, width, height);

  // ── Text setup ────────────────────────────────────────────────────────────
  ctx.fillStyle = FG_COLOR;
  ctx.strokeStyle = FG_COLOR;
  ctx.font = HUD_FONT;
  ctx.textBaseline = 'top';

  let y = 4; // top padding

  // ── Row 0: Name + Level ───────────────────────────────────────────────────
  const nameLevel = `${snapshot.name}  Lv${snapshot.level}`;
  ctx.fillText(nameLevel, TEXT_LEFT, y);
  y += LINE_PITCH;

  // ── Row 1: Divider ────────────────────────────────────────────────────────
  ctx.fillText('─'.repeat(58), TEXT_LEFT, y);
  y += LINE_PITCH;

  // ── Row 2: HP label + HP bar (filled rect) + fraction ─────────────────────
  const hpLabel = 'PF ';
  ctx.fillText(hpLabel, TEXT_LEFT, y);
  const hpLabelWidth = ctx.measureText(hpLabel).width;
  const barX = TEXT_LEFT + hpLabelWidth;
  const ratio = snapshot.maxHp > 0 ? Math.max(0, Math.min(1, snapshot.hp / snapshot.maxHp)) : 0;

  // Outline rect
  ctx.strokeRect(barX, y + 1, HP_BAR_WIDTH, HP_BAR_HEIGHT - 1);
  // Filled portion (current HP)
  if (ratio > 0) {
    ctx.fillRect(barX + 1, y + 2, Math.floor((HP_BAR_WIDTH - 2) * ratio), HP_BAR_HEIGHT - 3);
  }

  const hpFrac = ` ${hpFraction(snapshot.hp, snapshot.maxHp)}`;
  ctx.fillText(hpFrac, barX + HP_BAR_WIDTH + 4, y);
  y += LINE_PITCH;

  // ── Row 3: AC + VEL ───────────────────────────────────────────────────────
  ctx.fillText(`CA ${snapshot.ac}   VEL ${EM_DASH}`, TEXT_LEFT, y);
  y += LINE_PITCH;

  // ── Row 4: Turn/Round/YourTurn ────────────────────────────────────────────
  ctx.fillText(`Turno ${EM_DASH}   Round ${EM_DASH}   [${EM_DASH}]`, TEXT_LEFT, y);
  y += LINE_PITCH;

  // ── Row 5: Conditions ─────────────────────────────────────────────────────
  ctx.fillText(`Cond: ${formatConditions(snapshot.conditions)}`, TEXT_LEFT, y);
  y += LINE_PITCH;

  // ── Row 6: Divider ────────────────────────────────────────────────────────
  ctx.fillText('─'.repeat(58), TEXT_LEFT, y);
  y += LINE_PITCH;

  // ── Row 7: Spell slots ────────────────────────────────────────────────────
  const slotsText = formatSlots(snapshot.spells?.slots ?? []);
  ctx.fillText(`Slot ${slotsText}`, TEXT_LEFT, y);
  y += LINE_PITCH;

  // ── Row 8: Death saves ────────────────────────────────────────────────────
  ctx.fillText(formatDeathSaves(snapshot.death), TEXT_LEFT, y);

  // ── Extract RGBA pixel data ───────────────────────────────────────────────
  const imageData = ctx.getImageData(0, 0, width, height);
  return new Uint8ClampedArray(imageData.data.buffer.slice(0));
}
