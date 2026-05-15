/**
 * Unit tests for `bootErrorFromException` (Phase 4b Plan 04 Task 2).
 *
 * Asserts the RESEARCH §Q3 source map verbatim — every reachable exception
 * pattern dispatches to its assigned `BootErrorState` enum value, plus the
 * catch-all default surface (T-4b-04-01 mitigation).
 *
 * Test discriminator markers `BED-01`..`BED-14` are embedded in `it()` titles
 * so the plan-checker grep gate (`grep -cE 'BED-(0[1-9]|1[0-4])'`) matches 14.
 *
 * @see .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-04-PLAN.md Task 2
 * @see .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-RESEARCH.md §Q3
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootErrorFromException } from '../boot-error-dispatch.js';
import { HandshakeError } from '../capability-handshake.js';
import { LayerManagerError } from '../layer-types.js';

describe('bootErrorFromException — RESEARCH §Q3 dispatch table', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
      /* silence */
    });
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  // ─── HandshakeError discrimination ──────────────────────────────────────

  it('BED-01: HandshakeError("transport_error") → "bridge_unreachable"', () => {
    expect(bootErrorFromException(new HandshakeError('transport_error', 'msg'))).toBe(
      'bridge_unreachable',
    );
  });

  it('BED-02: HandshakeError("parse_failed") → "handshake_failed"', () => {
    expect(bootErrorFromException(new HandshakeError('parse_failed', 'msg'))).toBe(
      'handshake_failed',
    );
  });

  it('BED-03: HandshakeError("schema_failed") → "handshake_failed"', () => {
    expect(bootErrorFromException(new HandshakeError('schema_failed', 'msg'))).toBe(
      'handshake_failed',
    );
  });

  it('BED-04: HandshakeError("timeout") → "handshake_failed"', () => {
    expect(bootErrorFromException(new HandshakeError('timeout', 'msg'))).toBe('handshake_failed');
  });

  // ─── LayerManagerError → handshake_failed (coalesced) ───────────────────

  it('BED-05: LayerManagerError("capture_invariant_violated") → "handshake_failed"', () => {
    expect(bootErrorFromException(new LayerManagerError('capture_invariant_violated', 'msg'))).toBe(
      'handshake_failed',
    );
  });

  // ─── Plain Error substring matching ─────────────────────────────────────

  it('BED-06: Error("WebSocket error before open") → "bridge_unreachable"', () => {
    expect(
      bootErrorFromException(new Error('[boot-engine-core] WebSocket error before open: error')),
    ).toBe('bridge_unreachable');
  });

  it('BED-07: Error containing "WebSocket" + "1006" → "bridge_unreachable"', () => {
    expect(bootErrorFromException(new Error('WebSocket close 1006 abnormal'))).toBe(
      'bridge_unreachable',
    );
  });

  it('BED-08: Error containing "proto_chosen" → "version_mismatch"', () => {
    expect(bootErrorFromException(new Error('proto_chosen=evf-v0 not supported'))).toBe(
      'version_mismatch',
    );
  });

  it('BED-09: Error containing "bridgeFactory" → "bridge_unreachable"', () => {
    expect(bootErrorFromException(new Error('bridgeFactory rejected'))).toBe('bridge_unreachable');
  });

  it('BED-10: Error containing "no actor" (case-insensitive) → "no_character"', () => {
    expect(bootErrorFromException(new Error('no actor assigned'))).toBe('no_character');
    expect(bootErrorFromException(new Error('NO ACTOR'))).toBe('no_character');
    expect(bootErrorFromException(new Error('No Character set'))).toBe('no_character');
  });

  it('BED-11: Error containing "401" → "token_expired"', () => {
    expect(bootErrorFromException(new Error('401 Unauthorized'))).toBe('token_expired');
    expect(bootErrorFromException(new Error('TokenExpired: bearer'))).toBe('token_expired');
    expect(bootErrorFromException(new Error('403 Forbidden'))).toBe('token_expired');
  });

  // ─── Catch-all (T-4b-04-01) ─────────────────────────────────────────────

  it('BED-12: undefined → "handshake_failed" + console.warn telemetry', () => {
    expect(bootErrorFromException(undefined)).toBe('handshake_failed');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const args = warnSpy.mock.calls[0];
    expect(args).toBeDefined();
    expect(args?.[0]).toContain('[boot-error-dispatch]');
    expect(args?.[0]).toContain('unknown exception shape');
  });

  it('BED-13: empty object (no "message" field) → "handshake_failed" + console.warn telemetry', () => {
    expect(bootErrorFromException({})).toBe('handshake_failed');
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('BED-14: unrelated Error message → "handshake_failed" (catch-all + console.warn fires)', () => {
    // Has a `.message` field but no substring matches any RESEARCH §Q3 pattern.
    // The dispatch falls through past every pattern branch and hits the
    // catch-all default — which DOES log telemetry: there is no
    // "matched-but-unknown-class" sentinel, only "any-shape-without-match".
    expect(bootErrorFromException(new Error('unrelated random error'))).toBe('handshake_failed');
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});
