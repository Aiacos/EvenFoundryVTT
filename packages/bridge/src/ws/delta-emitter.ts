/**
 * Bridge WS delta emitter — fans out delta envelopes to all subscribed sessions.
 *
 * Maintains a Map<sessionId, WebSocket> of live WS connections. On every delta,
 * creates an Envelope, sends it to all sessions with matching capabilities, and
 * pushes it to the replay buffer for reconnect support.
 *
 * Security (T-02-02): globalSeq is monotonically increasing. Each emitted envelope
 * receives `seq = ++globalSeq`. Bridge rejects client acks with out-of-order seq.
 *
 * Capability matching: a session receives a delta only if it has the matching
 * server cap in its `Session.caps` array. Example:
 * - "character.delta" → requires "read_char"
 * - "combat.turn" | "combat.state" | "combat.targets" → requires "read_combat"
 * - "scene.viewport" → requires "read_scene"
 * - "event.log.delta" → requires "subscribe"
 * If no specific cap is found, the delta is sent to all sessions (open design).
 *
 * @see docs/architecture/0002-protocol-versioning.md (envelope + replay contract)
 * @see packages/bridge/src/ws/replay-buffer.ts (60s replay buffer per session)
 * @see packages/bridge/src/ws/session-store.ts (Session.caps)
 * @see 02-05-PLAN.md Task 2 (delta-emitter.ts spec)
 */

import type { Envelope } from '@evf/shared-protocol';
import type { WebSocket } from 'ws';
import type { ReplayBuffer } from './replay-buffer.js';
import type { Session, SessionStore } from './session-store.js';

// ─── Capability routing map ────────────────────────────────────────────────────

/**
 * Maps delta type prefixes to the capability required to receive them.
 *
 * If a session's caps array does not contain the required cap, the delta is
 * silently dropped for that session.
 */
const DELTA_CAP_MAP: Record<string, string> = {
  'character.delta': 'read_char',
  'combat.turn': 'read_combat',
  'combat.state': 'read_combat',
  'combat.targets': 'read_combat',
  'scene.viewport': 'read_scene',
  'event.log.delta': 'subscribe',
};

// ─── DeltaEmitter ─────────────────────────────────────────────────────────────

/**
 * Manages live WS session fanout and replay buffer integration.
 *
 * Lifecycle:
 * 1. `registerSession(sessionId, ws)` — called after handshake succeeds
 * 2. `emitDelta(type, payload)` — called from `/internal/delta` route on receipt
 * 3. `unregisterSession(sessionId)` — called on WS close
 *
 * @example
 * ```ts
 * const emitter = new DeltaEmitter(replayBuffer, sessionStore);
 * emitter.registerSession(session.sessionId, socket);
 * emitter.emitDelta('character.delta', snapshot);
 * emitter.unregisterSession(session.sessionId);
 * ```
 */
export class DeltaEmitter {
  /** Live WS connections keyed by sessionId. */
  private readonly connections = new Map<string, WebSocket>();
  /** Global monotonic seq counter (per-bridge-instance). T-02-02. */
  private globalSeq = 0;

  /**
   * ADDITIVE dev-only observability hook (Quick Task 260529-h5e).
   *
   * Invoked at the END of {@link emitDelta} ONLY when set. Default `undefined`
   * means ZERO overhead and byte-identical behavior in production — the emitter
   * has no knowledge of the debug bus (server.ts sets this in debug mode only).
   *
   * @param type    - The delta type just emitted.
   * @param payload - The delta payload just emitted.
   * @param seq     - The seq assigned to this delta.
   */
  onEmit?: (type: string, payload: unknown, seq: number) => void;

  constructor(
    private readonly replayBuffer: ReplayBuffer,
    private readonly sessionStore: SessionStore,
  ) {}

  /**
   * Register a live WS connection for a session.
   *
   * Called after the WS handshake completes successfully.
   */
  registerSession(sessionId: string, ws: WebSocket): void {
    this.connections.set(sessionId, ws);
  }

  /**
   * Unregister a WS connection (on close or error).
   */
  unregisterSession(sessionId: string): void {
    this.connections.delete(sessionId);
  }

