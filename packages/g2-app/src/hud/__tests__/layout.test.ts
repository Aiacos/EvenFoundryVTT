/**
 * Container budget, zOrder and SDK page validity for every layout mode, the zone grid
 * of docs/design/g2-sheet-ux.html §Architettura della schermata (INV-1: the five zones
 * tile the 576 × 288 canvas exactly, without overlap), and one regression test per
 * real-G2 host fact (inventory §2): image containers only on the proven 288 × 144 grid,
 * declaration-order container ids (images first), a single `' '` capture container, and
 * no visible text container under an image.
 */
import { utf8ByteLength, validateEvenHubPageContainer } from '@evenrealities/even_hub_sdk';
import { describe, expect, it } from 'vitest';
import { strings } from '../i18n.js';
import { MENU_OPS } from '../input/entries.js';
import { menuIdOf } from '../input/state-machine.js';
import {
  buildRebuildPage,
  buildStartupPage,
  containerId,
  type LayoutMode,
  MODE_REGIONS,
  SCREEN_H,
  SCREEN_W,
  TEXT,
  TILE,
  TILES,
  ZONE,
  ZONES,
} from '../layout.js';

const MODES: LayoutMode[] = ['sheet', 'full'];
const menu = (loc: 'it' | 'en') =>
  MENU_OPS.map((op) => ({ id: menuIdOf(op), label: strings(loc).menu[op] }));

describe('layout', () => {
  it('stays within ≤ 4 image and ≤ 8 text containers per mode, with one event-capture container', () => {
    for (const mode of MODES) {
      const page = buildStartupPage(mode, {}, menu('it'));
      expect(page.imageObject?.length ?? 0).toBeLessThanOrEqual(4);
      expect(page.textObject?.length ?? 0).toBeLessThanOrEqual(8);
      expect(page.containerTotalNum).toBe(
        (page.imageObject?.length ?? 0) + (page.textObject?.length ?? 0),
      );
      expect(
        page.textObject?.filter((t) => t.isEventCapture === 1).map((t) => t.containerName),
      ).toEqual(['evf-bg']);
    }
    expect(MODE_REGIONS.sheet.image).toHaveLength(3);
    expect(MODE_REGIONS.sheet.text).toHaveLength(4);
    expect(MODE_REGIONS.full.image).toHaveLength(4);
  });

  it('declares unique zOrderIndex, ids and ≤ 16-char names; the capture layer is lowest', () => {
    for (const mode of MODES) {
      const page = buildStartupPage(mode, {}, menu('en'));
      const all = [...(page.textObject ?? []), ...(page.imageObject ?? [])];
      const z = all.map((c) => c.zOrderIndex);
      expect(new Set(z).size).toBe(all.length);
      expect(Math.min(...(z as number[]))).toBe(TEXT.bg.z);
      expect(new Set(all.map((c) => c.containerID)).size).toBe(all.length);
      for (const c of all) expect((c.containerName ?? '').length).toBeLessThanOrEqual(16);
    }
  });

  it('passes the SDK page validation (z-order, menu, brightness) in both locales', () => {
    for (const mode of MODES) {
      for (const loc of ['it', 'en'] as const) {
        expect(validateEvenHubPageContainer(buildStartupPage(mode, {}, menu(loc)))).toEqual({
          valid: true,
        });
        expect(
          validateEvenHubPageContainer(
            buildRebuildPage(mode, { bg: { content: '', color: 2 } }, menu(loc)),
          ),
        ).toEqual({
          valid: true,
        });
      }
    }
  });

  it('keeps the contextual menu within 10 items, 32-byte labels and non-zero ids', () => {
    for (const loc of ['it', 'en'] as const) {
      const m = menu(loc);
      expect(m.length).toBeLessThanOrEqual(10);
      for (const e of m) {
        expect(e.id).toBeGreaterThan(0);
        expect(utf8ByteLength(e.label)).toBeLessThanOrEqual(32);
      }
    }
  });

  it('tiles the canvas with zones A–E exactly (sheet) and four tiles (full), no overlap', () => {
    const cover = (boxes: Array<{ x: number; y: number; w: number; h: number }>) => {
      const hits = new Uint8Array(SCREEN_W * SCREEN_H);
      for (const b of boxes) {
        for (let y = b.y; y < b.y + b.h; y++)
          for (let x = b.x; x < b.x + b.w; x++)
            hits[y * SCREEN_W + x] = (hits[y * SCREEN_W + x] ?? 0) + 1;
      }
      return hits.every((n) => n === 1);
    };
    const e = { x: TEXT.ctxHead.x, y: TEXT.ctxHead.y, w: TEXT.ctxHead.w, h: 144 };
    expect(cover([...ZONES.map((z) => ZONE[z]), e])).toBe(true);
    expect(cover(TILES.map((t) => TILE[t]))).toBe(true);
    expect(cover([...MODE_REGIONS.sheet.image.map((t) => TILE[t]), e])).toBe(true);
    expect(ZONE.portrait).toEqual({ x: 0, y: 0, w: 144, h: 144 });
    expect(ZONE.header).toEqual({ x: 144, y: 0, w: 288, h: 144 });
    expect(ZONE.map).toEqual({ x: 432, y: 0, w: 144, h: 144 });
    expect(ZONE.sheet).toEqual({ x: 0, y: 144, w: 288, h: 144 });
  });

  it('stacks zone E as head (1 line) + framed body (3 lines) + foot (1 line) = 144 px', () => {
    const { ctxHead, ctxBody, ctxFoot } = TEXT;
    expect([ctxHead.lines, ctxBody.lines, ctxFoot.lines]).toEqual([1, 3, 1]);
    expect(ctxBody.y).toBe(ctxHead.y + ctxHead.h);
    expect(ctxFoot.y).toBe(ctxBody.y + ctxBody.h);
    expect(ctxFoot.y + ctxFoot.h).toBe(SCREEN_H);
    for (const r of Object.values(TEXT)) {
      expect(r.x + r.w).toBeLessThanOrEqual(SCREEN_W);
      expect(r.y + r.h).toBeLessThanOrEqual(SCREEN_H);
    }
  });

  it('fills empty content with a space and applies brightness; only the body is framed', () => {
    const page = buildStartupPage('sheet', { ctxBody: { content: 'x', color: 2 } }, []);
    const [bg, head, body] = page.textObject ?? [];
    expect(bg?.content).toBe(' ');
    expect(bg?.textColor).toBe(4);
    expect(body?.textColor).toBe(2);
    expect(body?.borderWidth).toBe(1);
    expect(head?.borderWidth).toBe(0);
    expect(bg?.borderWidth).toBe(0);
  });
});

