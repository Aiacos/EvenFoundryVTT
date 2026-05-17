/**
 * spell-lookup-foundry — Dynamic Foundry-derived spell vocabulary resolver.
 *
 * Quick Task 20260517-spell-lookup-foundry-derived (Task 3).
 *
 * Fetches the available-spell vocabulary from the bridge's
 * `GET /v1/spells/available` endpoint (populated by spell-pack-reader.ts in the
 * Foundry module). Caches the result for 5 minutes (TTL = 300_000ms). Applies
 * Levenshtein fuzzy matching on both `name` (EN) and `nameLocalized` (locale)
 * columns — same algorithm as the static `lookupSpellId` in spell-lookup.ts.
 *
 * ## Fallback chain
 *
 * 1. Fetch `/v1/spells/available` → build dynamic lookup map.
 * 2. If fetch fails OR bridge returns source=empty → fall back to static
 *    `SPELL_LOOKUP` (70-entry SRD subset) via the original `lookupSpellId`.
 *
 * This preserves the "offline fallback" invariant: voice commands still
 * resolve to canonical dnd5e spell IDs even when the bridge is unreachable.
 *
 * ## Security (T-SP-02)
 *
 * Bearer is sent ONLY in the Authorization header. Response validated with
 * `AvailableSpellsPayloadSchema.safeParse` before building the lookup map.
 * dnd5eId is derived ONLY from the validated payload — never constructed from
 * caller input (same T-12-03 invariant as the static table).
 *
 * ## TTL semantics
 *
 * - Cache is invalidated when `Date.now() - _cacheTime > 300_000` (5 min).
 * - Cold cache (null) → always fetch.
 * - Stale cache → re-fetch; on failure, return stale data (soft-fail).
 *
 * @see packages/foundry-mcp/src/voice/spell-lookup.ts (static fallback)
 * @see packages/bridge/src/routes/spells.ts (REST endpoint)
 * @see packages/shared-protocol/src/payloads/spell-pack.ts (AvailableSpellsPayloadSchema)
 * @see .planning/quick/20260517-spell-lookup-foundry-derived/PLAN.md Task 3
 */

import { AvailableSpellsPayloadSchema } from '@evf/shared-protocol';
import { levenshteinDistance, normaliseForFuzzyMatch } from './levenshtein.js';
import { SPELL_LOOKUP, type SpellLookupResult } from './spell-lookup.js';

// ─── Constants ─────────────────────────────────────────────────────────────────

/** Client-side TTL for the dynamic vocabulary cache (5 minutes). */
export const SPELL_CACHE_TTL_MS = 300_000;

/** Maximum Levenshtein distance for a fuzzy match to be considered. */
const MAX_FUZZY_DISTANCE = 2;

// ─── Module-level cache ────────────────────────────────────────────────────────

/** A resolved entry in the dynamic lookup map. */
interface DynamicEntry {
  /** dnd5e canonical ID (from bridge payload; validated per T-SP-02). */
  dnd5eId: string;
  /** Normalised English name for fuzzy matching. */
  normEn: string;
  /** Normalised localised name for fuzzy matching. */
  normLoc: string;
}

/** Module-level singleton cache for the dynamic vocabulary. */
let _cache: DynamicEntry[] | null = null;
/** Unix timestamp (ms) when the cache was last populated. */
let _cacheTime = 0;

/**
 * Reset the module-level cache (used in tests for isolation).
 *
 * @internal Test utility — do NOT call in production code.
 */
export function _resetSpellCache(): void {
  _cache = null;
  _cacheTime = 0;
}

// ─── fetchAvailableSpells ───────────────────────────────────────────────────────

