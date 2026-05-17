---
phase: 4b
plan: 06
subsystem: shared-protocol
tags: [shared-protocol, foundry-module, schema-extension, atomic-commit, wave-2, concentration, death-saves, b-2-closure, w-4-closure]
requires:
  - "@evf/shared-protocol EnvelopeSchema (canonical wire carrier — proto/seq/ts/type/session_id UUID/payload)"
  - "@evf/shared-protocol CharacterSnapshotSchema (existing Phase 2 shape)"
  - "dnd5e v5.x actor.system.attributes.death.{success,failure} field path (verified per 04B-RESEARCH.md §Q4)"
provides:
  - "@evf/shared-protocol DeathSavesSchema + DeathSaves type (NEW)"
  - "@evf/shared-protocol CharacterSnapshotSchema.death REQUIRED field (extension)"
  - "@evf/shared-protocol ConcConflictPayloadSchema + ConcConflictPayload type (NEW file payloads/concentration.ts)"
  - "@evf/shared-protocol ConcDropConfirmedPayloadSchema + ConcDropConfirmedPayload type (NEW)"
  - "@evf/shared-protocol CONC_CONFLICT_TYPE = 'conc.conflict' wire constant"
  - "@evf/shared-protocol CONC_DROP_CONFIRMED_TYPE = 'conc.drop.confirmed' wire constant"
  - "foundry-module/readers/character-reader.ts producer extension (reads actor.system.attributes.death?.{success,failure} with nullish-coalesce defaults)"
  - "6 workspace consumer test fixtures aligned with the new schema (g2-app + bridge)"
affects:
  - "Plan 05 (Wave 3) — Plan 05 imports DeathSavesSchema + the four concentration exports as PURE CONSUMER; no further shared-protocol edits in Phase 4b"
  - "Phase 7 (write path) — will consume CONC_DROP_CONFIRMED_TYPE on the bridge ingress and emit CONC_CONFLICT_TYPE on the bridge egress"
tech-stack:
  added:
    - "zod 4.4.3 z.strictObject() with .min(0).max(3) integer constraints (already in workspace)"
  patterns:
    - "Atomic-commit pattern for schema-extension + producer + workspace-wide consumer fan-out (closes Pitfall 3 — no .optional() window of drift)"
    - "Canonical EnvelopeSchema round-trip pattern (CN-9 positive + CN-10 negative session_id) — locks the W-4 NF-1 regression guard at the schema-test layer"
    - "Defensive nullish-coalesce defaults in the producer (`death?.success ?? 0`) for fresh dnd5e actors where attributes.death may be undefined"
key-files:
  created:
    - "packages/shared-protocol/src/payloads/concentration.ts"
    - "packages/shared-protocol/src/payloads/concentration.test.ts"
    - "packages/shared-protocol/src/payloads/character.test.ts"
  modified:
    - "packages/shared-protocol/src/payloads/character.ts"
    - "packages/shared-protocol/src/index.ts"
    - "packages/foundry-module/src/readers/character-reader.ts"
    - "packages/foundry-module/src/readers/readers.test.ts"
    - "packages/foundry-module/src/types/foundry-globals.d.ts"
    - "packages/g2-app/src/__tests__/example-status-hud.test.ts"
    - "packages/g2-app/src/__tests__/scene-renderer-smoke.test.ts"
    - "packages/g2-app/src/status-hud/__tests__/snapshot.test.ts"
    - "packages/g2-app/src/status-hud/__tests__/status-hud-renderer.test.ts"
    - "packages/g2-app/src/status-hud/__tests__/status-hud-layer.test.ts"
    - "packages/bridge/src/server.test.ts"
