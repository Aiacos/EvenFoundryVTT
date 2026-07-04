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
  buildHybridPageSchema,
  buildShowcasePageSchema,
  buildStatusViewTextContainers,
  CONTAINER_REGISTRY,
  HUD_RASTER_CONTAINER_TOTAL,
  HYBRID_CONTAINER_TOTAL,
  resolveContainerId,
  resolveContainerIdField,
  SHOWCASE_CONTAINER_TOTAL,
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
  it('returns containerTotalNum === 5 (HUD_RASTER_CONTAINER_TOTAL — 4 image + hud-capture)', () => {
    // Layout B (2026-06-10): full-screen tiles, hud-status removed → back to 5.
    const schema = buildHudRasterPageSchema();
    expect(schema.containerTotalNum).toBe(5);
    expect(HUD_RASTER_CONTAINER_TOTAL).toBe(5);
  });

  it('imageObject has exactly 4 entries named hud-tile-0..3 at 288×144', () => {
    const { imageObject } = buildHudRasterPageSchema();
    expect(imageObject).toHaveLength(4);

    const expectedNames = ['hud-tile-0', 'hud-tile-1', 'hud-tile-2', 'hud-tile-3'];
    expectedNames.forEach((name, i) => {
      const tile = imageObject[i];
      expect(tile?.containerName).toBe(name);
      expect(tile?.containerID).toBe(i);
      expect(tile?.width).toBe(288);
      expect(tile?.height).toBe(144);
    });
  });

  it('imageObject tile offsets are (0,0)/(288,0)/(0,144)/(288,144) (2×2 full-screen layout)', () => {
    const { imageObject } = buildHudRasterPageSchema();
    const positions = imageObject.map((t) => ({ x: t.xPosition, y: t.yPosition }));
    expect(positions).toEqual([
      { x: 0, y: 0 },
      { x: 288, y: 0 },
      { x: 0, y: 144 },
      { x: 288, y: 144 },
    ]);
  });

  it('textObject first entry is hud-capture full-screen with isEventCapture=1', () => {
    // Layout B: textObject has exactly 1 entry — the full-screen hud-capture.
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

  // ── Layout B (2026-06-10): hud-status REMOVED — tiles are full screen ────────

  it('LAYOUT-B-1: textObject has exactly 1 entry (hud-capture only)', () => {
    const { textObject } = buildHudRasterPageSchema();
    expect(textObject).toHaveLength(1);
    expect(textObject[0]?.containerName).toBe('hud-capture');
  });

  it('REG-CAPTURE-INV: exactly ONE container in the whole schema has isEventCapture=1', () => {
    const { imageObject, textObject } = buildHudRasterPageSchema();
    const imageCaptureCount = imageObject.filter(
      (c) => (c as { isEventCapture?: number }).isEventCapture === 1,
    ).length;
    const textCaptureCount = textObject.filter((c) => c.isEventCapture === 1).length;
    expect(imageCaptureCount + textCaptureCount).toBe(1);
    expect(textCaptureCount).toBe(1);
    expect(imageCaptureCount).toBe(0);
  });

  it('LAYOUT-B-2: hud-status is no longer a registry name (host paints images over text)', () => {
    expect(resolveContainerId('hud-status')).toBeUndefined();
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

// ── buildHybridPageSchema (Feature 002 — native chrome + raster map region) ────
//
// The hybrid page is the new default render substrate: 4 raster map image tiles
// (left 400×200) + native text chrome (header/footer/status-hud) + an invisible
// gesture-capture container. The status HUD + overlays update via cheap
// textContainerUpgrade; only the map is rasterised.

describe('buildHybridPageSchema', () => {
  type Rect = {
    xPosition?: number;
    yPosition?: number;
    width?: number;
    height?: number;
  };
  /** Normalize an SDK property (optional geometry fields) to a concrete rect. */
  const rect = (c: Rect) => ({
    x: c.xPosition ?? 0,
    y: c.yPosition ?? 0,
    w: c.width ?? 0,
    h: c.height ?? 0,
  });
  /** Half-open rect overlap test ([x,x+w) × [y,y+h)). Touching edges do NOT overlap. */
  function rectsOverlap(ra: Rect, rb: Rect): boolean {
    const a = rect(ra);
    const b = rect(rb);
    return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  }

  it('HYB-1: containerTotalNum === 8 (4 image + 4 text)', () => {
    const schema = buildHybridPageSchema();
    expect(schema.containerTotalNum).toBe(8);
    expect(HYBRID_CONTAINER_TOTAL).toBe(8);
    expect(schema.imageObject).toHaveLength(4);
    expect(schema.textObject).toHaveLength(4);
  });

  it('HYB-2: image tiles are hybrid-map-tile-0..3, ids 0-3, 200×100, left 2×2 (400×200)', () => {
    const { imageObject } = buildHybridPageSchema();
    const expected = [
      { name: 'hybrid-map-tile-0', x: 0, y: 27 },
      { name: 'hybrid-map-tile-1', x: 200, y: 27 },
      { name: 'hybrid-map-tile-2', x: 0, y: 127 },
      { name: 'hybrid-map-tile-3', x: 200, y: 127 },
    ];
    expected.forEach(({ name, x, y }, i) => {
      const tile = imageObject[i];
      expect(tile?.containerName).toBe(name);
      expect(tile?.containerID).toBe(i);
      expect(tile?.width).toBe(200);
      expect(tile?.height).toBe(100);
      expect(tile?.xPosition).toBe(x);
      expect(tile?.yPosition).toBe(y);
    });
  });

  it('HYB-3: text containers are header(4), footer(5), hybrid-status-hud(6), hybrid-map-capture(7)', () => {
    const { textObject } = buildHybridPageSchema();
    const expected: Array<[string, number]> = [
      ['header', 4],
      ['footer', 5],
      ['hybrid-status-hud', 6],
      ['hybrid-map-capture', 7],
    ];
    expected.forEach(([name, id], i) => {
      expect(textObject[i]?.containerName).toBe(name);
      expect(textObject[i]?.containerID).toBe(id);
    });
  });

  it('HYB-4: exactly ONE capture (hybrid-map-capture) with content single-space', () => {
    const { imageObject, textObject } = buildHybridPageSchema();
    const imageCaptureCount = imageObject.filter(
      (c) => (c as { isEventCapture?: number }).isEventCapture === 1,
    ).length;
    const captures = textObject.filter((c) => c.isEventCapture === 1);
    expect(imageCaptureCount).toBe(0);
    expect(captures).toHaveLength(1);
    expect(captures[0]?.containerName).toBe('hybrid-map-capture');
    expect(captures[0]?.containerID).toBe(7);
    expect(captures[0]?.content).toBe(' ');
  });

  it('HYB-5: no VISIBLE text container rect overlaps any image tile (host paints images over text)', () => {
    const { imageObject, textObject } = buildHybridPageSchema();
    // hybrid-map-capture is intentionally UNDER the tiles (invisible gesture capture).
    const visibleText = textObject.filter((t) => t.containerName !== 'hybrid-map-capture');
    for (const text of visibleText) {
      for (const tile of imageObject) {
        expect(
          rectsOverlap(text, tile),
          `"${text.containerName}" overlaps image tile "${tile.containerName}" — text would be hidden`,
        ).toBe(false);
      }
    }
  });

  it('HYB-6: all rects fit within the 576×288 physical screen', () => {
    const { imageObject, textObject } = buildHybridPageSchema();
    for (const c of [...imageObject, ...textObject]) {
      const r = rect(c);
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(576);
      expect(r.y + r.h).toBeLessThanOrEqual(288);
    }
  });

  it('HYB-7: image budget ≤4, text budget ≤8 (G2 hardware limit)', () => {
    const { imageObject, textObject } = buildHybridPageSchema();
    expect(imageObject.length).toBeLessThanOrEqual(4);
    expect(textObject.length).toBeLessThanOrEqual(8);
  });

  it('HYB-8: hybrid entries do NOT leak into the base/glyph builders (default boot unchanged)', () => {
    // Regression guard: the new hybrid-* registry entries must not appear in the
    // base-page or status-view schemas (those filter by BASE_NAMES / STATUS_VIEW_NAMES).
    const baseNames = [
      ...buildBaseImageContainers().map((c) => c.containerName),
      ...buildBaseTextContainers().map((c) => c.containerName),
    ];
    const statusNames = buildStatusViewTextContainers().map((c) => c.containerName);
    for (const n of baseNames) expect((n ?? '').startsWith('hybrid-')).toBe(false);
    for (const n of statusNames) expect((n ?? '').startsWith('hybrid-')).toBe(false);
    expect(BASE_CONTAINER_TOTAL).toBe(11);
    expect(BOOT_CONTAINER_TOTAL).toBe(3);
  });
});

// ── buildShowcasePageSchema (PRODUCTION default — whole HUD as one 400×200 raster) ─
//
// The showcase page is the PRODUCTION default substrate: 4 raster HUD image tiles
// (200×100 each, 2×2 = 400×200 CENTRED at (88,44)) + 1 invisible full-region
// gesture-capture text container (showcase-capture, id 4).
describe('buildShowcasePageSchema', () => {
  const rect = (c: {
    xPosition?: number;
    yPosition?: number;
    width?: number;
    height?: number;
  }) => ({
    x: c.xPosition ?? 0,
    y: c.yPosition ?? 0,
    w: c.width ?? 0,
    h: c.height ?? 0,
  });

  it('SHOW-1: containerTotalNum === 5 (4 image + 1 text)', () => {
    const schema = buildShowcasePageSchema();
    expect(schema.containerTotalNum).toBe(5);
    expect(SHOWCASE_CONTAINER_TOTAL).toBe(5);
    expect(schema.imageObject).toHaveLength(4);
    expect(schema.textObject).toHaveLength(1);
  });

  it('SHOW-2: image tiles are showcase-tile-0..3, ids 0-3, 200×100, centred 2×2 at (88,44)', () => {
    const { imageObject } = buildShowcasePageSchema();
    const expected = [
      { name: 'showcase-tile-0', x: 88, y: 44 },
      { name: 'showcase-tile-1', x: 288, y: 44 },
      { name: 'showcase-tile-2', x: 88, y: 144 },
      { name: 'showcase-tile-3', x: 288, y: 144 },
    ];
    expected.forEach(({ name, x, y }, i) => {
      const tile = imageObject[i];
      expect(tile?.containerName).toBe(name);
      expect(tile?.containerID).toBe(i);
      expect(tile?.width).toBe(200);
      expect(tile?.height).toBe(100);
      expect(tile?.xPosition).toBe(x);
      expect(tile?.yPosition).toBe(y);
    });
  });

  it('SHOW-3: exactly ONE capture (showcase-capture, id 4) covering the 400×200 region with content single-space', () => {
    const { imageObject, textObject } = buildShowcasePageSchema();
    const imageCaptureCount = imageObject.filter(
      (c) => (c as { isEventCapture?: number }).isEventCapture === 1,
    ).length;
    const captures = textObject.filter((c) => c.isEventCapture === 1);
    expect(imageCaptureCount).toBe(0);
    expect(captures).toHaveLength(1);
    expect(captures[0]?.containerName).toBe('showcase-capture');
    expect(captures[0]?.containerID).toBe(4);
    expect(captures[0]?.content).toBe(' ');
    expect(rect(captures[0] ?? {})).toEqual({ x: 88, y: 44, w: 400, h: 200 });
  });

  it('SHOW-4: image budget ≤4, text budget ≤8 (G2 hardware limit)', () => {
    const { imageObject, textObject } = buildShowcasePageSchema();
    expect(imageObject.length).toBeLessThanOrEqual(4);
    expect(textObject.length).toBeLessThanOrEqual(8);
  });

  it('SHOW-5: all rects fit within the 576×288 physical screen', () => {
    const { imageObject, textObject } = buildShowcasePageSchema();
    for (const c of [...imageObject, ...textObject]) {
      const r = rect(c);
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(576);
      expect(r.y + r.h).toBeLessThanOrEqual(288);
    }
  });

  it('SHOW-6: showcase entries do NOT leak into the base/glyph/hybrid builders', () => {
    const baseNames = [
      ...buildBaseImageContainers().map((c) => c.containerName),
      ...buildBaseTextContainers().map((c) => c.containerName),
    ];
    const statusNames = buildStatusViewTextContainers().map((c) => c.containerName);
    const hybridNames = [
      ...buildHybridPageSchema().imageObject.map((c) => c.containerName),
      ...buildHybridPageSchema().textObject.map((c) => c.containerName),
    ];
    for (const n of [...baseNames, ...statusNames, ...hybridNames]) {
      expect((n ?? '').startsWith('showcase-')).toBe(false);
    }
  });
});
