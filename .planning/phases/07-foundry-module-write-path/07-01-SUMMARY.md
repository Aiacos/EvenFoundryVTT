---
phase: "07-foundry-module-write-path"
plan: "01"
subsystem: "foundry-module/write-path + shared-protocol/payloads + ci + docs/architecture"
tags: ["write-path", "idempotency", "audit-log", "tool-registry", "adr", "ci-gate", "security"]
dependency_graph:
  requires: []
  provides:
    - "ToolId union (6 Phase 7 tool IDs)"
    - "ToolHandler<TArgs> interface + ToolResult discriminated union"
    - "TOOL_REGISTRY (Partial<Record<ToolId, ToolHandler>>) + registerToolHandler"
    - "TOOL_HANDLER_IDS (kebab→evf.camelCase socketlib mapping)"
    - "dispatchTool (7-step pipeline: cache → lookup → validate → handle → cache → audit → return)"
    - "moduleIdempotencyStore singleton (IdempotencyStore, 60s TTL, 1000-entry FIFO, bearer-bound)"
    - "writeAuditLog (ChatMessage.create, whisper: gmIds, flags.evf.audit, fault-tolerant)"
    - "ToolInvocationEnvelopePayloadSchema + BearerRotatedPayloadSchema (@evf/shared-protocol)"
    - "game.users + ChatMessage.create + FoundryActiveEffect.delete + dnd5e.canvas.AbilityTemplate declarations"
    - "ADR-0011 ACCEPTED (single-workflow-origin discipline)"
    - "INV-6 GM Authority Preservation (INVARIANTS.md)"
    - "CI Gate 8 (grep activity.use() in g2-app + bridge)"
  affects:
    - "packages/foundry-module/src/write-path/ (new directory)"
    - "packages/shared-protocol/src/payloads/ (new tool.ts)"
    - "packages/foundry-module/src/types/foundry-globals.d.ts (extended)"
    - "docs/architecture/ (0011 + README + INVARIANTS)"
    - ".github/workflows/ci.yml (Gate 8 added)"
    - "packages/bridge/src/routes/tools-dispatch.ts (JSDoc comment fix)"
tech_stack:
  added: []
  patterns:
    - "Hand-rolled Map-based IdempotencyStore (no npm deps) matching bridge's pattern"
    - "SHA-256 bearer hashing via crypto.subtle.digest (platform Web Crypto)"
    - "Bearer-bound cache keys: SHA256(bearer).slice(0,16) + ':' + idempotencyKey"
    - "Structural typing for ArgsValidator<T> (avoids zod as direct foundry-module dep)"
    - "7-step dispatchTool pipeline (cache-lookup → handler → validate → handle → cache → audit → return)"
    - "Fault-tolerant writeAuditLog (try/catch + console.warn, never throws)"
key_files:
  created:
    - "packages/foundry-module/src/write-path/tool-registry.ts"
    - "packages/foundry-module/src/write-path/tool-registry.test.ts"
    - "packages/foundry-module/src/write-path/idempotency-cache.ts"
    - "packages/foundry-module/src/write-path/idempotency-cache.test.ts"
    - "packages/foundry-module/src/write-path/audit-log.ts"
    - "packages/foundry-module/src/write-path/audit-log.test.ts"
    - "packages/shared-protocol/src/payloads/tool.ts"
    - "packages/shared-protocol/src/payloads/tool.test.ts"
    - "docs/architecture/0011-foundry-write-path-single-workflow-origin.md"
  modified:
    - "packages/shared-protocol/src/index.ts (export ToolInvocationEnvelopePayloadSchema, BearerRotatedPayloadSchema)"
    - "packages/foundry-module/src/types/foundry-globals.d.ts (game.users, ChatMessage, dnd5e.canvas, FoundryUser.isGM, FoundryActiveEffect.delete)"
    - "docs/architecture/README.md (ADR-0011 indexed)"
    - "docs/architecture/INVARIANTS.md (INV-6 ratified)"
    - ".github/workflows/ci.yml (Gate 8 added after Gate 7)"
    - "packages/bridge/src/routes/tools-dispatch.ts (JSDoc comment updated to not trigger Gate 8)"
decisions:
  - "ArgsValidator<T> structural type used instead of importing ZodSchema directly — avoids zod as foundry-module prod dep"
  - "evf.dropConcentration forward-referenced in TOOL_HANDLER_IDS JSDoc — Plan 07-05 renames evf.setTargets stub (count stays 14)"
  - "INV-6 GM Authority Preservation added to INVARIANTS.md (recommended by execution rules)"
  - "CI Gate 8 uses explicit if-grep form (RESEARCH §Q8 recommendation) rather than ! grep (CONTEXT.md form)"
  - "Bridge tools-dispatch.ts JSDoc comment updated to remove literal activity.use() text preventing Gate 8 false positive"
