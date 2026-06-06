/**
 * hud-live-render.test.ts — unit tests for the pure render-once orchestrator.
 *
 * Tests cover (no canvas, no real renderHudFrame — injected fakes via vi.fn()):
 *   1. Happy path: render → assemble → push called in order, once each.
 *   2. Fail-soft render: when deps.render throws, onError is called, push is NOT
 *      called, and renderRasterHudFrame resolves (does not reject).
 *   3. Fail-soft push: when deps.push rejects, onError is called, function still
 *      resolves (subscription survives across snapshots).
 *   4. makeSnapshotRenderHandler: runs CharacterSnapshotSchema.safeParse(raw);
 *      on parse failure calls deps.onParseFailure and does NOT invoke render;
 *      on success invokes renderRasterHudFrame with the parsed snapshot.
 *
 * T-m4e-01 mitigation coverage: parse gate tested in Test 4.
 * T-m4e-02 mitigation coverage: render/push fail-soft tested in Tests 2 + 3.
 *
 * @see packages/g2-app/src/hud/hud-live-render.ts
 * @see docs/architecture/0013-hud-raster-rendering.md (ADR-0013)
 */

import type { CharacterSnapshot } from '@evf/shared-protocol';
import { describe, expect, it, vi } from 'vitest';
import {
  makeSnapshotRenderHandler,
  type RasterHudRenderDeps,
  renderRasterHudFrame,
} from './hud-live-render.js';
import type { HudTile } from './hud-raster-frame.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

/**
 * Minimal valid CharacterSnapshot — mirrors the FALLBACK_SNAPSHOT shape from
 * boot-hud-raster-poc.ts to avoid duplicating the full schema here.
 */
const MINIMAL_SNAPSHOT: CharacterSnapshot = {
  class: 'Fighter',
  initiative: 2,
  speed: 30,
  actorId: 'test-actor',
  name: 'Test Hero',
  hp: 12,
  maxHp: 20,
  tempHp: 0,
  ac: 14,
  level: 3,
  conditions: [],
  exhaustion: 0,
  death: { success: 0, failure: 0 },
  world: { modernRules: false },
  inventory: [],
  spells: { slots: [], spells: [] },
  abilities: {
    str: { value: 10, mod: 0, save: 0, proficient: false, dc: 10 },
    dex: { value: 10, mod: 0, save: 0, proficient: false, dc: 10 },
    con: { value: 10, mod: 0, save: 0, proficient: false, dc: 10 },
    int: { value: 10, mod: 0, save: 0, proficient: false, dc: 10 },
    wis: { value: 10, mod: 0, save: 0, proficient: false, dc: 10 },
    cha: { value: 10, mod: 0, save: 0, proficient: false, dc: 10 },
  },
  skills: {
    acr: { total: 0, ability: 'dex', proficient: 0, passive: 10 },
    ani: { total: 0, ability: 'wis', proficient: 0, passive: 10 },
    arc: { total: 0, ability: 'int', proficient: 0, passive: 10 },
    ath: { total: 0, ability: 'str', proficient: 0, passive: 10 },
    dec: { total: 0, ability: 'cha', proficient: 0, passive: 10 },
    his: { total: 0, ability: 'int', proficient: 0, passive: 10 },
    ins: { total: 0, ability: 'wis', proficient: 0, passive: 10 },
    itm: { total: 0, ability: 'cha', proficient: 0, passive: 10 },
    inv: { total: 0, ability: 'int', proficient: 0, passive: 10 },
    med: { total: 0, ability: 'wis', proficient: 0, passive: 10 },
    nat: { total: 0, ability: 'int', proficient: 0, passive: 10 },
    prc: { total: 0, ability: 'wis', proficient: 0, passive: 10 },
    prf: { total: 0, ability: 'cha', proficient: 0, passive: 10 },
    per: { total: 0, ability: 'cha', proficient: 0, passive: 10 },
    rel: { total: 0, ability: 'int', proficient: 0, passive: 10 },
    slt: { total: 0, ability: 'dex', proficient: 0, passive: 10 },
    ste: { total: 0, ability: 'dex', proficient: 0, passive: 10 },
    sur: { total: 0, ability: 'wis', proficient: 0, passive: 10 },
  },
};

/** Fake RGBA pixel data returned by a stub render. */
const FAKE_RGBA = new Uint8ClampedArray([255, 0, 0, 255]);

/** Fake tiles returned by a stub assemble. */
const FAKE_TILES: HudTile[] = [
  { containerName: 'hud-tile-0', containerID: 0, bytes: new Uint8Array([1]) },
];

