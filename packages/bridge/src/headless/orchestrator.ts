/**
 * orchestrator — the headless player-view state machine (ADR-0015 §C, P2b).
 *
 * Driven by {@link PlayerViewIntent} toggles arriving from the EvenHub settings
 * panel (via the `client_player_view` WS handler). Each intent is translated into
 * at most one live headless Foundry session managed through the injectable
 * {@link HeadlessBrowser} port:
 *
 * ```
 *   intent.mode = 'off'                   → tear down any session → status {off}
 *   intent.mode = 'streaming' | 'actor'   → {starting} → launch → {live} | {error}
 *   (no foundryUrl from intent or env)    → status {unavailable}
 * ```
 *
 * Concurrency contract (single active session, latest-intent-wins):
 * - Only ONE session is ever live. A new intent while one is live tears the old
 *   one down (awaited) before launching the new one.
 * - Overlapping launches are guarded by an in-flight generation counter: every
 *   `applyIntent` bumps a generation; an async launch whose generation is stale
 *   when it completes is discarded (its session closed) — the latest intent wins.
 * - `applyIntent` NEVER throws: the async work is fire-and-forget and all outcomes
 *   are reported via `onStatus`.
 *
 * SECURITY: credentials are read from `process.env` BY NAME via {@link readPlayerViewEnv}
 * (overridable for tests). Passwords are NEVER logged and NEVER placed in a status
 * `detail` — `error` details carry the Error message only, which the browser port
 * guarantees is secret-free.
 *
 * @see packages/bridge/src/headless/headless-browser.ts (injected port)
 * @see packages/bridge/src/headless/player-view-store.ts (intent shape)
 * @see packages/bridge/src/ws/client-player-view-handler.ts (caller)
 * @see docs/architecture/0015-player-view-map-capture.md §C
 */

import type { PlayerViewStatus } from '@evf/shared-protocol';
import type {
  HeadlessBrowser,
  HeadlessSession,
  HeadlessSessionConfig,
} from './headless-browser.js';
import type { PlayerViewIntent } from './player-view-store.js';

/**
 * Credentials + defaults the orchestrator reads from the process environment.
 *
 * All fields are optional: a missing `foundryUrl` (and a missing intent URL)
 * yields `unavailable`; missing credentials fall through to the storage-state /
 * already-authed path (best-effort) in the browser port.
 */
export interface EnvConfig {
  /** Default Foundry game URL (`EVF_PLAYER_VIEW_FOUNDRY_URL`) — intent URL wins. */
  foundryUrl?: string;
  /** Forge account user/email (`EVF_PLAYER_VIEW_FORGE_USER`). */
  forgeUser?: string;
  /** Forge account password (`EVF_PLAYER_VIEW_FORGE_PASSWORD`). NEVER logged. */
  forgePassword?: string;
  /** Saved Playwright session path (`EVF_PLAYER_VIEW_STORAGE_STATE`). */
  storageStatePath?: string;
}

/**
 * Read the player-view environment configuration by variable name.
 *
 * The single place that touches `process.env` for player-view credentials.
 * Only present (non-empty) values are included — `exactOptionalPropertyTypes`
 * rejects explicit `undefined` on the optional {@link EnvConfig} fields.
 *
 * @returns The env-derived {@link EnvConfig} (any subset of fields may be absent).
 */
export function readPlayerViewEnv(): EnvConfig {
  const cfg: EnvConfig = {};
  const foundryUrl = process.env['EVF_PLAYER_VIEW_FOUNDRY_URL'];
  const forgeUser = process.env['EVF_PLAYER_VIEW_FORGE_USER'];
  const forgePassword = process.env['EVF_PLAYER_VIEW_FORGE_PASSWORD'];
  const storageStatePath = process.env['EVF_PLAYER_VIEW_STORAGE_STATE'];
  if (foundryUrl) cfg.foundryUrl = foundryUrl;
  if (forgeUser) cfg.forgeUser = forgeUser;
  if (forgePassword) cfg.forgePassword = forgePassword;
  if (storageStatePath) cfg.storageStatePath = storageStatePath;
  return cfg;
}

/** Constructor options for {@link HeadlessOrchestrator}. */
export interface HeadlessOrchestratorOptions {
  /** Injected browser port (production: PlaywrightHeadlessBrowser; tests: a mock). */
  browser: HeadlessBrowser;
  /** Called on EVERY state transition (the bridge broadcasts it to all glasses). */
  onStatus: (s: PlayerViewStatus) => void;
  /** Env reader override (tests inject a fixed {@link EnvConfig}); defaults to {@link readPlayerViewEnv}. */
  readEnv?: () => EnvConfig;
}

/** Status detail used when neither the intent nor the env supplies a Foundry URL. */
const NO_URL_DETAIL = 'Foundry URL not configured';

/** Status detail used when `actor` mode is requested but the actor has no streamable Foundry user (not opted in). */
const NO_ACTOR_USER_DETAIL = 'Selected player is not available for streaming (opt-in required)';

/**
 * Headless player-view orchestrator — one instance per bridge server.
 *
 * Construct it with an injected {@link HeadlessBrowser} and an `onStatus` sink
 * that broadcasts `player_view_status`. Feed it intents via {@link applyIntent};
 * call {@link stop} on server shutdown.
 */
export class HeadlessOrchestrator {
  private readonly browser: HeadlessBrowser;
  private readonly onStatus: (s: PlayerViewStatus) => void;
  private readonly readEnv: () => EnvConfig;

