/**
 * BridgeClient — WebSocket proxy to the EVF bridge's tool.invoke envelope path.
 *
 * Sends tool invocations via the WS `tool.invoke` envelope protocol (NOT REST
 * `/v1/tools/:name` which still returns `phase-07-pending` stubs). This is the
 * same protocol path that g2-app uses for Phase 7 tool dispatch.
 *
 * Design decisions:
 * - WS-only for ALL 6 MCP tools — including drop_concentration which has no
 *   REST route at all (not in TOOL_NAMES / Phase 3 REST surface).
 * - FIFO request queue: one in-flight tool call at a time. The bridge does NOT
 *   echo `idempotencyKey` in `tool.result` responses, so we cannot correlate
 *   multiple concurrent calls. MCP tool calls are user-driven (one per LLM turn)
 *   so throughput impact is negligible.
 * - Monotonic `seq` counter per connection instance (per EVF envelope protocol).
 * - `wsFactory` injection for test isolation (production default: `new WebSocket(url)`).
 * - `ready: Promise<void>` resolves after successful handshake; rejects on failure
 *   (buildMcpServer can await it to surface connection failures at boot).
 *
 * Security:
 * - T-11-01: bearer never logged (only bridgeUrl appears in log output).
 * - Bearer is sent ONLY in the client_hello handshake envelope (WS auth).
 * - BridgeAuthExpiredError thrown on WS close code 4001 or tool.result with
 *   error='invalid_token' — operator must restart with refreshed bearer.
 *
 * @see packages/bridge/src/ws/tool-invoke.ts (bridge consumer)
 * @see packages/bridge/src/ws/handshake.ts (handshake protocol)
 * @see packages/shared-protocol/src/payloads/tool.ts (ToolInvocationEnvelopePayloadSchema)
 * @see .planning/phases/11-v2-foundry-mcp-server/11-02-PLAN.md Task 1
 */

import type { Logger } from 'pino';

// ─── Public types ─────────────────────────────────────────────────────────────

/**
 * Result shape returned by `BridgeClient.invokeTool`.
 *
 * Mirrors the `ToolInvokeResult` from `packages/bridge/src/ws/tool-invoke.ts`
 * without importing across packages.
 */
export interface BridgeInvokeResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

/**
 * Thrown when the bridge signals bearer expiry.
 *
 * Trigger conditions:
 * - WS close with code 4001 (`invalid_token` close reason).
 * - tool.result envelope with `payload.error === 'invalid_token'`.
 *
 * Per D-11-01-AUTH: the operator must restart the MCP server with a
 * refreshed bearer token. No automatic retry.
 */
export class BridgeAuthExpiredError extends Error {
  override readonly name = 'BridgeAuthExpiredError';

  constructor(message = 'Bridge bearer expired — restart MCP server with refreshed EVF_BEARER') {
    super(message);
    Object.setPrototypeOf(this, BridgeAuthExpiredError.prototype);
  }
}

// ─── Constructor options ──────────────────────────────────────────────────────

/**
 * Constructor options for {@link BridgeClient}.
 */
export interface BridgeClientOptions {
  /** Bridge HTTP URL (converted to `ws://` or `wss://` for WS connection). */
  bridgeUrl: string;
  /** Opaque bearer token — sent in handshake ONLY, never logged (T-11-01). */
  bearer: string;
  /** pino logger (with bearer-redact config applied by buildLogger). */
  logger: Logger;
  /**
   * Optional WebSocket factory for test injection.
   *
   * Production default: `() => new WebSocket(wsUrl)` (Node 24 built-in WS).
   * Tests: inject a mock WebSocket class that exposes `simulateOpen`,
   * `simulateMessage`, `simulateClose` helpers.
   *
   * @param url - The resolved WS URL to connect to.
   */
  wsFactory?: (url: string) => WebSocket;
}

// ─── FIFO queue entry ─────────────────────────────────────────────────────────

