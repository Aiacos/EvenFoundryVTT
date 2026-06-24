/**
 * Unit tests for tool-registry.ts — ToolId, ToolHandler, TOOL_REGISTRY,
 * registerToolHandler, TOOL_HANDLER_IDS, dispatchTool.
 *
 * TDD structure:
 * - Task 1 RED/GREEN: ToolId, ToolResult, ToolHandler, TOOL_REGISTRY, registerToolHandler, TOOL_HANDLER_IDS
 * - Task 2 GREEN: dispatchTool (cache hit, cache miss, unknown tool, validation failure, handler throw, audit isolation, cross-bearer)
 *
 * @see packages/foundry-module/src/write-path/tool-registry.ts
 * @see .planning/phases/07-foundry-module-write-path/07-01-PLAN.md Task 2
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type ArgsValidator,
  dispatchTool,
  moduleIdempotencyStore,
  registerToolHandler,
  TOOL_HANDLER_IDS,
  TOOL_REGISTRY,
  type ToolHandler,
  type ToolId,
  type ToolResult,
} from './tool-registry.js';

// ─── Helper: create a no-op ArgsValidator ────────────────────────────────────

function makeValidator<T>(passthrough = true): ArgsValidator<T> {
  return {
    safeParse: (val: unknown) =>
      passthrough
        ? { success: true as const, data: val as T }
        : { success: false as const, error: { message: 'invalid args' } },
    parse: (val: unknown) => val as T,
  };
}

// ─── ToolId type compile-time tests ──────────────────────────────────────────

describe('ToolId — static type surface', () => {
  it('TOOL_HANDLER_IDS maps all 11 ToolIds to evf.camelCase handler names', () => {
    const expected: Record<ToolId, string> = {
      'cast-spell': 'evf.castSpell',
      'weapon-attack': 'evf.weaponAttack',
      'use-item': 'evf.useItem',
      'move-token': 'evf.moveToken',
      'drop-concentration': 'evf.dropConcentration',
      'place-template': 'evf.placeTemplate',
      // Plan 07-03 (Wave 2): confirm-template-placement replaces evf.skillCheck stub in-place
      // (count stays 14; skill-check slot renamed to evf.confirmTemplatePlacement)
      'confirm-template-placement': 'evf.confirmTemplatePlacement',
      // Phase 13 ACT-04 reaction handlers (Plan 13-01 — socketlib count FLIPS 14 → 17)
      'cast-shield': 'evf.castShield',
      'cast-counterspell': 'evf.castCounterspell',
      'opportunity-attack': 'evf.opportunityAttack',
      // Phase 8 write channel: skill-check maps to evf.rollSkill for type-completeness
      // only — NO socketlib handler is registered for it (socket.register count stays
      // 17); the reverse-channel poller calls dispatchToolAuthorized directly.
      'skill-check': 'evf.rollSkill',
    };
    for (const [toolId, handlerId] of Object.entries(expected)) {
      expect(TOOL_HANDLER_IDS[toolId as ToolId]).toBe(handlerId);
    }
  });

  it('TOOL_HANDLER_IDS has exactly 11 entries (Phase 8 added skill-check, mapping-only)', () => {
    expect(Object.keys(TOOL_HANDLER_IDS)).toHaveLength(11);
  });
});

// ─── TOOL_REGISTRY ────────────────────────────────────────────────────────────

describe('TOOL_REGISTRY', () => {
  it('is a defined object (module loads without throwing)', () => {
    expect(TOOL_REGISTRY).toBeDefined();
    expect(typeof TOOL_REGISTRY).toBe('object');
  });
});

// ─── registerToolHandler ──────────────────────────────────────────────────────

describe('registerToolHandler', () => {
  it('registers a handler for a ToolId', () => {
    const handler: ToolHandler<{ actorId: string }> = {
      argsSchema: makeValidator<{ actorId: string }>(),
      handle: async (_args: { actorId: string }): Promise<ToolResult> => ({
        success: true,
        data: { fired: true },
      }),
    };

    registerToolHandler('cast-spell', handler);
    expect(TOOL_REGISTRY['cast-spell']).toBe(handler);
  });

  it('double-register replaces previous handler (idempotent)', () => {
    const handler1: ToolHandler = {
      argsSchema: makeValidator(),
      handle: async (): Promise<ToolResult> => ({ success: true, data: 'v1' }),
    };
    const handler2: ToolHandler = {
      argsSchema: makeValidator(),
      handle: async (): Promise<ToolResult> => ({ success: true, data: 'v2' }),
    };

    registerToolHandler('weapon-attack', handler1);
    registerToolHandler('weapon-attack', handler2);

    expect(TOOL_REGISTRY['weapon-attack']).toBe(handler2);
  });

  it('registers handler for each ToolId without conflict', () => {
    const makeHandler = (id: ToolId): ToolHandler => ({
      argsSchema: makeValidator(),
      handle: async (): Promise<ToolResult> => ({ success: true, data: id }),
    });

    const toolIds: ToolId[] = [
      'cast-spell',
      'weapon-attack',
      'use-item',
      'move-token',
      'drop-concentration',
      'place-template',
    ];

    for (const id of toolIds) {
      const h = makeHandler(id);
      registerToolHandler(id, h);
      expect(TOOL_REGISTRY[id]).toBe(h);
    }
  });
});

// ─── ToolResult type discrimination ──────────────────────────────────────────

describe('ToolResult type discrimination', () => {
  it('success result carries data', () => {
    const success: ToolResult = { success: true, data: { spell: 'fireball' } };
    expect(success.success).toBe(true);
    if (success.success) {
      expect(success.data).toEqual({ spell: 'fireball' });
    }
  });

  it('failure result carries error string', () => {
    const failure: ToolResult = { success: false, error: 'unknown_tool' };
    expect(failure.success).toBe(false);
    if (!failure.success) {
      expect(failure.error).toBe('unknown_tool');
    }
  });

  it('ToolHandler<TArgs> argsSchema lookup succeeds at compile time', () => {
    const handler: ToolHandler<{ x: number }> = {
      argsSchema: makeValidator<{ x: number }>(),
      handle: async (_args: { x: number }): Promise<ToolResult> => ({
        success: true,
        data: _args,
      }),
    };
    expect(handler).toBeDefined();
    expect(typeof handler.handle).toBe('function');
  });

  it('spyable handle call executes', async () => {
    const handleFn = vi.fn<() => Promise<ToolResult>>().mockResolvedValue({
      success: true,
      data: 'ok',
    });
    const handler: ToolHandler = {
      argsSchema: makeValidator(),
      handle: handleFn,
    };
    registerToolHandler('use-item', handler);
    const result = await TOOL_REGISTRY['use-item']?.handle({});
    expect(handleFn).toHaveBeenCalledOnce();
    expect(result).toEqual({ success: true, data: 'ok' });
  });
});

// ─── dispatchTool ─────────────────────────────────────────────────────────────

describe('dispatchTool', () => {
  // Stub writeAuditLog to prevent test pollution
  let auditLogMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Clear idempotency store between tests
    moduleIdempotencyStore.clear();

    // Stub globals needed by writeAuditLog and idempotency cache
    vi.stubGlobal('game', {
      users: {
        contents: [{ id: 'gm-001', isGM: true, active: true, targets: new Set() }],
        get: (_id: string) => undefined,
      },
      user: { id: 'gm-001', isGM: true, active: true, targets: new Set() },
    });

    auditLogMock = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('ChatMessage', { create: auditLogMock });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns unknown_tool error for unregistered tool', async () => {
    // Remove any registered handler for a tool we can test cleanly
    delete TOOL_REGISTRY['place-template'];
    const result = await dispatchTool('place-template', {
      args: {},
      idempotencyKey: '00000000-0000-4000-8000-000000000001',
      bearer: 'test-bearer-dispatch-unknown',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('unknown_tool');
    }
  });

  it('returns validation error when argsSchema.safeParse fails', async () => {
    const handler: ToolHandler = {
      argsSchema: makeValidator(false), // always fails
      handle: async (): Promise<ToolResult> => ({ success: true, data: 'should not reach' }),
    };
    registerToolHandler('move-token', handler);

    const result = await dispatchTool('move-token', {
      args: { wrong: 'data' },
      idempotencyKey: '00000000-0000-4000-8000-000000000002',
      bearer: 'test-bearer-dispatch-validation',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('invalid');
    }
  });

  it('calls handler.handle() and returns result on cache miss', async () => {
    const handleFn = vi.fn<() => Promise<ToolResult>>().mockResolvedValue({
      success: true,
      data: { spell: 'fireball' },
    });
    const handler: ToolHandler = {
      argsSchema: makeValidator(),
      handle: handleFn,
    };
    registerToolHandler('cast-spell', handler);

    const result = await dispatchTool('cast-spell', {
      args: { actorId: 'actor1' },
      idempotencyKey: '00000000-0000-4000-8000-000000000003',
      bearer: 'test-bearer-dispatch-hit',
    });

    expect(handleFn).toHaveBeenCalledOnce();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ spell: 'fireball' });
    }
  });

  it('returns cached result without calling handler on cache hit', async () => {
    const handleFn = vi.fn<() => Promise<ToolResult>>().mockResolvedValue({
      success: true,
      data: { spell: 'ice-storm' },
    });
    const handler: ToolHandler = {
      argsSchema: makeValidator(),
      handle: handleFn,
    };
    registerToolHandler('cast-spell', handler);

    const payload = {
      args: {},
      idempotencyKey: '00000000-0000-4000-8000-000000000004',
      bearer: 'test-bearer-dispatch-cache-hit',
    };

    // First call — handler runs
    const r1 = await dispatchTool('cast-spell', payload);
    expect(handleFn).toHaveBeenCalledOnce();

    // Second call with same bearer + same idempotencyKey — cache hit
    const r2 = await dispatchTool('cast-spell', payload);
    // Handler should NOT be called again
    expect(handleFn).toHaveBeenCalledOnce();
    expect(r2).toEqual(r1);
  });

  it('catches handler throw and returns failure ToolResult', async () => {
    const throwingHandler: ToolHandler = {
      argsSchema: makeValidator(),
      handle: async (): Promise<ToolResult> => {
        throw new Error('Foundry exploded');
      },
    };
    registerToolHandler('weapon-attack', throwingHandler);

    const result = await dispatchTool('weapon-attack', {
      args: {},
      idempotencyKey: '00000000-0000-4000-8000-000000000005',
      bearer: 'test-bearer-dispatch-throw',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Foundry exploded');
    }
  });

  it('calls writeAuditLog exactly once per dispatch', async () => {
    const handler: ToolHandler = {
      argsSchema: makeValidator(),
      handle: async (): Promise<ToolResult> => ({ success: true, data: null }),
    };
    registerToolHandler('drop-concentration', handler);

    await dispatchTool('drop-concentration', {
      args: {},
      idempotencyKey: '00000000-0000-4000-8000-000000000006',
      bearer: 'test-bearer-dispatch-audit',
    });

    // ChatMessage.create is called by writeAuditLog
    expect(auditLogMock).toHaveBeenCalledOnce();
  });

  it('audit failure does NOT propagate up (writeAuditLog is fault-tolerant)', async () => {
    auditLogMock.mockRejectedValue(new Error('audit socket broken'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const handler: ToolHandler = {
      argsSchema: makeValidator(),
      handle: async (): Promise<ToolResult> => ({ success: true, data: 'result' }),
    };
    registerToolHandler('use-item', handler);

    await expect(
      dispatchTool('use-item', {
        args: {},
        idempotencyKey: '00000000-0000-4000-8000-000000000007',
        bearer: 'test-bearer-dispatch-audit-fail',
      }),
    ).resolves.toEqual({ success: true, data: 'result' });

    warnSpy.mockRestore();
  });

  it('WR-01 regression: failure results are NOT cached — retry with same idempotencyKey re-executes', async () => {
    // WR-01: a transient failure (e.g., no_gm_connected) must NOT lock the idempotencyKey.
    // The handler returns failure on first call and success on second (simulates GM reconnect).
    const handleFn = vi
      .fn<() => Promise<ToolResult>>()
      .mockResolvedValueOnce({ success: false, error: 'no_gm_connected' })
      .mockResolvedValueOnce({ success: true, data: { droppedAt: 12345 } });

    const handler: ToolHandler = {
      argsSchema: makeValidator(),
      handle: handleFn,
    };
    registerToolHandler('drop-concentration', handler);

    const iKey = '00000000-0000-4000-8000-00000000000a';

    // First call — handler runs and returns failure
    const r1 = await dispatchTool('drop-concentration', {
      args: {},
      idempotencyKey: iKey,
      bearer: 'test-bearer-wr01',
    });
    expect(r1.success).toBe(false);
    expect(handleFn).toHaveBeenCalledTimes(1);

    // Second call — same idempotencyKey + same bearer — failure was NOT cached,
    // so handler runs again (retry succeeds after transient error)
    const r2 = await dispatchTool('drop-concentration', {
      args: {},
      idempotencyKey: iKey,
      bearer: 'test-bearer-wr01',
    });
    expect(r2.success).toBe(true);
    expect(handleFn).toHaveBeenCalledTimes(2);
  });

  it('FIX D: two CONCURRENT dispatches with same bearer+idempotencyKey collapse to ONE handler.handle, both get same result', async () => {
    // RED against current code: both concurrent callers pass the cache-miss check
    // and double-execute handler.handle. The in-flight dedup must collapse them.
    //
    // We gate the handler on a manually-resolved deferred so BOTH concurrent
    // dispatches are guaranteed to be parked inside handle() (or, for the fixed
    // code, the second caller is parked awaiting the shared in-flight promise)
    // before either resolves. This removes any reliance on microtask-timing luck.
    let callCount = 0;
    let releaseHandle: () => void = () => undefined;
    const handleGate = new Promise<void>((resolve) => {
      releaseHandle = resolve;
    });
    const handleFn = vi.fn<() => Promise<ToolResult>>().mockImplementation(async () => {
      callCount += 1;
      const ord = callCount;
      await handleGate; // park until the test releases
      return { success: true, data: { ord } };
    });
    const handler: ToolHandler = {
      argsSchema: makeValidator(),
      handle: handleFn,
    };
    registerToolHandler('cast-spell', handler);

    const payload = {
      args: {},
      idempotencyKey: '00000000-0000-4000-8000-00000000000b',
      bearer: 'test-bearer-concurrent-dedup',
    };

    // Fire both WITHOUT awaiting the first before starting the second.
    const p1 = dispatchTool('cast-spell', payload);
    const p2 = dispatchTool('cast-spell', payload);

    // Let all hashBearer/digest continuations + cache-miss checks settle so any
    // second concurrent handle() call would already have been issued.
    await new Promise((r) => setTimeout(r, 0));

    // Release the (single, for fixed code) parked handler.
    releaseHandle();
    const [r1, r2] = await Promise.all([p1, p2]);

    // EXACTLY ONE handler invocation for the overlapping pair.
    expect(handleFn).toHaveBeenCalledOnce();
    // Both callers receive the identical ToolResult.
    expect(r1).toEqual(r2);
    expect(r1.success).toBe(true);
    if (r1.success) {
      expect(r1.data).toEqual({ ord: 1 });
    }
    // And exactly one audit-log write for the collapsed dispatch.
    expect(auditLogMock).toHaveBeenCalledOnce();
  });

  it('FIX D: in-flight entry is cleared after settle — a LATER (non-overlapping) call re-runs the handler', async () => {
    // The finally{} delete must ensure the map only holds OVERLAPPING calls, so a
    // sequential retry after the first settles re-executes (and then caches success).
    const handleFn = vi.fn<() => Promise<ToolResult>>().mockImplementation(async () => {
      await Promise.resolve();
      return { success: false, error: 'transient' };
    });
    const handler: ToolHandler = {
      argsSchema: makeValidator(),
      handle: handleFn,
    };
    registerToolHandler('use-item', handler);

    const payload = {
      args: {},
      idempotencyKey: '00000000-0000-4000-8000-00000000000c',
      bearer: 'test-bearer-inflight-clear',
    };

    // First dispatch fully settles (failure → not cached).
    const r1 = await dispatchTool('use-item', payload);
    expect(r1.success).toBe(false);
    expect(handleFn).toHaveBeenCalledTimes(1);

    // Second, non-overlapping dispatch: in-flight was deleted, failure not cached → re-runs.
    const r2 = await dispatchTool('use-item', payload);
    expect(r2.success).toBe(false);
    expect(handleFn).toHaveBeenCalledTimes(2);
  });

  it('T-07-02 regression: same idempotencyKey + different bearer = NO cache hit', async () => {
    const handleFn = vi.fn<() => Promise<ToolResult>>().mockResolvedValue({
      success: true,
      data: 'executed',
    });
    const handler: ToolHandler = {
      argsSchema: makeValidator(),
      handle: handleFn,
    };
    registerToolHandler('cast-spell', handler);

    const iKey = '00000000-0000-4000-8000-000000000008';

    // First dispatch with bearer-one
    await dispatchTool('cast-spell', {
      args: {},
      idempotencyKey: iKey,
      bearer: 'bearer-one-unique-secret',
    });
    expect(handleFn).toHaveBeenCalledTimes(1);

    // Second dispatch with DIFFERENT bearer but SAME idempotencyKey
    await dispatchTool('cast-spell', {
      args: {},
      idempotencyKey: iKey,
      bearer: 'bearer-two-unique-secret',
    });
    // Handler MUST be called again (different bearer = different cache key)
    expect(handleFn).toHaveBeenCalledTimes(2);
  });
});
