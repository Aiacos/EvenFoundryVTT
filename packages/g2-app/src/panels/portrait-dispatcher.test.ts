/**
 * Unit tests for portrait-dispatcher (Plan 13-04 — STRETCH-06).
 *
 * PD-01: non-JSON message is ignored (no throw)
 * PD-02: valid JSON but malformed EnvelopeSchema is warned + ignored
 * PD-03: envelope with wrong type is silently ignored (no cache write)
 * PD-04: envelope correct type but malformed PortraitReadyPayload is warned + ignored
 * PD-05: valid r1.portrait.ready envelope writes to portrait-state cache
 * PD-06: unsubscribe removes the listener (subsequent messages not processed)
 *
 * @see packages/g2-app/src/panels/portrait-dispatcher.ts
 * @see packages/g2-app/src/panels/portrait-state.ts
 * @see .planning/phases/13-v2-stretch/13-04-PLAN.md Task 1
 */

import { R1_PORTRAIT_READY_TYPE } from '@evf/shared-protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attachPortraitHandler } from './portrait-dispatcher.js';
import { clearPortraitBytes, getPortraitBytes } from './portrait-state.js';

// ─── MockSocket ───────────────────────────────────────────────────────────────

type MessageHandler = (ev: { data: unknown }) => void;

class MockSocket {
  private _handlers: MessageHandler[] = [];

  addEventListener(_event: 'message', handler: MessageHandler): void {
    this._handlers.push(handler);
  }

  removeEventListener(_event: 'message', handler: MessageHandler): void {
    const idx = this._handlers.indexOf(handler);
    if (idx !== -1) {
      this._handlers.splice(idx, 1);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  send(_data: string): void {
    // no-op
  }

  fireMessage(data: unknown): void {
    for (const h of this._handlers) {
      h({ data: typeof data === 'string' ? data : JSON.stringify(data) });
    }
  }

  get handlerCount(): number {
    return this._handlers.length;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ACTOR_ID = 'actor-thorin';
const VALID_HASH = 'a'.repeat(64);
const VALID_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

function makePortraitEnvelope(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    proto: 'evf-v1',
    seq: 1,
    ts: Date.now(),
    type: R1_PORTRAIT_READY_TYPE,
    session_id: '12345678-1234-4abc-8abc-123456789012',
    payload: {
      actorId: ACTOR_ID,
      pngBase64: VALID_B64,
      width: 100,
      height: 60,
      urlHash: VALID_HASH,
      ...overrides,
    },
  });
}

describe('attachPortraitHandler', () => {
  let ws: MockSocket;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    ws = new MockSocket();
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    clearPortraitBytes();
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
    clearPortraitBytes();
    vi.restoreAllMocks();
  });

  // PD-01: non-JSON ignored
  it('PD-01: non-JSON message does not throw and does not write cache', () => {
    const unsub = attachPortraitHandler(ws);
    expect(() => ws.fireMessage('not-json-!!!')).not.toThrow();
    expect(getPortraitBytes(ACTOR_ID)).toBeNull();
    unsub();
  });

  // PD-02: malformed envelope warned + ignored
  it('PD-02: malformed EnvelopeSchema warns and does not write cache', () => {
    const unsub = attachPortraitHandler(ws);
    ws.fireMessage(JSON.stringify({ garbage: true }));
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[portrait-dispatcher]'),
      expect.anything(),
    );
    expect(getPortraitBytes(ACTOR_ID)).toBeNull();
    unsub();
  });

  // PD-03: wrong envelope type silently ignored
  it('PD-03: envelope with wrong type is silently ignored (no cache write, no warn)', () => {
    const unsub = attachPortraitHandler(ws);
    ws.fireMessage(
      JSON.stringify({
        proto: 'evf-v1',
        seq: 1,
        ts: Date.now(),
        type: 'r1.some.other.type',
        session_id: '12345678-1234-4abc-8abc-123456789012',
        payload: {},
      }),
    );
    expect(consoleWarnSpy).not.toHaveBeenCalled();
    expect(getPortraitBytes(ACTOR_ID)).toBeNull();
    unsub();
  });

  // PD-04: correct type but malformed payload warns + ignores
  it('PD-04: correct type with invalid payload warns and does not write cache', () => {
    const unsub = attachPortraitHandler(ws);
    ws.fireMessage(makePortraitEnvelope({ urlHash: 'bad-not-64-hex' }));
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[portrait-dispatcher]'),
      expect.anything(),
    );
    expect(getPortraitBytes(ACTOR_ID)).toBeNull();
    unsub();
  });

  // PD-05: valid envelope writes to portrait-state cache
  it('PD-05: valid r1.portrait.ready envelope writes bytes to portrait-state cache', () => {
    const unsub = attachPortraitHandler(ws);
    ws.fireMessage(makePortraitEnvelope());
    const cached = getPortraitBytes(ACTOR_ID);
    expect(cached).not.toBeNull();
    expect(cached?.pngBase64).toBe(VALID_B64);
    expect(cached?.urlHash).toBe(VALID_HASH);
    unsub();
  });

  // PD-06: unsubscribe removes the listener
  it('PD-06: unsub removes listener — subsequent messages do not write cache', () => {
    const unsub = attachPortraitHandler(ws);
    expect(ws.handlerCount).toBe(1);
    unsub();
    expect(ws.handlerCount).toBe(0);
    ws.fireMessage(makePortraitEnvelope());
    expect(getPortraitBytes(ACTOR_ID)).toBeNull();
  });
});
