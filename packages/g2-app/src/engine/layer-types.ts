/**
 * Layer-system type contracts — ZIndex enum, Layer interface, LayerOp tagged union,
 * LayerManagerError class, and the RasterControllerLike type-only forward contract.
 *
 * This module exports ONLY types and a (lightweight) error class — no runtime behavior,
 * no I/O. Plans 02-04 import these contracts; Plan 02 implements LayerManager against
 * them, Plan 03 Task 2 (MapBaseLayer) consumes `RasterControllerLike` via `import type`
 * so it can compile at its own commit boundary without depending on the concrete
 * `RasterController` class that lands in Plan 03 Task 3.
 *
 * No virtual DOM — render target is the EvenAppBridge envelope (D-2.04, CLAUDE.md).
 *
 * @see docs/architecture/0009-layer-manager-contract.md (ADR-0009)
 * @see docs/architecture/0001-layered-ui-model.md (ADR-0001 + Amendment 1)
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04a-CONTEXT.md Area 1
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04A-PLAN-CHECK.md B-4
 */
import type { ServerCap } from '@evf/shared-protocol';

/**
 * Z-index layers for the G2 layered HUD.
 *
 * Values per ADR-0001 + Amendment 1 (z=0.5 Idle Content Infill, Specs §7.4c)
 * and ADR-0009 Amendment 1 (Phase 4b composition rules, z=1.5 toast carve-out):
 * - `Z0_MAP`            — backdrop scene (raster default 4-bit dithered or glyph fallback)
 * - `Z0_5_IDLE_INFILL`  — combat-log strip / label-separator / stats strip, mounted ONLY when z=2 is absent
 * - `Z1_STATUS_HUD`     — always-visible corner card (HP/AC/Speed/Conditions/Concentration)
 * - `Z1_5_TOAST`        — toast queue between Status HUD and overlay slot — survives z=2 overlay open per ADR-0009 Amendment 1
 * - `Z2_OVERLAY`        — modal/overlay slot (sheet, combat tracker, spellbook tabs)
 *
 * Numeric values are load-bearing for ordered iteration and `Map<ZIndex, Layer>` keys.
 * Fractional zindices (`Z0_5_IDLE_INFILL = 0.5`, `Z1_5_TOAST = 1.5`) reserve room
 * for compositional layers without renumbering the integer stratum.
 */
export enum ZIndex {
  Z0_MAP = 0,
  Z0_5_IDLE_INFILL = 0.5,
  Z1_STATUS_HUD = 1,
  Z1_5_TOAST = 1.5,
  Z2_OVERLAY = 2,
}

/**
 * A single layer in the G2 z-stack.
 *
 * Plain TS interface — no class, no inheritance (D-2.04 — no React/Vue/Svelte).
 * Implementations live in `packages/g2-app/src/raster/` (MapBaseLayer, etc.) and
 * `packages/g2-app/src/status-hud/` (StatusHudLayer, IdleInfillLayer).
 */
export interface Layer {
  /** Stable identifier for this layer instance (logging + telemetry). */
  readonly id: string;
  /** Draw/refresh the layer's contents — called by LayerManager on demand. */
  draw(): Promise<void>;
  /** Tear down containers and release subscriptions, timers, workers. */
  destroy(): void;
  /**
   * If this layer provides the page's capture container, return its container name.
   *
   * INV-5 / ADR-0001: exactly ONE mounted layer at a time must return a non-undefined
   * value (the capture-container invariant). LayerManager asserts this on every
   * mount / destroy / bundle and throws `LayerManagerError('capture_invariant_violated')`
   * on violation. Layers that never capture input (e.g., z=1 status HUD, z=0.5 idle infill)
   * omit this method entirely.
   */
  getCaptureContainer?(): string;
  /**
   * Report the layer's container footprint toward the SDK 4-image + 8-text cap.
   *
   * ADR-0009 Amendment 1 Strategy A: each layer self-declares the number of image
   * and text/list containers it occupies so `LayerManager._assertContainerBudget`
   * can sum them at bundle flush time. Omitted method ⇒ default `{ image: 0, text: 1 }`
   * (one text/list slot, no image slots) — matches the most common no-capture
   * layer (StatusHudLayer, IdleInfillLayer in glyph mode).
   *
   * @returns `{ image, text }` counts; both non-negative integers.
   * @see ADR-0009 Amendment 1 (container budget audit table)
   */
  getContainerCount?(): { image: number; text: number };
  /**
   * Optional R1 hint metadata for the status-HUD context chip (Phase 6 Plan 03).
   *
   * Overlay-aware layers (OverlayPanel implementations) may expose hints so the
   * StatusHudRenderer can render a contextual `R1: tap=<tap>  scroll=<scroll>
   * long=quick[<id>]` footer row. Layers that omit this method (z=0 map,
   * z=1 status HUD, z=1.5 toast queue, z=0.5 idle infill) inherit the
   * StatusHudRenderer default:
   * `{ tap: 'cycle', scroll: 'nav', longPressLabel: 'quick' }`.
   *
   * INV-5 visible enforcement (SC-4 per Phase 6 ROADMAP success criteria): the
   * chip names the live long-press target, making the routing invariant auditable
   * at a glance by the player. Plan 06-03 wires the chip; this field is the
   * interface contract that makes it pluggable per overlay type.
   *
   * @see docs/architecture/INVARIANTS.md §5 INV-5 (Gesture Determinism)
   * @see .planning/phases/06-r1-integration-quick-action-inv-5/06-CONTEXT.md §Area 2 (chip design)
   * @see .planning/phases/06-r1-integration-quick-action-inv-5/06-RESEARCH.md Pitfall 5 (separation decision)
   */
  getR1Hints?(): { readonly tap: string; readonly scroll: string; readonly longPressLabel: string };
}

