/**
 * entity-lookup-foundry — Dynamic Foundry-derived entity vocabulary resolver.
 *
 * Quick Task 260517-k2g (parallel additive pipeline to spell-lookup-foundry).
 *
 * Fetches the available-entity vocabulary from the bridge's
 * `GET /v1/entities/available` endpoint (populated by entity-pack-reader.ts in
 * the Foundry module). Caches the result for 5 minutes (TTL = 300_000ms).
 * Applies Levenshtein fuzzy matching on both `name` (EN) and `nameLocalized`
 * (locale) columns — same algorithm shape as `lookupSpellIdFromBridge`.
 *
 * ## No offline fallback
 *
 * Unlike spell-pack (which ships a 70-entry SRD subset as a static offline
 * fallback in `spell-lookup.ts`), entity-pack has NO static fallback table.
 * dnd5e content is highly modular — weapons, armours, monsters, vehicles vary
 * by edition, expansion, and homebrew. No canonical SRD list is small enough
 * or stable enough to ship verbatim.
 *
 * When the bridge is unreachable, when the cache is cold, when the bridge URL
 * or bearer are missing, or when the lookup yields no match, this resolver
 * returns `null`. Callers MUST handle `null` gracefully (e.g. surface a "no
 * match" toast to the player; never substitute a guess).
 *
 * ## Return shape
 *
 * Returns {@link EntityLookupResult} with `found: boolean` plus `kind`,
 * `entityType`, `id`, `packId`, `name`, and optional `distance` + `source`.
 * The caller can dispatch on `kind` + `entityType` to the right Foundry
 * action (weapon → weapon-attack tool, npc → set target, consumable → use-item,
 * etc.) without re-querying the compendia.
 *
 * Ambiguity handling: when Levenshtein produces ≥2 tied candidates at the
 * minimum distance, the result is `found: false` with `source: 'levenshtein'`
 * — entity lookups are stricter than spell lookups because a wrong weapon
 * attack can cause real damage on the table. We trade recall for precision.
 *
 * ## Security (T-EP-02)
 *
 * Bearer is sent ONLY in the Authorization header. Response validated with
 * `AvailableEntitiesPayloadSchema.safeParse` before building the lookup map.
 * `id`, `packId`, `kind`, and `entityType` are derived ONLY from the validated
 * payload — never constructed from caller input.
 *
 * ## TTL semantics
 *
 * - Cache is invalidated when `Date.now() - _cacheTime > 300_000` (5 min).
 * - Cold cache (null) → always fetch.
 * - Stale cache → re-fetch; on network failure, returns `null` (soft-fail, no
 *   stale-while-revalidate because we have no fallback for sub-correct data).
 *
 * @see packages/foundry-mcp/src/voice/spell-lookup-foundry.ts (sibling pipeline)
 * @see packages/bridge/src/routes/entities.ts (REST endpoint)
 * @see packages/shared-protocol/src/payloads/entity-pack.ts (AvailableEntitiesPayloadSchema)
 * @see .planning/quick/260517-k2g-il-riconoscimento-degli-incantesimi-deve/260517-k2g-PLAN.md Task 3
 */

import { AvailableEntitiesPayloadSchema } from '@evf/shared-protocol';
import { levenshteinDistance, normaliseForFuzzyMatch } from './levenshtein.js';

// ─── Constants ─────────────────────────────────────────────────────────────────

/** Client-side TTL for the dynamic vocabulary cache (5 minutes). */
export const ENTITY_CACHE_TTL_MS = 300_000;

/** Maximum Levenshtein distance for a fuzzy match to be considered. */
const MAX_FUZZY_DISTANCE = 2;

// ─── Public result shape ──────────────────────────────────────────────────────

