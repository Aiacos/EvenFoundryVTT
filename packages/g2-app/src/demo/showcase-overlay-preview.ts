/**
 * Showcase z=2 OVERLAY preview entry (DEV-ONLY).
 *
 * Visual-verify hook for Feature 002 showcase overlays: it drives a REAL canvas
 * `OverlayPanel` through the SAME generic mechanism production uses — mount the panel
 * on a {@link CanvasCompositor} (576×288), composite it, downscale the composite to the
 * 400×200 raster region (uniform 0.6944×, identical 2:1 aspect — no distortion), split
 * it into the 4 showcase tiles via the production {@link encodeRegionToTiles}, and push
 * them centred on the glasses. A green render here confirms the shipped overlay path
 * (canvas panel → compositor → downscale → tiles) renders identically.
 *
 * Reachable only at the dev URL `/demo/showcase-overlay-preview.html`; never shipped.
 * `demo/**` is excluded from coverage (see vitest.config.ts).
 *
 * Drive it via URL params:
 *   - `?overlay=menu`      → Quick-Action menu (canvas variant).
 *   - `?overlay=sheet`     → character sheet (SAMPLE snapshot).
 *   - `?overlay=combat`    → combat tracker (SAMPLE combat snapshot).
 *   - `?overlay=spellbook` → spellbook list (SAMPLE snapshot).
 *   - `?overlay=inventory` → inventory list (SAMPLE snapshot).
 *   - `?overlay=target`    → target picker / BERSAGLIO (SAMPLE targets).
 *   - `&locale=it|en`      → panel locale (default `it`).
 *
 * @see packages/g2-app/src/hud/showcase-hud-layer.ts (production overlay downscale path)
 * @see packages/g2-app/src/engine/canvas-compositor.ts (the shared compositor)
 * @see packages/g2-app/src/demo/showcase-preview.ts (base-HUD dev preview)
 */

import {
  ImageContainerProperty,
  ImageRawDataUpdate,
  RebuildPageContainer,
  TextContainerProperty,
  waitForEvenAppBridge,
} from '@evenrealities/even_hub_sdk';
import type { CharacterSnapshot } from '@evf/shared-protocol';
import { CanvasCompositor, COMPOSITOR_H, COMPOSITOR_W } from '../engine/canvas-compositor.js';
import type { CanvasLayer, OverlayPanel } from '../engine/layer-types.js';
import { ZIndex } from '../engine/layer-types.js';
import { createBootPage } from '../engine/page-lifecycle.js';
import { PanelGestureBus } from '../engine/panel-gesture-bus.js';
import { encodeRegionToTiles, REGION_H, REGION_W } from '../hud/showcase-raster.js';
import { LocaleEventEmitter } from '../locale/locale-events.js';
import { ensureVt323Loaded } from '../status-hud/vt323-font-loader.js';

/** Centre the 400×200 HUD on the 576×288 screen (matches the showcase schema). */
const OX = Math.round((576 - REGION_W) / 2); // 88
const OY = Math.round((288 - REGION_H) / 2); // 44

