/**
 * ShowcaseHudLayer — self-contained PRODUCTION raster HUD layer (renderMode='showcase').
 *
 * OWNS a 400×200 canvas + its own throttled push loop. Unlike a `CanvasLayer`, it is
 * NOT driven by the `CanvasCompositor` / `LayerManager` push path — it renders the
 * ENTIRE glanceable HUD (frame + header + framed map + status card + footer, via
 * {@link ./showcase-hud-renderer.ts}#drawShowcaseHud), dithers it, and pushes the
 * 4 × 200×100 tiles (ids 0-3) itself via serial `bridge.updateImageRawData`.
 *
 * Responsibilities:
 *   1. Subscribe to `character.delta` (via injected `wsEvents`, `safeParse`,
 *      last-value replay) and cache the most-recent valid `CharacterSnapshot`.
 *   2. Hold the latest Foundry map frame via {@link setFrame} (`MapFrameSink` shape,
 *      wired from `scene-input.ts` in showcase mode); the `paintMap` callback scales
 *      the stored frame into the framed map region (or fills it with the bg colour
 *      when no frame has arrived yet).
 *   3. `requestCycle()` (external kick) + an internal trailing-edge throttle
 *      (min redraw ~100 ms). On fire: draw → `getImageData` → per-tile SOURCE-quadrant
 *      xxhash gate (`extractQuadrant` → hash → `encodeQuadrant` ONLY for changed
 *      quadrants, so unchanged tiles skip the dither + PNG encode entirely, not just
 *      the push) → serial push (CM-01 — never concurrent). First frame pushes all 4;
 *      an idle cycle encodes + pushes 0. Fail-soft: never throws; a push rejection
 *      logs `console.warn` and continues.
 *   4. `start()`/`stop()` idempotent; `destroy()` releases the timer + subscription.
 *
 * # happy-dom guard
 *
 * The 400×200 canvas' 2D context is `null` in happy-dom (test env). When the region
 * cannot be rendered (no ctx / no `renderRegion`), the push loop is a clean no-op —
 * mirrors `MapCanvasLayer` / `CanvasStatusHudLayer`. Unit tests inject `renderRegion`
 * to exercise the encode + xxhash-skip + push path without a real canvas.
 *
 * @see packages/g2-app/src/hud/showcase-hud-renderer.ts (drawShowcaseHud + model)
 * @see packages/g2-app/src/hud/showcase-raster.ts (extractQuadrant + encodeQuadrant + REGION_W/H)
 * @see packages/g2-app/src/status-hud/status-hud-layer.ts (character.delta subscribe pattern)
 * @see packages/g2-app/src/hud/map-canvas-layer.ts (setFrame + lazy ImageData guard)
 * @see packages/g2-app/src/engine/hud-delta-driver.ts (trailing-edge throttle + xxhash skip)
 * @see packages/g2-app/src/hud/push-hud-tiles.ts (CM-01 serial push contract)
 */

import {
  type DeviceStatus,
  type EvenAppBridge,
  ImageRawDataUpdate,
  ImageRawDataUpdateResult,
} from '@evenrealities/even_hub_sdk';
import {
  type CharacterSnapshot,
  CharacterSnapshotSchema,
  COMBAT_STATE_DELTA_TYPE,
  COMBAT_TURN_DELTA_TYPE,
  CombatSnapshotSchema,
} from '@evf/shared-protocol';
import type { XXHashAPI } from 'xxhash-wasm';
import xxhash from 'xxhash-wasm';
import type { Layer } from '../engine/layer-types.js';
import { drawShowcaseHud, type ShowcaseHudModel } from './showcase-hud-renderer.js';
import {
  encodeQuadrant,
  extractQuadrant,
  QUADRANT_BYTES,
  type RasterTile,
  REGION_H,
  REGION_W,
} from './showcase-raster.js';

/** Number of image tiles the 400×200 HUD region splits into (2×2, ids 0-3). */
const TILE_COUNT = 4;

/** Default trailing-edge throttle interval (ms) — mirrors HudDeltaDriver D-24.1. */
const DEFAULT_MIN_REDRAW_INTERVAL_MS = 100;

