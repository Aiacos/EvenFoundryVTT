/**
 * LayerManager singleton — orchestrates z-stack mount/destroy/bundle operations
 * on the Even Realities G2 layered HUD.
 *
 * Enforces three contracts (locked decisions, see 04a-CONTEXT.md §Area 1):
 *   1. Capture-container invariant — exactly one mounted Layer must provide a
 *      capture container at every mount/destroy/bundle boundary (INV-5 / ADR-0001).
 *      Violation throws `LayerManagerError('capture_invariant_violated')`.
 *   2. Capability gate — `mount()`'s `requiredCaps` argument is checked against
 *      the handshake-negotiated `SERVER_CAPS_V1` set held in `negotiatedCaps`.
 *      Missing caps throw `LayerManagerError('capability_gate_denied')`.
 *   3. Atomic bundle — `bundle(ops)` applies every op in array order, asserts the
 *      capture invariant ONCE at the end, and issues EXACTLY ONE
 *      `bridge.rebuildPageContainer` call. No intermediate frame is visible with
 *      a transient half-applied layer composition (ADR-0001 Amendment 1).
 *
 * No virtual DOM — render target is `EvenAppBridge` envelope calls (D-2.04,
 * CLAUDE.md). The bridge surface is injected at construction; the manager keeps
 * its `bridge` reference private and never re-exposes it.
 *
 * Phase 4a Plan 02 scope: this class lands the runtime contract. `_flushPage()`
 * rebuilds the DEFAULT STATUS-VIEW page schema (3 containers: header id4,
 * footer id5, status-hud id6; containerTotalNum:3) from the shared container
 * registry (`./container-registry.ts`) so the base HUD containers persist
 * across the boot→main bundle. The full 11-container schema (map-capture, z05-*,
 * image tiles) is deferred to the gesture-opened map-mode page (Phase 20 /
 * Quick Task 260605-j0t-05 flush-schema fix). Composing actual overlay-panel
 * container sets is a separate overlay-id follow-up.
 *
 * @see docs/architecture/0009-layer-manager-contract.md (ADR-0009)
 * @see docs/architecture/0001-layered-ui-model.md (ADR-0001 + Amendment 1)
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04a-CONTEXT.md §Area 1
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04A-PATTERNS.md §layer-manager.ts
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04A-02-PLAN.md Task 1
 */

import { type EvenAppBridge, RebuildPageContainer } from '@evenrealities/even_hub_sdk';
import type { ServerCap } from '@evf/shared-protocol';
import { pushHudTiles } from '../hud/hud-poc-page.js';
import { buildHudTiles } from '../hud/hud-raster-frame.js';
import type { CanvasCompositorLike } from './canvas-compositor.js';
import {
  BOOT_CONTAINER_TOTAL,
  buildHudRasterPageSchema,
  buildStatusViewTextContainers,
} from './container-registry.js';
import type { DebugMirror } from './debug-mirror.js';
import {
  type CanvasLayer,
  isCanvasLayer,
  type Layer,
  LayerManagerError,
  type LayerOp,
  type OverlayPanel,
  ZIndex,
} from './layer-types.js';
import { isOverlayPanel } from './overlay-panel.js';

/** Map-rendering mode controlled via Quick Action `[M] Map mode` (Phase 6 wires it). */
export type MapMode = 'auto' | 'raster' | 'glyph';

/**
 * Singleton orchestrator for the G2 layered HUD.
 *
 * Construct once per app boot with the resolved `EvenAppBridge` instance;
 * subsequent mount / destroy / bundle calls keep the page in a consistent
 * state that satisfies the capture-container invariant (ADR-0001).
 *
 * Thread model: all methods are synchronous except `bundle()`, which returns
 * a Promise that resolves after the single `rebuildPageContainer` flush. Map
 * mode mutations are pure state and never reach the bridge from this class
 * (Phase 4b wires the raster ↔ glyph swap path).
 */
export class LayerManager {
  /** Ordered map of currently-mounted layers, keyed by z-index. */
  private readonly layers = new Map<ZIndex, Layer>();

  /** Capability set negotiated at handshake (SERVER_CAPS_V1 intersection). */
  private negotiatedCaps: ReadonlySet<ServerCap> = new Set();

