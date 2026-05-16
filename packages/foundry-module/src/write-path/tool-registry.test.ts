/**
 * Unit tests for tool-registry.ts — ToolId, ToolHandler, TOOL_REGISTRY,
 * registerToolHandler, TOOL_HANDLER_IDS.
 *
 * RED phase (TDD): tests written before dispatchTool implementation.
 * dispatchTool tests are added in Task 2 (GREEN phase for the wiring).
 *
 * @see packages/foundry-module/src/write-path/tool-registry.ts
 * @see .planning/phases/07-foundry-module-write-path/07-01-PLAN.md Task 1
 */
import { describe, expect, it, vi } from 'vitest';
import {
  type ArgsValidator,
  TOOL_HANDLER_IDS,
  TOOL_REGISTRY,
  type ToolHandler,
  type ToolId,
  type ToolResult,
  registerToolHandler,
} from './tool-registry.js';

// ─── Helper: create a no-op ArgsValidator ────────────────────────────────────

function makeValidator<T>(passthrough = true): ArgsValidator<T> {
  return {
    safeParse: (val: unknown) =>
      passthrough
        ? { success: true as const, data: val as T }
        : { success: false as const, error: { message: 'invalid' } },
    parse: (val: unknown) => val as T,
  };
}

// ─── ToolId type compile-time tests ──────────────────────────────────────────

describe('ToolId — static type surface', () => {
  it('TOOL_HANDLER_IDS maps all 6 ToolIds to evf.camelCase handler names', () => {
    const expected: Record<ToolId, string> = {
      'cast-spell': 'evf.castSpell',
      'weapon-attack': 'evf.weaponAttack',
      'use-item': 'evf.useItem',
      'move-token': 'evf.moveToken',
      'drop-concentration': 'evf.dropConcentration',
      'place-template': 'evf.placeTemplate',
    };
    for (const [toolId, handlerId] of Object.entries(expected)) {
      expect(TOOL_HANDLER_IDS[toolId as ToolId]).toBe(handlerId);
    }
  });

  it('TOOL_HANDLER_IDS has exactly 6 entries', () => {
    expect(Object.keys(TOOL_HANDLER_IDS)).toHaveLength(6);
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
    // Compile-time verification: if this compiles, argsSchema is typed correctly
    const handler: ToolHandler<{ x: number }> = {
      argsSchema: makeValidator<{ x: number }>(),
      handle: async (_args: { x: number }): Promise<ToolResult> => ({ success: true, data: _args }),
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
