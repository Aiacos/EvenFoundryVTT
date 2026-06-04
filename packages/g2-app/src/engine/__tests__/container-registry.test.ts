/**
 * Unit tests for the shared container registry (Quick Task 260604-qm0 Task 1).
 *
 * The registry is the SINGLE source of truth mapping container name →
 * { id, geometry, isEventCapture } for all 11 base containers. It is consumed
 * by BOTH page schemas (page-lifecycle.buildBootPageSchema) AND
 * LayerManager._flushPage AND every textContainerUpgrade / updateImageRawData
 * call site (which resolve the numeric containerID the EvenHub host requires).
 *
 * Covers REG-1 .. REG-6 from the plan `<behavior>` block:
 *   - REG-1: all 11 base containers present (4 image ids 0-3, 7 text ids 4-10)
 *   - REG-2: every id 0..10 unique, contiguous, images precede text
 *   - REG-3: every base text container has non-zero width AND height
 *   - REG-4: exactly one base text container isEventCapture=1 (map-capture id 7)
 *   - REG-5: resolveContainerId returns the validated id for known base names
 *   - REG-6: resolveContainerId returns undefined for unknown/overlay names
 *
 * @see .planning/debug/glasses-render-blank-containerid.md (root cause + probe)
 * @see .planning/quick/260604-qm0-address-g2-containers-by-numeric-contain/260604-qm0-PLAN.md
 */
import { describe, expect, it } from 'vitest';
import {
  BASE_CONTAINER_TOTAL,
  buildBaseImageContainers,
  buildBaseTextContainers,
  resolveContainerId,
} from '../container-registry.js';

describe('container-registry', () => {
  it('REG-1: exposes all 11 base containers (4 image ids 0-3, 7 text ids 4-10)', () => {
    const images = buildBaseImageContainers();
    const texts = buildBaseTextContainers();
    expect(images).toHaveLength(4);
    expect(texts).toHaveLength(7);
    expect(BASE_CONTAINER_TOTAL).toBe(11);

    // Image ids 0-3 in declaration order, named map-tile-0..3.
    images.forEach((img, i) => {
      expect(img.containerID).toBe(i);
      expect(img.containerName).toBe(`map-tile-${i}`);
    });

    // Text ids 4-10 in the validated order.
    const expectedText: Array<[string, number]> = [
      ['header', 4],
      ['footer', 5],
      ['status-hud', 6],
      ['map-capture', 7],
      ['z05-combat-log', 8],
      ['z05-label', 9],
      ['z05-stats', 10],
    ];
    expectedText.forEach(([name, id], i) => {
      expect(texts[i]?.containerName).toBe(name);
      expect(texts[i]?.containerID).toBe(id);
    });
  });

  it('REG-2: every id 0..10 is unique, contiguous, and images precede text', () => {
    const ids = [
      ...buildBaseImageContainers().map((c) => c.containerID),
      ...buildBaseTextContainers().map((c) => c.containerID),
    ];
    // Unique
    expect(new Set(ids).size).toBe(ids.length);
    // Contiguous 0..10
    expect(ids).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('REG-3: every base text container has non-zero width AND height (geometry present)', () => {
    for (const t of buildBaseTextContainers()) {
      expect(t.width).toBeGreaterThan(0);
      expect(t.height).toBeGreaterThan(0);
      expect(t.xPosition).toBeGreaterThanOrEqual(0);
      expect(t.yPosition).toBeGreaterThanOrEqual(0);
    }
  });

  it('REG-4: exactly one base text container has isEventCapture=1 and it is map-capture (id 7)', () => {
    const captures = buildBaseTextContainers().filter((t) => t.isEventCapture === 1);
    expect(captures).toHaveLength(1);
    expect(captures[0]?.containerName).toBe('map-capture');
    expect(captures[0]?.containerID).toBe(7);
  });

  it('REG-5: resolveContainerId returns the validated id for known base names', () => {
    expect(resolveContainerId('header')).toBe(4);
    expect(resolveContainerId('status-hud')).toBe(6);
    expect(resolveContainerId('map-tile-2')).toBe(2);
    expect(resolveContainerId('z05-stats')).toBe(10);
    expect(resolveContainerId('map-capture')).toBe(7);
  });

  it('REG-6: resolveContainerId returns undefined for unknown/overlay names', () => {
    expect(resolveContainerId('overlay-block')).toBeUndefined();
    expect(resolveContainerId('overlay-capture')).toBeUndefined();
    expect(resolveContainerId('toast-block')).toBeUndefined();
    expect(resolveContainerId('boot-error-block')).toBeUndefined();
    expect(resolveContainerId('does-not-exist')).toBeUndefined();
  });
});
