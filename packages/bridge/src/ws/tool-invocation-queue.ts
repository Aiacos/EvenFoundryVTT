/**
 * Tool-invocation reverse-channel queue — Phase 8 write channel.
 *
 * The bridge cannot reach Foundry over socketlib (Foundry-internal) and the only
 * bridge↔Foundry channel is the one-way `POST /internal/delta` the module already
 * uses. To execute a write tool the bridge therefore mirrors the player-view
 * `/internal/stream-request` poll pattern in reverse: a g2-app `tool.invoke`
 * envelope is ENQUEUED here, the GM-side Foundry module POLLs the queue (drains
 * pending invocations), runs the authoritative write, then POSTs the result back —
 * at which point the awaiting `enqueue` Promise resolves.
 *
 * # Design
 *
 * - {@link ToolInvocationQueue.enqueue} stores a pending invocation keyed by a fresh
 *   `crypto.randomUUID()` requestId, registers a resolver, and returns a Promise that
 *   settles when {@link ToolInvocationQueue.resolveResult} arrives — or, after
 *   {@link TOOL_INVOKE_TIMEOUT_MS}, resolves to `{ success: false, error: 'foundry_timeout' }`.
 * - {@link ToolInvocationQueue.drainPending} returns AND removes all currently-pending
 *   invocations so a single poll dispatches each exactly once (the resolver is kept
 *   until the result/timeout settles it).
 * - {@link ToolInvocationQueue.resolveResult} settles the awaiting Promise for a
 *   requestId (idempotent: a second call — e.g. a late POST after timeout — is a no-op).
 *
 * # Boundary
 *
 * This module is bridge-only. It never imports foundry-module; the payload it stores
 * is the wire-validated {@link ToolInvocationEnvelopePayload} plus the session bearer,
 * exactly the shape the poller forwards to the Foundry-side `dispatchToolAuthorized`.
 *
 * @see packages/bridge/src/routes/tool-channel.ts (GET /internal/tool-requests + POST /internal/tool-result)
 * @see packages/foundry-module/src/write-path/tool-invocation-poller.ts (the GM-side poller)
 * @see packages/bridge/src/ws/tool-invoke.ts (the WS handler that calls enqueue via DispatchToolFn)
 * @see docs/architecture/0011-foundry-write-path-single-workflow-origin.md
 */

import type { ToolInvocationEnvelopePayload } from '@evf/shared-protocol';
import type { ToolInvokeResult } from './tool-invoke.js';

/**
 * How long the bridge waits for the Foundry module to poll + return a result before
 * the awaiting `tool.invoke` Promise resolves to `foundry_timeout`.
 *
 * Sized to comfortably exceed one poll cadence ({@link TOOL_REQUEST_POLL_MS} on the
 * module side, ~1s) plus the GM-side dispatch + result POST round-trip, while still
 * bounding the WS caller's wait so a stuck GM never wedges the socket's response.
 */
export const TOOL_INVOKE_TIMEOUT_MS = 10_000;

/** A pending invocation awaiting a GM-side poll. */
interface PendingInvocation {
  /** The wire-validated tool payload (toolId + idempotencyKey + args). */
  readonly payload: ToolInvocationEnvelopePayload;
  /** Session bearer — forwarded to the Foundry-side per-actor write authz (ADR-0014). */
  readonly bearer: string;
  /** `Date.now()` when enqueued (diagnostics / future TTL sweeps). */
  readonly enqueuedAt: number;
}

/** A drained invocation handed to the poller (requestId + payload + bearer). */
export interface DrainedInvocation {
  /** Opaque queue request id — the poller echoes it back on POST /internal/tool-result. */
  readonly requestId: string;
  /** The wire-validated tool payload. */
  readonly payload: ToolInvocationEnvelopePayload;
  /** Session bearer — forwarded to the Foundry-side per-actor write authz. */
  readonly bearer: string;
}

