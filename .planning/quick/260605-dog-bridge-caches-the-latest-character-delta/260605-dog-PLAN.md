---
phase: quick-260605-dog
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/bridge/src/cache/character-snapshot-cache.ts
  - packages/bridge/src/cache/character-snapshot-cache.test.ts
  - packages/bridge/src/ws/character-snapshot-handler.ts
  - packages/bridge/src/ws/character-snapshot-handler.test.ts
  - packages/bridge/src/server.ts
  - packages/bridge/src/server.character-snapshot.test.ts
autonomous: true
requirements: [DOG-01]
must_haves:
  truths:
    - "After a character.delta is POSTed to /internal/delta, GET /v1/character/:actorId returns 200 with that exact snapshot (was actor_not_found)."
    - "With a seeded roster + a cached snapshot, a fresh WS connect receives the initial character.delta (d0v + dog end-to-end)."
    - "An invalid character.delta payload or a non-matching envelope type does NOT write to the snapshot cache."
  artifacts:
    - path: "packages/bridge/src/cache/character-snapshot-cache.ts"
      provides: "CharacterSnapshotCache — Map<actorId, CharacterSnapshot>, last-write-wins, no TTL"
      contains: "class CharacterSnapshotCache"
    - path: "packages/bridge/src/ws/character-snapshot-handler.ts"
      provides: "handleCharacterSnapshotEnvelope(type, payload, cache) → boolean"
      contains: "export function handleCharacterSnapshotEnvelope"
  key_links:
    - from: "packages/bridge/src/server.ts internalSnapshotFn"
      to: "characterSnapshotCache.get(actorId)"
      via: "handler === 'evf.getCharacterSnapshot' branch reading args[0]"
      pattern: "evf\\.getCharacterSnapshot"
    - from: "packages/bridge/src/server.ts registerInternalDeltaRoute callback"
      to: "handleCharacterSnapshotEnvelope"
      via: "fan-out next to the other three handlers"
      pattern: "handleCharacterSnapshotEnvelope"
---

<objective>
Make the bridge cache the latest `character.delta` (a full `CharacterSnapshot`) per `actorId`, and have `internalSnapshotFn` replay it for `evf.getCharacterSnapshot`. This closes two live prod gaps at once:

1. `GET /v1/character/:actorId` stops returning `{"error":"actor_not_found"}` in production (`buildServer({})`), because `internalSnapshotFn` currently returns `null` for every handler except `evf.listCharacters`.
2. The on-connect initial `character.delta` push (Quick Task 260605-d0v) actually fires in prod, because `pushInitialCharacterDelta` calls the same `foundryFn('evf.getCharacterSnapshot', actorId, token)` path that today no-ops.

Purpose: the Foundry module already emits `character.delta` and the bridge already fans it to WS sessions via `DeltaEmitter` (UNCHANGED). This task additionally CACHES that payload so it can be served via `getCharacterSnapshot` — mirroring the existing spell-pack / entity-pack cache+handler pipelines exactly.

Output: a new `CharacterSnapshotCache`, a new `handleCharacterSnapshotEnvelope`, both wired into `server.ts` (the `/internal/delta` fan-out callback + `internalSnapshotFn` + `BuildServerOptions`), plus unit + integration tests.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

# The cache + handler patterns to mirror EXACTLY
@packages/bridge/src/cache/spell-pack-cache.ts
@packages/bridge/src/ws/spell-pack-handler.ts
@packages/bridge/src/ws/entity-pack-handler.ts

# The consumer + producer contracts
@packages/bridge/src/routes/character.ts
@packages/bridge/src/ws/initial-snapshot.ts
@packages/shared-protocol/src/payloads/character.ts

# The wiring site (read internalSnapshotFn ~403-412, BuildServerOptions ~157-181,
# registerInternalDeltaRoute fanout ~512-517, d0v on-connect push ~597-615)
@packages/bridge/src/server.ts

