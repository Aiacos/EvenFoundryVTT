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
 * currently emits a minimal `RebuildPageContainer` payload sufficient for the
 * Plan 05 atomic-bundle smoke test; concrete container assembly (image/text
 * slot layout per UI-SPEC §Container Budget Allocation) is refined by Plans 03
 * (raster) and 04 (status-hud) as their own layer implementations land.
 *
 * @see docs/architecture/0009-layer-manager-contract.md (ADR-0009)
 * @see docs/architecture/0001-layered-ui-model.md (ADR-0001 + Amendment 1)
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04a-CONTEXT.md §Area 1
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04A-PATTERNS.md §layer-manager.ts
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04A-02-PLAN.md Task 1
 */

import { type EvenAppBridge, RebuildPageContainer } from '@evenrealities/even_hub_sdk';
import type { ServerCap } from '@evf/shared-protocol';
import { type Layer, LayerManagerError, type LayerOp, type ZIndex } from './layer-types.js';

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
   * Bind the manager to a resolved `EvenAppBridge` singleton.
   *
   * The bridge MUST already be ready (`waitForEvenAppBridge()` resolved).
   * Stored as private — never re-exposed.
   */
  constructor(private readonly bridge: EvenAppBridge) {}

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
   *     capture-container assertion runs once at the end of the loop.
   *   - On invariant success, exactly one `bridge.rebuildPageContainer` call
   *     is issued (single render flush — ADR-0001 Amendment 1).
   *
   * On capability-gate denial mid-loop, the manager throws immediately with
   * the gate-denied error. Layers map state at the point of throw reflects
   * whatever ops succeeded before — callers should treat the manager state
   * as undefined after such a throw and rebuild from a known-good
   * composition.
   */
  async bundle(ops: ReadonlyArray<LayerOp>): Promise<void> {
    for (const op of ops) {
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
        this.layers.set(op.z, op.layer);
      } else {
        this.layers.delete(op.z);
      }
    }
    this._assertCaptureInvariant();
    await this._flushPage();
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
   * Flush the current layer composition to the bridge via a single
   * `rebuildPageContainer` envelope.
   *
   * Plan 02 ships a minimal payload (containerTotalNum + empty arrays). Plans
   * 03 (raster) and 04 (status-hud) will refine this to assemble the real
   * image/text container schema per UI-SPEC §Container Budget Allocation.
   * The single-call contract is verified by the Plan 02 unit tests and is
   * load-bearing for ADR-0001 Amendment 1 (no intermediate frame between
   * z=0.5 demolition and z=2 mount).
   */
  private async _flushPage(): Promise<void> {
    const payload = new RebuildPageContainer({
      // Minimum valid containerTotalNum (1-12 per SDK PB constraint).
      // Plans 03/04 will compute this from the actually-mounted layer set.
      containerTotalNum: 1,
      textObject: [],
      imageObject: [],
    });
    await this.bridge.rebuildPageContainer(payload);
  }
}