interface PendingCall {
  resolve: (result: BridgeInvokeResult) => void;
  reject: (err: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
}

// ─── Message listener type ────────────────────────────────────────────────────

/**
 * Callback type for `BridgeClient.addMessageListener`.
 *
 * Called with the raw parsed envelope object for every WS message EXCEPT
 * `tool.result` (which is consumed exclusively by the FIFO dispatch path).
 */
export type BridgeMessageListener = (envelope: Record<string, unknown>) => void;

// ─── Snake→kebab mapping ──────────────────────────────────────────────────────

/**
 * Convert snake_case MCP tool name to kebab-case ToolId used by the bridge.
 *
 * The bridge's `ToolInvocationEnvelopePayloadSchema.toolId` uses kebab-case IDs
 * (e.g. 'cast-spell') matching `TOOL_ID_SCHEMA` in `packages/shared-protocol`.
 * MCP callers pass snake_case names (e.g. 'cast_spell') matching `TOOL_NAMES`.
 */
function snakeToKebab(snakeName: string): string {
  return snakeName.replace(/_/g, '-');
}

// ─── BridgeClient ─────────────────────────────────────────────────────────────

/**
 * WebSocket client that wraps the EVF bridge's `tool.invoke` envelope path.
 *
 * Opens a WS connection at construction time, performs the Phase 2 handshake
 * (client_hello → server_hello), and then provides `invokeTool` for sending
 * `tool.invoke` envelopes and awaiting `tool.result` responses.
 *
 * Only ONE tool call may be in-flight at a time (FIFO queue). This is sufficient
 * for MCP usage where an LLM issues one tool call per turn.
 */
export class BridgeClient {
  /** Resolves after successful WS handshake; rejects on connection failure. */
  readonly ready: Promise<void>;

  private readonly _logger: Logger;
  private readonly _bearer: string;
  private readonly _bridgeUrl: string;
  private _ws: WebSocket | null = null;
  private _connected = false;
  private _sessionId: string | null = null;
  private _seq = 0;

  /** FIFO: the single in-flight tool call (if any). */
  private _pending: PendingCall | null = null;

  /**
   * Registered message listeners for non-tool.result envelopes.
   * Used by `subscribeToBridgeDeltas` to route delta envelopes to the resource cache.
   */
  private readonly _messageListeners = new Set<BridgeMessageListener>();

  /** Queue of tool calls waiting to be dispatched (after the in-flight completes). */
  private readonly _queue: Array<{
    toolId: string;
    args: object;
    resolve: (result: BridgeInvokeResult) => void;
    reject: (err: unknown) => void;
  }> = [];

  constructor(opts: BridgeClientOptions) {
    this._logger = opts.logger;
    this._bearer = opts.bearer;
    this._bridgeUrl = opts.bridgeUrl;

    this.ready = this._connect(opts);
  }

