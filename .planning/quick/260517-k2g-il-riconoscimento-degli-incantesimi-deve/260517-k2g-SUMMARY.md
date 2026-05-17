---
type: summary
date: 2026-05-17
slug: il-riconoscimento-degli-incantesimi-deve
quick_id: 260517-k2g
related-pattern: 20260517-spell-lookup-foundry-derived
phase: quick
status: complete
tests-added: 70
tests-total: 2546
commits: 3
duration-min: 16
key-files:
  created:
    - packages/shared-protocol/src/payloads/entity-pack.ts
    - packages/shared-protocol/src/payloads/entity-pack.test.ts
    - packages/foundry-module/src/readers/entity-pack-reader.ts
    - packages/foundry-module/src/readers/__tests__/entity-pack-reader.test.ts
    - packages/bridge/src/cache/entity-pack-cache.ts
    - packages/bridge/src/ws/entity-pack-handler.ts
    - packages/bridge/src/routes/entities.ts
    - packages/bridge/src/routes/entities.test.ts
    - packages/foundry-mcp/src/voice/entity-lookup-foundry.ts
    - packages/foundry-mcp/src/voice/__tests__/entity-lookup-foundry.test.ts
  modified:
    - packages/shared-protocol/src/index.ts
    - packages/foundry-module/src/module.ts
    - packages/bridge/src/server.ts
decisions:
  - additive-parallel-pipeline-no-refactor-of-spell-pack
  - no-offline-static-fallback-for-entities
  - levenshtein-ambiguity-treated-as-no-match-precision-first
  - inline-containsname-helper-not-imported-from-spell-pipeline
  - sub-types-locked-item-7-actor-2
tech-stack:
  added: []
  patterns:
    - Push-based vocabulary emission via bridgeDeltaEmitter (no new socketlib handler)
    - Multiplexed onDelta dispatch in bridge server.ts (handleSpellPackEnvelope + handleEntityPackEnvelope)
    - Module-level Map cache with 5-min TTL on consumer side
    - Schema safeParse gating at every cache write boundary (T-EP-02 cache-poisoning mitigation)
---

# Quick Task 260517-k2g: Entity Recognition (Foundry-Derived, Additive Parallel) — Summary