  /** Current map-rendering mode; mutated by `setMapMode()`. */
  private mapMode: MapMode = 'auto';

  /**
   * HUD render mode — selects the `_flushPage()` schema and whether
   * `_compositeAndPush()` is invoked after the page rebuild.
   *
   * - `'glyph'` (default): status-view schema (3 text containers); no compositor.
   *   Byte-identical to the pre-Phase-19 behavior — all existing tests pass unchanged.
   * - `'canvas'`: HUD raster schema (4 image tiles + 1 text capture = 5 containers);
   *   followed by `_compositeAndPush()` which composites layers and pushes 4 PNG tiles.
   *
   * The default is `'glyph'` so that existing production callers (boot-engine-core.ts,
   * all tests constructed without a compositor) are unaffected. Phase 20 will flip
   * this to `'canvas'` when real `CanvasLayer` implementations land.
   *
   * @see docs/architecture/0013-hud-raster-rendering.md Amendment 1 (RAST-04)
   */
  private renderMode: 'canvas' | 'glyph' = 'glyph';

  /**
   * Optional canvas compositor injected at construction.
   *
   * Null in glyph mode or when constructed without the 3rd parameter (the default
   * for all existing call sites). `_compositeAndPush()` returns early when null
   * (Pitfall 2 null-guard, 19-RESEARCH). Phase 20 passes the real `CanvasCompositor`.
   *
   * @see docs/architecture/0013-hud-raster-rendering.md Amendment 1 (RAST-01)
   */
  private readonly compositor: CanvasCompositorLike | null;

  /**
   * Idle infill layer stashed while a z=2 overlay is mounted.
   *
   * ADR-0009 Amendment 1 differential demolish rule: when `bundle()` mounts
   * `Z2_OVERLAY` while `Z0_5_IDLE_INFILL` is currently occupied, we implicitly
   * destroy z=0.5 in the same flush and stash its instance here. A later
   * `destroy(Z2_OVERLAY)` re-mounts the stashed instance (same reference) in
   * the same flush. Null when no overlay is active OR when no z=0.5 was
   * mounted at the time of overlay open.
   */
  private _suspendedZ05: Layer | null = null;

  /**
   * Per-layer canvases for `CanvasLayer` instances (ADR-0013 Amendment 1, Q1 resolution).
   *
   * Keyed by ZIndex. Created in `bundle()` when a `CanvasLayer` is mounted;
   * removed when the layer is destroyed. The compositor holds a reference to
   * each canvas via `registerLayer`; this map keeps the lifecycle aligned with
   * the z-stack so canvases are created/destroyed in lock-step with layers.
   *
   * @see attachCanvas async call in bundle() STEP 2 (Q1 resolution)
   */
  private readonly _layerCanvases = new Map<ZIndex, OffscreenCanvas | HTMLCanvasElement>();

  /**
   * Bind the manager to a resolved `EvenAppBridge` singleton.
   *
   * The bridge MUST already be ready (`waitForEvenAppBridge()` resolved).
   * Stored as private — never re-exposed.
   *
   * @param bridge      Resolved EvenAppBridge singleton.
   * @param debugMirror Optional display-op mirror (Quick Task 260529-h5e Wave 4).
   *                    Default `undefined` ⇒ byte-identical behavior to before:
   *                    the mirror is a fully-injected, zero-overhead no-op when
   *                    absent. Constructed enabled ONLY under `?debug=true`.
   * @param compositor  Optional canvas compositor (Phase 19 Plan 04, ADR-0013 Amendment 1).
   *                    Default `undefined` ⇒ `this.compositor = null`; the glyph path
   *                    remains byte-identical. Pass a `CanvasCompositorLike` to enable
   *                    canvas mode (Phase 20+). All existing 2-arg call sites (boot-engine-core.ts,
   *                    tests) continue to compile unchanged — the parameter is optional.
   *
   * @see docs/architecture/0013-hud-raster-rendering.md Amendment 1 (Open Question #3)
   */
  constructor(
    private readonly bridge: EvenAppBridge,
    private readonly debugMirror?: DebugMirror,
    compositor?: CanvasCompositorLike,
  ) {
    this.compositor = compositor ?? null;
  }

