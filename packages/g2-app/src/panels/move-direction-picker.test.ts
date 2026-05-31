/**
 * Unit tests for MoveDirectionPicker (Plan 08-04 — ACT-01 move variant).
 *
 * Tests MDP-01..17:
 *   - MDP-01: id + getContainerCount (layout invariants)
 *   - MDP-02: Constructor accepts MoveRequest with currentX/currentY/gridSizePixels
 *   - MDP-03: selectedDirection defaults to 'N'; scroll cycles through 8 compass points
 *   - MDP-04: onMount subscribes bus; onUnmount unsubscribes (T-4b-01-03 mitigation)
 *   - MDP-05: scroll-down advances direction, scroll-up reverses (cycle wraps)
 *   - MDP-06: tap when remainingFeet ≤ 0 is no-op (MDP-06 exhausted guard)
 *   - MDP-07: tap when not exhausted emits tool.invoke + calls onClose
 *   - MDP-08: double-tap calls onClose without emit
 *   - MDP-09: isAtTopBoundary → always true (single-screen, over-scroll → Quick Action; ADR-0012 D-2)
 *   - MDP-10: getContainerCount returns { image: 0, text: 1 }
 *   - MDP-11: getR1Hints delegates to parseR1HintString(hud_r1_move_picker)
 *   - MDP-12: draw renders compass with ▶ before selected direction (default N)
 *   - MDP-13: draw renders exhausted layout when remainingFeet ≤ 0
 *   - MDP-14: W-4 envelope round-trip — emitted JSON passes EnvelopeSchema + MoveTokenInputSchema
 *   - MDP-15: INV-1 idle fixture (N selected, remainingFeet=30)
 *   - MDP-16: INV-1 NE-selected fixture (NE after one scroll-down, remainingFeet=25)
 *   - MDP-17: INV-1 exhausted fixture (remainingFeet=0)
 *
 * @see packages/g2-app/src/panels/move-direction-picker.ts
 * @see .planning/phases/08-manual-action-ux/08-04-PLAN.md Task 3
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EnvelopeSchema, MoveTokenInputSchema } from '@evf/shared-protocol';
import { AsciiGrid, matchAsciiFixture } from '@evf/shared-render';
import { describe, expect, it, vi } from 'vitest';
import type { MoveDirectionPickerWebSocket, MoveRequest } from './move-direction-picker.js';
import { computeDelta, MoveDirectionPicker } from './move-direction-picker.js';

// ─── Mock crypto.randomUUID ───────────────────────────────────────────────────
vi.stubGlobal('crypto', { randomUUID: (): string => 'test-uuid-move' });

// ─── Mock bridge + gesture bus ────────────────────────────────────────────────
function makeBridge() {
  return { textContainerUpgrade: vi.fn<() => Promise<void>>().mockResolvedValue(undefined) };
}

function makeWs(): { send: ReturnType<typeof vi.fn>; sentPayloads: () => unknown[] } {
  const calls: unknown[] = [];
  const send = vi.fn<(data: string) => void>((data: string) => {
    calls.push(JSON.parse(data));
  });
  return { send, sentPayloads: () => calls };
}

function makeGestureBus() {
  let handler: ((g: { kind: string; direction?: string }) => void) | null = null;
  const subscribe = vi.fn((cb: (g: { kind: string; direction?: string }) => void) => {
    handler = cb;
    return () => {
      handler = null;
    };
  });
  const emit = (g: { kind: string; direction?: string }) => {
    handler?.(g);
  };
  return { subscribe, emit };
}

function makeRequest(overrides: Partial<MoveRequest> = {}): MoveRequest {
  return {
    actorId: 'actor-1',
    tokenId: 'token-1',
    currentX: 200,
    currentY: 300,
    remainingFeet: 30,
    gridSizePixels: 100,
    ...overrides,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePanel(request: MoveRequest = makeRequest(), locale: 'it' | 'en' = 'it') {
  const bridge = makeBridge();
  const ws = makeWs();
  const gestureBus = makeGestureBus();
  const onClose = vi.fn<() => void>();
  const panel = new MoveDirectionPicker(
    bridge as never,
    ws as MoveDirectionPickerWebSocket,
    gestureBus as never,
    request,
    locale,
    'session-abc',
    onClose,
  );
  return { bridge, ws, gestureBus, onClose, panel };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('MoveDirectionPicker — MDP-01: id + static invariants', () => {
  it('MDP-01: panel id is move-direction-picker', () => {
    const { panel } = makePanel();
    expect(panel.id).toBe('move-direction-picker');
  });
});

describe('MoveDirectionPicker — MDP-02: constructor', () => {
  it('MDP-02: constructor accepts MoveRequest with currentX/currentY/gridSizePixels', () => {
    const request = makeRequest({ currentX: 100, currentY: 200, gridSizePixels: 50 });
    expect(() => makePanel(request)).not.toThrow();
  });
});

describe('MoveDirectionPicker — MDP-03: selectedDirection default', () => {
  it('MDP-03: default selectedDirection is N', () => {
    const { panel } = makePanel();
    expect(panel._getDirectionForTest()).toBe('N');
  });
});

describe('MoveDirectionPicker — MDP-04: mount/unmount lifecycle', () => {
  it('MDP-04: onMount subscribes to bus; onUnmount unsubscribes idempotently', async () => {
    const { panel, gestureBus } = makePanel();
    await panel.onMount();
    expect(gestureBus.subscribe).toHaveBeenCalledOnce();
    await panel.onUnmount();
    await panel.onUnmount(); // second call should be safe (idempotent)
    expect(gestureBus.subscribe).toHaveBeenCalledOnce(); // only subscribed once
  });
});

describe('MoveDirectionPicker — MDP-05: scroll cycles direction', () => {
  it('MDP-05a: scroll-down N → NE → E → SE → S → SW → W → NW → N (wrap)', async () => {
    const { panel, gestureBus } = makePanel();
    await panel.onMount();
    const order = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    for (let i = 1; i <= order.length; i++) {
      gestureBus.emit({ kind: 'scroll', direction: 'down' });
      expect(panel._getDirectionForTest()).toBe(order[i % order.length]);
    }
  });

  it('MDP-05b: scroll-up N → NW → W → SW → S → SE → E → NE → N (reverse wrap)', async () => {
    const { panel, gestureBus } = makePanel();
    await panel.onMount();
    const order = ['N', 'NW', 'W', 'SW', 'S', 'SE', 'E', 'NE'];
    for (let i = 1; i <= order.length; i++) {
      gestureBus.emit({ kind: 'scroll', direction: 'up' });
      expect(panel._getDirectionForTest()).toBe(order[i % order.length]);
    }
  });
});

describe('MoveDirectionPicker — MDP-06: exhausted tap is no-op', () => {
  it('MDP-06: tap when remainingFeet <= 0 does NOT send or call onClose', async () => {
    const { panel, ws, onClose, gestureBus } = makePanel(makeRequest({ remainingFeet: 0 }));
    await panel.onMount();
    gestureBus.emit({ kind: 'tap' });
    expect(ws.send).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('MDP-06b: tap when remainingFeet < 0 also no-op', async () => {
    const { panel, ws, onClose, gestureBus } = makePanel(makeRequest({ remainingFeet: -5 }));
    await panel.onMount();
    gestureBus.emit({ kind: 'tap' });
    expect(ws.send).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('MoveDirectionPicker — MDP-07: tap emits tool.invoke + closes', () => {
  it('MDP-07: tap emits canonical tool.invoke envelope with move-token args and calls onClose', async () => {
    const request = makeRequest({ currentX: 200, currentY: 300, gridSizePixels: 100 });
    const { panel, ws, onClose, gestureBus } = makePanel(request);
    await panel.onMount();
    gestureBus.emit({ kind: 'tap' }); // default direction N
    expect(ws.send).toHaveBeenCalledOnce();
    const sent = ws.sentPayloads()[0] as Record<string, unknown>;
    // Check proto field
    expect(sent.proto).toBe('evf-v1');
    expect(sent.type).toBe('tool.invoke');
    // North: dx=0, dy=-100 → newX=200, newY=200
    const payload = sent.payload as Record<string, unknown>;
    expect(payload.toolId).toBe('move-token');
    const args = payload.args as Record<string, unknown>;
    expect(args.token_id).toBe('token-1');
    expect(args.x).toBe(200); // currentX + 0
    expect(args.y).toBe(200); // currentY - 100
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('MDP-07b: tap with NE direction computes correct absolute position', async () => {
    const request = makeRequest({ currentX: 100, currentY: 100, gridSizePixels: 50 });
    const { panel, ws, gestureBus } = makePanel(request);
    await panel.onMount();
    // Advance to NE
    gestureBus.emit({ kind: 'scroll', direction: 'down' });
    gestureBus.emit({ kind: 'tap' });
    const sent = ws.sentPayloads()[0] as Record<string, unknown>;
    const args = (sent.payload as Record<string, unknown>).args as Record<string, unknown>;
    // NE: dx=+50, dy=-50 → newX=150, newY=50
    expect(args.x).toBe(150);
    expect(args.y).toBe(50);
  });
});

describe('MoveDirectionPicker — MDP-08: double-tap cancels', () => {
  it('MDP-08: double-tap calls onClose without emitting', async () => {
    const { panel, ws, onClose, gestureBus } = makePanel();
    await panel.onMount();
    gestureBus.emit({ kind: 'double-tap' });
    expect(ws.send).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe('MoveDirectionPicker — MDP-09: isAtTopBoundary (ADR-0012 D-2)', () => {
  it('MDP-09: single-screen compass is always at top (over-scroll → Quick Action)', async () => {
    const { panel, gestureBus } = makePanel();
    await panel.onMount();
    expect(panel.isAtTopBoundary()).toBe(true);
    // Cycling the compass direction does not introduce a vertical scroll cursor.
    gestureBus.emit({ kind: 'scroll', direction: 'down' });
    expect(panel.isAtTopBoundary()).toBe(true);
  });
});

describe('MoveDirectionPicker — MDP-10: getContainerCount', () => {
  it('MDP-10: returns { image: 0, text: 1 }', () => {
    const { panel } = makePanel();
    expect(panel.getContainerCount()).toEqual({ image: 0, text: 1 });
  });
});

describe('MoveDirectionPicker — MDP-11: getR1Hints', () => {
  it('MDP-11: getR1Hints returns parsed tap/scroll/quickActionLabel from hud_r1_move_picker', () => {
    const { panel } = makePanel();
    const hints = panel.getR1Hints();
    expect(hints.tap).toBe('commit');
    expect(hints.scroll).toBe('direzione');
    expect(hints.quickActionLabel).toBe('annulla');
  });
});

describe('MoveDirectionPicker — MDP-12: draw renders compass', () => {
  it('MDP-12: draw renders ▶ before N (default direction) in compass layout', async () => {
    const { panel, bridge } = makePanel();
    await panel.draw();
    expect(bridge.textContainerUpgrade).toHaveBeenCalledOnce();
    const call = (bridge.textContainerUpgrade as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    const content = (call as { content?: string })?.content ?? '';
    expect(content).toContain('▶N');
  });

  it('MDP-12b: draw renders ▶ before NE after one scroll-down', async () => {
    const { panel, bridge, gestureBus } = makePanel();
    await panel.onMount();
    gestureBus.emit({ kind: 'scroll', direction: 'down' });
    // draw is called by onEvent via void draw()
    await new Promise<void>((resolve) => setTimeout(resolve, 10)); // flush async
    const calls = (bridge.textContainerUpgrade as ReturnType<typeof vi.fn>).mock.calls;
    const lastCall = calls[calls.length - 1]?.[0];
    const content = (lastCall as { content?: string })?.content ?? '';
    expect(content).toContain('▶NE');
  });
});

describe('MoveDirectionPicker — MDP-13: exhausted layout', () => {
  it('MDP-13: draw with remainingFeet=0 renders exhausted hint, no compass', async () => {
    const { panel, bridge } = makePanel(makeRequest({ remainingFeet: 0 }));
    await panel.draw();
    const call = (bridge.textContainerUpgrade as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    const content = (call as { content?: string })?.content ?? '';
    // Should contain exhausted hint text (IT locale)
    expect(content).toContain('esaurito');
    // Should NOT contain compass directions
    expect(content).not.toContain('▶N');
  });
});

describe('MoveDirectionPicker — MDP-14: W-4 envelope round-trip', () => {
  it('MDP-14: emitted envelope passes EnvelopeSchema + MoveTokenInputSchema validation', async () => {
    // W-4: session_id must be a valid UUID (EnvelopeSchema.session_id z.string().uuid())
    const VALID_SESSION_ID = '550e8400-e29b-41d4-a716-446655440000';
    const bridge = makeBridge();
    const ws = makeWs();
    const gestureBus = makeGestureBus();
    const onClose = vi.fn<() => void>();
    const panel = new MoveDirectionPicker(
      bridge as never,
      ws as MoveDirectionPickerWebSocket,
      gestureBus as never,
      makeRequest({ remainingFeet: 30 }),
      'it',
      VALID_SESSION_ID,
      onClose,
    );
    await panel.onMount();
    gestureBus.emit({ kind: 'tap' });
    const raw = ws.sentPayloads()[0];
    // EnvelopeSchema full round-trip
    const env = EnvelopeSchema.safeParse(raw);
    expect(env.success, `EnvelopeSchema failed: ${JSON.stringify(env)}`).toBe(true);
    if (!env.success) return;
    // Inner args must parse as MoveTokenInputSchema
    const argsResult = MoveTokenInputSchema.safeParse(
      (env.data.payload as Record<string, unknown>).args,
    );
    expect(argsResult.success, `MoveTokenInputSchema failed: ${JSON.stringify(argsResult)}`).toBe(
      true,
    );
  });
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.resolve(__dirname, '../../../../packages/shared-render/src/fixtures');

describe('MoveDirectionPicker — MDP-15..17: INV-1 fixtures', () => {
  it('MDP-15: idle (N selected, remainingFeet=30) matches move-picker.idle.it.txt', async () => {
    const { panel, bridge } = makePanel(makeRequest({ remainingFeet: 30 }));
    await panel.draw();
    const call = (bridge.textContainerUpgrade as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    const content = (call as { content?: string })?.content ?? '';
    const grid = AsciiGrid.fromString(content);
    await matchAsciiFixture(grid, path.join(FIXTURES_DIR, 'move-picker.idle.it.txt'));
  });

  it('MDP-16: NE-selected (after one scroll-down, remainingFeet=25) matches move-picker.ne-selected.it.txt', async () => {
    const { panel, bridge, gestureBus } = makePanel(makeRequest({ remainingFeet: 25 }));
    await panel.onMount();
    gestureBus.emit({ kind: 'scroll', direction: 'down' }); // N → NE
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
    const calls = (bridge.textContainerUpgrade as ReturnType<typeof vi.fn>).mock.calls;
    const lastCall = calls[calls.length - 1]?.[0];
    const content = (lastCall as { content?: string })?.content ?? '';
    const grid = AsciiGrid.fromString(content);
    await matchAsciiFixture(grid, path.join(FIXTURES_DIR, 'move-picker.ne-selected.it.txt'));
  });

  it('MDP-17: exhausted (remainingFeet=0) matches move-picker.exhausted.it.txt', async () => {
    const { panel, bridge } = makePanel(makeRequest({ remainingFeet: 0 }));
    await panel.draw();
    const call = (bridge.textContainerUpgrade as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    const content = (call as { content?: string })?.content ?? '';
    const grid = AsciiGrid.fromString(content);
    await matchAsciiFixture(grid, path.join(FIXTURES_DIR, 'move-picker.exhausted.it.txt'));
  });
});

// ─── computeDelta unit tests ──────────────────────────────────────────────────
describe('computeDelta — direction to pixel delta', () => {
  it('N: dx=0, dy=-gridSize', () => {
    expect(computeDelta('N', 100)).toEqual({ dx: 0, dy: -100 });
  });
  it('NE: dx=+gridSize, dy=-gridSize', () => {
    expect(computeDelta('NE', 100)).toEqual({ dx: 100, dy: -100 });
  });
  it('E: dx=+gridSize, dy=0', () => {
    expect(computeDelta('E', 100)).toEqual({ dx: 100, dy: 0 });
  });
  it('SE: dx=+gridSize, dy=+gridSize', () => {
    expect(computeDelta('SE', 100)).toEqual({ dx: 100, dy: 100 });
  });
  it('S: dx=0, dy=+gridSize', () => {
    expect(computeDelta('S', 100)).toEqual({ dx: 0, dy: 100 });
  });
  it('SW: dx=-gridSize, dy=+gridSize', () => {
    expect(computeDelta('SW', 100)).toEqual({ dx: -100, dy: 100 });
  });
  it('W: dx=-gridSize, dy=0', () => {
    expect(computeDelta('W', 100)).toEqual({ dx: -100, dy: 0 });
  });
  it('NW: dx=-gridSize, dy=-gridSize', () => {
    expect(computeDelta('NW', 100)).toEqual({ dx: -100, dy: -100 });
  });
});
