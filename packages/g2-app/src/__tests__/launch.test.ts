/**
 * launchApp decision-logic tests (LAUNCH-* markers — Quick Task 260604-ovn).
 *
 * Verifies every branch of {@link launchApp}:
 *   - LAUNCH-A: no-auth dev → boots with empty token + devBridgeUrl; no navigate.
 *   - LAUNCH-B: paired non-dev (≥1 stored session) → navigates to wizard; no boot.
 *   - LAUNCH-C: unpaired non-dev (0 sessions) → navigates to wizard; no boot.
 *   - LAUNCH-FAILSOFT: bootEngine rejects → launchApp resolves (no throw) + console.error.
 *   - LAUNCH-W4: index.ts on disk contains no DI literals (W-4 grep gate).
 *
 * Strategy: launchApp's dependency surface is fully injectable, so no module
 * mocking is needed — each test passes a `Partial<LaunchDeps>` with vi.fn()
 * stubs and asserts on call counts / arguments. The W-4 test reads index.ts via
 * node:fs and asserts the absence of the three forbidden substrings.
 *
 * @see packages/g2-app/src/internal/launch.ts
 * @see .planning/quick/260604-ovn-wire-the-production-launch-glue-so-index/260604-ovn-PLAN.md
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type LaunchDeps, launchApp } from '../internal/launch.js';
import type { Session } from '../wizard/tier3-storage.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Build a fully-stubbed LaunchDeps with sensible no-op defaults; override per test. */
function makeDeps(overrides: Partial<LaunchDeps> = {}): Partial<LaunchDeps> {
  return {
    bootEngine: vi.fn().mockResolvedValue(undefined),
    listProfiles: vi.fn().mockResolvedValue([]),
    isNoAuth: vi.fn().mockReturnValue(false),
    devBridgeUrl: vi.fn().mockReturnValue('http://localhost:8910'),
    navigate: vi.fn(),
    ...overrides,
  };
}

/** A valid stored session (bridgeUrl present, tokenObfuscated null per T-02-01). */
function makeSession(): Session {
  return {
    profileId: '11111111-1111-4111-8111-111111111111',
    bridgeUrl: 'http://localhost:8910',
    tokenObfuscated: null,
    characterId: 'actor-abc',
    savedAt: 1_700_000_000_000,
  };
}

describe('launchApp', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('LAUNCH-A: no-auth dev → boots with devBridgeUrl + empty token; does not navigate', async () => {
    const deps = makeDeps({
      isNoAuth: vi.fn().mockReturnValue(true),
      devBridgeUrl: vi.fn().mockReturnValue('http://localhost:9999'),
    });

    await launchApp(deps);

    expect(deps.bootEngine).toHaveBeenCalledTimes(1);
    expect(deps.bootEngine).toHaveBeenCalledWith({
      bridgeUrl: 'http://localhost:9999',
      token: '',
      locale: 'it',
    });
    expect(deps.navigate).not.toHaveBeenCalled();
  });

  it('LAUNCH-A: honours an injected locale override', async () => {
    const deps = makeDeps({
      isNoAuth: vi.fn().mockReturnValue(true),
      locale: 'en',
    });

    await launchApp(deps);

    expect(deps.bootEngine).toHaveBeenCalledWith(
      expect.objectContaining({ token: '', locale: 'en' }),
    );
  });

  it('LAUNCH-B: paired non-dev (≥1 stored session) → navigates to wizard; never boots', async () => {
    const deps = makeDeps({
      isNoAuth: vi.fn().mockReturnValue(false),
      listProfiles: vi.fn().mockResolvedValue([makeSession()]),
    });

    await launchApp(deps);

    expect(deps.navigate).toHaveBeenCalledTimes(1);
    const navUrl = (deps.navigate as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
    expect(navUrl.endsWith('wizard/wizard.html')).toBe(true);
    expect(deps.bootEngine).not.toHaveBeenCalled();
  });

  it('LAUNCH-C: unpaired non-dev (0 sessions) → navigates to wizard; never boots', async () => {
    const deps = makeDeps({
      isNoAuth: vi.fn().mockReturnValue(false),
      listProfiles: vi.fn().mockResolvedValue([]),
    });

    await launchApp(deps);

    expect(deps.navigate).toHaveBeenCalledTimes(1);
    const navUrl = (deps.navigate as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
    expect(navUrl.endsWith('wizard/wizard.html')).toBe(true);
    expect(deps.bootEngine).not.toHaveBeenCalled();
  });

  it('LAUNCH-FAILSOFT: bootEngine rejection → launchApp resolves (no throw) + logs console.error', async () => {
    const bootErr = new Error('handshake failed');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const deps = makeDeps({
      isNoAuth: vi.fn().mockReturnValue(true),
      bootEngine: vi.fn().mockRejectedValue(bootErr),
    });

    await expect(launchApp(deps)).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith('[EVF] launch: bootEngine failed', bootErr);
    expect(deps.navigate).not.toHaveBeenCalled();
  });

  it('LAUNCH-W4: index.ts contains no wsFactory / bridgeFactory / TestingDependencies substrings', () => {
    const indexPath = resolve(__dirname, '..', 'index.ts');
    const source = readFileSync(indexPath, 'utf8');
    expect(source).not.toContain('wsFactory');
    expect(source).not.toContain('bridgeFactory');
    expect(source).not.toContain('TestingDependencies');
  });
});
