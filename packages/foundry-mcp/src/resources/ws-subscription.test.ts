/**
 * Tests for subscribeToBridgeDeltas — RED phase (TDD Task 1 — Plan 11-03).
 *
 * subscribeToBridgeDeltas wires delta envelope routing from BridgeClient WS
 * into the ResourceCache. It handles 4 delta types and ignores all others.
 *
 * Test setup: mock BridgeClient with addMessageListener injection.
 *
 * Test case index:
 * 1. subscribeToBridgeDeltas installs a listener via addMessageListener
 * 2. CHARACTER_DELTA_TYPE envelope → cache.get('actor://current') updates
 * 3. COMBAT_TURN_DELTA_TYPE envelope → cache.get('combat://current') updates
 * 4. SCENE_VIEWPORT_DELTA_TYPE envelope → cache.get('scene://current') updates
 * 5. EVENT_LOG_DELTA_TYPE envelope → cache.appendLog updates log://recent
 * 6. Unknown envelope type → no cache mutation, no throw
 * 7. Envelope with invalid payload (fails Zod) → no cache mutation, no throw, warn logged
 * 8. Tool.result envelope does NOT update cache; coexistence with character.delta
 */

import {
  CHARACTER_DELTA_TYPE,
  COMBAT_TURN_DELTA_TYPE,
  EVENT_LOG_DELTA_TYPE,
  SCENE_VIEWPORT_DELTA_TYPE,
} from '@evf/shared-protocol';
import pino from 'pino';
import { describe, expect, it, vi } from 'vitest';
import { ResourceCache } from './resource-cache.js';
import { subscribeToBridgeDeltas } from './ws-subscription.js';

// ─── Mock BridgeClient ────────────────────────────────────────────────────────

type MessageListener = (envelope: Record<string, unknown>) => void;

interface MockBridgeClient {
  listeners: MessageListener[];
  addMessageListener: (cb: MessageListener) => () => void;
  simulateMessage: (envelope: Record<string, unknown>) => void;
}

function createMockBridgeClient(): MockBridgeClient {
  const listeners: MessageListener[] = [];
  return {
    listeners,
    addMessageListener(cb: MessageListener) {
      listeners.push(cb);
      return () => {
        const idx = listeners.indexOf(cb);
        if (idx !== -1) listeners.splice(idx, 1);
      };
    },
    simulateMessage(envelope: Record<string, unknown>) {
      for (const listener of listeners) {
        listener(envelope);
      }
    },
  };
}

// ─── Fixture helpers ──────────────────────────────────────────────────────────

function makeCharacterPayload() {
  return {
    actorId: 'actor-1',
    name: 'Tester',
    hp: 12,
    maxHp: 20,
    tempHp: 0,
    ac: 14,
    level: 5,
    conditions: [],
    exhaustion: 0,
    death: { success: 0, failure: 0 },
    world: { modernRules: false },
    inventory: [],
    spells: { slots: [], spells: [] },
  };
}

function makeCombatPayload() {
  return {
    combatId: 'combat-1',
    round: 2,
    turn: 1,
    currentCombatantId: 'combatant-2',
    combatants: [],
  };
}

function makeScenePayload() {
  return {
    sceneId: 'scene-1',
    sceneName: 'Test Scene',
    viewX: 100,
    viewY: 200,
    scale: 1.5,
    tokenIds: ['t1', 't2'],
  };
}

