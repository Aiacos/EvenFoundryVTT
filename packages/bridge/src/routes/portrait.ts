/**
 * GET /v1/portrait/:actorId — Portrait proxy route (Plan 13-03 — STRETCH-06).
 *
 * Fetches, dithers, and caches a 100×60 4-bit indexed-palette PNG for the
 * player's actor portrait. Implements SSRF defense (T-13-02) and cache-poisoning
 * mitigation (T-13-03).
 *
 * ## Request flow
 *
 * 1. Bearer extraction + tokenCache.validate (401 on fail).
 * 2. Resolve actor snapshot via foundrySnapshotFn — 404 if missing or portrait.url absent.
 * 3. URL validation (T-13-02):
 *    a. Parse with `new URL(portrait.url, foundryOrigin)`. Throws → 400.
 *    b. Reject non-http/https scheme → 400.
 *    c. Reject deny-listed hostnames → 403.
 *    d. Reject hostnames NOT in allowedHosts → 403.
 * 4. Compute urlHash = sha256(resolvedAbsoluteURL) [via PortraitRenderer / cached value].
 * 5. Cache lookup: HIT → 200 image/png + ETag + cached bytes.
 * 6. Cache MISS → portraitRenderer.renderPortrait(url) → store + 200 + ETag.
 * 7. On MISS: if deltaEmitter provided, emit r1.portrait.ready WS push (D-13-07).
 *
 * ## SSRF defense (T-13-02)
 *
 * - URL must be absolute or resolvable against EVF_FOUNDRY_ORIGIN_HOST.
 * - Scheme must be http: or https: (data URIs rejected).
 * - Hostname deny-list: cloud metadata + loopback + 0.0.0.0.
 * - Hostname must be in `allowedHosts` (defaults to EVF_FOUNDRY_ORIGIN_HOST).
 *
 * @see packages/bridge/src/portrait/portrait-cache.ts (cache)
 * @see packages/bridge/src/portrait/portrait-renderer.ts (dither pipeline)
 * @see packages/shared-protocol/src/payloads/portrait.ts (WS push schema)
 * @see .planning/phases/13-v2-stretch/13-03-PLAN.md Task 3
 */

import { PortraitReadyPayloadSchema, R1_PORTRAIT_READY_TYPE } from '@evf/shared-protocol';
import type { FastifyInstance } from 'fastify';
import type { TokenCache } from '../auth/token-cache.js';
import type { PortraitCache } from '../portrait/portrait-cache.js';
import {
  PortraitDecodeError,
  PortraitFetchError,
  type PortraitRenderer,
  PortraitTooLargeError,
} from '../portrait/portrait-renderer.js';
import type { FoundrySnapshotFn } from './character.js';
/** Minimal DeltaEmitter surface used by the portrait route (D-13-07). Structural interface for testability. */
export interface DeltaEmitterLike {
  emitDelta(type: string, payload: unknown): void;
}

// ─── SSRF deny-list ───────────────────────────────────────────────────────────

/**
 * Hostnames that are unconditionally denied regardless of allowedHosts config.
 * Covers cloud metadata endpoints + loopback + 0.0.0.0 (T-13-02).
 */
const SSRF_DENY_LIST = new Set([
  '169.254.169.254', // AWS/Azure EC2 metadata
  'metadata.google.internal',
  'metadata.azure.com',
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
]);

// ─── Private / internal IP-literal detection (T-13-02) ──────────────────────────

/**
 * Normalise a single IPv4 octet/component that may be expressed in decimal, hex
 * (`0x7f`), or octal (`0177`) form — the obfuscated forms attackers use to slip a
 * loopback/private literal past a naive string deny-list (e.g. `0x7f.0.0.1`,
 * `0177.0.0.1`, or the 32-bit decimal `2130706433` for `127.0.0.1`).
 *
 * @returns the numeric value, or `null` when the component is not a valid integer form.
 */
function parseIpComponent(part: string): number | null {
  if (part.length === 0) return null;
  let value: number;
  if (/^0x[0-9a-f]+$/i.test(part)) {
    value = Number.parseInt(part, 16);
  } else if (/^0[0-7]+$/.test(part)) {
    value = Number.parseInt(part, 8);
  } else if (/^[0-9]+$/.test(part)) {
    value = Number.parseInt(part, 10);
  } else {
    return null;
  }
  return Number.isNaN(value) ? null : value;
}

