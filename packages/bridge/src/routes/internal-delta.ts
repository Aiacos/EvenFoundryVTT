/**
 * POST /internal/delta — Foundry-module → bridge delta push route.
 *
 * Receives a delta from the Foundry module's `bridgeDeltaEmitter` and fans it
 * out to all subscribed WS sessions with matching capabilities.
 *
 * Auth: `EVF_INTERNAL_SECRET` shared secret (NOT a bearer token).
 * The Foundry module reads this secret from bearer registry settings at pair time.
 * This is a server-to-server internal channel — never exposed to clients.
 *
 * Rate limiting: EXEMPT from the global @fastify/rate-limit limiter via
 * `{ config: { rateLimit: false } }` on the route registration.
 * Rationale: the homelab bridge logged 1102 production 429s during the 2026-06-09
 * game session (before the ~1Hz map stream of v0.1.9 even existed). With v0.1.9
 * frame pushes (~60/min) plus critical character.delta / combat.* deltas all
 * sharing the single EVF_INTERNAL_SECRET bearer key, the 100-req/min budget would
 * throttle gameplay-critical deltas as collateral damage. This is a server-to-server
 * internal channel, so rate-limiting it provides no abuse protection — only damage.
 *
 * Why NOT a high-ceiling limit instead of full exemption: the frame stream is
 * uncapped (captureFps 1–60, FRAME-PNG-02) → up to 3600 frame POSTs/min PLUS the
 * stateful deltas. Any fixed per-minute ceiling large enough to never throttle a
 * legitimate 60fps stream is also large enough to be useless as an abuse limit, while
 * a smaller ceiling would drop frames. Abuse protection on this route is instead
 * provided by (a) the EVF_INTERNAL_SECRET gate and (b) the ALLOWED_DELTA_TYPES
 * allowlist (below) which bounds the fan-out blast radius to known envelope types.
 * TODO (#43): restrict /internal/delta to Docker internal network in production.
 *
 * Security:
 * - T-02-01: internal secret is redacted from pino logs (redact config in server.ts)
 * - TODO (#43): restrict /internal/delta to Docker internal network in production
 *
 * Body: `{ type: string, payload: unknown }` validated against DeltaEnvelopeSchema.
 *
 * Responses:
 * - 200 `{ ok: true }`     — delta accepted and fanned out
 * - 401 `unauthorized`     — missing or incorrect EVF_INTERNAL_SECRET
 * - 400 `invalid_body`     — body failed Zod validation
 *
 * @see packages/bridge/src/ws/delta-emitter.ts (DeltaEmitter.emitDelta)
 * @see packages/shared-protocol/src/envelope.ts (DeltaEnvelopeSchema)
 */

import { timingSafeEqual } from 'node:crypto';
import { SETTINGS_DISPLAY_TYPE, SettingsDisplaySchema } from '@evf/shared-protocol';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { SettingsStore } from '../settings/settings-store.js';
import type { DeltaEmitter } from '../ws/delta-emitter.js';

/** Delta types that carry a full map frame — the upstream-settings piggyback carrier. */
const FRAME_DELTA_TYPES: ReadonlySet<string> = new Set(['frame_png', 'frame_pixels']);

/**
 * Allowlist of delta `type` discriminants the bridge accepts on POST /internal/delta
 * and fans out verbatim to all subscribed WS clients.
 *
 * SECURITY (cache-poisoning / fan-out abuse): the route formerly accepted ANY
 * non-empty `type` with a `z.unknown()` payload and broadcast it verbatim to every
 * WS client. Combined with `rateLimit:false`, that let a caller holding the internal
 * secret (or, defense-in-depth, any future caller that reaches this route) inject
 * arbitrary envelope types into every connected glasses client. We now reject any
 * `type` outside this closed set with 400 BEFORE fan-out.
 *
 * The set is derived EXHAUSTIVELY from the types the foundry-module actually pushes
 * through `bridgeDeltaEmitter` → POST /internal/delta (enumerated from
 * packages/foundry-module/src — module.ts ready-hook wiring + the readers + the
 * canvas extractor). Cross-checked against `EPHEMERAL_DELTA_TYPES` (delta-emitter.ts)
 * and the bridge `onDelta` cache handlers (server.ts: bearer-registry / character-list /
 * character-snapshot / spell-pack / entity-pack). `frame_pixels` is not currently
 * emitted but is a recognised frame carrier (EPHEMERAL_DELTA_TYPES + FRAME_DELTA_TYPES),
 * kept here for forward-compat so a future module that switches carriers is not broken.
 *
 * Types deliberately EXCLUDED: client→bridge→Foundry uplink types (`template.placement.*`,
 * `r1.gesture`, `client_setting`) and debug-only types (`r1.debug.displayop`,
 * `r1.perf.sample`) — these never arrive on the downlink /internal/delta route.
 *
 * @see packages/foundry-module/src/module.ts (ready-hook bridgeDeltaEmitter wiring)
 * @see packages/bridge/src/ws/delta-emitter.ts (EPHEMERAL_DELTA_TYPES)
 */
const ALLOWED_DELTA_TYPES: ReadonlySet<string> = new Set([
  // Frame carriers (ephemeral) + telemetry
  'frame_png',
  'frame_pixels',
  'frame_stats',
  // Display-settings sync (bidirectional snapshot carrier)
  'settings.display',
  // Hook-subscriber deltas (character + combat + scene + log)
  'character.delta',
  'combat.turn',
  'combat.targets',
  'combat.state',
  'scene.viewport',
  'event.log.delta',
  // Vocabulary / roster push readers
  'r1.spells.available',
  'r1.entities.available',
  'r1.bearers.available',
  'r1.characters.available',
  // Write-path / watcher telemetry
  'r1.multiattack.progress',
  'r1.reaction.available',
  'r1.action.result',
  'r1.movement.budget',
  'r1.action.economy',
  'conc.conflict',
  // Bearer rotation snapshot
  'bearer.rotated',
  // Portrait render push (bridge re-emits this via DeltaEmitter on cache-miss, but the
  // foundry-module may also relay it; allow it through for symmetry — D-13-07).
  'r1.portrait.ready',
]);

