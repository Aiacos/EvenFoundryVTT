/**
 * Showcase-faithful raster HUD renderer (PRODUCTION).
 *
 * Draws the full glanceable HUD — double-ruled D&D frame + corner brackets +
 * header + framed map region + right-hand status card + footer gesture hints —
 * onto a 400×200 canvas using the VT323 pixel font and the phosphor-green palette
 * from `docs/showcase/index.html`. The composited canvas is then dithered to 4-bit
 * ({@link ../hud/showcase-raster.ts}) and pushed as the 4 hybrid map tiles, so the
 * ENTIRE HUD (map included) reads as one crisp CRT raster image on the glasses —
 * matching the showcase mockups instead of the flat native-text chrome.
 *
 * The 400×200 footprint is the hardware raster cap (4 image containers × 200×100;
 * INV-2, Specs §7.4 — the G2 cannot raster the full 576×288). The HUD is therefore
 * designed to be complete and legible within 400×200.
 *
 * Loading tolerance: a `null` snapshot (bridge up, no character delta yet) renders
 * the chrome with `—`/`…` placeholders instead of throwing (mirrors
 * {@link ../status-hud/status-hud-renderer.ts}#renderLoading). The renderer never
 * throws for a populated OR null snapshot.
 *
 * @see docs/showcase/index.html (visual contract — palette, frames, glyphs)
 * @see packages/g2-app/src/hud/showcase-raster.ts (dither + tile split)
 * @see packages/g2-app/src/demo/showcase-preview.ts (dev visual test harness)
 */

import type { CharacterSnapshot } from '@evf/shared-protocol';

/** Phosphor-green palette (from the showcase CSS custom properties). */
const COL = {
  bg: '#050a05', // deepest
  dim: '#2d4a2d', // dark green — inactive, rules
  mid: '#4a8c4a', // mid green — labels
  bright: '#6dd56d', // bright green — values
  hi: '#9cffaf', // hi green — emphasis
  pale: '#d8ffd8', // pale — headline
} as const;

/** Canvas region geometry (the hardware raster cap). */
const W = 400;
const H = 200;

/** Loading placeholder for a scalar with no value yet (bridge up, no delta). */
const EM_DASH = '—';
/** Loading placeholder for a still-loading numeric (e.g. HP current). */
const ELLIPSIS = '…';

/**
 * Map painter callback — fills the given rect with the map raster.
 *
 * The renderer owns the framed region geometry; the caller owns what fills it
 * (a live Foundry scene raster at runtime, a synthetic scene in the dev preview).
 */
export type MapPainter = (
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
) => void;

/** Everything the HUD needs to render one frame. */
export interface ShowcaseHudModel {
  /** Scene / encounter name, upper-cased in the header band. */
  readonly sceneName: string;
  /** Current combat round. */
  readonly round: number;
  /** Current turn index within the round (0-indexed; the header displays it as `turn+1`). */
  readonly turn: number;
  /** Number of combatants in the initiative order (turn denominator). */
  readonly turnMax: number;
  /**
   * R1 ring battery percent (0-100), or `null` when unknown (device status not yet
   * read / `onDeviceStatusChanged` unavailable). A `null` battery renders `⌁—` (the
   * project-wide missing-scalar convention) instead of a stale number.
   */
  readonly battery: number | null;
  /**
   * The focused character's snapshot, or `null` while the first delta is still
   * loading. A `null` snapshot renders the status card with `—`/`…` placeholders.
   */
  readonly snapshot: CharacterSnapshot | null;
  /** Draws the map into the framed left region. */
  readonly paintMap: MapPainter;
}

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Build a VT323 font string at the given pixel size (monospace fallback). */
function font(px: number): string {
  return `${px}px "VT323", monospace`;
}

/** Draw left-aligned text at a baseline. */
function text(ctx: Ctx, s: string, x: number, baseline: number, px: number, color: string): void {
  ctx.font = font(px);
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(s, x, baseline);
}

/** Draw right-aligned text ending at x. */
function textRight(
  ctx: Ctx,
  s: string,
  x: number,
  baseline: number,
  px: number,
  color: string,
): void {
  ctx.font = font(px);
  ctx.fillStyle = color;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(s, x, baseline);
  ctx.textAlign = 'left';
}

/**
 * A 10-cell block HP bar string (`█` full · `▓` half · `░` empty).
 *
 * @param cur   Current hit points.
 * @param max   Maximum hit points; `<= 0` yields an all-empty bar (no divide-by-zero).
 * @param cells Bar width in glyph cells (default 10).
 */
