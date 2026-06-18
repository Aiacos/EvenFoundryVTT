/**
 * isWizardNoAuth() — DEV-ONLY gate that removes the access-token step from the wizard.
 *
 * When `true`, the pairing wizard skips Step 2 (token entry) entirely: Step 1
 * (bridge URL) advances straight to Step 3 (character selection), and every bridge
 * request goes out with an empty bearer (the bridge, when started with
 * `EVF_DEV_NO_AUTH=true`, accepts it — see `packages/bridge/src/auth/is-dev-no-auth.ts`).
 *
 * Gating: EXPLICIT opt-in only — `VITE_EVF_NO_AUTH === 'true'`. We deliberately do
 * NOT key off `import.meta.env.DEV`, because Vitest also reports `DEV === true`, which
 * would silently skip the token step inside the wizard's own unit tests. Requiring the
 * flag keeps tests on the real token flow and makes the bypass a conscious dev choice,
 * symmetric with the bridge's `EVF_DEV_NO_AUTH`. In a production (`.ehpk`) build the
 * flag is unset, so this returns `false` and the branch is dead code.
 *
 * The bridge side is independently hard-gated and OFF by default, so a dev wizard
 * that skips the token can only ever connect to a bridge an operator explicitly put
 * into `EVF_DEV_NO_AUTH` mode.
 *
 * @returns `true` when the wizard should skip the token step.
 */
export function isWizardNoAuth(): boolean {
  return import.meta.env.VITE_EVF_NO_AUTH === 'true';
}

/**
 * The single connection profile — the one canonical way the plugin reaches the
 * bridge that fronts Foundry/Forge (Feature 001 D1, replaces the prior 4-source
 * ambiguity).
 *
 * Per the connection-profile contract: the `bridgeUrl` is the persisted source of
 * truth (per-device); the `token` is held in memory for the session only and is
 * NEVER persisted (T-02-01) — the wizard re-acquires it each launch.
 *
 * @see specs/001-foundry-g2-hud/contracts/connection-profile.md
 */
export interface ConnectionProfile {
  /** Full HTTPS origin of the bridge (e.g. `https://evf-bridge.example`). */
  readonly bridgeUrl: string;
  /** 24h access credential — in-memory only, blank until pasted (or a dev sentinel). */
  readonly token: string;
}

/**
 * Dev-only EXPLICIT bridge URL override. NO implicit `localhost` default.
 *
 * Returns `VITE_EVF_DEV_BRIDGE_URL` when set, else `''`. The previous implicit
 * `http://localhost:8910` fallback was REMOVED (Feature 001 D1): it was the root of
 * the on-phone failure (a build silently defaulting to an address the phone cannot
 * reach). A dev who wants to skip typing the URL sets `VITE_EVF_DEV_BRIDGE_URL`
 * explicitly (the gated dev escape hatch, e.g. via the gitignored `.env.local`).
 *
 * @returns the explicit dev bridge URL, or `''`.
 */
export function devBridgeUrl(): string {
  const override = import.meta.env.VITE_EVF_DEV_BRIDGE_URL as string | undefined;
  return override && override.length > 0 ? override : '';
}

/**
 * Resolve the single bridge URL (Feature 001 D1 — the one direct link).
 *
 * Precedence (no silent `localhost`):
 *   1. **Saved profile** `bridgeUrl` (the canonical user path) — wins when present.
 *   2. **Explicitly-gated dev override** ({@link devBridgeUrl}) — never the default
 *      in a user build.
 *   3. `''` — unconfigured. The wizard/launch then routes the user to pairing
 *      instead of dialing an unreachable default.
 *
 * @param savedBridgeUrl The bridgeUrl from a persisted profile, if any.
 * @returns the resolved bridge URL, or `''` when unconfigured.
 */
export function resolveBridgeUrl(savedBridgeUrl?: string | null): string {
  const saved = (savedBridgeUrl ?? '').trim();
  if (saved.length > 0) {
    return saved;
  }
  return devBridgeUrl();
}