  /**
   * Replace the negotiated capability set.
   *
   * Called by `capability-handshake.ts` after a successful WS handshake with
   * the bridge. Subsequent `mount()` / `bundle()` calls validate their
   * `requiredCaps` against this set.
   */
  setNegotiatedCaps(caps: ReadonlySet<ServerCap>): void {
    this.negotiatedCaps = caps;
  }

  /**
   * Mount a layer at the given z-index, after enforcing the capability gate.
   *
   * Throws `LayerManagerError`:
   *   - `capability_gate_denied` when any `requiredCaps` entry is not in
   *     the negotiated set.
   *   - `capture_invariant_violated` when the resulting layer composition has
   *     0 or ≥2 capture providers.
   *
   * @param z              Z-index slot to occupy
   * @param layer          Layer instance (must satisfy `Layer` interface)
   * @param requiredCaps   Capabilities that must be negotiated before mount
   */
  mount(z: ZIndex, layer: Layer, requiredCaps: ReadonlyArray<ServerCap> = []): void {
    // Capability gate — verify every required cap is present in the
    // negotiated set before touching the layers map. Order-sensitive so that
    // failures leave the manager state untouched.
    for (const cap of requiredCaps) {
      if (!this.negotiatedCaps.has(cap)) {
        throw new LayerManagerError(
          'capability_gate_denied',
          `mount(z=${z}, ${layer.id}): required capability '${cap}' not in negotiated set`,
        );
      }
    }
    this.layers.set(z, layer);
    this._assertCaptureInvariant();
  }

  /**
   * Destroy the layer at the given z-index.
   *
   * Removes the layer from the registry and asserts the capture invariant.
   * Use `bundle()` if the destroy is part of an atomic swap (e.g.,
   * destroy z=0.5 + mount z=2) so the manager does not throw on the
   * transient zero-capture state.
   *
   * Throws `LayerManagerError('capture_invariant_violated')` when the
   * resulting layer composition has 0 or ≥2 capture providers.
   */
  destroy(z: ZIndex): void {
    this.layers.delete(z);
    this._assertCaptureInvariant();
  }

