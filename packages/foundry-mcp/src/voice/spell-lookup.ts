/**
 * IT↔EN spell-name lookup table + fuzzy resolver.
 *
 * Phase 12 Plan 01 Task 2.
 *
 * SPELL_LOOKUP: 70 entries covering SRD cantrips (~20) + L1 (~30) + L2 (~14) +
 * L3 (5) + L5 (1) + reactions. Each entry has:
 * - `dnd5eId`  — dnd5e 5.3.3 canonical kebab-case ID
 * - `it`       — Italian display string (dnd5e.it community localisation)
 * - `en`       — English display string (canonical)
 * - `level`    — spell level 0 (cantrip) … 9
 *
 * lookupSpellId resolution order:
 * 1. Exact match against normalised `en` column → source: 'en-table'
 * 2. Exact match against normalised `it` column → source: 'it-table'
 * 3. Levenshtein distance ≤ 2 against both columns (minimum across all entries):
 *    - Single nearest entry → source: 'levenshtein', confidence: 'fuzzy'
 *    - 2+ entries tied at same minimum distance → confidence: 'ambiguous'
 * 4. No match within distance ≤ 2 → confidence: 'none', source: 'no-match'
 *
 * T-12-03 mitigation: returned `dnd5eId` is ALWAYS from the table — never
 * constructed from caller input. Every non-null result is guaranteed to be in
 * SPELL_LOOKUP.
 *
 * @see levenshtein.ts (normaliseForFuzzyMatch + levenshteinDistance)
 * @see .planning/phases/12-v2-voice-ux-tuning/12-01-PLAN.md Task 2
 */

import { levenshteinDistance, normaliseForFuzzyMatch } from './levenshtein.js';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Single entry in the SPELL_LOOKUP table. */
export interface SpellLookupEntry {
  /** dnd5e 5.3.3 canonical ID, kebab-case (e.g. 'fireball', 'mass-cure-wounds'). */
  dnd5eId: string;
  /** Italian display string used for fuzzy lookup (NFD-normalised internally). */
  it: string;
  /** English display string used for fuzzy lookup (NFD-normalised internally). */
  en: string;
  /** Spell level 0..9 (0 = cantrip). */
  level: number;
}

/** Confidence level returned by lookupSpellId. */
export type SpellLookupConfidence = 'exact' | 'fuzzy' | 'ambiguous' | 'none';

/** Result returned by lookupSpellId. */
export interface SpellLookupResult {
  /** Canonical dnd5e ID when confidence === 'exact' or 'fuzzy'; null otherwise. */
  dnd5eId: string | null;
  confidence: SpellLookupConfidence;
  /** 'it-table' | 'en-table' | 'levenshtein' | 'no-match' */
  source: 'it-table' | 'en-table' | 'levenshtein' | 'no-match';
  /** Edit distance when confidence === 'fuzzy'; undefined otherwise. */
  distance?: number;
  /** When confidence === 'ambiguous', the tied candidates (dnd5eId + distance). */
  candidates?: Array<{ dnd5eId: string; distance: number }>;
}

// ─── Table data ────────────────────────────────────────────────────────────────

/**
 * 70-entry IT↔EN spell lookup table.
 *
 * Italian translations follow the dnd5e.it community localisation.
 * Where multiple Italian variants exist, the most common single form is used.
 *
 * Ordered by: cantrips (level 0) first, then L1..L3, then L5, then dedicated reaction entries.
 * Note: shield and feather-fall appear at their respective spell levels
 * (L1 reaction + L1 bonus-action). counterspell / absorb-elements / hellish-rebuke
 * appear at their native levels (L3/L1/L1).
 *
 * SPELL_LOOKUP_COUNT_GATE: SPELL_LOOKUP.length === 70 is enforced by test.
 */
