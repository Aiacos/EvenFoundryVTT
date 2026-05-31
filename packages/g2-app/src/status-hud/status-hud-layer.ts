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
 * **Phase 4b DEATH-01 — death-saves pivot trigger:** `_onDelta` now inspects
 * `parsed.data.hp === 0 && parsed.data.death.failure < 3` and flips the
 * renderer's mode via `renderer.setMode('death-saves' | 'standard')` whenever
 * the latch state changes. The latch is transition-driven (renderer is only
 * notified on state changes — no per-delta noise) and stays ON when the PC
 * dies (`failure === 3`) until a future revive event (Phase 7+). See
 * 04b-CONTEXT.md §Area 7 + 04B-RESEARCH.md §Q4.
 *
 * No virtual DOM — render output is a single `bridge.textContainerUpgrade`
 * call (D-2.04, CLAUDE.md).
 *
 * @see docs/architecture/0001-layered-ui-model.md (ADR-0001 — z=1 always visible)
 * @see docs/architecture/0009-layer-manager-contract.md (ADR-0009 — Layer interface)
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04a-CONTEXT.md §Area 3 (update cadence)
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04A-PATTERNS.md §status-hud-layer.ts
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04A-UI-SPEC.md §Status HUD Corner Card
 * @see .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04b-CONTEXT.md §Area 7 (DEATH-01 pivot trigger)
 * @see .planning/phases/06-r1-integration-quick-action-inv-5/06-CONTEXT.md §Area 2 (chip design — Plan 06-03)
 * @see .planning/phases/06-r1-integration-quick-action-inv-5/06-03-PLAN.md Task 2 (LayerManager wiring)
 */

import { type EvenAppBridge, TextContainerUpgrade } from '@evenrealities/even_hub_sdk';
import {
  ActionEconomyPayloadSchema,
  type CharacterSnapshot,
  CharacterSnapshotSchema,
  MovementBudgetPayloadSchema,
  R1_ACTION_ECONOMY_TYPE,
  R1_MOVEMENT_BUDGET_TYPE,
} from '@evf/shared-protocol';
import type { Layer } from '../engine/layer-types.js';
import type { LayerManagerLike, StatusHudRenderer } from './status-hud-renderer.js';

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
 *
 * Phase 8 Plan 08-04 widens the channel parameter to `string` so the same
 * interface covers both `character.delta` and `r1.movement.budget` subscriptions
 * without requiring test mocks to implement separate overloads.
 */
export interface CharacterDeltaEvents {
  subscribe(channel: string, fn: (raw: unknown) => void): () => void;
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
  /**
   * LayerManager reference for reading `getTopLayer()?.getR1Hints?.()` on
   * every render to produce the context-aware R1 chip footer row (Phase 6
   * Plan 03 — NAV-01 closure + INV-5 SC-4 visible enforcement).
   *
   * Optional — omit during boot until the LayerManager is available.
   * Plan 06-04 (`boot-engine-core.ts`) wires the real LayerManager instance
   * here. Tests inject a lightweight mock satisfying {@link LayerManagerLike}.
   *
   * @see packages/g2-app/src/status-hud/status-hud-renderer.ts renderContextChip
   * @see .planning/phases/06-r1-integration-quick-action-inv-5/06-CONTEXT.md §Area 2
   */
  readonly layerManager?: LayerManagerLike;
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
  /**
   * Phase 6 Plan 03 — LayerManager reference for chip rendering.
   *
   * Stored from constructor opts; passed to `renderer.renderContextChip` on
   * every `_renderNow()` call so the chip reads the live top layer's R1 hints.
   * `null` if no LayerManager was provided (early boot / legacy test path).
   */
  private readonly layerManager: LayerManagerLike | null;

  /**
   * Unsubscribe callback returned by `wsEvents.subscribe` (character.delta).
   *
   * Mutable (quick-task 260529-khy Wave 1) so {@link rebindWsEvents} can drop the
   * old subscription and store the new one on a WS reconnect.
   */
  private unsubscribe: () => void;
  /**
   * Phase 8 Plan 08-04 — unsubscribe for r1.movement.budget channel.
   *
   * Registered in the constructor alongside the character.delta subscription.
   * Released in `destroy()` to prevent listener leaks (T-4b-01-03 pattern).
   * Mutable (quick-task 260529-khy) for reconnect rebind.
   */
  private unsubscribeMovement: () => void;