# The reusable full mock CharacterSnapshot fixture (lines 101-143)
@packages/bridge/src/routes/character.test.ts
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: CharacterSnapshotCache + handleCharacterSnapshotEnvelope (+ unit tests)</name>
  <files>
    packages/bridge/src/cache/character-snapshot-cache.ts,
    packages/bridge/src/cache/character-snapshot-cache.test.ts,
    packages/bridge/src/ws/character-snapshot-handler.ts,
    packages/bridge/src/ws/character-snapshot-handler.test.ts
  </files>
  <behavior>
    CharacterSnapshotCache:
    - Test: set(snapshot) then get(snapshot.actorId) returns that snapshot.
    - Test: get('unknown-actor') returns null (cold/miss).
    - Test: setting a second snapshot for the same actorId overwrites (last-write-wins); get returns the newer one.
    - Test: two different actorIds are stored independently (set A, set B → get A and get B both return their own).
    - Test: clear() empties the cache → get(previouslySetId) returns null.
    handleCharacterSnapshotEnvelope:
    - Test: type === CHARACTER_DELTA_TYPE ('character.delta') with a VALID full CharacterSnapshot → returns true AND cache.get(actorId) === the snapshot.
    - Test: wrong type (e.g. 'r1.spells.available') → returns false AND nothing written (cache.get for any id stays null).
    - Test: type matches but payload fails CharacterSnapshotSchema.safeParse (e.g. { actorId: 'x' } missing required fields) → returns true (handled) AND NO cache write (cache stays cold). Mirror spell/entity handler convention: type-mismatch returns false, valid-type-but-invalid-body returns true with no write.
  </behavior>
  <action>
    Create `packages/bridge/src/cache/character-snapshot-cache.ts`. Mirror `spell-pack-cache.ts` style (TSDoc header citing this Quick Task 260605-dog, @see links to the handler + routes/character.ts + the sibling spell-pack-cache.ts). UNLIKE the singleton-payload siblings, this cache is keyed by actorId: back it with a private `Map<string, CharacterSnapshot>`. Import the `CharacterSnapshot` TYPE from `@evf/shared-protocol`. Public API: `set(snapshot: CharacterSnapshot): void` (keys by `snapshot.actorId` — confirmed field on CharacterSnapshotSchema line 489, `actorId: z.string().min(1)`; last-write-wins via Map.set), `get(actorId: string): CharacterSnapshot | null` (return `this._byActor.get(actorId) ?? null`), and `clear(): void` (for test isolation, mirroring sibling caches). NO TTL and NO bounded eviction — the sibling spell/entity caches have neither; match them (last-write-wins per actor is sufficient for a single-tenant roster). Do NOT add an onChange listener channel (that is entity-pack-only for the Deepgram keyterm path; not needed here — INV-4 zero dead code).

    Create `packages/bridge/src/ws/character-snapshot-handler.ts`. Mirror `handleSpellPackEnvelope` / `handleEntityPackEnvelope` byte-for-byte in shape: signature `export function handleCharacterSnapshotEnvelope(type: string, payload: unknown, cache: CharacterSnapshotCache): boolean`. Import `{ CHARACTER_DELTA_TYPE, CharacterSnapshotSchema }` from `@evf/shared-protocol` (both confirmed exported from the barrel) and `import type { CharacterSnapshotCache }`. Body: `if (type !== CHARACTER_DELTA_TYPE) return false;` then `const parsed = CharacterSnapshotSchema.safeParse(payload);` — on `!parsed.success` return `true` (handled, body rejected — do NOT log payload contents, mirror the T-SP-02 comment convention re: cache poisoning); on success `cache.set(parsed.data); return true;`. TSDoc header + per-param docs mirroring the spell/entity handlers (cite Quick Task 260605-dog and the multiplexed-dispatch note explaining each handler returns false on type mismatch so order is irrelevant).

    Write both unit test files (`*.test.ts` siblings) covering the behaviors above. For the valid-snapshot fixture, copy the full mock CharacterSnapshot object from `routes/character.test.ts` lines 101-143 (all required fields: actorId, name, hp, maxHp, tempHp, ac, level, conditions, exhaustion, death, world, inventory, spells, abilities, skills) — define it as a local `const VALID_SNAPSHOT` in each test file (or a tiny shared test fixture; keep it inline per file to avoid a new shared module). Use `vitest` `describe/it/expect`. Deterministic, no timers, no network.
  </action>
  <verify>
    <automated>corepack pnpm --filter @evf/bridge exec vitest run src/cache/character-snapshot-cache.test.ts src/ws/character-snapshot-handler.test.ts</automated>
  </verify>
  <done>
    CharacterSnapshotCache (Map-keyed by actorId, set/get/clear, no TTL) and handleCharacterSnapshotEnvelope exist with full TSDoc; both unit test files pass; handler returns false on type mismatch, true with no write on invalid body, true with write on valid character.delta.
  </done>
</task>

