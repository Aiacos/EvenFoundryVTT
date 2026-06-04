/**
 * @evf/g2-app — production launch glue.
 *
 * On `index.html` load, the production entry (`../index.ts`) calls
 * {@link launchApp}. This module decides what the app does next:
 *
 *   - **Branch A — no-auth dev:** when `isNoAuth()` is `true`, boot the engine
 *     immediately via `bootEngine({ bridgeUrl: devBridgeUrl(), token: '', locale })`.
 *     The dev no-auth bridge accepts an empty token, so this is the ONLY path
 *     that can boot from "no usable token". This is what unblocks the EvenHub
 *     simulator (boot sequence + HUD frame instead of a black screen).
 *   - **Branch B — paired, non-dev:** `isNoAuth()` is `false` and a stored
 *     `Session` exists. A persisted session carries a `bridgeUrl` but NEVER a
 *     token — `SessionSchema` hard-enforces `tokenObfuscated: z.null()` (T-02-01,
 *     see `../wizard/tier3-storage.ts`). Without a token the capability handshake
 *     cannot complete, so we route to the wizard whose auto-connect / STEP2 flow
 *     re-acquires the token (matches the existing token-expiry → STEP2 design).
 *   - **Branch C — unpaired, non-dev:** `isNoAuth()` is `false` and no stored
 *     session — route to the wizard for first-time pairing.
 *
 * **Fail-soft:** the boot path is wrapped in try/catch. A `bootEngine` rejection
 * is logged via `console.error` and swallowed — `launchApp` itself never rejects
 * for a boot error, so a boot failure never produces a silent white-screen via
 * an unhandled top-level module rejection.
 *
 * **W-4 gate:** this module imports `bootEngine` from `../index.js` (the thin
 * production wrapper) so it stays free of DI literals. The W-4 grep gate only
 * covers `../index.ts`; `bootEngine` itself routes through `_bootEngineCore`
 * with no test-injection surface.
 *
 * @see ../index.ts (thin production entry — calls launchApp)
 * @see ../wizard/tier3-storage.ts (SessionSchema — tokenObfuscated: z.null(), T-02-01)
 * @see ../wizard/is-dev-no-auth.ts (isWizardNoAuth + devBridgeUrl)
 * @see .planning/quick/260604-ovn-wire-the-production-launch-glue-so-index/260604-ovn-PLAN.md
 */

import { type BootEngineOpts, bootEngine } from '../index.js';
import { devBridgeUrl, isWizardNoAuth } from '../wizard/is-dev-no-auth.js';
import { listProfiles, type Session } from '../wizard/tier3-storage.js';

/** Static path to the wizard entry, relative to `dist/index.html` (vite emits `dist/wizard/wizard.html`). */
const WIZARD_PATH = './wizard/wizard.html';

/** Default launch locale — IT is the MVP locale; EN is the canonical fallback. */
const DEFAULT_LAUNCH_LOCALE = 'it';

/**
 * Injectable dependency surface for {@link launchApp}.
 *
 * Every field defaults to the real production implementation so `../index.ts`
 * can call `launchApp()` with no arguments. Tests pass a partial override to
 * exercise individual decision branches without touching the real bridge,
 * Even Hub kv store, or `window.location`.
 */
export interface LaunchDeps {
  /** Boot the engine. Defaults to the real {@link bootEngine} from `../index.js`. */
  bootEngine: (opts: BootEngineOpts) => Promise<unknown>;
  /** List stored Tier 3 sessions. Defaults to `listProfiles` from tier3-storage. */
  listProfiles: () => Promise<Session[]>;
  /** Dev no-auth gate. Defaults to `isWizardNoAuth`. */
  isNoAuth: () => boolean;
  /** Dev pre-filled bridge URL. Defaults to `devBridgeUrl`. */
  devBridgeUrl: () => string;
  /** Navigate the browser. Defaults to assigning `window.location.href`. */
  navigate: (url: string) => void;
  /** Launch locale. Defaults to `'it'` (Session has no locale field — do NOT read it from the session). */
  locale?: string;
}

/**
 * Decide what to do on app load and act on it.
 *
 * Resolves the active session, applies the no-auth dev fallback, and otherwise
 * routes to the wizard. See the module header for the full branch contract.
 *
 * Always resolves — boot errors are caught, logged, and swallowed (fail-soft).
 *
 * @param overrides Optional partial dependency overrides (testing seam). In
 *   production all defaults are used and `launchApp()` is called with no args.
 * @returns A promise that resolves once the launch decision has been acted on.
 */
export async function launchApp(overrides?: Partial<LaunchDeps>): Promise<void> {
  const deps: LaunchDeps = {
    bootEngine,
    listProfiles,
    isNoAuth: isWizardNoAuth,
    devBridgeUrl,
    navigate: (url: string) => {
      window.location.href = url;
    },
    ...overrides,
  };

  const locale = deps.locale ?? DEFAULT_LAUNCH_LOCALE;

  // Branch A — no-auth dev: boot immediately with an empty token. The no-auth
  // bridge accepts it; this is the only path that can boot without a token, and
  // it unblocks the EvenHub simulator. Boot regardless of any stored session.
  if (deps.isNoAuth()) {
    try {
      await deps.bootEngine({
        bridgeUrl: deps.devBridgeUrl(),
        token: '',
        // The wider LaunchDeps.locale is a string; BootEngineOpts.locale is the
        // narrower HudLocale union. The default 'it' is valid; a caller-supplied
        // override is the caller's responsibility (tests use 'it'/'en').
        locale: locale as BootEngineOpts['locale'],
      });
    } catch (err) {
      // Fail-soft: a boot error must never bubble out of the top-level module
      // (no silent white-screen). Log and return normally.
      console.error('[EVF] launch: bootEngine failed', err);
    }
    return;
  }

  // Branch B / C — non-dev. A stored session has a bridgeUrl but NO token
  // (tier3-storage SessionSchema enforces tokenObfuscated: z.null(), T-02-01),
  // so the capability handshake cannot complete from a stored session alone.
  // Both the paired (≥1 session) and unpaired (0 sessions) cases therefore route
  // to the wizard: it re-acquires the token via auto-connect / STEP2 (paired) or
  // runs first-time pairing (unpaired). bootEngine is NOT called.
  deps.navigate(WIZARD_PATH);
}
