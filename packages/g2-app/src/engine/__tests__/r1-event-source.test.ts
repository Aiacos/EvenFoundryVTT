/**
 * Unit tests for attachR1EventSource (Plan 06-01 Task 2).
 *
 * Uses an EventEmitter-backed MockWebSocket with `fireMessage` + `addEventListener`
 * + `removeEventListener` — mirrors `conc-conflict-dispatcher.test.ts` harness.
 *
 * Covers the r1-event-source behavior block:
 *   - R1E-01: malformed JSON → console.warn once + gestureBus unchanged
 *   - R1E-02: envelope with type != 'r1.gesture' → silent skip (no warn)
 *   - R1E-03: valid r1.gesture envelope with invalid inner payload → console.warn + no publish
 *   - R1E-04: valid tap gesture → gestureBus.publish({ kind: 'tap' })
 *   - R1E-05: wire kind 'scroll-up' → internal { kind: 'scroll', direction: 'up' }
 *   - R1E-06: wire kind 'scroll-down' → internal { kind: 'scroll', direction: 'down' }
 *   - R1E-07: kind 'long-press' passes through verbatim
 *   - R1E-08: getTopLayer() returns null → console.warn 'no top layer' + publish NOT called (INV-5 no-op)
 *   - R1E-09: unsubscribe idempotency — double off() does not throw; removeEventListener called at most once
 *   - R1E-10: after off(), subsequent fireMessage does NOT publish
 *
 * @see ../r1-event-source.ts (source)
 * @see .planning/phases/06-r1-integration-quick-action-inv-5/06-01-PLAN.md Task 2
 */
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { R1Gesture } from '../layer-types.js';
import type { LayerManager } from '../layer-manager.js';
import type { OverlayPanel } from '../layer-types.js';
import { PanelGestureBus } from '../panel-gesture-bus.js';
import { attachR1EventSource } from '../r1-event-source.js';

// ──────────────────────────────────────────────────────────────────────────────
// MockWebSocket — EventEmitter-backed, matches R1EventSourceWebSocket interface
// ──────────────────────────────────────────────────────────────────────────────

class MockWebSocket {
  private readonly emitter = new EventEmitter();

  addEventListener(event: 'message', handler: (ev: MessageEvent) => void): void {
    this.emitter.on(event, handler);
  }

  removeEventListener(event: 'message', handler: (ev: MessageEvent) => void): void {
    this.emitter.off(event, handler);
  }

  /** Test helper — fires a message event with arbitrary data. */
  fireMessage(data: unknown): void {
    const text = typeof data === 'string' ? data : JSON.stringify(data);
    // Construct a minimal MessageEvent shape — Vitest runs in happy-dom/node
    this.emitter.emit('message', { data: text } as unknown as MessageEvent);
  }

