/**
 * Unit tests for SlotPickerPanel (Plan 09-04, Task 1 — SPP-01..12 + I18N-09-04).
 *
 * Covers:
 *   SPP-01: implements OverlayPanel; id === 'slot-picker'; getContainerCount() === { image: 0, text: 1 }
 *   SPP-02: onMount subscribes to gestureBus; onUnmount unsubscribes idempotently
 *   SPP-03: draw() issues single bridge.textContainerUpgrade with frame matching IT default fixture
 *   SPP-04: R1 scroll advances selection cyclically; wraps from last to first
 *   SPP-05: R1 tap emits canonical tool.invoke envelope with payload.toolId === 'cast-spell'
 *           AND payload.args.slot_level === selected level; calls onCloseCb; deterministic
 *           idempotencyKey via crypto.randomUUID()
 *   SPP-06: R1 long-press is ignored (no emit, no close)
 *   SPP-07: R1 double-tap calls onCloseCb WITHOUT emitting
 *   SPP-08: empty availableSlots throws at construction (precondition violation T-09-06)
 *   SPP-09: availableSlots filtered to only entries where value > 0 (caller responsibility —
 *           test verifies panel renders what it is given, including zero-value entries,
 *           meaning the caller MUST pre-filter)
 *   SPP-10: default selection is index 0 in the filtered availableSlots
 *   SPP-11: cast envelope round-trips through EnvelopeSchema.safeParse AND
 *           ToolInvocationEnvelopePayloadSchema.safeParse AND CastSpellInputSchema.safeParse
 *   SPP-12: 4 INV-1 fixtures via matchAsciiFixture
 *           - slot-picker.fireball-3rd-default.it.txt (default selection row 0 = 3rd level)
 *           - slot-picker.fireball-4th-upcast.it.txt  (post-scroll, selection on 4th)
 *           - slot-picker.empty-only-base.it.txt      (single-slot edge case render)
 *           - slot-picker-en.txt                      (EN locale)
 *   I18N-09-04: i18n keys exist + within budget (slot_picker.title, base_level,
 *               available_template, upcast_template, confirm_hint, cancel_hint,
 *               hud_r1_slot_picker)
 *
 * @see packages/g2-app/src/panels/slot-picker-panel.ts
 * @see .planning/phases/09-action-economy-edge-cases/09-04-PLAN.md Task 1
 * @see .planning/phases/09-action-economy-edge-cases/09-CONTEXT.md §Area 2 (mockup)
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';
import {
  CastSpellInputSchema,
  EnvelopeSchema,
  ToolInvocationEnvelopePayloadSchema,
} from '@evf/shared-protocol';
import { AsciiGrid, matchAsciiFixture } from '@evf/shared-render';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PanelGestureBus } from '../engine/panel-gesture-bus.js';
import { HUD_WIDTH_BUDGETS } from '../status-hud/i18n-budgets.js';
import {
  SlotPickerPanel,
  type SlotPickerRequest,
  type SlotPickerWebSocket,
} from './slot-picker-panel.js';

// ─── Paths ────────────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.resolve(__dirname, '../../../../packages/shared-render/src/fixtures');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const VALID_SESSION_UUID = '33333333-3333-4333-8333-333333333333';

function makeBridge() {
  return {
    textContainerUpgrade: vi.fn().mockResolvedValue(undefined),
    updateImageRawData: vi.fn().mockResolvedValue(undefined),
    createTextContainer: vi.fn().mockResolvedValue(undefined),
  } as unknown as EvenAppBridge & { textContainerUpgrade: ReturnType<typeof vi.fn> };
}

type MockWs = SlotPickerWebSocket & { send: ReturnType<typeof vi.fn<(data: string) => void>> };
function makeWs(): MockWs {
  return { send: vi.fn<(data: string) => void>() };
}

/**
 * Fireball scenario: base level 3, available slots [3,4,5] (all non-empty).
 * Default selection = index 0 = 3rd level.
 */
function makeFireballRequest(overrides: Partial<SlotPickerRequest> = {}): SlotPickerRequest {
  return {
    actorId: 'actor-123',
    spellId: 'spell-fireball',
    spellName: 'Palla di Fuoco',
    baseLevel: 3,
    availableSlots: [
      { level: 3, value: 2, max: 4 },
      { level: 4, value: 3, max: 3 },
      { level: 5, value: 1, max: 2 },
    ],
    ...overrides,
  };
}

