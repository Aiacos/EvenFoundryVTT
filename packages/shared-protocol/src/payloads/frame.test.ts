/**
 * @evf/shared-protocol — FramePixelsSchema + base64 helper tests.
 *
 * Covers Plan 4a-06 Task 1 behaviour FP-1..FP-10 (data-source raster ingress):
 *   - FP-1     happy-path safeParse of a valid FramePixels payload
 *   - FP-2..4  bounds enforcement on width (20-400) + height (20-200) — ADR-0013 Amendment 1 canonical region
 *   - FP-5     decodeFramePixels rejects non-base64 input with a typed Error
 *   - FP-6     encodeFramePixels → base64 string; decode roundtrip yields a
 *              Uint8ClampedArray of length width × height × 4
 *   - FP-7     decodeFramePixels rejects length-mismatch with a typed Error
 *   - FP-8     byte-for-byte roundtrip identity on a 400×200 frame
 *   - FP-9     re-exports from `@evf/shared-protocol` package entry (the cross-
 *              package consumption contract)
 *   - FP-10    cross-schema lock: a `FramePixels` payload travels cleanly inside
 *              the real `EnvelopeSchema` (proto/seq/ts/type='frame_pixels'/
 *              session_id/payload). This locks the Plan 06 NF-1 closure — see
 *              04A-PLAN-CHECK.md §NF-1 for the full forbidden-patterns list.
 *
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04A-06-PLAN.md Task 1
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04A-PLAN-CHECK.md §B-5 + §NF-1 + §NF-3
 * @see ./envelope.ts (real EnvelopeSchema export)
 */
import { describe, expect, it } from 'vitest';
import { EnvelopeSchema } from '../envelope.js';
import {
  decodeFramePixels,
  encodeFramePixels,
  type FramePixels,
  FramePixelsSchema,
} from './frame.js';

// A 32-byte RGBA buffer fits inside any valid FramePixels payload but is not large
// enough on its own to satisfy the schema's width×height bounds; tests that need
// the encoded form pre-compute a deterministic buffer at the required dimensions.
const SMALL_RGBA = new Uint8ClampedArray([
  0, 0, 0, 255, 255, 255, 255, 255, 128, 128, 128, 255, 64, 64, 64, 255,
]);

function makeRgba(width: number, height: number, seed = 0): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < buf.length; i++) {
    buf[i] = (i + seed) & 0xff;
  }
  return buf;
}

// 20×20 minimum dimensions → 20×20×4 = 1600 bytes RGBA.
const MIN_RGBA = makeRgba(20, 20);
const MIN_B64 = encodeRaw(MIN_RGBA);

// Use the SUT's encoder for fixture construction — these tests cover the schema
// + the helper roundtrip; deliberately keeping the test surface free of any
// ambient Node/DOM types so the package's `lib: ['ES2023'], types: []` constraint
// stays clean.
function encodeRaw(arr: Uint8ClampedArray | Uint8Array): string {
  return encodeFramePixels(arr);
}

describe('FramePixelsSchema — happy path (FP-1)', () => {
  it('parses a valid full-bound FramePixels payload', () => {
    const valid: FramePixels = {
      sceneId: 'scene1',
      width: 400,
      height: 200,
      pixelsB64: encodeRaw(makeRgba(400, 200, 1)),
      ts: 1_234_567_890_000,
    };
    expect(FramePixelsSchema.safeParse(valid).success).toBe(true);
  });

  it('parses a valid minimum-bound FramePixels payload (20×20)', () => {
    const valid: FramePixels = {
      sceneId: 's',
      width: 20,
      height: 20,
      pixelsB64: MIN_B64,
      ts: 1,
    };
    expect(FramePixelsSchema.safeParse(valid).success).toBe(true);
  });
});

describe('FramePixelsSchema — bounds (FP-2..FP-4)', () => {
  it('FP-2: rejects width below minimum (19)', () => {
    const r = FramePixelsSchema.safeParse({
      sceneId: 's',
      width: 19,
      height: 20,
      pixelsB64: MIN_B64,
      ts: 1,
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes('width'))).toBe(true);
    }
  });

  it('FP-3: rejects width above maximum (401)', () => {
    const r = FramePixelsSchema.safeParse({
      sceneId: 's',
      width: 401,
      height: 20,
      pixelsB64: MIN_B64,
      ts: 1,
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes('width'))).toBe(true);
    }
  });

  it('FP-4: rejects height above maximum (201)', () => {
    const r = FramePixelsSchema.safeParse({
      sceneId: 's',
      width: 20,
      height: 201,
      pixelsB64: MIN_B64,
      ts: 1,
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes('height'))).toBe(true);
    }
  });

  it('also rejects height below minimum (19) for symmetry', () => {
    const r = FramePixelsSchema.safeParse({
      sceneId: 's',
      width: 20,
      height: 19,
      pixelsB64: MIN_B64,
      ts: 1,
    });
    expect(r.success).toBe(false);
  });
});

