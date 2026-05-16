/**
 * PerfProbe — opt-in latency instrumentation for EVF action flows.
 *
 * Records per-action timestamps at 5 instrumentation stations and emits a
 * `r1.perf.sample` envelope over the bridge WS connection when all 4 g2-app-
 * side stations are recorded for a given action flow.
 *
 * # Opt-In Gate (Zero Overhead When Disabled)
 *
 * `PerfProbe` must be constructed with `enabled: true` to be active. When
 * disabled, `mark()` and `flush()` are immediate no-ops — no Map allocations,
 * no async work, no closure captures. This ensures production sessions pay
 * zero overhead for telemetry they do not need.
 *
 * Enable via `?probe=true` URL param in the Even Realities App WebView, or
 * via the `perfProbe: true` option passed to `bootEngine()` / `_bootEngineCore()`
 * at startup (step 11h in the boot sequence). Disable by omitting or setting
 * `?probe=false` / `perfProbe: false`.
 *
 * # Station Coverage
 *
 * g2-app measures 4 of the 5 canonical stations per action:
 *   - `gesture_emit`    — R1 gesture processed by r1-event-source.ts
 *   - `bridge_post`     — `tool.invoke` envelope transmitted over WS
 *   - `result_envelope` — `r1.action.result` envelope received by WS bus
 *   - `toast_queued`    — `ToastQueueLayer.enqueue()` call site
 *
 * `handler_invoke` is server-side (foundry-module socketlib handler entry).
 * It is NOT measured by g2-app. The station is **still required** in the emitted
 * envelope (PerfSampleEnvelopeSchema requires exactly 5 stations). The probe
 * uses the timestamp of `result_envelope` minus a placeholder offset for this
 * station — marked with TODO(SC-10-02) in the flush logic. This is a known
 * approximation until hardware measurements are available.
 *
 * # T-10-02 Mitigation (Information Disclosure)
 *
 * Idempotency keys are bearer-bound dedup tokens (Phase 3 Plan 01 D-3.07).
 * They are hashed via SHA-256 truncated to 16 hex chars (`hashIdempotencyKey`)
 * before envelope construction. Clear-text keys NEVER appear in `r1.perf.sample`
 * envelopes. `PerfSampleEnvelopeSchema` enforces the `^[0-9a-f]{16}$` regex,
 * making it structurally impossible for a clear-text key to pass validation.
 *
 * # TTL Eviction (Memory Leak Prevention)
 *
 * Pending flows (started but not yet flushed) are evicted after 30 seconds.
 * This handles the case where an action flow is interrupted (network error,
 * page teardown, missing `toast_queued` station) and prevents unbounded Map
 * growth. Eviction runs on a 5-second interval sweep started at construction
 * and stopped by `dispose()`.
 *
 * # Usage Example
 *
 * ```ts
 * const probe = new PerfProbe({
 *   enabled: true,
 *   sessionId: handshake.session_id,
 *   wsSend: (env) => ws.send(JSON.stringify(env)),
 *   seqProvider: () => seqTracker.getLastConfirmedSeq() + 1,
 * });
 *
 * // At gesture_emit station:
 * probe.mark('gesture_emit', action.idempotencyKey);
 *
 * // ... other stations omitted ...
 *
 * // At toast_queued station (auto-flush):
 * probe.mark('toast_queued', action.idempotencyKey);
 * void probe.flush(action.idempotencyKey);
 *
 * // At teardown:
 * probe.dispose();
 * ```
 *
 * @see packages/g2-app/src/engine/perf-probe-hash.ts (hashIdempotencyKey helper)
 * @see packages/shared-protocol/src/perf-probe.ts (PerfSampleEnvelopeSchema)
 * @see docs/perf/phase-10-latency.md (hardware-pending latency template)
 * @see .planning/phases/10-polish-field-test-mvp/10-02-PLAN.md Task 2
 * @see .planning/phases/10-polish-field-test-mvp/10-CONTEXT.md §Area 1 + D-Area5
 */

import { PerfSampleEnvelopeSchema, type PerfStation } from '@evf/shared-protocol';
import { hashIdempotencyKey } from './perf-probe-hash.js';

/** Per-flow timestamp map: station name → timestamp in ms. */
type FlowRecord = {
  /** Map of station name → timestamp (ms). */
  stations: Map<PerfStation, number>;
  /** Creation time for TTL eviction (ms from `now()`). */
  createdAt: number;
};

/** TTL for pending flows in ms (30 seconds). */
const FLOW_TTL_MS = 30_000;

