---
phase: "07-foundry-module-write-path"
plan: "05"
subsystem: foundry-module, g2-app, shared-protocol
tags: [write-path, tdd, reaction-watcher, drop-concentration, dual-emit, socketlib, wave-3]
dependency_graph:
  requires: ["07-02", "07-03", "07-04"]
  provides: ["REACT-01", "CONC-01", "B-4-closure", "W-4-closure"]
  affects: [socketlib-handlers, ConcentrationDropModalPanel, module.ts]
tech_stack:
  added:
    - DropConcentrationInputSchema (strict Zod object: actor_id + effect_id)
    - ReactionAvailablePayloadSchema (kind enum + sourceName + expiresAt)
    - crypto.randomUUID() for idempotencyKey per tap
  patterns:
    - Dual-emit tap path (tool.invoke first, then legacy conc.drop.confirmed)
    - Double trust boundary in dispatchersqt (EnvelopeSchema + inner payload schema)
    - Graceful fallback when actorId absent (legacy-only emit)
    - Hooks.on('dnd5e.preUseActivity') — NEVER returns false (display-only Phase 7)
    - Stub rename in-place (evf.setTargets → evf.dropConcentration, count stays 14)
key_files:
  created:
    - packages/shared-protocol/src/payloads/reaction.ts
    - packages/shared-protocol/src/payloads/reaction.test.ts
    - packages/shared-protocol/src/tools/drop-concentration.ts
    - packages/shared-protocol/src/tools/drop-concentration.test.ts
    - packages/foundry-module/src/write-path/handlers/drop-concentration.ts
    - packages/foundry-module/src/write-path/handlers/drop-concentration.test.ts
    - packages/foundry-module/src/write-path/reaction-watcher.ts
    - packages/foundry-module/src/write-path/reaction-watcher.test.ts
    - packages/g2-app/src/panels/reaction-toast-dispatcher.ts
    - packages/g2-app/src/panels/reaction-toast-dispatcher.test.ts
    - packages/g2-app/src/panels/concentration-drop-modal.test.ts
  modified:
    - packages/shared-protocol/src/payloads/concentration.ts (actorId?: string.optional())
    - packages/shared-protocol/src/index.ts (added reaction + drop-concentration exports)
    - packages/foundry-module/src/write-path/handlers/index.ts (Wave 3 registration)
    - packages/foundry-module/src/pair/socketlib-handlers.ts (evf.setTargets → evf.dropConcentration)
    - packages/foundry-module/src/pair/socketlib-handlers.test.ts (updated assertions)
    - packages/foundry-module/src/module.ts (registerReactionWatcher wired)
    - packages/foundry-module/src/module.test.ts (evf.dropConcentration + dnd5e.preUseActivity assertions)
    - packages/foundry-module/src/types/foundry-globals.d.ts (FoundryUser.character + FoundryActiveEffect.id)
    - packages/g2-app/src/panels/concentration-drop-modal.ts (dual-emit tap path)
decisions:
  - Dual-emit order: tool.invoke FIRST, then legacy conc.drop.confirmed — bridge processes write-path before observability listeners
  - Graceful fallback: when actorId undefined (Phase 4b pre-07-05 payloads), only legacy envelope sent (1 send vs 2)
  - crypto.randomUUID() declared ambient — available in WKWebView (iOS Baseline 2021); stubbed in tests
  - dnd5e.preUseActivity — correct hook name per dnd5e 5.3.3 source (CONTEXT.md §Area 3 had wrong preActivityUse which does not exist)
  - Stub rename not addition: evf.setTargets → evf.dropConcentration in-place; registerComplexHandler count stays exactly 14
metrics:
  duration: "~45 minutes"
  completed: "2026-05-16"
  tasks_completed: 2
  tests_total: 1588
  files_created: 11
  files_modified: 8
---

# Phase 07 Plan 05: Reaction Watcher + Drop-Concentration Handler (Wave 3) Summary

One-liner: `dnd5e.preUseActivity` reaction watcher + `dropConcentrationHandler` + dual-emit ConcentrationDropModalPanel closing REACT-01 and CONC-01

## Task 1: REACT-01 Closure (Committed: e03f8aa)

Implemented the full reaction-detection pipeline:

**`packages/shared-protocol/src/payloads/reaction.ts`**
- `R1_REACTION_AVAILABLE_TYPE = 'r1.reaction.available'`
- `ReactionAvailablePayloadSchema`: strict object with `kind: z.enum(['shield','counterspell','opportunity-attack'])`, `sourceName: string.min(1)`, `expiresAt: number.int()`

