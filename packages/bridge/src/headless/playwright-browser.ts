/**
 * playwright-browser — the production {@link HeadlessBrowser} backed by Playwright.
 *
 * Launches a headless Chromium, opens the Foundry game URL (with `?evfLeader=1`),
 * best-effort authenticates, picks the Foundry world user, and waits for the scene
 * canvas to become ready. The page is then left OPEN so the EvenFoundryVTT Foundry
 * module running inside it POSTs map frames to the bridge.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * ⚠️  BEST-EFFORT SCAFFOLDING — SELECTORS NEED LIVE TUNING (P2b validation).
 *
 * The exact DOM selectors and flow for the THREE login surfaces below are
 * ENVIRONMENT-SPECIFIC and CANNOT be verified without a live Forge/Foundry world.
 * They are written defensively (waitForSelector with timeouts, try/catch around
 * every optional step) and MUST be re-tuned during the P2b live bootstrap:
 *
 *   1. Forge login page  — native email/password form (selectors below are guesses).
 *   2. Google SSO        — automation is KNOWN to fail (bot detection); we try the
 *                          native form first and never attempt to script Google.
 *   3. Foundry /join     — the world user-select <select> + password + Join button.
 *
 * The RELIABLE path is `storageStatePath`: a one-time headful login (see
 * `auth-bootstrap.ts`) saves a session JSON; reusing it skips ALL of the above.
 * Treat the inline auto-login as a convenience that may need rewriting on first
 * contact with the real deployment.
 * ──────────────────────────────────────────────────────────────────────────────
 *
 * SECURITY: `forgePassword` is only ever typed into a password field via
 * `page.fill`; it is NEVER logged and NEVER embedded in a thrown Error message.
 * The browser launch flags (`--use-gl=angle`, `--use-angle=swiftshader`,
 * `--no-sandbox`, `--disable-dev-shm-usage`) default to a containerised
 * software-GL Chromium; the parent Docker layer may override the executable path
 * and flags via Playwright env (`PLAYWRIGHT_*`).
 *
 * @see packages/bridge/src/headless/headless-browser.ts (port)
 * @see packages/bridge/src/headless/auth-bootstrap.ts (storageState generator)
 * @see docs/architecture/0015-player-view-map-capture.md §C
 */

import { existsSync } from 'node:fs';
import {
  type Browser,
  type BrowserContext,
  type BrowserContextOptions,
  chromium,
  type Page,
} from 'playwright';
import type {
  HeadlessBrowser,
  HeadlessSession,
  HeadlessSessionConfig,
} from './headless-browser.js';

/**
 * Chromium launch flags for the HEADFUL-under-Xvfb path (the production
 * container). Foundry's PIXI WebGL needs a real GL context: headless swiftshader
 * does NOT work (PIXI crashes with `getExtension` on an undefined context), and
 * software GL (llvmpipe) is too slow to stream a live world (~0.1 fps). The
 * production path is HARDWARE GL via ANGLE-on-Vulkan (Mesa radv over the
 * passed-through AMD GPU) — see {@link ANGLE_BACKEND} and the launch-args comment
 * below for the full rationale. Verified 2026-06-17.
 */
