/**
 * Unit tests for combat-action-tracker (Plan 09-01 — COMB-02 Wave 0).
 *
 * RED phase (TDD): tests written before implementation.
 *
 * Key assertions:
 * - CAT-01: createChatMessage with toolId='cast-spell' increments actionsUsed from 0→1 and emits
 * - CAT-02: createChatMessage with toolId='use-item' increments bonusActionsUsed to 1; action stays 0
 * - CAT-03: Two chat-cards with same attackId (weapon-attack) count as ONE action (dedup)
 * - CAT-04: createChatMessage with NO flags.evf.audit → emit NOT called
 * - CAT-05: createChatMessage with non-economy toolId (drop-concentration, move-token, etc.) → emit NOT called
 * - CAT-06: updateCombat with change.turn triggers reset emit for all tracked actors
 * - CAT-07: updateCombat with change.round (no turn) also triggers reset
 * - CAT-08: updateCombat with neither turn nor round → emit NOT called
 * - CAT-09: Hook handlers never return false; defensive try/catch swallows throws with console.warn
 * - CAT-10: recipientUserId resolved from audit.recipientUserId → msg.user → '<unknown>'
 * - MOD-CAT-01: module.ts wires registerCombatActionTracker after registerMovementTracker;
 *               registerComplexHandler count stays 14
 *
 * @see packages/foundry-module/src/write-path/combat-action-tracker.ts
 * @see packages/foundry-module/src/write-path/combat-movement-tracker.ts (pattern reference)
 * @see .planning/phases/09-action-economy-edge-cases/09-01-PLAN.md Task 2
 */

import type { ActionEconomyPayload } from '@evf/shared-protocol';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Foundry global mocks ─────────────────────────────────────────────────────

const MOCK_CREATE_CHAT_HOOK_ID = 201;
const MOCK_UPDATE_COMBAT_HOOK_ID = 202;

/** Captured hook handlers for test invocation. */
let capturedCreateChatHandler: ((...args: unknown[]) => void) | null = null;
let capturedUpdateCombatHandler: ((...args: unknown[]) => void) | null = null;

