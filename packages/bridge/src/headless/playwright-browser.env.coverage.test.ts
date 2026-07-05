/**
 * Env-gated + creds-gated branch coverage for PlaywrightHeadlessBrowser.launch.
 *
 * Complements playwright-browser.launch.test.ts by driving the runtime-toggled
 * arms the base suite leaves cold: the PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH launch
 * override, the EVF_PLAYER_VIEW_DEBUG console/pageerror wiring, and the
 * tryForgeLogin early-return when creds are supplied but no email field appears.
 * All run against the same mocked Playwright surface — no real Chromium.
 *
 * @see ./playwright-browser.ts
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fsState = { exists: false };
vi.mock('node:fs', () => ({ existsSync: vi.fn(() => fsState.exists) }));

const launchMock = vi.fn();
vi.mock('playwright', () => ({
  chromium: { launch: (...args: unknown[]) => launchMock(...args) },
}));

import type { HeadlessSessionConfig } from './headless-browser.js';
import { PlaywrightHeadlessBrowser } from './playwright-browser.js';

function makeFakePage(opts: { presentSelectors?: string[]; joinedUsers?: Array<string | null> }) {
  const joinedQueue = [...(opts.joinedUsers ?? [])];
  return {
    goto: vi.fn().mockResolvedValue(undefined),
    waitForSelector: vi.fn(async (sel: string) => {
      if ((opts.presentSelectors ?? []).some((s) => sel.includes(s))) return {};
      throw new Error('selector timeout');
    }),
    fill: vi.fn().mockResolvedValue(undefined),
    click: vi.fn().mockResolvedValue(undefined),
    waitForLoadState: vi.fn().mockResolvedValue(undefined),
    waitForFunction: vi.fn().mockResolvedValue(undefined),
    selectOption: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn(async (script: string) =>
      typeof script === 'string' && script.includes('user?.name')
        ? (joinedQueue.shift() ?? null)
        : undefined,
    ),
    locator: vi.fn(() => ({ evaluateAll: vi.fn().mockResolvedValue(['u-1']) })),
    on: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

function wireBrowser(page: ReturnType<typeof makeFakePage>) {
  const context = {
    addInitScript: vi.fn().mockResolvedValue(undefined),
    newPage: vi.fn().mockResolvedValue(page),
    storageState: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const browser = { newContext: vi.fn().mockResolvedValue(context), close: vi.fn() };
  launchMock.mockResolvedValue(browser);
  return { browser, context };
}

const BASE: HeadlessSessionConfig = { foundryUrl: 'https://f.example/game', mode: 'streaming' };

beforeEach(() => {
  launchMock.mockReset();
  fsState.exists = false;
  for (const k of [
    'EVF_PLAYER_VIEW_HEADFUL',
    'EVF_PLAYER_VIEW_DEBUG',
    'PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH',
  ]) {
    delete process.env[k];
  }
});
afterEach(() => vi.clearAllMocks());

describe('PlaywrightHeadlessBrowser.launch — env + creds gated arms', () => {
  it('passes executablePath to chromium.launch when PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH is set', async () => {
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = '/opt/chrome/chrome';
    const page = makeFakePage({ presentSelectors: ['userid'] });
    wireBrowser(page);

    await new PlaywrightHeadlessBrowser().launch(BASE);

    const opts = launchMock.mock.calls[0]?.[0] as { executablePath?: string };
    expect(opts.executablePath).toBe('/opt/chrome/chrome');
  });

  it('wires the console + pageerror log taps when EVF_PLAYER_VIEW_DEBUG=1', async () => {
    process.env.EVF_PLAYER_VIEW_DEBUG = '1';
    const page = makeFakePage({ presentSelectors: ['userid'] });
    wireBrowser(page);

    const session = await new PlaywrightHeadlessBrowser().launch(BASE);

    // The debug gate registers page.on('console') and page.on('pageerror').
    const onEvents = page.on.mock.calls.map((c) => c[0]);
    expect(onEvents).toContain('console');
    expect(onEvents).toContain('pageerror');
    expect(session).toBeDefined();
  });

  it('actor mode with Forge creds but no email field → login probe returns null, launch still succeeds', async () => {
    // presentSelectors omits 'email' → waitForOptional(email) resolves null → early return.
    const page = makeFakePage({ presentSelectors: ['userid'], joinedUsers: ['Alice'] });
    wireBrowser(page);

    const session = await new PlaywrightHeadlessBrowser().launch({
      ...BASE,
      mode: 'actor',
      userName: 'Alice',
      forgeUser: 'svc@example.com',
      forgePassword: 'secret',
    });

    // No email field was fillable → no Forge email fill attempted, but the session opens.
    expect(page.fill).not.toHaveBeenCalledWith(expect.stringContaining('email'), 'svc@example.com');
    expect(session).toBeDefined();
  });
});
