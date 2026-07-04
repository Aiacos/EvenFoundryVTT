/**
 * Showcase HUD preview entry (DEV-ONLY).
 *
 * Renders the full showcase-faithful raster HUD (frame + header + framed map +
 * status card + footer, VT323 pixel font) onto a 400×200 canvas, dithers it to
 * 4-bit, and pushes it as 4 image tiles CENTRED on the 576×288 glasses screen —
 * so the whole glanceable HUD reads as one crisp CRT image, matching
 * `docs/showcase/index.html`.
 *
 * Reachable only at the dev URL `/demo/showcase-preview.html`; never shipped.
 * This entry is the VISUAL TEST of the production renderer: it imports the exact
 * production `drawShowcaseHud` + `encodeRegionToTiles` and drives them with mock
 * data, so a green render here confirms the shipped modules render identically.
 *
 * @see packages/g2-app/src/hud/showcase-hud-renderer.ts (production renderer)
 * @see packages/g2-app/src/hud/showcase-raster.ts (production dither + tiles)
 */

import {
  ImageContainerProperty,
  ImageRawDataUpdate,
  RebuildPageContainer,
  TextContainerProperty,
  waitForEvenAppBridge,
} from '@evenrealities/even_hub_sdk';
import type { CharacterSnapshot } from '@evf/shared-protocol';
import { createBootPage } from '../engine/page-lifecycle.js';
import { drawShowcaseHud } from '../hud/showcase-hud-renderer.js';
import { encodeRegionToTiles, REGION_H, REGION_W } from '../hud/showcase-raster.js';
import { ensureVt323Loaded } from '../status-hud/vt323-font-loader.js';
import { paintMockScene } from './mock-map.js';

/** Centre the 400×200 HUD on the 576×288 screen. */
const OX = Math.round((576 - REGION_W) / 2); // 88
const OY = Math.round((288 - REGION_H) / 2); // 44

/** A rich sample snapshot exercising every status field. */
const SAMPLE: CharacterSnapshot = {
  actorId: 'demo-1',
  name: 'Thorin',
  hp: 45,
  maxHp: 68,
  tempHp: 10,
  ac: 18,
  level: 5,
  conditions: ['concentrato', 'benedetto'],
  exhaustion: 0,
  death: { success: 0, failure: 0 },
  world: { modernRules: false },
  inventory: [],
  spells: {
    slots: [
      { level: 1, value: 3, max: 4 },
      { level: 2, value: 1, max: 3 },
      { level: 3, value: 0, max: 2 },
    ],
    spells: [],
  },
  abilities: {
    str: { value: 16, mod: 3, save: 5, proficient: true, dc: 13 },
    dex: { value: 14, mod: 2, save: 2, proficient: false, dc: 12 },
    con: { value: 15, mod: 2, save: 4, proficient: true, dc: 12 },
    int: { value: 10, mod: 0, save: 0, proficient: false, dc: 10 },
    wis: { value: 12, mod: 1, save: 1, proficient: false, dc: 11 },
    cha: { value: 13, mod: 1, save: 1, proficient: false, dc: 11 },
  },
  skills: {
    acr: { total: 2, ability: 'dex', proficient: 0, passive: 12 },
    ani: { total: 1, ability: 'wis', proficient: 0, passive: 11 },
    arc: { total: 0, ability: 'int', proficient: 0, passive: 10 },
    ath: { total: 5, ability: 'str', proficient: 1, passive: 15 },
    dec: { total: 1, ability: 'cha', proficient: 0, passive: 11 },
    his: { total: 0, ability: 'int', proficient: 0, passive: 10 },
    ins: { total: 1, ability: 'wis', proficient: 0, passive: 11 },
    itm: { total: 1, ability: 'cha', proficient: 0, passive: 11 },
    inv: { total: 0, ability: 'int', proficient: 0, passive: 10 },
    med: { total: 1, ability: 'wis', proficient: 0, passive: 11 },
    nat: { total: 0, ability: 'int', proficient: 0, passive: 10 },
    prc: { total: 1, ability: 'wis', proficient: 0, passive: 11 },
    prf: { total: 1, ability: 'cha', proficient: 0, passive: 11 },
    per: { total: 1, ability: 'cha', proficient: 0, passive: 11 },
    rel: { total: 0, ability: 'int', proficient: 0, passive: 10 },
    slt: { total: 2, ability: 'dex', proficient: 0, passive: 12 },
    ste: { total: 2, ability: 'dex', proficient: 0, passive: 12 },
    sur: { total: 1, ability: 'wis', proficient: 0, passive: 11 },
  },
  class: 'Fighter',
  initiative: 2,
  speed: 30,
};

/** Build a centred 4-tile page schema (+ one capture container) for the 400×200 HUD. */
function buildCentredSchema() {
  const tiles = [
    { id: 0, x: OX, y: OY },
    { id: 1, x: OX + 200, y: OY },
    { id: 2, x: OX, y: OY + 100 },
    { id: 3, x: OX + 200, y: OY + 100 },
  ];
  const imageObject = tiles.map(
    (t) =>
      new ImageContainerProperty({
        containerID: t.id,
        containerName: `hud-tile-${t.id}`,
        xPosition: t.x,
        yPosition: t.y,
        width: 200,
        height: 100,
      }),
  );
  const textObject = [
    new TextContainerProperty({
      containerID: 4,
      containerName: 'hud-capture',
      xPosition: OX,
      yPosition: OY,
      width: REGION_W,
      height: REGION_H,
      isEventCapture: 1,
      content: ' ',
    }),
  ];
  return { containerTotalNum: 5, imageObject, textObject };
}

async function main(): Promise<void> {
  await ensureVt323Loaded();
  const bridge = await waitForEvenAppBridge();

  await createBootPage(bridge).catch(() => {
    /* already started on an HMR reload — the rebuild below re-applies the schema */
  });
  await bridge.rebuildPageContainer(new RebuildPageContainer(buildCentredSchema()));

  // Draw the composited HUD onto a 400×200 canvas.
  const canvas = document.createElement('canvas');
  canvas.width = REGION_W;
  canvas.height = REGION_H;
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new Error('2d context unavailable');

  drawShowcaseHud(ctx, {
    sceneName: 'Sala Banchetti',
    round: 3,
    turn: 2,
    turnMax: 5,
    battery: 92,
    snapshot: SAMPLE,
    paintMap: (c, x, y, w, h) => paintMockScene(c, x, y, w, h),
  });

  // Dither + split + push the 4 tiles.
  const { data } = ctx.getImageData(0, 0, REGION_W, REGION_H);
  for (const tile of encodeRegionToTiles(data)) {
    await bridge.updateImageRawData(
      new ImageRawDataUpdate({
        containerID: tile.containerID,
        containerName: tile.containerName,
        imageData: tile.pngBytes,
      }),
    );
  }
}

main().catch((err) => {
  console.error('[showcase-preview] failed:', err);
});
