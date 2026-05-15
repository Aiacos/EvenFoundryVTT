/**
 * Unit tests for rle-encoder (Phase 4a Plan 03 Task 1).
 *
 * Covers (per 04A-03-PLAN.md `<behavior>` block):
 *   - RLE-1: round-trip identity (encode → decode preserves input byte-for-byte)
 *   - RLE-2: runs longer than 255 split into multiple chunks without data loss
 *   - RLE-3: all-zero buffer compresses to << input length
 *   - RLE-4: truncated/malformed input throws with `RLE decode` prefix
 *   - RLE-5: input byte > 15 → throws with `RLE encode` invalid-4-bit prefix
 *
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04A-03-PLAN.md Task 1
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04a-CONTEXT.md §Area 2
 */
import { describe, expect, it } from 'vitest';
import { decodeRle4bit, encodeRle4bit } from '../rle-encoder.js';

describe('rle-encoder — 4-bit nibble run-length encode/decode', () => {
  it('RLE-1: round-trip identity for a small mixed buffer', () => {
    const input = new Uint8Array([0, 0, 0, 0, 5, 5, 5, 15]);
    const encoded = encodeRle4bit(input);
    const decoded = decodeRle4bit(encoded);
    expect(Array.from(decoded)).toEqual(Array.from(input));
  });

  it('RLE-2: a run longer than 255 splits into multiple chunks with no data loss', () => {
    const len = 700; // > 255 and not a multiple of 255
    const input = new Uint8Array(len).fill(7);
    const encoded = encodeRle4bit(input);
    const decoded = decodeRle4bit(encoded);
    expect(decoded.length).toBe(len);
    for (let i = 0; i < decoded.length; i++) {
      expect(decoded[i]).toBe(7);
    }
  });

  it('RLE-3: all-zero buffer encodes to a compact stream (much smaller than input)', () => {
    const input = new Uint8Array(4096); // all zero
    const encoded = encodeRle4bit(input);
    expect(encoded.length).toBeLessThan(input.length / 50);
    const decoded = decodeRle4bit(encoded);
    expect(decoded.length).toBe(input.length);
    for (let i = 0; i < decoded.length; i++) {
      expect(decoded[i]).toBe(0);
    }
  });

  it('RLE-4: truncated input throws with "RLE decode" prefix', () => {
    const input = new Uint8Array([5, 7, 3, 4]); // 2 valid pairs
    const encoded = encodeRle4bit(input);
    // Drop the last byte to leave a dangling run-length without its value.
    const truncated = encoded.slice(0, encoded.length - 1);
    expect(() => decodeRle4bit(truncated)).toThrow(/RLE decode/);
  });

  it('RLE-5: values > 15 in the input throw with "RLE encode" prefix', () => {
    const bad = new Uint8Array([1, 2, 16, 3]);
    expect(() => encodeRle4bit(bad)).toThrow(/RLE encode/);
  });
});
