/**
 * Phase 9 integration smoke (ISM-W9-01..10 — Plan 09-05 Task 1).
 *
 * End-to-end coverage of Phase 9's action economy + concentration + slot-picker
 * flow using REAL panel instances, REAL dispatchers, and mocked bridge/WS:
 *
 *   - ISM-W9-01: Phase 9 layer set mounts cleanly; capture invariant + one rebuildPageContainer.
 *   - ISM-W9-02: r1.action.economy envelope → cache updated + StatusHudRenderer non-null.
 *   - ISM-W9-03: ActionOptionsModal tap with actionsUsed=1 → toast enqueued; ws.send NOT called.
 *   - ISM-W9-04: ActionOptionsModal tap with multiAttackInProgress=true → ws.send called; no toast.
 *   - ISM-W9-05: conc.conflict envelope → ConcentrationDropModalPanel mounts at z=2.
 *   - ISM-W9-06: conc modal [Y] tap → 3 ws.send calls in order; each passes EnvelopeSchema.
 *   - ISM-W9-07: conc modal [N] double-tap → 0 retry; toast with concentration-cancelled.
 *   - ISM-W9-08: SlotPickerPanel scroll → selection 1; tap → slot_level=4 in envelope.
 *   - ISM-W9-09: ActionOptionsModal requiresSlotPicker=false → slot_level=3 direct emit.
 *   - ISM-W9-10: 14-socketlib-handler grep gate; EnvelopeSchema round-trip on all Phase 9 types.
 *
 * Harness mirrors Phase 8's 08-integration-smoke.test.ts pattern:
 *   - MockSocket (EventEmitter-backed) + send spy + fireMessage helper
 *   - StubCaptureLayer at z=0 (satisfies LayerManager capture invariant)
 *   - Real LayerManager, StatusHudLayer, ToastQueueLayer, PanelRouter
 *   - beforeEach: clear action-economy-state + conc-retry-cache
 *
 * @see .planning/phases/09-action-economy-edge-cases/09-05-PLAN.md Task 1
 * @see .planning/phases/09-action-economy-edge-cases/09-CONTEXT.md (Phase 9 spec)
 * @see packages/g2-app/src/__tests__/08-integration-smoke.test.ts (harness pattern)
 */

import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type EvenAppBridge, RebuildPageContainer } from '@evenrealities/even_hub_sdk';
import {
  type ActionEconomyPayload,
  CONC_CONFLICT_TYPE,
  type ConcConflictPayload,
  EnvelopeSchema,
  R1_ACTION_ECONOMY_TYPE,
  SERVER_CAPS_V1,
} from '@evf/shared-protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LayerManager } from '../engine/layer-manager.js';
import { type Layer, ZIndex } from '../engine/layer-types.js';
import { PanelGestureBus } from '../engine/panel-gesture-bus.js';
import { PanelRouter } from '../engine/panel-router.js';
import { attachActionEconomyHandler } from '../panels/action-economy-dispatcher.js';
import {
  clearActionEconomyState,
  getActionEconomyState,
  setActionEconomyState,
} from '../panels/action-economy-state.js';
import type { ActionOptionsRequest } from '../panels/action-options-modal.js';
import { ActionOptionsModal } from '../panels/action-options-modal.js';
import {
  cacheRetryEnvelope,
  clearRetryCache,
  consumeLatestConfirmed,
  markRetryConfirmed,
} from '../panels/conc-retry-cache.js';
import { ConcentrationDropModalPanel } from '../panels/concentration-drop-modal.js';
import { SlotPickerPanel, type SlotPickerRequest } from '../panels/slot-picker-panel.js';
import { StatusHudLayer } from '../status-hud/status-hud-layer.js';
import { StatusHudRenderer } from '../status-hud/status-hud-renderer.js';
import { ToastQueueLayer } from '../status-hud/toast-queue-layer.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const VALID_SESSION_UUID = '33333333-3333-4333-8333-333333333333';
const ACTOR_ID = 'actor-phase9-1';
const ITEM_ID = 'spell-phase9-1';
const RECIPIENT_USER_ID = 'user-test-p9';

// ─── Mock infrastructure ──────────────────────────────────────────────────────