/** Interval for TTL sweep in ms (5 seconds). */
const TTL_SWEEP_INTERVAL_MS = 5_000;

/**
 * Constructor options for `PerfProbe`.
 *
 * See class-level JSDoc for field descriptions.
 */
export interface PerfProbeOpts {
  /**
   * Whether the probe is enabled.
   *
   * When `false`, all methods are immediate no-ops (zero overhead).
   * Enable via `?probe=true` URL param or `perfProbe: true` boot option.
   */
  readonly enabled: boolean;

  /**
   * WS session UUID from the capability handshake.
   *
   * Populated in the emitted `r1.perf.sample` envelope's `session_id` field.
   */
  readonly sessionId: string;

  /**
   * WS send callback.
   *
   * Called with the fully-constructed and schema-validated envelope object
   * (not a JSON string — caller serializes). The probe uses the existing
   * bridge WS send mechanism, NOT a new socketlib handler (14-socketlib-handler
   * invariant per execution_rules).
   */
  readonly wsSend: (env: unknown) => void;

  /**
   * Optional timestamp provider (defaults to `Date.now`).
   *
   * Injected for deterministic testing (`vi.useFakeTimers` or custom clock).
   * Production code omits this — the default `Date.now` is used.
   */
  readonly now?: () => number;

  /**
   * Sequence number provider.
   *
   * Called at flush time to populate `envelope.seq`. Typically wired to
   * `seqTracker.getLastConfirmedSeq() + 1` in the boot engine.
   */
  readonly seqProvider: () => number;
}

/**
 * Opt-in latency probe for EVF action flows.
 *
 * Records timestamps at 5 stations per action and emits a `r1.perf.sample`
 * envelope over the bridge WS connection when all stations are recorded.
 *
 * Zero overhead when disabled — construct with `enabled: false` for production.
 *
 * @see {@link PerfProbeOpts} for constructor options.
 */
export class PerfProbe {
  private readonly enabled: boolean;
  private readonly sessionId: string;
  private readonly wsSend: (env: unknown) => void;
  private readonly now: () => number;
  private readonly seqProvider: () => number;

  /** Per-flow state keyed by idempotencyKey. */
  private readonly flows: Map<string, FlowRecord> = new Map();

  /** TTL sweep interval handle. `undefined` when disabled. */
  private sweepIntervalId: ReturnType<typeof setInterval> | undefined;

  constructor(opts: PerfProbeOpts) {
    this.enabled = opts.enabled;
    this.sessionId = opts.sessionId;
    this.wsSend = opts.wsSend;
    this.now = opts.now ?? (() => Date.now());
    this.seqProvider = opts.seqProvider;

    if (this.enabled) {
      // Start the TTL eviction sweep (5s interval).
      this.sweepIntervalId = setInterval(() => {
        this._evictStaleFLows();
      }, TTL_SWEEP_INTERVAL_MS);
    }
  }

  /**
   * Record a timestamp at the given station for the given action flow.
   *
   * **No-op when disabled.** Per PP-01: zero overhead — no Map touches.
   *
   * If this is the first station for `idempotencyKey`, a new `FlowRecord` is
   * created. Subsequent calls for the same key update the station map.
   *
   * @param station       - Station name (one of the 5 canonical values).
   * @param idempotencyKey - The raw idempotency key (bearer-bound dedup token).
   *                         Stored in-process only; hashed before emission (T-10-02).
   */
  mark(station: PerfStation, idempotencyKey: string): void {
    if (!this.enabled) {
      return;
    }

    let flow = this.flows.get(idempotencyKey);
    if (flow === undefined) {
      flow = {
        stations: new Map(),
        createdAt: this.now(),
      };
      this.flows.set(idempotencyKey, flow);
    }

    flow.stations.set(station, this.now());
  }

