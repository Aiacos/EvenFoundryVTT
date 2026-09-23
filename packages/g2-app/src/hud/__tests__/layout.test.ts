/**
 * Container budget and SDK page validity for every layout mode
 * (docs/design/g2-thirds-layout.md §Griglia e budget container).
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
} from '../layout.js';

const MODES: LayoutMode[] = ['thirds', 'thirds-glyph', 'full'];
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
    expect(MODE_REGIONS.thirds.image).toHaveLength(2);
    expect(MODE_REGIONS.thirds.text).toHaveLength(6);
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

  it('places columns at 0/192/384 px, inside the canvas; images ≤ 288×144', () => {
    for (const r of Object.values(TEXT)) {
      expect(r.x + r.w).toBeLessThanOrEqual(SCREEN_W);
      expect(r.y + r.h).toBeLessThanOrEqual(SCREEN_H);
      expect(r.lines).toBeGreaterThanOrEqual(1);
    }
    expect([TEXT.aHead.x, IMAGE.mapTop.x, TEXT.cHead.x]).toEqual([0, 192, 384]);
    for (const img of Object.values(IMAGE)) {
      expect(img.w).toBeLessThanOrEqual(288);
      expect(img.h).toBeLessThanOrEqual(144);
    }
    expect(IMAGE.mapBottom.y).toBe(IMAGE.mapTop.y + IMAGE.mapTop.h);
    expect([
      TEXT.aHead.lines,
      TEXT.aBody.lines,
      TEXT.cHead.lines,
      TEXT.cBody.lines,
      TEXT.cFoot.lines,
    ]).toEqual([2, 8, 2, 7, 1]);
  });

  it('fills empty content with a space and applies brightness', () => {
    const page = buildStartupPage('full', { full: { content: 'x', color: 2 } }, []);
    const [bg, full] = page.textObject ?? [];
    expect(bg?.content).toBe(' ');
    expect(bg?.textColor).toBe(4);
    expect(full?.textColor).toBe(2);
    expect(full?.borderWidth).toBe(1);
    expect(bg?.borderWidth).toBe(0);
  });
});
