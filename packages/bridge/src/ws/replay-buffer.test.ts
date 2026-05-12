/**
 * Unit tests for ReplayBuffer.
 *
 * Covers: push/replay basics, 60s eviction, replay from seq, lastSeq,
 * cross-session isolation, clearSession.
 */

import type { Envelope } from '@evf/shared-protocol';
import { beforeEach, describe, expect, it } from 'vitest';
import { ReplayBuffer } from './replay-buffer.js';

const SESSION_A = '00000000-0000-4000-8000-000000000001';
const SESSION_B = '00000000-0000-4000-8000-000000000002';

function makeEnvelope(sessionId: string, seq: number, ts: number): Envelope {
  return {
    proto: 'evf-v1',
    seq,
    ts,
    type: 'test.event',
    session_id: sessionId,
    payload: { seq },
  };
}

describe('ReplayBuffer', () => {
  let buffer: ReplayBuffer;
  const NOW = 1_700_000_000_000;

  beforeEach(() => {
    buffer = new ReplayBuffer();
  });

  describe('push + replay basics', () => {
    it('stores pushed envelopes and replays from seq 0', () => {
      buffer.push(makeEnvelope(SESSION_A, 1, NOW));
      buffer.push(makeEnvelope(SESSION_A, 2, NOW + 1000));
      buffer.push(makeEnvelope(SESSION_A, 3, NOW + 2000));

      const replayed = buffer.replay(SESSION_A, 0);
      expect(replayed).toHaveLength(3);
      expect(replayed.map((e) => e.seq)).toEqual([1, 2, 3]);
    });

    it('returns only envelopes with seq > fromSeq', () => {
      buffer.push(makeEnvelope(SESSION_A, 1, NOW));
      buffer.push(makeEnvelope(SESSION_A, 2, NOW + 1000));
      buffer.push(makeEnvelope(SESSION_A, 3, NOW + 2000));
      buffer.push(makeEnvelope(SESSION_A, 4, NOW + 3000));

      const replayed = buffer.replay(SESSION_A, 2);
      expect(replayed.map((e) => e.seq)).toEqual([3, 4]);
    });

    it('returns empty array when fromSeq is at or beyond last buffered seq', () => {
      buffer.push(makeEnvelope(SESSION_A, 5, NOW));

      expect(buffer.replay(SESSION_A, 5)).toHaveLength(0);
      expect(buffer.replay(SESSION_A, 99)).toHaveLength(0);
    });

    it('returns empty array for unknown session', () => {
      expect(buffer.replay('unknown-session-id', 0)).toHaveLength(0);
    });
  });

  describe('60s TTL eviction', () => {
    it('evicts entries older than 60s on push', () => {
      const oldTs = NOW;
      const newTs = NOW + 62_000; // 62s later

      buffer.push(makeEnvelope(SESSION_A, 1, oldTs));
      // seq=2 is at oldTs + 1000: cutoff = newTs - 60000 = oldTs + 2000, so seq=2 IS evicted
      buffer.push(makeEnvelope(SESSION_A, 2, oldTs + 1000));

      // Push an entry 62s later — triggers eviction: cutoff = oldTs + 2000
      // seq=1 (oldTs) < cutoff → evicted; seq=2 (oldTs + 1000) < cutoff → evicted
      buffer.push(makeEnvelope(SESSION_A, 3, newTs));

      const replayed = buffer.replay(SESSION_A, 0);
      // Only seq=3 survives
      expect(replayed.map((e) => e.seq)).toEqual([3]);
    });

    it('keeps entries within 60s window', () => {
      const ts0 = NOW;

      buffer.push(makeEnvelope(SESSION_A, 1, ts0));
      buffer.push(makeEnvelope(SESSION_A, 2, ts0 + 30_000)); // 30s later
      buffer.push(makeEnvelope(SESSION_A, 3, ts0 + 59_000)); // 59s later

      // Push at ts0 + 60_000 — seq=1 is exactly at the edge (ts >= cutoff where cutoff = 60000 - 60000 = 0)
      buffer.push(makeEnvelope(SESSION_A, 4, ts0 + 60_000));

      const replayed = buffer.replay(SESSION_A, 0);
      // seq=1 is at exactly 60s back → ts0 >= (ts0 + 60000 - 60000) = ts0, so it survives
      expect(replayed.map((e) => e.seq)).toContain(2);
      expect(replayed.map((e) => e.seq)).toContain(3);
      expect(replayed.map((e) => e.seq)).toContain(4);
    });

    it('evicts only entries strictly older than 60s', () => {
      const ts0 = NOW;

      // seq=1 is 61s before seq=3 — should be evicted
      buffer.push(makeEnvelope(SESSION_A, 1, ts0));
      buffer.push(makeEnvelope(SESSION_A, 2, ts0 + 20_000));
      buffer.push(makeEnvelope(SESSION_A, 3, ts0 + 61_000));

      const replayed = buffer.replay(SESSION_A, 0);
      expect(replayed.map((e) => e.seq)).not.toContain(1);
      expect(replayed.map((e) => e.seq)).toContain(2);
      expect(replayed.map((e) => e.seq)).toContain(3);
    });
  });

  describe('lastSeq', () => {
    it('returns 0 for an empty/unknown session', () => {
      expect(buffer.lastSeq(SESSION_A)).toBe(0);
    });

    it('returns the highest seq after pushes', () => {
      buffer.push(makeEnvelope(SESSION_A, 1, NOW));
      buffer.push(makeEnvelope(SESSION_A, 2, NOW + 1000));
      buffer.push(makeEnvelope(SESSION_A, 7, NOW + 2000));

      expect(buffer.lastSeq(SESSION_A)).toBe(7);
    });

    it('returns 0 after all entries are evicted', () => {
      buffer.push(makeEnvelope(SESSION_A, 1, NOW));
      // Push 61s later — evicts seq=1
      buffer.push(makeEnvelope(SESSION_A, 2, NOW + 61_000));
      // Push another 61s later — evicts seq=2
      buffer.push(makeEnvelope(SESSION_A, 3, NOW + 122_000));

      // Confirm seq=1 is gone (evicted), seq=3 is there
      const replayed = buffer.replay(SESSION_A, 0);
      expect(replayed.map((e) => e.seq)).not.toContain(1);
      expect(buffer.lastSeq(SESSION_A)).toBe(3);
    });
  });

  describe('session isolation', () => {
    it('sessions do not interfere with each other', () => {
      buffer.push(makeEnvelope(SESSION_A, 1, NOW));
      buffer.push(makeEnvelope(SESSION_A, 2, NOW + 1000));
      buffer.push(makeEnvelope(SESSION_B, 10, NOW));
      buffer.push(makeEnvelope(SESSION_B, 11, NOW + 1000));

      expect(buffer.replay(SESSION_A, 0).map((e) => e.seq)).toEqual([1, 2]);
      expect(buffer.replay(SESSION_B, 0).map((e) => e.seq)).toEqual([10, 11]);
    });
  });

  describe('size()', () => {
    it('returns total count across all sessions', () => {
      expect(buffer.size()).toBe(0);

      buffer.push(makeEnvelope(SESSION_A, 1, NOW));
      buffer.push(makeEnvelope(SESSION_B, 1, NOW));
      expect(buffer.size()).toBe(2);
    });
  });

  // ─── hasGap() ─────────────────────────────────────────────────────────────

  describe('hasGap()', () => {
    it('returns false when buffer is empty for the session', () => {
      expect(buffer.hasGap(SESSION_A, 0)).toBe(false);
    });

    it('returns false when buffered entries (seq 1, 2, 3) are contiguous and fromSeq=0', () => {
      buffer.push(makeEnvelope(SESSION_A, 1, NOW));
      buffer.push(makeEnvelope(SESSION_A, 2, NOW + 1000));
      buffer.push(makeEnvelope(SESSION_A, 3, NOW + 2000));

      expect(buffer.hasGap(SESSION_A, 0)).toBe(false);
    });

    it('returns true when buffer holds seq 1, 3, 4 and fromSeq=0 (gap at 2)', () => {
      buffer.push(makeEnvelope(SESSION_A, 1, NOW));
      // seq 2 intentionally missing (gap injection — T-03-01)
      buffer.push(makeEnvelope(SESSION_A, 3, NOW + 2000));
      buffer.push(makeEnvelope(SESSION_A, 4, NOW + 3000));

      expect(buffer.hasGap(SESSION_A, 0)).toBe(true);
    });

    it('returns false when buffer holds seq 1, 2, 3 and fromSeq=2 (filtered to seq 3 only — single entry, no gap)', () => {
      buffer.push(makeEnvelope(SESSION_A, 1, NOW));
      buffer.push(makeEnvelope(SESSION_A, 2, NOW + 1000));
      buffer.push(makeEnvelope(SESSION_A, 3, NOW + 2000));

      // fromSeq=2 → relevant entries = [seq 3] only; < 2 entries → no gap
      expect(buffer.hasGap(SESSION_A, 2)).toBe(false);
    });
  });

  describe('clearSession()', () => {
    it('removes all buffered entries for the session', () => {
      buffer.push(makeEnvelope(SESSION_A, 1, NOW));
      buffer.push(makeEnvelope(SESSION_A, 2, NOW + 1000));

      buffer.clearSession(SESSION_A);

      expect(buffer.replay(SESSION_A, 0)).toHaveLength(0);
      expect(buffer.lastSeq(SESSION_A)).toBe(0);
    });

    it('does not affect other sessions', () => {
      buffer.push(makeEnvelope(SESSION_A, 1, NOW));
      buffer.push(makeEnvelope(SESSION_B, 1, NOW));

      buffer.clearSession(SESSION_A);

      expect(buffer.replay(SESSION_B, 0)).toHaveLength(1);
    });

    it('is a no-op for a session that does not exist', () => {
      expect(() => buffer.clearSession('ghost')).not.toThrow();
    });
  });
});