  /**
   * Open WS connection and perform the EVF handshake.
   *
   * Returns a Promise that resolves on successful server_hello, or resolves
   * with failed state (not reject) when wsFactory throws — so the caller can
   * always safely await ready and then call invokeTool (which returns an error
   * result instead of throwing).
   */
  private _connect(opts: BridgeClientOptions): Promise<void> {
    return new Promise<void>((resolve) => {
      const wsUrl = `${opts.bridgeUrl.replace(/^http/, 'ws')}/ws`;
      const factory = opts.wsFactory ?? ((url: string) => new WebSocket(url));

      let ws: WebSocket;
      try {
        ws = factory(wsUrl);
      } catch {
        this._logger.warn(
          { bridgeUrl: opts.bridgeUrl },
          'BridgeClient: wsFactory threw — bridge unreachable',
        );
        this._connected = false;
        resolve(); // Resolve (not reject) so awaiting ready is always safe.
        return;
      }

      this._ws = ws;

      ws.onopen = () => {
        // Send client_hello handshake envelope.
        const hello = {
          proto: 'evf-v1',
          token: this._bearer,
          locale: 'en',
          capabilities: [],
        };
        // NOTE: bearer IS sent here in the handshake token field — that's the WS auth protocol.
        // The logger's redact list covers 'token' so it will NOT appear in pino output.
        ws.send(JSON.stringify(hello));
      };

      ws.onmessage = (event: MessageEvent) => {
        const raw = typeof event.data === 'string' ? event.data : String(event.data);
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch {
          return;
        }

        // ── Handshake: server_hello ────────────────────────────────────────────
        if (!this._connected) {
          // First message after open is the server_hello.
          const hello = parsed as Record<string, unknown>;
          if (typeof hello.session_id === 'string') {
            this._sessionId = hello.session_id;
            this._connected = true;
            this._logger.info(
              { bridgeUrl: opts.bridgeUrl, sessionId: this._sessionId },
              'BridgeClient: connected to bridge WS',
            );
            resolve();
          } else {
            this._logger.warn(
              { bridgeUrl: opts.bridgeUrl },
              'BridgeClient: unexpected handshake response',
            );
            // Still resolve — invokeTool will return bridge_unreachable.
            resolve();
          }
          return;
        }

        // ── Post-handshake messages: tool.result + bearer.rotated ──────────────
        const envelope = parsed as Record<string, unknown>;

        if (envelope.type === 'bearer.rotated') {
          const p = envelope.payload as Record<string, unknown> | undefined;
          const graceUntil = p?.graceUntil;
          this._logger.warn(
            { graceUntil },
            'BridgeClient: bearer.rotated received — env-var bearer will expire; restart MCP server with refreshed bearer to maintain availability',
          );
          return;
        }

        if (envelope.type !== 'tool.result') {
          // Fan out to registered message listeners (e.g. subscribeToBridgeDeltas).
          // tool.result is consumed exclusively by the FIFO dispatch path above.
          for (const listener of this._messageListeners) {
            listener(envelope);
          }
          return;
        }

        const payload = envelope.payload as BridgeInvokeResult | undefined;
        if (!payload) return;

        // Check for auth expiry signal in tool.result payload.
        if (payload.error === 'invalid_token') {
          this._rejectPendingWithAuthError();
          return;
        }

        this._resolvePending(payload);
      };

      ws.onclose = (event: CloseEvent) => {
        this._connected = false;
        if (!this._sessionId) {
          // Closed before handshake completed — resolve ready anyway.
          resolve();
        }
        if (event.code === 4001) {
          // Bearer expired — reject pending and drain queue.
          this._rejectPendingWithAuthError();
          this._drainQueueWithAuthError();
        } else {
          // Other close — reject pending with bridge_unreachable.
          this._resolvePending({ success: false, error: 'bridge_unreachable' });
          this._drainQueueUnreachable();
        }
      };

      ws.onerror = (_event: Event) => {
        if (!this._connected) {
          this._connected = false;
          resolve(); // Let ready resolve; invokeTool will return bridge_unreachable.
        }
      };
    });
  }

  private _nextSeq(): number {
    this._seq += 1;
    return this._seq;
  }

  private _resolvePending(result: BridgeInvokeResult): void {
    const pending = this._pending;
    if (!pending) return;
    this._pending = null;
    clearTimeout(pending.timer);
    pending.resolve(result);
    // Process next queued call.
    this._dequeueNext();
  }

  private _rejectPendingWithAuthError(): void {
    const pending = this._pending;
    if (!pending) return;
    this._pending = null;
    clearTimeout(pending.timer);
    pending.reject(new BridgeAuthExpiredError());
  }

  private _drainQueueWithAuthError(): void {
    while (this._queue.length > 0) {
      const next = this._queue.shift();
      next?.reject(new BridgeAuthExpiredError());
    }
  }

