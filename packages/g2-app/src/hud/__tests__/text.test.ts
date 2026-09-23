/**
 * Unit tests for the pure text renderers (measure, sheet, context, full-screen).
 */
import { getTextWidth } from '@evenrealities/pretext';
import { describe, expect, it } from 'vitest';
import { character, combat, economy, movement, online, result } from '../../demo/fixtures.js';
import { initialState } from '../../state/app-store.js';
import { nextLocaleSetting, strings } from '../i18n.js';
import { initialUi } from '../input/ui-state.js';
import { contextView, offlineView } from '../text/context.js';
import { connectingScreen, FULL_LINES, unpairedScreen } from '../text/fullscreen.js';
import { block, fit, gauge, row, sanitize, signed, windowAround } from '../text/measure.js';
import {
  economyLine,
  isMyTurn,
  movementLine,
  sheetBody,
  sheetHeader,
  turnBudget,
} from '../text/sheet.js';

const it_ = strings('it');
const en = strings('en');

describe('measure', () => {
  it('sanitize drops glyphs missing from the firmware font and control chars', () => {
    expect(sanitize('a▮b✓c\nd')).toBe('abc d');
  });

  it('fit truncates by pixel width with an ellipsis', () => {
    expect(fit('short', 100)).toBe('short');
    const out = fit('a very long line that cannot possibly fit', 80);
    expect(out.endsWith('…')).toBe(true);
    expect(getTextWidth(out)).toBeLessThanOrEqual(80);
    expect(fit('WWWW', 5)).toBe('');
  });

  it('row aligns cells to pixel columns', () => {
    const r = row([
      ['ab', 60],
      ['cd', 60],
    ]);
    expect(r.startsWith('ab ')).toBe(true);
    expect(getTextWidth(r.slice(0, r.indexOf('cd')))).toBeGreaterThanOrEqual(55);
    expect(
      row([
        ['x', 1],
        ['y', 20],
      ]),
    ).toBe(' y');
  });

  it('gauge renders fractions and unknowns', () => {
    expect(gauge(undefined, 3)).toBe('');
    expect(gauge(Number.NaN, 3)).toBe('');
    expect(gauge(0, 3)).toBe('□□□');
    expect(gauge(0.01, 3)).toBe('■□□');
    expect(gauge(2, 3)).toBe('■■■');
  });

  it('block limits lines; windowAround keeps the focus visible; signed', () => {
    expect(block(['a', 'b', 'c'], 100, 2)).toBe('a\nb');
    expect(windowAround([1, 2, 3], 0, 5)).toEqual([1, 2, 3]);
    expect(windowAround([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 9, 3)).toEqual([7, 8, 9]);
    expect(windowAround([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 0, 3)).toEqual([0, 1, 2]);
    expect(windowAround([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 5, 3)).toEqual([4, 5, 6]);
    expect(signed(3)).toBe('+3');
    expect(signed(0)).toBe('+0');
    expect(signed(-2)).toBe('-2');
  });
});

describe('i18n', () => {
  it('cycles the language setting auto → it → en → auto', () => {
    expect(nextLocaleSetting('auto')).toBe('it');
    expect(nextLocaleSetting('it')).toBe('en');
    expect(nextLocaleSetting('en')).toBe('auto');
  });
});

describe('sheet', () => {
  it('header shows identity and situation', () => {
    expect(sheetHeader(null, null, it_)).toEqual(['—', '']);
    expect(sheetHeader(character(), null, it_)).toEqual(['THORIN  Liv 5', 'Esplorazione · PHB24']);
    expect(sheetHeader(character(), combat(true), it_)[1]).toBe('▲ TUO TURNO  R3');
    expect(sheetHeader(character(), combat(false), en)[1]).toBe('Turn: Goblin A');
    const legacy = { ...character(), world: { modernRules: false } };
    expect(sheetHeader(legacy, null, en)[1]).toContain('PHB14');
  });

  it('isMyTurn needs both snapshots', () => {
    expect(isMyTurn(null, combat(true))).toBe(false);
    expect(isMyTurn(character(), null)).toBe(false);
    expect(isMyTurn(character(), combat(true))).toBe(true);
    const noCurrent = { ...combat(true), combatants: [] };
    expect(sheetHeader(character(), noCurrent, en)[1]).toBe('Turn: —');
  });

  it('renders 8 body lines on every page with the page indicator last', () => {
    for (const page of [0, 1, 2, 3] as const) {
      const body = sheetBody(character('max'), page, it_);
      expect(body).toHaveLength(8);
      expect(body[7]).toBe(`${page + 1}/4 ${it_.pages[page]}`);
    }
    expect(
      sheetBody(null, 0, en)
        .slice(0, 7)
        .every((l) => l === ''),
    ).toBe(true);
  });

  it('main page: temp HP, slots, death saves, exhaustion, conditions', () => {
    const max = sheetBody(character('max'), 0, it_);
    expect(max[1]).toContain('temp +120');
    expect(max.some((l) => l.startsWith('Slot 1°3/4 2°1/3 3°0/2'))).toBe(true);
    expect(max.some((l) => l.startsWith('Condizioni: Benedetto'))).toBe(true);
    const dying = sheetBody({ ...character(), hp: 0, death: { success: 2, failure: 1 } }, 0, en);
    expect(dying).toContain('Death saves ●●○ / ●○○');
    const tired = sheetBody({ ...character(), exhaustion: 2 }, 0, en);
    expect(tired).toContain('Exhaustion 2');
    expect(sheetBody(character(), 0, en)).toContain('Conditions: none');
  });

  it('combat page lists weapons (or omits the section)', () => {
    const body = sheetBody(character(), 1, en);
    expect(body).toContain('Weapons');
    const unarmed = sheetBody({ ...character(), inventory: [] }, 1, en);
    expect(unarmed).not.toContain('Weapons');
  });

  it('skills page shows saves, proficient skills (★ expertise) and passive', () => {
    const body = sheetBody(character(), 2, en);
    expect(body[0]).toMatch(/^●STR\+7/);
    expect(body.some((l) => l.startsWith('★Athletics'))).toBe(true);
    expect(body[6]).toBe('Passive Perc. 14');
  });

  it('spells/items page for casters and non-casters', () => {
    const caster = sheetBody(character('max'), 3, it_);
    expect(caster[0]).toMatch(/^Slot/);
    expect(caster).toContain(' T Fiamma sacra');
    const plain = sheetBody(character(), 3, en);
    expect(plain[0]).toBe('Spells: no spells');
    expect(plain).toContain(' Pozione ×3');
    const noSlots = sheetBody(
      { ...character('max'), spells: { slots: [], spells: character('max').spells.spells } },
      3,
      en,
    );
    expect(noSlots[0]).toBe('Spells');
  });
});

describe('turn budget (M02 / M06)', () => {
  it('economy row: ● free, ○ used, fits 186 px in both locales', () => {
    expect(economyLine(economy(), it_).replace(/ +/g, ' ')).toBe('Az ● Bon ● Rea ●');
    const used = { ...economy(1), bonusActionsUsed: 1, reactionsUsed: 1 };
    expect(economyLine(used, en).replace(/ +/g, ' ')).toBe('Act ○ Bon ○ Rea ○');
    for (const loc of [it_, en]) {
      expect(getTextWidth(economyLine(economy(), loc))).toBeLessThanOrEqual(186);
    }
  });

  it('movement row shows remaining / speed, negative when over budget', () => {
    expect(movementLine(movement(), it_)).toBe('Mov 25/30 ft');
    expect(movementLine(movement('max'), en)).toBe('Mov -5/120 ft');
  });

  it('turnBudget: only in combat, only for the paired actor', () => {
    const inCombat = online('min', {
      combat: combat(true),
      actionEconomy: economy(),
      movement: movement(),
    });
    expect(turnBudget(inCombat)).toEqual({ economy: economy(), movement: movement() });
    expect(turnBudget({ ...inCombat, combat: null })).toBeNull();
    expect(turnBudget({ ...inCombat, character: null })).toBeNull();
    const foreign = { ...inCombat, actionEconomy: { ...economy(), actorId: 'other' } };
    expect(turnBudget(foreign)?.economy).toBeNull();
    expect(turnBudget({ ...foreign, movement: null })).toBeNull();
  });

  it('combat page shows the budget rows, drops passive perception but keeps death saves', () => {
    const turn = { economy: economy(), movement: movement() };
    const body = sheetBody(character(), 1, en, turn);
    expect(body.slice(2, 4)).toEqual([economyLine(economy(), en), 'Mov 25/30 ft']);
    expect(body.some((l) => l.startsWith('Passive Perc.'))).toBe(false);
    expect(body).toHaveLength(8);
    const dying = sheetBody({ ...character(), hp: 0 }, 1, en, turn);
    expect(dying.some((l) => l.startsWith('Death saves'))).toBe(true);
    expect(sheetBody(character(), 1, en, { economy: null, movement: movement() })[2]).toBe(
      'Mov 25/30 ft',
    );
  });

  it('result card ends with the remaining economy (M06)', () => {
    const app = online('min', { combat: combat(true), actionEconomy: economy(1) });
    const ui = {
      ...initialUi(),
      view: 'result' as const,
      result: { title: 't', shownAt: 0, ack: 'ok' as const, payload: result() },
    };
    const view = contextView(app, ui, it_, 0);
    expect(view.body.at(-1)).toBe(economyLine(economy(1), it_));
    expect(contextView({ ...app, combat: null }, ui, it_, 0).body).not.toContain(
      economyLine(economy(1), it_),
    );
  });
});

describe('context column', () => {
  it('root explore: log, party, scroll clamp', () => {
    const v = contextView(online('max'), initialUi(), it_, 0);
    expect(v.head[0]).toBe("SCENA Cripta di Vel'Nar");
    expect(v.body[0]).toBe('Registro');
    expect(v.body).toHaveLength(7);
    const scrolled = contextView(online('max'), { ...initialUi(), scroll: 99 }, it_, 0);
    expect(scrolled.body.at(-1)).toContain('Mira');
    const noMap = contextView({ ...online(), map: null }, initialUi(), en, 0);
    expect(noMap.head[0]).toBe('SCENE no scene');
    expect(noMap.body).toEqual(['Log', ' (empty)']);
  });

  it('log lines carry localised results', () => {
    const app = online('min', {
      log: {
        events: (['hit', 'miss', 'pass', 'fail', 'concentrating'] as const).map((kind, i) => ({
          id: `x${i}`,
          timestamp: i,
          actorName: 'A',
          kind: 'roll' as const,
          description: 'd',
          result: { kind },
        })),
      },
    });
    const body = contextView(app, initialUi(), en, 0).body.join('|');
    for (const w of ['HIT', 'MISS', 'save passed', 'save failed', 'conc.'])
      expect(body).toContain(w);
  });

  it('root combat: initiative with current turn cursor', () => {
    const app = online('min', { combat: combat(false) });
    const v = contextView(app, initialUi(), en, 0);
    expect(v.head[1]).toBe('Turn: Goblin A');
    expect(v.body[1]).toMatch(/^▶/);
    const unknownInit = online('min', {
      combat: {
        ...combat(false),
        combatants: [
          { ...combat(false).combatants[0], initiative: null, isCurrentTurn: false } as never,
        ],
      },
    });
    expect(contextView(unknownInit, initialUi(), en, 0).head[1]).toBe('Turn: —');
  });

  it('list views: cursor, empty lists, heads per view', () => {
    const app = online('max');
    const actions = contextView(app, { ...initialUi(), view: 'actions', cursor: 0 }, en, 0);
    expect(actions.body[0]).toMatch(/^▶/);
    expect(actions.foot).toBe(en.footer.list);
    const slot = contextView(
      app,
      {
        ...initialUi(),
        view: 'slot',
        pending: { kind: 'spell', spellId: 's1', name: 'Cura ferite', level: 5, slot: null },
      },
      it_,
      0,
    );
    expect(slot.body).toEqual([it_.noSlots]);
    const target = contextView(
      app,
      {
        ...initialUi(),
        view: 'target',
        pending: { kind: 'spell', spellId: 's1', name: 'Cura', level: 1, slot: 2 },
      },
      it_,
      0,
    );
    expect(target.head[1]).toBe('SLOT 2°');
    expect(target.foot).toBe(it_.footer.target);
    const items = contextView(app, { ...initialUi(), view: 'items' }, en, 0);
    expect(items.head[0]).toBe('Items');
    const options = contextView(app, { ...initialUi(), view: 'options' }, en, 0);
    expect(options.head[0]).toBe('OPTIONS');
    expect(options.body.join('|')).toContain('Zoom + (12 px)');
    const spells = contextView(
      { ...app, character: null },
      { ...initialUi(), view: 'spells' },
      en,
      0,
    );
    expect(spells.body).toEqual(['—']);
  });

  it('result view: pending, ok, error, payload failure', () => {
    const base = { ...initialUi(), view: 'result' as const };
    const r = (patch: object) =>
      contextView(
        online(),
        { ...base, result: { title: 'T', shownAt: 0, ack: 'pending', payload: null, ...patch } },
        en,
        0,
      ).body;
    expect(r({})).toEqual(['in progress…']);
    expect(r({ ack: 'ok' })).toEqual(['done']);
    expect(r({ ack: { error: 'boom' } })).toEqual(['failed', 'boom']);
    expect(
      r({
        payload: {
          ...result(),
          d20: null,
          status: 'failure',
          errorKind: 'wrong-turn',
          damage: undefined,
        },
      }),
    ).toEqual(['HIT', 'not your turn']);
    expect(r({ payload: { ...result(), status: 'error' } })).toContain('failed');
    expect(contextView(online(), { ...base, result: null }, en, 0).head).toEqual(['RESULT', '']);
  });

  it('reaction view counts down', () => {
    const app = online('min', { reaction: { kind: 'shield', sourceName: 'Orc', expiresAt: 0 } });
    const v = contextView(
      app,
      { ...initialUi(), view: 'reaction', reactionDeadline: 5_500 },
      en,
      0,
    );
    expect(v.body.at(-1)).toBe('ends ■■□ 6 s');
    expect(v.head[1]).toBe('Trigger: Orc');
    const expired = contextView(
      { ...app, reaction: null },
      { ...initialUi(), view: 'reaction', reactionDeadline: null },
      en,
      0,
    );
    expect(expired.body.at(-1)).toBe('ends □□□ 0 s');
  });

  it('offline view (M11) with and without retry info', () => {
    const app = online('min', {
      connection: {
        status: 'offline',
        retryInMs: 7_100,
        attempt: 2,
        lastSyncAt: 0,
        cause: 'no-gm',
      },
    });
    const v = offlineView(app, it_, 180_000);
    expect(v.head).toEqual(['▲ OFFLINE', 'nessun GM connesso']);
    expect(v.body).toEqual(['Riprovo tra 8 s (#2)', 'Dati: 3 min fa', 'dati congelati']);
    const bare = offlineView({ ...initialState(), connection: { status: 'offline' } }, en, 0);
    expect(bare.body).toEqual(['data frozen']);
    expect(bare.head[1]).toBe('Foundry not responding');
  });
});

describe('full-screen screens', () => {
  it('M09 unpaired / revoked', () => {
    const m09 = unpairedScreen(false, it_);
    expect(m09).toHaveLength(FULL_LINES);
    expect(m09[2]).toBe(it_.unpaired[0]);
    expect(m09.at(-1)).toBe('●● esci');
    expect(unpairedScreen(true, en)[2]).toBe(en.revoked);
  });

  it('M10 connecting checklist and progress', () => {
    const m10 = connectingScreen({ status: 'connecting' }, en);
    expect(m10).toHaveLength(FULL_LINES);
    expect(m10[1]).toBe('Connecting to — …');
    expect(m10[3]).toBe('▶ server reachable (HTTPS)');
    expect(m10[4]).toBe('○ signed in as «—»');
    expect(m10[8]).toBe('□'.repeat(20));
    const all = connectingScreen(
      {
        status: 'connecting',
        steps: { server: true, login: true, gm: true, character: true, scene: true },
      },
      en,
    );
    expect(all[8]).toBe('■'.repeat(20));
    expect(all.slice(3, 8).every((l) => l.startsWith('●'))).toBe(true);
  });
});
