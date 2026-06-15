/**
 * Unit tests for SessionStore — actorId / selectedActorId support (FLV-CHAR-SELECT).
 *
 * Covers:
 *   - FLV-SS-01: createSession without 4th arg → selectedActorId === undefined (back-compat)
 *   - FLV-SS-02: createSession with "actorX" → session.selectedActorId === "actorX"
 *
 * @see packages/bridge/src/ws/session-store.ts
 */

import { describe, expect, it } from 'vitest';
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
