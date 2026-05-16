/**
 * Unit tests for reaction-watcher (Plan 07-05 — REACT-01).
 *
 * Key assertions:
 * - Hooks.on called with LITERAL string 'dnd5e.preUseActivity' (T-07-05-03)
 * - Player's own action does NOT emit
 * - NPC attack targeting player emits with kind:'shield' + sourceName=NPC name
 * - NPC spell targeting player emits with kind:'counterspell'
 * - null game.user.character → no emit
 * - Handler throws → swallowed + console.warn
 * - Hook handler return value is NEVER false (T-07-05-04)
 * - Unsubscribe calls Hooks.off with the returned hook ID
 *
 * @see packages/foundry-module/src/write-path/reaction-watcher.ts
 * @see .planning/phases/07-foundry-module-write-path/07-05-PLAN.md Task 1
 * @see .planning/phases/07-foundry-module-write-path/07-RESEARCH.md §Q3 (dnd5e.preUseActivity)
 */

import type { ReactionAvailablePayload } from '@evf/shared-protocol';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Foundry global mocks ─────────────────────────────────────────────────────

/** Captured hook handler reference — set when Hooks.on fires. */
let capturedHandler: ((...args: unknown[]) => unknown) | null = null;
/** Captured hookId returned by Hooks.on. */
const MOCK_HOOK_ID = 42;

function makeHooksMock() {
  capturedHandler = null;
  return {
    on: vi.fn((event: string, fn: (...args: unknown[]) => unknown): number => {
      if (event === 'dnd5e.preUseActivity') {
        capturedHandler = fn;
      }
      return MOCK_HOOK_ID;
    }),
    off: vi.fn((_hookId: number): void => {}),
    once: vi.fn(),
  };
}

function makeGameMock(opts: {
  playerActorId?: string | null;
  playerCharacter?: { id: string } | null;
}) {
  return {
    user: {
      character: opts.playerCharacter ?? (opts.playerActorId ? { id: opts.playerActorId } : null),
    },
    actors: { get: vi.fn() },
    settings: { get: vi.fn(), set: vi.fn(), register: vi.fn(), registerMenu: vi.fn() },
    i18n: { lang: 'en', localize: vi.fn() },
    combat: null,
    users: { get: vi.fn() },
  };
}

