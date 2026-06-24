/**
 * CanvasTargetPickerPanel — canvas-mode target selection overlay (z=2).
 *
 * The canvas-mode analogue of {@link TargetPickerPanel} (which renders to a glyph TEXT
 * container and therefore trips LayerManager's canvas container-budget assertion —
 * canvas layers MUST return `{image:0, text:0}` and paint to the shared compositor
 * canvas, ADR-0009). This panel paints a scrollable candidate list to the canvas with a
 * `▶` cursor (R1 scroll moves it), and a TAP emits the canonical `tool.invoke` envelope
 * with the selected token appended to `callerArgs.targets`. Double-tap cancels.
 *
 * Opened by the boot-side `canvasItemDispatch` / `canvasSpellDispatch` (boot-engine-core)
 * when the tapped weapon/spell requires a target. Candidates come from
 * {@link resolveValidTargets} (combatants-only MVP). Empty list → 'Nessun bersaglio' +
 * auto-close after {@link AUTO_CLOSE_MS}.
 *
 * @see packages/g2-app/src/panels/target-picker-panel.ts (the glyph-mode original)
 * @see packages/g2-app/src/panels/canvas-selectable-list.ts (canvas list rendering template)
 * @see packages/g2-app/src/panels/target-resolver.ts (resolveValidTargets + describeTargetRow)
 */

import { COMPOSITOR_H, COMPOSITOR_W } from '../engine/canvas-compositor.js';
import type { CanvasLayer, OverlayPanel, R1Gesture } from '../engine/layer-types.js';
import { ZIndex } from '../engine/layer-types.js';
import type { PanelGestureBus } from '../engine/panel-gesture-bus.js';
import { getLabel, type HudLocale } from '../status-hud/i18n-budgets.js';
import { ensureVt323Loaded } from '../status-hud/vt323-font-loader.js';
import { _drawListChrome } from './canvas-selectable-list.js';
import { describeTargetRow, type TargetCandidate } from './target-resolver.js';

// crypto.randomUUID is available in the WebView + Node 24 test env (matches target-picker-panel.ts).
declare const crypto: { randomUUID(): string };

/** Canvas 2D context union (matches canvas-selectable-list.ts). */
type Ctx = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

/** Minimal WS sink (tests inject a vi.fn(); production passes a wsSender adapter). */
export interface CanvasTargetPickerWebSocket {
  send(data: string): void;
}

/** Tool invocation context — the panel appends `targets:[selected]` to `callerArgs`. */
export interface CanvasTargetPickerToolInvocation {
  readonly toolId: 'cast-spell' | 'weapon-attack' | 'use-item';
  readonly callerArgs: Record<string, unknown>;
}

/** Invoked on confirm (tap), cancel (double-tap), or empty auto-close. */
export type CanvasTargetPickerCloseHandler = () => void;

/** Rows painted before running out of vertical space (mirrors CANVAS_LIST_VISIBLE_ROWS). */
const VISIBLE_ROWS = 9;
/** Code-point clamp for a candidate row at 576px / VT323 (describeTargetRow truncates with …). */
const ROW_WIDTH = 46;
/** Empty-state auto-close delay (matches the glyph TargetPickerPanel). */
const AUTO_CLOSE_MS = 2000;
const CANVAS_LINE_H = 27;
const CHROME_FG = '#ffffff';

/**
 * z=2 canvas overlay: scrollable target list for canvas-mode cast/attack flows.
 */
export class CanvasTargetPickerPanel implements CanvasLayer, OverlayPanel {
  public readonly id = 'canvas-target-picker';
  public readonly z = ZIndex.Z2_OVERLAY;
  /** Double-tap is cancel — handled here, not by the nav-panel-close dispatcher. */
  public readonly handlesDoubleTap = true as const;