/**
 * R1 ring gesture published by the in-process `PanelGestureBus`.
 *
 * Discriminated on `kind`. The variants stub the four gesture inputs Phase 4b
 * panels need to handle (Plan 05 conc-modal `[Y]`/`[N]` buttons map to `tap` /
 * `double-tap`; future spellbook scroll maps to `scroll`). Phase 6 wires the
 * real R1 source provider that translates SDK `CLICK_EVENT` /
 * `DOUBLE_CLICK_EVENT` / `SCROLL_TOP_EVENT` / `SCROLL_BOTTOM_EVENT` to these
 * literals and publishes them on the bus.
 *
 * Naming: `kind` (not `type`) keeps the discriminator distinct from `LayerOp.type`
 * and from the SDK's own event-shape `type` field — avoids accidental cross-narrowing.
 *
 * @see .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-RESEARCH.md §Q2 (Phase 6 source channel rationale)
 * @see .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04b-CONTEXT.md §Area 2 (Panel API)
 */
// TODO(ADR-0009): Phase 6 long-press source channel — derive from CLICK_EVENT timing
// or use a separate SDK channel (see 04B-RESEARCH §Q2). `kind: 'long-press'` is
// stubbed here for forward-compat so panels can pattern-match Phase 5 already.
export type R1Gesture =
  | { readonly kind: 'tap' }
  | { readonly kind: 'scroll'; readonly direction: 'up' | 'down' }
  | { readonly kind: 'long-press' }
  | { readonly kind: 'double-tap' };

/**
 * Overlay-slot panel contract (Phase 5+ implements verbatim).
 *
 * Extends `Layer` with the three lifecycle hooks LayerManager invokes around
 * the bundle flush (ADR-0009 Amendment 1):
 *   - `onMount()`   — called AFTER `layers.set(z=2, panel)` and BEFORE
 *                     `rebuildPageContainer`; panels acquire bus subscriptions,
 *                     timers, and Foundry data fetches here. Rejection aborts
 *                     the bundle BEFORE the bridge call.
 *   - `onUnmount()` — called BEFORE `destroy()` and the bridge flush; panels
 *                     release bus subscriptions + timers here.
 *   - `onEvent(g)`  — synchronous dispatch from the `PanelGestureBus` (Phase 6
 *                     R1 source feeds it). Panels MUST be re-entrant: a panel
 *                     that mutates state during `onEvent` is responsible for
 *                     scheduling its own re-draw.
 *
 * Subscription lifetime contract (T-4b-01-03): the unsubscribe closure returned
 * by `PanelGestureBus.subscribe` MUST be invoked in `onUnmount` — otherwise the
 * panel leaks. Plan 05 conc-modal test asserts `bus.size() === 0` post-unmount.
 *
 * Phase 5 panels (ConcDropModalPanel, SpellbookPanel, …) implement this interface
 * directly — no abstract base class. `isOverlayPanel(layer)` (overlay-panel.ts)
 * is the runtime guard LayerManager uses to detect panels among ordinary Layers.
 *
 * @see .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04b-CONTEXT.md §Area 2
 * @see .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-RESEARCH.md §Approach 1
 * @see ADR-0009 Amendment 1
 */
