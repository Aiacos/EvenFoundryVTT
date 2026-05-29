/**
 * DebugMirror — mirrors what the G2 glasses *would* render back to the bridge
 * debug feed (the high-value "what the glasses show" stream once physical glasses
 * arrive). Quick Task 260529-h5e Wave 4.
 *
 * Copies the {@link PerfProbe} zero-overhead pattern: when `enabled` is false,
 * `record()` returns immediately on the very first line — no allocations, no
 * timestamp, no `send` call. Production boots pass `enabled: false` (default off);
 * the mirror is constructed enabled ONLY under `?debug=true` (see boot-engine-core).
 *
 * The mirror is fully injected into the LayerManager (the manager never imports
 * bridge HTTP) — the `send` impl is constructed in boot and POSTs the
 * {@link DisplayOpPayload} to the bridge `/debug/displayop` endpoint.
 *
 * @see ./perf-probe.ts (the zero-overhead pattern this mirrors)
 * @see ./layer-manager.ts (optional `debugMirror` DI)
 * @see packages/bridge/src/debug/debug-routes.ts (POST /debug/displayop sink)
 */

import type { DisplayOpPayload } from '@evf/shared-protocol';

/** Constructor options for {@link DebugMirror}. */
export interface DebugMirrorOpts {
  /** When false (default in production), `record()` is a hard no-op. */
  enabled: boolean;
  /** Sink invoked once per recorded op (e.g. POST to bridge /debug/displayop). */
  send: (payload: DisplayOpPayload) => void;
  /** Clock injection for tests; defaults to `Date.now`. */
  now?: () => number;
}

/**
 * Zero-overhead display-op mirror.
 *
 * When disabled, `record()` short-circuits before any work (PerfProbe parity).
 * When enabled, it stamps `ts` and forwards a complete {@link DisplayOpPayload}
 * to the injected `send` sink exactly once per call.
 */
export class DebugMirror {
  private readonly enabled: boolean;
  private readonly send: (payload: DisplayOpPayload) => void;
  private readonly now: () => number;

  constructor(opts: DebugMirrorOpts) {
    this.enabled = opts.enabled;
    this.send = opts.send;
    this.now = opts.now ?? (() => Date.now());
  }

  /**
   * Record a display op. **No-op when disabled** — zero allocations, no `send`.
   *
   * Stamps `ts` from the injected clock and forwards the payload to `send`.
   *
   * @param op - The display op minus `ts` (the mirror stamps `ts` itself).
   */
  record(op: Omit<DisplayOpPayload, 'ts'>): void {
    if (!this.enabled) {
      return;
    }
    this.send({ ...op, ts: this.now() });
  }
}
