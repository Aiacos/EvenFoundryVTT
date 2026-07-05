/**
 * Unit tests for the ShowcaseHudLayer (PRODUCTION default raster HUD layer).
 *
 * The layer's own 400×200 canvas has no 2D context under happy-dom, so these tests
 * inject the `renderRegion` seam to feed synthetic 400×200 RGBA and exercise the
 * encode → per-tile xxhash skip → serial push path deterministically. The `draw()`
 * method (public Layer API) drives one immediate cycle bypassing the throttle;
 * `requestCycle()` is exercised separately through its real (tiny) throttle window.
 *
 * @see packages/g2-app/src/hud/showcase-hud-layer.ts
 */

import { type EvenAppBridge, ImageRawDataUpdateResult } from '@evenrealities/even_hub_sdk';
import {
  type CharacterSnapshot,
  COMBAT_STATE_DELTA_TYPE,
  COMBAT_TURN_DELTA_TYPE,
  type CombatSnapshot,
} from '@evf/shared-protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ShowcaseHudLayer, type ShowcaseWsEvents } from '../showcase-hud-layer.js';
import { encodeQuadrant, REGION_H, REGION_W } from '../showcase-raster.js';

// This suite drives the layer's REAL trailing-edge throttle (~100ms waits) with
// real timers plus real UPNG encodes. On a throttled shared CI runner under V8
// coverage instrumentation those event-loop wakes stretch arbitrarily — the
// overlay-source test blew vitest's 5000ms default on GitHub Actions while
// passing locally in <100ms (same env-variance class as the canvas-extractor
// CE-FPS flake). Generous explicit ceiling; assertions are unchanged.
vi.setConfig({ testTimeout: 20_000 });

// ── Fixtures ────────────────────────────────────────────────────────────────────

/** A complete, valid CharacterSnapshot (mirrors showcase-hud-renderer.test.ts). */
function makeSnapshot(over: Partial<CharacterSnapshot> = {}): CharacterSnapshot {
  const ability = (value: number, mod: number) => ({
    value,
    mod,
    save: mod,
    proficient: false,
    dc: 8,
  });
  const skill = (a: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha') => ({
    total: 0,
    ability: a,
    proficient: 0 as const,
    passive: 10,
  });
  return {
    actorId: 'a1',
    name: 'Thorin',
    hp: 45,
    maxHp: 68,
    tempHp: 10,
    ac: 18,
    level: 5,
    class: 'Fighter',
    initiative: 2,
    speed: 30,
    conditions: [],
    exhaustion: 0,
    death: { success: 0, failure: 0 },
    world: { modernRules: false },
    inventory: [],
    spells: { slots: [], spells: [] },
    abilities: {
      str: ability(16, 3),
      dex: ability(14, 2),
      con: ability(15, 2),
      int: ability(10, 0),
      wis: ability(12, 1),
      cha: ability(13, 1),
    },
    skills: {
      acr: skill('dex'),
      ani: skill('wis'),
      arc: skill('int'),
      ath: skill('str'),
      dec: skill('cha'),
      his: skill('int'),
      ins: skill('wis'),
      itm: skill('cha'),
      inv: skill('int'),
      med: skill('wis'),
      nat: skill('int'),
      prc: skill('wis'),
      prf: skill('cha'),
      per: skill('cha'),
      rel: skill('int'),
      slt: skill('dex'),
      ste: skill('dex'),
      sur: skill('wis'),
    },
    ...over,
  } as CharacterSnapshot;
}

/** A valid CombatSnapshot (round 2, turn 1, 3 combatants) — override any field. */
function makeCombat(over: Partial<CombatSnapshot> = {}): CombatSnapshot {
  const combatant = (id: string, current: boolean) => ({
    id,
    name: id,
    actorId: id,
    initiative: 10,
    hp: 20,
    maxHp: 20,
    isCurrentTurn: current,
  });
  return {
    combatId: 'c1',
    round: 2,
    turn: 1,
    currentCombatantId: 'b',
    combatants: [combatant('a', false), combatant('b', true), combatant('c', false)],
    ...over,
  } as CombatSnapshot;
}

/**
 * A controllable, CHANNEL-AWARE wsEvents stub with optional last-value replay.
 *
 * The layer subscribes to three channels (`character.delta`, `combat.turn`,
 * `combat.state`), so the stub keys handlers by channel. `emit` targets `character.delta`
 * (back-compat with the existing tests); `emitOn` targets an arbitrary channel. Replay is
 * delivered only on `character.delta` (mirrors a cached CharacterSnapshot).
 */
