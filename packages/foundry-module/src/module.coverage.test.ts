/**
 * Branch-coverage tests for module.ts buildMapFraming token-adapter fallback arms:
 * grid-size fallbacks, malformed token skipping, default footprint, null-actor
 * handling, absent scene dimensions, and the defensive catch. Each asserts the
 * observable framing result (null vs a rect containing the tokens).
 *
 * @see packages/foundry-module/src/module.ts (buildMapFraming)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Rect = { x: number; y: number; width: number; height: number };

class ApplicationV2Stub {
  render(): this {
    return this;
  }
  static DEFAULT_OPTIONS = {};
  static PARTS = {};
}

async function frame(canvas: unknown, autoFrame = true): Promise<Rect | null> {
  // module.ts → settings.ts → BridgeConfigModal.ts reads `foundry.applications.api`
  // at module-eval time; stub it so a fresh dynamic import never throws.
  vi.stubGlobal('foundry', {
    applications: {
      api: { ApplicationV2: ApplicationV2Stub, HandlebarsApplicationMixin: (B: unknown) => B },
    },
  });
  vi.stubGlobal('Hooks', { once: vi.fn(), on: vi.fn(), off: vi.fn() });
  vi.stubGlobal('game', {
    settings: {
      get: vi.fn((_m: string, key: string) => (key === 'mapAutoFrame' ? autoFrame : undefined)),
    },
  });
  (globalThis as { canvas?: unknown }).canvas = canvas;
  const { buildMapFraming } = await import('./module.js');
  return buildMapFraming() as Rect | null;
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
  (globalThis as { canvas?: unknown }).canvas = undefined;
});

/** A single visible player token at (x,y) with a 1×1 grid footprint. */
function tok(x: number, y: number, extra: Record<string, unknown> = {}): unknown {
  return {
    document: { x, y, width: 1, height: 1, hidden: false, ...extra },
    actor: { id: 'a', hasPlayerOwner: true },
  };
}

describe('buildMapFraming grid-size fallbacks', () => {
  it('falls back to dimensions.size when grid.size is absent', async () => {
    const r = await frame({
      tokens: { placeables: [tok(0, 0), tok(300, 300)] },
      dimensions: { width: 5000, height: 5000, size: 100 },
    });
    expect(r).not.toBeNull();
  });

  it('falls back to 100 when both grid.size and dimensions.size are absent', async () => {
    const r = await frame({
      tokens: { placeables: [tok(0, 0)] },
      dimensions: { width: 5000, height: 5000 },
    });
    expect(r).not.toBeNull();
  });

  it('treats a non-positive grid size as the 100 default (safeGrid clamp)', async () => {
    const r = await frame({
      tokens: { placeables: [tok(0, 0)] },
      grid: { size: 0 },
      dimensions: { width: 5000, height: 5000 },
    });
    expect(r).not.toBeNull();
    // 1 grid-unit footprint × the 100 default → the token's 0..100 box is inside.
    const rect = r as Rect;
    expect(rect.x + rect.width).toBeGreaterThanOrEqual(100);
  });
});

describe('buildMapFraming malformed-token skipping', () => {
  it('skips a placeable whose document is null', async () => {
    const r = await frame({
      tokens: { placeables: [{ document: null, actor: null }, tok(0, 0)] },
      grid: { size: 100 },
      dimensions: { width: 5000, height: 5000, size: 100 },
    });
    // The one valid token still frames.
    expect(r).not.toBeNull();
  });

  it('skips a token with a non-numeric x/y', async () => {
    const bad = { document: { x: 'NaN', y: 0, width: 1, height: 1 }, actor: null };
    const r = await frame({
      tokens: { placeables: [bad] },
      grid: { size: 100 },
      dimensions: { width: 5000, height: 5000, size: 100 },
    });
    // The only token is malformed → no framable tokens → null.
    expect(r).toBeNull();
  });

  it('defaults missing width/height to 1 grid unit and null actor to non-PC', async () => {
    // A visible token with no width/height and no actor: framed (fallback-to-all,
    // since no PC token exists), with a default 1×gridSize footprint.
    const noSize = { document: { x: 200, y: 200, hidden: false }, actor: null };
    const r = await frame({
      tokens: { placeables: [noSize] },
      grid: { size: 100 },
      dimensions: { width: 5000, height: 5000, size: 100 },
    });
    expect(r).not.toBeNull();
    const rect = r as Rect;
    // 1×100 footprint at 200 → the 200..300 box is inside the frame.
    expect(rect.x).toBeLessThanOrEqual(200);
    expect(rect.x + rect.width).toBeGreaterThanOrEqual(300);
  });
});

describe('buildMapFraming absent scene dimensions + defensive catch', () => {
  it('produces a frame when dimensions carry no width/height', async () => {
    const r = await frame({
      tokens: { placeables: [tok(0, 0), tok(400, 400)] },
      grid: { size: 100 },
      dimensions: { size: 100 }, // no width/height → sceneWidth/Height undefined
    });
    expect(r).not.toBeNull();
  });

  it('returns null (never throws) when reading placeables throws', async () => {
    const throwingCanvas = {
      tokens: {
        get placeables(): never {
          throw new Error('canvas torn down');
        },
      },
      grid: { size: 100 },
      dimensions: { width: 5000, height: 5000, size: 100 },
    };
    expect(await frame(throwingCanvas)).toBeNull();
  });
});