  /**
   * Apply a sequence of mount/destroy operations atomically.
   *
   * Semantics:
   *   - Operations are applied in array order.
   *   - The capability gate is enforced PER mount op (same as `mount()`).
   *   - Transient invariant violations during the loop are tolerated; the
   *     capture-container assertion runs once at the end of the loop, then
   *     the container-budget assertion runs, then OverlayPanel lifecycle
   *     hooks are awaited, then exactly one `bridge.rebuildPageContainer`
   *     call is issued (single render flush — ADR-0001 Amendment 1).
   *
   * **Phase 4b — differential demolish rule (ADR-0009 Amendment 1):**
   * before the explicit ops are applied, the input list is rewritten so that
   * any `mount(z=Z2_OVERLAY)` op that finds `Z0_5_IDLE_INFILL` currently
   * occupied is prefixed by an implicit `destroy(z=Z0_5_IDLE_INFILL)`. The
   * demolished layer instance is stashed in `_suspendedZ05`. A later
   * `destroy(z=Z2_OVERLAY)` triggers the inverse: an implicit
   * `mount(z=Z0_5_IDLE_INFILL, _suspendedZ05)` op is appended in the same
   * bundle. The result is a single atomic flush — no transient frame with
   * both visible — while the toast queue at z=1.5 is left untouched.
   *
   * **Phase 4b — container budget assertion (ADR-0009 Amendment 1):**
   * after the capture invariant passes, `_assertContainerBudget` sums each
   * mounted layer's declared `getContainerCount()` (default `{ image: 0,
   * text: 1 }`) and throws `LayerManagerError('panel_mount_budget_exceeded')`
   * if the cumulative count exceeds the SDK 4-image / 8-text cap per
   * `@evenrealities/even_hub_sdk@0.0.10` `index.d.ts` lines 638-640.
   *
   * **Phase 4b — OverlayPanel lifecycle:** for every mount op whose layer
   * satisfies `isOverlayPanel`, `onMount()` is awaited AFTER both invariants
   * pass and BEFORE `_flushPage()`. For every destroy op whose displaced
   * layer is an OverlayPanel, `onUnmount()` is awaited in the same window.
   * Rejection of either hook aborts the bundle BEFORE the bridge call (the
   * layer remains in the map; caller is responsible for `destroy()` + retry).
   *
   * On capability-gate denial mid-loop, the manager throws immediately with
   * the gate-denied error. Layers map state at the point of throw reflects
   * whatever ops succeeded before — callers should treat the manager state
   * as undefined after such a throw and rebuild from a known-good
   * composition.
   *
   * @see ADR-0009 Amendment 1 (differential demolish + container budget rules)
   */
  async bundle(ops: ReadonlyArray<LayerOp>): Promise<void> {
    // STEP 1 — Compute effective op list with differential demolish rewrites.
    const effective: LayerOp[] = [];
    for (const op of ops) {
      if (
        op.type === 'mount' &&
        op.z === ZIndex.Z2_OVERLAY &&
        this.layers.has(ZIndex.Z0_5_IDLE_INFILL)
      ) {
        // Stash the idle infill layer instance so we can re-mount it on
        // the inverse destroy(z=2) bundle later.
        const stashed = this.layers.get(ZIndex.Z0_5_IDLE_INFILL);
        if (stashed !== undefined) {
          this._suspendedZ05 = stashed;
        }
        effective.push({ type: 'destroy', z: ZIndex.Z0_5_IDLE_INFILL });
        effective.push(op);
      } else if (
        op.type === 'destroy' &&
        op.z === ZIndex.Z2_OVERLAY &&
        this._suspendedZ05 !== null
      ) {
        const restored = this._suspendedZ05;
        this._suspendedZ05 = null;
        effective.push(op);
        effective.push({
          type: 'mount',
          z: ZIndex.Z0_5_IDLE_INFILL,
          layer: restored,
          requiredCaps: [],
        });
      } else {
        effective.push(op);
      }
    }

    // STEP 2 — Apply effective ops; collect panels needing lifecycle invocation and
    //          canvas layers needing async attachCanvas (Q1 resolution, ADR-0013 Amendment 1).
    const mountedPanels: OverlayPanel[] = [];
    const unmountedPanels: OverlayPanel[] = [];
    const mountedCanvasLayers: Array<{ z: ZIndex; layer: CanvasLayer }> = [];
    const destroyedCanvasZIndices: ZIndex[] = [];
    for (const op of effective) {
      if (op.type === 'mount') {
        const requiredCaps = op.requiredCaps ?? [];
        for (const cap of requiredCaps) {
          if (!this.negotiatedCaps.has(cap)) {
            throw new LayerManagerError(
              'capability_gate_denied',
              `bundle: mount(z=${op.z}, ${op.layer.id}): required capability '${cap}' not in negotiated set`,
            );
          }
        }
        if (isOverlayPanel(op.layer)) {
          mountedPanels.push(op.layer);
        }
        // Collect CanvasLayer mounts for async attachCanvas wiring (Q1 resolution).
        if (isCanvasLayer(op.layer)) {
          mountedCanvasLayers.push({ z: op.z, layer: op.layer });
        }
        this.layers.set(op.z, op.layer);
        // Display mirror (Wave 4): record the mount op. No-op when mirror absent.
        this.debugMirror?.record({ op: 'mount', z: op.z, detail: op.layer.id });
      } else {
        const existing = this.layers.get(op.z);
        if (existing !== undefined && isOverlayPanel(existing)) {
          unmountedPanels.push(existing);
        }
        // Track canvas layer destroys for compositor deregistration.
        if (this._layerCanvases.has(op.z)) {
          destroyedCanvasZIndices.push(op.z);
        }
        this.layers.delete(op.z);
        // Display mirror (Wave 4): record the destroy op. No-op when mirror absent.
        this.debugMirror?.record({ op: 'destroy', z: op.z, detail: existing?.id });
      }
    }

    // STEP 2.5 — CanvasLayer attachment (Q1 resolution, ADR-0013 Amendment 1).
    //
    // For each newly-mounted CanvasLayer, create a per-layer OffscreenCanvas (or
    // HTMLCanvasElement fallback), await layer.attachCanvas(canvas) so font load +
    // chrome pre-bake complete before the first composite(), then register with the
    // compositor. For destroyed canvas layers, deregister from the compositor.
    //
    // Kept before STEP 3 (invariant checks) so that if attachCanvas throws, the
    // bundle aborts before the bridge call — consistent with the mount-lifecycle
    // rejection contract (STEP 5 pattern).
    //
    // No-op for plain Layer instances (isCanvasLayer returns false) — glyph path unchanged.
    for (const { z, layer } of mountedCanvasLayers) {
      const canvas = LayerManager._createLayerCanvas();
      this._layerCanvases.set(z, canvas);
      // await is load-bearing — ensures VT323 font load + chrome pre-bake complete
      // before the first _compositeAndPush() in STEP 6 (Q1 resolution).
      await layer.attachCanvas(canvas);
      this.compositor?.registerLayer(z, canvas, layer);
    }
    for (const z of destroyedCanvasZIndices) {
      this.compositor?.deregisterLayer(z);
      this._layerCanvases.delete(z);
    }

    // STEP 3 — Invariants BEFORE bridge call. Capture first so `_assertContainerBudget`
    // does not mask a more diagnostic capture-violation message.
    this._assertCaptureInvariant();
    this._assertContainerBudget();

    // STEP 4 — Unmount lifecycle hooks (sequential await for predictable order).
    for (const p of unmountedPanels) {
      await p.onUnmount();
    }

    // STEP 5 — Mount lifecycle hooks. Rejection bubbles up; bridge flush SKIPPED.
    // The layer stays in the map — caller's responsibility to issue destroy +
    // retry (T-4b-01-02 mitigation).
    for (const p of mountedPanels) {
      await p.onMount();
    }

    // STEP 6 — Single bridge flush.
    await this._flushPage();

    // STEP 7 — Display mirror (Wave 4): record the resulting page rebuild with a
    // z-stack summary + container count. No-op when mirror absent (default).
    this.debugMirror?.record({
      op: 'rebuild',
      containerCount: this.layers.size,
      detail: [...this.layers.keys()].sort((a, b) => a - b).join(','),
    });
  }

