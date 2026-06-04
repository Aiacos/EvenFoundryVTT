/**
 * AgentRegistry — in-memory connected-agent registry + id-correlated pending-command map.
 *
 * Quick Task 260604-cwa: Dev-only whole-system debug/control harness.
 *
 * DEV-ONLY. Registered only when {@link isDebugEnabled} is true (via server.ts).
 * Controls the list of currently connected debug agents (g2-app, bridge, foundry)
 * and routes commands to them over the `/debug/agent` WebSocket channel, with
 * correlation of results back to callers via `waitFor`.
 *
 * # Security
 *
 * T-cwa-02: Agents authenticate at WS upgrade time (secret gate in agent-routes.ts).
 * T-cwa-04: Pending command map is bounded by `maxPending` cap + TTL sweep so the
 *   map never grows unboundedly (accepted DoS surface on localhost dev surface).
 *
 * @see ./agent-routes.ts (consumers)
 * @see ../server.ts (registration point — inside existing isDebugEnabled block)
 */
import { randomUUID } from 'node:crypto';
import type { AgentRole } from '@evf/shared-protocol';
import type { WebSocket } from 'ws';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Result shape returned by `waitFor` and `resolve`. Mirrors the AgentResultSchema
 * without the `kind` discriminant (that's a WS-wire concern, not a registry concern).
 */
export type CommandOutcome =
  | { ok: true; result?: unknown }
  | { ok: false; error: string };

/** Options for constructing an {@link AgentRegistry}. */
export interface AgentRegistryOpts {
  /**
   * Maximum number of pending (unresolved) commands.
   * Oldest entries are swept when this cap is exceeded.
   *
   * @default 100
   */
  maxPending?: number;
  /**
   * Command TTL in milliseconds. Pending entries are swept when the timer fires.
   *
   * @default 30000 (30 s)
   */
  ttlMs?: number;
}

/** Summary of a registered agent exposed by `listAgents`. */
export interface AgentInfo {
  /** Unique id assigned on register. */
  agentId: string;
  /** Agent role. */
  role: AgentRole;
  /** Human-readable agent name. */
  name: string;
  /** `Date.now()` epoch ms when the agent connected. */
  connectedAt: number;
}

/** Internal agent entry (includes socket, not exposed via listAgents). */
interface AgentEntry extends AgentInfo {
  socket: WebSocket;
}

/** Internal pending command entry. */
interface PendingEntry {
  resolve: (outcome: CommandOutcome) => void;
  timer: ReturnType<typeof setTimeout>;
}

// ─── AgentRegistry ────────────────────────────────────────────────────────────

/** Default cap for pending commands. */
const DEFAULT_MAX_PENDING = 100;
/** Default command TTL in milliseconds. */
const DEFAULT_TTL_MS = 30_000;

/**
 * In-memory registry of connected debug agents and pending (unresolved) commands.
 *
 * Lifecycle:
 *  1. `register()` — called on WS open + successful secret check + register frame.
 *  2. `send()` — called on `POST /debug/cmd`; routes a command to the named agent.
 *  3. `resolve()` — called when the agent sends a `'result'` frame back over WS.
 *  4. `waitFor()` — optional polling hook; returns a promise settled by `resolve()`
 *     or a timeout sentinel, used by `POST /debug/cmd?wait=true`.
 *  5. `unregister()` — called on WS close/error.
 */
export class AgentRegistry {
  private readonly agents = new Map<string, AgentEntry>();
  private readonly pending = new Map<string, PendingEntry>();
  private readonly maxPending: number;
  private readonly ttlMs: number;

  /**
   * @param opts - Optional tuning for pending-map cap + TTL.
   */
  constructor(opts: AgentRegistryOpts = {}) {
    this.maxPending = opts.maxPending ?? DEFAULT_MAX_PENDING;
    this.ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS;
  }

  // ── Registration ─────────────────────────────────────────────────────────────

  /**
   * Register a newly connected agent.
   *
   * @param params.role      - Agent role (g2-app | bridge | foundry).
   * @param params.name      - Human-readable agent name (e.g. `'main'`).
   * @param params.socket    - Live WebSocket connection for sending commands.
   * @returns The assigned `agentId` (UUID).
   */
  register(params: { role: AgentRole; name: string; socket: WebSocket }): string {
    const agentId = randomUUID();
    this.agents.set(agentId, {
      agentId,
      role: params.role,
      name: params.name,
      socket: params.socket,
      connectedAt: Date.now(),
    });
    return agentId;
  }

  /**
   * Unregister an agent on WS close or error.
   *
   * Idempotent — calling with an unknown `agentId` is a no-op.
   *
   * @param agentId - The id returned by `register`.
   */
  unregister(agentId: string): void {
    this.agents.delete(agentId);
  }

  /**
   * List all currently registered agents (shallow copies, no socket reference).
   *
   * @returns Array of {@link AgentInfo} objects, newest-registered last.
   */
  listAgents(): AgentInfo[] {
    return Array.from(this.agents.values()).map(({ agentId, role, name, connectedAt }) => ({
      agentId,
      role,
      name,
      connectedAt,
    }));
  }

  // ── Command dispatch ──────────────────────────────────────────────────────────

  /**
   * Send a command to a named agent (or role-fallback when name omitted).
   *
   * Resolves the target agent by exact `name` match first; when no match by name,
   * falls back to the first agent whose `role` equals `target`. Generates a UUID
   * command id, writes `{id, cmd, args}` as JSON to the agent's socket, and stores
   * a pending entry so `waitFor` can settle when `resolve` is called.
   *
   * The pending map is capped at `maxPending` — if adding the new entry would exceed
   * the cap, the oldest entries (by insertion order) are swept and their promises
   * settle with a `{ok:false,error:'evicted'}` sentinel before the new one is added.
   *
   * @param target - Agent name (primary) or role (fallback).
   * @param cmd    - Command name (e.g. `'setBridgeUrl'`).
   * @param args   - Command-specific arguments.
   * @returns `{id}` on success, `null` when the target is unknown.
   */
  send(target: string, cmd: string, args: unknown): { id: string } | null {
    const agent = this._resolveAgent(target);
    if (agent === undefined) {
      return null;
    }
    const id = randomUUID();
    const frame = JSON.stringify({ id, cmd, args });
    agent.socket.send(frame);
    this._storePending(id);
    return { id };
  }

  // ── Result correlation ────────────────────────────────────────────────────────

  /**
   * Settle the pending command identified by `id` with the given outcome.
   *
   * Called when the agent sends a `'result'` frame back over WS. Clears the pending
   * entry and its TTL timer. Resolving an unknown `id` is a no-op.
   *
   * @param id      - Command id to resolve.
   * @param outcome - The result payload from the agent.
   */
  resolve(id: string, outcome: CommandOutcome): void {
    const entry = this.pending.get(id);
    if (entry === undefined) {
      return;
    }
    clearTimeout(entry.timer);
    this.pending.delete(id);
    entry.resolve(outcome);
  }

  /**
   * Wait for the command identified by `id` to be resolved (via `resolve()`) or
   * time out.
   *
   * Returns a promise that settles with `CommandOutcome`:
   * - Success: `{ok:true, result}` — when `resolve(id, {ok:true,...})` is called first.
   * - Error: `{ok:false, error}` — when `resolve(id, {ok:false,...})` is called first.
   * - Timeout sentinel: `{ok:false, error:'timeout'}` — when `timeoutMs` elapses first.
   *
   * In all cases the pending entry is cleared before the promise settles.
   *
   * @param id        - Command id (must match a pending entry created by `send()`).
   * @param timeoutMs - Hard timeout in milliseconds.
   * @returns A promise settling with the command outcome.
   */
  waitFor(id: string, timeoutMs: number): Promise<CommandOutcome> {
    const entry = this.pending.get(id);
    if (entry === undefined) {
      // Already resolved or unknown — return a no-result ok
      return Promise.resolve({ ok: false, error: 'unknown_id' });
    }

    return new Promise<CommandOutcome>((resolve) => {
      // Cancel the existing TTL timer and replace with the caller's timeout.
      clearTimeout(entry.timer);

      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve({ ok: false, error: 'timeout' });
      }, timeoutMs);

      // Replace the pending entry with the new timer + resolver
      this.pending.set(id, {
        resolve: (outcome) => {
          clearTimeout(timer);
          resolve(outcome);
        },
        timer,
      });
    });
  }

  // ── Private helpers ───────────────────────────────────────────────────────────

  /**
   * Resolve a target string to an agent entry.
   *
   * Tries exact name match first, then role match.
   */
  private _resolveAgent(target: string): AgentEntry | undefined {
    // 1. Exact name match
    for (const agent of this.agents.values()) {
      if (agent.name === target) {
        return agent;
      }
    }
    // 2. Role fallback
    for (const agent of this.agents.values()) {
      if (agent.role === target) {
        return agent;
      }
    }
    return undefined;
  }

  /**
   * Store a pending command entry, evicting oldest entries when the cap is exceeded.
   *
   * T-cwa-04: bounds the pending map so it cannot grow unboundedly even under
   * adversarial send bursts on the localhost dev surface.
   */
  private _storePending(id: string): void {
    // Evict oldest entries if we would exceed the cap
    while (this.pending.size >= this.maxPending) {
      const oldest = this.pending.keys().next().value;
      if (oldest === undefined) {
        break;
      }
      const entry = this.pending.get(oldest);
      if (entry !== undefined) {
        clearTimeout(entry.timer);
        entry.resolve({ ok: false, error: 'evicted' });
      }
      this.pending.delete(oldest);
    }

    // Create TTL timer that auto-settles after ttlMs
    const timer = setTimeout(() => {
      this.pending.delete(id);
    }, this.ttlMs);

    this.pending.set(id, {
      resolve: () => {
        // Placeholder — will be replaced if waitFor() is called
      },
      timer,
    });
  }
}
