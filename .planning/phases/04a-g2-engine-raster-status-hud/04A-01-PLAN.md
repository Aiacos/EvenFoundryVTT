---
phase: 04a
plan: 01
type: execute
wave: 0
depends_on: []
files_modified:
  - packages/g2-app/package.json
  - packages/g2-app/src/engine/layer-types.ts
  - packages/g2-app/src/engine/__tests__/.gitkeep
  - packages/g2-app/src/raster/__tests__/.gitkeep
  - packages/g2-app/src/status-hud/__tests__/.gitkeep
  - packages/g2-app/src/__tests__/test-helpers/worker-mock.ts
  - packages/g2-app/vitest.config.ts
  - docs/architecture/0009-layer-manager-contract.md
  - .changeset/phase-04a-engine-raster.md
autonomous: true
requirements: [DISP-02]
user_setup: []
tags: [g2-app, scaffolding, adr-0009, layer-manager, wave-0]
must_haves:
  truths:
    - "image-q@4.0.0, upng-js@2.1.0, xxhash-wasm@1.1.0 are installed in packages/g2-app/package.json dependencies"
    - "ADR-0009 file exists at docs/architecture/0009-layer-manager-contract.md with status: proposed and MADR template structure"
    - "layer-types.ts exports ZIndex enum (Z0_MAP, Z0_5_IDLE_INFILL, Z1_STATUS_HUD, Z2_OVERLAY), Layer interface, LayerOp tagged union, LayerManagerError class with code discriminator"
    - "All three test directories exist (engine/__tests__, raster/__tests__, status-hud/__tests__)"
    - "Worker-mock test helper exposes OffscreenCanvas + postMessage stubs for happy-dom"
    - "pnpm install --frozen-lockfile && pnpm typecheck exit 0"
  artifacts:
    - path: "packages/g2-app/package.json"
      provides: "dependencies for image-q, upng-js, xxhash-wasm at exact pinned versions"
      contains: "\"image-q\": \"4.0.0\""
    - path: "packages/g2-app/src/engine/layer-types.ts"
      provides: "ZIndex enum + Layer interface + LayerOp + LayerManagerError — interface contracts for downstream plans"
      exports: ["ZIndex", "Layer", "LayerOp", "LayerManagerError", "LayerManagerErrorCode"]
    - path: "docs/architecture/0009-layer-manager-contract.md"
      provides: "MADR ADR scaffold for Layer Manager contract; status=proposed; ACCEPTED in Plan 05"
      contains: "ADR-0009: Layer Manager Contract"
    - path: "packages/g2-app/src/__tests__/test-helpers/worker-mock.ts"
      provides: "happy-dom-compatible OffscreenCanvas + Worker postMessage stubs"
      exports: ["createMockOffscreenCanvas", "createMockWorker"]
    - path: ".changeset/phase-04a-engine-raster.md"
      provides: "changeset declaring g2-app + shared-render minor bump for Phase 4a"
      contains: "@evf/g2-app: minor"
  key_links:
    - from: "packages/g2-app/src/engine/layer-types.ts"
      to: "@evf/shared-protocol"
      via: "import { ServerCap } for capability gating"
      pattern: "import type \\{ ServerCap \\} from '@evf/shared-protocol'"
    - from: "packages/g2-app/vitest.config.ts"
      to: "packages/g2-app/src/__tests__/test-helpers/worker-mock.ts"
      via: "vitest setup or test discovery"
      pattern: "happy-dom"

threat_model:
  trust_boundaries:
    - description: "Phase 4a Wave 0 is pure scaffolding — no runtime behavior added. Trust boundaries inherit from existing g2-app surface (Bridge WS, EvenAppBridge envelope)."
  threats:
    - id: "T-4a-W0-01"
      category: "S"
      component: "package.json npm dependencies"
      disposition: "mitigate"
      mitigation_plan: "Pin exact versions (image-q@4.0.0, upng-js@2.1.0, xxhash-wasm@1.1.0) per RESEARCH.md §Standard Stack; pnpm uses --frozen-lockfile in CI per .github/workflows/ci.yml gate 1. Supply-chain risk reduced to lockfile commit review."
    - id: "T-4a-W0-02"
      category: "T"
      component: "ADR-0009 scaffold"
      disposition: "accept"
      mitigation_plan: "ADR is documentation; tampering pre-merge is caught by code review. Status remains `proposed` until Plan 05 ACCEPTs after layer-manager tests are green."
---

<objective>
Land all Phase 4a Wave 0 scaffolding so subsequent plans (02–05) can execute against stable contracts.

Purpose: This plan is the interface-first foundation — it produces the type contracts (ZIndex, Layer, LayerOp), ADR-0009 scaffold, npm dependencies, and test directory structure that Plans 02–05 consume without re-discovery. No runtime behavior is added.