  private _drainQueueUnreachable(): void {
    while (this._queue.length > 0) {
      const next = this._queue.shift();
      next?.resolve({ success: false, error: 'bridge_unreachable' });
    }
  }

  private _dequeueNext(): void {
    if (this._queue.length === 0 || this._pending) return;
    const next = this._queue.shift();
    if (!next) return;
    this._dispatchTool(next.toolId, next.args, next.resolve, next.reject);
  }

  private _dispatchTool(
    toolId: string,
    args: object,
    resolve: (r: BridgeInvokeResult) => void,
    reject: (e: unknown) => void,
  ): void {
    const ws = this._ws;
    if (!ws || !this._connected) {
      resolve({ success: false, error: 'bridge_unreachable' });
      return;
    }

    const idempotencyKey = crypto.randomUUID();
    const envelope = {
      proto: 'evf-v1',
      seq: this._nextSeq(),
      ts: Date.now(),
      type: 'tool.invoke',
      session_id: this._sessionId,
      payload: {
        toolId, // kebab-case (already converted)
        idempotencyKey,
        args,
      },
    };

    const timer = setTimeout(() => {
      if (this._pending?.timer === timer) {
        this._pending = null;
        resolve({ success: false, error: 'bridge_timeout' });
        this._dequeueNext();
      }
    }, 30_000);

    this._pending = { resolve, reject, timer };

    try {
      ws.send(JSON.stringify(envelope));
    } catch {
      this._pending = null;
      clearTimeout(timer);
      resolve({ success: false, error: 'bridge_unreachable' });
    }
  }

  /**
   * Register a listener for non-tool.result WS messages (delta envelopes etc.).
   *
   * Called by `subscribeToBridgeDeltas` in Plan 11-03 to route delta envelopes
   * into the ResourceCache. The listener receives the raw parsed envelope object.
   *
   * NOTE: `tool.result` envelopes are consumed exclusively by the FIFO dispatch
   * path and are NEVER forwarded to message listeners.
   *
   * @param cb - Callback invoked with the raw parsed envelope for each qualifying message.
   * @returns Unsubscribe function — call to remove the listener.
   */
  addMessageListener(cb: BridgeMessageListener): () => void {
    this._messageListeners.add(cb);
    return () => {
      this._messageListeners.delete(cb);
    };
  }

  // ─── REST fallback methods (Plan 11-03) ────────────────────────────────────

  /**
   * REST GET /v1/character/:actorId → CharacterSnapshot | null.
   *
   * Used by register-resources.ts as a cold-start fallback when the WS cache
   * has not yet received a `character.delta` envelope.
   *
   * @param actorId - Optional Foundry actor ID. When absent, falls back to
   *   GET /v1/characters (list) and returns the first result.
   * @returns The character snapshot, or `null` on 404 / network error / no actors.
   * @throws {BridgeAuthExpiredError} When the bridge returns 401.
   */
  async getCharacterSnapshot(
    actorId?: string,
  ): Promise<import('@evf/shared-protocol').CharacterSnapshot | null> {
    if (!actorId) {
      // Auto-detect: fetch character list and return the first one.
      return this._restGet<import('@evf/shared-protocol').CharacterSnapshot | null>(
        `${this._bridgeUrl}/v1/characters`,
        async (res) => {
          if (res.status === 204 || res.status === 404) return null;
          const data = (await res.json()) as unknown;
          if (Array.isArray(data) && data.length > 0)
            return data[0] as import('@evf/shared-protocol').CharacterSnapshot;
          return null;
        },
      );
    }
    return this._restGet<import('@evf/shared-protocol').CharacterSnapshot | null>(
      `${this._bridgeUrl}/v1/character/${encodeURIComponent(actorId)}`,
      async (res) => {
        if (res.status === 404) return null;
        return res.json() as Promise<import('@evf/shared-protocol').CharacterSnapshot>;
      },
    );
  }

