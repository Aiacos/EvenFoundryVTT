/**
 * Unit tests for the Quick Action tap dispatcher (ADR-0012 Amendment 2).
 *
 * QATD-01  tap on the base view (z=2 slot empty) → pushOverlay(menu)
 * QATD-02  tap while a z=2 overlay is mounted → inert (no pushOverlay)
 * QATD-03  non-tap gestures (scroll up/down, double-tap) → inert
 * QATD-04  unsubscribe stops further dispatch
 *
 * @see packages/g2-app/src/panels/quick-action-tap-dispatcher.ts
 */
import { describe, expect, it, vi } from 'vitest';
import type { LayerManager } from '../../engine/layer-manager.js';
import { ZIndex } from '../../engine/layer-types.js';
import { PanelGestureBus } from '../../engine/panel-gesture-bus.js';
import type { PanelRouter } from '../../engine/panel-router.js';
import { attachQuickActionTap } from '../quick-action-tap-dispatcher.js';

/** Minimal LayerManager stub: control whether the z=2 slot is occupied. */
function makeLayerManager(z2Occupied: boolean): LayerManager {
  return {
    getLayer: (z: ZIndex) =>
      z === ZIndex.Z2_OVERLAY && z2Occupied ? ({ id: 'some-overlay' } as never) : undefined,
  } as unknown as LayerManager;
}

function makeRouter() {
  const pushOverlay = vi.fn().mockResolvedValue(undefined);
  return { router: { pushOverlay } as unknown as Pick<PanelRouter, 'pushOverlay'>, pushOverlay };
}

describe('attachQuickActionTap', () => {
  it('QATD-01: tap on the base view (z=2 empty) opens the menu', () => {
    const bus = new PanelGestureBus();
    const { router, pushOverlay } = makeRouter();
    const menu = { id: 'quick-action-menu' } as never;
    attachQuickActionTap(bus, router, makeLayerManager(false), () => menu);

    bus.publish({ kind: 'tap' });
    expect(pushOverlay).toHaveBeenCalledTimes(1);
    expect(pushOverlay.mock.calls[0]?.[0]).toBe(menu);
  });

  it('QATD-02: tap while a z=2 overlay is mounted is inert (no menu)', () => {
    const bus = new PanelGestureBus();
    const { router, pushOverlay } = makeRouter();
    attachQuickActionTap(bus, router, makeLayerManager(true), () => ({ id: 'm' }) as never);

    bus.publish({ kind: 'tap' });
    expect(pushOverlay).not.toHaveBeenCalled();
  });

  it('QATD-03: non-tap gestures never open the menu', () => {
    const bus = new PanelGestureBus();
    const { router, pushOverlay } = makeRouter();
    attachQuickActionTap(bus, router, makeLayerManager(false), () => ({ id: 'm' }) as never);

    bus.publish({ kind: 'scroll', direction: 'up' });
    bus.publish({ kind: 'scroll', direction: 'down' });
    bus.publish({ kind: 'double-tap' });
    expect(pushOverlay).not.toHaveBeenCalled();
  });

  it('QATD-04: unsubscribe stops further dispatch', () => {
    const bus = new PanelGestureBus();
    const { router, pushOverlay } = makeRouter();
    const unsub = attachQuickActionTap(
      bus,
      router,
      makeLayerManager(false),
      () => ({ id: 'm' }) as never,
    );

    unsub();
    bus.publish({ kind: 'tap' });
    expect(pushOverlay).not.toHaveBeenCalled();
  });
});