Output: 9 files committed; pnpm typecheck green; downstream plans have ZIndex enum, Layer interface, LayerManagerError, ADR-0009 file path, and Worker mock test helper available as imports.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/phases/04a-g2-engine-raster-status-hud/04a-CONTEXT.md
@.planning/phases/04a-g2-engine-raster-status-hud/04A-RESEARCH.md
@.planning/phases/04a-g2-engine-raster-status-hud/04A-PATTERNS.md
@.planning/phases/04a-g2-engine-raster-status-hud/04A-UI-SPEC.md
@.planning/phases/04a-g2-engine-raster-status-hud/04A-VALIDATION.md
@docs/architecture/0001-layered-ui-model.md
@docs/architecture/0005-phase0-go-no-go.md
@docs/architecture/0006-raster-pipeline-library-stack.md
@packages/g2-app/package.json
@packages/g2-app/vitest.config.ts
@packages/g2-app/src/wizard/state.ts
@packages/shared-protocol/src/handshake.ts

<interfaces>
<!-- Key types from @evf/shared-protocol that layer-types.ts MUST import (not redefine). -->
<!-- Extracted from packages/shared-protocol/src/handshake.ts and src/index.ts. -->

From packages/shared-protocol/src/handshake.ts:
- `export const SERVER_CAPS_V1 = ['read_char', 'read_combat', 'read_scene', 'subscribe'] as const`
- `export type ServerCap = (typeof SERVER_CAPS_V1)[number]`
- Both re-exported from packages/shared-protocol/src/index.ts

ZIndex values per CONTEXT.md Area 1 + UI-SPEC §Layout Grid (use these literals):
- Z0_MAP = 0
- Z0_5_IDLE_INFILL = 0.5
- Z1_STATUS_HUD = 1
- Z2_OVERLAY = 2

