/**
 * Tests for the upstream `client_select_actor` WS message schema — strict shape
 * + non-empty actorId + round-trip.
 */
import { describe, expect, it } from 'vitest';
import { CLIENT_SELECT_ACTOR_TYPE, ClientSelectActorMessageSchema } from './client-select-actor.js';

describe('ClientSelectActorMessageSchema', () => {
  it('CSA-1: accepts a well-formed message', () => {
    const parsed = ClientSelectActorMessageSchema.parse({
      type: CLIENT_SELECT_ACTOR_TYPE,
      actorId: 'actor-shin',
    });
    expect(parsed).toEqual({ type: 'client_select_actor', actorId: 'actor-shin' });
  });

  it('CSA-2: rejects an empty actorId', () => {
    expect(
      ClientSelectActorMessageSchema.safeParse({ type: CLIENT_SELECT_ACTOR_TYPE, actorId: '' })
        .success,
    ).toBe(false);
  });

  it('CSA-3: rejects a wrong type discriminant', () => {
    expect(
      ClientSelectActorMessageSchema.safeParse({ type: 'client_setting', actorId: 'a' }).success,
    ).toBe(false);
  });

  it('CSA-4: rejects unknown extra keys (strictObject)', () => {
    expect(
      ClientSelectActorMessageSchema.safeParse({
        type: CLIENT_SELECT_ACTOR_TYPE,
        actorId: 'a',
        extra: 1,
      }).success,
    ).toBe(false);
  });
});
