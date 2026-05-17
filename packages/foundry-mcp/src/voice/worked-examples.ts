/**
 * WORKED_EXAMPLES — 3 few-shot scaffolding examples for the GM-Agent system prompt.
 *
 * Phase 12 Plan 02 Task 2.
 *
 * These examples pair with `buildGmAgentPrompt()` (Plan 12-02 Task 3): each entry is
 * embedded into the GM-Agent system prompt as a concrete demonstration of how the
 * LLM should resolve a voice transcript. The `expectedResolution` field serves BOTH
 * as documentation for the LLM AND as a structural test fixture verified against the
 * Plan 12-01 clarify-detector (`detectClarify`).
 *
 * Example IDs:
 * - **A — Fireball gruppo:** Demonstrates exact-EN spell resolution + cast-spell invocation
 *   via `combat://current` for live target identification.
 * - **B — Dual-wield Action+Bonus:** Demonstrates two sequential weapon-attack calls
 *   (shortsword as Action, dagger as Bonus Action). Note: weapon-attack transcripts
 *   have no resolvable spell name; `detectClarify` returns `no-spell-name` for this
 *   transcript. The GM-Agent must route weapon intents WITHOUT a spell-lookup clarify check.
 * - **C — Clarify ambiguity:** Demonstrates the slang-verb `toast` triggering a
 *   `slang-no-target` clarify response instead of a tool invocation.
 *
 * Security:
 * - All `toolCalls[].name` values are members of `EVF_MCP_TOOL_IDS` (Phase 11 kebab-case).
 * - All `toolCalls[].args` keys are fields from the Phase 7 Zod input schemas.
 * - The `actor_id` and `targets` values use explicit placeholder strings; the LLM must
 *   call `actor://current` and `combat://current` resources BEFORE invoking any tool
 *   to resolve real Foundry document IDs at runtime.
 *
 * @see ./gm-agent-prompt.ts (buildGmAgentPrompt — consumes WORKED_EXAMPLES)
 * @see ./clarify-detector.ts (detectClarify — Plan 12-01 resolver)
 * @see ../tools/register-tools.ts (EVF_MCP_TOOL_IDS — Phase 11 tool IDs)
 * @see packages/shared-protocol/src/tools/cast-spell.ts (CastSpellInputSchema fields)
 * @see packages/shared-protocol/src/tools/weapon-attack.ts (WeaponAttackInputSchema fields)
 * @see .planning/phases/12-v2-voice-ux-tuning/12-02-PLAN.md Task 2
 * @see .planning/phases/12-v2-voice-ux-tuning/12-CONTEXT.md D-12-03
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/** Identifier for a worked example entry. */
export type WorkedExampleId = 'A' | 'B' | 'C';

/**
 * A single few-shot worked example for the GM-Agent system prompt.
 *
 * Each entry encapsulates:
 * - The voice transcript that triggered the example.
 * - The expected LLM resolution (tool invocation or clarify prompt).
 * - A human-readable rationale included in the prompt body for LLM context.
 */
export interface WorkedExample {
  id: WorkedExampleId;
  /** Transcript the example is built around. */
  transcript: string;
  /** What the GM-Agent should DO with this transcript. */
  expectedResolution:
    | {
        kind: 'tool-invoke';
        toolCalls: ReadonlyArray<{ name: string; args: Record<string, unknown> }>;
      }
    | {
        kind: 'clarify';
        clarifyText: string;
      };
  /** Human-readable explanation included in the prompt body. */
  rationale: string;
}

// ─── Worked Examples ──────────────────────────────────────────────────────────

/**
 * The 3 worked few-shot examples for the GM-Agent system prompt.
 *
 * Frozen `ReadonlyArray` — callers must not mutate this array or its entries.
 * `buildGmAgentPrompt()` (Task 3) appends each example to the base prompt body.
 *
 * PLACEHOLDER CONVENTION:
 * - `actor_id: '<actor.uuid from actor://current>'` — the LLM must read the
 *   `actor://current` resource first and substitute the real Foundry document ID.
 * - `targets: ['<token.uuid from combat://current>']` — similarly from `combat://current`.
 * - `spell_id: 'fireball'` — this is the dnd5eId from Plan 12-01's SPELL_LOOKUP table;
 *   the bridge maps it to the actual Foundry item ID via the actor's spell list.
 */