  listenerCount(): number {
    return this.emitter.listenerCount('message');
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Valid envelope factory
// ──────────────────────────────────────────────────────────────────────────────

const VALID_SESSION_ID = '11111111-1111-4111-8111-111111111111';

function makeR1Envelope(kind: string, timestamp = 1700000000000): object {
  return {
    proto: 'evf-v1',
    seq: 1,
    ts: Date.now(),
    type: 'r1.gesture',
    session_id: VALID_SESSION_ID,
    payload: { kind, timestamp },
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Mock LayerManager — controls getTopLayer return value
// ──────────────────────────────────────────────────────────────────────────────

function makeOverlayPanelStub(id: string): OverlayPanel {
  return {
    id,
    draw: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn(),
    getCaptureContainer: () => id + '-capture',
    onMount: vi.fn().mockResolvedValue(undefined),
    onUnmount: vi.fn().mockResolvedValue(undefined),
    onEvent: vi.fn(),
  };
}

function makeMockLayerManager(topLayerPanel: OverlayPanel | null): LayerManager {
  return {
    getTopLayer: vi.fn().mockReturnValue(topLayerPanel),
  } as unknown as LayerManager;
}

// ──────────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────────

describe('attachR1EventSource (R1E-01..R1E-10)', () => {
  let ws: MockWebSocket;
  let bus: PanelGestureBus;
  let publishSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    ws = new MockWebSocket();
    bus = new PanelGestureBus();
    publishSpy = vi.spyOn(bus, 'publish');
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('R1E-01: malformed JSON → console.warn once + gestureBus.publish NOT called', () => {
    const lm = makeMockLayerManager(makeOverlayPanelStub('panel'));
    attachR1EventSource(ws, bus, lm);

    ws.fireMessage('not-json-at-all}}}');

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(publishSpy).not.toHaveBeenCalled();
  });

  it('R1E-02: valid envelope with type != r1.gesture → silent skip (NO warn)', () => {
    const lm = makeMockLayerManager(makeOverlayPanelStub('panel'));
    attachR1EventSource(ws, bus, lm);

    ws.fireMessage({
      proto: 'evf-v1',
      seq: 1,
      ts: Date.now(),
      type: 'character.delta',
      session_id: VALID_SESSION_ID,
      payload: {},
    });

    expect(warnSpy).not.toHaveBeenCalled();
    expect(publishSpy).not.toHaveBeenCalled();
  });

  it('R1E-03: valid r1.gesture envelope with invalid inner payload → console.warn + no publish', () => {
    const lm = makeMockLayerManager(makeOverlayPanelStub('panel'));
    attachR1EventSource(ws, bus, lm);

    ws.fireMessage({
      proto: 'evf-v1',
      seq: 1,
      ts: Date.now(),
      type: 'r1.gesture',
      session_id: VALID_SESSION_ID,
      payload: { kind: 'invalid-kind', timestamp: 123 },
    });

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0]?.[0])).toContain('r1-event-source');
    expect(publishSpy).not.toHaveBeenCalled();
  });

  it('R1E-04: valid tap gesture with top layer present → publish({ kind: "tap" })', () => {
    const panel = makeOverlayPanelStub('panel');
    const lm = makeMockLayerManager(panel);
    attachR1EventSource(ws, bus, lm);

    ws.fireMessage(makeR1Envelope('tap'));

    expect(publishSpy).toHaveBeenCalledTimes(1);
    const published = publishSpy.mock.calls[0]?.[0] as R1Gesture;
    expect(published.kind).toBe('tap');
  });

  it('R1E-05: wire kind scroll-up → internal { kind: "scroll", direction: "up" }', () => {
    const panel = makeOverlayPanelStub('panel');
    const lm = makeMockLayerManager(panel);
    attachR1EventSource(ws, bus, lm);

    ws.fireMessage(makeR1Envelope('scroll-up'));

    expect(publishSpy).toHaveBeenCalledTimes(1);
    const published = publishSpy.mock.calls[0]?.[0] as R1Gesture;
    expect(published.kind).toBe('scroll');
    if (published.kind === 'scroll') {
      expect(published.direction).toBe('up');
    }
  });

  it('R1E-06: wire kind scroll-down → internal { kind: "scroll", direction: "down" }', () => {
    const panel = makeOverlayPanelStub('panel');
    const lm = makeMockLayerManager(panel);
    attachR1EventSource(ws, bus, lm);

    ws.fireMessage(makeR1Envelope('scroll-down'));

    expect(publishSpy).toHaveBeenCalledTimes(1);
    const published = publishSpy.mock.calls[0]?.[0] as R1Gesture;
    expect(published.kind).toBe('scroll');
    if (published.kind === 'scroll') {
      expect(published.direction).toBe('down');
    }
  });

  it('R1E-07: kind long-press passes through verbatim as { kind: "long-press" }', () => {
    const panel = makeOverlayPanelStub('panel');
    const lm = makeMockLayerManager(panel);
    attachR1EventSource(ws, bus, lm);

    ws.fireMessage(makeR1Envelope('long-press'));

    expect(publishSpy).toHaveBeenCalledTimes(1);
    const published = publishSpy.mock.calls[0]?.[0] as R1Gesture;
    expect(published.kind).toBe('long-press');
  });

  it('R1E-08: getTopLayer() returns null → console.warn (INV-5 no-op) + publish NOT called', () => {
    const lm = makeMockLayerManager(null);
    attachR1EventSource(ws, bus, lm);

    ws.fireMessage(makeR1Envelope('tap'));

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const warnMsg = String(warnSpy.mock.calls[0]?.[0]);
    expect(warnMsg).toContain('no top layer');
    expect(warnMsg).toContain('INV-5');
    expect(publishSpy).not.toHaveBeenCalled();
  });

  it('R1E-09: unsubscribe idempotency — double off() does not throw; listener removed cleanly', () => {
    const lm = makeMockLayerManager(makeOverlayPanelStub('panel'));
    const off = attachR1EventSource(ws, bus, lm);

    off();
    expect(() => off()).not.toThrow();

    // After off(), listener count drops to 0
    expect(ws.listenerCount()).toBe(0);
  });

  it('R1E-10: after off(), subsequent fireMessage does NOT call publish', () => {
    const panel = makeOverlayPanelStub('panel');
    const lm = makeMockLayerManager(panel);
    const off = attachR1EventSource(ws, bus, lm);

    // Verify it works before off()
    ws.fireMessage(makeR1Envelope('tap'));
    expect(publishSpy).toHaveBeenCalledTimes(1);

    off();
    publishSpy.mockClear();

    ws.fireMessage(makeR1Envelope('tap'));
    expect(publishSpy).not.toHaveBeenCalled();
  });
});
