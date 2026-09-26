/**
 * `Room` Durable Object: one instance per room id, pairs a `projector` socket with a
 * `glasses` socket and forwards their frames verbatim (ADR-0019, plan §Design 1).
 *
 * Uses the WebSocket Hibernation API (`state.acceptWebSocket` + `webSocket*` handlers), so an
 * idle room costs nothing. The relay never parses application frames; its own control frames
 * are always JSON `{"relay": "<event>"}`.
 *
 * @see https://developers.cloudflare.com/durable-objects/best-practices/websockets/
 */
import {
  frameByteLength,
  MAX_FRAME_BYTES,
  MAX_FRAMES_PER_WINDOW,
  RATE_WINDOW_MS,
  RateLimiter,
} from './limits.js';
import { isRole, peerOf, type Role } from './routing.js';

/** Close code sent to a socket superseded by a newer socket of the same role. */
export const CLOSE_REPLACED = 4000;
/** Close code for frames larger than {@link MAX_FRAME_BYTES} (RFC 6455 "message too big"). */
export const CLOSE_TOO_BIG = 1009;
/** Close code for sockets over the frame-rate cap (RFC 6455 "policy violation"). */
export const CLOSE_RATE_LIMIT = 1008;

/** Control events the relay emits to a socket. */
export type RelayEvent = 'peer-up' | 'peer-down';

/** The subset of `DurableObjectState` the room uses (narrowed so tests can fake it). */
export type RoomState = Pick<DurableObjectState, 'acceptWebSocket' | 'getWebSockets' | 'getTags'>;

/**
 * Per-socket lifecycle, persisted with `serializeAttachment` so it survives hibernation.
 * `live` = the current socket of its role; `replaced` = superseded (close 4000 sent);
 * `closed` = gone and already announced to the peer. A missing attachment means `live`.
 */
type SocketStatus = 'live' | 'replaced' | 'closed';

interface SocketAttachment {
  readonly status: SocketStatus;
}

function statusOf(ws: WebSocket): SocketStatus {
  const attachment = ws.deserializeAttachment() as SocketAttachment | null;
  return attachment?.status ?? 'live';
}

function setStatus(ws: WebSocket, status: SocketStatus): void {
  ws.serializeAttachment({ status } satisfies SocketAttachment);
}

/**
 * Whether `code` may be passed to `WebSocket#close` (RFC 6455 §7.4: 1005/1006/1015 and
 * unassigned codes are receive-only).
 *
 * @param code - Close code received from the other end.
 * @returns `true` for 1000–1003, 1007–1014 and 3000–4999.
 */
export function isSendableCloseCode(code: number): boolean {
  return (
    (code >= 1000 && code <= 1003) ||
    (code >= 1007 && code <= 1014) ||
    (code >= 3000 && code <= 4999)
  );
}

/** Encodes a relay control frame. */
export function controlFrame(event: RelayEvent): string {
  return JSON.stringify({ relay: event });
}

/**
 * Runs a socket operation that may fail because the other end is already gone; the failure
 * is logged and the room carries on (the peer's own close handler cleans up).
 */
function tolerate(what: string, op: () => void): void {
  try {
    op();
  } catch (err) {
    console.warn(`[EVF relay] ${what} failed:`, String(err));
  }
}

/** Durable Object relaying frames between the two roles of one room. */
export class Room implements DurableObject {
  /** Memory-only: a hibernation wake-up starts fresh limiters, which is fine for an abuse cap. */
  private readonly limiters = new WeakMap<WebSocket, RateLimiter>();

  /** @param state - Durable Object state (the runtime also passes `env`, unused here). */
  constructor(private readonly state: RoomState) {}

