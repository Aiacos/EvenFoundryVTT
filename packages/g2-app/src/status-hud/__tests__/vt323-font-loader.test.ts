/**
 * Tests for `ensureVt323Loaded()` — VT323 font loader with monospace fallback.
 *
 * # SC1 (RFONT-01): When `self.fonts` is unavailable the loader returns `'16px monospace'`
 *
 * In the happy-dom test environment `self.fonts` (`FontFaceSet`) is undefined.
 * `ensureVt323Loaded()` must catch any error thrown by the `FontFace` API or
 * `self.fonts.add()` and return the safe monospace fallback string without throwing.
 *
 * @see packages/g2-app/src/status-hud/vt323-font-loader.ts
 * @see .planning/phases/EVF-20-status-hud-su-canvas-font-vt323-inv-1-raster-baseline/20-RESEARCH.md
 *   (§Pitfall 1: self.fonts not available in happy-dom)
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ensureVt323Loaded } from '../vt323-font-loader.js';

describe('ensureVt323Loaded', () => {
  // happy-dom naturally lacks FontFaceSet — these tests exercise the fallback.
  // We additionally stub `globalThis.fonts` to `undefined` to make the contract
  // explicit and guard against future happy-dom updates that might add FontFaceSet.

  let savedFonts: unknown;

  beforeEach(() => {
    savedFonts = (globalThis as Record<string, unknown>).fonts;
    // Explicitly remove FontFaceSet from the global scope.
    (globalThis as Record<string, unknown>).fonts = undefined;
  });

  afterEach(() => {
    // Restore original value (undefined in happy-dom; real FontFaceSet in browser).
    (globalThis as Record<string, unknown>).fonts = savedFonts;
  });

  it('SC1: returns monospace fallback when self.fonts is unavailable', async () => {
    // In happy-dom self.fonts is undefined; the try/catch in ensureVt323Loaded
    // catches the TypeError thrown by `self.fonts.add(face)` and returns the
    // safe fallback string. Also covers: FontFace may not exist in happy-dom —
    // the catch handles that too.
    const result = await ensureVt323Loaded();
    expect(result).toBe('16px monospace');
  });

  it('SC1: never throws even when self.fonts is undefined', async () => {
    // The function contract requires it never rejects — assert via resolution.
    await expect(ensureVt323Loaded()).resolves.toBe('16px monospace');
  });

  it('SC1: returns a string starting with "16px" (valid CSS font value)', async () => {
    const result = await ensureVt323Loaded();
    expect(result).toMatch(/^16px /);
  });
});
