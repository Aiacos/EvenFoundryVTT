/**
 * Unit tests for the Phase 8 tool-invocation poller.
 *
 * Tests cover:
 * - A logged-in user polls for ITS OWN requests (`?userId=`), dispatches via
 *   dispatchToolAuthorized → POSTs the result back (ADR-0011 Amendment — player executes).
 * - No current user → does nothing (no fetch).
 * - Deny path: dispatchToolAuthorized returns not_authorized → that result is POSTed.
 * - A drain fetch error is swallowed (no throw out of the tick).
 *
 * Strategy: drive a single poll tick deterministically by registering the poller with
 * a long interval and invoking the timer callback once (vi fake timers), with fetch +
 * dispatchToolAuthorized mocked.
 *
 * @see packages/foundry-module/src/write-path/tool-invocation-poller.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// dispatchToolAuthorized is mocked so the test exercises the poll/POST plumbing only
// (the authz behaviour itself is covered by dispatch-authorized.test.ts).
const dispatchToolAuthorized = vi.fn();
vi.mock('./dispatch-authorized.js', () => ({
  dispatchToolAuthorized: (...args: unknown[]) => dispatchToolAuthorized(...args),
}));

const OPTS = {
  getBridgeUrl: () => 'https://bridge.example',
  getInternalSecret: () => 'secret-32-bytes-padding!!!!!!!!!',
  pollIntervalMs: 1_000,
};

const DRAINED = {
  requestId: 'req-1',
  payload: {
    toolId: 'skill-check',
    idempotencyKey: '00000000-0000-4000-8000-000000000001',
    args: { actor_id: 'actor-a', skill: 'prc', advantage: 'normal' },
  },
  bearer: 'bearer-xyz',
};

function setUser(id: string | undefined, isGM = false): void {
  vi.stubGlobal('game', { user: id === undefined ? undefined : { id, isGM } });
}

/** Run exactly one poll tick: register, fire the interval once, drain microtasks. */
async function runOneTick(): Promise<void> {
  const { registerToolInvocationPoller } = await import('./tool-invocation-poller.js');
  const teardown = registerToolInvocationPoller(OPTS);
  await vi.advanceTimersByTimeAsync(OPTS.pollIntervalMs);
  // Let dispatch + result-POST promises settle.
  await vi.runOnlyPendingTimersAsync();
  teardown();
}

