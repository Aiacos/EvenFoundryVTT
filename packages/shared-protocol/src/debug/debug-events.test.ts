/**
 * Unit tests for debug-console event + command schemas (Quick Task 260529-h5e Wave 1).
 *
 * Covers the lean dev-tooling schema surface that the bridge debug backend
 * (Wave 2) and dashboard (Wave 3) + g2-app mirror (Wave 4) consume:
 *   - DebugEventSchema round-trips a valid event; rejects missing/invalid `direction`.
 *   - DisplayOpPayloadSchema accepts a rebuild op; rejects unknown `op`.
 *   - DebugInjectBodySchema requires non-empty `type`; allows arbitrary payload + optional target.
 *   - DebugDispatchBodySchema requires sessionId+toolId; optional idempotencyKey + arbitrary args.
 *   - DebugGestureBodySchema rejects a kind outside the 5 R1 kinds; accepts each valid kind.
 *   - R1_DEBUG_DISPLAYOP_TYPE === 'r1.debug.displayop'.
 *   - Re-export from the package barrel (@evf/shared-protocol).
 *
 * @see ./debug-events.ts (schema definitions)
 * @see ../payloads/r1.ts (R1GesturePayloadSchema — gesture kind enum source of truth)
 * @see .planning/quick/260529-h5e-debug-console-bridge-observability-comma/260529-h5e-PLAN.md Wave 1
 */
import { describe, expect, it } from 'vitest';
import * as barrel from '../index.js';
import {
  DebugDispatchBodySchema,
  DebugEventSchema,
  DebugGestureBodySchema,
  DebugInjectBodySchema,
  DisplayOpPayloadSchema,
  R1_DEBUG_DISPLAYOP_TYPE,
} from './debug-events.js';

