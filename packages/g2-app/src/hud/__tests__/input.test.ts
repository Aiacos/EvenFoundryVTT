/**
 * Column-C state machine (docs/design/g2-thirds-layout.md §Modello di input) and
 * Even Hub event mapping. Tool inputs are validated against the shared-protocol Zod
 * schemas the GM projector's `dispatchTool` uses.
 */
import { EvenHubEventType, OsEventTypeList } from '@evenrealities/even_hub_sdk';
import {
  CastCounterspellInputSchema,
  CastShieldInputSchema,
  CastSpellInputSchema,
  OpportunityAttackInputSchema,
  UseItemInputSchema,
  WeaponAttackInputSchema,
} from '@evf/shared-protocol';
import { describe, expect, it } from 'vitest';
import { type AppState, initialState } from '../../state/app-store.js';
import { strings } from '../i18n.js';
import { buildEntries, MENU_OPS } from '../input/entries.js';
import { toGestureEvent } from '../input/events.js';
import {
  type HudEffect,
  type HudInput,
  menuIdOf,
  REACTION_TIMEOUT_MS,
  RESULT_TIMEOUT_MS,
  reduce,
} from '../input/state-machine.js';
import { initialUi, type UiState } from '../input/ui-state.js';
import { character, combat, online, result } from './fixtures.js';

const s = strings('it');

function drive(app: AppState, inputs: HudInput[], ui: UiState = initialUi(), now = 0) {
  let state = ui;
  const effects: HudEffect[] = [];
  for (const input of inputs) {
    const r = reduce(state, input, { app, now, strings: s });
    state = r.ui;
    effects.push(...r.effects);
  }
  return { ui: state, effects };
}

const invokes = (effects: HudEffect[]) =>
  effects.filter((e): e is Extract<HudEffect, { t: 'invoke' }> => e.t === 'invoke');

describe('root', () => {
  it('tap opens actions; double-tap exits (shutDownPageContainer)', () => {
    expect(drive(online(), [{ t: 'tap' }]).ui.view).toBe('actions');
    expect(drive(online(), [{ t: 'double' }]).effects).toEqual([{ t: 'exit' }]);
  });

  it('swipes scroll the log without going negative', () => {
    expect(drive(online(), [{ t: 'down' }, { t: 'down' }, { t: 'up' }]).ui.scroll).toBe(1);
    expect(drive(online(), [{ t: 'up' }]).ui.scroll).toBe(0);
  });
});

describe('weapon attack flow (M03 → M04 → M06)', () => {
  it('actions → weapon → target → roll invokes weapon-attack with the chosen target', () => {
    const app = online('max');
    const { ui, effects } = drive(app, [{ t: 'tap' }, { t: 'tap' }, { t: 'down' }, { t: 'tap' }]);
    expect(ui.view).toBe('result');
    expect(ui.result?.title).toBe('Ascia bipenne +3 del Drago Rosso → Mercante');
    const [call] = invokes(effects);
    expect(call?.tool).toBe('weapon-attack');
    expect(WeaponAttackInputSchema.parse(call?.input)).toEqual({
      actor_id: 'actor-1',
      item_id: 'w1',
      targets: ['t-npc'],
      advantage: 'normal',
      count: 1,
    });
  });

  it('no-target entry sends an empty target list; advantage toggle is forwarded', () => {
    const app = online('min', { map: null });
    const adv = menuIdOf('advantage');
    const { effects } = drive(app, [
      { t: 'menu', id: adv },
      { t: 'tap' },
      { t: 'tap' },
      { t: 'tap' },
    ]);
    const input = WeaponAttackInputSchema.parse(invokes(effects)[0]?.input);
    expect(input.targets).toEqual([]);
    expect(input.advantage).toBe('advantage');
  });

  it('cursor is clamped to the list', () => {
    const { ui } = drive(online(), [{ t: 'tap' }, { t: 'up' }, ...Array(20).fill({ t: 'down' })]);
    expect(ui.cursor).toBe(buildEntries(online(), ui, s).length - 1);
  });
});