/** The WS delta channel carrying validated `CharacterSnapshot` payloads. */
const CHARACTER_DELTA_CHANNEL = 'character.delta';

/**
 * The bridge surface this layer uses: `updateImageRawData` (tile push) plus an OPTIONAL
 * `onDeviceStatusChanged` (R1 battery). The latter is `Partial` because some hosts (tests,
 * older polyfills) omit it — the layer subscribes fail-soft and leaves battery `null`.
 */
type ShowcaseBridge = Pick<EvenAppBridge, 'updateImageRawData'> &
  Partial<Pick<EvenAppBridge, 'onDeviceStatusChanged'>>;

/** Bg colour used to fill the map region before the first frame arrives. */
const MAP_BG = '#050a05';

/**
 * Overlay-source dimensions — the master `CanvasCompositor` size (576×288). MUST
 * equal `COMPOSITOR_W`/`COMPOSITOR_H` in `engine/canvas-compositor.ts`. The shared
 * compositor paints every z=2 `OverlayPanel` at this native size; the layer scales
 * that composite down to the 400×200 raster region — a uniform 0.6944× (both are 2:1,
 * so no distortion), reusing every panel + its gesture/selection state machine.
 */
const OVERLAY_SRC_W = 576;
const OVERLAY_SRC_H = 288;

/**
 * Minimal `wsEvents` shape the layer depends on (same contract as StatusHudLayer).
 * `subscribe` must return an unsubscribe closure the layer calls in `destroy()`.
 */
export interface ShowcaseWsEvents {
  subscribe(channel: string, fn: (raw: unknown) => void): () => void;
}

/**
 * Injectable region renderer seam — produces the 400×200 RGBA for one frame.
 *
 * Returns `null` when the region cannot be rendered (no canvas 2D context). The
 * default implementation draws {@link drawShowcaseHud} onto the layer's own canvas
 * and reads it back via `getImageData`. Unit tests inject a synthetic producer so
 * the encode + xxhash-skip + push path runs without a real canvas (happy-dom).
 */
export type ShowcaseRegionRenderer = (model: ShowcaseHudModel) => Uint8ClampedArray | null;

/**
 * Overlay source seam (Feature 002 z=2 overlays) — returns the 576×288 RGBA composite
 * of the active z=2 overlay stack, or `null` when no overlay is mounted (render the
 * base map+status HUD).
 *
 * Wired in showcase boot to
 * `() => layerManager.getLayer(Z2_OVERLAY) !== undefined ? compositor.composite() : null`,
 * so EVERY overlay open path (Quick-Action menu, character sheet, combat, spellbook,
 * inventory, target-picker, modals) flows through the ONE shared `CanvasCompositor`
 * with zero per-panel code.
 */
export type ShowcaseOverlaySource = () => Uint8ClampedArray | null;

/**
 * Overlay downscaler seam — scales a 576×288 overlay composite down to the 400×200 HUD
 * region RGBA. Returns `null` when no canvas 2D context is available (happy-dom); unit
 * tests inject a synthetic downscaler to exercise the encode + xxhash-skip + push path.
 */
export type ShowcaseOverlayDownscaler = (rgba576: Uint8ClampedArray) => Uint8ClampedArray | null;

/**
 * Per-tile encode seam — dither + UPNG-encode ONE contiguous 200×100 source quadrant
 * into a {@link RasterTile}. Defaults to {@link encodeQuadrant}; the delta gate calls
 * it ONLY for tiles whose source-quadrant hash changed (unchanged tiles are never
 * encoded). Tests inject a spy to assert the zero-encode-on-idle invariant.
 */
export type ShowcaseTileEncoder = (quad: Uint8ClampedArray, id: number) => RasterTile;