  /** The single live session, or `null` when nothing is running. */
  private session: HeadlessSession | null = null;
  /** Latest emitted status (also the value returned by {@link getState}). */
  private state: PlayerViewStatus = { state: 'off' };
  /**
   * Monotonic generation, bumped on every {@link applyIntent}. An async launch
   * captures the generation at start; if it no longer matches when the launch
   * settles, the result is stale and discarded (latest-intent-wins).
   */
  private generation = 0;

  constructor(opts: HeadlessOrchestratorOptions) {
    this.browser = opts.browser;
    this.onStatus = opts.onStatus;
    this.readEnv = opts.readEnv ?? readPlayerViewEnv;
  }

  /**
   * Return the latest orchestrator status (for the immediate per-session reply).
   */
  getState(): PlayerViewStatus {
    return this.state;
  }

  /**
   * Apply a new player-view intent. Drives the state machine; never throws.
   *
   * The async session work (teardown + launch) is fire-and-forget; outcomes are
   * reported via `onStatus`. The caller (WS handler) reads {@link getState} for
   * the immediate reply and relies on the broadcast for the eventual transition.
   *
   * @param intent - The new intent recorded from `client_player_view`.
   */
  applyIntent(intent: PlayerViewIntent): void {
    const gen = ++this.generation;
    // Fire-and-forget — every failure path resolves to an onStatus call, so the
    // returned promise never rejects; the explicit catch is belt-and-suspenders.
    void this.drive(intent, gen).catch(() => {
      // Unreachable: drive() catches its own errors and reports via onStatus.
    });
  }

  /**
   * Tear down any running session (server shutdown). Reports status `{off}`.
   *
   * Bumps the generation so any in-flight launch is discarded on completion.
   */
  async stop(): Promise<void> {
    this.generation += 1;
    await this.teardown();
    this.emit({ state: 'off' });
  }

  /**
   * Core async transition: tear down the old session, then (for an enabled mode)
   * launch a new one. Guarded by the generation captured at call time.
   */
  private async drive(intent: PlayerViewIntent, gen: number): Promise<void> {
    // 'off' → tear down and report off.
    if (intent.mode === 'off') {
      await this.teardown();
      if (gen !== this.generation) return; // superseded mid-teardown
      this.emit({ state: 'off' });
      return;
    }

    // Resolve the Foundry URL (intent wins over env). Missing → unavailable.
    const env = this.readEnv();
    const foundryUrl = intent.foundryUrl ?? env.foundryUrl;
    if (foundryUrl === undefined || foundryUrl.length === 0) {
      await this.teardown();
      if (gen !== this.generation) return;
      this.emit({ state: 'unavailable', detail: NO_URL_DETAIL });
      return;
    }

    // `actor` mode joins as the selected player's Foundry user, so it REQUIRES a
    // resolved Foundry username (the bridge maps actorId → username, and only
    // players who OPTED IN to streaming are mapped). Missing → unavailable.
    if (
      intent.mode === 'actor' &&
      (intent.userName === undefined || intent.userName.length === 0)
    ) {
      await this.teardown();
      if (gen !== this.generation) return;
      this.emit({ state: 'unavailable', detail: NO_ACTOR_USER_DETAIL });
      return;
    }

    // A new session supersedes any prior one — tear the old one down first.
    await this.teardown();
    if (gen !== this.generation) return; // a newer intent already took over

    this.emit({ state: 'starting' });

    // Build the launch config (PASSWORD-FREE model). BOTH `streaming` and `actor`
    // pass the Forge gate with the bridge's streaming account (env creds + saved
    // storageState). `actor` ADDITIONALLY selects the player's Foundry user on the
    // `/join` screen (`userName`) and joins with a blank password — so the glasses
    // show that player's real fogged view without any per-player secret.
    const cfg: HeadlessSessionConfig = { foundryUrl, mode: intent.mode };
    if (intent.actorId !== undefined) cfg.actorId = intent.actorId;
    if (env.storageStatePath !== undefined) cfg.storageStatePath = env.storageStatePath;
    if (env.forgeUser !== undefined) cfg.forgeUser = env.forgeUser;
    if (env.forgePassword !== undefined) cfg.forgePassword = env.forgePassword;
    if (intent.mode === 'actor' && intent.userName !== undefined) cfg.userName = intent.userName;

    let launched: HeadlessSession;
    try {
      launched = await this.browser.launch(cfg);
    } catch (err) {
      if (gen !== this.generation) return; // superseded; nothing to report
      const detail = err instanceof Error ? err.message : 'launch failed';
      this.emit({ state: 'error', detail });
      return;
    }

    // Stale-launch guard: a newer intent arrived while we were launching — the
    // freshly-opened session is orphaned, so close it and let the latest win.
    if (gen !== this.generation) {
      await safeClose(launched);
      return;
    }

    this.session = launched;
    this.emit({ state: 'live' });
  }

  /** Close the live session (if any) and clear the handle. Error-safe. */
  private async teardown(): Promise<void> {
    const current = this.session;
    if (current === null) return;
    this.session = null;
    await safeClose(current);
  }

  /** Record + broadcast a status, but only when it actually changed. */
  private emit(status: PlayerViewStatus): void {
    this.state = status;
    this.onStatus(status);
  }
}

/** Close a session, swallowing teardown errors (best-effort cleanup). */
async function safeClose(session: HeadlessSession): Promise<void> {
  try {
    await session.close();
  } catch {
    // Teardown failures are non-fatal — the session is being discarded anyway.
  }
}