// WebGL launch combo verified in-container 2026-06-17:
//
//   ANGLE-on-Vulkan (`--use-angle=vulkan` + radv) → HARDWARE GL. With the AMD GPU
//   passed through (compose `/dev/dri`) and Mesa's radv Vulkan driver installed
//   (`mesa-vulkan-ati`, see bridge.Dockerfile), ANGLE reports the real device —
//   "ANGLE (AMD, Vulkan … (AMD Radeon 780M Graphics (RADV PHOENIX)), radv)" — and
//   Foundry's PIXI renders at GPU speed. This is REQUIRED, not an optimisation:
//   under software GL (llvmpipe) the headless main thread is so saturated by the
//   WebGL render + PNG encode that the capture loop manages ~0.1 fps AND the frame
//   POSTs `AbortSignal.timeout` before their resolve callback can run (root cause
//   of the P2c "bridgeDeltaEmitter signal timed out" / zero-frames-reach-bridge
//   symptom, diagnosed 2026-06-17). `--use-angle=gl` works but is llvmpipe-only.
//
// `EVF_PLAYER_VIEW_GL` selects the ANGLE backend: `vulkan` (default, hardware via
// radv) or `gl` (llvmpipe software — the slow-but-correct fallback for hosts with
// no Vulkan driver / no GPU passthrough). `--ignore-gpu-blocklist` +
// `--enable-features=Vulkan` let ANGLE consider the GPU at all.
const ANGLE_BACKEND = process.env['EVF_PLAYER_VIEW_GL'] === 'gl' ? 'gl' : 'vulkan';
const HEADFUL_LAUNCH_ARGS = [
  '--headless=new',
  '--use-gl=angle',
  `--use-angle=${ANGLE_BACKEND}`,
  ...(ANGLE_BACKEND === 'vulkan' ? ['--enable-features=Vulkan'] : []),
  '--ignore-gpu-blocklist',
  '--no-sandbox',
  '--disable-dev-shm-usage',
] as const;

/** Fallback flags for the (non-working-for-WebGL) headless path / dev hosts. */
const HEADLESS_LAUNCH_ARGS = [
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--no-sandbox',
  '--disable-dev-shm-usage',
] as const;

/**
 * Max time to wait for `window.game.ready` + `window.canvas.ready` (ms).
 * A fresh, uncached world load over the WAN measured ~43 s; 3 min leaves margin
 * for a large world + the "world seems to take a long time" download phase.
 */
const WORLD_READY_TIMEOUT_MS = 300_000;
/** Short per-selector probe timeout — login surfaces are optional, fail fast (ms). */
const SELECTOR_PROBE_MS = 5_000;

/**
 * Production {@link HeadlessBrowser} using Playwright `chromium`.
 *
 * One browser process per launched session (simple + isolated for the homelab
 * single-tenant scope). `session.close()` tears down page → context → browser.
 */