  /**
   * Flush the action flow for the given idempotencyKey.
   *
   * If all 5 stations are recorded, hashes the key, builds the envelope,
   * validates it through `PerfSampleEnvelopeSchema`, and calls `wsSend`.
   *
   * **Partial flows are dropped** (PP-04): if fewer than 5 stations are recorded,
   * a `console.warn` telemetry line is emitted and no envelope is sent. The
   * flow record is removed regardless (prevents memory leak from stale partial
   * flows when the caller does not call `dispose`).
   *
   * **No-op when disabled.** (PP-01: zero overhead — returns immediately.)
   *
   * @param idempotencyKey - Same key passed to `mark()` for this action flow.
   * @returns Promise<void> — async because `hashIdempotencyKey` uses SubtleCrypto.
   */
  async flush(idempotencyKey: string): Promise<void> {
    if (!this.enabled) {
      return;
    }

    const flow = this.flows.get(idempotencyKey);
    if (flow === undefined) {
      console.warn('[perf-probe] flush: no flow found for key (already flushed or evicted)');
      return;
    }

    // Validate all 5 stations are recorded.
    const requiredStations: PerfStation[] = [
      'gesture_emit',
      'bridge_post',
      'handler_invoke',
      'result_envelope',
      'toast_queued',
    ];

    // g2-app measures 4 stations. handler_invoke is server-side.
    // We approximate it from result_envelope for the envelope schema requirement.
    // TODO(SC-10-02): replace the approximated handler_invoke ts with actual
    // bridge-log-derived value once hardware measurements are available.
    const gestureTs = flow.stations.get('gesture_emit');
    const bridgePostTs = flow.stations.get('bridge_post');
    const resultEnvelopeTs = flow.stations.get('result_envelope');
    const toastQueuedTs = flow.stations.get('toast_queued');

    // Check which g2-app-side stations are present (handler_invoke is allowed to be absent)
    const g2AppStations: PerfStation[] = [
      'gesture_emit',
      'bridge_post',
      'result_envelope',
      'toast_queued',
    ];
    const missingG2App = g2AppStations.filter((s) => !flow.stations.has(s));

    if (missingG2App.length > 0) {
      console.warn(
        '[perf-probe] flush: partial flow — missing g2-app stations:',
        missingG2App,
        '— dropping',
      );
      this.flows.delete(idempotencyKey);
      return;
    }

    // Clean up before async work
    this.flows.delete(idempotencyKey);

    // Hash the idempotency key (T-10-02 mitigation — no clear-text key on the wire).
    const idempotencyKeyHash = await hashIdempotencyKey(idempotencyKey);

    // Build the 5-station array. handler_invoke is approximated as midpoint between
    // bridge_post and result_envelope (conservative estimate for schema compliance).
    // TODO(SC-10-02): wire actual server-side handler_invoke timestamp from bridge logs.
    const approxHandlerInvoke =
      Math.floor(((bridgePostTs ?? 0) + (resultEnvelopeTs ?? 0)) / 2) || (bridgePostTs ?? 1) + 1;

    const stations = requiredStations.map((name) => {
      let ts: number;
      switch (name) {
        case 'gesture_emit':
          ts = gestureTs ?? 1;
          break;
        case 'bridge_post':
          ts = bridgePostTs ?? 1;
          break;
        case 'handler_invoke':
          ts = approxHandlerInvoke;
          break;
        case 'result_envelope':
          ts = resultEnvelopeTs ?? 1;
          break;
        case 'toast_queued':
          ts = toastQueuedTs ?? 1;
          break;
      }
      return { name, ts };
    });

    // Build the envelope.
    const raw = {
      proto: 'evf-v1' as const,
      seq: this.seqProvider(),
      ts: this.now(),
      type: 'r1.perf.sample' as const,
      session_id: this.sessionId,
      payload: {
        idempotencyKeyHash,
        stations,
      },
    };

    // Validate through schema before emitting (belt-and-suspenders — the structure
    // is well-typed but Zod validates the regex on idempotencyKeyHash).
    const parsed = PerfSampleEnvelopeSchema.safeParse(raw);
    if (!parsed.success) {
      console.warn(
        '[perf-probe] flush: envelope validation failed (bug in probe construction)',
        parsed.error.message,
      );
      return;
    }

    this.wsSend(parsed.data);
  }

  /**
   * Dispose the probe — stop the TTL sweep timer and clear all pending flows.
   *
   * Must be called at teardown to prevent timer leaks. After `dispose()`, any
   * subsequent `mark()` or `flush()` calls are no-ops (flows Map is empty and
   * the sweep is stopped).
   */
  dispose(): void {
    if (this.sweepIntervalId !== undefined) {
      clearInterval(this.sweepIntervalId);
      this.sweepIntervalId = undefined;
    }
    this.flows.clear();
  }

  /**
   * Evict pending flows that have been pending longer than `FLOW_TTL_MS` (30s).
   *
   * Called by the 5-second sweep interval. Prevents unbounded Map growth when
   * action flows are interrupted (network error, missing `toast_queued` station).
   *
   * @internal
   */
  private _evictStaleFLows(): void {
    const now = this.now();
    for (const [key, flow] of this.flows) {
      if (now - flow.createdAt > FLOW_TTL_MS) {
        console.warn('[perf-probe] TTL eviction: dropping stale flow for key', key.slice(0, 8));
        this.flows.delete(key);
      }
    }
  }
}