decisions:
  - "K-DEATH-01: `CharacterSnapshotSchema.death` is REQUIRED (NOT .optional()) — atomic-commit + workspace-wide fixture fan-out is the Pitfall 3 mitigation, NOT temporary schema flexibility."
  - "K-DEATH-02: DeathSavesSchema is exported as a separate top-level export (alongside CharacterSnapshotSchema) so Plan 05 status-hud-layer can ergonomically narrow with `parsed.data.death.failure < 3` semantics."
  - "K-CONC-01: ConcConflictPayloadSchema uses `effectId` / `currentConcentrationName` / `newSpellName` field names (per plan <interfaces> block, verbatim from 04B-RESEARCH.md §Approach 6) — NOT `active_spell_name` / `new_spell_name`."
  - "K-CONC-02: CN-9 envelope round-trip uses a synthetic UUID v4 literal (`11111111-1111-4111-8111-111111111111`, version nibble 4 + variant nibble 8) — locks `EnvelopeSchema.session_id: z.string().uuid()` at the test layer."
  - "K-PROD-01: character-reader.ts uses `actor.system.attributes.death?.success ?? 0` (optional chain + nullish coalesce) — defends against fresh dnd5e actors that have `attributes.death` undefined until first save (CR-DS-3 covers this case)."
  - "K-TYPES-01: foundry-globals.d.ts Dnd5eAttributes extended with `death?: { success, failure }` (Rule 3 auto-fix — without it the producer's `actor.system.attributes.death?.success` access does not typecheck under TS strict)."
metrics:
  duration: "~24 minutes (atomic edit + verification + commit + summary)"
  completed: "2026-05-15T16:06:53Z"
  files_changed: 14
  insertions: 479
  tests_added: 23
---

# Phase 4b Plan 06: Atomic CharacterSnapshotSchema.death + Concentration Envelope Schemas + Workspace Fan-out Summary

Phase 4b's load-bearing schema-evolution commit — `CharacterSnapshotSchema.death`
(REQUIRED) + `concentration.ts` envelope schemas + character-reader producer
extension + 6 downstream consumer fixtures, all landed in **one atomic git
commit** so `pnpm typecheck` and `pnpm test` workspace-wide pass immediately
after the commit (no `.optional()` window of drift; no partial-application
gap; no fixture-misalignment 404 on the bridge route).

## Atomic Commit Confirmation

```
commit d68e5df5d01a35435d5c9e7363fdff1c8c1073c8
Author: uni.lorenzo.a@gmail.com
Date:   Fri May 15 18:06:46 2026 +0200

    feat(shared-protocol): atomic CharacterSnapshotSchema.death + concentration.ts + workspace fan-out

 14 files changed, 479 insertions(+)
```

**Single SHA `d68e5df` touches all 14 files.** No interim commit exists where
typecheck would fail or where the bridge route's `CharacterSnapshotSchema.safeParse`
would return 404 because of a stale `mockSnapshot` literal.

Files in the single commit:

| File                                                             | Status   | Role |
| ---------------------------------------------------------------- | -------- | ---- |
| `packages/shared-protocol/src/payloads/character.ts`             | modified | Schema extension — `DeathSavesSchema` + REQUIRED `death` sub-field on `CharacterSnapshotSchema` |
| `packages/shared-protocol/src/payloads/character.test.ts`        | NEW      | 8 schema tests (CS-DS-1..8) |
| `packages/shared-protocol/src/payloads/concentration.ts`         | NEW      | ConcConflictPayloadSchema + ConcDropConfirmedPayloadSchema + 2 wire constants |
| `packages/shared-protocol/src/payloads/concentration.test.ts`    | NEW      | 10 schema + envelope round-trip tests (CN-1..10) |
| `packages/shared-protocol/src/index.ts`                          | modified | Re-export DeathSaves + 4 concentration exports |
| `packages/foundry-module/src/readers/character-reader.ts`        | modified | Producer extension (reads `actor.system.attributes.death?.{success,failure}`) |
| `packages/foundry-module/src/readers/readers.test.ts`            | modified | 5 reader tests (CR-DS-1..5) — including CR-DS-4 schema round-trip |
| `packages/foundry-module/src/types/foundry-globals.d.ts`         | modified | `Dnd5eAttributes.death?` typing (Rule 3 auto-fix) |
| `packages/g2-app/src/__tests__/example-status-hud.test.ts`       | modified | IDLE_SNAPSHOT + death field |
| `packages/g2-app/src/__tests__/scene-renderer-smoke.test.ts`     | modified | SR-8 inline payload + death field (SR-11/12/13 preserved untouched) |
| `packages/g2-app/src/status-hud/__tests__/snapshot.test.ts`      | modified | IDLE_SNAPSHOT + death field |
| `packages/g2-app/src/status-hud/__tests__/status-hud-renderer.test.ts` | modified | `makeSnapshot()` factory + death field |
| `packages/g2-app/src/status-hud/__tests__/status-hud-layer.test.ts`    | modified | VALID_SNAPSHOT const + death field |
| `packages/bridge/src/server.test.ts`                             | modified | `mockSnapshot` const + death field |

