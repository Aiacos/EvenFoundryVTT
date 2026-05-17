/**
 * SPELL_KEYTERMS — canonical SRD spell vocabulary subset for Deepgram Keyterm
 * Prompting (Phase 15 VOICE-07 + VOICE-08).
 *
 * Lives in `@evf/shared-protocol` so the bridge can consume it without taking
 * a runtime dependency on `@evf/foundry-mcp` (foundry-mcp is the MCP server
 * package; the bridge is the Fastify service). This is data, not logic — its
 * placement in the shared package follows the same pattern as the payload
 * Zod schemas.
 *
 * ## Content
 *
 * 70 (it,en) tuples derived 1:1 from `@evf/foundry-mcp/voice` SPELL_LOOKUP
 * (cantrips → L1 → L2 → L3, ending with mass-cure-wounds). The `dnd5eId` and
 * `level` columns are NOT carried over — they are not relevant to Deepgram
 * keyterm prompting (which only needs the surface forms STT must recognise).
 *
 * ## Drift gate
 *
 * `spell-keyterms.test.ts` SKT-02 imports `SPELL_LOOKUP` via a test-only
 * relative path (`../../../foundry-mcp/src/voice/spell-lookup.js`) and
 * asserts bidirectional 1:1 mapping on `(it, en)`. Drift between the two
 * tables fails the build. Production code in this file MUST NOT import from
 * `@evf/foundry-mcp`.
 *
 * ## Why static + winning on conflict
 *
 * The 70-entry SRD subset gives Deepgram Nova-3 Multilingual a +625% recall
 * lift on esoteric spell names (per Deepgram learn article, RESEARCH.md §1).
 * When merged with the dynamic Foundry-derived entity-pack vocabulary, the
 * static spell entries win on lower-cased-key conflict (CONTEXT D-01: protects
 * SRD authoritative casing/spelling) and are never truncated (CONTEXT D-04:
 * dynamic entity-pack entries are dropped first when the cap is hit, so the
 * SRD recall floor is preserved even on huge homebrew worlds).
 *
 * @see packages/foundry-mcp/src/voice/spell-lookup.ts (canonical 70-entry source-of-truth)
 * @see packages/bridge/src/voice/keyterm-merger.ts (consumer)
 * @see .planning/phases/EVF-15-deepgram-keyterm-prompting-entity-pack-integration/15-CONTEXT.md
 * @see .planning/quick/20260517-voice-intent-research/RESEARCH.md §2 Option C
 */

/** Single (it,en) keyterm pair fed to Deepgram Keyterm Prompting. */
export interface SpellKeytermEntry {
  /** Italian surface form (lower-case, no accents stripped — Nova-3 handles them). */
  it: string;
  /** English canonical surface form (lower-case, dnd5e SRD spelling). */
  en: string;
}

/**
 * 70-entry SRD spell keyterm catalogue.
 *
 * Order matches `SPELL_LOOKUP` in @evf/foundry-mcp/voice for diff-reviewability:
 * cantrips (level 0, 20 entries) → L1 (30) → L2 (14) → L3 (5) → mass-cure-wounds (1).
 *
 * Frozen at module load via {@link Object.freeze} (SKT-03). The drift gate
 * (SKT-02) asserts bidirectional 1:1 mapping against SPELL_LOOKUP — adding,
 * removing, or renaming an entry without touching SPELL_LOOKUP fails the test.
 */
