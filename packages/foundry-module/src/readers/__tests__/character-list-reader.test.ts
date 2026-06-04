/**
 * Unit tests for character-list-reader.ts.
 *
 * Quick Task 260604-eyf — push-based character-list path for real pairing.
 *
 * Uses vi.stubGlobal to mock Foundry globals (`game`, `Hooks`).
 * No real Foundry runtime.
 *
 * Test coverage:
 * - readCharacterList: wraps listPlayerCharacters() result into snapshot
 * - readCharacterList: returns empty snapshot on throw (defensive)
 * - registerCharacterListReader: emits immediately on call
 *
 * @see packages/foundry-module/src/readers/character-list-reader.ts
 * @see .planning/quick/260604-eyf-wire-bridge-foundry-real-pairing-push-ba/260604-eyf-PLAN.md Task 2
 */

import { R1_CHARACTERS_AVAILABLE_TYPE } from '@evf/shared-protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readCharacterList, registerCharacterListReader } from '../character-list-reader.js';

// ─── Hooks mock infrastructure ────────────────────────────────────────────────

const hookHandlers: Map<string, Array<(...args: unknown[]) => unknown>> = new Map();
let hookIdCounter = 100;

function makeHooksMock() {
  return {
    once: vi.fn(),
    on: vi.fn().mockImplementation((event: string, fn: (...args: unknown[]) => unknown) => {
      if (!hookHandlers.has(event)) hookHandlers.set(event, []);
      const handlers = hookHandlers.get(event);
      if (handlers !== undefined) handlers.push(fn);
      return hookIdCounter++;
    }),
    off: vi.fn().mockImplementation(() => {}),
  };
}

// ─── Mock actor builder ───────────────────────────────────────────────────────

function makeActor(id: string, name: string, level: number, type = 'character') {
  return {
    id,
    name,
    type,
    system: { details: { level } },
    statuses: new Set<string>(),
    items: { contents: [] },
    img: 'icons/svg/mystery-man.svg',
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('readCharacterList', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('wraps listPlayerCharacters() result into CharacterListSnapshot', () => {
    vi.stubGlobal('game', {
      actors: {
        contents: [
          makeActor('actor-1', 'Aragorn', 10),
          makeActor('actor-2', 'Legolas', 8),
          makeActor('npc-1', 'Goblin', 1, 'npc'), // should be excluded
        ],
      },
    });

    const result = readCharacterList();

    expect(result.source).toBe('foundry-world');
    expect(result.count).toBe(2);
    expect(result.characters).toHaveLength(2);

    // listPlayerCharacters sorts by name ascending
    const names = result.characters.map((c) => c.name);
    expect(names).toContain('Aragorn');
    expect(names).toContain('Legolas');
    expect(names).not.toContain('Goblin');
  });

  it('returns empty snapshot with source=foundry-world on throw (defensive)', () => {
    vi.stubGlobal('game', {
      actors: {
        get contents() {
          throw new Error('actors unavailable');
        },
      },
    });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = readCharacterList();

    expect(result.source).toBe('foundry-world');
    expect(result.count).toBe(0);
    expect(result.characters).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalled();
  });

  it('includes generatedAt as a recent timestamp', () => {
    const NOW = 1_700_000_000_000;
    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    vi.stubGlobal('game', {
      actors: { contents: [] },
    });

    const result = readCharacterList();

    expect(result.generatedAt).toBe(NOW);

    vi.useRealTimers();
  });

  it('preserves level from actor.system.details.level', () => {
    vi.stubGlobal('game', {
      actors: {
        contents: [makeActor('actor-1', 'Gandalf', 20)],
      },
    });

    const result = readCharacterList();

    expect(result.characters[0]?.level).toBe(20);
    expect(result.characters[0]?.actorId).toBe('actor-1');
  });
});

describe('registerCharacterListReader', () => {
  beforeEach(() => {
    hookHandlers.clear();
    hookIdCounter = 100;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('emits immediately when called', () => {
    vi.stubGlobal('game', {
      actors: {
        contents: [makeActor('actor-1', 'Frodo', 5)],
      },
    });
    vi.stubGlobal('Hooks', makeHooksMock());

    const emit = vi.fn();
    registerCharacterListReader(emit);

    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith(
      R1_CHARACTERS_AVAILABLE_TYPE,
      expect.objectContaining({ source: 'foundry-world', count: 1 }),
    );
  });

  it('registers createActor/updateActor/deleteActor hooks', () => {
    vi.stubGlobal('game', {
      actors: { contents: [] },
    });
    const hooksMock = makeHooksMock();
    vi.stubGlobal('Hooks', hooksMock);

    const emit = vi.fn();
    registerCharacterListReader(emit);

    // Should have registered listeners for actor lifecycle hooks
    const registeredEvents = hooksMock.on.mock.calls.map((call: unknown[]) => call[0] as string);
    expect(registeredEvents).toContain('createActor');
    expect(registeredEvents).toContain('updateActor');
    expect(registeredEvents).toContain('deleteActor');
  });

  it('re-emits on actor hook with debounce', () => {
    vi.useFakeTimers();

    vi.stubGlobal('game', {
      actors: { contents: [makeActor('a', 'Bilbo', 1)] },
    });
    vi.stubGlobal('Hooks', makeHooksMock());

    const emit = vi.fn();
    registerCharacterListReader(emit);

    // Initial emit
    expect(emit).toHaveBeenCalledTimes(1);

    // Fire one of the actor lifecycle hooks
    const handlers = hookHandlers.get('createActor');
    expect(handlers).toBeDefined();
    handlers?.[0]?.();

    // Before debounce — no extra emit
    expect(emit).toHaveBeenCalledTimes(1);

    // Advance past debounce (500ms)
    vi.advanceTimersByTime(600);

    expect(emit).toHaveBeenCalledTimes(2);
    expect(emit).toHaveBeenLastCalledWith(
      R1_CHARACTERS_AVAILABLE_TYPE,
      expect.objectContaining({ source: 'foundry-world' }),
    );

    vi.useRealTimers();
  });

  it('unsubscribe closure calls Hooks.off for all registered hook IDs', () => {
    vi.stubGlobal('game', {
      actors: { contents: [] },
    });
    const hooksMock = makeHooksMock();
    vi.stubGlobal('Hooks', hooksMock);

    const emit = vi.fn();
    const unsubscribe = registerCharacterListReader(emit);

    unsubscribe();

    // Should have called off for each registered hook (createActor, updateActor, deleteActor)
    expect(hooksMock.off).toHaveBeenCalledTimes(3);
  });
});