/** Constructor options for {@link ShowcaseHudLayer}. */
export interface ShowcaseHudLayerOpts {
  /** Resolved bridge singleton — `updateImageRawData` (tiles) + optional `onDeviceStatusChanged` (battery). */
  readonly bridge: ShowcaseBridge;
  /** WS event bus for `character.delta` (last-value replay on subscribe). */
  readonly wsEvents: ShowcaseWsEvents;
  /** Override the 100 ms trailing-edge throttle interval (rarely needed). */
  readonly minRedrawIntervalMs?: number;
  /**
   * Override the region renderer (tests inject a synthetic RGBA producer). When
   * omitted, the layer draws onto its own 400×200 canvas — a no-op when the 2D
   * context is unavailable (happy-dom).
   */
  readonly renderRegion?: ShowcaseRegionRenderer;
  /**
   * Override the overlay downscaler (tests inject a synthetic 576→400 scaler). When
   * omitted, the layer scales the overlay composite via its own canvas — a clean
   * no-op when no 2D context exists (happy-dom).
   */
  readonly overlayDownscale?: ShowcaseOverlayDownscaler;
  /**
   * Override the per-tile encoder (tests inject a spy to assert unchanged tiles are
   * never encoded). When omitted, {@link encodeQuadrant} dithers + UPNG-encodes each
   * changed quadrant.
   */
  readonly encodeTile?: ShowcaseTileEncoder;
  /** Initial scene / header name (default `''`). */
  readonly sceneName?: string;
}

/**
 * Self-contained showcase raster HUD layer — the PRODUCTION default substrate.
 *
 * Construct once per boot (showcase mode), mount it into the LayerManager (so the
 * page rebuild selects `buildShowcasePageSchema()`), then `start()` its driver.
 */
export class ShowcaseHudLayer implements Layer {
  /** Stable id used by LayerManager + telemetry. */
  public readonly id = 'showcase-hud';

  private readonly bridge: ShowcaseBridge;
  private readonly wsEvents: ShowcaseWsEvents;
  private readonly minRedrawIntervalMs: number;
  private readonly renderRegion: ShowcaseRegionRenderer;
  /** Per-tile encoder (dither + UPNG). Called only for changed quadrants. */
  private readonly _encodeTile: ShowcaseTileEncoder;

  /**
   * Reusable 200×100 RGBA scratch quadrant — {@link extractQuadrant} rewrites it per
   * tile each cycle so the delta gate (hash + conditional encode) allocates nothing
   * in the hot path. Rewritten before it is read, and never retained across the
   * `await` push, so a single shared buffer is safe under the single-cycle invariant.
   */
  private readonly _quadScratch = new Uint8ClampedArray(QUADRANT_BYTES);
  /** Stable `Uint8Array` view over {@link _quadScratch} for `h32Raw` (allocated once). */
  private readonly _quadHashView = new Uint8Array(this._quadScratch.buffer);

  /** The layer's own 400×200 canvas 2D context — null in happy-dom / no-canvas hosts. */
  private readonly _ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;

  /** Reusable scratch canvas ctx for scaling the map frame into the region rect. */
  private _scratchCtx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null = null;

  /** Overlay source (set in showcase boot); `null` → render the base map+status HUD. */
  private _overlaySource: ShowcaseOverlaySource | null = null;
  /** Injected or canvas-derived 576→400 downscaler for the overlay composite. */
  private readonly _overlayDownscale: ShowcaseOverlayDownscaler;
  /** Reusable 576×288 scratch ctx holding the overlay composite before the scale-draw. */
  private _overlaySrcCtx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null =
    null;
  /** Whether the LAST cycle rendered an overlay — a transition forces a full 4-tile push. */
  private _prevOverlayActive = false;

  /** Latest valid snapshot (`null` until the first valid `character.delta`). */
  private snapshot: CharacterSnapshot | null = null;

  /** Latest Foundry map frame bytes + dims, or `null` before the first frame. */
  private _frame: { rgba: Uint8ClampedArray; w: number; h: number } | null = null;

  /** Header scene name (cosmetic; set via {@link setScene}). */
  private sceneName: string;
  /** Combat round — driven by the `combat.turn`/`combat.state` subscription. */
  private round = 0;
  /** Current turn index within the round (0-indexed; displayed as `turn+1`). */
  private turn = 0;
  /** Number of combatants in the initiative order (turn denominator). */
  private turnMax = 0;
  /** R1 ring battery percent, or `null` until the first device-status update. */
  private battery: number | null = null;