describe('spell flow (M05)', () => {
  const app = online('max');
  const toSpells: HudInput[] = [{ t: 'tap' }, { t: 'down' }, { t: 'down' }, { t: 'tap' }];

  it('leveled spell: spells → slot → target → cast-spell with slot level', () => {
    const { ui, effects } = drive(app, [...toSpells, { t: 'down' }, { t: 'down' }, { t: 'tap' }]);
    expect(ui.view).toBe('slot');
    expect(ui.pending).toMatchObject({ kind: 'spell', spellId: 's1', level: 1 });
    const next = drive(app, [{ t: 'down' }, { t: 'tap' }, { t: 'tap' }], ui);
    const input = CastSpellInputSchema.parse(invokes([...effects, ...next.effects])[0]?.input);
    expect(input).toEqual({
      actor_id: 'actor-1',
      spell_id: 's1',
      slot_level: 2,
      targets: ['t-gob'],
    });
  });

  it('cantrip skips the slot picker; back returns to spells', () => {
    const { ui } = drive(app, [...toSpells, { t: 'tap' }]);
    expect(ui.view).toBe('target');
    expect(ui.pending).toMatchObject({ slot: 0 });
    expect(drive(app, [{ t: 'double' }], ui).ui.view).toBe('spells');
  });

  it('back from target of a leveled spell returns to the slot picker, then spells, actions, root', () => {
    const slot = drive(app, [...toSpells, { t: 'down' }, { t: 'down' }, { t: 'tap' }]).ui;
    const target = drive(app, [{ t: 'tap' }], slot).ui;
    const backs = [target];
    for (let i = 0; i < 4; i++) backs.push(drive(app, [{ t: 'double' }], backs.at(-1)).ui);
    expect(backs.map((u) => u.view)).toEqual(['target', 'slot', 'spells', 'actions', 'root']);
  });

  it('slot tap without a pending spell is ignored', () => {
    const ui = { ...initialUi(), view: 'slot' as const };
    expect(drive(app, [{ t: 'tap' }], ui).ui).toEqual(ui);
  });
});

describe('items and options', () => {
  it('items → use-item', () => {
    const app = online();
    const { effects, ui } = drive(app, [
      { t: 'tap' },
      { t: 'down' },
      { t: 'down' },
      { t: 'tap' },
      { t: 'tap' },
    ]);
    expect(ui.view).toBe('result');
    const call = invokes(effects)[0];
    expect(call?.tool).toBe('use-item');
    expect(UseItemInputSchema.parse(call?.input)).toEqual({
      actor_id: 'actor-1',
      item_id: 'p1',
      targets: [],
    });
  });

  it('every menu operation is reachable by tap through Opzioni…', () => {
    const app = online();
    const opts = drive(app, [
      { t: 'tap' },
      { t: 'down' },
      { t: 'down' },
      { t: 'down' },
      { t: 'tap' },
    ]).ui;
    expect(opts.view).toBe('options');
    const intents = buildEntries(app, opts, s).map((e) => e.intent);
    // Outside the player's turn "End turn" is not offered in the list.
    expect(intents).toEqual(
      MENU_OPS.filter((op) => op !== 'endTurn').map((op) => ({ k: 'op', op })),
    );
    const effectsOf = (i: number) =>
      drive(app, [...Array(i).fill({ t: 'down' }), { t: 'tap' }], opts);
    expect(effectsOf(0).ui.sheetPage).toBe(1);
    expect(effectsOf(1).effects).toEqual([{ t: 'settings', patch: { mapCellPx: 12 } }]);
    expect(effectsOf(2).effects).toEqual([{ t: 'settings', patch: { mapCellPx: 6 } }]);
    expect(effectsOf(3).effects).toEqual([{ t: 'settings', patch: { followToken: false } }]);
    expect(effectsOf(4).ui.advantage).toBe('advantage');
    expect(effectsOf(5).effects).toEqual([{ t: 'settings', patch: { locale: 'it' } }]);
    expect(effectsOf(6).effects).toEqual([{ t: 'reconnect' }]);
  });

  it('zoom saturates at 6 / 12 px; advantage cycles; next page wraps; unknown menu id ignored', () => {
    const at = (px: 6 | 12) => online('min', { settings: { ...online().settings, mapCellPx: px } });
    expect(drive(at(12), [{ t: 'menu', id: menuIdOf('zoomIn') }]).effects).toEqual([]);
    expect(drive(at(6), [{ t: 'menu', id: menuIdOf('zoomOut') }]).effects).toEqual([]);
    const adv = menuIdOf('advantage');
    expect(drive(online(), Array(3).fill({ t: 'menu', id: adv })).ui.advantage).toBe('normal');
    const page = menuIdOf('nextPage');
    expect(drive(online(), Array(4).fill({ t: 'menu', id: page })).ui.sheetPage).toBe(0);
    expect(drive(online(), [{ t: 'menu', id: 99 }]).effects).toEqual([]);
  });

  it('back from items/options returns to actions; tap on empty list is ignored', () => {
    const items = { ...initialUi(), view: 'items' as const };
    expect(drive(online(), [{ t: 'double' }], items).ui.view).toBe('actions');
    const empty = online('min', { character: null });
    expect(drive(empty, [{ t: 'tap' }], items).ui).toEqual(items);
  });

  it('actions without a character only offer options; invokes need an actor', () => {
    const app = online('min', { character: null });
    expect(
      buildEntries(app, { ...initialUi(), view: 'actions' }, s).map((e) => e.intent.k),
    ).toEqual(['open']);
    const pending = {
      ...initialUi(),
      view: 'target' as const,
      pending: { kind: 'weapon' as const, itemId: 'w1', name: 'A' },
    };
    expect(drive(app, [{ t: 'tap' }], pending).effects).toEqual([]);
    const withItem = online();
    const itemsUi = { ...initialUi(), view: 'items' as const };
    const entries = buildEntries(withItem, itemsUi, s);
    expect(entries).toHaveLength(1);
    const noActor = { ...withItem, character: { ...character(), actorId: '' } };
    expect(drive(noActor, [{ t: 'tap' }], itemsUi).effects).toEqual([]);
  });
});

