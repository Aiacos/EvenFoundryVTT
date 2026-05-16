/**
 * SeqTracker — singleton-free tracker for the last confirmed WS envelope sequence number.
 *
 * Constructed once in `boot-engine-core.ts` and shared with `WsReconnectController`.
 * Every successfully-parsed inbound envelope should be passed to `observe()` to keep
 * `lastConfirmedSeq` current; on reconnect the controller reads `getLastConfirmedSeq()`
 * to populate `client_resume.last_seq`.
 *
 * **Hot path:** `observe()` is a pure number compare — no Zod parse, no allocations.
 * The WS parse already happened upstream in `createWsEventBus`; this class only tracks
 * the monotonic high-water mark.
 *
 * **Monotonic invariant:** `observe()` only advances the tracked value. Out-of-order
 * delivery (seq < current) is silently ignored — the tracker stays monotonic and lets
 * `WsReconnectController` decide whether to recover via a `client_resume` gap detection
 * round-trip. Per D-Area1 T-10-01 design note: the bridge's seq-overflow detection is
 * the authority; the client never bypasses it.
 *
 * **In-memory only:** the seq is lost on Even App reload (acceptable for MVP per
 * CONTEXT.md §Area 1 — single-tenant homelab). `reset()` is called by
 * `WsReconnectController` on `resume_full_snapshot` to discard stale state and
 * force a fresh snapshot fetch.
 *
 * @see .planning/phases/10-polish-field-test-mvp/10-01-PLAN.md Task 1
 * @see .planning/phases/10-polish-field-test-mvp/10-CONTEXT.md §Area 1
 * @see packages/g2-app/src/engine/ws-reconnect.ts (consumer)
 * @see packages/g2-app/src/internal/boot-engine-core.ts (construction site)
 */
export class SeqTracker {
  /**
   * Last confirmed envelope sequence number.
   *
   * Initialised to `-1` to distinguish "no envelope seen yet" from seq=0.
   * The `ClientResumeSchema` requires `last_seq >= 0`; `WsReconnectController`
   * clamps to 0 when this is negative (cold cache signal).
   */
  private lastSeq: number = -1;

  /**
   * Update the tracker with the seq from an inbound envelope.
   *
   * Duck-typed: accepts any object with a numeric `seq` field. This keeps the
   * hot path lean — the upstream WS parser already validated the envelope shape.
   *
   * **Monotonic guard:** if `env.seq <= this.lastSeq`, the call is a no-op.
   * This handles out-of-order replay fragments delivered during a reconnect
   * window without corrupting the high-water mark.
   *
   * Per T-10-01 design note: gap detection (seq > lastSeq + 1) is intentionally
   * NOT handled here — tracker stays monotonic and lets the bridge's
   * `resume_full_snapshot { reason: 'buffer_gap' }` response be the authority.
   *
   * @param env Any object carrying a `seq: number` field (e.g. `DeltaEnvelope`).
   */
  observe(env: { seq: number }): void {
    if (env.seq > this.lastSeq) {
      this.lastSeq = env.seq;
    }
  }

  /**
   * Return the current last-confirmed sequence number.
   *
   * Returns `-1` if no envelope has been observed yet (cold cache).
   * `WsReconnectController` interprets a negative value as "send client_resume
   * with last_seq=0" per the `ClientResumeSchema` nonnegative constraint.
   *
   * @returns The monotonic high-water mark, or `-1` if unset.
   */
  getLastConfirmedSeq(): number {
    return this.lastSeq;
  }

  /**
   * Reset the tracker to the initial state (`lastConfirmedSeq = -1`).
   *
   * Called by `WsReconnectController` when the bridge replies with
   * `resume_full_snapshot { reason: ... }` — the client must discard its cached
   * seq and request a fresh snapshot via the REST fallback (GET /v1/actor).
   * After reset, `getLastConfirmedSeq()` returns `-1` again until the next
   * envelope arrives.
   *
   * Per D-Area1: seq tracking is in-memory only — reset is equivalent to an
   * app reload from the server's perspective.
   */
  reset(): void {
    this.lastSeq = -1;
  }
}
