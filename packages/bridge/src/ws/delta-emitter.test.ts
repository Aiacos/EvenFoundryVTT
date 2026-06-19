/**
 * DeltaEmitter unit tests.
 *
 * Verifies:
 * - emitDelta fans out only to sessions with matching capability
 * - replayBuffer.push called once per envelope per session
 * - globalSeq increments monotonically
 * - Stale connections are cleaned up on send error
 *
 * @see packages/bridge/src/ws/delta-emitter.ts
 */
import { describe, expect, it, vi } from 'vitest';
import { DeltaEmitter } from './delta-emitter.js';
import { ReplayBuffer } from './replay-buffer.js';
import { SessionStore } from './session-store.js';

// ─── Mock WebSocket helper ─────────────────────────────────────────────────────

function makeMockWs(shouldThrow = false) {
  return {
    send: vi.fn((_data: string) => {
      if (shouldThrow) throw new Error('connection closed');
    }),
    readyState: 1, // OPEN
  };
}

// ─── Test setup helpers ────────────────────────────────────────────────────────

function setup(caps: string[] = ['read_char', 'read_combat', 'read_scene', 'subscribe']) {
  const replayBuffer = new ReplayBuffer();
  const sessionStore = new SessionStore();
  const emitter = new DeltaEmitter(replayBuffer, sessionStore);

  const session = sessionStore.createSession('test-token', 'it', caps);
  const ws = makeMockWs();
  // biome-ignore lint/suspicious/noExplicitAny: ws mock type
  emitter.registerSession(session.sessionId, ws as any);

  return { emitter, session, ws, replayBuffer, sessionStore };
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('DeltaEmitter', () => {
  describe('registerSession / unregisterSession', () => {
    it('tracks registered sessions', () => {
      const { emitter } = setup();
      expect(emitter.connectionCount).toBe(1);
    });

    it('removes session on unregisterSession', () => {
      const { emitter, session } = setup();
      emitter.unregisterSession(session.sessionId);
      expect(emitter.connectionCount).toBe(0);
    });
  });

  describe('emitDelta — capability routing', () => {
    it('sends character.delta to session with read_char cap', () => {
      const { emitter, ws } = setup(['read_char']);
      emitter.emitDelta('character.delta', { hp: 20 });
      expect(ws.send).toHaveBeenCalledOnce();
      const sent = JSON.parse(ws.send.mock.calls[0]?.[0] ?? '{}');
      expect(sent.type).toBe('character.delta');
      expect(sent.payload).toEqual({ hp: 20 });
    });

    it('does NOT send character.delta to session missing read_char', () => {
      const { emitter, ws } = setup(['read_combat', 'read_scene']); // no read_char
      emitter.emitDelta('character.delta', { hp: 20 });
      expect(ws.send).not.toHaveBeenCalled();
    });

    it('sends combat.turn to session with read_combat', () => {
      const { emitter, ws } = setup(['read_combat']);
      emitter.emitDelta('combat.turn', { round: 1 });
      expect(ws.send).toHaveBeenCalledOnce();
    });

    it('sends combat.state to session with read_combat', () => {
      const { emitter, ws } = setup(['read_combat']);
      emitter.emitDelta('combat.state', { round: 1 });
      expect(ws.send).toHaveBeenCalledOnce();
    });

    it('sends combat.targets to session with read_combat', () => {
      const { emitter, ws } = setup(['read_combat']);
      emitter.emitDelta('combat.targets', { userId: 'u1', targets: [] });
      expect(ws.send).toHaveBeenCalledOnce();
    });

    it('sends scene.viewport to session with read_scene', () => {
      const { emitter, ws } = setup(['read_scene']);
      emitter.emitDelta('scene.viewport', { sceneId: 's1' });
      expect(ws.send).toHaveBeenCalledOnce();
    });

    it('sends event.log.delta to session with subscribe', () => {
      const { emitter, ws } = setup(['subscribe']);
      emitter.emitDelta('event.log.delta', { seq: 1 });
      expect(ws.send).toHaveBeenCalledOnce();
    });

    it('sends unknown delta types to all sessions (no cap filter)', () => {
      const { emitter, ws } = setup(['read_char']); // no specific cap for unknown type
      emitter.emitDelta('unknown.custom.delta', { data: 'test' });
      expect(ws.send).toHaveBeenCalledOnce();
    });

    it('fans out to multiple sessions with matching caps', () => {
      const replayBuffer = new ReplayBuffer();
      const sessionStore = new SessionStore();
      const emitter = new DeltaEmitter(replayBuffer, sessionStore);

      const s1 = sessionStore.createSession('token-1', 'it', ['read_char']);
      const s2 = sessionStore.createSession('token-2', 'it', ['read_char', 'read_combat']);
      const s3 = sessionStore.createSession('token-3', 'it', ['read_combat']); // no read_char

      const ws1 = makeMockWs();
      const ws2 = makeMockWs();
      const ws3 = makeMockWs();

      // biome-ignore lint/suspicious/noExplicitAny: mock type
      emitter.registerSession(s1.sessionId, ws1 as any);
      // biome-ignore lint/suspicious/noExplicitAny: mock type
      emitter.registerSession(s2.sessionId, ws2 as any);
      // biome-ignore lint/suspicious/noExplicitAny: mock type
      emitter.registerSession(s3.sessionId, ws3 as any);

      emitter.emitDelta('character.delta', { hp: 10 });

      // s1 and s2 have read_char → receive delta
      expect(ws1.send).toHaveBeenCalledOnce();
      expect(ws2.send).toHaveBeenCalledOnce();
      // s3 does NOT have read_char → no delta
      expect(ws3.send).not.toHaveBeenCalled();
    });
  });

  describe('emitDelta — envelope shape', () => {
    it('wraps payload in evf-v1 Envelope', () => {
      const { emitter, ws } = setup(['read_char']);
      emitter.emitDelta('character.delta', { hp: 15 });

      const envelope = JSON.parse(ws.send.mock.calls[0]?.[0] ?? '{}');
      expect(envelope.proto).toBe('evf-v1');
      expect(envelope.type).toBe('character.delta');
      expect(envelope.payload).toEqual({ hp: 15 });
      expect(typeof envelope.seq).toBe('number');
      expect(typeof envelope.ts).toBe('number');
      expect(typeof envelope.session_id).toBe('string');
    });

    it('seq is unique per-session per-emit', () => {
      const { emitter, ws, session } = setup(['read_char', 'subscribe']);

      emitter.emitDelta('character.delta', { hp: 10 });
      emitter.emitDelta('event.log.delta', { seq: 1 });

      expect(ws.send).toHaveBeenCalledTimes(2);
      const env1 = JSON.parse(ws.send.mock.calls[0]?.[0] ?? '{}');
      const env2 = JSON.parse(ws.send.mock.calls[1]?.[0] ?? '{}');
      expect(env1.seq).not.toBe(env2.seq);
      expect(env1.session_id).toBe(session.sessionId);
    });
  });

  describe('globalSeq monotonicity (T-02-02)', () => {
    it('increments monotonically across multiple emits', () => {
      const { emitter, ws } = setup(['read_char', 'read_combat', 'read_scene', 'subscribe']);
      emitter._resetSeq();

      for (let i = 0; i < 5; i++) {
        emitter.emitDelta('character.delta', { i });
      }

      const seqs = ws.send.mock.calls.map((call) => {
        const arg = call[0];
        return typeof arg === 'string' ? (JSON.parse(arg) as { seq: number }).seq : 0;
      });
      expect(seqs).toEqual([1, 2, 3, 4, 5]);
    });

    it('currentSeq reflects the last emitted seq', () => {
      const { emitter } = setup(['read_char']);
      emitter._resetSeq();
      expect(emitter.currentSeq).toBe(0);
      emitter.emitDelta('character.delta', {});
      expect(emitter.currentSeq).toBe(1);
      emitter.emitDelta('character.delta', {});
      expect(emitter.currentSeq).toBe(2);
    });
  });

  describe('replayBuffer integration', () => {
    it('pushes envelope to replay buffer for each session that receives it', () => {
      const { emitter, session, replayBuffer } = setup(['read_char']);
      emitter.emitDelta('character.delta', { hp: 10 });

      // ReplayBuffer should have 1 entry for this session
      const replayed = replayBuffer.replay(session.sessionId, 0);
      expect(replayed).toHaveLength(1);
      expect(replayed[0]?.type).toBe('character.delta');
    });

    it('does NOT push to replay buffer for sessions that do not have the cap', () => {
      const { emitter, session, replayBuffer } = setup(['read_combat']); // no read_char
      emitter.emitDelta('character.delta', { hp: 10 });

      const replayed = replayBuffer.replay(session.sessionId, 0);
      expect(replayed).toHaveLength(0);
    });

    it('pushes multiple deltas — all recoverable via replay', () => {
      const { emitter, session, replayBuffer } = setup(['read_char', 'subscribe']);
      emitter._resetSeq();

      emitter.emitDelta('character.delta', { hp: 10 });
      emitter.emitDelta('event.log.delta', { seq: 1 });
      emitter.emitDelta('character.delta', { hp: 8 });

      const replayed = replayBuffer.replay(session.sessionId, 0);
      expect(replayed).toHaveLength(3);
      expect(replayed.map((e) => e.type)).toEqual([
        'character.delta',
        'event.log.delta',
        'character.delta',
      ]);
    });
  });

  describe('sessionStore integration', () => {
    it('updates lastSeq in session store after emit', () => {
      const { emitter, session, sessionStore } = setup(['read_char']);
      emitter._resetSeq();
      emitter.emitDelta('character.delta', {});

      const updated = sessionStore.getSession(session.sessionId);
      expect(updated?.lastSeq).toBe(1);
    });

    it('skips and cleans up stale connections (session not in store)', () => {
      const replayBuffer = new ReplayBuffer();
      const sessionStore = new SessionStore();
      const emitter = new DeltaEmitter(replayBuffer, sessionStore);

      // Register a connection but delete the session from store immediately
      const ws = makeMockWs();
      const staleId = 'stale-session-id';
      // biome-ignore lint/suspicious/noExplicitAny: mock type
      emitter.registerSession(staleId, ws as any);
      // Session is NOT in sessionStore — stale connection

      expect(emitter.connectionCount).toBe(1);
      emitter.emitDelta('character.delta', {});

      // Stale connection should have been cleaned up
      expect(emitter.connectionCount).toBe(0);
      expect(ws.send).not.toHaveBeenCalled();
    });
  });

  describe('send error handling', () => {
    it('removes session on send error and continues', () => {
      const replayBuffer = new ReplayBuffer();
      const sessionStore = new SessionStore();
      const emitter = new DeltaEmitter(replayBuffer, sessionStore);

      // Session with throwing WS
      const s1 = sessionStore.createSession('token-1', 'it', ['read_char']);
      const brokenWs = makeMockWs(true); // throws on send
      // biome-ignore lint/suspicious/noExplicitAny: mock type
      emitter.registerSession(s1.sessionId, brokenWs as any);

      // Session that works fine
      const s2 = sessionStore.createSession('token-2', 'it', ['read_char']);
      const goodWs = makeMockWs();
      // biome-ignore lint/suspicious/noExplicitAny: mock type
      emitter.registerSession(s2.sessionId, goodWs as any);

      // Should not throw
      expect(() => emitter.emitDelta('character.delta', {})).not.toThrow();

      // Broken session cleaned up
      expect(emitter.connectionCount).toBe(1);
      // Good session still received
      expect(goodWs.send).toHaveBeenCalledOnce();
    });
  });

  // ─── sendInitialToSession tests (DE-INIT-01..06) ──────────────────────────────

  describe('sendInitialToSession', () => {
    it('DE-INIT-01: sends to the target session only — other sessions receive nothing', () => {
      const replayBuffer = new ReplayBuffer();
      const sessionStore = new SessionStore();
      const emitter = new DeltaEmitter(replayBuffer, sessionStore);

      const target = sessionStore.createSession('tok-target', 'it', ['read_char']);
      const other = sessionStore.createSession('tok-other', 'it', ['read_char']);
      const wsTarget = makeMockWs();
      const wsOther = makeMockWs();
      // biome-ignore lint/suspicious/noExplicitAny: mock type
      emitter.registerSession(target.sessionId, wsTarget as any);
      // biome-ignore lint/suspicious/noExplicitAny: mock type
      emitter.registerSession(other.sessionId, wsOther as any);

      emitter.sendInitialToSession(target.sessionId, 'character.delta', { hp: 42 });

      expect(wsTarget.send).toHaveBeenCalledOnce();
      expect(wsOther.send).not.toHaveBeenCalled();
    });

    it('DE-INIT-02: envelope has proto evf-v1, fresh seq, correct type, session_id = target', () => {
      const { emitter, session, ws } = setup(['read_char']);
      emitter._resetSeq();

      emitter.sendInitialToSession(session.sessionId, 'character.delta', { hp: 7 });

      expect(ws.send).toHaveBeenCalledOnce();
      const envelope = JSON.parse(ws.send.mock.calls[0]?.[0] ?? '{}');
      expect(envelope.proto).toBe('evf-v1');
      expect(envelope.seq).toBe(1); // incremented from 0
      expect(envelope.type).toBe('character.delta');
      expect(envelope.payload).toEqual({ hp: 7 });
      expect(envelope.session_id).toBe(session.sessionId);
      expect(typeof envelope.ts).toBe('number');
    });

    it('DE-INIT-03: envelope pushed to replay buffer and lastSeq updated', () => {
      const { emitter, session, replayBuffer, sessionStore } = setup(['read_char']);
      emitter._resetSeq();

      emitter.sendInitialToSession(session.sessionId, 'character.delta', { hp: 9 });

      const replayed = replayBuffer.replay(session.sessionId, 0);
      expect(replayed).toHaveLength(1);
      expect(replayed[0]?.type).toBe('character.delta');

      const updated = sessionStore.getSession(session.sessionId);
      expect(updated?.lastSeq).toBe(1);
    });

    it('DE-INIT-04: cap gate — session without read_char receives nothing and seq stays 0', () => {
      const { emitter, session, ws } = setup(['read_combat']); // no read_char
      emitter._resetSeq();

      emitter.sendInitialToSession(session.sessionId, 'character.delta', { hp: 99 });

      expect(ws.send).not.toHaveBeenCalled();
      expect(emitter.currentSeq).toBe(0); // seq must NOT have incremented
    });

    it('DE-INIT-05: unknown/unregistered sessionId → no-op, no throw, seq unchanged', () => {
      const { emitter } = setup(['read_char']);
      emitter._resetSeq();

      expect(() =>
        emitter.sendInitialToSession('nonexistent-session-id', 'character.delta', {}),
      ).not.toThrow();
      expect(emitter.currentSeq).toBe(0);
    });

    it('DE-INIT-06: send() throws → stale connection cleaned up, no throw to caller', () => {
      const replayBuffer = new ReplayBuffer();
      const sessionStore = new SessionStore();
      const emitter = new DeltaEmitter(replayBuffer, sessionStore);

      const s = sessionStore.createSession('tok-broken', 'it', ['read_char']);
      const brokenWs = makeMockWs(true); // throws on send
      // biome-ignore lint/suspicious/noExplicitAny: mock type
      emitter.registerSession(s.sessionId, brokenWs as any);

      expect(emitter.connectionCount).toBe(1);
      expect(() => emitter.sendInitialToSession(s.sessionId, 'character.delta', {})).not.toThrow();
      expect(emitter.connectionCount).toBe(0); // stale connection cleaned up
    });
  });

  // ─── Ephemeral frame deltas (latency audit 2026-06-11) ──────────────────────

  describe('emitDelta — ephemeral frame deltas (DE-EPH)', () => {
    it.each([
      'frame_png',
      'frame_pixels',
      'frame_stats',
    ])('DE-EPH-01: %s is sent to subscribers but NOT pushed to the replay buffer', (type) => {
      const { emitter, session, ws, replayBuffer } = setup();

      emitter.emitDelta(type, { sceneId: 's1' });

      expect(ws.send).toHaveBeenCalledTimes(1);
      expect(replayBuffer.replay(session.sessionId, 0)).toHaveLength(0);
    });

    it('DE-EPH-02: frame deltas do NOT advance globalSeq — stateful seqs stay consecutive', () => {
      const { emitter, session, replayBuffer } = setup();

      emitter.emitDelta('character.delta', { hp: 10 }); // seq 1
      emitter.emitDelta('frame_png', { sceneId: 's1' }); // reuses seq 1
      emitter.emitDelta('frame_png', { sceneId: 's1' }); // reuses seq 1
      emitter.emitDelta('character.delta', { hp: 9 }); // seq 2

      const buffered = replayBuffer.replay(session.sessionId, 0);
      expect(buffered.map((e) => e.seq)).toEqual([1, 2]);
      // No seq hole → hasGap must not misread skipped frames as delta loss.
      expect(replayBuffer.hasGap(session.sessionId, 0)).toBe(false);
    });

    it('DE-EPH-03: frame envelope carries the CURRENT seq (no advance, monotonic-safe for SeqTracker)', () => {
      const { emitter, ws } = setup();

      emitter.emitDelta('character.delta', { hp: 10 }); // seq 1
      emitter.emitDelta('frame_png', { sceneId: 's1' });

      const frameEnvelope = JSON.parse((ws.send as ReturnType<typeof vi.fn>).mock.calls[1]?.[0]);
      expect(frameEnvelope.type).toBe('frame_png');
      expect(frameEnvelope.seq).toBe(1);
    });

    it('DE-EPH-04: frame deltas do NOT update the session lastSeq bookkeeping', () => {
      const { emitter, session, sessionStore } = setup();

      emitter.emitDelta('character.delta', { hp: 10 }); // seq 1 → lastSeq 1
      emitter.emitDelta('frame_png', { sceneId: 's1' }); // must not touch lastSeq

      expect(sessionStore.getSession(session.sessionId)?.lastSeq).toBe(1);
    });
  });

  describe('emitDelta — frame backpressure (DE-BP)', () => {
    function setupWithBufferedAmount(bufferedAmount: number) {
      const replayBuffer = new ReplayBuffer();
      const sessionStore = new SessionStore();
      const emitter = new DeltaEmitter(replayBuffer, sessionStore);
      const session = sessionStore.createSession('tok-slow', 'it', [
        'read_char',
        'read_combat',
        'read_scene',
        'subscribe',
      ]);
      const ws = { send: vi.fn(), readyState: 1, bufferedAmount };
      // biome-ignore lint/suspicious/noExplicitAny: ws mock type
      emitter.registerSession(session.sessionId, ws as any);
      return { emitter, session, ws };
    }

    it('DE-BP-01: frame delta is SKIPPED when the session socket buffer exceeds the threshold', () => {
      const { emitter, ws } = setupWithBufferedAmount(300_000); // > 262_144

      emitter.emitDelta('frame_png', { sceneId: 's1' });

      expect(ws.send).not.toHaveBeenCalled();
    });

    it('DE-BP-02: frame delta is sent when the socket buffer is under the threshold', () => {
      const { emitter, ws } = setupWithBufferedAmount(100_000);

      emitter.emitDelta('frame_png', { sceneId: 's1' });

      expect(ws.send).toHaveBeenCalledTimes(1);
    });

    it('DE-BP-03: stateful deltas are NEVER dropped, even on a saturated socket', () => {
      const { emitter, ws } = setupWithBufferedAmount(10_000_000);

      emitter.emitDelta('character.delta', { hp: 1 });

      expect(ws.send).toHaveBeenCalledTimes(1);
    });

    it('DE-BP-04: a saturated session does not affect delivery to a healthy session', () => {
      const replayBuffer = new ReplayBuffer();
      const sessionStore = new SessionStore();
      const emitter = new DeltaEmitter(replayBuffer, sessionStore);
      const caps = ['read_char', 'read_combat', 'read_scene', 'subscribe'];

      const slow = sessionStore.createSession('tok-slow', 'it', caps);
      const slowWs = { send: vi.fn(), readyState: 1, bufferedAmount: 9_999_999 };
      const fast = sessionStore.createSession('tok-fast', 'it', caps);
      const fastWs = { send: vi.fn(), readyState: 1, bufferedAmount: 0 };
      // biome-ignore lint/suspicious/noExplicitAny: ws mock type
      emitter.registerSession(slow.sessionId, slowWs as any);
      // biome-ignore lint/suspicious/noExplicitAny: ws mock type
      emitter.registerSession(fast.sessionId, fastWs as any);

      emitter.emitDelta('frame_png', { sceneId: 's1' });

      expect(slowWs.send).not.toHaveBeenCalled();
      expect(fastWs.send).toHaveBeenCalledTimes(1);
    });
  });
});
