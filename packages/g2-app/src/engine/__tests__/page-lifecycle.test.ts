/**
 * Unit tests for page-lifecycle (Phase 4a Plan 02 Task 2).
 *
 * Covers (per 04A-02-PLAN.md `<behavior>` block, PL-1 .. PL-5):
 *   - createBootPage builds the 4-image + 7-text container schema
 *     (containerTotalNum:11) per UI-SPEC §Container Budget Allocation
 *   - Exactly one isEventCapture=1 text container named `map-capture`
 *   - Image containers are named map-tile-0..3 with 200×100 dims in a 2×2 grid
 *   - Non-success createStartUpPageContainer result → throw including the value
 *   - rebuildToOverlay forwards exactly one bridge.rebuildPageContainer call
 *
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04A-PATTERNS.md §page-lifecycle.ts
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04A-UI-SPEC.md §Container Budget Allocation
 */
import {
  type EvenAppBridge,
  ImageContainerProperty,
  StartUpPageCreateResult,
  TextContainerProperty,
} from '@evenrealities/even_hub_sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createBootPage, rebuildToOverlay } from '../page-lifecycle.js';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeMockBridge() {
  return {
    createStartUpPageContainer: vi.fn().mockResolvedValue(StartUpPageCreateResult.success),
    rebuildPageContainer: vi.fn().mockResolvedValue(true),
    textContainerUpgrade: vi.fn().mockResolvedValue(true),
    updateImageRawData: vi.fn().mockResolvedValue('success'),
    shutDownPageContainer: vi.fn().mockResolvedValue(true),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// createBootPage
// ─────────────────────────────────────────────────────────────────────────────

describe('page-lifecycle.createBootPage', () => {
  let bridge: ReturnType<typeof makeMockBridge>;
  beforeEach(() => {
    bridge = makeMockBridge();
  });

  it('PL-1: calls bridge.createStartUpPageContainer with 11 containers (4 image + 7 text)', async () => {
    await createBootPage(bridge as unknown as EvenAppBridge);
    expect(bridge.createStartUpPageContainer).toHaveBeenCalledTimes(1);
    const arg = bridge.createStartUpPageContainer.mock.calls[0]?.[0];
    expect(arg).toBeDefined();
    expect(arg?.containerTotalNum).toBe(11);
    expect(arg?.imageObject).toBeInstanceOf(Array);
    expect(arg?.textObject).toBeInstanceOf(Array);
    expect(arg?.imageObject?.length).toBe(4);
    expect(arg?.textObject?.length).toBe(7);
  });

  it('PL-2: exactly one textObject has isEventCapture=1 and is named map-capture', async () => {
    await createBootPage(bridge as unknown as EvenAppBridge);
    const arg = bridge.createStartUpPageContainer.mock.calls[0]?.[0];
    const captures = (arg?.textObject ?? []).filter(
      (t: TextContainerProperty) => t.isEventCapture === 1,
    );
    expect(captures).toHaveLength(1);
    expect(captures[0]?.containerName).toBe('map-capture');
  });

  it('PL-3: image containers are map-tile-0..3 with 200x100 dims in a 2x2 grid', async () => {
    await createBootPage(bridge as unknown as EvenAppBridge);
    const arg = bridge.createStartUpPageContainer.mock.calls[0]?.[0];
    const images = (arg?.imageObject ?? []) as ImageContainerProperty[];
    expect(images).toHaveLength(4);
    for (let i = 0; i < 4; i++) {
      const img = images[i];
      expect(img?.containerName).toBe(`map-tile-${i}`);
      expect(img?.width).toBe(200);
      expect(img?.height).toBe(100);
    }
    // 2x2 grid positions: (0,0) (200,0) (0,100) (200,100)
    const positions = images.map((i) => [i?.xPosition, i?.yPosition]);
    expect(positions).toEqual([
      [0, 0],
      [200, 0],
      [0, 100],
      [200, 100],
    ]);
  });

  it('PL-3b: every container carries the registry numeric containerID (images i, text 4-10)', async () => {
    await createBootPage(bridge as unknown as EvenAppBridge);
    const arg = bridge.createStartUpPageContainer.mock.calls[0]?.[0];
    const images = (arg?.imageObject ?? []) as ImageContainerProperty[];
    const texts = (arg?.textObject ?? []) as TextContainerProperty[];
    // image map-tile-i → containerID i
    images.forEach((img, i) => {
      expect(img.containerID).toBe(i);
    });
    // text ids 4-10 in declaration order header..z05-stats
    const expectedTextIds: Array<[string, number]> = [
      ['header', 4],
      ['footer', 5],
      ['status-hud', 6],
      ['map-capture', 7],
      ['z05-combat-log', 8],
      ['z05-label', 9],
      ['z05-stats', 10],
    ];
    expectedTextIds.forEach(([name, id], i) => {
      expect(texts[i]?.containerName).toBe(name);
      expect(texts[i]?.containerID).toBe(id);
    });
  });

  it('PL-3c: every text container has non-zero width AND height (geometry present)', async () => {
    await createBootPage(bridge as unknown as EvenAppBridge);
    const arg = bridge.createStartUpPageContainer.mock.calls[0]?.[0];
    const texts = (arg?.textObject ?? []) as TextContainerProperty[];
    expect(texts).toHaveLength(7);
    for (const t of texts) {
      expect(t.width).toBeGreaterThan(0);
      expect(t.height).toBeGreaterThan(0);
    }
  });

  it('PL-4: throws Error including the non-success result value', async () => {
    bridge.createStartUpPageContainer.mockResolvedValue(StartUpPageCreateResult.oversize);
    await expect(createBootPage(bridge as unknown as EvenAppBridge)).rejects.toThrow(
      new RegExp(String(StartUpPageCreateResult.oversize)),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// rebuildToOverlay
// ─────────────────────────────────────────────────────────────────────────────

describe('page-lifecycle.rebuildToOverlay', () => {
  it('PL-5: forwards exactly one bridge.rebuildPageContainer call with the supplied def', async () => {
    const bridge = makeMockBridge();
    const def = {
      containerTotalNum: 8,
      textObject: [
        new TextContainerProperty({ containerName: 'overlay-capture', isEventCapture: 1 }),
      ],
      imageObject: [
        new ImageContainerProperty({
          containerName: 'overlay-tile',
          width: 200,
          height: 100,
          xPosition: 0,
          yPosition: 0,
        }),
      ],
    };
    await rebuildToOverlay(bridge as unknown as EvenAppBridge, def);
    expect(bridge.rebuildPageContainer).toHaveBeenCalledTimes(1);
    const arg = bridge.rebuildPageContainer.mock.calls[0]?.[0];
    expect(arg?.containerTotalNum).toBe(8);
    expect(arg?.textObject?.length).toBe(1);
    expect(arg?.imageObject?.length).toBe(1);
  });
});
