/**
 * Tile composer (real-G2 grid): the three sheet tiles are pixel crops of the design
 * zones — the look is identical to one container per zone — plus the full-screen split,
 * the zone-E fallback tile and the ≤ 1 fps map gate.
 */
import { Pixmap } from '@evf/shared-render';
import { describe, expect, it } from 'vitest';
import { online } from '../../demo/fixtures.js';
import { strings } from '../i18n.js';
import { initialUi } from '../input/ui-state.js';
import { TILE, ZONE, ZONES, type Zone } from '../layout.js';
import { renderTexts, renderZones } from '../view.js';
import { MAP_MIN_INTERVAL_MS, MapFrameGate } from '../zones/map-gate.js';
import { contextTile, sheetTiles, splitTiles, topBand } from '../zones/tiles.js';

function filled(w: number, h: number, level: number): Pixmap {
  const p = new Pixmap(w, h);
  p.fillRect(0, 0, w, h, level);
  return p;
}

const input = () => ({ app: online('min'), ui: initialUi(), strings: strings('it'), now: 0 });

describe('sheet tiles', () => {
  it('reassemble every design zone pixel-for-pixel on the 288 × 144 grid', () => {
    const zones = renderZones(input(), { portrait: null, art: null, viewport: null, reach: false });
    const tiles = sheetTiles(zones);
    const screen = new Pixmap(576, 288);
    for (const t of ['tl', 'tr', 'bl'] as const) {
      expect([tiles[t].width, tiles[t].height]).toEqual([288, 144]);
      screen.blit(tiles[t], TILE[t].x, TILE[t].y);
    }
    for (const z of ZONES) {
      const r = ZONE[z];
      expect(screen.crop(r.x, r.y, r.w, r.h).hash(), z).toBe(zones[z].hash());
    }
  });

  it('confines each zone to its tiles: portrait → tl, map → tr, header → both', () => {
    const zones: Record<Zone, Pixmap> = {
      portrait: filled(144, 144, 1),
      header: filled(288, 144, 2),
      map: filled(144, 144, 3),
      sheet: filled(288, 144, 4),
    };
    const band = topBand(zones);
    expect([band.width, band.height]).toEqual([576, 144]);
    const t = sheetTiles(zones);
    expect([t.tl.get(0, 0), t.tl.get(143, 0), t.tl.get(144, 0), t.tl.get(287, 143)]).toEqual([
      1, 1, 2, 2,
    ]);
    expect([t.tr.get(0, 0), t.tr.get(143, 0), t.tr.get(144, 0), t.tr.get(287, 143)]).toEqual([
      2, 2, 3, 3,
    ]);
    expect(t.bl).toBe(zones.sheet);
  });
});

describe('full-screen split', () => {
  it('rejects a framebuffer that is not 576 × 288', () => {
    expect(() => splitTiles(new Pixmap(288, 144))).toThrow(/expected 576×288/);
  });
});

describe('zone E fallback tile', () => {
  it('draws the head, the framed body lines and the foot as pixels', () => {
    const texts = renderTexts('sheet', input());
    const tile = contextTile(texts);
    expect([tile.width, tile.height]).toEqual([288, 144]);
    // Body frame left edge at the firmware body geometry (y 29 … 114 inside the tile).
    expect(tile.get(2, 60)).toBeGreaterThan(0);
    const lit = (y0: number, y1: number) => {
      let n = 0;
      for (let y = y0; y < y1; y++) for (let x = 4; x < 284; x++) if (tile.get(x, y) > 0) n++;
      return n;
    };
    expect(lit(0, 28)).toBeGreaterThan(0); // head
    expect(lit(32, 110)).toBeGreaterThan(0); // body
    expect(lit(116, 144)).toBeGreaterThan(0); // foot
    const empty = contextTile({ ctxBody: { content: '▶ ☃\n', color: 4 } });
    expect(empty.hash()).not.toBe(tile.hash());
  });
});

describe('MapFrameGate', () => {
  it('passes the first frame, withholds changes for 1 s, then takes the newest', () => {
    let now = 0;
    const gate = new MapFrameGate(() => now);
    const a = filled(4, 4, 1);
    const b = filled(4, 4, 2);
    const c = filled(4, 4, 3);
    expect(gate.take(a, 'k')).toEqual({ pix: a, retryInMs: 0 });
    now = 200;
    expect(gate.take(b, 'k')).toEqual({ pix: a, retryInMs: MAP_MIN_INTERVAL_MS - 200 });
    now = 400;
    const same = filled(4, 4, 1);
    expect(gate.take(same, 'k')).toEqual({ pix: same, retryInMs: 0 });
    now = 1000;
    expect(gate.take(c, 'k')).toEqual({ pix: c, retryInMs: 0 });
  });

  it('bypasses the cadence when the context key changes or after reset', () => {
    let now = 0;
    const gate = new MapFrameGate(() => now);
    gate.take(filled(4, 4, 1), 'hud');
    now = 10;
    const dim = filled(4, 4, 0);
    expect(gate.take(dim, 'offline').pix).toBe(dim);
    const again = filled(4, 4, 5);
    gate.reset();
    expect(gate.take(again, 'offline').pix).toBe(again);
    expect(new MapFrameGate().take(again, 'x').retryInMs).toBe(0);
  });
});