/** A rich sample snapshot exercising every status field (mirrors showcase-preview.ts). */
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
  inventory: [
    {
      id: 'i0',
      name: 'Spada Lunga',
      type: 'weapon',
      damage: '1d8 taglio',
      tags: ['versatile', '1d10'],
    },
    { id: 'i1', name: 'Arco Corto', type: 'weapon', damage: '1d6 perforante' },
    { id: 'i2', name: 'Cotta di Maglia', type: 'armor' },
    { id: 'i3', name: 'Pozione di Cura', type: 'consumable', quantity: 3 },
    { id: 'i4', name: 'Corda di Canapa', type: 'equipment' },
    { id: 'i5', name: 'Zaino', type: 'container' },
  ],
  spells: {
    slots: [
      { level: 1, value: 3, max: 4 },
      { level: 2, value: 1, max: 3 },
      { level: 3, value: 0, max: 2 },
    ],
    spells: [
      {
        id: 's0',
        name: 'Dardo di Fuoco',
        level: 0,
        school: 'evocation',
        activation: 'action',
        range: '36m',
        effect: '1d10 fuoco',
        prepared: true,
        alwaysPrepared: false,
        concentration: false,
      },
      {
        id: 's1',
        name: 'Scudo',
        level: 1,
        school: 'abjuration',
        activation: 'reaction',
        range: 'self',
        effect: '+5 CA',
        prepared: true,
        alwaysPrepared: false,
        concentration: false,
      },
      {
        id: 's2',
        name: 'Dardo Incantato',
        level: 1,
        school: 'evocation',
        activation: 'action',
        range: '36m',
        effect: '3×1d4+1 forza',
        prepared: true,
        alwaysPrepared: false,
        concentration: false,
      },
      {
        id: 's3',
        name: 'Passo Velato',
        level: 2,
        school: 'conjuration',
        activation: 'bonus',
        range: 'self',
        effect: 'teletrasporto 9m',
        prepared: true,
        alwaysPrepared: false,
        concentration: false,
      },
      {
        id: 's4',
        name: 'Palla di Fuoco',
        level: 3,
        school: 'evocation',
        activation: 'action',
        range: '45m',
        effect: '8d6 fuoco',
        prepared: true,
        alwaysPrepared: false,
        concentration: false,
      },
      {
        id: 's5',
        name: 'Controincantesimo',
        level: 3,
        school: 'abjuration',
        activation: 'reaction',
        range: '18m',
        effect: 'blocca ≤ 3°',
        prepared: false,
        alwaysPrepared: false,
        concentration: false,
      },
    ],
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

/** A sample combat snapshot (mirrors the canvas-combat-tracker test fixture). */
const SAMPLE_COMBAT = {
  combatId: 'combat-001',
  round: 3,
  turn: 0,
  currentCombatantId: 'comb-1',
  combatants: [
    {
      id: 'comb-1',
      name: 'Thorin',
      actorId: 'actor-1',
      initiative: 18,
      hp: 45,
      maxHp: 68,
      isCurrentTurn: true,
      ac: 18,
    },
    {
      id: 'comb-2',
      name: 'Elaria',
      actorId: 'actor-2',
      initiative: 15,
      hp: 30,
      maxHp: 30,
      isCurrentTurn: false,
      ac: 14,
    },
    {
      id: 'comb-3',
      name: 'Goblin',
      actorId: 'actor-3',
      initiative: 9,
      hp: 7,
      maxHp: 7,
      isCurrentTurn: false,
      ac: 13,
    },
  ],
};

/** A wsEventBus stub that replays a single value on subscribe (last-value replay). */
function replayBus(channels: Record<string, unknown>): {
  subscribe(channel: string, fn: (raw: unknown) => void): () => void;
} {
  return {
    subscribe(channel, fn) {
      if (channel in channels) fn(channels[channel]);
      return () => {};
    },
  };
}

/** Build the centred 4-tile + capture page schema for the 400×200 overlay region. */
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
        containerName: `showcase-tile-${t.id}`,
        xPosition: t.x,
        yPosition: t.y,
        width: 200,
        height: 100,
      }),
  );
  const textObject = [
    new TextContainerProperty({
      containerID: 4,
      containerName: 'showcase-capture',
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

/** Which overlay to render (from `?overlay=`). */
type OverlayKind = 'menu' | 'sheet' | 'combat' | 'spellbook' | 'inventory' | 'target';

/** Sample target candidates for the target-picker preview (BERSAGLIO). */
const SAMPLE_TARGETS = [
  {
    tokenId: 'Scene.A.Token.1',
    actorId: 'a1',
    name: 'Goblin Arciere',
    hp: 5,
    maxHp: 15,
    ac: 13,
    isActiveTurn: true,
    sourceIdx: 0,
  },
  {
    tokenId: 'Scene.A.Token.2',
    actorId: 'a2',
    name: 'Goblin Bruto',
    hp: 11,
    maxHp: 15,
    ac: 14,
    isActiveTurn: false,
    sourceIdx: 1,
  },
  {
    tokenId: 'Scene.A.Token.3',
    actorId: 'a3',
    name: 'Mastino delle Ombre',
    hp: 18,
    maxHp: 22,
    ac: 12,
    isActiveTurn: false,
    sourceIdx: 2,
  },
] as const;

/**
 * Construct the requested canvas OverlayPanel, inject its mock data, and return it.
 * Every returned panel is a CanvasLayer (attachCanvas/paint/isDirty) + OverlayPanel.
 */
async function makeOverlayPanel(
  kind: OverlayKind,
  bridge: Awaited<ReturnType<typeof waitForEvenAppBridge>>,
  gestureBus: PanelGestureBus,
  locale: 'it' | 'en',
): Promise<OverlayPanel & CanvasLayer> {
  switch (kind) {
    case 'sheet': {
      const { default: CanvasCharacterSheetPanel } = await import(
        '../panels/canvas-character-sheet-panel.js'
      );
      const panel = new CanvasCharacterSheetPanel(bridge, gestureBus, locale);
      panel.setWsEventBus(replayBus({ 'character.delta': SAMPLE }));
      return panel as unknown as OverlayPanel & CanvasLayer;
    }
    case 'spellbook': {
      const { default: CanvasSpellbookPanel } = await import('../panels/canvas-spellbook-panel.js');
      const panel = new CanvasSpellbookPanel(bridge, gestureBus, locale);
      panel.setWsEventBus(replayBus({ 'character.delta': SAMPLE }));
      return panel as unknown as OverlayPanel & CanvasLayer;
    }
    case 'combat': {
      const { default: CanvasCombatTrackerPanel } = await import(
        '../panels/canvas-combat-tracker-panel.js'
      );
      const panel = new CanvasCombatTrackerPanel(bridge, gestureBus, locale);
      panel.setWsEventBus(
        replayBus({ 'combat.turn': SAMPLE_COMBAT, 'combat.state': SAMPLE_COMBAT }),
      );
      return panel as unknown as OverlayPanel & CanvasLayer;
    }
    case 'inventory': {
      const { default: CanvasInventoryPanel } = await import('../panels/canvas-inventory-panel.js');
      const panel = new CanvasInventoryPanel(bridge, gestureBus, locale);
      panel.setWsEventBus(replayBus({ 'character.delta': SAMPLE }));
      return panel as unknown as OverlayPanel & CanvasLayer;
    }
    case 'target': {
      const { CanvasTargetPickerPanel } = await import('../panels/canvas-target-picker-panel.js');
      const panel = new CanvasTargetPickerPanel(
        gestureBus,
        locale,
        SAMPLE_TARGETS,
        'demo-session',
        { toolId: 'weapon-attack', callerArgs: {} },
        { send: () => {} },
        () => {},
      );
      return panel as unknown as OverlayPanel & CanvasLayer;
    }
    default: {
      const { QuickActionMenuPanel } = await import('../panels/quick-action-menu-panel.js');
      const localeEvents = new LocaleEventEmitter();
      const noop = (): void => {};
      const panel = new QuickActionMenuPanel(
        bridge,
        gestureBus,
        locale,
        'auto',
        localeEvents,
        { onClose: noop, onNavigate: noop, onMapModeToggle: noop, onAction: noop },
        'canvas',
      );
      return panel as unknown as OverlayPanel & CanvasLayer;
    }
  }
}

async function main(): Promise<void> {
  await ensureVt323Loaded();
  const bridge = await waitForEvenAppBridge();

  const params = new URLSearchParams(window.location.search);
  const kind = (params.get('overlay') ?? 'menu') as OverlayKind;
  const locale = (params.get('locale') === 'en' ? 'en' : 'it') as 'it' | 'en';

  await createBootPage(bridge).catch(() => {
    /* already started on an HMR reload — the rebuild below re-applies the schema */
  });
  await bridge.rebuildPageContainer(new RebuildPageContainer(buildCentredSchema()));

  // 1) Build the panel + register it on the shared compositor at z=2 (mirrors
  //    LayerManager.bundle STEP 2.5: attachCanvas → registerLayer).
  const gestureBus = new PanelGestureBus();
  const compositor = new CanvasCompositor();
  const panel = await makeOverlayPanel(kind, bridge, gestureBus, locale);

  const panelCanvas = document.createElement('canvas');
  panelCanvas.width = COMPOSITOR_W;
  panelCanvas.height = COMPOSITOR_H;
  await panel.attachCanvas(panelCanvas);
  compositor.registerLayer(ZIndex.Z2_OVERLAY, panelCanvas, panel);

  // onMount subscribes to the replay bus (last-value replay paints immediately).
  await panel.onMount();
  // Let any async panel init (font load / first paint) settle before compositing.
  await new Promise((r) => setTimeout(r, 60));

  // 2) Composite the panel (576×288) and downscale it to the 400×200 region.
  const composite576 = compositor.composite();
  const src = document.createElement('canvas');
  src.width = COMPOSITOR_W;
  src.height = COMPOSITOR_H;
  const srcCtx = src.getContext('2d');
  if (srcCtx === null) throw new Error('2d context unavailable (src)');
  srcCtx.putImageData(new ImageData(composite576, COMPOSITOR_W, COMPOSITOR_H), 0, 0);

  const dest = document.createElement('canvas');
  dest.width = REGION_W;
  dest.height = REGION_H;
  const destCtx = dest.getContext('2d');
  if (destCtx === null) throw new Error('2d context unavailable (dest)');
  destCtx.drawImage(src, 0, 0, COMPOSITOR_W, COMPOSITOR_H, 0, 0, REGION_W, REGION_H);

  // 3) Split + dither + push the 4 tiles (production encodeRegionToTiles).
  const { data } = destCtx.getImageData(0, 0, REGION_W, REGION_H);
  for (const tile of encodeRegionToTiles(data)) {
    await bridge.updateImageRawData(
      new ImageRawDataUpdate({
        containerID: tile.containerID,
        containerName: `showcase-tile-${tile.containerID}`,
        imageData: tile.pngBytes,
      }),
    );
  }
  console.info(`[showcase-overlay-preview] rendered overlay='${kind}' locale='${locale}'`);
}

main().catch((err) => {
  console.error('[showcase-overlay-preview] failed:', err);
});
