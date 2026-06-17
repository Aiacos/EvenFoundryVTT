/**
 * handleClientPlayerView unit tests (P2b — intent record + orchestrator drive + reply).
 *
 * CPV-01: enable message → intent stored, orchestrator.applyIntent called,
 *         current state replied as `player_view_status`
 * CPV-02: disable message → intent {mode:off} stored + orchestrator driven + state replied
 * CPV-03: malformed JSON → ignored (no throw, no store mutation, no applyIntent, no emit)
 * CPV-04: other message type (client_setting) → ignored (no mutation, no applyIntent, no emit)
 * CPV-05: enable with actorId/foundryUrl → fields recorded in intent + passed to applyIntent
 * CPV-06: Buffer payload accepted (ws binary frame)
 *
 * The orchestrator is a fake whose `getState()` returns a fixed status and whose
 * `applyIntent` is a spy — so the handler's contract (record → drive → reply with
 * current state) is asserted without a real headless browser.
 *
 * @see ./client-player-view-handler.ts
 */
import { PLAYER_VIEW_STATUS_TYPE, type PlayerViewStatus } from '@evf/shared-protocol';
import type { Logger } from 'pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlayerViewIntent } from '../headless/player-view-store.js';
import { PlayerViewStore } from '../headless/player-view-store.js';
import {
  type ClientPlayerViewDeps,
  handleClientPlayerView,
  type PlayerViewOrchestratorLike,
} from './client-player-view-handler.js';
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
  applyIntent: ReturnType<typeof vi.fn>;
  state: PlayerViewStatus;
}

/**
 * Build a fresh handler harness with one registered, handshaked session and a
 * fake orchestrator. The session's fake ws `send` is captured so the outbound
 * `player_view_status` envelope can be asserted; `state` is the value the fake
 * orchestrator reports via `getState()`.
 */
function makeHarness(state: PlayerViewStatus = { state: 'starting' }): Harness {
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

  const applyIntent = vi.fn<(intent: PlayerViewIntent) => void>();
  const orchestrator: PlayerViewOrchestratorLike = {
    applyIntent,
    getState: () => state,
  };

  return {
    deps: { playerViewStore, deltaEmitter, orchestrator },
    playerViewStore,
    deltaEmitter,
    sessionId: session.sessionId,
    logger,
    warn,
    send,
    applyIntent,
    state,
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

  it('CPV-01: enable → intent stored, orchestrator driven, current state replied', () => {
    handleClientPlayerView(
      h.deps,
      h.sessionId,
      JSON.stringify({ type: 'client_player_view', mode: 'streaming' }),
      h.logger,
    );

    expect(h.playerViewStore.get()).toEqual({ mode: 'streaming' });
    expect(h.applyIntent).toHaveBeenCalledTimes(1);
    expect(h.applyIntent).toHaveBeenCalledWith({ mode: 'streaming' });
    expect(sentStatus(h.send)).toEqual({ state: 'starting' });
    expect(h.warn).not.toHaveBeenCalled();
  });

  it('CPV-02: off mode stores {mode:off}, drives orchestrator, replies current state', () => {
    const off = makeHarness({ state: 'off' });
    handleClientPlayerView(
      off.deps,
      off.sessionId,
      JSON.stringify({ type: 'client_player_view', mode: 'off' }),
      off.logger,
    );

    expect(off.playerViewStore.get()).toEqual({ mode: 'off' });
    expect(off.applyIntent).toHaveBeenCalledWith({ mode: 'off' });
    expect(sentStatus(off.send)).toEqual({ state: 'off' });
    expect(off.warn).not.toHaveBeenCalled();
  });

  it('CPV-03: malformed JSON is ignored (no throw, no mutation, no drive, no emit)', () => {
    expect(() => handleClientPlayerView(h.deps, h.sessionId, 'not json{', h.logger)).not.toThrow();
    expect(h.playerViewStore.get()).toEqual({ mode: 'off' });
    expect(h.applyIntent).not.toHaveBeenCalled();
    expect(h.send).not.toHaveBeenCalled();
    expect(h.warn).not.toHaveBeenCalled();
  });

  it('CPV-04: other message type (client_setting) is ignored — no mutation, no drive, no emit', () => {
    handleClientPlayerView(
      h.deps,
      h.sessionId,
      JSON.stringify({ type: 'client_setting', settings: { brightness: 40 } }),
      h.logger,
    );
    expect(h.playerViewStore.get()).toEqual({ mode: 'off' });
    expect(h.applyIntent).not.toHaveBeenCalled();
    expect(h.send).not.toHaveBeenCalled();
    expect(h.warn).not.toHaveBeenCalled();
  });

  it('CPV-05: enable with actorId/foundryUrl records + passes both fields', () => {
    handleClientPlayerView(
      h.deps,
      h.sessionId,
      JSON.stringify({
        type: 'client_player_view',
        mode: 'actor',
        actorId: 'actor-b',
        foundryUrl: 'https://forge.example.com/game',
      }),
      h.logger,
    );

    const expectedIntent = {
      mode: 'actor',
      actorId: 'actor-b',
      foundryUrl: 'https://forge.example.com/game',
    };
    expect(h.playerViewStore.get()).toEqual(expectedIntent);
    expect(h.applyIntent).toHaveBeenCalledWith(expectedIntent);
    expect(sentStatus(h.send)).toEqual({ state: 'starting' });
  });

  it('CPV-06: accepts a Buffer payload (ws binary frame)', () => {
    handleClientPlayerView(
      h.deps,
      h.sessionId,
      Buffer.from(JSON.stringify({ type: 'client_player_view', mode: 'streaming' }), 'utf-8'),
      h.logger,
    );
    expect(h.playerViewStore.get()).toEqual({ mode: 'streaming' });
    expect(h.applyIntent).toHaveBeenCalledWith({ mode: 'streaming' });
    expect(sentStatus(h.send)).toEqual({ state: 'starting' });
  });
});
