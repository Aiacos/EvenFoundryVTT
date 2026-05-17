---
phase: 4b
plan: 06
type: execute
wave: 2
depends_on: ["04b-01"]
files_modified:
  - packages/shared-protocol/src/payloads/character.ts
  - packages/shared-protocol/src/payloads/concentration.ts
  - packages/shared-protocol/src/payloads/character.test.ts
  - packages/shared-protocol/src/payloads/concentration.test.ts
  - packages/shared-protocol/src/index.ts
  - packages/foundry-module/src/readers/character-reader.ts
  - packages/foundry-module/src/readers/readers.test.ts
  - packages/g2-app/src/__tests__/example-status-hud.test.ts
  - packages/g2-app/src/__tests__/scene-renderer-smoke.test.ts
  - packages/g2-app/src/status-hud/__tests__/snapshot.test.ts
  - packages/g2-app/src/status-hud/__tests__/status-hud-renderer.test.ts
  - packages/g2-app/src/status-hud/__tests__/status-hud-layer.test.ts
  - packages/bridge/src/server.test.ts
autonomous: true
requirements: [DEATH-01, CONC-01]
subsystem: shared-protocol
user_setup: []
tags: [shared-protocol, foundry-module, schema-extension, atomic-commit, wave-2, concentration, death-saves]
must_haves:
  truths:
    - "CharacterSnapshotSchema.death = z.strictObject({ success: z.number().int().min(0).max(3), failure: z.number().int().min(0).max(3) }) — REQUIRED field (not .optional()). Field added via ATOMIC COMMIT alongside character-reader.ts producer extension AND ALL DOWNSTREAM CONSUMER FIXTURES (Pitfall 3 — no window of drift). Phase 2 reader extension reads actor.system.attributes.death.{success,failure} from dnd5e v5.x actor data."
    - "DeathSavesSchema exported separately alongside CharacterSnapshotSchema for ergonomic narrowing in consumers (Plan 05 status-hud-layer pivot trigger imports it)"
    - "shared-protocol/src/payloads/concentration.ts (NEW file) ships ConcConflictPayloadSchema + ConcDropConfirmedPayloadSchema + envelope type constants CONC_CONFLICT_TYPE = 'conc.conflict' + CONC_DROP_CONFIRMED_TYPE = 'conc.drop.confirmed'. Re-exported via shared-protocol/src/index.ts."
    - "All 6 existing test fixtures workspace-wide that use CharacterSnapshot literals are updated IN THIS SAME COMMIT to include `death: { success: 0, failure: 0 }`: g2-app/__tests__/example-status-hud.test.ts (IDLE_SNAPSHOT line ~35), g2-app/__tests__/scene-renderer-smoke.test.ts (SR-8 character.delta payload line ~328), g2-app/status-hud/__tests__/snapshot.test.ts (IDLE_SNAPSHOT line ~37), g2-app/status-hud/__tests__/status-hud-renderer.test.ts (`makeSnapshot()` factory line ~34-46), g2-app/status-hud/__tests__/status-hud-layer.test.ts (`VALID_SNAPSHOT` const line ~66-76), bridge/src/server.test.ts (`mockSnapshot` const line ~228). This closes B-2 (iter-3 expanded to 6 sites — iter-2 listed only 3 because plan-checker iter-1 cited only 3; iter-3 audit found 3 additional via grep): pnpm typecheck + pnpm test across workspace pass immediately after the commit (no fixture-update window of drift; bridge route safeParse returns 404 on schema drift, so bridge test mockSnapshot must align)."
    - "Plan 05 (Wave 3) consumes both schema modules WITHOUT modifying them — Plan 06 is the single mover for shared-protocol/payloads/{character,concentration}.ts in Phase 4b"
    - "The atomic commit constraint (CONTEXT §Area 7 REVISED) is the load-bearing mitigation; no schema field is `.optional()` to bridge the consumer-update window"
  artifacts:
    - path: "packages/shared-protocol/src/payloads/character.ts"
      provides: "CharacterSnapshotSchema EXTENDED with DeathSavesSchema field (REQUIRED); DeathSaves type + DeathSavesSchema export"
      exports: ["CharacterSnapshotSchema", "CharacterSnapshot", "DeathSavesSchema", "DeathSaves", "CHARACTER_DELTA_TYPE"]
    - path: "packages/shared-protocol/src/payloads/concentration.ts"
      provides: "NEW file — ConcConflictPayloadSchema + ConcDropConfirmedPayloadSchema + envelope type constants"
      exports: ["ConcConflictPayloadSchema", "ConcConflictPayload", "ConcDropConfirmedPayloadSchema", "ConcDropConfirmedPayload", "CONC_CONFLICT_TYPE", "CONC_DROP_CONFIRMED_TYPE"]
    - path: "packages/shared-protocol/src/index.ts"
      provides: "Re-exports DeathSavesSchema + DeathSaves + the new concentration schemas"
      contains: "DeathSavesSchema|ConcConflictPayloadSchema|ConcDropConfirmedPayloadSchema|CONC_CONFLICT_TYPE|CONC_DROP_CONFIRMED_TYPE"
    - path: "packages/foundry-module/src/readers/character-reader.ts"
      provides: "Extended to read actor.system.attributes.death.{success,failure} + emit in CharacterSnapshot payload (ATOMIC with schema extension)"
      contains: "death.success|death.failure"
    - path: "packages/g2-app/src/__tests__/example-status-hud.test.ts"
      provides: "IDLE_SNAPSHOT extended with `death: { success: 0, failure: 0 }` field (B-2 fan-out)"
      contains: "death.*success.*0.*failure.*0|death: \\{ success: 0, failure: 0 \\}"
    - path: "packages/g2-app/src/__tests__/scene-renderer-smoke.test.ts"
      provides: "SR-8 character.delta payload extended with `death: { success: 0, failure: 0 }` field (B-2 fan-out). NOTE: this file ALSO modified by Plan 02 (SR-11..SR-13) in Wave 1 — Plan 06 is the SECOND mover in Wave 2 and merges its edits non-destructively (Plan 02's SR-11..SR-13 additions are preserved; Plan 06 only edits the SR-8 inline snapshot)."
      contains: "death"
    - path: "packages/g2-app/src/status-hud/__tests__/snapshot.test.ts"
      provides: "IDLE_SNAPSHOT extended with `death: { success: 0, failure: 0 }` field (B-2 fan-out)"
      contains: "death"
    - path: "packages/g2-app/src/status-hud/__tests__/status-hud-renderer.test.ts"
      provides: "`makeSnapshot()` factory return literal extended with `death: { success: 0, failure: 0 }` field (B-2 fan-out iter-3 expansion — grep-found by orchestrator after iter-3 plan-check flagged Plan 06's enumeration as incomplete)"
      contains: "death.*success.*0.*failure.*0|death: \\{ success: 0, failure: 0 \\}"
    - path: "packages/g2-app/src/status-hud/__tests__/status-hud-layer.test.ts"
      provides: "`VALID_SNAPSHOT: CharacterSnapshot` literal extended with `death: { success: 0, failure: 0 }` field (B-2 fan-out iter-3 expansion)"
      contains: "death.*success.*0.*failure.*0|death: \\{ success: 0, failure: 0 \\}"
    - path: "packages/bridge/src/server.test.ts"
      provides: "`mockSnapshot` const for GET /v1/character/:actorId test extended with `death: { success: 0, failure: 0 }` field — required because the bridge route's `CharacterSnapshotSchema.safeParse` would otherwise return 404 on schema drift, breaking the 200-expecting test (iter-3 expansion; not in iter-1/iter-2 plan-check scope but found by orchestrator grep)"
      contains: "death.*success.*0.*failure.*0|death: \\{ success: 0, failure: 0 \\}"
  key_links:
    - from: "packages/shared-protocol/src/payloads/character.ts (schema extension)"
      to: "packages/foundry-module/src/readers/character-reader.ts (producer extension)"
      via: "ATOMIC COMMIT — schema + reader + 3 g2-app consumer fixtures land in Task 1's single git commit; no .optional() window of drift (Pitfall 3 + B-2 fan-out closure)"
      pattern: "death.*success|death.*failure"
    - from: "packages/shared-protocol/src/payloads/character.ts (DeathSavesSchema export)"
      to: "packages/g2-app/src/status-hud/status-hud-layer.ts (Plan 05 _onDelta pivot trigger)"
      via: "Plan 05 imports DeathSavesSchema + uses parsed.data.death.failure < 3"
      pattern: "DeathSavesSchema|parsed\\.data\\.death"
    - from: "packages/shared-protocol/src/payloads/concentration.ts"
      to: "packages/g2-app/src/panels/concentration-drop-modal.ts (Plan 05) + packages/g2-app/src/panels/conc-conflict-dispatcher.ts (Plan 05)"
      via: "Plan 05 imports ConcConflictPayloadSchema for WS-receive boundary safeParse + ConcDropConfirmedPayloadSchema + CONC_DROP_CONFIRMED_TYPE for ws.send envelope"
      pattern: "CONC_CONFLICT_TYPE|CONC_DROP_CONFIRMED_TYPE"

