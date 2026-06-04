---
phase: quick-260604-eyf
plan: "01"
subsystem: pairing
tags: [bridge, foundry-module, shared-protocol, push-cache, bearer-auth, real-pairing]
dependency_graph:
  requires: []
  provides: [real-bearer-validation, real-character-listing, push-bearer-cache, push-character-cache]
  affects: [bridge-auth, foundry-module-push, g2-app-pairing]
tech_stack:
  added:
    - BearerRegistrySnapshotSchema (zod)
    - CharacterListSnapshotSchema (zod)
    - BearerRegistryCache (in-memory, last-write-wins)
    - CharacterListCache (in-memory, last-write-wins)
    - internalValidateFn (TokenCache built from push cache)
    - internalSnapshotFn (GET /v1/characters from push cache)
  patterns:
    - push→cache→serve (established by spell-pack / entity-pack; extended here)
    - opts.X ?? internalX (opts overrides win; tests use injection; prod uses cache)
key_files:
  created:
    - packages/shared-protocol/src/payloads/bearer-registry.ts
    - packages/shared-protocol/src/payloads/bearer-registry.test.ts
    - packages/shared-protocol/src/payloads/character-list.ts
    - packages/shared-protocol/src/payloads/character-list.test.ts
    - packages/foundry-module/src/readers/bearer-registry-reader.ts
    - packages/foundry-module/src/readers/__tests__/bearer-registry-reader.test.ts
    - packages/foundry-module/src/readers/character-list-reader.ts
    - packages/foundry-module/src/readers/__tests__/character-list-reader.test.ts
    - packages/bridge/src/cache/bearer-registry-cache.ts
    - packages/bridge/src/cache/bearer-registry-cache.test.ts
    - packages/bridge/src/cache/character-list-cache.ts
    - packages/bridge/src/cache/character-list-cache.test.ts
    - packages/bridge/src/ws/bearer-registry-handler.ts
    - packages/bridge/src/ws/bearer-registry-handler.test.ts
    - packages/bridge/src/ws/character-list-handler.ts
    - packages/bridge/src/ws/character-list-handler.test.ts
    - .changeset/real-foundry-pairing-push.md
  modified:
    - packages/shared-protocol/src/index.ts
    - packages/foundry-module/src/module.ts
    - packages/bridge/src/server.ts
    - packages/bridge/src/server.test.ts
decisions:
  - "BearerRegistryReaderHandle {unsubscribe, reEmit} returned from registerBearerRegistryReader to avoid circular import (module.ts → bearer-registry-reader.ts → pair/bearer-registry.ts → module.ts)"
  - "internalValidateFn built in buildServer() body, declared before TokenCache construction so it closes over bearerRegistryCache"
  - "opts.foundryValidateFn ?? internalValidateFn preserves backward-compat for all existing tests"
  - "opts.foundrySnapshotFn ?? internalSnapshotFn preserves backward-compat for all existing tests"
  - "internalSnapshotFn checks handler === 'evf.listCharacters' and falls back to null for other handlers (preserves character snapshot, combat, scene route behavior)"
metrics:
  duration: ~20 minutes
  completed: "2026-06-04T09:14:34Z"
  tasks: 3
  files: 19
---

# Phase quick-260604-eyf Plan 01: Wire Bridge↔Foundry Real Pairing Push Path Summary

Push-based bearer token validation and player-character roster listing against a live Foundry — enabling real device pairing via the existing `/internal/delta` channel (no new socketlib handler, count stays at 17 actual / 19 total including comment lines).

## What Was Built

**Problem:** `buildServer({})` in production had no real bearer validation (`foundryValidateFn` defaulted to `foundry_unreachable` stub) and no real character listing (`foundrySnapshotFn` defaulted to `null`). Real pairing was impossible without opts injection.

**Solution:** Extended the proven push→cache→serve pattern (established by spell-pack / entity-pack) to two new envelopes:

1. `r1.bearers.available` — Foundry module pushes the non-revoked, non-expired bearer registry on `ready` + after generate/revoke/rotate. Bridge builds an `internalValidateFn` from `BearerRegistryCache`:
   - cache === null (cold / module never connected) → `foundry_unreachable` (503)
   - token absent from pushed registry → `unknown_token` (401)
   - token present but `expiresAt <= now` → `expired` (401)
   - token present + not expired → `valid` (200)

2. `r1.characters.available` — Foundry module pushes the player-character roster on `ready` + actor lifecycle hooks. Bridge serves `GET /v1/characters` from `CharacterListCache` via `internalSnapshotFn`.

Both pipelines use the existing `/internal/delta` multiplexed onDelta callback — no new socketlib `registerComplexHandler` call. Gate 8 invariant preserved.

## Commits

| Hash | Description |
|------|-------------|
| `ed6ccc8` | feat: shared-protocol bearer-registry + character-list push schemas |
| `ec60dd6` | feat: foundry-module bearer-registry + character-list readers + push wiring |
| `0038f94` | feat: bridge bearer-registry + character-list caches + handlers + server wiring |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Circular import chain prevented direct `readBearerRegistry` import in module.ts**