export const SPELL_LOOKUP: ReadonlyArray<SpellLookupEntry> = Object.freeze([
  // ─── Cantrips (level 0) — ~20 entries ─────────────────────────────────────
  { dnd5eId: 'acid-splash', it: 'schizzo acido', en: 'acid splash', level: 0 },
  { dnd5eId: 'chill-touch', it: 'tocco di gelo', en: 'chill touch', level: 0 },
  { dnd5eId: 'dancing-lights', it: 'luci danzanti', en: 'dancing lights', level: 0 },
  { dnd5eId: 'eldritch-blast', it: 'esplosione occulta', en: 'eldritch blast', level: 0 },
  { dnd5eId: 'fire-bolt', it: 'dardo di fuoco', en: 'fire bolt', level: 0 },
  { dnd5eId: 'guidance', it: 'consiglio', en: 'guidance', level: 0 },
  { dnd5eId: 'light', it: 'luce', en: 'light', level: 0 },
  { dnd5eId: 'mage-hand', it: 'mani magiche', en: 'mage hand', level: 0 },
  { dnd5eId: 'mending', it: 'riparazione', en: 'mending', level: 0 },
  { dnd5eId: 'message', it: 'messaggio', en: 'message', level: 0 },
  { dnd5eId: 'minor-illusion', it: 'piccola illusione', en: 'minor illusion', level: 0 },
  { dnd5eId: 'poison-spray', it: 'spruzzo di veleno', en: 'poison spray', level: 0 },
  { dnd5eId: 'prestidigitation', it: 'prestidigitazione', en: 'prestidigitation', level: 0 },
  { dnd5eId: 'produce-flame', it: 'produrre fiamma', en: 'produce flame', level: 0 },
  { dnd5eId: 'ray-of-frost', it: 'raggio di gelo', en: 'ray of frost', level: 0 },
  { dnd5eId: 'resistance', it: 'resistenza', en: 'resistance', level: 0 },
  { dnd5eId: 'sacred-flame', it: 'fiamma sacra', en: 'sacred flame', level: 0 },
  { dnd5eId: 'shocking-grasp', it: 'stretta folgorante', en: 'shocking grasp', level: 0 },
  { dnd5eId: 'true-strike', it: 'colpo infallibile', en: 'true strike', level: 0 },
  { dnd5eId: 'vicious-mockery', it: 'scherno feroce', en: 'vicious mockery', level: 0 },

  // ─── L1 — ~30 entries ─────────────────────────────────────────────────────
  { dnd5eId: 'absorb-elements', it: 'assorbire elementi', en: 'absorb elements', level: 1 },
  { dnd5eId: 'bless', it: 'benedizione', en: 'bless', level: 1 },
  { dnd5eId: 'burning-hands', it: 'mani brucianti', en: 'burning hands', level: 1 },
  { dnd5eId: 'charm-person', it: 'ammaliare persone', en: 'charm person', level: 1 },
  { dnd5eId: 'color-spray', it: 'ventaglio di colori', en: 'color spray', level: 1 },
  { dnd5eId: 'command', it: 'comando', en: 'command', level: 1 },
  { dnd5eId: 'cure-wounds', it: 'cura ferite', en: 'cure wounds', level: 1 },
  { dnd5eId: 'detect-magic', it: 'individuare magia', en: 'detect magic', level: 1 },
  { dnd5eId: 'disguise-self', it: 'travestimento', en: 'disguise self', level: 1 },
  { dnd5eId: 'expeditious-retreat', it: 'ritirata rapida', en: 'expeditious retreat', level: 1 },
  { dnd5eId: 'faerie-fire', it: 'fuoco fatuo', en: 'faerie fire', level: 1 },
  { dnd5eId: 'false-life', it: 'vita illusoria', en: 'false life', level: 1 },
  { dnd5eId: 'feather-fall', it: 'caduta lenta', en: 'feather fall', level: 1 },
  { dnd5eId: 'fog-cloud', it: 'nube di nebbia', en: 'fog cloud', level: 1 },
  { dnd5eId: 'guiding-bolt', it: 'dardo guida', en: 'guiding bolt', level: 1 },
  { dnd5eId: 'healing-word', it: 'parola di cura', en: 'healing word', level: 1 },
  { dnd5eId: 'hellish-rebuke', it: 'rimprovero infernale', en: 'hellish rebuke', level: 1 },
  { dnd5eId: 'hex', it: 'maleficio', en: 'hex', level: 1 },
  { dnd5eId: 'identify', it: 'identificare', en: 'identify', level: 1 },
  { dnd5eId: 'jump', it: 'salto', en: 'jump', level: 1 },
  { dnd5eId: 'mage-armor', it: 'armatura di mago', en: 'mage armor', level: 1 },
  { dnd5eId: 'magic-missile', it: 'dardo incantato', en: 'magic missile', level: 1 },
  { dnd5eId: 'sanctuary', it: 'santuario', en: 'sanctuary', level: 1 },
  { dnd5eId: 'shield', it: 'scudo', en: 'shield', level: 1 },
  { dnd5eId: 'sleep', it: 'sonno', en: 'sleep', level: 1 },
  { dnd5eId: 'thunderwave', it: 'onda di tuono', en: 'thunderwave', level: 1 },
  { dnd5eId: 'witch-bolt', it: 'fulmine stregonesco', en: 'witch bolt', level: 1 },
  { dnd5eId: 'chromatic-orb', it: 'sfera cromatica', en: 'chromatic orb', level: 1 },
  { dnd5eId: 'find-familiar', it: 'trovare famiglio', en: 'find familiar', level: 1 },
  { dnd5eId: 'grease', it: 'grasso', en: 'grease', level: 1 },

  // ─── L2 — ~14 entries ─────────────────────────────────────────────────────
  { dnd5eId: 'aid', it: 'aiuto', en: 'aid', level: 2 },
  { dnd5eId: 'blindness-deafness', it: 'cecità sordità', en: 'blindness deafness', level: 2 },
  { dnd5eId: 'blur', it: 'sfocatura', en: 'blur', level: 2 },
  { dnd5eId: 'darkness', it: 'oscurità', en: 'darkness', level: 2 },
  { dnd5eId: 'hold-person', it: 'tenere persone', en: 'hold person', level: 2 },
  { dnd5eId: 'invisibility', it: 'invisibilità', en: 'invisibility', level: 2 },
  { dnd5eId: 'knock', it: 'aprire', en: 'knock', level: 2 },
  {
    dnd5eId: 'lesser-restoration',
    it: 'restaurazione inferiore',
    en: 'lesser restoration',
    level: 2,
  },
  { dnd5eId: 'mirror-image', it: 'immagine speculare', en: 'mirror image', level: 2 },
  { dnd5eId: 'misty-step', it: 'passo nebbioso', en: 'misty step', level: 2 },
  { dnd5eId: 'scorching-ray', it: 'raggio rovente', en: 'scorching ray', level: 2 },
  { dnd5eId: 'see-invisibility', it: 'vedere invisibile', en: 'see invisibility', level: 2 },
  { dnd5eId: 'spider-climb', it: 'arrampicarsi', en: 'spider climb', level: 2 },
  { dnd5eId: 'web', it: 'tela di ragno', en: 'web', level: 2 },

  // ─── L3 — 5 entries ───────────────────────────────────────────────────────
  { dnd5eId: 'counterspell', it: 'contromagia', en: 'counterspell', level: 3 },
  { dnd5eId: 'dispel-magic', it: 'dissolvi magie', en: 'dispel magic', level: 3 },
  { dnd5eId: 'fireball', it: 'palla di fuoco', en: 'fireball', level: 3 },
  { dnd5eId: 'fly', it: 'volare', en: 'fly', level: 3 },
  { dnd5eId: 'haste', it: 'velocità', en: 'haste', level: 3 },

  // ─── L5 — 1 entry ─────────────────────────────────────────────────────────
  { dnd5eId: 'mass-cure-wounds', it: 'cura ferite di massa', en: 'mass cure wounds', level: 5 },
]);

