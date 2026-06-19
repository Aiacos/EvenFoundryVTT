/**
 * CanvasSelectableListPanel — shared base for canvas-mode INTERACTIVE list panels
 * (Inventory, Spellbook). Feature 001 (Option B): in canvas mode the Quick Action
 * "Inventario"/"Libro" open a dedicated panel where the player can move a CURSOR
 * through the list (swipe-up/down) and ACTIVATE the highlighted element (tap →
 * Action Options → `activity.use()`) — the read-only sheet tabs could only cycle.
 *
 * The selection logic is reused verbatim from the glyph standalone panels: each
 * subclass supplies the paired (standalone row renderer + row→entry map + resolver
 * + request builder), so the cursor↔row mapping and the dispatched
 * {@link ActionOptionsRequest} are byte-identical to the glyph path. This class only
 * adds the canvas plumbing (CanvasLayer paint + gesture/lifecycle), mirroring
 * {@link CanvasCharacterSheetPanel}.
 *
 * @see packages/g2-app/src/panels/canvas-character-sheet-panel.ts (canvas-layer template)
 * @see packages/g2-app/src/panels/inventory-panel.ts / spellbook-panel.ts (selection logic)
 */

import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';
import { type CharacterSnapshot, CharacterSnapshotSchema } from '@evf/shared-protocol';
import { COMPOSITOR_H, COMPOSITOR_W } from '../engine/canvas-compositor.js';
import type { CanvasLayer, OverlayPanel, R1Gesture } from '../engine/layer-types.js';
import { ZIndex } from '../engine/layer-types.js';
import type { PanelGestureBus } from '../engine/panel-gesture-bus.js';
import type { HudLocale } from '../status-hud/i18n-budgets.js';
import { ensureVt323Loaded } from '../status-hud/vt323-font-loader.js';
import type { ActionOptionsRequest } from './action-options-modal.js';

/** Content rows per panel (rows 4-21, below the header — matches the glyph panels). */
const ROW_COUNT = 18;

/** Canvas 2D context union. */
type Ctx = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

/** WS event bus shape (subset of boot-engine-core's bus). */
interface WsEventBusLike {
  subscribe(channel: string, fn: (payload: unknown) => void): () => void;
}

/** The WS delta channel carrying `CharacterSnapshot`. */
const CHARACTER_DELTA_CHANNEL = 'character.delta';

const CHROME_BG = '#000000';
const CHROME_FG = '#ffffff';
const CHROME_INSET = 4;
const CANVAS_LINE_H = 27;

/**
 * Abstract canvas interactive list panel. Subclasses provide the panel id, header
 * title, and the paired render/resolve hooks.
 */
export abstract class CanvasSelectableListPanel implements CanvasLayer, OverlayPanel {
  /** Stable panel id (matches the subclass `static meta.id`). */
  public abstract readonly id: string;

  /** Z-index slot — z=2 overlay. */
  public readonly z = ZIndex.Z2_OVERLAY;

  /** Uppercase header label drawn at the top of the panel. */
  protected abstract headerTitle(locale: HudLocale): string;

  /**
   * Render the windowed content rows for `cursor` (the clamped scroll offset =
   * first visible row). MUST be the same renderer the row→entry map is built from,
   * and SHOULD include the cursor marker (the standalone renderers do).
   */
  protected abstract renderRows(
    snapshot: CharacterSnapshot | null,
    locale: HudLocale,
    cursor: number,
  ): string[];

  /**
   * Resolve the {@link ActionOptionsRequest} for the entry under `cursor`, or null
   * when there is no actionable entry (empty snapshot / cursor on a header).
   */
  protected abstract resolveRequest(
    snapshot: CharacterSnapshot,
    locale: HudLocale,
    cursor: number,
  ): ActionOptionsRequest | null;

  // ── State ──────────────────────────────────────────────────────────────────
  protected _ctx: Ctx | null = null;
  protected _snapshot: CharacterSnapshot | null = null;
  protected _cursor = 0;
  protected _dirty = true;
  protected _fontFamily = '16px monospace';
  private _initPromise: Promise<void> | null = null;
  private _unsubscribeGesture: (() => void) | null = null;
  private _unsubscribeCharacter: (() => void) | null = null;
  private _wsEventBus: WsEventBusLike | null = null;
  private _actionOptionsHandler: ((req: ActionOptionsRequest) => void) | null = null;

  constructor(
    protected readonly _bridge: EvenAppBridge,
    protected readonly _gestureBus: PanelGestureBus,
    protected readonly _locale: HudLocale,
  ) {}

  // ── Dependency injection (boot-engine setPanelInstanceHandler) ──────────────

  /** Inject the WS bus (subscribed in onMount for character.delta). */
  setWsEventBus(bus: WsEventBusLike): void {
    this._wsEventBus = bus;
  }

