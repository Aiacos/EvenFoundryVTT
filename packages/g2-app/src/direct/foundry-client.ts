/**
 * Same-origin Foundry client: `/join` login + raw socket.io connection as the "(G2)" user.
 *
 * Handshake (ADR-0016 §Decision Outcome 4; no official API — guarded by the version probe
 * and the `validate:direct-sideload` hardware gate):
 *
 * 1. `GET {base}/join` — sets the `session` cookie (first-party, same origin).
 * 2. `POST {base}/join` JSON `{action:'join', userid, userId, password}` — both id
 *    spellings on purpose: v13.348 / v14.364 read `userid`, v14.367+ reads `userId`; the
 *    unread key is ignored (github.com/laurigates/foundryvtt-mcp issues #206/#222,
 *    github.com/wanoo/foundry-mcp-gateway issue #10). Success = JSON `status:'success'`
 *    (or a redirect to `/game`); 401/403 = bad credentials.
 * 3. socket.io (`{prefix}/socket.io`, websocket only, `withCredentials`) — Foundry v14
 *    resolves the session from the cookie only; the server emits `session`
 *    `{sessionId, userId}` once authenticated (`userId` null ⇒ anonymous ⇒ auth failure).
 *
 * The manual pairing path lists users through `getJoinData` on an anonymous socket
 * (the `/join` page renders its user list client-side in v13+), falling back to parsing
 * the server HTML.
 *
 * @see docs/architecture/0016-direct-foundry-streaming.md
 */
import { io as socketIo } from 'socket.io-client';
import { filterG2Users, type JoinUser, parseJoinUsers } from './credentials.js';

/** Error classes surfaced to the session state machine. */
export type FoundryErrorKind = 'auth' | 'network' | 'server';

/** Typed failure from the Foundry client; `kind` drives the S12 cause / revocation. */
export class FoundryClientError extends Error {
  constructor(
    readonly kind: FoundryErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'FoundryClientError';
  }
}

/** The socket.io client surface the direct channel uses (injectable for tests). */
export interface SocketLike {
  on(event: string, listener: (...args: never[]) => void): unknown;
  off(event: string, listener?: (...args: never[]) => void): unknown;
  emit(event: string, ...args: unknown[]): unknown;
  disconnect(): unknown;
}

/** Options passed to the socket.io factory. */
export interface SocketOptions {
  path: string;
  transports: string[];
  withCredentials: boolean;
  reconnection: boolean;
}

/** socket.io `io()` signature subset. */
export type IoFactory = (uri: string, options: SocketOptions) => SocketLike;

/** Injectable I/O for {@link FoundryClient}. */
export interface FoundryClientDeps {
  fetch: typeof fetch;
  io: IoFactory;
  /** Timeout for the socket `session` event (ms). */
  socketTimeoutMs: number;
}

/** Result of `GET /api/status` when Foundry exposes it. */
export interface FoundryStatus {
  active: boolean;
  version: string | null;
  /** Major generation (13, 14…) parsed from `version`. */
  generation: number | null;
}

const DEFAULT_DEPS: FoundryClientDeps = {
  fetch: (input, init) => globalThis.fetch(input, init),
  io: (uri, options) => socketIo(uri, options) as unknown as SocketLike,
  socketTimeoutMs: 10_000,
};

/** Classifies an HTTP status into an error kind (4xx auth, other failures server). */
function kindForStatus(status: number): FoundryErrorKind {
  return status === 401 || status === 403 ? 'auth' : 'server';
}

/** Same-origin Foundry HTTP + socket client. */
export class FoundryClient {
  private readonly deps: FoundryClientDeps;
  private readonly origin: string;
  private readonly prefix: string;

  /**
   * @param base Foundry base URL (origin + routePrefix, no trailing slash)
   * @param deps optional I/O overrides (tests)
   */
  constructor(
    readonly base: string,
    deps: Partial<FoundryClientDeps> = {},
  ) {
    this.deps = { ...DEFAULT_DEPS, ...deps };
    const url = new URL(base);
    this.origin = url.origin;
    this.prefix = url.pathname.replace(/\/+$/, '');
  }

  /**
   * Probes `GET {base}/api/status` for the Foundry generation.
   *
   * @returns the status, or `null` when the endpoint is missing/unparsable (not fatal)
   * @throws FoundryClientError('network') when the server is unreachable
   */
  async probeStatus(): Promise<FoundryStatus | null> {
    const res = await this.request(`${this.base}/api/status`, { method: 'GET' });
    if (!res.ok) return null;
    try {
      const body = (await res.json()) as { active?: unknown; version?: unknown };
      const version = typeof body.version === 'string' ? body.version : null;
      const major = version === null ? Number.NaN : Number.parseInt(version, 10);
      return {
        active: body.active === true,
        version,
        generation: Number.isFinite(major) ? major : null,
      };
    } catch {
      // Non-JSON (older builds, proxies): the probe is advisory only.
      return null;
    }
  }

