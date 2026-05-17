---
phase: 04a
plan: 01
subsystem: g2-app
tags: [g2-app, scaffolding, adr-0009, layer-manager, wave-0]
dependency_graph:
  requires:
    - "@evf/shared-protocol exports ServerCap (Phase 2)"
    - "Vitest 4 workspace + happy-dom env (Phase 1)"
    - "Biome 2.4.15 (Phase 1)"
  provides:
    - "ZIndex enum / Layer interface / LayerOp / LayerManagerError(Code) — runtime + type"
    - "RasterControllerLike type-only forward contract (B-4 cycle breaker)"
    - "RasterRequest / RasterChangedTile / RasterResponse / RasterFrameInput interfaces"
    - "createMockOffscreenCanvas + createMockWorker test helpers"
    - "ADR-0009 scaffold (status: proposed) — Plan 05 transitions to accepted"
    - "Raster pipeline npm deps pinned (image-q@4.0.0, upng-js@2.1.0, xxhash-wasm@1.1.0)"
  affects:
    - "Plan 02 (LayerManager class implements the contract + invariant tests)"
    - "Plan 03 Task 2 (MapBaseLayer imports type-only RasterControllerLike)"
    - "Plan 03 Task 3 (RasterController concrete class implements RasterControllerLike)"
    - "Plan 04 (Status HUD INV-1 fixtures via @evf/shared-render minor bump)"
    - "Plan 05 (ADR-0009 status transition + acceptance gate)"
tech-stack:
  added:
    - "image-q@4.0.0 (dither + custom palette quantization, worker-safe)"
    - "upng-js@2.1.0 (4-bit indexed-palette PNG encode)"
    - "xxhash-wasm@1.1.0 (sub-tile hash, ~1 GB/s throughput)"
  patterns:
    - "Type-only forward contracts via separate types module (RasterControllerLike pattern)"
    - "Tagged union LayerOp for atomic bundle ops"
    - "Discriminator-coded error class (LayerManagerError) — no bare Error throws"
key-files:
  created:
    - ".changeset/phase-04a-engine-raster.md"
    - "packages/g2-app/src/engine/layer-types.ts"
    - "packages/g2-app/src/engine/__tests__/.gitkeep"
    - "packages/g2-app/src/raster/__tests__/.gitkeep"
    - "packages/g2-app/src/status-hud/__tests__/.gitkeep"
    - "packages/g2-app/src/__tests__/test-helpers/worker-mock.ts"
    - "docs/architecture/0009-layer-manager-contract.md"
  modified:
    - "packages/g2-app/package.json"
    - "pnpm-lock.yaml"
    - "docs/architecture/README.md"
decisions:
  - "Centralized LayerManager class (Option A) over store/event-bus alternatives — atomic bundle + capability gate require synchronous semantics"
  - "Extract layer types into standalone layer-types.ts module — enables type-only forward imports (RasterControllerLike) without import cycles"
  - "RasterResponse uses ReadonlyArray<RasterChangedTile> + optional .error/.skipped — caller degrades to glyph on error instead of throwing"
  - "MockWorker exposes _dispatchMessage + _sentMessages for test-driven response routing without booting a real Web Worker"
metrics:
  duration_minutes: 7
  completed_date: "2026-05-15"
  tasks_completed: 2
  files_created: 7
  files_modified: 3
  commits: 2
requirements:
  partially_addressed:
    - id: "DISP-02"
      role: "type-contract precondition only"
      note: "LayerManagerErrorCode union (containing 'capture_invariant_violated') + RasterControllerLike type-level contract. Runtime enforcement of capture-container invariant + capability gate is in Plan 02; INV-1 fixtures in Plan 04; adversarial budget-bust typecheck test in Plan 04 IB-6."
---

# Phase 04a Plan 01: G2 Engine + Raster + Status HUD — Wave 0 Scaffolding Summary

One-liner: Interface-first foundation for Phase 4a — pinned raster deps + ZIndex/Layer/LayerOp/LayerManagerError contracts, RasterControllerLike forward stub, ADR-0009 (proposed), test directories, and happy-dom Worker mock so Plans 02-05 compile and test at their own commit boundaries.

## What landed

### Task 1 — Raster pipeline deps + changeset (commit `5e53f98`)

Three runtime libraries pinned **exact** in `packages/g2-app/package.json` `dependencies` (not devDeps — they ship in the Vite bundle):

| Library | Version | Role |
|---|---|---|
| `image-q` | `4.0.0` | Floyd-Steinberg / Atkinson / Bayer dither + 16-step custom greyscale palette (worker-safe, no DOM) |
| `upng-js` | `2.1.0` | 4-bit indexed-palette PNG encode (matches G2 wire format §3.1) |
| `xxhash-wasm` | `1.1.0` | Sub-tile hash for delta encoding (~1 GB/s WASM throughput, 5-10× JS murmur) |