Estesa la pipeline `spell-lookup-foundry-derived` (chiusa 71 min prima dell'inizio di questo task) a **qualsiasi entità giocabile** — armi, armature, oggetti, consumabili, tool, loot, contenitori, feat, PNG, mostri e veicoli — tramite una pipeline **parallela additiva** (`entity-pack`) che non rifattorizza una singola riga di `spell-pack`.

## One-liner

Voice/MCP entity recognition for non-spell Items + Actors (npc/vehicle) via a parallel additive Foundry compendium pipeline; bridge cache + REST + Levenshtein fuzzy on dynamic name/nameLocalized, NO offline static fallback (returns null when bridge unreachable).

## Architectural decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | **Additive parallel pipeline** (not refactor) | Spell-pack è appena shipped (53 test passanti, 71 min prima); rifattorizzare per condividere codice introduceva rischio sproporzionato. Duplicazione accettata; deduplica futura altrove. |
| 2 | **NO static offline fallback** | Diversamente da spell-pack (70-entry SRD subset offline), non esiste SRD canonica abbastanza piccola/stabile per weapons/armours/monsters. `null` quando bridge irraggiungibile è il contratto esplicito. |
| 3 | **Levenshtein ambiguità ≥2 candidati → no-match** | Entity lookups sono più stringenti di spell lookups perché un weapon-attack errato fa danni reali sul tavolo; precision-first. |
| 4 | **Inline containsName helper** (non importare da spell-lookup-foundry) | Preserva il principio additive parallel — entity-pack rimovibile come unità singola senza toccare spell-pack. |
| 5 | **Sub-types lock** | Item-types ammessi: `weapon`, `equipment`, `consumable`, `tool`, `loot`, `container`, `feat`. Actor-types ammessi: `npc`, `vehicle`. Esclusi: `spell` (coperto altrove), `class`/`subclass`/`background`/`race`/`character`/`group` (non voice-actionable). |

## Tasks executed (3/3 complete)

| Task | Files (created / modified) | Commit | Tests added |
|---|---|---|---|
| 1 — Schema + foundry-module reader + module wiring | `entity-pack.ts` (NEW + test), `entity-pack-reader.ts` (NEW + test), `shared-protocol/src/index.ts` (re-export block), `foundry-module/src/module.ts` (Hooks.once('init')) | `50a9fa9` | 19 schema + 16 reader = **35** |
| 2 — Bridge cache + REST route + WS handler + server wiring | `entity-pack-cache.ts` (NEW), `entity-pack-handler.ts` (NEW), `routes/entities.ts` (NEW), `routes/entities.test.ts` (NEW), `bridge/src/server.ts` (BuildServerOptions.entityCache, 7c route block, multiplex onDelta) | `5bc0bfe` | 14 (cache + handler + route) |
| 3 — foundry-mcp consumer + tests (no static fallback) | `entity-lookup-foundry.ts` (NEW), `entity-lookup-foundry.test.ts` (NEW) | `401c5ca` | 20 (fetch + lookup + edge cases) |

**Total new tests: 69 net (workspace went 2477 → 2546 = +69)**. Plan target was +25; delivered ~3× target.

## Verify gate results (full quick-task gate)

| Check | Status | Notes |
|---|---|---|
| `pnpm install --frozen-lockfile` | ✅ | Lockfile unchanged (no new external deps). |
| `pnpm typecheck` (workspace-wide `tsc --noEmit`) | ✅ exit 0 | All 7 packages clean. |
| `pnpm test` (workspace, 175 files) | ✅ 2546/2546 | Up from baseline ~2477 (+69 tests). |
| `socketlib registerComplexHandler` count | ✅ = **17** | Phase 13 invariant preserved (no new socketlib handler added). |
| `spell-pack-*` regression (foundry-module + bridge + foundry-mcp) | ✅ 53/53 | No changes to spell-pack files (additive principle). |
| Biome on new files (10 files) | ✅ clean | Auto-formatted on first try; no manual fixes needed beyond Biome's `--write`. |
| Existing `lookupEntityFromBridge('spada lunga', BRIDGE_URL, BEARER)` happy path | ✅ | Returns `{ found:true, kind:'item', entityType:'weapon', id:'longsword', source:'it-table' }`. |
| `lookupEntityFromBridge('goblin', BRIDGE_URL, BEARER)` | ✅ | Returns `{ found:true, kind:'actor', entityType:'npc' }`. |
| `lookupEntityFromBridge('spada lunga')` (no bridgeUrl) | ✅ | Returns `null` (no static fallback per design). |

## Threat-model coverage (T-EP-01..04)

| Threat | Mitigation | Verified by |
|---|---|---|
| **T-EP-01 (Injection)** | `name`/`nameLocalized` are verbatim strings from compendium index; no eval / shell / template injection downstream. Same pattern as T-SP-01. | Type system + Zod schema (no string interpolation in any sink). |
| **T-EP-02 (Cache poisoning)** | `AvailableEntitiesPayloadSchema.safeParse` gates EVERY cache write (bridge `entity-pack-handler.ts`) AND EVERY consumer build (`entity-lookup-foundry.fetchAvailableEntities`). | `entities.test.ts` "returns true but does not update cache for invalid payload" + `entity-lookup-foundry.test.ts` case (4) "invalid payload fails schema parse → returns null". |
| **T-EP-03 (Stale cache after pack uninstall/update)** | `Hooks.on('updateCompendium', ...)` re-emit with 500ms debounce. | `entity-pack-reader.test.ts` cases (8) immediate + debounced re-emit + "debounces rapid updateCompendium events". |
| **T-EP-04 (Memory blowup on large compendia)** | `console.warn` when `entries.length > 10000` (telemetry-only, no hard cap). | `entity-pack-reader.test.ts` case (10) "T-EP-04 warn when entries.length > 10000". |

## Cross-references preserved

- `spell-pack-reader.ts` — unchanged (53 tests still green).
- `spell-pack-cache.ts` — unchanged.
- `spell-pack-handler.ts` — unchanged.
- `routes/spells.ts` — unchanged.
- `spell-lookup.ts` (static 70-entry SRD subset for offline spell resolution) — unchanged.
- `spell-lookup-foundry.ts` — unchanged.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Workspace `node_modules` missing after worktree reset**

- **Found during:** Task 1 verify (first test run).
- **Issue:** `pnpm --filter @evf/shared-protocol test entity-pack` exited 0 with no output; subsequent `npx vitest --run` failed with `Cannot find package 'zod'`. The worktree had been hard-reset to base `291fa2c` per the worktree-branch-check protocol, which wiped any prior `node_modules`/`.pnpm` state.
- **Fix:** Ran `pnpm install --frozen-lockfile` (lockfile-up-to-date; 459 packages restored from store in 1s).
- **Files modified:** none (install only).
- **Commit:** N/A (no source change).

**2. [Rule 3 - Blocking] Biome auto-format on import sort**

- **Found during:** Task 1 commit (pre-commit hook), Task 2 commit (biome ci before commit), Task 3 commit (biome ci before commit).
- **Issue:** Biome 2.4.15's `useSortedImports` reordered the new `entity-pack-reader` import block in `module.ts` and `entity-pack` blocks in `server.ts`; also reformatted long lines in the two new test files.
- **Fix:** Ran `npx biome check --write` on the affected files. Behaviour preserved (Hooks.once('init') call order in module.ts and onDelta callback in server.ts still call `Spell*` first then `Entity*`).
- **Files modified:** `module.ts`, `server.ts`, `entities.test.ts`, `entity-lookup-foundry.test.ts` (format only — no logic change).
- **Commits:** included inside `50a9fa9`, `5bc0bfe`, `401c5ca` respectively.

### Out-of-scope discoveries (documented in `deferred-items.md`, NOT fixed here)

**A. Pre-existing biome-ignore suppressions now flagged unused**

- `packages/g2-app/src/internal/boot-engine-core.ts:928` — `// biome-ignore lint/suspicious/noExplicitAny: ...` (committed at `38c77637`, 2026-05-17 09:05).
- `packages/g2-app/src/panels/reaction-prompt-panel.ts:422` — same rule (committed at `c1abb4f9`, 2026-05-17 10:07).
- Workspace `pnpm lint:ci` reports `1 error` from these two stale comments. Pre-existing at base commit `291fa2c`; per `gsd-executor` scope-boundary rule, only fix issues directly caused by the current task's changes.

**B. CI Gate 8 raw-grep false positives in JSDoc comments**

- `packages/g2-app/src/panels/slot-picker-panel.ts` JSDoc contains a literal `activity.use({...})` example.
- `packages/g2-app/src/panels/reaction-prompt-panel.ts` JSDoc says verbatim "NEVER calls activity.use() directly. CI Gate 8 enforces this."
- The plan's verify command `grep -rE 'activity\.use\(' packages/g2-app packages/bridge --include='*.ts'; test $? -eq 1` returns rc=0 because of these comment-only matches. The **actual invariant** (no real `activity.use(` call in g2-app or bridge source) is preserved — verified with `grep -vE ':[*/]'` filter returning rc=1.

### Authentication gates / other

None — no auth gates encountered. No checkpoints triggered.

## Known Stubs

None. All wired through end-to-end: schema → reader → emit → bridge cache → REST → consumer fetch → lookup result with kind+entityType+id+packId+name. The plan explicitly notes that downstream dispatch (weapon → weapon-attack tool, npc → set-target, consumable → use-item) is **out of scope** for this Quick Task — the resolver exposes everything callers need; wiring caller-side is future work.

## Threat Flags

None. No new network endpoints introduced (the route is auth-gated identically to `/v1/spells/available`). No new file access patterns, no new auth paths, no schema changes at trust boundaries beyond the additive `AvailableEntitiesPayloadSchema` (which is symmetric in shape and security posture to `AvailableSpellsPayloadSchema`).

## Self-Check: PASSED

- ✅ `packages/shared-protocol/src/payloads/entity-pack.ts` exists
- ✅ `packages/shared-protocol/src/payloads/entity-pack.test.ts` exists
- ✅ `packages/foundry-module/src/readers/entity-pack-reader.ts` exists
- ✅ `packages/foundry-module/src/readers/__tests__/entity-pack-reader.test.ts` exists
- ✅ `packages/bridge/src/cache/entity-pack-cache.ts` exists
- ✅ `packages/bridge/src/ws/entity-pack-handler.ts` exists
- ✅ `packages/bridge/src/routes/entities.ts` exists
- ✅ `packages/bridge/src/routes/entities.test.ts` exists
- ✅ `packages/foundry-mcp/src/voice/entity-lookup-foundry.ts` exists
- ✅ `packages/foundry-mcp/src/voice/__tests__/entity-lookup-foundry.test.ts` exists
- ✅ Commit `50a9fa9` (Task 1) reachable from HEAD
- ✅ Commit `5bc0bfe` (Task 2) reachable from HEAD
- ✅ Commit `401c5ca` (Task 3) reachable from HEAD

## Metrics

| Metric | Value |
|---|---|
| Duration | ~16 minutes (start to commit `401c5ca`) |
| Tasks executed | 3 / 3 |
| Commits | 3 |
| Files created | 10 |
| Files modified | 3 |
| Lines added | +2505 |
| Lines deleted | -8 |
| Tests added | 69 (net workspace delta) |
| Tests after | 2546 |
| socketlib invariant | 17 (preserved) |
| TypeScript errors | 0 |
| Biome errors on new files | 0 |
