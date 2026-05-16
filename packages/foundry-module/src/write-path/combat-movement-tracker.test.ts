/**
 * Unit tests for combat-movement-tracker (Plan 08-04 — ACT-01 move variant).
 *
 * Key assertions:
 * - CMT-01: registerMovementTracker calls Hooks.on('updateToken') AND Hooks.on('updateCombat')
 *           and returns an unsubscribe closure that calls both Hooks.off calls
 * - CMT-02: updateToken handler — if neither change.x nor change.y present → silent return (no emit)
 * - CMT-03: When change.x/y present AND actor matches player AND combat active → accumulate + emit
 * - CMT-04: Outside combat (game.combat is null) → no accumulation, no emit
 * - CMT-05: updateCombat handler resets usedThisTurn to 0 + emits fresh payload on turn advance
 * - CMT-06: Handler is defensive — try/catch wraps emit; console.warn on throw; never returns false
 * - CMT-07: Player has no actor (game.user.character is null) → silent return on updateToken
 * - CMT-08: registerMovementTracker signature: (emit) => () => void
 *
 * @see packages/foundry-module/src/write-path/combat-movement-tracker.ts
 * @see .planning/phases/08-manual-action-ux/08-04-PLAN.md Task 2
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MovementBudgetPayload } from '@evf/shared-protocol';

// ─── Foundry global mocks ─────────────────────────────────────────────────────

const MOCK_UPDATE_TOKEN_HOOK_ID = 101;
const MOCK_UPDATE_COMBAT_HOOK_ID = 102;

/** Captured hook handlers for test invocation. */
let capturedUpdateTokenHandler: ((...args: unknown[]) => void) | null = null;
let capturedUpdateCombatHandler: ((...args: unknown[]) => void) | null = null;

function makeHooksMock() {
  capturedUpdateTokenHandler = null;
  capturedUpdateCombatHandler = null;
  return {
    on: vi.fn((event: string, fn: (...args: unknown[]) => void): number => {
      if (event === 'updateToken') {
        capturedUpdateTokenHandler = fn;
        return MOCK_UPDATE_TOKEN_HOOK_ID;
      }
      if (event === 'updateCombat') {
        capturedUpdateCombatHandler = fn;
        return MOCK_UPDATE_COMBAT_HOOK_ID;
      }
      return 0;
    }),
    off: vi.fn((_hookId: number): void => {}),
    once: vi.fn(),
  };
}

function makeGameMock(opts?: {
  actorId?: string;
  hasCharacter?: boolean;
  hasCombat?: boolean;
  walkSpeed?: number;
}) {
  const actorId = opts?.actorId ?? 'actor-player-1';
  const hasCharacter = opts?.hasCharacter ?? true;
  const hasCombat = opts?.hasCombat ?? true;
  const walkSpeed = opts?.walkSpeed ?? 30;

  const actor = {
    id: actorId,
    name: 'Aragorn',
    type: 'character',
    system: {
      attributes: {
        movement: {
          walk: walkSpeed,
        },
      },
    },
  };

  return {
    user: {
      id: 'user-player-1',
      character: hasCharacter ? actor : null,
    },
    actors: {
      get: vi.fn((_id: string) => actor),
    },
    combat: hasCombat
      ? {
          active: true,
          current: { tokenId: 'token-1' },
        }
      : null,
    settings: { get: vi.fn(), set: vi.fn(), register: vi.fn(), registerMenu: vi.fn() },
    i18n: { lang: 'it', localize: vi.fn() },
  };
}

