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
    // New flat-list model: Foundry resolves targeting → no glasses target picker.
    expect(req?.requiresTarget).toBe(false);
  });

  it('cursor follows scroll-down; tap dispatches the newly highlighted entry', () => {
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
    // New flat-list model: Foundry resolves targeting → no glasses target picker.
    expect(req?.requiresTarget).toBe(false);
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
