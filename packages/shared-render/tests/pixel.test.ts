/**
 * 4-bit framebuffer primitives, bitmap faces and sheet icons (G2 image zones).
 */
import { describe, expect, it } from 'vitest';
import {
  boot,
  clampLevel,
  cubic,
  d20,
  disc,
  drawText,
  economyMark,
  fitText,
  hammer,
  heart,
  hourglass,
  LABEL_FONT,
  LARGE_FONT,
  MEDIUM_FONT,
  measure,
  measureBold,
  missingGlyphs,
  normalize,
  Pixmap,
  pixmapGrid,
  quadratic,
  reticle,
  shield,
  skull,
  star,
  sword,
} from '../src/index.js';

const lit = (p: Pixmap) => p.data.reduce((n, v) => n + (v > 0 ? 1 : 0), 0);

describe('Pixmap', () => {
  it('validates its size and clips writes to the pixmap and the clip stack', () => {
    expect(() => new Pixmap(0, 4)).toThrow('invalid size');
    expect(() => new Pixmap(2.5, 4)).toThrow();
    const p = new Pixmap(4, 4);
    p.set(-1, 0, 9);
    p.set(4, 4, 9);
    expect(lit(p)).toBe(0);
    p.pushClip(1, 1, 2, 2);
    p.fillRect(0, 0, 4, 4, 7);
    p.popClip();
    p.popClip(); // extra pop is harmless
    expect(p.toHexRows()).toEqual(['0000', '0770', '0770', '0000']);
    expect(p.get(9, 9)).toBe(0);
  });

  it('draws lines (solid, dashed), runs and outlines', () => {
    const p = new Pixmap(12, 3);
    p.line(0, 1, 11, 1, 5, 3);
    expect(p.toHexRows()[1]).toBe('555000555000');
    p.line(0, 0, 11, 2, 1);
    expect(lit(p)).toBeGreaterThan(6);
    const r = new Pixmap(5, 4);
    r.strokeRect(0, 0, 5, 4, 3);
    expect(r.toHexRows()).toEqual(['33333', '30003', '30003', '33333']);
    r.hline(3, 1, 1, 9);
    r.vline(2, 3, 1, 8);
    expect(r.get(1, 1)).toBe(9);
    expect(r.get(2, 3)).toBe(8);
  });

  it('draws rounded rectangles with continuous corners and fills', () => {
    const p = new Pixmap(12, 10);
    p.roundRect(0, 0, 12, 10, 4, 15, 2);
    expect(p.get(0, 0)).toBe(0);
    expect(p.get(6, 0)).toBe(15);
    expect(p.get(0, 5)).toBe(15);
    expect(p.get(6, 5)).toBe(2);
    // Every stroke pixel touches another stroke pixel (8-connected outline).
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 12; x++) {
        if (p.get(x, y) !== 15) continue;
        let n = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && p.get(x + dx, y + dy) === 15) n++;
        expect(n).toBeGreaterThanOrEqual(2);
      }
    }
    const tiny = new Pixmap(3, 3);
    tiny.roundRect(0, 0, 3, 3, 9, 1);
    expect(lit(tiny)).toBeGreaterThan(0);
  });

  it('draws circles, ellipses and polygons', () => {
    const p = new Pixmap(21, 21);
    p.circle(10, 10, 8, 4);
    expect(p.get(10, 2)).toBe(4);
    expect(p.get(10, 10)).toBe(0);
    p.circle(10, 10, 3, 6, true);
    expect(p.get(10, 10)).toBe(6);
    p.ellipse(10, 10, 9, 4, 1);
    const poly = new Pixmap(10, 10);
    poly.fillPolygon(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 0, y: 10 },
      ],
      5,
    );
    expect(poly.get(1, 1)).toBe(5);
    expect(poly.get(8, 8)).toBe(0);
    poly.fillPolygon(
      [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
      5,
    );
    poly.strokePolygon(
      [
        { x: 0, y: 9 },
        { x: 9, y: 9 },
        { x: 9, y: 5 },
      ],
      7,
    );
    expect(poly.get(9, 9)).toBe(7);
  });

  it('blits, crops, scales, hashes and round-trips hex rows', () => {
    const a = new Pixmap(3, 2);
    a.fillRect(0, 0, 3, 2, 10);
    const b = new Pixmap(5, 4);
    b.blit(a, 1, 1);
    expect(b.crop(1, 1, 3, 2).hash()).toBe(a.hash());
    b.scale(0.5);
    expect(b.get(2, 2)).toBe(5);
    const rows = b.toHexRows();
    expect(Pixmap.fromHexRows(rows).toHexRows()).toEqual(rows);
    expect(pixmapGrid(b).toString()).toBe(rows.join('\n'));
    expect(() => Pixmap.fromHexRows([])).toThrow('no rows');
    expect(() => Pixmap.fromHexRows(['00', '0'])).toThrow('ragged');
    expect(() => Pixmap.fromHexRows(['0g'])).toThrow('bad digit');
    expect([clampLevel(-3), clampLevel(7.6), clampLevel(99)]).toEqual([0, 8, 15]);
  });

  it('samples Bézier curves ending on their end point', () => {
    expect(quadratic({ x: 0, y: 0 }, { x: 5, y: 10 }, { x: 10, y: 0 }, 4).at(-1)).toEqual({
      x: 10,
      y: 0,
    });
    expect(cubic({ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 0 }).at(-1)).toEqual({
      x: 3,
      y: 0,
    });
  });
});