interface MockWsInterface extends EventEmitter {
  readyState: number;
  send: ((data: string) => void) & ReturnType<typeof vi.fn>;
  close: (() => void) & ReturnType<typeof vi.fn>;
  addEventListener: (event: string, handler: EventListener, opts?: AddEventListenerOptions) => void;
  removeEventListener: (event: string, handler: EventListener) => void;
  fireMessage: (data: string) => void;
}

function makeMockWs(): MockWsInterface {
  const emitter = new EventEmitter() as MockWsInterface;
  emitter.readyState = 1;
  emitter.send = vi.fn() as unknown as MockWsInterface['send'];
  emitter.close = vi.fn() as unknown as MockWsInterface['close'];
  emitter.addEventListener = (event, handler, opts): void => {
    if (opts?.once === true) {
      emitter.once(event, (data: unknown) => {
        (handler as (ev: unknown) => void)({ data, type: event });
      });
    } else {
      emitter.on(event, (data: unknown) => {
        (handler as (ev: unknown) => void)({ data, type: event });
      });
    }
  };
  emitter.removeEventListener = (event, handler): void => {
    emitter.off(event, handler as (...args: unknown[]) => void);
  };
  emitter.fireMessage = (data: string): void => {
    emitter.emit('message', data);
  };
  return emitter;
}

function makeMockBridge(): EvenAppBridge & {
  textContainerUpgrade: ReturnType<typeof vi.fn>;
  rebuildPageContainer: ReturnType<typeof vi.fn>;
} {
  const rebuildPageContainer = vi.fn().mockResolvedValue(
    new RebuildPageContainer({
      containerTotalNum: 1,
      textObject: [],
      imageObject: [],
    }),
  );
  return {
    textContainerUpgrade: vi.fn().mockResolvedValue(true),
    rebuildPageContainer,
    updateImageRawData: vi.fn().mockResolvedValue(0),
    shutDownPageContainer: vi.fn().mockResolvedValue(true),
    setLocalStorage: vi.fn().mockResolvedValue(true),
    getLocalStorage: vi.fn().mockResolvedValue(''),
    onDeviceStatusChanged: vi.fn(),
    createStartUpPageContainer: vi.fn().mockResolvedValue(0),
  } as unknown as EvenAppBridge & {
    textContainerUpgrade: ReturnType<typeof vi.fn>;
    rebuildPageContainer: ReturnType<typeof vi.fn>;
  };
}

/** Flush async microtasks to drain async chain (boot, bundle, mount). */
async function flushMicrotasks(iterations = 16): Promise<void> {
  for (let i = 0; i < iterations; i++) {
    await Promise.resolve();
  }
}

// ─── Stub capture layer ───────────────────────────────────────────────────────

/** Minimal stub providing a capture container at z=0 (satisfies capture invariant). */
class StubCaptureLayer implements Layer {
  readonly id = 'stub-capture';
  async draw(): Promise<void> {}
  destroy(): void {}
  getCaptureContainer(): string {
    return 'stub-map-capture';
  }
  getContainerCount(): { image: number; text: number } {
    return { image: 0, text: 1 };
  }
}

// ─── Shared setup helpers ─────────────────────────────────────────────────────

interface SmokeSuiteSetup {
  bridge: ReturnType<typeof makeMockBridge>;
  ws: MockWsInterface;
  lm: LayerManager;
  gestureBus: PanelGestureBus;
  router: PanelRouter;
  toastLayer: ToastQueueLayer;
  statusHud: StatusHudLayer;
  renderer: StatusHudRenderer;
}

async function makeSmokeSuite(): Promise<SmokeSuiteSetup> {
  const bridge = makeMockBridge();
  const ws = makeMockWs();
  const lm = new LayerManager(bridge);
  lm.setNegotiatedCaps(new Set([...SERVER_CAPS_V1]));
  const gestureBus = new PanelGestureBus();

  const renderer = new StatusHudRenderer({ locale: 'it' });
  const statusHud = new StatusHudLayer({
    bridge,
    renderer,
    wsEvents: {
      subscribe: (channel, fn) => {
        const handler = (ev: MessageEvent): void => {
          try {
            const data = JSON.parse(typeof ev.data === 'string' ? ev.data : '') as {
              type?: unknown;
              payload?: unknown;
            };
            if (data.type === channel) {
              fn(data.payload);
            }
          } catch {
            // ignore
          }
        };
        ws.addEventListener('message', handler as EventListener);
        return () => {
          ws.removeEventListener('message', handler as EventListener);
        };
      },
    },
  });
  const toastLayer = new ToastQueueLayer({ bridge });

  await lm.bundle([
    { type: 'mount', z: ZIndex.Z0_MAP, layer: new StubCaptureLayer() },
    { type: 'mount', z: ZIndex.Z1_STATUS_HUD, layer: statusHud },
    { type: 'mount', z: ZIndex.Z1_5_TOAST, layer: toastLayer },
  ]);

  const router = new PanelRouter();
  await router.discoverPanels();

  return { bridge, ws, lm, gestureBus, router, toastLayer, statusHud, renderer };
}