threat_model:
  trust_boundaries:
    - description: "shared-protocol/src/payloads/character.ts schema change is a BREAKING CHANGE for any consumer — atomic commit with producer extension AND all g2-app consumer fixture updates prevents runtime safeParse failures + pnpm typecheck failures"
    - description: "ConcConflictPayloadSchema receives untrusted bridge WS payload (Phase 7 server emits) — Zod safeParse before passing to modal (enforced at the Plan 05 conc-conflict-dispatcher boundary, NOT here)"
    - description: "Atomic commit constraint: schema + reader + 3 fixture files MUST land in single git commit; otherwise pnpm typecheck breaks for any partial-application window"
  threats:
    - id: "T-4b-06-01"
      category: "T"
      component: "CharacterSnapshotSchema.death = REQUIRED field (not optional) atomic commit"
      disposition: "mitigate"
      mitigation_plan: "ATOMIC COMMIT: schema + reader + 3 g2-app consumer fixture updates ALL land in same git commit (Pitfall 3 + B-2 fan-out closure). If reader is committed without schema, Zod safeParse FAILS at runtime (death missing from payload). If schema is committed without reader OR without fixture updates, TS typecheck FAILS in g2-app + workspace test files. Atomic commit closes the window."
    - id: "T-4b-06-02"
      category: "T"
      component: "Concentration envelope schemas at module-level — no runtime mutation"
      disposition: "mitigate"
      mitigation_plan: "ConcConflictPayloadSchema + ConcDropConfirmedPayloadSchema are `z.strictObject` with `.min(1)` constraints. Extra fields rejected; empty strings rejected. Plan 05 conc-conflict-dispatcher.ts performs the safeParse at WS-receive boundary."
    - id: "T-4b-06-03"
      category: "D"
      component: "Plan 02 scene-renderer-smoke.test.ts overlap"
      disposition: "mitigate"
      mitigation_plan: "Plan 06 is the SECOND mover in Wave 2 for scene-renderer-smoke.test.ts (Plan 02 added SR-11..SR-13 in Wave 1; Plan 06 edits the SR-8 inline snapshot to add `death: { success: 0, failure: 0 }`). The edits do NOT touch the same line ranges — Plan 02 added new test cases AFTER SR-10; Plan 06 edits the existing SR-8 snapshot object. Sequential safe under wave-bracket scheduling."
---

<objective>
Ship the **atomic schema extension** for Phase 4b's Wave 3 consumers (Plan 05): `CharacterSnapshotSchema.death` (REQUIRED field) + the `concentration.ts` envelope schemas (ConcConflictPayloadSchema + ConcDropConfirmedPayloadSchema) + the `character-reader.ts` producer extension + ALL 3 affected g2-app test fixtures updated in the SAME COMMIT. This plan is the load-bearing closure for the Pitfall 3 atomic-commit mandate (CONTEXT §Area 7 REVISED) and B-2 fan-out from iteration 1.

