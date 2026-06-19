/**
 * Unit tests for {@link ToolInvocationQueue} — Phase 8 write channel.
 *
 * Covers the enqueue→drain→resolve round-trip, the timeout path, the idempotent
 * resolve (unknown / duplicate request id), and the drain-once semantics.
 *
 * @see packages/bridge/src/ws/tool-invocation-queue.ts
 */

import type { ToolInvocationEnvelopePayload } from '@evf/shared-protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TOOL_INVOKE_TIMEOUT_MS, ToolInvocationQueue } from './tool-invocation-queue.js';

const PAYLOAD: ToolInvocationEnvelopePayload = {
  toolId: 'skill-check',
  idempotencyKey: '00000000-0000-4000-8000-000000000001',
  args: { actor_id: 'actor1', skill: 'prc', advantage: 'normal' },
};

describe('ToolInvocationQueue', () => {
  let queue: ToolInvocationQueue;

  beforeEach(() => {
    queue = new ToolInvocationQueue();
  });

  it('enqueue→drain→resolve round-trip settles the awaiting Promise with the result', async () => {
    const pending = queue.enqueue(PAYLOAD, 'bearer-xyz');

    const drained = queue.drainPending();
    expect(drained).toHaveLength(1);
    expect(drained[0]?.payload).toEqual(PAYLOAD);
    expect(drained[0]?.bearer).toBe('bearer-xyz');
    const requestId = drained[0]?.requestId ?? '';
    expect(requestId).not.toBe('');

    const settled = queue.resolveResult(requestId, { success: true, data: { rolled: true } });
    expect(settled).toBe(true);

    await expect(pending).resolves.toEqual({ success: true, data: { rolled: true } });
  });

  it('drainPending removes pending so a second drain returns empty (dispatch-once)', () => {
    queue.enqueue(PAYLOAD, 'bearer-1');
    expect(queue.drainPending()).toHaveLength(1);
    expect(queue.drainPending()).toHaveLength(0);
  });

  it("drainPending(userId) drains ONLY that user's requests; others stay pending", () => {
    // ADR-0011 Amendment: each user's poll drains only its own bound-user invocations.
    queue.enqueue(PAYLOAD, 'bearer-lorenzo', 'user-lorenzo');
    queue.enqueue(PAYLOAD, 'bearer-bea', 'user-bea');
    queue.enqueue(PAYLOAD, 'bearer-sentinel', null); // unknown bearer → null user

    const lorenzo = queue.drainPending('user-lorenzo');
    expect(lorenzo).toHaveLength(1);
    expect(lorenzo[0]?.bearer).toBe('bearer-lorenzo');

    // Bea's + the null-user request are untouched by Lorenzo's poll.
    expect(queue.drainPending('user-bea')).toHaveLength(1);
    // The unfiltered (GM-fallback) drain still picks up the remaining null-user request.
    const rest = queue.drainPending();
    expect(rest).toHaveLength(1);
    expect(rest[0]?.bearer).toBe('bearer-sentinel');
  });

  it('resolveResult returns false for an unknown / already-settled request id', () => {
    expect(queue.resolveResult('does-not-exist', { success: true, data: null })).toBe(false);

    const p = queue.enqueue(PAYLOAD, 'bearer-1');
    const { requestId } = queue.drainPending()[0] ?? { requestId: '' };
    expect(queue.resolveResult(requestId, { success: true, data: 1 })).toBe(true);
    // Second resolve (e.g. a late duplicate POST) is a no-op.
    expect(queue.resolveResult(requestId, { success: true, data: 2 })).toBe(false);
    return expect(p).resolves.toEqual({ success: true, data: 1 });
  });

  describe('timeout path (fake timers)', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('resolves to foundry_timeout when no result arrives within the window', async () => {
      const pending = queue.enqueue(PAYLOAD, 'bearer-1');
      vi.advanceTimersByTime(TOOL_INVOKE_TIMEOUT_MS);
      await expect(pending).resolves.toEqual({ success: false, error: 'foundry_timeout' });
      // After timeout the request id is gone — a late POST cannot settle it.
      const drained = queue.drainPending();
      expect(drained).toHaveLength(0);
    });

    it('does not time out once a result has already settled it', async () => {
      const pending = queue.enqueue(PAYLOAD, 'bearer-1');
      const { requestId } = queue.drainPending()[0] ?? { requestId: '' };
      queue.resolveResult(requestId, { success: true, data: 'ok' });
      // Advancing past the timeout must NOT overwrite the resolved value.
      vi.advanceTimersByTime(TOOL_INVOKE_TIMEOUT_MS * 2);
      await expect(pending).resolves.toEqual({ success: true, data: 'ok' });
    });
  });
});
