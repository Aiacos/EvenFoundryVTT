/**
 * Idempotency-Key middleware for the EVF bridge.
 *
 * Implements RFC `draft-ietf-httpapi-idempotency-key-header-04` semantics as a
 * Fastify-native hook pair (preHandler + onSend) backed by an in-memory
 * `IdempotencyStore` with a 60-second LRU window.
 *
 * ## Scope
 *
 * Applies to **POST requests only** and **excludes `/internal/*` prefixes**
 * (server-to-server delta push channel — dedup would corrupt delta sequence
 * semantics per RESEARCH Open Question 4).
 *
 * ## Behavior matrix
 *
 * | Method | Has Key | Body hash match | Entry age | Result                       |
 * | ------ | ------- | --------------- | --------- | ---------------------------- |
 * | POST   | yes     | —               | none      | Pass through; cache response |
 * | POST   | yes     | match           | < 60s     | Replay cached response       |
 * | POST   | yes     | mismatch        | < 60s     | 422 idempotency_key_conflict  |
 * | POST   | yes     | match           | > 60s     | Pass through; cache response |
 * | POST   | no      | —               | —         | Pass through; no caching     |
 * | other  | any     | —               | —         | Pass through; no caching     |
 * | POST   | yes     | —               | —         | /internal/* — pass through   |
 *
 * ## Threat model
 *
 * T-03-05 [HIGH]: Replay attack to suppress legitimate retry — bearer token
 * possession is the trust root. Phase 07 will bind cache entries to bearer
 * hash (`${key}:${bearerHash}`); Phase 03 cannot do this yet because the stub
 * response is identical for any bearer. Limitation documented.
 *
 * T-03-06 [HIGH]: Memory exhaustion via key flooding — store is bounded at
 * MAX_ENTRIES (10,000). On insertion overflow, the oldest entry (Map insertion
 * order) is evicted. Rate-limit plugin (100 req/min) further caps attainable
 * key count.
 *
 * T-03-07 [MEDIUM]: Inadvertent key logging — `Idempotency-Key` header is
 * added to the pino redact list in `server.ts`. Debug log lines truncate the
 * key to its first 8 characters.
 *
 * @see ADR-0002 (Protocol Versioning — 60s LRU window)
 * @see RFC draft-ietf-httpapi-idempotency-key-header-04
 */

import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

/** TTL for idempotency cache entries — 60 seconds per ADR-0002. */
const TTL_MS = 60_000;

/** Maximum number of entries in the store — T-03-06 DoS mitigation. */
const MAX_ENTRIES = 10_000;

/**
 * URL prefixes excluded from idempotency caching.
 *
 * `/internal/` is excluded because the delta-push endpoint (`POST /internal/delta`)
 * uses sequence numbers for its own dedup protocol; adding idempotency-key caching
 * on top would corrupt delta sequence semantics.
 */
const IDEMPOTENCY_EXCLUDED_PREFIXES = ['/internal/'];

/** A cached idempotency response entry. */
export interface IdempotencyEntry {
  /** SHA-256 hex digest of `JSON.stringify(request.body ?? null)`. */
  requestBodyHash: string;
  /** HTTP status code returned by the handler. */
  responseStatus: number;
  /** Parsed JSON response body (or raw string if JSON.parse failed). */
  responseBody: unknown;
  /** Unix timestamp (ms) when the entry was stored. */
  cachedAt: number;
}

/**
 * In-memory idempotency store.
 *
 * Backed by a `Map<string, IdempotencyEntry>` that preserves insertion order
 * for LRU eviction. Entries expire after `TTL_MS` on read (lazy eviction).
 *
 * Store instances are created per `buildServer()` call for test isolation.
 *
 * @example
 * ```ts
 * const store = new IdempotencyStore();
 * store.set('key-abc', { requestBodyHash: 'sha256hex', responseStatus: 200, responseBody: { ok: true } });
 * const entry = store.get('key-abc'); // => IdempotencyEntry | undefined
 * ```
 */
export class IdempotencyStore {
  private readonly store = new Map<string, IdempotencyEntry>();

  /**
   * Retrieve a cached entry by key.
   *
   * Returns `undefined` if the key is unknown or if the entry has expired
   * (lazy eviction — expired entries are deleted on read).
   */
  get(key: string): IdempotencyEntry | undefined {
    const entry = this.store.get(key);
    if (entry === undefined) {
      return undefined;
    }
    if (Date.now() - entry.cachedAt > TTL_MS) {
      this.store.delete(key);
      return undefined;
    }
    return entry;
  }

