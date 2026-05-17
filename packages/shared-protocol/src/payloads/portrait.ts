/**
 * Portrait ready payload schema (Plan 13-03 — STRETCH-06).
 *
 * Emitted by the bridge's `GET /v1/portrait/:actorId` handler on a cache-miss
 * render path. The bridge fetches `actor.img` from the Foundry world, runs it
 * through the Floyd-Steinberg dither pipeline (sharp → image-q → upng-js) to
 * produce a 100×60 4-bit indexed-palette PNG, then pushes a WS delta envelope
 * with this payload so the g2-app's Plan 13-04 portrait-dispatcher can mount the
 * Bio tab portrait without a round-trip HTTP GET.
 *
 * ## D-13-07 push vs pull semantics
 *
 * The bridge exposes BOTH surfaces:
 *   - HTTP GET `/v1/portrait/:actorId` (authoritative pull path) — g2-app fetches
 *     this when the Bio tab opens. Returns `200 image/png` bytes + `ETag: <urlHash>`.
 *   - WS push `r1.portrait.ready` (optimisation) — emitted on the cache-miss path
 *     so the panel doesn't need to make a GET immediately after mount. Cache-hit
 *     paths do NOT re-emit the push (delta-driven, idempotent).
 *
 * ## Trust boundary (T-13-02, T-13-03)
 *
 * The bridge validates the upstream URL before fetching (HTTPS/HTTP scheme only,
 * hostname deny-list, same-origin allowedHosts). The cache is keyed by
 * SHA-256(resolved-absolute-URL). Actor ownership is re-checked on every request
 * via `foundrySnapshotFn` (bearer → player → actor). See portrait-route.ts.
 *
 * @see packages/bridge/src/portrait/portrait-renderer.ts (render pipeline)
 * @see packages/bridge/src/portrait/portrait-cache.ts (LRU + TTL)
 * @see packages/bridge/src/routes/portrait.ts (HTTP route + WS push)
 * @see packages/g2-app/src/panels/portrait-dispatcher.ts (Plan 13-04 consumer)
 * @see .planning/phases/13-v2-stretch/13-03-PLAN.md Task 1
 */

import { z } from 'zod';

/**
 * WS envelope `type` discriminant for portrait-ready events.
 *
 * Used by the portrait-dispatcher (Plan 13-04) to narrow from the outer
 * EnvelopeSchema parse before applying the inner `PortraitReadyPayloadSchema`.
 */
export const R1_PORTRAIT_READY_TYPE = 'r1.portrait.ready' as const;

/**
 * Portrait ready payload — delivered as the `payload` field inside a WS envelope
 * when the bridge successfully renders a new portrait on the cache-miss path.
 *
 * Fields:
 * - `actorId`    — Foundry actor document ID (stable across sessions)
 * - `pngBase64`  — Base64-encoded 4-bit indexed-palette PNG bytes (100×60 px).
 *                  Decoded by g2-app and passed to `bridge.updateImageRawData`.
 * - `width`      — Always 100 (literal). Enforced so the consumer can assert
 *                  the correct image container size without inspecting PNG headers.
 * - `height`     — Always 60 (literal). Same rationale as `width`.
 * - `urlHash`    — SHA-256 hex of the resolved absolute URL that was fetched.
 *                  Matches the cache key. Used as ETag for HTTP GET deduplication.
 */
export const PortraitReadyPayloadSchema = z.strictObject({
  /** Foundry actor document ID. */
  actorId: z.string().min(1),
  /** Base64-encoded 100×60 4-bit indexed-palette PNG. */
  pngBase64: z.string().min(1),
  /** Image width — always 100 px. */
  width: z.literal(100),
  /** Image height — always 60 px. */
  height: z.literal(60),
  /** SHA-256 hex of the resolved absolute portrait URL (64 hex chars). */
  urlHash: z.string().regex(/^[0-9a-f]{64}$/),
});

/** TypeScript type inferred from {@link PortraitReadyPayloadSchema}. */
export type PortraitReadyPayload = z.infer<typeof PortraitReadyPayloadSchema>;