Purpose: Decouple the schema-evolution work from Plan 05's StatusHudRenderer pivot + ConcDropModalPanel implementation. By landing the schema extension in Wave 2 (parallel with Plans 03 + 04), Plan 05 (Wave 3) becomes a pure consumer — no schema work in the same plan as the rendering/integration work. This drops Plan 05's task count from 5 (over scope-sanity blocker threshold) to 3 (well within target).

Output: `packages/shared-protocol/src/payloads/character.ts` extended with `DeathSavesSchema` + `death` field; NEW `packages/shared-protocol/src/payloads/concentration.ts` with ConcConflict + ConcDropConfirmed schemas + type constants; `packages/shared-protocol/src/index.ts` re-exports updated; `packages/foundry-module/src/readers/character-reader.ts` reads `actor.system.attributes.death`; the existing tests in shared-protocol + foundry-module extended; AND the 3 g2-app consumer test files (example-status-hud, scene-renderer-smoke, snapshot) updated with the new death field in their CharacterSnapshot literals.

**B-2 resolution (workspace-wide fixture fan-out — iter-3 expanded):** Iteration 1 plan-check flagged "3 missing files"; iteration 2 enumerated them. Iteration 3 plan-check found 2 additional pre-existing Phase 4a literals (`status-hud-renderer.test.ts` `makeSnapshot()` factory and `status-hud-layer.test.ts` `VALID_SNAPSHOT` const) that were grep-discoverable. Orchestrator post-iter-3 audit also surfaced `bridge/src/server.test.ts` `mockSnapshot` (the bridge route returns 404 on `CharacterSnapshotSchema.safeParse` failure, so the 200-expecting test would fail without the death field). Plan 06's atomic commit therefore covers **6 fixture updates total** across g2-app + bridge, alongside the schema + reader + concentration.ts changes — 13 files in one git commit so `pnpm typecheck` and `pnpm test` both pass workspace-wide immediately after the single commit lands.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04b-CONTEXT.md
@.planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-RESEARCH.md
@.planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-UI-SPEC.md
@.planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04b-01-SUMMARY.md
@packages/shared-protocol/src/payloads/character.ts
@packages/shared-protocol/src/index.ts
@packages/shared-protocol/src/envelope.ts
@packages/foundry-module/src/readers/character-reader.ts
@packages/foundry-module/src/readers/readers.test.ts
@packages/g2-app/src/__tests__/example-status-hud.test.ts
@packages/g2-app/src/__tests__/scene-renderer-smoke.test.ts
@packages/g2-app/src/status-hud/__tests__/snapshot.test.ts

<interfaces>
<!-- Schema shapes this plan produces. -->

BEFORE (verified from canonical packages/shared-protocol/src/payloads/character.ts on 2026-05-15):
```
export const CharacterSnapshotSchema = z.strictObject({
  actorId: z.string().min(1),
  name: z.string().min(1),
  hp: z.number().int(),
  maxHp: z.number().int().nonnegative(),
  tempHp: z.number().int().nonnegative(),
  ac: z.number().int().nonnegative(),
  level: z.number().int().min(1).max(20),
  conditions: z.array(z.string()),
  exhaustion: z.number().int().min(0).max(6),
});
export type CharacterSnapshot = z.infer<typeof CharacterSnapshotSchema>;
export const CHARACTER_DELTA_TYPE = 'character.delta' as const;
```

AFTER (Plan 06 Task 1 — atomic extension):
```
export const DeathSavesSchema = z.strictObject({
  success: z.number().int().min(0).max(3),
  failure: z.number().int().min(0).max(3),
});
export type DeathSaves = z.infer<typeof DeathSavesSchema>;

export const CharacterSnapshotSchema = z.strictObject({
  actorId: z.string().min(1),
  name: z.string().min(1),
  hp: z.number().int(),
  maxHp: z.number().int().nonnegative(),
  tempHp: z.number().int().nonnegative(),
  ac: z.number().int().nonnegative(),
  level: z.number().int().min(1).max(20),
  conditions: z.array(z.string()),
  exhaustion: z.number().int().min(0).max(6),
  death: DeathSavesSchema,   // NEW Phase 4b — REQUIRED (not .optional())
});
```

NEW packages/shared-protocol/src/payloads/concentration.ts (Plan 06 Task 2):
```
import { z } from 'zod';

export const ConcConflictPayloadSchema = z.strictObject({
  effectId: z.string().min(1),
  currentConcentrationName: z.string().min(1),
  newSpellName: z.string().min(1),
});
export type ConcConflictPayload = z.infer<typeof ConcConflictPayloadSchema>;
export const CONC_CONFLICT_TYPE = 'conc.conflict' as const;

export const ConcDropConfirmedPayloadSchema = z.strictObject({
  effectId: z.string().min(1),
});
export type ConcDropConfirmedPayload = z.infer<typeof ConcDropConfirmedPayloadSchema>;
export const CONC_DROP_CONFIRMED_TYPE = 'conc.drop.confirmed' as const;
```

Re-exported via packages/shared-protocol/src/index.ts.

EnvelopeSchema canonical wire shape (from packages/shared-protocol/src/envelope.ts — verified 2026-05-15):
```
export const EnvelopeSchema = z.object({
  proto: z.literal('evf-v1'),
  seq: z.number().int().nonnegative(),
  ts: z.number().int(),
  type: z.string(),
  session_id: z.string().uuid(),       // REQUIRED
  payload: z.unknown(),                 // narrowed by `type` discriminant at consumer site
});
```

NOTE: The carrier field is `envelope.payload` (NOT `envelope.value`). The schema name is `EnvelopeSchema` (NOT `WireEnvelopeSchema`). These canonical names are used VERBATIM throughout this plan + Plan 05's conc-modal envelope construction.