/**
 * Resolve a hostname that is an IPv4 literal (dotted, or any decimal/hex/octal form)
 * to its 32-bit integer value, supporting the 1-, 2-, 3-, and 4-part `inet_aton`
 * notations browsers/`fetch` accept (e.g. `2130706433`, `127.1`, `0x7f.0.0.1`).
 *
 * @returns the 32-bit unsigned value, or `null` when `host` is not an IPv4 literal.
 */
function ipv4LiteralToInt(host: string): number | null {
  const parts = host.split('.');
  if (parts.length === 0 || parts.length > 4) return null;
  const vals: number[] = [];
  for (const part of parts) {
    const n = parseIpComponent(part);
    if (n === null) return null;
    vals.push(n);
  }

  // inet_aton-style packing: the final part absorbs the remaining low-order bytes.
  let result = 0;
  for (let i = 0; i < vals.length - 1; i++) {
    const v = vals[i] as number;
    if (v > 255) return null;
    result = (result << 8) | v;
  }
  const last = vals[vals.length - 1] as number;
  const remainingBytes = 4 - (vals.length - 1);
  const maxLast = 2 ** (8 * remainingBytes);
  if (last >= maxLast) return null;
  result = ((result << (8 * remainingBytes)) >>> 0) + last;
  return result >>> 0;
}

/**
 * Returns `true` when `host` is an IP literal that resolves into a private,
 * loopback, link-local, or otherwise internal range that must never be reachable
 * via an SSRF (T-13-02). Covers IPv4 (10/8, 172.16/12, 192.168/16, 127/8,
 * 169.254/16, 0/8, 100.64/10 CGNAT) in decimal/hex/octal/packed forms, and IPv6
 * loopback (`::1`), link-local (`fe80::/10`), unique-local (`fc00::/7`), and
 * IPv4-mapped IPv6 (`::ffff:a.b.c.d`).
 */
function isPrivateIpLiteral(host: string): boolean {
  // Strip an IPv6 zone id and surrounding brackets if present.
  const h = (host.replace(/^\[/, '').replace(/\]$/, '').split('%')[0] ?? '').toLowerCase();

  // IPv4-mapped IPv6 in dotted form (::ffff:127.0.0.1) — extract + recurse.
  const mappedDotted = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(h);
  if (mappedDotted?.[1] !== undefined) {
    return isPrivateIpLiteral(mappedDotted[1]);
  }
  // IPv4-mapped IPv6 in hex form (::ffff:7f00:1) — the URL parser normalises the
  // dotted form to this. Reconstruct the embedded 32-bit IPv4 and range-check it.
  const mappedHex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(h);
  if (mappedHex?.[1] !== undefined && mappedHex[2] !== undefined) {
    const hi = Number.parseInt(mappedHex[1], 16);
    const lo = Number.parseInt(mappedHex[2], 16);
    const v4 = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
    return isPrivateIpLiteral(v4);
  }

  // IPv6 literals.
  if (h.includes(':')) {
    if (h === '::1' || h === '::') return true; // loopback / unspecified
    if (h.startsWith('fe80') || h.startsWith('fc') || h.startsWith('fd')) return true; // link-local + ULA
    return false;
  }

  // IPv4 (dotted or packed decimal/hex/octal).
  const asInt = ipv4LiteralToInt(h);
  if (asInt === null) return false; // not an IP literal → hostname, handled elsewhere

  const inRange = (cidrBase: number, prefix: number): boolean => {
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    return (asInt & mask) === (cidrBase & mask);
  };

  return (
    inRange(0x0a000000, 8) || // 10.0.0.0/8
    inRange(0xac100000, 12) || // 172.16.0.0/12
    inRange(0xc0a80000, 16) || // 192.168.0.0/16
    inRange(0x7f000000, 8) || // 127.0.0.0/8 (loopback)
    inRange(0xa9fe0000, 16) || // 169.254.0.0/16 (link-local)
    inRange(0x00000000, 8) || // 0.0.0.0/8 ("this network")
    inRange(0x64400000, 10) // 100.64.0.0/10 (CGNAT)
  );
}

// ─── SHA-256 helper ───────────────────────────────────────────────────────────