  /**
   * Per-tile xxhash of the last-encoded SOURCE quadrant (pre-dither RGBA); `null` =
   * never pushed (push all). Hashing the source pixels — not the encoded PNG — lets
   * the cycle skip the dither + `UPNG.encode` for unchanged tiles entirely (mirrors
   * `engine/hud-delta-driver.ts` `_prevSourceHashes`). Determinism holds: identical
   * source quadrant → identical dither → identical PNG → no push.
   */
  private readonly _prevTileHashes: Array<number | null> = new Array(TILE_COUNT).fill(null);

  /** xxhash WASM API — lazily initialised on the first cycle. */
  private _xxhash: XXHashAPI | null = null;

  /** Pending throttle timer handle (null when idle). */
  private _timer: ReturnType<typeof setTimeout> | null = null;
  /** Trailing-edge re-arm flag (coalesces events during a busy window). */
  private _pendingAgain = false;
  /** In-flight cycle guard (single-cycle invariant). */
  private _cycleInFlight = false;
  /** Whether `start()` has run (requestCycle is a no-op until started). */
  private _started = false;

  /** Unsubscribe closure for the `character.delta` subscription. */
  private readonly _unsubscribe: () => void;

  /** Unsubscribe closures for the `combat.turn` + `combat.state` subscriptions. */
  private readonly _combatUnsubscribes: Array<() => void> = [];

  /** Unsubscribe closure for `onDeviceStatusChanged` (battery), or `null` when unavailable. */
  private _deviceStatusUnsub: (() => void) | null = null;

