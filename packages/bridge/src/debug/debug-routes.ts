/**
 * registerDebugRoutes — the 7 dev-gated debug endpoints + WS stream.
 *
 * Quick Task 260529-h5e Wave 2.
 *
 * Registered ONLY when {@link isDebugEnabled} is true (existence gate — layer 1).
 * Every route is additionally secret-gated by {@link requireSecret} (timing-safe
 * `EVF_INTERNAL_SECRET` compare — layer 2). Snapshots/events are redacted by the
 * DebugEventBus + this module (layer 3). See the plan's `<security_model>`.
 *
 * # ADR-0011 compliance
 *
 * `/debug/dispatch-tool` routes through the SAME injected `dispatchToolFn`
 * (→ foundry-module via socketlib). The bridge NEVER calls `activity.use`.
 * `/debug/inject` and `/debug/simulate-gesture` only call `deltaEmitter.emitDelta`
 * (bridge→client direction). No new socketlib handler is added (Gate 8 stays 17).
 *
 * # W-1 idempotency key
 *
 * `/debug/dispatch-tool` generates a FRESH `crypto.randomUUID()` per call when the
 * caller omits `idempotencyKey`, so debug dispatches never collide with the real
 * foundry-module idempotency cache. A supplied key MUST be a UUID (Zod-validated;
 * non-UUID → 400) and is forwarded verbatim.
 *
 * @see ./is-debug-enabled.ts
 * @see ./debug-event-bus.ts
 * @see ../routes/internal-delta.ts (secretsEqual pattern — mirrored here)
 */
import { randomUUID, timingSafeEqual } from 'node:crypto';
import {
  DebugDispatchBodySchema,
  DebugGestureBodySchema,
  DebugInjectBodySchema,
  DisplayOpPayloadSchema,
  R1_DEBUG_DISPLAYOP_TYPE,
  R1_GESTURE_TYPE,
} from '@evf/shared-protocol';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { WebSocket } from 'ws';
import type { TokenCache } from '../auth/token-cache.js';
import type { EntityPackCache } from '../cache/entity-pack-cache.js';
import type { SpellPackCache } from '../cache/spell-pack-cache.js';
import type { DeltaEmitter } from '../ws/delta-emitter.js';
import type { ReplayBuffer } from '../ws/replay-buffer.js';
import type { SessionStore } from '../ws/session-store.js';
import type { DispatchToolFn } from '../ws/tool-invoke.js';
import { DASHBOARD_HTML } from './dashboard.js';
import type { DebugEventBus } from './debug-event-bus.js';

/**
 * Dependencies injected into {@link registerDebugRoutes}.
 *
 * All are live singletons created in `buildServer()` (production) or fakes (tests).
 */
export interface DebugRouteDeps {
  /** Observability ring buffer (also fed by taps + onEmit hook). */
  debugBus: DebugEventBus;
  /** Live session store (snapshot + inject/dispatch/gesture target resolution). */
  sessionStore: SessionStore;
  /** Delta fanout (inject + simulate-gesture call emitDelta). */
  deltaEmitter: DeltaEmitter;
  /** Replay buffer (snapshot size/lastSeq). */
  replayBuffer: ReplayBuffer;
  /** Token cache (snapshot size). */
  tokenCache: TokenCache;
  /** Spell vocabulary cache (snapshot presence). */
  spellCache: SpellPackCache;
  /** Entity vocabulary cache (snapshot presence). */
  entityCache: EntityPackCache;
  /** Lazy metrics accessors for the snapshot summary. */
  metricsAccessors: { connectionCount: () => number };
  /** ADR-0011 dispatch fn — the SAME one the WS loop uses. */
  dispatchToolFn: DispatchToolFn;
}

/**
 * Constant-time secret comparison (mirrors `secretsEqual` in internal-delta.ts).
 *
 * Duplicated as a tiny private fn to avoid coupling the debug module to the
 * internal-delta route module (per plan — acceptable to duplicate the ~5-line fn).
 */
function secretsEqual(a: string, b: string): boolean {
  try {
    return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
  } catch {
    return false;
  }
}

/** Extract a candidate secret from `Authorization: Bearer <s>` or raw `<s>`. */
function secretFromAuthHeader(authHeader: string | undefined): string | undefined {
  if (authHeader === undefined) return undefined;
  return authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : authHeader;
}

/**
 * HTTP secret gate. Replies 401 and returns false when the secret is missing/wrong.
 */
