import { afterEach, describe, expect, it, vi } from 'vitest';
import { devBridgeUrl, isWizardNoAuth, resolveBridgeUrl } from './is-dev-no-auth.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('isWizardNoAuth', () => {
  it('is false unless VITE_EVF_NO_AUTH === "true" (explicit opt-in)', () => {
    expect(isWizardNoAuth()).toBe(false);
    vi.stubEnv('VITE_EVF_NO_AUTH', 'true');
    expect(isWizardNoAuth()).toBe(true);
    vi.stubEnv('VITE_EVF_NO_AUTH', '1');
    expect(isWizardNoAuth()).toBe(false);
  });
});

describe('devBridgeUrl', () => {
  it('returns "" with no explicit override — NO implicit localhost default (D1 bug fix)', () => {
    expect(devBridgeUrl()).toBe('');
    // Even in no-auth mode there is no implicit localhost fallback any more.
    vi.stubEnv('VITE_EVF_NO_AUTH', 'true');
    expect(devBridgeUrl()).toBe('');
  });

  it('returns the explicit dev override when set', () => {
    vi.stubEnv('VITE_EVF_DEV_BRIDGE_URL', 'https://dev-bridge.example');
    expect(devBridgeUrl()).toBe('https://dev-bridge.example');
  });
});

describe('resolveBridgeUrl (single source of truth)', () => {
  it('prefers the saved profile bridgeUrl over the dev override', () => {
    vi.stubEnv('VITE_EVF_DEV_BRIDGE_URL', 'https://dev-bridge.example');
    expect(resolveBridgeUrl('https://saved.example')).toBe('https://saved.example');
  });

  it('falls back to the explicitly-gated dev override when no profile is saved', () => {
    vi.stubEnv('VITE_EVF_DEV_BRIDGE_URL', 'https://dev-bridge.example');
    expect(resolveBridgeUrl(undefined)).toBe('https://dev-bridge.example');
    expect(resolveBridgeUrl('')).toBe('https://dev-bridge.example');
    expect(resolveBridgeUrl('   ')).toBe('https://dev-bridge.example');
  });

  it('returns "" (unconfigured) — never localhost — in a user build with no profile', () => {
    expect(resolveBridgeUrl(undefined)).toBe('');
    expect(resolveBridgeUrl(null)).toBe('');
  });

  it('trims a saved bridgeUrl', () => {
    expect(resolveBridgeUrl('  https://saved.example  ')).toBe('https://saved.example');
  });
});