function makeWsEvents(replay?: unknown): ShowcaseWsEvents & {
  emit: (raw: unknown) => void;
  emitOn: (channel: string, raw: unknown) => void;
  unsubscribed: () => boolean;
  unsubscribedCount: () => number;
} {
  const handlers = new Map<string, (raw: unknown) => void>();
  const unsubbedChannels = new Set<string>();
  return {
    subscribe(channel, fn) {
      handlers.set(channel, fn);
      if (replay !== undefined && channel === 'character.delta') fn(replay); // last-value replay
      return () => {
        unsubbedChannels.add(channel);
      };
    },
    emit(raw) {
      handlers.get('character.delta')?.(raw);
    },
    emitOn(channel, raw) {
      handlers.get(channel)?.(raw);
    },
    unsubscribed: () => unsubbedChannels.has('character.delta'),
    unsubscribedCount: () => unsubbedChannels.size,
  };
}

/** A bridge whose updateImageRawData records calls and returns success. */
function makeBridge(): Pick<EvenAppBridge, 'updateImageRawData'> & {
  calls: Array<{ id: number | undefined; name: string | undefined }>;
} {
  const calls: Array<{ id: number | undefined; name: string | undefined }> = [];
  return {
    updateImageRawData: vi.fn(async (payload: { containerID?: number; containerName?: string }) => {
      calls.push({ id: payload.containerID, name: payload.containerName });
      return ImageRawDataUpdateResult.success;
    }),
    calls,
  } as unknown as Pick<EvenAppBridge, 'updateImageRawData'> & {
    calls: Array<{ id: number | undefined; name: string | undefined }>;
  };
}

/** A mutable 400×200 RGBA region the tests feed through the renderRegion seam. */
function makeRegion(fill = 0): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(REGION_W * REGION_H * 4);
  buf.fill(fill);
  // Set alpha so tiles are non-degenerate; content byte varies per test.
  for (let i = 3; i < buf.length; i += 4) buf[i] = 255;
  return buf;
}

/** The subset of the render model the tests inspect. */
interface CapturedModel {
  snapshot: CharacterSnapshot | null;
  round: number;
  turn: number;
  turnMax: number;
  battery: number | null;
}

interface Harness {
  layer: ShowcaseHudLayer;
  bridge: ReturnType<typeof makeBridge>;
  ws: ReturnType<typeof makeWsEvents>;
  region: Uint8ClampedArray;
  lastModel: () => CapturedModel;
}

/** Build a layer with an injected renderRegion returning the shared mutable region. */
function make(opts?: {
  replay?: unknown;
  region?: Uint8ClampedArray;
  bridge?: Pick<EvenAppBridge, 'updateImageRawData'>;
}): Harness {
  const bridge = opts?.bridge ?? makeBridge();
  const ws = makeWsEvents(opts?.replay);
  const region = opts?.region ?? makeRegion(10);
  let captured: CapturedModel = {
    snapshot: null,
    round: 0,
    turn: 0,
    turnMax: 0,
    battery: null,
  };
  const layer = new ShowcaseHudLayer({
    bridge,
    wsEvents: ws,
    minRedrawIntervalMs: 5,
    renderRegion: (model) => {
      captured = {
        snapshot: model.snapshot,
        round: model.round,
        turn: model.turn,
        turnMax: model.turnMax,
        battery: model.battery,
      };
      return region;
    },
  });
  return {
    layer,
    bridge: bridge as ReturnType<typeof makeBridge>,
    ws,
    region,
    lastModel: () => captured,
  };
}

