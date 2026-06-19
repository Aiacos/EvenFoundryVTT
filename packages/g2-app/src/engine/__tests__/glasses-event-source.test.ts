/**
 * Unit tests for attachGlassesEventSource (debug canvas-sheet-overlay-wont-open).
 *
 * Mirrors the r1-event-source.test.ts harness: mock EvenAppBridge with a
 * capturable onEvenHubEvent subscription, PanelGestureBus publish spy, mock
 * LayerManager controlling getTopLayer.
 *
 * Behavior block:
 *   - GES-01: textEvent eventType 0 → publish { kind: 'tap' }
 *   - GES-02: textEvent eventType 1 → publish { kind: 'scroll', direction: 'up' }
 *   - GES-03: textEvent eventType 2 → publish { kind: 'scroll', direction: 'down' }
 *   - GES-04: textEvent eventType 3 → publish { kind: 'double-tap' }
 *   - GES-05: lifecycle ordinals (4-8) → silent skip (no publish, no warn)
 *   - GES-06: non-gesture events (audioEvent) → silent skip
 *   - GES-11: sysEvent {eventSource:1, eventType omitted} → tap (PB default-omission)
 *   - GES-12: sysEvent {eventSource:1, eventType:3} → double-tap
 *   - GES-13: sysEvent with imuData → silent skip
 *   - GES-14: sysEvent lifecycle (eventType:4) → silent skip
 *   - GES-15: sysEvent with BOTH fields omitted (no touch source) → silent skip
 *   - GES-07: getTopLayer() null → warn telemetry + publish IS called (root-state contract)
 *   - GES-08: onPublish hook fires after every successful publish, NOT on skips
 *   - GES-09: unsubscribe idempotency — double off() does not throw; SDK unsub called once
 *   - GES-10: faulty bus subscriber → handler catch warns, SDK stream survives
 *
 * @see ../glasses-event-source.ts (source)
 * @see .planning/debug/canvas-sheet-overlay-wont-open.md (root-cause session)
 */
import type { EvenAppBridge, EvenHubEvent } from '@evenrealities/even_hub_sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attachGlassesEventSource } from '../glasses-event-source.js';
import type { LayerManager } from '../layer-manager.js';
import type { OverlayPanel } from '../layer-types.js';
import { PanelGestureBus } from '../panel-gesture-bus.js';

// ──────────────────────────────────────────────────────────────────────────────
// Mock EvenAppBridge — captures the onEvenHubEvent handler for direct firing
// ──────────────────────────────────────────────────────────────────────────────

interface MockBridge {
  bridge: EvenAppBridge;
  fire: (event: EvenHubEvent) => void;
  sdkUnsub: ReturnType<typeof vi.fn>;
}

function makeMockBridge(): MockBridge {
  let handler: ((event: EvenHubEvent) => void) | null = null;
  const sdkUnsub = vi.fn();
  const bridge = {
    onEvenHubEvent: vi.fn((cb: (event: EvenHubEvent) => void) => {
      handler = cb;
      return sdkUnsub;
    }),
  } as unknown as EvenAppBridge;
  return {
    bridge,
    fire: (event: EvenHubEvent): void => {
      if (handler === null) throw new Error('onEvenHubEvent not subscribed');
      handler(event);
    },
    sdkUnsub,
  };
}

/** textEvent factory matching the simulator/host wire shape. */
function makeTextEvent(eventType: number): EvenHubEvent {
  return {
    textEvent: { containerID: 4, containerName: 'hud-capture', eventType },
  } as unknown as EvenHubEvent;
}