export interface OverlayPanel extends Layer {
  /**
   * Acquire panel resources (bus subscriptions, timers, fetched data).
   *
   * Invoked by LayerManager.bundle() AFTER the layer is registered in `layers`
   * and BEFORE the single `rebuildPageContainer` flush. Resolving completes the
   * bundle; rejecting aborts the bundle without calling the bridge — the panel
   * remains in `layers` and the caller is responsible for issuing a `destroy()`
   * to recover (T-4b-01-02 threat-model mitigation).
   */
  onMount(): Promise<void>;
  /**
   * Release panel resources (bus subscriptions, timers).
   *
   * Invoked by LayerManager.bundle() BEFORE `destroy()` and the bridge flush
   * when this panel is the target of a `{ type: 'destroy', z: Z2_OVERLAY }` op.
   */
  onUnmount(): Promise<void>;
  /**
   * Handle a published R1 gesture.
   *
   * Synchronous — return value is ignored. Panels schedule their own re-draws
   * in response (no return-value-driven side effects).
   */
  onEvent(gesture: R1Gesture): void;
}

/**
 * Atomic mount/destroy operation for `LayerManager.bundle()`.
 *
 * Tagged union — discriminated on `type`. The bundle API serializes multiple ops
 * (e.g., `unmount z=0.5 + mount z=2`) into a single `rebuildPageContainer` flush
 * so no intermediate frame is visible with the wrong layer composition (ADR-0001
 * Amendment 1 §11.5.8.6 failure-mode mitigation).
 */
export type LayerOp =
  | {
      readonly type: 'mount';
      readonly z: ZIndex;
      readonly layer: Layer;
      /**
       * Required negotiated server capabilities for this layer.
       *
       * LayerManager refuses the mount if any required cap is absent from the
       * handshake-negotiated `SERVER_CAPS_V1` set, throwing
       * `LayerManagerError('capability_gate_denied')`. Omit / empty array = no
       * capability requirements.
       */
      readonly requiredCaps?: ReadonlyArray<ServerCap>;
    }
  | {
      readonly type: 'destroy';
      readonly z: ZIndex;
    };

/**
 * Discriminator codes for `LayerManagerError`.
 *
 * - `capture_invariant_violated` — 0 or ≥2 mounted layers report a capture container
 *   (INV-5 / ADR-0001). Plan 02 owns the runtime enforcement; this union is the
 *   type-level basis (B-1 partial DISP-02 coverage).
 * - `capability_gate_denied` — a `mount`/`bundle` requested a layer whose
 *   `requiredCaps` are not in the negotiated server capability set.
 * - `z_already_occupied` — mount() called for a z-index already populated without a
 *   prior destroy(); use `bundle()` for atomic swaps instead.
 * - `z_not_mounted` — destroy() called for a z-index with no mounted layer.
 * - `panel_mount_budget_exceeded` — bundle flush would exceed the SDK 4-image /
 *   8-text container cap (`containerTotalNum: 1~12` per `@evenrealities/even_hub_sdk`
 *   `index.d.ts` lines 638-640). Asserted by `_assertContainerBudget` AFTER the
 *   capture-container invariant. See ADR-0009 Amendment 1.
 */
export type LayerManagerErrorCode =
  | 'capture_invariant_violated'
  | 'capability_gate_denied'
  | 'z_already_occupied'
  | 'z_not_mounted'
  | 'panel_mount_budget_exceeded';

/**
 * Typed error thrown by the LayerManager.
 *
 * Always raised via `throw new LayerManagerError('<code>', '<message>')` — never bare
 * `Error`. Callers discriminate on `.code` for handling. The class is intentionally
 * thin (no recovery info beyond `code` + `message`) to keep the type surface stable
 * for Plan 02's runtime enforcement.
 */
export class LayerManagerError extends Error {
  /** Discriminator code identifying which invariant was violated. */
  public readonly code: LayerManagerErrorCode;

  constructor(code: LayerManagerErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = 'LayerManagerError';
  }
}

/**
 * Input pixel payload for a single raster frame request.
 *
 * `pixelData` may be either a raw `Uint8ClampedArray` of RGBA bytes (length =
 * 4 × width × height) or a structured `ImageData` (which wraps such an array).
 * Worker side performs the resize + dither + PNG encode.
 *
 * `frameId` is monotonically increasing per controller instance; used to correlate
 * responses with their requests in the MessageChannel's pending map.
 *
 * `isInitial` is `true` for the bootstrap frame after a mode transition; signals
 * the worker to skip the delta hash compare and emit all tiles unconditionally.
 */