Pin sources confirmed against `.planning/phases/04a-g2-engine-raster-status-hud/04A-RESEARCH.md` §Standard Stack. All three appear in `pnpm-lock.yaml` after `pnpm install --frozen-lockfile`.

`.changeset/phase-04a-engine-raster.md` declares:
- `@evf/g2-app: minor` (engine + raster + status HUD modules land in this phase)
- `@evf/shared-render: minor` (Plan 04 will add 9 INV-1 ASCII fixture files)

### Task 2 — Contracts + ADR-0009 + test scaffolds (commit `9764327`)

**`packages/g2-app/src/engine/layer-types.ts`** — single source of truth for all layer-system types. Exports:

| Export | Kind | Purpose |
|---|---|---|
| `ZIndex` | `enum` | `Z0_MAP=0`, `Z0_5_IDLE_INFILL=0.5`, `Z1_STATUS_HUD=1`, `Z2_OVERLAY=2` |
| `Layer` | `interface` | `id`, `draw()`, `destroy()`, optional `getCaptureContainer()` |
| `LayerOp` | tagged union | `{type:'mount', z, layer, requiredCaps?}` / `{type:'destroy', z}` |
| `LayerManagerErrorCode` | string-literal union | 4 codes incl. `capture_invariant_violated` |
| `LayerManagerError` | `class extends Error` | Code-discriminated, never throw bare `Error` |
| `RasterControllerLike` | `interface` (NEW per B-4) | Type-only forward contract — Plan 03 Task 2 imports type-only; Task 3 implements concrete class |
| `RasterRequest` / `RasterChangedTile` / `RasterResponse` / `RasterFrameInput` | interfaces / types | Worker MessageChannel payloads, `ReadonlyArray`-flavored |

The `RasterControllerLike` interface signature (B-4 deliverable):

```ts
export interface RasterControllerLike {
  requestFrame(
    pixelData: Uint8ClampedArray | ImageData,
    width: number,
    height: number,
  ): Promise<RasterResponse>;
  setBleVerdict(v: 'raster' | 'glyph'): void;
  getBleVerdict(): 'raster' | 'glyph' | null;
  startIdleHeartbeat(getCurrentScene: () => Uint8ClampedArray | null): void;
  stopIdleHeartbeat(): void;
  terminate(): void;
}
```

Plan 03 Task 2 (`map-base-layer.ts`) will:
```ts
import type { RasterControllerLike } from '../engine/layer-types.js';
```
…and pass `RasterControllerLike` as a constructor parameter. Plan 03 Task 3 (`raster-controller.ts`) ships:
```ts
export class RasterController implements RasterControllerLike { /* ... */ }
```
This breaks the forward-import cycle that would have failed typecheck at Task 2's commit boundary.

**`packages/g2-app/src/__tests__/test-helpers/worker-mock.ts`** — happy-dom shims:
- `createMockOffscreenCanvas(width, height): MockOffscreenCanvas` with stub 2D context (`drawImage`, `getImageData`, `putImageData`, `imageSmoothingQuality`).
- `createMockWorker(): MockWorker` with `postMessage`, `onmessage`, `addEventListener`, `removeEventListener`, `terminate`, plus test-only `_dispatchMessage(data)` and `_sentMessages()` for response routing and assertions.

**Three `.gitkeep` placeholders** so the colocated test directories are version-controlled before Plans 02-04 land their first tests:
- `packages/g2-app/src/engine/__tests__/.gitkeep`
- `packages/g2-app/src/raster/__tests__/.gitkeep`
- `packages/g2-app/src/status-hud/__tests__/.gitkeep`

**`docs/architecture/0009-layer-manager-contract.md`** — MADR scaffold:
- `status: proposed`, `date: 2026-05-15`
- Documents Option A (centralized `LayerManager` + extracted `layer-types.ts`) over Option B (observable store) and Option C (event-bus)
- Rationale rooted in atomic-bundle requirement + B-4 forward-cycle mitigation
- Confirmation block lists the three Plan 05 gates that lift it to `accepted` (Plan 02 LayerManager tests green, Plan 03 Task 2 typechecks against the type-only contract, Plan 05 atomic-bundle smoke test)

**`docs/architecture/README.md`** — ADR index appended with:

```
| [ADR-0009](./0009-layer-manager-contract.md) | Layer Manager Contract — mount/destroy/bundle API + capture-container invariant | proposed | Phase 4a entry (Plan 05 transitions to accepted) |
```

## Verification

| Gate | Result |
|---|---|
| `pnpm install --frozen-lockfile` | `0` |
| `pnpm typecheck` (`tsc --noEmit -p tsconfig.base.json && pnpm -r exec tsc --noEmit`) | `0` (TS strict + 6 flags, all new types compile) |
| `pnpm lint:ci` (`biome ci .`) | `0` (auto-format applied once on worker-mock.ts during Task 2) |
| `pnpm test` (Vitest 4 workspace) | `451/451` passing across 26 test files; no regressions |
| `grep -c '"image-q": "4.0.0"' packages/g2-app/package.json` | `1` |
| `grep -c 'export enum ZIndex' packages/g2-app/src/engine/layer-types.ts` | `1` |
| `grep -c 'export interface RasterControllerLike' packages/g2-app/src/engine/layer-types.ts` | `1` |
| `grep -c '^status: proposed' docs/architecture/0009-layer-manager-contract.md` | `1` |

