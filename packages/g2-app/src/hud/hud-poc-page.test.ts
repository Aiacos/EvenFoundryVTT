/**
 * hud-poc-page.test.ts — pure schema + push call tests (no live bridge).
 *
 * Tests:
 * - HUD_POC_CONTAINERS geometry (4 entries, correct ids + positions)
 * - buildHudPocPageSchema() returns correct container schema shape
 * - pushHudTiles() calls updateImageRawData once per tile with correct shape
 * - pushHudTiles() logs a warning (does NOT throw) on non-success result
 *
 * Geometry updated from 288×144 (PoC / simulator-only) to 200×100 per INV-2
 * verification 2026-06-05 (`hub.evenrealities.com/docs/guides/display`).
 * This is a deliberate fixture correction per ADR-0013 Amendment 1 (RINV-02).
 *
 * @see packages/g2-app/src/hud/hud-poc-page.ts
 * @see docs/architecture/0013-hud-raster-rendering.md (ADR-0013 Amendment 1)
 */
import { describe, expect, it, vi } from 'vitest';
import { buildHudPocPageSchema, HUD_POC_CONTAINERS } from './hud-poc-page.js';
import type { HudTile } from './hud-raster-frame.js';
import { pushHudTiles } from './push-hud-tiles.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeTiles(): HudTile[] {
  return [0, 1, 2, 3].map((i) => ({
    containerName: `hud-tile-${i}`,
    containerID: i,
    bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, i]), // minimal fake PNG header bytes
  }));
}

// ── HUD_POC_CONTAINERS ────────────────────────────────────────────────────────

describe('HUD_POC_CONTAINERS', () => {
  it('has exactly 4 entries', () => {
    expect(HUD_POC_CONTAINERS).toHaveLength(4);
  });

  it('entry 0 — hud-tile-0 id=0 at (0,0) 200×100', () => {
    const c = HUD_POC_CONTAINERS[0];
    expect(c).toBeDefined();
    expect(c?.containerName).toBe('hud-tile-0');
    expect(c?.containerID).toBe(0);
    expect(c?.xPosition).toBe(0);
    expect(c?.yPosition).toBe(0);
    expect(c?.width).toBe(200);
    expect(c?.height).toBe(100);
  });

  it('entry 1 — hud-tile-1 id=1 at (200,0) 200×100', () => {
    const c = HUD_POC_CONTAINERS[1];
    expect(c).toBeDefined();
    expect(c?.containerName).toBe('hud-tile-1');
    expect(c?.containerID).toBe(1);
    expect(c?.xPosition).toBe(200);
    expect(c?.yPosition).toBe(0);
    expect(c?.width).toBe(200);
    expect(c?.height).toBe(100);
  });

  it('entry 2 — hud-tile-2 id=2 at (0,100) 200×100', () => {
    const c = HUD_POC_CONTAINERS[2];
    expect(c).toBeDefined();
    expect(c?.containerName).toBe('hud-tile-2');
    expect(c?.containerID).toBe(2);
    expect(c?.xPosition).toBe(0);
    expect(c?.yPosition).toBe(100);
    expect(c?.width).toBe(200);
    expect(c?.height).toBe(100);
  });

  it('entry 3 — hud-tile-3 id=3 at (200,100) 200×100', () => {
    const c = HUD_POC_CONTAINERS[3];
    expect(c).toBeDefined();
    expect(c?.containerName).toBe('hud-tile-3');
    expect(c?.containerID).toBe(3);
    expect(c?.xPosition).toBe(200);
    expect(c?.yPosition).toBe(100);
    expect(c?.width).toBe(200);
    expect(c?.height).toBe(100);
  });
});

// ── buildHudPocPageSchema ─────────────────────────────────────────────────────

