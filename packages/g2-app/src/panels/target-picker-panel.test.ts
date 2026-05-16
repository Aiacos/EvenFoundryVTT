/**
 * Unit tests for TargetPickerPanel (Plan 08-02, Task 2 — TPP-01..17).
 *
 * Covers:
 *   - TPP-01: id === 'target-picker'; no static meta
 *   - TPP-02: constructor saves all args as private readonly
 *   - TPP-03: onMount subscribes to bus; schedules auto-close if candidates empty
 *   - TPP-04: onUnmount unsubscribes + clears timer (idempotent)
 *   - TPP-05: internal selectedIdx defaults to 0
 *   - TPP-06: scroll-down/up cycles selectedIdx mod candidates.length
 *   - TPP-07: tap → canonical tool.invoke envelope ws.send + onClose
 *   - TPP-08: double-tap → onClose WITHOUT emitting
 *   - TPP-09: long-press → ignored (panel stays mounted)
 *   - TPP-10: getContainerCount → { image: 0, text: 1 }
 *   - TPP-11: getR1Hints returns { tap, scroll, longPressLabel } strings
 *   - TPP-12: draw() calls bridge.textContainerUpgrade with BERSAGLIO title
 *   - TPP-13: empty state renders 'Nessun bersaglio' hint
 *   - TPP-14: W-4 envelope round-trip — EnvelopeSchema + ToolInvocationEnvelopePayloadSchema
 *   - TPP-15: INV-1 full-list fixture (3 targets, idx=1 selected)
 *   - TPP-16: INV-1 single-target fixture (1 target, idx=0 selected)
 *   - TPP-17: INV-1 empty fixture (0 targets)
 *
 * @see .planning/phases/08-manual-action-ux/08-02-PLAN.md Task 2
 * @see packages/g2-app/src/panels/target-picker-panel.ts
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';
import { TextContainerUpgrade } from '@evenrealities/even_hub_sdk';
import { EnvelopeSchema, ToolInvocationEnvelopePayloadSchema } from '@evf/shared-protocol';
import { AsciiGrid, matchAsciiFixture } from '@evf/shared-render';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ZIndex } from '../engine/layer-types.js';
import { PanelGestureBus } from '../engine/panel-gesture-bus.js';
import type { TargetCandidate } from './target-resolver.js';
import {
  type TargetPickerCloseHandler,
  TargetPickerPanel,
  type TargetPickerToolInvocation,
  type TargetPickerWebSocket,
} from './target-picker-panel.js';

// ─── Paths ────────────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.resolve(
  __dirname,
  '../../../../packages/shared-render/src/fixtures',
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeBridge() {
  return {
    textContainerUpgrade: vi.fn().mockResolvedValue(undefined),
    updateImageRawData: vi.fn().mockResolvedValue(undefined),
    createTextContainer: vi.fn().mockResolvedValue(undefined),
  } as unknown as EvenAppBridge & { textContainerUpgrade: ReturnType<typeof vi.fn> };
}

type MockWs = TargetPickerWebSocket & { send: ReturnType<typeof vi.fn> };
function makeWs(): MockWs {
  return { send: vi.fn() };
}

function makeGestureBus(): PanelGestureBus {
  return new PanelGestureBus();
}

function makeCandidate(overrides: Partial<TargetCandidate> = {}): TargetCandidate {
  return {
    tokenId: 'c-goblin-archer',
    actorId: 'actor-goblin-archer',
    name: 'GOBLIN ARCHER',
    hp: 5,
    maxHp: 15,
    ac: 13,
    isActiveTurn: true,
    sourceIdx: 0,
    ...overrides,
  };
}

const FULL_CANDIDATES: TargetCandidate[] = [
  makeCandidate({
    tokenId: 'c-goblin-archer',
    actorId: 'actor-goblin-archer',
    name: 'GOBLIN ARCHER',
    hp: 5,
    maxHp: 15,
    ac: 13,
    isActiveTurn: true,
    sourceIdx: 0,
  }),
  makeCandidate({
    tokenId: 'c-goblin-brute',
    actorId: 'actor-goblin-brute',
    name: 'GOBLIN BRUTO',
    hp: 11,
    maxHp: 15,
    ac: 14,
    isActiveTurn: false,
    sourceIdx: 1,
  }),
  makeCandidate({
    tokenId: 'c-shadow-dog',
    actorId: 'actor-shadow-dog',
    name: 'CANE OMBRA',
    hp: 18,
    maxHp: 22,
    ac: 12,
    isActiveTurn: false,
    sourceIdx: 2,
  }),
];

const VALID_SESSION_UUID = '11111111-1111-4111-8111-111111111111';
const TOOL_INVOCATION: TargetPickerToolInvocation = {
  toolId: 'cast-spell',
  callerArgs: { actorId: 'actor-player-001', spellId: 'fireball' },
};

function makePanel(opts: {
  candidates?: TargetCandidate[];
  locale?: 'it' | 'en' | 'de';
  bridge?: EvenAppBridge & { textContainerUpgrade: ReturnType<typeof vi.fn> };
  ws?: MockWs;
  bus?: PanelGestureBus;
  sessionId?: string;
  toolInvocation?: TargetPickerToolInvocation;
  onClose?: TargetPickerCloseHandler;
} = {}) {
  const bridge = opts.bridge ?? makeBridge();
  const ws = opts.ws ?? makeWs();
  const bus = opts.bus ?? makeGestureBus();
  const onClose = opts.onClose ?? vi.fn();
  const panel = new TargetPickerPanel(
    bridge,
    ws,
    bus,
    opts.candidates ?? FULL_CANDIDATES,
    opts.locale ?? 'it',
    opts.sessionId ?? VALID_SESSION_UUID,
    opts.toolInvocation ?? TOOL_INVOCATION,
    onClose,
  );
  return { panel, bridge, ws, bus, onClose };
}

// ─── TPP-01 — identity ────────────────────────────────────────────────────────

describe('TargetPickerPanel — TPP-01: identity', () => {
  it('TPP-01: id === "target-picker"', () => {
    const { panel } = makePanel();
    expect(panel.id).toBe('target-picker');
  });

  it('TPP-01b: z === ZIndex.Z2_OVERLAY', () => {
    const { panel } = makePanel();
    expect(panel.z).toBe(ZIndex.Z2_OVERLAY);
  });
});

// ─── TPP-03 — onMount lifecycle ───────────────────────────────────────────────

describe('TargetPickerPanel — TPP-03: onMount', () => {
  it('TPP-03a: onMount subscribes to gesture bus (bus.size() === 1)', async () => {
    const bus = makeGestureBus();
    const { panel } = makePanel({ bus });
    await panel.onMount();
    expect(bus.size()).toBe(1);
  });

  it('TPP-03b: onMount schedules auto-close timer when candidates are empty', async () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    const { panel } = makePanel({ candidates: [], onClose });
    await panel.onMount();
    expect(onClose).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2000);
    expect(onClose).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('TPP-03c: onMount does NOT schedule timer when candidates are non-empty', async () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    const { panel } = makePanel({ candidates: FULL_CANDIDATES, onClose });
    await panel.onMount();
    vi.advanceTimersByTime(5000);
    expect(onClose).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});

// ─── TPP-04 — onUnmount lifecycle ─────────────────────────────────────────────

describe('TargetPickerPanel — TPP-04: onUnmount', () => {
  it('TPP-04a: onUnmount unsubscribes from bus (bus.size() === 0)', async () => {
    const bus = makeGestureBus();
    const { panel } = makePanel({ bus });
    await panel.onMount();
    expect(bus.size()).toBe(1);
    await panel.onUnmount();
    expect(bus.size()).toBe(0);
  });

  it('TPP-04b: onUnmount is idempotent (second call safe)', async () => {
    const bus = makeGestureBus();
    const { panel } = makePanel({ bus });
    await panel.onMount();
    await panel.onUnmount();
    await panel.onUnmount(); // no throw
    expect(bus.size()).toBe(0);
  });

  it('TPP-04c: onUnmount clears auto-close timer (no late fire)', async () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    const { panel } = makePanel({ candidates: [], onClose });
    await panel.onMount();
    await panel.onUnmount(); // clears timer
    vi.advanceTimersByTime(5000);
    expect(onClose).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});

// ─── TPP-06 — scroll cycling ──────────────────────────────────────────────────

describe('TargetPickerPanel — TPP-06: scroll cycling', () => {
  it('TPP-06a: scroll-down increments selectedIdx mod candidates.length', async () => {
    const { panel } = makePanel({ candidates: FULL_CANDIDATES });
    await panel.onMount();
    expect(panel._getSelectedIdxForTest()).toBe(0);
    panel.onEvent({ kind: 'scroll', direction: 'down' });
    expect(panel._getSelectedIdxForTest()).toBe(1);
    panel.onEvent({ kind: 'scroll', direction: 'down' });
    expect(panel._getSelectedIdxForTest()).toBe(2);
    // Wraps around
    panel.onEvent({ kind: 'scroll', direction: 'down' });
    expect(panel._getSelectedIdxForTest()).toBe(0);
  });

  it('TPP-06b: scroll-up decrements selectedIdx (wraps to end)', async () => {
    const { panel } = makePanel({ candidates: FULL_CANDIDATES });
    await panel.onMount();
    panel.onEvent({ kind: 'scroll', direction: 'up' });
    expect(panel._getSelectedIdxForTest()).toBe(2); // wraps from 0 to last
  });

  it('TPP-06c: scroll is no-op when candidates are empty', async () => {
    const { panel } = makePanel({ candidates: [] });
    await panel.onMount();
    panel.onEvent({ kind: 'scroll', direction: 'down' }); // should not throw
    expect(panel._getSelectedIdxForTest()).toBe(0);
  });
});

// ─── TPP-07 — tap (confirm) ───────────────────────────────────────────────────

describe('TargetPickerPanel — TPP-07: tap emits tool.invoke + onClose', () => {
  it('TPP-07a: tap calls ws.send once', async () => {
    const ws = makeWs();
    const { panel } = makePanel({ ws });
    await panel.onMount();
    panel.onEvent({ kind: 'tap' });
    expect(ws.send).toHaveBeenCalledTimes(1);
  });

  it('TPP-07b: tap calls onClose', async () => {
    const onClose = vi.fn();
    const { panel } = makePanel({ onClose });
    await panel.onMount();
    panel.onEvent({ kind: 'tap' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('TPP-07c: tap is no-op when candidates are empty', async () => {
    vi.useFakeTimers();
    const ws = makeWs();
    const onClose = vi.fn();
    const { panel } = makePanel({ candidates: [], ws, onClose });
    await panel.onMount();
    panel.onEvent({ kind: 'tap' });
    expect(ws.send).not.toHaveBeenCalled();
    // onClose might be called by the auto-close timer, not by tap
    vi.useRealTimers();
  });

  it('TPP-07d: envelope uses canonical EnvelopeSchema shape (proto/seq/ts/type/session_id/payload)', async () => {
    const ws = makeWs();
    const { panel } = makePanel({ ws });
    await panel.onMount();
    panel.onEvent({ kind: 'tap' });
    const raw = ws.send.mock.calls[0]?.[0] as string;
    expect(typeof raw).toBe('string');
    const parsed = JSON.parse(raw) as unknown;
    expect(EnvelopeSchema.safeParse(parsed).success).toBe(true);
  });

  it('TPP-07e: envelope payload passes ToolInvocationEnvelopePayloadSchema', async () => {
    const ws = makeWs();
    const { panel } = makePanel({ ws });
    await panel.onMount();
    panel.onEvent({ kind: 'tap' });
    const raw = ws.send.mock.calls[0]?.[0] as string;
    const envelope = JSON.parse(raw) as { payload: unknown };
    expect(ToolInvocationEnvelopePayloadSchema.safeParse(envelope.payload).success).toBe(true);
  });

  it('TPP-07f: envelope payload includes selected target tokenId in args.targets', async () => {
    const ws = makeWs();
    const { panel } = makePanel({ ws, candidates: FULL_CANDIDATES });
    await panel.onMount();
    // selectedIdx=0 → GOBLIN ARCHER
    panel.onEvent({ kind: 'tap' });
    const raw = ws.send.mock.calls[0]?.[0] as string;
    const envelope = JSON.parse(raw) as { payload: { args: { targets: string[] } } };
    expect(envelope.payload.args.targets).toContain('c-goblin-archer');
  });

  it('TPP-07g: session_id in envelope matches constructor sessionId', async () => {
    const ws = makeWs();
    const { panel } = makePanel({ ws, sessionId: VALID_SESSION_UUID });
    await panel.onMount();
    panel.onEvent({ kind: 'tap' });
    const raw = ws.send.mock.calls[0]?.[0] as string;
    const envelope = JSON.parse(raw) as { session_id: string };
    expect(envelope.session_id).toBe(VALID_SESSION_UUID);
  });
});

// ─── TPP-08 — double-tap (cancel) ─────────────────────────────────────────────

describe('TargetPickerPanel — TPP-08: double-tap cancels without emitting', () => {
  it('TPP-08a: double-tap calls onClose', async () => {
    const onClose = vi.fn();
    const { panel } = makePanel({ onClose });
    await panel.onMount();
    panel.onEvent({ kind: 'double-tap' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('TPP-08b: double-tap does NOT call ws.send', async () => {
    const ws = makeWs();
    const { panel } = makePanel({ ws });
    await panel.onMount();
    panel.onEvent({ kind: 'double-tap' });
    expect(ws.send).not.toHaveBeenCalled();
  });
});

// ─── TPP-09 — long-press (ignored) ────────────────────────────────────────────

describe('TargetPickerPanel — TPP-09: long-press is ignored', () => {
  it('TPP-09: long-press does not call ws.send or onClose', async () => {
    const ws = makeWs();
    const onClose = vi.fn();
    const { panel } = makePanel({ ws, onClose });
    await panel.onMount();
    panel.onEvent({ kind: 'long-press' });
    expect(ws.send).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});

// ─── TPP-10 — getContainerCount ──────────────────────────────────────────────

describe('TargetPickerPanel — TPP-10: getContainerCount', () => {
  it('TPP-10: getContainerCount === { image: 0, text: 1 }', () => {
    const { panel } = makePanel();
    expect(panel.getContainerCount()).toEqual({ image: 0, text: 1 });
  });
});

// ─── TPP-11 — getR1Hints ─────────────────────────────────────────────────────

describe('TargetPickerPanel — TPP-11: getR1Hints', () => {
  it('TPP-11: getR1Hints returns object with tap/scroll/longPressLabel strings', () => {
    const { panel } = makePanel({ locale: 'it' });
    const hints = panel.getR1Hints?.();
    expect(hints).toBeDefined();
    expect(typeof hints?.tap).toBe('string');
    expect(typeof hints?.scroll).toBe('string');
    expect(typeof hints?.longPressLabel).toBe('string');
    expect(hints?.tap.length).toBeGreaterThan(0);
  });
});

// ─── TPP-12 — draw() full list ───────────────────────────────────────────────

describe('TargetPickerPanel — TPP-12: draw() renders BERSAGLIO title', () => {
  it('TPP-12a: draw() calls bridge.textContainerUpgrade once', async () => {
    const bridge = makeBridge();
    const { panel } = makePanel({ bridge });
    await panel.onMount();
    await panel.draw();
    expect(bridge.textContainerUpgrade).toHaveBeenCalledTimes(1);
    expect(bridge.textContainerUpgrade).toHaveBeenCalledWith(expect.any(TextContainerUpgrade));
  });

  it('TPP-12b: draw() content contains BERSAGLIO title (IT)', async () => {
    const bridge = makeBridge();
    const { panel } = makePanel({ bridge, locale: 'it' });
    await panel.onMount();
    await panel.draw();
    const arg = bridge.textContainerUpgrade.mock.calls[0]?.[0] as TextContainerUpgrade;
    expect(arg.content).toContain('BERSAGLIO');
  });

  it('TPP-12c: draw() content contains candidate names', async () => {
    const bridge = makeBridge();
    const { panel } = makePanel({ bridge });
    await panel.onMount();
    await panel.draw();
    const arg = bridge.textContainerUpgrade.mock.calls[0]?.[0] as TextContainerUpgrade;
    expect(arg.content).toContain('GOBLIN ARCHER');
  });

  it('TPP-12d: draw() content has selection indicator ▶ for selectedIdx=0', async () => {
    const bridge = makeBridge();
    const { panel } = makePanel({ bridge });
    await panel.onMount();
    await panel.draw();
    const arg = bridge.textContainerUpgrade.mock.calls[0]?.[0] as TextContainerUpgrade;
    expect(arg.content).toContain('▶');
  });
});

// ─── TPP-13 — empty state ─────────────────────────────────────────────────────

describe('TargetPickerPanel — TPP-13: empty state renders hint', () => {
  it('TPP-13: draw() with empty candidates contains "Nessun bersaglio"', async () => {
    vi.useFakeTimers();
    const bridge = makeBridge();
    const { panel } = makePanel({ candidates: [], bridge, locale: 'it' });
    await panel.onMount();
    await panel.draw();
    const arg = bridge.textContainerUpgrade.mock.calls[0]?.[0] as TextContainerUpgrade;
    expect(arg.content).toContain('Nessun bersaglio');
    vi.useRealTimers();
  });
});

// ─── TPP-14 — W-4 envelope round-trip ────────────────────────────────────────

describe('TargetPickerPanel — TPP-14: W-4 envelope round-trip', () => {
  it('TPP-14: emitted JSON passes EnvelopeSchema + ToolInvocationEnvelopePayloadSchema', async () => {
    const ws = makeWs();
    const { panel } = makePanel({ ws });
    await panel.onMount();
    panel.onEvent({ kind: 'tap' });
    const raw = ws.send.mock.calls[0]?.[0] as string;
    const envelope = JSON.parse(raw) as unknown;
    // Outer envelope
    const outerResult = EnvelopeSchema.safeParse(envelope);
    expect(outerResult.success, `EnvelopeSchema: ${JSON.stringify(outerResult)}`).toBe(true);
    // Inner payload
    const innerResult = ToolInvocationEnvelopePayloadSchema.safeParse(
      (envelope as { payload: unknown }).payload,
    );
    expect(innerResult.success, `ToolInvocationEnvelopePayloadSchema: ${JSON.stringify(innerResult)}`).toBe(true);
  });

  it('TPP-14b: W-4 grep gate — no "value" field in emitted envelope (canonical "payload" only)', async () => {
    const ws = makeWs();
    const { panel } = makePanel({ ws });
    await panel.onMount();
    panel.onEvent({ kind: 'tap' });
    const raw = ws.send.mock.calls[0]?.[0] as string;
    const envelope = JSON.parse(raw) as Record<string, unknown>;
    expect(Object.keys(envelope)).not.toContain('value');
    expect(Object.keys(envelope)).toContain('payload');
  });
});

// ─── TPP-15 — INV-1 full-list fixture ────────────────────────────────────────

describe('TargetPickerPanel — TPP-15: INV-1 full-list fixture (3 targets, idx=1)', () => {
  it('TPP-15: matches target-picker.full-list.it.txt character-perfect', async () => {
    const bridge = makeBridge();
    const { panel } = makePanel({ bridge, candidates: FULL_CANDIDATES, locale: 'it' });
    await panel.onMount();
    // Scroll to select idx=1 (GOBLIN BRUTO)
    panel.onEvent({ kind: 'scroll', direction: 'down' });
    await panel.draw();
    const arg = bridge.textContainerUpgrade.mock.calls[0]?.[0] as TextContainerUpgrade;
    const grid = AsciiGrid.fromString(arg.content);
    await matchAsciiFixture(
      grid,
      path.join(FIXTURES_DIR, 'target-picker.full-list.it.txt'),
    );
  });
});

// ─── TPP-16 — INV-1 single-target fixture ────────────────────────────────────

describe('TargetPickerPanel — TPP-16: INV-1 single-target fixture (1 target, idx=0)', () => {
  it('TPP-16: matches target-picker.single-target.it.txt character-perfect', async () => {
    const bridge = makeBridge();
    const singleCandidate = [FULL_CANDIDATES[0]!];
    const { panel } = makePanel({ bridge, candidates: singleCandidate, locale: 'it' });
    await panel.onMount();
    await panel.draw();
    const arg = bridge.textContainerUpgrade.mock.calls[0]?.[0] as TextContainerUpgrade;
    const grid = AsciiGrid.fromString(arg.content);
    await matchAsciiFixture(
      grid,
      path.join(FIXTURES_DIR, 'target-picker.single-target.it.txt'),
    );
  });
});

// ─── TPP-17 — INV-1 empty fixture ────────────────────────────────────────────

describe('TargetPickerPanel — TPP-17: INV-1 empty fixture (0 targets)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('TPP-17: matches target-picker.empty.it.txt character-perfect', async () => {
    vi.useFakeTimers();
    const bridge = makeBridge();
    const { panel } = makePanel({ bridge, candidates: [], locale: 'it' });
    await panel.onMount();
    await panel.draw();
    const arg = bridge.textContainerUpgrade.mock.calls[0]?.[0] as TextContainerUpgrade;
    const grid = AsciiGrid.fromString(arg.content);
    await matchAsciiFixture(
      grid,
      path.join(FIXTURES_DIR, 'target-picker.empty.it.txt'),
    );
    vi.useRealTimers();
  });
});
