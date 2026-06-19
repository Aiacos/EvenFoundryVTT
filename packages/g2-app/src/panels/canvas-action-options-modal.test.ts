/**
 * Unit tests for CanvasActionOptionsModal (Feature 001 Option B — canvas-mode
 * action-options modal).
 *
 * Covers the canvas-specific contract + confirms the inherited envelope logic is
 * untouched:
 *   - CAOM-01: id === 'canvas-action-options-modal'
 *   - CAOM-02: getContainerCount → { image: 0, text: 0 } (ADR-0013 Amd 1 — canvas layers)
 *   - CAOM-03: draw() is a no-op — does NOT call bridge.textContainerUpgrade
 *   - CAOM-04: attachCanvas + paint() composite to the canvas 2D context (no native container)
 *   - CAOM-05: tap (requiresTarget=false) still emits the canonical tool.invoke envelope
 *              via ws.send — byte-identical to the glyph path (inherited from parent)
 *   - CAOM-06: double-tap → onClose('cancel') without emit (inherited)
 *   - CAOM-07: isAtTopBoundary → true (over-scroll opens Quick Action, ADR-0012 D-2)
 *
 * @see packages/g2-app/src/panels/canvas-action-options-modal.ts
 * @see packages/g2-app/src/panels/action-options-modal.test.ts (parent suite — AOM-*)
 */

import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';
import { EnvelopeSchema, ToolInvocationEnvelopePayloadSchema } from '@evf/shared-protocol';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PanelGestureBus } from '../engine/panel-gesture-bus.js';
import type { ActionOptionsRequest, ActionOptionsWebSocket } from './action-options-modal.js';
import { CanvasActionOptionsModal } from './canvas-action-options-modal.js';

// Mirror the parent suite's module mocks so the inherited tap path is hermetic.
vi.mock('./action-economy-state.js', () => ({
  getActionEconomyState: vi.fn(() => null),
  setActionEconomyState: vi.fn(),
  clearActionEconomyState: vi.fn(),
}));
vi.mock('./conc-retry-cache.js', () => ({
  cacheRetryEnvelope: vi.fn(),
  markRetryConfirmed: vi.fn(),
  consumeRetryEnvelope: vi.fn(() => null),
  consumeLatestConfirmed: vi.fn(() => null),
  clearRetryCache: vi.fn(),
}));
// Deterministic font (avoid the happy-dom FontFace path).
vi.mock('../status-hud/vt323-font-loader.js', () => ({
  ensureVt323Loaded: vi.fn(async () => '16px VT323'),
}));

const VALID_SESSION_UUID = '22222222-2222-4222-8222-222222222222';

function makeBridge() {
  return {
    textContainerUpgrade: vi.fn().mockResolvedValue(undefined),
    updateImageRawData: vi.fn().mockResolvedValue(undefined),
    createTextContainer: vi.fn().mockResolvedValue(undefined),
  } as unknown as EvenAppBridge & { textContainerUpgrade: ReturnType<typeof vi.fn> };
}

type MockWs = ActionOptionsWebSocket & { send: ReturnType<typeof vi.fn<(data: string) => void>> };
function makeWs(): MockWs {
  return { send: vi.fn<(data: string) => void>() };
}

/** A spy 2D context capturing fillText calls; satisfies the methods paint() uses. */
function makeCtx() {
  return {
    font: '',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    fillText: vi.fn(),
  };
}

function makeModal(overrides: Partial<ActionOptionsRequest> = {}) {
  const bridge = makeBridge();
  const ws = makeWs();
  const bus = new PanelGestureBus();
  const onClose = vi.fn();
  const request: ActionOptionsRequest = {
    kind: 'spell',
    name: 'Palla di Fuoco',
    actorId: 'actor-123',
    itemId: 'spell-fireball',
    requiresTarget: false,
    ...overrides,
  };
  const modal = new CanvasActionOptionsModal(
    bridge,
    ws,
    bus,
    request,
    'it',
    VALID_SESSION_UUID,
    onClose,
    { enqueue: vi.fn() },
  );
  return { modal, bridge, ws, bus, onClose, request };
}

describe('CanvasActionOptionsModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('CAOM-01: id === "canvas-action-options-modal"', () => {
    expect(makeModal().modal.id).toBe('canvas-action-options-modal');
  });

  it('CAOM-02: getContainerCount → { image: 0, text: 0 } (canvas-layer contract)', () => {
    expect(makeModal().modal.getContainerCount()).toEqual({ image: 0, text: 0 });
  });

  it('CAOM-03: draw() does NOT call bridge.textContainerUpgrade', async () => {
    const { modal, bridge } = makeModal();
    await modal.draw();
    expect(bridge.textContainerUpgrade).not.toHaveBeenCalled();
  });

  it('CAOM-04: attachCanvas + paint() composite to the 2D context', async () => {
    const { modal } = makeModal();
    const ctx = makeCtx();
    const canvas = { getContext: vi.fn(() => ctx) } as unknown as OffscreenCanvas;
    await modal.attachCanvas(canvas);
    modal.paint();
    // Full-frame backdrop + box + header rule were filled.
    expect(ctx.clearRect).toHaveBeenCalled();
    expect(ctx.strokeRect).toHaveBeenCalled();
    // Title + name + tap + cancel rows painted (4 fillText calls minimum).
    expect(ctx.fillText.mock.calls.length).toBeGreaterThanOrEqual(4);
    const painted = ctx.fillText.mock.calls.map((c) => String(c[0])).join('\n');
    expect(painted).toContain('Palla di Fuoco');
    expect(painted).toContain('[tap]');
    expect(painted).toContain('[x2]');
    expect(modal.isDirty()).toBe(false);
  });

  it('CAOM-05: tap emits a canonical tool.invoke envelope (inherited, byte-identical)', async () => {
    const { modal, ws, onClose } = makeModal();
    await modal.onMount();
    modal.onEvent({ kind: 'tap' });
    expect(ws.send).toHaveBeenCalledTimes(1);
    const env = JSON.parse(ws.send.mock.calls[0]?.[0] as string);
    expect(EnvelopeSchema.safeParse(env).success).toBe(true);
    expect(ToolInvocationEnvelopePayloadSchema.safeParse(env.payload).success).toBe(true);
    expect(env.payload.toolId).toBe('cast-spell');
    expect(onClose).toHaveBeenCalledWith('emit');
    await modal.onUnmount();
  });

  it('CAOM-06: double-tap → onClose("cancel") without emit', async () => {
    const { modal, ws, onClose } = makeModal();
    await modal.onMount();
    modal.onEvent({ kind: 'double-tap' });
    expect(ws.send).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledWith('cancel');
    await modal.onUnmount();
  });

  it('CAOM-07: isAtTopBoundary → true (over-scroll opens Quick Action menu)', () => {
    expect(makeModal().modal.isAtTopBoundary()).toBe(true);
  });
});