async function sha256Hex(str: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await (
    globalThis as unknown as {
      crypto: { subtle: { digest(alg: string, data: Uint8Array): Promise<ArrayBuffer> } };
    }
  ).crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ─── URL validation helper ────────────────────────────────────────────────────

export interface PortraitUrlValidation {
  ok: true;
  resolvedUrl: string;
  hostname: string;
}

export interface PortraitUrlRejection {
  ok: false;
  statusCode: 400 | 403;
  error: string;
}

/**
 * Validate a portrait URL against SSRF rules.
 *
 * @param rawUrl      — Portrait URL string from the character snapshot.
 * @param foundryOrigin — Base origin for resolving relative URLs.
 * @param allowedHosts  — Whitelist of permitted hostnames. An EMPTY list is a
 *                        HARD-DENY (fail-safe): with no configured whitelist there
 *                        is no host the proxy is permitted to reach, so every URL is
 *                        rejected rather than (accidentally) matching nothing-and-passing.
 */
export function validatePortraitUrl(
  rawUrl: string,
  foundryOrigin: string,
  allowedHosts: string[],
): PortraitUrlValidation | PortraitUrlRejection {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl, foundryOrigin);
  } catch {
    return { ok: false, statusCode: 400, error: 'portrait_url_malformed' };
  }

  // Scheme check — only http/https allowed (data URIs, file URIs rejected)
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, statusCode: 400, error: 'portrait_url_scheme_denied' };
  }

  // Empty allowedHosts → HARD-DENY (fail-safe). No configured whitelist means the
  // proxy may reach nothing; deny before any further checks so a missing config can
  // never degrade into an open proxy.
  if (allowedHosts.length === 0) {
    return { ok: false, statusCode: 403, error: 'portrait_url_no_allowed_hosts' };
  }

  // Hostname deny-list (T-13-02: cloud metadata + loopback by name)
  if (SSRF_DENY_LIST.has(parsed.hostname)) {
    return { ok: false, statusCode: 403, error: 'portrait_url_hostname_denied' };
  }

  // Private / internal IP-literal deny (T-13-02): block private, loopback,
  // link-local, CGNAT, and IPv4-mapped-IPv6 literal targets in any decimal/hex/octal
  // form, regardless of the name-based allowedHosts whitelist. This stops an attacker
  // pointing the portrait URL at an internal address by literal IP.
  if (isPrivateIpLiteral(parsed.hostname)) {
    return { ok: false, statusCode: 403, error: 'portrait_url_private_ip_denied' };
  }

  // allowedHosts check: hostname must match exactly one allowed host
  if (!allowedHosts.includes(parsed.hostname)) {
    return { ok: false, statusCode: 403, error: 'portrait_url_origin_mismatch' };
  }

  return { ok: true, resolvedUrl: parsed.href, hostname: parsed.hostname };
}

// ─── Route registration ───────────────────────────────────────────────────────

/** Options for {@link registerPortraitRoute}. */
export interface RegisterPortraitRouteOpts {
  /** Fastify instance. */
  app: FastifyInstance;
  /** Token validation cache. */
  tokenCache: TokenCache;
  /** Foundry snapshot function (injected for testability). */
  foundrySnapshotFn: FoundrySnapshotFn;
  /** Portrait LRU + TTL cache. */
  portraitCache: PortraitCache;
  /** Portrait dither renderer. */
  portraitRenderer: PortraitRenderer;
  /**
   * Allowed portrait URL hostnames (T-13-02 same-origin enforcement).
   *
   * Defaults to `[process.env.EVF_FOUNDRY_ORIGIN_HOST ?? '']` when empty.
   * The bridge operator configures this to the Foundry world's public hostname.
   */
  allowedHosts: string[];
  /**
   * Optional delta emitter for WS push on cache-miss render (D-13-07).
   * When provided, emits `r1.portrait.ready` after successful render.
   * Typed as `DeltaEmitterLike` (structural) for testability.
   */
  deltaEmitter?: DeltaEmitterLike;
  /** Foundry origin base URL for resolving relative portrait paths. */
  foundryOrigin?: string;
}

/**
 * Register the GET /v1/portrait/:actorId Fastify route.
 *
 * @see RegisterPortraitRouteOpts
 */
