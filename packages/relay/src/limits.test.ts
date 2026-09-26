import { describe, expect, it } from 'vitest';
import { frameByteLength, MAX_FRAME_BYTES, RateLimiter, utf8ByteLength } from './limits.js';

describe('utf8ByteLength', () => {
  it('matches TextEncoder for ASCII, 2/3-byte, astral and lone surrogates', () => {
    const enc = new TextEncoder();
    for (const s of ['', 'abc', 'àèì', 'ł€', '日本語', '🎲🥽', 'x\uD800y', '\uDC00', 'a\uD83C']) {
      expect(utf8ByteLength(s)).toBe(enc.encode(s).byteLength);
    }
  });
});

describe('frameByteLength', () => {
  it('measures strings in UTF-8 bytes and buffers by byteLength', () => {
    expect(frameByteLength('€')).toBe(3);
    expect(frameByteLength(new ArrayBuffer(7))).toBe(7);
  });

  it('flags a string under 1 MiB of UTF-16 units but over 1 MiB of UTF-8 bytes', () => {
    const s = '€'.repeat(Math.ceil(MAX_FRAME_BYTES / 3) + 1);
    expect(s.length).toBeLessThan(MAX_FRAME_BYTES);
    expect(frameByteLength(s)).toBeGreaterThan(MAX_FRAME_BYTES);
  });
});

describe('RateLimiter', () => {
  it('allows `limit` frames per rolling window and rejects the next', () => {
    const rl = new RateLimiter(3, 1000);
    expect([rl.hit(0), rl.hit(100), rl.hit(200)]).toEqual([true, true, true]);
    expect(rl.hit(999)).toBe(false);
  });

  it('forgets frames older than the window', () => {
    const rl = new RateLimiter(2, 1000);
    expect(rl.hit(0)).toBe(true);
    expect(rl.hit(500)).toBe(true);
    expect(rl.hit(1000)).toBe(true); // the frame at 0 left the window
    expect(rl.hit(1001)).toBe(false);
  });

  it('defaults to 60 frames per second', () => {
    const rl = new RateLimiter();
    for (let i = 0; i < 60; i++) expect(rl.hit(i)).toBe(true);
    expect(rl.hit(60)).toBe(false);
  });
});