  /**
   * Emit a typed delta to all sessions with matching capabilities.
   *
   * For each registered session:
   * 1. Looks up the session in SessionStore to check caps
   * 2. Checks capability requirement for this delta type
   * 3. **character.delta actor gate (FLV-CHAR-SELECT):** when ALL THREE are present —
   *    `type === 'character.delta'` AND `session.selectedActorId` is set AND
   *    `payload.actorId` is a string — the delta is only delivered when
   *    `session.selectedActorId === payload.actorId`. If any of the three is absent,
   *    the gate does not fire (current broadcast behavior is preserved). This prevents
   *    cross-player character leakage (T-flv-01) while keeping backward compatibility
   *    for sessions without a pin and payloads without an actorId field.
   * 4. If session has the cap (or no cap is required), sends the envelope
   * 5. Pushes the per-session envelope to ReplayBuffer
   * 6. Updates SessionStore lastSeq
   *
   * @param type    - Delta type discriminant (e.g. "character.delta")
   * @param payload - Delta payload (any serialisable value)
   */
  emitDelta(type: string, payload: unknown): void {
    const seq = ++this.globalSeq;
    const ts = Date.now();

    // Extract payload.actorId defensively for the character.delta targeting gate.
    const payloadActorId: string | undefined =
      type === 'character.delta' &&
      typeof payload === 'object' &&
      payload !== null &&
      'actorId' in payload &&
      typeof (payload as { actorId?: unknown }).actorId === 'string'
        ? (payload as { actorId: string }).actorId
        : undefined;

    for (const [sessionId, ws] of this.connections.entries()) {
      const session = this.sessionStore.getSession(sessionId);
      if (session === undefined) {
        // Session not found in store — skip and clean up stale connection
        this.connections.delete(sessionId);
        continue;
      }

      // Capability check
      const requiredCap = DELTA_CAP_MAP[type];
      if (requiredCap !== undefined && !session.caps.includes(requiredCap)) {
        continue; // Session does not have the required capability
      }

      // character.delta actor targeting gate (FLV-CHAR-SELECT / T-flv-01).
      // Gate fires ONLY when all three are present to preserve broadcast back-compat.
      if (
        type === 'character.delta' &&
        session.selectedActorId !== undefined &&
        payloadActorId !== undefined &&
        session.selectedActorId !== payloadActorId
      ) {
        continue; // This session is pinned to a different actor — skip.
      }

      const envelope: Envelope = {
        proto: 'evf-v1',
        seq,
        ts,
        type,
        session_id: sessionId,
        payload,
      };

      // Send to client (ignore send errors — client may have disconnected)
      try {
        ws.send(JSON.stringify(envelope));
      } catch {
        // Connection error — unregister stale session
        this.connections.delete(sessionId);
        continue;
      }

      // Push to replay buffer (per-session envelope with correct session_id)
      this.replayBuffer.push(envelope);

      // Update session's lastSeq in store (T-02-02)
      this.sessionStore.updateLastSeq(sessionId, seq);
    }

    // ADDITIVE dev-only observability hook — no-op unless set (Quick Task 260529-h5e).
    this.onEmit?.(type, payload, seq);
  }

  /**
   * Send an initial targeted delta to a single newly-connected session.
   *
   * This is the on-connect push counterpart to {@link emitDelta}. Where
   * `emitDelta` fans out to ALL sessions with the matching capability,
   * `sendInitialToSession` sends to ONE session only — the session that just
   * completed the WS handshake.
   *
   * Behaviour is intentionally identical to a single-session `emitDelta` leg:
   * - Capability gate via {@link DELTA_CAP_MAP}: if the session lacks the
   *   required cap, nothing is sent and `globalSeq` is NOT incremented.
   * - Seq is allocated AFTER the cap check (same ordering as `emitDelta`).
   * - The envelope is pushed to the {@link ReplayBuffer} and
   *   `sessionStore.updateLastSeq` is called (mirror of `emitDelta`).
   * - Send errors remove the stale connection and do NOT propagate.
   * - Unknown / unregistered `sessionId` is a no-op.
   *
   * Security (T-d0v-01): a session without the required cap receives nothing —
   * no actor data leaks to under-capable clients.
   *
   * @param sessionId - UUID v4 of the newly-connected session.
   * @param type      - Delta type (e.g. `'character.delta'`).
   * @param payload   - Validated delta payload (any serialisable value).
   */
  sendInitialToSession(sessionId: string, type: string, payload: unknown): void {
    const ws = this.connections.get(sessionId);
    if (ws === undefined) {
      // Unknown / unregistered session — no-op (DE-INIT-05).
      return;
    }

    const session = this.sessionStore.getSession(sessionId);
    if (session === undefined) {
      // Session not found in store — clean up stale connection entry and return.
      this.connections.delete(sessionId);
      return;
    }

    // Capability check (DE-INIT-04) — must happen BEFORE seq allocation.
    const requiredCap = DELTA_CAP_MAP[type];
    if (requiredCap !== undefined && !session.caps.includes(requiredCap)) {
      return; // Session lacks cap — seq must NOT increment.
    }

    const seq = ++this.globalSeq;
    const ts = Date.now();

    const envelope: Envelope = {
      proto: 'evf-v1',
      seq,
      ts,
      type,
      session_id: sessionId,
      payload,
    };

    try {
      ws.send(JSON.stringify(envelope));
    } catch {
      // Send error — remove stale connection (DE-INIT-06).
      this.connections.delete(sessionId);
      return;
    }

    this.replayBuffer.push(envelope);
    this.sessionStore.updateLastSeq(sessionId, seq);

    // Parity with emitDelta: invoke debug observability hook if set.
    this.onEmit?.(type, payload, seq);
  }

  /**
   * Current number of registered live connections.
   *
   * Visible for testing.
   */
  get connectionCount(): number {
    return this.connections.size;
  }

  /**
   * Current global seq value.
   *
   * Visible for testing to verify monotonic increments.
   */
  get currentSeq(): number {
    return this.globalSeq;
  }

  /** @internal Reset globalSeq to 0 — for testing only. */
  _resetSeq(): void {
    this.globalSeq = 0;
  }

  /**
   * Returns the session data for a given sessionId from the session store.
   * Visible for testing.
   *
   * @param sessionId - UUID v4 session identifier
   */
  getSession(sessionId: string): Session | undefined {
    return this.sessionStore.getSession(sessionId);
  }
}
