/**
 * Clarify-detector heuristic — determines whether a voice transcript requires
 * a clarify prompt before dispatching a spell/action tool call.
 *
 * Phase 12 Plan 01 Task 3.
 *
 * Decision logic (D-12-04 heuristic):
 * 1. Empty transcript → 'empty-transcript'
 * 2. Call lookupSpellId(transcript):
 *    - 'ambiguous' → 'ambiguous-match' (return candidates for the clarify prompt)
 *    - 'none' AND a slang verb is present → 'slang-no-target'
 *    - 'none' AND no slang verb → 'no-spell-name'
 *    - 'exact' or 'fuzzy' → needsClarify: false with resolvedSpellId
 *
 * Slang vocabulary (case-insensitive, normalised): scorch, blast, toast, fry, nuke, zap.
 * These are the ONLY slang triggers. Non-slang verbs (cast, lancia, scaglia, use, drop,
 * lock) do NOT raise the slang flag.
 *
 * Target-absence alone does NOT trigger clarify. A valid spell ID is the strong signal.
 * Slang verb + no spell ID = clarify (regardless of target-word presence).
 *
 * No external dependencies beyond spell-lookup.ts and levenshtein.ts (normalise).
 *
 * @see spell-lookup.ts (lookupSpellId)
 * @see .planning/phases/12-v2-voice-ux-tuning/12-01-PLAN.md Task 3
 */

import { normaliseForFuzzyMatch } from './levenshtein.js';
import { lookupSpellId } from './spell-lookup.js';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Reason why clarification is needed. */
export type ClarifyReason =
  | 'slang-no-target'
  | 'no-spell-name'
  | 'ambiguous-match'
  | 'empty-transcript';

/** Result returned by detectClarify. */
export interface ClarifyResult {
  needsClarify: boolean;
  reason?: ClarifyReason;
  /** Forwarded from SpellLookupResult when reason === 'ambiguous-match'. */
  candidates?: Array<{ dnd5eId: string; distance: number }>;
  /** When confidence resolved to 'exact' or 'fuzzy', the resolved ID for callers. */
  resolvedSpellId?: string;
}

// ─── Slang vocabulary ─────────────────────────────────────────────────────────

/**
 * Slang verbs that, when present WITHOUT a resolvable spell name, trigger a
 * clarify prompt. These are informal action words that don't map to a specific
 * spell without additional context.
 *
 * Case-insensitive matching is done via normaliseForFuzzyMatch (lowercase + NFD).
 * The set is CLOSED: only these 6 words trigger the slang flag. Non-slang verbs
 * (cast, lancia, scaglia, use, drop, lock) do NOT.
 */
const SLANG_VERBS: ReadonlySet<string> = new Set([
  'scorch',
  'blast',
  'toast',
  'fry',
  'nuke',
  'zap',
]);

// ─── detectClarify ────────────────────────────────────────────────────────────

/**
 * Analyse a voice transcript to determine if a clarify prompt is needed.
 *
 * The function is DETERMINISTIC: given the same transcript, it always returns
 * the same result (SPELL_LOOKUP is immutable; SLANG_VERBS is a frozen Set).
 *
 * @param transcript - Raw STT transcript. Empty string → 'empty-transcript'.
 * @returns ClarifyResult
 */
export function detectClarify(transcript: string): ClarifyResult {
  // 1. Empty transcript
  const norm = normaliseForFuzzyMatch(transcript);
  if (norm.length === 0) {
    return { needsClarify: true, reason: 'empty-transcript' };
  }

  // 2. Check for slang verbs — split on whitespace, match against SLANG_VERBS.
  //    We use normalised tokens so 'Scorch', 'SCORCH', 'scòrch' all match.
  const tokens = norm.split(/\s+/);
  const slangPresent = tokens.some((token) => SLANG_VERBS.has(token));

  // 3. Spell lookup
  const lookup = lookupSpellId(transcript);

  switch (lookup.confidence) {
    case 'ambiguous':
      // Ambiguous match — ask user to pick one of the candidates
      return {
        needsClarify: true,
        reason: 'ambiguous-match',
        candidates: lookup.candidates ?? [],
      };

    case 'none':
      // No spell resolved — route on slang presence
      if (slangPresent) {
        return { needsClarify: true, reason: 'slang-no-target' };
      }
      return { needsClarify: true, reason: 'no-spell-name' };

    case 'exact':
    case 'fuzzy': {
      // Spell resolved — no clarification needed.
      // resolvedSpellId is forwarded so callers skip a second lookupSpellId call.
      // id is non-null when confidence is 'exact' or 'fuzzy' by construction;
      // the TypeScript type allows null but the implementation guarantees it here.
      // Use nullish coalescing to avoid non-null assertion while preserving intent.
      const id = lookup.dnd5eId ?? undefined;
      return {
        needsClarify: false,
        resolvedSpellId: id,
      };
    }
  }
}
