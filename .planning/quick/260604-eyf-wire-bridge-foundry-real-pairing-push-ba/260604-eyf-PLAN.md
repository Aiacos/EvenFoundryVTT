---
phase: quick-260604-eyf
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/shared-protocol/src/payloads/bearer-registry.ts
  - packages/shared-protocol/src/payloads/bearer-registry.test.ts
  - packages/shared-protocol/src/payloads/character-list.ts
  - packages/shared-protocol/src/payloads/character-list.test.ts
  - packages/shared-protocol/src/index.ts
  - packages/foundry-module/src/readers/bearer-registry-reader.ts
  - packages/foundry-module/src/readers/bearer-registry-reader.test.ts
  - packages/foundry-module/src/readers/character-list-reader.ts
  - packages/foundry-module/src/readers/character-list-reader.test.ts
  - packages/foundry-module/src/module.ts
  - packages/bridge/src/cache/bearer-registry-cache.ts
  - packages/bridge/src/cache/bearer-registry-cache.test.ts
  - packages/bridge/src/cache/character-list-cache.ts
  - packages/bridge/src/cache/character-list-cache.test.ts
  - packages/bridge/src/ws/bearer-registry-handler.ts
  - packages/bridge/src/ws/bearer-registry-handler.test.ts
  - packages/bridge/src/ws/character-list-handler.ts
  - packages/bridge/src/ws/character-list-handler.test.ts
  - packages/bridge/src/server.ts
  - packages/bridge/src/server.test.ts
  - .changeset/real-foundry-pairing-push.md
autonomous: true
requirements: [PAIR-REAL]

must_haves:
  truths:
    - "A real bearer token issued by a live Foundry module validates at GET /v1/health (valid/expired/unknown distinguished from foundry_unreachable)."
    - "GET /v1/characters returns the real player-character roster pushed by the Foundry module."
    - "buildServer({}) (production, no opts) wires real token validation + character list from the new push caches with NO change to index.ts."
    - "socketlib registerComplexHandler count stays exactly 17 (no new handler — push via existing /internal/delta)."
  artifacts:
    - path: packages/shared-protocol/src/payloads/bearer-registry.ts
      provides: "BearerRegistrySnapshotSchema + R1_BEARERS_AVAILABLE_TYPE"
      contains: "r1.bearers.available"
    - path: packages/shared-protocol/src/payloads/character-list.ts
      provides: "CharacterListSnapshotSchema + R1_CHARACTERS_AVAILABLE_TYPE"
      contains: "r1.characters.available"
    - path: packages/foundry-module/src/readers/bearer-registry-reader.ts
      provides: "readBearerRegistry() + registerBearerRegistryReader(emit)"
    - path: packages/foundry-module/src/readers/character-list-reader.ts
      provides: "readCharacterList() + registerCharacterListReader(emit)"
    - path: packages/bridge/src/cache/bearer-registry-cache.ts
      provides: "BearerRegistryCache (last-write-wins, never-pushed = null)"
    - path: packages/bridge/src/cache/character-list-cache.ts
      provides: "CharacterListCache (last-write-wins)"
    - path: packages/bridge/src/ws/bearer-registry-handler.ts
      provides: "handleBearerRegistryEnvelope (zod-validate before set)"
    - path: packages/bridge/src/ws/character-list-handler.ts
      provides: "handleCharacterListEnvelope (zod-validate before set)"
  key_links:
    - from: packages/foundry-module/src/module.ts
      to: "${bridgeUrl}/internal/delta"
      via: "bridgeDeltaEmitter(R1_BEARERS_AVAILABLE_TYPE, payload) + bridgeDeltaEmitter(R1_CHARACTERS_AVAILABLE_TYPE, payload)"
      pattern: "register(BearerRegistry|CharacterList)Reader"
    - from: packages/bridge/src/server.ts
      to: BearerRegistryCache
      via: "internal foundryValidateFn built from cache (opts.foundryValidateFn still overrides)"
      pattern: "opts.foundryValidateFn \\?\\?"
    - from: packages/bridge/src/server.ts
      to: CharacterListCache
      via: "GET /v1/characters served from cache (opts.foundrySnapshotFn still overrides)"
      pattern: "registerInternalDeltaRoute"
---