/**
 * Build a fully-stubbed deps object with all methods as vi.fn().
 * Caller can override individual fns after creation.
 */
function makeDeps(): RasterHudRenderDeps {
  return {
    render: vi.fn().mockReturnValue(FAKE_RGBA),
    assemble: vi.fn().mockReturnValue(FAKE_TILES),
    push: vi.fn().mockResolvedValue(undefined),
    onError: vi.fn(),
  };
}

// ── renderRasterHudFrame ──────────────────────────────────────────────────────

describe('renderRasterHudFrame', () => {
  it('Test 1: calls render → assemble → push in order, exactly once each', async () => {
    const deps = makeDeps();
    const callOrder: string[] = [];
    (deps.render as ReturnType<typeof vi.fn>).mockImplementation(() => {
      callOrder.push('render');
      return FAKE_RGBA;
    });
    (deps.assemble as ReturnType<typeof vi.fn>).mockImplementation(() => {
      callOrder.push('assemble');
      return FAKE_TILES;
    });
    (deps.push as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      callOrder.push('push');
    });

    await renderRasterHudFrame(MINIMAL_SNAPSHOT, deps);

    expect(deps.render).toHaveBeenCalledTimes(1);
    expect(deps.render).toHaveBeenCalledWith(MINIMAL_SNAPSHOT);
    expect(deps.assemble).toHaveBeenCalledTimes(1);
    expect(deps.assemble).toHaveBeenCalledWith(FAKE_RGBA);
    expect(deps.push).toHaveBeenCalledTimes(1);
    expect(deps.push).toHaveBeenCalledWith(FAKE_TILES);
    expect(callOrder).toEqual(['render', 'assemble', 'push']);
  });

  it('Test 2: when render throws — onError called, push NOT called, resolves', async () => {
    const deps = makeDeps();
    const renderError = new Error('canvas exploded');
    (deps.render as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw renderError;
    });

    // Must resolve, not reject
    await expect(renderRasterHudFrame(MINIMAL_SNAPSHOT, deps)).resolves.toBeUndefined();

    expect(deps.onError).toHaveBeenCalledTimes(1);
    expect(deps.onError).toHaveBeenCalledWith(renderError);
    expect(deps.push).not.toHaveBeenCalled();
  });

  it('Test 3: when push rejects — onError called, function still resolves', async () => {
    const deps = makeDeps();
    const pushError = new Error('bridge write failed');
    (deps.push as ReturnType<typeof vi.fn>).mockRejectedValue(pushError);

    // Must resolve, not reject
    await expect(renderRasterHudFrame(MINIMAL_SNAPSHOT, deps)).resolves.toBeUndefined();

    expect(deps.onError).toHaveBeenCalledTimes(1);
    expect(deps.onError).toHaveBeenCalledWith(pushError);
    // render + assemble were still called before push failed
    expect(deps.render).toHaveBeenCalledTimes(1);
    expect(deps.assemble).toHaveBeenCalledTimes(1);
  });
});

// ── makeSnapshotRenderHandler ─────────────────────────────────────────────────

describe('makeSnapshotRenderHandler', () => {
  it('Test 4a: parse failure — calls onParseFailure, does NOT call render', () => {
    const deps = makeDeps();
    const onParseFailure = vi.fn();
    const handler = makeSnapshotRenderHandler(deps, onParseFailure);

    // Raw payload that is NOT a valid CharacterSnapshot
    const malformed: unknown = { notASnapshot: true, missing: 'required fields' };
    handler(malformed);

    expect(onParseFailure).toHaveBeenCalledTimes(1);
    expect(deps.render).not.toHaveBeenCalled();
    expect(deps.push).not.toHaveBeenCalled();
  });

  it('Test 4b: parse success — invokes renderRasterHudFrame with parsed snapshot', async () => {
    const deps = makeDeps();
    const onParseFailure = vi.fn();
    const handler = makeSnapshotRenderHandler(deps, onParseFailure);

    // Valid raw snapshot — handler is fire-and-forget; we need to let the
    // microtask queue drain to observe the render call.
    handler(MINIMAL_SNAPSHOT as unknown);
    // Drain microtasks
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(onParseFailure).not.toHaveBeenCalled();
    expect(deps.render).toHaveBeenCalledTimes(1);
    expect(deps.render).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'test-actor', hp: 12 }),
    );
    expect(deps.push).toHaveBeenCalledTimes(1);
  });
});