export interface RasterRequest {
  readonly frameId: number;
  readonly pixelData: Uint8ClampedArray | ImageData;
  readonly width: number;
  readonly height: number;
  readonly isInitial?: boolean;
}

/**
 * A single changed tile in a `RasterResponse`.
 *
 * The 4-image-container 2×2 layout means tile `index` is one of `0..3`. The
 * `pngBytes` payload is a 4-bit indexed-palette PNG (per `upng-js@2.1.0`,
 * `depth: 4`) ready for `EvenAppBridge.updateImageRawData`.
 *
 * `subTileCount` reports how many 32×32 sub-tiles within this tile changed since
 * the previous frame — telemetry only, never affects wire format.
 */
export interface RasterChangedTile {
  readonly index: 0 | 1 | 2 | 3;
  readonly pngBytes: Uint8Array;
  readonly subTileCount: number;
}

/**
 * Worker → main-thread response for a single `RasterRequest`.
 *
 * On success: `changedTiles` lists every tile that changed (empty array = no-op
 * frame, controller skips the bridge write). On failure: `error` is set and
 * `changedTiles` is empty — caller should fall through to glyph mode.
 *
 * `skipped` is set when the worker debounced or coalesced this request (Layer 6
 * adaptive frame rate, Specs §7.4b.6.1) — caller treats as no-op without erroring.
 */
export interface RasterResponse {
  readonly frameId: number;
  readonly changedTiles: ReadonlyArray<RasterChangedTile>;
  readonly skipped?: boolean;
  readonly error?: {
    readonly stage: string;
    readonly message: string;
  };
}

/**
 * Convenience tuple-style frame input used by MapBaseLayer when assembling a
 * `RasterRequest` from a freshly-captured Foundry canvas snapshot.
 *
 * `pixelData` is always the raw RGBA byte array here (not the wrapped
 * `ImageData`) to keep the MapBaseLayer's caller surface narrow.
 */
export type RasterFrameInput = {
  readonly pixelData: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
};

/**
 * Type-only forward contract for the raster controller.
 *
 * Plan 03 Task 2 (`MapBaseLayer`) imports this interface via `import type
 * { RasterControllerLike }` so it can typecheck at its own commit boundary
 * WITHOUT depending on the concrete `RasterController` class file that lands in
 * Plan 03 Task 3. The concrete class declares `class RasterController implements
 * RasterControllerLike` and is the runtime singleton.
 *
 * Rationale: avoids a forward-import cycle and a missing-symbol typecheck failure
 * between Task 2 and Task 3 of Plan 03 (the two tasks ship in separate atomic
 * commits per `task_commit_protocol`).
 *
 * @see packages/g2-app/src/raster/raster-controller.ts (Plan 03 Task 3 — concrete impl)
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04A-PLAN-CHECK.md B-4 (rationale)
 * @see docs/architecture/0009-layer-manager-contract.md §Confirmation
 */
export interface RasterControllerLike {
  /**
   * Submit a frame for resize / dither / sub-tile hash-and-encode in the worker.
   *
   * Resolves with the changed-tile set (possibly empty). Never rejects on
   * pipeline errors — surfaces them via `RasterResponse.error` so the caller
   * can degrade to glyph mode gracefully.
   */
  requestFrame(
    pixelData: Uint8ClampedArray | ImageData,
    width: number,
    height: number,
  ): Promise<RasterResponse>;

  /**
   * Force the controller into raster or glyph mode.
   *
   * Called by the capability-handshake BLE-probe (Phase 4a Plan 02) on bandwidth
   * verdict and by the Quick Action `[M] Map mode` (Phase 4b) on user override.
   */
  setBleVerdict(v: 'raster' | 'glyph'): void;

  /**
   * Current BLE verdict.
   *
   * `null` until the first probe completes — caller treats as "raster pending
   * verdict" (queues frames; bridge writes are gated until non-null).
   */
  getBleVerdict(): 'raster' | 'glyph' | null;

  /**
   * Start the 0.3 fps idle heartbeat (Specs §7.4b.6.1 Layer 6 adaptive frame rate).
   *
   * `getCurrentScene` is invoked on every heartbeat tick; returning `null` skips
   * the tick (no scene loaded yet). The heartbeat continues until
   * `stopIdleHeartbeat()` is called.
   */
  startIdleHeartbeat(getCurrentScene: () => Uint8ClampedArray | null): void;

  /** Stop the idle heartbeat timer (idempotent). */
  stopIdleHeartbeat(): void;

  /** Terminate the underlying Worker and release all resources. */
  terminate(): void;
}
