/**
 * Tests for the map auto-framing (region-render) capture path in
 * canvas-extractor: the stage is rendered to an off-screen RT under a temporary
 * fit transform for the supplied world rect, and the GM's on-screen camera
 * transform is restored in the same tick.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { extractCurrentFrame } from './canvas-extractor.js';
import type { WorldRect } from './map-framing.js';

interface Pt {
  x: number;
  y: number;
}

/**
 * Build a mock Foundry `canvas` whose renderer records the stage transform at
 * the instant `render()` is called (so the test can assert the framing math),
 * then returns a solid RGBA buffer of the requested RT size from `extract`.
 */
function makeFramingCanvas(rtSize: { w: number; h: number }) {
  const position: Pt = { x: 11, y: 22 };
  const scale: Pt = { x: 3, y: 3 };
  const pivot: Pt = { x: 100, y: 200 };
  const stage = { position, scale, pivot };

  // Captured at render() time.
  const atRender: { pivot?: Pt; position?: Pt; scale?: Pt } = {};

  const renderer = {
    width: 800,
    height: 400,
    screen: { width: 800, height: 400 },
    extract: {
      pixels: (_target?: unknown) => new Uint8ClampedArray(rtSize.w * rtSize.h * 4).fill(128),
    },
    render: (_stage: unknown, _opts: { renderTexture: unknown; clear: boolean }) => {
      atRender.pivot = { x: pivot.x, y: pivot.y };
      atRender.position = { x: position.x, y: position.y };
      atRender.scale = { x: scale.x, y: scale.y };
    },
  };

  const canvas = {
    scene: { id: 'scene-1' },
    app: { renderer },
    stage,
  };

  return {
    canvas,
    stage,
    atRender,
    saved: { position: { x: 11, y: 22 }, scale: { x: 3, y: 3 }, pivot: { x: 100, y: 200 } },
  };
}

describe('canvas-extractor framing path', () => {
  afterEach(() => {
    // Clear the global PIXI stub between tests.
    (globalThis as { PIXI?: unknown }).PIXI = undefined;
  });

  function installPixi(): void {
    (globalThis as { PIXI?: unknown }).PIXI = {
      RenderTexture: {
        create: (_o: { width: number; height: number; resolution?: number }) => ({
          destroy: (_b: boolean) => {},
        }),
      },
    };
  }

  it('CEF-1: renders the framed region under a fit transform, then restores the camera', () => {
    installPixi();
    const TW = 576;
    const TH = 288;
    const SS = 2; // FRAMED_SUPERSAMPLE
    const RW = TW * SS;
    const RH = TH * SS;
    const { canvas, stage, atRender } = makeFramingCanvas({ w: RW, h: RH });

    const framing: WorldRect = { x: 1000, y: 500, width: 2000, height: 1000 };
    const out = extractCurrentFrame(canvas as never, {
      targetWidth: TW,
      targetHeight: TH,
      framing,
    });

    expect(out).not.toBeNull();

    // During render the transform fit the rect into the RT:
    //   scale = min(RW/w, RH/h); pivot = rect center; position = RT center.
    const expScale = Math.min(RW / framing.width, RH / framing.height);
    expect(atRender.scale?.x).toBeCloseTo(expScale, 6);
    expect(atRender.scale?.y).toBeCloseTo(expScale, 6);
    expect(atRender.pivot?.x).toBeCloseTo(framing.x + framing.width / 2, 6);
    expect(atRender.pivot?.y).toBeCloseTo(framing.y + framing.height / 2, 6);
    expect(atRender.position?.x).toBeCloseTo(RW / 2, 6);
    expect(atRender.position?.y).toBeCloseTo(RH / 2, 6);

    // After the call the GM's live camera transform is restored exactly.
    expect(stage.position).toEqual({ x: 11, y: 22 });
    expect(stage.scale).toEqual({ x: 3, y: 3 });
    expect(stage.pivot).toEqual({ x: 100, y: 200 });
  });

  it('CEF-2: restores the camera even when render throws (no stranded viewport)', () => {
    installPixi();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { canvas, stage } = makeFramingCanvas({ w: 1152, h: 576 });
    // Make render throw.
    (canvas.app.renderer as { render: unknown }).render = () => {
      throw new Error('boom');
    };

    const framing: WorldRect = { x: 0, y: 0, width: 1000, height: 500 };
    // Falls back to the live-viewport path after the framed path fails; with a
    // throwing renderer the no-arg extract also runs — assert it does not throw
    // and the camera transform is restored.
    expect(() =>
      extractCurrentFrame(canvas as never, { targetWidth: 576, targetHeight: 288, framing }),
    ).not.toThrow();
    expect(stage.position).toEqual({ x: 11, y: 22 });
    expect(stage.scale).toEqual({ x: 3, y: 3 });
    expect(stage.pivot).toEqual({ x: 100, y: 200 });
    warn.mockRestore();
  });

  it('CEF-3: no framing → the live viewport path is used (render not called for a region)', () => {
    installPixi();
    const { canvas, atRender } = makeFramingCanvas({ w: 800, h: 400 });
    // No framing: the live path renders the whole viewport (vw×vh), NOT a region.
    const out = extractCurrentFrame(canvas as never, { targetWidth: 576, targetHeight: 288 });
    expect(out).not.toBeNull();
    // The live RT path renders with the existing (unmodified) stage transform —
    // pivot stays at the camera's pivot, not a framing rect center.
    expect(atRender.pivot).toEqual({ x: 100, y: 200 });
  });
});
