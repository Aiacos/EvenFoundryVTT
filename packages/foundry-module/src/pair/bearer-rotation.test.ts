/**
 * Unit tests for bearer-rotation — scheduleBearerRotation.
 *
 * Tests use vi.useFakeTimers() to control setTimeout scheduling without
 * waiting real 24-hour intervals. generateBearer + getActiveBearer are
 * mocked to isolate the scheduler logic from bearer-registry side-effects.
 *
 * TDD discipline: tests written before implementation (RED → GREEN).
 *
 * @see packages/foundry-module/src/pair/bearer-rotation.ts
 * @see .planning/phases/07-foundry-module-write-path/07-06-PLAN.md Task 1
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Mock bearer-registry — scheduleBearerRotation imports these
vi.mock('./bearer-registry.js', () => ({
  TTL_24H_MS: 24 * 3600 * 1000,
  GRACE_60S_MS: 60 * 1000,
  NO_EXPIRY_MS: 8_640_000_000_000_000,
  getActiveBearer: vi.fn(),
  generateBearer: vi.fn(),
  listBearers: vi.fn(() => []),
  validateBearer: vi.fn(() => ({ valid: false, reason: 'unknown_token' })),
  revokeBearer: vi.fn(),
}));

// Mock audit-log — scheduleBearerRotation calls writeAuditLog after rotation
vi.mock('../write-path/audit-log.js', () => ({
  writeAuditLog: vi.fn(() => Promise.resolve()),
}));

// Stub foundry globals needed by transitively imported modules
class ApplicationStub {
  get title(): string {
    return '';
  }
}

class ApplicationV2Stub {
  render(_force?: boolean): this {
    return this;
  }
  async close(): Promise<void> {}
  async getData(): Promise<Record<string, unknown>> {
    return {};
  }
  _activateListeners(_html: HTMLElement): void {}
  static get defaultOptions() {
    return { id: '', title: '', template: '', width: 400, height: 'auto', resizable: false };
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeActiveEntry(
  overrides: Partial<{
    createdAt: number;
    expiresAt: number;
    alias: string;
    bridgeUrl: string;
    worldId: string;
    userId: string;
  }> = {},
) {
  const now = Date.now();
  return {
    token: 'test-bearer-token-abc',
    alias: overrides.alias ?? 'Test Device',
    worldId: overrides.worldId ?? 'world-abc',
    // ADR-0014: bearer bound to a Foundry User; rotation must carry it through.
    userId: overrides.userId ?? 'user-1',
    bridgeUrl: overrides.bridgeUrl ?? 'https://bridge.local:8910',
    internalSecret: 'secret-xyz',
    createdAt: overrides.createdAt ?? now,
    expiresAt: overrides.expiresAt ?? now + 24 * 3600 * 1000,
    lastSeenAt: null,
    revokedAt: null,
  };
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('scheduleBearerRotation', () => {
  let getActiveBearerMock: ReturnType<typeof vi.fn>;
  let generateBearerMock: ReturnType<typeof vi.fn>;
  let writeAuditLogMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();
    vi.clearAllMocks();

    // Stub Foundry globals before importing the module
    vi.stubGlobal('Application', ApplicationStub);
    vi.stubGlobal('foundry', {
      applications: {
        api: {
          ApplicationV2: ApplicationV2Stub,
          HandlebarsApplicationMixin: (Base: unknown) => Base,
        },
      },
    });
    vi.stubGlobal('game', {
      settings: {
        get: vi.fn(() => undefined),
        set: vi.fn(),
        register: vi.fn(),
        registerMenu: vi.fn(),
      },
    });
    vi.stubGlobal('Hooks', { once: vi.fn(), on: vi.fn() });

    // Stub crypto.randomUUID for audit log idempotencyKey
    vi.stubGlobal('crypto', {
      randomUUID: vi.fn(() => '00000000-0000-4000-8000-000000000001'),
      getRandomValues: vi.fn((arr: Uint8Array) => {
        for (let i = 0; i < arr.length; i++) arr[i] = (i * 37) % 256;
        return arr;
      }),
    });

    // Import mocks via vi.mocked after resetModules
    const registryMod = await import('./bearer-registry.js');
    getActiveBearerMock = vi.mocked(registryMod.getActiveBearer);
    generateBearerMock = vi.mocked(registryMod.generateBearer);

    const auditMod = await import('../write-path/audit-log.js');
    writeAuditLogMock = vi.mocked(auditMod.writeAuditLog);

    generateBearerMock.mockResolvedValue(makeActiveEntry());
    writeAuditLogMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ── T-RR-01: no active bearer → returns no-op cancel ─────────────────────

  it('T-RR-01: returns a no-op cancel function when no active bearer exists', async () => {
    getActiveBearerMock.mockReturnValue(null);
    const { scheduleBearerRotation } = await import('./bearer-rotation.js');

    const emitSpy = vi.fn();
    const cancel = scheduleBearerRotation({ emit: emitSpy });

    // No timer should be scheduled — advance time and verify no emit
    await vi.advanceTimersByTimeAsync(25 * 3600 * 1000);
    expect(emitSpy).not.toHaveBeenCalled();

    // cancel() must not throw
    expect(() => cancel()).not.toThrow();
  });

  // ── T-RR-02: setTimeout scheduled at TTL_24H_MS - elapsed ────────────────

  it('T-RR-02: schedules setTimeout at TTL_24H_MS minus elapsed time', async () => {
    const now = Date.now();
    const elapsed = 2 * 3600 * 1000; // 2h elapsed
    const active = makeActiveEntry({ createdAt: now - elapsed });

    // Only first call needed to check initial scheduling; cancel immediately
    getActiveBearerMock.mockReturnValue(active);

    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

    const { scheduleBearerRotation } = await import('./bearer-rotation.js');
    const emitSpy = vi.fn();
    scheduleBearerRotation({ emit: emitSpy });

    // Should have scheduled at (24h - 2h) = 22h remaining
    const expectedDelay = 24 * 3600 * 1000 - elapsed;
    expect(setTimeoutSpy).toHaveBeenCalledWith(
      expect.any(Function),
      expect.closeTo(expectedDelay, -3), // within 1000ms tolerance
    );
  });

  // ── T-RR-02b: campaign-long (NO_EXPIRY) bearer never rotates ─────────────

  it('T-RR-02b: does NOT schedule rotation for a non-expiring (campaign-long) bearer', async () => {
    // A token minted with NO_EXPIRY_MS must stay valid forever — rotating it would
    // change the bearer the player already pasted. The chain must terminate.
    const active = makeActiveEntry({ expiresAt: 8_640_000_000_000_000 });
    getActiveBearerMock.mockReturnValue(active);

    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    const { scheduleBearerRotation } = await import('./bearer-rotation.js');
    const emitSpy = vi.fn();
    scheduleBearerRotation({ emit: emitSpy });

    // No rotation timer armed, and advancing well past 24h triggers no rotation.
    expect(setTimeoutSpy).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(48 * 3600 * 1000);
    expect(generateBearerMock).not.toHaveBeenCalled();
    expect(emitSpy).not.toHaveBeenCalled();
  });

  // ── T-RR-03: elapsed > TTL → delay clamped to 0 ──────────────────────────

  it('T-RR-03: clamps delay to 0 when elapsed > TTL_24H_MS (tab suspension case)', async () => {
    const now = Date.now();
    const active = makeActiveEntry({ createdAt: now - 25 * 3600 * 1000 }); // 25h ago

    getActiveBearerMock.mockReturnValue(active);

    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

    const { scheduleBearerRotation } = await import('./bearer-rotation.js');
    scheduleBearerRotation({ emit: vi.fn() });

    // delay should be Math.max(0, ...) = 0
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 0);
  });

  // ── T-RR-04: timer fires → generateBearer(refresh=true) called ───────────

  it('T-RR-04: calls generateBearer(alias, bridgeUrl, worldId, userId, true) when timer fires', async () => {
    const now = Date.now();
    const active = makeActiveEntry({ createdAt: now, userId: 'user-aiacos' });
    // Return active for initial schedule + rotation read, then null to stop chain
    getActiveBearerMock
      .mockReturnValueOnce(active) // scheduleNext() at boot
      .mockReturnValueOnce(active) // rotateNow reads active entry
      .mockReturnValue(null); // scheduleNext() in finally → stops chain

    const { scheduleBearerRotation } = await import('./bearer-rotation.js');
    scheduleBearerRotation({ emit: vi.fn() });

    // Advance to just past the 24h mark
    await vi.advanceTimersByTimeAsync(24 * 3600 * 1000 + 10);

    // ADR-0014: rotation carries the bound userId through (4th positional arg).
    expect(generateBearerMock).toHaveBeenCalledWith(
      active.alias,
      active.bridgeUrl,
      active.worldId,
      'user-aiacos',
      true,
    );
  });

  // ── T-RR-05: emit called with rotatedAt + graceUntil ─────────────────────

  it('T-RR-05: calls emit with { rotatedAt, graceUntil } after rotation', async () => {
    const now = Date.now();
    const active = makeActiveEntry({ createdAt: now });
    // Return active for initial schedule + rotation read, then null to stop chain
    getActiveBearerMock
      .mockReturnValueOnce(active) // scheduleNext() at boot
      .mockReturnValueOnce(active) // rotateNow reads active entry
      .mockReturnValue(null); // scheduleNext() in finally → stops chain

    const emitSpy = vi.fn();
    const { scheduleBearerRotation } = await import('./bearer-rotation.js');
    scheduleBearerRotation({ emit: emitSpy });

    await vi.advanceTimersByTimeAsync(24 * 3600 * 1000 + 10);

    expect(emitSpy).toHaveBeenCalledOnce();
    const [payload] = emitSpy.mock.calls[0] as [{ rotatedAt: number; graceUntil: number }];
    expect(typeof payload.rotatedAt).toBe('number');
    expect(typeof payload.graceUntil).toBe('number');
    // graceUntil should be ~60s after rotatedAt
    expect(payload.graceUntil - payload.rotatedAt).toBeCloseTo(60_000, -3);
  });

  // ── T-RR-06: writeAuditLog called with tool: 'bearer.rotation' ───────────

  it('T-RR-06: calls writeAuditLog with tool: "bearer.rotation" after rotation', async () => {
    const now = Date.now();
    const active = makeActiveEntry({ createdAt: now });
    // Return active for initial schedule + rotation read, then null to stop chain
    getActiveBearerMock
      .mockReturnValueOnce(active) // scheduleNext() at boot
      .mockReturnValueOnce(active) // rotateNow reads active entry
      .mockReturnValue(null); // scheduleNext() in finally → stops chain

    const { scheduleBearerRotation } = await import('./bearer-rotation.js');
    scheduleBearerRotation({ emit: vi.fn() });

    await vi.advanceTimersByTimeAsync(24 * 3600 * 1000 + 10);

    expect(writeAuditLogMock).toHaveBeenCalledOnce();
    const [entry] = writeAuditLogMock.mock.calls[0] as [{ tool: string }];
    expect(entry.tool).toBe('bearer.rotation');
  });

  // ── T-RR-07: recursive chain — second rotation scheduled after first ──────

  it('T-RR-07: chains next rotation — second setTimeout scheduled after first fires', async () => {
    const now = Date.now();
    const active = makeActiveEntry({ createdAt: now });

    // After rotation, getActiveBearer returns a fresh entry (new token, createdAt = now)
    const freshEntry = makeActiveEntry({ createdAt: now + 24 * 3600 * 1000 });
    getActiveBearerMock
      .mockReturnValueOnce(active) // initial schedule
      .mockReturnValueOnce(active) // first rotation reads active entry
      .mockReturnValueOnce(freshEntry); // chain schedule reads fresh entry

    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    const emitSpy = vi.fn();

    const { scheduleBearerRotation } = await import('./bearer-rotation.js');
    scheduleBearerRotation({ emit: emitSpy });

    // First setTimeout call at boot
    const firstCallCount = setTimeoutSpy.mock.calls.length;
    expect(firstCallCount).toBeGreaterThanOrEqual(1);

    // Advance to trigger first rotation
    await vi.advanceTimersByTimeAsync(24 * 3600 * 1000 + 10);
    expect(emitSpy).toHaveBeenCalledOnce();

    // After rotation fires, a new setTimeout should be scheduled (chain)
    expect(setTimeoutSpy.mock.calls.length).toBeGreaterThan(firstCallCount);
  });

  // ── T-RR-08: cancel() prevents next rotation ─────────────────────────────

  it('T-RR-08: cancel() prevents next rotation from firing', async () => {
    const now = Date.now();
    const active = makeActiveEntry({ createdAt: now });
    getActiveBearerMock.mockReturnValue(active);

    const emitSpy = vi.fn();
    const { scheduleBearerRotation } = await import('./bearer-rotation.js');
    const cancel = scheduleBearerRotation({ emit: emitSpy });

    // Cancel before the timer fires
    cancel();

    // Advance past 24h — rotation should NOT fire
    await vi.advanceTimersByTimeAsync(25 * 3600 * 1000);
    expect(emitSpy).not.toHaveBeenCalled();
  });

  // ── T-RR-09: cancel() idempotent — calling twice does not throw ───────────

  it('T-RR-09: cancel() is idempotent — calling twice does not throw', async () => {
    const now = Date.now();
    const active = makeActiveEntry({ createdAt: now });
    getActiveBearerMock.mockReturnValue(active);

    const { scheduleBearerRotation } = await import('./bearer-rotation.js');
    const cancel = scheduleBearerRotation({ emit: vi.fn() });

    expect(() => {
      cancel();
      cancel(); // second call must be safe
    }).not.toThrow();
  });

  // ── T-RR-10: rotate failure is caught + logged, chain still continues ─────

  it('T-RR-10: rotation failure is logged via console.warn; chain continues', async () => {
    const now = Date.now();
    const active = makeActiveEntry({ createdAt: now });

    // Set up mock to stop the chain after the first failed rotation attempt
    getActiveBearerMock
      .mockReturnValueOnce(active) // initial scheduleNext() at boot
      .mockReturnValueOnce(active) // rotateNow reads active entry (throws)
      .mockReturnValue(null); // scheduleNext() in finally → stops chain

    // generateBearer throws on first call
    generateBearerMock.mockRejectedValueOnce(new Error('Bearer generation failed'));

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const emitSpy = vi.fn();

    const { scheduleBearerRotation } = await import('./bearer-rotation.js');
    scheduleBearerRotation({ emit: emitSpy });

    await vi.advanceTimersByTimeAsync(24 * 3600 * 1000 + 10);

    // Emit should NOT be called (rotation failed)
    expect(emitSpy).not.toHaveBeenCalled();

    // console.warn should be called with the error
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('bearer-rotation'),
      expect.any(Error),
    );

    warnSpy.mockRestore();
  });
});
