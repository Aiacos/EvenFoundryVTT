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
import { AUDIT_WRITE_TIMEOUT_MS, type AuditEntry, writeAuditLog } from './audit-log.js';

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

  // ── Regression (260621): a HUNG ChatMessage.create must not stall dispatch ───
  // A player/headless executor can have ChatMessage.create never settle; without a
  // bound, dispatchTool awaits it forever and the bridge hits its 10s foundry_timeout
  // even though the action already executed. writeAuditLog must resolve within
  // AUDIT_WRITE_TIMEOUT_MS regardless.
  it('resolves (does not hang) when ChatMessage.create never settles — bounded by timeout', async () => {
    vi.useFakeTimers();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    // A create that NEVER resolves (simulates the hung player/headless executor).
    chatCreateMock.mockReturnValue(new Promise<never>(() => {}));

    const entry: AuditEntry = {
      tool: 'skill-check',
      payload: { actor_id: 'actor1' },
      idempotencyKey: '00000000-0000-4000-8000-000000000099',
      actorId: 'actor1',
      result: { success: true, data: { rolled: true } },
      timestamp: 0,
      bearer_id: 'deadbeef',
    };

    let settled = false;
    const p = writeAuditLog(entry).then(() => {
      settled = true;
    });

    // Before the timeout fires, the write is still pending (would stall dispatch).
    await Promise.resolve();
    expect(settled).toBe(false);

    // Advancing past the bound makes it resolve (best-effort give-up) + warn.
    await vi.advanceTimersByTimeAsync(AUDIT_WRITE_TIMEOUT_MS + 10);
    await p;
    expect(settled).toBe(true);
    expect(warnSpy).toHaveBeenCalledOnce();

    warnSpy.mockRestore();
    vi.useRealTimers();
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

  // ── CR-02 regression: no GM online — must NOT create a public ChatMessage ───

  it('CR-02: does NOT call ChatMessage.create when no GMs are online (prevents public audit exposure)', async () => {
    // Override global: zero GMs, only a player connected
    vi.stubGlobal('game', {
      users: {
        contents: [{ id: 'player-999', isGM: false, active: true }],
        get: (_id: string) => undefined,
      },
      user: { id: 'player-999', isGM: false, active: true },
    });

    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const entry: AuditEntry = {
      tool: 'cast-spell',
      payload: { secret: 'sensitive' },
      idempotencyKey: '00000000-0000-4000-8000-000000000009',
      actorId: 'actor-rogue',
      result: { success: true, data: null },
      timestamp: Date.now(),
      bearer_id: 'deadbeef',
    };

    await writeAuditLog(entry);

    // T-07-04: players must not read audit entries — no public message must be created
    expect(chatCreateMock).not.toHaveBeenCalled();
    // A warn must be emitted so the GM can diagnose missed audit entries post-reconnect
    expect(consoleSpy).toHaveBeenCalledOnce();
    expect(consoleSpy.mock.calls[0]![0]).toContain('no GMs connected');

    consoleSpy.mockRestore();
  });

  it('CR-02: resolves without throwing when no GMs are online', async () => {
    vi.stubGlobal('game', {
      users: {
        contents: [],
        get: (_id: string) => undefined,
      },
      user: null,
    });

    const entry: AuditEntry = {
      tool: 'drop-concentration',
      payload: {},
      idempotencyKey: '00000000-0000-4000-8000-000000000010',
      actorId: null,
      result: { success: true, data: null },
      timestamp: Date.now(),
      bearer_id: '00000000',
    };

    // Must not throw even when no GMs are online
    await expect(writeAuditLog(entry)).resolves.toBeUndefined();
    expect(chatCreateMock).not.toHaveBeenCalled();
  });

  // ── Plan 09-01: attackId extension ─────────────────────────────────────────
  // AL-EXT-01: writeAuditLog with attackId in result.data propagates it to
  // flags.evf.audit.attackId on the ChatMessage.
  // AL-EXT-02: writeAuditLog without attackId omits the field (undefined, not null).

  it('AL-EXT-01: stores attackId in flags.evf.audit.attackId when result.data.attackId is present', async () => {
    const entry: AuditEntry = {
      tool: 'weapon-attack',
      payload: { actorId: 'actor-wep', weaponId: 'sword-1' },
      idempotencyKey: '00000000-0000-4000-8000-00000000ff01',
      actorId: 'actor-wep',
      result: {
        success: true,
        data: {
          attackId: 'aaaaaaaa-0000-4000-8000-000000000001',
          attacks: [{ roll: 18, damage: 8 }],
        },
      },
      timestamp: Date.now(),
      bearer_id: 'aa11bb22',
      attackId: 'aaaaaaaa-0000-4000-8000-000000000001',
    };
    await writeAuditLog(entry);

    const callArgs = chatCreateMock.mock.calls[0]?.[0] as { flags?: Record<string, unknown> };
    const auditInFlags = (callArgs.flags?.evf as Record<string, unknown>)?.audit as
      | AuditEntry
      | undefined;
    expect(auditInFlags).toBeDefined();
    expect(auditInFlags?.attackId).toBe('aaaaaaaa-0000-4000-8000-000000000001');
  });

  it('AL-EXT-02: attackId is undefined (not null) in flags.evf.audit when result.data has no attackId', async () => {
    const entry: AuditEntry = {
      tool: 'cast-spell',
      payload: { actorId: 'actor-mage', spellId: 'fireball' },
      idempotencyKey: '00000000-0000-4000-8000-00000000ff02',
      actorId: 'actor-mage',
      result: { success: true, data: { rolled: true } },
      timestamp: Date.now(),
      bearer_id: 'cc33dd44',
      // No attackId field — must be absent from entry
    };
    await writeAuditLog(entry);

    const callArgs = chatCreateMock.mock.calls[0]?.[0] as { flags?: Record<string, unknown> };
    const auditInFlags = (callArgs.flags?.evf as Record<string, unknown>)?.audit as
      | AuditEntry
      | undefined;
    expect(auditInFlags).toBeDefined();
    // attackId MUST NOT be present (not null, not '', just absent/undefined)
    expect(auditInFlags?.attackId).toBeUndefined();
  });
});