describe('DebugEventSchema', () => {
  const valid = {
    id: 1,
    ts: 1_700_000_000_000,
    direction: 'outbound' as const,
    sessionId: 'sess-1',
    type: 'character.delta',
    seq: 42,
    summary: 'character.delta',
    payload: { hp: 7 },
  };

  it('round-trips a valid event', () => {
    const result = DebugEventSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('accepts null sessionId and null seq', () => {
    const result = DebugEventSchema.safeParse({ ...valid, sessionId: null, seq: null });
    expect(result.success).toBe(true);
  });

  it('rejects missing direction', () => {
    const { direction: _drop, ...rest } = valid;
    const result = DebugEventSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects a direction outside the enum', () => {
    const result = DebugEventSchema.safeParse({ ...valid, direction: 'sideways' });
    expect(result.success).toBe(false);
  });

  it('accepts each of the 5 directions', () => {
    for (const direction of ['inbound', 'outbound', 'tool', 'log', 'display'] as const) {
      const result = DebugEventSchema.safeParse({ ...valid, direction });
      expect(result.success, `direction '${direction}' should parse`).toBe(true);
    }
  });

  it('rejects id < 1 (buffer ids start at 1); accepts 1', () => {
    expect(DebugEventSchema.safeParse({ ...valid, id: 0 }).success).toBe(false);
    expect(DebugEventSchema.safeParse({ ...valid, id: 1 }).success).toBe(true);
  });

  it('rejects a non-integer ts', () => {
    expect(DebugEventSchema.safeParse({ ...valid, ts: 1.5 }).success).toBe(false);
  });
});

describe('DisplayOpPayloadSchema', () => {
  it('accepts a rebuild op with containerCount', () => {
    const result = DisplayOpPayloadSchema.safeParse({
      op: 'rebuild',
      containerCount: 3,
      ts: 1_700_000_000_000,
    });
    expect(result.success).toBe(true);
  });

  it('accepts each valid op', () => {
    for (const op of ['mount', 'destroy', 'rebuild', 'perf'] as const) {
      const result = DisplayOpPayloadSchema.safeParse({ op, ts: 1 });
      expect(result.success, `op '${op}' should parse`).toBe(true);
    }
  });

  it('rejects an unknown op', () => {
    const result = DisplayOpPayloadSchema.safeParse({ op: 'explode', ts: 1 });
    expect(result.success).toBe(false);
  });

  it('rejects a non-integer layer index z', () => {
    expect(DisplayOpPayloadSchema.safeParse({ op: 'mount', z: 1.5, ts: 1 }).success).toBe(false);
    expect(DisplayOpPayloadSchema.safeParse({ op: 'mount', z: 1, ts: 1 }).success).toBe(true);
  });

  it('rejects a non-integer ts (op-level and perf-sample)', () => {
    expect(DisplayOpPayloadSchema.safeParse({ op: 'mount', ts: 1.5 }).success).toBe(false);
    expect(
      DisplayOpPayloadSchema.safeParse({
        op: 'perf',
        ts: 1,
        perf: [{ station: 'flush', key: 'page', ts: 2.5 }],
      }).success,
    ).toBe(false);
  });

  it('accepts an optional perf array of station samples', () => {
    const result = DisplayOpPayloadSchema.safeParse({
      op: 'perf',
      ts: 1,
      perf: [{ station: 'flush', key: 'page', ts: 2 }],
    });
    expect(result.success).toBe(true);
  });
});

describe('R1_DEBUG_DISPLAYOP_TYPE', () => {
  it('is the exact wire literal', () => {
    expect(R1_DEBUG_DISPLAYOP_TYPE).toBe('r1.debug.displayop');
  });
});

describe('DebugInjectBodySchema', () => {
  it('requires a non-empty type', () => {
    expect(DebugInjectBodySchema.safeParse({ type: '', payload: {} }).success).toBe(false);
  });

  it('allows arbitrary payload + omitted target', () => {
    const result = DebugInjectBodySchema.safeParse({ type: 'combat.turn', payload: { a: 1 } });
    expect(result.success).toBe(true);
  });

  it('allows a string or null targetSessionId', () => {
    expect(
      DebugInjectBodySchema.safeParse({ type: 'x', payload: 1, targetSessionId: 's1' }).success,
    ).toBe(true);
    expect(
      DebugInjectBodySchema.safeParse({ type: 'x', payload: 1, targetSessionId: null }).success,
    ).toBe(true);
  });
});

describe('DebugDispatchBodySchema', () => {
  it('requires sessionId and toolId', () => {
    expect(
      DebugDispatchBodySchema.safeParse({ sessionId: '', toolId: 'x', args: {} }).success,
    ).toBe(false);
    expect(
      DebugDispatchBodySchema.safeParse({ sessionId: 's', toolId: '', args: {} }).success,
    ).toBe(false);
  });

  it('allows an omitted idempotencyKey and arbitrary args', () => {
    const result = DebugDispatchBodySchema.safeParse({
      sessionId: 's',
      toolId: 'cast-spell',
      args: { spellId: 'fireball' },
    });
    expect(result.success).toBe(true);
  });

  it('accepts a supplied idempotencyKey', () => {
    const result = DebugDispatchBodySchema.safeParse({
      sessionId: 's',
      toolId: 'cast-spell',
      idempotencyKey: '11111111-1111-4111-8111-111111111111',
      args: {},
    });
    expect(result.success).toBe(true);
  });
});

describe('DebugGestureBodySchema', () => {
  it('accepts each of the 5 R1 kinds', () => {
    for (const kind of ['tap', 'double-tap', 'scroll-up', 'scroll-down', 'long-press'] as const) {
      const result = DebugGestureBodySchema.safeParse({ sessionId: 's', kind });
      expect(result.success, `kind '${kind}' should parse`).toBe(true);
    }
  });

  it('rejects a kind outside the 5 R1 kinds', () => {
    expect(DebugGestureBodySchema.safeParse({ sessionId: 's', kind: 'swipe' }).success).toBe(false);
  });

  it('requires a non-empty sessionId', () => {
    expect(DebugGestureBodySchema.safeParse({ sessionId: '', kind: 'tap' }).success).toBe(false);
  });
});

describe('package barrel re-export (@evf/shared-protocol)', () => {
  it('re-exports every debug symbol from the index barrel', () => {
    expect(barrel.DebugEventSchema).toBe(DebugEventSchema);
    expect(barrel.DisplayOpPayloadSchema).toBe(DisplayOpPayloadSchema);
    expect(barrel.DebugInjectBodySchema).toBe(DebugInjectBodySchema);
    expect(barrel.DebugDispatchBodySchema).toBe(DebugDispatchBodySchema);
    expect(barrel.DebugGestureBodySchema).toBe(DebugGestureBodySchema);
    expect(barrel.R1_DEBUG_DISPLAYOP_TYPE).toBe(R1_DEBUG_DISPLAYOP_TYPE);
  });
});