/** Resolver bookkeeping for a pending invocation (settle + cleanup the timeout). */
interface ResolverEntry {
  /** Resolves the awaiting `enqueue` Promise exactly once. */
  readonly resolve: (result: ToolInvokeResult) => void;
  /** The pending timeout handle, cleared on settle so the timer never fires post-resolve. */
  readonly timer: ReturnType<typeof setTimeout>;
}

/**
 * In-memory poll-based queue of pending `tool.invoke` reverse-channel requests.
 *
 * One instance is created in `server.ts` and shared between the production
 * `wsDispatchFn` (enqueue) and the `/internal/tool-*` routes (drain + resolve).
 */
export class ToolInvocationQueue {
  /** Pending invocations not yet drained by a poll. Keyed by requestId. */
  private readonly pending = new Map<string, PendingInvocation>();
  /** Awaiting resolvers, keyed by requestId. Present from enqueue until settle. */
  private readonly resolvers = new Map<string, ResolverEntry>();

  /**
   * Enqueue a tool invocation and return a Promise that resolves with the GM-side
   * {@link ToolInvokeResult} once {@link resolveResult} is called for it — or with
   * `{ success: false, error: 'foundry_timeout' }` after {@link TOOL_INVOKE_TIMEOUT_MS}.
   *
   * The Promise NEVER rejects (it resolves to a failure ToolInvokeResult on timeout),
   * matching the WS handler's "always send a tool.result" contract. The pending entry
   * + resolver are cleaned up on settle (success OR timeout) so the maps never leak.
   *
   * @param payload - The wire-validated tool payload (toolId + idempotencyKey + args).
   * @param bearer  - The session bearer for the Foundry-side per-actor write authz.
   * @returns A Promise resolving to the tool result (or `foundry_timeout`).
   */
  enqueue(payload: ToolInvocationEnvelopePayload, bearer: string): Promise<ToolInvokeResult> {
    const requestId = crypto.randomUUID();
    this.pending.set(requestId, { payload, bearer, enqueuedAt: Date.now() });
    return new Promise<ToolInvokeResult>((resolve) => {
      const timer = setTimeout(() => {
        // Timeout: the GM never polled / never returned. Drop the pending entry (it may
        // still be undrained) and settle to a retryable failure.
        this.pending.delete(requestId);
        this.resolvers.delete(requestId);
        resolve({ success: false, error: 'foundry_timeout' });
      }, TOOL_INVOKE_TIMEOUT_MS);
      // Node's setTimeout returns a Timeout with unref(); guard for non-Node envs.
      (timer as { unref?: () => void }).unref?.();
      this.resolvers.set(requestId, { resolve, timer });
    });
  }

  /**
   * Return AND remove every currently-pending invocation so a single poll dispatches
   * each exactly once. The resolvers are intentionally LEFT in place — they settle
   * when {@link resolveResult} (or the timeout) fires.
   *
   * @returns The drained invocations (requestId + payload + bearer); empty when idle.
   */
  drainPending(): DrainedInvocation[] {
    const drained: DrainedInvocation[] = [];
    for (const [requestId, entry] of this.pending) {
      drained.push({ requestId, payload: entry.payload, bearer: entry.bearer });
    }
    this.pending.clear();
    return drained;
  }

  /**
   * Settle the awaiting Promise for `requestId` with the GM-returned result.
   *
   * Idempotent: a second call for the same requestId (e.g. a late POST arriving after
   * the timeout already settled it) is a no-op and returns `false`. Clears the pending
   * timeout so it can never fire after a resolve.
   *
   * @param requestId - The queue request id echoed by the poller.
   * @param result    - The {@link ToolInvokeResult} the GM-side dispatch produced.
   * @returns `true` when an awaiting resolver was found and settled; `false` otherwise.
   */
  resolveResult(requestId: string, result: ToolInvokeResult): boolean {
    const entry = this.resolvers.get(requestId);
    if (entry === undefined) {
      return false;
    }
    clearTimeout(entry.timer);
    this.resolvers.delete(requestId);
    this.pending.delete(requestId);
    entry.resolve(result);
    return true;
  }
}