  /**
   * Phase 9 Plan 09-02 — unsubscribe for r1.action.economy channel.
   *
   * Registered in the constructor after the movement subscription.
   * Drives `renderer.setActionEconomy` on validated payload arrival.
   * Released in `destroy()` to prevent listener leaks (T-4b-01-03 pattern).
   * Mutable (quick-task 260529-khy) for reconnect rebind.
   */
  private unsubscribeEconomy: () => void;

  /** Latest snapshot seen via WS delta — `null` until first valid payload. */
  private snapshot: CharacterSnapshot | null = null;

  /** Active debounce timer (null between bursts). */
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  /** Active heartbeat interval timer (null after destroy). */
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  /**
   * Phase 4b DEATH-01 pivot latch.
   *
   * `true` while `hp === 0 && death.failure < 3` (renderer is in `'death-saves'`
   * mode); `false` otherwise (renderer is in `'standard'` mode). The
   * `renderer.setMode` call only fires when this field's value changes —
   * see {@link _onDelta} for the transition logic.
   */
  private pivotLatched = false;

  /**
   * Phase 10 Plan 10-01 — SYNC LOST chip state.
   *
   * Non-null while the WS is disconnected and `WsReconnectController` is in the
   * backoff window. The chip replaces the R1 hint chip in the footer row.
   * Set via {@link setSyncLost}; read by {@link _renderNow} on every render.
   *
   * In-memory only — lost on Even App reload (acceptable for MVP per D-Area1).
   *
   * @see packages/g2-app/src/engine/ws-reconnect.ts (caller)
   * @see packages/g2-app/src/internal/boot-engine-core.ts (wiring)
   */
  private syncLostState: { retryInMs: number } | null = null;

