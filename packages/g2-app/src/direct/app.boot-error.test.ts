/**
 * Regression (P0-B, H1): a pairing link whose code cannot be applied — here the crypto
 * fallback chunk fails to load on a plain-http page — used to reject `startApp` (an
 * uncaught rejection: the phone stayed on P03 with no explanation). Boot must resolve,
 * record the reason and show it on the phone page.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { phoneStrings } from '../phone/i18n.js';
import { MemoryStorage, settle } from './__fixtures__/direct-fixtures.js';
import { type AppHandle, showBootFailure, startApp } from './app.js';

vi.mock('../../../shared-protocol/src/direct/crypto-fallback.js', () => {
  throw new Error('chunk offline');
});

const real = globalThis.crypto;
let app: AppHandle | null = null;

beforeEach(() => {
  // No real timers: the reconnect backoff and the hello grace never fire here.
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
});

afterEach(() => {
  app?.stop();
  app = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('startApp with a pairing link that cannot be applied', () => {
  it('resolves, records the reason and shows «Collegamento non riuscito»', async () => {
    vi.stubGlobal('crypto', { getRandomValues: real.getRandomValues.bind(real) });
    const root = document.createElement('main');
    const started = await startApp({
      root,
      location: { pathname: '/app/', search: '', hash: '#c=7QK3-MX9P-2HRA-C4TE' },
      history: { replaceState: vi.fn() },
      storage: new MemoryStorage(),
      deviceLanguage: () => 'it-IT',
      appVersion: '0.4.1',
      relayUrl: 'wss://relay.example',
      getBridge: async () => null,
      startHud: vi.fn(() => vi.fn()),
      openRelay: vi.fn(async () => {
        throw new Error('offline');
      }),
    });
    app = started;
    await settle();
    expect(started.store.get().connection.status).toBe('unpaired');
    expect(started.session.info().pairingError).toMatch(/crypto fallback failed to load/);
    expect(started.session.info().diagnostics.at(-1)?.message).toMatch(/^pairing link failed: /);
    const error = root.querySelector('[data-field="error"]')?.textContent ?? '';
    expect(error.startsWith(phoneStrings('it').pairFailed(''))).toBe(true);
    expect(error).toContain('crypto fallback failed to load');
    expect(root.querySelector('[data-field="boot"]')?.textContent).toBe(
      'app 0.4.1 · secure no · crypto fallback · link code · relay relay.example',
    );
  });
});

describe('showBootFailure (startApp itself rejected)', () => {
  it('logs the reason and replaces the page with it, in the device language', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const root = document.createElement('main');
    root.append(document.createElement('section'));
    showBootFailure(root, new Error('bridge exploded'), 'it-IT');
    expect(root.children).toHaveLength(1);
    expect(root.textContent).toBe(phoneStrings('it').bootFailed('bridge exploded'));
    expect(root.querySelector('[role="alert"]')).not.toBeNull();
    expect(error).toHaveBeenCalledWith('[EVF] boot failed: Error: bridge exploded');
    showBootFailure(root, 'nope', 'en-US');
    expect(root.textContent).toBe(phoneStrings('en').bootFailed('nope'));
    error.mockRestore();
  });
});