function requireSecret(request: FastifyRequest, reply: FastifyReply): boolean {
  const expected = process.env.EVF_INTERNAL_SECRET;
  const provided = secretFromAuthHeader(request.headers.authorization);
  if (
    expected === undefined ||
    expected === '' ||
    provided === undefined ||
    !secretsEqual(provided, expected)
  ) {
    void reply.status(401).send({ error: 'unauthorized' });
    return false;
  }
  return true;
}

/** Reduce a raw token to a ≤8-char hint + ellipsis for the snapshot. */
function tokenHint(raw: string): string {
  return `${raw.slice(0, Math.min(8, raw.length))}…`;
}

/**
 * Register the debug observability + command routes on a Fastify instance.
 *
 * MUST be called only behind {@link isDebugEnabled} (existence gate) — see server.ts.
 */
export async function registerDebugRoutes(
  app: FastifyInstance,
  deps: DebugRouteDeps,
): Promise<void> {
  const {
    debugBus,
    sessionStore,
    deltaEmitter,
    replayBuffer,
    tokenCache,
    spellCache,
    entityCache,
    metricsAccessors,
    dispatchToolFn,
  } = deps;

  // ── GET /debug/console (alias /debug) — single-file CRT dashboard ──────────────
  // Secret-gated. HTML is an inlined string constant (tsup-bundle-safe — no asset
  // resolution needed in dev or bundled dist). See ./dashboard.ts.
  const serveDashboard = (
    request: FastifyRequest,
    reply: FastifyReply,
  ): FastifyReply | undefined => {
    if (!requireSecret(request, reply)) return undefined;
    return reply.status(200).type('text/html; charset=utf-8').send(DASHBOARD_HTML);
  };
  app.get('/debug/console', async (request, reply) => serveDashboard(request, reply));
  app.get('/debug', async (request, reply) => serveDashboard(request, reply));

  // ── GET /debug/state — redacted bridge snapshot ────────────────────────────────
  // Quick Task 260529-icd: enriched with cheap counts/summaries. Tokens stay redacted
  // (tokenHint only); the response intentionally carries counts/summaries — NEVER full
  // cache entries, payloads, or raw tokens — so it remains small and fast.
  app.get('/debug/state', async (request, reply) => {
    if (!requireSecret(request, reply)) return;
    const now = Date.now();
    const sessions = sessionStore.listSessions().map((s) => ({
      sessionId: s.sessionId,
      tokenHint: tokenHint(s.token),
      locale: s.locale,
      caps: s.caps,
      lastSeq: s.lastSeq,
      createdAt: s.createdAt,
      // age_ms = wall time since the session was created (epoch-ms createdAt).
      age_ms: now - s.createdAt,
    }));
    // Read each cache exactly ONCE; surface a {populated,count} summary only.
    const spellSnap = spellCache.get();
    const entitySnap = entityCache.get();
    return reply.status(200).send({
      ts: now,
      uptime_sec: Math.floor(process.uptime()),
      sessions,
      replayBuffer: { size: replayBuffer.size() },
      deltaEmitter: {
        currentSeq: deltaEmitter.currentSeq,
        connectionCount: deltaEmitter.connectionCount,
      },
      // tokenCache hits/misses are prom-client Counters (not cheaply readable as a
      // single value here) → intentionally OMITTED; only the current size is exposed.
      tokenCache: { size: tokenCache.size },
      caches: {
        spell: { populated: spellSnap !== null, count: spellSnap?.count ?? 0 },
        entity: { populated: entitySnap !== null, count: entitySnap?.count ?? 0 },
      },
      debug: { eventBufferSize: debugBus.size, byDirection: debugBus.byDirection() },
      metrics: { connectionCount: metricsAccessors.connectionCount() },
    });
  });

  // ── GET /debug/events — buffered events (filtered + tailed) ────────────────────
  app.get('/debug/events', async (request, reply) => {
    if (!requireSecret(request, reply)) return;
    const q = request.query as Record<string, string | undefined>;
    const filter: Parameters<typeof debugBus.query>[0] = {};
    if (q.tail !== undefined) {
      const tail = Number.parseInt(q.tail, 10);
      if (Number.isFinite(tail)) filter.tail = tail;
    }
    if (q.type !== undefined) filter.type = q.type;
    if (q.direction !== undefined) filter.direction = q.direction;
    if (q.session !== undefined) filter.sessionId = q.session;
    return reply.status(200).send(debugBus.query(filter));
  });

  // ── POST /debug/inject — fan an envelope to one or all sessions ────────────────
  app.post('/debug/inject', async (request, reply) => {
    if (!requireSecret(request, reply)) return;
    const parsed = DebugInjectBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_body', details: parsed.error.message });
    }
    const { type, payload, targetSessionId } = parsed.data;

    let targetCount: number;
    if (targetSessionId !== undefined && targetSessionId !== null) {
      if (sessionStore.getSession(targetSessionId) === undefined) {
        return reply.status(404).send({ error: 'unknown_session' });
      }
      targetCount = 1;
    } else {
      targetCount = sessionStore.size;
    }

    // emitDelta fans to all matching sessions; targetCount documents the v1 semantics.
    deltaEmitter.emitDelta(type, payload);
    return reply.status(200).send({ injected: true, seq: deltaEmitter.currentSeq, targetCount });
  });

  // ── POST /debug/dispatch-tool — drive a real tool via dispatchToolFn (ADR-0011) ─
  app.post('/debug/dispatch-tool', async (request, reply) => {
    if (!requireSecret(request, reply)) return;
    const parsed = DebugDispatchBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_body', details: parsed.error.message });
    }
    const { sessionId, toolId, idempotencyKey, args } = parsed.data;
    const session = sessionStore.getSession(sessionId);
    if (session === undefined) {
      return reply.status(404).send({ error: 'unknown_session' });
    }

    // W-1: fresh per-call uuid when omitted, so we never collide with the real
    // foundry-module idempotency cache; supplied keys are UUID-validated above.
    const toolPayload = {
      toolId,
      idempotencyKey: idempotencyKey ?? randomUUID(),
      args,
    } as Parameters<DispatchToolFn>[0];

    const start = performance.now();
    const result = await dispatchToolFn(toolPayload, session.token);
    const durationMs = performance.now() - start;

    debugBus.push({
      ts: Date.now(),
      direction: 'tool',
      sessionId,
      type: toolId,
      seq: null,
      summary: `${toolId} → ${result.success ? 'ok' : (result.error ?? 'error')}`,
      payload: { args, result },
    });

    return reply.status(200).send({ result, durationMs });
  });

  // ── POST /debug/simulate-gesture — emit an r1.gesture envelope ─────────────────
  app.post('/debug/simulate-gesture', async (request, reply) => {
    if (!requireSecret(request, reply)) return;
    const parsed = DebugGestureBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_body', details: parsed.error.message });
    }
    const { sessionId, kind } = parsed.data;
    if (sessionStore.getSession(sessionId) === undefined) {
      return reply.status(404).send({ error: 'unknown_session' });
    }
    deltaEmitter.emitDelta(R1_GESTURE_TYPE, { kind, timestamp: Date.now() });
    return reply.status(200).send({ injected: true, seq: deltaEmitter.currentSeq });
  });

  // ── POST /debug/displayop — g2-app render mirror sink ──────────────────────────
  app.post('/debug/displayop', async (request, reply) => {
    if (!requireSecret(request, reply)) return;
    const parsed = DisplayOpPayloadSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_body', details: parsed.error.message });
    }
    const op = parsed.data;
    debugBus.push({
      ts: op.ts,
      direction: 'display',
      sessionId: null,
      type: R1_DEBUG_DISPLAYOP_TYPE,
      seq: null,
      summary: `${op.op}${op.containerCount !== undefined ? ` (${op.containerCount})` : ''}`,
      payload: op,
    });
    return reply.status(200).send({ recorded: true });
  });

  // ── WS /debug/stream — live event feed (W-3: unsubscribe on close AND error) ────
  app.get('/debug/stream', { websocket: true }, (socket: WebSocket, req: FastifyRequest) => {
    // Secret may arrive as `?secret=` (browser WS cannot set headers) or Authorization.
    const url = new URL(req.url ?? '/debug/stream', 'http://localhost');
    const querySecret = url.searchParams.get('secret') ?? undefined;
    const headerSecret = secretFromAuthHeader(req.headers.authorization);
    const provided = querySecret ?? headerSecret;
    const expected = process.env.EVF_INTERNAL_SECRET;
    if (
      expected === undefined ||
      expected === '' ||
      provided === undefined ||
      !secretsEqual(provided, expected)
    ) {
      socket.close(1008, 'unauthorized');
      return;
    }

    const unsubscribe = debugBus.subscribe((event) => {
      try {
        socket.send(JSON.stringify(event));
      } catch {
        // Client gone mid-send — teardown handlers below will unsubscribe.
      }
    });

    // W-3: unsubscribe on BOTH close AND error so the subscriber count returns to baseline.
    socket.on('close', unsubscribe);
    socket.on('error', unsubscribe);
  });
}
