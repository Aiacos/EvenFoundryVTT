---
type: implementation
date: 2026-05-17
slug: spell-lookup-foundry-derived
related-phase: 12
---

# Quick Task: Spell lookup Foundry-derived

Sostituire `spell-lookup.ts` hand-curated (70 voci) con vocabolario Foundry-derivato auto-aggiornante. Mantiene il fuzzy match (Levenshtein) ma su lista dinamica completa da `game.packs.get('dnd5e.spells').index` + pack di espansione attivi.

## Architettura (push-based, NON incrementa socketlib count)

```
[Foundry game.packs] ──┐
                       │ Hooks: init / updateCompendium / setup
                       ▼
[foundry-module: spell-pack-reader.ts]
                       │ readAvailableSpells() emette envelope
                       ▼
[r1.spells.available envelope] ──→ [bridge cache singleton]
                                          │ REST /v1/spells/available
                                          ▼
                          [foundry-mcp: spell-lookup-foundry.ts]
                                  ↑ fetchAvailableSpells() + 5min TTL
                                  └── fuzzy Levenshtein on dynamic list
```

**Decisione architetturale chiave:** push-based emit (module → bridge cache) invece di socketlib pull. Mantiene `registerComplexHandler` count = **17** (invariant da Phase 13).

## Files

### NEW
- `packages/shared-protocol/src/payloads/spell-pack.ts` — `SpellPackEntrySchema` + `AvailableSpellsPayloadSchema` + `R1_SPELLS_AVAILABLE_TYPE`
- `packages/foundry-module/src/readers/spell-pack-reader.ts` — `readAvailableSpells()` + emit on init/updateCompendium hooks
- `packages/bridge/src/routes/spells.ts` — REST GET `/v1/spells/available` from cache
- `packages/bridge/src/cache/spell-pack-cache.ts` — in-memory cache populated by WS receiver
- `packages/bridge/src/ws/spell-pack-handler.ts` — WS message listener that updates cache from `r1.spells.available` envelopes
- `packages/foundry-mcp/src/voice/spell-lookup-foundry.ts` — `fetchAvailableSpells(bridgeUrl, bearer)` + 5-min TTL + Levenshtein resolver
- `packages/foundry-mcp/src/voice/__tests__/spell-lookup-foundry.test.ts` — unit tests for fetch + fuzzy + TTL eviction

### MODIFIED
- `packages/foundry-mcp/src/voice/spell-lookup.ts` — re-export `lookupSpellId` from `spell-lookup-foundry.ts` (backward compat); SPELL_LOOKUP const becomes the offline fallback bundle (SRD subset)
- `packages/foundry-mcp/src/voice/__tests__/spell-lookup.test.ts` — keep existing tests (they validate the offline fallback path)
- `packages/foundry-module/src/index.ts` — wire `spell-pack-reader` to `Hooks.on('init')` + `Hooks.on('updateCompendium')`
- `packages/bridge/src/server.ts` — register new `/v1/spells/available` route + WS spell-pack-handler
- `packages/foundry-module/src/types/foundry-globals.d.ts` — extend `Game.packs` typing with `get(id): CompendiumCollection | undefined` + `CompendiumCollection.index: Collection<{ _id, name, type, img }>`

## Tasks

### Task 1: Schema + module reader + push emit
- `SpellPackEntrySchema` (id, packId, name, nameLocalized, level, school)
- `AvailableSpellsPayloadSchema` (entries[], source: 'foundry-packs', count, generatedAt)
- Add `R1_SPELLS_AVAILABLE_TYPE = 'r1.spells.available'` to shared-protocol
- `spell-pack-reader.ts`: iterate `game.packs`, filter `metadata.type === 'Item' && metadata.system === 'dnd5e'`, scan `.index` for `entry.type === 'spell'`, map to schema. Locale via `game.i18n.localize(entry.name)`.
- Hooks: `init` (emit at boot) + `updateCompendium` (re-emit on pack content change). Debounce 500ms.
- Tests: real-pack mock returning 3 packs (Core SRD + Tasha's + 1 homebrew) — verify 3-pack aggregation + de-duplication by `_id`.

### Task 2: Bridge cache + REST endpoint + WS listener
- `spell-pack-cache.ts`: singleton `Map<sessionId, AvailableSpellsPayload>` (or world-scoped). Last-write-wins.
- `spell-pack-handler.ts`: WS message listener for `r1.spells.available` envelopes. Validates via `AvailableSpellsPayloadSchema.safeParse`. Updates cache.
- `routes/spells.ts`: `GET /v1/spells/available` — returns cached payload or `{ entries: [], source: 'empty', count: 0 }` if cache cold. Bearer auth same as Phase 7 tool endpoints.
- Wire into `server.ts`.
- Tests: WS receive → cache populated → REST returns cached. Cold cache → empty response.

### Task 3: foundry-mcp consumer + tests + fallback
- `spell-lookup-foundry.ts`: `fetchAvailableSpells(bridgeUrl, bearer): Promise<SpellLookup>` — GET /v1/spells/available, validates response, builds lookup map keyed by both `name` + `nameLocalized`, 5-min TTL in module-scoped cache.
- `lookupSpellId(transcript, locale, bridgeUrl?, bearer?)` — async signature change. If bridgeUrl missing OR fetch fails, fall back to existing static SPELL_LOOKUP (70-entry SRD subset).
- Levenshtein fuzzy preserved (distance ≤ 2) — applied to BOTH name + nameLocalized columns of the dynamic list.
- Update register-tools.ts call sites to pass bridgeUrl from env (PHASE 11 already has BRIDGE_URL env var).
- Tests: (a) fetch happy-path returns dynamic list, (b) fetch fail → fallback to SPELL_LOOKUP, (c) Levenshtein on Italian name (palla di fuocoo with double-o), (d) 5-min TTL eviction.

## Verify
- `pnpm --filter @evf/shared-protocol test` ✓
- `pnpm --filter @evf/foundry-module test spell-pack-reader` ✓
- `pnpm --filter @evf/bridge test spells` ✓
- `pnpm --filter @evf/foundry-mcp test spell-lookup` ✓
- `pnpm typecheck && pnpm lint:ci && pnpm test` workspace gate green
- `socketlib registerComplexHandler` count grep = **17** (invariant preserved)
- CI Gate 8 unchanged (no `activity.use(` in g2-app/bridge)

## Threat model
- **T-SP-01:** Untrusted pack content. Mitigated: `entry.name` and locale strings are passed verbatim to `getLabel`-equivalent — no eval, no shell, no template injection.
- **T-SP-02:** Cache poisoning via spurious WS envelope. Mitigated: Phase 7 bearer auth on WS + `AvailableSpellsPayloadSchema.safeParse`.
- **T-SP-03:** Stale cache after pack uninstall. Mitigated: `updateCompendium` hook re-emit (entries removed from new payload, cache last-write-wins).

## Done criteria
1. `pnpm test` workspace green.
2. socketlib count = 17 (invariant).
3. CI Gate 8 green.
4. `lookupSpellId('palla di fuoco', 'it')` returns `'fireball'` via dynamic path when bridge is reachable.
5. `lookupSpellId('palla di fuoco', 'it')` returns `'fireball'` via static fallback when bridge is unreachable.
6. STATE.md "Quick Tasks Completed" row appended.
