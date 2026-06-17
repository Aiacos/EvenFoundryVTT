/**
 * HeadlessOrchestrator unit tests (P2b — state machine with a mocked browser port).
 *
 * ORC-01: mode:off → no launch, status {off}
 * ORC-02: mode:streaming → {starting} then {live} (mock launch resolves)
 * ORC-03: launch rejects → {error} with the secret-free message
 * ORC-04: streaming→off tears down the live session (session.close called)
 * ORC-05: streaming→actor tears down the old session + launches a new one
 * ORC-06: missing foundryUrl (intent + env) → {unavailable}
 * ORC-07: intent foundryUrl overrides env; env creds flow into the launch cfg
 * ORC-08: stop() tears down the live session and reports {off}
 *
 * The {@link HeadlessBrowser} port is mocked — no real Chromium is launched, so
 * these tests run in CI with no browser binary.
 *
 * @see ./orchestrator.ts
 */
import type { PlayerViewStatus } from '@evf/shared-protocol';
import { describe, expect, it, vi } from 'vitest';
import type {
  HeadlessBrowser,
  HeadlessSession,
  HeadlessSessionConfig,
} from './headless-browser.js';
import { type EnvConfig, HeadlessOrchestrator } from './orchestrator.js';
import type { PlayerViewIntent } from './player-view-store.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

/** A controllable mock session whose close() is a spy. */
function makeSession(): HeadlessSession & { close: ReturnType<typeof vi.fn> } {
  return { close: vi.fn().mockResolvedValue(undefined) };
}

interface Harness {
  orchestrator: HeadlessOrchestrator;
  statuses: PlayerViewStatus[];
  launch: ReturnType<typeof vi.fn>;
  lastCfg: () => HeadlessSessionConfig | undefined;
}

/**
 * Build an orchestrator with a mocked browser. `launchImpl` lets a test control
 * the launch outcome (resolve with a session, reject, etc.). `env` injects a
 * fixed {@link EnvConfig} (bypassing process.env).
 */
function makeHarness(
  launchImpl?: (cfg: HeadlessSessionConfig) => Promise<HeadlessSession>,
  env: EnvConfig = {},
): Harness {
  const statuses: PlayerViewStatus[] = [];
  const launch = vi.fn(
    launchImpl ?? ((_cfg: HeadlessSessionConfig) => Promise.resolve(makeSession())),
  );
  const browser: HeadlessBrowser = { launch };
  const orchestrator = new HeadlessOrchestrator({
    browser,
    onStatus: (s) => statuses.push(s),
    readEnv: () => env,
  });
  return {
    orchestrator,
    statuses,
    launch,
    lastCfg: () => launch.mock.calls.at(-1)?.[0] as HeadlessSessionConfig | undefined,
  };
}

/** Flush microtasks so fire-and-forget applyIntent work settles. */
async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

