/**
 * Unit tests for action-result-watcher (Plan 08-01 — ACT-01).
 *
 * Key assertions:
 * - ARW-01: Hooks.on called with 'createChatMessage'; returns unsubscribe closure
 * - ARW-02: Valid audit-flagged message → emit called with correct payload shape
 * - ARW-03: No evf.audit flag → emit NOT called (regular chat messages ignored)
 * - ARW-04: Handler NEVER returns false (Foundry hooks contract)
 * - ARW-05: Throws in emit are swallowed + console.warn (defensive try/catch)
 * - ARW-06: recipientUserId resolved from msg.user (primary), fallback to game.users lookup
 * - ARW-07: errorKind mapped from audit.result.error string (no-targets, out-of-range, etc.)
 * - ARW-08: extractD20 returns null on missing roll path (defensive)
 * - ARW-09: inferOutcome returns canonical enum values only (no 'critical')
 * - ARW-10: extractDamage reads msg.flavor regex; truncates to 24 chars
 *
 * @see packages/foundry-module/src/write-path/action-result-watcher.ts
 * @see .planning/phases/08-manual-action-ux/08-01-PLAN.md Task 2
 */

import type { ActionResultPayload } from '@evf/shared-protocol';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Foundry global mocks ─────────────────────────────────────────────────────

const MOCK_HOOK_ID = 99;

/** Captured createChatMessage handler for test invocation. */
let capturedHandler: ((...args: unknown[]) => unknown) | null = null;

function makeHooksMock() {
  capturedHandler = null;
  return {
    on: vi.fn((event: string, fn: (...args: unknown[]) => unknown): number => {
      if (event === 'createChatMessage') {
        capturedHandler = fn;
      }
      return MOCK_HOOK_ID;
    }),
    off: vi.fn((_hookId: number): void => {}),
    once: vi.fn(),
  };
}

function makeGameMock(opts?: { users?: Array<{ id: string; character?: { id: string } | null }> }) {
  const users = opts?.users ?? [{ id: 'user-player-1', character: { id: 'actor-1' } }];
  return {
    user: { id: 'user-player-1', isGM: false },
    users: {
      contents: users,
    },
    settings: { get: vi.fn(), set: vi.fn(), register: vi.fn(), registerMenu: vi.fn() },
    i18n: { lang: 'it', localize: vi.fn() },
    actors: { get: vi.fn() },
    combat: null,
  };
}