/**
 * Fetch the available-spells payload from the bridge and build a normalised
 * lookup map. Caches the result for {@link SPELL_CACHE_TTL_MS} milliseconds.
 *
 * Returns `null` when:
 * - The bridge is unreachable (fetch throws / non-2xx status).
 * - The bridge returns `source: 'empty'` (no push received yet from Foundry module).
 * - The response fails `AvailableSpellsPayloadSchema.safeParse` validation (T-SP-02).
 *
 * Callers should fall back to the static SPELL_LOOKUP when this returns null.
 *
 * @param bridgeUrl - HTTP URL of the EVF bridge (e.g. `http://localhost:8910`).
 * @param bearer    - Opaque 24h bearer token for bridge auth.
 * @returns Normalised lookup map entries, or `null` on failure.
 */
export async function fetchAvailableSpells(
  bridgeUrl: string,
  bearer: string,
): Promise<DynamicEntry[] | null> {
  const now = Date.now();

  // Cache hit: return cached entries if not stale
  if (_cache !== null && now - _cacheTime <= SPELL_CACHE_TTL_MS) {
    return _cache;
  }

  try {
    const res = await fetch(`${bridgeUrl}/v1/spells/available`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${bearer}`,
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      // Non-2xx → bridge unreachable or auth failure → fall back to static
      return null;
    }

    const raw = await res.json();

    // T-SP-02: Validate response before building lookup map
    const parsed = AvailableSpellsPayloadSchema.safeParse(raw);
    if (!parsed.success) {
      return null;
    }

    const payload = parsed.data;

    // Empty source → Foundry module hasn't pushed yet → fall back to static
    if (payload.source === 'empty' || payload.entries.length === 0) {
      return null;
    }

    // Build normalised lookup map from validated payload
    const entries: DynamicEntry[] = payload.entries.map((e) => ({
      dnd5eId: e.id, // Use compendium _id as the lookup key (same as dnd5e kebab ID)
      normEn: normaliseForFuzzyMatch(e.name),
      normLoc: normaliseForFuzzyMatch(e.nameLocalized),
    }));

    // Update module-level cache
    _cache = entries;
    _cacheTime = Date.now();

    return entries;
  } catch {
    // Network error / JSON parse error → fall back to static (soft-fail)
    return null;
  }
}

// ─── lookupSpellIdDynamic ─────────────────────────────────────────────────────

/**
 * Resolve a voice transcript to a dnd5e spell ID using the dynamic vocabulary.
 *
 * Same resolution order as `lookupSpellId` in spell-lookup.ts, but operates on
 * the dynamic `DynamicEntry[]` map instead of the static SPELL_LOOKUP table.
 *
 * Resolution order (same as static resolver):
 * 1. Exact EN match (transcript === normEn)  → source: 'en-table'
 * 2. Exact locale match (transcript === normLoc) → source: 'it-table'
 * 3. Substring EN match (word-boundary aware) → source: 'en-table'
 * 4. Substring locale match                  → source: 'it-table'
 * 5. Levenshtein ≤ 2 across both columns     → source: 'levenshtein'
 * 6. No match                                → source: 'no-match'
 *
 * @param norm     - Pre-normalised transcript (from `normaliseForFuzzyMatch`).
 * @param entries  - Validated dynamic lookup entries.
 * @returns SpellLookupResult (same shape as static resolver for interoperability).
 */
function lookupInDynamic(norm: string, entries: DynamicEntry[]): SpellLookupResult {
  // 1. Exact EN match
  for (const entry of entries) {
    if (entry.normEn === norm) {
      return { dnd5eId: entry.dnd5eId, confidence: 'exact', source: 'en-table' };
    }
  }

  // 2. Exact locale match
  for (const entry of entries) {
    if (entry.normLoc === norm) {
      return { dnd5eId: entry.dnd5eId, confidence: 'exact', source: 'it-table' };
    }
  }

  // 3. Substring EN match (word-boundary aware)
  for (const entry of entries) {
    if (entry.normEn.length > 0 && containsSpellName(norm, entry.normEn)) {
      return { dnd5eId: entry.dnd5eId, confidence: 'exact', source: 'en-table' };
    }
  }

  // 4. Substring locale match
  for (const entry of entries) {
    if (entry.normLoc.length > 0 && containsSpellName(norm, entry.normLoc)) {
      return { dnd5eId: entry.dnd5eId, confidence: 'exact', source: 'it-table' };
    }
  }

  // 5. Levenshtein fuzzy match
  let minDist = MAX_FUZZY_DISTANCE + 1;
  const candidates: Array<{ dnd5eId: string; distance: number }> = [];

  for (const entry of entries) {
    const distEn = levenshteinDistance(norm, entry.normEn);
    const distLoc = levenshteinDistance(norm, entry.normLoc);
    const dist = Math.min(distEn, distLoc);

    if (dist > MAX_FUZZY_DISTANCE) continue;

    if (dist < minDist) {
      minDist = dist;
      candidates.length = 0;
      candidates.push({ dnd5eId: entry.dnd5eId, distance: dist });
    } else if (dist === minDist) {
      candidates.push({ dnd5eId: entry.dnd5eId, distance: dist });
    }
  }

  if (candidates.length === 0) {
    return { dnd5eId: null, confidence: 'none', source: 'no-match' };
  }

  if (candidates.length === 1) {
    const [winner] = candidates;
    if (winner === undefined) {
      return { dnd5eId: null, confidence: 'none', source: 'no-match' };
    }
    return {
      dnd5eId: winner.dnd5eId,
      confidence: 'fuzzy',
      source: 'levenshtein',
      distance: winner.distance,
    };
  }

  return { dnd5eId: null, confidence: 'ambiguous', source: 'levenshtein', candidates };
}

/**
 * Word-boundary-aware spell name containment check (matches static resolver).
 *
 * Mirrors `containsSpellName` from spell-lookup.ts — the spell name must be
 * preceded and followed by a non-alphanumeric character (or string boundary).
 *
 * @param transcript - Normalised full transcript.
 * @param spellName  - Normalised spell name from the lookup table.
 * @returns True if the spell name appears as a word-boundary substring.
 */
function containsSpellName(transcript: string, spellName: string): boolean {
  const idx = transcript.indexOf(spellName);
  if (idx === -1) return false;
  const before = idx === 0 ? '' : transcript[idx - 1];
  const after = transcript[idx + spellName.length];
  const beforeOk = before === '' || before === undefined || !/[a-z0-9]/.test(before);
  const afterOk = after === undefined || !/[a-z0-9]/.test(after);
  return beforeOk && afterOk;
}

// ─── lookupSpellIdFromBridge ──────────────────────────────────────────────────

/**
 * Resolve a voice transcript to a dnd5e spell ID using the bridge-derived
 * dynamic vocabulary, with automatic fallback to the static SPELL_LOOKUP table.
 *
 * This is the primary entry point for voice spell resolution in foundry-mcp.
 * It replaces direct calls to `lookupSpellId` (static-only) when the bridge
 * URL and bearer are available.
 *
 * Fallback logic:
 * - If `bridgeUrl` or `bearer` is missing/empty → use static table only.
 * - If `fetchAvailableSpells` returns null (bridge unreachable, empty cache,
 *   or invalid response) → use static table only.
 * - If the dynamic lookup returns confidence='none' → do NOT fall back to static
 *   (the dynamic list is a superset of the static list; no-match means no-match).
 *
 * T-12-03 / T-SP-02: returned `dnd5eId` is ALWAYS from the validated bridge
 * payload or SPELL_LOOKUP — never constructed from caller input.
 *
 * @param transcript - Raw STT transcript (may be full sentence). Empty → 'none'.
 * @param bridgeUrl  - Optional HTTP URL of the EVF bridge.
 * @param bearer     - Optional opaque bearer token for bridge auth.
 * @returns Promise resolving to {@link SpellLookupResult}.
 */
export async function lookupSpellIdFromBridge(
  transcript: string,
  bridgeUrl?: string,
  bearer?: string,
): Promise<SpellLookupResult> {
  const norm = normaliseForFuzzyMatch(transcript);

  if (norm.length === 0) {
    return { dnd5eId: null, confidence: 'none', source: 'no-match' };
  }

  // Attempt dynamic lookup if bridge config is available
  if (bridgeUrl && bridgeUrl.length > 0 && bearer && bearer.length > 0) {
    const dynamicEntries = await fetchAvailableSpells(bridgeUrl, bearer);
    if (dynamicEntries !== null && dynamicEntries.length > 0) {
      return lookupInDynamic(norm, dynamicEntries);
    }
  }

  // Fallback: static SPELL_LOOKUP table (offline / bridge unreachable / empty cache)
  // Import the static lookupSpellId — already imported from spell-lookup.ts
  return staticLookup(norm);
}

// ─── Static fallback (re-uses SPELL_LOOKUP resolution logic inline) ────────────

/** Pre-normalise the static table once (same as spell-lookup.ts NORMALISED). */
const STATIC_NORMALISED = SPELL_LOOKUP.map((e) => ({
  dnd5eId: e.dnd5eId,
  normEn: normaliseForFuzzyMatch(e.en),
  normIt: normaliseForFuzzyMatch(e.it),
}));

/**
 * Static fallback resolver — mirrors `lookupSpellId` from spell-lookup.ts.
 *
 * Operates on the pre-normalised SPELL_LOOKUP table. Called when the dynamic
 * lookup is unavailable (bridge unreachable / cold cache / empty payload).
 *
 * @param norm - Pre-normalised transcript.
 * @returns SpellLookupResult from the static table.
 */
function staticLookup(norm: string): SpellLookupResult {
  // 1. Exact EN match
  for (const entry of STATIC_NORMALISED) {
    if (entry.normEn === norm) {
      return { dnd5eId: entry.dnd5eId, confidence: 'exact', source: 'en-table' };
    }
  }

  // 2. Exact IT match
  for (const entry of STATIC_NORMALISED) {
    if (entry.normIt === norm) {
      return { dnd5eId: entry.dnd5eId, confidence: 'exact', source: 'it-table' };
    }
  }

  // 3. Substring EN match
  for (const entry of STATIC_NORMALISED) {
    if (entry.normEn.length > 0 && containsSpellName(norm, entry.normEn)) {
      return { dnd5eId: entry.dnd5eId, confidence: 'exact', source: 'en-table' };
    }
  }

  // 4. Substring IT match
  for (const entry of STATIC_NORMALISED) {
    if (entry.normIt.length > 0 && containsSpellName(norm, entry.normIt)) {
      return { dnd5eId: entry.dnd5eId, confidence: 'exact', source: 'it-table' };
    }
  }

  // 5. Levenshtein fuzzy match
  let minDist = MAX_FUZZY_DISTANCE + 1;
  const candidates: Array<{ dnd5eId: string; distance: number }> = [];

  for (const entry of STATIC_NORMALISED) {
    const distEn = levenshteinDistance(norm, entry.normEn);
    const distIt = levenshteinDistance(norm, entry.normIt);
    const dist = Math.min(distEn, distIt);

    if (dist > MAX_FUZZY_DISTANCE) continue;

    if (dist < minDist) {
      minDist = dist;
      candidates.length = 0;
      candidates.push({ dnd5eId: entry.dnd5eId, distance: dist });
    } else if (dist === minDist) {
      candidates.push({ dnd5eId: entry.dnd5eId, distance: dist });
    }
  }

  if (candidates.length === 0) {
    return { dnd5eId: null, confidence: 'none', source: 'no-match' };
  }

  if (candidates.length === 1) {
    const [winner] = candidates;
    if (winner === undefined) {
      return { dnd5eId: null, confidence: 'none', source: 'no-match' };
    }
    return {
      dnd5eId: winner.dnd5eId,
      confidence: 'fuzzy',
      source: 'levenshtein',
      distance: winner.distance,
    };
  }

  return { dnd5eId: null, confidence: 'ambiguous', source: 'levenshtein', candidates };
}