metrics:
  duration: "16 minutes"
  completed_date: "2026-05-16"
  tasks_completed: 2
  tasks_total: 2
  files_created: 9
  files_modified: 6
  tests_added: 64
  tests_baseline: 1315
  tests_final: 1379
---

# Phase 7 Plan 01: Write-Path Foundation (Wave 0) Summary

**One-liner:** Hand-rolled IdempotencyStore with SHA-256 bearer-bound keys, writeAuditLog with whisper:gmIds, dispatchTool 7-step pipeline, ToolInvocationEnvelopePayloadSchema, foundry-globals extensions, ADR-0011 ACCEPTED, and CI Gate 8 enforcing single-workflow-origin discipline.

## Completed Tasks

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | ToolId/ToolHandler/TOOL_REGISTRY scaffold + schemas + foundry-globals | `20aeab5` | tool-registry.ts, tool.ts, foundry-globals.d.ts |
| 2 | IdempotencyStore + writeAuditLog + dispatchTool + ADR-0011 + Gate 8 | `958dcdd` | idempotency-cache.ts, audit-log.ts, tool-registry.ts, 0011-ADR.md, ci.yml |

## Deliverables

### Tool Registry (`packages/foundry-module/src/write-path/tool-registry.ts`)

Exports:
- `ToolId` — union of 6 Phase 7 tool IDs (kebab-case)
- `ToolResult` — `{ success: true; data: unknown } | { success: false; error: string }`
- `ToolHandler<TArgs>` — `{ argsSchema: ArgsValidator<TArgs>; handle(args): Promise<ToolResult> }`
- `ArgsValidator<T>` — structural type (avoids zod as direct dep)
- `TOOL_REGISTRY` — `Partial<Record<ToolId, ToolHandler>>` (initially empty, Waves 1-3 fill)
- `registerToolHandler(id, handler)` — idempotent registration
- `TOOL_HANDLER_IDS` — `{ 'cast-spell': 'evf.castSpell', ... }` (6 entries)
- `moduleIdempotencyStore` — singleton `IdempotencyStore` shared by all dispatches
- `extractActorId(args)` — defensive `args.actor_id` reader
- `dispatchTool(toolId, payload)` — 7-step pipeline (see ADR-0011)

### IdempotencyStore (`packages/foundry-module/src/write-path/idempotency-cache.ts`)

- `IdempotencyStore` class: `get(key)` (lazy TTL eviction), `set(key, entry)` (FIFO evict at 1000)
- `hashBearer(bearer)` — `crypto.subtle.digest('SHA-256')` → 16-char hex (T-02-01: never logs raw token)
- `buildCacheKey(hash, iKey)` — `${hash}:${iKey}` (T-07-02: cross-bearer isolation)
- `MODULE_IDEMPOTENCY_TTL_MS = 60_000`, `MODULE_IDEMPOTENCY_MAX = 1_000`

### Audit Log (`packages/foundry-module/src/write-path/audit-log.ts`)

- `AuditEntry` interface (tool, payload, idempotencyKey, actorId, result, timestamp, bearer_id)
- `writeAuditLog(entry)` — `ChatMessage.create({ whisper: gmIds, flags: { evf: { audit: entry } } })`
- `bearer_id = bearerHash.slice(0, 8)` — never the full token (T-02-01)
- Fault-tolerant: catches ChatMessage.create rejection, logs `console.warn`, never re-throws

### Shared Protocol (`packages/shared-protocol/src/payloads/tool.ts`)

- `ToolInvocationEnvelopePayloadSchema` — strict Zod object: `{ toolId: enum(6 ids), idempotencyKey: uuid, args: unknown }`
- `BearerRotatedPayloadSchema` — strict Zod object: `{ rotatedAt: int, graceUntil: int }`
- Both exported from `@evf/shared-protocol` index

### foundry-globals.d.ts Extensions

- `game.users: FoundryCollection<FoundryUser>` (for `whisper: gmIds` in writeAuditLog)
- `FoundryUser.isGM: boolean` + `FoundryUser.active: boolean`
- `ChatMessage.create(data: { whisper?, flags?, speaker?, content? }): Promise<unknown>`
- `FoundryActiveEffect.delete(): Promise<unknown>` (for drop-concentration handler, Plan 07-05)
- `dnd5e.canvas.AbilityTemplate.fromActivity(activity, options?): AbilityTemplate[] | null` (for place-template handler, Plan 07-04)

### ADR-0011

- `docs/architecture/0011-foundry-write-path-single-workflow-origin.md` — ACCEPTED 2026-05-16
- Documents Option A (socketlib.executeAsGM only) vs Option B (client-side activity.use, rejected)
- Anti-patterns documented: activity.use() in g2-app/bridge = CI Gate 8 kill
- Indexed in `docs/architecture/README.md`

### INV-6 GM Authority Preservation