describe('bitmap faces', () => {
  it('have consistent glyph tables (height rows × width)', () => {
    for (const f of [LABEL_FONT, MEDIUM_FONT, LARGE_FONT]) {
      for (const [ch, g] of f.glyphs) {
        expect(g.rows.length - (g.top < 0 ? -g.top : 0), `${f.name} ${ch}`).toBe(f.height);
        for (const r of g.rows) expect(r.length, `${f.name} ${ch}`).toBe(g.w);
      }
    }
    expect(LARGE_FONT.height).toBe(16);
    expect(MEDIUM_FONT.height).toBe(10);
    expect(LABEL_FONT.height).toBe(7);
  });

  it('upper-cases, composes Italian accents and falls back to base letters or ?', () => {
    expect(normalize(LABEL_FONT, 'abilità')).toBe('ABILITÀ');
    expect(normalize(LABEL_FONT, 'perché\tù')).toBe('PERCHÉ Ù');
    expect(normalize(LABEL_FONT, 'Ñandú 😀')).toBe('NANDÚ ?');
    expect(missingGlyphs(LABEL_FONT, 'Ñ😀a')).toEqual(['Ñ', '😀']);
    expect(normalize(LARGE_FONT, 'A1')).toBe('?1');
  });

  it('measures proportional widths and fits with an ellipsis', () => {
    expect(measure(LABEL_FONT, '')).toBe(0);
    expect(measure(LABEL_FONT, 'I')).toBe(3);
    expect(measure(LABEL_FONT, 'AB')).toBe(11);
    expect(measureBold(LABEL_FONT, 'AB')).toBe(13);
    expect(fitText(LABEL_FONT, 'THORIN', 100)).toBe('THORIN');
    const fitted = fitText(LABEL_FONT, 'THORIN SCUDODIQUERCIA', 50);
    expect(fitted.endsWith('…')).toBe(true);
    expect(measure(LABEL_FONT, fitted)).toBeLessThanOrEqual(50);
    expect(
      measureBold(MEDIUM_FONT, fitText(MEDIUM_FONT, 'THORIN SCUDO', 40, true)),
    ).toBeLessThanOrEqual(40);
    expect(fitText(LABEL_FONT, 'ABC', 3)).toBe('');
    expect(fitText(LARGE_FONT, '12345', 12)).toBe('1.');
  });

  it('draws left / centre / right aligned and bold, with accents above the cap line', () => {
    const p = new Pixmap(40, 14);
    const w = drawText(p, LABEL_FONT, 'À', 20, 5, 9, 'center');
    expect(w).toBe(5);
    expect(p.get(19, 2)).toBe(9); // grave accent, 3 rows above
    const r = new Pixmap(20, 8);
    drawText(r, LABEL_FONT, 'I', 19, 0, 4, 'right', true);
    expect(r.get(19, 0)).toBe(4);
    expect(drawText(r, LABEL_FONT, '', 0, 0, 1)).toBe(0);
  });
});

describe('icons', () => {
  it('draw inside their boxes', () => {
    const p = new Pixmap(80, 80);
    shield(p, 2, 2, 46, 54, 12, 1);
    expect(p.get(25, 30)).toBe(1);
    expect(p.get(25, 2)).toBe(12);
    const q = new Pixmap(80, 80);
    shield(q, 2, 2, 20, 30, 9, null);
    heart(q, 30, 2, 20, 12);
    star(q, 60, 12, 8, 15, true);
    star(q, 60, 40, 8, 7, false);
    d20(q, 10, 50, 6, 10);
    boot(q, 30, 40, 10);
    hourglass(q, 50, 60, 12);
    skull(q, 64, 60, 14);
    hammer(q, 2, 60, 16, 11);
    sword(q, 20, 60, 16, 11);
    disc(q, 40, 70, 4, 3, false);
    economyMark(q, 'a', 0, 0, 15, false);
    economyMark(q, 'b', 12, 0, 15, true);
    economyMark(q, 'r', 24, 0, 15, false);
    reticle(q, 40, 40, 6, 15);
    expect(q.get(40, 30)).toBe(15);
    expect(q.get(66 + 1, 66)).toBe(0); // skull eye socket
    expect(lit(q)).toBeGreaterThan(500);
  });
});
