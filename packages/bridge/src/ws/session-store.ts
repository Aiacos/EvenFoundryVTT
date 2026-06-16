/**
 * In-memory session store for active WS sessions.
 *
 * Each WS handshake creates a `Session` entry. Sessions are looked up by
 * `sessionId` (UUID v4) on reconnect (T-02-02 replay seq validation).
 *
 * MVP: single in-process Map (single-tenant homelab).
 * Phase 13 stretch: promote to Redis for multi-tenant / cluster support.
 *
 * @see Specs.md §11.5.5 (storage tiers)
 */
import { randomUUID } from 'node:crypto';

/** Active WS session. */
export interface Session {
  /** UUID v4 — assigned at `createSession`, returned to client in handshake response. */
  sessionId: string;
  /** Opaque bearer token (never logged; used for re-validation on reconnect). */
  token: string;
  /** BCP-47 primary tag forwarded from the handshake client message. */
  locale: string;
  /** Capability intersection (server ∩ client) agreed during handshake. */
  caps: string[];
  /** Monotonically increasing seq counter for this session. */
  lastSeq: number;
  /** Unix ms timestamp when the session was created. */
  createdAt: number;
  /**
   * Selected PC actor id pinned for this session (FLV-CHAR-SELECT).
   *
   * When set, only `character.delta` envelopes for this actor are delivered to
   * this session — prevents cross-player character leakage (T-flv-01). Set from
   * the `actorId` field of the client's `HandshakeClient` message.
   *
   * `undefined` = no pin; last-write-wins `roster[0]` semantics apply.
   */
  readonly selectedActorId?: string;
}

/**
 * In-memory store for active WS sessions.
 *
 * Thread-safe in single-process Node; no locking required for MVP.
 */
export class SessionStore {
  private readonly sessions = new Map<string, Session>();

  /**
   * Create a new session and store it.
   *
   * Returns the full `Session` object (caller passes `session_id` to client).
   *
   * @param token          - Opaque bearer token (never logged).
   * @param locale         - BCP-47 primary tag from the handshake client message.
   * @param caps           - Capability intersection agreed during handshake.
   * @param selectedActorId - Optional selected PC actor id (FLV-CHAR-SELECT).
   *                          When set, only `character.delta` for this actor is
   *                          delivered to the session. `undefined` means no pin
   *                          (last-write-wins `roster[0]` semantics).
   */
  createSession(token: string, locale: string, caps: string[], selectedActorId?: string): Session {
    const session: Session = {
      sessionId: randomUUID(),
      token,
      locale,
      caps,
      lastSeq: 0,
      createdAt: Date.now(),
      ...(selectedActorId !== undefined ? { selectedActorId } : {}),
    };
    this.sessions.set(session.sessionId, session);
    return session;
  }

  /**
   * Look up an existing session by ID.
   *
   * Returns `undefined` if not found (session expired or never existed).
   */
  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Update the `lastSeq` counter for a session.
   *
   * Called after each delta envelope is emitted to the client (T-02-02).
   * No-op if the session is not found.
   */
  updateLastSeq(sessionId: string, seq: number): void {
    const session = this.sessions.get(sessionId);
    if (session !== undefined) {
      session.lastSeq = seq;
    }
  }

  /**
   * Remove a session from the store.
   *
   * Called when the WS connection is permanently closed (not a reconnect).
   */
  deleteSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  /** Visible for testing: number of active sessions. */
  get size(): number {
    return this.sessions.size;
  }

  /**
   * Best-effort "focus actor" for map auto-framing: the `selectedActorId` of the
   * most-recently-created session that has one, or `null` if none is pinned.
   *
   * Single-glasses MVP: there is normally exactly one such session. Deterministic
   * tie-break: highest `createdAt` wins (the freshest selection). Read by the
   * frame-POST piggyback (routes/internal-delta.ts) so the stream-leader Foundry
   * client can center the captured map region on the player's chosen PC.
   */
  getFocusActorId(): string | null {
    let best: Session | null = null;
    for (const s of this.sessions.values()) {
      if (s.selectedActorId === undefined) continue;
      if (best === null || s.createdAt > best.createdAt) best = s;
    }
    return best?.selectedActorId ?? null;
  }

  /**
   * Return a snapshot array of all active sessions.
   *
   * Used by the dev-only debug snapshot route (Quick Task 260529-h5e) to render a
   * redacted session table. Returns a fresh array; mutating it does not affect the
   * store. Token values are present on the returned objects — callers MUST redact
   * (the debug route emits only a `tokenHint`, never the raw token).
   */
  listSessions(): Session[] {
    return Array.from(this.sessions.values());
  }
}
