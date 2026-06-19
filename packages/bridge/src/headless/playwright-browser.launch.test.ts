/**
 * Mocked-Playwright tests for {@link PlaywrightHeadlessBrowser.launch} + the pure
 * helpers `userMatches` / `shortMessage`.
 *
 * The real launch flow needs a browser binary + a live Foundry world, so here we
 * mock the `playwright` module (and `node:fs`) and drive a fake Page/Context/Browser
 * through every branch: storageState reuse, headful vs headless launch args, the
 * best-effort Forge login + Foundry `/join` selection (requested user vs first
 * option), the auto-entry guard (match / re-select / persistent mismatch), and the
 * failure-cleanup path. No real Chromium is launched.
 *
 * @see ./playwright-browser.ts
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Module mocks (hoisted) ──────────────────────────────────────────────────────
const fsState = { exists: false };
vi.mock('node:fs', () => ({ existsSync: vi.fn(() => fsState.exists) }));

const launchMock = vi.fn();
vi.mock('playwright', () => ({
  chromium: { launch: (...args: unknown[]) => launchMock(...args) },
}));

import type { HeadlessSessionConfig } from './headless-browser.js';
import { PlaywrightHeadlessBrowser, shortMessage, userMatches } from './playwright-browser.js';

// ── Fake Playwright surface ──────────────────────────────────────────────────────

interface FakePageOpts {
  /** Substrings of selectors that `waitForSelector` should resolve (else it throws). */
  presentSelectors?: string[];
  /** Sequence of values returned by `readJoinedUser` (page.evaluate of user.name). */
  joinedUsers?: Array<string | null>;
  /** Option `value`s returned by the `/join` option locator (no-requested-user path). */
  optionValues?: Array<string | null>;
}

function makeFakePage(opts: FakePageOpts) {
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
    evaluate: vi.fn(async (script: string) => {
      if (typeof script === 'string' && script.includes('user?.name')) {
        return joinedQueue.length > 0 ? joinedQueue.shift() : null;
      }
      return undefined; // logOut() and anything else
    }),
    locator: vi.fn(() => ({ evaluateAll: vi.fn().mockResolvedValue(opts.optionValues ?? []) })),
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
  const browser = {
    newContext: vi.fn().mockResolvedValue(context),
    close: vi.fn().mockResolvedValue(undefined),
  };
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

afterEach(() => {
  vi.clearAllMocks();
});

describe('PlaywrightHeadlessBrowser.launch', () => {
  it('streaming, no requested user → picks the first non-empty /join option and opens a session', async () => {
    const page = makeFakePage({ presentSelectors: ['userid'], optionValues: ['', 'user-1'] });
    const { browser, context } = wireBrowser(page);

    const session = await new PlaywrightHeadlessBrowser().launch(BASE);

    expect(context.addInitScript).toHaveBeenCalledOnce(); // forced-leader marker
    expect(page.goto).toHaveBeenCalledWith(
      'https://f.example/game?evfLeader=1',
      expect.objectContaining({ waitUntil: 'domcontentloaded' }),
    );
    expect(page.selectOption).toHaveBeenCalledWith('select[name="userid"]', 'user-1');
    // session.close() is idempotent and tears the browser down once.
    await session.close();
    await session.close();
    expect(browser.close).toHaveBeenCalledTimes(1);
  });

  it('reuses the saved storageState when the file exists', async () => {
    const page = makeFakePage({ presentSelectors: ['userid'], optionValues: ['u'] });
    const { browser } = wireBrowser(page);
    fsState.exists = true;

    await new PlaywrightHeadlessBrowser().launch({ ...BASE, storageStatePath: '/secrets/s.json' });

    expect(browser.newContext).toHaveBeenCalledWith(
      expect.objectContaining({ storageState: '/secrets/s.json' }),
    );
  });

  it('launches HEADFUL with the Xvfb/ANGLE args when EVF_PLAYER_VIEW_HEADFUL=1', async () => {
    process.env.EVF_PLAYER_VIEW_HEADFUL = '1';
    const page = makeFakePage({ presentSelectors: ['userid'], optionValues: ['u'] });
    wireBrowser(page);

    await new PlaywrightHeadlessBrowser().launch(BASE);

    const arg = launchMock.mock.calls[0]?.[0] as { headless: boolean; args: string[] };
    expect(arg.headless).toBe(false);
    expect(arg.args).toContain('--headless=new');
  });

  it('actor mode: native Forge login + /join by label, joined user matches → live', async () => {
    const page = makeFakePage({ presentSelectors: ['email', 'userid'], joinedUsers: ['Alice'] });
    wireBrowser(page);

    await new PlaywrightHeadlessBrowser().launch({
      ...BASE,
      mode: 'actor',
      userName: 'Alice',
      forgeUser: 'svc@example.com',
      forgePassword: 'secret',
    });

    // Forge form filled (email + password) and submitted.
    expect(page.fill).toHaveBeenCalledWith(expect.stringContaining('email'), 'svc@example.com');
    expect(page.selectOption).toHaveBeenCalledWith('select[name="userid"]', { label: 'Alice' });
  });

  it('actor mode: auto-entered as the wrong user → returns to /join, re-selects, then matches', async () => {
    const page = makeFakePage({ presentSelectors: ['userid'], joinedUsers: ['Streamer', 'Alice'] });
    wireBrowser(page);

    const session = await new PlaywrightHeadlessBrowser().launch({
      ...BASE,
      mode: 'actor',
      userName: 'Alice',
    });

    // logOut() was invoked during the return-to-/join re-select.
    expect(page.evaluate).toHaveBeenCalledWith(expect.stringContaining('logOut'));
    expect(session).toBeDefined();
  });

  it('actor mode: persistent user mismatch → rejects with a secret-free error + cleans up', async () => {
    const page = makeFakePage({
      presentSelectors: ['userid'],
      joinedUsers: ['Streamer', 'Streamer'],
    });
    const { browser } = wireBrowser(page);

    await expect(
      new PlaywrightHeadlessBrowser().launch({ ...BASE, mode: 'actor', userName: 'Alice' }),
    ).rejects.toThrow(/headless launch failed/);
    expect(browser.close).toHaveBeenCalled(); // cleanup on the failure path
  });

  it('wraps any launch failure in a secret-free Error and tears down', async () => {
    const page = makeFakePage({ presentSelectors: ['userid'] });
    const { browser, context } = wireBrowser(page);
    context.newPage.mockRejectedValueOnce(new Error('boom at https://secret/url\nverbose log'));

    await expect(new PlaywrightHeadlessBrowser().launch(BASE)).rejects.toThrow(
      'headless launch failed: boom at https://secret/url',
    );
    expect(browser.close).toHaveBeenCalled();
  });
});

describe('userMatches', () => {
  it('matches on a trimmed exact comparison; null never matches', () => {
    expect(userMatches('Alice', 'Alice')).toBe(true);
    expect(userMatches('  Alice  ', 'Alice')).toBe(true);
    expect(userMatches('Alice', 'Bob')).toBe(false);
    expect(userMatches(null, 'Alice')).toBe(false);
  });
});

describe('shortMessage', () => {
  it('returns the first line of an Error message', () => {
    expect(shortMessage(new Error('line one\nline two'))).toBe('line one');
  });

  it('returns "unknown error" for a non-Error value', () => {
    expect(shortMessage('a string')).toBe('unknown error');
    expect(shortMessage(undefined)).toBe('unknown error');
  });
});