/** Build a minimal TokenDocument stub for updateToken hook tests. */
function makeTokenDoc(opts?: {
  actorId?: string;
  x?: number;
  y?: number;
}) {
  return {
    id: 'token-1',
    actorId: opts?.actorId ?? 'actor-player-1',
    x: opts?.x ?? 0,
    y: opts?.y ?? 0,
    actor: {
      id: opts?.actorId ?? 'actor-player-1',
      system: {
        attributes: {
          movement: { walk: 30 },
        },
      },
    },
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Fire the captured updateToken handler with a stub tokenDoc + change object. */
function fireUpdateToken(
  tokenDoc: ReturnType<typeof makeTokenDoc>,
  change: Record<string, unknown>,
): void {
  if (capturedUpdateTokenHandler === null) {
    throw new Error('updateToken handler not registered');
  }
  capturedUpdateTokenHandler(tokenDoc, change, {}, 'user-player-1');
}

/** Fire the captured updateCombat handler with a change object. */
function fireUpdateCombat(change: Record<string, unknown>): void {
  if (capturedUpdateCombatHandler === null) {
    throw new Error('updateCombat handler not registered');
  }
  capturedUpdateCombatHandler({}, change, {}, 'user-player-1');
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('registerMovementTracker', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  // CMT-01: registerMovementTracker registers both hooks and returns unsubscribe
  it('CMT-01: registers updateToken + updateCombat hooks and returns unsubscribe closure', async () => {
    const gameMock = makeGameMock();
    const hooksMock = makeHooksMock();
    vi.stubGlobal('game', gameMock);
    vi.stubGlobal('Hooks', hooksMock);

    const { registerMovementTracker } = await import('./combat-movement-tracker.js');
    const emit = vi.fn();

    const unsubscribe = registerMovementTracker(emit);

    expect(hooksMock.on).toHaveBeenCalledWith('updateToken', expect.any(Function));
    expect(hooksMock.on).toHaveBeenCalledWith('updateCombat', expect.any(Function));
    expect(typeof unsubscribe).toBe('function');
  });

  // CMT-01b: unsubscribe calls Hooks.off for both hook IDs
  it('CMT-01b: unsubscribe() calls Hooks.off for updateToken and updateCombat hookIds', async () => {
    const gameMock = makeGameMock();
    const hooksMock = makeHooksMock();
    vi.stubGlobal('game', gameMock);
    vi.stubGlobal('Hooks', hooksMock);

    const { registerMovementTracker } = await import('./combat-movement-tracker.js');
    const emit = vi.fn();

    const unsubscribe = registerMovementTracker(emit);
    unsubscribe();

    expect(hooksMock.off).toHaveBeenCalledWith(MOCK_UPDATE_TOKEN_HOOK_ID);
    expect(hooksMock.off).toHaveBeenCalledWith(MOCK_UPDATE_COMBAT_HOOK_ID);
  });

  // CMT-02: updateToken handler — no change.x or change.y → silent return, no emit
  it('CMT-02: updateToken with no x/y change → silent return, emit NOT called', async () => {
    const gameMock = makeGameMock();
    const hooksMock = makeHooksMock();
    vi.stubGlobal('game', gameMock);
    vi.stubGlobal('Hooks', hooksMock);

    const { registerMovementTracker } = await import('./combat-movement-tracker.js');
    const emit = vi.fn();
    registerMovementTracker(emit);

    // Change with no x/y (e.g., visibility update)
    fireUpdateToken(makeTokenDoc(), { hidden: true });

    expect(emit).not.toHaveBeenCalled();
  });

  // CMT-03: updateToken with x change AND player actor AND combat active → accumulate + emit
  it('CMT-03: updateToken with x/y change + player actor + active combat → emit payload', async () => {
    const gameMock = makeGameMock({ hasCombat: true });
    const hooksMock = makeHooksMock();
    vi.stubGlobal('game', gameMock);
    vi.stubGlobal('Hooks', hooksMock);

    // Provide scene mock for distance calculation
    vi.stubGlobal('canvas', {
      scene: { grid: { size: 100, distance: 5 } },
    });

    const { registerMovementTracker } = await import('./combat-movement-tracker.js');
    const emit = vi.fn<(payload: MovementBudgetPayload) => void>();
    registerMovementTracker(emit);

    const tokenDoc = makeTokenDoc({ x: 0, y: 0 });

    // First move — no prior lastPosition, so delta is 0 (Phase 8 broad heuristic).
    // This establishes lastPosition at (100, 0).
    fireUpdateToken(tokenDoc, { x: 100 });

    expect(emit).toHaveBeenCalledTimes(1);
    const firstPayload = emit.mock.calls[0]?.[0] as MovementBudgetPayload | undefined;
    expect(firstPayload?.actorId).toBe('actor-player-1');
    expect(firstPayload?.walkSpeed).toBe(30);

    // Second move — lastPosition is now (100, 0), moving to (200, 0) = 100px = 5ft
    emit.mockClear();
    const tokenDoc2 = makeTokenDoc({ x: 100, y: 0 });
    fireUpdateToken(tokenDoc2, { x: 200 });

    expect(emit).toHaveBeenCalledTimes(1);
    const payload = emit.mock.calls[0]?.[0] as MovementBudgetPayload | undefined;
    expect(payload?.actorId).toBe('actor-player-1');
    expect(payload?.walkSpeed).toBe(30);
    expect(payload?.usedThisTurn).toBeGreaterThan(0);
    expect(payload?.remainingFeet).toBeLessThan(30);
  });

  // CMT-04: No combat (game.combat === null) → no emit
  it('CMT-04: updateToken outside combat (game.combat null) → emit NOT called', async () => {
    const gameMock = makeGameMock({ hasCombat: false });
    const hooksMock = makeHooksMock();
    vi.stubGlobal('game', gameMock);
    vi.stubGlobal('Hooks', hooksMock);
    vi.stubGlobal('canvas', {
      scene: { grid: { size: 100, distance: 5 } },
    });

    const { registerMovementTracker } = await import('./combat-movement-tracker.js');
    const emit = vi.fn();
    registerMovementTracker(emit);

    fireUpdateToken(makeTokenDoc(), { x: 100 });

    expect(emit).not.toHaveBeenCalled();
  });

  // CMT-05: updateCombat with change.turn → reset usedThisTurn to 0 + emit fresh payload
  it('CMT-05: updateCombat with turn change → reset accumulator and emit usedThisTurn=0', async () => {
    const gameMock = makeGameMock({ hasCombat: true });
    const hooksMock = makeHooksMock();
    vi.stubGlobal('game', gameMock);
    vi.stubGlobal('Hooks', hooksMock);
    vi.stubGlobal('canvas', {
      scene: { grid: { size: 100, distance: 5 } },
    });

    const { registerMovementTracker } = await import('./combat-movement-tracker.js');
    const emit = vi.fn<(payload: MovementBudgetPayload) => void>();
    registerMovementTracker(emit);

    // First move: establishes lastPosition (delta=0 broad heuristic)
    const tokenDoc = makeTokenDoc({ x: 0, y: 0 });
    fireUpdateToken(tokenDoc, { x: 100 });
    emit.mockClear();

    // Second move: from (100,0) to (200,0) = 100px = 5ft — actual accumulation
    const tokenDoc2 = makeTokenDoc({ x: 100, y: 0 });
    fireUpdateToken(tokenDoc2, { x: 200 });
    expect(emit).toHaveBeenCalledTimes(1);
    const firstPayload = emit.mock.calls[0]?.[0] as MovementBudgetPayload | undefined;
    expect(firstPayload?.usedThisTurn).toBeGreaterThan(0);

    // Then: advance combat turn
    emit.mockClear();
    fireUpdateCombat({ turn: 1 });

    // After turn reset, emit should be called with usedThisTurn=0
    expect(emit).toHaveBeenCalledTimes(1);
    const resetPayload = emit.mock.calls[0]?.[0] as MovementBudgetPayload | undefined;
    expect(resetPayload?.usedThisTurn).toBe(0);
    expect(resetPayload?.remainingFeet).toBe(30); // walkSpeed restored
  });

  // CMT-05b: updateCombat without turn change → no reset, no emit
  it('CMT-05b: updateCombat WITHOUT turn change (e.g., initiative update) → emit NOT called', async () => {
    const gameMock = makeGameMock({ hasCombat: true });
    const hooksMock = makeHooksMock();
    vi.stubGlobal('game', gameMock);
    vi.stubGlobal('Hooks', hooksMock);
    vi.stubGlobal('canvas', {
      scene: { grid: { size: 100, distance: 5 } },
    });

    const { registerMovementTracker } = await import('./combat-movement-tracker.js');
    const emit = vi.fn();
    registerMovementTracker(emit);

    // updateCombat with no turn change (e.g., initiative sort)
    fireUpdateCombat({ initiative: 15 });

    expect(emit).not.toHaveBeenCalled();
  });

  // CMT-06: Defensive — throws in emit are swallowed + console.warn; never returns false
  it('CMT-06: emit throws → console.warn logged; hook handler does NOT throw', async () => {
    const gameMock = makeGameMock({ hasCombat: true });
    const hooksMock = makeHooksMock();
    vi.stubGlobal('game', gameMock);
    vi.stubGlobal('Hooks', hooksMock);
    vi.stubGlobal('canvas', {
      scene: { grid: { size: 100, distance: 5 } },
    });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { registerMovementTracker } = await import('./combat-movement-tracker.js');
    const emit = vi.fn(() => {
      throw new Error('emit failure');
    });
    registerMovementTracker(emit);

    // Should not throw even though emit throws
    expect(() => {
      fireUpdateToken(makeTokenDoc(), { x: 100 });
    }).not.toThrow();

    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  // CMT-07: Player has no actor → silent return, no emit
  it('CMT-07: game.user.character is null → emit NOT called (no actor)', async () => {
    const gameMock = makeGameMock({ hasCharacter: false, hasCombat: true });
    const hooksMock = makeHooksMock();
    vi.stubGlobal('game', gameMock);
    vi.stubGlobal('Hooks', hooksMock);
    vi.stubGlobal('canvas', {
      scene: { grid: { size: 100, distance: 5 } },
    });

    const { registerMovementTracker } = await import('./combat-movement-tracker.js');
    const emit = vi.fn();
    registerMovementTracker(emit);

    fireUpdateToken(makeTokenDoc(), { x: 100 });

    expect(emit).not.toHaveBeenCalled();
  });

  // CMT-08: Signature check — registerMovementTracker returns () => void
  it('CMT-08: registerMovementTracker returns an idempotent unsubscribe function', async () => {
    const gameMock = makeGameMock();
    const hooksMock = makeHooksMock();
    vi.stubGlobal('game', gameMock);
    vi.stubGlobal('Hooks', hooksMock);

    const { registerMovementTracker } = await import('./combat-movement-tracker.js');
    const emit = vi.fn();
    const unsubscribe = registerMovementTracker(emit);

    // Call twice — idempotent (no throw)
    expect(() => {
      unsubscribe();
      unsubscribe();
    }).not.toThrow();
  });
});