  /**
   * REST GET /v1/combat/current → CombatSnapshot | null.
   *
   * Returns `null` on HTTP 204 (no active combat).
   */
  async getCombatSnapshot(): Promise<import('@evf/shared-protocol').CombatSnapshot | null> {
    return this._restGet<import('@evf/shared-protocol').CombatSnapshot | null>(
      `${this._bridgeUrl}/v1/combat/current`,
      async (res) => {
        if (res.status === 204 || res.status === 404) return null;
        return res.json() as Promise<import('@evf/shared-protocol').CombatSnapshot>;
      },
    );
  }

  /**
   * REST GET /v1/scene/viewport → SceneViewport | null.
   */
  async getSceneViewport(): Promise<import('@evf/shared-protocol').SceneViewport | null> {
    return this._restGet<import('@evf/shared-protocol').SceneViewport | null>(
      `${this._bridgeUrl}/v1/scene/viewport`,
      async (res) => {
        if (res.status === 404) return null;
        return res.json() as Promise<import('@evf/shared-protocol').SceneViewport>;
      },
    );
  }

  /**
   * REST GET /v1/events?limit=N → EventLogEntry[].
   *
   * @param limit - Maximum number of entries to return (default 50).
   */
  async getEventLog(limit: number): Promise<import('@evf/shared-protocol').EventLogEntry[]> {
    return this._restGet<import('@evf/shared-protocol').EventLogEntry[]>(
      `${this._bridgeUrl}/v1/events?limit=${limit}`,
      async (res) => {
        if (res.status === 404) return [];
        const data = (await res.json()) as
          | { entries?: import('@evf/shared-protocol').EventLogEntry[] }
          | import('@evf/shared-protocol').EventLogEntry[];
        if (Array.isArray(data)) return data;
        return (data as { entries?: import('@evf/shared-protocol').EventLogEntry[] }).entries ?? [];
      },
    );
  }

  /**
   * Generic REST GET helper.
   *
   * Handles common concerns: bearer auth, 401 → BridgeAuthExpiredError,
   * network error → return default (null / []).
   */
  private async _restGet<T>(
    url: string,
    handler: (res: Response) => Promise<T>,
    defaultValue?: T,
  ): Promise<T> {
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this._bearer}`,
          Accept: 'application/json',
        },
      });
      if (res.status === 401) {
        throw new BridgeAuthExpiredError();
      }
      return await handler(res);
    } catch (err) {
      if (err instanceof BridgeAuthExpiredError) throw err;
      this._logger.warn(
        { url, err: String(err) },
        'BridgeClient: REST GET failed — returning default',
      );
      return defaultValue as T;
    }
  }

  /**
   * Invoke a tool via the bridge WS `tool.invoke` envelope path.
   *
   * @param snakeName - Snake_case bridge tool name (e.g. 'cast_spell').
   * @param args      - Tool-specific argument payload.
   * @returns Promise resolving to {@link BridgeInvokeResult}.
   *          Never rejects — errors are encoded as `{ success: false, error }`.
   *          Only throws `BridgeAuthExpiredError` when the bearer expires.
   */
  async invokeTool(snakeName: string, args: object): Promise<BridgeInvokeResult> {
    // Convert snake_case → kebab-case for the bridge toolId field.
    const toolId = snakeToKebab(snakeName);

    if (!this._connected || !this._ws) {
      return { success: false, error: 'bridge_unreachable' };
    }

    return new Promise<BridgeInvokeResult>((resolve, reject) => {
      if (this._pending) {
        // FIFO: queue this call for after the in-flight completes.
        this._queue.push({ toolId, args, resolve, reject });
        return;
      }
      this._dispatchTool(toolId, args, resolve, reject);
    });
  }

  /**
   * Close the WS connection cleanly.
   */
  async close(): Promise<void> {
    if (this._ws) {
      try {
        this._ws.close(1000, 'mcp_server_shutdown');
      } catch {
        /* ignore */
      }
      this._ws = null;
    }
    this._connected = false;
  }
}