function makeEventLogPayload() {
  return {
    seq: 42,
    ts: Date.now(),
    type: 'chat' as const,
    actorId: null,
    content: 'A test chat message',
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('subscribeToBridgeDeltas', () => {
  const logger = pino({ level: 'silent' });

  it('case 1: subscribeToBridgeDeltas installs a listener via addMessageListener', () => {
    const cache = new ResourceCache();
    const bridge = createMockBridgeClient();
    const addSpy = vi.spyOn(bridge, 'addMessageListener');

    subscribeToBridgeDeltas(bridge as never, cache, logger);
    expect(addSpy).toHaveBeenCalledTimes(1);
  });

  it(`case 2: ${CHARACTER_DELTA_TYPE} envelope → cache.get('actor://current') updates`, () => {
    const cache = new ResourceCache();
    const bridge = createMockBridgeClient();
    subscribeToBridgeDeltas(bridge as never, cache, logger);

    bridge.simulateMessage({
      proto: 'evf-v1',
      seq: 1,
      ts: Date.now(),
      type: CHARACTER_DELTA_TYPE,
      session_id: 'session-1',
      payload: makeCharacterPayload(),
    });

    const result = cache.get('actor://current');
    expect(result).toBeDefined();
    expect(result!.hp).toBe(12);
    expect(result!.actorId).toBe('actor-1');
  });

  it(`case 3: ${COMBAT_TURN_DELTA_TYPE} envelope → cache.get('combat://current') updates`, () => {
    const cache = new ResourceCache();
    const bridge = createMockBridgeClient();
    subscribeToBridgeDeltas(bridge as never, cache, logger);

    bridge.simulateMessage({
      proto: 'evf-v1',
      seq: 2,
      ts: Date.now(),
      type: COMBAT_TURN_DELTA_TYPE,
      session_id: 'session-1',
      payload: makeCombatPayload(),
    });

    const result = cache.get('combat://current');
    expect(result).toBeDefined();
    expect(result!.round).toBe(2);
    expect(result!.combatId).toBe('combat-1');
  });

  it(`case 4: ${SCENE_VIEWPORT_DELTA_TYPE} envelope → cache.get('scene://current') updates`, () => {
    const cache = new ResourceCache();
    const bridge = createMockBridgeClient();
    subscribeToBridgeDeltas(bridge as never, cache, logger);

    bridge.simulateMessage({
      proto: 'evf-v1',
      seq: 3,
      ts: Date.now(),
      type: SCENE_VIEWPORT_DELTA_TYPE,
      session_id: 'session-1',
      payload: makeScenePayload(),
    });

    const result = cache.get('scene://current');
    expect(result).toBeDefined();
    expect(result!.sceneId).toBe('scene-1');
    expect(result!.viewX).toBe(100);
  });

  it(`case 5: ${EVENT_LOG_DELTA_TYPE} envelope → cache.appendLog updates log://recent`, () => {
    const cache = new ResourceCache();
    const bridge = createMockBridgeClient();
    subscribeToBridgeDeltas(bridge as never, cache, logger);

    bridge.simulateMessage({
      proto: 'evf-v1',
      seq: 4,
      ts: Date.now(),
      type: EVENT_LOG_DELTA_TYPE,
      session_id: 'session-1',
      payload: makeEventLogPayload(),
    });

    const log = cache.get('log://recent');
    expect(log).toBeDefined();
    expect(log!.length).toBe(1);
    expect(log![0]!.seq).toBe(42);
  });

  it('case 6: unknown envelope type → no cache mutation, no throw', () => {
    const cache = new ResourceCache();
    const bridge = createMockBridgeClient();
    subscribeToBridgeDeltas(bridge as never, cache, logger);

    expect(() => {
      bridge.simulateMessage({
        proto: 'evf-v1',
        seq: 5,
        ts: Date.now(),
        type: 'some.unknown.type',
        session_id: 'session-1',
        payload: { data: 'anything' },
      });
    }).not.toThrow();

    // Cache should be empty
    expect(cache.get('actor://current')).toBeUndefined();
    expect(cache.get('combat://current')).toBeUndefined();
    expect(cache.get('scene://current')).toBeUndefined();
    expect(cache.get('log://recent')).toBeUndefined();
  });

  it('case 7: envelope with invalid payload → no cache mutation, no throw, warn logged', () => {
    const warnMessages: string[] = [];
    const warnLogger = pino(
      { level: 'warn' },
      {
        write(chunk: string) {
          try {
            const parsed = JSON.parse(chunk) as Record<string, unknown>;
            if (parsed['level'] === 40) warnMessages.push(chunk); // 40 = warn
          } catch {
            /* ignore */
          }
        },
      },
    );

    const cache = new ResourceCache();
    const bridge = createMockBridgeClient();
    subscribeToBridgeDeltas(bridge as never, cache, warnLogger);

    // Send character delta with missing required fields
    bridge.simulateMessage({
      proto: 'evf-v1',
      seq: 6,
      ts: Date.now(),
      type: CHARACTER_DELTA_TYPE,
      session_id: 'session-1',
      payload: { hp: 'not-a-number', name: '' }, // invalid payload
    });

    // Cache should NOT be updated
    expect(cache.get('actor://current')).toBeUndefined();

    // A warn should have been logged
    expect(warnMessages.length).toBeGreaterThan(0);
  });

  it('case 8: tool.result does NOT update cache; character.delta coexists correctly', () => {
    const cache = new ResourceCache();
    const bridge = createMockBridgeClient();
    subscribeToBridgeDeltas(bridge as never, cache, logger);

    // Simulate a tool.result first (should be ignored by our listener)
    bridge.simulateMessage({
      proto: 'evf-v1',
      seq: 7,
      ts: Date.now(),
      type: 'tool.result',
      session_id: 'session-1',
      payload: { success: true, data: { chatCardId: 'card-1' } },
    });

    // Cache should be empty after tool.result
    expect(cache.get('actor://current')).toBeUndefined();

    // Now send a character.delta
    bridge.simulateMessage({
      proto: 'evf-v1',
      seq: 8,
      ts: Date.now(),
      type: CHARACTER_DELTA_TYPE,
      session_id: 'session-1',
      payload: makeCharacterPayload(),
    });

    // Cache should now have the character
    expect(cache.get('actor://current')).toBeDefined();
    expect(cache.get('actor://current')!.hp).toBe(12);
  });
});
