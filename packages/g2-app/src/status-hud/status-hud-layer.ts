/**
 * StatusHudLayer — always-visible z=1 corner card.
 *
 * Implements the `Layer` interface (`packages/g2-app/src/engine/layer-types.ts`)
 * and is mounted into the LayerManager at `ZIndex.Z1_STATUS_HUD`. The layer:
 *
 *   1. Subscribes to a `wsEvents` source for `character.delta` messages.
 *   2. Validates every incoming payload via `CharacterSnapshotSchema.safeParse`
 *      (NEVER `.parse` — T-4a-04-01 mitigation).
 *   3. Caches the most-recent valid snapshot.
 *   4. Triggers a debounced redraw (default 200 ms per CONTEXT.md §Area 3) on
 *      every valid delta — multiple deltas within the window coalesce into a
 *      single `bridge.textContainerUpgrade` call.
 *   5. Runs an idle heartbeat (default 30 s per CONTEXT.md §Area 3) that
 *      re-renders the last-known snapshot to recover from any drift.
 *
 * The layer NEVER captures input — `getCaptureContainer` is omitted entirely
 * per the `Layer` interface contract (render-only z=1). LayerManager's
 * capture-invariant test relies on this layer as the canonical "no-capture"
 * exemplar (DISP-02 partial coverage per 04A-04-PLAN.md objective).
 *
 * Threat-model mitigations (T-4a-04-01/02/03):
 *   - safeParse before forwarding to renderer (parse-failed → log + ignore)
 *   - Width-budgeted output via StatusHudRenderer (zero-width/RTL marks neutralised)
 *   - destroy() clears both timers + calls the unsubscribe returned by
 *     wsEvents.subscribe — heartbeat timer leak unit-tested
 *
 * No virtual DOM — render output is a single `bridge.textContainerUpgrade`
 * call (D-2.04, CLAUDE.md).
 *
 * @see docs/architecture/0001-layered-ui-model.md (ADR-0001 — z=1 always visible)
 * @see docs/architecture/0009-layer-manager-contract.md (ADR-0009 — Layer interface)
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04a-CONTEXT.md §Area 3 (update cadence)
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04A-PATTERNS.md §status-hud-layer.ts
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04A-UI-SPEC.md §Status HUD Corner Card
 */

import { type EvenAppBridge, TextContainerUpgrade } from '@evenrealities/even_hub_sdk';
import { type CharacterSnapshot, CharacterSnapshotSchema } from '@evf/shared-protocol';
import type { Layer } from '../engine/layer-types.js';
import type { StatusHudRenderer } from './status-hud-renderer.js';

/** Default debounce window per CONTEXT.md §Area 3. */
const DEFAULT_DEBOUNCE_MS = 200;
/** Default heartbeat period per CONTEXT.md §Area 3. */
const DEFAULT_HEARTBEAT_MS = 30_000;
/** Default text-container name for the z=1 Status HUD slot. */
const DEFAULT_CONTAINER_NAME = 'status-hud';
/** The WS delta channel name (Phase 3 envelope `type` discriminator). */
const CHARACTER_DELTA_CHANNEL = 'character.delta';

/**
 * Minimal `wsEvents` shape the layer depends on.
 *
 * Production wiring (Phase 3 + Plan 06) hands in a concrete adapter that
 * forwards `character.delta` envelopes. Tests inject a `vi.fn()` mock. The
 * subscribe call must return an unsubscribe function the layer calls in
 * `destroy()`.
 */
export interface CharacterDeltaEvents {
  subscribe(channel: typeof CHARACTER_DELTA_CHANNEL, fn: (raw: unknown) => void): () => void;
}

/** Constructor options for StatusHudLayer. */
export interface StatusHudLayerOpts {
  readonly bridge: EvenAppBridge;
  readonly renderer: StatusHudRenderer;
  readonly wsEvents: CharacterDeltaEvents;
  /** Override the default `'status-hud'` container name (rarely needed). */
  readonly containerName?: string;
  /** Override the 200 ms debounce window (rarely needed). */
  readonly debounceMs?: number;
  /** Override the 30 s heartbeat period (rarely needed). */
  readonly heartbeatMs?: number;
}