  /**
   * Fetches the `/join` page, establishing the `session` cookie.
   *
   * @returns the page HTML
   * @throws FoundryClientError('network' | 'server')
   */
  async fetchJoinPage(): Promise<string> {
    const res = await this.request(`${this.base}/join`, { method: 'GET' });
    if (!res.ok) throw new FoundryClientError('server', `GET /join → HTTP ${res.status}`);
    return res.text();
  }

  /**
   * Logs in as `userId` (`POST /join`). Call {@link fetchJoinPage} first.
   *
   * @throws FoundryClientError('auth') on rejected credentials,
   *         ('server') on 5xx / unexpected body, ('network') when unreachable
   */
  async login(userId: string, password: string): Promise<void> {
    const res = await this.request(`${this.base}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'join', userid: userId, userId, password }),
    });
    const text = await res.text();
    if (!res.ok) {
      throw new FoundryClientError(
        kindForStatus(res.status),
        `POST /join → HTTP ${res.status}: ${text.slice(0, 120)}`,
      );
    }
    if (res.redirected && new URL(res.url).pathname.endsWith('/game')) return;
    let body: { status?: unknown; redirect?: unknown; message?: unknown } = {};
    try {
      body = JSON.parse(text) as typeof body;
    } catch {
      throw new FoundryClientError('server', 'POST /join returned a non-JSON body');
    }
    if (body.status === 'success') return;
    if (typeof body.redirect === 'string' && body.redirect.endsWith('/game')) return;
    throw new FoundryClientError('auth', `join rejected: ${String(body.message ?? body.status)}`);
  }

  /**
   * Opens the authenticated socket and resolves once Foundry emits `session` with a
   * user id. The socket's own reconnection is disabled — the session owns backoff.
   *
   * @throws FoundryClientError('auth') when the session is anonymous,
   *         ('network') on connect error / timeout
   */
  openSocket(): Promise<SocketLike> {
    return this.connectSocket(true);
  }

  /**
   * Lists "(G2)" users for the manual pairing form: `getJoinData` over an anonymous
   * socket, falling back to parsing the `/join` HTML.
   *
   * @throws FoundryClientError('network' | 'server') when neither source works
   */
  async listG2Users(): Promise<JoinUser[]> {
    const html = await this.fetchJoinPage();
    try {
      const socket = await this.connectSocket(false);
      try {
        return filterG2Users(await this.getJoinUsers(socket));
      } finally {
        socket.disconnect();
      }
    } catch {
      // getJoinData is undocumented; the server-rendered select is the fallback.
      return parseJoinUsers(html);
    }
  }

  private getJoinUsers(socket: SocketLike): Promise<JoinUser[]> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new FoundryClientError('network', 'getJoinData timed out')),
        this.deps.socketTimeoutMs,
      );
      socket.emit('getJoinData', (data: { users?: Array<{ _id?: unknown; name?: unknown }> }) => {
        clearTimeout(timer);
        if (!Array.isArray(data?.users)) {
          reject(new FoundryClientError('server', 'getJoinData returned no users'));
          return;
        }
        resolve(
          data.users.flatMap((u) =>
            typeof u._id === 'string' && typeof u.name === 'string'
              ? [{ id: u._id, name: u.name }]
              : [],
          ),
        );
      });
    });
  }

  private connectSocket(requireUser: boolean): Promise<SocketLike> {
    const socket = this.deps.io(this.origin, {
      path: `${this.prefix}/socket.io`,
      transports: ['websocket'],
      withCredentials: true,
      reconnection: false,
    });
    return new Promise((resolve, reject) => {
      const fail = (error: FoundryClientError): void => {
        cleanup();
        socket.disconnect();
        reject(error);
      };
      const onSession = (session: { userId?: unknown } | null): void => {
        if (requireUser && (session === null || typeof session.userId !== 'string')) {
          fail(new FoundryClientError('auth', 'socket session is anonymous'));
          return;
        }
        cleanup();
        resolve(socket);
      };
      const onError = (error: Error): void =>
        fail(new FoundryClientError('network', `socket connect failed: ${error.message}`));
      const timer = setTimeout(
        () => fail(new FoundryClientError('network', 'socket session timed out')),
        this.deps.socketTimeoutMs,
      );
      const cleanup = (): void => {
        clearTimeout(timer);
        socket.off('session', onSession);
        socket.off('connect_error', onError);
      };
      socket.on('session', onSession);
      socket.on('connect_error', onError);
    });
  }

  private async request(url: string, init: RequestInit): Promise<Response> {
    try {
      return await this.deps.fetch(url, { ...init, credentials: 'same-origin' });
    } catch (error) {
      throw new FoundryClientError('network', `${init.method ?? 'GET'} ${url}: ${String(error)}`);
    }
  }
}
