/**
 * CanvasTargetPickerPanel — canvas-mode target picker behaviour.
 *
 * Verifies the canvas list panel without a real canvas: a tap emits the canonical
 * `tool.invoke` with the selected token appended to `callerArgs.targets`, double-tap
 * cancels without emitting, scroll moves the cursor, and the canvas container budget is
 * {0,0} (the bug that made the glyph TargetPickerPanel throw in canvas mode).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PanelGestureBus } from '../engine/panel-gesture-bus.js';
import { CanvasTargetPickerPanel } from './canvas-target-picker-panel.js';
import type { TargetCandidate } from './target-resolver.js';

const busStub = { subscribe: vi.fn(() => () => {}) } as unknown as PanelGestureBus;

function candidate(over: Partial<TargetCandidate> = {}): TargetCandidate {
  return {
    tokenId: 'tok-1',
    actorId: 'act-1',
    name: 'Goblin',
    hp: 7,
    maxHp: 7,
    ac: 13,
    isActiveTurn: false,
    sourceIdx: 0,
    ...over,
  };
}

beforeEach(() => {
  vi.stubGlobal('crypto', { randomUUID: () => 'uuid-fixed' });
});

describe('CanvasTargetPickerPanel', () => {
  it('canvas container budget is {0,0} (so it does not trip the canvas-mode assertion)', () => {
    const panel = new CanvasTargetPickerPanel(
      busStub,
      'it',
      [candidate()],
      'sess-1',
      { toolId: 'cast-spell', callerArgs: { actor_id: 'act-1', spell_id: 's1', slot_level: 1 } },
      { send: vi.fn() },
      vi.fn(),
    );
    expect(panel.getContainerCount()).toEqual({ image: 0, text: 0 });
    expect(panel.getCaptureContainer()).toBe('hud-capture');
    expect(panel.id).toBe('canvas-target-picker');
  });

  it('tap emits a tool.invoke with the selected token appended to callerArgs.targets', () => {
    const send = vi.fn();
    const onClose = vi.fn();
    const panel = new CanvasTargetPickerPanel(
      busStub,
      'it',
      [candidate({ tokenId: 'tok-A' }), candidate({ tokenId: 'tok-B', name: 'Orc' })],
      'sess-1',
      { toolId: 'cast-spell', callerArgs: { actor_id: 'act-1', spell_id: 's1', slot_level: 1 } },
      { send },
      onClose,
    );

    // Move cursor to the 2nd candidate and confirm.
    panel.onEvent({ kind: 'scroll', direction: 'down' });
    panel.onEvent({ kind: 'tap' });

    expect(send).toHaveBeenCalledTimes(1);
    const env = JSON.parse(send.mock.calls[0]?.[0] as string);
    expect(env.type).toBe('tool.invoke');
    expect(env.payload.toolId).toBe('cast-spell');
    expect(env.payload.args).toEqual({
      actor_id: 'act-1',
      spell_id: 's1',
      slot_level: 1,
      targets: ['tok-B'],
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('double-tap cancels without emitting', () => {
    const send = vi.fn();
    const onClose = vi.fn();
    const panel = new CanvasTargetPickerPanel(
      busStub,
      'it',
      [candidate()],
      'sess-1',
      { toolId: 'use-item', callerArgs: { actor_id: 'act-1', item_id: 'w1' } },
      { send },
      onClose,
    );
    panel.onEvent({ kind: 'double-tap' });
    expect(send).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('empty candidate list auto-closes after the timeout (no emit on tap)', async () => {
    vi.useFakeTimers();
    const send = vi.fn();
    const onClose = vi.fn();
    const panel = new CanvasTargetPickerPanel(
      busStub,
      'it',
      [],
      'sess-1',
      { toolId: 'cast-spell', callerArgs: { actor_id: 'act-1', spell_id: 's1', slot_level: 1 } },
      { send },
      onClose,
    );
    await panel.onMount();
    panel.onEvent({ kind: 'tap' }); // empty → no-op
    expect(send).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2000);
    expect(onClose).toHaveBeenCalledTimes(1);
    await panel.onUnmount();
    vi.useRealTimers();
  });
});
