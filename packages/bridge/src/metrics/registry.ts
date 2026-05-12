/**
 * EVF Prometheus metrics registry factory.
 *
 * Creates a fresh `prom-client` Registry per call, preventing the "metric already
 * registered" collision that arises when two `buildServer()` calls share the
 * process-global default Registry (Pitfall 2 — T-03-10).
 *
 * ## Label cardinality budget (T-03-09)
 *
 * All metrics use a bounded label set:
 * - `method`: GET | POST | PUT | DELETE | PATCH | HEAD | OPTIONS (≤7 values)
 * - `route`: Fastify URL pattern, e.g. `/v1/tools/:name` (NOT resolved URL — bounded by route count)
 * - `status_code`: 200 | 204 | 400 | 401 | 422 | 429 | 503 | ... (≤20 values)
 *
 * Forbidden labels: per-entity identifiers and token values
 * (T-03-09 — verified by grep in plan must_haves).
 *
 * ## Usage
 *
 * ```ts
 * const metrics = createMetricsRegistry(
 *   { replayBufferSize: () => buffer.size(), idempotencyStoreSize: () => store.size },
 *   optionalRegistry,
 * );
 * await metrics.registry.metrics(); // Prometheus text format
 * ```
 *
 * @see packages/bridge/src/server.ts (wiring)
 * @see T-03-09, T-03-10, T-03-11 (threat model)
 * @see Specs.md §5.2 (prom-client chosen for bridge observability)
 */

import { Counter, collectDefaultMetrics, Gauge, Histogram, Registry } from 'prom-client';

// ─── Public interfaces ─────────────────────────────────────────────────────────

/**
 * Accessors for lazy gauge values — passed from `server.ts` where the stores
 * are instantiated (Approach B DI pattern per plan).
 */
export interface MetricsAccessors {
  /** Returns current total envelopes in the replay buffer across all sessions. */
  replayBufferSize: () => number;
  /** Returns current count of idempotency store entries (includes unexpired lazy entries). */
  idempotencyStoreSize: () => number;
}

/**
 * All EVF-specific Prometheus metrics plus the underlying Registry.
 *
 * Returned by `createMetricsRegistry()`. The `registry` field is used to
 * expose the `/metrics` endpoint (`registry.metrics()` / `registry.contentType`).
 */
