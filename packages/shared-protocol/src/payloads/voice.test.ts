/**
 * Unit tests for VoiceTranscriptPayloadSchema + R1_VOICE_TRANSCRIPT_TYPE (Plan 12-02 Task 1).
 *
 * Covers the voice wire-schema behavior block:
 *   - V-01: valid Italian transcript payload parses successfully
 *   - V-02: empty transcript string rejected (min(1) constraint)
 *   - V-03: confidence 1.5 rejected (max(1) constraint)
 *   - V-04: confidence -0.1 rejected (min(0) constraint)
 *   - V-05: language 'de' rejected (enum constraint)
 *   - V-06: language 'multi' accepted (code-switching value valid)
 *   - V-07: extra fields rejected (strict-object — T-12-WIRE-01)
 *   - V-08: isFinal string 'true' rejected (must be boolean)
 *   - V-09: timestamp 1.5 rejected (integer constraint)
 *   - V-10: R1_VOICE_TRANSCRIPT_TYPE === 'r1.voice.transcript' exact literal
 *   - V-11: EnvelopeSchema round-trip (double trust boundary pattern)
 *   - V-12: barrel re-export from @evf/shared-protocol package entry
 *
 * @see ./voice.ts (schema definitions)
 * @see ../envelope.ts (EnvelopeSchema — canonical wire carrier)
 * @see .planning/phases/12-v2-voice-ux-tuning/12-02-PLAN.md Task 1
 */
import { describe, expect, it } from 'vitest';
import { EnvelopeSchema } from '../envelope.js';
import { R1_VOICE_TRANSCRIPT_TYPE, VoiceTranscriptPayloadSchema } from './voice.js';

/** A valid UUID v4 literal for envelope round-trip tests. */
const VALID_UUID_V4 = '11111111-1111-4111-8111-111111111111';

/** A canonical valid voice payload for reuse across tests. */
const VALID_PAYLOAD = {
  transcript: 'palla di fuoco',
  confidence: 0.94,
  language: 'it' as const,
  isFinal: true,
  timestamp: 1747500000000,
};

describe('VoiceTranscriptPayloadSchema (V-01..V-09)', () => {
  it('V-01: parses valid Italian transcript payload', () => {
    const result = VoiceTranscriptPayloadSchema.safeParse(VALID_PAYLOAD);
    expect(result.success).toBe(true);
  });

  it('V-02: rejects empty transcript string (min(1))', () => {
    const result = VoiceTranscriptPayloadSchema.safeParse({ ...VALID_PAYLOAD, transcript: '' });
    expect(result.success).toBe(false);
  });

  it('V-03: rejects confidence 1.5 (max(1))', () => {
    const result = VoiceTranscriptPayloadSchema.safeParse({ ...VALID_PAYLOAD, confidence: 1.5 });
    expect(result.success).toBe(false);
  });

  it('V-04: rejects confidence -0.1 (min(0))', () => {
    const result = VoiceTranscriptPayloadSchema.safeParse({ ...VALID_PAYLOAD, confidence: -0.1 });
    expect(result.success).toBe(false);
  });

  it('V-05: rejects language "de" (enum constraint)', () => {
    const result = VoiceTranscriptPayloadSchema.safeParse({ ...VALID_PAYLOAD, language: 'de' });
    expect(result.success).toBe(false);
  });

  it('V-06: accepts language "multi" (code-switching value valid)', () => {
    const result = VoiceTranscriptPayloadSchema.safeParse({ ...VALID_PAYLOAD, language: 'multi' });
    expect(result.success).toBe(true);
  });

  it('V-07: rejects extra fields (strict-object — T-12-WIRE-01)', () => {
    const result = VoiceTranscriptPayloadSchema.safeParse({ ...VALID_PAYLOAD, foo: 'bar' });
    expect(result.success).toBe(false);
  });

  it('V-08: rejects isFinal string "true" (must be boolean)', () => {
    const result = VoiceTranscriptPayloadSchema.safeParse({ ...VALID_PAYLOAD, isFinal: 'true' });
    expect(result.success).toBe(false);
  });

  it('V-09: rejects timestamp 1.5 (integer constraint)', () => {
    const result = VoiceTranscriptPayloadSchema.safeParse({ ...VALID_PAYLOAD, timestamp: 1.5 });
    expect(result.success).toBe(false);
  });

  it('V-09b: accepts language "unknown" (low-confidence detection value)', () => {
    const result = VoiceTranscriptPayloadSchema.safeParse({
      ...VALID_PAYLOAD,
      language: 'unknown',
    });
    expect(result.success).toBe(true);
  });

  it('V-09c: accepts language "en" (English detection value)', () => {
    const result = VoiceTranscriptPayloadSchema.safeParse({ ...VALID_PAYLOAD, language: 'en' });
    expect(result.success).toBe(true);
  });
});

describe('R1_VOICE_TRANSCRIPT_TYPE constant (V-10)', () => {
  it("V-10: R1_VOICE_TRANSCRIPT_TYPE === 'r1.voice.transcript'", () => {
    expect(R1_VOICE_TRANSCRIPT_TYPE).toBe('r1.voice.transcript');
  });
});

describe('canonical EnvelopeSchema round-trip with voice payload (V-11)', () => {
  it('V-11: valid r1.voice.transcript envelope round-trips outer + inner safeParse', () => {
    const envelope = {
      proto: 'evf-v1' as const,
      seq: 1,
      ts: Date.now(),
      type: R1_VOICE_TRANSCRIPT_TYPE,
      session_id: VALID_UUID_V4,
      payload: VALID_PAYLOAD,
    };
    const outer = EnvelopeSchema.safeParse(envelope);
    expect(outer.success).toBe(true);
    if (outer.success) {
      const inner = VoiceTranscriptPayloadSchema.safeParse(outer.data.payload);
      expect(inner.success).toBe(true);
      if (inner.success) {
        expect(inner.data.transcript).toBe('palla di fuoco');
        expect(inner.data.language).toBe('it');
        expect(inner.data.isFinal).toBe(true);
      }
    }
  });
});

describe('@evf/shared-protocol re-export contract (V-12)', () => {
  it('V-12: VoiceTranscriptPayloadSchema + R1_VOICE_TRANSCRIPT_TYPE re-exported from package entry', async () => {
    const pkg = await import('../index.js');
    expect(pkg.VoiceTranscriptPayloadSchema).toBeDefined();
    expect(pkg.R1_VOICE_TRANSCRIPT_TYPE).toBe('r1.voice.transcript');
  });
});