/** Distinct RGBA for tile i's 200×100 quadrant so its hash differs after a mutation. */
function mutateTile(region: Uint8ClampedArray, tileIndex: number, value: number): void {
  // Tile layout (encodeRegionToTiles): id0 (0,0) id1 (200,0) id2 (0,100) id3 (200,100).
  const ox = tileIndex % 2 === 0 ? 0 : 200;
  const oy = tileIndex < 2 ? 0 : 100;
  const i = (oy * REGION_W + ox) * 4;
  region[i] = value;
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Subscription + replay ────────────────────────────────────────────────────────

describe('ShowcaseHudLayer — subscription', () => {
  it('last-value replay on subscribe caches the snapshot (rendered into the model)', async () => {
    const snap = makeSnapshot({ name: 'Replayed' });
    const { layer, lastModel } = make({ replay: snap });
    await layer.draw();
    expect(lastModel().snapshot?.name).toBe('Replayed');
    layer.destroy();
  });

  it('a valid character.delta updates the cached snapshot; a malformed one is ignored (no throw)', async () => {
    const { layer, ws, lastModel } = make();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    ws.emit(makeSnapshot({ name: 'Live' }));
    await layer.draw();
    expect(lastModel().snapshot?.name).toBe('Live');

    // Malformed → safeParse fails → warn + ignore, snapshot unchanged.
    expect(() => ws.emit({ not: 'a snapshot' })).not.toThrow();
    await layer.draw();
    expect(lastModel().snapshot?.name).toBe('Live');
    expect(warn).toHaveBeenCalled();
    layer.destroy();
  });

  it('destroy() releases the character.delta subscription', () => {
    const { layer, ws } = make();
    expect(ws.unsubscribed()).toBe(false);
    layer.destroy();
    expect(ws.unsubscribed()).toBe(true);
  });
});

// ── First frame / xxhash skip / changed tiles ────────────────────────────────────

describe('ShowcaseHudLayer — tile push + xxhash skip', () => {
  it('first cycle pushes all 4 tiles (prev hashes null)', async () => {
    const { layer, bridge } = make();
    await layer.draw();
    expect(bridge.calls.map((c) => c.id).sort()).toEqual([0, 1, 2, 3]);
    // Container names are the showcase schema names.
    expect(bridge.calls.every((c) => /^showcase-tile-[0-3]$/.test(c.name ?? ''))).toBe(true);
  });

  it('a second identical cycle pushes 0 tiles (per-tile xxhash skip)', async () => {
    const { layer, bridge } = make();
    await layer.draw();
    expect(bridge.calls).toHaveLength(4);
    await layer.draw(); // unchanged region → all hashes match → nothing pushed
    expect(bridge.calls).toHaveLength(4);
  });

  it('mutating one tile region pushes ONLY that changed tile', async () => {
    const { layer, bridge, region } = make();
    await layer.draw();
    expect(bridge.calls).toHaveLength(4);
    mutateTile(region, 2, 200); // change tile 2 only
    await layer.draw();
    const pushedAfter = bridge.calls.slice(4);
    expect(pushedAfter).toHaveLength(1);
    expect(pushedAfter[0]?.id).toBe(2);
  });

  it('a changed snapshot (via renderRegion output) pushes the changed tiles', async () => {
    // renderRegion returns bytes derived from the snapshot presence → a large luma
    // delta in tile 0's top-left pixel (0 → 255, survives the 4-bit dither) flips
    // only tile 0. This exercises the full delta → cycle → changed-tile push path.
    const bridge = makeBridge();
    const ws = makeWsEvents();
    const region = makeRegion(10);
    const layer = new ShowcaseHudLayer({
      bridge,
      wsEvents: ws,
      minRedrawIntervalMs: 5,
      renderRegion: (model) => {
        region[0] = model.snapshot ? 255 : 0; // tile-0 top-left R channel
        return region;
      },
    });
    await layer.draw(); // snapshot null → region[0]=0, pushes 4
    expect(bridge.calls).toHaveLength(4);
    ws.emit(makeSnapshot({ name: 'Aragorn' })); // snapshot present → region[0]=255
    await layer.draw();
    const after = bridge.calls.slice(4);
    expect(after).toHaveLength(1);
    expect(after[0]?.id).toBe(0);
    layer.destroy();
  });
});

// ── Source-quadrant delta gate (PERF: encode only changed tiles) ─────────────────
//
// The layer no longer dithers + UPNG-encodes all 4 tiles every cycle: it hashes each
// 200×100 SOURCE quadrant and encodes ONLY changed ones. These tests spy the encode
// seam (opts.encodeTile) to prove idle cycles encode ZERO tiles and a single-tile
// change encodes exactly one — the whole point of the optimization (zero-encode-on-idle).

describe('ShowcaseHudLayer — source-quadrant encode gate', () => {
  /** A layer wired with a spying encode seam that still produces real PNG bytes. */
  function makeGated(region: Uint8ClampedArray) {
    const bridge = makeBridge();
    const ws = makeWsEvents();
    const encodeTile = vi.fn((quad: Uint8ClampedArray, id: number) => encodeQuadrant(quad, id));
    const layer = new ShowcaseHudLayer({
      bridge,
      wsEvents: ws,
      minRedrawIntervalMs: 5,
      renderRegion: () => region,
      encodeTile,
    });
    return { bridge, ws, layer, encodeTile };
  }

  it('first cycle encodes all 4 tiles (baseline)', async () => {
    const { layer, encodeTile } = makeGated(makeRegion(10));
    await layer.draw();
    expect(encodeTile).toHaveBeenCalledTimes(4);
    expect(encodeTile.mock.calls.map((c) => c[1]).sort()).toEqual([0, 1, 2, 3]);
    layer.destroy();
  });

  it('an identical second cycle encodes ZERO tiles (zero-encode-on-idle)', async () => {
    const { layer, encodeTile } = makeGated(makeRegion(10));
    await layer.draw();
    expect(encodeTile).toHaveBeenCalledTimes(4);
    encodeTile.mockClear();
    await layer.draw(); // unchanged source → no quadrant hash changes → NO encode
    expect(encodeTile).not.toHaveBeenCalled();
    layer.destroy();
  });

  it('mutating one quadrant encodes ONLY that tile (not all 4)', async () => {
    const region = makeRegion(10);
    const { layer, encodeTile } = makeGated(region);
    await layer.draw();
    encodeTile.mockClear();
    mutateTile(region, 2, 200); // change only tile 2's source pixels
    await layer.draw();
    expect(encodeTile).toHaveBeenCalledTimes(1);
    expect(encodeTile.mock.calls[0]?.[1]).toBe(2);
    layer.destroy();
  });

  it('the changed tile is still transmitted to the bridge (encode gate does not drop pushes)', async () => {
    const region = makeRegion(10);
    const { layer, bridge } = makeGated(region);
    await layer.draw();
    const before = bridge.calls.length;
    mutateTile(region, 1, 77);
    await layer.draw();
    const pushed = bridge.calls.slice(before);
    expect(pushed).toHaveLength(1);
    expect(pushed[0]?.id).toBe(1);
    layer.destroy();
  });

  it('an overlay↔base transition forces a full 4-tile RE-ENCODE (rebuild-blank-tile guard)', async () => {
    const bridge = makeBridge();
    const ws = makeWsEvents();
    const encodeTile = vi.fn((quad: Uint8ClampedArray, id: number) => encodeQuadrant(quad, id));
    const overlay = new Uint8ClampedArray(576 * 288 * 4);
    for (let i = 3; i < overlay.length; i += 4) overlay[i] = 255;
    const downscaled = makeRegion(30);
    let overlayActive = false;
    const layer = new ShowcaseHudLayer({
      bridge,
      wsEvents: ws,
      minRedrawIntervalMs: 5,
      renderRegion: () => makeRegion(10),
      overlayDownscale: () => downscaled,
      encodeTile,
    });
    layer.setOverlaySource(() => (overlayActive ? overlay : null));

    await layer.draw(); // base HUD → 4 encodes
    expect(encodeTile).toHaveBeenCalledTimes(4);
    encodeTile.mockClear();

    overlayActive = true;
    await layer.draw(); // base→overlay transition forces all 4 (hashes reset)
    expect(encodeTile).toHaveBeenCalledTimes(4);
    layer.destroy();
  });
});

// ── Fail-soft / null snapshot / happy-dom no-canvas ──────────────────────────────

describe('ShowcaseHudLayer — robustness', () => {
  it('never throws with a null snapshot and no frame', async () => {
    const { layer } = make();
    await expect(layer.draw()).resolves.toBeUndefined();
    layer.destroy();
  });

  it('a non-success updateImageRawData result is fail-soft (logged, never thrown, still advances)', async () => {
    const ws = makeWsEvents();
    const region = makeRegion(10);
    const bridge = {
      updateImageRawData: vi.fn(async () => ImageRawDataUpdateResult.sendFailed),
    } as unknown as Pick<EvenAppBridge, 'updateImageRawData'>;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const layer = new ShowcaseHudLayer({ bridge, wsEvents: ws, renderRegion: () => region });
    await expect(layer.draw()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    layer.destroy();
  });

  it('a push rejection is fail-soft (logged, never thrown)', async () => {
    const ws = makeWsEvents();
    const region = makeRegion(10);
    const bridge = {
      updateImageRawData: vi.fn(async () => {
        throw new Error('BLE write failed');
      }),
    } as unknown as Pick<EvenAppBridge, 'updateImageRawData'>;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const layer = new ShowcaseHudLayer({
      bridge,
      wsEvents: ws,
      renderRegion: () => region,
    });
    await expect(layer.draw()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    layer.destroy();
  });

  it('no-canvas path (renderRegion returns null) is a clean no-op — zero pushes', async () => {
    const bridge = makeBridge();
    const ws = makeWsEvents();
    const layer = new ShowcaseHudLayer({
      bridge,
      wsEvents: ws,
      renderRegion: () => null, // mirrors happy-dom (no 2D context)
    });
    await layer.draw();
    expect(bridge.calls).toHaveLength(0);
    layer.destroy();
  });

  it("default (no injected renderRegion) is a no-op under happy-dom's null canvas", async () => {
    const bridge = makeBridge();
    const ws = makeWsEvents();
    const layer = new ShowcaseHudLayer({ bridge, wsEvents: ws });
    await expect(layer.draw()).resolves.toBeUndefined();
    expect(bridge.calls).toHaveLength(0);
    layer.destroy();
  });
});

// ── Layer contract + lifecycle ───────────────────────────────────────────────────

describe('ShowcaseHudLayer — Layer contract + lifecycle', () => {
  it('declares the capture container and a zero container footprint', () => {
    const { layer } = make();
    // Shared raster-capture invariant token (matches canvas OverlayPanels so a
    // composited z=2 overlay keeps _assertCaptureInvariant at exactly 1); the schema
    // container is still 'showcase-capture'.
    expect(layer.getCaptureContainer()).toBe('hud-capture');
    expect(layer.getContainerCount()).toEqual({ image: 0, text: 0 });
    expect(layer.id).toBe('showcase-hud');
    layer.destroy();
  });

  it('requestCycle() is a no-op until start(); start() then setFrame push through the throttle', async () => {
    const { layer, bridge } = make();
    // Not started yet → requestCycle schedules nothing.
    layer.requestCycle();
    await new Promise((r) => setTimeout(r, 20));
    expect(bridge.calls).toHaveLength(0);

    // start() kicks the first cycle through the (5ms) throttle.
    layer.start();
    await new Promise((r) => setTimeout(r, 30));
    expect(bridge.calls.length).toBeGreaterThanOrEqual(4);
    layer.destroy();
  });

  it('setFrame marks the layer dirty and (once started) drives a redraw', async () => {
    const { layer, bridge, region } = make();
    layer.start();
    await new Promise((r) => setTimeout(r, 30));
    const afterFirst = bridge.calls.length;
    expect(afterFirst).toBeGreaterThanOrEqual(4);

    // A new frame that changes a tile → setFrame kicks a cycle → ≥1 more push.
    mutateTile(region, 1, 123);
    layer.setFrame(new Uint8ClampedArray(4), 1, 1);
    await new Promise((r) => setTimeout(r, 30));
    expect(bridge.calls.length).toBeGreaterThan(afterFirst);
    layer.destroy();
  });

  it('stop() halts the driver: requestCycle after stop pushes nothing', async () => {
    const { layer, bridge } = make();
    layer.start();
    await new Promise((r) => setTimeout(r, 30));
    const n = bridge.calls.length;
    layer.stop();
    layer.requestCycle();
    await new Promise((r) => setTimeout(r, 30));
    expect(bridge.calls.length).toBe(n);
    layer.destroy();
  });

  it('start() is idempotent (a second start() while running is a no-op)', () => {
    const { layer } = make();
    layer.start();
    expect(() => layer.start()).not.toThrow(); // early-return branch
    layer.destroy();
  });

  it('stop() while a throttle timer is pending clears it (no late push)', async () => {
    const { layer, bridge } = make();
    layer.start(); // schedules a timer (5ms)
    layer.stop(); // timer !== null → cleared before it fires
    await new Promise((r) => setTimeout(r, 30));
    expect(bridge.calls).toHaveLength(0);
    layer.destroy();
  });

  it('a burst of requestCycle calls coalesces (busy branch) into a trailing-edge re-arm', async () => {
    const { layer, bridge, region } = make();
    layer.start(); // arms the timer
    // Fire more kicks while the timer is pending → busy branch sets _pendingAgain.
    layer.requestCycle();
    mutateTile(region, 3, 190);
    layer.requestCycle();
    // Let the first cycle fire + the trailing-edge follow-up run.
    await new Promise((r) => setTimeout(r, 40));
    // First cycle pushed 4; the re-armed follow-up pushed the mutated tile.
    expect(bridge.calls.length).toBeGreaterThanOrEqual(4);
    layer.destroy();
  });
});

// ── Feature 002 z=2 overlay source ───────────────────────────────────────────────
//
// When an overlay source returns a 576×288 composite, the layer downscales it to the
// 400×200 region (via the injectable overlayDownscale seam under happy-dom) and pushes
// THAT instead of the base HUD; clearing it (source returns null) restores the base HUD.

/** A 576×288 RGBA overlay composite (opaque, content byte in the top-left). */
function makeOverlay576(fill = 20): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(576 * 288 * 4);
  buf.fill(fill);
  for (let i = 3; i < buf.length; i += 4) buf[i] = 255;
  return buf;
}

describe('ShowcaseHudLayer — z=2 overlay source', () => {
  it('with an overlay source active, a cycle composites+scales+pushes 4 tiles from the overlay (not the base HUD)', async () => {
    const bridge = makeBridge();
    const ws = makeWsEvents();
    const overlay = makeOverlay576(20);
    const baseRegion = makeRegion(10);
    const downscaled = makeRegion(30); // synthetic 400×200 result of the 576→400 scale
    const downscale = vi.fn((_src: Uint8ClampedArray) => downscaled);
    const layer = new ShowcaseHudLayer({
      bridge,
      wsEvents: ws,
      minRedrawIntervalMs: 5,
      renderRegion: () => baseRegion,
      overlayDownscale: downscale,
    });
    layer.setOverlaySource(() => overlay);
    await layer.draw();
    // Downscaler ran on the 576×288 buffer; all 4 tiles pushed (first cycle).
    expect(downscale).toHaveBeenCalledWith(overlay);
    expect(bridge.calls.map((c) => c.id).sort()).toEqual([0, 1, 2, 3]);
    expect(bridge.calls.every((c) => /^showcase-tile-[0-3]$/.test(c.name ?? ''))).toBe(true);
    layer.destroy();
  });

  it('clearing the overlay (source returns null) restores the base-HUD render and forces a full 4-tile push', async () => {
    const bridge = makeBridge();
    const ws = makeWsEvents();
    const overlay = makeOverlay576(20);
    const baseRegion = makeRegion(10);
    const downscaled = makeRegion(30);
    let overlayActive = true;
    const renderRegion = vi.fn(() => baseRegion);
    const layer = new ShowcaseHudLayer({
      bridge,
      wsEvents: ws,
      minRedrawIntervalMs: 5,
      renderRegion,
      overlayDownscale: () => downscaled,
    });
    layer.setOverlaySource(() => (overlayActive ? overlay : null));

    await layer.draw(); // overlay active → base renderRegion NOT called
    expect(renderRegion).not.toHaveBeenCalled();
    const afterOverlay = bridge.calls.length;
    expect(afterOverlay).toBe(4);

    // Clear the overlay → transition forces all 4 tiles; base HUD render path runs.
    overlayActive = false;
    await layer.draw();
    expect(renderRegion).toHaveBeenCalled();
    expect(bridge.calls.length - afterOverlay).toBe(4); // full push on the transition
    layer.destroy();
  });

  it('xxhash skip still holds WITHIN an overlay session (identical overlay → 0 pushes on the 2nd cycle)', async () => {
    const bridge = makeBridge();
    const ws = makeWsEvents();
    const overlay = makeOverlay576(20);
    const downscaled = makeRegion(30);
    const layer = new ShowcaseHudLayer({
      bridge,
      wsEvents: ws,
      minRedrawIntervalMs: 5,
      renderRegion: () => makeRegion(10),
      overlayDownscale: () => downscaled, // same buffer each cycle
    });
    layer.setOverlaySource(() => overlay);
    await layer.draw(); // first overlay cycle → 4 tiles
    expect(bridge.calls).toHaveLength(4);
    await layer.draw(); // identical downscaled overlay → per-tile hashes match → 0
    expect(bridge.calls).toHaveLength(4);
    layer.destroy();
  });

  it('a no-canvas overlay downscale (returns null) is a clean no-op — zero pushes', async () => {
    const bridge = makeBridge();
    const ws = makeWsEvents();
    const layer = new ShowcaseHudLayer({
      bridge,
      wsEvents: ws,
      renderRegion: () => makeRegion(10),
      overlayDownscale: () => null, // mirrors happy-dom (no 2D context)
    });
    layer.setOverlaySource(() => makeOverlay576(20));
    await layer.draw();
    expect(bridge.calls).toHaveLength(0);
    layer.destroy();
  });

  it('setOverlaySource(null) with no prior overlay renders the base HUD', async () => {
    const bridge = makeBridge();
    const ws = makeWsEvents();
    const baseRegion = makeRegion(10);
    const layer = new ShowcaseHudLayer({
      bridge,
      wsEvents: ws,
      minRedrawIntervalMs: 5,
      renderRegion: () => baseRegion,
    });
    layer.setOverlaySource(null);
    await layer.draw();
    expect(bridge.calls.map((c) => c.id).sort()).toEqual([0, 1, 2, 3]);
    layer.destroy();
  });
});

// ── Default canvas render path (fake OffscreenCanvas + ImageData env) ─────────────
//
// happy-dom returns a null 2D context, so the layer's own-canvas render path
// (_acquireCtx / _renderRegionViaCanvas / drawShowcaseHud / paintMap / scratch
// canvas) is unreachable without a canvas env. These tests install a minimal fake
// OffscreenCanvas + ImageData so the DEFAULT (uninjected) renderRegion path runs.

/** A recording 2D-context whose getImageData returns a zeroed RGBA of its canvas. */
function fakeCanvasEnv(): { restore: () => void } {
  const prevOffscreen = (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas;
  const prevImageData = (globalThis as { ImageData?: unknown }).ImageData;
  const prevHadOffscreen = 'OffscreenCanvas' in globalThis;
  const prevHadImageData = 'ImageData' in globalThis;

  class FakeImageData {
    constructor(
      public data: Uint8ClampedArray,
      public width: number,
      public height: number,
    ) {}
  }

  class FakeOffscreenCanvas {
    getContext: () => unknown;
    constructor(
      public width: number,
      public height: number,
    ) {
      const canvas = this;
      const ctx: Record<string, unknown> = {
        canvas,
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 0,
        font: '',
        textAlign: '',
        textBaseline: '',
        fillRect: () => {},
        strokeRect: () => {},
        fillText: () => {},
        beginPath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        stroke: () => {},
        rect: () => {},
        fill: () => {},
        putImageData: () => {},
        drawImage: () => {},
        getImageData: (_x: number, _y: number, w: number, h: number) => ({
          data: new Uint8ClampedArray(w * h * 4),
        }),
      };
      this.getContext = () => ctx;
    }
  }

  (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas = FakeOffscreenCanvas;
  (globalThis as { ImageData?: unknown }).ImageData = FakeImageData;

  return {
    restore() {
      if (prevHadOffscreen) {
        (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas = prevOffscreen;
      } else {
        delete (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas;
      }
      if (prevHadImageData) {
        (globalThis as { ImageData?: unknown }).ImageData = prevImageData;
      } else {
        delete (globalThis as { ImageData?: unknown }).ImageData;
      }
    },
  };
}

describe('ShowcaseHudLayer — default canvas render path', () => {
  let env: { restore: () => void };
  beforeEach(() => {
    env = fakeCanvasEnv();
  });
  afterEach(() => {
    env.restore();
  });

  it('renders via its own canvas (no injected renderRegion) and pushes 4 tiles on the first cycle', async () => {
    const bridge = makeBridge();
    const ws = makeWsEvents();
    const layer = new ShowcaseHudLayer({ bridge, wsEvents: ws });
    await layer.draw(); // drawShowcaseHud → getImageData → encode → push all 4
    expect(bridge.calls.map((c) => c.id).sort()).toEqual([0, 1, 2, 3]);
    layer.destroy();
  });

  it('overlay source uses the DEFAULT canvas downscaler (576→400) and pushes 4 tiles', async () => {
    const bridge = makeBridge();
    const ws = makeWsEvents();
    // No overlayDownscale injected → the layer scales via its own canvas (_downscaleViaCanvas).
    const layer = new ShowcaseHudLayer({ bridge, wsEvents: ws });
    const overlay = new Uint8ClampedArray(576 * 288 * 4);
    for (let i = 3; i < overlay.length; i += 4) overlay[i] = 255;
    layer.setOverlaySource(() => overlay);
    await layer.draw(); // putImageData(576) → drawImage(scale→400) → getImageData → encode → push
    expect(bridge.calls.map((c) => c.id).sort()).toEqual([0, 1, 2, 3]);
    // A second identical overlay cycle reuses the cached 576 scratch ctx (no throw).
    await expect(layer.draw()).resolves.toBeUndefined();
    layer.destroy();
  });

  it('paintMap uses the scratch canvas (scale) once a frame is set — still renders without throwing', async () => {
    const bridge = makeBridge();
    const ws = makeWsEvents(makeSnapshot({ name: 'Framed' }));
    const layer = new ShowcaseHudLayer({ bridge, wsEvents: ws });
    // Provide a small frame so paintMap takes the scratch-canvas scale branch.
    const frame = new Uint8ClampedArray(8 * 4 * 4);
    for (let i = 3; i < frame.length; i += 4) frame[i] = 255;
    layer.setFrame(frame, 8, 4);
    await expect(layer.draw()).resolves.toBeUndefined();
    expect(bridge.calls.length).toBeGreaterThanOrEqual(1);
    // A second draw with the SAME frame dims reuses the cached scratch canvas.
    await expect(layer.draw()).resolves.toBeUndefined();
    layer.destroy();
  });
});

// ── Combat channel (combat.turn / combat.state) ──────────────────────────────────
//
// The layer subscribes to BOTH combat channels in its constructor (so wsEventBus
// last-value replay works), gates payloads with CombatSnapshotSchema.safeParse, and
// maps round/turn/turnMax into the render model. turn stays 0-indexed here (the renderer
// displays turn+1).

describe('ShowcaseHudLayer — combat channel', () => {
  it('a valid combat.turn snapshot sets round/turn/turnMax and repaints', async () => {
    const { layer, ws, lastModel } = make();
    layer.start();
    await new Promise((r) => setTimeout(r, 20));

    ws.emitOn(COMBAT_TURN_DELTA_TYPE, makeCombat({ round: 4, turn: 2 }));
    // The delta schedules a repaint; the captured model (set inside renderRegion) reflects
    // the new values only if that repaint cycle actually ran.
    await new Promise((r) => setTimeout(r, 20));
    const m = lastModel();
    expect(m.round).toBe(4);
    expect(m.turn).toBe(2); // 0-indexed; renderer displays turn+1
    expect(m.turnMax).toBe(3); // combatants.length
    layer.destroy();
  });

  it('a valid combat.state snapshot also updates round/turn/turnMax (shared handler)', async () => {
    const { layer, ws, lastModel } = make();
    ws.emitOn(COMBAT_STATE_DELTA_TYPE, makeCombat({ round: 7, turn: 0, combatants: [] as never }));
    await layer.draw();
    const m = lastModel();
    expect(m.round).toBe(7);
    expect(m.turn).toBe(0);
    expect(m.turnMax).toBe(0);
    layer.destroy();
  });

  it('a malformed combat payload is ignored (no throw; round/turn unchanged)', async () => {
    const { layer, ws, lastModel } = make();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    ws.emitOn(COMBAT_TURN_DELTA_TYPE, makeCombat({ round: 5, turn: 1 }));
    await layer.draw();
    expect(lastModel().round).toBe(5);

    expect(() => ws.emitOn(COMBAT_TURN_DELTA_TYPE, { not: 'a combat' })).not.toThrow();
    await layer.draw();
    expect(lastModel().round).toBe(5); // unchanged
    expect(warn).toHaveBeenCalled();
    layer.destroy();
  });

  it('last-value replay: a combat snapshot cached before start still renders (constructor subscribe)', async () => {
    // The stub only replays on character.delta, so emit BEFORE the first draw to mimic a
    // boot-time cached combat snapshot delivered on subscribe.
    const { layer, ws, lastModel } = make();
    ws.emitOn(COMBAT_STATE_DELTA_TYPE, makeCombat({ round: 1, turn: 0 }));
    await layer.draw();
    expect(lastModel().round).toBe(1);
    layer.destroy();
  });

  it('destroy() releases the combat subscriptions (all channels unsubscribed)', () => {
    const { layer, ws } = make();
    // character.delta + combat.turn + combat.state = 3 subscriptions.
    layer.destroy();
    expect(ws.unsubscribedCount()).toBe(3);
  });
});

// ── R1 battery (onDeviceStatusChanged) ───────────────────────────────────────────
//
// The layer subscribes to bridge.onDeviceStatusChanged in its constructor (fail-soft:
// absent/throwing → battery stays null). A reported batteryLevel sets battery; an
// undefined level resets it to null (renders ⌁—).

/** A bridge whose updateImageRawData succeeds AND exposes a capturable onDeviceStatusChanged. */
function makeBridgeWithDeviceStatus(over?: {
  onDeviceStatusChanged?: (cb: (s: { batteryLevel?: number }) => void) => () => void;
}): Pick<EvenAppBridge, 'updateImageRawData'> & {
  emitStatus: (s: { batteryLevel?: number }) => void;
  statusUnsubscribed: () => boolean;
} {
  let cb: ((s: { batteryLevel?: number }) => void) | null = null;
  let unsubbed = false;
  const defaultOn = (fn: (s: { batteryLevel?: number }) => void) => {
    cb = fn;
    return () => {
      unsubbed = true;
    };
  };
  return {
    updateImageRawData: vi.fn(async () => ImageRawDataUpdateResult.success),
    onDeviceStatusChanged: over?.onDeviceStatusChanged ?? defaultOn,
    emitStatus: (s: { batteryLevel?: number }) => cb?.(s),
    statusUnsubscribed: () => unsubbed,
  } as unknown as Pick<EvenAppBridge, 'updateImageRawData'> & {
    emitStatus: (s: { batteryLevel?: number }) => void;
    statusUnsubscribed: () => boolean;
  };
}

describe('ShowcaseHudLayer — R1 battery', () => {
  it('battery defaults to null (unknown) until the first device-status update', async () => {
    const { layer, lastModel } = make();
    await layer.draw();
    expect(lastModel().battery).toBeNull();
    layer.destroy();
  });

  it('a device-status callback sets the battery percent (rendered into the model)', async () => {
    const bridge = makeBridgeWithDeviceStatus();
    const { layer, lastModel } = make({ bridge });
    bridge.emitStatus({ batteryLevel: 73 });
    await layer.draw();
    expect(lastModel().battery).toBe(73);
    layer.destroy();
  });

  it('an undefined batteryLevel resets battery to null', async () => {
    const bridge = makeBridgeWithDeviceStatus();
    const { layer, lastModel } = make({ bridge });
    bridge.emitStatus({ batteryLevel: 50 });
    await layer.draw();
    expect(lastModel().battery).toBe(50);
    bridge.emitStatus({}); // no batteryLevel
    await layer.draw();
    expect(lastModel().battery).toBeNull();
    layer.destroy();
  });

  it('a throwing onDeviceStatusChanged is fail-soft (battery stays null, no throw)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const bridge = makeBridgeWithDeviceStatus({
      onDeviceStatusChanged: () => {
        throw new Error('device status unavailable');
      },
    });
    const { layer, lastModel } = make({ bridge });
    await layer.draw();
    expect(lastModel().battery).toBeNull();
    expect(warn).toHaveBeenCalled();
    layer.destroy();
  });

  it('destroy() releases the device-status subscription', () => {
    const bridge = makeBridgeWithDeviceStatus();
    const { layer } = make({ bridge });
    expect(bridge.statusUnsubscribed()).toBe(false);
    layer.destroy();
    expect(bridge.statusUnsubscribed()).toBe(true);
  });

  it('setBattery(null) renders the unknown-battery placeholder via the model', async () => {
    const bridge = makeBridgeWithDeviceStatus();
    const { layer, lastModel } = make({ bridge });
    bridge.emitStatus({ batteryLevel: 88 });
    await layer.draw();
    expect(lastModel().battery).toBe(88);
    layer.setBattery(null);
    await layer.draw();
    expect(lastModel().battery).toBeNull();
    layer.destroy();
  });
});