**`packages/foundry-module/src/write-path/reaction-watcher.ts`**
- Registers `Hooks.on('dnd5e.preUseActivity', ...)` — CORRECT hook name (not preActivityUse which does not exist in dnd5e 5.3.3)
- NEVER returns `false` from handler (void return type enforced — display-only Phase 7)
- Phase 7 broad heuristic: NPC attack → `'shield'`; NPC spell → `'counterspell'`; else null (skip)
- Skips if acting actor is the player's own character (`game.user?.character?.id`)
- Defensive try/catch with `console.warn` telemetry

**`packages/g2-app/src/panels/reaction-toast-dispatcher.ts`**
- Double trust boundary: `EnvelopeSchema.safeParse` → narrow on `R1_REACTION_AVAILABLE_TYPE` → `ReactionAvailablePayloadSchema.safeParse`
- `formatReactionText()`: IT: `REAZ: ${kind} (${name})`, EN: `REACT: ${kind} (${name})`, max 38 chars
- Returns unsubscribe closure (idempotent)

**`packages/foundry-module/src/module.ts`**
- `registerReactionWatcher(payload => bridgeDeltaEmitter('r1.reaction.available', payload))` wired in ready hook

Tests: 13 payload schema tests + 8 reaction-watcher tests + 7 dispatcher tests = 28 new tests

## Task 2: CONC-01 Write Closure (Committed: ecd7fea)

Implemented the full drop-concentration write path:

**`packages/shared-protocol/src/tools/drop-concentration.ts`**
- `DropConcentrationInputSchema`: strict object `{ actor_id: string.min(1), effect_id: string.min(1) }`
- NOT added to 7-entry TOOL_REGISTRY (module-internal, socketlib-dispatched only)

**`packages/shared-protocol/src/payloads/concentration.ts`**
- `ConcConflictPayloadSchema` widened: added `actorId: z.string().min(1).optional()` (additive, Phase 4b tests stay green)

**`packages/foundry-module/src/write-path/handlers/drop-concentration.ts`**
- Resolves actor from `game.actors.get(actor_id)` → `actor_not_found`
- Finds effect from `actor.effects.contents.find(e => e.id === effect_id)` → `effect_not_found`
- Calls `await effect.delete()` → success: `{ effectId }` | normalized errors: `no_gm_connected`, `<message>`

**`packages/foundry-module/src/pair/socketlib-handlers.ts`**
- `evf.setTargets` stub renamed in-place to `evf.dropConcentration` using `makeDispatchAdapter('drop-concentration')`
- Total `registerComplexHandler` count: 14 (unchanged)

**`packages/g2-app/src/panels/concentration-drop-modal.ts`**
- `onEvent({ kind: 'tap' })` extended: dual-emit path
  1. `tool.invoke` envelope (when `conflict.actorId` present): `toolId: 'drop-concentration'`, `idempotencyKey: crypto.randomUUID()`, `args: { actor_id, effect_id }`
  2. Legacy `conc.drop.confirmed` (always — W-4 backward-compat regression guard)
- Graceful fallback: when `actorId` undefined → only 1 send (legacy)

**Tests updated:**
- `socketlib-handlers.test.ts`: `evf.setTargets` NOT registered, `evf.dropConcentration` IS registered
- `module.test.ts`: `evf.dropConcentration` handler + `dnd5e.preUseActivity` hook assertions
- 8 new Plan 07-05 CDM tests (CDM-01..CDM-08) covering dual-emit, fallback, regression guards

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Type Field] FoundryUser.character + FoundryActiveEffect.id**
- **Found during:** Task 1 GREEN (reaction-watcher.ts), Task 2 GREEN (drop-concentration.ts)
- **Issue:** `FoundryUser` lacked `character?: { id: string } | null` needed by `game.user?.character?.id`. `FoundryActiveEffect` lacked `id: string` needed by effect ID lookup.
- **Fix:** Added both fields to `packages/foundry-module/src/types/foundry-globals.d.ts`
- **Files modified:** `foundry-globals.d.ts`
- **Commit:** e03f8aa

**2. [Rule 3 - Biome Format] Import ordering applied to touched pre-existing files**
- **Found during:** Task 2 post-implementation lint run
- **Issue:** `pnpm lint:ci` reported `organizeImports` assist suggestions on pre-existing handler test files
- **Fix:** `pnpm format` applied; 23 files formatted (import order normalization only)
- **Files modified:** Multiple pre-existing test files
- **Commit:** ecd7fea

## Known Stubs

None — all implemented functionality is fully wired.

## Threat Flags

None — no new network endpoints or auth surfaces introduced. `drop-concentration` routes through the existing `evf.dropConcentration` socketlib handler (covered by bearer validation in `dispatchTool` pipeline). `dnd5e.preUseActivity` hook is read-only (display-only, NEVER returns `false`).

## Self-Check: PASSED