  /**
   * Store a response entry for the given key.
   *
   * `cachedAt` is set to `Date.now()` at insertion time.
   * If the store has reached `MAX_ENTRIES`, the oldest entry (insertion order)
   * is evicted before inserting the new one (T-03-06).
   */
  set(key: string, entry: Omit<IdempotencyEntry, 'cachedAt'>): void {
    // Evict oldest on overflow (T-03-06). Map.prototype.keys() is ordered by insertion.
    if (this.store.size >= MAX_ENTRIES && !this.store.has(key)) {
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) {
        this.store.delete(oldest);
      }
    }
    this.store.set(key, { ...entry, cachedAt: Date.now() });
  }

  /**
   * Current number of entries in the store.
   *
   * Note: includes entries that may have expired but not yet been lazily evicted.
   * Plan 03-03 uses this for the `evf_idempotency_store_size` Prometheus gauge.
   */
  get size(): number {
    return this.store.size;
  }

  /**
   * Clear all entries.
   *
   * Test-only reset — does not affect production code.
   */
  clear(): void {
    this.store.clear();
  }
}

/**
 * Register idempotency hooks on a Fastify instance.
 *
 * Adds a `preHandler` hook (check existing entry) and an `onSend` hook
 * (cache the new response). Both hooks scope themselves to POST requests
 * with a non-empty `Idempotency-Key` header on non-excluded URLs.
 *
 * **Registration order matters:** call this BEFORE registering routes so the
 * hooks intercept all POST handlers.
 *
 * @param app - Fastify instance to hook.
 * @param store - Idempotency store (per-server singleton).
 * @param opts - Optional callbacks.
 * @param opts.onDedup - Called once per replay hit (same key + same body within
 *   TTL). Plan 03-03 passes a callback that increments
 *   `evf_idempotency_dedup_total`. Omitting it is valid for tests.
 *
 * @example
 * ```ts
 * const store = new IdempotencyStore();
 * await registerIdempotencyHooks(app, store, { onDedup: () => metrics.dedupCounter.inc() });
 * ```
 */
export async function registerIdempotencyHooks(
  app: FastifyInstance,
  store: IdempotencyStore,
  opts?: { onDedup?: () => void },
): Promise<void> {
  // preHandler: check for existing idempotency entry BEFORE the route handler runs.
  app.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    // Only POST requests are subject to idempotency caching.
    if (request.method !== 'POST') {
      return;
    }

    // Excluded URL prefixes: request.url.startsWith('/internal/') → skip.
    // The constant array makes this extensible for future exclusions.
    for (const prefix of IDEMPOTENCY_EXCLUDED_PREFIXES) {
      if (request.url.startsWith(prefix)) {
        return;
      }
    }

    // Read and validate the header.
    const rawKey = request.headers['idempotency-key'];
    if (typeof rawKey !== 'string' || rawKey.trim() === '') {
      // No key — pass through; no caching will be done.
      return;
    }

    // Compute SHA-256 body hash. `JSON.stringify(undefined)` returns `undefined`
    // (not a string!), which would crash `createHash.update`. Coercing to `null`
    // produces the deterministic string `"null"`.
    const bodyHash = createHash('sha256')
      .update(JSON.stringify(request.body ?? null))
      .digest('hex');

    const existing = store.get(rawKey);

    if (existing !== undefined) {
      // Body hash mismatch → RFC 422 conflict.
      if (existing.requestBodyHash !== bodyHash) {
        await reply.status(422).send({
          error: 'idempotency_key_conflict',
          message: 'Idempotency-Key was already used with a different request body',
        });
        return;
      }

      // Body hash match → replay cached response.
      // Log at debug level only; truncate key to first 8 chars (T-03-07).
      app.log.debug(
        { key: `${rawKey.slice(0, 8)}...`, status: existing.responseStatus },
        'idempotency: replaying cached response',
      );

      // Fire the observability callback for Plan 03-03 metrics counter.
      opts?.onDedup?.();

      // NOTE: do NOT set request.idempotencyKey here — the onSend guard
      // (`request.idempotencyKey === undefined → return payload`) must skip
      // re-caching the replayed response.
      await reply.status(existing.responseStatus).send(existing.responseBody);
      return;
    }

    // New key path — set augmented fields so onSend can cache the response.
    request.idempotencyKey = rawKey;
    request.idempotencyBodyHash = bodyHash;
  });

  // onSend: cache the response AFTER the handler runs, BEFORE bytes hit the socket.
  app.addHook('onSend', async (request: FastifyRequest, reply: FastifyReply, payload: unknown) => {
    // If idempotencyKey is undefined, this request is either:
    //  - a non-POST, a no-key POST, an excluded-prefix POST, or
    //  - a replay hit (we intentionally did NOT set the field in that branch).
    // In all these cases: return the payload unchanged.
    if (request.idempotencyKey === undefined) {
      return payload;
    }

    // Parse the outgoing payload back to a value for storage.
    // Fastify serialises JSON objects to a string for the network layer;
    // we need the parsed form so replays can re-serialise correctly.
    let parsed: unknown = payload;
    if (typeof payload === 'string') {
      try {
        parsed = JSON.parse(payload);
      } catch {
        // If JSON.parse fails (unlikely — Fastify always serialises valid JSON),
        // fall back to storing the raw string.
        parsed = payload;
      }
    }

    store.set(request.idempotencyKey, {
      requestBodyHash: request.idempotencyBodyHash ?? '',
      responseStatus: reply.statusCode,
      responseBody: parsed,
    });

    return payload;
  });
}
