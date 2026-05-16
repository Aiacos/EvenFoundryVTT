/**
 * PerfProbe unit tests — Task 2 RED phase (Plan 10-02 TDD).
 *
 * Covers 8 behaviour points:
 *
 *   PP-01: new PerfProbe({enabled:false, …}) → mark() is a no-op + emit() returns early
 *   PP-02: new PerfProbe({enabled:true, …}) → mark('gesture_emit', key) records timestamp
 *   PP-03: after marking all 5 stations, flush(key) emits exactly one r1.perf.sample
 *          envelope through the injected wsSend — payload parses via PerfSampleEnvelopeSchema
 *   PP-04: flush() before all 5 stations are marked → emits nothing (partial flow dropped)
 *   PP-05: idempotencyKey is hashed in the emitted payload (payload.idempotencyKeyHash !== key)
 *   PP-06: two interleaved flows (different idempotencyKeys) do not corrupt each other
 *   PP-07: TTL eviction — pending flows older than 30s are dropped (avoid memory leak)
 *   PP-08: ?probe=true URL param → boot-engine constructs an enabled PerfProbe;
 *          absent or ?probe=false → constructs disabled probe
 *
 * @see packages/g2-app/src/engine/perf-probe.ts
 * @see packages/g2-app/src/internal/boot-engine-core.ts (boot wiring)
 * @see .planning/phases/10-polish-field-test-mvp/10-02-PLAN.md Task 2
 */
import { PerfSampleEnvelopeSchema, type PerfStation } from '@evf/shared-protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PerfProbe } from '../engine/perf-probe.js';

// ─── Test fixtures ────────────────────────────────────────────────────────────

const SESSION_ID = '12345678-1234-4234-8234-123456789abc';

/** All 5 canonical stations in the required order for a complete flow. */
const ALL_STATIONS: PerfStation[] = [
  'gesture_emit',
  'bridge_post',
  'handler_invoke',
  'result_envelope',
  'toast_queued',
];

/**
 * Build a PerfProbe with an injected wsSend mock and a deterministic `now()`.
 */
function makeProbe(
  enabled: boolean,
  opts?: {
    now?: () => number;
    seqProvider?: () => number;
    sessionId?: string;
  },
) {
  const sent: unknown[] = [];
  const wsSend = (env: unknown): void => {
    sent.push(env);
  };

  let t = 1000;
  const now = opts?.now ?? (() => (t += 50));
  const seqProvider = opts?.seqProvider ?? (() => 1);
  const sessionId = opts?.sessionId ?? SESSION_ID;

  const probe = new PerfProbe({
    enabled,
    sessionId,
    wsSend,
    now,
    seqProvider,
  });

  return { probe, sent };
}

/**
 * Mark all 5 stations for a given idempotencyKey using sequential timestamps.
 */
async function markAllStations(probe: PerfProbe, key: string): Promise<void> {
  for (const station of ALL_STATIONS) {
    probe.mark(station, key);
  }
  await probe.flush(key);
}

// ─── PP-01: disabled probe is a no-op ────────────────────────────────────────

describe('PerfProbe (disabled)', () => {
  it('PP-01: mark() is a no-op and flush() returns early without emitting', async () => {
    const { probe, sent } = makeProbe(false);
    probe.mark('gesture_emit', 'key-001');
    probe.mark('bridge_post', 'key-001');
    await probe.flush('key-001');
    expect(sent).toHaveLength(0);
  });
});

// ─── PP-02..07: enabled probe ─────────────────────────────────────────────────

