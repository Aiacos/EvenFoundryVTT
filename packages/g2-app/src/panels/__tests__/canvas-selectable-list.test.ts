/**
 * Feature 001 (Option B) — canvas interactive Inventory/Spellbook panels.
 *
 * Verifies the shared selection behaviour without a real canvas: a cursor moves on
 * scroll, and a tap dispatches the correct {@link ActionOptionsRequest} for the
 * entry under the cursor (kind/itemId/requiresTarget byte-identical to the glyph
 * panels). The render/resolve hooks are reused from the glyph standalone panels.
 */

import type { CharacterSnapshot } from '@evf/shared-protocol';
import { describe, expect, it, vi } from 'vitest';
import type { PanelGestureBus } from '../../engine/panel-gesture-bus.js';
import type { ActionOptionsRequest } from '../action-options-modal.js';
import CanvasInventoryPanel from '../canvas-inventory-panel.js';
import {
  CANVAS_LIST_VISIBLE_ROWS,
  clampCursorIndex,
  windowCursorRows,
} from '../canvas-selectable-list.js';
import CanvasSpellbookPanel from '../canvas-spellbook-panel.js';

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

function makeSnapshot(over: Partial<CharacterSnapshot> = {}): CharacterSnapshot {
  return {
    actorId: 'actor-shin',
    name: 'Shin',
    hp: 30,
    maxHp: 30,
    tempHp: 0,
    ac: 16,
    level: 5,
    class: 'Wizard',
    initiative: 2,
    speed: 30,
    conditions: [],
    exhaustion: 0,
    death: { success: 0, failure: 0 },
    world: { modernRules: false },
    inventory: [
      { id: 'w1', name: 'Spada lunga', type: 'weapon' },
      { id: 'p1', name: 'Pozione', type: 'consumable' },
    ],
    spells: {
      slots: [{ level: 1, value: 2, max: 2 }],
      spells: [
        {
          id: 's1',
          name: 'Dardo Incantato',
          level: 1,
          school: 'evocation',
          activation: 'action',
          range: '36m',
          effect: '1d4+1 forza',
          prepared: true,
          alwaysPrepared: false,
          concentration: false,
        },
      ],
    },
    abilities: {
      str: ability(10, 0),
      dex: ability(14, 2),
      con: ability(12, 1),
      int: ability(18, 4),
      wis: ability(12, 1),
      cha: ability(10, 0),
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

/** A gesture bus stub whose subscribe is a no-op (we call onEvent directly). */
const busStub = { subscribe: vi.fn(() => () => {}) } as unknown as PanelGestureBus;
const bridgeStub = {} as never;

describe('CanvasInventoryPanel — cursor + tap dispatch', () => {
  it('tap dispatches a use-item request for the entry under the cursor', () => {
    const panel = new CanvasInventoryPanel(bridgeStub, busStub, 'it');
    const handler = vi.fn<(req: ActionOptionsRequest) => void>();
    panel.setActionOptionsHandler(handler);
    panel.onSnapshot(makeSnapshot());

    // Cursor starts on the first item (Spada lunga / w1).
    panel.onEvent({ kind: 'tap' });

    expect(handler).toHaveBeenCalledTimes(1);
    const req = handler.mock.calls[0]?.[0];
    expect(req?.kind).toBe('item');
    expect(req?.actorId).toBe('actor-shin');
    expect(req?.itemId).toBe('w1');
    expect(req?.name).toBe('Spada lunga');
    // A weapon opens the TargetPicker; itemType lets boot route it to weapon-attack.
    expect(req?.requiresTarget).toBe(true);
    expect(req?.itemType).toBe('weapon');
  });

  it('non-weapon equipment does NOT open the picker (use-item ignores targets)', () => {
    const panel = new CanvasInventoryPanel(bridgeStub, busStub, 'it');
    const handler = vi.fn<(req: ActionOptionsRequest) => void>();
    panel.setActionOptionsHandler(handler);
    panel.onSnapshot(
      makeSnapshot({
        inventory: [{ id: 'e1', name: 'Scudo', type: 'equipment' }],
      } as Partial<CharacterSnapshot>),
    );
    panel.onEvent({ kind: 'tap' });
    const req = handler.mock.calls[0]?.[0];
    expect(req?.itemId).toBe('e1');
    expect(req?.requiresTarget).toBe(false);
    expect(req?.itemType).toBe('equipment');
  });

  it('cursor follows scroll-down; tap dispatches the newly highlighted entry (consumable → no target)', () => {
    const panel = new CanvasInventoryPanel(bridgeStub, busStub, 'it');
    const handler = vi.fn<(req: ActionOptionsRequest) => void>();
    panel.setActionOptionsHandler(handler);
    panel.onSnapshot(makeSnapshot());

    // Move the ▶ cursor to the second item (Pozione / p1) and activate it.
    panel.onEvent({ kind: 'scroll', direction: 'down' });
    panel.onEvent({ kind: 'tap' });

    const req = handler.mock.calls[0]?.[0];
    expect(req?.itemId).toBe('p1');
    expect(req?.name).toBe('Pozione');
    // Consumables self-target by default → dispatch directly, no target picker.
    expect(req?.requiresTarget).toBe(false);
  });

  it('scroll moves the cursor off the top boundary; tap with no handler is a safe no-op', () => {
    const panel = new CanvasInventoryPanel(bridgeStub, busStub, 'it');
    panel.onSnapshot(makeSnapshot());
    expect(panel.isAtTopBoundary()).toBe(true);
    panel.onEvent({ kind: 'scroll', direction: 'down' });
    expect(panel.isAtTopBoundary()).toBe(false);
    panel.onEvent({ kind: 'scroll', direction: 'up' });
    expect(panel.isAtTopBoundary()).toBe(true);
    // No handler wired → tap must not throw.
    expect(() => panel.onEvent({ kind: 'tap' })).not.toThrow();
  });

  it('tap before any snapshot is a no-op (no handler call, no throw)', () => {
    const panel = new CanvasInventoryPanel(bridgeStub, busStub, 'it');
    const handler = vi.fn();
    panel.setActionOptionsHandler(handler);
    expect(() => panel.onEvent({ kind: 'tap' })).not.toThrow();
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('CanvasSpellbookPanel — cursor + tap dispatch', () => {
  it('tap dispatches a cast-spell request for the entry under the cursor', () => {
    const panel = new CanvasSpellbookPanel(bridgeStub, busStub, 'it');
    const handler = vi.fn<(req: ActionOptionsRequest) => void>();
    panel.setActionOptionsHandler(handler);
    panel.onSnapshot(makeSnapshot());

    panel.onEvent({ kind: 'tap' });

    expect(handler).toHaveBeenCalledTimes(1);
    const req = handler.mock.calls[0]?.[0];
    expect(req?.kind).toBe('spell');
    expect(req?.actorId).toBe('actor-shin');
    expect(req?.itemId).toBe('s1');
    expect(req?.name).toBe('Dardo Incantato');
    // A ranged (range '36m'), non-reaction spell needs a target → boot opens the TargetPicker.
    expect(req?.requiresTarget).toBe(true);
  });

  it('self-range and reaction spells dispatch directly (requiresTarget=false)', () => {
    const panel = new CanvasSpellbookPanel(bridgeStub, busStub, 'it');
    const handler = vi.fn<(req: ActionOptionsRequest) => void>();
    panel.setActionOptionsHandler(handler);
    panel.onSnapshot(
      makeSnapshot({
        spells: {
          slots: [{ level: 1, value: 2, max: 2 }],
          spells: [
            {
              id: 'self1',
              name: 'Scudo Arcano',
              level: 1,
              school: 'abjuration',
              activation: 'action',
              range: 'self',
              effect: '',
              prepared: true,
              alwaysPrepared: false,
              concentration: false,
            },
            {
              id: 'rx1',
              name: 'Assorbire Elementi',
              level: 1,
              school: 'abjuration',
              activation: 'reaction',
              range: 'self',
              effect: '',
              prepared: true,
              alwaysPrepared: false,
              concentration: false,
            },
          ],
        },
      } as Partial<CharacterSnapshot>),
    );

    // Cursor on the self spell.
    panel.onEvent({ kind: 'tap' });
    expect(handler.mock.calls[0]?.[0]?.requiresTarget).toBe(false);
    // Scroll to the reaction spell and tap.
    panel.onEvent({ kind: 'scroll', direction: 'down' });
    panel.onEvent({ kind: 'tap' });
    expect(handler.mock.calls[1]?.[0]?.requiresTarget).toBe(false);
  });

  it('ignores a malformed character.delta payload (T-20-01)', () => {
    const panel = new CanvasSpellbookPanel(bridgeStub, busStub, 'it');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => panel.onSnapshot({ not: 'a snapshot' })).not.toThrow();
    warn.mockRestore();
  });

  it('exposes the canvas-layer contract (container budget + capture)', () => {
    const panel = new CanvasSpellbookPanel(bridgeStub, busStub, 'it');
    expect(panel.getContainerCount()).toEqual({ image: 0, text: 0 });
    expect(panel.getCaptureContainer()).toBe('hud-capture');
    expect(panel.id).toBe('canvas-spellbook');
  });
});

describe('windowCursorRows / clampCursorIndex — pure windowing', () => {
  it('returns an empty array for an empty list (no cursor marker to place)', () => {
    expect(windowCursorRows([], 0, (x: string) => x)).toEqual([]);
  });

  it('marks the cursor row with ▶ and blanks the others', () => {
    const rows = windowCursorRows(['a', 'b', 'c'], 1, (x) => x);
    expect(rows).toEqual(['  a', '▶ b', '  c']);
  });

  it('scrolls the window so the cursor stays visible past the window bottom', () => {
    const items = Array.from({ length: 20 }, (_, i) => `i${i}`);
    // Cursor at 12 with a 9-row window → window ends at the cursor row.
    const rows = windowCursorRows(items, 12, (x) => x, 9);
    expect(rows).toHaveLength(9);
    expect(rows.at(-1)).toBe('▶ i12');
    expect(rows[0]).toBe('  i4');
  });

  it('clampCursorIndex clamps into [0, len-1] and yields 0 for an empty list', () => {
    expect(clampCursorIndex(-3, 5)).toBe(0);
    expect(clampCursorIndex(99, 5)).toBe(4);
    expect(clampCursorIndex(2, 5)).toBe(2);
    expect(clampCursorIndex(3, 0)).toBe(0);
  });
});

/** Fake 2D context recording draw calls, for paint() without a real canvas. */
function makeMockCtx() {
  return {
    fillStyle: '',
    strokeStyle: '',
    font: '',
    lineWidth: 0,
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    fillText: vi.fn(),
  };
}

/** Fake canvas whose getContext returns `ctx` (or null to force the degraded path). */
function makeMockCanvas(ctx: unknown) {
  return { getContext: vi.fn(() => ctx) } as unknown as HTMLCanvasElement;
}

describe('CanvasSelectableListPanel — canvas paint + lifecycle', () => {
  it('paint before attachCanvas is a safe no-op (null ctx guard)', () => {
    const panel = new CanvasInventoryPanel(bridgeStub, busStub, 'it');
    expect(() => panel.paint()).not.toThrow();
  });

  it('attachCanvas with a null-context canvas degrades without throwing', async () => {
    const panel = new CanvasInventoryPanel(bridgeStub, busStub, 'it');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await panel.attachCanvas(makeMockCanvas(null));
    // Still degraded → paint remains a no-op.
    expect(() => panel.paint()).not.toThrow();
    warn.mockRestore();
  });

  it('paint draws chrome + one fillText per visible row and clears dirty', async () => {
    const panel = new CanvasInventoryPanel(bridgeStub, busStub, 'it');
    const ctx = makeMockCtx();
    await panel.attachCanvas(makeMockCanvas(ctx));
    panel.onSnapshot(makeSnapshot());
    expect(panel.isDirty()).toBe(true);
    panel.paint();
    // Two inventory rows → two content fillText calls (plus the header title).
    expect(ctx.fillText).toHaveBeenCalled();
    expect(ctx.clearRect).toHaveBeenCalledTimes(1);
    expect(panel.isDirty()).toBe(false);
  });

  it('paint stops at the visible-row ceiling for a long list (break branch)', async () => {
    const panel = new CanvasInventoryPanel(bridgeStub, busStub, 'it');
    const ctx = makeMockCtx();
    await panel.attachCanvas(makeMockCanvas(ctx));
    const many = Array.from({ length: 30 }, (_, i) => ({
      id: `i${i}`,
      name: `Item ${i}`,
      type: 'equipment',
    }));
    panel.onSnapshot(makeSnapshot({ inventory: many } as Partial<CharacterSnapshot>));
    // Scroll the cursor deep so windowCursorRows returns a full window.
    for (let i = 0; i < 20; i++) panel.onEvent({ kind: 'scroll', direction: 'down' });
    panel.paint();
    // Header title + at most CANVAS_LIST_VISIBLE_ROWS content rows are painted.
    expect(ctx.fillText.mock.calls.length).toBeLessThanOrEqual(CANVAS_LIST_VISIBLE_ROWS + 1);
    expect(ctx.fillText.mock.calls.length).toBeGreaterThan(1);
  });

  it('onMount subscribes gesture + character deltas; re-mount re-subscribes; unmount releases', async () => {
    const gestureUnsub = vi.fn();
    const charUnsub = vi.fn();
    const bus = { subscribe: vi.fn(() => gestureUnsub) } as unknown as PanelGestureBus;
    const wsBus = { subscribe: vi.fn(() => charUnsub) };
    const panel = new CanvasInventoryPanel(bridgeStub, bus, 'it');
    panel.setWsEventBus(wsBus);

    await panel.onMount();
    expect(bus.subscribe).toHaveBeenCalledTimes(1);
    expect(wsBus.subscribe).toHaveBeenCalledWith('character.delta', expect.any(Function));

    // Re-mount must release the prior gesture sub before re-subscribing (line 217 branch).
    await panel.onMount();
    expect(gestureUnsub).toHaveBeenCalledTimes(1);
    expect(bus.subscribe).toHaveBeenCalledTimes(2);

    // Unmount releases both live subscriptions.
    await panel.onUnmount();
    expect(gestureUnsub).toHaveBeenCalledTimes(2);
    expect(charUnsub).toHaveBeenCalledTimes(1);

    // A second unmount with nothing subscribed is a safe no-op.
    await expect(panel.onUnmount()).resolves.toBeUndefined();
  });

  it('the character.delta subscription routes payloads into onSnapshot', async () => {
    let deltaCb: ((raw: unknown) => void) | undefined;
    const wsBus = {
      subscribe: vi.fn((_ch: string, cb: (raw: unknown) => void) => {
        deltaCb = cb;
        return () => {};
      }),
    };
    const handler = vi.fn<(req: ActionOptionsRequest) => void>();
    const panel = new CanvasInventoryPanel(bridgeStub, busStub, 'it');
    panel.setWsEventBus(wsBus);
    panel.setActionOptionsHandler(handler);
    await panel.onMount();
    // Feed a snapshot through the wired channel, then a tap must dispatch.
    deltaCb?.(makeSnapshot());
    panel.onEvent({ kind: 'tap' });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]?.[0]?.itemId).toBe('w1');
  });

  it('double-tap is a no-op (router owns overlay close)', () => {
    const panel = new CanvasInventoryPanel(bridgeStub, busStub, 'it');
    const handler = vi.fn();
    panel.setActionOptionsHandler(handler);
    panel.onSnapshot(makeSnapshot());
    panel.onEvent({ kind: 'double-tap' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('tap on a cursor with no actionable entry warns and does not dispatch', () => {
    const panel = new CanvasInventoryPanel(bridgeStub, busStub, 'it');
    const handler = vi.fn();
    panel.setActionOptionsHandler(handler);
    // Empty inventory → resolveRequest returns null for any cursor.
    panel.onSnapshot(makeSnapshot({ inventory: [] } as Partial<CharacterSnapshot>));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    panel.onEvent({ kind: 'tap' });
    expect(handler).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
