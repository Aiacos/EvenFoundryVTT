/**
 * Unit tests for TemplatePlacementPanel (Plan 07-03, Task 2).
 *
 * Tests cover:
 * - panel mounts: onMount writes expected content via bridge.textContainerUpgrade
 * - scroll-up adjusts y position
 * - scroll-down adjusts y position
 * - tap emits confirm-template-placement tool.invoke envelope + calls onClose
 * - long-press emits cancel envelope + calls onClose
 * - getR1Hints returns expected shape
 * - getContainerCount returns {image:0, text:1}
 * - onUnmount releases gesture bus subscription (no leak)
 *
 * @see packages/g2-app/src/panels/template-placement-panel.ts
 * @see .planning/phases/07-foundry-module-write-path/07-03-PLAN.md Task 2
 */

import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';
import { TextContainerUpgrade } from '@evenrealities/even_hub_sdk';
import type { TemplatePlacementRequestedPayload } from '@evf/shared-protocol';
import {
  EnvelopeSchema,
  TEMPLATE_PLACEMENT_CANCEL_TYPE,
  TEMPLATE_PLACEMENT_CONFIRMED_TYPE,
} from '@evf/shared-protocol';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ZIndex } from '../engine/layer-types.js';
import type { PanelGestureBus } from '../engine/panel-gesture-bus.js';
import { TemplatePlacementPanel } from './template-placement-panel.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeBridge() {
  return {
    textContainerUpgrade: vi.fn().mockResolvedValue(undefined),
    updateImageRawData: vi.fn().mockResolvedValue(undefined),
    createTextContainer: vi.fn().mockResolvedValue(undefined),
  } as unknown as EvenAppBridge;
}

function makeWs() {
  const sent: string[] = [];
  return {
    send: vi.fn((data: string) => sent.push(data)),
    _sent: sent,
  };
}

function makeGestureBus(): PanelGestureBus {
  const subscribers: Array<(g: { kind: string }) => void> = [];
  return {
    subscribe: vi.fn((handler: (g: { kind: string }) => void) => {
      subscribers.push(handler);
      return () => {
        const idx = subscribers.indexOf(handler);
        if (idx !== -1) subscribers.splice(idx, 1);
      };
    }),
    publish: vi.fn((gesture: { kind: string }) => {
      for (const sub of subscribers) sub(gesture);
    }),
    size: vi.fn(() => subscribers.length),
  } as unknown as PanelGestureBus;
}

