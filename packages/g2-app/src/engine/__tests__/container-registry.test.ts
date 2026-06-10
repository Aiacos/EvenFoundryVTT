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
  BOOT_CONTAINER_TOTAL,
  buildBaseImageContainers,
  buildBaseTextContainers,
  buildHudRasterPageSchema,
  buildStatusViewTextContainers,
  CONTAINER_REGISTRY,
  HUD_RASTER_CONTAINER_TOTAL,
  resolveContainerId,
  resolveContainerIdField,
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

  it('REG-7: resolveContainerIdField yields a spreadable { containerID } for base names', () => {
    expect(resolveContainerIdField('header')).toEqual({ containerID: 4 });
    expect(resolveContainerIdField('map-tile-0')).toEqual({ containerID: 0 });
    expect(resolveContainerIdField('map-capture')).toEqual({ containerID: 7 });
  });

  it('REG-8: resolveContainerIdField yields an EMPTY object for overlay/unknown names (field omitted)', () => {
    expect(resolveContainerIdField('overlay-block')).toEqual({});
    expect(resolveContainerIdField('toast-block')).toEqual({});
    expect(resolveContainerIdField('boot-error-block')).toEqual({});
    // No own `containerID` key at all (so spreading omits the field entirely
    // under exactOptionalPropertyTypes).
    expect(Object.hasOwn(resolveContainerIdField('overlay-block'), 'containerID')).toBe(false);
  });
});

// ── buildHudRasterPageSchema (ADR-0013 Amendment 1 — RAST-02) ─────────────────

describe('buildHudRasterPageSchema', () => {
  it('returns containerTotalNum === 6 (HUD_RASTER_CONTAINER_TOTAL — 4 image + hud-capture + hud-status)', () => {
    // Updated for Task 3 (260610-d42): hud-status added → total bumped from 5 to 6.
    const schema = buildHudRasterPageSchema();
    expect(schema.containerTotalNum).toBe(6);
    expect(HUD_RASTER_CONTAINER_TOTAL).toBe(6);
  });

  it('imageObject has exactly 4 entries named hud-tile-0..3 at 200×100', () => {
    const { imageObject } = buildHudRasterPageSchema();
    expect(imageObject).toHaveLength(4);

    const expectedNames = ['hud-tile-0', 'hud-tile-1', 'hud-tile-2', 'hud-tile-3'];
    expectedNames.forEach((name, i) => {
      const tile = imageObject[i];
      expect(tile?.containerName).toBe(name);
      expect(tile?.containerID).toBe(i);
      expect(tile?.width).toBe(200);
      expect(tile?.height).toBe(100);
    });
  });

  it('imageObject tile offsets are (0,0)/(200,0)/(0,100)/(200,100) (2×2 layout)', () => {
    const { imageObject } = buildHudRasterPageSchema();
    const positions = imageObject.map((t) => ({ x: t.xPosition, y: t.yPosition }));
    expect(positions).toEqual([
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 0, y: 100 },
      { x: 200, y: 100 },
    ]);
  });

  it('textObject first entry is hud-capture full-screen with isEventCapture=1', () => {
    // Updated for Task 3 (260610-d42): textObject now has 2 entries — hud-capture
    // and hud-status. This test verifies the first entry (hud-capture) unchanged.
    const { textObject } = buildHudRasterPageSchema();
    const capture = textObject[0];
    expect(capture?.containerName).toBe('hud-capture');
    expect(capture?.containerID).toBe(4);
    expect(capture?.isEventCapture).toBe(1);
    expect(capture?.width).toBe(576);
    expect(capture?.height).toBe(288);
    expect(capture?.xPosition).toBe(0);
    expect(capture?.yPosition).toBe(0);
  });

  it('exactly ONE container in the whole schema has isEventCapture=1', () => {
    const { imageObject, textObject } = buildHudRasterPageSchema();
    // ImageContainerProperty does not expose isEventCapture — only check text containers.
    // imageObject tiles all have isEventCapture=0 by design (no image tile can be a capture target).
    const imageCaptureCount = imageObject.filter(
      (c) => (c as { isEventCapture?: number }).isEventCapture === 1,
    ).length;
    const textCaptureCount = textObject.filter((c) => c.isEventCapture === 1).length;
    expect(imageCaptureCount + textCaptureCount).toBe(1);
    // The one capture must be in textObject only.
    expect(textCaptureCount).toBe(1);
    expect(imageCaptureCount).toBe(0);
  });

  it('schema contains NO map-capture / map-tile-* / z05-* / header / footer / status-hud entries', () => {
    const { imageObject, textObject } = buildHudRasterPageSchema();
    const allNames = [...imageObject, ...textObject].map((c) => c.containerName);
    const forbidden = [
      'map-capture',
      'map-tile-0',
      'map-tile-1',
      'map-tile-2',
      'map-tile-3',
      'z05-combat-log',
      'z05-label',
      'z05-stats',
      'header',
      'footer',
      'status-hud',
    ];
    for (const name of forbidden) {
      expect(allNames, `schema must not contain "${name}"`).not.toContain(name);
    }
  });

  it('BOOT_CONTAINER_TOTAL is still 3 (glyph path unchanged)', () => {
    // Regression guard: adding HUD raster entries to CONTAINER_REGISTRY must not
    // change the default boot schema count (glyph path is byte-identical).
    expect(BOOT_CONTAINER_TOTAL).toBe(3);
  });

  // ── REG-HUDSTATUS-1: hud-status native text container (Task 3 — 260610-d42) ─

  it('REG-HUDSTATUS-1: containerTotalNum === 6 (HUD_RASTER_CONTAINER_TOTAL bumped to 6)', () => {
    const schema = buildHudRasterPageSchema();
    expect(schema.containerTotalNum).toBe(6);
    expect(HUD_RASTER_CONTAINER_TOTAL).toBe(6);
  });

  it('REG-HUDSTATUS-1: textObject has exactly 2 entries — hud-capture (id 4) and hud-status (id 5)', () => {
    const { textObject } = buildHudRasterPageSchema();
    expect(textObject).toHaveLength(2);

    // First entry remains hud-capture (id 4, isEventCapture=1, full-screen).
    const capture = textObject[0];
    expect(capture?.containerName).toBe('hud-capture');
    expect(capture?.containerID).toBe(4);
    expect(capture?.isEventCapture).toBe(1);
    expect(capture?.width).toBe(576);
    expect(capture?.height).toBe(288);

    // Second entry is hud-status (id 5, isEventCapture=0, top 27px row).
    const hudStatus = textObject[1];
    expect(hudStatus?.containerName).toBe('hud-status');
    expect(hudStatus?.containerID).toBe(5);
    expect(hudStatus?.isEventCapture).toBe(0);
    expect(hudStatus?.width).toBe(576);
    expect(hudStatus?.height).toBe(27);
    expect(hudStatus?.xPosition).toBe(0);
    expect(hudStatus?.yPosition).toBe(0);
  });

  it('REG-CAPTURE-INV: exactly ONE container in the whole schema has isEventCapture=1 (with 2 text containers)', () => {
    // Same invariant as the existing test — verified again with hud-status present.
    const { imageObject, textObject } = buildHudRasterPageSchema();
    const imageCaptureCount = imageObject.filter(
      (c) => (c as { isEventCapture?: number }).isEventCapture === 1,
    ).length;
    const textCaptureCount = textObject.filter((c) => c.isEventCapture === 1).length;
    expect(imageCaptureCount + textCaptureCount).toBe(1);
    expect(textCaptureCount).toBe(1);
    expect(imageCaptureCount).toBe(0);
    // Specifically: hud-status must NOT be a capture container.
    const hudStatus = textObject.find((c) => c.containerName === 'hud-status');
    expect(hudStatus?.isEventCapture).toBe(0);
  });

  it('REG-HUDSTATUS-1: resolveContainerId resolves hud-status to id 5', () => {
    expect(resolveContainerId('hud-status')).toBe(5);
  });
});