export const WORKED_EXAMPLES: ReadonlyArray<WorkedExample> = Object.freeze([
  // ── Example A: Fireball gruppo ───────────────────────────────────────────────
  // Demonstrates exact-EN spell resolution. detectClarify returns:
  //   { needsClarify: false, resolvedSpellId: 'fireball' }
  {
    id: 'A' as const,
    transcript: 'Cast Fireball at the gobbi cluster',
    expectedResolution: {
      kind: 'tool-invoke',
      toolCalls: [
        {
          name: 'cast-spell',
          args: {
            actor_id: '<actor.uuid from actor://current>',
            spell_id: 'fireball',
            slot_level: 3,
            targets: ['<token.uuid from combat://current — gobbi cluster>'],
          },
        },
      ],
    },
    rationale:
      '"Fireball" resolves to the fireball spell (exact EN match via Plan 12-01 SPELL_LOOKUP). ' +
      'Targets are identified by reading combat://current for the token nearest the "gobbi cluster" ' +
      'description. cast-spell is invoked at slot level 3 (minimum for fireball). ' +
      'The actor_id must be read from actor://current before invocation — never hardcode IDs.',
  },

  // ── Example B: Dual-wield Action + Bonus Action ──────────────────────────────
  // Demonstrates two sequential weapon-attack calls. Note: this transcript has no
  // resolvable spell name — detectClarify returns { needsClarify: true, reason: 'no-spell-name' }.
  // The GM-Agent must recognise weapon-attack intent INDEPENDENTLY of detectClarify;
  // the clarify-detector is only the guard for spell-cast tool calls.
  {
    id: 'B' as const,
    transcript: 'Two-weapon attack — shortsword and dagger',
    expectedResolution: {
      kind: 'tool-invoke',
      toolCalls: [
        {
          name: 'weapon-attack',
          args: {
            actor_id: '<actor.uuid from actor://current>',
            item_id: '<shortsword.uuid from actor://current inventory>',
            targets: ['<token.uuid from combat://current>'],
            advantage: 'normal',
            count: 1,
          },
        },
        {
          name: 'weapon-attack',
          args: {
            actor_id: '<actor.uuid from actor://current>',
            item_id: '<dagger.uuid from actor://current inventory>',
            targets: ['<token.uuid from combat://current>'],
            advantage: 'normal',
            count: 1,
          },
        },
      ],
    },
    rationale:
      '"Shortsword and dagger" triggers two weapon-attack calls: shortsword as Action, ' +
      'dagger as Bonus Action (Two-Weapon Fighting rule). The weapon items are identified ' +
      'by reading actor://current inventory. No spell clarify check applies here — weapon ' +
      'intents are resolved directly from actor inventory, not via the spell lookup table.',
  },

  // ── Example C: Slang-verb → clarify prompt ───────────────────────────────────
  // Demonstrates the slang-verb 'toast' triggering slang-no-target from detectClarify.
  // detectClarify returns: { needsClarify: true, reason: 'slang-no-target' }
  // The GM-Agent must NOT call any tool; instead it emits the clarify prompt verbatim.
  {
    id: 'C' as const,
    transcript: 'Toast the lot',
    expectedResolution: {
      kind: 'clarify',
      clarifyText:
        'Quale incantesimo? Specifica con nome canonico (es. palla di fuoco / fireball).',
    },
    rationale:
      '"Toast" is a slang verb in the SLANG_VERBS closed set (Plan 12-01 clarify-detector). ' +
      'No spell name is present. detectClarify returns slang-no-target. ' +
      'The GM-Agent MUST NOT invoke any tool — instead, it returns the clarifyText verbatim ' +
      'as a visual toast on the G2 display (no audio output — G2 has no speaker).',
  },
]);