## Deviations from Plan

None of Rule 1-3 type. Plan executed as written. One mechanical adjustment that did not require deviation routing:

- During Task 2, `pnpm lint:ci` reported one Biome format diff in the newly created `worker-mock.ts` (the helper's `createMockOffscreenCanvas` signature was wrapped across multiple lines instead of one). Resolution: ran `npx biome check --write packages/g2-app/src/__tests__/test-helpers/worker-mock.ts` to apply the canonical formatter. No semantics changed; the helper's exported signatures and types are identical. This is the Biome formatter doing its assigned job, not a code-correctness defect.

## Pinned Versions — Confirmed Match RESEARCH.md

`04A-RESEARCH.md` §Standard Stack lines 105-145 specified:

```
image-q@4.0.0
upng-js@2.1.0
xxhash-wasm@1.1.0
```

`packages/g2-app/package.json` after Task 1:

```json
"dependencies": {
  ...
  "image-q": "4.0.0",
  "upng-js": "2.1.0",
  "xxhash-wasm": "1.1.0",
  ...
}
```

Pins **exact** (no `^`, no `~`) per `CLAUDE.md` §Pinned Stack policy and consistent with existing pins (e.g. `zod@4.4.3`, `vite@8.0.11`).

## ADR-0009 — Transition Trigger

Current state: `status: proposed`.

Plan 05 will transition to `status: accepted` after these three confirmations:

1. Plan 02 unit tests pass for `LayerManager.mount/destroy/bundle` including:
   - `capture_invariant_violated` thrown when 0 or ≥2 mounted layers report a capture container
   - `capability_gate_denied` thrown when `requiredCaps` not in negotiated `SERVER_CAPS_V1`
   - `z_already_occupied` / `z_not_mounted` for ill-formed `mount`/`destroy` calls
2. Plan 03 Task 2 (`map-base-layer.ts`) typechecks at its own commit boundary using ONLY `import type { RasterControllerLike }` — never importing the concrete class. This confirms B-4 forward-cycle closure.
3. Plan 05 smoke test: a single `bundle([destroy z=0.5, mount z=2])` issues exactly one `rebuildPageContainer` call on the mock `EvenAppBridge`.

## Requirement Coverage

**DISP-02** — Partially addressed (type-contract precondition only):
- Delivered: `LayerManagerErrorCode` union containing the `'capture_invariant_violated'` literal + `RasterControllerLike` type-level contract.
- Not delivered here (intentional): runtime enforcement of the capture-container invariant + capability gate + INV-1 fixture coverage. These live in Plans 02 / 04 / 05 per the planner's overlapping-coverage strategy noted in `04A-PLAN-CHECK.md` B-1.

No other requirement IDs are claimed by this plan.

## Hardware-Pending Items

None. This plan is pure software scaffolding — no `human_needed` gates, no real BLE measurements, no G2 device interaction. All verification is fully automated.

## Known Stubs

None. All exports in `layer-types.ts` are deliberate type contracts (not value stubs flowing to UI); the `RasterControllerLike` interface is the intended forward contract — its concrete class lands in Plan 03 Task 3 by design. No placeholder UI strings, no hardcoded empty arrays flowing to render output.

## Commits

| Hash | Task | Subject |
|---|---|---|
| `5e53f98` | 1 | `chore(g2-app): add raster pipeline deps + Phase 4a changeset` |
| `9764327` | 2 | `feat(g2-app): scaffold layer-types contracts + ADR-0009 + test dirs + worker-mock` |

## Self-Check

### Files asserted created

- `.changeset/phase-04a-engine-raster.md` — FOUND
- `packages/g2-app/src/engine/layer-types.ts` — FOUND
- `packages/g2-app/src/engine/__tests__/.gitkeep` — FOUND
- `packages/g2-app/src/raster/__tests__/.gitkeep` — FOUND
- `packages/g2-app/src/status-hud/__tests__/.gitkeep` — FOUND
- `packages/g2-app/src/__tests__/test-helpers/worker-mock.ts` — FOUND
- `docs/architecture/0009-layer-manager-contract.md` — FOUND

### Files asserted modified

- `packages/g2-app/package.json` — modified in commit `5e53f98`
- `pnpm-lock.yaml` — modified in commit `5e53f98`
- `docs/architecture/README.md` — modified in commit `9764327`

### Commits asserted reachable

- `5e53f98` — present in `git log`
- `9764327` — present in `git log`

## Self-Check: PASSED