  constructor(opts: ShowcaseHudLayerOpts) {
    this.bridge = opts.bridge;
    this.wsEvents = opts.wsEvents;
    this.minRedrawIntervalMs = opts.minRedrawIntervalMs ?? DEFAULT_MIN_REDRAW_INTERVAL_MS;
    this.sceneName = opts.sceneName ?? '';
    this._ctx = ShowcaseHudLayer._acquireCtx();
    this.renderRegion = opts.renderRegion ?? ((model) => this._renderRegionViaCanvas(model));
    this._overlayDownscale = opts.overlayDownscale ?? ((rgba) => this._downscaleViaCanvas(rgba));
    this._encodeTile = opts.encodeTile ?? encodeQuadrant;

    // Subscribe immediately so last-value replay caches any snapshot delivered
    // during boot (before start()). Released in destroy().
    this._unsubscribe = this.wsEvents.subscribe(CHARACTER_DELTA_CHANNEL, (raw) =>
      this._onDelta(raw),
    );

    // Combat round/turn — subscribe to BOTH combat channels in the CONSTRUCTOR (not
    // start()) so the wsEventBus last-value replay delivers any combat snapshot pushed
    // during boot, exactly like character.delta. Both channels carry a `CombatSnapshot`
    // and share `_onCombatDelta`. Released in destroy().
    this._combatUnsubscribes.push(
      this.wsEvents.subscribe(COMBAT_TURN_DELTA_TYPE, (raw) => this._onCombatDelta(raw)),
      this.wsEvents.subscribe(COMBAT_STATE_DELTA_TYPE, (raw) => this._onCombatDelta(raw)),
    );

    // R1 battery — subscribe to device status. Fail-soft: `onDeviceStatusChanged` may be
    // absent (older polyfills / test bridges) or throw; on any failure battery stays
    // `null` (renders `⌁—`) rather than crashing the layer.
    try {
      this._deviceStatusUnsub =
        this.bridge.onDeviceStatusChanged?.((status: DeviceStatus) => {
          this.battery = typeof status.batteryLevel === 'number' ? status.batteryLevel : null;
          this.requestCycle();
        }) ?? null;
    } catch (err) {
      console.warn(
        '[EVF] showcase-hud-layer: onDeviceStatusChanged unavailable — battery stays unknown.',
        err,
      );
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  /**
   * Store a new Foundry map frame (`MapFrameSink` shape — scene-input.ts wires this
   * in showcase mode) and kick a throttled redraw.
   *
   * @param rgba RGBA pixel bytes (length = `w * h * 4`), pre-validated by scene-input.
   * @param w    Frame width.
   * @param h    Frame height.
   */
  setFrame(rgba: Uint8ClampedArray, w: number, h: number): void {
    this._frame = { rgba, w, h };
    this.requestCycle();
  }

  /**
   * Set (or clear) the z=2 overlay source (Feature 002 overlays).
   *
   * When set AND it reports an active overlay (returns a non-null 576×288 composite),
   * the render path downscales that composite to the 400×200 region and pushes it
   * INSTEAD of the base HUD — reusing every `CanvasCompositor`-composited `OverlayPanel`
   * (menu, sheet, combat, spellbook, inventory, target-picker, modals) with zero
   * per-panel code. Pass `null` to detach. Kicks a throttled redraw so a late wire
   * still repaints.
   */
  setOverlaySource(source: ShowcaseOverlaySource | null): void {
    this._overlaySource = source;
    this.requestCycle();
  }

  /** Update the header scene name and schedule a redraw. */
  setScene(name: string): void {
    this.sceneName = name;
    this.requestCycle();
  }

  /**
   * Manually override the combat round/turn and schedule a redraw.
   *
   * Production combat data flows in via the `combat.turn`/`combat.state` subscription
   * ({@link _onCombatDelta}); this setter remains for the dev preview harness and tests.
   */
  setCombat(combat: { round: number; turn: number; turnMax: number }): void {
    this.round = combat.round;
    this.turn = combat.turn;
    this.turnMax = combat.turnMax;
    this.requestCycle();
  }

  /**
   * Manually override the R1 ring battery and schedule a redraw.
   *
   * Production battery flows in via `onDeviceStatusChanged`; this setter remains for the
   * dev preview harness and tests. Pass `null` to render the unknown-battery `⌁—`.
   */
  setBattery(percent: number | null): void {
    this.battery = percent;
    this.requestCycle();
  }

  /**
   * Start the driver and push the first frame.
   *
   * Idempotent: a second `start()` while already running is a no-op. Kicks an
   * immediate cycle so all 4 tiles reach the glasses right after the page rebuild.
   */
  start(): void {
    if (this._started) return;
    this._started = true;
    this.requestCycle();
  }

  /**
   * Stop the driver: cancel any pending timer, clear the trailing-edge flag, and
   * mark not-started (so `requestCycle()` becomes a no-op). Idempotent.
   */
  stop(): void {
    this._started = false;
    this._pendingAgain = false;
    if (this._timer !== null) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }

  /**
   * Request a throttled redraw. No-op until {@link start} has run so boot code can
   * call it unconditionally (alongside the delta driver) in every render mode.
   */
  requestCycle(): void {
    if (!this._started) return;
    this._schedule();
  }

  /**
   * Layer interface `draw()` — force one immediate render cycle (bypasses the
   * throttle). Safe to call repeatedly: the per-tile xxhash skip means an identical
   * render pushes zero tiles.
   */
  async draw(): Promise<void> {
    await this._runCycle();
  }

  /**
   * Capture-container provider (INV-5): returns the shared raster-capture invariant
   * token `'hud-capture'`.
   *
   * NOTE: this is the LOGICAL invariant token (`LayerManager.getCaptureContainerCount`
   * counts unique names), NOT the showcase page's schema container name — the actual
   * event-capture container in `buildShowcasePageSchema()` is `'showcase-capture'`
   * (400×200 centred, `isEventCapture:1`). Canvas `OverlayPanel`s hardcode
   * `'hud-capture'`; composited over the showcase HUD (Feature 002 z=2 overlays) they
   * must agree on ONE token so `_assertCaptureInvariant` still counts exactly 1. Both
   * canvas and showcase are full-region raster-capture pages, so they share the token.
   */
  getCaptureContainer(): string {
    return 'hud-capture';
  }

  /**
   * Container footprint: `{image:0, text:0}` — the showcase page schema is declared
   * once at page creation (`buildShowcasePageSchema`); this layer pushes to the
   * pre-declared tiles via `updateImageRawData`, it does not allocate SDK containers
   * toward the per-layer budget.
   */
  getContainerCount(): { image: number; text: number } {
    return { image: 0, text: 0 };
  }

  /**
   * Tear down: stop the driver + release every subscription (character.delta,
   * combat.turn/combat.state, device status). Idempotent + fail-soft: a throwing
   * device-status unsub is caught so the rest still release.
   */
  destroy(): void {
    this.stop();
    this._unsubscribe();
    for (const unsub of this._combatUnsubscribes) unsub();
    this._combatUnsubscribes.length = 0;
    if (this._deviceStatusUnsub !== null) {
      try {
        this._deviceStatusUnsub();
      } catch (err) {
        console.warn('[EVF] showcase-hud-layer: device-status unsubscribe threw:', err);
      }
      this._deviceStatusUnsub = null;
    }
  }

  // ── Internal — subscription ─────────────────────────────────────────────────────

  /**
   * Receive a raw `character.delta` payload; validate via `safeParse` (never
   * `.parse` — T-4a-04-01), cache on success, and schedule a redraw. Malformed
   * payloads log a `console.warn` and are ignored (no throw).
   */
  private _onDelta(raw: unknown): void {
    const parsed = CharacterSnapshotSchema.safeParse(raw);
    if (!parsed.success) {
      console.warn(
        '[EVF] showcase-hud-layer: malformed character.delta payload — ignoring.',
        parsed.error.message,
      );
      return;
    }
    this.snapshot = parsed.data;
    this.requestCycle();
  }

  /**
   * Receive a raw `combat.turn` / `combat.state` payload; validate via `safeParse`
   * (never `.parse`), update round/turn/turnMax on success, and schedule a redraw.
   * Malformed payloads log a `console.warn` and are ignored (no throw). `turn` is kept
   * 0-indexed here; the renderer displays it as `turn+1`.
   */
  private _onCombatDelta(raw: unknown): void {
    const parsed = CombatSnapshotSchema.safeParse(raw);
    if (!parsed.success) {
      console.warn(
        '[EVF] showcase-hud-layer: malformed combat delta payload — ignoring.',
        parsed.error.message,
      );
      return;
    }
    const snap = parsed.data;
    this.round = snap.round;
    this.turn = snap.turn;
    this.turnMax = snap.combatants.length;
    this.requestCycle();
  }

  // ── Internal — throttled render loop (trailing-edge, HudDeltaDriver semantics) ───

  private _schedule(): void {
    if (this._timer !== null || this._cycleInFlight) {
      this._pendingAgain = true;
      return;
    }
    this._timer = setTimeout(() => {
      this._fireCycle();
    }, this.minRedrawIntervalMs);
  }

  private _fireCycle(): void {
    this._timer = null;
    const fireStart = Date.now();
    this._cycleInFlight = true;
    this._runCycle()
      .catch((err: unknown) => {
        console.warn('[EVF] showcase-hud-layer: render cycle error:', err);
      })
      .finally(() => {
        this._cycleInFlight = false;
        // Do not re-arm after stop() (stop() clears _pendingAgain).
        if (this._pendingAgain && this._started) {
          this._pendingAgain = false;
          const remaining = Math.max(0, this.minRedrawIntervalMs - (Date.now() - fireStart));
          this._timer = setTimeout(() => {
            this._fireCycle();
          }, remaining);
        }
      });
  }

  /**
   * Render the 400×200 HUD, encode the 4 tiles, and push only the changed ones.
   *
   * Fail-soft: never throws. Returns early (no push) when the region cannot be
   * rendered (no canvas 2D context in happy-dom / no-canvas hosts).
   */
  private async _runCycle(): Promise<void> {
    // Overlay branch (Feature 002 z=2 panels): when a z=2 OverlayPanel is mounted the
    // overlay source returns the 576×288 CanvasCompositor buffer; downscale it to the
    // 400×200 region and push THAT. Otherwise render the base map+status HUD.
    const overlay576 = this._overlaySource?.() ?? null;
    const overlayActive = overlay576 !== null;
    // Overlay↔base transitions re-declare the page (each panel open/close bundle issues
    // a rebuildPageContainer that resets the host tiles), so force all 4 tiles on the
    // switch — otherwise a stale hash match would leave a blank/ghost tile
    // (menu-box-over-map / rebuild-blank-tile gotcha).
    if (overlayActive !== this._prevOverlayActive) {
      this._prevTileHashes.fill(null);
      this._prevOverlayActive = overlayActive;
    }

    let rgba: Uint8ClampedArray | null;
    if (overlay576 !== null) {
      rgba = this._overlayDownscale(overlay576);
    } else {
      const model: ShowcaseHudModel = {
        sceneName: this.sceneName,
        round: this.round,
        turn: this.turn,
        turnMax: this.turnMax,
        battery: this.battery,
        snapshot: this.snapshot,
        paintMap: (c, x, y, w, h) => this._paintMap(c, x, y, w, h),
      };
      rgba = this.renderRegion(model);
    }
    if (rgba === null) return; // no canvas 2D context — clean no-op (happy-dom)

    if (this._xxhash === null) {
      this._xxhash = await xxhash();
    }
    const hasher = this._xxhash;

    // Delta gate on the SOURCE quadrant (pre-dither), NOT the encoded PNG: extract +
    // hash each 200×100 quadrant first and dither + `UPNG.encode` ONLY the tiles whose
    // source pixels changed. An idle cycle therefore pays extraction + hashing (cheap)
    // but zero encode (the per-cycle expense) — mirrors hud-delta-driver.ts.
    for (let i = 0; i < TILE_COUNT; i++) {
      extractQuadrant(rgba, i, this._quadScratch);
      const h = hasher.h32Raw(this._quadHashView);
      // First frame: _prevTileHashes[i] === null → encode + push. Unchanged → skip
      // both the encode AND the push.
      if (this._prevTileHashes[i] === h) continue;
      this._prevTileHashes[i] = h;
      // The scratch quadrant is read synchronously by the encoder (fresh PNG bytes
      // returned) before the await below, so reusing it next iteration is safe.
      const pngBytes = this._encodeTile(this._quadScratch, i).pngBytes;
      // CM-01: serial push — the SDK rejects concurrent updateImageRawData on the
      // same container. Fail-soft: a non-success result logs + continues.
      try {
        const result = await this.bridge.updateImageRawData(
          new ImageRawDataUpdate({
            containerID: i,
            containerName: `showcase-tile-${i}`,
            imageData: pngBytes,
          }),
        );
        if (!ImageRawDataUpdateResult.isSuccess(result)) {
          console.warn(
            `[EVF] showcase-hud-layer: updateImageRawData non-success for showcase-tile-${i}:`,
            result,
          );
        }
      } catch (err) {
        console.warn(`[EVF] showcase-hud-layer: push failed for showcase-tile-${i}:`, err);
      }
    }
  }

  // ── Internal — map painting ─────────────────────────────────────────────────────

  /**
   * Paint the stored map frame scaled into the framed region rect, or fill the rect
   * with the bg colour when no frame has arrived yet. Never throws: any missing
   * browser API (ImageData / OffscreenCanvas) falls back to the bg fill.
   */
  private _paintMap(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
  ): void {
    const frame = this._frame;
    if (frame === null || typeof ImageData === 'undefined') {
      ctx.fillStyle = MAP_BG;
      ctx.fillRect(x, y, w, h);
      return;
    }
    const scratch = this._acquireScratchCtx(frame.w, frame.h);
    if (scratch === null) {
      ctx.fillStyle = MAP_BG;
      ctx.fillRect(x, y, w, h);
      return;
    }
    scratch.putImageData(new ImageData(frame.rgba, frame.w, frame.h), 0, 0);
    // drawImage scales the native-resolution frame into the region rect.
    ctx.drawImage(
      scratch.canvas as unknown as CanvasImageSource,
      0,
      0,
      frame.w,
      frame.h,
      x,
      y,
      w,
      h,
    );
  }

  /**
   * Lazily create (or resize) the scratch canvas used to scale the map frame.
   * Returns `null` when no canvas 2D context is available (happy-dom).
   */
  private _acquireScratchCtx(
    w: number,
    h: number,
  ): OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null {
    const existing = this._scratchCtx;
    if (existing !== null && existing.canvas.width === w && existing.canvas.height === h) {
      return existing;
    }
    const canvas = ShowcaseHudLayer._createCanvas(w, h);
    if (canvas === null) return null;
    const ctx = canvas.getContext('2d') as
      | OffscreenCanvasRenderingContext2D
      | CanvasRenderingContext2D
      | null;
    this._scratchCtx = ctx;
    return ctx;
  }

  // ── Internal — overlay downscale (576×288 → 400×200) ─────────────────────────────

  /**
   * Downscale a 576×288 overlay composite to the 400×200 region via the layer's own
   * canvas. Returns `null` when no 2D context is available (happy-dom / no-canvas).
   *
   * Uses an intermediate 576×288 scratch canvas to hold the source `ImageData`, then
   * scale-draws it onto the 400×200 destination canvas and reads it back. Uniform
   * 0.6944× (both are 2:1) — no distortion.
   */
  private _downscaleViaCanvas(rgba576: Uint8ClampedArray): Uint8ClampedArray | null {
    const dest = this._ctx;
    if (
      dest === null ||
      typeof dest.getImageData !== 'function' ||
      typeof ImageData === 'undefined'
    ) {
      return null;
    }
    const src = this._acquireOverlaySrcCtx(OVERLAY_SRC_W, OVERLAY_SRC_H);
    if (src === null) return null;
    src.putImageData(new ImageData(rgba576, OVERLAY_SRC_W, OVERLAY_SRC_H), 0, 0);
    dest.drawImage(
      src.canvas as unknown as CanvasImageSource,
      0,
      0,
      OVERLAY_SRC_W,
      OVERLAY_SRC_H,
      0,
      0,
      REGION_W,
      REGION_H,
    );
    return dest.getImageData(0, 0, REGION_W, REGION_H).data;
  }

  /**
   * Lazily create (or resize) the 576×288 overlay-source scratch canvas ctx used to
   * hold the composite before the scale-draw. Returns `null` in no-canvas hosts.
   */
  private _acquireOverlaySrcCtx(
    w: number,
    h: number,
  ): OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null {
    const existing = this._overlaySrcCtx;
    if (existing !== null && existing.canvas.width === w && existing.canvas.height === h) {
      return existing;
    }
    const canvas = ShowcaseHudLayer._createCanvas(w, h);
    if (canvas === null) return null;
    const ctx = canvas.getContext('2d') as
      | OffscreenCanvasRenderingContext2D
      | CanvasRenderingContext2D
      | null;
    this._overlaySrcCtx = ctx;
    return ctx;
  }

  // ── Internal — canvas acquisition ───────────────────────────────────────────────

  /** Default region renderer: draw the HUD onto the layer's canvas + read it back. */
  private _renderRegionViaCanvas(model: ShowcaseHudModel): Uint8ClampedArray | null {
    const ctx = this._ctx;
    if (ctx === null || typeof ctx.getImageData !== 'function') return null;
    drawShowcaseHud(ctx, model);
    return ctx.getImageData(0, 0, REGION_W, REGION_H).data;
  }

  /** Acquire the layer's own 400×200 canvas 2D context (null in no-canvas hosts). */
  private static _acquireCtx():
    | OffscreenCanvasRenderingContext2D
    | CanvasRenderingContext2D
    | null {
    const canvas = ShowcaseHudLayer._createCanvas(REGION_W, REGION_H);
    if (canvas === null) return null;
    return canvas.getContext('2d') as
      | OffscreenCanvasRenderingContext2D
      | CanvasRenderingContext2D
      | null;
  }

  /**
   * Create a canvas at `w×h`. Prefers `OffscreenCanvas` (Worker) then
   * `document.createElement('canvas')` (WebView / browser). Returns `null` in
   * environments with neither (some test hosts).
   */
  private static _createCanvas(w: number, h: number): OffscreenCanvas | HTMLCanvasElement | null {
    if (typeof OffscreenCanvas !== 'undefined') {
      return new OffscreenCanvas(w, h);
    }
    if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      return canvas;
    }
    return null;
  }
}