describe('buildHudPocPageSchema', () => {
  it('returns containerTotalNum: 4', () => {
    const schema = buildHudPocPageSchema();
    expect(schema.containerTotalNum).toBe(4);
  });

  it('returns 4 imageObject entries', () => {
    const schema = buildHudPocPageSchema();
    expect(schema.imageObject).toHaveLength(4);
  });

  it('returns empty textObject array', () => {
    const schema = buildHudPocPageSchema();
    expect(schema.textObject).toEqual([]);
  });

  it('imageObject entries have ids 0..3 in order', () => {
    const schema = buildHudPocPageSchema();
    // Access the containerID property from the SDK ImageContainerProperty instances
    // (the property name follows the protobuf field convention)
    const ids = schema.imageObject.map((img) => (img as { containerID?: number }).containerID);
    expect(ids).toEqual([0, 1, 2, 3]);
  });

  it('imageObject entry 0 has correct geometry (200×100, INV-2 verified)', () => {
    const schema = buildHudPocPageSchema();
    const img = schema.imageObject[0] as {
      containerID?: number;
      containerName?: string;
      xPosition?: number;
      yPosition?: number;
      width?: number;
      height?: number;
    };
    expect(img.containerName).toBe('hud-tile-0');
    expect(img.xPosition).toBe(0);
    expect(img.yPosition).toBe(0);
    expect(img.width).toBe(200);
    expect(img.height).toBe(100);
  });
});

// ── pushHudTiles ──────────────────────────────────────────────────────────────

describe('pushHudTiles', () => {
  it('calls bridge.updateImageRawData once per tile (4 calls total)', async () => {
    const mockResult = { success: true } as unknown as ReturnType<() => Promise<unknown>>;
    const mockBridge = {
      updateImageRawData: vi.fn().mockResolvedValue(mockResult),
    };

    // Patch ImageRawDataUpdateResult.isSuccess to return true for our mock result
    // We import the module and spy on it below; here we use a simpler approach:
    // the implementation uses ImageRawDataUpdateResult.isSuccess which takes the raw result.
    // For the success path, we just need 4 calls to happen without throwing.

    const tiles = makeTiles();

    // We need to ensure our mock bridge result passes isSuccess check.
    // The real isSuccess looks for specific result properties from the SDK proto.
    // In tests, we mock the whole bridge and the function under test handles the result.
    // We'll verify call count and argument shapes.
    await pushHudTiles(mockBridge as Parameters<typeof pushHudTiles>[0], tiles);

    expect(mockBridge.updateImageRawData).toHaveBeenCalledTimes(4);
  });

  it('calls updateImageRawData with correct containerID + containerName per tile', async () => {
    const mockResult = {} as unknown as ReturnType<() => Promise<unknown>>;
    const mockBridge = {
      updateImageRawData: vi.fn().mockResolvedValue(mockResult),
    };

    const tiles = makeTiles();
    await pushHudTiles(mockBridge as Parameters<typeof pushHudTiles>[0], tiles);

    for (let i = 0; i < 4; i++) {
      const call = mockBridge.updateImageRawData.mock.calls[i];
      expect(call).toBeDefined();
      const payload = call?.[0] as {
        containerID?: number;
        containerName?: string;
        imageData?: Uint8Array;
      };
      expect(payload?.containerID).toBe(i);
      expect(payload?.containerName).toBe(`hud-tile-${i}`);
      expect(payload?.imageData).toBeInstanceOf(Uint8Array);
    }
  });

  it('logs a warning (does NOT throw) when result is non-success', async () => {
    // Non-success: return an object that ImageRawDataUpdateResult.isSuccess returns false for.
    // We mock console.warn and verify it gets called.
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    // Return a clearly non-success result (null or wrong shape)
    const mockBridge = {
      updateImageRawData: vi.fn().mockResolvedValue(null),
    };

    const tiles = makeTiles();

    // Should NOT throw even with non-success result
    await expect(
      pushHudTiles(mockBridge as Parameters<typeof pushHudTiles>[0], tiles),
    ).resolves.toBeUndefined();

    // Should have logged a warning at least once
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