function makeHooksMock() {
  capturedCreateChatHandler = null;
  capturedUpdateCombatHandler = null;
  return {
    on: vi.fn((event: string, fn: (...args: unknown[]) => void): number => {
      if (event === 'createChatMessage') {
        capturedCreateChatHandler = fn;
        return MOCK_CREATE_CHAT_HOOK_ID;
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

function makeGameMock() {
  return {
    user: { id: 'user-player-1', isGM: false },
    users: { contents: [] },
    settings: { get: vi.fn(), set: vi.fn(), register: vi.fn(), registerMenu: vi.fn() },
    i18n: { lang: 'it', localize: vi.fn() },
    combat: null,
    actors: { get: vi.fn() },
  };
}

// ─── ChatMessage stub builders ────────────────────────────────────────────────

interface MockAuditFlags {
  toolId: string;
  actorId?: string;
  attackId?: string;
  recipientUserId?: string;
}

function makeChatMsg(opts?: { audit?: MockAuditFlags; userId?: string }) {
  return {
    user: opts?.userId ?? 'user-player-1',
    flags:
      opts?.audit !== undefined
        ? {
            evf: {
              audit: {
                // Production-real flag property is `tool` (AuditEntry / writeAuditLog),
                // NOT `toolId`. The fixture input keeps `toolId` for ergonomics; only
                // the EMITTED flag-object property must match production wire shape.
                tool: opts.audit.toolId,
                actorId: opts.audit.actorId ?? 'actor-default',
                ...(opts.audit.attackId !== undefined ? { attackId: opts.audit.attackId } : {}),
                ...(opts.audit.recipientUserId !== undefined
                  ? { recipientUserId: opts.audit.recipientUserId }
                  : {}),
              },
            },
          }
        : {},
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fireCreateChatMessage(msg: ReturnType<typeof makeChatMsg>): void {
  if (capturedCreateChatHandler === null) {
    throw new Error('createChatMessage handler not registered');
  }
  capturedCreateChatHandler(msg, {}, 'user-player-1');
}

function fireUpdateCombat(change: Record<string, unknown>): void {
  if (capturedUpdateCombatHandler === null) {
    throw new Error('updateCombat handler not registered');
  }
  capturedUpdateCombatHandler({}, change, {}, 'user-player-1');
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('registerCombatActionTracker', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  // ── Registration ────────────────────────────────────────────────────────────

  it('registers createChatMessage + updateCombat hooks and returns unsubscribe closure', async () => {
    const hooksMock = makeHooksMock();
    vi.stubGlobal('game', makeGameMock());
    vi.stubGlobal('Hooks', hooksMock);

    const { registerCombatActionTracker } = await import('./combat-action-tracker.js');
    const emit = vi.fn();
    const unsubscribe = registerCombatActionTracker(emit);

    expect(hooksMock.on).toHaveBeenCalledWith('createChatMessage', expect.any(Function));
    expect(hooksMock.on).toHaveBeenCalledWith('updateCombat', expect.any(Function));
    expect(typeof unsubscribe).toBe('function');
  });

  it('unsubscribe() calls Hooks.off for both hook IDs', async () => {
    const hooksMock = makeHooksMock();
    vi.stubGlobal('game', makeGameMock());
    vi.stubGlobal('Hooks', hooksMock);

    const { registerCombatActionTracker } = await import('./combat-action-tracker.js');
    const emit = vi.fn();
    const unsubscribe = registerCombatActionTracker(emit);
    unsubscribe();

    expect(hooksMock.off).toHaveBeenCalledWith(MOCK_CREATE_CHAT_HOOK_ID);
    expect(hooksMock.off).toHaveBeenCalledWith(MOCK_UPDATE_COMBAT_HOOK_ID);
  });

  // ── CAT-REGRESSION: real wire shape (flags.evf.audit.tool) drives the emit ──
  // Guards the field-name contract between writeAuditLog (writes `tool`) and this
  // tracker (must read `tool`). The original bug read `audit.toolId` → always
  // undefined → emit never fired. This test builds a production-shaped message
  // INLINE (independent of makeChatMsg) so it documents the real flag property.

  it('CAT-REGRESSION: production-shaped audit flag (tool) fires the economy emit exactly once', async () => {
    const hooksMock = makeHooksMock();
    vi.stubGlobal('game', makeGameMock());
    vi.stubGlobal('Hooks', hooksMock);

    const { registerCombatActionTracker } = await import('./combat-action-tracker.js');
    const emit = vi.fn<(p: ActionEconomyPayload) => void>();
    registerCombatActionTracker(emit);

    if (capturedCreateChatHandler === null) throw new Error('handler not set');

    // Real wire shape produced by writeAuditLog / dispatchTool: `tool`, not `toolId`.
    capturedCreateChatHandler(
      {
        user: 'user-player-1',
        flags: {
          evf: {
            audit: {
              tool: 'cast-spell',
              actorId: 'actor-mage',
              recipientUserId: 'user-player-1',
            },
          },
        },
      },
      {},
      'user-player-1',
    );

    expect(emit).toHaveBeenCalledTimes(1);
    const payload = emit.mock.calls[0]?.[0];
    expect(payload?.actorId).toBe('actor-mage');
    expect(payload?.actionsUsed).toBe(1);
  });

  // ── CAT-01: cast-spell → actionsUsed 0→1 ───────────────────────────────────

  it('CAT-01: createChatMessage with toolId=cast-spell increments actionsUsed to 1 and emits', async () => {
    const hooksMock = makeHooksMock();
    vi.stubGlobal('game', makeGameMock());
    vi.stubGlobal('Hooks', hooksMock);

    const { registerCombatActionTracker } = await import('./combat-action-tracker.js');
    const emit = vi.fn<(p: ActionEconomyPayload) => void>();
    registerCombatActionTracker(emit);

    const msg = makeChatMsg({
      audit: { toolId: 'cast-spell', actorId: 'actor-mage', recipientUserId: 'user-player-1' },
    });
    fireCreateChatMessage(msg);

    expect(emit).toHaveBeenCalledTimes(1);
    const payload = emit.mock.calls[0]?.[0];
    expect(payload?.actorId).toBe('actor-mage');
    expect(payload?.actionsUsed).toBe(1);
    expect(payload?.bonusActionsUsed).toBe(0);
    expect(payload?.multiAttackInProgress).toBe(false);
  });

  // ── CAT-02: use-item → bonusActionsUsed 0→1, actionsUsed stays 0 ───────────

  it('CAT-02: createChatMessage with toolId=use-item increments bonusActionsUsed to 1; actionsUsed stays 0', async () => {
    const hooksMock = makeHooksMock();
    vi.stubGlobal('game', makeGameMock());
    vi.stubGlobal('Hooks', hooksMock);

    const { registerCombatActionTracker } = await import('./combat-action-tracker.js');
    const emit = vi.fn<(p: ActionEconomyPayload) => void>();
    registerCombatActionTracker(emit);

    const msg = makeChatMsg({
      audit: { toolId: 'use-item', actorId: 'actor-rogue', recipientUserId: 'user-player-2' },
    });
    fireCreateChatMessage(msg);

    expect(emit).toHaveBeenCalledTimes(1);
    const payload = emit.mock.calls[0]?.[0];
    expect(payload?.actionsUsed).toBe(0);
    expect(payload?.bonusActionsUsed).toBe(1);
  });

  // ── CAT-03: weapon-attack dedup by attackId ─────────────────────────────────

  it('CAT-03: two weapon-attack cards with same attackId count as ONE actionsUsed (dedup)', async () => {
    const hooksMock = makeHooksMock();
    vi.stubGlobal('game', makeGameMock());
    vi.stubGlobal('Hooks', hooksMock);

    const { registerCombatActionTracker } = await import('./combat-action-tracker.js');
    const emit = vi.fn<(p: ActionEconomyPayload) => void>();
    registerCombatActionTracker(emit);

    const ATTACK_ID = 'aaaaaaaa-0000-4000-8000-000000000001';

    // First card — should increment actionsUsed to 1 + set multiAttackInProgress=true
    const msg1 = makeChatMsg({
      audit: {
        toolId: 'weapon-attack',
        actorId: 'actor-fighter',
        attackId: ATTACK_ID,
        recipientUserId: 'user-player-1',
      },
    });
    fireCreateChatMessage(msg1);

    expect(emit).toHaveBeenCalledTimes(1);
    const payload1 = emit.mock.calls[0]?.[0];
    expect(payload1?.actionsUsed).toBe(1);
    expect(payload1?.multiAttackInProgress).toBe(true);

    // Second card with same attackId — actionsUsed stays 1 (deduped)
    const msg2 = makeChatMsg({
      audit: {
        toolId: 'weapon-attack',
        actorId: 'actor-fighter',
        attackId: ATTACK_ID,
        recipientUserId: 'user-player-1',
      },
    });
    fireCreateChatMessage(msg2);

    // emit may or may not be called on second card (implementation may suppress no-op)
    // but if called, actionsUsed must STILL be 1
    const allPayloads = emit.mock.calls.map((c) => c[0]);
    for (const p of allPayloads) {
      expect(p?.actionsUsed).toBe(1);
    }
  });

  // ── CAT-04: no flags.evf.audit → no emit ───────────────────────────────────

  it('CAT-04: createChatMessage with no flags.evf.audit → emit NOT called', async () => {
    const hooksMock = makeHooksMock();
    vi.stubGlobal('game', makeGameMock());
    vi.stubGlobal('Hooks', hooksMock);

    const { registerCombatActionTracker } = await import('./combat-action-tracker.js');
    const emit = vi.fn();
    registerCombatActionTracker(emit);

    fireCreateChatMessage(makeChatMsg());

    expect(emit).not.toHaveBeenCalled();
  });

  // ── CAT-05: non-economy toolIds → no emit ──────────────────────────────────

  it.each([
    'drop-concentration',
    'move-token',
    'place-template',
    'confirm-template-placement',
  ])('CAT-05: toolId=%s → emit NOT called (not an economy slot)', async (toolId) => {
    const hooksMock = makeHooksMock();
    vi.stubGlobal('game', makeGameMock());
    vi.stubGlobal('Hooks', hooksMock);

    const { registerCombatActionTracker } = await import('./combat-action-tracker.js');
    const emit = vi.fn();
    registerCombatActionTracker(emit);

    fireCreateChatMessage(
      makeChatMsg({ audit: { toolId, actorId: 'actor-1', recipientUserId: 'user-1' } }),
    );

    expect(emit).not.toHaveBeenCalled();
  });

  // ── CAT-06: updateCombat with turn → reset + emit fresh payloads ────────────

  it('CAT-06: updateCombat with change.turn triggers reset emit with actionsUsed=0 for tracked actors', async () => {
    const hooksMock = makeHooksMock();
    vi.stubGlobal('game', makeGameMock());
    vi.stubGlobal('Hooks', hooksMock);

    const { registerCombatActionTracker } = await import('./combat-action-tracker.js');
    const emit = vi.fn<(p: ActionEconomyPayload) => void>();
    registerCombatActionTracker(emit);

    // First, track an actor by firing a cast-spell
    fireCreateChatMessage(
      makeChatMsg({
        audit: { toolId: 'cast-spell', actorId: 'actor-mage', recipientUserId: 'user-player-1' },
      }),
    );
    expect(emit).toHaveBeenCalledTimes(1);
    emit.mockClear();

    // Now fire updateCombat with a turn change
    fireUpdateCombat({ turn: 2 });

    // Reset emit should have fired with actionsUsed=0
    expect(emit).toHaveBeenCalled();
    const resetPayload = emit.mock.calls[0]?.[0];
    expect(resetPayload?.actionsUsed).toBe(0);
    expect(resetPayload?.bonusActionsUsed).toBe(0);
    expect(resetPayload?.reactionsUsed).toBe(0);
    expect(resetPayload?.multiAttackInProgress).toBe(false);
  });

  // ── CAT-07: updateCombat with round only → also triggers reset ─────────────

  it('CAT-07: updateCombat with change.round (no turn) also triggers reset', async () => {
    const hooksMock = makeHooksMock();
    vi.stubGlobal('game', makeGameMock());
    vi.stubGlobal('Hooks', hooksMock);

    const { registerCombatActionTracker } = await import('./combat-action-tracker.js');
    const emit = vi.fn<(p: ActionEconomyPayload) => void>();
    registerCombatActionTracker(emit);

    // Track an actor
    fireCreateChatMessage(
      makeChatMsg({
        audit: { toolId: 'cast-spell', actorId: 'actor-a', recipientUserId: 'user-1' },
      }),
    );
    emit.mockClear();

    // Round advance without explicit turn change
    fireUpdateCombat({ round: 2 });

    expect(emit).toHaveBeenCalled();
    const resetPayload = emit.mock.calls[0]?.[0];
    expect(resetPayload?.actionsUsed).toBe(0);
  });

  // ── CAT-08: updateCombat with neither turn nor round → no emit ─────────────

  it('CAT-08: updateCombat with neither turn nor round → emit NOT called', async () => {
    const hooksMock = makeHooksMock();
    vi.stubGlobal('game', makeGameMock());
    vi.stubGlobal('Hooks', hooksMock);

    const { registerCombatActionTracker } = await import('./combat-action-tracker.js');
    const emit = vi.fn();
    registerCombatActionTracker(emit);

    fireUpdateCombat({ initiative: 15 });

    expect(emit).not.toHaveBeenCalled();
  });

  // ── CAT-09: defensive try/catch ────────────────────────────────────────────

  it('CAT-09: emit throws → console.warn + handler does NOT throw (defensive)', async () => {
    const hooksMock = makeHooksMock();
    vi.stubGlobal('game', makeGameMock());
    vi.stubGlobal('Hooks', hooksMock);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { registerCombatActionTracker } = await import('./combat-action-tracker.js');
    const emit = vi.fn(() => {
      throw new Error('emit failure');
    });
    registerCombatActionTracker(emit);

    expect(() => {
      fireCreateChatMessage(
        makeChatMsg({
          audit: { toolId: 'cast-spell', actorId: 'actor-1', recipientUserId: 'user-1' },
        }),
      );
    }).not.toThrow();

    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  // ── CAT-10: recipientUserId resolution priority ─────────────────────────────

  it('CAT-10a: prefers audit.recipientUserId when present', async () => {
    const hooksMock = makeHooksMock();
    vi.stubGlobal('game', makeGameMock());
    vi.stubGlobal('Hooks', hooksMock);

    const { registerCombatActionTracker } = await import('./combat-action-tracker.js');
    const emit = vi.fn<(p: ActionEconomyPayload) => void>();
    registerCombatActionTracker(emit);

    fireCreateChatMessage(
      makeChatMsg({
        audit: { toolId: 'cast-spell', actorId: 'actor-1', recipientUserId: 'explicit-user-id' },
        userId: 'msg-user-id',
      }),
    );

    const payload = emit.mock.calls[0]?.[0];
    expect(payload?.recipientUserId).toBe('explicit-user-id');
  });

  it('CAT-10b: falls back to msg.user when audit.recipientUserId absent', async () => {
    const hooksMock = makeHooksMock();
    vi.stubGlobal('game', makeGameMock());
    vi.stubGlobal('Hooks', hooksMock);

    const { registerCombatActionTracker } = await import('./combat-action-tracker.js');
    const emit = vi.fn<(p: ActionEconomyPayload) => void>();
    registerCombatActionTracker(emit);

    fireCreateChatMessage(
      makeChatMsg({
        audit: { toolId: 'cast-spell', actorId: 'actor-1' },
        userId: 'fallback-user-id',
      }),
    );

    const payload = emit.mock.calls[0]?.[0];
    expect(payload?.recipientUserId).toBe('fallback-user-id');
  });

  it('CAT-10c: falls back to <unknown> when neither audit.recipientUserId nor msg.user present', async () => {
    const hooksMock = makeHooksMock();
    vi.stubGlobal('game', makeGameMock());
    vi.stubGlobal('Hooks', hooksMock);

    const { registerCombatActionTracker } = await import('./combat-action-tracker.js');
    const emit = vi.fn<(p: ActionEconomyPayload) => void>();
    registerCombatActionTracker(emit);

    // Create a message with no user and no recipientUserId in audit
    const msgNoUser = {
      flags: {
        evf: {
          audit: {
            tool: 'cast-spell',
            actorId: 'actor-1',
          },
        },
      },
    };

    if (capturedCreateChatHandler === null) throw new Error('handler not set');
    capturedCreateChatHandler(msgNoUser, {}, 'caller-user');

    const payload = emit.mock.calls[0]?.[0];
    expect(payload?.recipientUserId).toBe('<unknown>');
  });

  // ── attackId dedup scoped by actorId (T-09-02) ─────────────────────────────

  it('T-09-02: same attackId on different actors are independent (actor-scoped dedup)', async () => {
    const hooksMock = makeHooksMock();
    vi.stubGlobal('game', makeGameMock());
    vi.stubGlobal('Hooks', hooksMock);

    const { registerCombatActionTracker } = await import('./combat-action-tracker.js');
    const emit = vi.fn<(p: ActionEconomyPayload) => void>();
    registerCombatActionTracker(emit);

    const SHARED_ATTACK_ID = 'shared-uuid-that-appears-twice';

    // Actor A uses this attackId
    fireCreateChatMessage(
      makeChatMsg({
        audit: {
          toolId: 'weapon-attack',
          actorId: 'actor-A',
          attackId: SHARED_ATTACK_ID,
          recipientUserId: 'user-1',
        },
      }),
    );

    // Actor B also uses this attackId (should count as THEIR separate action)
    fireCreateChatMessage(
      makeChatMsg({
        audit: {
          toolId: 'weapon-attack',
          actorId: 'actor-B',
          attackId: SHARED_ATTACK_ID,
          recipientUserId: 'user-2',
        },
      }),
    );

    // Both should have emitted with actionsUsed=1 (independent per actor)
    const payloadA = emit.mock.calls[0]?.[0];
    const payloadB = emit.mock.calls[1]?.[0];
    expect(payloadA?.actorId).toBe('actor-A');
    expect(payloadA?.actionsUsed).toBe(1);
    expect(payloadB?.actorId).toBe('actor-B');
    expect(payloadB?.actionsUsed).toBe(1);
  });

  // ── CAT-REACT-01..04: Plan 13-02 reaction slot accounting ──────────────────
  // Tests written in RED phase before widening EconomySlot + TOOL_SLOT_MAP.
  // cast-shield / cast-counterspell / opportunity-attack must all consume
  // the 'reaction' slot (reactionsUsed 0→1) and leave action/bonus untouched.

  it('CAT-REACT-01: cast-shield sets reactionsUsed=1, actionsUsed stays 0', async () => {
    const hooksMock = makeHooksMock();
    vi.stubGlobal('game', makeGameMock());
    vi.stubGlobal('Hooks', hooksMock);

    const { registerCombatActionTracker } = await import('./combat-action-tracker.js');
    const emit = vi.fn<(p: ActionEconomyPayload) => void>();
    registerCombatActionTracker(emit);

    fireCreateChatMessage(
      makeChatMsg({
        audit: { toolId: 'cast-shield', actorId: 'actor-mage', recipientUserId: 'user-mage' },
      }),
    );

    expect(emit).toHaveBeenCalledOnce();
    const payload = emit.mock.calls[0]?.[0];
    expect(payload?.actorId).toBe('actor-mage');
    expect(payload?.reactionsUsed).toBe(1);
    expect(payload?.actionsUsed).toBe(0);
    expect(payload?.bonusActionsUsed).toBe(0);
  });

  it('CAT-REACT-02: cast-counterspell sets reactionsUsed=1, actionsUsed stays 0', async () => {
    const hooksMock = makeHooksMock();
    vi.stubGlobal('game', makeGameMock());
    vi.stubGlobal('Hooks', hooksMock);

    const { registerCombatActionTracker } = await import('./combat-action-tracker.js');
    const emit = vi.fn<(p: ActionEconomyPayload) => void>();
    registerCombatActionTracker(emit);

    fireCreateChatMessage(
      makeChatMsg({
        audit: { toolId: 'cast-counterspell', actorId: 'actor-wiz', recipientUserId: 'user-wiz' },
      }),
    );

    expect(emit).toHaveBeenCalledOnce();
    const payload = emit.mock.calls[0]?.[0];
    expect(payload?.actorId).toBe('actor-wiz');
    expect(payload?.reactionsUsed).toBe(1);
    expect(payload?.actionsUsed).toBe(0);
    expect(payload?.bonusActionsUsed).toBe(0);
  });

  it('CAT-REACT-03: opportunity-attack sets reactionsUsed=1, actionsUsed stays 0', async () => {
    const hooksMock = makeHooksMock();
    vi.stubGlobal('game', makeGameMock());
    vi.stubGlobal('Hooks', hooksMock);

    const { registerCombatActionTracker } = await import('./combat-action-tracker.js');
    const emit = vi.fn<(p: ActionEconomyPayload) => void>();
    registerCombatActionTracker(emit);

    fireCreateChatMessage(
      makeChatMsg({
        audit: {
          toolId: 'opportunity-attack',
          actorId: 'actor-fighter',
          recipientUserId: 'user-fighter',
        },
      }),
    );

    expect(emit).toHaveBeenCalledOnce();
    const payload = emit.mock.calls[0]?.[0];
    expect(payload?.actorId).toBe('actor-fighter');
    expect(payload?.reactionsUsed).toBe(1);
    expect(payload?.actionsUsed).toBe(0);
    expect(payload?.bonusActionsUsed).toBe(0);
  });

  it('CAT-REACT-04: reaction slot resets to 0 on turn advance (updateCombat)', async () => {
    const hooksMock = makeHooksMock();
    vi.stubGlobal('game', makeGameMock());
    vi.stubGlobal('Hooks', hooksMock);

    const { registerCombatActionTracker } = await import('./combat-action-tracker.js');
    const emit = vi.fn<(p: ActionEconomyPayload) => void>();
    registerCombatActionTracker(emit);

    // Use a reaction
    fireCreateChatMessage(
      makeChatMsg({
        audit: { toolId: 'cast-shield', actorId: 'actor-pal', recipientUserId: 'user-pal' },
      }),
    );
    expect(emit.mock.calls[0]?.[0]?.reactionsUsed).toBe(1);

    // Advance the turn — reactionsUsed must reset to 0
    fireUpdateCombat({ turn: 2 });

    const resetPayload = emit.mock.calls[1]?.[0];
    expect(resetPayload?.actorId).toBe('actor-pal');
    expect(resetPayload?.reactionsUsed).toBe(0);
    expect(resetPayload?.actionsUsed).toBe(0);
  });
});