<objective>
Wire the missing bridge↔Foundry query path (push-based) so REAL bearer-token validation and player-character listing work against a live Foundry — enabling real pairing.

Problem (verified by orchestrator): production bridge runs `buildServer({})`. With no opts injected, `foundryValidateFn` defaults to a stub that returns `foundry_unreachable`, and `/v1/characters` calls a `foundrySnapshotFn` that defaults to `null`. The bridge has NO socket client back to Foundry; the module only PUSHes via `POST /internal/delta`. Result: `GET /v1/health` and `GET /v1/characters` 503 for any real token → real pairing is impossible.

Fix: extend the EXISTING push→cache→serve pattern (already proven for `r1.spells.available` and `r1.entities.available`) to two new envelopes — `r1.bearers.available` (the non-revoked bearer registry) and `r1.characters.available` (the player-character roster). The bridge builds its internal `foundryValidateFn` from `BearerRegistryCache` and serves `/v1/characters` from `CharacterListCache`. No new socketlib handler (Gate 8 = 17), no `index.ts` change.

Purpose: real pairing against a live Foundry world.
Output: 2 shared-protocol schemas, 2 foundry-module readers + module push wiring, 2 bridge caches + handlers + server wiring, tests, changeset.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md

# Schema templates (mirror naming/JSDoc/source-enum style exactly)
@packages/shared-protocol/src/payloads/spell-pack.ts
@packages/shared-protocol/src/payloads/entity-pack.ts
@packages/shared-protocol/src/index.ts

# Cache + handler templates
@packages/bridge/src/cache/spell-pack-cache.ts
@packages/bridge/src/ws/spell-pack-handler.ts
@packages/bridge/src/ws/entity-pack-handler.ts

# Route to rewire + server wiring (caches created + multiplexed onDelta + TokenCache + foundryFn)
@packages/bridge/src/routes/characters-list.ts
@packages/bridge/src/routes/spells.ts
@packages/bridge/src/auth/token-cache.ts
@packages/bridge/src/index.ts

# Reader template + module push wiring + bearer registry source + characters logic to reuse
@packages/foundry-module/src/readers/spell-pack-reader.ts
@packages/foundry-module/src/module.ts
@packages/foundry-module/src/pair/bearer-registry.ts
@packages/foundry-module/src/pair/socketlib-handlers.ts