export class PlaywrightHeadlessBrowser implements HeadlessBrowser {
  /**
   * Launch, authenticate, and wait for the scene canvas. Resolves with a session
   * whose page stays open; rejects with a secret-free Error on any failure.
   *
   * @param cfg - Session configuration (URL, mode, actor, credentials).
   */
  async launch(cfg: HeadlessSessionConfig): Promise<HeadlessSession> {
    // On Alpine (the bridge image) Playwright cannot run its bundled browser
    // (musl vs glibc); the Docker layer installs the system Chromium and points
    // here via PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH. Absent → Playwright's own
    // bundled Chromium (dev / non-Alpine hosts).
    const execPath = process.env['PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH'];
    // EVF_PLAYER_VIEW_HEADFUL=1 (set in the container, which runs an Xvfb virtual
    // display with Mesa GL) → launch HEADFUL so Foundry's PIXI WebGL works.
    // Software-headless WebGL (swiftshader) does not render Foundry; see args docs.
    const headful = process.env['EVF_PLAYER_VIEW_HEADFUL'] === '1';
    const browser = await chromium.launch({
      headless: !headful,
      args: headful ? [...HEADFUL_LAUNCH_ARGS] : [...HEADLESS_LAUNCH_ARGS],
      ...(execPath !== undefined && execPath !== '' ? { executablePath: execPath } : {}),
    });

    let context: BrowserContext | undefined;
    let page: Page | undefined;
    try {
      // 1. Context: reuse the saved session when present (the reliable path).
      const ctxOpts: BrowserContextOptions = {};
      if (cfg.storageStatePath !== undefined && existsSync(cfg.storageStatePath)) {
        ctxOpts.storageState = cfg.storageStatePath;
      }
      context = await browser.newContext(ctxOpts);

      // Forced-leader marker (ADR-0015 §C P2c): set a window flag that the module
      // reads to force stream-leadership. `addInitScript` re-runs on EVERY page +
      // navigation, so it SURVIVES The Forge redirect to `/game` that strips the
      // URL query (verified 2026-06-17 — the `?evfLeader=1` param alone is lost).
      await context.addInitScript(() => {
        (globalThis as { __evfForcedLeader?: boolean }).__evfForcedLeader = true;
      });

      page = await context.newPage();

      // Surface the headless page's console + errors to the container logs so the
      // EVF module's behaviour inside the headless session (forced-leader,
      // capture/POST warnings) is observable without a conflicting debug browser.
      // Gated on EVF_PLAYER_VIEW_DEBUG to keep production logs quiet.
      if (process.env['EVF_PLAYER_VIEW_DEBUG'] === '1') {
        page.on('console', (m) => {
          const t = m.text();
          if (/EVF|evf|leader|bridge|frame|capture/i.test(t)) {
            console.warn(`[headless-console] ${m.type()}: ${t.slice(0, 200)}`);
          }
        });
        page.on('pageerror', (e) =>
          console.warn(`[headless-pageerror] ${String(e).slice(0, 200)}`),
        );
      }

      // 2. Navigate to the game URL (keep the param too as a non-Forge fallback).
      const url = `${cfg.foundryUrl}${cfg.foundryUrl.includes('?') ? '&' : '?'}evfLeader=1`;
      await page.goto(url, { waitUntil: 'domcontentloaded' });

      // 3. Best-effort Forge auto-login (ENV-SPECIFIC — see module header).
      await tryForgeLogin(page, cfg);

      // 4. Best-effort Foundry /join user-select (ENV-SPECIFIC — see module header).
      await tryFoundryJoin(page, cfg);

      // 5. Wait for the world + scene canvas to be ready, then leave the page open.
      // String-form predicate (evaluated in the BROWSER): the bridge tsconfig has
      // no DOM lib, so referencing `window`/`game`/`canvas` as TS identifiers here
      // would not type-check. The string is evaluated in the page context where
      // those globals exist.
      await page.waitForFunction(
        'window.game && window.game.ready === true && window.canvas && window.canvas.ready === true',
        undefined,
        { timeout: WORLD_READY_TIMEOUT_MS },
      );

      return makeSession(browser, context, page);
    } catch (err) {
      // Cleanup on any failure path, then rethrow a secret-free Error.
      await closeQuietly(page, context, browser);
      throw new Error(`headless launch failed: ${shortMessage(err)}`);
    }
  }
}

/**
 * Best-effort Forge native login. NO-OP when already authed (no login form) or
 * when no credentials are configured.
 *
 * ⚠️ SELECTORS ARE GUESSES — tune during the P2b live bootstrap. Google SSO is
 * deliberately NOT scripted (bot detection makes it unreliable); we only attempt
 * the native email/password form and fall through silently on any failure.
 */
async function tryForgeLogin(page: Page, cfg: HeadlessSessionConfig): Promise<void> {
  if (cfg.forgeUser === undefined || cfg.forgePassword === undefined) {
    return; // No creds → rely on storageState / already-authed.
  }
  // Probe for a native email field; if absent within the short window, assume we
  // are not on (or past) the Forge login page and continue.
  const emailField = await waitForOptional(page, 'input[type="email"], input[name="email"]');
  if (emailField === null) {
    return;
  }
  try {
    await page.fill('input[type="email"], input[name="email"]', cfg.forgeUser);
    // NOTE: password is filled directly into the field — never logged.
    await page.fill('input[type="password"], input[name="password"]', cfg.forgePassword);
    // Submit the native form (button text/selector is environment-specific).
    await page.click(
      'button[type="submit"], button:has-text("Sign In"), button:has-text("Log In")',
    );
    // Give navigation a moment; ignore timeout — the /join wait below is the gate.
    await page.waitForLoadState('networkidle', { timeout: SELECTOR_PROBE_MS }).catch(() => {});
  } catch {
    // Native form interaction failed (layout drift, or this is a Google-SSO-only
    // account). Fall through — the world-ready wait is the real success gate.
  }
}