LayerManagerErrorCode union per CONTEXT.md Area 1 + PATTERNS.md layer-types.ts analog:
- 'capture_invariant_violated' | 'capability_gate_denied' | 'z_already_occupied' | 'z_not_mounted'
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Add raster pipeline npm dependencies + bump changeset</name>
  <read_first>
    - packages/g2-app/package.json (current dependencies and devDependencies)
    - .planning/phases/04a-g2-engine-raster-status-hud/04A-RESEARCH.md §Standard Stack lines 105-145 (pinned versions + installation command)
    - .changeset/config.json (for changeset format conventions — existing changeset entries in .changeset/ for style)
  </read_first>
  <files>packages/g2-app/package.json, pnpm-lock.yaml, .changeset/phase-04a-engine-raster.md</files>
  <action>
    Run the exact installation command from RESEARCH.md §Standard Stack:
    `pnpm --filter @evf/g2-app add image-q@4.0.0 upng-js@2.1.0 xxhash-wasm@1.1.0`

    These three packages MUST be added to `dependencies` (not devDependencies) — they ship at runtime in the g2-app Vite bundle. Versions are pinned exact (no `^` or `~` prefix) per CLAUDE.md §Pinned Stack policy and consistent with existing pins.

    Then create `.changeset/phase-04a-engine-raster.md` with frontmatter declaring `@evf/g2-app: minor` and `@evf/shared-render: minor` (because Plan 04 adds 9 new fixture files). Body: one paragraph describing Phase 4a additions ("Phase 4a: G2 Engine + Raster + Status HUD — layer manager, raster pipeline (image-q + upng-js + xxhash-wasm + OffscreenCanvas Web Worker singleton), Status HUD z=1 with IT/EN/DE width budgets, glyph fallback, 9 INV-1 ASCII fixtures.").

    Do NOT run any code yet; this task is install + changeset only.
  </action>
  <verify>
    <automated>pnpm install --frozen-lockfile && grep -c '"image-q": "4.0.0"' packages/g2-app/package.json && grep -c '"upng-js": "2.1.0"' packages/g2-app/package.json && grep -c '"xxhash-wasm": "1.1.0"' packages/g2-app/package.json && test -f .changeset/phase-04a-engine-raster.md && grep -c '@evf/g2-app: minor' .changeset/phase-04a-engine-raster.md</automated>
  </verify>
  <done>
    `pnpm install --frozen-lockfile` exits 0; all three grep counts return >= 1; changeset file exists with `@evf/g2-app: minor` declared.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Create layer-types.ts interface contracts + ADR-0009 scaffold + test directories + worker-mock</name>
  <read_first>
    - packages/g2-app/src/wizard/state.ts (lines 1-105 — analog for module JSDoc header + enum + interface + Store pattern; PATTERNS.md `layer-types.ts` analog)
    - packages/shared-protocol/src/handshake.ts (lines 56-65 — SERVER_CAPS_V1 + ServerCap export shape)
    - docs/architecture/0001-layered-ui-model.md (lines 1-90 — MADR frontmatter + section heading template; PATTERNS.md ADR-0009 analog)
    - docs/architecture/README.md (for the ADR index format — confirm whether ADR-0009 row must be appended here; expand action accordingly)
    - packages/g2-app/vitest.config.ts (current happy-dom environment config)
    - .planning/phases/04a-g2-engine-raster-status-hud/04A-PATTERNS.md §`packages/g2-app/src/engine/layer-types.ts` (exact analog snippet with imports + enum + interface + LayerOp + error class shape)
    - .planning/phases/04a-g2-engine-raster-status-hud/04A-VALIDATION.md §Wave 0 Requirements (the 6-item checklist this task closes)
  </read_first>
  <files>
    packages/g2-app/src/engine/layer-types.ts,
    packages/g2-app/src/engine/__tests__/.gitkeep,
    packages/g2-app/src/raster/__tests__/.gitkeep,
    packages/g2-app/src/status-hud/__tests__/.gitkeep,
    packages/g2-app/src/__tests__/test-helpers/worker-mock.ts,
    docs/architecture/0009-layer-manager-contract.md,
    docs/architecture/README.md
  </files>
  <action>
    Create six artifacts in one task (they are tightly coupled scaffolding with no internal dependencies between them, so a single atomic commit is appropriate):

    1. **`packages/g2-app/src/engine/layer-types.ts`** — module JSDoc header matching wizard/state.ts style (cite ADR-0009 and 04a-CONTEXT.md Area 1). Export:
       - `enum ZIndex { Z0_MAP = 0, Z0_5_IDLE_INFILL = 0.5, Z1_STATUS_HUD = 1, Z2_OVERLAY = 2 }`
       - `interface Layer { readonly id: string; draw(): Promise<void>; destroy(): void; getCaptureContainer?(): string }` with TSDoc on every member (per INV-4)
       - `type LayerOp = { type: 'mount'; z: ZIndex; layer: Layer; requiredCaps?: ReadonlyArray<ServerCap> } | { type: 'destroy'; z: ZIndex }` (note `requiredCaps` to support Plan 02 capability gating)
       - `type LayerManagerErrorCode = 'capture_invariant_violated' | 'capability_gate_denied' | 'z_already_occupied' | 'z_not_mounted'`
       - `class LayerManagerError extends Error { constructor(public readonly code: LayerManagerErrorCode, message: string) { super(message); this.name = 'LayerManagerError' } }`

       Import `type { ServerCap }` from `@evf/shared-protocol`. No runtime behavior; types only. The file MUST type-check standalone under TS strict + noUncheckedIndexedAccess.

    2. **`packages/g2-app/src/engine/__tests__/.gitkeep`**, **`packages/g2-app/src/raster/__tests__/.gitkeep`**, **`packages/g2-app/src/status-hud/__tests__/.gitkeep`** — empty placeholder files so the directories are version-controlled before Plans 02-04 add tests.

    3. **`packages/g2-app/src/__tests__/test-helpers/worker-mock.ts`** — happy-dom helpers consumed by Plan 03 raster tests. Export:
       - `createMockOffscreenCanvas(width: number, height: number): OffscreenCanvas-compatible mock` — minimal stub exposing `getContext('2d')` returning an object with `drawImage`, `getImageData`, `putImageData`, `imageSmoothingQuality`. Use happy-dom's Canvas when available; otherwise hand-rolled object.
       - `createMockWorker(): Worker-compatible mock` — exposes `postMessage(msg, transferList?)`, `onmessage` setter, `terminate()`, `addEventListener('message'|'error', handler)`, `removeEventListener(...)`. Internally a simple EventTarget. Used by Plan 03 raster-controller.test.ts.

       JSDoc header citing 04a-RESEARCH.md Pitfall 4 (Vite Worker import) and 04a-VALIDATION.md §Wave 0 Requirements.

    4. **`docs/architecture/0009-layer-manager-contract.md`** — MADR scaffold copying frontmatter + section structure from ADR-0001 verbatim. Set `status: proposed`, `date: 2026-05-15`, `deciders: aiacos (DM/PO/sole-developer)`, `consulted: Claude Code (Opus 4.7, planning agent)`. Title: `# ADR-0009: Layer Manager Contract — mount/destroy/bundle API + capture-container invariant`. Status line: `**PROPOSED** — 2026-05-15. Will move to ACCEPTED in Phase 4a Plan 05 after layer-manager tests are green.`. Populate `Context and Problem Statement`, `Decision Drivers`, `Considered Options`, `Decision Outcome` with content derived from 04a-CONTEXT.md Area 1 (4 locked decisions) and 04A-RESEARCH.md Pattern 3 (capture invariant). Leave `Confirmation` referencing Plan 02 unit tests + Plan 05 smoke test. No Amendments section needed at creation time.

    5. **Update `docs/architecture/README.md`** — append a row to the ADR index referencing ADR-0009 with status `Proposed`. Read the existing file first to match exact row formatting; do not invent columns. (If README.md does not contain an ADR table, skip the README edit and note in summary.)

    No runtime imports of these files from non-test code yet — Plans 02-04 will import them.
  </action>
  <verify>
    <automated>test -f packages/g2-app/src/engine/layer-types.ts && test -f docs/architecture/0009-layer-manager-contract.md && test -f packages/g2-app/src/__tests__/test-helpers/worker-mock.ts && test -f packages/g2-app/src/engine/__tests__/.gitkeep && test -f packages/g2-app/src/raster/__tests__/.gitkeep && test -f packages/g2-app/src/status-hud/__tests__/.gitkeep && grep -c 'export enum ZIndex' packages/g2-app/src/engine/layer-types.ts && grep -c 'Z0_5_IDLE_INFILL = 0.5' packages/g2-app/src/engine/layer-types.ts && grep -c 'export interface Layer' packages/g2-app/src/engine/layer-types.ts && grep -c 'capture_invariant_violated' packages/g2-app/src/engine/layer-types.ts && grep -c 'export class LayerManagerError' packages/g2-app/src/engine/layer-types.ts && grep -c '^status: proposed' docs/architecture/0009-layer-manager-contract.md && grep -c 'ADR-0009: Layer Manager Contract' docs/architecture/0009-layer-manager-contract.md && pnpm typecheck</automated>
  </verify>
  <done>
    All six file existence checks pass; all grep counts >= 1 (proves enum members, error union, ADR status frontmatter, and ADR title are present); `pnpm typecheck` exits 0 against the new types.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| npm registry → repo | Three new packages (image-q, upng-js, xxhash-wasm) cross supply-chain boundary at install time |