// ─── Pre-normalised index (built once at module load) ─────────────────────────

interface NormalisedEntry {
  dnd5eId: string;
  normEn: string;
  normIt: string;
}

/** Pre-normalise all columns once at module load — avoids per-call recomputation. */
const NORMALISED: ReadonlyArray<NormalisedEntry> = SPELL_LOOKUP.map((e) => ({
  dnd5eId: e.dnd5eId,
  normEn: normaliseForFuzzyMatch(e.en),
  normIt: normaliseForFuzzyMatch(e.it),
}));

/** Maximum Levenshtein distance for a fuzzy match to be considered. */
const MAX_FUZZY_DISTANCE = 2;

/**
 * Check whether `transcript` contains `spellName` as a whole-word (or whole-phrase)
 * occurrence. Uses word-boundary logic: the spell name must be preceded and followed
 * by a non-alphanumeric character (or string start/end).
 *
 * Multi-word spell names (e.g. 'palla di fuoco') are matched as contiguous substrings.
 *
 * @param transcript - Normalised full transcript (lowercase, accent-stripped).
 * @param spellName  - Normalised spell name from the table.
 * @returns True if the spell name is found as a word-boundary-delimited substring.
 */
function containsSpellName(transcript: string, spellName: string): boolean {
  const idx = transcript.indexOf(spellName);
  if (idx === -1) return false;
  // Word-boundary check: char before must be non-alphanumeric (or start of string)
  const before = idx === 0 ? '' : transcript[idx - 1];
  const after = transcript[idx + spellName.length];
  const beforeOk = before === '' || before === undefined || !/[a-z0-9]/.test(before);
  const afterOk = after === undefined || !/[a-z0-9]/.test(after);
  return beforeOk && afterOk;
}

