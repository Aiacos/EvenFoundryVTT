/**
 * Unit tests for PortraitRenderer (Plan 13-03 — STRETCH-06).
 *
 * PR-RENDER-01: produces non-empty Uint8Array (valid PNG output)
 * PR-RENDER-02: urlHash is a 64-char lowercase hex string (sha256)
 * PR-RENDER-03: PNG starts with \x89PNG magic bytes
 * PR-RENDER-04: fetch 404 throws PortraitFetchError
 * PR-RENDER-05: response body >5MB throws PortraitTooLargeError
 *
 * _fetchFn injection: tests supply a minimal 1×1 PNG buffer via a fake fetch,
 * enabling CI-deterministic runs without network access.
 *
 * @see packages/bridge/src/portrait/portrait-renderer.ts
 * @see .planning/phases/13-v2-stretch/13-03-PLAN.md Task 2
 */

import { describe, expect, it } from 'vitest';
import {
  createPortraitRenderer,
  PortraitFetchError,
  PortraitTooLargeError,
} from './portrait-renderer.js';

// ─── Minimal 1×1 grey PNG as test fixture ─────────────────────────────────────
// Generated via: sharp({ create: { width:1, height:1, channels:4, background:{r:128,g:128,b:128,alpha:1} } }).png()
const TINY_PNG_BYTES = new Uint8Array([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0,
  0, 31, 21, 196, 137, 0, 0, 0, 9, 112, 72, 89, 115, 0, 0, 3, 232, 0, 0, 3, 232, 1, 181, 123, 82,
  107, 0, 0, 0, 13, 73, 68, 65, 84, 120, 156, 99, 104, 104, 104, 248, 15, 0, 5, 132, 2, 128, 140,
  205, 102, 38, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
]);

function makeFakeOkResponse(bytes: Uint8Array): Response {
  return {
    ok: true,
    status: 200,
    headers: {
      get: (_key: string) => String(bytes.length),
    },
    arrayBuffer: () => Promise.resolve(bytes.buffer as ArrayBuffer),
  } as unknown as Response;
}

function makeFakeErrorResponse(status: number): Response {
  return {
    ok: false,
    status,
    headers: { get: () => null },
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
  } as unknown as Response;
}

const TEST_URL = 'https://example.com/portraits/hero.webp';

