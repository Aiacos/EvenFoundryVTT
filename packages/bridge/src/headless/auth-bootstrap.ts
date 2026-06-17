/**
 * auth-bootstrap — one-time HEADFUL login helper for the headless player-view.
 *
 * The reliable way to keep the headless orchestrator (ADR-0015 §C, P2b) logged
 * into Foundry is to reuse a saved Playwright `storageState` JSON rather than
 * scripting the brittle Forge/Google/Foundry login flow on every launch. This
 * script opens a VISIBLE Chromium at `EVF_PLAYER_VIEW_FOUNDRY_URL`, lets a HUMAN
 * log in by hand (including Google SSO, which cannot be automated reliably), then
 * saves the authenticated session to `EVF_PLAYER_VIEW_STORAGE_STATE` for the
 * orchestrator to reuse.
 *
 * Run it once (and again whenever the session expires):
 *
 * ```bash
 *   EVF_PLAYER_VIEW_FOUNDRY_URL='https://<your-forge-world>/game' \
 *   EVF_PLAYER_VIEW_STORAGE_STATE='./player-view-session.json' \
 *   corepack pnpm --filter @evf/bridge bootstrap:auth
 * ```
 *
 * Then log in inside the browser window and press Enter in this terminal.
 *
 * SECURITY: this script NEVER reads or prints a password. The human types
 * credentials directly into the browser; only the resulting session cookies/state
 * are persisted to the storage-state file (treat that file as a secret).
 *
 * @see packages/bridge/src/headless/playwright-browser.ts (consumes storageState)
 * @see docs/architecture/0015-player-view-map-capture.md §C
 */

import { chromium } from 'playwright';

/** Block until the user presses Enter on stdin. */
function waitForEnter(prompt: string): Promise<void> {
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    const onData = (): void => {
      process.stdin.off('data', onData);
      process.stdin.pause();
      resolve();
    };
    process.stdin.resume();
    process.stdin.once('data', onData);
  });
}

/**
 * Launch a headful browser, wait for manual login, and persist the session.
 *
 * @returns Resolves once the storage state has been written and the browser closed.
 */
async function main(): Promise<void> {
  const foundryUrl = process.env['EVF_PLAYER_VIEW_FOUNDRY_URL'];
  const storageStatePath = process.env['EVF_PLAYER_VIEW_STORAGE_STATE'];

  if (!foundryUrl) {
    process.stderr.write('ERROR: EVF_PLAYER_VIEW_FOUNDRY_URL is not set.\n');
    process.exitCode = 1;
    return;
  }
  if (!storageStatePath) {
    process.stderr.write('ERROR: EVF_PLAYER_VIEW_STORAGE_STATE is not set.\n');
    process.exitCode = 1;
    return;
  }

  process.stdout.write(
    [
      '',
      'EVF player-view auth bootstrap',
      '──────────────────────────────',
      `Opening: ${foundryUrl}`,
      `Will save session to: ${storageStatePath}`,
      '',
      'A browser window will open. Log in to Forge/Foundry MANUALLY',
      '(email/password OR Google SSO), enter the world, and wait until',
      'the map is visible. Then return here and press Enter.',
      '',
    ].join('\n'),
  );

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(foundryUrl, { waitUntil: 'domcontentloaded' });

  await waitForEnter('Press Enter once you are logged in and the world is loaded… ');

  await context.storageState({ path: storageStatePath });
  process.stdout.write(`\nSaved session to ${storageStatePath}\n`);

  await browser.close();
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : 'unknown error';
  process.stderr.write(`auth bootstrap failed: ${msg}\n`);
  process.exitCode = 1;
});