  /**
   * Set the desired map-rendering mode.
   *
   * Plan 02 only persists the value; the raster ↔ glyph swap (Phase 4b/6)
   * reads this value when wiring the layer composition. No bridge I/O.
   */
  setMapMode(mode: MapMode): void {
    this.mapMode = mode;
  }

  /** Read the current map-rendering mode. */
  getMapMode(): MapMode {
    return this.mapMode;
  }

  /**
   * Set the HUD render mode for `_flushPage()` schema selection.
   *
   * - `'glyph'` (default): status-view schema (3 text containers; no compositor).
   *   Byte-identical to the pre-Phase-19 behavior.
   * - `'canvas'`: HUD raster schema (5 containers) followed by `_compositeAndPush()`.
   *
   * No bridge I/O on mode change itself — the mode takes effect on the next `bundle()`.
   *
   * @see docs/architecture/0013-hud-raster-rendering.md Amendment 1 (RAST-04)
   */
  setRenderMode(mode: 'canvas' | 'glyph'): void {
    this.renderMode = mode;
  }

  /**
   * Read the current HUD render mode.
   *
   * Defaults to `'glyph'` until `setRenderMode('canvas')` is called (Phase 20).
   *
   * @see docs/architecture/0013-hud-raster-rendering.md Amendment 1 (RAST-04)
   */
  getRenderMode(): 'canvas' | 'glyph' {
    return this.renderMode;
  }

  /**
   * Count layers that currently report a capture container.
   *
   * Exposed for tests and diagnostics; consumers should rely on the manager
   * enforcing the invariant rather than checking the count themselves.
   */
  getCaptureContainerCount(): number {
    let count = 0;
    for (const layer of this.layers.values()) {
      const provider = layer.getCaptureContainer;
      if (provider !== undefined && provider.call(layer) !== undefined) {
        count++;
      }
    }
    return count;
  }

  /**
   * Throw `LayerManagerError('capture_invariant_violated')` unless EXACTLY one
   * mounted layer reports a capture container (INV-5 / ADR-0001).
   */
  private _assertCaptureInvariant(): void {
    const count = this.getCaptureContainerCount();
    if (count !== 1) {
      throw new LayerManagerError(
        'capture_invariant_violated',
        `expected 1 capture container, found ${count}`,
      );
    }
  }

