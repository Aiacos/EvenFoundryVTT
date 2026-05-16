/**
 * Unit tests for ToolInvocationEnvelopeSchema and BearerRotatedPayloadSchema.
 *
 * RED phase (TDD): tests written before implementation per Plan 07-01 Task 1.
 *
 * @see packages/shared-protocol/src/payloads/tool.ts
 * @see .planning/phases/07-foundry-module-write-path/07-01-PLAN.md Task 1
 */
import { describe, expect, it } from 'vitest';
import {
  type BearerRotatedPayload,
  BearerRotatedPayloadSchema,
  type ToolInvocationEnvelopePayload,
  ToolInvocationEnvelopePayloadSchema,
} from './tool.js';

// ─── ToolInvocationEnvelopePayloadSchema ─────────────────────────────────────

describe('ToolInvocationEnvelopePayloadSchema', () => {
  // Use RFC 9562 example UUIDs (all-zeros / all-ones) to avoid gitleaks false positives.
  // These are clearly non-secret test fixtures.
  const TEST_UUID_1 = '00000000-0000-4000-8000-000000000001';
  const TEST_UUID_2 = '00000000-0000-4000-8000-000000000002';
  const TEST_UUID_3 = '00000000-0000-4000-8000-000000000003';
  const TEST_UUID_4 = '00000000-0000-4000-8000-000000000004';
  const TEST_UUID_5 = '00000000-0000-4000-8000-000000000005';
  const TEST_UUID_6 = '00000000-0000-4000-8000-000000000006';
  const TEST_UUID_7 = '00000000-0000-4000-8000-000000000007';

  const validCases: Array<{ name: string; input: ToolInvocationEnvelopePayload }> = [
    {
      name: 'cast-spell',
      input: {
        toolId: 'cast-spell',
        idempotencyKey: TEST_UUID_1,
        args: { actorId: 'abc123', spellId: 'fireball' },
      },
    },
    {
      name: 'weapon-attack',
      input: {
        toolId: 'weapon-attack',
        idempotencyKey: TEST_UUID_2,
        args: { actorId: 'actor1', weaponId: 'longsword' },
      },
    },
    {
      name: 'use-item',
      input: {
        toolId: 'use-item',
        idempotencyKey: TEST_UUID_3,
        args: {},
      },
    },
    {
      name: 'move-token',
      input: {
        toolId: 'move-token',
        idempotencyKey: TEST_UUID_4,
        args: { tokenId: 'tok1', x: 100, y: 200 },
      },
    },
    {
      name: 'drop-concentration',
      input: {
        toolId: 'drop-concentration',
        idempotencyKey: TEST_UUID_5,
        args: { actorId: 'actor1' },
      },
    },
    {
      name: 'place-template',
      input: {
        toolId: 'place-template',
        idempotencyKey: TEST_UUID_6,
        args: { actorId: 'actor1', spellId: 'fireball', x: 50, y: 50 },
      },
    },
    {
      // CR-05 regression: confirm-template-placement was missing from TOOL_ID_SCHEMA
      name: 'confirm-template-placement',
      input: {
        toolId: 'confirm-template-placement',
        idempotencyKey: TEST_UUID_7,
        args: { placementId: TEST_UUID_1, templateIndex: 0, x: 100, y: 200 },
      },
    },
  ];

  for (const { name, input } of validCases) {
    it(`parses valid ${name} payload`, () => {
      const result = ToolInvocationEnvelopePayloadSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.toolId).toBe(name);
        expect(result.data.idempotencyKey).toBe(input.idempotencyKey);
      }
    });
  }

  it('round-trips: parse → re-serialize → re-parse produces same data', () => {
    const original: ToolInvocationEnvelopePayload = {
      toolId: 'cast-spell',
      idempotencyKey: '00000000-0000-4000-8000-000000000099',
      args: { actorId: 'abc', spellId: 'xyz' },
    };
    const parsed = ToolInvocationEnvelopePayloadSchema.parse(original);
    const reparsed = ToolInvocationEnvelopePayloadSchema.parse(JSON.parse(JSON.stringify(parsed)));
    expect(reparsed).toEqual(parsed);
  });

  // Failure cases

  it('rejects unknown toolId', () => {
    const result = ToolInvocationEnvelopePayloadSchema.safeParse({
      toolId: 'invalid-tool',
      idempotencyKey: '00000000-0000-4000-8000-000000000001',
      args: {},
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-UUID idempotencyKey', () => {
    const result = ToolInvocationEnvelopePayloadSchema.safeParse({
      toolId: 'cast-spell' as const,
      idempotencyKey: 'not-a-uuid',
      args: {},
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing toolId field', () => {
    const result = ToolInvocationEnvelopePayloadSchema.safeParse({
      idempotencyKey: '00000000-0000-4000-8000-000000000001',
      args: {},
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing idempotencyKey field', () => {
    const result = ToolInvocationEnvelopePayloadSchema.safeParse({
      toolId: 'cast-spell',
      args: {},
    });
    expect(result.success).toBe(false);
  });

  it('rejects extra fields (strict object)', () => {
    const result = ToolInvocationEnvelopePayloadSchema.safeParse({
      toolId: 'cast-spell',
      idempotencyKey: '00000000-0000-4000-8000-000000000001',
      args: {},
      extraField: 'should-fail',
    });
    expect(result.success).toBe(false);
  });

  it('rejects wrong type for args (must allow unknown, but reject non-object primitive?)', () => {
    // args: z.unknown() accepts any value, including strings — this is intentional
    // because we validate args downstream in the handler's argsSchema
    const result = ToolInvocationEnvelopePayloadSchema.safeParse({
      toolId: 'cast-spell',
      idempotencyKey: '00000000-0000-4000-8000-000000000001',
      args: 42,
    });
    // args: z.unknown() — 42 is valid at schema level (handler validates further)
    expect(result.success).toBe(true);
  });
});

// ─── BearerRotatedPayloadSchema ───────────────────────────────────────────────

describe('BearerRotatedPayloadSchema', () => {
  const validPayload: BearerRotatedPayload = {
    rotatedAt: 1_700_000_000_000,
    graceUntil: 1_700_000_060_000,
  };

  it('parses valid BearerRotatedPayload', () => {
    const result = BearerRotatedPayloadSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.rotatedAt).toBe(1_700_000_000_000);
      expect(result.data.graceUntil).toBe(1_700_000_060_000);
    }
  });

  it('round-trips: parse → re-serialize → re-parse produces same data', () => {
    const parsed = BearerRotatedPayloadSchema.parse(validPayload);
    const reparsed = BearerRotatedPayloadSchema.parse(JSON.parse(JSON.stringify(parsed)));
    expect(reparsed).toEqual(parsed);
  });

  it('rejects missing rotatedAt', () => {
    const result = BearerRotatedPayloadSchema.safeParse({
      graceUntil: 1_700_000_060_000,
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing graceUntil', () => {
    const result = BearerRotatedPayloadSchema.safeParse({
      rotatedAt: 1_700_000_000_000,
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-integer rotatedAt', () => {
    const result = BearerRotatedPayloadSchema.safeParse({
      rotatedAt: 1_700_000_000_000.5,
      graceUntil: 1_700_000_060_000,
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-integer graceUntil', () => {
    const result = BearerRotatedPayloadSchema.safeParse({
      rotatedAt: 1_700_000_000_000,
      graceUntil: 1_700_000_060_000.5,
    });
    expect(result.success).toBe(false);
  });

  it('rejects extra fields (strict object)', () => {
    const result = BearerRotatedPayloadSchema.safeParse({
      rotatedAt: 1_700_000_000_000,
      graceUntil: 1_700_000_060_000,
      extra: 'field',
    });
    expect(result.success).toBe(false);
  });

  it('rejects wrong type for rotatedAt', () => {
    const result = BearerRotatedPayloadSchema.safeParse({
      rotatedAt: 'not-a-number',
      graceUntil: 1_700_000_060_000,
    });
    expect(result.success).toBe(false);
  });
});