function makeNpcActivity(opts: {
  actorId: string;
  actorName: string;
  type?: string;
  itemType?: string;
  activationType?: string;
}) {
  return {
    actor: {
      id: opts.actorId,
      name: opts.actorName,
      type: 'npc',
    },
    type: opts.type ?? 'attack',
    item: {
      type: opts.itemType ?? 'weapon',
      system: {
        activation: { type: opts.activationType ?? 'action' },
      },
    },
    activation: { type: opts.activationType ?? 'action' },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('registerReactionWatcher', () => {
  let hooksMock: ReturnType<typeof makeHooksMock>;

  beforeEach(async () => {
    vi.resetModules();
    hooksMock = makeHooksMock();
    vi.stubGlobal('Hooks', hooksMock);
  });

  it('registers Hooks.on with LITERAL string "dnd5e.preUseActivity" (T-07-05-03)', async () => {
    const gameMock = makeGameMock({ playerActorId: 'player-1' });
    vi.stubGlobal('game', gameMock);

    const { registerReactionWatcher } = await import('./reaction-watcher.js');
    const emit = vi.fn();
    registerReactionWatcher(emit);

    expect(hooksMock.on).toHaveBeenCalledWith('dnd5e.preUseActivity', expect.any(Function));
    // Verify NOT called with wrong hook names (T-07-05-03)
    const calls = hooksMock.on.mock.calls;
    const hookNames = calls.map((c) => c[0]);
    expect(hookNames).not.toContain('dnd5e.preActivityUse');
    expect(hookNames).not.toContain('dnd5e.preItemUsage');
  });

  it('does NOT emit when the acting actor IS the player character', async () => {
    const PLAYER_ACTOR_ID = 'player-actor-1';
    const gameMock = makeGameMock({ playerActorId: PLAYER_ACTOR_ID });
    vi.stubGlobal('game', gameMock);

    const { registerReactionWatcher } = await import('./reaction-watcher.js');
    const emit = vi.fn();
    registerReactionWatcher(emit);

    // Simulate player's own action
    const ownActivity = makeNpcActivity({
      actorId: PLAYER_ACTOR_ID,
      actorName: 'Aragorn',
      type: 'attack',
    });

    expect(capturedHandler).not.toBeNull();
    capturedHandler?.(ownActivity);

    expect(emit).not.toHaveBeenCalled();
  });

  it('emits with kind:"shield" + correct sourceName when NPC uses attack activity targeting player', async () => {
    const PLAYER_ACTOR_ID = 'player-actor-1';
    const gameMock = makeGameMock({ playerActorId: PLAYER_ACTOR_ID });
    vi.stubGlobal('game', gameMock);

    const { registerReactionWatcher } = await import('./reaction-watcher.js');
    const emit = vi.fn<(payload: ReactionAvailablePayload) => void>();
    registerReactionWatcher(emit);

    const npcActivity = makeNpcActivity({
      actorId: 'npc-goblin-1',
      actorName: 'Goblin Guerriero',
      type: 'attack',
    });

    capturedHandler?.(npcActivity);

    expect(emit).toHaveBeenCalledTimes(1);
    const payload = emit.mock.calls[0]?.[0];
    expect(payload?.kind).toBe('shield');
    expect(payload?.sourceName).toBe('Goblin Guerriero');
    expect(typeof payload?.expiresAt).toBe('number');
  });

  it('emits with kind:"counterspell" when NPC uses a spell activity targeting player', async () => {
    const PLAYER_ACTOR_ID = 'player-actor-1';
    const gameMock = makeGameMock({ playerActorId: PLAYER_ACTOR_ID });
    vi.stubGlobal('game', gameMock);

    const { registerReactionWatcher } = await import('./reaction-watcher.js');
    const emit = vi.fn<(payload: ReactionAvailablePayload) => void>();
    registerReactionWatcher(emit);

    const spellActivity = makeNpcActivity({
      actorId: 'npc-wizard-1',
      actorName: 'Arcimago',
      type: 'spell',
      itemType: 'spell',
      activationType: 'action',
    });

    capturedHandler?.(spellActivity);

    expect(emit).toHaveBeenCalledTimes(1);
    const payload = emit.mock.calls[0]?.[0];
    expect(payload?.kind).toBe('counterspell');
    expect(payload?.sourceName).toBe('Arcimago');
  });

  it('does NOT emit when game.user.character is null (no player character)', async () => {
    const gameMock = makeGameMock({ playerCharacter: null });
    vi.stubGlobal('game', gameMock);

    const { registerReactionWatcher } = await import('./reaction-watcher.js');
    const emit = vi.fn();
    registerReactionWatcher(emit);

    const npcActivity = makeNpcActivity({
      actorId: 'npc-1',
      actorName: 'Goblin',
      type: 'attack',
    });

    capturedHandler?.(npcActivity);
    expect(emit).not.toHaveBeenCalled();
  });

  it('swallows handler throws and warns via console.warn (defensive try/catch)', async () => {
    const PLAYER_ACTOR_ID = 'player-actor-1';
    const gameMock = makeGameMock({ playerActorId: PLAYER_ACTOR_ID });
    vi.stubGlobal('game', gameMock);

    const { registerReactionWatcher } = await import('./reaction-watcher.js');
    const emit = vi.fn(() => {
      throw new Error('emit exploded');
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    registerReactionWatcher(emit);

    const npcActivity = makeNpcActivity({
      actorId: 'npc-1',
      actorName: 'Goblin',
      type: 'attack',
    });

    // Should NOT throw — handler swallows the error
    expect(() => capturedHandler?.(npcActivity)).not.toThrow();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('hook handler return value is NEVER false (display-only invariant T-07-05-04)', async () => {
    const PLAYER_ACTOR_ID = 'player-actor-1';
    const gameMock = makeGameMock({ playerActorId: PLAYER_ACTOR_ID });
    vi.stubGlobal('game', gameMock);

    const { registerReactionWatcher } = await import('./reaction-watcher.js');
    const emit = vi.fn();
    registerReactionWatcher(emit);

    const npcActivity = makeNpcActivity({
      actorId: 'npc-1',
      actorName: 'Goblin',
      type: 'attack',
    });

    // Handler must NEVER return false (which would cancel the NPC action)
    const returnValue = capturedHandler?.(npcActivity);
    expect(returnValue).not.toBe(false);
    // Explicit: return value should be undefined (no return statement needed)
    expect(returnValue).toBeUndefined();
  });

  it('returns unsubscribe that calls Hooks.off with the hook ID returned by Hooks.on', async () => {
    const PLAYER_ACTOR_ID = 'player-actor-1';
    const gameMock = makeGameMock({ playerActorId: PLAYER_ACTOR_ID });
    vi.stubGlobal('game', gameMock);

    const { registerReactionWatcher } = await import('./reaction-watcher.js');
    const emit = vi.fn();
    const unsubscribe = registerReactionWatcher(emit);

    expect(hooksMock.off).not.toHaveBeenCalled();
    unsubscribe();
    expect(hooksMock.off).toHaveBeenCalledWith(MOCK_HOOK_ID);
  });

  it('does NOT emit when activity.actor is null/undefined', async () => {
    const PLAYER_ACTOR_ID = 'player-actor-1';
    const gameMock = makeGameMock({ playerActorId: PLAYER_ACTOR_ID });
    vi.stubGlobal('game', gameMock);

    const { registerReactionWatcher } = await import('./reaction-watcher.js');
    const emit = vi.fn();
    registerReactionWatcher(emit);

    // Activity with no actor
    capturedHandler?.({ actor: null, type: 'attack', item: null, activation: null });
    expect(emit).not.toHaveBeenCalled();
  });
});
