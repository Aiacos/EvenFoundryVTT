/**
 * CanvasActionOptionsModal — canvas-mode action-options confirmation modal.
 *
 * Feature 001 (Option B) — the interactive canvas list panels
 * ({@link CanvasSelectableListPanel}: Inventario / Libro) dispatch a tap to an
 * Action-Options modal. The glyph-mode {@link ActionOptionsModal} renders into a
 * native **text** container (`getContainerCount()` → `{ image: 0, text: 1 }`),
 * which is illegal in canvas mode: every mounted layer must declare
 * `{ image: 0, text: 0 }` and composite to the shared canvas (ADR-0013
 * Amendment 1, locked decision #3). Pushing the glyph modal in canvas mode
 * therefore throws `canvas mode: layer 'action-options-modal' declared non-zero
 * container count` and the tap fails.
 *
 * This subclass reuses the parent's gesture + envelope logic **verbatim**
 * (`onEvent` / `onMount` / `onUnmount` / preconditioner / slot-picker / target
 * branching / `tool.invoke` emission are all inherited unchanged — so the
 * dispatched envelope is byte-identical to the glyph path) and ONLY swaps the
 * rendering surface: it implements {@link CanvasLayer} (paint to the canvas) and
 * overrides `draw()` to a no-op (no `bridge.textContainerUpgrade`) +
 * `getContainerCount()` to `{ image: 0, text: 0 }`.
 *
 * The layout is a compact centred box (NOT the parent's 12-row text layout,
 * which at the 27 px canvas line-height would overflow the 288 px display):
 * title rule, action name, `[tap]` confirm row, `[x2]` cancel row — mirroring
 * the chrome of {@link CanvasSelectableListPanel}.
 *
 * @see packages/g2-app/src/panels/action-options-modal.ts (parent — gesture/envelope logic)
 * @see packages/g2-app/src/panels/canvas-selectable-list.ts (canvas-layer chrome template)
 * @see docs/architecture/0013-canvas-compositor.md §Amendment 1 (locked decision #3)
 */

import { COMPOSITOR_H, COMPOSITOR_W } from '../engine/canvas-compositor.js';
import type { CanvasLayer } from '../engine/layer-types.js';
import { ZIndex } from '../engine/layer-types.js';
import { getLabel } from '../status-hud/i18n-budgets.js';
import { ensureVt323Loaded } from '../status-hud/vt323-font-loader.js';
import { ActionOptionsModal } from './action-options-modal.js';

/** Canvas 2D context union. */
type Ctx = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

const CHROME_BG = '#000000';
const CHROME_FG = '#ffffff';
/** Name display budget — action name truncated to this many code-points. */
const NAME_BUDGET = 34;
/** Centred modal box geometry (px). */
const BOX_X = 64;
const BOX_W = COMPOSITOR_W - 2 * BOX_X; // 448
const BOX_Y = 84;
const BOX_H = 120;
/** Canvas line height (px) — matches the other canvas panels. */
const LINE_H = 27;

/**
 * Canvas-mode action-options modal. Constructed with the SAME argument list as
 * {@link ActionOptionsModal} (the boot dispatch passes them through unchanged),
 * so it is a drop-in replacement for the canvas path.
 */
export class CanvasActionOptionsModal extends ActionOptionsModal implements CanvasLayer {
  /** Stable id — distinct from the glyph modal for telemetry / layer keys. */
  public override readonly id: string = 'canvas-action-options-modal';

  /** Z-index slot — z=2 overlay (same as the glyph modal). */
  public readonly z = ZIndex.Z2_OVERLAY;

  private _ctx: Ctx | null = null;
  private _fontFamily = '16px monospace';
  private _dirty = true;

  // ── CanvasLayer ─────────────────────────────────────────────────────────────

  async attachCanvas(canvas: OffscreenCanvas | HTMLCanvasElement): Promise<void> {
    const ctx = canvas.getContext('2d') as Ctx | null;
    if (ctx === null) {
      console.warn(
        `[EVF] ${this.id}.attachCanvas: getContext("2d") null — degraded (no-op paint).`,
      );
      return;
    }
    this._ctx = ctx;
    this._fontFamily = await ensureVt323Loaded();
    this._dirty = true;
  }

  paint(): void {
    const ctx = this._ctx;
    if (ctx === null) return;

    // Full-frame black backdrop (the underlying list panel is suspended while the
    // modal is the active z=2 overlay, mirroring CanvasSelectableListPanel.paint).
    ctx.clearRect(0, 0, COMPOSITOR_W, COMPOSITOR_H);
    ctx.fillStyle = CHROME_BG;
    ctx.fillRect(0, 0, COMPOSITOR_W, COMPOSITOR_H);

    // Centred box: filled black + single-stroke frame + header rule.
    ctx.fillStyle = CHROME_BG;
    ctx.fillRect(BOX_X, BOX_Y, BOX_W, BOX_H);
    ctx.strokeStyle = CHROME_FG;
    ctx.lineWidth = 1;
    ctx.strokeRect(BOX_X + 0.5, BOX_Y + 0.5, BOX_W - 1, BOX_H - 1);
    ctx.fillStyle = CHROME_FG;
    ctx.fillRect(BOX_X + 1, BOX_Y + 24, BOX_W - 2, 1);

    ctx.font = this._fontFamily;
    ctx.fillStyle = CHROME_FG;
    const tx = BOX_X + 10;

    // Title rule: "[ AZIONE ]".
    const title = getLabel('action_options_title', this.locale);
    ctx.fillText(`[ ${title} ]`, tx, BOX_Y + 19);

    // Action name (truncated to NAME_BUDGET).
    let y = BOX_Y + 24 + LINE_H;
    ctx.fillText(`${title}: ${this._truncateName(this.request.name)}`, tx, y);

    // [tap] confirm row.
    const tapLabel =
      this.request.kind === 'spell'
        ? getLabel('action_options_tap_label_spell', this.locale)
        : getLabel('action_options_tap_label_item', this.locale);
    y += LINE_H;
    ctx.fillText(`[tap]  ${tapLabel}`, tx, y);

    // [x2] cancel row.
    const cancelLabel = getLabel('action_options_cancel_label', this.locale);
    y += LINE_H;
    ctx.fillText(`[x2]   ${cancelLabel}`, tx, y);

    this._dirty = false;
  }

  isDirty(): boolean {
    return this._dirty;
  }

  /**
   * Canvas-mode draw is a no-op — the parent's `draw()` issues a
   * `bridge.textContainerUpgrade` (text container), which must NOT happen in
   * canvas mode. Rendering goes through {@link paint} instead.
   */
  override draw(): Promise<void> {
    return Promise.resolve();
  }

  /** Canvas-layer container contract: zero native containers (ADR-0013 Amd 1). */
  override getContainerCount(): { image: 0; text: 0 } {
    return { image: 0, text: 0 };
  }

  getCaptureContainer(): string {
    return 'hud-capture';
  }

  /** Truncate the action name to NAME_BUDGET code-points, appending `…` if cut. */
  private _truncateName(value: string): string {
    const cps = [...value];
    return cps.length <= NAME_BUDGET ? value : `${cps.slice(0, NAME_BUDGET - 1).join('')}…`;
  }
}
