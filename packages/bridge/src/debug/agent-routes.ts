/**
 * registerAgentRoutes — WS /debug/agent + GET /debug/agents + POST /debug/cmd +
 * GET /debug/logs.
 *
 * Quick Task 260604-cwa: Dev-only whole-system debug/control harness.
 *
 * Registered ONLY when {@link isDebugEnabled} is true, inside the SAME
 * `if (debugEnabled && debugBus !== undefined)` block in `server.ts` (existence gate —
 * genuine 404 when off). Every route is additionally secret-gated by
 * `requireSecret` / `checkWsSecret` (timing-safe `EVF_INTERNAL_SECRET` — layer 2).
 * Agent log/result events pushed to the `DebugEventBus` are redacted by the bus's
 * structural redaction (layer 3 — reuses existing known-token scrub).
 *
 * # Reuse constraints
 *
 * - REUSES `DebugEventBus.push()` — all agent events land in the SAME ring buffer.
 * - REUSES `checkWsSecret` / `requireSecret` / `secretsEqual` from `debug-secret.ts`.
 * - REUSES `isDebugEnabled()` existence gate via server.ts (not called here).
 *
 * # Security surface
 *
 * T-cwa-01: existence gate — routes absent (404) when debug is off.
 * T-cwa-02: WS upgrade: close 1008 on wrong/missing secret.
 * T-cwa-03: agent log events and command results flow through bus redaction.
 * T-cwa-04: AgentRegistry caps pending commands (maxPending + TTL sweep).
 *
 * @see ./agent-registry.ts (AgentRegistry)
 * @see ./debug-secret.ts (shared secret helpers)
 * @see ./debug-event-bus.ts (DebugEventBus)
 * @see ../server.ts (registration point)
 */
import {
  AgentClientFrameSchema,
  DEBUG_AGENT_LOG_DIRECTION,
  DEBUG_AGENT_RESULT_DIRECTION,
  DebugCmdBodySchema,
} from '@evf/shared-protocol';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { WebSocket } from 'ws';
import type { AgentRegistry } from './agent-registry.js';
import type { DebugEventBus } from './debug-event-bus.js';
import { checkWsSecret, requireSecret } from './debug-secret.js';

/**
 * Dependencies injected into {@link registerAgentRoutes}.
 *
 * All are live singletons created in `buildServer()` (production) or fakes (tests).
 */
export interface AgentRouteDeps {
  /** Shared observability ring buffer (T-cwa-03: agent events flow through here). */
  debugBus: DebugEventBus;
  /** Connected-agent registry + pending-command correlation map. */
  agentRegistry: AgentRegistry;
}

/**
 * Register the agent control-channel routes on a Fastify instance.
 *
 * MUST be called only behind {@link isDebugEnabled} (existence gate) — see server.ts.
 *
 * Endpoints registered:
 * - `WS  GET /debug/agent`   — agent connects, registers role/name, receives commands.
 * - `GET /debug/agents`      — roster of currently connected agents.
 * - `POST /debug/cmd`        — relay a command to a named agent (optionally wait for result).
 * - `GET /debug/logs?since=` — ring-buffer reader with newest-id tracking.
 *
 * @param app  - Fastify instance (must have `@fastify/websocket` registered).
 * @param deps - Injected dependencies (debugBus + agentRegistry).
 */