  /**
   * Upgrades a request already validated by the Worker (`/r/<room>?role=…` + WebSocket).
   *
   * @param request - The forwarded upgrade request.
   * @returns `101` with the client end of a new socket pair, or `404` for a bad role.
   */
  async fetch(request: Request): Promise<Response> {
    const role = new URL(request.url).searchParams.get('role');
    if (!isRole(role)) return new Response('not found', { status: 404 });
    const pair = new WebSocketPair();
    this.accept(pair[1], role);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  /**
   * Accepts `server` as the socket of `role`: supersedes any previous socket of that role
   * (close 4000, never announced as `peer-down`) and, when the peer is connected, sends
   * `peer-up` to both sides.
   *
   * @param server - Server end of the new socket pair.
   * @param role - Role the socket joins as.
   */
  accept(server: WebSocket, role: Role): void {
    for (const old of this.live(role)) {
      setStatus(old, 'replaced');
      tolerate('close replaced socket', () => old.close(CLOSE_REPLACED, 'replaced'));
    }
    this.state.acceptWebSocket(server, [role]);
    const peers = this.live(peerOf(role));
    if (peers.length === 0) return;
    this.sendControl(server, 'peer-up');
    for (const peer of peers) this.sendControl(peer, 'peer-up');
  }

  /**
   * Hibernation handler: forwards a frame verbatim to the peer role (dropped when no peer),
   * after enforcing the frame-size and frame-rate limits on the sender.
   */
  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    if (statusOf(ws) !== 'live') return;
    const role = this.roleOf(ws);
    if (frameByteLength(message) > MAX_FRAME_BYTES) {
      this.eject(ws, role, CLOSE_TOO_BIG, 'frame too large');
      return;
    }
    if (!this.limiter(ws).hit(Date.now())) {
      this.eject(ws, role, CLOSE_RATE_LIMIT, 'rate limit');
      return;
    }
    for (const peer of this.live(peerOf(role))) {
      tolerate('forward frame', () => peer.send(message));
    }
  }

  /**
   * Hibernation handler: completes the close handshake (echoing the client's code when it
   * may be sent) and, for a live socket, announces `peer-down` to its peer (never for 4000).
   */
  webSocketClose(ws: WebSocket, code: number): void {
    tolerate('complete close', () => ws.close(isSendableCloseCode(code) ? code : undefined));
    if (code === CLOSE_REPLACED) return;
    this.retire(ws);
  }

  /** Hibernation handler: a socket errored → treated like a real close. */
  webSocketError(ws: WebSocket, error: unknown): void {
    console.warn('[EVF relay] socket error:', String(error));
    this.retire(ws);
  }

  /** Marks a live socket closed and announces `peer-down` once. */
  private retire(ws: WebSocket): void {
    if (statusOf(ws) !== 'live') return;
    const role = this.roleOf(ws);
    setStatus(ws, 'closed');
    this.announceDown(role);
  }

  /** Closes a misbehaving sender and announces `peer-down` to its peer. */
  private eject(ws: WebSocket, role: Role, code: number, reason: string): void {
    setStatus(ws, 'closed');
    tolerate(`close (${code})`, () => ws.close(code, reason));
    this.announceDown(role);
  }

  private announceDown(role: Role): void {
    for (const peer of this.live(peerOf(role))) this.sendControl(peer, 'peer-down');
  }

  /** Current (non-replaced, non-closed) sockets of `role`. */
  private live(role: Role): WebSocket[] {
    return this.state.getWebSockets(role).filter((ws) => statusOf(ws) === 'live');
  }

  private roleOf(ws: WebSocket): Role {
    const role = this.state.getTags(ws).find(isRole);
    if (role === undefined) throw new Error('[EVF relay] socket has no role tag');
    return role;
  }

  private limiter(ws: WebSocket): RateLimiter {
    let limiter = this.limiters.get(ws);
    if (limiter === undefined) {
      limiter = new RateLimiter(MAX_FRAMES_PER_WINDOW, RATE_WINDOW_MS);
      this.limiters.set(ws, limiter);
    }
    return limiter;
  }

  private sendControl(ws: WebSocket, event: RelayEvent): void {
    tolerate(`send ${event}`, () => ws.send(controlFrame(event)));
  }
}
