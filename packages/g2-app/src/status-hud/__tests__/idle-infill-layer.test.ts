/**
 * Unit tests for IdleInfillLayer (Phase 4a Plan 04 Task 2).
 *
 * Covers (per 04A-04-PLAN.md `<behavior>` IIL-1..IIL-6):
 *   - IIL-1: id === 'idle-infill'
 *   - IIL-2: getCaptureContainer is UNDEFINED (render-only z=0.5)
 *   - IIL-3: raster mode draw() → 3 textContainerUpgrade calls (z05-combat-log/label/stats)
 *   - IIL-4: glyph mode draw() → 2 textContainerUpgrade calls (combat-log omitted)
 *   - IIL-5: setStats() updates stats strip — `raster 400×200 · FS+RLE+delta · BLE 240k · 8 fps · [Q] Quick`
 *   - IIL-6: destroy() is a no-op (containers removed atomically by LayerManager.bundle)
 *
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04A-04-PLAN.md Task 2
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04A-UI-SPEC.md §z=0.5 Idle Content Infill
 */
import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';
import { describe, expect, it, vi } from 'vitest';
import { IdleInfillLayer } from '../idle-infill-layer.js';

function makeMockBridge() {
  return {
    textContainerUpgrade: vi.fn().mockResolvedValue(true),
  } as unknown as EvenAppBridge & { textContainerUpgrade: ReturnType<typeof vi.fn> };
}

describe('IdleInfillLayer — identity + capture contract', () => {
  it('IIL-1: id === "idle-infill"', () => {
    const layer = new IdleInfillLayer(makeMockBridge(), 'raster');
    expect(layer.id).toBe('idle-infill');
  });

  it('IIL-2: getCaptureContainer is undefined (render-only)', () => {
    const layer = new IdleInfillLayer(makeMockBridge(), 'raster');
    expect(
      (layer as unknown as { getCaptureContainer?: unknown }).getCaptureContainer,
    ).toBeUndefined();
  });
});

describe('IdleInfillLayer — draw modes', () => {
  it('IIL-3: raster mode → 3 textContainerUpgrade calls (combat-log + label + stats)', async () => {
    const bridge = makeMockBridge();
    const layer = new IdleInfillLayer(bridge, 'raster');
    await layer.draw();
    expect(bridge.textContainerUpgrade).toHaveBeenCalledTimes(3);
    const names = bridge.textContainerUpgrade.mock.calls.map(
      (call) => (call[0] as { containerName: string }).containerName,
    );
    expect(names).toEqual(['z05-combat-log', 'z05-label', 'z05-stats']);
  });

  it('IIL-4: glyph mode → 2 textContainerUpgrade calls (combat-log omitted)', async () => {
    const bridge = makeMockBridge();
    const layer = new IdleInfillLayer(bridge, 'glyph');
    await layer.draw();
    expect(bridge.textContainerUpgrade).toHaveBeenCalledTimes(2);
    const names = bridge.textContainerUpgrade.mock.calls.map(
      (call) => (call[0] as { containerName: string }).containerName,
    );
    expect(names).toEqual(['z05-label', 'z05-stats']);
  });

  it('IIL-4b: setMode("glyph") flips an existing layer mid-lifecycle', async () => {
    const bridge = makeMockBridge();
    const layer = new IdleInfillLayer(bridge, 'raster');
    layer.setMode('glyph');
    await layer.draw();
    expect(bridge.textContainerUpgrade).toHaveBeenCalledTimes(2);
  });
});

describe('IdleInfillLayer — setStats / stats strip formatting', () => {
  it('IIL-5: setStats() composes the stats strip per UI-SPEC §Stats strip format', async () => {
    const bridge = makeMockBridge();
    const layer = new IdleInfillLayer(bridge, 'raster');
    layer.setStats({
      mode: 'raster',
      res: '400×200',
      pipeline: 'FS+RLE+delta',
      bleKbps: 240,
      fpsObserved: 8,
    });
    await layer.draw();
    const statsCall = bridge.textContainerUpgrade.mock.calls.find(
      (c) => (c[0] as { containerName: string }).containerName === 'z05-stats',
    );
    expect(statsCall).toBeDefined();
    const content = (statsCall?.[0] as { content: string }).content;
    expect(content).toContain('raster 400×200 · FS+RLE+delta · BLE 240k · 8 fps · [Q] Quick');
  });

  it('IIL-5b: missing stats fields render as `—` em-dash (CONTEXT.md §Area 3 fallback)', async () => {
    const bridge = makeMockBridge();
    const layer = new IdleInfillLayer(bridge, 'raster');
    await layer.draw();
    const statsCall = bridge.textContainerUpgrade.mock.calls.find(
      (c) => (c[0] as { containerName: string }).containerName === 'z05-stats',
    );
    const content = (statsCall?.[0] as { content: string }).content;
    expect(content).toContain('raster — · — · BLE — · — fps · [Q] Quick');
  });
});

describe('IdleInfillLayer — destroy', () => {
  it('IIL-6: destroy() is a no-op (idempotent; safe to call twice)', () => {
    const layer = new IdleInfillLayer(makeMockBridge(), 'raster');
    expect(() => layer.destroy()).not.toThrow();
    expect(() => layer.destroy()).not.toThrow();
  });
});