  /**
   * Throw `LayerManagerError('panel_mount_budget_exceeded')` when the cumulative
   * mounted-layer container footprint would exceed the SDK 4-image / 8-text cap.
   *
   * **Canvas mode (ADR-0013 Amendment 1, locked decision #3):** the budget is FIXED
   * at page creation (5 containers: 4 image tiles + 1 text capture). The per-layer
   * sum is meaningless in canvas mode — `MapBaseLayer.getContainerCount()` returns
   * `{image:4, text:1}` in raster mode, which would false-fire against the sum cap
   * (Pitfall 1, 19-RESEARCH). Instead, validate that EVERY layer declares
   * `{image:0, text:0}`: any non-zero count signals a mis-classified glyph layer
   * incorrectly mounted in canvas mode. Returns early without falling through to
   * the glyph per-layer sum.
   *
   * **Glyph mode:** existing per-layer sum behavior is byte-identical (unchanged).
   * `img > 4 || txt > 8` → throws `panel_mount_budget_exceeded`.
   *
   * Strategy A (ADR-0009 Amendment 1): each layer self-declares its footprint
   * via `getContainerCount()`. Missing method ⇒ default `{ image: 0, text: 1 }`
   * (one text/list slot, no image slots) — matches the most common no-capture
   * layer (StatusHudLayer, IdleInfillLayer in glyph mode, ToastQueueLayer).
   *
   * Cap source: `@evenrealities/even_hub_sdk@0.0.10`
   * `dist/index.d.ts` lines 638-640 + 674-677 (verbatim
   * `containerTotalNum: 1~12`, `textObject: 最多 8 项`, `imageObject: 最多 4 项`).
   * INV-2 re-verified 2026-05-15.
   *
   * Runs AFTER `_assertCaptureInvariant` so callers see the more diagnostic
   * capture-violation message first (LMT-CB-03 pins this ordering — DO NOT reorder).
   *
   * @see docs/architecture/0013-hud-raster-rendering.md Amendment 1 (RAST-03, locked decision #3)
   */
  private _assertContainerBudget(): void {
    if (this.renderMode === 'canvas') {
      // Canvas mode: fixed 5-container budget declared at page creation (buildHudRasterPageSchema).
      // CanvasLayer.getContainerCount() MUST return {image:0, text:0} — canvas layers do not
      // allocate individual SDK containers. A non-zero count signals a mis-classified glyph
      // layer incorrectly mounted in canvas mode → throw to surface the mis-configuration.
      // Do NOT fall through to the per-layer sum: it is semantically meaningless in canvas mode
      // and would false-fire on any layer that reports image containers (e.g., MapBaseLayer).
      for (const layer of this.layers.values()) {
        const cnt = layer.getContainerCount?.() ?? { image: 0, text: 1 };
        if (cnt.image > 0 || cnt.text > 0) {
          throw new LayerManagerError(
            'panel_mount_budget_exceeded',
            `canvas mode: layer '${layer.id}' declared non-zero container count ` +
              `${JSON.stringify(cnt)}; canvas layers must return {image:0, text:0} ` +
              `(ADR-0013 Amendment 1, locked decision #3)`,
          );
        }
      }
      return; // Fixed budget always passes when all layers declare {image:0, text:0}.
    }

    // Glyph mode: per-layer sum (byte-identical to pre-Phase-19 behavior).
    let img = 0;
    let txt = 0;
    for (const layer of this.layers.values()) {
      const cnt = layer.getContainerCount?.() ?? { image: 0, text: 1 };
      img += cnt.image;
      txt += cnt.text;
    }
    if (img > 4 || txt > 8) {
      throw new LayerManagerError(
        'panel_mount_budget_exceeded',
        `container budget exceeded: ${img} image (max 4) + ${txt} text (max 8); see ADR-0009 Amendment 1`,
      );
    }
  }

