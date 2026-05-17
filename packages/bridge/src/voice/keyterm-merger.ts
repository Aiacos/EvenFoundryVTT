/**
 * keyterm-merger — pure function that builds the Deepgram Nova-3 Multilingual
 * `keyterm` list for a session.
 *
 * Phase 15 Plan 01 Task 2. Zero SDK dependencies, zero side effects, zero I/O.
 * The downstream wiring plan (15-02) consumes `buildKeytermList()` as a black
 * box and appends each entry as a `keyterm=…` URL query parameter on the
 * Deepgram session URL.
 *
 * ## Inputs
 *
 * 1. `staticSpells` — frozen vocab from `@evf/shared-protocol`'s SPELL_KEYTERMS
 *    (70 SRD entries, IT + EN, drift-proofed against `@evf/foundry-mcp`'s
 *    SPELL_LOOKUP via the SKT-02 test gate).
 * 2. `entitySnapshot` — latest `AvailableEntitiesPayload` from
 *    `EntityPackCache.get()`. `null` is accepted (cold cache, Foundry unpaired
 *    or no `r1.entities.available` push received yet). Empty `entries` array
 *    or `source: 'empty'` are treated equivalently to `null`.
 *
 * ## Algorithm
 *
 * 1. Iterate staticSpells in array order. For each, push `.en` THEN `.it`.
 *    EN-first because the dnd5e canonical SRD form is English; Italian is the
 *    code-switch hedge (Nova-3 Multilingual handles intra-phrase code-switch).
 *    Skip empty/whitespace candidates. Dedupe by lower-cased trimmed key.
 *    Stop pushing if the cap is hit.
 * 2. Iterate entitySnapshot?.entries in array order (snapshot may be null/
 *    empty/source='empty' — all three uniformly resolve to "no entries").
 *    For each entry push `.name` THEN `.nameLocalized` with the same dedupe/
 *    filter/cap discipline.
 *
 * ## Guarantees
 *
 * - **VOICE-07** Union of static + dynamic vocabularies.
 * - **VOICE-08** Locale-aware: BOTH IT and EN locales fed to a single Deepgram
 *   session. Nova-3 Multilingual handles intra-phrase code-switch like
 *   `"casta fireball"` (IT verb + EN spell name).
 * - **CONTEXT D-01 static-wins-on-conflict.** Since static spells are
 *   inserted first, any entity-pack candidate whose lower-cased-trimmed key
 *   matches a static entry is dropped by the dedupe Set. This protects SRD
 *   authoritative casing/spelling and yields the +625% recall lift cited in
 *   `.planning/quick/20260517-voice-intent-research/RESEARCH.md §1 Sources`
 *   (Deepgram learn article).
 * - **CONTEXT D-04 truncate-dynamic-first.** Because the static loop runs
 *   before the entity-pack loop, entity-pack entries are dropped first when
 *   the cap is hit. The SRD recall floor is preserved even on huge homebrew
 *   compendia. Static spell entries are NEVER dropped (test KM-09 exercises
 *   the static-exceeds-limit edge case).
 *
 * ## Cap
 *
 * `DEEPGRAM_KEYTERM_LIMIT = 100` per Deepgram's documented keyterm cap (see
 * RESEARCH.md §1 Sources, Deepgram learn article). Beyond this, Deepgram
 * either rejects the request or silently truncates — neither is acceptable
 * (we want deterministic local truncation with explicit static-wins policy).
 *
 * ## What this module does NOT do
 *
 * - No URL-encoding (deferred to plan 15-02 adapter).
 * - No Deepgram SDK call (deferred to plan 15-02 wiring).
 * - No cache subscription / debounce / mutex (deferred to plan 15-03 refresh).
 * - No retry / sanitization on Deepgram rejection (deferred to plan 15-04 failure modes).
 *
 * @see packages/shared-protocol/src/voice/spell-keyterms.ts (static input)
 * @see packages/bridge/src/cache/entity-pack-cache.ts (dynamic input source)
 * @see .planning/quick/20260517-voice-intent-research/RESEARCH.md §2 Option C
 * @see .planning/phases/EVF-15-deepgram-keyterm-prompting-entity-pack-integration/15-CONTEXT.md
 */