describe('decodeFramePixels — failure modes (FP-5, FP-7)', () => {
  it('FP-5: throws on non-base64 input', () => {
    // `*` is not a valid base64 character per RFC 4648.
    expect(() => decodeFramePixels('***not-base64***', 20, 20)).toThrow(
      /FramePixels decode: invalid base64/,
    );
  });

  it('FP-7: throws on length-mismatch (decoded buffer ≠ width × height × 4)', () => {
    // Encode a 4-byte buffer but claim it should be 20×20×4 = 1600 bytes.
    const tinyB64 = encodeRaw(SMALL_RGBA);
    expect(() => decodeFramePixels(tinyB64, 20, 20)).toThrow(/FramePixels decode: length mismatch/);
  });
});

describe('encodeFramePixels / decodeFramePixels — roundtrip (FP-6, FP-8)', () => {
  it('FP-6: roundtrip preserves length on a 20×20 frame', () => {
    const original = makeRgba(20, 20, 7);
    const b64 = encodeFramePixels(original);
    const decoded = decodeFramePixels(b64, 20, 20);
    expect(decoded).toBeInstanceOf(Uint8ClampedArray);
    expect(decoded.length).toBe(20 * 20 * 4);
  });

  it('FP-8: byte-for-byte roundtrip on a 400×200 frame', () => {
    const original = makeRgba(400, 200, 0x42);
    const b64 = encodeFramePixels(original);
    const decoded = decodeFramePixels(b64, 400, 200);
    expect(decoded.length).toBe(original.length);
    // Compare byte-by-byte. toEqual on typed arrays is supported by Vitest.
    expect(decoded).toEqual(original);
  });

  it('FP-6 (continued): decoded Uint8ClampedArray owns a fresh ArrayBuffer (transferable-capable)', () => {
    const original = makeRgba(20, 20, 0);
    const b64 = encodeFramePixels(original);
    const decoded = decodeFramePixels(b64, 20, 20);
    expect(decoded.byteOffset).toBe(0);
    expect(decoded.byteLength).toBe(decoded.buffer.byteLength);
  });
});

describe('FramePixelsSchema + helpers re-export (FP-9)', () => {
  it('imports cleanly from `@evf/shared-protocol` package entry', async () => {
    const mod = await import('@evf/shared-protocol');
    expect(mod.FramePixelsSchema).toBeDefined();
    expect(typeof mod.encodeFramePixels).toBe('function');
    expect(typeof mod.decodeFramePixels).toBe('function');
    // Sanity: the re-exported schema validates the same shape.
    const r = mod.FramePixelsSchema.safeParse({
      sceneId: 's',
      width: 20,
      height: 20,
      pixelsB64: MIN_B64,
      ts: 1,
    });
    expect(r.success).toBe(true);
  });
});

describe('EnvelopeSchema + FramePixelsSchema cross-schema contract (FP-10)', () => {
  it('FP-10: a valid FramePixels travels cleanly inside an EnvelopeSchema envelope', () => {
    const framePixels: FramePixels = {
      sceneId: 'scene1',
      width: 288,
      height: 144,
      pixelsB64: encodeRaw(makeRgba(288, 144, 9)),
      ts: Date.now(),
    };
    const envelope = {
      proto: 'evf-v1' as const,
      seq: 0,
      ts: Date.now(),
      type: 'frame_pixels',
      session_id: '00000000-0000-4000-8000-000000000000',
      payload: framePixels,
    };
    const outer = EnvelopeSchema.safeParse(envelope);
    expect(outer.success).toBe(true);
    if (outer.success) {
      const inner = FramePixelsSchema.safeParse(outer.data.payload);
      expect(inner.success).toBe(true);
    }
  });

  it('FP-10 (negative): a missing session_id makes the outer envelope fail (lock NF-1 contract)', () => {
    const envelopeWithoutSession = {
      proto: 'evf-v1' as const,
      seq: 0,
      ts: Date.now(),
      type: 'frame_pixels',
      // session_id intentionally omitted — EnvelopeSchema requires it.
      payload: {
        sceneId: 'scene1',
        width: 20,
        height: 20,
        pixelsB64: MIN_B64,
        ts: Date.now(),
      },
    };
    expect(EnvelopeSchema.safeParse(envelopeWithoutSession).success).toBe(false);
  });
});