# Notes confirmed from source (executor: do NOT re-derive these)
# - server.ts wiring lives ~lines 313-418: TokenCache(opts.foundryValidateFn,...),
#   foundryFn = opts.foundrySnapshotFn ?? (async ()=>null), registerCharactersListRoute(app, tokenCache, foundryFn),
#   spellCache/entityCache created with opts.X ?? new XCache(), multiplexed in registerInternalDeltaRoute onDelta callback.
# - ValidateTokenResult (token-cache.ts): { valid; entry?:{alias;expiresAt;worldId}; reason?: 'unknown_token'|'revoked'|'expired'|'foundry_unreachable' }.
# - BearerEntry (bearer-registry.ts): { alias; worldId; expiresAt; revokedAt: number|null; ... }; listBearers() = non-revoked, newest-first (includes expired).
# - listPlayerCharacters(): Array<{ actorId; name; level }> (character-reader.ts) — exactly the CharacterList shape.
# - module.ts: bridgeDeltaEmitter(type, payload) fire-and-forget POST to ${bridgeUrl}/internal/delta; readers wired in Hooks.once('init') (spell/entity) and hook subscribers in Hooks.once('ready').
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: shared-protocol — bearer-registry + character-list push schemas</name>
  <files>packages/shared-protocol/src/payloads/bearer-registry.ts, packages/shared-protocol/src/payloads/bearer-registry.test.ts, packages/shared-protocol/src/payloads/character-list.ts, packages/shared-protocol/src/payloads/character-list.test.ts, packages/shared-protocol/src/index.ts</files>
  <behavior>
    - R1_BEARERS_AVAILABLE_TYPE === 'r1.bearers.available'; R1_CHARACTERS_AVAILABLE_TYPE === 'r1.characters.available'.
    - BearerRegistrySnapshotSchema.parse accepts { bearers: [{ token, alias, expiresAt, worldId }], source, count, generatedAt } where token/alias/worldId are non-empty strings, expiresAt/count/generatedAt are non-negative ints; source enum ['foundry-registry','empty'].
    - BearerRegistrySnapshotSchema rejects: missing token, non-int expiresAt, source not in enum.
    - CharacterListSnapshotSchema.parse accepts { characters: [{ actorId, name, level }], source, count, generatedAt } with actorId/name non-empty, level int 1..20; source enum ['foundry-world','empty']. Rejects level 0 and level 21.
  </behavior>
  <action>
    Create `bearer-registry.ts` mirroring `spell-pack.ts`/`entity-pack.ts` structure EXACTLY (file-level JSDoc, type constant, entry schema, payload schema, inferred types). Define `R1_BEARERS_AVAILABLE_TYPE = 'r1.bearers.available' as const`. Define `BearerRegistryEntrySchema = z.object({ token: z.string().min(1), alias: z.string().min(1), expiresAt: z.number().int().min(0), worldId: z.string().min(1) })`. Define `BearerRegistrySnapshotSchema = z.object({ bearers: z.array(BearerRegistryEntrySchema), source: z.enum(['foundry-registry','empty']), count: z.number().int().min(0), generatedAt: z.number().int().min(0) })`. Export inferred `BearerRegistrySnapshot` + `BearerRegistryEntry`. Match the `source`/`count`/`generatedAt` convention used by the two existing payloads (cold-cache uses `source:'empty'`, count 0, generatedAt 0).
    Create `character-list.ts` the same way: `R1_CHARACTERS_AVAILABLE_TYPE = 'r1.characters.available' as const`; `CharacterListEntrySchema = z.object({ actorId: z.string().min(1), name: z.string().min(1), level: z.number().int().min(1).max(20) })` (reuse the bounds already used in routes/characters-list.ts CharacterListEntrySchema); `CharacterListSnapshotSchema = z.object({ characters: z.array(CharacterListEntrySchema), source: z.enum(['foundry-world','empty']), count: z.number().int().min(0), generatedAt: z.number().int().min(0) })`; export inferred types.
    Add JSDoc on every exported schema/type/constant (INV-4 public-API rule). Reference the push trust model briefly (bearer tokens carried over EVF_INTERNAL_SECRET-gated /internal/delta) in the file-level JSDoc of bearer-registry.ts.
    Append two export blocks to `index.ts` mirroring the existing spell-pack/entity-pack export blocks (same comment-banner style), exporting the schemas, inferred types, and the two type constants.
    Write `.test.ts` for each schema covering the accept/reject cases in <behavior> (mirror `spell-pack.test.ts`/`entity-pack.test.ts` structure incl. the `R1_*_TYPE equals '...'` assertion).
  </action>
  <verify>
    <automated>cd /home/aiacos/workspace/EvenFoundryVTT && corepack pnpm --filter @evf/shared-protocol test -- --run bearer-registry character-list && corepack pnpm --filter @evf/shared-protocol exec tsc --noEmit</automated>
  </verify>
  <done>Both schema files + tests exist and pass; index.ts re-exports both modules; typecheck clean. R1_BEARERS_AVAILABLE_TYPE/R1_CHARACTERS_AVAILABLE_TYPE resolve to the exact strings.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: foundry-module — readers + push wiring (no new socketlib handler)</name>
  <files>packages/foundry-module/src/readers/bearer-registry-reader.ts, packages/foundry-module/src/readers/bearer-registry-reader.test.ts, packages/foundry-module/src/readers/character-list-reader.ts, packages/foundry-module/src/readers/character-list-reader.test.ts, packages/foundry-module/src/module.ts</files>
  <behavior>
    - readBearerRegistry(): reads the `bearerRegistry` world setting via listBearers(), drops revoked (already excluded) AND expired (expiresAt <= Date.now()), maps each to { token, alias, expiresAt, worldId }; returns BearerRegistrySnapshot with source 'foundry-registry', count = bearers.length, generatedAt = Date.now(). On any throw → returns { bearers:[], source:'foundry-registry', count:0, generatedAt:Date.now() } (never throws; console.warn).
    - readCharacterList(): wraps listPlayerCharacters() → { characters, source:'foundry-world', count, generatedAt }. Never throws.
    - registerBearerRegistryReader(emit) / registerCharacterListReader(emit): emit initial snapshot immediately; mirror spell-pack-reader's debounce + Hooks.off unsubscribe shape.
  </behavior>
  <action>
    Create `bearer-registry-reader.ts` mirroring `spell-pack-reader.ts` (file-level JSDoc incl. "NO new registerComplexHandler — push via existing bridgeDeltaEmitter channel; count stays 17"). Implement `readBearerRegistry()` using `listBearers()` from `../pair/bearer-registry.js` (already non-revoked, newest-first), then filter `entry.expiresAt > Date.now()`, map to the snapshot entry shape, build the BearerRegistrySnapshot. Implement `registerBearerRegistryReader(emit: (type:string, payload:unknown)=>void)` that emits `R1_BEARERS_AVAILABLE_TYPE` immediately and re-emits on bearer change. For bearer change triggers, do NOT add a socketlib handler — the existing generate/revoke/rotate paths run in-module; emit a fresh snapshot from a small exported helper you call at those sites OR (preferred, minimal-surface) subscribe to the same lifecycle already wired in module.ts. Concretely: in module.ts after generateBearer/revokeBearer/rotation events fire, call the emit closure. Keep all reader errors swallowed (console.warn) per spell-pack-reader convention.
    Create `character-list-reader.ts` the same way: `readCharacterList()` wrapping `listPlayerCharacters()` from `../readers/character-reader.js`; `registerCharacterListReader(emit)` emits `R1_CHARACTERS_AVAILABLE_TYPE` initially and re-emits on `createActor`/`updateActor`/`deleteActor` Foundry hooks (debounced 500ms, mirror spell-pack-reader updateCompendium hook + Hooks.off unsubscribe). NEVER return false from hook callbacks.
    Wire in `module.ts`: in `Hooks.once('ready', ...)` (so settings + actors are loaded), call `registerBearerRegistryReader((type,payload)=>bridgeDeltaEmitter(type,payload))` and `registerCharacterListReader((type,payload)=>bridgeDeltaEmitter(type,payload))`, exactly mirroring how `registerSpellPackReader`/`registerEntityPackReader` are wired in `Hooks.once('init')`. Additionally push a fresh bearer snapshot after each generate/revoke/rotate (reuse the existing rotation emitter wiring spot at module.ts ~line 221-225). Do NOT add any `socketlib.registerComplexHandler` call.
    Tests: `bearer-registry-reader.test.ts` — readBearerRegistry maps non-revoked/non-expired entries, drops expired, returns empty snapshot on throw (mock game.settings/listBearers). `character-list-reader.test.ts` — readCharacterList wraps roster, empty-on-throw. Mirror the foundry-module reader test harness used by spell-pack-reader.test.ts (same global stubbing approach).
  </action>
  <verify>
    <automated>cd /home/aiacos/workspace/EvenFoundryVTT && corepack pnpm --filter @evf/foundry-module test -- --run bearer-registry-reader character-list-reader && corepack pnpm --filter @evf/foundry-module exec tsc --noEmit && test "$(grep -v '^#' packages/foundry-module/src/pair/socketlib-handlers.ts | grep -c 'registerComplexHandler')" = "17"</automated>
  </verify>
  <done>Both readers + tests exist and pass; module.ts pushes both snapshots on ready + on change; typecheck clean; socketlib registerComplexHandler count is exactly 17 (Gate 8 invariant).</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: bridge — caches + handlers + server wiring (internal validate + characters from cache) + tests + changeset</name>
  <files>packages/bridge/src/cache/bearer-registry-cache.ts, packages/bridge/src/cache/bearer-registry-cache.test.ts, packages/bridge/src/cache/character-list-cache.ts, packages/bridge/src/cache/character-list-cache.test.ts, packages/bridge/src/ws/bearer-registry-handler.ts, packages/bridge/src/ws/bearer-registry-handler.test.ts, packages/bridge/src/ws/character-list-handler.ts, packages/bridge/src/ws/character-list-handler.test.ts, packages/bridge/src/server.ts, packages/bridge/src/server.test.ts, .changeset/real-foundry-pairing-push.md</files>
  <behavior>
    - BearerRegistryCache.set/get last-write-wins; get() === null before any push.
    - handleBearerRegistryEnvelope: returns false on type mismatch; on match, safeParse with BearerRegistrySnapshotSchema, set only on success, return true regardless (matches spell/entity handler contract). Same for handleCharacterListEnvelope with CharacterListSnapshotSchema.
    - Internal foundryValidateFn (built from BearerRegistryCache) returns: cache===null → { valid:false, reason:'foundry_unreachable' } (module never connected, distinguishable); token absent from a pushed registry → { valid:false, reason:'unknown_token' }; token present but expiresAt <= Date.now() → { valid:false, reason:'expired' }; token present + not expired → { valid:true, entry:{ alias, expiresAt, worldId } }.
    - GET /v1/characters: serves CharacterListCache.get()?.characters ?? [] after auth; opts.foundrySnapshotFn override still wins when provided.
    - buildServer({}) wires both caches internally; opts.foundryValidateFn / opts.foundrySnapshotFn STILL override (tests rely on injection).
  </behavior>
  <action>
    Create `cache/bearer-registry-cache.ts` and `cache/character-list-cache.ts` mirroring `cache/spell-pack-cache.ts` (simple last-write-wins, get returns null when cold, clear() for tests, full JSDoc incl. a Security note: payload is zod-validated at the handler boundary before set; bearer tokens are stored in-memory and pushed over the EVF_INTERNAL_SECRET-gated /internal/delta channel — see INV-2). BearerRegistryCache stores `BearerRegistrySnapshot`; CharacterListCache stores `CharacterListSnapshot`.
    Create `ws/bearer-registry-handler.ts` and `ws/character-list-handler.ts` mirroring `ws/spell-pack-handler.ts`/`ws/entity-pack-handler.ts` exactly: `handleBearerRegistryEnvelope(type, payload, cache): boolean` guards on `R1_BEARERS_AVAILABLE_TYPE`, `BearerRegistrySnapshotSchema.safeParse`, set-on-success, return true when type matched. Same for character-list with `R1_CHARACTERS_AVAILABLE_TYPE`/`CharacterListSnapshotSchema`. Do NOT log payload contents.
    Edit `server.ts`: (1) construct `const bearerRegistryCache = opts.bearerRegistryCache ?? new BearerRegistryCache()` and `const characterListCache = opts.characterListCache ?? new CharacterListCache()` near the spellCache/entityCache construction (~line 400-408). Add the two optional cache fields to BuildServerOptions (mirror spellCache/entityCache opts fields). (2) Build the internal validate fn: `const internalValidateFn: FoundryValidateFn = async (token) => { ... }` implementing the four-way result in <behavior> by reading bearerRegistryCache.get(). (3) Change the TokenCache construction to `new TokenCache(opts.foundryValidateFn ?? internalValidateFn, {...})` — opts override preserved. (4) Build `const internalSnapshotFn: FoundrySnapshotFn = async (handler, ...args) => handler === 'evf.listCharacters' ? (characterListCache.get()?.characters ?? []) : null` and change foundryFn to `opts.foundrySnapshotFn ?? internalSnapshotFn`. (Keep the existing registerCharactersListRoute call signature; it already routes through foundryFn and validates shape — serving from cache via internalSnapshotFn means NO route rewrite needed beyond the foundryFn default. If a cleaner direct-cache wiring is preferred, you MAY instead pass characterListCache into registerCharactersListRoute, but the internalSnapshotFn approach is the minimal-diff path and keeps the route untouched.) (5) Multiplex the two new handlers into the existing `registerInternalDeltaRoute(app, deltaEmitter, (type,payload)=>{ ... })` onDelta callback alongside handleSpellPackEnvelope/handleEntityPackEnvelope.
    `internalValidateFn` MUST be ordered/declared so it captures `bearerRegistryCache` (declare caches before TokenCache construction; if current ordering puts TokenCache earlier, move the cache construction up or move TokenCache down — keep metrics hooks intact).
    Tests: cache tests (set/get/clear/cold-null) for both; handler tests (zod reject leaves cache untouched, type-mismatch returns false, valid sets); `server.test.ts` additions — using a real buildServer with the new caches populated via POST /internal/delta (or by injecting opts caches), assert: GET /v1/health validate paths for valid / expired / unknown_token / never-pushed(foundry_unreachable); GET /v1/characters returns the pushed roster; and assert opts.foundryValidateFn / opts.foundrySnapshotFn still override. Reuse the existing server.test.ts harness + EVF_INTERNAL_SECRET handling for /internal/delta. Confirm Gate 8: assert socketlib registerComplexHandler count unchanged (a grep-based test or reuse existing invariant test).
    Add `.changeset/real-foundry-pairing-push.md`: patch bumps for `@evf/shared-protocol`, `@evf/foundry-module`, `@evf/bridge` with a one-line summary "Wire push-based bridge↔Foundry bearer-registry + character-list path enabling real pairing" and a Security note line on the bearer-push trust model (tokens over EVF_INTERNAL_SECRET-gated /internal/delta).
    Confirm `index.ts` (bridge entrypoint) is UNCHANGED — buildServer({}) must keep working with all wiring internal.
  </action>
  <verify>
    <automated>cd /home/aiacos/workspace/EvenFoundryVTT && corepack pnpm --filter @evf/bridge test -- --run bearer-registry character-list server && corepack pnpm typecheck && corepack pnpm lint:ci && corepack pnpm changeset:status && git diff --quiet -- packages/bridge/src/index.ts && echo INDEX_UNCHANGED</automated>
  </verify>
  <done>Both caches + handlers + tests pass; server.test.ts proves valid/expired/unknown/never-pushed validation + /v1/characters served from cache + opts overrides win; typecheck 0, biome 0; changeset declares all 3 packages; bridge/src/index.ts unchanged (INDEX_UNCHANGED printed).</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Foundry module → bridge `/internal/delta` | Module PUSHes bearer registry (incl. raw tokens) + character list; gated by `EVF_INTERNAL_SECRET`. |