## DeathSavesSchema — Final Shape

```ts
export const DeathSavesSchema = z.strictObject({
  success: z.number().int().min(0).max(3),
  failure: z.number().int().min(0).max(3),
});
export type DeathSaves = z.infer<typeof DeathSavesSchema>;
```

Sub-field on `CharacterSnapshotSchema`:

```ts
export const CharacterSnapshotSchema = z.strictObject({
  /* ... existing fields ... */
  death: DeathSavesSchema,   // REQUIRED — NOT .optional()
});
```

3 successes = stabilized · 3 failures = dead · counters reset on full rest or
HP restoration (dnd5e v5.x semantics).

## ConcConflictPayloadSchema — Final Shape

```ts
export const ConcConflictPayloadSchema = z.strictObject({
  effectId: z.string().min(1),
  currentConcentrationName: z.string().min(1),
  newSpellName: z.string().min(1),
});
```

Bridge → g2-app envelope payload. Emitted by Phase 7 server-side
concentration-conflict detection. Plan 05 `conc-conflict-dispatcher.ts`
performs the WS-receive `safeParse` boundary check.

## ConcDropConfirmedPayloadSchema — Final Shape

```ts
export const ConcDropConfirmedPayloadSchema = z.strictObject({
  effectId: z.string().min(1),
});
```

g2-app → Bridge confirmation payload. Phase 4b modal emits when player
confirms dropping active concentration; Phase 7 consumes via
`socketlib.executeAsGM`.

## Wire-Protocol Type Constants

| Constant                       | Value                  | Direction       |
| ------------------------------ | ---------------------- | --------------- |
| `CONC_CONFLICT_TYPE`           | `'conc.conflict'`      | Bridge → g2-app |
| `CONC_DROP_CONFIRMED_TYPE`     | `'conc.drop.confirmed'`| g2-app → Bridge |

Both ride inside the canonical `EnvelopeSchema` carrier on the `payload` field
(NOT `value`); session_id is a required UUID v4.

## Test Counts

| File                                                          | New Tests | IDs                |
| ------------------------------------------------------------- | --------- | ------------------ |
| `packages/shared-protocol/src/payloads/character.test.ts`     | 8         | CS-DS-1..CS-DS-8   |
| `packages/foundry-module/src/readers/readers.test.ts`         | 5         | CR-DS-1..CR-DS-5   |
| `packages/shared-protocol/src/payloads/concentration.test.ts` | 10        | CN-1..CN-10        |
| **Total new tests**                                           | **23**    |                    |

Workspace-wide post-commit: **56 test files / 764 tests, all green.**

## W-4 NF-1-Class Regression Closure

CN-9 + CN-10 lock the canonical envelope-shape contract at the schema-test
layer:

- **CN-9 (positive round-trip):** A synthetic envelope
  `{ proto: 'evf-v1', seq: 0, ts: Date.now(), type: CONC_DROP_CONFIRMED_TYPE,
  session_id: '11111111-1111-4111-8111-111111111111', payload: { effectId: 'eff1' } }`
  passes `EnvelopeSchema.safeParse` AND its inner `payload` passes
  `ConcDropConfirmedPayloadSchema.safeParse`. The UUID v4 literal has version
  nibble `4` and variant nibble `8` — satisfies `z.string().uuid()` strictly.
- **CN-10 (negative round-trip):** The same envelope with `session_id`
  omitted fails `EnvelopeSchema.safeParse` — locks the Phase 4a NF-1
  forbidden-pattern guard at the runtime layer.