/**
 * Best-effort Foundry `/join` user selection + submit. NO-OP when the world is
 * already entered (no join form present).
 *
 * The Foundry USER is determined by the LOGIN, not the join screen: `streaming`
 * mode authenticates as the bridge's streaming account, and `actor` mode
 * authenticates with the selected player's own Forge credentials
 * (`cfg.forgeUser`/`cfg.forgePassword`, see {@link doForgeLogin}) so The Forge
 * routes into the world as that player's user. The join screen — when present —
 * then carries a single matching user, so picking the first non-empty option is
 * correct. (⚠️ join selectors are best-effort; tune during a live bootstrap.)
 */
async function tryFoundryJoin(page: Page, cfg: HeadlessSessionConfig): Promise<void> {
  // Probe for the Foundry join user-select; absent → already in the world.
  const userSelect = await waitForOptional(page, 'select[name="userid"]');
  if (userSelect === null) {
    return;
  }
  try {
    if (cfg.mode === 'actor' && cfg.userName !== undefined && cfg.userName.length > 0) {
      // `actor` mode: select the player's user by NAME (the `<option>` label) so we
      // join AS that player → their fogged view. The bridge resolved this username
      // from the actorId (only opted-in players are offered).
      await page.selectOption('select[name="userid"]', { label: cfg.userName });
    } else {
      // streaming/default: pick the first non-empty user option (the streaming user).
      // Read option `value`s via the locator API (the bridge tsconfig has no DOM lib).
      const optionValues = await page
        .locator('select[name="userid"] > option')
        .evaluateAll((els) =>
          (els as Array<{ getAttribute(name: string): string | null }>).map((el) =>
            el.getAttribute('value'),
          ),
        );
      const optionValue = optionValues.find((v) => v !== null && v !== '');
      if (optionValue !== undefined && optionValue !== null) {
        await page.selectOption('select[name="userid"]', optionValue);
      }
    }
    // Leave the password field BLANK (Foundry users have no password by default —
    // PASSWORD-FREE model) and submit the join form.
    await page.click('button[name="join"], button[type="submit"]:has-text("Join")');
    await page.waitForLoadState('networkidle', { timeout: SELECTOR_PROBE_MS }).catch(() => {});
  } catch {
    // Join interaction failed — fall through to the world-ready wait, which is the
    // authoritative success/failure gate.
  }
}

/**
 * Wait for a selector but treat absence/timeout as `null` rather than throwing.
 * Used to probe the optional login surfaces without aborting the flow.
 */
async function waitForOptional(page: Page, selector: string): Promise<unknown | null> {
  try {
    return await page.waitForSelector(selector, { timeout: SELECTOR_PROBE_MS, state: 'visible' });
  } catch {
    return null;
  }
}

/** Build a {@link HeadlessSession} whose `close()` tears down page→context→browser, once. */
function makeSession(browser: Browser, context: BrowserContext, page: Page): HeadlessSession {
  let closed = false;
  return {
    async close(): Promise<void> {
      if (closed) return; // idempotent
      closed = true;
      await closeQuietly(page, context, browser);
    },
  };
}

/** Close page → context → browser, swallowing individual teardown errors. */
async function closeQuietly(
  page: Page | undefined,
  context: BrowserContext | undefined,
  browser: Browser | undefined,
): Promise<void> {
  if (page !== undefined) await page.close().catch(() => {});
  if (context !== undefined) await context.close().catch(() => {});
  if (browser !== undefined) await browser.close().catch(() => {});
}

/** Extract a short, secret-free message from an unknown thrown value. */
function shortMessage(err: unknown): string {
  if (err instanceof Error) {
    // First line only — Playwright errors append verbose call logs that may echo
    // the navigated URL; keep the surfaced detail terse and secret-free.
    return err.message.split('\n', 1)[0] ?? 'unknown error';
  }
  return 'unknown error';
}
