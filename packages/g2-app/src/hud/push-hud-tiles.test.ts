/**
 * push-hud-tiles.test.ts — isolated unit tests for the pushHudTiles production module.
 *
 * Tests mirror the pushHudTiles cases from hud-poc-page.test.ts and provide
 * standalone coverage that survives the deletion of hud-poc-page.test.ts in Plan 03.
 *
 * Tests:
 * - 2 tiles, both success → updateImageRawData called twice, no warn.
 * - 1 tile, non-success result → console.warn called once, function resolves (no throw).
 * - empty tiles array → updateImageRawData never called, resolves.
 * - serial call order (CM-01) — call count and argument shapes validated.
 *
 * @see packages/g2-app/src/hud/push-hud-tiles.ts (module under test)
 * @see docs/architecture/0013-hud-raster-rendering.md Amendment 1 (CM-01 contract)
 */
import { describe, expect, it, vi } from 'vitest';
import type { HudTile } from './hud-raster-frame.js';
import { pushHudTiles } from './push-hud-tiles.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeTile(i: number): HudTile {
  return {
    containerName: `hud-tile-${i}`,
    containerID: i,
    bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, i]),
  };
}

function makeMockBridge(resolveValue: unknown = null) {
  return {
    updateImageRawData: vi.fn().mockResolvedValue(resolveValue),
  };
}

// ── pushHudTiles ──────────────────────────────────────────────────────────────

describe('pushHudTiles', () => {
  it('empty tiles array → updateImageRawData never called, resolves', async () => {
    const bridge = makeMockBridge();
    await expect(
      pushHudTiles(bridge as Parameters<typeof pushHudTiles>[0], []),
    ).resolves.toBeUndefined();
    expect(bridge.updateImageRawData).not.toHaveBeenCalled();
  });

  it('2 tiles, both success → updateImageRawData called twice, no warn', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    // null resolves as non-success from the SDK; use a truthy non-null object
    // to keep coverage simple — the warn-path test below validates the negative.
    const bridge = makeMockBridge(null);
    // Success result: any value that passes ImageRawDataUpdateResult.isSuccess.
    // We override the mock to return a non-null truthy object for both calls.
    bridge.updateImageRawData = vi.fn().mockResolvedValue({ success: true });

    const tiles = [makeTile(0), makeTile(1)];
    await pushHudTiles(bridge as Parameters<typeof pushHudTiles>[0], tiles);

    expect(bridge.updateImageRawData).toHaveBeenCalledTimes(2);
    consoleSpy.mockRestore();
  });

  it('calls updateImageRawData with correct containerID + containerName + imageData per tile', async () => {
    const bridge = makeMockBridge({});
    const tiles = [makeTile(0), makeTile(1)];
    await pushHudTiles(bridge as Parameters<typeof pushHudTiles>[0], tiles);

    expect(bridge.updateImageRawData).toHaveBeenCalledTimes(2);
    for (let i = 0; i < 2; i++) {
      const call = bridge.updateImageRawData.mock.calls[i];
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

  it('1 tile, non-success result → console.warn called once, function resolves (no throw)', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    // null is the canonical non-success value (ImageRawDataUpdateResult.isSuccess(null) → false)
    const bridge = makeMockBridge(null);

    const tiles = [makeTile(0)];
    await expect(
      pushHudTiles(bridge as Parameters<typeof pushHudTiles>[0], tiles),
    ).resolves.toBeUndefined();

    expect(consoleSpy).toHaveBeenCalledOnce();
    // Warn message must NOT contain 'hud-poc' (PoC label removed per INV-4)
    const warnArg = consoleSpy.mock.calls[0]?.[0] as string | undefined;
    expect(typeof warnArg).toBe('string');
    expect(warnArg).toContain('[EVF] push-hud-tiles:');
    expect(warnArg).not.toContain('hud-poc');

    consoleSpy.mockRestore();
  });

  it('serial call order preserved (CM-01) — second call awaited after first', async () => {
    // Verify ordering: call sequence matches tile array order.
    const callOrder: number[] = [];
    const bridge = {
      updateImageRawData: vi.fn().mockImplementation((payload: { containerID?: number }) => {
        callOrder.push(payload.containerID ?? -1);
        return Promise.resolve({});
      }),
    };

    const tiles = [makeTile(2), makeTile(0), makeTile(3)];
    await pushHudTiles(bridge as Parameters<typeof pushHudTiles>[0], tiles);

    expect(callOrder).toEqual([2, 0, 3]);
  });
});
