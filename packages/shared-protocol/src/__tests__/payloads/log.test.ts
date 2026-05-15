/**
 * Unit tests for LogEventSchema (Phase 5 Plan 05-05 — LE-* discriminators).
 *
 * Covers:
 *   - LE-SCHEMA-1: valid minimal event parses
 *   - LE-SCHEMA-2: missing required field fails
 *   - LE-SCHEMA-3: result optional — event without result parses
 *   - LE-SCHEMA-KIND: all 8 kinds parse
 *   - LE-SCHEMA-RESULT-KINDS: all 5 result kinds parse
 *   - LE-SNAPSHOT: LogSnapshotSchema parses array of events
 *
 * @see packages/shared-protocol/src/payloads/log.ts
 * @see .planning/phases/05-panel-plugin-system-read-only-panels/05-05-PLAN.md §Task 2
 */

import { describe, expect, it } from 'vitest';
import {
  LOG_DELTA_TYPE,
  LogEventKindSchema,
  LogEventResultSchema,
  LogEventSchema,
  LogSnapshotSchema,
} from '../../payloads/log.js';

// ─── LE-SCHEMA-* ─────────────────────────────────────────────────────────────

describe('LogEventSchema', () => {
  it('LE-SCHEMA-1: minimal valid event parses successfully', () => {
    const event = {
      id: 'msg-001',
      timestamp: 1715788800000,
      actorName: 'Thorin',
      kind: 'attack',
      description: 'Spada lunga vs Goblin',
    };
    const result = LogEventSchema.safeParse(event);
    expect(result.success).toBe(true);
  });

  it('LE-SCHEMA-2: missing required field (id) fails', () => {
    const event = {
      timestamp: 1715788800000,
      actorName: 'Thorin',
      kind: 'attack',
      description: 'Spada lunga vs Goblin',
    };
    const result = LogEventSchema.safeParse(event);
    expect(result.success).toBe(false);
  });

  it('LE-SCHEMA-3: result is optional — event without result parses', () => {
    const event = {
      id: 'msg-002',
      timestamp: 1715788800000,
      actorName: 'Lyra',
      kind: 'spell',
      description: 'Bless',
    };
    const result = LogEventSchema.safeParse(event);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.result).toBeUndefined();
    }
  });

  it('LE-SCHEMA-4: event with full result parses', () => {
    const event = {
      id: 'msg-003',
      timestamp: 1715788800000,
      actorName: 'Thorin',
      kind: 'attack',
      description: 'Spada lunga vs Goblin',
      result: { kind: 'hit', value: 23, damage: '12 taglio' },
    };
    const result = LogEventSchema.safeParse(event);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.result?.kind).toBe('hit');
      expect(result.data.result?.value).toBe(23);
    }
  });

  it('LE-SCHEMA-5: empty actorName is allowed (defensive)', () => {
    const event = {
      id: 'msg-004',
      timestamp: 1715788800000,
      actorName: '',
      kind: 'chat',
      description: 'Hello',
    };
    const result = LogEventSchema.safeParse(event);
    expect(result.success).toBe(true);
  });

  it('LE-SCHEMA-6: negative timestamp is rejected (nonnegative)', () => {
    const event = {
      id: 'msg-005',
      timestamp: -1,
      actorName: 'Thorin',
      kind: 'attack',
      description: 'Test',
    };
    const result = LogEventSchema.safeParse(event);
    expect(result.success).toBe(false);
  });

  it('LE-SCHEMA-7: unknown extra field is rejected (strictObject)', () => {
    const event = {
      id: 'msg-006',
      timestamp: 1715788800000,
      actorName: 'Thorin',
      kind: 'attack',
      description: 'Test',
      extraField: 'forbidden',
    };
    const result = LogEventSchema.safeParse(event);
    expect(result.success).toBe(false);
  });
});

// ─── LE-SCHEMA-KIND-* ────────────────────────────────────────────────────────

describe('LogEventKindSchema — all 8 kinds', () => {
  const kinds = [
    'attack',
    'damage',
    'spell',
    'feature',
    'round',
    'concentration',
    'roll',
    'chat',
  ] as const;

  for (const kind of kinds) {
    it(`LE-SCHEMA-KIND: kind '${kind}' parses`, () => {
      const result = LogEventKindSchema.safeParse(kind);
      expect(result.success).toBe(true);
    });
  }

  it('unknown kind is rejected', () => {
    const result = LogEventKindSchema.safeParse('unknown-kind');
    expect(result.success).toBe(false);
  });
});

// ─── LE-SCHEMA-RESULT-* ──────────────────────────────────────────────────────

describe('LogEventResultSchema — all 5 result kinds', () => {
  it('LE-SCHEMA-RESULT-1: kind hit with value and damage', () => {
    const result = LogEventResultSchema.safeParse({ kind: 'hit', value: 23, damage: '12 taglio' });
    expect(result.success).toBe(true);
  });

  it('LE-SCHEMA-RESULT-2: kind miss with value', () => {
    const result = LogEventResultSchema.safeParse({ kind: 'miss', value: 14 });
    expect(result.success).toBe(true);
  });

  it('LE-SCHEMA-RESULT-3: kind pass', () => {
    const result = LogEventResultSchema.safeParse({ kind: 'pass', value: 17 });
    expect(result.success).toBe(true);
  });

  it('LE-SCHEMA-RESULT-4: kind fail', () => {
    const result = LogEventResultSchema.safeParse({ kind: 'fail' });
    expect(result.success).toBe(true);
  });

  it('LE-SCHEMA-RESULT-5: kind concentrating', () => {
    const result = LogEventResultSchema.safeParse({ kind: 'concentrating' });
    expect(result.success).toBe(true);
  });

  it('LE-SCHEMA-RESULT-6: value and damage both optional', () => {
    const result = LogEventResultSchema.safeParse({ kind: 'hit' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.value).toBeUndefined();
      expect(result.data.damage).toBeUndefined();
    }
  });
});

// ─── LE-SNAPSHOT ─────────────────────────────────────────────────────────────

describe('LogSnapshotSchema', () => {
  it('LE-SNAPSHOT: array of events parses', () => {
    const snapshot = {
      events: [
        {
          id: 'msg-1',
          timestamp: 1715788800000,
          actorName: 'Thorin',
          kind: 'attack',
          description: 'Test',
        },
      ],
    };
    const result = LogSnapshotSchema.safeParse(snapshot);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.events).toHaveLength(1);
    }
  });

  it('LE-SNAPSHOT-EMPTY: empty events array parses', () => {
    const result = LogSnapshotSchema.safeParse({ events: [] });
    expect(result.success).toBe(true);
  });
});

// ─── LOG_DELTA_TYPE ───────────────────────────────────────────────────────────

describe('LOG_DELTA_TYPE', () => {
  it('LOG_DELTA_TYPE is the string literal "log.delta"', () => {
    expect(LOG_DELTA_TYPE).toBe('log.delta');
  });
});
