/**
 * Unit tests for conc-conflict-dispatcher (Phase 4b Plan 05 Task 2 — B-4 closure).
 *
 * Covers (per 04B-05-PLAN.md §Task 2 <behavior>):
 *   - CCD-1: attachConcConflictHandler returns an unsubscribe function
 *   - CCD-2: unsubscribe removes the message listener
 *   - CCD-3: valid conc.conflict envelope → layerManager.bundle mounts modal at z=2
 *   - CCD-4: modal constructor received the envelope's session_id verbatim
 *   - CCD-5: non-envelope message → console.warn + no mount
 *   - CCD-6: envelope with type !== 'conc.conflict' → silent, no warn, no mount
 *   - CCD-7: malformed payload → console.warn + no mount
 *   - CCD-8: modal onClose → layerManager.bundle issues destroy at z=2
 *
 * @see .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-05-PLAN.md §Task 2
 * @see .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-PLAN-CHECK.md §B-4
 */
import { EventEmitter } from 'node:events';
import { type EvenAppBridge, RebuildPageContainer } from '@evenrealities/even_hub_sdk';
import { CONC_CONFLICT_TYPE, SERVER_CAPS_V1 } from '@evf/shared-protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LayerManager } from '../../engine/layer-manager.js';
import { type Layer, ZIndex } from '../../engine/layer-types.js';
import { PanelGestureBus } from '../../engine/panel-gesture-bus.js';
import {
  attachConcConflictHandler,
  type ConcDispatcherSocket,
} from '../conc-conflict-dispatcher.js';
import { ConcentrationDropModalPanel } from '../concentration-drop-modal.js';

// ──────────────────────────────────────────────────────────────────────────────
// Mock infrastructure
// ──────────────────────────────────────────────────────────────────────────────

const VALID_SESSION_UUID = '11111111-1111-4111-8111-111111111111';

function makeMockBridge(): EvenAppBridge {
  return {
    textContainerUpgrade: vi.fn().mockResolvedValue(true),
    rebuildPageContainer: vi.fn().mockResolvedValue(true),
  } as unknown as EvenAppBridge;
}

/**
 * EventEmitter-backed mock WebSocket — implements
 * {@link ConcDispatcherSocket}. The dispatcher only consumes
 * `addEventListener('message', fn)` / `removeEventListener` / `send`.
 * `fireMessage(data)` synthesises a `MessageEvent` shape with `.data`.
 *
 * The `send` field is a `vi.fn()` intersected with `(data: string) => void`
 * so the value satisfies both the {@link ConcDispatcherSocket.send} contract
 * AND the Vitest mock introspection surface (`mock.calls`).
 */
type MockDispatcherSocket = ConcDispatcherSocket & {
  emitter: EventEmitter;
  fireMessage: (data: string) => void;
  send: ReturnType<typeof vi.fn> & ((data: string) => void);
  _messageListenerCount: () => number;
};

function makeMockSocket(): MockDispatcherSocket {
  const emitter = new EventEmitter();
  const handlers = new Map<(ev: MessageEvent) => void, (data: unknown) => void>();
  const send = vi.fn() as MockDispatcherSocket['send'];
  const sock: MockDispatcherSocket = {
    emitter,
    send,
    addEventListener(event: 'message', handler: (ev: MessageEvent) => void): void {
      const wrapped = (data: unknown): void => {
        handler({ data } as MessageEvent);
      };
      handlers.set(handler, wrapped);
      emitter.on(event, wrapped);
    },
    removeEventListener(event: 'message', handler: (ev: MessageEvent) => void): void {
      const wrapped = handlers.get(handler);
      if (wrapped !== undefined) {
        emitter.off(event, wrapped);
        handlers.delete(handler);
      }
    },
    fireMessage(data: string): void {
      emitter.emit('message', data);
    },
    _messageListenerCount(): number {
      return emitter.listenerCount('message');
    },
  };
  return sock;
}

/** Minimal stub layer that provides a capture container (z=0 anchor). */
class StubCaptureLayer implements Layer {
  readonly id = 'stub-capture';
  async draw(): Promise<void> {}
  destroy(): void {}
  getCaptureContainer(): string {
    return 'map-capture';
  }
  getContainerCount(): { image: number; text: number } {
    return { image: 0, text: 1 };
  }
}

function makeLayerManager(): LayerManager {
  const bridge = makeMockBridge();
  // Provide a working rebuildPageContainer mock so bundle() resolves.
  (bridge as unknown as { rebuildPageContainer: ReturnType<typeof vi.fn> }).rebuildPageContainer =
    vi.fn().mockResolvedValue(
      new RebuildPageContainer({
        containerTotalNum: 1,
        textObject: [],
        imageObject: [],
      }),
    );
  const lm = new LayerManager(bridge);
  lm.setNegotiatedCaps(new Set(SERVER_CAPS_V1));
  // Mount a capture layer at z=0 so the capture invariant holds when the
  // modal mount (z=2) lands. Without this, _assertCaptureInvariant would
  // throw on the dispatcher's bundle call.
  lm.mount(ZIndex.Z0_MAP, new StubCaptureLayer());
  return lm;
}