// ─── lookupSpellId ────────────────────────────────────────────────────────────

/**
 * Resolve a voice transcript (full sentence or fragment) to a dnd5e spell ID.
 *
 * Resolution order:
 * 1. Exact EN match (transcript === entry.en after normalise) → 'en-table'
 * 2. Exact IT match (transcript === entry.it after normalise) → 'it-table'
 * 3. Substring EN match (transcript contains entry.en as word-boundary substring) → 'en-table'
 * 4. Substring IT match (transcript contains entry.it as word-boundary substring) → 'it-table'
 * 5. Levenshtein ≤ 2 of the full transcript against each entry column:
 *    - Single nearest → 'fuzzy'; 2+ tied → 'ambiguous'
 * 6. No match → 'none'
 *
 * T-12-03: returned dnd5eId is ALWAYS sourced from SPELL_LOOKUP — never
 * constructed from the caller's input string.
 *
 * @param transcript - Raw STT transcript (may be full sentence). Empty → 'none'.
 * @returns SpellLookupResult
 */
export function lookupSpellId(transcript: string): SpellLookupResult {
  const norm = normaliseForFuzzyMatch(transcript);

  if (norm.length === 0) {
    return { dnd5eId: null, confidence: 'none', source: 'no-match' };
  }

  // 1. Exact EN match
  for (const entry of NORMALISED) {
    if (entry.normEn === norm) {
      return { dnd5eId: entry.dnd5eId, confidence: 'exact', source: 'en-table' };
    }
  }

  // 2. Exact IT match
  for (const entry of NORMALISED) {
    if (entry.normIt === norm) {
      return { dnd5eId: entry.dnd5eId, confidence: 'exact', source: 'it-table' };
    }
  }

  // 3. Substring EN match — the transcript contains the spell name as a whole-word sequence.
  // Use a word-boundary-aware check: the spell name (multi-word) appears as a contiguous
  // substring preceded/followed by a non-word character or string boundary.
  for (const entry of NORMALISED) {
    if (entry.normEn.length > 0 && containsSpellName(norm, entry.normEn)) {
      return { dnd5eId: entry.dnd5eId, confidence: 'exact', source: 'en-table' };
    }
  }

  // 4. Substring IT match
  for (const entry of NORMALISED) {
    if (entry.normIt.length > 0 && containsSpellName(norm, entry.normIt)) {
      return { dnd5eId: entry.dnd5eId, confidence: 'exact', source: 'it-table' };
    }
  }

  // 5. Levenshtein — compute min distance per entry across both columns
  let minDist = MAX_FUZZY_DISTANCE + 1; // sentinel: beyond the threshold
  const candidates: Array<{ dnd5eId: string; distance: number }> = [];

  for (const entry of NORMALISED) {
    const distEn = levenshteinDistance(norm, entry.normEn);
    const distIt = levenshteinDistance(norm, entry.normIt);
    const dist = Math.min(distEn, distIt);

    if (dist > MAX_FUZZY_DISTANCE) continue;

    if (dist < minDist) {
      // New best — replace candidates list
      minDist = dist;
      candidates.length = 0;
      candidates.push({ dnd5eId: entry.dnd5eId, distance: dist });
    } else if (dist === minDist) {
      // Tied at the same distance — add to candidates
      candidates.push({ dnd5eId: entry.dnd5eId, distance: dist });
    }
  }

  if (candidates.length === 0) {
    return { dnd5eId: null, confidence: 'none', source: 'no-match' };
  }

  if (candidates.length === 1) {
    // T-12-03 guard: candidates[0] is guaranteed to exist (length === 1 check above).
    // Destructure with a fallback to avoid noUncheckedIndexedAccess TS flag.
    const [winner] = candidates;
    if (winner === undefined) {
      // Unreachable (length === 1 guarantees [0] exists) — defensive return.
      return { dnd5eId: null, confidence: 'none', source: 'no-match' };
    }
    return {
      dnd5eId: winner.dnd5eId,
      confidence: 'fuzzy',
      source: 'levenshtein',
      distance: winner.distance,
    };
  }

  // 2+ entries tied — ambiguous
  return {
    dnd5eId: null,
    confidence: 'ambiguous',
    source: 'levenshtein',
    candidates,
  };
}