The negative grep gate `! grep -E 'WireEnvelopeSchema|envelope\.value'
packages/shared-protocol/src/payloads/concentration*.ts` passes cleanly: neither
`concentration.ts` nor `concentration.test.ts` mentions the forbidden legacy
aliases. The test JSDoc paraphrases the structural intent without naming the
forbidden tokens.

## B-2 Closure — Workspace-wide Fixture Fan-out

All **6 consumer fixtures** identified in the iter-3 audit are updated atomically:

1. `packages/g2-app/src/__tests__/example-status-hud.test.ts` — IDLE_SNAPSHOT
2. `packages/g2-app/src/__tests__/scene-renderer-smoke.test.ts` — SR-8 inline payload
3. `packages/g2-app/src/status-hud/__tests__/snapshot.test.ts` — IDLE_SNAPSHOT
4. `packages/g2-app/src/status-hud/__tests__/status-hud-renderer.test.ts` — `makeSnapshot()` factory
5. `packages/g2-app/src/status-hud/__tests__/status-hud-layer.test.ts` — `VALID_SNAPSHOT` const
6. `packages/bridge/src/server.test.ts` — `mockSnapshot` const (required because
   the bridge route returns 404 on `CharacterSnapshotSchema.safeParse` drift)

All six add `death: { success: 0, failure: 0 }` to the existing literal.
Workspace-wide `pnpm typecheck` + `pnpm test` exit 0 immediately after the
atomic commit.

## Plan 02 SR-11/12/13 Preservation Confirmation

Plan 02 (Wave 1) added SR-11/12/13 test cases AFTER SR-10 in
`scene-renderer-smoke.test.ts`. Plan 06 edits ONLY the existing SR-8 inline
snapshot object (line ~345) — different line range, sequential application
safe.

Post-edit grep: `grep -cE 'SR-1[123]' packages/g2-app/src/__tests__/scene-renderer-smoke.test.ts`
returns **9** (3 cases × ~3 references each in comments/test names), confirming
Plan 02 additions survived intact.

## Wave-2 File-Overlap Confirmation

Cross-checked against Plans 03 + 04 (the other Wave 2 movers):

- **Plan 03** (toast-renderer + i18n): zero overlap. Creates NEW `toast-snapshot.test.ts`;
  Plan 06 modifies pre-existing `snapshot.test.ts` (different filenames).
- **Plan 04** (boot-error UI): zero overlap. Boot-error files + 10 boot-error
  fixtures are all disjoint from Plan 06's 14-file set.

Plan 02 (Wave 1, completed before Wave 2 started) edited
`scene-renderer-smoke.test.ts` at a different line range; sequential
application safe.

## Verification Gate Results

| Gate                                                          | Result |
| ------------------------------------------------------------- | ------ |
| `pnpm typecheck` (workspace-wide)                             | exit 0 |
| `pnpm test` (56 files / 764 tests)                            | exit 0 |
| `pnpm lint:ci`                                                | exit 0 |
| `grep -c 'death: DeathSavesSchema' character.ts`              | 1      |
| `grep -c 'export const DeathSavesSchema' character.ts`        | 1      |
| `grep -c 'DeathSavesSchema' index.ts`                         | 1      |
| `grep -c 'actor.system.attributes.death' character-reader.ts` | 3      |
| `grep -cE 'death\?\.success\s*\?\?\s*0\|death\?\.failure\s*\?\?\s*0'` | 2 |
| `grep -cE 'CS-DS-[1-8]' character.test.ts`                    | 17 (multi-ref) |
| `grep -cE 'CR-DS-[1-5]' readers.test.ts`                      | 7 (multi-ref)  |
| `grep -c 'death: { success: 0, failure: 0 }'` per fixture × 6 | 1 each |
| `grep -cE 'SR-1[123]' scene-renderer-smoke.test.ts`           | 9 (Plan 02 preserved) |
| `! grep -E 'WireEnvelopeSchema\|envelope\.value' concentration*.ts` | PASS |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] foundry-globals.d.ts Dnd5eAttributes extension**

