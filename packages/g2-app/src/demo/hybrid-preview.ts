/**
 * Hybrid-HUD preview harness (DEV-ONLY).
 *
 * Renders the Feature 002 hybrid substrate on the glasses using the REAL
 * Even Hub SDK bridge (the simulator or a phone WebView provides it) WITHOUT a
 * live Foundry/bridge WS connection:
 *   - map region (left 400×200)  → 4 mock dithered tiles pushed to ids 0-3
 *   - header / footer chrome      → native text (ids 4/5)
 *   - status card (right 176px)   → the native StatusHudRenderer (id 6)
 *
 * This lets the hybrid layout + the compact D&D status card be visually verified
 * (and screenshotted) in the headless simulator, where the engine's live WS fails
 * to open under xvfb (see the feature-002 memory). It is NOT part of the shipped
 * bundle — it is only reachable at the dev URL `/demo/hybrid-preview.html`, never
 * listed in vite `rollupOptions.input`.
 *
 * URL params:
 *   ?card=full|compact   — which status-card variant to render (default: compact)
 *   ?locale=it|en        — HUD locale (default: it)
 *
 * @see packages/g2-app/src/demo/mock-map.ts (mock map tiles)
 * @see packages/g2-app/src/engine/container-registry.ts (buildHybridPageSchema)
 * @see packages/g2-app/src/status-hud/status-hud-renderer.ts (status card)
 */

import {
  ImageRawDataUpdate,
  RebuildPageContainer,
  TextContainerUpgrade,
  waitForEvenAppBridge,
} from '@evenrealities/even_hub_sdk';
import type { CharacterSnapshot } from '@evf/shared-protocol';
import { buildHybridPageSchema } from '../engine/container-registry.js';
import { createBootPage } from '../engine/page-lifecycle.js';
import type { HudLocale } from '../status-hud/i18n-budgets.js';
import { StatusHudRenderer } from '../status-hud/status-hud-renderer.js';
import { buildMockMapTiles } from './mock-map.js';

/** Container ids for the native chrome/status text containers (hybrid schema). */
const HEADER_ID = 4;
const FOOTER_ID = 5;
const STATUS_ID = 6;

/** A rich sample snapshot exercising every status-card field. */
const SAMPLE_SNAPSHOT: CharacterSnapshot = {
  actorId: 'demo-1',
  name: 'Thorin Oakenshield',
  hp: 45,
  maxHp: 68,
  tempHp: 10,
  ac: 18,
  level: 5,
  conditions: ['concentrato', 'benedetto'],
  exhaustion: 0,
  death: { success: 1, failure: 1 },
  world: { modernRules: false },
  inventory: [],
  spells: {
    slots: [
      { level: 1, value: 2, max: 4 },
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

/** Read a URL param with a fallback. */
function param(name: string, fallback: string): string {
  return new URL(window.location.href).searchParams.get(name) ?? fallback;
}

async function main(): Promise<void> {
  const locale = (param('locale', 'it') === 'en' ? 'en' : 'it') as HudLocale;
  const variant = param('card', 'compact');
  const bridge = await waitForEvenAppBridge();

  // 1. Establish the G2 boot page (createStartUpPageContainer), then swap in the
  //    hybrid schema — the exact page-lifecycle the real app uses. A fresh page
  //    MUST be started up before rebuildPageContainer has any visible effect.
  //    Best-effort: on a dev HMR reload the page is already started up (create is
  //    once-per-boot), so swallow that and proceed straight to the rebuild.
  await createBootPage(bridge).catch(() => {
    /* page already started (HMR reload) — rebuild below re-applies the schema */
  });
  await bridge.rebuildPageContainer(new RebuildPageContainer(buildHybridPageSchema()));

  // 2. Push the mock map into the left 400×200 region (ids 0-3).
  for (const tile of buildMockMapTiles()) {
    await bridge.updateImageRawData(
      new ImageRawDataUpdate({
        containerID: tile.containerID,
        containerName: tile.containerName,
        imageData: tile.pngBytes,
      }),
    );
  }

  // 3. Header chrome (id 4) — scene · mode · round/turn · battery.
  await bridge.textContainerUpgrade(
    new TextContainerUpgrade({
      containerID: HEADER_ID,
      containerName: 'header',
      content: 'Sala Banchetti · raster   R3 T2/5   ⌁92%',
    }),
  );

  // 4. Footer chrome (id 5) — R1 gesture hints (canonical gesture set, no long-press).
  await bridge.textContainerUpgrade(
    new TextContainerUpgrade({
      containerID: FOOTER_ID,
      containerName: 'footer',
      content: 'R1 scroll=pan  tap=ping  ▲=menu   [scheda][combat]',
    }),
  );

  // 5. Status card (id 6) — the native D&D status sheet.
  const isCompact = variant !== 'full';
  const renderer = new StatusHudRenderer(
    isCompact ? { locale, compact: true, maxWidthPx: 176 } : { locale },
  );
  await bridge.textContainerUpgrade(
    new TextContainerUpgrade({
      containerID: STATUS_ID,
      containerName: 'hybrid-status-hud',
      content: renderer.render(SAMPLE_SNAPSHOT),
    }),
  );
}

main().catch((err) => {
  console.error('[hybrid-preview] failed:', err);
});