// ── G2 spec compliance — capture content (Quick Task 260610-nzl) ──────────────
//
// Validates:
//   SPEC-CAPTURE-1:       hud-capture in buildHudRasterPageSchema carries content: ' '
//   SPEC-GLYPH-CAPTURE-1: buildStatusViewTextContainers has exactly one isEventCapture=1
//                          entry (status-hud, id 6) with content: ' '
//   SPEC-GLYPH-CAPTURE-2: buildStatusViewTextContainers still returns 3 entries total
//   SPEC-REGISTRY-UNCHANGED: CONTAINER_REGISTRY['status-hud'].isEventCapture === 0
//                             (builder overrides per-schema; registry is geometry-only)

describe('G2 spec compliance — capture content', () => {
  it('SPEC-CAPTURE-1: buildHudRasterPageSchema hud-capture has content single-space', () => {
    const { textObject } = buildHudRasterPageSchema();
    const captureContainer = textObject[0];
    expect(captureContainer?.containerName).toBe('hud-capture');
    expect(captureContainer?.content).toBe(' ');
  });

  it('SPEC-GLYPH-CAPTURE-1: buildStatusViewTextContainers has exactly one isEventCapture=1 (status-hud, id 6) with content single-space', () => {
    const containers = buildStatusViewTextContainers();
    const captures = containers.filter((c) => c.isEventCapture === 1);
    expect(captures).toHaveLength(1);
    expect(captures[0]?.containerName).toBe('status-hud');
    expect(captures[0]?.containerID).toBe(6);
    expect(captures[0]?.content).toBe(' ');
  });

  it('SPEC-GLYPH-CAPTURE-2: buildStatusViewTextContainers returns 3 entries total', () => {
    const containers = buildStatusViewTextContainers();
    expect(containers).toHaveLength(3);
  });

  it('SPEC-REGISTRY-UNCHANGED: CONTAINER_REGISTRY status-hud isEventCapture is still 0 (builder overrides per-schema, registry is geometry-only)', () => {
    expect(CONTAINER_REGISTRY['status-hud']?.isEventCapture).toBe(0);
  });
});