- **Found during:** Task 2
- **Issue:** `module.ts` importing `readBearerRegistry` from `bearer-registry-reader.ts` creates a circular chain: `module.ts → bearer-registry-reader.ts → pair/bearer-registry.ts → module.ts`. The transitive import of `module.ts` side effects (Hooks.once) during test setup caused `ReferenceError: foundry is not defined`.
- **Fix:** Changed `registerBearerRegistryReader` to return a `BearerRegistryReaderHandle { unsubscribe, reEmit }` object. `module.ts` stores the handle as `bearerRegistryHandle` and calls `bearerRegistryHandle?.reEmit()` in the `scheduleBearerRotation` callback — no direct import of `readBearerRegistry` needed.
- **Files modified:** `packages/foundry-module/src/readers/bearer-registry-reader.ts`, `packages/foundry-module/src/module.ts`
- **Commit:** `ec60dd6`

**2. [Rule 3 - Blocking] Bearer-registry-reader test needed full Foundry global stubs**

- **Found during:** Task 2
- **Issue:** Test importing `bearer-registry-reader.ts` transitively loads `module.ts` (via `pair/bearer-registry.ts`), which has top-level `Hooks.once(...)` side effects requiring Foundry globals.
- **Fix:** Updated test to use `vi.resetModules()` + dynamic imports (`await import(...)`) per `bearer-registry.test.ts` pattern, and added full Foundry global stubs (`Application`, `ApplicationV2`, `Hooks`, `game`, `crypto`).
- **Files modified:** `packages/foundry-module/src/readers/__tests__/bearer-registry-reader.test.ts`
- **Commit:** `ec60dd6`

## Pre-existing Lint Issues (Out of Scope)

Biome lint reports 8 errors in pre-existing files not modified by this task:
- `packages/bridge/src/routes/portrait.test.ts` (2 × `useLiteralKeys`)
- `packages/bridge/src/server.ts` (4 × `useLiteralKeys` in code predating this plan)
- `packages/foundry-module/src/pair/PairModal.test.ts` (1 × `noUselessConstructor`)
- `packages/foundry-module/src/pair/socketlib-handlers-dispatch.test.ts` (1 × `noUselessConstructor`)
- etc.

None of my new files (bearer-registry-cache, character-list-cache, handlers, readers) have any lint errors. Pre-existing issues are logged to `deferred-items.md`.

## Gate 8 Verification

```
grep -v '^#' packages/foundry-module/src/pair/socketlib-handlers.ts | grep -c registerComplexHandler
→ 19 (17 actual call lines + 2 comment lines, unchanged)
```

The plan verification expected `= "17"` but the pre-existing count is 19 (17 actual + 2 comment lines in TypeScript `//` style that `grep -v '^#'` does not strip). No new calls were added; Gate 8 is preserved.

## Verification Results

| Check | Result |
|-------|--------|
| `corepack pnpm typecheck` | 0 errors |
| `corepack pnpm lint:ci` | 8 errors (all pre-existing, none in new files) |
| `corepack pnpm test` | 2996 passed / 209 files |
| `corepack pnpm changeset:status` | @evf/bridge, @evf/foundry-module declared (shared-protocol bumped transitively) |
| `git diff --quiet packages/bridge/src/index.ts` | INDEX_UNCHANGED |
| socketlib count | 19 (unchanged) |

## Known Stubs

None. All push endpoints are fully wired:
- `BearerRegistryCache.get()?.bearers` → real lookup in `internalValidateFn`
- `CharacterListCache.get()?.characters ?? []` → real characters in `internalSnapshotFn`

## Threat Surface Scan

No new network endpoints, auth paths, or file access patterns beyond what the plan's `<threat_model>` documents. The `/internal/delta` endpoint is the only trust boundary extended and it was already gated by `EVF_INTERNAL_SECRET`.

## Self-Check: PASSED

Files created/modified verified:
- `packages/shared-protocol/src/payloads/bearer-registry.ts` ✓
- `packages/shared-protocol/src/payloads/character-list.ts` ✓
- `packages/bridge/src/cache/bearer-registry-cache.ts` ✓
- `packages/bridge/src/cache/character-list-cache.ts` ✓
- `packages/bridge/src/ws/bearer-registry-handler.ts` ✓
- `packages/bridge/src/ws/character-list-handler.ts` ✓
- `packages/foundry-module/src/readers/bearer-registry-reader.ts` ✓
- `packages/foundry-module/src/readers/character-list-reader.ts` ✓
- `packages/bridge/src/server.ts` (internalValidateFn + internalSnapshotFn + caches + multiplex) ✓
- `.changeset/real-foundry-pairing-push.md` ✓

Commits verified in git log:
- `ed6ccc8` ✓
- `ec60dd6` ✓
- `0038f94` ✓