export interface EvfMetrics {
  /** The prom-client Registry all metrics are bound to. */
  registry: Registry;
  /**
   * HTTP request duration histogram.
   *
   * Labels: `method` (HTTP verb), `route` (Fastify URL pattern), `status_code` (string).
   * Buckets: [5ms, 10ms, 50ms, 100ms, 500ms, 1s].
   */
  httpRequestDuration: Histogram<'method' | 'route' | 'status_code'>;
  /**
   * Number of live WebSocket sessions.
   *
   * Incremented by `deltaEmitter.registerSession`, decremented on close.
   */
  wsSessionsActive: Gauge<string>;
  /**
   * Total envelopes buffered in the replay buffer across all sessions.
   *
   * Populated via a `collect()` callback that reads `replayBuffer.size()`.
   */
  replayBufferSize: Gauge<string>;
  /**
   * Current idempotency store entry count (lazy — includes stale entries).
   *
   * Populated via a `collect()` callback that reads `idempotencyStore.size`.
   */
  idempotencyStoreSize: Gauge<string>;
  /**
   * Total idempotency dedup replay hits (same key + same body within TTL).
   *
   * Incremented by the `onDedup` callback wired in `registerIdempotencyHooks`.
   */
  idempotencyDedupTotal: Counter<string>;
  /**
   * Total token cache hits (token found in cache within TTL).
   *
   * Incremented by the `onHit` hook in `TokenCache`.
   */
  tokenCacheHitsTotal: Counter<string>;
  /**
   * Total token cache misses (cache cold or expired — Foundry roundtrip needed).
   *
   * Incremented by the `onMiss` hook in `TokenCache`.
   */
  tokenCacheMissesTotal: Counter<string>;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create a fresh EVF metrics registry with all named metrics.
 *
 * Each call creates a NEW `Registry` (unless `provided` is given), preventing
 * the prom-client global-registry collision in parallel test runs (Pitfall 2).
 *
 * @param accessors - Lazy accessor functions for gauge `collect()` callbacks.
 * @param provided  - Optional existing Registry to use (for test injection).
 * @returns         EvfMetrics with the registry and all named metric instances.
 *
 * @example
 * ```ts
 * const metrics = createMetricsRegistry(
 *   { replayBufferSize: () => replay.size(), idempotencyStoreSize: () => store.size },
 * );
 * ```
 */
export function createMetricsRegistry(
  accessors: MetricsAccessors,
  provided?: Registry,
): EvfMetrics {
  // Fresh Registry per call (Pitfall 2 — T-03-10).
  // Every metric constructor receives `registers: [registry]` to bind to this
  // instance only and NEVER to the prom-client global default Registry.
  const registry = provided ?? new Registry();

  // Register nodejs_* default metrics bound to this registry only.
  // Safe to call multiple times — each call operates on a separate Registry.
  collectDefaultMetrics({ register: registry });

  // ── HTTP request duration histogram ─────────────────────────────────────────

  const httpRequestDuration = new Histogram<'method' | 'route' | 'status_code'>({
    name: 'evf_http_request_duration_seconds',
    help: 'EVF HTTP request duration in seconds, by method, route pattern, and status code.',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.005, 0.01, 0.05, 0.1, 0.5, 1],
    registers: [registry],
  });

  // ── WS sessions active gauge ─────────────────────────────────────────────────

  const wsSessionsActive = new Gauge({
    name: 'evf_ws_sessions_active',
    help: 'Number of live WebSocket sessions currently registered with DeltaEmitter.',
    registers: [registry],
  });

  // ── Replay buffer size gauge (lazy collect) ──────────────────────────────────

  const replayBufferSizeGauge = new Gauge({
    name: 'evf_replay_buffer_size',
    help: 'Total delta envelopes buffered in ReplayBuffer across all sessions.',
    registers: [registry],
    collect() {
      // 'this' is the Gauge instance — prom-client v15 collect callback pattern.
      this.set(accessors.replayBufferSize());
    },
  });

  // ── Idempotency store size gauge (lazy collect) ──────────────────────────────

  const idempotencyStoreSizeGauge = new Gauge({
    name: 'evf_idempotency_store_size',
    help: 'Current IdempotencyStore entry count (includes stale not yet lazily evicted).',
    registers: [registry],
    collect() {
      this.set(accessors.idempotencyStoreSize());
    },
  });

  // ── Idempotency dedup counter ────────────────────────────────────────────────

  const idempotencyDedupTotal = new Counter({
    name: 'evf_idempotency_dedup_total',
    help: 'Total idempotency dedup replay hits (same key + same body within TTL).',
    registers: [registry],
  });

  // ── Token cache hit counter ──────────────────────────────────────────────────

  const tokenCacheHitsTotal = new Counter({
    name: 'evf_token_cache_hits_total',
    help: 'Total TokenCache hits (token served from in-memory cache within TTL).',
    registers: [registry],
  });

  // ── Token cache miss counter ─────────────────────────────────────────────────

  const tokenCacheMissesTotal = new Counter({
    name: 'evf_token_cache_misses_total',
    help: 'Total TokenCache misses (cache cold or expired — Foundry roundtrip triggered).',
    registers: [registry],
  });

  return {
    registry,
    httpRequestDuration,
    wsSessionsActive,
    replayBufferSize: replayBufferSizeGauge,
    idempotencyStoreSize: idempotencyStoreSizeGauge,
    idempotencyDedupTotal,
    tokenCacheHitsTotal,
    tokenCacheMissesTotal,
  };
}
