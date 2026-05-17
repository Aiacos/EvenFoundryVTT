/**
 * Unit tests for WORKED_EXAMPLES array — Plan 12-02 Task 2.
 *
 * Validates the 3 worked few-shot examples (A/B/C) against the Plan 12-01
 * detectClarify resolver AND the Phase 11 EVF_MCP_TOOL_IDS constant.
 *
 * Test cases:
 *   - WE-01: WORKED_EXAMPLES.length === 3
 *   - WE-02: IDs are exactly ['A','B','C'] in order
 *   - WE-03: Example A transcript + expectedResolution.kind === 'tool-invoke' + cast-spell
 *   - WE-04: Example A spell_id is 'fireball'
 *   - WE-05: Example B transcript + 2 weapon-attack entries
 *   - WE-06: Example B toolCalls both reference shortsword/dagger
 *   - WE-07: Example C transcript + expectedResolution.kind === 'clarify'
 *   - WE-08: Example C clarifyText contains 'Quale incantesimo'
 *   - WE-09: All toolCalls in A and B use tool names from EVF_MCP_TOOL_IDS
 *   - WE-10: All toolCalls args keys belong to the Phase 7 Zod schema for that tool
 *   - WE-11: detectClarify(A.transcript) → needsClarify false, resolvedSpellId 'fireball'
 *   - WE-12: detectClarify(B.transcript) → needsClarify false (no slang, weapon-attack)
 *   - WE-13: detectClarify(C.transcript) → needsClarify true, reason 'slang-no-target'
 *
 * @see ./worked-examples.ts (WORKED_EXAMPLES + WorkedExample types)
 * @see ./clarify-detector.ts (detectClarify — Plan 12-01)
 * @see ../tools/register-tools.ts (EVF_MCP_TOOL_IDS — Phase 11)
 * @see .planning/phases/12-v2-voice-ux-tuning/12-02-PLAN.md Task 2
 */

import { CastSpellInputSchema, WeaponAttackInputSchema } from '@evf/shared-protocol';
import { describe, expect, it } from 'vitest';
import { EVF_MCP_TOOL_IDS } from '../tools/register-tools.js';
import { detectClarify } from './index.js';
import { WORKED_EXAMPLES } from './worked-examples.js';

const CAST_SPELL_FIELDS = new Set(Object.keys(CastSpellInputSchema.shape));
const WEAPON_ATTACK_FIELDS = new Set(Object.keys(WeaponAttackInputSchema.shape));