- **Found during:** Task 1 (atomic commit assembly)
- **Issue:** `character-reader.ts` adds `actor.system.attributes.death?.success` —
  but `Dnd5eAttributes` in `foundry-globals.d.ts` did not declare a `death`
  field, so TypeScript strict mode rejected the access.
- **Fix:** Extended `Dnd5eAttributes` with `death?: { success: number; failure: number }`
  (optional because fresh actors may not have it).
- **Files modified:** `packages/foundry-module/src/types/foundry-globals.d.ts`
  (included in the atomic commit).
- **Commit:** `d68e5df` (atomic).

**2. [Rule 1 — Bug] readers.test.ts makeActor() helper extended**

- **Found during:** Task 1 reader test authoring.
- **Issue:** The pre-existing `makeActor()` factory did not pass through
  a `death` override, so CR-DS-1..5 could not pin specific death values.
- **Fix:** Extended `makeActor()` to accept `death: { success, failure } | undefined`
  with `'death' in overrides` discrimination — supports both default
  `{0,0}` AND explicit `undefined` (CR-DS-3 fresh-actor case).
- **Files modified:** `packages/foundry-module/src/readers/readers.test.ts`
  (included in the atomic commit).
- **Commit:** `d68e5df` (atomic).

### Plan-internal grep gate inconsistency (informational, no code change)

The plan's Task 1 `<verify>` block contained the grep regex
`death\.success.*\?\?.*0|death\.failure.*\?\?.*0` which matches the literal
`death.success ?? 0` form — but the plan's `<action>` example code (line
320-325 of 04B-06-PLAN.md) shows `death?.success ?? 0` with the optional-chain
operator. My implementation honors the `<action>` example (defensive optional
chain) — confirmed correct via the corrected grep
`grep -cE 'death\?\.success\s*\?\?\s*0|death\?\.failure\s*\?\?\s*0'` which
returns 2. The plan's `<verify>` regex was internally inconsistent with the
plan's `<action>` example. No code change needed — the implementation matches
the canonical `<action>` example, which carries more authority for the
behavior contract.

### index.ts re-export ordering

Initial placement of the new concentration `export { ... } from './payloads/concentration.js'`
block was between the character and combat re-export blocks (in alphabetical
filename order). Biome `organizeImports` flagged the position because the
existing payload re-export blocks are NOT alphabetized by filename (they go
character → combat → event → frame → scene, which is in alphabetical order
but the original code did not have concentration). Repositioned the
concentration block AFTER combat (alphabetical position
'character' < 'combat' < 'concentration') to match Biome's expectation.
Auto-fixed before commit; biome lint:ci exits 0.

## Plan 05 Consumer Contract (Wave 3)

Plan 05 (Wave 3) — `status-hud-layer.ts` + `conc-modal-panel.ts` +
`conc-conflict-dispatcher.ts` — is now a **pure consumer** of Plan 06's
exports. It imports from `@evf/shared-protocol`:

- `DeathSavesSchema` for ergonomic narrowing in the `_onDelta` pivot trigger
  (`parsed.data.death.failure < 3` semantics).
- `ConcConflictPayloadSchema` for the WS-receive boundary `safeParse` in the
  dispatcher.
- `ConcDropConfirmedPayloadSchema` + `CONC_DROP_CONFIRMED_TYPE` for the
  outgoing modal-confirmation envelope.

Plan 05 makes **zero** modifications to `packages/shared-protocol/` —
Plan 06 is the sole mover for the Phase 4b schema work.

## Self-Check: PASSED

- File `packages/shared-protocol/src/payloads/character.ts` exists (modified):
  FOUND
- File `packages/shared-protocol/src/payloads/character.test.ts` exists (new):
  FOUND
- File `packages/shared-protocol/src/payloads/concentration.ts` exists (new):
  FOUND
- File `packages/shared-protocol/src/payloads/concentration.test.ts` exists
  (new): FOUND
- File `packages/foundry-module/src/readers/character-reader.ts` modified:
  FOUND
- Commit `d68e5df` exists in git log: FOUND
- Atomic commit touches all 14 files in single SHA: VERIFIED
- pnpm typecheck + pnpm test + pnpm lint:ci exit 0: VERIFIED
