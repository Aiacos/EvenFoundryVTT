/**
 * Sheet model: AppState → localised, render-ready values (design `PC` of
 * docs/design/g2-sheet-ux.html).
 */
import { describe, expect, it } from 'vitest';
import { character, combat, economy, movement, online } from '../../demo/fixtures.js';
import { strings } from '../i18n.js';
import { effectivePage, isMyTurn, sheetModel, signed } from '../model.js';

const s = strings('it');

describe('sheetModel', () => {
  it('projects Thorin as in the design', () => {
    const m = sheetModel(online(), s);
    expect(m).toMatchObject({
      name: 'Thorin',
      sub: 'Nano delle colline · Chierico 5',
      ac: 18,
      hp: 27,
      hpMax: 38,
      temp: 5,
      init: '+0',
      speed: '25',
      prof: '+3',
      inspiration: true,
      turn: null,
      economy: null,
      emblem: 'hammer',
      senses: 'PERCEZIONE PASSIVA 14 · SCUROVISIONE 60',
    });
    expect(m?.abilities.map((a) => `${a.label}${a.mod}/${a.score}`)).toEqual([
      'FOR+3/16',
      'DES+0/10',
      'COS+2/14',
      'INT+0/10',
      'SAG+4/18',
      'CAR+1/12',
    ]);
    expect(m?.saves.filter((x) => x.prof).map((x) => `${x.label}${x.value}`)).toEqual([
      'FOR+6',
      'SAG+7',
      'CAR+4',
    ]);
    expect(m?.skills.map((k) => `${k.label}:${k.prof}:${k.value}`)).toEqual([
      'Intuizione:1:+7',
      'Medicina:1:+7',
      'Religione:2:+6',
      'Percezione:0:+4',
      'Atletica:0:+3',
      'Furtività:0:+0',
    ]);
    expect(m?.chips).toEqual([
      { label: 'CONC.', kind: 'conc' },
      { label: 'BENEDETTO', kind: 'good' },
    ]);
  });

  it('adds the turn, the action economy and the remaining movement in combat', () => {
    const app = online('min', {
      combat: combat('thorin'),
      actionEconomy: { ...economy(1), bonusActionsUsed: 1 },
      movement: { ...movement(), remainingFeet: 10 },
    });
    expect(sheetModel(app, s)).toMatchObject({
      turn: { mine: true, round: 3, current: 'Thorin' },
      economy: [false, false, true],
      moveFt: 10,
    });
    const other = online('min', {
      combat: combat('goblin-b'),
      actionEconomy: { ...economy(1), actorId: 'someone-else' },
    });
    expect(sheetModel(other, s)).toMatchObject({
      turn: { mine: false, current: 'Goblin B' },
      economy: [true, true, true],
      moveFt: 25,
    });
  });

  it('falls back when details are missing and labels unknown conditions verbatim', () => {
    const { details: _d, ...bare } = character();
    const ch = { ...bare, conditions: ['unconscious', 'weird'], exhaustion: 2 };
    const m = sheetModel(online('min', { character: ch }), s);
    expect(m).toMatchObject({
      sub: 'LIV 5',
      init: '+0',
      speed: '30',
      prof: '+3',
      inspiration: false,
      emblem: 'star',
      senses: 'PERCEZIONE PASSIVA 14',
    });
    expect(m?.chips).toEqual([
      { label: 'PRIVO DI SENSI', kind: 'bad' },
      { label: 'ESAUSTO 2', kind: 'bad' },
      { label: 'weird', kind: 'good' },
    ]);
    const base = character();
    const details = { inspiration: false, speed: 30, proficiency: 3, initiative: 0, darkvision: 0 };
    const fighter = { ...base, details: { ...(base.details ?? details), classId: 'fighter' } };
    expect(sheetModel(online('min', { character: fighter }), s)?.emblem).toBe('sword');
    expect(sheetModel(online('min', { character: null }), s)).toBeNull();
  });

  it('helpers: signed, isMyTurn, effectivePage', () => {
    expect([signed(3), signed(0), signed(-1)]).toEqual(['+3', '+0', '-1']);
    expect(isMyTurn(character(), combat('thorin'))).toBe(true);
    expect(isMyTurn(character(), null)).toBe(false);
    expect(effectivePage(character(), 'saves')).toBe('saves');
    expect(effectivePage({ ...character(), hp: 0 }, 'saves')).toBe('death');
    expect(effectivePage(null, 'abilities')).toBe('abilities');
  });
});
