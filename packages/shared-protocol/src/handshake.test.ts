/**
 * Tests for HandshakeClientSchema actorId field (Quick Task 260605-flv Task 1).
 *
 * Covers:
 *   - FLV-HS-01: payload WITHOUT actorId still parses (additive/optional — back-compat)
 *   - FLV-HS-02: payload WITH actorId:"6KWxQXAiJgz4zKlS" parses + actorId === that value
 *   - FLV-HS-03: actorId:"" (empty string) fails validation (min(1))
 *
 * @see packages/shared-protocol/src/handshake.ts
 */

import { describe, expect, it } from 'vitest';
import { HandshakeClientSchema } from './handshake.js';

const BASE_PAYLOAD = {
  proto: 'evf-v1' as const,
  token: 'valid-token-abc123',
  locale: 'it',
  capabilities: ['read_char', 'read_combat'],
};

describe('HandshakeClientSchema — actorId field (FLV-CHAR-SELECT)', () => {
  it('FLV-HS-01: parses payload WITHOUT actorId (back-compat — existing clients unaffected)', () => {
    const result = HandshakeClientSchema.safeParse(BASE_PAYLOAD);
    expect(result.success).toBe(true);
    if (result.success) {
      // actorId should be absent (exactOptionalPropertyTypes-clean)
      expect('actorId' in result.data).toBe(false);
    }
  });

  it('FLV-HS-02: parses payload WITH actorId and returns the exact value', () => {
    const result = HandshakeClientSchema.safeParse({
      ...BASE_PAYLOAD,
      actorId: '6KWxQXAiJgz4zKlS',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.actorId).toBe('6KWxQXAiJgz4zKlS');
    }
  });

  it('FLV-HS-03: actorId:"" (empty string) fails validation (min(1))', () => {
    const result = HandshakeClientSchema.safeParse({
      ...BASE_PAYLOAD,
      actorId: '',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const hasActorIdError = result.error.issues.some((issue) => issue.path.includes('actorId'));
      expect(hasActorIdError).toBe(true);
    }
  });
});
