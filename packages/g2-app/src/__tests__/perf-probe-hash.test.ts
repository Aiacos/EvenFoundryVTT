/**
 * PerfProbeHash unit tests — Task 1 RED phase (Plan 10-02 TDD).
 *
 * Covers 7 behaviour points:
 *
 *   PSH-01: `await hashIdempotencyKey('test-key-123')` returns 16-char lowercase hex string
 *   PSH-02: same input → same output (deterministic over 5 calls)
 *   PSH-03: different inputs → different outputs (collision resistance at 16-hex truncation: 100 unique → 100 unique)
 *   PSH-04: empty string → sha256-truncated-16 of empty string (no special-casing)
 *   PSE-01: PerfSampleEnvelopeSchema.safeParse succeeds for a valid envelope
 *   PSE-02: parse fails if stations has fewer than 5 entries OR unknown station name
 *   PSE-03: parse fails if idempotencyKeyHash is not exactly 16 chars of [0-9a-f]
 *
 * T-10-02 mitigation: hashIdempotencyKey reduces idempotencyKey to sha256-trunc-16-hex
 * before any envelope construction. PerfSampleEnvelopeSchema enforces the regex.
 *
 * @see packages/g2-app/src/engine/perf-probe-hash.ts
 * @see packages/shared-protocol/src/perf-probe.ts
 * @see .planning/phases/10-polish-field-test-mvp/10-02-PLAN.md Task 1
 */
import { PerfSampleEnvelopeSchema } from '@evf/shared-protocol';
import { describe, expect, it } from 'vitest';
import { hashIdempotencyKey } from '../engine/perf-probe-hash.js';

// ─── SHA-256 of empty string, first 16 hex chars ─────────────────────────────
// sha256('') = e3b0c44298fc1c14... → first 16 = 'e3b0c44298fc1c14'
const EMPTY_SHA256_TRUNC16 = 'e3b0c44298fc1c14';

// ─── Canonical 5-station array for schema tests ───────────────────────────────
const VALID_STATIONS = [
  { name: 'gesture_emit', ts: 1000 },
  { name: 'bridge_post', ts: 1050 },
  { name: 'handler_invoke', ts: 1120 },
  { name: 'result_envelope', ts: 1380 },
  { name: 'toast_queued', ts: 1400 },
] as const;

// A dummy 16-char lowercase hex string used for schema validation tests only.
// Not a real key — just a structurally valid value matching ^[0-9a-f]{16}$.
const VALID_HASH_FIXTURE = 'deadbeef0000cafe'; // gitleaks:allow

const VALID_ENVELOPE = {
  proto: 'evf-v1',
  seq: 1,
  ts: 1731234567890,
  type: 'r1.perf.sample',
  session_id: '12345678-1234-4234-8234-123456789abc',
  payload: {
    idempotencyKeyHash: VALID_HASH_FIXTURE,
    stations: VALID_STATIONS,
  },
} as const;

// ─── PSH tests (hash helper) ─────────────────────────────────────────────────

describe('hashIdempotencyKey', () => {
  it('PSH-01: returns 16-char lowercase hex string', async () => {
    const result = await hashIdempotencyKey('test-key-123');
    expect(typeof result).toBe('string');
    expect(result).toHaveLength(16);
    expect(/^[0-9a-f]{16}$/.test(result)).toBe(true);
  });

  it('PSH-02: deterministic — same input yields same output over 5 calls', async () => {
    const input = 'session-token-bearer-xyz';
    const results = await Promise.all(Array.from({ length: 5 }, () => hashIdempotencyKey(input)));
    const first = results[0];
    for (const r of results) {
      expect(r).toBe(first);
    }
  });

  it('PSH-03: different inputs → different outputs (100 unique inputs → 100 unique outputs)', async () => {
    const inputs = Array.from({ length: 100 }, (_, i) => `idempotency-key-${i}`);
    const outputs = await Promise.all(inputs.map(hashIdempotencyKey));
    const uniqueOutputs = new Set(outputs);
    expect(uniqueOutputs.size).toBe(100);
  });

  it('PSH-04: empty string → sha256-trunc-16 of empty string (no special-casing)', async () => {
    const result = await hashIdempotencyKey('');
    expect(result).toBe(EMPTY_SHA256_TRUNC16);
  });
});

// ─── PSE tests (PerfSampleEnvelopeSchema) ────────────────────────────────────

describe('PerfSampleEnvelopeSchema', () => {
  it('PSE-01: valid envelope parses successfully', () => {
    const result = PerfSampleEnvelopeSchema.safeParse(VALID_ENVELOPE);
    expect(result.success).toBe(true);
  });

  it('PSE-02a: parse fails if stations has fewer than 5 entries', () => {
    const env = {
      ...VALID_ENVELOPE,
      payload: {
        ...VALID_ENVELOPE.payload,
        stations: VALID_STATIONS.slice(0, 3), // only 3 entries
      },
    };
    const result = PerfSampleEnvelopeSchema.safeParse(env);
    expect(result.success).toBe(false);
  });

  it('PSE-02b: parse fails if stations includes an unknown station name', () => {
    const env = {
      ...VALID_ENVELOPE,
      payload: {
        ...VALID_ENVELOPE.payload,
        stations: [
          { name: 'gesture_emit', ts: 1000 },
          { name: 'bridge_post', ts: 1050 },
          { name: 'handler_invoke', ts: 1120 },
          { name: 'result_envelope', ts: 1380 },
          { name: 'unknown_station', ts: 1400 }, // invalid station name
        ],
      },
    };
    const result = PerfSampleEnvelopeSchema.safeParse(env);
    expect(result.success).toBe(false);
  });

  it('PSE-03a: parse fails if idempotencyKeyHash is not 16 chars', () => {
    const env = {
      ...VALID_ENVELOPE,
      payload: {
        ...VALID_ENVELOPE.payload,
        idempotencyKeyHash: 'abc', // too short
      },
    };
    const result = PerfSampleEnvelopeSchema.safeParse(env);
    expect(result.success).toBe(false);
  });

  it('PSE-03b: parse fails if idempotencyKeyHash contains non-hex chars', () => {
    const env = {
      ...VALID_ENVELOPE,
      payload: {
        ...VALID_ENVELOPE.payload,
        idempotencyKeyHash: 'DEADBEEF0000CAFE', // uppercase — not [0-9a-f]  // gitleaks:allow
      },
    };
    const result = PerfSampleEnvelopeSchema.safeParse(env);
    expect(result.success).toBe(false);
  });
});
