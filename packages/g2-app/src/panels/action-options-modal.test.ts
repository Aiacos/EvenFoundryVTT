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
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PanelGestureBus } from '../engine/panel-gesture-bus.js';
import {
  ActionOptionsModal,
  type ActionOptionsRequest,
  type ActionOptionsWebSocket,
} from './action-options-modal.js';

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

function makeModal(opts: {
  bridge?: EvenAppBridge & { textContainerUpgrade: ReturnType<typeof vi.fn> };
  ws?: MockWs;
  bus?: PanelGestureBus;
  request?: ActionOptionsRequest;
  locale?: 'it' | 'en' | 'de';
  sessionId?: string;
  onClose?: () => void;
} = {}) {
  const bridge = opts.bridge ?? makeBridge();
  const ws = opts.ws ?? makeWs();
  const bus = opts.bus ?? new PanelGestureBus();
  const request = opts.request ?? makeSpellRequest();
  const locale = opts.locale ?? 'it';
  const sessionId = opts.sessionId ?? VALID_SESSION_UUID;
  const onClose = opts.onClose ?? vi.fn();
  const modal = new ActionOptionsModal(bridge, ws, bus, request, locale, sessionId, onClose);
  return { modal, bridge, ws, bus, request, locale, sessionId, onClose };
}

// ─── AOM-01: id + no static meta ─────────────────────────────────────────────

describe('AOM-01: panel identity', () => {
  it('id === "action-options-modal"', () => {
    const { modal } = makeModal();
    expect(modal.id).toBe('action-options-modal');
  });

  it('no static meta property (system overlay — not router-discoverable)', () => {
    expect((ActionOptionsModal as Record<string, unknown>)['meta']).toBeUndefined();
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
    const { modal } = makeModal({ ws, onClose, request: makeSpellRequest({ requiresTarget: false }) });
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
    const { modal } = makeModal({ ws, onClose, request: makeItemRequest({ requiresTarget: false }) });
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
    const req = makeSpellRequest({ actorId: 'actor-hero', itemId: 'spell-fireball', requiresTarget: false });
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
    const { modal } = makeModal({ ws, sessionId: VALID_SESSION_UUID, request: makeSpellRequest({ requiresTarget: false }) });
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
    const { modal } = makeModal({ ws, onClose, request: makeSpellRequest({ requiresTarget: true }) });
    await modal.onMount();
    modal.onEvent({ kind: 'tap' });
    expect(ws.send).not.toHaveBeenCalled();
    await modal.onUnmount();
  });

  it('onClose IS called when requiresTarget=true (caller orchestrates TargetPicker handoff)', async () => {
    const ws = makeWs();
    const onClose = vi.fn();
    const { modal } = makeModal({ ws, onClose, request: makeSpellRequest({ requiresTarget: true }) });
    await modal.onMount();
    modal.onEvent({ kind: 'tap' });
    expect(onClose).toHaveBeenCalledTimes(1);
    await modal.onUnmount();
  });
});