function makePanel(
  opts: {
    request?: SlotPickerRequest;
    locale?: 'it' | 'en' | 'de';
    ws?: MockWs;
    bridge?: ReturnType<typeof makeBridge>;
    onClose?: () => void;
  } = {},
) {
  const bridge = opts.bridge ?? makeBridge();
  const ws = opts.ws ?? makeWs();
  const gestureBus = new PanelGestureBus();
  const request = opts.request ?? makeFireballRequest();
  const locale = opts.locale ?? 'it';
  const onClose = opts.onClose ?? vi.fn();
  const panel = new SlotPickerPanel(
    bridge,
    ws,
    gestureBus,
    request,
    locale,
    VALID_SESSION_UUID,
    onClose,
  );
  return { panel, bridge, ws, gestureBus, onClose };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('SlotPickerPanel', () => {
  beforeEach(() => {
    vi.stubGlobal('crypto', {
      randomUUID: () => '44444444-4444-4444-8444-444444444444',
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // SPP-01: Basic contracts
  // ──────────────────────────────────────────────────────────────────────────

  it('SPP-01: id === slot-picker; getContainerCount === { image: 0, text: 1 }', () => {
    const { panel } = makePanel();
    expect(panel.id).toBe('slot-picker');
    expect(panel.getContainerCount()).toEqual({ image: 0, text: 1 });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // SPP-02: Lifecycle — subscribe / unsubscribe
  // ──────────────────────────────────────────────────────────────────────────

  it('SPP-02a: onMount subscribes to gestureBus', async () => {
    const { panel, gestureBus } = makePanel();
    expect(gestureBus.size()).toBe(0);
    await panel.onMount();
    expect(gestureBus.size()).toBe(1);
    await panel.onUnmount();
  });

  it('SPP-02b: onUnmount unsubscribes; second call is idempotent', async () => {
    const { panel, gestureBus } = makePanel();
    await panel.onMount();
    await panel.onUnmount();
    expect(gestureBus.size()).toBe(0);
    // Idempotent second call must not throw
    await expect(panel.onUnmount()).resolves.toBeUndefined();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // SPP-03: draw() calls bridge.textContainerUpgrade
  // ──────────────────────────────────────────────────────────────────────────

  it('SPP-03: draw() calls bridge.textContainerUpgrade exactly once', async () => {
    const { panel, bridge } = makePanel();
    await panel.draw();
    expect(bridge.textContainerUpgrade).toHaveBeenCalledTimes(1);
  });

  it('SPP-03b: draw() produces a 14-row frame each 70 chars wide', async () => {
    const { panel, bridge } = makePanel();
    await panel.draw();
    const call = (bridge.textContainerUpgrade as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call).toBeDefined();
    const payload = call![0] as { content?: string };
    expect(payload.content).toBeDefined();
    const lines = (payload.content as string).split('\n');
    expect(lines).toHaveLength(14);
    for (const line of lines) {
      expect([...line].length).toBe(70);
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // SPP-04: R1 scroll advances selection cyclically
  // ──────────────────────────────────────────────────────────────────────────

  it('SPP-04a: scroll-down advances selectedIdx to 1', async () => {
    const { panel, gestureBus } = makePanel();
    await panel.onMount();
    expect(panel._getSelectedIdxForTest()).toBe(0);
    gestureBus.publish({ kind: 'scroll', direction: 'down' });
    expect(panel._getSelectedIdxForTest()).toBe(1);
    await panel.onUnmount();
  });

  it('SPP-04b: scroll from last wraps to first (cycle)', async () => {
    const { panel, gestureBus } = makePanel();
    await panel.onMount();
    // Advance to index 2 (last)
    gestureBus.publish({ kind: 'scroll', direction: 'down' });
    gestureBus.publish({ kind: 'scroll', direction: 'down' });
    expect(panel._getSelectedIdxForTest()).toBe(2);
    // One more scroll wraps to 0
    gestureBus.publish({ kind: 'scroll', direction: 'down' });
    expect(panel._getSelectedIdxForTest()).toBe(0);
    await panel.onUnmount();
  });

  it('SPP-04c: scroll-up also advances (MVP simple — any scroll = next)', async () => {
    const { panel, gestureBus } = makePanel();
    await panel.onMount();
    expect(panel._getSelectedIdxForTest()).toBe(0);
    gestureBus.publish({ kind: 'scroll', direction: 'up' });
    expect(panel._getSelectedIdxForTest()).toBe(1);
    await panel.onUnmount();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // SPP-05: tap emits tool.invoke with correct slot_level
  // ──────────────────────────────────────────────────────────────────────────

  it('SPP-05a: tap at default selection emits cast-spell with slot_level 3', async () => {
    const ws = makeWs();
    const onClose = vi.fn();
    const { panel, gestureBus } = makePanel({ ws, onClose });
    await panel.onMount();
    gestureBus.publish({ kind: 'tap' });
    expect(ws.send).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(ws.send.mock.calls[0]![0] as string) as {
      payload: { toolId: string; args: { slot_level: number } };
    };
    expect(sent.payload.toolId).toBe('cast-spell');
    expect(sent.payload.args.slot_level).toBe(3);
    expect(onClose).toHaveBeenCalledTimes(1);
    await panel.onUnmount();
  });

  it('SPP-05b: tap after one scroll emits slot_level 4', async () => {
    const ws = makeWs();
    const { panel, gestureBus } = makePanel({ ws });
    await panel.onMount();
    gestureBus.publish({ kind: 'scroll', direction: 'down' });
    gestureBus.publish({ kind: 'tap' });
    const sent = JSON.parse(ws.send.mock.calls[0]![0] as string) as {
      payload: { args: { slot_level: number } };
    };
    expect(sent.payload.args.slot_level).toBe(4);
    await panel.onUnmount();
  });

  it('SPP-05c: tap includes idempotencyKey from crypto.randomUUID()', async () => {
    const ws = makeWs();
    const { panel, gestureBus } = makePanel({ ws });
    await panel.onMount();
    gestureBus.publish({ kind: 'tap' });
    const sent = JSON.parse(ws.send.mock.calls[0]![0] as string) as {
      payload: { idempotencyKey: string };
    };
    expect(sent.payload.idempotencyKey).toBe('44444444-4444-4444-8444-444444444444');
    await panel.onUnmount();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // SPP-06: long-press is ignored
  // ──────────────────────────────────────────────────────────────────────────

  it('SPP-06: long-press does NOT emit or close (panel-level no-op)', async () => {
    const ws = makeWs();
    const onClose = vi.fn();
    const { panel, gestureBus } = makePanel({ ws, onClose });
    await panel.onMount();
    gestureBus.publish({ kind: 'long-press' });
    expect(ws.send).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    await panel.onUnmount();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // SPP-07: double-tap cancels without emitting
  // ──────────────────────────────────────────────────────────────────────────

  it('SPP-07: double-tap calls onCloseCb WITHOUT ws.send', async () => {
    const ws = makeWs();
    const onClose = vi.fn();
    const { panel, gestureBus } = makePanel({ ws, onClose });
    await panel.onMount();
    gestureBus.publish({ kind: 'double-tap' });
    expect(ws.send).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
    await panel.onUnmount();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // SPP-08: empty availableSlots throws at construction
  // ──────────────────────────────────────────────────────────────────────────

  it('SPP-08: constructing with empty availableSlots throws (T-09-06 precondition)', () => {
    expect(() =>
      makePanel({ request: makeFireballRequest({ availableSlots: [] }) }),
    ).toThrow(/availableSlots must not be empty/);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // SPP-09: panel renders what it receives (caller must pre-filter value > 0)
  // ──────────────────────────────────────────────────────────────────────────

  it('SPP-09: panel renders all provided slots including zero-value (caller pre-filters)', async () => {
    // The panel ITSELF does not filter — it renders whatever is passed.
    // This test documents the contract: caller must pass only value > 0 slots.
    const request = makeFireballRequest({
      availableSlots: [
        { level: 3, value: 2, max: 4 },
        { level: 4, value: 0, max: 3 }, // zero remaining — caller should exclude this
      ],
    });
    const bridge = makeBridge();
    const { panel } = makePanel({ request, bridge });
    await panel.draw();
    const call = (bridge.textContainerUpgrade as ReturnType<typeof vi.fn>).mock.calls[0];
    const content = (call![0] as { content: string }).content;
    // Both rows appear (panel does not filter by value)
    expect(content).toContain('3°');
    expect(content).toContain('4°');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // SPP-10: default selection = index 0
  // ──────────────────────────────────────────────────────────────────────────

  it('SPP-10: default selectedIdx is 0 (base level row per caller pre-sort)', () => {
    const { panel } = makePanel();
    expect(panel._getSelectedIdxForTest()).toBe(0);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // SPP-11: envelope round-trip validation
  // ──────────────────────────────────────────────────────────────────────────

  it('SPP-11: emitted envelope passes EnvelopeSchema + ToolInvocationPayloadSchema + CastSpellInputSchema', async () => {
    const ws = makeWs();
    const { panel, gestureBus } = makePanel({ ws });
    await panel.onMount();
    gestureBus.publish({ kind: 'tap' });
    const raw = JSON.parse(ws.send.mock.calls[0]![0] as string) as unknown;

    // 1. EnvelopeSchema
    const envResult = EnvelopeSchema.safeParse(raw);
    expect(envResult.success, `EnvelopeSchema failed: ${JSON.stringify(envResult)}`).toBe(true);

    // 2. ToolInvocationEnvelopePayloadSchema
    const payloadResult = ToolInvocationEnvelopePayloadSchema.safeParse(
      (raw as { payload: unknown }).payload,
    );
    expect(
      payloadResult.success,
      `ToolInvocationPayloadSchema failed: ${JSON.stringify(payloadResult)}`,
    ).toBe(true);

    // 3. CastSpellInputSchema
    const argsResult = CastSpellInputSchema.safeParse(
      (raw as { payload: { args: unknown } }).payload.args,
    );
    expect(
      argsResult.success,
      `CastSpellInputSchema failed: ${JSON.stringify(argsResult)}`,
    ).toBe(true);

    await panel.onUnmount();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // SPP-12: INV-1 fixture round-trips
  // ──────────────────────────────────────────────────────────────────────────

  it('SPP-12a: IT fixture — fireball 3rd level default selection', async () => {
    const bridge = makeBridge();
    const { panel } = makePanel({ bridge, locale: 'it' });
    await panel.draw();
    const call = (bridge.textContainerUpgrade as ReturnType<typeof vi.fn>).mock.calls[0];
    const content = (call![0] as { content: string }).content;
    const grid = AsciiGrid.fromString(content);
    await matchAsciiFixture(
      grid,
      path.join(FIXTURES_DIR, 'slot-picker.fireball-3rd-default.it.txt'),
    );
  });

  it('SPP-12b: IT fixture — fireball 4th level upcast (post-scroll)', async () => {
    const bridge = makeBridge();
    const ws = makeWs();
    const { panel, gestureBus } = makePanel({ bridge, ws, locale: 'it' });
    await panel.onMount();
    gestureBus.publish({ kind: 'scroll', direction: 'down' });
    // draw() was called internally by the scroll handler; read last call
    const call = (bridge.textContainerUpgrade as ReturnType<typeof vi.fn>).mock.calls.at(-1);
    const content = (call![0] as { content: string }).content;
    const grid = AsciiGrid.fromString(content);
    await matchAsciiFixture(
      grid,
      path.join(FIXTURES_DIR, 'slot-picker.fireball-4th-upcast.it.txt'),
    );
    await panel.onUnmount();
  });

  it('SPP-12c: IT fixture — single-slot edge case render (empty-only-base)', async () => {
    const bridge = makeBridge();
    const request = makeFireballRequest({
      availableSlots: [{ level: 3, value: 2, max: 4 }],
    });
    const { panel } = makePanel({ bridge, request, locale: 'it' });
    await panel.draw();
    const call = (bridge.textContainerUpgrade as ReturnType<typeof vi.fn>).mock.calls[0];
    const content = (call![0] as { content: string }).content;
    const grid = AsciiGrid.fromString(content);
    await matchAsciiFixture(
      grid,
      path.join(FIXTURES_DIR, 'slot-picker.empty-only-base.it.txt'),
    );
  });

  it('SPP-12d: EN fixture — fireball 3rd level default selection (EN locale)', async () => {
    const bridge = makeBridge();
    const { panel } = makePanel({ bridge, locale: 'en' });
    await panel.draw();
    const call = (bridge.textContainerUpgrade as ReturnType<typeof vi.fn>).mock.calls[0];
    const content = (call![0] as { content: string }).content;
    const grid = AsciiGrid.fromString(content);
    await matchAsciiFixture(grid, path.join(FIXTURES_DIR, 'slot-picker-en.txt'));
  });

  // ──────────────────────────────────────────────────────────────────────────
  // I18N-09-04: i18n keys exist + within budget
  // ──────────────────────────────────────────────────────────────────────────

  it('I18N-09-04a: slot_picker.title key exists with max 14', () => {
    const row = HUD_WIDTH_BUDGETS['slot_picker.title'];
    expect(row).toBeDefined();
    expect(row.max).toBe(14);
    expect([...row.it].length).toBeLessThanOrEqual(row.max);
    expect([...row.en].length).toBeLessThanOrEqual(row.max);
    expect([...row.de].length).toBeLessThanOrEqual(row.max);
  });

  it('I18N-09-04b: slot_picker.base_level key exists with max 14', () => {
    const row = HUD_WIDTH_BUDGETS['slot_picker.base_level'];
    expect(row).toBeDefined();
    expect(row.max).toBe(14);
    expect([...row.it].length).toBeLessThanOrEqual(row.max);
    expect([...row.en].length).toBeLessThanOrEqual(row.max);
    expect([...row.de].length).toBeLessThanOrEqual(row.max);
  });

  it('I18N-09-04c: slot_picker.available_template key exists with max 24', () => {
    const row = HUD_WIDTH_BUDGETS['slot_picker.available_template'];
    expect(row).toBeDefined();
    expect(row.max).toBe(24);
    // Template literals: check without {N}/{M} substitution (template suffix exempts from IB-3)
  });

  it('I18N-09-04d: slot_picker.upcast_template key exists with max 20', () => {
    const row = HUD_WIDTH_BUDGETS['slot_picker.upcast_template'];
    expect(row).toBeDefined();
    expect(row.max).toBe(20);
  });

  it('I18N-09-04e: slot_picker.confirm_hint key exists with max 24', () => {
    const row = HUD_WIDTH_BUDGETS['slot_picker.confirm_hint'];
    expect(row).toBeDefined();
    expect(row.max).toBe(24);
    expect([...row.it].length).toBeLessThanOrEqual(row.max);
    expect([...row.en].length).toBeLessThanOrEqual(row.max);
    expect([...row.de].length).toBeLessThanOrEqual(row.max);
  });

  it('I18N-09-04f: slot_picker.cancel_hint key exists with max 24', () => {
    const row = HUD_WIDTH_BUDGETS['slot_picker.cancel_hint'];
    expect(row).toBeDefined();
    expect(row.max).toBe(24);
    expect([...row.it].length).toBeLessThanOrEqual(row.max);
    expect([...row.en].length).toBeLessThanOrEqual(row.max);
    expect([...row.de].length).toBeLessThanOrEqual(row.max);
  });

  it('I18N-09-04g: hud_r1_slot_picker composite key exists within max 42', () => {
    const row = HUD_WIDTH_BUDGETS['hud_r1_slot_picker'];
    expect(row).toBeDefined();
    expect(row.max).toBe(42);
    expect([...row.it].length).toBeLessThanOrEqual(row.max);
    expect([...row.en].length).toBeLessThanOrEqual(row.max);
    expect([...row.de].length).toBeLessThanOrEqual(row.max);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Additional: getR1Hints returns parseable chip
  // ──────────────────────────────────────────────────────────────────────────

  it('getR1Hints() returns tap/scroll/longPressLabel from hud_r1_slot_picker key', () => {
    const { panel } = makePanel({ locale: 'it' });
    const hints = panel.getR1Hints();
    expect(hints).toHaveProperty('tap');
    expect(hints).toHaveProperty('scroll');
    expect(hints).toHaveProperty('longPressLabel');
    expect(hints.tap).toBeTruthy();
    expect(hints.scroll).toBeTruthy();
  });
});
