/**
 * Phase 8 write channel — canvas INTERACTIVE Skills panel.
 *
 * Verifies the skill list renders one row per skill (snapshot-driven) and that a tap
 * dispatches a direct skill-roll request `{ actorId, skill }` for the skill under the
 * cursor (NOT an ActionOptions request). The boot side turns that into a `skill-check`
 * tool.invoke envelope; that envelope shape is asserted in the menu/boot wiring test.
 */

import type { CharacterSnapshot } from '@evf/shared-protocol';
import { describe, expect, it, vi } from 'vitest';
import type { PanelGestureBus } from '../../engine/panel-gesture-bus.js';
import CanvasSkillsPanel, { type SkillRollRequest } from '../canvas-skills-panel.js';

const ability = (value: number, mod: number) => ({
  value,
  mod,
  save: mod,
  proficient: false,
  dc: 8,
});
const skill = (a: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha', total = 0) => ({
  total,
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
    inventory: [],
    spells: { slots: [], spells: [] },
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
      ath: skill('str', 3),
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

const busStub = { subscribe: vi.fn(() => () => {}) } as unknown as PanelGestureBus;
const bridgeStub = {} as never;

describe('CanvasSkillsPanel — cursor + direct skill-roll dispatch', () => {
  it('windows the 18 skills to the visible row budget, cursor at the top of the window', () => {
    const panel = new CanvasSkillsPanel(bridgeStub, busStub, 'en');
    panel.onSnapshot(makeSnapshot());
    // renderRows is protected; reach it via a test-only cast to assert windowing.
    const renderRows = (
      panel as unknown as {
        renderRows: (s: CharacterSnapshot, l: 'en', c: number) => string[];
      }
    ).renderRows;
    const rows = renderRows.call(panel, makeSnapshot(), 'en', 0);
    // The canvas list paints only ~9 rows, so renderRows windows (does NOT return all 18).
    expect(rows.length).toBeLessThan(18);
    expect(rows.length).toBeGreaterThan(0);
    // First ability column is STR → Athletics (ath, total 3 → "+3"), cursor marker on row 0.
    expect(rows[0]).toContain('Athletics');
    expect(rows[0]).toContain('+3');
    expect(rows[0]?.startsWith('▶ ')).toBe(true);
  });

  it('windowing follows the cursor: a deep cursor reveals otherwise-hidden skills', () => {
    const panel = new CanvasSkillsPanel(bridgeStub, busStub, 'en');
    panel.onSnapshot(makeSnapshot());
    const renderRows = (
      panel as unknown as {
        renderRows: (s: CharacterSnapshot, l: 'en', c: number) => string[];
      }
    ).renderRows;
    // At the top, Survival (sur, ordered index 13) is below the 9-row window — hidden.
    const top = renderRows.call(panel, makeSnapshot(), 'en', 0);
    expect(top.some((r) => r.includes('Survival'))).toBe(false);
    // With the cursor on the last skill (index 17 → Persuasion), the window scrolls down
    // so Survival is now revealed and the cursor marker sits on the last visible row.
    const deep = renderRows.call(panel, makeSnapshot(), 'en', 17);
    expect(deep.some((r) => r.includes('Survival'))).toBe(true);
    const cursorRow = deep.find((r) => r.startsWith('▶ '));
    expect(cursorRow).toContain('Persuasion');
  });

  it('tap dispatches a skill-roll request for the skill under the cursor', () => {
    const panel = new CanvasSkillsPanel(bridgeStub, busStub, 'en');
    const handler = vi.fn<(req: SkillRollRequest) => void>();
    panel.setSkillRollHandler(handler);
    panel.onSnapshot(makeSnapshot());

    panel.onEvent({ kind: 'tap' });

    expect(handler).toHaveBeenCalledTimes(1);
    const req = handler.mock.calls[0]?.[0];
    expect(req?.actorId).toBe('actor-shin');
    // Cursor at 0 → first ordered skill is Athletics (str column) → key 'ath'.
    expect(req?.skill).toBe('ath');
  });

  it('scroll moves the cursor; tap then dispatches the next skill', () => {
    const panel = new CanvasSkillsPanel(bridgeStub, busStub, 'en');
    const handler = vi.fn<(req: SkillRollRequest) => void>();
    panel.setSkillRollHandler(handler);
    panel.onSnapshot(makeSnapshot());

    expect(panel.isAtTopBoundary()).toBe(true);
    panel.onEvent({ kind: 'scroll', direction: 'down' });
    expect(panel.isAtTopBoundary()).toBe(false);
    panel.onEvent({ kind: 'tap' });

    // Ordered keys: STR(ath), DEX(acr, slt, ste), ... → index 1 is DEX/acr.
    expect(handler.mock.calls[0]?.[0]?.skill).toBe('acr');
  });

  it('tap with no handler / no snapshot is a safe no-op', () => {
    const panel = new CanvasSkillsPanel(bridgeStub, busStub, 'en');
    expect(() => panel.onEvent({ kind: 'tap' })).not.toThrow();
    panel.setSkillRollHandler(vi.fn());
    expect(() => panel.onEvent({ kind: 'tap' })).not.toThrow();
  });

  it('exposes the canvas-layer contract + stable id/navKey', () => {
    const panel = new CanvasSkillsPanel(bridgeStub, busStub, 'en');
    expect(panel.getContainerCount()).toEqual({ image: 0, text: 0 });
    expect(panel.id).toBe('canvas-skills');
    expect(CanvasSkillsPanel.meta.navKey).toBe('K');
  });
});
