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

/** Schema for the POST /internal/delta request body. */
const InternalDeltaBodySchema = z.object({
  /** Delta type discriminant — e.g. "character.delta", "combat.turn" */
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
 */
export async function registerInternalDeltaRoute(
  app: FastifyInstance,
  deltaEmitter: DeltaEmitter,
  onDelta?: DeltaInterceptFn,
  settingsStore?: SettingsStore,
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

    // --- Upstream-settings piggyback ---
    // Frame POSTs come only from the stream-leader client, so the frame response
    // is a leader-only, no-new-connection carrier for glasses-originated setting
    // edits. Drain the pending box onto the response; the module applies them.
    if (settingsStore !== undefined && FRAME_DELTA_TYPES.has(type)) {
      const pendingSettings = settingsStore.drainPending();
      if (pendingSettings !== null) {
        return reply.status(200).send({ ok: true, pendingSettings });
      }
    }

    return reply.status(200).send({ ok: true });
  });
}
