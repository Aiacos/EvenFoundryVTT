/**
 * Unit tests for ActionOptionsModal (Plan 08-03, Task 1 — AOM-01..16).
 *
 * Covers:
 *   - AOM-01: id === 'action-options-modal'; no static meta (system overlay)
 *   - AOM-02: constructor signature — (bridge, ws, gestureBus, request, locale, sessionId, onClose)
 *   - AOM-03: ActionOptionsRequest interface shape (kind/name/actorId/itemId/requiresTarget)
 *   - AOM-04: onMount subscribes to bus; onUnmount unsubscribes (T-4b-01-03)
 *   - AOM-05: tap + requiresTarget=false → ws.send tool.invoke + onClose
 *   - AOM-06: double-tap → onClose without emit (cancel)
 *   - AOM-07: long-press → console.warn (no emit, no close)
 *   - AOM-08: scroll → ignored (no-op)
 *   - AOM-09: getContainerCount → { image: 0, text: 1 }
 *   - AOM-10: getR1Hints → parsed from 'hud_r1_action_options' i18n key
 *   - AOM-11: draw → calls bridge.textContainerUpgrade with modal frame content
 *   - AOM-12: spell variant uses 'Lancia incantesimo' label; item variant uses 'Usa oggetto' label
 *   - AOM-13: W-4 envelope round-trip — EnvelopeSchema + ToolInvocationEnvelopePayloadSchema both pass
 *   - AOM-14: INV-1 fixture round-trip — spell variant matches action-options-modal.spell.it.txt
 *   - AOM-15: INV-1 fixture round-trip — item variant matches action-options-modal.item.it.txt
 *   - AOM-16: tap + requiresTarget=true → ws.send NOT called (onClose IS called)
 *
 * @see .planning/phases/08-manual-action-ux/08-03-PLAN.md Task 1
 * @see packages/g2-app/src/panels/action-options-modal.ts
 * @see .planning/phases/08-manual-action-ux/08-CONTEXT.md §Specifics (ActionOptionsModal mockup)
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';
import { EnvelopeSchema, ToolInvocationEnvelopePayloadSchema } from '@evf/shared-protocol';
import { AsciiGrid, matchAsciiFixture } from '@evf/shared-render';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PanelGestureBus } from '../engine/panel-gesture-bus.js';
import {
  ActionOptionsModal,
  type ActionOptionsRequest,
  type ActionOptionsWebSocket,
} from './action-options-modal.js';

// Phase 9 Plan 09-02 — mock action-economy-state for AOM-PRE tests.
// The modal imports getActionEconomyState from './action-economy-state.js' and
// uses it for the client-side preconditioner. We vi.mock() the module and
// control the return value per-test via vi.mocked().
vi.mock('./action-economy-state.js', () => ({
  getActionEconomyState: vi.fn(() => null),
  setActionEconomyState: vi.fn(),
  clearActionEconomyState: vi.fn(),
}));

// Phase 9 Plan 09-03 — mock conc-retry-cache for AOM-RETRY tests.
// The modal imports cacheRetryEnvelope from './conc-retry-cache.js' and calls it
// BEFORE ws.send in the tap requiresTarget=false path.
vi.mock('./conc-retry-cache.js', () => ({
  cacheRetryEnvelope: vi.fn(),
  markRetryConfirmed: vi.fn(),
  consumeRetryEnvelope: vi.fn(() => null),
  consumeLatestConfirmed: vi.fn(() => null),
  clearRetryCache: vi.fn(),
}));

import { getActionEconomyState } from './action-economy-state.js';
import { cacheRetryEnvelope } from './conc-retry-cache.js';
import type { Toast } from '../status-hud/toast-types.js';

// ─── Paths ────────────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.resolve(__dirname, '../../../../packages/shared-render/src/fixtures');

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function makeSpellRequest(overrides: Partial<ActionOptionsRequest> = {}): ActionOptionsRequest {
  return {
    kind: 'spell',
    name: 'Palla di Fuoco',
    actorId: 'actor-123',
    itemId: 'spell-fireball',
    requiresTarget: false,
    ...overrides,
  };
}

function makeItemRequest(overrides: Partial<ActionOptionsRequest> = {}): ActionOptionsRequest {
  return {
    kind: 'item',
    name: 'Pozione di Guarigione',
    actorId: 'actor-123',
    itemId: 'item-potion-healing',
    requiresTarget: false,
    ...overrides,
  };
}

type MockToastQueue = { enqueue: ReturnType<typeof vi.fn<(toast: Toast) => void>> };
function makeToastQueue(): MockToastQueue {
  return { enqueue: vi.fn<(toast: Toast) => void>() };
}

function makeModal(
  opts: {
    bridge?: EvenAppBridge & { textContainerUpgrade: ReturnType<typeof vi.fn> };
    ws?: MockWs;
    bus?: PanelGestureBus;
    request?: ActionOptionsRequest;
    locale?: 'it' | 'en' | 'de';
    sessionId?: string;
    onClose?: () => void;
    toastQueue?: MockToastQueue;
  } = {},
) {
  const bridge = opts.bridge ?? makeBridge();
  const ws = opts.ws ?? makeWs();
  const bus = opts.bus ?? new PanelGestureBus();
  const request = opts.request ?? makeSpellRequest();
  const locale = opts.locale ?? 'it';
  const sessionId = opts.sessionId ?? VALID_SESSION_UUID;
  const onClose = opts.onClose ?? vi.fn();
  // Phase 9 Plan 09-02: toastQueue is the new constructor param for preconditioner error feedback.
  const toastQueue = opts.toastQueue ?? makeToastQueue();
  const modal = new ActionOptionsModal(
    bridge,
    ws,
    bus,
    request,
    locale,
    sessionId,
    onClose,
    toastQueue,
  );
  return { modal, bridge, ws, bus, request, locale, sessionId, onClose, toastQueue };
}

// ─── AOM-01: id + no static meta ─────────────────────────────────────────────

describe('AOM-01: panel identity', () => {
  it('id === "action-options-modal"', () => {
    const { modal } = makeModal();
    expect(modal.id).toBe('action-options-modal');
  });

  it('no static meta property (system overlay — not router-discoverable)', () => {
    expect((ActionOptionsModal as unknown as Record<string, unknown>)['meta']).toBeUndefined();
  });
});

// ─── AOM-02 + AOM-03: constructor + request shape ────────────────────────────

describe('AOM-02 + AOM-03: constructor signature + ActionOptionsRequest shape', () => {
  it('spell request shape is structurally correct', () => {
    const req: ActionOptionsRequest = {
      kind: 'spell',
      name: 'Bless',
      actorId: 'actor-abc',
      itemId: 'spell-bless',
      requiresTarget: true,
    };
    const { modal } = makeModal({ request: req });
    expect(modal.id).toBe('action-options-modal');
  });

  it('item request shape is structurally correct', () => {
    const req: ActionOptionsRequest = {
      kind: 'item',
      name: 'Pozione di Guarigione',
      actorId: 'actor-abc',
      itemId: 'item-healing',
      requiresTarget: false,
    };
    const { modal } = makeModal({ request: req });
    expect(modal.id).toBe('action-options-modal');
  });
});

// ─── AOM-04: mount / unmount lifecycle ───────────────────────────────────────

describe('AOM-04: onMount / onUnmount lifecycle (T-4b-01-03 mitigation)', () => {
  it('onMount subscribes to gestureBus (bus.size() === 1)', async () => {
    const { modal, bus } = makeModal();
    expect(bus.size()).toBe(0);
    await modal.onMount();
    expect(bus.size()).toBe(1);
    await modal.onUnmount();
  });

  it('onUnmount unsubscribes from gestureBus (bus.size() === 0)', async () => {
    const { modal, bus } = makeModal();
    await modal.onMount();
    expect(bus.size()).toBe(1);
    await modal.onUnmount();
    expect(bus.size()).toBe(0);
  });

  it('onUnmount is idempotent (double-call safe)', async () => {
    const { modal, bus } = makeModal();
    await modal.onMount();
    await modal.onUnmount();
    await modal.onUnmount(); // second call — must not throw
    expect(bus.size()).toBe(0);
  });
});

// ─── AOM-05: tap + requiresTarget=false → emit + onClose ─────────────────────

describe('AOM-05: tap gesture — requiresTarget=false → tool.invoke emitted', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('tap on spell modal emits cast-spell tool.invoke envelope', async () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' });
    const ws = makeWs();
    const onClose = vi.fn();
    const { modal } = makeModal({
      ws,
      onClose,
      request: makeSpellRequest({ requiresTarget: false }),
    });
    await modal.onMount();
    modal.onEvent({ kind: 'tap' });
    expect(ws.send).toHaveBeenCalledTimes(1);
    const raw = ws.send.mock.calls[0]?.[0];
    expect(typeof raw).toBe('string');
    const parsed = JSON.parse(raw as string);
    expect(parsed.type).toBe('tool.invoke');
    expect(parsed.payload.toolId).toBe('cast-spell');
    expect(onClose).toHaveBeenCalledTimes(1);
    await modal.onUnmount();
    vi.unstubAllGlobals();
  });

  it('tap on item modal emits use-item tool.invoke envelope', async () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' });
    const ws = makeWs();
    const onClose = vi.fn();
    const { modal } = makeModal({
      ws,
      onClose,
      request: makeItemRequest({ requiresTarget: false }),
    });
    await modal.onMount();
    modal.onEvent({ kind: 'tap' });
    expect(ws.send).toHaveBeenCalledTimes(1);
    const raw = ws.send.mock.calls[0]?.[0];
    const parsed = JSON.parse(raw as string);
    expect(parsed.payload.toolId).toBe('use-item');
    expect(onClose).toHaveBeenCalledTimes(1);
    await modal.onUnmount();
    vi.unstubAllGlobals();
  });

  it('tap emits envelope with correct actor_id and spell_id', async () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' });
    const ws = makeWs();
    const req = makeSpellRequest({
      actorId: 'actor-hero',
      itemId: 'spell-fireball',
      requiresTarget: false,
    });
    const { modal } = makeModal({ ws, request: req });
    await modal.onMount();
    modal.onEvent({ kind: 'tap' });
    const raw = ws.send.mock.calls[0]?.[0];
    const parsed = JSON.parse(raw as string);
    expect(parsed.payload.args.actor_id).toBe('actor-hero');
    expect(parsed.payload.args.spell_id).toBe('spell-fireball');
    await modal.onUnmount();
    vi.unstubAllGlobals();
  });

  it('tap emits envelope with empty targets array', async () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' });
    const ws = makeWs();
    const { modal } = makeModal({ ws, request: makeSpellRequest({ requiresTarget: false }) });
    await modal.onMount();
    modal.onEvent({ kind: 'tap' });
    const raw = ws.send.mock.calls[0]?.[0];
    const parsed = JSON.parse(raw as string);
    expect(parsed.payload.args.targets).toEqual([]);
    await modal.onUnmount();
    vi.unstubAllGlobals();
  });

  it('envelope contains session_id', async () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' });
    const ws = makeWs();
    const { modal } = makeModal({
      ws,
      sessionId: VALID_SESSION_UUID,
      request: makeSpellRequest({ requiresTarget: false }),
    });
    await modal.onMount();
    modal.onEvent({ kind: 'tap' });
    const raw = ws.send.mock.calls[0]?.[0];
    const parsed = JSON.parse(raw as string);
    expect(parsed.session_id).toBe(VALID_SESSION_UUID);
    await modal.onUnmount();
    vi.unstubAllGlobals();
  });
});

// ─── AOM-06: double-tap → cancel (no emit) ───────────────────────────────────

describe('AOM-06: double-tap → cancel (onClose without emit)', () => {
  it('double-tap calls onClose without ws.send', async () => {
    const ws = makeWs();
    const onClose = vi.fn();
    const { modal } = makeModal({ ws, onClose });
    await modal.onMount();
    modal.onEvent({ kind: 'double-tap' });
    expect(ws.send).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
    await modal.onUnmount();
  });
});

// ─── AOM-07: long-press → console.warn (no-op for modal) ─────────────────────

describe('AOM-07: long-press → console.warn, no emit, no close', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('long-press triggers console.warn with action-options-modal in message', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ws = makeWs();
    const onClose = vi.fn();
    const { modal } = makeModal({ ws, onClose });
    await modal.onMount();
    modal.onEvent({ kind: 'long-press' });
    expect(ws.send).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const msg = warnSpy.mock.calls[0]?.[0];
    expect(String(msg)).toContain('action-options-modal');
    await modal.onUnmount();
  });
});

// ─── AOM-08: scroll → ignored ────────────────────────────────────────────────

describe('AOM-08: scroll gesture is ignored', () => {
  it('scroll-down → no-op (no ws.send, no onClose)', async () => {
    const ws = makeWs();
    const onClose = vi.fn();
    const { modal } = makeModal({ ws, onClose });
    await modal.onMount();
    modal.onEvent({ kind: 'scroll', direction: 'down' });
    expect(ws.send).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    await modal.onUnmount();
  });

  it('scroll-up → no-op', async () => {
    const ws = makeWs();
    const onClose = vi.fn();
    const { modal } = makeModal({ ws, onClose });
    await modal.onMount();
    modal.onEvent({ kind: 'scroll', direction: 'up' });
    expect(ws.send).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    await modal.onUnmount();
  });
});

// ─── AOM-09: getContainerCount ────────────────────────────────────────────────

describe('AOM-09: getContainerCount → { image: 0, text: 1 }', () => {
  it('returns Strategy A single text container footprint', () => {
    const { modal } = makeModal();
    expect(modal.getContainerCount()).toEqual({ image: 0, text: 1 });
  });
});

// ─── AOM-10: getR1Hints ───────────────────────────────────────────────────────

describe('AOM-10: getR1Hints → parsed from hud_r1_action_options', () => {
  it('returns an object with tap, scroll, longPressLabel string keys', () => {
    const { modal } = makeModal({ locale: 'it' });
    const hints = modal.getR1Hints();
    expect(typeof hints.tap).toBe('string');
    expect(typeof hints.scroll).toBe('string');
    expect(typeof hints.longPressLabel).toBe('string');
  });

  it('IT locale tap hint is non-empty', () => {
    const { modal } = makeModal({ locale: 'it' });
    const hints = modal.getR1Hints();
    expect(hints.tap.length).toBeGreaterThan(0);
  });
});

// ─── AOM-11: draw → bridge.textContainerUpgrade called ───────────────────────

describe('AOM-11: draw → single bridge.textContainerUpgrade call', () => {
  it('draw() calls bridge.textContainerUpgrade exactly once', async () => {
    const bridge = makeBridge();
    const { modal } = makeModal({ bridge });
    await modal.draw();
    expect(bridge.textContainerUpgrade).toHaveBeenCalledTimes(1);
  });

  it('draw() content contains the panel title frame character', async () => {
    const bridge = makeBridge();
    const { modal } = makeModal({ bridge });
    await modal.draw();
    const arg = bridge.textContainerUpgrade.mock.calls[0]?.[0] as { content?: string };
    expect(arg.content).toBeDefined();
    expect(arg.content).toContain('┌');
    expect(arg.content).toContain('┘');
  });
});

// ─── AOM-12: spell vs item label branching ────────────────────────────────────

describe('AOM-12: spell variant uses cast label; item variant uses use label', () => {
  it('spell request renders Lancia incantesimo in IT', async () => {
    const bridge = makeBridge();
    const { modal } = makeModal({ bridge, request: makeSpellRequest(), locale: 'it' });
    await modal.draw();
    const arg = bridge.textContainerUpgrade.mock.calls[0]?.[0] as { content?: string };
    expect(arg.content).toContain('Lancia incantesimo');
  });

  it('item request renders Usa oggetto in IT', async () => {
    const bridge = makeBridge();
    const { modal } = makeModal({ bridge, request: makeItemRequest(), locale: 'it' });
    await modal.draw();
    const arg = bridge.textContainerUpgrade.mock.calls[0]?.[0] as { content?: string };
    expect(arg.content).toContain('Usa oggetto');
  });

  it('spell request renders Cast spell in EN', async () => {
    const bridge = makeBridge();
    const { modal } = makeModal({ bridge, request: makeSpellRequest(), locale: 'en' });
    await modal.draw();
    const arg = bridge.textContainerUpgrade.mock.calls[0]?.[0] as { content?: string };
    expect(arg.content).toContain('Cast spell');
  });
});

// ─── AOM-13: W-4 envelope round-trip ─────────────────────────────────────────

describe('AOM-13: W-4 envelope round-trip (requiresTarget=false)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('emitted envelope passes EnvelopeSchema.safeParse', async () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' });
    const ws = makeWs();
    const { modal } = makeModal({ ws, request: makeSpellRequest({ requiresTarget: false }) });
    await modal.onMount();
    modal.onEvent({ kind: 'tap' });
    const raw = ws.send.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(raw);
    const result = EnvelopeSchema.safeParse(parsed);
    expect(result.success).toBe(true);
    await modal.onUnmount();
    vi.unstubAllGlobals();
  });

  it('emitted payload passes ToolInvocationEnvelopePayloadSchema.safeParse', async () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' });
    const ws = makeWs();
    const { modal } = makeModal({ ws, request: makeSpellRequest({ requiresTarget: false }) });
    await modal.onMount();
    modal.onEvent({ kind: 'tap' });
    const raw = ws.send.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(raw);
    const result = ToolInvocationEnvelopePayloadSchema.safeParse(parsed.payload);
    expect(result.success).toBe(true);
    await modal.onUnmount();
    vi.unstubAllGlobals();
  });

  it('emitted envelope has proto=evf-v1 and type=tool.invoke', async () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' });
    const ws = makeWs();
    const { modal } = makeModal({ ws, request: makeSpellRequest({ requiresTarget: false }) });
    await modal.onMount();
    modal.onEvent({ kind: 'tap' });
    const raw = ws.send.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(raw);
    expect(parsed.proto).toBe('evf-v1');
    expect(parsed.type).toBe('tool.invoke');
    await modal.onUnmount();
    vi.unstubAllGlobals();
  });
});

// ─── AOM-14: INV-1 spell fixture ─────────────────────────────────────────────

describe('AOM-14: INV-1 fixture — spell variant (Palla di Fuoco)', () => {
  it('spell modal draw matches action-options-modal.spell.it.txt fixture', async () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' });
    const bridge = makeBridge();
    const req = makeSpellRequest({ name: 'Palla di Fuoco', requiresTarget: false });
    const { modal } = makeModal({ bridge, request: req, locale: 'it' });
    await modal.draw();
    const arg = bridge.textContainerUpgrade.mock.calls[0]?.[0] as { content?: string };
    const grid = AsciiGrid.fromString(arg.content as string);
    matchAsciiFixture(grid, path.join(FIXTURES_DIR, 'action-options-modal.spell.it.txt'));
    vi.unstubAllGlobals();
  });
});

// ─── AOM-15: INV-1 item fixture ──────────────────────────────────────────────

describe('AOM-15: INV-1 fixture — item variant (Pozione di Guarigione)', () => {
  it('item modal draw matches action-options-modal.item.it.txt fixture', async () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' });
    const bridge = makeBridge();
    const req = makeItemRequest({ name: 'Pozione di Guarigione', requiresTarget: false });
    const { modal } = makeModal({ bridge, request: req, locale: 'it' });
    await modal.draw();
    const arg = bridge.textContainerUpgrade.mock.calls[0]?.[0] as { content?: string };
    const grid = AsciiGrid.fromString(arg.content as string);
    matchAsciiFixture(grid, path.join(FIXTURES_DIR, 'action-options-modal.item.it.txt'));
    vi.unstubAllGlobals();
  });
});

// ─── AOM-16: tap + requiresTarget=true → NO ws.send ─────────────────────────

describe('AOM-16: tap + requiresTarget=true → no ws.send (Plan 08-05 caller handles)', () => {
  it('ws.send is NOT called when requiresTarget=true', async () => {
    const ws = makeWs();
    const onClose = vi.fn();
    const { modal } = makeModal({
      ws,
      onClose,
      request: makeSpellRequest({ requiresTarget: true }),
    });
    await modal.onMount();
    modal.onEvent({ kind: 'tap' });
    expect(ws.send).not.toHaveBeenCalled();
    await modal.onUnmount();
  });

  it('onClose IS called when requiresTarget=true (caller orchestrates TargetPicker handoff)', async () => {
    const ws = makeWs();
    const onClose = vi.fn();
    const { modal } = makeModal({
      ws,
      onClose,
      request: makeSpellRequest({ requiresTarget: true }),
    });
    await modal.onMount();
    modal.onEvent({ kind: 'tap' });
    expect(onClose).toHaveBeenCalledTimes(1);
    await modal.onUnmount();
  });
});

// ─── AOM-PRE-01..06: Phase 9 Plan 09-02 client-side preconditioner ───────────
//
// Tests the new preconditioner inserted BEFORE the requiresTarget / emit branches
// in onEvent('tap'). The preconditioner reads getActionEconomyState(actorId) from
// the in-process cache and short-circuits if the required slot is already used.
//
// AOM-PRE-01: spell tap, actionsUsed:1 (and !multiAttack) → NO emit; toast enqueued
// AOM-PRE-02: spell tap, multiAttackInProgress:true → BYPASS check; emit as normal
// AOM-PRE-03: item tap, bonusActionsUsed:1 (and !multiAttack) → NO emit; toast enqueued
// AOM-PRE-04: economy state null → fail-open: emit proceeds (T-09-01 fail-open)
// AOM-PRE-05: requiresTarget=true path unchanged: tap closes + NO error toast
// AOM-PRE-06: error toast id is deterministic per actorId+kind
//
// @see packages/g2-app/src/panels/action-options-modal.ts onEvent('tap')
// @see packages/g2-app/src/panels/action-economy-state.ts getActionEconomyState
// @see .planning/phases/09-action-economy-edge-cases/09-02-PLAN.md Task 2
// ──────────────────────────────────────────────────────────────────────────────

describe('Phase 9 Plan 09-02 — ActionOptionsModal preconditioner (AOM-PRE-01..06)', () => {
  afterEach(() => {
    vi.mocked(getActionEconomyState).mockReturnValue(null);
    vi.clearAllMocks();
  });

  it('AOM-PRE-01: spell tap when actionsUsed:1 (no multi-attack) → NO ws.send; toast enqueued; onCloseCb called', async () => {
    vi.mocked(getActionEconomyState).mockReturnValue({
      actorId: 'actor-123',
      actionsUsed: 1,
      bonusActionsUsed: 0,
      reactionsUsed: 0,
      multiAttackInProgress: false,
      recipientUserId: 'user-1',
    });
    const ws = makeWs();
    const onClose = vi.fn();
    const toastQueue = makeToastQueue();
    const { modal } = makeModal({
      ws,
      onClose,
      toastQueue,
      request: makeSpellRequest({ requiresTarget: false }),
    });
    await modal.onMount();
    modal.onEvent({ kind: 'tap' });

    expect(ws.send).not.toHaveBeenCalled();
    expect(toastQueue.enqueue).toHaveBeenCalledOnce();
    const toastArg = toastQueue.enqueue.mock.calls[0]?.[0] as { severity: string; message: string };
    expect(toastArg.severity).toBe('error');
    expect(toastArg.message).toContain('Azione già usata'); // IT locale error message
    expect(onClose).toHaveBeenCalledOnce();
    await modal.onUnmount();
  });

  it('AOM-PRE-02: spell tap with multiAttackInProgress:true → BYPASS preconditioner; emit proceeds normally', async () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'test-uuid-multi' });
    vi.mocked(getActionEconomyState).mockReturnValue({
      actorId: 'actor-123',
      actionsUsed: 1,
      bonusActionsUsed: 0,
      reactionsUsed: 0,
      multiAttackInProgress: true, // multi-attack in progress → bypass
      recipientUserId: 'user-1',
    });
    const ws = makeWs();
    const onClose = vi.fn();
    const toastQueue = makeToastQueue();
    const { modal } = makeModal({
      ws,
      onClose,
      toastQueue,
      request: makeSpellRequest({ requiresTarget: false }),
    });
    await modal.onMount();
    modal.onEvent({ kind: 'tap' });

    // Preconditioner bypassed → normal emit
    expect(ws.send).toHaveBeenCalledOnce();
    expect(toastQueue.enqueue).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
    await modal.onUnmount();
  });

  it('AOM-PRE-03: item tap when bonusActionsUsed:1 (no multi-attack) → NO ws.send; toast for bonus slot', async () => {
    vi.mocked(getActionEconomyState).mockReturnValue({
      actorId: 'actor-123',
      actionsUsed: 0,
      bonusActionsUsed: 1,
      reactionsUsed: 0,
      multiAttackInProgress: false,
      recipientUserId: 'user-1',
    });
    const ws = makeWs();
    const onClose = vi.fn();
    const toastQueue = makeToastQueue();
    const { modal } = makeModal({
      ws,
      onClose,
      toastQueue,
      request: makeItemRequest({ requiresTarget: false }),
    });
    await modal.onMount();
    modal.onEvent({ kind: 'tap' });

    expect(ws.send).not.toHaveBeenCalled();
    expect(toastQueue.enqueue).toHaveBeenCalledOnce();
    const toastArg = toastQueue.enqueue.mock.calls[0]?.[0] as { severity: string; message: string };
    expect(toastArg.severity).toBe('error');
    expect(toastArg.message).toContain('Bonus già usato'); // IT locale bonus error
    expect(onClose).toHaveBeenCalledOnce();
    await modal.onUnmount();
  });

  it('AOM-PRE-04: getActionEconomyState returns null → fail-open: emit proceeds (T-09-01)', async () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'test-uuid-null-econ' });
    // Default mock returns null (no economy state seen yet)
    vi.mocked(getActionEconomyState).mockReturnValue(null);
    const ws = makeWs();
    const onClose = vi.fn();
    const toastQueue = makeToastQueue();
    const { modal } = makeModal({
      ws,
      onClose,
      toastQueue,
      request: makeSpellRequest({ requiresTarget: false }),
    });
    await modal.onMount();
    modal.onEvent({ kind: 'tap' });

    // Fail-open: no cache → emit as normal
    expect(ws.send).toHaveBeenCalledOnce();
    expect(toastQueue.enqueue).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
    await modal.onUnmount();
  });

  it('AOM-PRE-05: requiresTarget=true path unchanged — tap closes; NO error toast (target picker takes over)', async () => {
    vi.mocked(getActionEconomyState).mockReturnValue({
      actorId: 'actor-123',
      actionsUsed: 1,
      bonusActionsUsed: 0,
      reactionsUsed: 0,
      multiAttackInProgress: false,
      recipientUserId: 'user-1',
    });
    const ws = makeWs();
    const onClose = vi.fn();
    const toastQueue = makeToastQueue();
    const { modal } = makeModal({
      ws,
      onClose,
      toastQueue,
      request: makeSpellRequest({ requiresTarget: true }), // target picker flow
    });
    await modal.onMount();
    modal.onEvent({ kind: 'tap' });

    // requiresTarget=true → preconditioner fires BEFORE requiresTarget check
    // The plan specifies preconditioner runs before both branches
    // When requiresTarget=true AND actionsUsed=1: preconditioner blocks (no toast in target-picker path?
    // ACTUALLY per plan: requiresTarget=true means tap closes WITHOUT emitting → preconditioner
    // short-circuits first, but plan says "requiresTarget=true path unchanged" (AOM-PRE-05).
    // RESOLUTION: The preconditioner only checks spell/item slots WHEN requiresTarget=false.
    // When requiresTarget=true the tap closes via onClose() — no emission anyway, so
    // preconditioner is irrelevant (no slot would be consumed). Test asserts no error toast.
    expect(toastQueue.enqueue).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
    await modal.onUnmount();
  });

  it('AOM-PRE-06: error toast id is deterministic format action-precond-{actorId}-{kind}', async () => {
    vi.mocked(getActionEconomyState).mockReturnValue({
      actorId: 'actor-123',
      actionsUsed: 1,
      bonusActionsUsed: 0,
      reactionsUsed: 0,
      multiAttackInProgress: false,
      recipientUserId: 'user-1',
    });
    const toastQueue = makeToastQueue();
    const { modal } = makeModal({
      toastQueue,
      request: makeSpellRequest({ actorId: 'actor-123', requiresTarget: false }),
    });
    await modal.onMount();
    modal.onEvent({ kind: 'tap' });

    const toastArg = toastQueue.enqueue.mock.calls[0]?.[0] as { id: string };
    // id must start with the deterministic prefix for dedup
    expect(toastArg.id).toMatch(/^action-precond-actor-123-action-/);
    await modal.onUnmount();
  });
});

// ─── AOM-RETRY-01..02: Plan 09-03 concentration retry cache caching ───────────
//
// Tests that ActionOptionsModal calls cacheRetryEnvelope BEFORE ws.send in the
// tap requiresTarget=false path. This allows action-result-dispatcher to mark
// the entry confirmed when the cast fails with 'concentration-required', enabling
// ConcentrationDropModalPanel [Y] tap to re-dispatch via consumeLatestConfirmed().
//
// AOM-RETRY-01: tap requiresTarget=false → cacheRetryEnvelope called BEFORE ws.send
// AOM-RETRY-02: tap with preconditioner BLOCK → cacheRetryEnvelope NOT called (no envelope emitted)

describe('Phase 9 Plan 09-03 — ActionOptionsModal retry cache integration (AOM-RETRY)', () => {
  afterEach(() => {
    vi.mocked(getActionEconomyState).mockReset();
    vi.mocked(getActionEconomyState).mockReturnValue(null);
    vi.mocked(cacheRetryEnvelope).mockClear();
  });

  it('AOM-RETRY-01: tap requiresTarget=false → cacheRetryEnvelope called BEFORE ws.send', async () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'test-uuid-retry-01' });
    vi.mocked(getActionEconomyState).mockReturnValue(null); // fail-open

    const callOrder: string[] = [];
    const ws = {
      send: vi.fn((_data: string) => { callOrder.push('ws.send'); }) as unknown as ReturnType<typeof vi.fn<(data: string) => void>>,
    } as MockWs;
    vi.mocked(cacheRetryEnvelope).mockImplementation(() => {
      callOrder.push('cacheRetryEnvelope');
    });

    const { modal } = makeModal({
      ws,
      request: makeSpellRequest({ requiresTarget: false }),
    });
    await modal.onMount();
    modal.onEvent({ kind: 'tap' });

    // cacheRetryEnvelope must be called (AOM-RETRY-01)
    expect(cacheRetryEnvelope).toHaveBeenCalledOnce();

    // Verify order: cache BEFORE send
    expect(callOrder[0]).toBe('cacheRetryEnvelope');
    expect(callOrder[1]).toBe('ws.send');

    // cacheRetryEnvelope called with idempotencyKey + envelope + 'unconfirmed'
    const cacheArgs = vi.mocked(cacheRetryEnvelope).mock.calls[0];
    expect(cacheArgs?.[0]).toBe('test-uuid-retry-01'); // idemKey
    expect(cacheArgs?.[2]).toBe('unconfirmed'); // status
    // Envelope shape: verify idempotencyKey is threaded
    const envelope = cacheArgs?.[1] as { payload?: { idempotencyKey?: string } };
    expect(envelope.payload?.idempotencyKey).toBe('test-uuid-retry-01');

    vi.unstubAllGlobals();
    await modal.onUnmount();
  });

  it('AOM-RETRY-02: tap with preconditioner BLOCK → cacheRetryEnvelope NOT called (no envelope emitted)', async () => {
    vi.mocked(getActionEconomyState).mockReturnValue({
      actorId: 'actor-123',
      actionsUsed: 1,
      bonusActionsUsed: 0,
      reactionsUsed: 0,
      multiAttackInProgress: false,
      recipientUserId: 'user-1',
    });

    const ws = makeWs();
    const toastQueue = makeToastQueue();
    const { modal } = makeModal({
      ws,
      toastQueue,
      request: makeSpellRequest({ requiresTarget: false }),
    });
    await modal.onMount();
    modal.onEvent({ kind: 'tap' });

    // Preconditioner blocks: NO ws.send, NO cacheRetryEnvelope
    expect(ws.send).not.toHaveBeenCalled();
    expect(cacheRetryEnvelope).not.toHaveBeenCalled();
    // But toast IS enqueued
    expect(toastQueue.enqueue).toHaveBeenCalledOnce();
    await modal.onUnmount();
  });
});

// ─── Plan 09-04: requiresSlotPicker + defaultSlotLevel tests ─────────────────

describe('AOM-SLOT: requiresSlotPicker flag + defaultSlotLevel forwarding (Plan 09-04)', () => {
  beforeEach(() => {
    vi.mocked(getActionEconomyState).mockReturnValue(null);
    vi.mocked(cacheRetryEnvelope).mockReset();
  });

  /**
   * AOM-SLOT-01: spell + requiresSlotPicker === true + availableSlots.length > 1 →
   * tap calls onCloseCb WITHOUT emitting (caller intercepts and opens SlotPickerPanel).
   */
  it('AOM-SLOT-01: requiresSlotPicker=true → tap closes WITHOUT emitting', async () => {
    const ws = makeWs();
    const onClose = vi.fn();
    const { modal } = makeModal({
      ws,
      onClose,
      request: makeSpellRequest({
        requiresTarget: false,
        requiresSlotPicker: true,
        defaultSlotLevel: 3,
      }),
    });
    await modal.onMount();
    modal.onEvent({ kind: 'tap' });
    expect(ws.send).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
    await modal.onUnmount();
  });

  /**
   * AOM-SLOT-02: spell + requiresSlotPicker === false → tap emits with slot_level
   * included in args (defaultSlotLevel = 3).
   */
  it('AOM-SLOT-02: requiresSlotPicker=false → tap emits with slot_level in args', async () => {
    vi.stubGlobal('crypto', {
      randomUUID: () => '55555555-5555-4555-8555-555555555555',
    });
    const ws = makeWs();
    const { modal } = makeModal({
      ws,
      request: makeSpellRequest({
        requiresTarget: false,
        requiresSlotPicker: false,
        defaultSlotLevel: 3,
      }),
    });
    await modal.onMount();
    modal.onEvent({ kind: 'tap' });
    expect(ws.send).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(ws.send.mock.calls[0]![0] as string) as {
      payload: { args: { slot_level: number } };
    };
    expect(sent.payload.args.slot_level).toBe(3);
    vi.unstubAllGlobals();
    await modal.onUnmount();
  });

  /**
   * AOM-SLOT-03: cantrip case (defaultSlotLevel=0, requiresSlotPicker=false) →
   * tap emits with slot_level: 0.
   */
  it('AOM-SLOT-03 (cantrip): requiresSlotPicker=false, defaultSlotLevel=0 → emits slot_level: 0', async () => {
    vi.stubGlobal('crypto', {
      randomUUID: () => '66666666-6666-4666-8666-666666666666',
    });
    const ws = makeWs();
    const { modal } = makeModal({
      ws,
      request: makeSpellRequest({
        requiresTarget: false,
        requiresSlotPicker: false,
        defaultSlotLevel: 0,
      }),
    });
    await modal.onMount();
    modal.onEvent({ kind: 'tap' });
    expect(ws.send).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(ws.send.mock.calls[0]![0] as string) as {
      payload: { args: { slot_level: number } };
    };
    expect(sent.payload.args.slot_level).toBe(0);
    vi.unstubAllGlobals();
    await modal.onUnmount();
  });

  /**
   * AOM-SLOT-04: item action — requiresSlotPicker is ignored (no slot_level in args).
   */
  it('AOM-SLOT-04: item action — slot_level NOT added (use-item schema has no slot_level)', async () => {
    vi.stubGlobal('crypto', {
      randomUUID: () => '77777777-7777-4777-8777-777777777777',
    });
    const ws = makeWs();
    const { modal } = makeModal({
      ws,
      request: makeItemRequest({
        requiresTarget: false,
      }),
    });
    await modal.onMount();
    modal.onEvent({ kind: 'tap' });
    expect(ws.send).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(ws.send.mock.calls[0]![0] as string) as {
      payload: { args: Record<string, unknown> };
    };
    expect(sent.payload.args).not.toHaveProperty('slot_level');
    vi.unstubAllGlobals();
    await modal.onUnmount();
  });

  /**
   * AOM-SLOT-05: existing preconditioner tests still pass — preconditioner runs
   * BEFORE the slot-picker branch.
   */
  it('AOM-SLOT-05: preconditioner fires BEFORE requiresSlotPicker check', async () => {
    vi.mocked(getActionEconomyState).mockReturnValue({
      actorId: 'actor-123',
      actionsUsed: 1,
      bonusActionsUsed: 0,
      reactionsUsed: 0,
      multiAttackInProgress: false,
      recipientUserId: 'user-1',
    });
    const ws = makeWs();
    const onClose = vi.fn();
    const toastQueue = makeToastQueue();
    const { modal } = makeModal({
      ws,
      onClose,
      toastQueue,
      request: makeSpellRequest({
        requiresTarget: false,
        requiresSlotPicker: true, // would open slot picker — but preconditioner fires first
        defaultSlotLevel: 3,
      }),
    });
    await modal.onMount();
    modal.onEvent({ kind: 'tap' });
    // Preconditioner fires: toast enqueued, NO ws.send
    expect(toastQueue.enqueue).toHaveBeenCalledOnce();
    expect(ws.send).not.toHaveBeenCalled();
    // onClose IS called (preconditioner path calls onCloseCb)
    expect(onClose).toHaveBeenCalledTimes(1);
    await modal.onUnmount();
  });
});
