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
   */
  createSession(token: string, locale: string, caps: string[]): Session {
    const session: Session = {
      sessionId: randomUUID(),
      token,
      locale,
      caps,
      lastSeq: 0,
      createdAt: Date.now(),
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
}
