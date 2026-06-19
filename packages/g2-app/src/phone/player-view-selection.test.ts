import { describe, expect, it } from 'vitest';
import { PARTY_SELECTION, toPlayerViewRequest } from './player-view-selection.js';

describe('toPlayerViewRequest', () => {
  it('maps the synthetic "party" entry to streaming (no actorId)', () => {
    expect(toPlayerViewRequest(PARTY_SELECTION)).toEqual({ mode: 'streaming' });
    expect(toPlayerViewRequest('party')).toEqual({ mode: 'streaming' });
  });

  it('maps a real actorId to actor mode carrying that id', () => {
    expect(toPlayerViewRequest('Actor.abc123')).toEqual({
      mode: 'actor',
      actorId: 'Actor.abc123',
    });
  });

  it('trims surrounding whitespace before classifying', () => {
    expect(toPlayerViewRequest('  party  ')).toEqual({ mode: 'streaming' });
    expect(toPlayerViewRequest('  Actor.x  ')).toEqual({ mode: 'actor', actorId: 'Actor.x' });
  });

  it('returns null for empty / whitespace / nullish selections (no request emitted)', () => {
    expect(toPlayerViewRequest('')).toBeNull();
    expect(toPlayerViewRequest('   ')).toBeNull();
    expect(toPlayerViewRequest(null)).toBeNull();
    expect(toPlayerViewRequest(undefined)).toBeNull();
  });
});