function hpBar(cur: number, max: number, cells = 10): string {
  if (max <= 0) return '░'.repeat(cells);
  const ratio = Math.max(0, Math.min(1, cur / max));
  const full = Math.floor(ratio * cells);
  const half = ratio * cells - full >= 0.5 ? 1 : 0;
  return `${'█'.repeat(full)}${'▓'.repeat(half)}${'░'.repeat(Math.max(0, cells - full - half))}`;
}

/**
 * Compact spell-slot pips: `1▓▓░ 2▓░` (`▓` available · `░` spent), two groups per line.
 *
 * @param slots Spell-slot levels (only levels 1-5 with `max > 0` are shown).
 * @returns One string per line (max two groups each), or `['—']` when no slots.
 */
function slotPips(slots: ReadonlyArray<{ level: number; value: number; max: number }>): string[] {
  const parts = slots
    .filter((s) => s.level <= 5 && s.max > 0)
    .map((s) => {
      const avail = Math.max(0, Math.min(s.max, s.value));
      return `${s.level}${'▓'.repeat(avail)}${'░'.repeat(Math.max(0, s.max - avail))}`;
    });
  // Two groups per line.
  const lines: string[] = [];
  for (let i = 0; i < parts.length; i += 2) {
    lines.push(parts.slice(i, i + 2).join(' '));
  }
  return lines.length > 0 ? lines : [EM_DASH];
}

/** Draw the double-ruled outer frame + corner brackets (Feature 001 sheet style). */
function drawFrame(ctx: Ctx): void {
  ctx.fillStyle = COL.bg;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = COL.mid;
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
  ctx.strokeRect(3.5, 3.5, W - 7, H - 7);
  // Corner brackets — short L arms just inside the inner rule.
  ctx.strokeStyle = COL.bright;
  const m = 7;
  const a = 12;
  const corners: Array<[number, number, number, number]> = [
    [m, m, 1, 1],
    [W - m, m, -1, 1],
    [m, H - m, 1, -1],
    [W - m, H - m, -1, -1],
  ];
  ctx.beginPath();
  for (const [cx, cy, sx, sy] of corners) {
    ctx.moveTo(cx + sx * a, cy);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx, cy + sy * a);
  }
  ctx.stroke();
}

/**
 * Draw a small boot silhouette — the movement-SPEED icon.
 *
 * A boot (not swords) is the correct affordance for movement/speed: swords read
 * as "attack". Drawn as a crisp vector L-shape (leg shaft + forward foot) so it
 * survives the 4-bit dither cleanly, unlike a colour emoji. Shared with the
 * canvas icon path in {@link ../panels/icon-dictionary.ts} so both the HUD and the
 * sheet render an identical boot for movement.
 *
 * The base footprint is ~11×11 px at `scale = 1`; larger `scale` fits bigger cells.
 *
 * @param ctx   Canvas context to draw into.
 * @param x     Left of the icon box.
 * @param y     Top of the icon box.
 * @param color Fill colour.
 * @param scale Uniform scale factor over the base ~11×11 footprint (default 1).
 */
export function drawBoot(ctx: Ctx, x: number, y: number, color: string, scale = 1): void {
  const s = scale;
  ctx.fillStyle = color;
  ctx.beginPath();
  // leg shaft
  ctx.rect(x + 2 * s, y, 4 * s, 8 * s);
  // foot pointing forward (right), with a slightly raised toe
  ctx.rect(x + 2 * s, y + 8 * s, 9 * s, 3 * s);
  ctx.rect(x + 9 * s, y + 6 * s, 2 * s, 5 * s);
  ctx.fill();
}

/** Horizontal double rule across the inner width at y. */
function rule(ctx: Ctx, y: number): void {
  ctx.fillStyle = COL.dim;
  ctx.fillRect(6, y, W - 12, 1);
  ctx.fillRect(6, y + 2, W - 12, 1);
}

/** Header band: scene · round/turn · ring battery. */
function drawHeader(ctx: Ctx, m: ShowcaseHudModel): void {
  text(ctx, m.sceneName.toUpperCase(), 10, 20, 16, COL.pale);
  // `⌁—` when battery is unknown (null), `⌁{n}%` when the device reported a level.
  const batteryStr = m.battery === null ? `⌁${EM_DASH}` : `⌁${m.battery}%`;
  textRight(ctx, batteryStr, W - 10, 20, 14, COL.mid);
  // `turn` is 0-indexed → display 1-indexed (`turn+1`).
  textRight(ctx, `R${m.round}·T${m.turn + 1}/${m.turnMax}`, W - 62, 20, 14, COL.bright);
  rule(ctx, 26);
}

