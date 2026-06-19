/**
 * Tool-invocation poller — Phase 8 write channel (GM-side reverse channel).
 *
 * The bridge cannot reach Foundry over socketlib, so g2-app `tool.invoke` writes are
 * enqueued bridge-side ({@link ../../../bridge/src/ws/tool-invocation-queue.ts}) and
 * executed here: this poller mirrors the player-view `/internal/stream-request` poll
 * (same auth + ~1s cadence + fetch/timeout style), draining
 * `GET /internal/tool-requests`, running each invocation through the AUTHORITATIVE
 * write path, and POSTing the result back to `/internal/tool-result`.
 *
 * # Owning-user execution (ADR-0011 Amendment)
 *
 * Writes execute on the OWNING user's client, not exclusively a GM. Each client
 * polls for ITS OWN user's invocations (`GET /internal/tool-requests?userId=<game.user.id>`),
 * so a PLAYER executes their own actor's skill check / attack / spell without a GM
 * online. The bridge routes each queued request to the bearer's bound user; the
 * per-actor write authz (dispatchToolAuthorized) still verifies the bearer owns the
 * acting actor, and the executing client IS that user — so the owner-level write
 * (`actor.rollSkill`, `activity.use`) is permitted by Foundry. (Global / non-owned
 * writes that genuinely need GM remain a GM's to execute via the unfiltered drain.)
 *
 * # Security (ADR-0014)
 *
 * Each invocation is dispatched via {@link dispatchToolAuthorized} — the SAME shared
 * function the socketlib adapter uses. The acting `args.actor_id` must be OWNED by the
 * bearer's bound Foundry user; denial returns `not_authorized` WITHOUT dispatching.
 * The poller never bypasses or re-implements this gate.
 *
 * # Fault tolerance
 *
 * The interval callback never throws: a network failure on the drain GET is swallowed
 * (the next tick retries), and each request is dispatched + result-posted inside its
 * own try/catch so one failing invocation cannot abort the others (its result POST
 * carries `{ success: false, error: String(err) }`).
 *
 * @see packages/bridge/src/routes/tool-channel.ts (the bridge endpoints)
 * @see packages/foundry-module/src/write-path/dispatch-authorized.ts (shared authz + dispatch)
 * @see packages/foundry-module/src/module.ts (Hooks.once('ready') wiring + secret/url resolution)
 */

import { dispatchToolAuthorized } from './dispatch-authorized.js';
import type { ToolId } from './tool-registry.js';

/** Default poll cadence (ms) — matches the player-view stream-request poll feel (~1s). */
export const TOOL_REQUEST_POLL_MS = 1_000;

/** Per-request fetch timeout (ms) — a hung bridge must release the slot, not pile up. */
const TOOL_POLL_FETCH_TIMEOUT_MS = 5_000;

/** A drained invocation as returned by `GET /internal/tool-requests`. */
interface DrainedToolRequest {
  /** Opaque queue request id echoed back on the result POST. */
  requestId: string;
  /** The wire-validated tool payload (`{ toolId, idempotencyKey, args }`). */
  payload: { toolId: ToolId; idempotencyKey: string; args: unknown };
  /** Session bearer — forwarded to the per-actor write authz (ADR-0014). */
  bearer: string;
}

/**
 * Options for {@link registerToolInvocationPoller}.
 *
 * `getBridgeUrl` / `getInternalSecret` are injected (rather than imported) so the
 * poller reuses module.ts's existing resolution — identical to `bridgeDeltaEmitter` —
 * without exporting those private helpers or coupling to settings internals.
 */
export interface ToolInvocationPollerOptions {
  /** Resolve the bridge base URL (same precedence as bridgeDeltaEmitter). `null` → skip. */
  getBridgeUrl: () => string | null;
  /** Resolve the shared internal secret (same precedence as bridgeDeltaEmitter). `null` → skip. */
  getInternalSecret: () => string | null;
  /** Test seam: override the poll cadence (defaults to {@link TOOL_REQUEST_POLL_MS}). */
  pollIntervalMs?: number;
}