<task type="auto">
  <name>Task 2: Wire the cache into server.ts (BuildServerOptions + internalSnapshotFn + /internal/delta fan-out)</name>
  <files>packages/bridge/src/server.ts</files>
  <action>
    Make three additive edits to `packages/bridge/src/server.ts`, mirroring the spellCache/entityCache precedent exactly. Touch NO foundry-module files (socketlib registerComplexHandler count UNCHANGED — bridge-only). Add NO new dependencies. Do NOT alter the existing `character.delta` WS fan-out, `emitDelta`, handshake, or `pushInitialCharacterDelta` call.

    1. Imports (near lines 57-58 and 94-102): add `import { CharacterSnapshotCache } from './cache/character-snapshot-cache.js';` next to the other cache imports, and `import { handleCharacterSnapshotEnvelope } from './ws/character-snapshot-handler.js';` next to the other envelope-handler imports. Keep import ordering consistent with the file's existing grouping (Biome may reorder; run format).

    2. BuildServerOptions (after the `entityCache?: EntityPackCache;` field ~line 181): add an optional `characterSnapshotCache?: CharacterSnapshotCache;` field with a TSDoc block mirroring the spellCache/entityCache docs — "Inject a custom CharacterSnapshotCache for test isolation (Quick Task 260605-dog). In production a fresh CharacterSnapshotCache is created per buildServer() call. Populated by handleCharacterSnapshotEnvelope via the /internal/delta push channel; read back by internalSnapshotFn for evf.getCharacterSnapshot." @see cache/character-snapshot-cache.ts.

    3. Instantiate the cache BEFORE `internalSnapshotFn` is defined (internalSnapshotFn is at ~403 and must close over it). Add, near the top of the relevant section (before line 403): `const characterSnapshotCache = opts.characterSnapshotCache ?? new CharacterSnapshotCache();` with a one-line comment citing Quick Task 260605-dog.

    4. Extend `internalSnapshotFn` (~403-412): the variadic is currently named `_args` and unused. Rename to `args` (drop the underscore — it is now used) so Biome's noUnusedParameters stays happy, and update its `biome-ignore` comment text if it references `_args`. Add a branch BEFORE the `return null;`: `if (handler === 'evf.getCharacterSnapshot') { const actorId = args[0]; return typeof actorId === 'string' ? (characterSnapshotCache.get(actorId) ?? null) : null; }`. Keep the existing `evf.listCharacters` branch and the trailing `return null;` default intact. (Confirmed call site: routes/character.ts line 52 and initial-snapshot.ts line 97 both call `foundryFn('evf.getCharacterSnapshot', actorId, token)`, so args[0] = actorId.)

    5. registerInternalDeltaRoute fan-out callback (~512-517): add `handleCharacterSnapshotEnvelope(type, payload, characterSnapshotCache);` next to the other three handler calls (order irrelevant — returns false on type mismatch). Update the surrounding comment block (~505-511) to mention the character-snapshot envelope alongside bearer-registry / character-list / spell-pack / entity-pack.

    6. Stale-comment fix: update the on-connect d0v comment at ~599-603 which currently states "internalSnapshotFn returns null for 'evf.getCharacterSnapshot' (no live snapshot source in production until the module pushes one); this call is a safe no-op in default prod". That is now FALSE once the cache is populated. Rewrite it to: internalSnapshotFn now serves a cached snapshot for 'evf.getCharacterSnapshot' when the module has pushed a character.delta for the roster actor (Quick Task 260605-dog); it remains a graceful no-op while the cache is cold (returns null → IS-05 path).
  </action>
  <verify>
    <automated>corepack pnpm --filter @evf/bridge exec tsc --noEmit</automated>
  </verify>
  <done>
    server.ts type-checks; characterSnapshotCache is injectable via opts (default fresh instance), instantiated before internalSnapshotFn, read in the evf.getCharacterSnapshot branch via args[0], and wired into the /internal/delta fan-out next to the other three handlers; the stale d0v no-op comment is corrected; no foundry-module files touched.
  </done>
</task>