| g2-app / pairing client → bridge `/v1/*` | Untrusted bearer presented for validation; bridge answers from cache. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-RFP-01 | Tampering | `/internal/delta` bearer/char payload | mitigate | Zod `safeParse` (BearerRegistrySnapshotSchema / CharacterListSnapshotSchema) at handler boundary BEFORE cache write; channel already gated by EVF_INTERNAL_SECRET (existing /internal/delta auth). |
| T-RFP-02 | Information Disclosure | Bearer tokens now transit + reside in bridge memory | accept | Tokens already cross this exact channel for the spell/entity pipeline pattern; transport gated by EVF_INTERNAL_SECRET; tokens NEVER logged (handler does not log payload; cache stores in-memory only). Documented in changeset + JSDoc Security notes. |
| T-RFP-03 | Spoofing | Disconnected module vs invalid token | mitigate | Never-pushed cache (get()===null) maps to `foundry_unreachable` (503), distinct from `unknown_token`/`expired` (401) — a disconnected module is distinguishable from a bad token, preventing false "pairing succeeded" UX. |
| T-RFP-SC | Tampering | npm/pip/cargo installs | mitigate | No new package installs in this plan (reuses existing zod/fastify/vitest); no legitimacy gate needed. |
</threat_model>

<verification>
- `corepack pnpm typecheck` → 0 errors (all packages).
- `corepack pnpm lint:ci` → 0 (biome read-only).
- `corepack pnpm test` (or per-filter) → all new + existing tests pass.
- `corepack pnpm changeset:status` → changeset declared for the 3 packages.
- Gate 8 invariant: `grep -v '^#' packages/foundry-module/src/pair/socketlib-handlers.ts | grep -c registerComplexHandler` === 17.
- `git diff --quiet -- packages/bridge/src/index.ts` → no diff (buildServer({}) unchanged contract).
</verification>

<success_criteria>
- Real bearer token from a live Foundry validates at GET /v1/health: valid → 200, expired → 401, unknown → 401, module-never-connected → 503 foundry_unreachable.
- GET /v1/characters returns the pushed player-character roster.
- buildServer({}) wires real validation + character list internally; opts.foundryValidateFn / opts.foundrySnapshotFn still override.
- socketlib registerComplexHandler count = 17. bridge/src/index.ts unchanged.
- INV-4: clean, JSDoc on public APIs, zero dead code, biome 0, typecheck 0, Vitest tests present.
</success_criteria>

<output>
Create `.planning/quick/260604-eyf-wire-bridge-foundry-real-pairing-push-ba/260604-eyf-SUMMARY.md` when done.
</output>