g2-app consumer fixture updates (Plan 06 Task 1 — B-2 fan-out, atomic in Task 1's commit):

1. packages/g2-app/src/__tests__/example-status-hud.test.ts — IDLE_SNAPSHOT at line ~35:
```
// BEFORE
const IDLE_SNAPSHOT: CharacterSnapshot = {
  actorId: 'pc-aiacos',
  name: 'Aiacos',
  ac: 16,
  hp: 36,
  maxHp: 36,
  tempHp: 0,
  level: 5,
  conditions: [],
  exhaustion: 0,
};

// AFTER (Plan 06 adds death field)
const IDLE_SNAPSHOT: CharacterSnapshot = {
  actorId: 'pc-aiacos',
  name: 'Aiacos',
  ac: 16,
  hp: 36,
  maxHp: 36,
  tempHp: 0,
  level: 5,
  conditions: [],
  exhaustion: 0,
  death: { success: 0, failure: 0 },
};
```

2. packages/g2-app/src/__tests__/scene-renderer-smoke.test.ts — SR-8 character.delta payload at line ~328:
```
// BEFORE
const snapshotEvent = JSON.stringify({
  type: 'character.delta',
  payload: {
    actorId: 'pc-aiacos',
    name: 'Aiacos',
    ac: 16,
    hp: 36,
    maxHp: 36,
    tempHp: 0,
    level: 5,
    conditions: [],
    exhaustion: 0,
  },
});

// AFTER (Plan 06 adds death field)
const snapshotEvent = JSON.stringify({
  type: 'character.delta',
  payload: {
    actorId: 'pc-aiacos',
    name: 'Aiacos',
    ac: 16,
    hp: 36,
    maxHp: 36,
    tempHp: 0,
    level: 5,
    conditions: [],
    exhaustion: 0,
    death: { success: 0, failure: 0 },
  },
});
```

NOTE: Plan 02 added SR-11/12/13 cases to this same file in Wave 1. Plan 06 edits ONLY the existing SR-8 inline snapshot object; it does NOT touch SR-11/12/13. The edits are at different line ranges, so sequential application is safe.

3. packages/g2-app/src/status-hud/__tests__/snapshot.test.ts — IDLE_SNAPSHOT at line ~37:
```
// BEFORE
const IDLE_SNAPSHOT: CharacterSnapshot = {
  actorId: 'thorin',
  name: 'Thorin',
  hp: 45,
  maxHp: 68,
  tempHp: 10,
  ac: 18,
  level: 5,
  conditions: [],
  exhaustion: 0,
};

// AFTER (Plan 06 adds death field)
const IDLE_SNAPSHOT: CharacterSnapshot = {
  actorId: 'thorin',
  name: 'Thorin',
  hp: 45,
  maxHp: 68,
  tempHp: 10,
  ac: 18,
  level: 5,
  conditions: [],
  exhaustion: 0,
  death: { success: 0, failure: 0 },
};
```

Reader extension (Plan 06 Task 1 — same atomic commit):

packages/foundry-module/src/readers/character-reader.ts (BEFORE — verified shape):
```
const hp = actor.system.attributes.hp;
const conditions = Array.from(actor.statuses);
return { hp: hp.value, maxHp: hp.max, tempHp: hp.temp, ..., conditions, ... };
```

AFTER (Plan 06 atomic extension):
```
const hp = actor.system.attributes.hp;
const death = {
  success: actor.system.attributes.death?.success ?? 0,
  failure: actor.system.attributes.death?.failure ?? 0,
};
const conditions = Array.from(actor.statuses);
return { hp: hp.value, maxHp: hp.max, tempHp: hp.temp, ..., conditions, ..., death };
```

Wave-2 file-overlap check:
- Plan 03 files_modified: toast-* + i18n NOT touched + 3 toast fixtures. ZERO overlap with Plan 06.
- Plan 04 files_modified: boot-error-* + boot-engine-error-wrapper + 10 boot-error fixtures. ZERO overlap with Plan 06.
- Plan 06 files_modified: 7 source/test files in shared-protocol + foundry-module + 5 g2-app consumer fixture files + 1 bridge consumer fixture file (13 total per iter-3 expansion). NO overlap with Plan 03 (Plan 03 creates NEW `toast-snapshot.test.ts`; Plan 06 modifies pre-existing `snapshot.test.ts` — different filenames). NO overlap with Plan 04 (boot-error-* + boot-engine-error-wrapper.ts + 10 boot-error fixtures are all disjoint from Plan 06's set).

The scene-renderer-smoke.test.ts file IS edited by BOTH Plan 02 (Wave 1) and Plan 06 (Wave 2) — but Plan 02 completes BEFORE Wave 2 starts, so Plan 06 is the second mover and merges its edits non-destructively (different line ranges).
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: CharacterSnapshotSchema.death extension + character-reader.ts producer extension + 3 g2-app consumer fixture updates (ATOMIC COMMIT — Pitfall 3 + B-2 fan-out closure)</name>
  <read_first>
    - packages/shared-protocol/src/payloads/character.ts (full file — Plan 06 EXTENDS the strictObject schema)
    - packages/shared-protocol/src/index.ts (full file — Plan 06 adds re-exports of DeathSavesSchema + DeathSaves type)
    - packages/foundry-module/src/readers/character-reader.ts (full file — line 44-58 contains the hp/conditions read; Plan 06 inserts death read in the SAME atomic commit)
    - packages/foundry-module/src/readers/readers.test.ts (full file — Plan 06 extends with death-field round-trip test)
    - packages/g2-app/src/__tests__/example-status-hud.test.ts (full file — IDLE_SNAPSHOT line 35; B-2 fan-out update)
    - packages/g2-app/src/__tests__/scene-renderer-smoke.test.ts (full file — SR-8 character.delta payload at line ~328; Plan 06 edits ONLY the SR-8 inline snapshot object, does NOT touch SR-11/12/13 added by Plan 02)
    - packages/g2-app/src/status-hud/__tests__/snapshot.test.ts (full file — IDLE_SNAPSHOT line ~37; B-2 fan-out update)
    - .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-RESEARCH.md §Q4 (death-saves event source: REQUIRED schema extension; Foundry dnd5e v5.x field path `actor.system.attributes.death.{success,failure}`)
    - .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04b-CONTEXT.md §Area 7 REVISED (atomic commit mandate — no .optional() window of drift)
    - .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-RESEARCH.md Pitfall 3 (atomic commit OR temporary .optional() — CONTEXT locks atomic; Plan 06 honours)
    - .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-PLAN-CHECK.md §B-2 (iteration 1 — workspace-wide fixture sweep enumeration)
  </read_first>
  <files>packages/shared-protocol/src/payloads/character.ts, packages/shared-protocol/src/index.ts, packages/shared-protocol/src/payloads/character.test.ts, packages/foundry-module/src/readers/character-reader.ts, packages/foundry-module/src/readers/readers.test.ts, packages/g2-app/src/__tests__/example-status-hud.test.ts, packages/g2-app/src/__tests__/scene-renderer-smoke.test.ts, packages/g2-app/src/status-hud/__tests__/snapshot.test.ts</files>
  <behavior>
    Schema extension tests (in packages/shared-protocol/src/payloads/character.test.ts):
    - Test CS-DS-1: CharacterSnapshotSchema.safeParse({...validSnapshot, death: { success: 0, failure: 0 }}).success === true
    - Test CS-DS-2: CharacterSnapshotSchema.safeParse({...validSnapshot, death: { success: 3, failure: 0 }}).success === true (stabilized)
    - Test CS-DS-3: CharacterSnapshotSchema.safeParse({...validSnapshot, death: { success: 0, failure: 3 }}).success === true (dead)
    - Test CS-DS-4: CharacterSnapshotSchema.safeParse({...validSnapshot, death: { success: 4, failure: 0 }}).success === false (out of range)
    - Test CS-DS-5: CharacterSnapshotSchema.safeParse({...validSnapshot, death: { success: -1, failure: 0 }}).success === false (negative)
    - Test CS-DS-6: CharacterSnapshotSchema.safeParse({...validSnapshot /* no death field */}).success === false (REQUIRED, not optional)
    - Test CS-DS-7: DeathSavesSchema exported separately; DeathSavesSchema.safeParse({success: 1, failure: 2}).success === true
    - Test CS-DS-8: DeathSaves type infers correctly (`const d: DeathSaves = {success:1, failure:2}` compiles)

    Reader extension tests (in packages/foundry-module/src/readers/readers.test.ts):
    - Test CR-DS-1: readCharacterSnapshot(mockActor) returns snapshot with `death: { success: 0, failure: 0 }` when mockActor.system.attributes.death = {success: 0, failure: 0}
    - Test CR-DS-2: readCharacterSnapshot returns death.failure: 2 when mockActor's death.failure is 2
    - Test CR-DS-3: readCharacterSnapshot defaults death to {success: 0, failure: 0} when mockActor.system.attributes.death is undefined (Pitfall: dnd5e fresh-actor state may have death undefined; reader's nullish-coalesce protects)
    - Test CR-DS-4: The returned snapshot passes CharacterSnapshotSchema.safeParse (full round-trip)
    - Test CR-DS-5: Existing CR tests still pass (regression-safe — no rename of hp/maxHp/ac etc.)

    Consumer-fixture round-trip (B-2 closure — implicit via workspace-wide pnpm typecheck):
    - example-status-hud.test.ts IDLE_SNAPSHOT now passes CharacterSnapshotSchema.safeParse (death field present)
    - scene-renderer-smoke.test.ts SR-8 payload now passes CharacterSnapshotSchema.safeParse
    - snapshot.test.ts IDLE_SNAPSHOT now passes CharacterSnapshotSchema.safeParse
    All three tests CONTINUE TO PASS after the death field is added (no behavior change to Phase 4a renderer — death field is ignored by standard mode rendering until Plan 05 ships the pivot trigger).
  </behavior>
  <action>
    **ATOMIC COMMIT — all 8 files in single git commit (Pitfall 3 + B-2 closure):**

    Stage all 8 files before committing. The single commit message includes a note that this is the Pitfall-3 mitigation atomic commit closing B-2 workspace-wide fan-out.

    **1. Modify `packages/shared-protocol/src/payloads/character.ts`:**

    Add `DeathSavesSchema` definition + type export BEFORE the `CharacterSnapshotSchema` definition:
    ```
    /**
     * Death saving throw progress per dnd5e v5.x `actor.system.attributes.death`.
     *
     * Each death save outcome increments the appropriate counter (0..3 each); 3 successes
     * = stabilized, 3 failures = dead. Counters reset on full rest or HP restoration.
     *
     * @see Specs.md §3.4 (Foundry dnd5e v5.x compatibility)
     * @see 04B-RESEARCH.md §Q4 (schema extension rationale + verified field path)
     */
    export const DeathSavesSchema = z.strictObject({
      success: z.number().int().min(0).max(3),
      failure: z.number().int().min(0).max(3),
    });
    export type DeathSaves = z.infer<typeof DeathSavesSchema>;
    ```

    Extend CharacterSnapshotSchema with the new `death` field (REQUIRED, not .optional()):
    ```
    export const CharacterSnapshotSchema = z.strictObject({
      actorId: ...,
      name: ...,
      hp: ...,
      maxHp: ...,
      tempHp: ...,
      ac: ...,
      level: ...,
      conditions: ...,
      exhaustion: ...,
      death: DeathSavesSchema,  // NEW Phase 4b
    });
    ```

    Update the schema JSDoc to add a `death` bullet point explaining the field.

    **2. Modify `packages/shared-protocol/src/index.ts`:**

    Re-export `DeathSavesSchema` + `DeathSaves` type alongside the existing `CharacterSnapshotSchema` exports.

    **3. Modify `packages/foundry-module/src/readers/character-reader.ts`:**

    Inside the `readCharacterSnapshot(actor)` function (or equivalent — read the file to find the actual function name), insert the death read AFTER the hp read and BEFORE the return statement:
    ```
    const hp = actor.system.attributes.hp;
    const death = {
      success: actor.system.attributes.death?.success ?? 0,
      failure: actor.system.attributes.death?.failure ?? 0,
    };
    const conditions = Array.from(actor.statuses);
    return { ..., death };
    ```

    Use nullish-coalescing for defensive defaults (CR-DS-3). The return object must satisfy CharacterSnapshotSchema (CR-DS-4) — the test asserts this via safeParse.

    Update the function's JSDoc to mention the death field.

    **4. Schema tests `packages/shared-protocol/src/payloads/character.test.ts`:**

    If the file does not exist, CREATE it. If it exists, extend with the CS-DS-1..CS-DS-8 tests. Use structural literals for the snapshot fixtures.

    **5. Reader tests `packages/foundry-module/src/readers/readers.test.ts`:**

    Extend with CR-DS-1..CR-DS-5. The mock actor fixture should include `system.attributes.death = { success: 0, failure: 0 }` by default; the CR-DS-3 case overrides to `undefined`.

    **6. B-2 fixture fan-out — update IDLE_SNAPSHOT in `packages/g2-app/src/__tests__/example-status-hud.test.ts`:**

    Locate the existing `IDLE_SNAPSHOT` literal (currently at line ~35). Add the `death: { success: 0, failure: 0 }` field at the end of the object literal. No other lines change. Existing tests SE-1, SE-2, SE-3 continue to pass (the renderer ignores the death field in standard mode; Plan 05 adds the pivot trigger separately).

    **7. B-2 fixture fan-out — update SR-8 inline payload in `packages/g2-app/src/__tests__/scene-renderer-smoke.test.ts`:**

    Locate the `snapshotEvent = JSON.stringify({ type: 'character.delta', payload: { ... } })` literal inside the SR-8 test block (around line ~328). Add `death: { success: 0, failure: 0 }` to the payload object. Do NOT modify Plan 02's SR-11/12/13 additions (different line range; Plan 02 added new test cases AFTER SR-10). Sequential application is safe — Plan 02 completed in Wave 1, Plan 06 is the second mover in Wave 2.

    **8. B-2 fixture fan-out — update IDLE_SNAPSHOT in `packages/g2-app/src/status-hud/__tests__/snapshot.test.ts`:**

    Locate the existing `IDLE_SNAPSHOT` literal (currently at line ~37). Add `death: { success: 0, failure: 0 }` field. No other lines change.

    Constraints:
    - **ATOMIC COMMIT**: all 8 files in same git commit. Executor MUST stage all files together before committing.
    - REQUIRED field (NOT .optional()). The Pitfall 3 mitigation is the atomic commit, not the schema flexibility.
    - INV-4 JSDoc on every public export.
    - `pnpm typecheck` MUST exit 0 across ALL packages after this task (the workspace typecheck catches any consumer that still passes a snapshot WITHOUT death — if it fails, there's an UNENUMERATED consumer; document and fix in same commit).
    - `pnpm --filter @evf/shared-protocol test --run && pnpm --filter @evf/foundry-module test --run && pnpm --filter @evf/g2-app test --run` exit 0.
    - dnd5e v5.x death field path `actor.system.attributes.death` is correct per RESEARCH §Q4 [VERIFIED via foundryvtt/dnd5e source]. If the field path differs at execution time, the executor MUST verify against actual dnd5e v5.3.3 source AND document in 04b-06-SUMMARY.md.
    - Plan 02's SR-11/12/13 additions to scene-renderer-smoke.test.ts MUST be preserved (executor verifies via grep `SR-1[123]` returning ≥3 after the edit).
  </action>
  <verify>
    <automated>pnpm --filter @evf/shared-protocol test --run -- src/payloads/character.test.ts && pnpm --filter @evf/foundry-module test --run -- src/readers/readers.test.ts && pnpm --filter @evf/g2-app test --run -- src/__tests__/example-status-hud.test.ts src/__tests__/scene-renderer-smoke.test.ts src/status-hud/__tests__/snapshot.test.ts && grep -c 'death: DeathSavesSchema' packages/shared-protocol/src/payloads/character.ts && grep -c 'export const DeathSavesSchema' packages/shared-protocol/src/payloads/character.ts && grep -c 'DeathSavesSchema' packages/shared-protocol/src/index.ts && grep -c 'actor.system.attributes.death' packages/foundry-module/src/readers/character-reader.ts && grep -cE 'death\.success.*\?\?.*0|death\.failure.*\?\?.*0' packages/foundry-module/src/readers/character-reader.ts && grep -cE 'CS-DS-0[1-8]' packages/shared-protocol/src/payloads/character.test.ts && grep -cE 'CR-DS-0[1-5]' packages/foundry-module/src/readers/readers.test.ts && grep -c 'death: { success: 0, failure: 0 }' packages/g2-app/src/__tests__/example-status-hud.test.ts && grep -c 'death: { success: 0, failure: 0 }' packages/g2-app/src/__tests__/scene-renderer-smoke.test.ts && grep -c 'death: { success: 0, failure: 0 }' packages/g2-app/src/status-hud/__tests__/snapshot.test.ts && grep -cE 'SR-1[123]' packages/g2-app/src/__tests__/scene-renderer-smoke.test.ts && pnpm typecheck && pnpm lint:ci</automated>
  </verify>
  <done>
    All 5 test files green (CS-DS-1..8 + CR-DS-1..5 = 13 tests minimum; example-status-hud / scene-renderer-smoke / snapshot tests CONTINUE to pass with no behavior change); schema + reader + 3 g2-app consumer fixtures committed ATOMICALLY (single git commit); pnpm typecheck exits 0 across the FULL workspace (workspace-wide check catches any remaining consumer omission); Plan 02 SR-11/12/13 grep gate preserved.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: shared-protocol/src/payloads/concentration.ts (new envelope schemas) + index.ts re-exports</name>
  <read_first>
    - packages/shared-protocol/src/envelope.ts (Phase 3 envelope pattern; concentration envelopes follow the same shape — `EnvelopeSchema` with `proto/seq/ts/type/session_id/payload`. Carrier field is `payload` NOT `value`.)
    - packages/shared-protocol/src/index.ts (Plan 06 Task 1 — re-export structure)
    - packages/shared-protocol/src/payloads/character.ts (Plan 06 Task 1 — z.strictObject + min() constraints pattern)
    - .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-RESEARCH.md §Approach 6 (conc-modal envelope shapes verbatim)
    - .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04b-CONTEXT.md §Area 8 (conc-drop modal trigger + bridge event emission policy)
  </read_first>
  <files>packages/shared-protocol/src/payloads/concentration.ts, packages/shared-protocol/src/index.ts, packages/shared-protocol/src/payloads/concentration.test.ts</files>
  <behavior>
    concentration schema tests:
    - Test CN-1: ConcConflictPayloadSchema.safeParse({effectId: 'eff1', currentConcentrationName: 'Hold Person', newSpellName: 'Bless'}).success === true
    - Test CN-2: ConcConflictPayloadSchema.safeParse({effectId: '', ...}).success === false (effectId.min(1))
    - Test CN-3: ConcConflictPayloadSchema.safeParse({effectId: 'eff1', currentConcentrationName: '', newSpellName: 'Bless'}).success === false
    - Test CN-4: ConcDropConfirmedPayloadSchema.safeParse({effectId: 'eff1'}).success === true
    - Test CN-5: ConcDropConfirmedPayloadSchema.safeParse({effectId: ''}).success === false
    - Test CN-6: CONC_CONFLICT_TYPE === 'conc.conflict' (literal type)
    - Test CN-7: CONC_DROP_CONFIRMED_TYPE === 'conc.drop.confirmed' (literal type)
    - Test CN-8: Both schemas + types + constants re-exported from `@evf/shared-protocol` top-level (import { ConcConflictPayloadSchema, CONC_DROP_CONFIRMED_TYPE } from '@evf/shared-protocol' compiles)
    - Test CN-9 (envelope round-trip — W-4 closure precursor): construct a synthetic envelope `{proto:'evf-v1', seq:0, ts:Date.now(), type:CONC_DROP_CONFIRMED_TYPE, session_id:'<valid uuid v4>', payload:{effectId:'eff1'}}`; call `EnvelopeSchema.safeParse(envelope)`; assert .success === true. This proves Plan 05's modal envelope construction (uses the same shape) will round-trip cleanly.
    - Test CN-10 (envelope rejection on missing session_id): construct an envelope WITHOUT session_id; assert `EnvelopeSchema.safeParse(envelope).success === false`. This is the W-4 NF-1-class regression guard.
  </behavior>
  <action>
    **1. NEW file `packages/shared-protocol/src/payloads/concentration.ts`:**

    Module JSDoc cites 04B-RESEARCH.md §Approach 6 + 04b-CONTEXT.md §Area 8.

    Imports: `import { z } from 'zod';`

    Exports (verbatim — see <interfaces> shapes):
    - `ConcConflictPayloadSchema = z.strictObject({ effectId, currentConcentrationName, newSpellName })` — all 3 fields .min(1)
    - `type ConcConflictPayload` via z.infer
    - `const CONC_CONFLICT_TYPE = 'conc.conflict' as const`
    - `ConcDropConfirmedPayloadSchema = z.strictObject({ effectId })` — effectId .min(1)
    - `type ConcDropConfirmedPayload` via z.infer
    - `const CONC_DROP_CONFIRMED_TYPE = 'conc.drop.confirmed' as const`

    JSDoc on every export. The bridge-direction comments explain:
    - ConcConflictPayload: Bridge → g2-app (Phase 7 server-side detection emits)
    - ConcDropConfirmedPayload: g2-app → Bridge (Phase 4b emits; Phase 7 consumes for write path)

    **2. Modify `packages/shared-protocol/src/index.ts`:**

    Re-export everything from `./payloads/concentration.js` alongside existing exports. Add a comment block grouping the Phase 4b additions.

    **3. NEW file `packages/shared-protocol/src/payloads/concentration.test.ts`:**

    Vitest test file with 10 tests (CN-1..CN-10). Use shared-protocol's existing test pattern (likely node test env, NOT happy-dom).

    For CN-9 and CN-10 import `EnvelopeSchema` from `'../envelope.js'` and assert via `EnvelopeSchema.safeParse(...)`. Use a valid UUID v4 literal for CN-9 (e.g., `'11111111-1111-4111-8111-111111111111'` — UUID v4 has version 4 in nibble 13 and variant 8/9/a/b in nibble 17). For CN-10 omit `session_id` to force the rejection.

    Constraints:
    - INV-4 JSDoc on every export.
    - z.strictObject (not z.object) — extra fields rejected.
    - Type literal constants use `as const` to satisfy the EnvelopeSchema discriminant.
    - `pnpm --filter @evf/shared-protocol test --run` exits 0.
    - No new dependencies (zod 4.4.3 already in workspace).
    - W-4 round-trip closure: CN-9 + CN-10 prove the envelope shape is the canonical `EnvelopeSchema` (`payload` field, required `session_id: z.string().uuid()`) — NOT `WireEnvelopeSchema` and NOT `envelope.value`. This is the Phase 4a NF-1 regression-class guard.
  </action>
  <verify>
    <automated>pnpm --filter @evf/shared-protocol test --run -- src/payloads/concentration.test.ts && grep -c "export const ConcConflictPayloadSchema" packages/shared-protocol/src/payloads/concentration.ts && grep -c "export const ConcDropConfirmedPayloadSchema" packages/shared-protocol/src/payloads/concentration.ts && grep -c "CONC_CONFLICT_TYPE = 'conc.conflict'" packages/shared-protocol/src/payloads/concentration.ts && grep -c "CONC_DROP_CONFIRMED_TYPE = 'conc.drop.confirmed'" packages/shared-protocol/src/payloads/concentration.ts && grep -c "concentration" packages/shared-protocol/src/index.ts && grep -cE 'CN-(0[1-9]|10)' packages/shared-protocol/src/payloads/concentration.test.ts && grep -c 'EnvelopeSchema' packages/shared-protocol/src/payloads/concentration.test.ts && ! grep -E 'WireEnvelopeSchema|envelope\.value' packages/shared-protocol/src/payloads/concentration.test.ts && pnpm typecheck && pnpm lint:ci</automated>
  </verify>
  <done>
    concentration.test.ts green (10 tests — CN-1..CN-10); concentration.ts exports both schemas + types + type constants; index.ts re-exports concentration; CN-1..CN-10 grep-match; W-4 regression guard `! grep -E 'WireEnvelopeSchema|envelope\\.value'` succeeds (canonical EnvelopeSchema + envelope.payload used throughout); typecheck + lint:ci exit 0.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| CharacterSnapshotSchema.death extension is a BREAKING change for consumers | Atomic commit (schema + reader + 3 g2-app fixtures together) is the load-bearing mitigation; workspace-wide typecheck catches any UNENUMERATED missing-field consumer |
| ConcConflictPayloadSchema receives untrusted bridge WS payload (Phase 7 emits) | Plan 06 ships the schema; Plan 05 conc-conflict-dispatcher.ts performs safeParse at WS-receive boundary |
| Atomic commit constraint | Schema + reader + 3 fixture files MUST land in single git commit; otherwise pnpm typecheck breaks |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-4b-06-01 | T | CharacterSnapshotSchema.death = REQUIRED atomic commit | mitigate | ATOMIC COMMIT (Task 1): schema + reader + 3 g2-app fixtures land in same git commit; workspace-wide typecheck enforces field presence; Pitfall 3 + B-2 fan-out closed. |
| T-4b-06-02 | T | Concentration envelope schemas — module-level static `as const` constants | mitigate | `z.strictObject` + `.min(1)` enforces shape at WS receive boundary (Plan 05 conc-conflict-dispatcher uses safeParse). Empty strings + extra fields rejected. |
| T-4b-06-03 | D | scene-renderer-smoke.test.ts overlap with Plan 02 | mitigate | Plan 06 edits only the SR-8 inline snapshot object; Plan 02 added SR-11/12/13 AFTER SR-10 — different line ranges. Sequential application safe under wave-bracket scheduling. Verify gate `grep -cE 'SR-1[123]' returns ≥3` proves Plan 02 additions survived. |
| T-4b-06-04 | T | Canonical envelope shape regression (NF-1 class — Phase 4a precedent) | mitigate | CN-9 + CN-10 tests prove `EnvelopeSchema` is the canonical schema (NOT `WireEnvelopeSchema`); carrier field is `payload` (NOT `value`); `session_id: z.string().uuid()` is required. The `! grep -E 'WireEnvelopeSchema|envelope\\.value'` gate in Task 2 verify is the structural regression guard. |
</threat_model>

<verification>
- `pnpm --filter @evf/shared-protocol test --run` exits 0 (character.test.ts + concentration.test.ts)
- `pnpm --filter @evf/foundry-module test --run` exits 0 (readers.test.ts with new death tests)
- `pnpm --filter @evf/g2-app test --run` exits 0 (3 updated consumer fixtures pass; Phase 4a tests still green)
- `pnpm test` (workspace-wide) exits 0 — catches any cross-package break from the schema extension
- `pnpm typecheck && pnpm lint:ci` exit 0
- ATOMIC COMMIT in Task 1: schema + reader + 3 fixture files landed in same git commit (verified by git log inspection — single SHA touches all 8 files)
- Plan 02's SR-11/12/13 additions to scene-renderer-smoke.test.ts preserved (grep gate)
- W-4 regression guard: CN-9 + CN-10 prove canonical EnvelopeSchema + envelope.payload + session_id required
</verification>

<success_criteria>
Plan 06 closes when:
- CharacterSnapshotSchema.death extension landed ATOMICALLY with character-reader.ts producer AND 3 g2-app consumer fixture updates (Task 1 single commit — Pitfall 3 + B-2 closure)
- DeathSavesSchema exported separately for Plan 05's ergonomic narrowing
- Concentration envelope schemas (ConcConflictPayloadSchema + ConcDropConfirmedPayloadSchema) exported from @evf/shared-protocol
- CONC_CONFLICT_TYPE + CONC_DROP_CONFIRMED_TYPE wire constants exported
- W-4 NF-1-class regression closure: CN-9 + CN-10 prove the envelope shape is canonical (EnvelopeSchema + envelope.payload + required session_id UUID)
- All 3 g2-app consumer test files updated in the SAME atomic commit; pnpm typecheck across workspace passes immediately after the commit
- Plan 02's SR-11/12/13 grep gate preserved (sequential edit safety verified)
- Plan 05 (Wave 3) can now consume DeathSavesSchema + ConcConflictPayloadSchema + ConcDropConfirmedPayloadSchema + CONC_DROP_CONFIRMED_TYPE WITHOUT modifying shared-protocol — Plan 06 is the single mover
</success_criteria>

<output>
After completion, create `.planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04b-06-SUMMARY.md` capturing:
- Final DeathSavesSchema shape (success/failure 0..3)
- Final ConcConflictPayloadSchema + ConcDropConfirmedPayloadSchema shapes
- Atomic commit confirmation (Task 1 git log — single SHA touches all 8 files: shared-protocol/character.ts, shared-protocol/index.ts, foundry-module/character-reader.ts, shared-protocol/character.test.ts, foundry-module/readers.test.ts, g2-app/example-status-hud.test.ts, g2-app/scene-renderer-smoke.test.ts, g2-app/snapshot.test.ts)
- Conc envelope types (CONC_CONFLICT_TYPE + CONC_DROP_CONFIRMED_TYPE) exact wire strings
- Test counts: 13 tests in character.test.ts (extension) + 5 in readers.test.ts (extension) + 10 in concentration.test.ts = 28 new tests
- B-2 closure confirmation: 3 g2-app consumer fixtures updated atomically; pnpm typecheck across workspace immediate-pass
- W-4 confirmation: CN-9 + CN-10 envelope round-trip tests use canonical `EnvelopeSchema` + `envelope.payload` + `session_id: uuid`
- Plan 02 SR-11/12/13 preservation confirmation (grep gate after edit)
- Wave-2 file-overlap confirmation: zero overlap with Plan 03 OR Plan 04; scene-renderer-smoke.test.ts edited at different line range from Plan 02
</output>
</content>
</invoke>