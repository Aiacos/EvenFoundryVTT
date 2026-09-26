import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type FoundryMock,
  installFoundry,
  makeActor,
  makeUser,
} from '../__tests__/direct-fixtures.js';
import {
  buildPairMenuEntry,
  canPairFrom,
  characterOf,
  registerPairShortcuts,
  rowUserId,
  USER_CONTEXT_HOOK,
} from './players-menu.js';

let f: FoundryMock;

beforeEach(() => {
  f = installFoundry({
    users: [makeUser('p1', 'Luca', { character: { id: 'mira' } }), makeUser('p2', 'Bea')],
    actors: [makeActor('mira', 'Mira', { ownership: { p1: 3 } })],
  });
});
afterEach(() => vi.unstubAllGlobals());

/** A Players-list row as rendered by Foundry (`<li data-user-id>`). */
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

function asPlayer(id: string): void {
  const user = f.users.find((u) => u.id === id);
  if (user === undefined) throw new Error(id);
  f.game.user = user;
}

describe('pairing shortcuts', () => {
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

  it('PM-02 a GM pairs from any player row; a player only from their own', () => {
    expect(canPairFrom('p1')).toBe(true);
    expect(canPairFrom('gm1')).toBe(false);
    expect(canPairFrom('nobody')).toBe(false);
    expect(canPairFrom(null)).toBe(false);
    asPlayer('p1');
    expect(canPairFrom('p1')).toBe(true);
    expect(canPairFrom('p2')).toBe(false);
  });

  it('PM-03 characterOf preselects the assigned character only when owned', () => {
    expect(characterOf('p1')).toBe('mira');
    expect(characterOf('p2')).toBeNull();
    expect(characterOf(null)).toBeNull();
    (f.actors.get('mira') as { ownership: Record<string, number> }).ownership = {};
    expect(characterOf('p1')).toBeNull();
  });

  it('PM-04 registers the context-menu hook (v13 shape) and the Alt+G keybinding', () => {
    const open = vi.fn();
    expect(typeof registerPairShortcuts(open)).toBe('number');
    expect(f.hooks.on).toHaveBeenCalledWith(USER_CONTEXT_HOOK, expect.any(Function));
    const items: unknown[] = [{ name: 'PLAYERS.ConfigTitle' }];
    f.fire(USER_CONTEXT_HOOK, {}, items);
    f.fire(USER_CONTEXT_HOOK, {}, undefined); // unexpected payload: ignored
    const entry = items[1] as V13Entry;
    expect(entry).toMatchObject({
      name: 'evf.players_menu.pair',
      icon: '<i class="fas fa-glasses"></i>',
    });
    expect(entry.condition(row('p1'))).toBe(true);
    entry.callback(row('p1'));
    expect(open).toHaveBeenCalledWith('mira');
    entry.callback(row('gm1'));
    expect(open).toHaveBeenCalledTimes(1);
    const binding = f.keybindings.get('evenfoundryvtt.pairGlasses');
    expect(binding?.onDown?.()).toBe(true);
    expect(open).toHaveBeenLastCalledWith(null);
  });

  it('PM-05 v14 entries use label / visible / onClick', () => {
    const open = vi.fn();
    asPlayer('p2');
    const entry = buildPairMenuEntry(open, 14) as V14Entry;
    expect(entry).toMatchObject({ label: 'evf.players_menu.pair', icon: 'fas fa-glasses' });
    expect(entry.visible(row('p2'))).toBe(true);
    expect(entry.visible(row('p1'))).toBe(false);
    entry.onClick(new Event('click'), row('p2'));
    expect(open).toHaveBeenCalledWith(null);
  });

  it('PM-06 the Foundry generation picks the entry shape', () => {
    (f.game as { release?: unknown }).release = { generation: 14 };
    registerPairShortcuts(vi.fn());
    const items: unknown[] = [];
    f.fire(USER_CONTEXT_HOOK, {}, items);
    expect((items[0] as V14Entry).label).toBe('evf.players_menu.pair');
  });
});
