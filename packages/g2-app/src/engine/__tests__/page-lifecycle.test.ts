/**
 * Unit tests for page-lifecycle (Phase 4a Plan 02 Task 2).
 *
 * Covers (per 04A-02-PLAN.md `<behavior>` block, PL-1 .. PL-5):
 *   - createBootPage builds the default status-view schema — 3 text containers
 *     (header, footer, status-hud), 0 image, containerTotalNum:3
 *     (quick-260605-j0t-04: map-capture / z05-* / image tiles EXCLUDED from
 *     the default boot page to avoid the full-rect overlap that caused the G2
 *     host to return non-success from createStartUpPageContainer)
 *   - No isEventCapture=1 container in the default boot schema
 *   - No image containers in the default boot schema
 *   - All 3 text containers fit within 576×288, no overlaps, no gaps at seams
 *   - Non-success createStartUpPageContainer result → throw including the value
 *   - rebuildToOverlay forwards exactly one bridge.rebuildPageContainer call
 *
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04A-PATTERNS.md §page-lifecycle.ts
 * @see packages/g2-app/src/engine/container-registry.ts (CONTAINER_REGISTRY, buildStatusViewTextContainers)
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

  it('PL-1: calls bridge.createStartUpPageContainer with 3 containers (0 image + 3 text)', async () => {
    await createBootPage(bridge as unknown as EvenAppBridge);
    expect(bridge.createStartUpPageContainer).toHaveBeenCalledTimes(1);
    const arg = bridge.createStartUpPageContainer.mock.calls[0]?.[0];
    expect(arg).toBeDefined();
    // Default status-view: 3 text, 0 image (map-capture/z05-*/tiles deferred to Phase 20)
    expect(arg?.containerTotalNum).toBe(3);
    expect(arg?.imageObject).toBeInstanceOf(Array);
    expect(arg?.textObject).toBeInstanceOf(Array);
    expect(arg?.imageObject?.length).toBe(0);
    expect(arg?.textObject?.length).toBe(3);
  });

  it('PL-2: default boot schema has NO isEventCapture=1 containers (map-capture excluded)', async () => {
    await createBootPage(bridge as unknown as EvenAppBridge);
    const arg = bridge.createStartUpPageContainer.mock.calls[0]?.[0];
    // map-capture (id7, isEventCapture=1) is NOT in the default boot schema —
    // it overlaps status-hud exactly and caused the G2 host to reject the page.
    const captures = (arg?.textObject ?? []).filter(
      (t: TextContainerProperty) => t.isEventCapture === 1,
    );
    expect(captures).toHaveLength(0);
  });

  it('PL-3: default boot schema has 0 image containers (map tiles deferred to Phase 20)', async () => {
    await createBootPage(bridge as unknown as EvenAppBridge);
    const arg = bridge.createStartUpPageContainer.mock.calls[0]?.[0];
    const images = (arg?.imageObject ?? []) as ImageContainerProperty[];
    // Image map-tiles are part of the map-mode page (Phase 20), not the default boot page.
    expect(images).toHaveLength(0);
  });

  it('PL-3b: default boot text containers are header(4), footer(5), status-hud(6)', async () => {
    await createBootPage(bridge as unknown as EvenAppBridge);
    const arg = bridge.createStartUpPageContainer.mock.calls[0]?.[0];
    const texts = (arg?.textObject ?? []) as TextContainerProperty[];
    // Exactly the 3 status-view containers in id order
    const expectedTextIds: Array<[string, number]> = [
      ['header', 4],
      ['footer', 5],
      ['status-hud', 6],
    ];
    expect(texts).toHaveLength(3);
    expectedTextIds.forEach(([name, id], i) => {
      expect(texts[i]?.containerName).toBe(name);
      expect(texts[i]?.containerID).toBe(id);
    });
  });

  it('PL-3c: every text container has non-zero width AND height (geometry present)', async () => {
    await createBootPage(bridge as unknown as EvenAppBridge);
    const arg = bridge.createStartUpPageContainer.mock.calls[0]?.[0];
    const texts = (arg?.textObject ?? []) as TextContainerProperty[];
    expect(texts).toHaveLength(3);
    for (const t of texts) {
      expect(t.width).toBeGreaterThan(0);
      expect(t.height).toBeGreaterThan(0);
    }
  });

  it('PL-3d: default boot containers fit within 576×288, no two containers overlap', async () => {
    await createBootPage(bridge as unknown as EvenAppBridge);
    const arg = bridge.createStartUpPageContainer.mock.calls[0]?.[0];
    const texts = (arg?.textObject ?? []) as TextContainerProperty[];
    // All containers must fit within the 576×288 G2 display
    for (const t of texts) {
      expect(t.xPosition).toBeGreaterThanOrEqual(0);
      expect(t.yPosition).toBeGreaterThanOrEqual(0);
      expect((t.xPosition ?? 0) + (t.width ?? 0)).toBeLessThanOrEqual(576);
      expect((t.yPosition ?? 0) + (t.height ?? 0)).toBeLessThanOrEqual(288);
    }
    // No two containers overlap (for each pair, they must not intersect).
    // Build typed rects from the container list, then check every pair.
    const rects = texts.map((t) => ({
      name: t.containerName ?? '',
      x1: t.xPosition ?? 0,
      y1: t.yPosition ?? 0,
      x2: (t.xPosition ?? 0) + (t.width ?? 0),
      y2: (t.yPosition ?? 0) + (t.height ?? 0),
    }));
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i] ?? { name: '', x1: 0, y1: 0, x2: 0, y2: 0 };
        const b = rects[j] ?? { name: '', x1: 0, y1: 0, x2: 0, y2: 0 };
        const overlapX = a.x1 < b.x2 && a.x2 > b.x1;
        const overlapY = a.y1 < b.y2 && a.y2 > b.y1;
        expect(overlapX && overlapY, `containers ${a.name} and ${b.name} overlap`).toBe(false);
      }
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
