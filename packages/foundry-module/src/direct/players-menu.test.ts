import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type FoundryMock,
  installFoundry,
  makeActor,
  makeUser,
} from '../__tests__/direct-fixtures.js';
import { enableGlasses } from './glasses-access.js';
import {
  buildPairMenuEntry,
  buildSelfMenuEntry,
  pairTargetFor,
  registerPlayersMenu,
  rowUserId,
  USER_CONTEXT_HOOK,
} from './players-menu.js';

let f: FoundryMock;

beforeEach(() => {
  f = installFoundry({
    users: [
      makeUser('p1', 'Luca', { character: { id: 'mira' } }),
      makeUser('p2', 'Bea'),
      makeUser('g2x', 'Luca (G2)', { flags: { evenfoundryvtt: { g2For: 'p1' } } }),
    ],
    actors: [makeActor('mira', 'Mira', { ownership: { p1: 3 } })],
  });
});
afterEach(() => vi.unstubAllGlobals());

/** A Players-list row as rendered by Foundry (`<li data-user-id>`), optionally nested. */
function row(userId: string | null): HTMLElement {
  const li = document.createElement('li');
  if (userId !== null) li.dataset.userId = userId;
  return li;
}

type V13Entry = {
  name: string;
  icon: string;
  condition: (li: unknown) => boolean;
  callback: (li: unknown) => void;
};
type V14Entry = {
  label: string;
  icon: string;
  visible: (target: HTMLElement) => boolean;
  onClick: (event: Event, target: HTMLElement) => void;
};

describe('players-menu', () => {
  it('PM-01 rowUserId reads data-user-id from the row, a child, or a jQuery wrapper', () => {
    expect(rowUserId(row('p1'))).toBe('p1');
    const li = row('p2');
    const child = document.createElement('span');
    li.append(child);
    expect(rowUserId(child)).toBe('p2');
    expect(rowUserId({ 0: row('p1') })).toBe('p1');
    expect(rowUserId(row(null))).toBeNull();
    expect(rowUserId({})).toBeNull();
    expect(rowUserId(null)).toBeNull();
  });

  it('PM-02 pairTargetFor: players only, with their assigned character preselected', () => {
    expect(pairTargetFor('p1')).toEqual({ playerUserId: 'p1', actorId: 'mira' });
    expect(pairTargetFor('p2')).toEqual({ playerUserId: 'p2', actorId: null });
    // An assigned character the player does not own is not preselected.
    (f.actors.get('mira') as { ownership: Record<string, number> }).ownership = {};
    expect(pairTargetFor('p1')).toEqual({ playerUserId: 'p1', actorId: null });
    expect(pairTargetFor('gm1')).toBeNull(); // GM
    expect(pairTargetFor('g2x')).toBeNull(); // a "(G2)" user
    expect(pairTargetFor('nobody')).toBeNull();
    expect(pairTargetFor(null)).toBeNull();
  });

  it('PM-03 registers getUserContextOptions and adds the entry on GM clients (v13 shape)', () => {
    const open = vi.fn();
    const id = registerPlayersMenu(open, vi.fn());
    expect(typeof id).toBe('number');
    expect(f.hooks.on).toHaveBeenCalledWith(USER_CONTEXT_HOOK, expect.any(Function));
    expect(USER_CONTEXT_HOOK).toBe('getUserContextOptions');

    const items: unknown[] = [{ name: 'PLAYERS.ConfigTitle' }];
    f.fire(USER_CONTEXT_HOOK, {}, items);
    expect(items).toHaveLength(2);
    const entry = items[1] as V13Entry;
    expect(entry.name).toBe('evf.players_menu.pair');
    expect(entry.icon).toBe('<i class="fas fa-glasses"></i>');
    expect(entry.condition(row('p1'))).toBe(true);
    expect(entry.condition(row('gm1'))).toBe(false);
    expect(entry.condition(row('g2x'))).toBe(false);
    entry.callback(row('p1'));
    expect(open).toHaveBeenCalledWith({ playerUserId: 'p1', actorId: 'mira' });
    entry.callback(row('gm1'));
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('PM-04 v14 entries use label / visible / onClick', () => {
    (f.game as { release?: unknown }).release = { generation: 14 };
    const open = vi.fn();
    registerPlayersMenu(open, vi.fn());
    const items: unknown[] = [];
    f.fire(USER_CONTEXT_HOOK, {}, items);
    const entry = items[0] as V14Entry;
    expect(entry).toMatchObject({ label: 'evf.players_menu.pair', icon: 'fas fa-glasses' });
    expect(entry.visible(row('p2'))).toBe(true);
    entry.onClick(new Event('click'), row('p2'));
    expect(open).toHaveBeenCalledWith({ playerUserId: 'p2', actorId: null });
  });

  it('PM-05 player clients get the self entry, not the GM one; tolerant of odd hook args', () => {
    const open = vi.fn();
    registerPlayersMenu(open, vi.fn());
    f.fire(USER_CONTEXT_HOOK, {}, undefined); // unexpected payload: ignored, no throw
    f.game.user.isGM = false;
    const items: unknown[] = [];
    f.fire(USER_CONTEXT_HOOK, {}, items);
    expect(items).toHaveLength(1);
    expect((items[0] as V13Entry).name).toBe('evf.players_menu.pair_self');
    // Entry built earlier but evaluated by a non-GM: hidden.
    const entry = buildPairMenuEntry(open, 13) as V13Entry;
    expect(entry.condition(row('p1'))).toBe(false);
  });

  it('PM-06 player entry «Pair my glasses»: own row only, once enabled; v13 + v14 shapes', async () => {
    await enableGlasses('p2');
    const open = vi.fn();
    const player = f.users.find((u) => u.id === 'p2');
    if (player === undefined) throw new Error('p2');
    f.game.user = player;
    const v13 = buildSelfMenuEntry(open, 13) as V13Entry;
    expect(v13.name).toBe('evf.players_menu.pair_self');
    expect(v13.condition(row('p2'))).toBe(true);
    expect(v13.condition(row('p1'))).toBe(false); // someone else's row
    v13.callback(row('p1'));
    expect(open).not.toHaveBeenCalled();
    v13.callback(row('p2'));
    expect(open).toHaveBeenCalledTimes(1);
    const v14 = buildSelfMenuEntry(open, 14) as V14Entry;
    expect(v14).toMatchObject({ label: 'evf.players_menu.pair_self', icon: 'fas fa-glasses' });
    v14.onClick(new Event('click'), row('p2'));
    expect(open).toHaveBeenCalledTimes(2);
    // Not enabled → hidden.
    const p1 = f.users.find((u) => u.id === 'p1');
    if (p1 !== undefined) f.game.user = p1;
    expect(v13.condition(row('p1'))).toBe(false);
  });
});