/** Schema for the POST /internal/delta request body. */
const InternalDeltaBodySchema = z.object({
  /** Delta type discriminant — must be a known internal delta type (see ALLOWED_DELTA_TYPES). */
  type: z.string().min(1),
  /** Arbitrary serialisable delta payload — validated by capability-specific handlers. */
  payload: z.unknown(),
});

/**
 * Constant-time string comparison to prevent timing-oracle attacks on secret comparison.
 *
 * `timingSafeEqual` requires equal-length Buffers; mismatched lengths return false
 * immediately (before the byte loop) which is acceptable — length itself is not secret.
 */
function secretsEqual(a: string, b: string): boolean {
  try {
    return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
  } catch {
    // Buffer.from can throw on invalid input; treat as unequal
    return false;
  }
}

/**
 * Optional callback invoked with each validated delta (type + payload) BEFORE
 * fan-out via DeltaEmitter.
 *
 * Allows typed delta processors (e.g. spell-pack-handler) to intercept specific
 * envelope types and update internal caches without modifying the route itself.
 *
 * @param type    - Envelope type discriminant (e.g. `'r1.spells.available'`)
 * @param payload - Validated (but not schema-checked per-type) payload
 */
export type DeltaInterceptFn = (type: string, payload: unknown) => void;

/**
 * Register the POST /internal/delta route.
 *
 * @param app           - Fastify instance
 * @param deltaEmitter  - Shared DeltaEmitter instance (created in server.ts)
 * @param onDelta       - Optional callback for delta interception (e.g. spell-pack-cache update)
 * @param settingsStore - Optional display-settings store: caches the downstream
 *                        `settings.display` snapshot and piggybacks any pending
 *                        upstream edit on the response of a frame POST.
 * @param getFocusActorId - Optional getter supplying the focus-actor id piggybacked
 *                        on the frame-POST response for map auto-framing (the
 *                        stream-leader Foundry client centers the captured map
 *                        region on the returned actor). `null` = no pin.
 */
export async function registerInternalDeltaRoute(
  app: FastifyInstance,
  deltaEmitter: DeltaEmitter,
  onDelta?: DeltaInterceptFn,
  settingsStore?: SettingsStore,
  getFocusActorId?: () => string | null,
): Promise<void> {
  app.post('/internal/delta', { config: { rateLimit: false } }, async (request, reply) => {
    // --- Auth: EVF_INTERNAL_SECRET header check ---
    const internalSecret = process.env.EVF_INTERNAL_SECRET;
    const authHeader = request.headers.authorization;

    // Accept "Bearer <secret>" or raw "<secret>" for simplicity
    const providedSecret = authHeader?.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length)
      : authHeader;

    if (
      internalSecret === undefined ||
      internalSecret === '' ||
      providedSecret === undefined ||
      !secretsEqual(providedSecret, internalSecret)
    ) {
      return reply.status(401).send({ error: 'unauthorized' });
    }

    // --- Validate body ---
    const parsed = InternalDeltaBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_body', details: parsed.error.message });
    }

    const { type, payload } = parsed.data;

    // --- Allowlist the delta type BEFORE any fan-out (cache-poisoning / fan-out abuse) ---
    // Reject unknown types with 400; do NOT broadcast them to WS clients. The closed set
    // is enumerated from the types the foundry-module actually pushes (see ALLOWED_DELTA_TYPES).
    if (!ALLOWED_DELTA_TYPES.has(type)) {
      request.log.warn({ type }, 'internal/delta: rejected unknown delta type (not in allowlist)');
      return reply.status(400).send({ error: 'unknown_delta_type' });
    }

    // --- Display-settings sync: cache the downstream snapshot ---
    // The module pushes a FULL `settings.display` snapshot on ready + on change.
    // Cache the latest so new WS sessions get it on connect (see server.ts /ws).
    if (settingsStore !== undefined && type === SETTINGS_DISPLAY_TYPE) {
      const settings = SettingsDisplaySchema.safeParse(payload);
      if (settings.success) {
        settingsStore.setLatest(settings.data);
      } else {
        // A malformed settings.display from the module silently leaves the cache
        // stale (new clients get old values); warn so the protocol drift is visible.
        request.log.warn(
          { reason: settings.error.message },
          'internal/delta: invalid settings.display payload — cache not updated',
        );
      }
    }

    // --- Typed delta interception (e.g. spell-pack-cache update) ---
    // Called BEFORE fan-out so caches are warm when WS clients receive the delta.
    onDelta?.(type, payload);

    // --- Fan out to all subscribed WS sessions ---
    deltaEmitter.emitDelta(type, payload);

    // --- Frame-POST reverse channel: piggyback glasses-originated control on
    // the leader-only frame response (no new connection). Carries pending
    // display-settings edits AND the focus-actor id for map auto-framing.
    if (FRAME_DELTA_TYPES.has(type)) {
      const pendingSettings = settingsStore?.drainPending() ?? null;
      const focusActorId = getFocusActorId?.() ?? null;
      if (pendingSettings !== null || focusActorId !== null) {
        return reply.status(200).send({
          ok: true,
          ...(pendingSettings !== null ? { pendingSettings } : {}),
          ...(focusActorId !== null ? { focusActorId } : {}),
        });
      }
    }

    return reply.status(200).send({ ok: true });
  });
}
