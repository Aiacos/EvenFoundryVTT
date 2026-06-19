/**
 * Unit tests for SessionStore — actorId / selectedActorId support (FLV-CHAR-SELECT).
 *
 * Covers:
 *   - FLV-SS-01: createSession without 4th arg → selectedActorId === undefined (back-compat)
 *   - FLV-SS-02: createSession with "actorX" → session.selectedActorId === "actorX"
 *
 * @see packages/bridge/src/ws/session-store.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionStore } from './session-store.js';

describe('SessionStore — selectedActorId (FLV-CHAR-SELECT)', () => {
  it('FLV-SS-01: createSession without 4th arg → selectedActorId is undefined (back-compat)', () => {
    const store = new SessionStore();
    const session = store.createSession('tok', 'it', ['read_char']);
    expect(session.selectedActorId).toBeUndefined();
  });

  it('FLV-SS-02: createSession with selectedActorId="actorX" → selectedActorId === "actorX"', () => {
    const store = new SessionStore();
    const session = store.createSession('tok', 'it', ['read_char'], 'actorX');
    expect(session.selectedActorId).toBe('actorX');
  });
});

describe('SessionStore — getFocusActorId (map auto-framing)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('FLV-SS-03: returns null with no sessions / no pins', () => {
    const store = new SessionStore();
    // No sessions at all.
    expect(store.getFocusActorId()).toBeNull();
    // A session WITHOUT a pin must not surface as a focus actor.
    store.createSession('tok', 'it', ['read_char']);
    expect(store.getFocusActorId()).toBeNull();
  });

  it('FLV-SS-04: returns the selectedActorId when one session is pinned', () => {
    const store = new SessionStore();
    store.createSession('tok', 'it', ['read_char'], 'actor-only');
    expect(store.getFocusActorId()).toBe('actor-only');
  });

  it('FLV-SS-05: with two pinned sessions, returns the one with the higher createdAt', () => {
    const store = new SessionStore();
    // `createdAt` is Date.now() at creation; advance fake time between the two
    // creations so the second session is deterministically the fresher pin.
    store.createSession('tok-a', 'it', ['read_char'], 'actor-older');
    vi.advanceTimersByTime(1000);
    store.createSession('tok-b', 'it', ['read_char'], 'actor-newer');
    expect(store.getFocusActorId()).toBe('actor-newer');
  });
});