  /**
   * Return the highest-z mounted `OverlayPanel` layer, or `null` if none.
   *
   * INV-5 Gesture Determinism: this is the runtime authority that determines
   * which panel receives every published R1 gesture. The `attachR1EventSource`
   * provider calls this on every incoming gesture event; the top panel is the
   * sole receiver.
   *
   * **Sort requirement (RESEARCH Pitfall 2):** `this.layers` is a `Map<ZIndex, Layer>`
   * whose iteration order is insertion order — NOT numeric z-order. If layers are
   * mounted out of z-order (common in tests and in the differential-demolish
   * rewrite logic), a naive `Map.values()` scan would return the wrong "top" layer.
   * This method explicitly sorts `[...entries()].sort(([a],[b]) => b-a)` before
   * iterating so the highest numeric z is always checked first.
   *
   * Zero-handler edge case: returns `null` when no `OverlayPanel` is mounted
   * (boot splash active, boot error active, or no overlay has been pushed yet).
   * Callers (`attachR1EventSource`) treat `null` as an explicit INV-5 no-op with
   * a `console.warn` telemetry log entry — never a silent drop.
   *
   * @returns Highest-z `OverlayPanel` (where `isOverlayPanel(layer) === true`), or `null`
   * @see docs/architecture/INVARIANTS.md §5 INV-5 (Gesture Determinism)
   * @see .planning/phases/06-r1-integration-quick-action-inv-5/06-RESEARCH.md Pitfall 2 (insertion-order pitfall)
   * @see .planning/phases/06-r1-integration-quick-action-inv-5/06-01-PLAN.md Task 2
   */
  getTopLayer(): Layer | null {
    // Sort by z DESCENDING — Map iteration is insertion order, NOT numeric order
    // (RESEARCH Pitfall 2). We must sort explicitly to guarantee correctness when
    // layers were mounted in any order (e.g., z=2 mounted before z=1 in a bundle).
    const sorted = [...this.layers.entries()].sort(([a], [b]) => b - a);
    for (const [, layer] of sorted) {
      if (isOverlayPanel(layer)) return layer;
    }
    return null;
  }

  /**
   * Test-only diagnostic accessor — return the layer at a given z-index.
   *
   * Production code MUST NOT depend on layer identity for routing; the manager
   * is the single source of truth for composition. This getter exists so
   * `__tests__/layer-manager.test.ts` can assert reference equality after the
   * differential demolish rule round-trips an `IdleInfillLayer` instance through
   * the suspend/restore path (LMT-DD-02, LMT-DD-06).
   */
  getLayer(z: ZIndex): Layer | undefined {
    return this.layers.get(z);
  }

  /**
   * Flush the current layer composition to the bridge via a single
   * `rebuildPageContainer` envelope.
   *
   * **Render-blank fix (Quick Task 260604-qm0):** this method previously sent
   * a degenerate payload (`containerTotalNum: 1`, empty arrays). Because the
   * boot→main transition runs `createBootPage` then bundles in the real layers
   * via this flush, that empty rebuild WIPED every base container after boot —
   * so the layer renderers then upgraded containers that no longer existed and
   * the glasses stayed blank.
   *
   * **Mode-aware schema selector (Phase 19 Plan 04, implementing j0t-05 TODO):**
   * This method now selects the page schema based on `renderMode`:
   *
   * - `'glyph'` (default): DEFAULT STATUS-VIEW schema (3 text containers: header id4,
   *   footer id5, status-hud id6; 0 image containers; containerTotalNum:3) —
   *   identical to `buildBootPageSchema()` in `page-lifecycle.ts`. Byte-identical
   *   to the pre-Phase-19 behavior. Avoids the "Text" ghosting/overlap artifact
   *   that occurred with the full 11-container schema.
   *
   * - `'canvas'`: HUD RASTER schema (4 image tiles hud-tile-0..3 at 200×100 each +
   *   1 text capture container hud-capture; containerTotalNum:5) from
   *   `buildHudRasterPageSchema()`. Followed immediately by `_compositeAndPush()`
   *   which composites all registered `CanvasLayer`s and pushes 4 serialized
   *   `updateImageRawData` calls.
   *
   * map-capture and z05-* remain in the registry for the deferred map-mode
   * page (Phase 20 / Specs §7.4). They MUST NOT be declared in either schema.
   *
   * The single-call contract (exactly one `rebuildPageContainer` per bundle) is
   * preserved and load-bearing for ADR-0001 Amendment 1 (no intermediate frame
   * between z=0.5 demolition and z=2 mount).
   *
   * @see ./container-registry.ts (buildStatusViewTextContainers, BOOT_CONTAINER_TOTAL,
   *   buildHudRasterPageSchema, HUD_RASTER_CONTAINER_TOTAL)
   * @see ./page-lifecycle.ts#buildBootPageSchema (parallel default-view schema)
   * @see docs/architecture/0013-hud-raster-rendering.md Amendment 1 (RAST-04)
   * @see .planning/debug/glasses-render-blank-containerid.md
   */
  private async _flushPage(): Promise<void> {
    const schema =
      this.renderMode === 'canvas'
        ? buildHudRasterPageSchema() // 4 image tiles + 1 capture text = 5 containers (canvas mode)
        : {
            // Glyph mode: default status-view schema — byte-identical to pre-Phase-19 behavior.
            // header(id4) + footer(id5) + status-hud(id6); map-capture + z05-* EXCLUDED.
            containerTotalNum: BOOT_CONTAINER_TOTAL,
            textObject: buildStatusViewTextContainers(),
            imageObject: [] as never[],
          };
    const payload = new RebuildPageContainer(schema);
    await this.bridge.rebuildPageContainer(payload);
    if (this.renderMode === 'canvas') {
      await this._compositeAndPush();
    }
  }

