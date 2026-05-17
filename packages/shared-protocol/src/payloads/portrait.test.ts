/**
 * Unit tests for PortraitReadyPayloadSchema (Plan 13-03 — STRETCH-06).
 *
 * PR-PAYLOAD-01: positive parse — valid payload round-trips
 * PR-PAYLOAD-02: missing actorId → rejected
 * PR-PAYLOAD-03: width != 100 → rejected
 * PR-PAYLOAD-04: height != 60 → rejected
 * PR-PAYLOAD-05: malformed urlHash (not 64 hex chars) → rejected
 * PR-PAYLOAD-06: extra keys rejected (strictObject)
 * PR-PAYLOAD-07: missing pngBase64 → rejected
 *
 * @see packages/shared-protocol/src/payloads/portrait.ts
 * @see .planning/phases/13-v2-stretch/13-03-PLAN.md Task 1
 */

import { describe, expect, it } from 'vitest';
import { PortraitReadyPayloadSchema, R1_PORTRAIT_READY_TYPE } from './portrait.js';

const VALID_URL_HASH = 'a'.repeat(64);
const VALID_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQAABjE+ibYAAAAASUVORK5CYII=';

const VALID_PAYLOAD = {
  actorId: 'actor-thorin-oakenshield',
  pngBase64: VALID_PNG_BASE64,
  width: 100 as const,
  height: 60 as const,
  urlHash: VALID_URL_HASH,
};

describe('PortraitReadyPayloadSchema', () => {
  // PR-PAYLOAD-01: positive parse
  it('PR-PAYLOAD-01: parses valid payload and round-trips all fields', () => {
    const result = PortraitReadyPayloadSchema.safeParse(VALID_PAYLOAD);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.actorId).toBe('actor-thorin-oakenshield');
    expect(result.data.width).toBe(100);
    expect(result.data.height).toBe(60);
    expect(result.data.urlHash).toBe(VALID_URL_HASH);
    expect(result.data.pngBase64).toBe(VALID_PNG_BASE64);
  });

  // PR-PAYLOAD-02: missing actorId
  it('PR-PAYLOAD-02: missing actorId is rejected', () => {
    const { actorId: _omit, ...rest } = VALID_PAYLOAD;
    const result = PortraitReadyPayloadSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  // PR-PAYLOAD-03: width != 100
  it('PR-PAYLOAD-03: width != 100 is rejected', () => {
    const result = PortraitReadyPayloadSchema.safeParse({ ...VALID_PAYLOAD, width: 200 });
    expect(result.success).toBe(false);
  });

  // PR-PAYLOAD-04: height != 60
  it('PR-PAYLOAD-04: height != 60 is rejected', () => {
    const result = PortraitReadyPayloadSchema.safeParse({ ...VALID_PAYLOAD, height: 100 });
    expect(result.success).toBe(false);
  });

  // PR-PAYLOAD-05: malformed urlHash (not 64 hex chars)
  it('PR-PAYLOAD-05: urlHash with wrong length rejected', () => {
    const result = PortraitReadyPayloadSchema.safeParse({ ...VALID_PAYLOAD, urlHash: 'abc123' });
    expect(result.success).toBe(false);
  });

  it('PR-PAYLOAD-05b: urlHash with non-hex characters rejected', () => {
    const result = PortraitReadyPayloadSchema.safeParse({
      ...VALID_PAYLOAD,
      urlHash: 'g'.repeat(64), // 'g' is not a hex char
    });
    expect(result.success).toBe(false);
  });

  // PR-PAYLOAD-06: extra keys rejected (strictObject)
  it('PR-PAYLOAD-06: extra keys rejected by strictObject', () => {
    const result = PortraitReadyPayloadSchema.safeParse({
      ...VALID_PAYLOAD,
      unexpectedField: 'hacker',
    });
    expect(result.success).toBe(false);
  });

  // PR-PAYLOAD-07: missing pngBase64
  it('PR-PAYLOAD-07: missing pngBase64 is rejected', () => {
    const { pngBase64: _omit, ...rest } = VALID_PAYLOAD;
    const result = PortraitReadyPayloadSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });
});

describe('R1_PORTRAIT_READY_TYPE', () => {
  it('is the string r1.portrait.ready', () => {
    expect(R1_PORTRAIT_READY_TYPE).toBe('r1.portrait.ready');
  });
});
