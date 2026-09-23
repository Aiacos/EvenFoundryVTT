/**
 * Container budget, zOrder and SDK page validity for every layout mode, and the zone
 * grid of docs/design/g2-sheet-ux.html §Architettura della schermata (INV-1: the five
 * zones tile the 576 × 288 canvas exactly, without overlap).
 */
import { utf8ByteLength, validateEvenHubPageContainer } from '@evenrealities/even_hub_sdk';
import { describe, expect, it } from 'vitest';
import { strings } from '../i18n.js';
import { MENU_OPS } from '../input/entries.js';
import { menuIdOf } from '../input/state-machine.js';
import {
  buildRebuildPage,
  buildStartupPage,
  IMAGE,
  type LayoutMode,
  MODE_REGIONS,
  SCREEN_H,
  SCREEN_W,
  TEXT,
  TILES,
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
    expect(MODE_REGIONS.sheet.image).toHaveLength(4);
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
    expect(cover([...ZONES.map((z) => IMAGE[z]), e])).toBe(true);
    expect(cover(TILES.map((t) => IMAGE[t]))).toBe(true);
    expect(IMAGE.portrait).toMatchObject({ x: 0, y: 0, w: 144, h: 144 });
    expect(IMAGE.header).toMatchObject({ x: 144, y: 0, w: 288, h: 144 });
    expect(IMAGE.map).toMatchObject({ x: 432, y: 0, w: 144, h: 144 });
    expect(IMAGE.sheet).toMatchObject({ x: 0, y: 144, w: 288, h: 144 });
    for (const img of Object.values(IMAGE)) {
      expect(img.w).toBeLessThanOrEqual(288);
      expect(img.h).toBeLessThanOrEqual(144);
      expect(Math.min(img.w, img.h)).toBeGreaterThanOrEqual(20);
    }
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
