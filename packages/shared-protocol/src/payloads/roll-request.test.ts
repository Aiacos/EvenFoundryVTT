import { describe, expect, it } from 'vitest';
import { R1_ROLL_REQUEST_TYPE, RollRequestPayloadSchema } from './roll-request.js';

describe('RollRequestPayloadSchema', () => {
  it('uses the r1.roll.request topic', () => {
    expect(R1_ROLL_REQUEST_TYPE).toBe('r1.roll.request');
  });

  it('accepts save, check and skill requests', () => {
    for (const p of [
      { messageId: 'm1', kind: 'save', ability: 'wis', dc: 15 },
      { messageId: 'm2', kind: 'check', ability: 'str' },
      { messageId: 'm3', kind: 'skill', skill: 'prc', ability: 'wis' },
    ]) {
      expect(RollRequestPayloadSchema.safeParse(p).success).toBe(true);
    }
  });

  it('rejects unknown kinds, skills and extra fields', () => {
    expect(RollRequestPayloadSchema.safeParse({ messageId: 'm', kind: 'attack' }).success).toBe(
      false,
    );
    expect(
      RollRequestPayloadSchema.safeParse({ messageId: 'm', kind: 'skill', skill: 'xyz' }).success,
    ).toBe(false);
    expect(
      RollRequestPayloadSchema.safeParse({ messageId: 'm', kind: 'save', extra: 1 }).success,
    ).toBe(false);
  });
});
