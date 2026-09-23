import { describe, expect, it } from 'vitest';
import { END_TURN_TOOL, EndTurnInputSchema } from './end-turn.js';

describe('EndTurnInputSchema', () => {
  it('accepts a non-empty actor_id', () => {
    expect(EndTurnInputSchema.parse({ actor_id: 'thorin' })).toEqual({ actor_id: 'thorin' });
    expect(END_TURN_TOOL).toBe('end-turn');
  });

  it('rejects missing/empty actor_id and extra fields', () => {
    expect(EndTurnInputSchema.safeParse({}).success).toBe(false);
    expect(EndTurnInputSchema.safeParse({ actor_id: '' }).success).toBe(false);
    expect(EndTurnInputSchema.safeParse({ actor_id: 'a', combat_id: 'c' }).success).toBe(false);
  });
});
