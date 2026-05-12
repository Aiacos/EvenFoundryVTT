/**
 * @evf/shared-protocol — Tool Registry schema tests.
 *
 * Covers:
 * 1-7.   Happy-path parse for each of the 7 tool input schemas.
 * 8-14.  Rejection of missing-required-field inputs.
 * 15.    TOOL_REGISTRY has exactly 7 entries; TOOL_NAMES has exactly 7 entries;
 *        names match the canonical spec list.
 * 16.    JSON Schema drift test (T-03-15): registry entry inputSchema deep-equals
 *        the schema's live .toJSONSchema() output.
 * 17.    Every registry entry's inputSchema has type:'object', properties, required
 *        array, and additionalProperties:false.
 */

import { describe, expect, it } from 'vitest';
import {
  CastSpellInputSchema,
  MoveTokenInputSchema,
  PlaceTemplateInputSchema,
  SetTargetsInputSchema,
  SkillCheckInputSchema,
  TOOL_INPUT_SCHEMAS,
  TOOL_NAMES,
  TOOL_REGISTRY,
  UseItemInputSchema,
  WeaponAttackInputSchema,
} from './index.js';

// ─── Tests 1-7: Happy-path parse ──────────────────────────────────────────────

describe('CastSpellInputSchema', () => {
  it('parses a valid cast_spell input', () => {
    const result = CastSpellInputSchema.safeParse({
      actor_id: 'actor-abc123',
      spell_id: 'spell-xyz456',
      slot_level: 3,
      targets: ['token-1', 'token-2'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing required field (no spell_id)', () => {
    const result = CastSpellInputSchema.safeParse({
      actor_id: 'actor-abc123',
      slot_level: 2,
      targets: [],
    });
    expect(result.success).toBe(false);
  });

  it('accepts slot_level 0 (cantrip marker)', () => {
    const result = CastSpellInputSchema.safeParse({
      actor_id: 'actor-1',
      spell_id: 'spell-cantrip',
      slot_level: 0,
      targets: [],
    });
    expect(result.success).toBe(true);
  });
});

describe('WeaponAttackInputSchema', () => {
  it('parses a valid weapon_attack input', () => {
    const result = WeaponAttackInputSchema.safeParse({
      actor_id: 'actor-1',
      item_id: 'item-sword',
      targets: ['token-goblin'],
      advantage: 'advantage',
    });
    expect(result.success).toBe(true);
  });

  it('applies default advantage=normal when omitted', () => {
    const result = WeaponAttackInputSchema.safeParse({
      actor_id: 'actor-1',
      item_id: 'item-bow',
      targets: [],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.advantage).toBe('normal');
    }
  });

  it('rejects missing required field (no item_id)', () => {
    const result = WeaponAttackInputSchema.safeParse({
      actor_id: 'actor-1',
      targets: [],
    });
    expect(result.success).toBe(false);
  });
});

describe('UseItemInputSchema', () => {
  it('parses a valid use_item input', () => {
    const result = UseItemInputSchema.safeParse({
      actor_id: 'actor-1',
      item_id: 'item-potion',
      targets: [],
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing required field (no actor_id)', () => {
    const result = UseItemInputSchema.safeParse({
      item_id: 'item-potion',
      targets: [],
    });
    expect(result.success).toBe(false);
  });
});

describe('SkillCheckInputSchema', () => {
  it('parses a valid skill_check input', () => {
    const result = SkillCheckInputSchema.safeParse({
      actor_id: 'actor-1',
      skill: 'perception',
      advantage: 'normal',
    });
    expect(result.success).toBe(true);
  });

  it('applies default advantage=normal when omitted', () => {
    const result = SkillCheckInputSchema.safeParse({
      actor_id: 'actor-1',
      skill: 'stealth',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.advantage).toBe('normal');
    }
  });

  it('rejects missing required field (no skill)', () => {
    const result = SkillCheckInputSchema.safeParse({
      actor_id: 'actor-1',
    });
    expect(result.success).toBe(false);
  });
});

describe('MoveTokenInputSchema', () => {
  it('parses a valid move_token input', () => {
    const result = MoveTokenInputSchema.safeParse({
      token_id: 'token-1',
      x: 5,
      y: 10,
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing required field (no y)', () => {
    const result = MoveTokenInputSchema.safeParse({
      token_id: 'token-1',
      x: 5,
    });
    expect(result.success).toBe(false);
  });
});

describe('PlaceTemplateInputSchema', () => {
  it('parses a valid place_template input', () => {
    const result = PlaceTemplateInputSchema.safeParse({
      actor_id: 'actor-1',
      item_id: 'item-fireball',
      x: 100,
      y: 200,
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing required field (no item_id)', () => {
    const result = PlaceTemplateInputSchema.safeParse({
      actor_id: 'actor-1',
      x: 100,
      y: 200,
    });
    expect(result.success).toBe(false);
  });
});

describe('SetTargetsInputSchema', () => {
  it('parses a valid set_targets input with optional user_id', () => {
    const result = SetTargetsInputSchema.safeParse({
      token_ids: ['token-1', 'token-2'],
      user_id: 'user-gm',
    });
    expect(result.success).toBe(true);
  });

  it('parses without optional user_id', () => {
    const result = SetTargetsInputSchema.safeParse({
      token_ids: [],
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing required field (no token_ids)', () => {
    const result = SetTargetsInputSchema.safeParse({
      user_id: 'user-gm',
    });
    expect(result.success).toBe(false);
  });
});

// ─── Test 15: Registry counts and canonical names ─────────────────────────────

describe('TOOL_REGISTRY + TOOL_NAMES', () => {
  it('TOOL_REGISTRY has exactly 7 entries', () => {
    expect(TOOL_REGISTRY).toHaveLength(7);
  });

  it('TOOL_NAMES has exactly 7 entries', () => {
    expect(TOOL_NAMES).toHaveLength(7);
  });

  it('TOOL_NAMES matches canonical spec list in order', () => {
    expect([...TOOL_NAMES]).toEqual([
      'cast_spell',
      'weapon_attack',
      'use_item',
      'skill_check',
      'move_token',
      'place_template',
      'set_targets',
    ]);
  });

  it('every TOOL_NAMES entry has a matching TOOL_REGISTRY entry', () => {
    const registryNames = TOOL_REGISTRY.map((e) => e.name);
    for (const name of TOOL_NAMES) {
      expect(registryNames).toContain(name);
    }
  });
});

// ─── Test 16: JSON Schema drift test (T-03-15) ────────────────────────────────

describe('JSON Schema drift test (T-03-15)', () => {
  const schemaMap: Record<string, { toJSONSchema: () => unknown }> = {
    cast_spell: CastSpellInputSchema,
    weapon_attack: WeaponAttackInputSchema,
    use_item: UseItemInputSchema,
    skill_check: SkillCheckInputSchema,
    move_token: MoveTokenInputSchema,
    place_template: PlaceTemplateInputSchema,
    set_targets: SetTargetsInputSchema,
  };

  it('every TOOL_REGISTRY entry inputSchema deep-equals its schema .toJSONSchema()', () => {
    for (const entry of TOOL_REGISTRY) {
      const schema = schemaMap[entry.name];
      if (schema === undefined) throw new Error(`schemaMap missing entry for ${entry.name}`);
      expect(entry.inputSchema).toEqual(schema.toJSONSchema());
    }
  });

  it('TOOL_INPUT_SCHEMAS keys match TOOL_NAMES', () => {
    for (const name of TOOL_NAMES) {
      expect(TOOL_INPUT_SCHEMAS[name]).toBeDefined();
    }
  });
});

// ─── Test 17: JSON Schema structural shape ────────────────────────────────────

describe('JSON Schema structural shape', () => {
  it('every registry entry inputSchema has type:object, properties, required array, additionalProperties:false', () => {
    for (const entry of TOOL_REGISTRY) {
      const schema = entry.inputSchema as Record<string, unknown>;
      expect(schema.type).toBe('object');
      expect(typeof schema.properties).toBe('object');
      expect(Array.isArray(schema.required)).toBe(true);
      expect(schema.additionalProperties).toBe(false);
    }
  });

  it('every registry entry has name, description, and inputSchema fields', () => {
    for (const entry of TOOL_REGISTRY) {
      expect(typeof entry.name).toBe('string');
      expect(entry.name.length).toBeGreaterThan(0);
      expect(typeof entry.description).toBe('string');
      expect(entry.description.length).toBeGreaterThan(0);
      expect(entry.inputSchema).toBeDefined();
    }
  });
});