describe('registerToolInvocationPoller', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    dispatchToolAuthorized.mockReset();
    vi.useFakeTimers();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    // AbortSignal.timeout is used by the poller; provide a stub under fake timers.
    vi.stubGlobal('AbortSignal', { timeout: () => undefined });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("drains the current user's requests (?userId=), dispatches, and POSTs the result back", async () => {
    setUser('user-a');
    dispatchToolAuthorized.mockResolvedValue({ success: true, data: { rolled: true } });
    fetchMock
      // GET /internal/tool-requests?userId=user-a
      .mockResolvedValueOnce({ ok: true, json: async () => ({ requests: [DRAINED] }) })
      // POST /internal/tool-result
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });

    await runOneTick();

    // GET is scoped to the current user (ADR-0011 Amendment — owning-user execution).
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/internal/tool-requests?userId=user-a');

    expect(dispatchToolAuthorized).toHaveBeenCalledWith('skill-check', {
      args: DRAINED.payload.args,
      idempotencyKey: DRAINED.payload.idempotencyKey,
      bearer: 'bearer-xyz',
    });

    // Second fetch is the result POST carrying the dispatch result.
    const postCall = fetchMock.mock.calls[1];
    expect(String(postCall?.[0])).toContain('/internal/tool-result');
    const body = JSON.parse((postCall?.[1] as { body: string }).body);
    expect(body).toEqual({ requestId: 'req-1', result: { success: true, data: { rolled: true } } });
  });

  it('tags the drain GET with the module-version beacon (&mv=) when a version resolver is given', async () => {
    setUser('user-a');
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ requests: [] }) });

    const { registerToolInvocationPoller } = await import('./tool-invocation-poller.js');
    const teardown = registerToolInvocationPoller({ ...OPTS, getModuleVersion: () => '0.1.52' });
    await vi.advanceTimersByTimeAsync(OPTS.pollIntervalMs);
    await vi.runOnlyPendingTimersAsync();
    teardown();

    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toContain('/internal/tool-requests?');
    expect(url).toContain('userId=user-a');
    expect(url).toContain('mv=0.1.52');
  });

  it('omits the mv beacon when no version resolver is given (back-compat URL)', async () => {
    setUser('user-a');
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ requests: [] }) });

    await runOneTick(); // OPTS has no getModuleVersion

    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toBe('https://bridge.example/internal/tool-requests?userId=user-a');
    expect(url).not.toContain('mv=');
  });

  it('GM also drains the UNFILTERED slice as a fallback for unrouted requests', async () => {
    // A GM polls its own slice (?userId=) AND the unfiltered slice (no userId) so a
    // request the bridge could not route (boundUserId === null) still executes. The
    // per-actor authz inside dispatchToolAuthorized keeps this ADR-0014-safe.
    setUser('gm-user', true);
    dispatchToolAuthorized.mockResolvedValue({ success: true, data: { rolled: true } });
    fetchMock
      // 1. GET scoped (?userId=gm-user) — empty for the GM's own bound requests.
      .mockResolvedValueOnce({ ok: true, json: async () => ({ requests: [] }) })
      // 2. GET unfiltered (no userId) — picks up the unrouted null-bound request.
      .mockResolvedValueOnce({ ok: true, json: async () => ({ requests: [DRAINED] }) })
      // 3. POST /internal/tool-result for the dispatched request.
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });

    await runOneTick();

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      '/internal/tool-requests?userId=gm-user',
    );
    // The second drain is the unfiltered slice — NO userId query param.
    const secondUrl = String(fetchMock.mock.calls[1]?.[0]);
    expect(secondUrl).toContain('/internal/tool-requests');
    expect(secondUrl).not.toContain('userId=');
    expect(dispatchToolAuthorized).toHaveBeenCalledTimes(1);
    const postCall = fetchMock.mock.calls[2];
    expect(String(postCall?.[0])).toContain('/internal/tool-result');
  });

  it('a non-GM player does NOT drain the unfiltered slice (owner-scoped only)', async () => {
    setUser('player-a', false);
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ requests: [] }) });

    await runOneTick();

    // Every drain GET is owner-scoped (?userId=player-a); a player never issues the
    // unfiltered (no-userId) GM-fallback drain.
    expect(fetchMock).toHaveBeenCalled();
    for (const call of fetchMock.mock.calls) {
      expect(String(call[0])).toContain('?userId=player-a');
    }
  });

  it('no current user: does nothing (no fetch, no dispatch)', async () => {
    setUser(undefined);
    await runOneTick();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(dispatchToolAuthorized).not.toHaveBeenCalled();
  });

  it('deny path: POSTs the not_authorized result from dispatchToolAuthorized', async () => {
    setUser('user-a');
    dispatchToolAuthorized.mockResolvedValue({ success: false, error: 'not_authorized' });
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ requests: [DRAINED] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });

    await runOneTick();

    const postCall = fetchMock.mock.calls[1];
    const body = JSON.parse((postCall?.[1] as { body: string }).body);
    expect(body.result).toEqual({ success: false, error: 'not_authorized' });
  });

  it('swallows a drain fetch error (no throw out of the tick)', async () => {
    setUser('user-a');
    fetchMock.mockRejectedValueOnce(new Error('network down'));
    await expect(runOneTick()).resolves.toBeUndefined();
    expect(dispatchToolAuthorized).not.toHaveBeenCalled();
  });
});