/** Build a valid conc.conflict envelope JSON for ws.fireMessage. */
function buildValidConflictEnvelope(
  overrides: Partial<{ session_id: string; payload: unknown; type: string }> = {},
): string {
  return JSON.stringify({
    proto: 'evf-v1',
    seq: 1,
    ts: Date.now(),
    type: overrides.type ?? CONC_CONFLICT_TYPE,
    session_id: overrides.session_id ?? VALID_SESSION_UUID,
    payload: overrides.payload ?? {
      effectId: 'eff1',
      currentConcentrationName: 'Hold Person',
      newSpellName: 'Bless',
    },
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// CCD-1 / CCD-2 — attach/detach contract
// ──────────────────────────────────────────────────────────────────────────────

describe('conc-conflict-dispatcher — attach/detach', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('CCD-1: attachConcConflictHandler returns an unsubscribe function', () => {
    const ws = makeMockSocket();
    const bridge = makeMockBridge();
    const bus = new PanelGestureBus();
    const lm = makeLayerManager();
    const unsubscribe = attachConcConflictHandler(ws, bridge, bus, lm, 'it');
    expect(typeof unsubscribe).toBe('function');
    unsubscribe();
  });

  it('CCD-2: unsubscribe removes the message listener from the WS', () => {
    const ws = makeMockSocket();
    const bridge = makeMockBridge();
    const bus = new PanelGestureBus();
    const lm = makeLayerManager();
    expect(ws._messageListenerCount()).toBe(0);
    const unsubscribe = attachConcConflictHandler(ws, bridge, bus, lm, 'it');
    expect(ws._messageListenerCount()).toBe(1);
    unsubscribe();
    expect(ws._messageListenerCount()).toBe(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// CCD-3 / CCD-4 — happy path: mount modal + thread session_id
// ──────────────────────────────────────────────────────────────────────────────

describe('conc-conflict-dispatcher — happy path (B-4 closure)', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('CCD-3: valid envelope → layerManager mounts ConcDropModal at z=2', async () => {
    const ws = makeMockSocket();
    const bridge = makeMockBridge();
    const bus = new PanelGestureBus();
    const lm = makeLayerManager();
    const bundleSpy = vi.spyOn(lm, 'bundle');
    attachConcConflictHandler(ws, bridge, bus, lm, 'it');

    ws.fireMessage(buildValidConflictEnvelope());

    // bundle() is fire-and-forget inside the handler — flush microtasks.
    await Promise.resolve();
    await Promise.resolve();

    expect(bundleSpy).toHaveBeenCalledTimes(1);
    const ops = bundleSpy.mock.calls[0]?.[0];
    expect(Array.isArray(ops)).toBe(true);
    expect(ops?.length).toBe(1);
    const op = ops?.[0];
    expect(op?.type).toBe('mount');
    if (op?.type === 'mount') {
      expect(op.z).toBe(ZIndex.Z2_OVERLAY);
      expect(op.layer).toBeInstanceOf(ConcentrationDropModalPanel);
    }
  });

  it('CCD-4: modal received the inbound envelope session_id verbatim', async () => {
    const ws = makeMockSocket();
    const bridge = makeMockBridge();
    const bus = new PanelGestureBus();
    const lm = makeLayerManager();
    const bundleSpy = vi.spyOn(lm, 'bundle');
    attachConcConflictHandler(ws, bridge, bus, lm, 'it');

    const customSessionId = '22222222-2222-4222-8222-222222222222';
    ws.fireMessage(buildValidConflictEnvelope({ session_id: customSessionId }));

    await Promise.resolve();
    await Promise.resolve();

    const op = bundleSpy.mock.calls[0]?.[0]?.[0];
    if (op?.type !== 'mount') throw new Error('expected mount op');
    const modal = op.layer as ConcentrationDropModalPanel;
    expect(modal.getSessionId()).toBe(customSessionId);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// CCD-5 / CCD-6 / CCD-7 — trust boundary rejections
// ──────────────────────────────────────────────────────────────────────────────

describe('conc-conflict-dispatcher — trust boundary rejections', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('CCD-5: non-envelope JSON → console.warn + no mount', async () => {
    const ws = makeMockSocket();
    const bridge = makeMockBridge();
    const bus = new PanelGestureBus();
    const lm = makeLayerManager();
    const bundleSpy = vi.spyOn(lm, 'bundle');
    attachConcConflictHandler(ws, bridge, bus, lm, 'it');

    // Valid JSON, but not envelope-shaped.
    ws.fireMessage(JSON.stringify({ random: 'noise' }));

    await Promise.resolve();
    expect(bundleSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    const warnArg = warnSpy.mock.calls[0]?.[0];
    expect(String(warnArg)).toContain('envelope rejected');
  });

  it('CCD-5b: non-JSON string → console.warn + no mount (JSON.parse throws)', async () => {
    const ws = makeMockSocket();
    const bridge = makeMockBridge();
    const bus = new PanelGestureBus();
    const lm = makeLayerManager();
    const bundleSpy = vi.spyOn(lm, 'bundle');
    attachConcConflictHandler(ws, bridge, bus, lm, 'it');

    ws.fireMessage('not json at all');
    await Promise.resolve();
    expect(bundleSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    const warnArg = warnSpy.mock.calls[0]?.[0];
    expect(String(warnArg)).toContain('handler threw');
  });

  it('CCD-6: envelope.type !== "conc.conflict" → silent return; no warn, no mount', async () => {
    const ws = makeMockSocket();
    const bridge = makeMockBridge();
    const bus = new PanelGestureBus();
    const lm = makeLayerManager();
    const bundleSpy = vi.spyOn(lm, 'bundle');
    attachConcConflictHandler(ws, bridge, bus, lm, 'it');

    // Valid envelope, but different type (e.g., another dispatcher's payload).
    ws.fireMessage(buildValidConflictEnvelope({ type: 'character.delta' }));

    await Promise.resolve();
    expect(bundleSpy).not.toHaveBeenCalled();
    // Silent — no warning emitted for "not for us" path.
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('CCD-7: malformed payload (empty effectId) → console.warn + no mount', async () => {
    const ws = makeMockSocket();
    const bridge = makeMockBridge();
    const bus = new PanelGestureBus();
    const lm = makeLayerManager();
    const bundleSpy = vi.spyOn(lm, 'bundle');
    attachConcConflictHandler(ws, bridge, bus, lm, 'it');

    ws.fireMessage(
      buildValidConflictEnvelope({
        payload: {
          effectId: '', // violates .min(1)
          currentConcentrationName: 'Hold Person',
          newSpellName: 'Bless',
        },
      }),
    );

    await Promise.resolve();
    expect(bundleSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    const warnArg = warnSpy.mock.calls[0]?.[0];
    expect(String(warnArg)).toContain('payload rejected');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// CCD-8 — modal onClose triggers destroy bundle
// ──────────────────────────────────────────────────────────────────────────────

describe('conc-conflict-dispatcher — modal onClose lifecycle', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('CCD-8: modal.onClose → second bundle call with destroy z=2', async () => {
    const ws = makeMockSocket();
    const bridge = makeMockBridge();
    const bus = new PanelGestureBus();
    const lm = makeLayerManager();
    const bundleSpy = vi.spyOn(lm, 'bundle');
    attachConcConflictHandler(ws, bridge, bus, lm, 'it');

    ws.fireMessage(buildValidConflictEnvelope());
    // The dispatcher's bundle() is fire-and-forget — flush microtasks until
    // the mount + LayerManager.bundle's panel.onMount() has fully resolved.
    // 4 awaits is sufficient for the bundle's internal sequence (capability
    // check → set in map → invariant assertion → onMount await → flushPage).
    for (let i = 0; i < 8; i++) await Promise.resolve();

    expect(bundleSpy).toHaveBeenCalledTimes(1);
    const mountOp = bundleSpy.mock.calls[0]?.[0]?.[0];
    if (mountOp?.type !== 'mount') throw new Error('expected mount op');
    // The mounted layer must be the ConcentrationDropModalPanel — verifies the
    // dispatcher constructed the right type with the right gesture-bus reference.
    expect(mountOp.layer).toBeInstanceOf(ConcentrationDropModalPanel);
    // LayerManager.bundle() already invoked modal.onMount() — do NOT call it
    // again here (would double-subscribe). Drive a tap through the bus →
    // modal.onEvent → onClose callback → second bundle (destroy).
    bus.publish({ kind: 'tap' });
    // onClose synchronously issues bundle([{destroy z=2}]).
    for (let i = 0; i < 8; i++) await Promise.resolve();

    expect(bundleSpy).toHaveBeenCalledTimes(2);
    const destroyOps = bundleSpy.mock.calls[1]?.[0];
    expect(destroyOps?.length).toBe(1);
    const destroyOp = destroyOps?.[0];
    expect(destroyOp?.type).toBe('destroy');
    if (destroyOp?.type === 'destroy') {
      expect(destroyOp.z).toBe(ZIndex.Z2_OVERLAY);
    }
  });
});