/** Rectangles overlap (positive area). */
function overlaps(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

describe('real-G2 host facts (regression)', () => {
  const pages = MODES.flatMap((mode) => [
    { mode, kind: 'startup', page: buildStartupPage(mode, {}, menu('it')) },
    { mode, kind: 'rebuild', page: buildRebuildPage(mode, {}, menu('en')) },
  ]);
  const GRID = [
    [0, 0],
    [288, 0],
    [0, 144],
    [288, 144],
  ];

  it('H1: image containers sit only at the 2×2 grid origins, sized 288 × 144 (d97b12e)', () => {
    for (const { mode, kind, page } of pages) {
      for (const img of page.imageObject ?? []) {
        expect(
          GRID.some(([x, y]) => img.xPosition === x && img.yPosition === y),
          `${mode}/${kind} ${img.containerName} at ${img.xPosition},${img.yPosition}`,
        ).toBe(true);
        expect([img.width, img.height]).toEqual([288, 144]);
      }
      const origins = (page.imageObject ?? []).map((i) => `${i.xPosition},${i.yPosition}`);
      expect(new Set(origins).size).toBe(origins.length);
    }
    // Sheet: the two top tiles carry zones A+B+C, bl carries zone D; br stays reserved.
    expect(MODE_REGIONS.sheet.image).toEqual(['tl', 'tr', 'bl']);
    expect(MODE_REGIONS.full.image).toEqual(['tl', 'tr', 'bl', 'br']);
  });

  it('H3: container ids follow the host declaration order — images first, then text', () => {
    for (const { mode, kind, page } of pages) {
      const images = (page.imageObject ?? []).map((c) => c.containerID);
      const texts = (page.textObject ?? []).map((c) => c.containerID);
      expect([...images, ...texts], `${mode}/${kind}`).toEqual(
        Array.from({ length: images.length + texts.length }, (_, i) => i),
      );
    }
    expect(containerId('full', 'tl')).toBe(0);
    expect(containerId('full', 'br')).toBe(3);
    expect(containerId('full', 'bg')).toBe(4);
    expect(containerId('sheet', 'bl')).toBe(2);
    expect(containerId('sheet', 'bg')).toBe(3);
    expect(containerId('sheet', 'ctxFoot')).toBe(6);
    // Image ids are identical across modes (a stale in-flight send stays on its tile).
    for (const t of MODE_REGIONS.sheet.image)
      expect(containerId('sheet', t)).toBe(containerId('full', t));
    expect(() => containerId('sheet', 'br')).toThrow(/not declared in the sheet layout/);
    expect(() => containerId('full', 'ctxBody')).toThrow(/not declared/);
  });

  it('H5: exactly one capture container, full screen, content always a single space', () => {
    for (const { mode, kind, page } of pages) {
      const capture = (page.textObject ?? []).filter((t) => t.isEventCapture === 1);
      expect(capture, `${mode}/${kind}`).toHaveLength(1);
      expect(capture[0]).toMatchObject({
        containerName: 'evf-bg',
        content: ' ',
        xPosition: 0,
        yPosition: 0,
        width: SCREEN_W,
        height: SCREEN_H,
      });
    }
    const page = buildStartupPage('sheet', { bg: { content: 'leak', color: 4 } }, []);
    expect(page.textObject?.[0]?.content).toBe(' ');
  });

  it('H4: no visible text container overlaps an image (images draw above text)', () => {
    for (const { mode, kind, page } of pages) {
      const texts = (page.textObject ?? []).filter((t) => t.isEventCapture !== 1);
      for (const t of texts) {
        for (const i of page.imageObject ?? []) {
          const a = { x: t.xPosition ?? 0, y: t.yPosition ?? 0, w: t.width ?? 0, h: t.height ?? 0 };
          const b = { x: i.xPosition ?? 0, y: i.yPosition ?? 0, w: i.width ?? 0, h: i.height ?? 0 };
          expect(
            overlaps(a, b),
            `${mode}/${kind} ${t.containerName} under ${i.containerName}`,
          ).toBe(false);
        }
      }
    }
  });
});
