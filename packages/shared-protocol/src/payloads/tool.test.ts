/**
 * TOOL_ID_SCHEMA: closed set of tool ids carried by action results.
 */
import { describe, expect, it } from 'vitest';
import { TOOL_ID_SCHEMA } from './tool.js';

describe('TOOL_ID_SCHEMA', () => {
  it('accepts every result-producing tool, including skill-check and end-turn', () => {
    for (const id of [
      'cast-spell',
      'weapon-attack',
      'use-item',
      'move-token',
      'drop-concentration',
      'place-template',
      'confirm-template-placement',
      'skill-check',
      'end-turn',
    ]) {
      expect(TOOL_ID_SCHEMA.safeParse(id).success, id).toBe(true);
    }
  });

  it('rejects unknown ids', () => {
    expect(TOOL_ID_SCHEMA.safeParse('evf.castSpell').success).toBe(false);
    expect(TOOL_ID_SCHEMA.safeParse('').success).toBe(false);
  });
});