describe('end turn (M03 «Fine turno»)', () => {
  const myTurn = () => online('min', { combat: combat(true) });
  const endTurnIndex = (app: AppState) =>
    buildEntries(app, { ...initialUi(), view: 'actions' }, s).findIndex(
      (e) => e.intent.k === 'op' && e.intent.op === 'endTurn',
    );

  it('is offered in the actions list only during the player’s turn', () => {
    expect(endTurnIndex(myTurn())).toBeGreaterThanOrEqual(0);
    expect(endTurnIndex(online('min', { combat: combat(false) }))).toBe(-1);
    expect(endTurnIndex(online())).toBe(-1);
    const opts = buildEntries(myTurn(), { ...initialUi(), view: 'options' }, s);
    expect(opts.map((e) => (e.intent.k === 'op' ? e.intent.op : ''))).toContain('endTurn');
  });

  it('tap invokes end-turn for the paired actor and shows the result card', () => {
    const app = myTurn();
    const idx = endTurnIndex(app);
    const r = drive(app, [{ t: 'tap' }, ...Array(idx).fill({ t: 'down' }), { t: 'tap' }]);
    expect(r.effects).toEqual([{ t: 'invoke', tool: 'end-turn', input: { actor_id: 'actor-1' } }]);
    expect(r.ui.view).toBe('result');
    expect(r.ui.result?.title).toBe(s.endTurn);
    expect(r.ui.result?.ack).toBe('pending');
  });

  it('context menu item works on your turn and is refused locally otherwise', () => {
    const menu = { t: 'menu' as const, id: menuIdOf('endTurn') };
    expect(drive(myTurn(), [menu]).effects).toEqual([
      { t: 'invoke', tool: 'end-turn', input: { actor_id: 'actor-1' } },
    ]);
    const refused = drive(online('min', { combat: combat(false) }), [menu]);
    expect(refused.effects).toEqual([]);
    expect(refused.ui.view).toBe('result');
    expect(refused.ui.result?.ack).toEqual({ error: s.errors['wrong-turn'] });
    expect(drive(online(), [menu]).ui.result?.ack).toEqual({ error: s.errors['wrong-turn'] });
  });
});

