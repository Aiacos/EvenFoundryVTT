/**
 * DeltaEmitter character.delta actor targeting tests (FLV-CHAR-SELECT Task 2).
 *
 * Covers (per plan behavior):
 *   - FLV-DE-01: character.delta with actorId="actorX" → session A (selectedActorId="actorX")
 *                receives; session B (selectedActorId="actorY") does NOT; session C
 *                (selectedActorId undefined) receives (broadcast fallback)
 *   - FLV-DE-02: character.delta WITHOUT actorId field → all read_char sessions receive
 *                (no actorId = cannot target → broadcast fallback)
 *   - FLV-DE-03: combat.turn → targeting logic NOT applied; all read_combat sessions receive
 *   - FLV-DE-04: read_char cap gate still applies first — session without read_char gets nothing
 *   - FLV-DE-05: seq increments once per emitDelta call (unchanged)
 *
 * @see packages/bridge/src/ws/delta-emitter.ts
 */

import { describe, expect, it, vi } from 'vitest';
import { DeltaEmitter } from './delta-emitter.js';
import { ReplayBuffer } from './replay-buffer.js';
import { SessionStore } from './session-store.js';

function makeMockWs(shouldThrow = false) {
  return {
    send: vi.fn((_data: string) => {
      if (shouldThrow) throw new Error('connection closed');
    }),
    readyState: 1,
  };
}

/** Build a 3-session test harness: A=actorX, B=actorY, C=no pin. All have read_char + read_combat. */
function setupThreeSessions() {
  const replayBuffer = new ReplayBuffer();
  const sessionStore = new SessionStore();
  const emitter = new DeltaEmitter(replayBuffer, sessionStore);

  const caps = ['read_char', 'read_combat'];
  const sA = sessionStore.createSession('tok-A', 'it', caps, 'actorX');
  const sB = sessionStore.createSession('tok-B', 'it', caps, 'actorY');
  const sC = sessionStore.createSession('tok-C', 'it', caps); // no pin

  const wsA = makeMockWs();
  const wsB = makeMockWs();
  const wsC = makeMockWs();

  // biome-ignore lint/suspicious/noExplicitAny: mock ws
  emitter.registerSession(sA.sessionId, wsA as any);
  // biome-ignore lint/suspicious/noExplicitAny: mock ws
  emitter.registerSession(sB.sessionId, wsB as any);
  // biome-ignore lint/suspicious/noExplicitAny: mock ws
  emitter.registerSession(sC.sessionId, wsC as any);

  return { emitter, sA, sB, sC, wsA, wsB, wsC };
}

describe('DeltaEmitter — character.delta actor targeting (FLV-CHAR-SELECT)', () => {
  it('FLV-DE-01: character.delta with actorId → A receives, B skipped, C (no pin) receives', () => {
    const { emitter, wsA, wsB, wsC } = setupThreeSessions();

    emitter.emitDelta('character.delta', { actorId: 'actorX', hp: 42 });

    // Session A: selectedActorId=actorX matches payload.actorId=actorX → receives
    expect(wsA.send).toHaveBeenCalledOnce();
    // Session B: selectedActorId=actorY ≠ actorX → filtered out
    expect(wsB.send).not.toHaveBeenCalled();
    // Session C: no pin → broadcast fallback → receives
    expect(wsC.send).toHaveBeenCalledOnce();
  });

  it('FLV-DE-02: character.delta WITHOUT actorId field → all read_char sessions receive', () => {
    const { emitter, wsA, wsB, wsC } = setupThreeSessions();

    // No actorId on payload → cannot target → broadcast to all read_char
    emitter.emitDelta('character.delta', { hp: 99 });

    expect(wsA.send).toHaveBeenCalledOnce();
    expect(wsB.send).toHaveBeenCalledOnce();
    expect(wsC.send).toHaveBeenCalledOnce();
  });

  it('FLV-DE-03: combat.turn → targeting NOT applied; all read_combat sessions receive', () => {
    const { emitter, wsA, wsB, wsC } = setupThreeSessions();

    emitter.emitDelta('combat.turn', { actorId: 'actorX', round: 2 });

    // Targeting gate must NOT fire for combat.turn — all 3 have read_combat
    expect(wsA.send).toHaveBeenCalledOnce();
    expect(wsB.send).toHaveBeenCalledOnce();
    expect(wsC.send).toHaveBeenCalledOnce();
  });

  it('FLV-DE-04: session without read_char gets nothing for character.delta (cap gate first)', () => {
    const replayBuffer = new ReplayBuffer();
    const sessionStore = new SessionStore();
    const emitter = new DeltaEmitter(replayBuffer, sessionStore);

    // Session with actorX pin but NO read_char
    const s = sessionStore.createSession('tok', 'it', ['read_combat'], 'actorX');
    const ws = makeMockWs();
    // biome-ignore lint/suspicious/noExplicitAny: mock ws
    emitter.registerSession(s.sessionId, ws as any);

    emitter.emitDelta('character.delta', { actorId: 'actorX', hp: 10 });

    // Cap gate fires first → nothing received
    expect(ws.send).not.toHaveBeenCalled();
  });

  it('FLV-DE-05: seq increments once per emitDelta call (unchanged)', () => {
    const { emitter } = setupThreeSessions();
    emitter._resetSeq();

    emitter.emitDelta('character.delta', { actorId: 'actorX', hp: 1 });
    emitter.emitDelta('character.delta', { actorId: 'actorY', hp: 2 });

    // Each emitDelta call increments seq once regardless of how many sessions receive it
    expect(emitter.currentSeq).toBe(2);
  });
});
