/**
 * Zone E state machine (docs/design/g2-sheet-ux.html §Interazione) and
 * Even Hub event mapping. Tool inputs are validated against the shared-protocol Zod
 * schemas the GM projector's `dispatchTool` uses.
 */
import { EvenHubEventType, OsEventTypeList } from '@evenrealities/even_hub_sdk';
import {
  CastCounterspellInputSchema,
  CastShieldInputSchema,
  CastSpellInputSchema,
  OpportunityAttackInputSchema,
  SkillCheckInputSchema,
  UseItemInputSchema,
  WeaponAttackInputSchema,
} from '@evf/shared-protocol';
import { describe, expect, it } from 'vitest';
import { character, combat, online, result } from '../../demo/fixtures.js';
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

describe('weapon attack flow (S3 → S4 → S6)', () => {
  it('actions → weapon → target → roll invokes weapon-attack with the chosen target', () => {
    const app = online('max');
    const { ui, effects } = drive(app, [{ t: 'tap' }, { t: 'tap' }, { t: 'down' }, { t: 'tap' }]);
    expect(ui.view).toBe('result');
    // Targets list enemies first, nearest first: Goblin A (5 ft), Goblin B (10 ft), …
    expect(ui.result?.title).toBe('Martello da guerra +3 del Drago Rosso → Goblin B');
    const [call] = invokes(effects);
    expect(call?.tool).toBe('weapon-attack');
    expect(WeaponAttackInputSchema.parse(call?.input)).toEqual({
      actor_id: 'actor-1',
      item_id: 'w1',
      targets: ['t-gob2'],
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

describe('spell flow (S5)', () => {
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
  it('items → target → use-item (a consumable picks its target like a weapon)', () => {
    const app = online();
    const toTarget: HudInput[] = [
      { t: 'tap' },
      { t: 'down' },
      { t: 'down' },
      { t: 'down' },
      { t: 'tap' },
      { t: 'tap' },
    ];
    const picking = drive(app, toTarget);
    expect(picking.ui).toMatchObject({ view: 'target', pending: { kind: 'item', itemId: 'p1' } });
    expect(picking.effects).toEqual([]);
    // First target (nearest enemy) → targets [tokenId].
    const { effects, ui } = drive(app, [{ t: 'tap' }], picking.ui);
    expect(ui.view).toBe('result');
    const call = invokes(effects)[0];
    expect(call?.tool).toBe('use-item');
    const parsed = UseItemInputSchema.parse(call?.input);
    expect(parsed).toMatchObject({ actor_id: 'actor-1', item_id: 'p1' });
    expect(parsed.targets).toHaveLength(1);
    // «No target» (last entry) → untargeted use; double-press returns to the items list.
    const entries = buildEntries(app, picking.ui, s);
    const none = drive(app, [{ t: 'tap' }], { ...picking.ui, cursor: entries.length - 1 });
    expect(UseItemInputSchema.parse(invokes(none.effects)[0]?.input).targets).toEqual([]);
    expect(drive(app, [{ t: 'double' }], picking.ui).ui).toMatchObject({
      view: 'items',
      pending: null,
    });
  });

  it('feats: read-only list under Talenti…, origin feats tagged, tap/double return', () => {
    const feats = [
      { category: 'feat', name: 'Robusto', isOrigin: true, description: '' },
      { category: 'class', name: 'Canalizzare divinità', isOrigin: false, description: '' },
    ];
    const app = online('min', { character: { ...character(), feats } });
    const actions = drive(app, [{ t: 'tap' }]).ui;
    const entries = buildEntries(app, actions, s);
    const at = entries.findIndex((e) => e.left === s.featsMenu);
    expect(at).toBeGreaterThan(0);
    expect(buildEntries(online(), actions, s).some((e) => e.left === s.featsMenu)).toBe(false);
    const open = drive(app, [{ t: 'tap' }], { ...actions, cursor: at }).ui;
    expect(open.view).toBe('feats');
    expect(buildEntries(app, open, s).map((e) => [e.left, e.right])).toEqual([
      ['Robusto', s.featOrigin],
      ['Canalizzare divinità', ''],
    ]);
    expect(drive(app, [{ t: 'tap' }], open)).toEqual({
      ui: expect.objectContaining({ view: 'actions' }),
      effects: [],
    });
    expect(drive(app, [{ t: 'double' }], open).ui.view).toBe('actions');
  });

  it('every menu operation is reachable by tap through Opzioni…', () => {
    // Mid zoom level so both "Zoom +" and "Zoom −" produce an effect.
    const app = online('min', { settings: { ...online().settings, mapCellPx: 8 } });
    const opts = drive(app, [
      { t: 'tap' },
      { t: 'down' },
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
    expect(effectsOf(0).ui.sheetPage).toBe('saves');
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
    expect(drive(online(), Array(2).fill({ t: 'menu', id: page })).ui.sheetPage).toBe('abilities');
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

describe('end turn (S3 «Fine turno»)', () => {
  const myTurn = () => online('min', { combat: combat('thorin') });
  const endTurnIndex = (app: AppState) =>
    buildEntries(app, { ...initialUi(), view: 'actions' }, s).findIndex(
      (e) => e.intent.k === 'op' && e.intent.op === 'endTurn',
    );

  it('is offered in the actions list only during the player’s turn', () => {
    expect(endTurnIndex(myTurn())).toBeGreaterThanOrEqual(0);
    expect(endTurnIndex(online('min', { combat: combat('goblin-b') }))).toBe(-1);
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
    const refused = drive(online('min', { combat: combat('goblin-b') }), [menu]);
    expect(refused.effects).toEqual([]);
    expect(refused.ui.view).toBe('result');
    expect(refused.ui.result?.ack).toEqual({ error: s.errors['wrong-turn'] });
    expect(drive(online(), [menu]).ui.result?.ack).toEqual({ error: s.errors['wrong-turn'] });
  });
});

describe('result (S6)', () => {
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

describe('reaction (S7)', () => {
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

describe('GM roll request and automatic sheet page (S8)', () => {
  const request = { messageId: 'm1', kind: 'save' as const, ability: 'wis' as const, dc: 15 };

  it('a request opens the request view on «Tiri salvezza · Abilità»; handling it returns', () => {
    const prev = online();
    const asked = { ...prev, rollRequest: request };
    const open = reduce(initialUi(), { t: 'state', prev }, { app: asked, now: 0, strings: s }).ui;
    expect(open).toMatchObject({ view: 'request', sheetPage: 'saves' });
    expect(buildEntries(asked, open, s).map((e) => e.intent.k)).toEqual(['dismissRequest', 'roll']);
    expect(drive(asked, [{ t: 'tap' }], open)).toMatchObject({
      ui: { view: 'root' },
      effects: [{ t: 'clearRequest' }],
    });
    // «Tira in Foundry»: clears the request and rolls the save via skill-check.
    const rolled = drive(asked, [{ t: 'down' }, { t: 'tap' }], open);
    expect(rolled.ui.view).toBe('result');
    expect(rolled.effects[0]).toEqual({ t: 'clearRequest' });
    const call = invokes(rolled.effects)[0];
    expect(call?.tool).toBe('skill-check');
    expect(SkillCheckInputSchema.parse(call?.input)).toEqual({
      actor_id: 'actor-1',
      kind: 'save',
      ability: 'wis',
      advantage: 'normal',
    });
    expect(drive(asked, [{ t: 'double' }], open).effects).toEqual([{ t: 'clearRequest' }]);
    const handled = reduce(open, { t: 'state', prev: asked }, { app: prev, now: 0, strings: s }).ui;
    expect(handled).toMatchObject({ view: 'root', sheetPage: 'abilities' });
  });

  it('a pending reaction keeps priority; manual mode never switches the page', () => {
    const prev = online();
    const reacting = { ...initialUi(), view: 'reaction' as const };
    const reaction = { kind: 'shield' as const, sourceName: 'Orco', expiresAt: 9e9 };
    expect(
      reduce(
        reacting,
        { t: 'state', prev: { ...prev, reaction } },
        { app: { ...prev, reaction, rollRequest: request }, now: 0, strings: s },
      ).ui.view,
    ).toBe('reaction');
    const asked = { ...prev, rollRequest: request };
    const manual = { ...asked, settings: { ...asked.settings, autoSheetPage: false } };
    const ui = reduce(initialUi(), { t: 'state', prev }, { app: manual, now: 0, strings: s }).ui;
    expect(ui).toMatchObject({ view: 'request', sheetPage: 'abilities' });
    const back = reduce(
      { ...ui, view: 'actions' },
      { t: 'state', prev: manual },
      { app: { ...manual, rollRequest: null }, now: 0, strings: s },
    ).ui;
    expect(back).toMatchObject({ view: 'actions', sheetPage: 'abilities' });
  });
});

describe('status screens (S10–S12)', () => {
  it('unpaired / connecting: only double-tap (exit / cancel) does something', () => {
    const unpaired = initialState();
    expect(drive(unpaired, [{ t: 'double' }]).effects).toEqual([{ t: 'exit' }]);
    expect(drive(unpaired, [{ t: 'tap' }, { t: 'down' }, { t: 'menu', id: 7 }]).effects).toEqual(
      [],
    );
    const connecting = { ...initialState(), connection: { status: 'connecting' as const } };
    expect(drive(connecting, [{ t: 'double' }]).effects).toEqual([{ t: 'exit' }]);
  });

  it('offline (S12): tap or menu reconnect retries, double exits', () => {
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
    const sys = (eventType?: OsEventTypeList, eventSource: number | null = 2) =>
      toGestureEvent({ sysEvent: { eventType, eventSource: eventSource ?? undefined } as never });
    expect(sys(undefined)).toEqual({ t: 'tap' });
    // Clicks count only from a real touch source (glasses R 1, ring 2, glasses L 3).
    expect(sys(OsEventTypeList.CLICK_EVENT, 1)).toEqual({ t: 'tap' });
    expect(sys(OsEventTypeList.CLICK_EVENT, 3)).toEqual({ t: 'tap' });
    expect(sys(undefined, null)).toBeNull();
    expect(sys(OsEventTypeList.CLICK_EVENT, 0)).toBeNull();
    expect(sys(OsEventTypeList.DOUBLE_CLICK_EVENT, null)).toEqual({ t: 'double' });
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
