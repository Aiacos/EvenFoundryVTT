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
   * 3. If session has the cap (or no cap is required), sends the envelope
   * 4. Pushes the per-session envelope to ReplayBuffer
   * 5. Updates SessionStore lastSeq
   *
   * @param type    - Delta type discriminant (e.g. "character.delta")
   * @param payload - Delta payload (any serialisable value)
   */
  emitDelta(type: string, payload: unknown): void {
    const seq = ++this.globalSeq;
    const ts = Date.now();

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