  /** Inject the tap→Action-Options dispatch handler (same as the glyph panels). */
  setActionOptionsHandler(handler: ((req: ActionOptionsRequest) => void) | null): void {
    this._actionOptionsHandler = handler;
  }

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
    this._initPromise = ensureVt323Loaded().then((f) => {
      this._fontFamily = f;
    });
    await this._initPromise;
    this._dirty = true;
  }

  paint(): void {
    const ctx = this._ctx;
    if (ctx === null) return;
    ctx.clearRect(0, 0, COMPOSITOR_W, COMPOSITOR_H);
    _drawListChrome(ctx, this.headerTitle(this._locale), this._fontFamily);
    // Content rows (windowed at the cursor; standalone renderer marks the cursor row).
    const rows = this.renderRows(this._snapshot, this._locale, this._cursor);
    ctx.fillStyle = CHROME_FG;
    ctx.font = this._fontFamily;
    let lineY = 30 + CANVAS_LINE_H;
    for (const row of rows) {
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
    /* no GPU resources held; subscriptions released in onUnmount */
  }

  // ── OverlayPanel ────────────────────────────────────────────────────────────

  async onMount(): Promise<void> {
    this._cursor = 0;
    if (this._unsubscribeGesture !== null) {
      this._unsubscribeGesture();
      this._unsubscribeGesture = null;
    }
    this._unsubscribeGesture = this._gestureBus.subscribe((g) => this.onEvent(g));
    if (this._wsEventBus !== null) {
      this._unsubscribeCharacter = this._wsEventBus.subscribe(CHARACTER_DELTA_CHANNEL, (raw) =>
        this.onSnapshot(raw),
      );
    }
    this._dirty = true;
  }

  async onUnmount(): Promise<void> {
    if (this._unsubscribeGesture !== null) {
      this._unsubscribeGesture();
      this._unsubscribeGesture = null;
    }
    if (this._unsubscribeCharacter !== null) {
      this._unsubscribeCharacter();
      this._unsubscribeCharacter = null;
    }
  }

  /**
   * Gesture dispatch (ADR-0012, mirrors the glyph panels):
   *   - `scroll` → move the cursor (clamped at 0; over-scroll-up at 0 opens the menu)
   *   - `tap`    → activate the cursor entry via the Action Options handler
   *   - `double-tap` → no-op (nav-panel-close-dispatcher pops the overlay)
   */
  onEvent(gesture: R1Gesture): void {
    switch (gesture.kind) {
      case 'scroll':
        this._cursor =
          gesture.direction === 'down' ? this._cursor + 1 : Math.max(0, this._cursor - 1);
        this._dirty = true;
        break;
      case 'tap': {
        if (this._actionOptionsHandler === null || this._snapshot === null) return;
        const clamped = Math.max(0, this._cursor);
        const req = this.resolveRequest(this._snapshot, this._locale, clamped);
        if (req === null) {
          console.warn(`[EVF] ${this.id}: tap with no actionable entry under cursor — no-op`);
          return;
        }
        this._actionOptionsHandler(req);
        break;
      }
      case 'double-tap':
        // Router-level nav-panel-close-dispatcher pops the overlay.
        break;
    }
  }

  /** ADR-0012 D-2: over-scroll at the top opens the Quick Action menu. */
  isAtTopBoundary(): boolean {
    return this._cursor === 0;
  }

  /** Receive a raw WS payload; validate (T-20-01) then cache + redraw. */
  onSnapshot(raw: unknown): void {
    const parsed = CharacterSnapshotSchema.safeParse(raw);
    if (!parsed.success) {
      console.warn(`[EVF] ${this.id}: malformed character.delta — ignoring.`);
      return;
    }
    this._snapshot = parsed.data;
    this._dirty = true;
  }

  /** Clamp ceiling helper for subclasses (rows visible window). */
  protected static clampCursor(cursor: number, rowMapLength: number): number {
    return Math.max(0, Math.min(cursor, Math.max(0, rowMapLength - (ROW_COUNT - 1))));
  }
}

/**
 * Draw the shared D&D-style chrome (double frame + header bar) for a list panel.
 * Exported for unit testing.
 */
export function _drawListChrome(ctx: Ctx, title: string, fontFamily: string): void {
  const W = COMPOSITOR_W;
  const H = COMPOSITOR_H;
  ctx.fillStyle = CHROME_BG;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = CHROME_FG;
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
  ctx.strokeRect(
    CHROME_INSET + 0.5,
    CHROME_INSET + 0.5,
    W - 1 - 2 * CHROME_INSET,
    H - 1 - 2 * CHROME_INSET,
  );
  ctx.fillStyle = CHROME_FG;
  ctx.fillRect(CHROME_INSET, 27, W - 2 * CHROME_INSET, 1);
  ctx.font = fontFamily;
  ctx.fillText(title, 8, 24);
}
