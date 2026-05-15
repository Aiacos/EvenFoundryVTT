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
 * Values per ADR-0001 + Amendment 1 (z=0.5 Idle Content Infill, Specs §7.4c):
 * - `Z0_MAP`            — backdrop scene (raster default 4-bit dithered or glyph fallback)
 * - `Z0_5_IDLE_INFILL`  — combat-log strip / label-separator / stats strip, mounted ONLY when z=2 is absent
 * - `Z1_STATUS_HUD`     — always-visible corner card (HP/AC/Speed/Conditions/Concentration)
 * - `Z2_OVERLAY`        — modal/overlay slot (sheet, combat tracker, spellbook tabs)
 *
 * Numeric values are load-bearing for ordered iteration and `Map<ZIndex, Layer>` keys.
 */
export enum ZIndex {
  Z0_MAP = 0,
  Z0_5_IDLE_INFILL = 0.5,
  Z1_STATUS_HUD = 1,
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
 */
export type LayerManagerErrorCode =
  | 'capture_invariant_violated'
  | 'capability_gate_denied'
  | 'z_already_occupied'
  | 'z_not_mounted';

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
