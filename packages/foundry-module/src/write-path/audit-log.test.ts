/**
 * Unit tests for writeAuditLog.
 *
 * RED phase (TDD): tests written before implementation per Plan 07-01 Task 2.
 *
 * Mocks:
 * - `game.users.contents` — returns a mix of GM and non-GM users
 * - `game.user?.id` — current user ID
 * - `ChatMessage.create` — global Foundry static (stubbed via vi.stubGlobal)
 *
 * @see packages/foundry-module/src/write-path/audit-log.ts
 * @see .planning/phases/07-foundry-module-write-path/07-01-PLAN.md Task 2
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type AuditEntry, writeAuditLog } from './audit-log.js';

// ─── Global mocks ─────────────────────────────────────────────────────────────

const GM_USER_1 = { id: 'gm-001', isGM: true, active: true, targets: new Set() };
const GM_USER_2 = { id: 'gm-002', isGM: true, active: true, targets: new Set() };
const PLAYER_USER = { id: 'player-001', isGM: false, active: true, targets: new Set() };

function setupGameGlobal(gmIds: string[] = ['gm-001', 'gm-002']): void {
  vi.stubGlobal('game', {
    users: {
      contents: [GM_USER_1, GM_USER_2, PLAYER_USER],
      get: (_id: string) => undefined,
    },
    user: { id: 'gm-001', isGM: true, active: true, targets: new Set() },
  });
  // Keep gmIds param unused (derived from game.users.contents in implementation)
  void gmIds;
}

// ─── writeAuditLog ────────────────────────────────────────────────────────────

describe('writeAuditLog', () => {
  let chatCreateMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    chatCreateMock = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('ChatMessage', { create: chatCreateMock });
    setupGameGlobal();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ── Happy path ──────────────────────────────────────────────────────────────

  it('calls ChatMessage.create exactly once per log entry', async () => {
    const entry: AuditEntry = {
      tool: 'cast-spell',
      payload: { actorId: 'actor1' },
      idempotencyKey: '00000000-0000-4000-8000-000000000001',
      actorId: 'actor1',
      result: { success: true, data: { rolled: true } },
      timestamp: Date.now(),
      bearer_id: 'abcd1234',
    };
    await writeAuditLog(entry);
    expect(chatCreateMock).toHaveBeenCalledOnce();
  });

  it('passes whisper array containing only GM user IDs', async () => {
    const entry: AuditEntry = {
      tool: 'weapon-attack',
      payload: { actorId: 'actor2' },
      idempotencyKey: '00000000-0000-4000-8000-000000000002',
      actorId: 'actor2',
      result: { success: true, data: null },
      timestamp: Date.now(),
      bearer_id: 'deadbeef',
    };
    await writeAuditLog(entry);

    const callArgs = chatCreateMock.mock.calls[0]?.[0] as {
      whisper?: string[];
    };
    expect(callArgs.whisper).toBeDefined();
    expect(callArgs.whisper).toContain('gm-001');
    expect(callArgs.whisper).toContain('gm-002');
    // Player should NOT be in whisper list
    expect(callArgs.whisper).not.toContain('player-001');
  });

  it('stores audit entry in flags.evf.audit', async () => {
    const entry: AuditEntry = {
      tool: 'use-item',
      payload: { itemId: 'potion' },
      idempotencyKey: '00000000-0000-4000-8000-000000000003',
      actorId: 'actor3',
      result: { success: false, error: 'item_not_found' },
      timestamp: 1_700_000_000_000,
      bearer_id: 'cafebabe',
    };
    await writeAuditLog(entry);

    const callArgs = chatCreateMock.mock.calls[0]?.[0] as {
      flags?: Record<string, unknown>;
    };
    expect(callArgs.flags).toBeDefined();
    const evfFlags = callArgs.flags?.evf as Record<string, unknown> | undefined;
    expect(evfFlags).toBeDefined();
    expect(evfFlags?.audit).toEqual(entry);
  });

  it('sets speaker alias to EVF Audit', async () => {
    const entry: AuditEntry = {
      tool: 'move-token',
      payload: {},
      idempotencyKey: '00000000-0000-4000-8000-000000000004',
      actorId: null,
      result: { success: true, data: null },
      timestamp: Date.now(),
      bearer_id: '11223344',
    };
    await writeAuditLog(entry);

    const callArgs = chatCreateMock.mock.calls[0]?.[0] as {
      speaker?: { alias?: string };
    };
    expect(callArgs.speaker?.alias).toBe('EVF Audit');
  });

  // ── T-02-01: bearer_id is short hash (not full token) ─────────────────────

  it('T-02-01: bearer_id in audit entry is 8 hex chars (never full token)', async () => {
    const entry: AuditEntry = {
      tool: 'cast-spell',
      payload: {},
      idempotencyKey: '00000000-0000-4000-8000-000000000005',
      actorId: 'actor1',
      result: { success: true, data: null },
      timestamp: Date.now(),
      bearer_id: 'abcd1234', // 8 hex chars — caller must pass truncated value
    };
    await writeAuditLog(entry);

    const callArgs = chatCreateMock.mock.calls[0]?.[0] as {
      flags?: Record<string, unknown>;
    };
    const auditEntry = (callArgs.flags?.evf as Record<string, unknown>)?.audit as AuditEntry;
    expect(auditEntry.bearer_id).toHaveLength(8);
    expect(auditEntry.bearer_id).toMatch(/^[0-9a-f]+$/i);
  });

  // ── Failure isolation: ChatMessage.create rejection does NOT propagate ─────

  it('does NOT throw if ChatMessage.create rejects (belt-and-suspenders T-02-01)', async () => {
    chatCreateMock.mockRejectedValue(new Error('Foundry socket error'));
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const entry: AuditEntry = {
      tool: 'drop-concentration',
      payload: {},
      idempotencyKey: '00000000-0000-4000-8000-000000000006',
      actorId: 'actor1',
      result: { success: true, data: null },
      timestamp: Date.now(),
      bearer_id: 'ffffffff',
    };

    await expect(writeAuditLog(entry)).resolves.toBeUndefined();
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('logs a console.warn when ChatMessage.create rejects', async () => {
    const error = new Error('network failure');
    chatCreateMock.mockRejectedValue(error);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const entry: AuditEntry = {
      tool: 'place-template',
      payload: {},
      idempotencyKey: '00000000-0000-4000-8000-000000000007',
      actorId: null,
      result: { success: false, error: 'template_failed' },
      timestamp: Date.now(),
      bearer_id: '12345678',
    };
    await writeAuditLog(entry);
    expect(warnSpy).toHaveBeenCalledOnce();
    warnSpy.mockRestore();
  });

  // ── whisper array includes only GM users (single GM world) ─────────────────

  it('whisper array has exactly 2 GMs when 2 GMs present', async () => {
    const entry: AuditEntry = {
      tool: 'cast-spell',
      payload: {},
      idempotencyKey: '00000000-0000-4000-8000-000000000008',
      actorId: null,
      result: { success: true, data: null },
      timestamp: Date.now(),
      bearer_id: 'aabbccdd',
    };
    await writeAuditLog(entry);

    const callArgs = chatCreateMock.mock.calls[0]?.[0] as { whisper?: string[] };
    expect(callArgs.whisper).toHaveLength(2);
  });
});