describe('result (M06)', () => {
  const resultUi: UiState = {
    ...initialUi(),
    view: 'result',
    result: { title: 'x', shownAt: 0, ack: 'pending', payload: null },
  };

  it('tap → actions, double → root, auto-close after 8 s', () => {
    expect(drive(online(), [{ t: 'tap' }], resultUi).ui.view).toBe('actions');
    expect(drive(online(), [{ t: 'double' }], resultUi).ui.view).toBe('root');
    expect(drive(online(), [{ t: 'up' }], resultUi).ui).toEqual(resultUi);
    expect(drive(online(), [{ t: 'tick' }], resultUi, RESULT_TIMEOUT_MS - 1).ui.view).toBe(
      'result',
    );
    expect(drive(online(), [{ t: 'tick' }], resultUi, RESULT_TIMEOUT_MS).ui.view).toBe('root');
  });

  it('records the invoke acknowledgement and the Foundry roll result', () => {
    const ok = drive(online(), [{ t: 'invoked', ok: true }], resultUi, 500).ui;
    expect(ok.result).toMatchObject({ ack: 'ok', shownAt: 500 });
    const failed = drive(online(), [{ t: 'invoked', ok: false }], resultUi).ui;
    expect(failed.result?.ack).toEqual({ error: '' });
    expect(drive(online(), [{ t: 'invoked', ok: true }], initialUi()).ui).toEqual(initialUi());
    const prev = online();
    const next = { ...prev, lastResult: result() };
    const r = reduce(resultUi, { t: 'state', prev }, { app: next, now: 900, strings: s }).ui;
    expect(r.result).toMatchObject({ payload: result(), shownAt: 900 });
  });
});

describe('reaction (M07)', () => {
  const reaction = {
    kind: 'opportunity-attack' as const,
    sourceName: 'Goblin A',
    expiresAt: 50_000,
  };

  it('takes priority with a 10 s cap, confirms an opportunity attack', () => {
    const prev = online();
    const app = { ...prev, reaction };
    const { ui } = reduce(
      { ...initialUi(), view: 'actions' },
      { t: 'state', prev },
      { app, now: 1000, strings: s },
    );
    expect(ui.view).toBe('reaction');
    expect(ui.reactionDeadline).toBe(1000 + REACTION_TIMEOUT_MS);
    const done = drive(app, [{ t: 'tap' }], ui);
    expect(done.ui.view).toBe('result');
    expect(done.effects[0]).toEqual({ t: 'clearReaction' });
    const call = invokes(done.effects)[0];
    expect(call?.tool).toBe('opportunity-attack');
    expect(OpportunityAttackInputSchema.parse(call?.input)).toEqual({
      actor_id: 'actor-1',
      item_id: 'w1',
      target_id: 't-gob',
    });
  });

  it('times out, can be ignored (tap or double), and clears when Foundry withdraws it', () => {
    const app = { ...online(), reaction };
    const ui = { ...initialUi(), view: 'reaction' as const, reactionDeadline: 5000 };
    expect(drive(app, [{ t: 'tick' }], ui, 4999).ui.view).toBe('reaction');
    expect(drive(app, [{ t: 'tick' }], ui, 5000)).toMatchObject({
      ui: { view: 'root' },
      effects: [{ t: 'clearReaction' }],
    });
    expect(drive(app, [{ t: 'double' }], ui).effects).toEqual([{ t: 'clearReaction' }]);
    expect(drive(app, [{ t: 'down' }, { t: 'down' }, { t: 'tap' }], ui).effects).toEqual([
      { t: 'clearReaction' },
    ]);
    const cleared = reduce(ui, { t: 'state', prev: app }, { app: online(), now: 0, strings: s });
    expect(cleared.ui.view).toBe('root');
  });

  it('shield and counterspell map to their tools; unknown source falls back to its name', () => {
    const shield = { ...online(), reaction: { ...reaction, kind: 'shield' as const } };
    const ui = { ...initialUi(), view: 'reaction' as const, reactionDeadline: 9e9 };
    const sh = invokes(drive(shield, [{ t: 'tap' }], ui).effects)[0];
    expect(sh?.tool).toBe('cast-shield');
    expect(CastShieldInputSchema.parse(sh?.input)).toEqual({ actor_id: 'actor-1', slot_level: 1 });
    const cs = {
      ...online(),
      reaction: { kind: 'counterspell' as const, sourceName: 'Mago', expiresAt: 0 },
    };
    const c = invokes(drive(cs, [{ t: 'tap' }], ui).effects)[0];
    expect(c?.tool).toBe('cast-counterspell');
    expect(CastCounterspellInputSchema.parse(c?.input)).toMatchObject({
      target_caster_id: 'Mago',
      slot_level: 3,
    });
    expect(buildEntries({ ...online(), reaction: null }, ui, s).map((e) => e.intent.k)).toEqual([
      'ignore',
    ]);
  });
});