import type { AvailableEntitiesPayload, SpellKeytermEntry } from '@evf/shared-protocol';

/**
 * Deepgram-documented hard cap on the number of `keyterm` query parameters
 * per session request. Source: Deepgram learn article (RESEARCH.md §1).
 *
 * Beyond this, Deepgram either rejects the request or silently truncates —
 * neither acceptable. We truncate locally with deterministic static-wins
 * policy (CONTEXT D-04).
 */
export const DEEPGRAM_KEYTERM_LIMIT = 100 as const;

/**
 * Optional knobs for {@link buildKeytermList}.
 *
 * - `limitOverride` — test-only escape hatch. When set, replaces
 *   {@link DEEPGRAM_KEYTERM_LIMIT}. Used by KM-07..09 to exercise overflow
 *   without inflating the static fixture. **Production callers should NOT
 *   pass this.**
 */
export interface BuildKeytermListOpts {
  /** Test-only: override the production cap. Defaults to DEEPGRAM_KEYTERM_LIMIT. */
  limitOverride?: number;
}

/**
 * Build the deduplicated, capped, locale-merged keyterm list for a Deepgram
 * Nova-3 Multilingual session.
 *
 * @param staticSpells - Frozen SRD spell vocab (e.g. SPELL_KEYTERMS from
 *   @evf/shared-protocol). MUST be array-stable across calls in production.
 * @param entitySnapshot - Latest AvailableEntitiesPayload from the entity-pack
 *   cache, or `null` when the cache is cold. Treated uniformly with empty
 *   `entries[]` and `source: 'empty'`.
 * @param opts - Optional knobs (test-only `limitOverride`).
 * @returns Fresh mutable `string[]` — caller may join/encode/serialize freely.
 *   Never frozen; never null; may be empty.
 */
export function buildKeytermList(
  staticSpells: ReadonlyArray<SpellKeytermEntry>,
  entitySnapshot: AvailableEntitiesPayload | null,
  opts?: BuildKeytermListOpts,
): string[] {
  const limit = opts?.limitOverride ?? DEEPGRAM_KEYTERM_LIMIT;

  // Dedupe key = lower-cased trimmed candidate. The Set never contains the
  // candidate strings themselves — only their normalised keys. The output
  // array preserves the insertion-order candidates verbatim.
  const seen = new Set<string>();
  const out: string[] = [];

  /**
   * Push a candidate string into the output if:
   *   1. Not empty/whitespace-only after trim (KM-06).
   *   2. Not already seen by its lower-cased trimmed key (dedupe; KM-04).
   *   3. Output not yet at the cap.
   *
   * Returns `false` once the cap is reached so the caller's outer loop can
   * short-circuit.
   */
  function tryPush(candidate: string): boolean {
    if (out.length >= limit) return false;
    const trimmed = candidate.trim();
    if (trimmed.length === 0) return true; // skip + continue (not a cap-hit)
    const key = trimmed.toLowerCase();
    if (seen.has(key)) return true; // dedupe + continue
    seen.add(key);
    out.push(candidate);
    return out.length < limit;
  }

  // 1. Static spells — EN first then IT (canonical-first per VOICE-08).
  for (const spell of staticSpells) {
    if (!tryPush(spell.en)) break;
    if (!tryPush(spell.it)) break;
  }

  // 2. Dynamic entity-pack entries — name then nameLocalized.
  //    Null snapshot / empty entries[] / source='empty' all uniformly resolve
  //    to no-op (KM-11 + KM-12). Caller already validated payload shape via
  //    AvailableEntitiesPayloadSchema upstream (T-EP-02).
  const entries = entitySnapshot?.entries ?? [];
  for (const entry of entries) {
    if (!tryPush(entry.name)) break;
    if (!tryPush(entry.nameLocalized)) break;
  }

  return out;
}