/** Framed map region on the left. */
function drawMap(ctx: Ctx, m: ShowcaseHudModel): void {
  const x = 8;
  const y = 31;
  const w = 222;
  const h = 139;
  m.paintMap(ctx, x, y, w, h);
  ctx.strokeStyle = COL.mid;
  ctx.lineWidth = 1;
  ctx.strokeRect(x - 0.5, y - 0.5, w + 1, h + 1);
  // small "MAP" tab
  ctx.fillStyle = COL.bg;
  ctx.fillRect(x + 4, y - 1, 34, 12);
  text(ctx, 'MAP', x + 6, y + 9, 12, COL.mid);
}

/**
 * Right-hand status card — the glanceable D&D vitals.
 *
 * Tolerates a `null` snapshot: name → `—`, HP → `…/—`, AC/speed/slots → `—`.
 * The speed affordance is always the vector boot ({@link drawBoot}) — never the
 * `⚔` glyph, which would misread as "attack".
 */
function drawStatus(ctx: Ctx, m: ShowcaseHudModel): void {
  const s = m.snapshot;
  const x = 240;
  // vertical divider
  ctx.fillStyle = COL.dim;
  ctx.fillRect(234, 30, 1, 141);

  let y = 44;
  const step = 15;

  // Name (truncated to region) + level/class
  text(ctx, s ? s.name : EM_DASH, x, y, 16, COL.hi);
  y += step;
  const clsLine = s ? `Lv${s.level}${s.class ? ` ${s.class}` : ''}` : EM_DASH;
  text(ctx, clsLine, x, y, 13, COL.mid);
  y += step + 1;

  // HP numeric + temp
  const tempStr = s && s.tempHp > 0 ? `  +${s.tempHp}` : '';
  const hpStr = s ? `${s.hp}/${s.maxHp}${tempStr}` : `${ELLIPSIS}/${EM_DASH}`;
  text(ctx, '♥', x, y, 14, COL.bright);
  text(ctx, hpStr, x + 16, y, 14, COL.pale);
  y += step - 2;
  // HP bar
  text(ctx, s ? hpBar(s.hp, s.maxHp, 12) : ELLIPSIS.repeat(12), x, y, 14, COL.bright);
  y += step + 1;

  // AC (shield) / speed (boot — NOT swords: swords read as attack, not movement)
  text(ctx, '⛨', x, y, 14, COL.mid);
  text(ctx, s ? String(s.ac) : EM_DASH, x + 16, y, 14, COL.pale);
  drawBoot(ctx, x + 62, y - 11, COL.mid);
  text(ctx, s ? String(s.speed) : EM_DASH, x + 80, y, 14, COL.pale);
  y += step + 2;

  // Slots
  text(ctx, 'SLOTS', x, y, 12, COL.mid);
  y += step - 3;
  const slotLines = s ? slotPips(s.spells?.slots ?? []).slice(0, 2) : [EM_DASH];
  for (const line of slotLines) {
    text(ctx, line, x, y, 14, COL.bright);
    y += step - 2;
  }
  y += 3;

  // Conditions
  if (s && s.conditions.length > 0) {
    text(ctx, '▶', x, y, 13, COL.hi);
    text(ctx, s.conditions.slice(0, 2).join(', '), x + 14, y, 13, COL.bright);
  }
}

/** Footer band: R1 gesture hints + panel chips (canonical gesture set). */
function drawFooter(ctx: Ctx): void {
  rule(ctx, 174);
  text(ctx, 'R1 scroll=pan  tap=ping  ▲=menu', 10, 191, 13, COL.mid);
  textRight(ctx, '[SHEET] [COMBAT]', W - 10, 191, 13, COL.dim);
}

/**
 * Render the full showcase HUD onto a 400×200 canvas context.
 *
 * The caller must have registered VT323 (via `ensureVt323Loaded`) before the
 * first call so text renders in the pixel font rather than the monospace fallback.
 * Never throws for a populated OR `null` snapshot.
 *
 * @param ctx   A 2D canvas context sized 400×200 (browser or worker offscreen).
 * @param model The frame model (scene, combat, battery, snapshot, map painter).
 */
export function drawShowcaseHud(ctx: Ctx, model: ShowcaseHudModel): void {
  drawFrame(ctx);
  drawHeader(ctx, model);
  drawMap(ctx, model);
  drawStatus(ctx, model);
  drawFooter(ctx);
}

export { H as HUD_H, W as HUD_W };