/**
 * Always-visible z=1 Status HUD layer.
 *
 * Construct once per app boot; the LayerManager calls `draw()` on its own
 * cadence (bundle flush) and the layer also self-drives renders via the WS
 * delta subscription + heartbeat. `destroy()` releases all timers and the WS
 * subscription.
 */
export class StatusHudLayer implements Layer {
  /** Stable id used by LayerManager + telemetry. */
  public readonly id = 'status-hud';

  private readonly bridge: EvenAppBridge;
  private readonly renderer: StatusHudRenderer;
  private readonly containerName: string;
  private readonly debounceMs: number;
  private readonly heartbeatMs: number;

  /** Unsubscribe callback returned by `wsEvents.subscribe`. */
  private readonly unsubscribe: () => void;

  /** Latest snapshot seen via WS delta — `null` until first valid payload. */
  private snapshot: CharacterSnapshot | null = null;

  /** Active debounce timer (null between bursts). */
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  /** Active heartbeat interval timer (null after destroy). */
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor(opts: StatusHudLayerOpts) {
    this.bridge = opts.bridge;
    this.renderer = opts.renderer;
    this.containerName = opts.containerName ?? DEFAULT_CONTAINER_NAME;
    this.debounceMs = opts.debounceMs ?? DEFAULT_DEBOUNCE_MS;
    this.heartbeatMs = opts.heartbeatMs ?? DEFAULT_HEARTBEAT_MS;

    // Subscribe to character.delta and cache the unsubscribe fn for destroy().
    this.unsubscribe = opts.wsEvents.subscribe(CHARACTER_DELTA_CHANNEL, (raw) =>
      this._onDelta(raw),
    );

    // Start the idle heartbeat. Every tick re-renders the cached snapshot
    // (or the loading state if none has arrived) so the HUD never drifts.
    this.heartbeatTimer = setInterval(() => {
      void this._renderNow();
    }, this.heartbeatMs);
  }

  /**
   * Re-render the layer immediately (no debounce).
   *
   * Called by LayerManager during bundle flushes. Renders the current
   * snapshot if available, otherwise the loading state.
   */
  async draw(): Promise<void> {
    await this._renderNow();
  }

  /**
   * Tear down the layer.
   *
   * - Unsubscribes from `wsEvents`
   * - Clears the debounce timer (if active)
   * - Clears the heartbeat timer
   *
   * Idempotent — second invocations are no-ops on already-null timers.
   */
  destroy(): void {
    this.unsubscribe();
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Internal — delta receive + debounced render
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Receive a raw WS payload and validate via CharacterSnapshotSchema.
   *
   * On parse failure: `console.warn` + ignore (no throw, no crash) — T-4a-04-01
   * mitigation. On success: cache snapshot + schedule debounced redraw.
   */
  private _onDelta(raw: unknown): void {
    const parsed = CharacterSnapshotSchema.safeParse(raw);
    if (!parsed.success) {
      console.warn(
        '[EVF] status-hud-layer: malformed character.delta payload — ignoring.',
        parsed.error.message,
      );
      return;
    }
    this.snapshot = parsed.data;
    this._scheduleDebouncedRender();
  }

  /**
   * Coalesce N events within `debounceMs` into a single render.
   *
   * Cancel any existing timer; set a fresh one. When it fires, render the
   * current `this.snapshot`. The heartbeat operates independently.
   */
  private _scheduleDebouncedRender(): void {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      void this._renderNow();
    }, this.debounceMs);
  }

  /**
   * Render the current snapshot via the renderer + push to the bridge.
   *
   * Never throws — bridge rejections propagate as Promise rejections to the
   * caller (LayerManager handles error logging at the call site).
   */
  private async _renderNow(): Promise<void> {
    const grid =
      this.snapshot !== null ? this.renderer.render(this.snapshot) : this.renderer.renderLoading();
    const payload = new TextContainerUpgrade({
      containerName: this.containerName,
      content: grid.toString(),
    });
    await this.bridge.textContainerUpgrade(payload);
  }
}