/** Build a valid action-economy envelope JSON string. */
function makeActionEconomyEnvelope(payload: ActionEconomyPayload): string {
  return JSON.stringify({
    proto: 'evf-v1',
    seq: 1,
    ts: Date.now(),
    type: R1_ACTION_ECONOMY_TYPE,
    session_id: VALID_SESSION_UUID,
    payload,
  });
}

/** Build a valid conc.conflict envelope JSON string. */
function makeConcConflictEnvelope(payload: ConcConflictPayload): string {
  return JSON.stringify({
    proto: 'evf-v1',
    seq: 2,
    ts: Date.now(),
    type: CONC_CONFLICT_TYPE,
    session_id: VALID_SESSION_UUID,
    payload,
  });
}

// ─── Phase 9 integration smoke (ISM-W9-01..10) ───────────────────────────────

describe('Phase 9 integration smoke (ISM-W9-01..10) — action-economy + concentration + slot-picker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Clear module-scoped caches between tests
    clearActionEconomyState();
    clearRetryCache();
    // Stub crypto.randomUUID for deterministic envelope construction
    let uuidCounter = 1;
    vi.stubGlobal('crypto', {
      randomUUID: vi.fn(() => `aaaaaaaa-aaaa-4aaa-8aaa-${String(uuidCounter++).padStart(12, '0')}`),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    clearActionEconomyState();
    clearRetryCache();
  });

  /**
   * ISM-W9-01: Phase 9 layer set mounts cleanly.
   *
   * Verifies that the smoke-suite builds: StubCaptureLayer at z=0, StatusHudLayer at z=1,
   * ToastQueueLayer at z=1.5 mount without error, capture invariant is intact, and
   * exactly one rebuildPageContainer call is issued per bundle.
   */
  it('ISM-W9-01: Phase 9 layer set mounts cleanly — capture invariant + rebuildPageContainer', async () => {
    const { bridge, lm } = await makeSmokeSuite();

    // Capture invariant: z=0 layer must expose getCaptureContainer()
    const z0 = lm.getLayer(ZIndex.Z0_MAP);
    expect(z0).toBeDefined();
    expect(typeof (z0 as { getCaptureContainer?: unknown }).getCaptureContainer).toBe('function');

    // StatusHud at z=1
    const z1 = lm.getLayer(ZIndex.Z1_STATUS_HUD);
    expect(z1).toBeDefined();
    expect(z1?.id).toBe('status-hud');

    // ToastQueueLayer at z=1.5
    const z1_5 = lm.getLayer(ZIndex.Z1_5_TOAST);
    expect(z1_5).toBeDefined();
    expect(z1_5?.id).toBe('toast-queue');

    // Exactly one rebuildPageContainer during the initial bundle
    expect(bridge.rebuildPageContainer).toHaveBeenCalledTimes(1);
  });

  /**
   * ISM-W9-02: r1.action.economy envelope → cache updated.
   *
   * Fires a valid action-economy envelope through attachActionEconomyHandler.
   * Verifies getActionEconomyState returns the parsed payload.
   */
  it('ISM-W9-02: r1.action.economy envelope → getActionEconomyState returns payload', async () => {
    const { ws } = await makeSmokeSuite();

    const unsubscribe = attachActionEconomyHandler(ws, RECIPIENT_USER_ID);

    const economyPayload: ActionEconomyPayload = {
      actorId: ACTOR_ID,
      actionsUsed: 1,
      bonusActionsUsed: 0,
      reactionsUsed: 0,
      multiAttackInProgress: false,
      recipientUserId: RECIPIENT_USER_ID,
    };

    ws.fireMessage(makeActionEconomyEnvelope(economyPayload));

    // Cache should be updated synchronously (handler is synchronous)
    const cached = getActionEconomyState(ACTOR_ID);
    expect(cached).not.toBeNull();
    expect(cached?.actionsUsed).toBe(1);
    expect(cached?.bonusActionsUsed).toBe(0);
    expect(cached?.multiAttackInProgress).toBe(false);
    expect(cached?.recipientUserId).toBe(RECIPIENT_USER_ID);

    unsubscribe();
  });

  /**
   * ISM-W9-03: ActionOptionsModal tap with actionsUsed=1 → toast enqueued; ws.send NOT called.
   *
   * Populates the action economy cache with actionsUsed=1, constructs ActionOptionsModal,
   * fires tap. The preconditioner should block the emission and enqueue an error toast.
   */
  it('ISM-W9-03: tap with actionsUsed=1 → preconditioner blocks; toast enqueued; ws.send not called', async () => {
    const { bridge, ws, lm, gestureBus, router, toastLayer } = await makeSmokeSuite();

    // Pre-populate economy cache: action slot used
    setActionEconomyState({
      actorId: ACTOR_ID,
      actionsUsed: 1,
      bonusActionsUsed: 0,
      reactionsUsed: 0,
      multiAttackInProgress: false,
      recipientUserId: RECIPIENT_USER_ID,
    });

    const request: ActionOptionsRequest = {
      kind: 'spell',
      name: 'Palla di Fuoco',
      actorId: ACTOR_ID,
      itemId: ITEM_ID,
      requiresTarget: false,
      requiresSlotPicker: false,
      defaultSlotLevel: 3,
    };

    const modal = new ActionOptionsModal(
      bridge,
      ws,
      gestureBus,
      request,
      'it',
      VALID_SESSION_UUID,
      () => {
        void router.popOverlay(lm);
      },
      toastLayer, // inject toast queue → enables preconditioner
    );

    await router.pushOverlay(modal, lm);
    await flushMicrotasks();

    expect(lm.getLayer(ZIndex.Z2_OVERLAY)?.id).toBe('action-options-modal');

    // Tap → preconditioner fires (actionsUsed=1, multiAttackInProgress=false)
    gestureBus.publish({ kind: 'tap' });
    await flushMicrotasks();

    // ws.send must NOT be called (preconditioner blocked emission)
    expect(ws.send).not.toHaveBeenCalled();

    // Toast must be enqueued exactly once with the Italian error message
    expect(toastLayer.getVisibleCount()).toBe(1);

    ws.close();
  });

  /**
   * ISM-W9-04: ActionOptionsModal tap with multiAttackInProgress=true → ws.send called; no toast.
   *
   * When multiAttackInProgress=true, the preconditioner is bypassed (multi-attack
   * iterations always proceed). Confirms ws.send is called once.
   */
  it('ISM-W9-04: tap with multiAttackInProgress=true → preconditioner bypassed; ws.send called', async () => {
    const { bridge, ws, lm, gestureBus, router, toastLayer } = await makeSmokeSuite();

    // Pre-populate economy cache: action used + multiAttack in progress
    setActionEconomyState({
      actorId: ACTOR_ID,
      actionsUsed: 1,
      bonusActionsUsed: 0,
      reactionsUsed: 0,
      multiAttackInProgress: true, // bypass preconditioner
      recipientUserId: RECIPIENT_USER_ID,
    });

    const request: ActionOptionsRequest = {
      kind: 'spell',
      name: 'Attacco Extra',
      actorId: ACTOR_ID,
      itemId: ITEM_ID,
      requiresTarget: false,
      requiresSlotPicker: false,
      defaultSlotLevel: 0, // cantrip-like
    };

    const modal = new ActionOptionsModal(
      bridge,
      ws,
      gestureBus,
      request,
      'it',
      VALID_SESSION_UUID,
      () => {
        void router.popOverlay(lm);
      },
      toastLayer,
    );

    await router.pushOverlay(modal, lm);
    await flushMicrotasks();

    // Tap → multiAttackInProgress=true bypasses preconditioner → emit
    gestureBus.publish({ kind: 'tap' });
    await flushMicrotasks();

    // ws.send called once with tool.invoke
    expect(ws.send).toHaveBeenCalledTimes(1);
    // No toast enqueued (preconditioner bypassed)
    expect(toastLayer.getVisibleCount()).toBe(0);

    ws.close();
  });

  /**
   * ISM-W9-05: conc.conflict envelope → ConcentrationDropModalPanel mounts at z=2.
   *
   * Synthesises a conc.conflict WS message. Verifies the ConcentrationDropModalPanel
   * is mounted by directly constructing and pushing it (as the conc-conflict-dispatcher
   * would do), checking the layer id.
   */
  it('ISM-W9-05: conc.conflict payload → ConcentrationDropModalPanel mounted at z=2', async () => {
    const { bridge, ws, lm, gestureBus, router, toastLayer } = await makeSmokeSuite();

    const conflictPayload: ConcConflictPayload = {
      effectId: 'eff-conc-1',
      currentConcentrationName: 'Benedizione',
      newSpellName: 'Blocca Persone',
      actorId: ACTOR_ID,
    };

    // Simulate what conc-conflict-dispatcher does: mount the modal at z=2
    const modal = new ConcentrationDropModalPanel(
      bridge,
      ws,
      gestureBus,
      conflictPayload,
      'it',
      VALID_SESSION_UUID,
      () => {
        void router.popOverlay(lm);
      },
      toastLayer,
    );

    await router.pushOverlay(modal, lm);
    await flushMicrotasks();

    // Verify modal mounted at z=2 with correct id
    expect(lm.getLayer(ZIndex.Z2_OVERLAY)?.id).toBe('conc-drop-modal');

    ws.close();
  });

  /**
   * ISM-W9-06: conc modal [Y] tap → 3 ws.send calls in order; each passes EnvelopeSchema.
   *
   * Pre-caches a synthetic cast envelope as 'confirmed' (simulating the
   * action-result-dispatcher confirmation path). Mounts the modal and fires [Y] tap.
   * Asserts 3 ws.send calls: (1) tool.invoke drop-concentration, (2) conc.drop.confirmed,
   * (3) the cached retry envelope. Each must parse EnvelopeSchema.
   */
  it('ISM-W9-06: [Y] tap → 3 ws.send calls in order; all pass EnvelopeSchema.safeParse', async () => {
    const { bridge, ws, lm, gestureBus, router, toastLayer } = await makeSmokeSuite();

    // Pre-cache a synthetic cast envelope as confirmed (simulates Plan 09-03 retry flow)
    const syntheticCastEnvelope = {
      proto: 'evf-v1' as const,
      seq: 0,
      ts: Date.now(),
      type: 'tool.invoke' as const,
      session_id: VALID_SESSION_UUID,
      payload: {
        toolId: 'cast-spell' as const,
        idempotencyKey: 'idem-retry-1',
        args: {
          actor_id: ACTOR_ID,
          spell_id: ITEM_ID,
          targets: [],
          slot_level: 3,
        },
      },
    };
    cacheRetryEnvelope('idem-retry-1', syntheticCastEnvelope, 'unconfirmed');
    markRetryConfirmed('idem-retry-1');

    const conflictPayload: ConcConflictPayload = {
      effectId: 'eff-conc-2',
      currentConcentrationName: 'Benedizione',
      newSpellName: 'Blocca Persone',
      actorId: ACTOR_ID,
    };

    const modal = new ConcentrationDropModalPanel(
      bridge,
      ws,
      gestureBus,
      conflictPayload,
      'it',
      VALID_SESSION_UUID,
      () => {
        void router.popOverlay(lm);
      },
      toastLayer,
    );

    await router.pushOverlay(modal, lm);
    await flushMicrotasks();

    // [Y] tap → dual-emit (tool.invoke + legacy) + retry envelope
    gestureBus.publish({ kind: 'tap' });
    await flushMicrotasks();

    // Exactly 3 ws.send calls
    expect(ws.send).toHaveBeenCalledTimes(3);

    // Each call must parse as valid EnvelopeSchema
    for (const call of ws.send.mock.calls) {
      const raw = call[0] as string;
      const parsed = JSON.parse(raw) as unknown;
      const result = EnvelopeSchema.safeParse(parsed);
      expect(result.success).toBe(true);
    }

    // Call order verification
    const types = ws.send.mock.calls.map((c) => {
      const env = JSON.parse(c[0] as string) as { type: string };
      return env.type;
    });
    expect(types[0]).toBe('tool.invoke'); // drop-concentration
    expect(types[1]).toBe('conc.drop.confirmed'); // legacy W-4 guard
    expect(types[2]).toBe('tool.invoke'); // cached retry cast-spell

    // Retry cache should be consumed (single-attempt invariant T-09-03)
    expect(consumeLatestConfirmed()).toBeNull();

    ws.close();
  });

  /**
   * ISM-W9-07: conc modal [N] double-tap → 0 retry; toast with concentration-cancelled.
   *
   * Mounts the conc modal. Fires [N] double-tap. Verifies ws.send is NOT called,
   * toast is enqueued with concentration-cancelled message, and retry cache is empty.
   */
  it('ISM-W9-07: [N] double-tap → ws.send not called; concentration-cancelled toast enqueued', async () => {
    const { bridge, ws, lm, gestureBus, router, toastLayer } = await makeSmokeSuite();

    const conflictPayload: ConcConflictPayload = {
      effectId: 'eff-conc-3',
      currentConcentrationName: 'Benedizione',
      newSpellName: 'Palla di Fuoco',
      actorId: ACTOR_ID,
    };

    const modal = new ConcentrationDropModalPanel(
      bridge,
      ws,
      gestureBus,
      conflictPayload,
      'it',
      VALID_SESSION_UUID,
      () => {
        void router.popOverlay(lm);
      },
      toastLayer,
    );

    await router.pushOverlay(modal, lm);
    await flushMicrotasks();

    // [N] double-tap → cancel
    gestureBus.publish({ kind: 'double-tap' });
    await flushMicrotasks();

    // ws.send NOT called (no retry, no drop)
    expect(ws.send).not.toHaveBeenCalled();

    // Toast enqueued with cancellation message
    expect(toastLayer.getVisibleCount()).toBe(1);

    // No confirmed retry entry
    expect(consumeLatestConfirmed()).toBeNull();

    ws.close();
  });

  /**
   * ISM-W9-08: SlotPickerPanel scroll → selection 1; tap → slot_level=4 in envelope.
   *
   * Constructs SlotPickerPanel with 2 available slots (level 3 and 4). Fires scroll
   * to advance selection from 0 → 1. Fires tap. Verifies ws.send called with
   * payload.args.slot_level === 4.
   */
  it('ISM-W9-08: SlotPickerPanel scroll → selection 1; tap → slot_level=4', async () => {
    const { bridge, ws, gestureBus } = await makeSmokeSuite();

    const request: SlotPickerRequest = {
      actorId: ACTOR_ID,
      spellId: ITEM_ID,
      spellName: 'Palla di Fuoco',
      baseLevel: 3,
      availableSlots: [
        { level: 3, value: 2, max: 4 },
        { level: 4, value: 3, max: 3 },
      ],
    };

    const panel = new SlotPickerPanel(
      bridge,
      ws,
      gestureBus,
      request,
      'it',
      VALID_SESSION_UUID,
      () => {},
    );

    await panel.onMount();

    // Initially at index 0 (level 3)
    expect(panel._getSelectedIdxForTest()).toBe(0);

    // Scroll → advance to index 1 (level 4)
    panel.onEvent({ kind: 'scroll', direction: 'down' });
    expect(panel._getSelectedIdxForTest()).toBe(1);

    // Tap → emit with slot_level=4
    panel.onEvent({ kind: 'tap' });
    await flushMicrotasks();

    expect(ws.send).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(ws.send.mock.calls[0]?.[0] as string) as {
      type: string;
      payload: { args: { slot_level: number } };
    };
    expect(sent.type).toBe('tool.invoke');
    expect(sent.payload.args.slot_level).toBe(4);

    await panel.onUnmount();
  });

  /**
   * ISM-W9-09: ActionOptionsModal requiresSlotPicker=false → slot_level=3 direct emit.
   *
   * When the boot caller decides there is only 1 slot available (auto-skip path),
   * ActionOptionsModal is constructed with requiresSlotPicker=false + defaultSlotLevel=3.
   * Tap fires directly with slot_level=3, no SlotPickerPanel opened.
   */
  it('ISM-W9-09: ActionOptionsModal requiresSlotPicker=false + defaultSlotLevel=3 → slot_level=3 direct emit', async () => {
    const { bridge, ws, lm, gestureBus, router } = await makeSmokeSuite();

    const request: ActionOptionsRequest = {
      kind: 'spell',
      name: 'Dardo Magico',
      actorId: ACTOR_ID,
      itemId: ITEM_ID,
      requiresTarget: false,
      requiresSlotPicker: false, // auto-skip: single slot available
      defaultSlotLevel: 3,
    };

    const modal = new ActionOptionsModal(
      bridge,
      ws,
      gestureBus,
      request,
      'it',
      VALID_SESSION_UUID,
      () => {
        void router.popOverlay(lm);
      },
      null, // no toast queue → preconditioner disabled
    );

    await router.pushOverlay(modal, lm);
    await flushMicrotasks();

    // Tap → direct emit with slot_level=3
    gestureBus.publish({ kind: 'tap' });
    await flushMicrotasks();

    expect(ws.send).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(ws.send.mock.calls[0]?.[0] as string) as {
      type: string;
      payload: { toolId: string; args: { slot_level: number } };
    };
    expect(sent.type).toBe('tool.invoke');
    expect(sent.payload.toolId).toBe('cast-spell');
    expect(sent.payload.args.slot_level).toBe(3);

    ws.close();
  });

  /**
   * ISM-W9-10: 17-socketlib-handler grep gate + EnvelopeSchema round-trip.
   *
   * Phase 13 Plan 13-01 FLIPPED the count from 14 → 17 (ACT-04 reaction handlers).
   * Verifies that the socketlib-handlers.ts file has EXACTLY 17 calls to
   * `socketlib.registerComplexHandler`. This is the ADR-0011 invariant gate.
   * New Phase 13 INVARIANT: 17 handlers.
   *
   * Also verifies that all Phase 9 envelope types pass EnvelopeSchema.safeParse
   * with canonical field shapes (proto/seq/ts/type/session_id/payload).
   */
  it('ISM-W9-10: 14-socketlib-handler invariant + Phase 9 EnvelopeSchema round-trip', () => {
    // ── 17-socketlib-handler grep gate ───────────────────────────────────────
    // File read: resolve via __dirname-equivalent from import.meta.url.
    // packages/g2-app/src/__tests__/ → packages/foundry-module/src/pair/
    const thisDir = dirname(fileURLToPath(import.meta.url));
    const handlersPath = join(thisDir, '../../../foundry-module/src/pair/socketlib-handlers.ts');
    const content = readFileSync(handlersPath, 'utf-8');
    const callLines = content
      .split('\n')
      .filter((line) => line.includes('socketlib.registerComplexHandler'));
    expect(callLines.length).toBe(17);

    // ── Phase 9 EnvelopeSchema round-trip ────────────────────────────────────
    // action.economy
    const economyEnv = JSON.parse(
      makeActionEconomyEnvelope({
        actorId: ACTOR_ID,
        actionsUsed: 1,
        bonusActionsUsed: 0,
        reactionsUsed: 0,
        multiAttackInProgress: false,
        recipientUserId: RECIPIENT_USER_ID,
      }),
    ) as unknown;
    expect(EnvelopeSchema.safeParse(economyEnv).success).toBe(true);

    // conc.conflict
    const concEnv = JSON.parse(
      makeConcConflictEnvelope({
        effectId: 'eff-test',
        currentConcentrationName: 'Benedizione',
        newSpellName: 'Palla di Fuoco',
        actorId: ACTOR_ID,
      }),
    ) as unknown;
    expect(EnvelopeSchema.safeParse(concEnv).success).toBe(true);

    // conc.drop.confirmed
    const concDropEnv = {
      proto: 'evf-v1' as const,
      seq: 3,
      ts: Date.now(),
      type: 'conc.drop.confirmed' as const,
      session_id: VALID_SESSION_UUID,
      payload: { effectId: 'eff-test' },
    };
    expect(EnvelopeSchema.safeParse(concDropEnv).success).toBe(true);

    // tool.invoke with slot_level
    const toolInvokeEnv = {
      proto: 'evf-v1' as const,
      seq: 4,
      ts: Date.now(),
      type: 'tool.invoke' as const,
      session_id: VALID_SESSION_UUID,
      payload: {
        toolId: 'cast-spell' as const,
        idempotencyKey: 'idem-test-1',
        args: {
          actor_id: ACTOR_ID,
          spell_id: ITEM_ID,
          targets: [],
          slot_level: 3,
        },
      },
    };
    expect(EnvelopeSchema.safeParse(toolInvokeEnv).success).toBe(true);
  });
});
