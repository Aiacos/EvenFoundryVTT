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
 * Dev-only pre-filled bridge URL so the tester never has to type it.
 *
 * - `VITE_EVF_DEV_BRIDGE_URL` (if set) wins — point it at your local bridge.
 * - else, when the no-auth dev mode is EXPLICITLY enabled (`VITE_EVF_NO_AUTH=true`),
 *   defaults to `http://localhost:8910` (the local bridge).
 * - otherwise empty string (production builds AND unit tests, which set neither var,
 *   keep the original blank Step 1 field — no test breakage).
 *
 * @returns the bridge URL to seed into the wizard's initial state, or `''`.
 */
export function devBridgeUrl(): string {
  const override = import.meta.env.VITE_EVF_DEV_BRIDGE_URL as string | undefined;
  if (override) {
    return override;
  }
  if (import.meta.env.VITE_EVF_NO_AUTH === 'true') {
    return 'http://localhost:8910';
  }
  return '';
}
