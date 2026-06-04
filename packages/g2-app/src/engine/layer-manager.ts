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
 * rebuilds the canonical BASE page schema (11 containers, numeric ids +
 * geometry, exactly one isEventCapture=1) from the shared container registry
 * (`./container-registry.ts`) so the base HUD containers persist across the
 * boot→main bundle (Quick Task 260604-qm0 render-blank fix). Composing actual
 * overlay-panel container sets is a separate overlay-id follow-up.
 *
 * @see docs/architecture/0009-layer-manager-contract.md (ADR-0009)
 * @see docs/architecture/0001-layered-ui-model.md (ADR-0001 + Amendment 1)
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04a-CONTEXT.md §Area 1
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04A-PATTERNS.md §layer-manager.ts
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04A-02-PLAN.md Task 1
 */

import { type EvenAppBridge, RebuildPageContainer } from '@evenrealities/even_hub_sdk';
import type { ServerCap } from '@evf/shared-protocol';
import {
  BASE_CONTAINER_TOTAL,
  buildBaseImageContainers,
  buildBaseTextContainers,
} from './container-registry.js';
import type { DebugMirror } from './debug-mirror.js';
import {
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
   */
  constructor(
    private readonly bridge: EvenAppBridge,
    private readonly debugMirror?: DebugMirror,
  ) {}

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

    // STEP 2 — Apply effective ops; collect panels needing lifecycle invocation.
    const mountedPanels: OverlayPanel[] = [];
    const unmountedPanels: OverlayPanel[] = [];
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
        this.layers.set(op.z, op.layer);
        // Display mirror (Wave 4): record the mount op. No-op when mirror absent.
        this.debugMirror?.record({ op: 'mount', z: op.z, detail: op.layer.id });
      } else {
        const existing = this.layers.get(op.z);
        if (existing !== undefined && isOverlayPanel(existing)) {
          unmountedPanels.push(existing);
        }
        this.layers.delete(op.z);
        // Display mirror (Wave 4): record the destroy op. No-op when mirror absent.
        this.debugMirror?.record({ op: 'destroy', z: op.z, detail: existing?.id });
      }
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
   * capture-violation message first (LMT-CB-03 pins this ordering).
   */
  private _assertContainerBudget(): void {
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
   * the glasses stayed blank. It now rebuilds the canonical BASE page schema
   * from the shared container registry (11 containers, numeric ids + geometry,
   * exactly one isEventCapture=1 = map-capture) so the base HUD containers
   * persist across the rebuild and the host accepts every subsequent
   * `textContainerUpgrade` / `updateImageRawData`.
   *
   * The single-call contract (exactly one `rebuildPageContainer` per bundle) is
   * preserved and load-bearing for ADR-0001 Amendment 1 (no intermediate frame
   * between z=0.5 demolition and z=2 mount).
   *
   * Scope note: this restores the BASE schema on every flush; composing the
   * actual overlay-panel container sets (z=2 overlay ids/geometry) is the
   * separate overlay-id follow-up, not this fix.
   *
   * @see ./container-registry.ts (CONTAINER_REGISTRY single source of truth)
   * @see .planning/debug/glasses-render-blank-containerid.md
   */
  private async _flushPage(): Promise<void> {
    const payload = new RebuildPageContainer({
      // Canonical 11-container base schema (registry-sourced ids + geometry).
      containerTotalNum: BASE_CONTAINER_TOTAL,
      textObject: buildBaseTextContainers(),
      imageObject: buildBaseImageContainers(),
    });
    await this.bridge.rebuildPageContainer(payload);
  }
}
