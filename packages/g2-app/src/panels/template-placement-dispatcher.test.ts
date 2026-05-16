/**
 * Unit tests for template-placement-dispatcher (Plan 07-03, Task 2).
 *
 * Tests cover:
 * - valid envelope mounts TemplatePlacementPanel via layerManager.bundle
 * - malformed JSON is rejected + console.warn
 * - wrong envelope type is silently skipped (no warn)
 * - invalid payload is rejected + console.warn
 * - unsubscribe removes message listener (idempotent)
 *
 * Pattern mirrors conc-conflict-dispatcher.test.ts exactly (double trust boundary).
 *
 * @see packages/g2-app/src/panels/template-placement-dispatcher.ts
 * @see .planning/phases/07-foundry-module-write-path/07-03-PLAN.md Task 2
 */

import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LayerManager } from '../engine/layer-manager.js';
import type { PanelGestureBus } from '../engine/panel-gesture-bus.js';
import { attachTemplatePlacementHandler } from './template-placement-dispatcher.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeBridge(): EvenAppBridge {
  return {
    textContainerUpgrade: vi.fn().mockResolvedValue(undefined),
    updateImageRawData: vi.fn().mockResolvedValue(undefined),
    createTextContainer: vi.fn().mockResolvedValue(undefined),
  } as unknown as EvenAppBridge;
}

interface MockSocket {
  addEventListener(event: 'message', handler: (ev: MessageEvent) => void): void;
  removeEventListener(event: 'message', handler: (ev: MessageEvent) => void): void;
  send(data: string): void;
  fireMessage(data: string): void;
}

function makeMockSocket(): MockSocket {
  const listeners: Array<(ev: MessageEvent) => void> = [];
  return {
    addEventListener: vi.fn((_event: string, handler: (ev: MessageEvent) => void) => {
      listeners.push(handler);
    }),
    removeEventListener: vi.fn((_event: string, handler: (ev: MessageEvent) => void) => {
      const idx = listeners.indexOf(handler);
      if (idx !== -1) listeners.splice(idx, 1);
    }),
    send: vi.fn(),
    fireMessage(data: string) {
      for (const l of listeners) {
        l(new MessageEvent('message', { data }));
      }
    },
    _listeners: listeners,
  } as unknown as MockSocket;
}

function makeGestureBus(): PanelGestureBus {
  return {
    subscribe: vi.fn(() => () => {}),
    publish: vi.fn(),
    size: vi.fn(() => 0),
  } as unknown as PanelGestureBus;
}

function makeLayerManager(): LayerManager {
  return {
    bundle: vi.fn().mockResolvedValue(undefined),
  } as unknown as LayerManager;
}

function makeValidEnvelope(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    proto: 'evf-v1',
    seq: 1,
    ts: Date.now(),
    type: 'template.placement.requested',
    session_id: '550e8400-e29b-41d4-a716-446655440000',
    payload: {
      placementId: '660e8400-e29b-41d4-a716-446655440001',
      spellName: 'Fireball',
      templateIndex: 0,
      total: 1,
      type: 'circle',
      distance: 20,
    },
    ...overrides,
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('attachTemplatePlacementHandler', () => {
  let bridge: EvenAppBridge;
  let ws: MockSocket;
  let gestureBus: PanelGestureBus;
  let layerManager: LayerManager;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  const locale = 'it' as const;

  beforeEach(() => {
    bridge = makeBridge();
    ws = makeMockSocket();
    gestureBus = makeGestureBus();
    layerManager = makeLayerManager();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('TPD-01: returns an unsubscribe function', () => {
    const unsubscribe = attachTemplatePlacementHandler(
      ws,
      bridge,
      gestureBus,
      layerManager,
      locale,
    );
    expect(typeof unsubscribe).toBe('function');
    unsubscribe();
  });

  it('TPD-02: valid envelope triggers layerManager.bundle with mount operation', async () => {
    attachTemplatePlacementHandler(ws, bridge, gestureBus, layerManager, locale);
    ws.fireMessage(makeValidEnvelope());

    // Allow async bundle to settle
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(layerManager.bundle).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ type: 'mount' })]),
    );
  });

  it('TPD-03: malformed JSON is rejected with console.warn', () => {
    attachTemplatePlacementHandler(ws, bridge, gestureBus, layerManager, locale);
    ws.fireMessage('not-json{{{');

    expect(console.warn).toHaveBeenCalled();
    expect(layerManager.bundle).not.toHaveBeenCalled();
  });

  it('TPD-04: wrong envelope type is silently skipped (no warn, no mount)', () => {
    attachTemplatePlacementHandler(ws, bridge, gestureBus, layerManager, locale);
    ws.fireMessage(
      JSON.stringify({
        proto: 'evf-v1',
        seq: 1,
        ts: Date.now(),
        type: 'character.delta', // different type
        session_id: '550e8400-e29b-41d4-a716-446655440000',
        payload: {},
      }),
    );

    expect(console.warn).not.toHaveBeenCalled();
    expect(layerManager.bundle).not.toHaveBeenCalled();
  });

  it('TPD-05: invalid outer envelope (missing proto) is rejected with console.warn', () => {
    attachTemplatePlacementHandler(ws, bridge, gestureBus, layerManager, locale);
    ws.fireMessage(
      JSON.stringify({
        // missing proto
        seq: 1,
        ts: Date.now(),
        type: 'template.placement.requested',
        session_id: '550e8400-e29b-41d4-a716-446655440000',
        payload: {},
      }),
    );

    expect(console.warn).toHaveBeenCalled();
    expect(layerManager.bundle).not.toHaveBeenCalled();
  });

  it('TPD-06: invalid inner payload is rejected with console.warn', () => {
    attachTemplatePlacementHandler(ws, bridge, gestureBus, layerManager, locale);
    ws.fireMessage(
      JSON.stringify({
        proto: 'evf-v1',
        seq: 1,
        ts: Date.now(),
        type: 'template.placement.requested',
        session_id: '550e8400-e29b-41d4-a716-446655440000',
        payload: {
          // placementId missing
          spellName: 'Fireball',
          templateIndex: 0,
          total: 1,
          type: 'circle',
          distance: 20,
        },
      }),
    );

    expect(console.warn).toHaveBeenCalled();
    expect(layerManager.bundle).not.toHaveBeenCalled();
  });

  it('TPD-07: unsubscribe removes message listener (subsequent messages ignored)', async () => {
    const unsubscribe = attachTemplatePlacementHandler(
      ws,
      bridge,
      gestureBus,
      layerManager,
      locale,
    );
    unsubscribe();

    ws.fireMessage(makeValidEnvelope());
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(layerManager.bundle).not.toHaveBeenCalled();
  });

  it('TPD-08: valid envelope uses session_id from the inbound envelope for the panel', async () => {
    attachTemplatePlacementHandler(ws, bridge, gestureBus, layerManager, locale);
    ws.fireMessage(makeValidEnvelope({ session_id: '770e8400-e29b-41d4-a716-446655440005' }));
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(layerManager.bundle).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ type: 'mount' })]),
    );
  });
});