const STREAMING: PlayerViewIntent = { mode: 'streaming', foundryUrl: 'https://f.example/game' };

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('HeadlessOrchestrator', () => {
  it('ORC-01: mode:off → no launch, status {off}', async () => {
    const h = makeHarness();
    h.orchestrator.applyIntent({ mode: 'off' });
    await flush();
    expect(h.launch).not.toHaveBeenCalled();
    expect(h.statuses).toEqual([{ state: 'off' }]);
    expect(h.orchestrator.getState()).toEqual({ state: 'off' });
  });

  it('ORC-02: streaming → {starting} then {live}', async () => {
    const h = makeHarness();
    h.orchestrator.applyIntent(STREAMING);
    await flush();
    expect(h.launch).toHaveBeenCalledTimes(1);
    expect(h.statuses).toEqual([{ state: 'starting' }, { state: 'live' }]);
    expect(h.orchestrator.getState()).toEqual({ state: 'live' });
  });

  it('ORC-03: launch rejects → {error} with secret-free message', async () => {
    const h = makeHarness(() => Promise.reject(new Error('navigation timeout')));
    h.orchestrator.applyIntent(STREAMING);
    await flush();
    expect(h.statuses).toEqual([
      { state: 'starting' },
      { state: 'error', detail: 'navigation timeout' },
    ]);
    expect(h.orchestrator.getState()).toEqual({ state: 'error', detail: 'navigation timeout' });
  });

  it('ORC-04: streaming→off tears down the live session', async () => {
    const session = makeSession();
    const h = makeHarness(() => Promise.resolve(session));
    h.orchestrator.applyIntent(STREAMING);
    await flush();
    expect(h.orchestrator.getState()).toEqual({ state: 'live' });

    h.orchestrator.applyIntent({ mode: 'off' });
    await flush();
    expect(session.close).toHaveBeenCalledTimes(1);
    expect(h.statuses.at(-1)).toEqual({ state: 'off' });
  });

  it('ORC-05: streaming→actor tears down the old session and launches a new one', async () => {
    const first = makeSession();
    const second = makeSession();
    let n = 0;
    const h = makeHarness(() => {
      n += 1;
      return Promise.resolve(n === 1 ? first : second);
    });

    h.orchestrator.applyIntent(STREAMING);
    await flush();
    expect(h.orchestrator.getState()).toEqual({ state: 'live' });

    h.orchestrator.applyIntent({
      mode: 'actor',
      actorId: 'actor-7',
      foundryUrl: 'https://f.example/game',
      userName: 'Player Seven',
    });
    await flush();

    expect(first.close).toHaveBeenCalledTimes(1);
    expect(h.launch).toHaveBeenCalledTimes(2);
    // actor mode passes the Forge gate with the STREAMING account (env creds +
    // storageState) AND selects the player's Foundry user on /join (password-free).
    expect(h.lastCfg()).toMatchObject({
      mode: 'actor',
      actorId: 'actor-7',
      userName: 'Player Seven',
    });
    expect(h.orchestrator.getState()).toEqual({ state: 'live' });
  });

  it('ORC-05b: actor mode without a resolved username (not opted in) → {unavailable}, no launch', async () => {
    const h = makeHarness();
    h.orchestrator.applyIntent({
      mode: 'actor',
      actorId: 'actor-7',
      foundryUrl: 'https://f.example/game',
    });
    await flush();
    expect(h.launch).not.toHaveBeenCalled();
    expect(h.orchestrator.getState()).toEqual({
      state: 'unavailable',
      detail: 'Selected player is not available for streaming (opt-in required)',
    });
  });

  it('ORC-06: missing foundryUrl (intent + env) → {unavailable}', async () => {
    const h = makeHarness(undefined, {}); // empty env, no intent url
    h.orchestrator.applyIntent({ mode: 'streaming' });
    await flush();
    expect(h.launch).not.toHaveBeenCalled();
    expect(h.statuses).toEqual([{ state: 'unavailable', detail: 'Foundry URL not configured' }]);
  });

  it('ORC-07: intent url overrides env; env creds flow into the launch cfg', async () => {
    const env: EnvConfig = {
      foundryUrl: 'https://env.example/game',
      forgeUser: 'u@example.com',
      forgePassword: 'secret-pw',
      storageStatePath: '/tmp/state.json',
    };
    const h = makeHarness(undefined, env);
    h.orchestrator.applyIntent({ mode: 'streaming', foundryUrl: 'https://intent.example/game' });
    await flush();
    const cfg = h.lastCfg();
    expect(cfg?.foundryUrl).toBe('https://intent.example/game'); // intent wins
    expect(cfg?.forgeUser).toBe('u@example.com');
    expect(cfg?.forgePassword).toBe('secret-pw');
    expect(cfg?.storageStatePath).toBe('/tmp/state.json');
  });

  it('ORC-07b: falls back to env foundryUrl when the intent omits it', async () => {
    const h = makeHarness(undefined, { foundryUrl: 'https://env.example/game' });
    h.orchestrator.applyIntent({ mode: 'streaming' });
    await flush();
    expect(h.lastCfg()?.foundryUrl).toBe('https://env.example/game');
    expect(h.orchestrator.getState()).toEqual({ state: 'live' });
  });

  it('ORC-08: stop() tears down the live session and reports {off}', async () => {
    const session = makeSession();
    const h = makeHarness(() => Promise.resolve(session));
    h.orchestrator.applyIntent(STREAMING);
    await flush();

    await h.orchestrator.stop();
    expect(session.close).toHaveBeenCalledTimes(1);
    expect(h.statuses.at(-1)).toEqual({ state: 'off' });
  });
});