/**
 * Source discriminant for {@link EntityLookupResult}.
 *
 * - `'en-table'`    — matched on canonical English name (exact or substring).
 * - `'it-table'`    — matched on localised name (exact or substring).
 * - `'levenshtein'` — fuzzy match within MAX_FUZZY_DISTANCE.
 * - `'no-match'`    — bridge reachable, lookup performed, no candidate found.
 */
export type EntityLookupSource = 'en-table' | 'it-table' | 'levenshtein' | 'no-match';

/**
 * Result returned by {@link lookupEntityFromBridge}.
 *
 * `found` is `true` only when a unique unambiguous match was resolved. The
 * caller dispatches on `kind` + `entityType` to determine the right Foundry
 * action (weapon → weapon-attack tool, npc → set target token, etc.).
 *
 * When `found === false`, all object-property fields are `null` (no partial
 * matches surfaced — callers should never act on an unresolved lookup).
 *
 * Note: this function ALSO returns plain `null` (not an `EntityLookupResult`)
 * when the bridge is unreachable, when bridgeUrl/bearer are missing, or when
 * the transcript is empty — distinguishing "no match" (bridge reachable +
 * empty result set) from "cannot determine" (no bridge access).
 */
export interface EntityLookupResult {
  /** True only when a single unambiguous candidate was resolved. */
  found: boolean;
  /** `'item'` or `'actor'` when found; null when no match. */
  kind: 'item' | 'actor' | null;
  /** dnd5e sub-type ('weapon', 'equipment', 'npc', etc.) when found; null otherwise. */
  entityType: string | null;
  /** Compendium `_id` of the resolved entity; null when no match. */
  id: string | null;
  /** Pack ID of the resolved entity (e.g. 'dnd5e.items'); null when no match. */
  packId: string | null;
  /** Canonical name (English) of the resolved entity; null when no match. */
  name: string | null;
  /** Edit distance when `source === 'levenshtein'`; undefined otherwise. */
  distance?: number;
  /** How the match was resolved. */
  source: EntityLookupSource;
}

// ─── Module-level cache ────────────────────────────────────────────────────────