export const SPELL_KEYTERMS: ReadonlyArray<SpellKeytermEntry> = Object.freeze([
  // ─── Cantrips (level 0) — 20 entries ──────────────────────────────────────
  { it: 'schizzo acido', en: 'acid splash' },
  { it: 'tocco di gelo', en: 'chill touch' },
  { it: 'luci danzanti', en: 'dancing lights' },
  { it: 'esplosione occulta', en: 'eldritch blast' },
  { it: 'dardo di fuoco', en: 'fire bolt' },
  { it: 'consiglio', en: 'guidance' },
  { it: 'luce', en: 'light' },
  { it: 'mani magiche', en: 'mage hand' },
  { it: 'riparazione', en: 'mending' },
  { it: 'messaggio', en: 'message' },
  { it: 'piccola illusione', en: 'minor illusion' },
  { it: 'spruzzo di veleno', en: 'poison spray' },
  { it: 'prestidigitazione', en: 'prestidigitation' },
  { it: 'produrre fiamma', en: 'produce flame' },
  { it: 'raggio di gelo', en: 'ray of frost' },
  { it: 'resistenza', en: 'resistance' },
  { it: 'fiamma sacra', en: 'sacred flame' },
  { it: 'stretta folgorante', en: 'shocking grasp' },
  { it: 'colpo infallibile', en: 'true strike' },
  { it: 'scherno feroce', en: 'vicious mockery' },

  // ─── L1 — 30 entries ──────────────────────────────────────────────────────
  { it: 'assorbire elementi', en: 'absorb elements' },
  { it: 'benedizione', en: 'bless' },
  { it: 'mani brucianti', en: 'burning hands' },
  { it: 'ammaliare persone', en: 'charm person' },
  { it: 'ventaglio di colori', en: 'color spray' },
  { it: 'comando', en: 'command' },
  { it: 'cura ferite', en: 'cure wounds' },
  { it: 'individuare magia', en: 'detect magic' },
  { it: 'travestimento', en: 'disguise self' },
  { it: 'ritirata rapida', en: 'expeditious retreat' },
  { it: 'fuoco fatuo', en: 'faerie fire' },
  { it: 'vita illusoria', en: 'false life' },
  { it: 'caduta lenta', en: 'feather fall' },
  { it: 'nube di nebbia', en: 'fog cloud' },
  { it: 'dardo guida', en: 'guiding bolt' },
  { it: 'parola di cura', en: 'healing word' },
  { it: 'rimprovero infernale', en: 'hellish rebuke' },
  { it: 'maleficio', en: 'hex' },
  { it: 'identificare', en: 'identify' },
  { it: 'salto', en: 'jump' },
  { it: 'armatura di mago', en: 'mage armor' },
  { it: 'dardo incantato', en: 'magic missile' },
  { it: 'santuario', en: 'sanctuary' },
  { it: 'scudo', en: 'shield' },
  { it: 'sonno', en: 'sleep' },
  { it: 'onda di tuono', en: 'thunderwave' },
  { it: 'fulmine stregonesco', en: 'witch bolt' },
  { it: 'sfera cromatica', en: 'chromatic orb' },
  { it: 'trovare famiglio', en: 'find familiar' },
  { it: 'grasso', en: 'grease' },

  // ─── L2 — 14 entries ──────────────────────────────────────────────────────
  { it: 'aiuto', en: 'aid' },
  { it: 'cecità sordità', en: 'blindness deafness' },
  { it: 'sfocatura', en: 'blur' },
  { it: 'oscurità', en: 'darkness' },
  { it: 'tenere persone', en: 'hold person' },
  { it: 'invisibilità', en: 'invisibility' },
  { it: 'aprire', en: 'knock' },
  { it: 'restaurazione inferiore', en: 'lesser restoration' },
  { it: 'immagine speculare', en: 'mirror image' },
  { it: 'passo nebbioso', en: 'misty step' },
  { it: 'raggio rovente', en: 'scorching ray' },
  { it: 'vedere invisibile', en: 'see invisibility' },
  { it: 'arrampicarsi', en: 'spider climb' },
  { it: 'tela di ragno', en: 'web' },

  // ─── L3 — 5 entries ───────────────────────────────────────────────────────
  { it: 'contromagia', en: 'counterspell' },
  { it: 'dissolvi magie', en: 'dispel magic' },
  { it: 'palla di fuoco', en: 'fireball' },
  { it: 'volare', en: 'fly' },
  { it: 'velocità', en: 'haste' },

  // ─── L5 — 1 entry (preserves SPELL_LOOKUP ordering) ───────────────────────
  { it: 'cura ferite di massa', en: 'mass cure wounds' },
]);