<task type="auto">
  <name>Task 3: Server integration test — POST character.delta → GET 200; roster + cache → WS initial delta</name>
  <files>packages/bridge/src/server.character-snapshot.test.ts</files>
  <action>
    Create `packages/bridge/src/server.character-snapshot.test.ts`. Build the server via `buildServer({})` (the PROD path — NO foundrySnapshotFn injected, so internalSnapshotFn is exercised). Use the live `/internal/delta` recipe from MEMORY (real-pairing-bridge-test-recipe): the route is gated by `EVF_INTERNAL_SECRET` — set the env var before buildServer and send the matching header. Read the existing spell/entity server integration tests (grep for an existing `*/internal/delta*` server test, e.g. `src/server.*.test.ts` or `src/routes/internal-delta.test.ts`) to copy the EXACT header name + body envelope shape `{ type, payload }` and the secret env wiring — do not invent the header; mirror the existing passing test verbatim. Reuse the full mock CharacterSnapshot fixture from `routes/character.test.ts` lines 101-143 (inline `const VALID_SNAPSHOT`, actorId = 'actor-thorin' or similar).

    Test A (the core dog fix): POST a `character.delta` envelope (payload = VALID_SNAPSHOT) to `/internal/delta` with the internal secret header → expect 2xx. THEN `GET /v1/character/${VALID_SNAPSHOT.actorId}` with a valid bearer → expect 200 and `res.json()` deep-equals VALID_SNAPSHOT. (For bearer auth in the prod-path server, follow the existing server integration tests' auth approach — either the EVF_DEV_NO_AUTH sentinel path the onRequest hook injects, or seed a bearer via the bearer-registry /internal/delta envelope; copy whichever the existing server integration tests use. Confirm by reading them.)

    Test B (d0v + dog end-to-end): seed a roster by POSTing a character-list envelope to /internal/delta whose first actor's actorId === VALID_SNAPSHOT.actorId (read handleCharacterListEnvelope + the character-list payload schema to get the exact envelope type + shape), AND POST the character.delta to populate the snapshot cache. THEN open a real WS connection to `/ws`, complete the handshake (copy the handshake message shape from an existing WS server test), and assert the session receives an initial `character.delta` envelope whose payload deep-equals VALID_SNAPSHOT. Read an existing WS server integration test (grep `ws://` or `injectWS`/`app.injectWS` in `src/server.*.test.ts`) to copy the exact WS connect + handshake + message-receive harness — mirror it; do not invent a WS client.

    Keep tests deterministic: clean up env vars + close the server in afterEach. No real network beyond the in-process Fastify WS (use the same harness the existing WS tests use).
  </action>
  <verify>
    <automated>corepack pnpm --filter @evf/bridge exec vitest run src/server.character-snapshot.test.ts</automated>
  </verify>
  <done>
    Test A proves GET /v1/character/:actorId returns 200 with the cached snapshot after a /internal/delta character.delta push (was actor_not_found). Test B proves a fresh WS connect with a seeded roster + cached snapshot receives the initial character.delta. Both pass against buildServer({}) prod path.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Foundry module → bridge `/internal/delta` | Module-pushed `character.delta` payload crosses into the bridge; gated by `EVF_INTERNAL_SECRET`. |
| g2-app client → bridge REST/WS | Bearer-token-gated reads of the cached snapshot. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-dog-01 | Tampering | `handleCharacterSnapshotEnvelope` cache write | mitigate | `CharacterSnapshotSchema.safeParse` gate before `cache.set` — malformed payloads never poison the cache (mirrors T-SP-02 / T-EP-02). |
| T-dog-02 | Information disclosure | `internalSnapshotFn` evf.getCharacterSnapshot branch | accept | Cache keyed by actorId; REST route still enforces bearer auth + the route's own actor-ownership semantics are unchanged. The cache only replays what the module already pushed; no new disclosure surface vs the existing live path. |
| T-dog-SC | Tampering | npm/pip/cargo installs | mitigate | No new dependencies added (bridge-only, reuses @evf/shared-protocol). No install task → no slopcheck checkpoint required. |
</threat_model>

<verification>
Run the full bridge suite to confirm no regression in the existing spell/entity/character-list pipelines or the d0v initial-snapshot tests:

```
corepack pnpm --filter @evf/bridge exec vitest run
corepack pnpm --filter @evf/bridge exec tsc --noEmit
corepack pnpm --filter @evf/bridge exec biome ci src
```

Invariant checks:
- socketlib `registerComplexHandler` count UNCHANGED (no foundry-module files touched — grep confirms `git diff --name-only` lists only `packages/bridge/**`).
- No new entries in any package.json dependencies.
</verification>

<success_criteria>
- `GET /v1/character/:actorId` returns 200 with the pushed snapshot after a `/internal/delta` `character.delta` (no longer `actor_not_found`) — proven by Test A against `buildServer({})`.
- A fresh WS connect with a seeded roster + cached snapshot receives the initial `character.delta` — proven by Test B (ties d0v + dog end-to-end).
- Invalid payload / wrong type never writes the cache — proven by Task 1 handler unit tests.
- Full bridge suite + tsc + biome pass; no foundry-module files changed; no new deps.
</success_criteria>

<output>
Create `.planning/quick/260605-dog-bridge-caches-the-latest-character-delta/260605-dog-SUMMARY.md` when done
</output>
