/**
 * handleClientPlayerView unit tests (P1 — intent record + status reply).
 *
 * CPV-01: enable message → intent stored + `player_view_status{unavailable}` sent
 * CPV-02: disable message → intent {enabled:false} stored + `player_view_status{off}` sent
 * CPV-03: malformed JSON → ignored (no throw, no store mutation, no emit)
 * CPV-04: other message type (client_setting) → ignored (no mutation, no emit)
 * CPV-05: enable with actorId/foundryUrl → fields recorded in intent
 * CPV-06: Buffer payload accepted (ws binary frame)
 *
 * @see ./client-player-view-handler.ts
 */
import { PLAYER_VIEW_STATUS_TYPE } from '@evf/shared-protocol';
import type { Logger } from 'pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlayerViewStore } from '../headless/player-view-store.js';
import { type ClientPlayerViewDeps, handleClientPlayerView } from './client-player-view-handler.js';
import { DeltaEmitter } from './delta-emitter.js';
import { ReplayBuffer } from './replay-buffer.js';
import { SessionStore } from './session-store.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

const TOKEN = 'tok-abcdef-secret';

interface Harness {
  deps: ClientPlayerViewDeps;
  playerViewStore: PlayerViewStore;
  deltaEmitter: DeltaEmitter;
  sessionId: string;
  logger: Logger;
  warn: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
}

/**
 * Build a fresh handler harness with one registered, handshaked session. The
 * session's fake ws `send` is captured so the outbound `player_view_status`
 * envelope can be asserted.
 */
function makeHarness(): Harness {
  const sessionStore = new SessionStore();
  const replayBuffer = new ReplayBuffer();
  const deltaEmitter = new DeltaEmitter(replayBuffer, sessionStore);
  const playerViewStore = new PlayerViewStore();

  // No specific cap required for player_view_status (not in DELTA_CAP_MAP), so an
  // empty caps array still receives it — same routing as settings.display.
  const session = sessionStore.createSession(TOKEN, 'en', []);
  const send = vi.fn();
  const fakeWs = {
    send,
    bufferedAmount: 0,
  } as unknown as Parameters<DeltaEmitter['registerSession']>[1];
  deltaEmitter.registerSession(session.sessionId, fakeWs);

  const warn = vi.fn();
  const logger = { warn, info: vi.fn(), debug: vi.fn() } as unknown as Logger;

  return {
    deps: { playerViewStore, deltaEmitter },
    playerViewStore,
    deltaEmitter,
    sessionId: session.sessionId,
    logger,
    warn,
    send,
  };
}

/** Parse the single `player_view_status` payload sent to the session, if any. */
function sentStatus(send: ReturnType<typeof vi.fn>): unknown {
  expect(send).toHaveBeenCalledTimes(1);
  const raw = send.mock.calls[0]?.[0] as string;
  const envelope = JSON.parse(raw);
  expect(envelope.type).toBe(PLAYER_VIEW_STATUS_TYPE);
  return envelope.payload;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('handleClientPlayerView', () => {
  let h: Harness;
  beforeEach(() => {
    h = makeHarness();
  });

  it('CPV-01: enable message stores intent and emits player_view_status{unavailable}', () => {
    handleClientPlayerView(
      h.deps,
      h.sessionId,
      JSON.stringify({ type: 'client_player_view', enabled: true }),
      h.logger,
    );

    expect(h.playerViewStore.get()).toEqual({ enabled: true });
    expect(sentStatus(h.send)).toEqual({
      state: 'unavailable',
      detail: 'Headless orchestrator not yet deployed (ADR-0015 P2)',
    });
    expect(h.warn).not.toHaveBeenCalled();
  });

  it('CPV-02: disable message stores {enabled:false} and emits player_view_status{off}', () => {
    handleClientPlayerView(
      h.deps,
      h.sessionId,
      JSON.stringify({ type: 'client_player_view', enabled: false }),
      h.logger,
    );

    expect(h.playerViewStore.get()).toEqual({ enabled: false });
    expect(sentStatus(h.send)).toEqual({ state: 'off' });
    expect(h.warn).not.toHaveBeenCalled();
  });

  it('CPV-03: malformed JSON is ignored (no throw, no mutation, no emit)', () => {
    expect(() => handleClientPlayerView(h.deps, h.sessionId, 'not json{', h.logger)).not.toThrow();
    expect(h.playerViewStore.get()).toEqual({ enabled: false });
    expect(h.send).not.toHaveBeenCalled();
    expect(h.warn).not.toHaveBeenCalled();
  });

  it('CPV-04: other message type (client_setting) is ignored, no mutation, no emit', () => {
    handleClientPlayerView(
      h.deps,
      h.sessionId,
      JSON.stringify({ type: 'client_setting', settings: { brightness: 40 } }),
      h.logger,
    );
    expect(h.playerViewStore.get()).toEqual({ enabled: false });
    expect(h.send).not.toHaveBeenCalled();
    expect(h.warn).not.toHaveBeenCalled();
  });

  it('CPV-05: enable with actorId/foundryUrl records both fields in the intent', () => {
    handleClientPlayerView(
      h.deps,
      h.sessionId,
      JSON.stringify({
        type: 'client_player_view',
        enabled: true,
        actorId: 'actor-b',
        foundryUrl: 'https://forge.example.com/game',
      }),
      h.logger,
    );

    expect(h.playerViewStore.get()).toEqual({
      enabled: true,
      actorId: 'actor-b',
      foundryUrl: 'https://forge.example.com/game',
    });
    expect(sentStatus(h.send)).toEqual({
      state: 'unavailable',
      detail: 'Headless orchestrator not yet deployed (ADR-0015 P2)',
    });
  });

  it('CPV-06: accepts a Buffer payload (ws binary frame)', () => {
    handleClientPlayerView(
      h.deps,
      h.sessionId,
      Buffer.from(JSON.stringify({ type: 'client_player_view', enabled: true }), 'utf-8'),
      h.logger,
    );
    expect(h.playerViewStore.get()).toEqual({ enabled: true });
    expect(sentStatus(h.send)).toEqual({
      state: 'unavailable',
      detail: 'Headless orchestrator not yet deployed (ADR-0015 P2)',
    });
  });
});
