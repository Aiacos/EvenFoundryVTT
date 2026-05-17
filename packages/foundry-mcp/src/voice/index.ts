/**
 * Voice subsystem barrel — Phase 12.
 *
 * Re-exports all public symbols from the voice subdirectory so Plan 12-02
 * (GM-Agent prompt + worked examples) and Plan 12-03 (Deepgram adapter)
 * can import from a single entry point:
 *
 * ```ts
 * import { lookupSpellId, detectClarify, SPELL_LOOKUP, levenshteinDistance,
 *          GM_AGENT_SYSTEM_PROMPT, buildGmAgentPrompt, WORKED_EXAMPLES }
 *   from '@evf/foundry-mcp/voice';  // or relative path
 * ```
 *
 * Plan 12-01 exports:
 * - {@link levenshteinDistance} + {@link normaliseForFuzzyMatch} — Levenshtein primitives
 * - {@link SPELL_LOOKUP} — 70-entry IT↔EN spell table
 * - {@link lookupSpellId} — spell resolver (exact → fuzzy → ambiguous → none)
 * - {@link detectClarify} — clarify-detector heuristic
 *
 * Plan 12-02 exports are added by that plan (gm-agent-prompt + worked-examples).
 *
 * @see .planning/phases/12-v2-voice-ux-tuning/12-01-PLAN.md
 * @see .planning/phases/12-v2-voice-ux-tuning/12-02-PLAN.md
 */

export type { ClarifyReason, ClarifyResult } from './clarify-detector.js';
export { detectClarify } from './clarify-detector.js';
export { levenshteinDistance, normaliseForFuzzyMatch } from './levenshtein.js';
export type { SpellLookupConfidence, SpellLookupEntry, SpellLookupResult } from './spell-lookup.js';
export { lookupSpellId, SPELL_LOOKUP } from './spell-lookup.js';