/** A resolved entry in the dynamic lookup map (internal shape). */
interface DynamicEntry {
  /** Compendium _id (T-EP-02: from validated payload). */
  id: string;
  /** Pack ID (e.g. 'dnd5e.items'). */
  packId: string;
  /** Pack-level discriminator. */
  kind: 'item' | 'actor';
  /** dnd5e sub-type discriminant ('weapon', 'npc', etc.). */
  entityType: string;
  /** Canonical English name (un-normalised). */
  name: string;
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
export function _resetEntityCache(): void {
  _cache = null;
  _cacheTime = 0;
}

// ─── fetchAvailableEntities ────────────────────────────────────────────────────

/**
 * Fetch the available-entities payload from the bridge and build a normalised
 * lookup map. Caches the result for {@link ENTITY_CACHE_TTL_MS} milliseconds.
 *
 * Returns `null` when:
 * - The bridge is unreachable (fetch throws / non-2xx status).
 * - The bridge returns `source: 'empty'` (no push received yet from Foundry module).
 * - The response fails `AvailableEntitiesPayloadSchema.safeParse` validation (T-EP-02).
 *
 * Callers fall back to a `null` `EntityLookupResult` when this returns null —
 * entity-pack has NO offline static fallback.
 *
 * @param bridgeUrl - HTTP URL of the EVF bridge (e.g. `http://localhost:8910`).
 * @param bearer    - Opaque 24h bearer token for bridge auth.
 * @returns Normalised lookup map entries, or `null` on failure.
 */
export async function fetchAvailableEntities(
  bridgeUrl: string,
  bearer: string,
): Promise<DynamicEntry[] | null> {
  const now = Date.now();

  // Cache hit: return cached entries if not stale
  if (_cache !== null && now - _cacheTime <= ENTITY_CACHE_TTL_MS) {
    return _cache;
  }

  try {
    const res = await fetch(`${bridgeUrl}/v1/entities/available`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${bearer}`,
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      // Non-2xx → bridge unreachable or auth failure → return null
      return null;
    }

    const raw = await res.json();

    // T-EP-02: Validate response before building lookup map
    const parsed = AvailableEntitiesPayloadSchema.safeParse(raw);
    if (!parsed.success) {
      return null;
    }

    const payload = parsed.data;

    // Empty source → Foundry module hasn't pushed yet → no fallback available
    if (payload.source === 'empty' || payload.entries.length === 0) {
      return null;
    }

    // Build normalised lookup map from validated payload
    const entries: DynamicEntry[] = payload.entries.map((e) => ({
      id: e.id,
      packId: e.packId,
      kind: e.entityKind,
      entityType: e.entityType,
      name: e.name,
      normEn: normaliseForFuzzyMatch(e.name),
      normLoc: normaliseForFuzzyMatch(e.nameLocalized),
    }));

    // Update module-level cache
    _cache = entries;
    _cacheTime = Date.now();

    return entries;
  } catch {
    // Network error / JSON parse error → null (soft-fail, no static fallback)
    return null;
  }
}

// ─── lookupInDynamic ──────────────────────────────────────────────────────────

/**
 * Resolve a normalised transcript to an EntityLookupResult against the dynamic
 * vocabulary.
 *
 * Resolution order (mirrors spell-lookup-foundry):
 * 1. Exact EN match (transcript === normEn)  → source: 'en-table'
 * 2. Exact locale match (transcript === normLoc) → source: 'it-table'
 * 3. Substring EN match (word-boundary aware) → source: 'en-table'
 * 4. Substring locale match                  → source: 'it-table'
 * 5. Levenshtein ≤ 2 across both columns     → source: 'levenshtein'
 *      - Unique winner   → found: true
 *      - ≥2 tied         → found: false (entity lookup precision-first)
 * 6. No candidate                            → source: 'no-match', found: false
 *
 * @param norm     - Pre-normalised transcript (from `normaliseForFuzzyMatch`).
 * @param entries  - Validated dynamic lookup entries.
 * @returns EntityLookupResult — found/kind/entityType/id/packId/name populated when matched.
 */
function lookupInDynamic(norm: string, entries: DynamicEntry[]): EntityLookupResult {
  // 1. Exact EN match
  for (const entry of entries) {
    if (entry.normEn === norm) {
      return buildHit(entry, 'en-table');
    }
  }

  // 2. Exact locale match
  for (const entry of entries) {
    if (entry.normLoc === norm) {
      return buildHit(entry, 'it-table');
    }
  }

  // 3. Substring EN match (word-boundary aware)
  for (const entry of entries) {
    if (entry.normEn.length > 0 && containsName(norm, entry.normEn)) {
      return buildHit(entry, 'en-table');
    }
  }

  // 4. Substring locale match
  for (const entry of entries) {
    if (entry.normLoc.length > 0 && containsName(norm, entry.normLoc)) {
      return buildHit(entry, 'it-table');
    }
  }

  // 5. Levenshtein fuzzy match
  let minDist = MAX_FUZZY_DISTANCE + 1;
  const candidates: DynamicEntry[] = [];

  for (const entry of entries) {
    const distEn = levenshteinDistance(norm, entry.normEn);
    const distLoc = levenshteinDistance(norm, entry.normLoc);
    const dist = Math.min(distEn, distLoc);

    if (dist > MAX_FUZZY_DISTANCE) continue;

    if (dist < minDist) {
      minDist = dist;
      candidates.length = 0;
      candidates.push(entry);
    } else if (dist === minDist) {
      candidates.push(entry);
    }
  }

  if (candidates.length === 0) {
    return noMatch();
  }

  if (candidates.length === 1) {
    const [winner] = candidates;
    if (winner === undefined) {
      return noMatch();
    }
    return {
      found: true,
      kind: winner.kind,
      entityType: winner.entityType,
      id: winner.id,
      packId: winner.packId,
      name: winner.name,
      distance: minDist,
      source: 'levenshtein',
    };
  }

  // Ambiguous (≥2 tied) → entity lookups are precision-first; surface as no-match.
  // Preserves source='levenshtein' so the caller can distinguish "I tried fuzzy and
  // it was ambiguous" from "exact comparisons all failed".
  return {
    found: false,
    kind: null,
    entityType: null,
    id: null,
    packId: null,
    name: null,
    source: 'levenshtein',
  };
}

/** Build a "hit" result from a DynamicEntry + source label. */
function buildHit(entry: DynamicEntry, source: EntityLookupSource): EntityLookupResult {
  return {
    found: true,
    kind: entry.kind,
    entityType: entry.entityType,
    id: entry.id,
    packId: entry.packId,
    name: entry.name,
    source,
  };
}

/** Build a no-match result. */
function noMatch(): EntityLookupResult {
  return {
    found: false,
    kind: null,
    entityType: null,
    id: null,
    packId: null,
    name: null,
    source: 'no-match',
  };
}

/**
 * Word-boundary-aware name containment check (mirrors spell-lookup-foundry).
 *
 * The entity name must be preceded and followed by a non-alphanumeric character
 * (or string boundary). Defined inline (not imported from spell-lookup-foundry)
 * to preserve the additive parallel principle — entity-pack must be removable
 * as a single unit without touching the spell-pack pipeline.
 *
 * @param transcript - Normalised full transcript.
 * @param entityName - Normalised entity name from the lookup table.
 * @returns True if the entity name appears as a word-boundary substring.
 */
function containsName(transcript: string, entityName: string): boolean {
  const idx = transcript.indexOf(entityName);
  if (idx === -1) return false;
  const before = idx === 0 ? '' : transcript[idx - 1];
  const after = transcript[idx + entityName.length];
  const beforeOk = before === '' || before === undefined || !/[a-z0-9]/.test(before);
  const afterOk = after === undefined || !/[a-z0-9]/.test(after);
  return beforeOk && afterOk;
}

// ─── lookupEntityFromBridge ───────────────────────────────────────────────────

/**
 * Resolve a voice transcript to a dnd5e entity using the bridge-derived
 * dynamic vocabulary.
 *
 * Returns `null` (not an `EntityLookupResult`) when:
 * - The transcript is empty after normalisation.
 * - `bridgeUrl` or `bearer` is missing/empty (no offline fallback).
 * - The bridge fetch fails or returns `source: 'empty'`.
 *
 * Returns an `EntityLookupResult` with `found: false` when the bridge is
 * reachable + payload was retrieved + no candidate matched. This distinction
 * lets callers tell "I tried and there is no such entity" (returns object)
 * apart from "I couldn't even try" (returns null).
 *
 * T-EP-02: returned `id`, `packId`, `kind`, `entityType`, and `name` are
 * ALWAYS from the validated bridge payload — never constructed from caller input.
 *
 * @param transcript - Raw STT transcript (may be full sentence). Empty → null.
 * @param bridgeUrl  - Optional HTTP URL of the EVF bridge.
 * @param bearer     - Optional opaque bearer token for bridge auth.
 * @returns Promise resolving to {@link EntityLookupResult} or `null`.
 */
export async function lookupEntityFromBridge(
  transcript: string,
  bridgeUrl?: string,
  bearer?: string,
): Promise<EntityLookupResult | null> {
  const norm = normaliseForFuzzyMatch(transcript);

  if (norm.length === 0) {
    return null;
  }

  if (!bridgeUrl || bridgeUrl.length === 0 || !bearer || bearer.length === 0) {
    return null;
  }

  const entries = await fetchAvailableEntities(bridgeUrl, bearer);
  if (entries === null || entries.length === 0) {
    return null;
  }

  return lookupInDynamic(norm, entries);
}