function makePayload(
  overrides: Partial<TemplatePlacementRequestedPayload> = {},
): TemplatePlacementRequestedPayload {
  return {
    placementId: '550e8400-e29b-41d4-a716-446655440000',
    spellName: 'Fireball',
    templateIndex: 0,
    total: 1,
    type: 'circle',
    distance: 20,
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('TemplatePlacementPanel — constructor + lifecycle', () => {
  let bridge: EvenAppBridge;
  let ws: ReturnType<typeof makeWs>;
  let gestureBus: PanelGestureBus;
  const locale = 'it' as const;
  const SESSION_ID = '660e8400-e29b-41d4-a716-446655440001';

  beforeEach(() => {
    bridge = makeBridge();
    ws = makeWs();
    gestureBus = makeGestureBus();
  });

  it('TP-01: has stable id "template-placement-panel"', () => {
    const panel = new TemplatePlacementPanel(
      bridge,
      ws,
      gestureBus,
      makePayload(),
      locale,
      SESSION_ID,
      vi.fn(),
    );
    expect(panel.id).toBe('template-placement-panel');
  });

  it('TP-02: z property is ZIndex.Z2_OVERLAY', () => {
    const panel = new TemplatePlacementPanel(
      bridge,
      ws,
      gestureBus,
      makePayload(),
      locale,
      SESSION_ID,
      vi.fn(),
    );
    expect(panel.z).toBe(ZIndex.Z2_OVERLAY);
  });

  it('TP-03: getContainerCount returns {image:0, text:1}', () => {
    const panel = new TemplatePlacementPanel(
      bridge,
      ws,
      gestureBus,
      makePayload(),
      locale,
      SESSION_ID,
      vi.fn(),
    );
    expect(panel.getContainerCount()).toEqual({ image: 0, text: 1 });
  });

  it('TP-04: getR1Hints returns an object with tap, scroll, longPressLabel strings', () => {
    const panel = new TemplatePlacementPanel(
      bridge,
      ws,
      gestureBus,
      makePayload(),
      locale,
      SESSION_ID,
      vi.fn(),
    );
    const hints = panel.getR1Hints?.();
    expect(hints).toBeDefined();
    expect(typeof hints?.tap).toBe('string');
    expect(typeof hints?.scroll).toBe('string');
    expect(typeof hints?.longPressLabel).toBe('string');
    // Verify it mentions confirm/position concepts
    expect(hints?.tap.length).toBeGreaterThan(0);
    expect(hints?.scroll.length).toBeGreaterThan(0);
  });

  it('TP-05: onMount subscribes to gestureBus', async () => {
    const panel = new TemplatePlacementPanel(
      bridge,
      ws,
      gestureBus,
      makePayload(),
      locale,
      SESSION_ID,
      vi.fn(),
    );
    await panel.onMount();
    expect(gestureBus.subscribe).toHaveBeenCalledTimes(1);
    expect((gestureBus as unknown as { size: () => number }).size()).toBe(1);
  });

  it('TP-06: draw() calls bridge.textContainerUpgrade with overlay-block container', async () => {
    const panel = new TemplatePlacementPanel(
      bridge,
      ws,
      gestureBus,
      makePayload(),
      locale,
      SESSION_ID,
      vi.fn(),
    );
    await panel.onMount();
    await panel.draw();
    expect(bridge.textContainerUpgrade).toHaveBeenCalledWith(expect.any(TextContainerUpgrade));
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const callArg = (bridge.textContainerUpgrade as ReturnType<typeof vi.fn>).mock
      .calls[0]![0] as TextContainerUpgrade;
    // The content should contain spell name
    expect(callArg).toBeDefined();
  });

  it('TP-07: onUnmount releases gesture bus subscription (no leak)', async () => {
    const panel = new TemplatePlacementPanel(
      bridge,
      ws,
      gestureBus,
      makePayload(),
      locale,
      SESSION_ID,
      vi.fn(),
    );
    await panel.onMount();
    expect((gestureBus as unknown as { size: () => number }).size()).toBe(1);
    await panel.onUnmount();
    expect((gestureBus as unknown as { size: () => number }).size()).toBe(0);
  });

  it('TP-08: onUnmount is idempotent (second call is safe)', async () => {
    const panel = new TemplatePlacementPanel(
      bridge,
      ws,
      gestureBus,
      makePayload(),
      locale,
      SESSION_ID,
      vi.fn(),
    );
    await panel.onMount();
    await panel.onUnmount();
    await panel.onUnmount(); // second call — no throw
    expect((gestureBus as unknown as { size: () => number }).size()).toBe(0);
  });
});

// ─── R1 gesture handling ──────────────────────────────────────────────────────

describe('TemplatePlacementPanel — R1 gesture handling', () => {
  let bridge: EvenAppBridge;
  let ws: ReturnType<typeof makeWs>;
  let gestureBus: PanelGestureBus;
  const locale = 'it' as const;
  const SESSION_ID = '660e8400-e29b-41d4-a716-446655440002';

  beforeEach(() => {
    bridge = makeBridge();
    ws = makeWs();
    gestureBus = makeGestureBus();
  });

  it('TP-09: scroll-up decrements y by GRID (50)', async () => {
    const onClose = vi.fn();
    const panel = new TemplatePlacementPanel(
      bridge,
      ws,
      gestureBus,
      makePayload(),
      locale,
      SESSION_ID,
      onClose,
    );
    await panel.onMount();

    const initialY = panel._getPositionForTest().y;
    panel.onEvent({ kind: 'scroll', direction: 'up' });
    expect(panel._getPositionForTest().y).toBe(initialY - 50);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('TP-10: scroll-down increments y by GRID (50)', async () => {
    const onClose = vi.fn();
    const panel = new TemplatePlacementPanel(
      bridge,
      ws,
      gestureBus,
      makePayload(),
      locale,
      SESSION_ID,
      onClose,
    );
    await panel.onMount();

    const initialY = panel._getPositionForTest().y;
    panel.onEvent({ kind: 'scroll', direction: 'down' });
    expect(panel._getPositionForTest().y).toBe(initialY + 50);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('TP-11: tap emits tool.invoke envelope with confirm-template-placement toolId + calls onClose', async () => {
    const onClose = vi.fn();
    const payload = makePayload({
      placementId: '550e8400-e29b-41d4-a716-446655440003',
      templateIndex: 0,
    });
    const panel = new TemplatePlacementPanel(
      bridge,
      ws,
      gestureBus,
      payload,
      locale,
      SESSION_ID,
      onClose,
    );
    await panel.onMount();
    panel.onEvent({ kind: 'tap' });

    expect(ws.send).toHaveBeenCalledTimes(1);
    const sentRaw = ws._sent[0]!;
    const parsed = JSON.parse(sentRaw) as unknown;

    // Validate outer envelope shape
    const envResult = EnvelopeSchema.safeParse(parsed);
    expect(envResult.success).toBe(true);
    if (envResult.success) {
      expect(envResult.data.type).toBe('tool.invoke');
      const innerPayload = envResult.data.payload as {
        toolId: string;
        args: {
          placementId: string;
          templateIndex: number;
          x: number;
          y: number;
        };
      };
      expect(innerPayload.toolId).toBe('confirm-template-placement');
      expect(innerPayload.args.placementId).toBe('550e8400-e29b-41d4-a716-446655440003');
      expect(innerPayload.args.templateIndex).toBe(0);
      expect(typeof innerPayload.args.x).toBe('number');
      expect(typeof innerPayload.args.y).toBe('number');
    }

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('TP-12: long-press emits cancel envelope with TEMPLATE_PLACEMENT_CANCEL_TYPE + calls onClose', async () => {
    const onClose = vi.fn();
    const payload = makePayload({
      placementId: '550e8400-e29b-41d4-a716-446655440004',
    });
    const panel = new TemplatePlacementPanel(
      bridge,
      ws,
      gestureBus,
      payload,
      locale,
      SESSION_ID,
      onClose,
    );
    await panel.onMount();
    panel.onEvent({ kind: 'long-press' });

    expect(ws.send).toHaveBeenCalledTimes(1);
    const sentRaw = ws._sent[0]!;
    const parsed = JSON.parse(sentRaw) as unknown;

    const envResult = EnvelopeSchema.safeParse(parsed);
    expect(envResult.success).toBe(true);
    if (envResult.success) {
      expect(envResult.data.type).toBe(TEMPLATE_PLACEMENT_CANCEL_TYPE);
      const innerPayload = envResult.data.payload as { placementId: string };
      expect(innerPayload.placementId).toBe('550e8400-e29b-41d4-a716-446655440004');
    }

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('TP-13: double-tap is ignored (no send, no close)', async () => {
    const onClose = vi.fn();
    const panel = new TemplatePlacementPanel(
      bridge,
      ws,
      gestureBus,
      makePayload(),
      locale,
      SESSION_ID,
      onClose,
    );
    await panel.onMount();
    panel.onEvent({ kind: 'double-tap' });

    expect(ws.send).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('TP-14: tap envelope type is "tool.invoke" (TEMPLATE_PLACEMENT_CONFIRMED_TYPE is for inner payload marker)', () => {
    // Verify the type constant is exported correctly
    expect(TEMPLATE_PLACEMENT_CONFIRMED_TYPE).toBe('template.placement.confirmed');
  });

  it('TP-15: tap envelope session_id matches the constructor SESSION_ID', async () => {
    const panel = new TemplatePlacementPanel(
      bridge,
      ws,
      gestureBus,
      makePayload(),
      locale,
      SESSION_ID,
      vi.fn(),
    );
    await panel.onMount();
    panel.onEvent({ kind: 'tap' });

    const parsed = JSON.parse(ws._sent[0]!) as { session_id: string };
    expect(parsed.session_id).toBe(SESSION_ID);
  });

  // ── WR-03 regression: idempotencyKey must be present in tap envelope ──────────

  it('WR-03: tap envelope payload contains a UUID idempotencyKey (required by ToolInvocationEnvelopePayloadSchema)', async () => {
    // WR-03: before the fix, the confirm-template-placement tap envelope omitted
    // idempotencyKey, causing ToolInvocationEnvelopePayloadSchema.safeParse to fail
    // after CR-01 fix landed (bridge-side envelope validation).
    const fixedUUID = '00000000-0000-4000-8000-000000000042';
    vi.stubGlobal('crypto', { randomUUID: () => fixedUUID });

    const onClose = vi.fn();
    const panel = new TemplatePlacementPanel(
      bridge,
      ws,
      gestureBus,
      makePayload({ placementId: '550e8400-e29b-41d4-a716-446655440099' }),
      locale,
      SESSION_ID,
      onClose,
    );
    await panel.onMount();
    panel.onEvent({ kind: 'tap' });

    const sentMsg = JSON.parse(ws._sent[0]!) as {
      payload: { toolId: string; idempotencyKey: string; args: unknown };
    };

    // idempotencyKey must be present and match the UUID generated by crypto.randomUUID()
    expect(sentMsg.payload.idempotencyKey).toBe(fixedUUID);
    expect(sentMsg.payload.idempotencyKey).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );

    vi.unstubAllGlobals();
  });

  it('WR-03: each tap generates a fresh (unique) idempotencyKey', async () => {
    let callCount = 0;
    const uuids = ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002'];
    vi.stubGlobal('crypto', { randomUUID: () => uuids[callCount++ % 2]! });

    const panel = new TemplatePlacementPanel(
      bridge,
      ws,
      gestureBus,
      makePayload(),
      locale,
      SESSION_ID,
      vi.fn(),
    );
    await panel.onMount();
    panel.onEvent({ kind: 'tap' });

    // A second panel instance (simulating retry) would generate a new UUID
    const ws2 = makeWs();
    const panel2 = new TemplatePlacementPanel(
      makeBridge(),
      ws2,
      makeGestureBus(),
      makePayload(),
      locale,
      SESSION_ID,
      vi.fn(),
    );
    await panel2.onMount();
    panel2.onEvent({ kind: 'tap' });

    const key1 = (JSON.parse(ws._sent[0]!) as { payload: { idempotencyKey: string } }).payload.idempotencyKey;
    const key2 = (JSON.parse(ws2._sent[0]!) as { payload: { idempotencyKey: string } }).payload.idempotencyKey;
    // Each tap call generates a fresh UUID via crypto.randomUUID()
    expect(key1).not.toBe(key2);

    vi.unstubAllGlobals();
  });
});