describe('createPortraitRenderer', () => {
  // PR-RENDER-01: non-empty Uint8Array
  it('PR-RENDER-01: produces non-empty Uint8Array from a valid PNG fetch', async () => {
    const renderer = createPortraitRenderer({
      _fetchFn: () => Promise.resolve(makeFakeOkResponse(TINY_PNG_BYTES)),
    });

    const result = await renderer.renderPortrait(TEST_URL);
    expect(result.pngBytes).toBeInstanceOf(Uint8Array);
    expect(result.pngBytes.length).toBeGreaterThan(0);
  });

  // PR-RENDER-02: urlHash is 64 hex chars
  it('PR-RENDER-02: urlHash is a 64-char lowercase hex string (SHA-256)', async () => {
    const renderer = createPortraitRenderer({
      _fetchFn: () => Promise.resolve(makeFakeOkResponse(TINY_PNG_BYTES)),
    });

    const result = await renderer.renderPortrait(TEST_URL);
    expect(result.urlHash).toMatch(/^[0-9a-f]{64}$/);
  });

  // PR-RENDER-03: PNG starts with \x89PNG magic bytes
  it('PR-RENDER-03: output starts with PNG magic bytes (\\x89PNG)', async () => {
    const renderer = createPortraitRenderer({
      _fetchFn: () => Promise.resolve(makeFakeOkResponse(TINY_PNG_BYTES)),
    });

    const result = await renderer.renderPortrait(TEST_URL);
    // PNG magic: 0x89 0x50 0x4e 0x47 = \x89 P N G
    expect(result.pngBytes[0]).toBe(0x89);
    expect(result.pngBytes[1]).toBe(0x50); // P
    expect(result.pngBytes[2]).toBe(0x4e); // N
    expect(result.pngBytes[3]).toBe(0x47); // G
  });

  // PR-RENDER-04: fetch 404 throws PortraitFetchError
  it('PR-RENDER-04: fetch 404 throws PortraitFetchError', async () => {
    const renderer = createPortraitRenderer({
      _fetchFn: () => Promise.resolve(makeFakeErrorResponse(404)),
    });

    await expect(renderer.renderPortrait(TEST_URL)).rejects.toThrow(PortraitFetchError);
  });

  // PR-RENDER-05: response body >5MB throws PortraitTooLargeError
  it('PR-RENDER-05: response body >5MB throws PortraitTooLargeError', async () => {
    const BIG_BODY_BYTES = 5 * 1024 * 1024 + 1;
    const bigResponse: Response = {
      ok: true,
      status: 200,
      headers: {
        get: (key: string) => (key === 'content-length' ? String(BIG_BODY_BYTES) : null),
      },
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(BIG_BODY_BYTES)),
    } as unknown as Response;

    const renderer = createPortraitRenderer({
      _fetchFn: () => Promise.resolve(bigResponse),
    });

    await expect(renderer.renderPortrait(TEST_URL)).rejects.toThrow(PortraitTooLargeError);
  });

  // URL hash determinism: same URL → same hash
  it('urlHash is deterministic: same URL always produces same SHA-256 hash', async () => {
    const renderer = createPortraitRenderer({
      _fetchFn: () => Promise.resolve(makeFakeOkResponse(TINY_PNG_BYTES)),
    });

    const r1 = await renderer.renderPortrait(TEST_URL);
    const r2 = await renderer.renderPortrait(TEST_URL);
    expect(r1.urlHash).toBe(r2.urlHash);
  });

  // PR-RENDER-06 (SSRF): redirect: 'manual' passed to fetch + redirect responses blocked.
  it('PR-RENDER-06: passes redirect:manual and rejects a redirect response (SSRF)', async () => {
    let seenInit: { redirect?: string } | undefined;
    const redirectResponse = {
      ok: false,
      status: 302,
      type: 'opaqueredirect',
      headers: { get: () => null },
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    } as unknown as Response;

    const renderer = createPortraitRenderer({
      _fetchFn: (_url, init) => {
        seenInit = init;
        return Promise.resolve(redirectResponse);
      },
    });

    await expect(renderer.renderPortrait(TEST_URL)).rejects.toThrow(PortraitFetchError);
    // The outbound fetch MUST be invoked with redirect:'manual' so an allowed host
    // cannot 302 the proxy to an internal target after the route's host/IP check.
    expect(seenInit).toMatchObject({ redirect: 'manual' });
  });
  // PR-RENDER-07 (T-13-02a): an oversized CHUNKED body (no honest content-length)
  // is aborted early by the running byte counter — it never fully buffers.
  it('PR-RENDER-07: oversized chunked body is aborted early (running byte counter)', async () => {
    const CHUNK = new Uint8Array(1024 * 1024); // 1 MB chunks
    let chunksPulled = 0;
    let cancelled = false;

    // A streamable body with NO content-length header (chunked) that would emit far
    // more than MAX_BODY_BYTES (5 MB) if read to completion.
    const stream = {
      getReader() {
        return {
          read() {
            chunksPulled += 1;
            // Emit 100 MB worth if never aborted — the cap must stop us long before.
            if (chunksPulled > 100) return Promise.resolve({ done: true, value: undefined });
            return Promise.resolve({ done: false, value: CHUNK });
          },
          cancel() {
            cancelled = true;
            return Promise.resolve();
          },
          releaseLock() {},
        };
      },
    } as unknown as ReadableStream<Uint8Array>;

    const chunkedResponse = {
      ok: true,
      status: 200,
      type: 'basic',
      headers: { get: () => null }, // NO content-length → header pre-check passes
      body: stream,
      arrayBuffer: () => Promise.reject(new Error('arrayBuffer must not be called')),
    } as unknown as Response;

    const renderer = createPortraitRenderer({
      _fetchFn: () => Promise.resolve(chunkedResponse),
    });

    await expect(renderer.renderPortrait(TEST_URL)).rejects.toThrow(PortraitTooLargeError);
    // Aborted early: at 1 MB/chunk and a 5 MB cap, we must stop after ~6 reads,
    // far below the 100-chunk (100 MB) full body, and cancel the stream.
    expect(chunksPulled).toBeLessThanOrEqual(8);
    expect(cancelled).toBe(true);
  });
});