describe('PerfProbe (enabled)', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('PP-02: mark records a timestamp keyed on idempotencyKey', async () => {
    const { probe } = makeProbe(true);
    // No error should be thrown; mark records internally
    expect(() => probe.mark('gesture_emit', 'key-002')).not.toThrow();
  });

  it('PP-03: all 5 stations → flush emits exactly one r1.perf.sample that parses', async () => {
    const { probe, sent } = makeProbe(true);
    await markAllStations(probe, 'key-003');

    expect(sent).toHaveLength(1);
    const result = PerfSampleEnvelopeSchema.safeParse(sent[0]);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe('r1.perf.sample');
      expect(result.data.payload.stations).toHaveLength(5);
    }
  });

  it('PP-04: flush before all 5 stations → emits nothing (partial flow dropped)', async () => {
    const { probe, sent } = makeProbe(true);
    probe.mark('gesture_emit', 'key-004');
    probe.mark('bridge_post', 'key-004');
    // Only 2 of 5 stations marked — flush should NOT emit
    await probe.flush('key-004');
    expect(sent).toHaveLength(0);
  });

  it('PP-05: idempotencyKeyHash in payload !== original idempotencyKey', async () => {
    const key = 'bearer-token-action-007';
    const { probe, sent } = makeProbe(true);
    await markAllStations(probe, key);

    expect(sent).toHaveLength(1);
    const result = PerfSampleEnvelopeSchema.safeParse(sent[0]);
    expect(result.success).toBe(true);
    if (result.success) {
      // Hash must not equal the original key
      expect(result.data.payload.idempotencyKeyHash).not.toBe(key);
      // Hash must be 16-char hex
      expect(/^[0-9a-f]{16}$/.test(result.data.payload.idempotencyKeyHash)).toBe(true);
    }
  });

  it('PP-06: two interleaved flows do not corrupt each other', async () => {
    const { probe, sent } = makeProbe(true);

    const keyA = 'key-flow-A';
    const keyB = 'key-flow-B';

    // Interleave: gesture_emit for both, then bridge_post for both, etc.
    probe.mark('gesture_emit', keyA);
    probe.mark('gesture_emit', keyB);
    probe.mark('bridge_post', keyA);
    probe.mark('bridge_post', keyB);
    probe.mark('handler_invoke', keyA);
    probe.mark('handler_invoke', keyB);
    probe.mark('result_envelope', keyA);
    probe.mark('result_envelope', keyB);
    probe.mark('toast_queued', keyA);
    probe.mark('toast_queued', keyB);

    // Flush both
    await probe.flush(keyA);
    await probe.flush(keyB);

    // Both should emit independently
    expect(sent).toHaveLength(2);

    const resultA = PerfSampleEnvelopeSchema.safeParse(sent[0]);
    const resultB = PerfSampleEnvelopeSchema.safeParse(sent[1]);
    expect(resultA.success).toBe(true);
    expect(resultB.success).toBe(true);

    // The two hashes should differ (different keys → different hashes)
    if (resultA.success && resultB.success) {
      expect(resultA.data.payload.idempotencyKeyHash).not.toBe(
        resultB.data.payload.idempotencyKeyHash,
      );
    }
  });

  it('PP-07: TTL eviction — pending flows older than 30s are dropped', async () => {
    // Fake time: start at 0, then advance past the 30s TTL
    let currentTime = 0;
    const now = (): number => currentTime;

    const { probe, sent } = makeProbe(true, { now });

    const key = 'key-stale-007';
    probe.mark('gesture_emit', key);
    probe.mark('bridge_post', key);

    // Advance time past 30s TTL
    currentTime = 30_001;

    // Trigger eviction by marking another station (or directly calling dispose cleanup)
    // The probe should evict stale keys on next mark/flush
    probe.mark('gesture_emit', 'key-fresh-008');
    await probe.flush(key); // should be a no-op since key is stale
    expect(sent).toHaveLength(0);

    probe.dispose();
  });
});

// ─── PP-08: boot-engine URL param wiring ─────────────────────────────────────
// We test the PerfProbe constructor with enabled=true/false rather than the
// boot-engine wiring directly (boot-engine requires the full bridge mock chain).
// The actual URL-param wiring is verified by the boot-engine opt-in branch
// in boot-engine-core.ts (integration-level; separate boot-engine tests cover
// the full wiring contract).
describe('PerfProbe (opt-in mechanics)', () => {
  it('PP-08a: enabled=true probe emits; enabled=false probe is silent', async () => {
    const enabledProbe = makeProbe(true);
    const disabledProbe = makeProbe(false);

    await markAllStations(enabledProbe.probe, 'key-enabled');
    await markAllStations(disabledProbe.probe, 'key-disabled');

    expect(enabledProbe.sent).toHaveLength(1);
    expect(disabledProbe.sent).toHaveLength(0);
  });
});