  /**
   * Composite all registered `CanvasLayer`s and push 4 serialized tile updates
   * to the G2 framebuffer via `bridge.updateImageRawData`.
   *
   * # Serialization contract (CM-01)
   *
   * `updateImageRawData` does NOT accept concurrent sends — the Even Hub SDK
   * rejects concurrent calls on the same image container. This method uses the
   * existing `pushHudTiles` serialized loop (`for...of` + `await` per tile)
   * which guarantees sequential delivery. Do NOT use `Promise.all` here.
   *
   * # Null-compositor guard (Pitfall 2, 19-RESEARCH)
   *
   * If `this.compositor` is null (default for 2-arg construction, glyph-only mode),
   * this method returns immediately without throwing. This ensures that calling
   * `setRenderMode('canvas')` without providing a compositor at construction time
   * does not crash — it simply produces no tile updates (useful for schema-select
   * tests that only assert `rebuildPageContainer`).
   *
   * @see packages/g2-app/src/hud/hud-poc-page.ts#pushHudTiles (serialized push)
   * @see packages/g2-app/src/hud/hud-raster-frame.ts#buildHudTiles (RGBA → 4 tiles)
   * @see docs/architecture/0013-hud-raster-rendering.md Amendment 1 (RAST-01)
   */
  private async _compositeAndPush(): Promise<void> {
    if (this.compositor === null) return; // Pitfall 2 null-guard
    const rgba = this.compositor.composite(); // 400×200×4 RGBA → 320000 bytes
    const tiles = buildHudTiles(rgba); // 4 × HudTile (200×100 dithered 4-bit PNG)
    await pushHudTiles(this.bridge, tiles); // serialized: for...of + await per tile (CM-01)
  }

  /**
   * Create a per-layer OffscreenCanvas (or HTMLCanvasElement fallback) at the
   * compositor dimensions (400×200).
   *
   * Environment resolution order mirrors `CanvasCompositor._acquireMasterCtx`:
   *   1. `OffscreenCanvas` — Web Worker context.
   *   2. `document.createElement('canvas')` — WebView / browser main thread.
   *   3. Returns a minimal HTMLCanvasElement-shaped object — test environment
   *      (happy-dom; real canvas layers are never mounted in tests that omit a
   *      compositor, and those tests use plain Layer stubs whose `isCanvasLayer`
   *      returns false).
   *
   * @internal Used exclusively by `bundle()` STEP 2.5 (Q1 resolution).
   */
  private static _createLayerCanvas(): OffscreenCanvas | HTMLCanvasElement {
    if (typeof OffscreenCanvas !== 'undefined') {
      return new OffscreenCanvas(400, 200);
    }
    if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      canvas.width = 400;
      canvas.height = 200;
      return canvas;
    }
    // Test environment fallback: return a minimal canvas-shaped object.
    // Real CanvasLayer implementations are never mounted in happy-dom tests
    // (those tests use plain Layer stubs), so this path is only reached in
    // corner-case test scenarios. The cast is intentional — the object satisfies
    // the OffscreenCanvas | HTMLCanvasElement union for the attachCanvas signature.
    return { width: 400, height: 200, getContext: () => null } as unknown as HTMLCanvasElement;
  }
}
