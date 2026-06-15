/**
 * Tests for the CanvasLayer interface + isCanvasLayer runtime type guard
 * (additive extension to layer-types.ts — ADR-0013 Amendment 1).
 *
 * CanvasLayer extends Layer with:
 *   - attachCanvas(canvas)  — OffscreenCanvas | HTMLCanvasElement
 *   - paint()               — repaint the layer's canvas
 *   - isDirty()             — dirty-flag query
 *
 * isCanvasLayer(layer) is a runtime type guard checking for these three methods.
 *
 * @see packages/g2-app/src/engine/layer-types.ts (CanvasLayer + isCanvasLayer)
 * @see docs/architecture/0013-hud-raster-rendering.md (Amendment 1 — locked decision #3)
 */

import { describe, expect, it, vi } from 'vitest';
import type { CanvasLayer, Layer } from '../layer-types.js';
import { isCanvasLayer } from '../layer-types.js';

describe('isCanvasLayer', () => {
  // Build a minimal bare Layer stub (no attachCanvas/paint/isDirty).
  const bareLayer: Layer = {
    id: 'bare',
    draw: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn(),
  };

  // Build a full CanvasLayer stub.
  const fullCanvasLayer: CanvasLayer = {
    id: 'canvas',
    draw: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn(),
    attachCanvas: vi.fn(),
    paint: vi.fn(),
    isDirty: vi.fn().mockReturnValue(false),
  };

  it('returns true for an object that implements all three CanvasLayer methods', () => {
    expect(isCanvasLayer(fullCanvasLayer)).toBe(true);
  });

  it('returns false for a bare Layer that lacks attachCanvas/paint/isDirty', () => {
    expect(isCanvasLayer(bareLayer)).toBe(false);
  });

  it('returns false when only attachCanvas is present (partial implementation)', () => {
    const partial: Layer & { attachCanvas: () => void } = {
      id: 'partial',
      draw: vi.fn().mockResolvedValue(undefined),
      destroy: vi.fn(),
      attachCanvas: vi.fn(),
    };
    expect(isCanvasLayer(partial as unknown as Layer)).toBe(false);
  });

  it('returns false when paint exists but isDirty is missing', () => {
    const noDirty: Layer & { attachCanvas: () => void; paint: () => void } = {
      id: 'nodirty',
      draw: vi.fn().mockResolvedValue(undefined),
      destroy: vi.fn(),
      attachCanvas: vi.fn(),
      paint: vi.fn(),
    };
    expect(isCanvasLayer(noDirty as unknown as Layer)).toBe(false);
  });

  it('CanvasLayer is assignable to Layer (structural subtype)', () => {
    // If CanvasLayer extends Layer, assigning fullCanvasLayer to a Layer variable
    // must compile cleanly (this test catches type regressions at test-import time).
    const asLayer: Layer = fullCanvasLayer;
    expect(asLayer.id).toBe('canvas');
  });
});
