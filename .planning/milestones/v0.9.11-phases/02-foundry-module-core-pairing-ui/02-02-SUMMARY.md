---
phase: 02-foundry-module-core-pairing-ui
plan: 02
subsystem: foundry-module
tags: [bearer-registry, pair-modal, socketlib, qr-code, tdd, wave-1]
dependency_graph:
  requires:
    - 02-01 (module skeleton — MODULE_ID, registerSettings, lang catalogs)
  provides:
    - Bearer token CRUD (generateBearer, validateBearer, revokeBearer, listBearers)
    - PairModal ApplicationV2 with 5 UI states
    - socketlib GM-side handlers (evf.validateToken, evf.revokeToken)
    - pair-modal.hbs Handlebars template
  affects:
    - 02-03 (phone wizard — consumes bearer QR payload)
    - 02-04 (bridge handshake — consumes evf.validateToken via socketlib)
    - 02-05 (reader API — consumes internalSecret for /internal/delta POST auth)
tech_stack:
  added:
    - qrcode@1.5.4 (SVG QR generation, no native deps)
    - "@types/qrcode@1.5.5" (TS types)
  patterns:
    - ApplicationV2 subclass with getData() → Handlebars template context
    - vi.resetModules() + vi.stubGlobal() per-test module isolation
    - In-memory Map<string, unknown> backing game.settings.get/set mock
    - Counter-based crypto mock for distinct multi-call token generation
key_files:
  created:
    - packages/foundry-module/src/pair/bearer-registry.ts
    - packages/foundry-module/src/pair/bearer-registry.test.ts
    - packages/foundry-module/src/pair/PairModal.ts
    - packages/foundry-module/src/pair/PairModal.test.ts
    - packages/foundry-module/src/pair/socketlib-handlers.ts
    - packages/foundry-module/src/pair/socketlib-handlers.test.ts
    - packages/foundry-module/templates/pair-modal.hbs
  modified:
    - packages/foundry-module/src/settings.ts
    - packages/foundry-module/src/module.ts
    - packages/foundry-module/src/module.test.ts
    - packages/foundry-module/src/types/foundry-globals.d.ts
    - packages/foundry-module/package.json
decisions:
  - "PairModalData extends Record<string, unknown> to satisfy ApplicationV2.getData() covariant return type while retaining named fields"
  - "exactOptionalPropertyTypes fix in socketlib-handlers: conditionally include reason key only when defined"
  - "PairModal cast as unknown as new(...args: unknown[]) => object at registerMenu call site — Foundry types are variadic at runtime"
  - "noConsole allow:[error,warn] in biome.jsonc means console.error is pre-allowed; no suppression comment needed"
  - "module.ts registers both Hooks.once(init) and Hooks.once(ready) — init for settings, ready for socketlib handlers"
metrics:
  duration: "Resumed from partial session; active execution ~60 min"
  completed: "2026-05-11"
  tasks_completed: 2
  tests_added: 55
  files_created: 7
  files_modified: 5
  coverage_final: "91.42% stmts / 84% branches / 92.5% funcs / 92.54% lines"
---

# Phase 02 Plan 02: Bearer Registry + PairModal + socketlib Handlers Summary

**One-liner:** Opaque 32-byte base64url bearer tokens with per-pair internalSecret, ApplicationV2 pair modal (5 UI states + QR SVG), and socketlib executeAsGM handlers for bridge token validation.

## What Was Built

### Task 1: Bearer Registry (TDD RED→GREEN)

`packages/foundry-module/src/pair/bearer-registry.ts` implements the Foundry-authoritative bearer token store backed by `game.settings` (world scope, hidden from UI):

- `generateBearer(alias, bridgeUrl, worldId, refresh?)` — generates two independent 32-byte base64url tokens (`token` + `internalSecret`) via `crypto.getRandomValues`. TTL = 24h. Silent refresh (`refresh=true`) applies a 60s grace period to the outgoing entry (D-2.11, CONN-05).
- `validateBearer(token)` — returns `{ valid: true, entry }` or `{ valid: false, reason: 'unknown_token'|'revoked'|'expired' }`.
- `revokeBearer(token)` — sets `revokedAt = Date.now()` and persists.
- `listBearers()` — returns non-revoked entries sorted by `createdAt` descending.

Tokens are opaque base64url (NO dots — explicitly NOT JWT), 43+ chars, no logging of raw values (T-02-01).

### Task 2: PairModal + socketlib handlers

`packages/foundry-module/src/pair/PairModal.ts` — ApplicationV2 pair modal with 5 states:
- `empty` — no devices paired yet (empty-state message, no QR)
- `active` — valid bearer >1h TTL (QR SVG inline, devices table)
- `refresh-needed` — valid bearer <1h TTL (accent countdown, Refresh CTA)
- `expired` — all bearers expired (expired banner, New Code CTA, no QR)
- `pairing-in-progress` — QR shown, awaiting WS handshake (for Plan 04)