| Documentation → Phase 4a downstream agents | ADR-0009 scaffold becomes load-bearing context for Plans 02-05 executors |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-4a-W0-01 | S | package.json npm deps | mitigate | Pin exact versions (no `^`/`~`) per CLAUDE.md §Pinned Stack; CI uses `pnpm install --frozen-lockfile` per .github/workflows/ci.yml gate 1; lockfile change reviewed in PR |
| T-4a-W0-02 | T | docs/architecture/0009-layer-manager-contract.md | accept | ADR scaffolded as `status: proposed`; ACCEPTED transition only after Plan 05 verifies tests are green. Reviewer-gated. |
| T-4a-W0-03 | I | packages/g2-app/src/engine/layer-types.ts | accept | Pure type definitions, no secrets, no I/O. Source visible to all contributors by design. |
</threat_model>

<verification>
After both tasks complete:
- `pnpm install --frozen-lockfile && pnpm typecheck && pnpm lint:ci` all exit 0
- `grep -c '"image-q": "4.0.0"' packages/g2-app/package.json` returns 1
- `grep -c 'export enum ZIndex' packages/g2-app/src/engine/layer-types.ts` returns 1
- ADR-0009 file exists with `status: proposed` frontmatter
- Three test directories exist with .gitkeep markers
- Worker-mock helper exports `createMockOffscreenCanvas` and `createMockWorker`
</verification>

<success_criteria>
Plan 01 closes when:
- 9 files committed (package.json, lockfile, layer-types.ts, 3× .gitkeep, worker-mock.ts, ADR-0009, changeset)
- DISP-02 partially addressed (capture-invariant contract codified in LayerManagerErrorCode union; enforcement in Plan 02)
- All 6 items in 04A-VALIDATION.md §Wave 0 Requirements satisfied except fixture files (those land in Plan 04)
- ADR-0009 scaffolded as `proposed`; transition to `accepted` happens in Plan 05
- Plans 02-04 can `import type { ZIndex, Layer, LayerOp, LayerManagerError } from '../engine/layer-types.ts'` without ambiguity
</success_criteria>

<output>
After completion, create `.planning/phases/04a-g2-engine-raster-status-hud/04a-01-SUMMARY.md` capturing:
- Final pinned versions for image-q, upng-js, xxhash-wasm (confirm match RESEARCH.md)
- ADR-0009 status (proposed) and the Plan 05 ACCEPT trigger
- Any deviation from the analog pattern (e.g., if docs/architecture/README.md format required reshaping the ADR row)
- pnpm typecheck output confirming the new types compile under strict mode
</output>
