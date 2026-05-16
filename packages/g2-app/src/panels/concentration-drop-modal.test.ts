/**
 * Plan 07-05 extension tests for ConcentrationDropModalPanel (CONC-01 write closure).
 *
 * Tests the dual-emit behavior added in Plan 07-05:
 *   1. tap → emits tool.invoke envelope FIRST (drop-concentration) + THEN legacy conc.drop.confirmed
 *   2. When payload.actorId is undefined/empty, only the legacy conc.drop.confirmed is emitted
 *   3. idempotencyKey is a fresh uuid per tap (different UUIDs across taps)
 *   4. Both envelopes share the same sessionId
 *   5. Phase 4b legacy envelope still emitted (backward-compat regression guard)
 *
 * Phase 4b original tests (CDM-1..CDM-13) stay green — they run from
 * packages/g2-app/src/panels/__tests__/concentration-drop-modal.test.ts.
 * This file is ADDITIVE (Plan 07-05 new assertions only).
 *
 * @see packages/g2-app/src/panels/concentration-drop-modal.ts (extended tap path)
 * @see packages/g2-app/src/panels/__tests__/concentration-drop-modal.test.ts (Phase 4b tests)
 * @see .planning/phases/07-foundry-module-write-path/07-05-PLAN.md Task 2
 */
import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';
import {
  CONC_DROP_CONFIRMED_TYPE,
  type ConcConflictPayload,
  EnvelopeSchema,
  ToolInvocationEnvelopePayloadSchema,
} from '@evf/shared-protocol';
import { describe, expect, it, vi, type MockInstance } from 'vitest';
import type { Toast } from '../status-hud/toast-types.js';
import { PanelGestureBus } from '../engine/panel-gesture-bus.js';
import {
  ConcentrationDropModalPanel,
  type ConcModalWebSocket,
} from './concentration-drop-modal.js';

// Plan 09-03: mock conc-retry-cache for CDM-RETRY tests.
vi.mock('./conc-retry-cache.js', () => ({
  cacheRetryEnvelope: vi.fn(),
  markRetryConfirmed: vi.fn(),
  consumeRetryEnvelope: vi.fn(() => null),
  consumeLatestConfirmed: vi.fn(() => null),
  clearRetryCache: vi.fn(),
}));
import { consumeLatestConfirmed } from './conc-retry-cache.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const VALID_SESSION_UUID = '22222222-2222-4222-8222-222222222222';

function makeMockBridge() {
  return {
    textContainerUpgrade: vi.fn().mockResolvedValue(true),
  } as unknown as EvenAppBridge & { textContainerUpgrade: ReturnType<typeof vi.fn> };
}

type MockModalWs = ConcModalWebSocket & {
  send: ReturnType<typeof vi.fn> & ((data: string) => void);
};

function makeMockWs(): MockModalWs {
  return { send: vi.fn() as MockModalWs['send'] };
}

function makeConflictWithActorId(actorId?: string): ConcConflictPayload & { actorId?: string } {
  return {
    effectId: 'eff-hold-person-1',
    currentConcentrationName: 'Hold Person',
    newSpellName: 'Bless',
    ...(actorId !== undefined ? { actorId } : {}),
  };
}

type MockToastQueue = { enqueue: MockInstance & ((toast: Toast) => void) };

function makeModal(
  opts: {
    conflict?: ConcConflictPayload & { actorId?: string };
    sessionId?: string;
    ws?: MockModalWs;
    toastQueue?: MockToastQueue;
  } = {},
) {
  const bridge = makeMockBridge();
  const ws = opts.ws ?? makeMockWs();
  const bus = new PanelGestureBus();
  const onClose = vi.fn();
  const modal = new ConcentrationDropModalPanel(
    bridge,
    ws,
    bus,
    opts.conflict ?? makeConflictWithActorId('actor-player-1'),
    'it',
    opts.sessionId ?? VALID_SESSION_UUID,
    onClose,
    opts.toastQueue,
  );
  return { modal, bridge, ws, bus, onClose };
}

