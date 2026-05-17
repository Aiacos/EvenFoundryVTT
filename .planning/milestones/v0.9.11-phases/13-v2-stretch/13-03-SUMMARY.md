---
phase: 13-v2-stretch
plan: "03"
subsystem: bridge-portrait-pipeline
tags: [portrait, ssrf, cache, dither, sharp, image-q, upng-js, tdd]
dependency_graph:
  requires: ["13-01", "13-02"]
  provides: ["GET /v1/portrait/:actorId", "PortraitCache", "PortraitRenderer", "CharacterSnapshot.portrait"]
  affects: ["packages/bridge", "packages/shared-protocol", "packages/foundry-module"]
tech_stack:
  added: ["sharp@0.34.5", "image-q@4.0.0", "upng-js@2.1.0"]
  patterns:
    - "Floyd-Steinberg dither via ImageQ.applyPaletteSync (mirrors g2-app raster-worker)"
    - "Map insertion-order as LRU (delete+re-insert on get = MRU move)"
    - "SHA-256(resolvedURL) as cache key via Web Crypto API"
    - "DeltaEmitterLike structural interface for testability"
    - "_fetchFn injection for CI-deterministic renderer tests"
key_files:
  created:
    - packages/shared-protocol/src/payloads/portrait.ts
    - packages/shared-protocol/src/payloads/portrait.test.ts
    - packages/bridge/src/portrait/portrait-cache.ts
    - packages/bridge/src/portrait/portrait-cache.test.ts
    - packages/bridge/src/portrait/portrait-renderer.ts
    - packages/bridge/src/portrait/portrait-renderer.test.ts
    - packages/bridge/src/routes/portrait.ts
    - packages/bridge/src/routes/portrait.test.ts
    - packages/bridge/src/types/upng-js.d.ts
  modified:
    - packages/shared-protocol/src/payloads/character.ts
    - packages/shared-protocol/src/payloads/character.test.ts
    - packages/shared-protocol/src/index.ts
    - packages/foundry-module/src/types/foundry-globals.d.ts
    - packages/foundry-module/src/readers/character-reader.ts
    - packages/foundry-module/src/readers/readers.test.ts
    - packages/bridge/src/server.ts
    - packages/bridge/package.json
decisions:
  - "ImageQ.applyPaletteSync (not ErrorDiffusionArray.quantize) — returns PointContainer with toUint8Array()"
  - "PortraitDecodeError uses originalCause (not cause) to avoid ES2022 Error.cause TS4115 conflict"
  - "DeltaEmitterLike structural interface instead of concrete DeltaEmitter class for route opts"
  - "PORT-ROUTE-05 uses http:// (missing host) as malformed URL — :::bad::: resolves to valid path per URL spec"
  - "character-reader: conditional spread for portrait to avoid mutation on actorless snapshots"
  - "z.string().min(1) not z.string().url() for portrait.url — relative paths like worlds/foo/p.webp fail .url()"
metrics:
  duration: ~75 minutes (continued from prior session)
  completed: "2026-05-17"
  tasks_completed: 3
  files_created: 9
  files_modified: 8
---

# Phase 13 Plan 03: Portrait Pipeline (STRETCH-06) Summary

Server-side portrait proxy (GET /v1/portrait/:actorId) with Floyd-Steinberg dithering to 100x60 4-bit indexed-palette PNG via sharp+image-q+upng-js, SSRF defense, LRU+TTL cache keyed by SHA-256(resolvedURL), and WS push via r1.portrait.ready on cache miss.

## Tasks

| # | Task | Commit | Tests |
|---|------|--------|-------|
| 1 | Portrait schema + CharacterSnapshot.portrait + character-reader img | 2ef58f8 | PR-PAYLOAD-01..07, CS-PORT-01..04, CR-PORT-01..03 (14 tests) |
| 2 | PortraitCache LRU+TTL + PortraitRenderer sharp+image-q+upng-js | 871da75 | PC-01..08b, PR-RENDER-01..06 (15 tests) |
| 3 | GET /v1/portrait/:actorId route + server.ts wiring | cbdd54b | PORT-ROUTE-01..12 (12 tests) |