/** Type guard for one drained tool request from the bridge response. */
function isDrainedToolRequest(v: unknown): v is DrainedToolRequest {
  if (v === null || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  const payload = o.payload as Record<string, unknown> | undefined;
  return (
    typeof o.requestId === 'string' &&
    typeof o.bearer === 'string' &&
    payload !== undefined &&
    typeof payload === 'object' &&
    typeof payload.toolId === 'string' &&
    typeof payload.idempotencyKey === 'string'
  );
}

/**
 * Process a single drained invocation: dispatch it through the authoritative write
 * path, then POST the result. Never throws — any failure becomes a failure result POST.
 *
 * @param req            - The drained invocation.
 * @param bridgeUrl      - Resolved bridge base URL.
 * @param internalSecret - Resolved internal secret (bearer for the result POST).
 */
async function handleOneRequest(
  req: DrainedToolRequest,
  bridgeUrl: string,
  internalSecret: string,
): Promise<void> {
  let result: { success: boolean; data?: unknown; error?: string };
  try {
    result = await dispatchToolAuthorized(req.payload.toolId, {
      args: req.payload.args,
      idempotencyKey: req.payload.idempotencyKey,
      bearer: req.bearer,
    });
  } catch (err) {
    // dispatchToolAuthorized resolves rather than rejects, but guard defensively so a
    // single bad request never aborts the poll loop.
    result = { success: false, error: String(err) };
  }

  try {
    await fetch(`${bridgeUrl}/internal/tool-result`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${internalSecret}`,
      },
      body: JSON.stringify({ requestId: req.requestId, result }),
      signal: AbortSignal.timeout(TOOL_POLL_FETCH_TIMEOUT_MS),
    });
  } catch (err) {
    // The bridge may have already timed the request out (it resolved foundry_timeout);
    // a failed result POST is non-fatal. Warn only (noConsole allow: [error, warn]).
    console.warn('[EVF tool-poller] result POST failed:', (err as Error).message ?? err);
  }
}

/**
 * One poll tick: GM-gated drain + per-request dispatch. Never throws.
 *
 * @param opts - The resolved poller options.
 */
async function pollOnce(opts: ToolInvocationPollerOptions): Promise<void> {
  try {
    // ADR-0011 Amendment: writes execute on the OWNING user's client (not exclusively a
    // GM). Each client polls for ITS OWN user's invocations (`?userId=`), so a player
    // executes their own actor's skill/attack/spell without a GM online. The bridge
    // routes each request by the bearer's bound user; the per-actor write authz
    // (dispatchToolAuthorized) still verifies the bearer owns the acting actor, and the
    // executing client IS that user, so `actor.rollSkill`/`activity.use` runs as the owner.
    const userId = game.user?.id;
    if (typeof userId !== 'string' || userId.length === 0) {
      return;
    }
    const bridgeUrl = opts.getBridgeUrl();
    const internalSecret = opts.getInternalSecret();
    if (bridgeUrl === null || internalSecret === null) {
      return;
    }

    const res = await fetch(
      `${bridgeUrl}/internal/tool-requests?userId=${encodeURIComponent(userId)}`,
      {
        headers: { Authorization: `Bearer ${internalSecret}` },
        signal: AbortSignal.timeout(TOOL_POLL_FETCH_TIMEOUT_MS),
      },
    );
    if (!res.ok) {
      return;
    }
    const body = (await res.json()) as { requests?: unknown };
    const requests = Array.isArray(body.requests) ? body.requests : [];
    for (const raw of requests) {
      if (!isDrainedToolRequest(raw)) {
        continue;
      }
      // Dispatch each request independently; handleOneRequest never throws.
      await handleOneRequest(raw, bridgeUrl, internalSecret);
    }
  } catch (err) {
    // Best-effort: an unreachable bridge / malformed body must not crash the session.
    console.warn('[EVF tool-poller] poll tick failed:', (err as Error).message ?? err);
  }
}

/**
 * Register the GM-side tool-invocation poller. Safe to call on every client — only a
 * GM client acts (the gate is inside {@link pollOnce}).
 *
 * @param opts - URL/secret resolvers + optional cadence override.
 * @returns A teardown function that stops the interval (e.g. for tests / page lifecycle).
 */
export function registerToolInvocationPoller(opts: ToolInvocationPollerOptions): () => void {
  const intervalMs = opts.pollIntervalMs ?? TOOL_REQUEST_POLL_MS;
  const timer = setInterval(() => void pollOnce(opts), intervalMs);
  return () => clearInterval(timer);
}