describe('store-driven transitions', () => {
  it('auto page switches Principale ⇄ Combattimento when combat starts/ends', () => {
    const prev = online();
    const fight = { ...prev, combat: combat(true) };
    const start = reduce(initialUi(), { t: 'state', prev }, { app: fight, now: 0, strings: s }).ui;
    expect(start.sheetPage).toBe(1);
    const end = reduce(
      { ...start, sheetPage: 2 },
      { t: 'state', prev: fight },
      { app: prev, now: 0, strings: s },
    ).ui;
    expect(end.sheetPage).toBe(0);
    const manual = { ...fight, settings: { ...fight.settings, autoCombatPage: false } };
    expect(
      reduce(initialUi(), { t: 'state', prev }, { app: manual, now: 0, strings: s }).ui.sheetPage,
    ).toBe(0);
  });
});

describe('status screens (M09–M11)', () => {
  it('unpaired / connecting: only double-tap (exit / cancel) does something', () => {
    const unpaired = initialState();
    expect(drive(unpaired, [{ t: 'double' }]).effects).toEqual([{ t: 'exit' }]);
    expect(drive(unpaired, [{ t: 'tap' }, { t: 'down' }, { t: 'menu', id: 7 }]).effects).toEqual(
      [],
    );
    const connecting = { ...initialState(), connection: { status: 'connecting' as const } };
    expect(drive(connecting, [{ t: 'double' }]).effects).toEqual([{ t: 'exit' }]);
  });

  it('offline (M11): tap or menu reconnect retries, double exits', () => {
    const off = online('min', { connection: { status: 'offline' } });
    expect(drive(off, [{ t: 'tap' }]).effects).toEqual([{ t: 'reconnect' }]);
    expect(drive(off, [{ t: 'menu', id: menuIdOf('reconnect') }]).effects).toEqual([
      { t: 'reconnect' },
    ]);
    expect(drive(off, [{ t: 'menu', id: menuIdOf('zoomIn') }]).effects).toEqual([]);
    expect(drive(off, [{ t: 'double' }]).effects).toEqual([{ t: 'exit' }]);
    const reconnecting = online('min', { connection: { status: 'connecting' } });
    expect(drive(reconnecting, [{ t: 'tap' }]).effects).toEqual([{ t: 'reconnect' }]);
    const revoked = { ...initialState(), connection: { status: 'revoked' as const } };
    expect(drive(revoked, [{ t: 'tap' }]).effects).toEqual([]);
  });
});

describe('toGestureEvent', () => {
  it('maps SDK events to HUD inputs', () => {
    const sys = (eventType?: OsEventTypeList) =>
      toGestureEvent({ sysEvent: { eventType } as never });
    expect(sys(undefined)).toEqual({ t: 'tap' });
    expect(sys(OsEventTypeList.DOUBLE_CLICK_EVENT)).toEqual({ t: 'double' });
    expect(sys(OsEventTypeList.FOREGROUND_ENTER_EVENT)).toEqual({ t: 'foreground' });
    expect(sys(OsEventTypeList.SCROLL_TOP_EVENT)).toEqual({ t: 'up' });
    expect(sys(OsEventTypeList.LONG_PRESS_EVENT)).toBeNull();
    const text = (eventType?: OsEventTypeList) =>
      toGestureEvent({ textEvent: { eventType } as never });
    expect(text(OsEventTypeList.SCROLL_TOP_EVENT)).toEqual({ t: 'up' });
    expect(text(OsEventTypeList.SCROLL_BOTTOM_EVENT)).toEqual({ t: 'down' });
    expect(text(undefined)).toBeNull();
    expect(toGestureEvent({ menuItemClickEvent: { itemID: 3 } as never })).toEqual({
      t: 'menu',
      id: 3,
    });
    expect(toGestureEvent({ menuItemClickEvent: {} as never })).toBeNull();
    expect(toGestureEvent({ jsonData: { type: EvenHubEventType.audioEvent } })).toBeNull();
  });
});