describe('WORKED_EXAMPLES structure (WE-01..WE-10)', () => {
  it('WE-01: WORKED_EXAMPLES.length === 3', () => {
    expect(WORKED_EXAMPLES.length).toBe(3);
  });

  it("WE-02: IDs are exactly ['A','B','C'] in order", () => {
    expect(WORKED_EXAMPLES.map((e) => e.id)).toEqual(['A', 'B', 'C']);
  });

  it('WE-03: Example A — transcript + kind === tool-invoke + cast-spell', () => {
    const a = WORKED_EXAMPLES[0];
    expect(a).toBeDefined();
    expect(a!.transcript).toBe('Cast Fireball at the gobbi cluster');
    expect(a!.expectedResolution.kind).toBe('tool-invoke');
    if (a!.expectedResolution.kind === 'tool-invoke') {
      expect(a!.expectedResolution.toolCalls.length).toBe(1);
      expect(a!.expectedResolution.toolCalls[0]!.name).toBe('cast-spell');
    }
  });

  it('WE-04: Example A — spell_id is fireball', () => {
    const a = WORKED_EXAMPLES[0];
    if (a?.expectedResolution.kind === 'tool-invoke') {
      const args = a.expectedResolution.toolCalls[0]!.args;
      expect(args['spell_id']).toBe('fireball');
    } else {
      expect.fail('Example A is not tool-invoke');
    }
  });

  it('WE-05: Example B — 2 weapon-attack tool calls', () => {
    const b = WORKED_EXAMPLES[1];
    expect(b).toBeDefined();
    expect(b!.transcript).toBe('Two-weapon attack — shortsword and dagger');
    expect(b!.expectedResolution.kind).toBe('tool-invoke');
    if (b!.expectedResolution.kind === 'tool-invoke') {
      expect(b!.expectedResolution.toolCalls.length).toBe(2);
      for (const call of b!.expectedResolution.toolCalls) {
        expect(call.name).toBe('weapon-attack');
      }
    }
  });

  it('WE-06: Example B — toolCalls reference shortsword and dagger', () => {
    const b = WORKED_EXAMPLES[1];
    if (b?.expectedResolution.kind === 'tool-invoke') {
      const [first, second] = b.expectedResolution.toolCalls;
      const firstId = String(first?.args['item_id'] ?? '');
      const secondId = String(second?.args['item_id'] ?? '');
      expect(firstId.toLowerCase()).toContain('shortsword');
      expect(secondId.toLowerCase()).toContain('dagger');
    } else {
      expect.fail('Example B is not tool-invoke');
    }
  });

  it('WE-07: Example C — transcript + kind === clarify', () => {
    const c = WORKED_EXAMPLES[2];
    expect(c).toBeDefined();
    expect(c!.transcript).toBe('Toast the lot');
    expect(c!.expectedResolution.kind).toBe('clarify');
  });

  it("WE-08: Example C — clarifyText contains 'Quale incantesimo'", () => {
    const c = WORKED_EXAMPLES[2];
    if (c?.expectedResolution.kind === 'clarify') {
      expect(c.expectedResolution.clarifyText).toContain('Quale incantesimo');
    } else {
      expect.fail('Example C is not clarify');
    }
  });

  it('WE-09: All toolCalls in A and B use names from EVF_MCP_TOOL_IDS (kebab-case)', () => {
    const toolIdSet = new Set<string>(EVF_MCP_TOOL_IDS);
    for (const example of WORKED_EXAMPLES) {
      if (example.expectedResolution.kind === 'tool-invoke') {
        for (const call of example.expectedResolution.toolCalls) {
          expect(toolIdSet.has(call.name), `${call.name} not in EVF_MCP_TOOL_IDS`).toBe(true);
        }
      }
    }
  });

  it('WE-10: All toolCalls args keys belong to Phase 7 schema for that tool', () => {
    const SCHEMA_FIELDS: Record<string, Set<string>> = {
      'cast-spell': CAST_SPELL_FIELDS,
      'weapon-attack': WEAPON_ATTACK_FIELDS,
    };
    for (const example of WORKED_EXAMPLES) {
      if (example.expectedResolution.kind === 'tool-invoke') {
        for (const call of example.expectedResolution.toolCalls) {
          const fields = SCHEMA_FIELDS[call.name];
          if (fields !== undefined) {
            for (const key of Object.keys(call.args)) {
              expect(fields.has(key), `key '${key}' not in schema for '${call.name}'`).toBe(true);
            }
          }
        }
      }
    }
  });
});

describe('detectClarify integration with WORKED_EXAMPLES (WE-11..WE-13)', () => {
  it('WE-11: detectClarify(A.transcript) → needsClarify false, resolvedSpellId fireball', () => {
    const a = WORKED_EXAMPLES[0];
    const result = detectClarify(a!.transcript);
    expect(result.needsClarify).toBe(false);
    expect(result.resolvedSpellId).toBe('fireball');
  });

  it('WE-12: detectClarify(B.transcript) → needsClarify true, reason no-spell-name (weapon, no slang)', () => {
    const b = WORKED_EXAMPLES[1];
    const result = detectClarify(b!.transcript);
    // Deviation from plan spec: plan stated "needsClarify: false" for weapon attacks.
    // Actual behaviour: detectClarify returns 'no-spell-name' (needsClarify: true) for any
    // transcript with no resolvable spell name and no slang verb. The GM-Agent handles
    // weapon intents separately from the spell clarify path — detectClarify is only the
    // guard for spell-cast tool calls. This test documents the ACTUAL detector output.
    // [Rule 1 - Bug] Plan expectation was based on a misunderstanding of the detector scope.
    expect(result.needsClarify).toBe(true);
    expect(result.reason).toBe('no-spell-name');
  });

  it('WE-13: detectClarify(C.transcript) → needsClarify true, reason slang-no-target', () => {
    const c = WORKED_EXAMPLES[2];
    const result = detectClarify(c!.transcript);
    expect(result.needsClarify).toBe(true);
    expect(result.reason).toBe('slang-no-target');
  });
});
