/**
 * headless-browser — the injectable browser port for the player-view orchestrator.
 *
 * The {@link HeadlessOrchestrator} (ADR-0015 §C, P2b) depends on this interface
 * rather than on Playwright directly, so the state machine is unit-testable with
 * a mock that never launches a real browser (Playwright is heavyweight and there
 * is no browser binary in CI). The production implementation lives in
 * {@link PlaywrightHeadlessBrowser} (`./playwright-browser.ts`).
 *
 * The contract is deliberately narrow: launch a session that logs into Foundry
 * and stays open streaming, and resolve once the scene canvas is ready (so the
 * orchestrator can report `live`); reject with a typed Error otherwise (so it can
 * report `error`). A returned {@link HeadlessSession} owns the browser resources
 * and is torn down via `close()`.
 *
 * SECURITY: credentials flow IN via {@link HeadlessSessionConfig} (read from
 * `process.env` by the orchestrator) and NEVER OUT — no method returns or logs a
 * password, and error messages must not embed secrets.
 *
 * @see packages/bridge/src/headless/orchestrator.ts (consumer / state machine)
 * @see packages/bridge/src/headless/playwright-browser.ts (production impl)
 * @see docs/architecture/0015-player-view-map-capture.md §C
 */

/**
 * Everything a single headless Foundry session needs to log in and stream.
 *
 * Built by the orchestrator from the {@link PlayerViewIntent} (`foundryUrl`,
 * `mode`, `actorId`, `userName`) merged with the bridge's STREAMING-account
 * credentials (`storageStatePath`, `forgeUser`, `forgePassword`) — used by BOTH
 * modes to pass the Forge gate (PASSWORD-FREE per-player model, ADR-0015 §C).
 */
export interface HeadlessSessionConfig {
  /** Foundry game URL. The launcher appends `?evfLeader=1` (or `&evfLeader=1`). */
  foundryUrl: string;
  /**
   * Map-view source mode:
   * - `streaming` — join as the configured/default streaming user (auto-framed).
   * - `actor`     — join as the selected PC's owning user ({@link userName}) for
   *   that player's fogged view, with a blank password.
   */
  mode: 'streaming' | 'actor';
  /** Foundry actor being viewed — `actor` mode (focus framing + audit). */
  actorId?: string;
  /**
   * Foundry USERNAME to select on the `/join` screen — `actor` mode only. The
   * bridge resolves it from `actorId`; the headless picks this user and joins with
   * a blank password (Foundry users have no password by default).
   */
  userName?: string;
  /** Path to a saved Playwright `storageState` JSON (the reliable login path). */
  storageStatePath?: string;
  /** Forge (streaming-account) email/username — best-effort native auto-login only. */
  forgeUser?: string;
  /** Forge (streaming-account) password — best-effort native auto-login only. NEVER logged. */
  forgePassword?: string;
}

/**
 * A live headless Foundry session.
 *
 * The page is left OPEN after launch so the EvenFoundryVTT Foundry module running
 * inside it can POST map frames to the bridge. `close()` tears down the page,
 * context, and browser; it is idempotent (a second call is a no-op).
 */
export interface HeadlessSession {
  /** Tear down the page + context + browser. Idempotent. */
  close(): Promise<void>;
}

/**
 * Injectable browser port the orchestrator depends on.
 *
 * The single method launches and authenticates a streaming session. Implementors
 * MUST reject (never resolve) when the scene canvas does not become ready within
 * a sensible timeout, with an Error whose message carries NO secrets.
 */
export interface HeadlessBrowser {
  /**
   * Launch a session that logs into Foundry and stays open streaming.
   *
   * Resolves once `window.game.ready` and `window.canvas.ready` are both true
   * (the scene canvas is rendering), or rejects with a typed Error (timeout,
   * login failure, navigation failure — message carries no secrets).
   *
   * @param cfg - Session configuration (URL, mode, actor, credentials).
   * @returns A {@link HeadlessSession} handle whose `close()` frees all resources.
   */
  launch(cfg: HeadlessSessionConfig): Promise<HeadlessSession>;
}