**Total new tests this plan: 41**
**Total passing at plan close: 2392 / 163 test files**

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] ImageQ.applyPaletteSync vs ErrorDiffusionArray.quantize**
- **Found during:** Task 2 (PortraitRenderer implementation)
- **Issue:** `new ImageQ.image.ErrorDiffusionArray().quantize()` returns an iterator/sequence — `toUint8Array()` is undefined on the result
- **Fix:** Used `ImageQ.applyPaletteSync(inContainer, palette, { imageQuantization: 'floyd-steinberg', colorDistanceFormula: 'euclidean-bt709' })` which returns a proper `PointContainer`
- **Files modified:** `packages/bridge/src/portrait/portrait-renderer.ts`
- **Commit:** 871da75

**2. [Rule 1 - Bug] PortraitDecodeError.cause TS4115 conflict**
- **Found during:** Task 2
- **Issue:** `public readonly cause: unknown` in constructor parameters conflicts with ES2022 `Error.cause` property (TS4115)
- **Fix:** Renamed field to `originalCause`, assigned in constructor body (not parameter shorthand)
- **Files modified:** `packages/bridge/src/portrait/portrait-renderer.ts`
- **Commit:** 871da75

**3. [Rule 1 - Bug] PORT-ROUTE-05 malformed URL test expectation**
- **Found during:** Task 3 test run (1 of 12 failing)
- **Issue:** `':::bad:::'` resolves to `https://foundry.local/:::bad:::` (valid path per URL spec, not malformed). Test got 200 instead of 400.
- **Fix:** Changed test URL to `'http://'` (missing host — truly throws from `new URL()`)
- **Files modified:** `packages/bridge/src/routes/portrait.test.ts`
- **Commit:** cbdd54b

**4. [Rule 1 - Bug] DeltaEmitterLike structural interface needed**
- **Found during:** Task 3 TypeScript check (exactOptionalPropertyTypes)
- **Issue:** Mock `{ emitDelta: vi.fn() }` did not satisfy concrete `DeltaEmitter` class type; `RegisterPortraitRouteOpts.deltaEmitter?: DeltaEmitter` forced full class structure in tests
- **Fix:** Defined `DeltaEmitterLike { emitDelta(type, payload): void }` interface in portrait.ts; used it in opts type; production `DeltaEmitter` satisfies it structurally
- **Files modified:** `packages/bridge/src/routes/portrait.ts`
- **Commit:** cbdd54b

**5. [Rule 2 - Missing critical] `catch { }` for Biome noUnusedVariables**
- **Found during:** Task 2
- **Issue:** `catch (err) { throw new PortraitFetchError(...) }` — `err` unused in the rethrow branch
- **Fix:** Changed to `catch { throw ... }` (empty catch variable)
- **Files modified:** `packages/bridge/src/portrait/portrait-renderer.ts`
- **Commit:** 871da75

## Known Stubs

None — all portrait pipeline stages are fully wired. The `foundryOrigin` in server.ts falls back to `http://localhost:30000` when `EVF_FOUNDRY_ORIGIN_HOST` is not set (expected for local dev).

## Threat Flags

None — the threat model items T-13-02 (SSRF) and T-13-03 (cache poisoning) were the subject of this plan and are fully mitigated:
- T-13-02: scheme check (http/https only) + SSRF_DENY_LIST (cloud metadata + loopback) + allowedHosts allowlist
- T-13-03: SHA-256(resolvedURL) cache key + actor ownership re-verified per request via foundrySnapshotFn

## Self-Check: PASSED

- `packages/bridge/src/routes/portrait.ts` — FOUND
- `packages/bridge/src/routes/portrait.test.ts` — FOUND
- `packages/bridge/src/portrait/portrait-cache.ts` — FOUND
- `packages/bridge/src/portrait/portrait-renderer.ts` — FOUND
- `packages/shared-protocol/src/payloads/portrait.ts` — FOUND
- Commits: 2ef58f8, 871da75, cbdd54b — all in git log
- 2392 tests passing, 0 failures