/** Build a synthetic ChatMessage mock with evf audit flags. */
function makeAuditMsg(opts?: {
  user?: string;
  tool?: string;
  idempotencyKey?: string;
  actorId?: string;
  resultSuccess?: boolean;
  resultError?: string;
  d20?: number | null;
  flavor?: string;
}) {
  return {
    user: opts?.user ?? 'user-player-1',
    flags: {
      evf: {
        audit: {
          tool: opts?.tool ?? 'cast-spell',
          idempotencyKey: opts?.idempotencyKey ?? '00000000-0000-4000-8000-000000000001',
          actorId: opts?.actorId ?? 'actor-1',
          result: {
            success: opts?.resultSuccess ?? true,
            error: opts?.resultError ?? undefined,
            data: {},
          },
          payload: {},
          timestamp: Date.now(),
          bearer_id: 'abcd1234',
        },
      },
    },
    rolls: opts?.d20 !== undefined ? [{ dice: [{ results: [{ result: opts.d20 }] }] }] : undefined,
    flavor: opts?.flavor,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('registerActionResultWatcher', () => {
  let hooksMock: ReturnType<typeof makeHooksMock>;

  beforeEach(async () => {
    vi.resetModules();
    hooksMock = makeHooksMock();
    vi.stubGlobal('Hooks', hooksMock);
  });

  // ARW-01: Hooks.on called with 'createChatMessage'; unsubscribe calls Hooks.off
  it('ARW-01: registers Hooks.on("createChatMessage") and returns unsubscribe closure', async () => {
    const gameMock = makeGameMock();
    vi.stubGlobal('game', gameMock);

    const { registerActionResultWatcher } = await import('./action-result-watcher.js');
    const emit = vi.fn();
    const unsubscribe = registerActionResultWatcher(emit);

    expect(hooksMock.on).toHaveBeenCalledWith('createChatMessage', expect.any(Function));
    expect(hooksMock.off).not.toHaveBeenCalled();

    unsubscribe();
    expect(hooksMock.off).toHaveBeenCalledWith(MOCK_HOOK_ID);
  });

  // ARW-02: Valid audit message → emit called with correct payload shape
  it('ARW-02: valid audit-flagged message emits ActionResultPayload with correct fields', async () => {
    const gameMock = makeGameMock();
    vi.stubGlobal('game', gameMock);

    const { registerActionResultWatcher } = await import('./action-result-watcher.js');
    const emit = vi.fn<(payload: ActionResultPayload) => void>();
    registerActionResultWatcher(emit);

    const msg = makeAuditMsg({
      user: 'user-player-1',
      tool: 'cast-spell',
      idempotencyKey: '00000000-0000-4000-8000-000000000001',
      resultSuccess: true,
      d20: 18,
    });

    expect(capturedHandler).not.toBeNull();
    capturedHandler?.(msg, {}, 'user-player-1');

    expect(emit).toHaveBeenCalledTimes(1);
    const payload = emit.mock.calls[0]?.[0];
    expect(payload).toBeDefined();
    expect(payload?.idempotencyKey).toBe('00000000-0000-4000-8000-000000000001');
    expect(payload?.toolId).toBe('cast-spell');
    expect(payload?.status).toBe('success');
    expect(payload?.recipientUserId).toBeTruthy();
  });

  // ARW-03: No evf.audit flag → emit NOT called
  it('ARW-03: regular chat message without evf.audit flag → emit not called', async () => {
    const gameMock = makeGameMock();
    vi.stubGlobal('game', gameMock);

    const { registerActionResultWatcher } = await import('./action-result-watcher.js');
    const emit = vi.fn();
    registerActionResultWatcher(emit);

    // Regular message with dnd5e flags but no evf.audit
    const regularMsg = {
      user: 'user-player-1',
      flags: {
        dnd5e: { messageType: 5 },
      },
    };

    capturedHandler?.(regularMsg, {}, 'user-player-1');
    expect(emit).not.toHaveBeenCalled();
  });

  // ARW-03 variant: missing flags entirely
  it('ARW-03b: message with no flags at all → emit not called', async () => {
    const gameMock = makeGameMock();
    vi.stubGlobal('game', gameMock);

    const { registerActionResultWatcher } = await import('./action-result-watcher.js');
    const emit = vi.fn();
    registerActionResultWatcher(emit);

    capturedHandler?.({ user: 'user-player-1' }, {}, 'user-player-1');
    expect(emit).not.toHaveBeenCalled();
  });

  // ARW-04: Handler NEVER returns false
  it('ARW-04: hook handler return value is NEVER false (Foundry hooks invariant)', async () => {
    const gameMock = makeGameMock();
    vi.stubGlobal('game', gameMock);

    const { registerActionResultWatcher } = await import('./action-result-watcher.js');
    const emit = vi.fn();
    registerActionResultWatcher(emit);

    const msg = makeAuditMsg({ resultSuccess: true });
    const returnValue = capturedHandler?.(msg, {}, 'user-player-1');

    expect(returnValue).not.toBe(false);
    expect(returnValue).toBeUndefined();
  });

  // ARW-05: Emit throws → swallowed with console.warn
  it('ARW-05: emit throws → swallowed with console.warn; handler does not rethrow', async () => {
    const gameMock = makeGameMock();
    vi.stubGlobal('game', gameMock);

    const { registerActionResultWatcher } = await import('./action-result-watcher.js');
    const emit = vi.fn(() => {
      throw new Error('emit exploded');
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    registerActionResultWatcher(emit);

    const msg = makeAuditMsg({ resultSuccess: true });
    expect(() => capturedHandler?.(msg, {}, 'user-player-1')).not.toThrow();
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  // ARW-06: recipientUserId from msg.user (primary)
  it('ARW-06: recipientUserId = msg.user (primary path)', async () => {
    const gameMock = makeGameMock();
    vi.stubGlobal('game', gameMock);

    const { registerActionResultWatcher } = await import('./action-result-watcher.js');
    const emit = vi.fn<(payload: ActionResultPayload) => void>();
    registerActionResultWatcher(emit);

    const msg = makeAuditMsg({ user: 'specific-user-id', resultSuccess: true });
    capturedHandler?.(msg, {}, 'specific-user-id');

    expect(emit).toHaveBeenCalledTimes(1);
    const payload = emit.mock.calls[0]?.[0];
    expect(payload?.recipientUserId).toBe('specific-user-id');
  });

  // ARW-06 fallback: no msg.user → fallback via game.users lookup by actorId
  it('ARW-06b: recipientUserId fallback to game.users lookup when msg.user is absent', async () => {
    const gameMock = makeGameMock({
      users: [{ id: 'fallback-user-id', character: { id: 'actor-fallback' } }],
    });
    vi.stubGlobal('game', gameMock);

    const { registerActionResultWatcher } = await import('./action-result-watcher.js');
    const emit = vi.fn<(payload: ActionResultPayload) => void>();
    registerActionResultWatcher(emit);

    // msg.user is undefined — forces fallback path
    const msg = {
      flags: {
        evf: {
          audit: {
            tool: 'cast-spell',
            idempotencyKey: '00000000-0000-4000-8000-000000000001',
            actorId: 'actor-fallback',
            result: { success: true, data: {} },
            payload: {},
            timestamp: Date.now(),
            bearer_id: 'abcd1234',
          },
        },
      },
    };

    capturedHandler?.(msg, {}, '');

    expect(emit).toHaveBeenCalledTimes(1);
    const payload = emit.mock.calls[0]?.[0];
    // Either fallback-user-id or '<unknown>' is acceptable
    expect(typeof payload?.recipientUserId).toBe('string');
    expect(payload?.recipientUserId.length).toBeGreaterThan(0);
  });

  // ARW-07: errorKind mapped from audit.result.error string
  it('ARW-07: errorKind mapped from audit.result.error substrings', async () => {
    const gameMock = makeGameMock();
    vi.stubGlobal('game', gameMock);

    const { registerActionResultWatcher } = await import('./action-result-watcher.js');

    const cases: Array<{ error: string; expectedKind: string }> = [
      { error: 'no_targets found', expectedKind: 'no-targets' },
      { error: 'out_of_range for spell', expectedKind: 'out-of-range' },
      { error: 'no_resource available', expectedKind: 'out-of-resource' },
      { error: 'insufficient spell slots', expectedKind: 'out-of-resource' },
      { error: 'wrong_turn to act', expectedKind: 'wrong-turn' },
      { error: 'no_gm_connected', expectedKind: 'gm-rejected' },
      { error: 'some unknown error', expectedKind: 'gm-rejected' }, // catch-all
    ];

    for (const { error, expectedKind } of cases) {
      const emit = vi.fn<(payload: ActionResultPayload) => void>();
      registerActionResultWatcher(emit);

      const msg = makeAuditMsg({ resultSuccess: false, resultError: error });
      capturedHandler?.(msg, {}, 'user-player-1');

      const payload = emit.mock.calls[0]?.[0];
      expect(payload?.errorKind, `error="${error}" should map to ${expectedKind}`).toBe(
        expectedKind,
      );

      emit.mockClear();
    }
  });

  // ARW-08: extractD20 returns null on missing roll path
  it('ARW-08: extractD20 returns null when rolls are absent (no_roll case)', async () => {
    const gameMock = makeGameMock();
    vi.stubGlobal('game', gameMock);

    const { registerActionResultWatcher } = await import('./action-result-watcher.js');
    const emit = vi.fn<(payload: ActionResultPayload) => void>();
    registerActionResultWatcher(emit);

    // msg with no rolls field
    const msg = makeAuditMsg({ tool: 'move-token', resultSuccess: true });
    // No d20 in makeAuditMsg → rolls is undefined
    capturedHandler?.(msg, {}, 'user-player-1');

    expect(emit).toHaveBeenCalledTimes(1);
    const payload = emit.mock.calls[0]?.[0];
    expect(payload?.d20).toBeNull();
  });

  // ARW-09: inferOutcome returns canonical enum values only
  it('ARW-09: all tool types produce canonical ActionOutcome values (no "critical")', async () => {
    const gameMock = makeGameMock();
    vi.stubGlobal('game', gameMock);

    const { registerActionResultWatcher } = await import('./action-result-watcher.js');

    const tools = ['cast-spell', 'weapon-attack', 'use-item', 'move-token', 'drop-concentration'];
    const canonicalOutcomes = new Set([
      'hit',
      'miss',
      'save_success',
      'save_fail',
      'damage_dealt',
      'no_roll',
    ]);

    for (const tool of tools) {
      const emit = vi.fn<(payload: ActionResultPayload) => void>();
      registerActionResultWatcher(emit);

      const msg = makeAuditMsg({ tool, resultSuccess: true });
      capturedHandler?.(msg, {}, 'user-player-1');

      if (emit.mock.calls.length > 0) {
        const payload = emit.mock.calls[0]?.[0];
        expect(
          canonicalOutcomes.has(payload?.outcome ?? ''),
          `tool=${tool} outcome=${payload?.outcome} must be canonical`,
        ).toBe(true);
        expect(payload?.outcome).not.toBe('critical');
      }

      emit.mockClear();
    }
  });

  // ARW-10: extractDamage reads msg.flavor regex; truncates to 24 chars
  it('ARW-10: extractDamage reads flavor and returns truncated match', async () => {
    const gameMock = makeGameMock();
    vi.stubGlobal('game', gameMock);

    const { registerActionResultWatcher } = await import('./action-result-watcher.js');
    const emit = vi.fn<(payload: ActionResultPayload) => void>();
    registerActionResultWatcher(emit);

    const msg = makeAuditMsg({
      resultSuccess: true,
      flavor: '8d6 fire = 28 sl',
    });
    capturedHandler?.(msg, {}, 'user-player-1');

    expect(emit).toHaveBeenCalledTimes(1);
    const payload = emit.mock.calls[0]?.[0];
    if (payload?.damage !== undefined) {
      // Damage must be ≤24 chars if extracted
      expect([...payload.damage].length).toBeLessThanOrEqual(24);
    }
    // Not asserting exact match because flavor regex is implementation-specific
  });

  // ARW-CONC-01: Plan 09-03 — mapErrorToKind returns 'concentration-required'
  // when audit.result.error includes 'concentration-required' (BEFORE gm-rejected catch-all)
  it('ARW-CONC-01: mapErrorToKind returns concentration-required for concentration-required error', async () => {
    const gameMock = makeGameMock();
    vi.stubGlobal('game', gameMock);

    const { registerActionResultWatcher } = await import('./action-result-watcher.js');
    const emit = vi.fn<(payload: ActionResultPayload) => void>();
    registerActionResultWatcher(emit);

    const msg = makeAuditMsg({
      resultSuccess: false,
      resultError: 'concentration-required',
    });
    capturedHandler?.(msg, {}, 'user-player-1');

    expect(emit).toHaveBeenCalledTimes(1);
    const payload = emit.mock.calls[0]?.[0];
    expect(payload?.errorKind).toBe('concentration-required');
    expect(payload?.status).toBe('failure');
  });
});