function makeToastQueue(): MockToastQueue {
  return { enqueue: vi.fn() as unknown as MockInstance & ((toast: Toast) => void) };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ConcentrationDropModalPanel — Plan 07-05 dual-emit (CONC-01 write closure)', () => {
  it('07-05-CDM-01: tap emits TWO ws.send calls (tool.invoke + legacy conc.drop.confirmed)', async () => {
    const ws = makeMockWs();
    const { modal } = makeModal({ ws, conflict: makeConflictWithActorId('actor-1') });
    await modal.onMount();

    modal.onEvent({ kind: 'tap' });

    expect(ws.send).toHaveBeenCalledTimes(2);
  });

  it('07-05-CDM-02: first send is a tool.invoke envelope with toolId="drop-concentration"', async () => {
    const ws = makeMockWs();
    const { modal } = makeModal({ ws, conflict: makeConflictWithActorId('actor-1') });
    await modal.onMount();

    modal.onEvent({ kind: 'tap' });

    const firstCall = ws.send.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(firstCall) as unknown;

    const envResult = EnvelopeSchema.safeParse(parsed);
    expect(envResult.success).toBe(true);
    if (!envResult.success) return;

    expect(envResult.data.type).toBe('tool.invoke');
    const payloadResult = ToolInvocationEnvelopePayloadSchema.safeParse(envResult.data.payload);
    expect(payloadResult.success).toBe(true);
    if (!payloadResult.success) return;

    expect(payloadResult.data.toolId).toBe('drop-concentration');
  });

  it('07-05-CDM-03: tool.invoke args contains effect_id matching conflict.effectId', async () => {
    const ws = makeMockWs();
    const conflict = makeConflictWithActorId('actor-player-1');
    const { modal } = makeModal({ ws, conflict });
    await modal.onMount();

    modal.onEvent({ kind: 'tap' });

    const firstCall = ws.send.mock.calls[0]?.[0] as string;
    const envelope = JSON.parse(firstCall) as unknown;
    const envResult = EnvelopeSchema.safeParse(envelope);
    expect(envResult.success).toBe(true);
    if (!envResult.success) return;
    const payloadResult = ToolInvocationEnvelopePayloadSchema.safeParse(envResult.data.payload);
    expect(payloadResult.success).toBe(true);
    if (!payloadResult.success) return;

    const args = payloadResult.data.args as Record<string, unknown>;
    expect(args.effect_id).toBe('eff-hold-person-1');
    expect(args.actor_id).toBe('actor-player-1');
  });

  it('07-05-CDM-04: second send is the legacy conc.drop.confirmed envelope (W-4 regression guard)', async () => {
    const ws = makeMockWs();
    const { modal } = makeModal({ ws, conflict: makeConflictWithActorId('actor-1') });
    await modal.onMount();

    modal.onEvent({ kind: 'tap' });

    const secondCall = ws.send.mock.calls[1]?.[0] as string;
    const parsed = JSON.parse(secondCall) as unknown;

    const envResult = EnvelopeSchema.safeParse(parsed);
    expect(envResult.success).toBe(true);
    if (!envResult.success) return;
    expect(envResult.data.type).toBe(CONC_DROP_CONFIRMED_TYPE);
  });

  it('07-05-CDM-05: both envelopes share the same sessionId', async () => {
    const ws = makeMockWs();
    const SESSION_ID = VALID_SESSION_UUID;
    const { modal } = makeModal({
      ws,
      sessionId: SESSION_ID,
      conflict: makeConflictWithActorId('actor-1'),
    });
    await modal.onMount();

    modal.onEvent({ kind: 'tap' });

    const env1 = EnvelopeSchema.safeParse(JSON.parse(ws.send.mock.calls[0]?.[0] as string));
    const env2 = EnvelopeSchema.safeParse(JSON.parse(ws.send.mock.calls[1]?.[0] as string));
    expect(env1.success).toBe(true);
    expect(env2.success).toBe(true);
    if (env1.success && env2.success) {
      expect(env1.data.session_id).toBe(SESSION_ID);
      expect(env2.data.session_id).toBe(SESSION_ID);
    }
  });

  it('07-05-CDM-06: idempotencyKey is a fresh UUID per tap (unique across calls)', async () => {
    const ws = makeMockWs();
    const { modal } = makeModal({ ws, conflict: makeConflictWithActorId('actor-1') });
    await modal.onMount();

    // First tap
    modal.onEvent({ kind: 'tap' });
    const env1 = ToolInvocationEnvelopePayloadSchema.safeParse(
      (
        EnvelopeSchema.parse(JSON.parse(ws.send.mock.calls[0]?.[0] as string)) as {
          payload: unknown;
        }
      ).payload,
    );

    // Second tap (reset and re-mount)
    ws.send.mockClear();
    await modal.onMount(); // re-subscribe after onUnmount implied by first close
    modal.onEvent({ kind: 'tap' });
    const env2 = ToolInvocationEnvelopePayloadSchema.safeParse(
      (
        EnvelopeSchema.parse(JSON.parse(ws.send.mock.calls[0]?.[0] as string)) as {
          payload: unknown;
        }
      ).payload,
    );

    if (env1.success && env2.success) {
      expect(env1.data.idempotencyKey).not.toBe(env2.data.idempotencyKey);
    }
  });

  it('07-05-CDM-07: when actorId is undefined, only legacy conc.drop.confirmed is emitted (graceful fallback)', async () => {
    const ws = makeMockWs();
    // No actorId on the conflict payload
    const conflict = makeConflictWithActorId(undefined);
    const { modal } = makeModal({ ws, conflict });
    await modal.onMount();

    modal.onEvent({ kind: 'tap' });

    // Should emit only 1 envelope (legacy conc.drop.confirmed)
    expect(ws.send).toHaveBeenCalledTimes(1);
    const call = ws.send.mock.calls[0]?.[0] as string;
    const parsed = EnvelopeSchema.safeParse(JSON.parse(call));
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.type).toBe(CONC_DROP_CONFIRMED_TYPE);
    }
  });

  it('07-05-CDM-08: double-tap still only closes without emitting (Phase 4b CDM-11 regression)', async () => {
    const ws = makeMockWs();
    const onClose = vi.fn();
    const bus = new PanelGestureBus();
    const modal = new ConcentrationDropModalPanel(
      makeMockBridge(),
      ws,
      bus,
      makeConflictWithActorId('actor-1'),
      'it',
      VALID_SESSION_UUID,
      onClose,
    );
    await modal.onMount();

    modal.onEvent({ kind: 'double-tap' });

    expect(ws.send).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

// ─── Plan 09-03 tests: retry cache + cancel toast ─────────────────────────────

describe('ConcentrationDropModalPanel — Plan 09-03 (CDM-RETRY + CDM-CANCEL)', () => {
  /**
   * CDM-RETRY-01: [Y] tap calls consumeLatestConfirmed AND, when a buffered envelope
   * is returned, fires ws.send ONCE more AFTER the existing dual-emit.
   */
  it('CDM-RETRY-01: [Y] tap — consumeLatestConfirmed called; re-fire ws.send if envelope buffered', async () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'test-uuid-cdm-retry-01' });
    const retryEnvelope = { type: 'tool.invoke', payload: { toolId: 'cast-spell', idempotencyKey: 'original-cast' } };
    vi.mocked(consumeLatestConfirmed).mockReturnValueOnce(retryEnvelope);

    const ws = makeMockWs();
    const { modal } = makeModal({ ws, conflict: makeConflictWithActorId('actor-1') });
    await modal.onMount();

    modal.onEvent({ kind: 'tap' });

    // consumeLatestConfirmed must be called
    expect(consumeLatestConfirmed).toHaveBeenCalled();

    // ws.send should have been called 3 times:
    // 1. tool.invoke (drop-concentration)
    // 2. legacy conc.drop.confirmed
    // 3. retry envelope
    expect(ws.send).toHaveBeenCalledTimes(3);

    // The third send is the retry envelope
    const thirdCall = ws.send.mock.calls[2]?.[0] as string;
    const thirdParsed = JSON.parse(thirdCall) as unknown;
    expect(thirdParsed).toEqual(retryEnvelope);

    vi.unstubAllGlobals();
    await modal.onUnmount();
  });

  /**
   * CDM-RETRY-02: [N] double-tap does NOT consume the retry cache.
   */
  it('CDM-RETRY-02: [N] double-tap does NOT call consumeLatestConfirmed', async () => {
    vi.mocked(consumeLatestConfirmed).mockClear();
    const { modal } = makeModal();
    await modal.onMount();

    modal.onEvent({ kind: 'double-tap' });

    expect(consumeLatestConfirmed).not.toHaveBeenCalled();
    await modal.onUnmount();
  });

  /**
   * CDM-RETRY-03: [Y] tap order — dual-emit fires FIRST, then retry envelope.
   */
  it('CDM-RETRY-03: [Y] tap — dual-emit fires BEFORE retry envelope (T-09-03 ordering)', async () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'test-uuid-cdm-retry-03' });
    const retryEnvelope = { type: 'tool.invoke', payload: { toolId: 'cast-spell', idempotencyKey: 'cast-retry' } };
    vi.mocked(consumeLatestConfirmed).mockReturnValueOnce(retryEnvelope);

    const sendOrder: string[] = [];
    const ws = {
      send: vi.fn((data: string) => {
        const parsed = JSON.parse(data) as { type?: string; payload?: { toolId?: string } };
        sendOrder.push(parsed.type ?? parsed.payload?.toolId ?? 'unknown');
      }),
    } as ConcModalWebSocket & { send: ReturnType<typeof vi.fn> };

    const { modal } = makeModal({ ws, conflict: makeConflictWithActorId('actor-1') });
    await modal.onMount();

    modal.onEvent({ kind: 'tap' });

    // Dual-emit must come first (drop-concentration tool.invoke + legacy conc.drop.confirmed)
    // then the retry envelope last
    expect(sendOrder[0]).toBe('tool.invoke');         // drop-concentration
    expect(sendOrder[1]).toBe('conc.drop.confirmed'); // legacy
    expect(sendOrder[2]).toBe('tool.invoke');          // retry cast-spell envelope

    vi.unstubAllGlobals();
    await modal.onUnmount();
  });

  /**
   * CDM-CANCEL-01: [N] double-tap enqueues 'error.action.concentration-cancelled' toast.
   */
  it('CDM-CANCEL-01: [N] double-tap enqueues concentration-cancelled error toast', async () => {
    const toastQueue = makeToastQueue();
    const { modal } = makeModal({ toastQueue });
    await modal.onMount();

    modal.onEvent({ kind: 'double-tap' });

    expect(toastQueue.enqueue).toHaveBeenCalledOnce();
    const toast = toastQueue.enqueue.mock.calls[0]?.[0] as { severity: string; message: string; id: string };
    expect(toast.severity).toBe('error');
    // IT locale: 'Cast annullato (conc.)'
    expect(toast.message).toContain('Cast annullato');
    expect(toast.id).toContain('conc-cancelled');
    await modal.onUnmount();
  });

  /**
   * CDM-CANCEL-02: [N] double-tap does NOT call consumeLatestConfirmed (cache not consumed).
   */
  it('CDM-CANCEL-02: [N] double-tap does NOT consume the retry cache', async () => {
    vi.mocked(consumeLatestConfirmed).mockClear();
    const toastQueue = makeToastQueue();
    const { modal } = makeModal({ toastQueue });
    await modal.onMount();

    modal.onEvent({ kind: 'double-tap' });

    expect(consumeLatestConfirmed).not.toHaveBeenCalled();
    await modal.onUnmount();
  });

  /**
   * CDM-CANCEL-03: [N] double-tap without toastQueue → no crash (toastQueue is optional).
   */
  it('CDM-CANCEL-03: [N] double-tap without toastQueue → no crash (toastQueue optional)', async () => {
    const { modal } = makeModal(); // no toastQueue
    await modal.onMount();

    expect(() => modal.onEvent({ kind: 'double-tap' })).not.toThrow();
    await modal.onUnmount();
  });

  /**
   * CDM-RETRY no-op: [Y] tap when consumeLatestConfirmed returns null → only 2 ws.send calls.
   */
  it('CDM-RETRY: [Y] tap with no cached retry → only 2 sends (dual-emit only)', async () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'test-uuid-no-retry' });
    vi.mocked(consumeLatestConfirmed).mockReturnValueOnce(null); // no cached entry

    const ws = makeMockWs();
    const { modal } = makeModal({ ws, conflict: makeConflictWithActorId('actor-1') });
    await modal.onMount();

    modal.onEvent({ kind: 'tap' });

    // Only 2 sends: drop-concentration + legacy
    expect(ws.send).toHaveBeenCalledTimes(2);

    vi.unstubAllGlobals();
    await modal.onUnmount();
  });
});
