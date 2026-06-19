/**
 * Unit tests for the pure helpers in playwright-browser.ts.
 *
 * The Playwright launch flow itself needs a real browser + live Foundry world
 * (best-effort, selector-tuned at the live bootstrap), so it is NOT unit-tested
 * here. What IS testable in isolation is {@link requestedUserFor} — the mode→user
 * mapping that drives BOTH the `/join` user selection (BUG-1) and the post-ready
 * auto-entry assertion (BUG-3). A regression here would silently stream the wrong
 * user's view, so it is worth pinning.
 *
 * @see ./playwright-browser.ts
 */
import { describe, expect, it } from 'vitest';
import type { HeadlessSessionConfig } from './headless-browser.js';
import { requestedUserFor } from './playwright-browser.js';

const base = { foundryUrl: 'https://f.example/game' } as const;

describe('requestedUserFor', () => {
  it('actor mode → cfg.userName', () => {
    const cfg: HeadlessSessionConfig = { ...base, mode: 'actor', userName: 'Player Seven' };
    expect(requestedUserFor(cfg)).toBe('Player Seven');
  });

  it('actor mode without a userName → undefined', () => {
    const cfg: HeadlessSessionConfig = { ...base, mode: 'actor' };
    expect(requestedUserFor(cfg)).toBeUndefined();
  });

  it('streaming mode → cfg.streamUser', () => {
    const cfg: HeadlessSessionConfig = {
      ...base,
      mode: 'streaming',
      streamUser: 'Stream Observer',
    };
    expect(requestedUserFor(cfg)).toBe('Stream Observer');
  });

  it('streaming mode without a streamUser → undefined (any user acceptable)', () => {
    const cfg: HeadlessSessionConfig = { ...base, mode: 'streaming' };
    expect(requestedUserFor(cfg)).toBeUndefined();
  });

  it('streaming never returns the actor userName (modes do not cross)', () => {
    const cfg: HeadlessSessionConfig = {
      ...base,
      mode: 'streaming',
      userName: 'Player Seven',
    };
    expect(requestedUserFor(cfg)).toBeUndefined();
  });
});
