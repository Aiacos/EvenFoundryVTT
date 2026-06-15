/**
 * launchApp character selection tests (FLV-CHAR-SELECT Task 3).
 *
 * LAUNCH-ACT-01: no-auth dev with ?actor=6KWxQXAiJgz4zKlS → bootEngine receives characterId
 * LAUNCH-ACT-02: no-auth dev with NO ?actor= → bootEngine receives characterId === undefined
 *
 * @see packages/g2-app/src/internal/launch.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type LaunchDeps, launchApp } from '../internal/launch.js';

function makeDeps(overrides: Partial<LaunchDeps> = {}): Partial<LaunchDeps> {
  return {
    bootEngine: vi.fn().mockResolvedValue(undefined),
    listProfiles: vi.fn().mockResolvedValue([]),
    isNoAuth: vi.fn().mockReturnValue(true),
    devBridgeUrl: vi.fn().mockReturnValue('http://localhost:8910'),
    navigate: vi.fn(),
    ...overrides,
  };
}

describe('launchApp — character selection via ?actor= URL param (FLV-CHAR-SELECT)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('LAUNCH-ACT-01: ?actor=6KWxQXAiJgz4zKlS → bootEngine receives characterId', async () => {
    const deps = makeDeps({
      isNoAuth: vi.fn().mockReturnValue(true),
      readUrlSearch: () => '?actor=6KWxQXAiJgz4zKlS',
    });

    await launchApp(deps);

    expect(deps.bootEngine).toHaveBeenCalledTimes(1);
    expect(deps.bootEngine).toHaveBeenCalledWith(
      expect.objectContaining({ characterId: '6KWxQXAiJgz4zKlS' }),
    );
  });

  it('LAUNCH-ACT-02: NO ?actor= param → bootEngine receives characterId === undefined', async () => {
    const deps = makeDeps({
      isNoAuth: vi.fn().mockReturnValue(true),
      readUrlSearch: () => '',
    });

    await launchApp(deps);

    expect(deps.bootEngine).toHaveBeenCalledTimes(1);
    const callArg = (deps.bootEngine as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    // characterId must be absent (exactOptionalPropertyTypes-clean) or undefined
    expect(callArg.characterId).toBeUndefined();
  });
});