export async function registerPortraitRoute(opts: RegisterPortraitRouteOpts): Promise<void> {
  const {
    app,
    tokenCache,
    foundrySnapshotFn,
    portraitCache,
    portraitRenderer,
    allowedHosts,
    deltaEmitter,
  } = opts;

  const foundryOrigin =
    opts.foundryOrigin ??
    (process.env.EVF_FOUNDRY_ORIGIN_HOST
      ? `https://${process.env.EVF_FOUNDRY_ORIGIN_HOST}`
      : 'http://localhost:30000');

  // Resolve the effective whitelist: explicit `allowedHosts` wins; otherwise fall
  // back to EVF_FOUNDRY_ORIGIN_HOST. Filter out empty/blank entries so an UNSET env
  // collapses to `[]` → HARD-DENY in validatePortraitUrl (fail-safe), never `['']`
  // which would be a single useless-but-non-empty entry that disables the hard-deny.
  const effectiveAllowedHosts = (
    allowedHosts.length > 0 ? allowedHosts : [process.env.EVF_FOUNDRY_ORIGIN_HOST ?? '']
  ).filter((h) => h.trim().length > 0);

  app.get<{ Params: { actorId: string } }>('/v1/portrait/:actorId', async (request, reply) => {
    // Step 1 — Bearer auth
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'invalid_token' });
    }
    const token = authHeader.slice('Bearer '.length);
    const validation = await tokenCache.validate(token);
    if (!validation.valid) {
      if (validation.reason === 'foundry_unreachable') {
        return reply.status(503).send({ error: 'foundry_unreachable' });
      }
      return reply.status(401).send({ error: 'invalid_token' });
    }

    // Step 2 — Resolve actor snapshot
    const { actorId } = request.params;
    const snapshot = await foundrySnapshotFn('evf.getCharacterSnapshot', actorId, token);

    if (snapshot === null || snapshot === undefined) {
      return reply.status(404).send({ error: 'actor_not_found' });
    }

    // Step 2b — Check portrait.url is present (optional field)
    const portraitUrl = (snapshot as { portrait?: { url?: string } }).portrait?.url;
    if (portraitUrl === undefined || portraitUrl.length === 0) {
      return reply.status(404).send({ error: 'portrait_not_available' });
    }

    // Step 3 — URL validation (T-13-02)
    const urlValidation = validatePortraitUrl(portraitUrl, foundryOrigin, effectiveAllowedHosts);
    if (!urlValidation.ok) {
      return reply.status(urlValidation.statusCode).send({ error: urlValidation.error });
    }
    const { resolvedUrl } = urlValidation;

    // Step 4 — Compute urlHash
    const urlHash = await sha256Hex(resolvedUrl);

    // Step 5 — Cache lookup (T-13-03: actor ownership already verified via foundrySnapshotFn)
    const cached = portraitCache.get(urlHash);
    if (cached !== null) {
      return reply
        .status(200)
        .header('Content-Type', 'image/png')
        .header('ETag', urlHash)
        .send(Buffer.from(cached.pngBytes));
    }

    // Step 6 — Cache miss → render
    let pngBytes: Uint8Array;
    try {
      const result = await portraitRenderer.renderPortrait(resolvedUrl);
      pngBytes = result.pngBytes;

      // Store in cache
      portraitCache.set(urlHash, {
        pngBytes,
        urlHash,
        cachedAt: Date.now(),
      });

      // Step 7 — WS push on cache-miss (D-13-07 optimisation)
      if (deltaEmitter !== undefined) {
        const pngBase64 = Buffer.from(pngBytes).toString('base64');
        const portraitPayload = PortraitReadyPayloadSchema.safeParse({
          actorId,
          pngBase64,
          width: 100,
          height: 60,
          urlHash,
        });
        if (portraitPayload.success) {
          // emitDelta fans out the payload to all subscribed sessions via DeltaEmitter
          deltaEmitter.emitDelta(R1_PORTRAIT_READY_TYPE, portraitPayload.data);
        }
      }
    } catch (err) {
      if (err instanceof PortraitFetchError) {
        app.log.warn(
          { actorId, url: resolvedUrl, status: err.status },
          '[portrait-route] fetch failed',
        );
        return reply.status(502).send({ error: 'portrait_fetch_failed' });
      }
      if (err instanceof PortraitTooLargeError) {
        return reply.status(413).send({ error: 'portrait_too_large' });
      }
      if (err instanceof PortraitDecodeError) {
        app.log.warn({ actorId, url: resolvedUrl }, '[portrait-route] decode failed');
        return reply.status(502).send({ error: 'portrait_decode_failed' });
      }
      throw err;
    }

    return reply
      .status(200)
      .header('Content-Type', 'image/png')
      .header('ETag', urlHash)
      .send(Buffer.from(pngBytes));
  });
}
