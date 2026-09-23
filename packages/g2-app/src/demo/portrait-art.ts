/**
 * Demo portrait: the helmeted dwarf of the design mock (docs/design/g2-sheet-ux.html
 * `portrait()`), drawn procedurally so demo mode and the simulator never fetch an
 * image. Served through the HUD's injectable decoder for {@link DEMO_PORTRAIT_URL}.
 */
import { Pixmap, quadratic } from '@evf/shared-render';
import type { Luma, LumaDecoder } from '../hud/zones/luma.js';
import { DEMO_PORTRAIT_URL } from './fixtures.js';

const SIZE = 136;

/** Draws the dwarf into a 136 × 136 luminance picture. */
export function dwarfPortrait(): Luma {
  const p = new Pixmap(SIZE, SIZE);
  // Dithered vignette.
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const r = Math.hypot(x - 68, y - 60) / 96;
      const v = Math.max(0, 1.6 - r * 2.2);
      if (((x * 7 + y * 13) % 16) / 16 < v * 0.35) p.set(x, y, 2);
    }
  }
  const cx = 68;
  const cy = 58;
  p.ellipse(cx, 146, 60, 40, 5, true); // shoulders
  p.circle(cx, cy, 26, 8, true); // face
  p.pushClip(0, 0, SIZE, cy - 4);
  p.circle(cx, cy - 8, 29, 11, true); // helmet dome
  p.popClip();
  p.fillRect(cx - 29, cy - 8, 59, 4, 11); // helmet brim
  p.fillRect(cx - 2, cy - 37, 4, 30, 14); // nasal / crest
  p.fillRect(cx - 12, cy + 2, 6, 4, 0); // eyes
  p.fillRect(cx + 6, cy + 2, 6, 4, 0);
  const beard = [
    { x: cx - 26, y: cy + 8 },
    ...quadratic({ x: cx - 26, y: cy + 8 }, { x: cx - 30, y: cy + 52 }, { x: cx, y: cy + 66 }),
    ...quadratic({ x: cx, y: cy + 66 }, { x: cx + 30, y: cy + 52 }, { x: cx + 26, y: cy + 8 }),
    ...quadratic({ x: cx + 26, y: cy + 8 }, { x: cx, y: cy + 22 }, { x: cx - 26, y: cy + 8 }),
  ];
  p.fillPolygon(beard, 12);
  for (let i = -2; i <= 2; i++) p.line(cx + i * 8, cy + 20, cx + i * 6, cy + 56, 7);
  const data = new Uint8Array(SIZE * SIZE);
  for (let i = 0; i < data.length; i++) data[i] = Math.round(((p.data[i] ?? 0) / 15) * 255);
  return { width: SIZE, height: SIZE, data };
}

/** Decoder serving the demo portrait; any other URL fails (→ documented fallbacks). */
export const demoDecoder: LumaDecoder = (req) =>
  req.url === DEMO_PORTRAIT_URL
    ? Promise.resolve(dwarfPortrait())
    : Promise.reject(new Error(`demo: no image for ${req.url}`));