QR payload: `{ bridge_url, token, internal_secret, world, expires }` — H-1 fix: `internal_secret` included for Plan 05 `/internal/delta` POST auth.

`packages/foundry-module/src/pair/socketlib-handlers.ts` — two GM-side handlers:
- `evf.validateToken(token)` — type guard + `validateBearer()`, returns serializable result
- `evf.revokeToken(tokenId)` — type guard + `revokeBearer()`, returns `{ success: true }`
- Both registered via `Hooks.once("ready")` in `module.ts`

`packages/foundry-module/templates/pair-modal.hbs` — Handlebars template:
- Triple-mustache `{{{qrSvg}}}` for trusted SVG injection
- All 5 states handled via conditional blocks
- `aria-live="polite"` on action cells, `data-action` attributes for event delegation
- Countdown `<time data-countdown data-expires="...">` updated by 60s interval

### Settings + Module updates

`settings.ts` — `PairModalStub` replaced with real `PairModal`; `bearerRegistry` world-scope setting registered.

`module.ts` — Added `Hooks.once("ready", () => registerSocketlibHandlers())` alongside the existing `Hooks.once("init", () => registerSettings())`.

## Test Results

- **55 tests pass** across 4 test files
- **Coverage: 91.42% statements / 84% branches / 92.5% functions** — all ≥ 80% gate
- Typecheck: clean (`tsc --noEmit` exits 0)
- Lint: clean (`biome check` exits 0)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Functionality] `makeGameMock` in test files used vi.fn() without backing store**
- **Found during:** Task 2 testing — socketlib-handlers tests failing with `{ valid: false }` for valid tokens
- **Issue:** `game.settings.get/set` mocks were stateless — `generateBearer`'s writes were lost between calls
- **Fix:** Changed all `makeGameMock()` implementations to use `Map<string, unknown>` backing store
- **Files modified:** `bearer-registry.test.ts`, `socketlib-handlers.test.ts`, `PairModal.test.ts`, `module.test.ts`
- **Commit:** `cd25784`

**2. [Rule 1 - Bug] Counter-based crypto mock required to prevent identical token/internalSecret**
- **Found during:** Task 1 TDD — `generateBearer` produced same bytes for `token` and `internalSecret`
- **Issue:** Deterministic mock with `(i * 37 + 7) % 256` produces same bytes for both calls within one `generateBearer()`
- **Fix:** Changed `makeCryptoMock()` to use a counter seed: `((i * 37 + seed * 13 + 7) * 251) % 256`
- **Files modified:** `bearer-registry.test.ts`, `socketlib-handlers.test.ts`, `PairModal.test.ts`
- **Commit:** `cd25784`

**3. [Rule 1 - Bug] TypeScript strict mode errors in PairModal.ts**
- **Found during:** Typecheck pass post-Task 2
- **Issues:**
  - `MODULE_ID` imported but unused (removed)
  - `PairModalData` lacked index signature for `Record<string, unknown>` covariance (`extends Record<string, unknown>` added)
  - `defaultOptions` return type annotation simplified to inline object type
  - `NodeListOf<Element>` iterator requires `Array.from()` wrapper
  - `exactOptionalPropertyTypes`: `result.reason` narrowed before inclusion
  - `FoundrySettings.registerMenu` `type` parameter changed to `new (...args: unknown[]) => object`
  - `settings.ts` cast `PairModal as unknown as new (...args: unknown[]) => object`
- **Fix:** See above individual fixes
- **Files modified:** `PairModal.ts`, `socketlib-handlers.ts`, `foundry-globals.d.ts`, `settings.ts`
- **Commit:** `cd25784`

**4. [Rule 2 - Missing Critical Functionality] PairModal coverage below 80% gate**
- **Found during:** Coverage run post-commit
- **Issue:** DOM interaction methods `_activateListeners`, `_onClickRevoke`, `close()`, `formatLastSeen` branches uncovered (44% PairModal.ts)
- **Fix:** Added 10 new tests covering all DOM interaction paths and formatLastSeen branches using happy-dom's `document.createElement`
- **Files modified:** `PairModal.test.ts`
- **Commit:** `df12cdf`

## Self-Check

### Files created:
- `packages/foundry-module/src/pair/bearer-registry.ts` ✓
- `packages/foundry-module/src/pair/bearer-registry.test.ts` ✓
- `packages/foundry-module/src/pair/PairModal.ts` ✓
- `packages/foundry-module/src/pair/PairModal.test.ts` ✓
- `packages/foundry-module/src/pair/socketlib-handlers.ts` ✓
- `packages/foundry-module/src/pair/socketlib-handlers.test.ts` ✓
- `packages/foundry-module/templates/pair-modal.hbs` ✓

### Commits:
- `841e36d` feat(foundry-module): bearer registry ✓
- `cd25784` feat(foundry-module): PairModal + socketlib handlers ✓
- `df12cdf` test(foundry-module): expand PairModal coverage ✓

## Self-Check: PASSED
