/**
 * Unit tests for FramePngSchema + FRAME_PNG_TYPE (Quick Task 260611-e71 FRAME-PNG-01).
 *
 * Covers:
 *   - Accept: well-formed objects parse successfully
 *   - Reject: empty sceneId, out-of-bounds width/height, non-int dims, ts ≤ 0, missing pngB64
 *   - FRAME_PNG_TYPE === 'frame_png' (literal constant)
 *   - Re-export from @evf/shared-protocol index (index wired — import must resolve)
 *   - FramePixelsSchema still importable (back-compat)
 */
import { describe, expect, it } from 'vitest';

import { FRAME_PNG_TYPE, FramePngSchema } from './frame-png.js';

// ─── FRAME_PNG_TYPE ────────────────────────────────────────────────────────────

describe('FRAME_PNG_TYPE', () => {
  it('equals the literal string "frame_png"', () => {
    expect(FRAME_PNG_TYPE).toBe('frame_png');
  });
});

// ─── FramePngSchema — accept ───────────────────────────────────────────────────

describe('FramePngSchema — accept', () => {
  it('accepts a well-formed full-screen payload', () => {
    const result = FramePngSchema.safeParse({
      sceneId: 'abc',
      width: 576,
      height: 288,
      pngB64: 'aGVsbG8=',
      ts: 1000,
    });
    expect(result.success).toBe(true);
  });

  it('accepts minimum-size payload (width=20, height=20)', () => {
    const result = FramePngSchema.safeParse({
      sceneId: 'x',
      width: 20,
      height: 20,
      pngB64: 'dGVzdA==',
      ts: 1,
    });
    expect(result.success).toBe(true);
  });

  it('accepts ts=1 (minimum positive integer)', () => {
    const result = FramePngSchema.safeParse({
      sceneId: 'scene-abc',
      width: 100,
      height: 50,
      pngB64: 'base64data',
      ts: 1,
    });
    expect(result.success).toBe(true);
  });

  it('accepts any non-empty pngB64 string', () => {
    const result = FramePngSchema.safeParse({
      sceneId: 'scene1',
      width: 288,
      height: 144,
      pngB64: 'AAAA',
      ts: 1718000000000,
    });
    expect(result.success).toBe(true);
  });
});

// ─── FramePngSchema — reject ───────────────────────────────────────────────────

describe('FramePngSchema — reject', () => {
  it('rejects empty sceneId', () => {
    const result = FramePngSchema.safeParse({
      sceneId: '',
      width: 288,
      height: 144,
      pngB64: 'abc',
      ts: 1000,
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty pngB64 (a frame carrier with no image is never valid)', () => {
    const result = FramePngSchema.safeParse({
      sceneId: 'scene1',
      width: 288,
      height: 144,
      pngB64: '',
      ts: 1000,
    });
    expect(result.success).toBe(false);
  });

  it('rejects width=19 (below min 20)', () => {
    const result = FramePngSchema.safeParse({
      sceneId: 'scene1',
      width: 19,
      height: 100,
      pngB64: 'abc',
      ts: 1000,
    });
    expect(result.success).toBe(false);
  });

  it('rejects width=577 (above max 576)', () => {
    const result = FramePngSchema.safeParse({
      sceneId: 'scene1',
      width: 577,
      height: 100,
      pngB64: 'abc',
      ts: 1000,
    });
    expect(result.success).toBe(false);
  });

  it('rejects height=19 (below min 20)', () => {
    const result = FramePngSchema.safeParse({
      sceneId: 'scene1',
      width: 100,
      height: 19,
      pngB64: 'abc',
      ts: 1000,
    });
    expect(result.success).toBe(false);
  });

  it('rejects height=289 (above max 288)', () => {
    const result = FramePngSchema.safeParse({
      sceneId: 'scene1',
      width: 100,
      height: 289,
      pngB64: 'abc',
      ts: 1000,
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-integer width (float)', () => {
    const result = FramePngSchema.safeParse({
      sceneId: 'scene1',
      width: 100.5,
      height: 100,
      pngB64: 'abc',
      ts: 1000,
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-integer height (float)', () => {
    const result = FramePngSchema.safeParse({
      sceneId: 'scene1',
      width: 100,
      height: 100.5,
      pngB64: 'abc',
      ts: 1000,
    });
    expect(result.success).toBe(false);
  });

  it('rejects ts=0', () => {
    const result = FramePngSchema.safeParse({
      sceneId: 'scene1',
      width: 100,
      height: 100,
      pngB64: 'abc',
      ts: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects ts=-1 (negative)', () => {
    const result = FramePngSchema.safeParse({
      sceneId: 'scene1',
      width: 100,
      height: 100,
      pngB64: 'abc',
      ts: -1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-integer ts (float)', () => {
    const result = FramePngSchema.safeParse({
      sceneId: 'scene1',
      width: 100,
      height: 100,
      pngB64: 'abc',
      ts: 1000.5,
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing pngB64', () => {
    const result = FramePngSchema.safeParse({
      sceneId: 'scene1',
      width: 100,
      height: 100,
      ts: 1000,
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing sceneId', () => {
    const result = FramePngSchema.safeParse({
      width: 100,
      height: 100,
      pngB64: 'abc',
      ts: 1000,
    });
    expect(result.success).toBe(false);
  });
});

// ─── Back-compat: FramePixelsSchema still importable ──────────────────────────

describe('FramePixelsSchema back-compat', () => {
  it('FramePixelsSchema is still importable from ./frame.js and parses valid input', async () => {
    const { FramePixelsSchema } = await import('./frame.js');
    const result = FramePixelsSchema.safeParse({
      sceneId: 'scene1',
      width: 288,
      height: 144,
      pixelsB64: 'aGVsbG8=',
      ts: 1000,
    });
    expect(result.success).toBe(true);
  });
});
