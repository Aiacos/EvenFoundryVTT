/**
 * 60-second LRU replay buffer — per-session FIFO queue of delta envelopes.
 *
 * On reconnect within 60s, clients send `session_id` + `replay_seq` (last seq received).
 * Bridge replays all buffered envelopes with seq > replay_seq to fill the gap.
 * Beyond 60s, client falls back to full-state GET (REST snapshot endpoints).
 *
 * Memory bound: max ~60s × delta rate per session.
 * Acceptable for single-tenant MVP (Specs.md §11.5.5 / §11.5.8.1).
 *
 * @see docs/architecture/0002-protocol-versioning.md
 * @see Specs.md §11.5.8.1 (reconnect with replay buffer)
 */
import type { Envelope } from '@evf/shared-protocol';

/** Eviction window: 60 seconds in milliseconds. */
const REPLAY_TTL_MS = 60_000;

/**
 * Per-session replay buffer.
 *
 * Keyed by `session_id`. Each session holds a FIFO queue of emitted envelopes.
 * Eviction is eager: on every `push`, stale entries (> 60s old) are removed.
 *
 * @example
 * ```ts
 * const buffer = new ReplayBuffer();
 * buffer.push(envelope);
 * const missed = buffer.replay(sessionId, lastSeq);
 * ```
 */
export class ReplayBuffer {
  private readonly sessions = new Map<string, Envelope[]>();

  /**
   * Push a delta envelope into the replay buffer for its session.
   *
   * Also evicts all entries older than 60s for that session (eager eviction).
   */
  push(env: Envelope): void {
    const sessionId = env.session_id;
    const existing = this.sessions.get(sessionId) ?? [];

    // Eager eviction: remove entries older than REPLAY_TTL_MS relative to this envelope's ts.
    const cutoff = env.ts - REPLAY_TTL_MS;
    const fresh = existing.filter((e) => e.ts >= cutoff);

    fresh.push(env);
    this.sessions.set(sessionId, fresh);
  }

  /**
   * Replay all buffered envelopes for a session with seq > fromSeq.
   *
   * Returns an empty array if the session has no buffered entries or if
   * `fromSeq` is at/beyond the latest buffered seq.
   */
  replay(sessionId: string, fromSeq: number): Envelope[] {
    const entries = this.sessions.get(sessionId) ?? [];
    return entries.filter((e) => e.seq > fromSeq);
  }

  /**
   * Return the last (highest) seq number buffered for a session.
   *
   * Returns `0` if no entries exist (new session or all evicted).
   * Used to populate `replay_seq` in the handshake response.
   */
  lastSeq(sessionId: string): number {
    const entries = this.sessions.get(sessionId) ?? [];
    if (entries.length === 0) return 0;
    // Entries are FIFO — last element has the highest seq.
    const last = entries[entries.length - 1];
    return last !== undefined ? last.seq : 0;
  }

  /**
   * Total number of buffered envelopes across all sessions.
   *
   * Visible for testing.
   */
  size(): number {
    let total = 0;
    for (const entries of this.sessions.values()) {
      total += entries.length;
    }
    return total;
  }

  /**
   * Detect a gap in the buffered sequence for a session.
   *
   * Returns `true` if the entries with seq > fromSeq are non-contiguous, meaning
   * at least one seq number is missing from the range. A single buffered entry
   * cannot have a gap; zero buffered entries returns `false` (handled separately by
   * `replay()` returning an empty array).
   *
   * Used by the resume handler (T-03-01): if `hasGap` returns `true`, the bridge
   * MUST send `resume_full_snapshot { reason: "buffer_gap" }` and MUST NOT replay
   * the gapped envelopes — a partial replay would hide a real game-state mutation.
   *
   * Implementation guards against `noUncheckedIndexedAccess` by using explicit
   * `prev !== undefined && curr !== undefined` checks (no non-null assertions).
   *
   * @param sessionId - UUID v4 session identifier
   * @param fromSeq   - Last seq the client already has; check entries with seq > fromSeq
   * @returns `true` if any consecutive pair in relevant entries has seq[i] !== seq[i-1]+1
   *
   * @see docs/architecture/0002-protocol-versioning.md
   * @see .planning/phases/03-bridge-service-skeleton/03-01-PLAN.md T-03-01
   */
  hasGap(sessionId: string, fromSeq: number): boolean {
    const entries = this.sessions.get(sessionId) ?? [];
    const relevant = entries.filter((e) => e.seq > fromSeq);

    // Zero or one entry cannot have a gap between consecutive entries.
    if (relevant.length < 2) return false;

    for (let i = 1; i < relevant.length; i++) {
      const prev = relevant[i - 1];
      const curr = relevant[i];
      // Explicit undefined guards per noUncheckedIndexedAccess (Phase 02 pattern).
      if (prev !== undefined && curr !== undefined && curr.seq !== prev.seq + 1) {
        return true;
      }
    }

    return false;
  }

  /**
   * Clear the buffer for a specific session.
   *
   * Used when a session is permanently closed (not a reconnect).
   */
  clearSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }
}