  constructor(opts: StatusHudLayerOpts) {
    this.bridge = opts.bridge;
    this.renderer = opts.renderer;
    this.containerName = opts.containerName ?? DEFAULT_CONTAINER_NAME;
    this.debounceMs = opts.debounceMs ?? DEFAULT_DEBOUNCE_MS;
    this.heartbeatMs = opts.heartbeatMs ?? DEFAULT_HEARTBEAT_MS;
    this.layerManager = opts.layerManager ?? null;

    // Subscribe to the 3 WS channels (character.delta, r1.movement.budget,
    // r1.action.economy) and cache their unsubscribe fns. Extracted into a helper
    // so rebindWsEvents() can re-run it against a fresh source on reconnect.
    // Field initialisers below satisfy strict definite-assignment; subscribeWsEvents
    // reassigns them immediately.
    this.unsubscribe = () => undefined;
    this.unsubscribeMovement = () => undefined;
    this.unsubscribeEconomy = () => undefined;
    this.subscribeWsEvents(opts.wsEvents);

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
   * Return the most-recent valid `CharacterSnapshot` seen via WS delta.
   *
   * Returns `null` if no valid delta has been received yet (first-boot loading
   * state). Callers must handle `null` gracefully (e.g. boot-engine-core step 11f
   * snapshot lookup for SlotPickerPanel enrichment — Plan 09-04 Task 3).
   *
   * Bearer-bound: the snapshot is sourced from the bearer-authenticated WS
   * session; it cannot contain another player's data (T-09-05 mitigation).
   *
   * @returns Latest valid snapshot, or `null` if not yet received.
   */
  getCachedSnapshot(): CharacterSnapshot | null {
    return this.snapshot;
  }

  /**
   * Phase 10 Plan 10-01 — mount or unmount the SYNC LOST chip.
   *
   * Called by `WsReconnectController` in `boot-engine-core.ts` during the
   * reconnect backoff window. When non-null, every subsequent `_renderNow` call
   * passes the state to `renderer.renderContextChip(lm, locale, { syncLost })`
   * which replaces the R1 hint chip with the countdown string.
   *
   * **Transition-driven:** if the new value is structurally equal to the stored
   * value (both null, or both have the same `retryInMs`), the call is a no-op to
   * avoid redundant re-renders (mirror of `setMovementBudget` SHR-MV-03 pattern).
   *
   * Per D-Area1: SYNC LOST chip state is in-memory only — DO NOT persist to
   * Even Hub localStorage or any external storage tier.
   *
   * @param state `{ retryInMs: number }` to mount/update the chip, or `null` to
   *   unmount (restore normal R1 hint chip). `retryInMs === 0` signals in-flight
   *   reconnect attempt (sentinel — buildSyncLostChip handles the 0ms case).
   */
  setSyncLost(state: { retryInMs: number } | null): void {
    // Transition guard — no-op if structurally identical
    const same =
      (state === null && this.syncLostState === null) ||
      (state !== null &&
        this.syncLostState !== null &&
        state.retryInMs === this.syncLostState.retryInMs);
    if (same) return;
    this.syncLostState = state;
    this._scheduleDebouncedRender();
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
    this.unsubscribeMovement();
    this.unsubscribeEconomy();
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Rebind all WS subscriptions onto a fresh `wsEvents` source (R1 reconnect —
   * quick-task 260529-khy Wave 1).
   *
   * On a WS reconnect the old socket's `addEventListener('message', …)` bindings are
   * dead and cannot be redirected, so `boot-engine-core` builds a NEW `wsEvents` bus
   * over the live socket and calls this method. It drops the 3 current subscriptions
   * (character.delta, r1.movement.budget, r1.action.economy) and re-subscribes the
   * same 3 channels against `newWsEvents`, storing the fresh unsub closures so
   * `destroy()` continues to release the current (post-rebind) subscriptions.
   *
   * No double-subscribe: the old source's subscriptions are released before the new
   * ones are created.
   *
   * @param newWsEvents The wsEvents source over the new live socket.
   */
  rebindWsEvents(newWsEvents: CharacterDeltaEvents): void {
    this.unsubscribe();
    this.unsubscribeMovement();
    this.unsubscribeEconomy();
    this.subscribeWsEvents(newWsEvents);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Internal — subscription wiring
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Subscribe the 3 WS channels against `src` and store their unsub closures.
   *
   * Called from the constructor and from {@link rebindWsEvents}. Each subscription
   * dispatches into the corresponding `_on*` validator → renderer setter path.
   *
   * @param src The wsEvents source to subscribe against.
   */
  private subscribeWsEvents(src: CharacterDeltaEvents): void {
    // character.delta — validated snapshot → cache + debounced redraw.
    this.unsubscribe = src.subscribe(CHARACTER_DELTA_CHANNEL, (raw) => this._onDelta(raw));
    // Phase 8 Plan 08-04 — r1.movement.budget → renderer.setMovementBudget.
    this.unsubscribeMovement = src.subscribe(R1_MOVEMENT_BUDGET_TYPE, (raw) =>
      this._onMovementBudget(raw),
    );
    // Phase 9 Plan 09-02 — r1.action.economy → renderer.setActionEconomy.
    this.unsubscribeEconomy = src.subscribe(R1_ACTION_ECONOMY_TYPE, (raw) =>
      this._onActionEconomy(raw),
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Internal — delta receive + debounced render
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Phase 8 Plan 08-04 — receive a raw `r1.movement.budget` envelope payload.
   *
   * Validates via `MovementBudgetPayloadSchema.safeParse` (T-4a-04-01 pattern).
   * On parse failure: `console.warn` + ignore (no throw, no crash).
   * On success: calls `renderer.setMovementBudget` with the budget — the renderer's
   * transition guard (SHR-MV-03) ensures no redundant re-renders.
   *
   * Does NOT schedule a debounced re-render (the movement chip update is
   * lightweight and driven by the movement tracker emitting per-token-move).
   */
  private _onMovementBudget(raw: unknown): void {
    const parsed = MovementBudgetPayloadSchema.safeParse(raw);
    if (!parsed.success) {
      console.warn(
        '[EVF] status-hud-layer: malformed r1.movement.budget payload — ignoring.',
        parsed.error.message,
      );
      return;
    }
    this.renderer.setMovementBudget({
      remaining: parsed.data.remainingFeet,
      total: parsed.data.walkSpeed,
    });
    // Schedule a debounced re-render so the chip appears in the HUD
    this._scheduleDebouncedRender();
  }

  /**
   * Phase 9 Plan 09-02 — receive a raw `r1.action.economy` envelope payload.
   *
   * Validates via `ActionEconomyPayloadSchema.safeParse` (T-4a-04-01 pattern).
   * On parse failure: `console.warn` + ignore (no throw, no crash).
   * On success: calls `renderer.setActionEconomy` with the parsed widget state.
   * The renderer's transition guard (SHR-EW-04) ensures no redundant re-renders.
   *
   * **Multi-attack details:** `multiAttackInProgress` boolean is forwarded;
   * the `multiAttack: {current, total}` sub-object is NOT set here — multi-attack
   * progress details remain in the multi-attack-progress dispatcher's domain.
   * The status-hud-layer only knows about the boolean flag.
   *
   * Schedules a debounced re-render so the widget appears in the HUD.
   */
  private _onActionEconomy(raw: unknown): void {
    const parsed = ActionEconomyPayloadSchema.safeParse(raw);
    if (!parsed.success) {
      console.warn(
        '[EVF] status-hud-layer: malformed r1.action.economy payload — ignoring.',
        parsed.error.message,
      );
      return;
    }
    // Zod .min(0).max(1) validates range at runtime but infers `number`;
    // cast to the literal union here — the schema is the authoritative guard.
    this.renderer.setActionEconomy({
      actionsUsed: parsed.data.actionsUsed as 0 | 1,
      bonusActionsUsed: parsed.data.bonusActionsUsed as 0 | 1,
      reactionsUsed: parsed.data.reactionsUsed as 0 | 1,
      multiAttackInProgress: parsed.data.multiAttackInProgress,
    });
    this._scheduleDebouncedRender();
  }

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

    // Phase 4b DEATH-01 — pivot latch.
    // Trigger condition (verified from dnd5e v5.x `actor.system.attributes.death`):
    //   - hp === 0 AND death.failure < 3 → ENTER death-saves mode
    //   - hp > 0                          → EXIT (recovery — return to standard)
    //   - hp === 0 AND failure === 3     → STAY latched (PC dead; no exit until
    //                                       Phase 7+ revive event)
    // Latch is transition-driven: renderer.setMode is only called when the
    // computed latch value differs from the stored one (SHL-PIVOT-6).
    const recovering = parsed.data.hp > 0;
    const entering = parsed.data.hp === 0 && parsed.data.death.failure < 3;
    // Computed desired latch value:
    //   - if recovering: false (exit)
    //   - if entering: true
    //   - else (HP=0 + failure=3 = dead): preserve existing latch state
    let nextLatched: boolean;
    if (recovering) {
      nextLatched = false;
    } else if (entering) {
      nextLatched = true;
    } else {
      // hp === 0 && failure === 3 (or any other non-entering, non-recovering
      // state). Preserve latch — death-saves stays rendered until revive.
      nextLatched = this.pivotLatched;
    }
    if (nextLatched !== this.pivotLatched) {
      this.pivotLatched = nextLatched;
      this.renderer.setMode(nextLatched ? 'death-saves' : 'standard');
    }

    this._scheduleDebouncedRender();
  }

  /**
   * Test-only accessor — return the current DEATH-01 pivot latch state.
   *
   * Production code MUST NOT gate behaviour on this getter — the latch is
   * an internal side-effect of `_onDelta`, and the renderer mode is the
   * single source of truth for the rendering branch. Exposed here so
   * `SHL-PIVOT-1/3/6` can assert latch lifecycle without mocking the
   * renderer.
   *
   * @returns `true` iff the renderer is in death-saves mode.
   */
  getPivotLatched(): boolean {
    return this.pivotLatched;
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
   * Produces two lines of content:
   *   1. The 28×21 corner card (AsciiGrid.toString()) — always-visible status HUD.
   *   2. The R1 context chip footer row (Phase 6 Plan 03 — NAV-01 + INV-5 visible
   *      enforcement). The chip reads `layerManager.getTopLayer()?.getR1Hints?.()`
   *      on every render so it always names the live Quick-Action (over-scroll) target.
   *
   * Both are concatenated into a single `textContainerUpgrade` payload. The
   * bridge displays them sequentially as the corner-card content + footer chip.
   *
   * Never throws — bridge rejections propagate as Promise rejections to the
   * caller (LayerManager handles error logging at the call site).
   */
  private async _renderNow(): Promise<void> {
    const grid =
      this.snapshot !== null ? this.renderer.render(this.snapshot) : this.renderer.renderLoading();
    // Phase 10 Plan 10-01 — pass syncLostState to renderContextChip so the SYNC LOST
    // chip replaces the R1 hint chip when the WS is disconnected (D-Area1, T-10-01).
    const chip = this.renderer.renderContextChip(this.layerManager, this.renderer.locale, {
      syncLost: this.syncLostState,
    });
    const payload = new TextContainerUpgrade({
      containerName: this.containerName,
      content: `${grid.toString()}\n${chip}`,
    });
    await this.bridge.textContainerUpgrade(payload);
  }
}