export async function registerAgentRoutes(
  app: FastifyInstance,
  deps: AgentRouteDeps,
): Promise<void> {
  const { debugBus, agentRegistry } = deps;

  // ── WS GET /debug/agent — agent control channel ───────────────────────────
  // T-cwa-02: secret via `?secret=` (browsers cannot set WS headers) or Authorization.
  // Close 1008 on mismatch.
  app.get('/debug/agent', { websocket: true }, (socket: WebSocket, req: FastifyRequest) => {
    if (!checkWsSecret(req.url, req.headers.authorization)) {
      socket.close(1008, 'unauthorized');
      return;
    }

    // agentId assigned after the 'register' frame arrives — tracks across messages
    let agentId: string | undefined;

    socket.on('message', (rawData) => {
      let parsed: ReturnType<typeof AgentClientFrameSchema.safeParse>;
      try {
        parsed = AgentClientFrameSchema.safeParse(JSON.parse(String(rawData)));
      } catch {
        // Invalid JSON — ignore silently (don't crash the handler)
        return;
      }

      if (!parsed.success) {
        // Invalid frame shape — ignore silently
        return;
      }

      const frame = parsed.data;

      if (frame.kind === 'register') {
        // Register the agent in the registry
        agentId = agentRegistry.register({
          role: frame.role,
          name: frame.name,
          socket,
        });
        // Push a roster log event to the bus so it appears in /debug/logs
        debugBus.push({
          ts: Date.now(),
          direction: DEBUG_AGENT_LOG_DIRECTION,
          sessionId: null,
          type: 'agent.register',
          seq: null,
          summary: `agent registered: ${frame.role}/${frame.name} (${agentId})`,
          payload: { agentId, role: frame.role, name: frame.name },
        });
        return;
      }

      if (frame.kind === 'log') {
        // Mirror agent console.* output into the shared bus
        debugBus.push({
          ts: frame.ts,
          direction: DEBUG_AGENT_LOG_DIRECTION,
          sessionId: null,
          type: `agent.log.${frame.level}`,
          seq: null,
          summary: `[${frame.source}] ${frame.msg}`,
          payload: { level: frame.level, source: frame.source, msg: frame.msg },
        });
        return;
      }

      if (frame.kind === 'result') {
        // Settle the pending command in the registry (T-cwa-03: flows through bus redaction)
        const outcome: import('./agent-registry.js').CommandOutcome = frame.ok
          ? { ok: true, result: frame.result }
          : { ok: false, error: frame.error ?? 'unknown' };
        agentRegistry.resolve(frame.id, outcome);
        // Also push the result to the bus so /debug/logs captures it
        debugBus.push({
          ts: Date.now(),
          direction: DEBUG_AGENT_RESULT_DIRECTION,
          sessionId: null,
          type: 'agent.result',
          seq: null,
          summary: `cmd ${frame.id.slice(0, 8)}… → ${frame.ok ? 'ok' : (frame.error ?? 'error')}`,
          payload: { id: frame.id, ok: frame.ok, result: frame.result, error: frame.error },
        });
      }
    });

    // Unregister on both close AND error (W-3 teardown pattern)
    const cleanup = () => {
      if (agentId !== undefined) {
        agentRegistry.unregister(agentId);
        debugBus.push({
          ts: Date.now(),
          direction: DEBUG_AGENT_LOG_DIRECTION,
          sessionId: null,
          type: 'agent.disconnect',
          seq: null,
          summary: `agent disconnected: ${agentId}`,
          payload: { agentId },
        });
        agentId = undefined;
      }
    };
    socket.on('close', cleanup);
    socket.on('error', cleanup);
  });

  // ── GET /debug/agents — connected agent roster ────────────────────────────
  // T-cwa-01: secret-gated.
  app.get('/debug/agents', async (request, reply) => {
    if (!requireSecret(request, reply)) return;
    return reply.status(200).send({ agents: agentRegistry.listAgents() });
  });

  // ── POST /debug/cmd — relay command to named agent ────────────────────────
  // T-cwa-01: secret-gated.
  // T-cwa-02: AgentRegistry already bound the target's socket at register time.
  // T-cwa-04: pending map is bounded by AgentRegistry.maxPending.
  app.post('/debug/cmd', async (request, reply) => {
    if (!requireSecret(request, reply)) return;

    const parsed = DebugCmdBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_body', details: parsed.error.message });
    }

    const { target, cmd, args, wait } = parsed.data;
    const result = agentRegistry.send(target, cmd, args);

    if (result === null) {
      return reply.status(404).send({ error: 'unknown_target' });
    }

    if (wait === true) {
      // Wait up to 2 s for the agent's result — T-cwa-04 accepted DoS on dev surface.
      const outcome = await agentRegistry.waitFor(result.id, 2000);
      return reply.status(200).send({ id: result.id, result: outcome });
    }

    return reply.status(200).send({ id: result.id });
  });

  // ── GET /debug/logs?since=<n> — aggregated ring-buffer reader ────────────
  // T-cwa-01: secret-gated.
  // T-cwa-03: events from the shared bus — already redacted by DebugEventBus.push().
  // Includes bridge pino logs (which flow into the bus via the existing multistream tap
  // in server.ts) + agent log/result events pushed above.
  app.get('/debug/logs', async (request, reply) => {
    if (!requireSecret(request, reply)) return;

    const q = request.query as Record<string, string | undefined>;
    const since = q.since !== undefined ? Number.parseInt(q.since, 10) : 0;
    const sinceId = Number.isFinite(since) ? since : 0;

    // Fetch all events from the bus, then filter to id > sinceId.
    // The bus already returns newest events within cap; we layer the since filter here.
    const all = debugBus.query({});
    const events = all.filter((e) => e.id > sinceId);
    const latestId = all.length > 0 ? (all[all.length - 1]?.id ?? 0) : 0;

    return reply.status(200).send({ events, latestId });
  });
}