- Added to `docs/architecture/INVARIANTS.md`
- Ratified 2026-05-16 (Phase 7 Plan 01)
- Binds: every mutation via executeAsGM; CI Gate 8; dispatchTool audit trail

### CI Gate 8

- `.github/workflows/ci.yml` — Gate 8 added after Gate 7 (changeset)
- `if grep -rE 'activity\.use\(' packages/g2-app packages/bridge --include="*.ts"; then exit 1; fi`
- Error message names ADR-0011
- Dry-run verified: 0 hits in current codebase

## Test Coverage

| File | Tests Added | Coverage |
|------|-------------|----------|
| `shared-protocol/src/payloads/tool.test.ts` | 15 | Schema round-trips, 5 failure cases each |
| `foundry-module/src/write-path/tool-registry.test.ts` | 17 | Registry lifecycle + dispatchTool 8 cases |
| `foundry-module/src/write-path/idempotency-cache.test.ts` | 14 | TTL eviction, FIFO, hashBearer, T-07-02 |
| `foundry-module/src/write-path/audit-log.test.ts` | 8 | whisper filter, flags.evf.audit, fault-tolerance |
| **Total new** | **54** | (64 total including test refactors) |

Baseline: 1315 → Final: 1379 (+64 tests, +4 test files, +2 source test files extended)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Gitleaks false positive on UUID test fixtures**
- **Found during:** Task 1 commit
- **Issue:** Test UUIDs like `f47ac10b-58cc-4372-a567-0e02b2c3d479` triggered gitleaks `generic-api-key` rule
- **Fix:** Replaced all test UUIDs with clearly-fake `00000000-0000-4000-8000-0000000000NN` pattern
- **Files modified:** `packages/shared-protocol/src/payloads/tool.test.ts`
- **Commit:** `20aeab5`

**2. [Rule 2 - Missing critical functionality] Structural ArgsValidator<T> type**
- **Found during:** Task 1 typecheck
- **Issue:** `tool-registry.ts` imported `ZodSchema` from 'zod' but foundry-module has no zod dep
- **Fix:** Replaced with structural `ArgsValidator<T>` interface (safeParse + parse) — satisfies all Zod schemas without the direct import
- **Files modified:** `packages/foundry-module/src/write-path/tool-registry.ts`
- **Commit:** `20aeab5`

**3. [Rule 1 - Bug] CI Gate 8 false positive on bridge comment**
- **Found during:** Task 2 — Gate 8 dry-run verification
- **Issue:** `packages/bridge/src/routes/tools-dispatch.ts` JSDoc contained literal `` `activity.use()` `` in a comment documenting the anti-pattern
- **Fix:** Updated comment to remove parentheses: `NO activity.use calls (ADR-0011...)` — preserves the documentation intent without triggering the grep
- **Files modified:** `packages/bridge/src/routes/tools-dispatch.ts`
- **Commit:** `958dcdd`

**4. [Rule 2 - Auto-add] INV-6 GM Authority Preservation**
- **Found during:** Execution rules review (plan §execution_rules bullet 8)
- **Issue:** Execution rules recommended adding INV-6 to INVARIANTS.md
- **Fix:** Added INV-6 section documenting runtime authority, CI gate, verification tests, and hardware-pending carry-forwards
- **Files modified:** `docs/architecture/INVARIANTS.md`
- **Commit:** `958dcdd`

## Forward References

- **Plan 07-05:** Renames `evf.setTargets` stub → `evf.dropConcentration` in socketlib-handlers.ts. TOOL_HANDLER_IDS already maps `'drop-concentration': 'evf.dropConcentration'`. Handler count stays 14.
- **Plans 07-02 to 07-06:** Register handlers via `registerToolHandler(id, handler)` — TOOL_REGISTRY is ready for them.
- **Plan 07-06:** Bearer rotation scheduler adds `setTimeout` + `bearer.rotated` envelope emission. `BearerRotatedPayloadSchema` is already in shared-protocol.

## Known Stubs

None. TOOL_REGISTRY is intentionally empty at Wave 0 — this is the design. Waves 1-3 fill it with real handlers. No data flows to UI rendering from these files; dispatchTool returns an `unknown_tool` error for any call until handlers register.

## Threat Surface Scan

No new network endpoints introduced. No new auth paths. No schema changes at trust boundaries beyond those already documented in the plan's threat model. CI Gate 8 added as a compile-time trust boundary guard (T-07-01 mitigation).

## Self-Check: PASSED

- All 9 created files confirmed on disk
- All 6 modified files confirmed on disk
- Commits `20aeab5` and `958dcdd` confirmed in git log
- 1379 tests pass (baseline: 1315, +64 new)
- TypeScript typecheck clean across workspace
- Biome: 1 pre-existing error in validation-harness (not in scope); baseline was 3 errors — my changes reduced it
- CI Gate 8 dry-run: 0 hits for `activity.use(` in g2-app + bridge
- ADR-0011 ACCEPTED on disk
- INV-6 ratified on disk