function makeOverlayPanelStub(id: string): OverlayPanel {
  return {
    id,
    draw: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn(),
    getCaptureContainer: () => `${id}-capture`,
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

describe('attachGlassesEventSource (GES-01..GES-10)', () => {
  let mock: MockBridge;
  let bus: PanelGestureBus;
  let publishSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mock = makeMockBridge();
    bus = new PanelGestureBus();
    publishSpy = vi.spyOn(bus, 'publish');
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it.each([
    ['GES-01', 0, { kind: 'tap' }],
    ['GES-02', 1, { kind: 'scroll', direction: 'up' }],
    ['GES-03', 2, { kind: 'scroll', direction: 'down' }],
    ['GES-04', 3, { kind: 'double-tap' }],
  ])('%s: textEvent eventType %i → publish %o', (_id, eventType, expected) => {
    const lm = makeMockLayerManager(makeOverlayPanelStub('panel'));
    attachGlassesEventSource(mock.bridge, bus, lm);

    mock.fire(makeTextEvent(eventType as number));

    expect(publishSpy).toHaveBeenCalledTimes(1);
    expect(publishSpy).toHaveBeenCalledWith(expected);
  });

  it('GES-05: lifecycle ordinals 4-8 → silent skip (no publish, no warn)', () => {
    const lm = makeMockLayerManager(makeOverlayPanelStub('panel'));
    attachGlassesEventSource(mock.bridge, bus, lm);

    for (const ordinal of [4, 5, 6, 7, 8]) {
      mock.fire(makeTextEvent(ordinal));
    }

    expect(publishSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('GES-06: non-textEvent events (audioEvent) → silent skip', () => {
    const lm = makeMockLayerManager(makeOverlayPanelStub('panel'));
    attachGlassesEventSource(mock.bridge, bus, lm);

    mock.fire({ audioEvent: { audioPcm: new Uint8Array(4) } } as unknown as EvenHubEvent);

    expect(publishSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('GES-07: getTopLayer() null → warn telemetry + publish IS called (root-state contract)', () => {
    const lm = makeMockLayerManager(null);
    attachGlassesEventSource(mock.bridge, bus, lm);

    mock.fire(makeTextEvent(1));

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0]?.[0])).toContain('no top layer');
    expect(String(warnSpy.mock.calls[0]?.[0])).toContain('INV-5');
    expect(publishSpy).toHaveBeenCalledWith({ kind: 'scroll', direction: 'up' });
  });

  it('GES-08: onPublish hook fires after every successful publish, NOT on skips', () => {
    const lm = makeMockLayerManager(makeOverlayPanelStub('panel'));
    const onPublish = vi.fn();
    attachGlassesEventSource(mock.bridge, bus, lm, { onPublish });

    mock.fire(makeTextEvent(0)); // publish
    mock.fire(makeTextEvent(8)); // lifecycle skip
    mock.fire({ audioEvent: { audioPcm: new Uint8Array(1) } } as unknown as EvenHubEvent); // skip
    mock.fire(makeTextEvent(3)); // publish

    expect(onPublish).toHaveBeenCalledTimes(2);
  });

  it('GES-09: unsubscribe idempotency — double off() does not throw; SDK unsub called once', () => {
    const lm = makeMockLayerManager(makeOverlayPanelStub('panel'));
    const off = attachGlassesEventSource(mock.bridge, bus, lm);

    off();
    expect(() => off()).not.toThrow();
    expect(mock.sdkUnsub).toHaveBeenCalledTimes(1);
  });

  it('GES-11: sysEvent {eventSource:1, eventType omitted} → tap (PB default-omission)', () => {
    const lm = makeMockLayerManager(makeOverlayPanelStub('panel'));
    attachGlassesEventSource(mock.bridge, bus, lm);

    // Live simulator wire shape for a touchpad click (eventType:0 omitted).
    mock.fire({ sysEvent: { eventSource: 1 } } as unknown as EvenHubEvent);

    expect(publishSpy).toHaveBeenCalledTimes(1);
    expect(publishSpy).toHaveBeenCalledWith({ kind: 'tap' });
  });

  it('GES-12: sysEvent {eventSource:1, eventType:3} → double-tap', () => {
    const lm = makeMockLayerManager(makeOverlayPanelStub('panel'));
    attachGlassesEventSource(mock.bridge, bus, lm);

    mock.fire({ sysEvent: { eventSource: 1, eventType: 3 } } as unknown as EvenHubEvent);

    expect(publishSpy).toHaveBeenCalledWith({ kind: 'double-tap' });
  });

  it('GES-13: sysEvent with imuData → silent skip', () => {
    const lm = makeMockLayerManager(makeOverlayPanelStub('panel'));
    attachGlassesEventSource(mock.bridge, bus, lm);

    mock.fire({
      sysEvent: { eventType: 8, imuData: { x: 0, y: 0, z: 0 } },
    } as unknown as EvenHubEvent);

    expect(publishSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('GES-14: sysEvent lifecycle (eventType:4) → silent skip', () => {
    const lm = makeMockLayerManager(makeOverlayPanelStub('panel'));
    attachGlassesEventSource(mock.bridge, bus, lm);

    mock.fire({ sysEvent: { eventType: 4 } } as unknown as EvenHubEvent);

    expect(publishSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('GES-15: sysEvent with BOTH fields omitted (no touch source) → silent skip', () => {
    const lm = makeMockLayerManager(makeOverlayPanelStub('panel'));
    attachGlassesEventSource(mock.bridge, bus, lm);

    mock.fire({ sysEvent: {} } as unknown as EvenHubEvent);

    expect(publishSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('GES-10: faulty bus subscriber → handler catch warns, SDK stream survives', () => {
    const lm = makeMockLayerManager(makeOverlayPanelStub('panel'));
    publishSpy.mockImplementation(() => {
      throw new Error('boom');
    });
    attachGlassesEventSource(mock.bridge, bus, lm);

    expect(() => mock.fire(makeTextEvent(0))).not.toThrow();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0]?.[0])).toContain('handler threw');

    // Stream survives — a subsequent valid event still reaches the handler.
    publishSpy.mockImplementation(() => {});
    mock.fire(makeTextEvent(3));
    expect(publishSpy).toHaveBeenCalledTimes(2);
  });
});