  private _ctx: Ctx | null = null;
  private _fontFamily = '16px monospace';
  private _cursor = 0;
  private _dirty = true;
  private _unsubscribe: (() => void) | null = null;
  private _autoCloseTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly _gestureBus: PanelGestureBus,
    private readonly _locale: HudLocale,
    private readonly _candidates: ReadonlyArray<TargetCandidate>,
    private readonly _sessionId: string,
    private readonly _toolInvocation: CanvasTargetPickerToolInvocation,
    private readonly _ws: CanvasTargetPickerWebSocket,
    private readonly _onClose: CanvasTargetPickerCloseHandler,
  ) {}

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
    ctx.clearRect(0, 0, COMPOSITOR_W, COMPOSITOR_H);
    _drawListChrome(ctx, getLabel('target_picker_title', this._locale), this._fontFamily);
    ctx.fillStyle = CHROME_FG;
    ctx.font = this._fontFamily;
    let lineY = 30 + CANVAS_LINE_H;

    if (this._candidates.length === 0) {
      ctx.fillText(getLabel('target_picker_empty_hint', this._locale), 8, lineY);
      this._dirty = false;
      return;
    }

    // Window the list so the cursor stays visible (same maths as windowCursorRows).
    const count = this._candidates.length;
    const maxOffset = Math.max(0, count - VISIBLE_ROWS);
    const offset = Math.min(Math.max(0, this._cursor - (VISIBLE_ROWS - 1)), maxOffset);
    for (let i = offset; i < Math.min(offset + VISIBLE_ROWS, count); i++) {
      const candidate = this._candidates[i];
      if (candidate === undefined) continue;
      const row = describeTargetRow(candidate, this._locale, i, i === this._cursor, ROW_WIDTH);
      ctx.fillText(row.trimEnd(), 8, lineY);
      lineY += CANVAS_LINE_H;
      if (lineY > COMPOSITOR_H - 6) break;
    }
    this._dirty = false;
  }

  isDirty(): boolean {
    return this._dirty;
  }

  draw(): Promise<void> {
    return Promise.resolve();
  }

  getContainerCount(): { image: 0; text: 0 } {
    return { image: 0, text: 0 };
  }

  getCaptureContainer(): string {
    return 'hud-capture';
  }

  destroy(): void {
    /* no GPU resources held; cleanup in onUnmount */
  }

  // ── OverlayPanel ────────────────────────────────────────────────────────────

  async onMount(): Promise<void> {
    this._cursor = 0;
    this._dirty = true;
    this._unsubscribe = this._gestureBus.subscribe((g) => this.onEvent(g));
    if (this._candidates.length === 0) {
      this._autoCloseTimer = setTimeout(() => {
        this._autoCloseTimer = null;
        this._onClose();
      }, AUTO_CLOSE_MS);
    }
  }

  async onUnmount(): Promise<void> {
    if (this._unsubscribe !== null) {
      this._unsubscribe();
      this._unsubscribe = null;
    }
    if (this._autoCloseTimer !== null) {
      clearTimeout(this._autoCloseTimer);
      this._autoCloseTimer = null;
    }
  }

  /**
   * Gesture dispatch:
   *   - scroll → move the cursor (wrap), redraw
   *   - tap    → emit tool.invoke with `targets:[selected]` + close (no-op if empty)
   *   - double-tap → close WITHOUT emitting (cancel)
   */
  onEvent(gesture: R1Gesture): void {
    switch (gesture.kind) {
      case 'scroll': {
        if (this._candidates.length === 0) break;
        this._cursor =
          gesture.direction === 'down'
            ? (this._cursor + 1) % this._candidates.length
            : (this._cursor - 1 + this._candidates.length) % this._candidates.length;
        this._dirty = true;
        break;
      }
      case 'tap': {
        if (this._candidates.length === 0) break;
        const selected = this._candidates[this._cursor];
        if (selected === undefined) break;
        const envelope = {
          proto: 'evf-v1' as const,
          seq: 0,
          ts: Date.now(),
          type: 'tool.invoke' as const,
          session_id: this._sessionId,
          payload: {
            toolId: this._toolInvocation.toolId,
            idempotencyKey: crypto.randomUUID(),
            args: { ...this._toolInvocation.callerArgs, targets: [selected.tokenId] },
          },
        };
        this._ws.send(JSON.stringify(envelope));
        this._onClose();
        break;
      }
      case 'double-tap':
        this._onClose();
        break;
    }
  }

  /** Over-scroll at the top opens the Quick Action menu (ADR-0012 D-2). */
  isAtTopBoundary(): boolean {
    return this._cursor === 0;
  }

  /** Test-only: current cursor index. */
  _getCursorForTest(): number {
    return this._cursor;
  }
}
