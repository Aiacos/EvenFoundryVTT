---
phase: 22-features-biography-schema-extension
plan: 01
subsystem: shared-protocol
tags: [schema, zod, feat-entry, biography, optional-fields, tdd]
dependency_graph:
  requires: []
  provides:
    - FeatEntrySchema (packages/shared-protocol/src/payloads/character.ts)
    - BiographySnapshotSchema (packages/shared-protocol/src/payloads/character.ts)
    - FeatEntry type
    - BiographySnapshot type
    - CharacterSnapshotSchema.feats (z.array(FeatEntrySchema).optional())
    - CharacterSnapshotSchema.biography (BiographySnapshotSchema.optional())
  affects:
    - packages/foundry-module (22-02: readers + foundry-globals.d.ts)
    - packages/g2-app (22-03: paintFeatsTab/paintBioTab data wiring)
tech_stack:
  added: []
  patterns:
    - z.object (NOT z.strictObject) for sub-schemas — forward-compat (SpellEntrySchema precedent)
    - .optional() on z.strictObject fields — Pitfall 4 pattern: absent=valid, present=valid, unknown=rejected
key_files:
  created: []
  modified:
    - packages/shared-protocol/src/payloads/character.ts
    - packages/shared-protocol/src/payloads/character.test.ts
decisions:
  - D-22.1: feats/biography are OPTIONAL — ~26 downstream literals compile without mass update
  - FeatEntrySchema uses z.object (open) matching SpellEntrySchema/AbilityScoreSchema precedent
  - BiographySnapshotSchema uses z.object (open) — sub-schema not strictObject
  - category field is z.string() NOT enum — dnd5e featureTypes is an open taxonomy
metrics:
  duration: "5 min"
  completed_date: "2026-06-08"
  tasks_completed: 2
  files_changed: 2
  tests_added: 11
---

# Phase 22 Plan 01: FeatEntrySchema + BiographySnapshotSchema Summary

**One-liner:** Wire RDATA-03/RDATA-04 Zod contracts — FeatEntrySchema + BiographySnapshotSchema +
optional feats/biography on CharacterSnapshotSchema using z.object forward-compat pattern.

## What Was Built

Two new Zod schemas exported from `@evf/shared-protocol` `character.ts`:

### FeatEntrySchema (RDATA-03)

```typescript
export const FeatEntrySchema = z.object({
  category: z.string(),        // dnd5e featureTypes verbatim; 'general' fallback for PHB 2014
  name: z.string().min(1),     // min(1): nameless items dropped by reader
  isOrigin: z.boolean(),       // PHB 2024 origin feat detection
  description: z.string(),     // HTML-stripped by reader
});
export type FeatEntry = z.infer<typeof FeatEntrySchema>;
```

### BiographySnapshotSchema (RDATA-04)

```typescript
export const BiographySnapshotSchema = z.object({
  personality: z.string(),  // from actor.system.details.trait (NOT .personality — Pitfall 2)
  ideal: z.string(),
  bond: z.string(),
  flaw: z.string(),
  backstory: z.string(),    // from system.details.biography.value, HTML-stripped by reader
});
export type BiographySnapshot = z.infer<typeof BiographySnapshotSchema>;
```

### CharacterSnapshotSchema optional extensions

```typescript
feats: z.array(FeatEntrySchema).optional(),      // RDATA-03 — line 664
biography: BiographySnapshotSchema.optional(),   // RDATA-04 — line 671
```

Both fields are OPTIONAL per D-22.1: existing ~26 downstream CharacterSnapshot literals
compile without any mass update.

## Test Coverage

11 new tests added in `character.test.ts`:

| Test ID | Description | Result |
|---------|-------------|--------|
| CS-FE-1 | FeatEntrySchema happy path | GREEN |
| CS-FE-2 | Rejects name:'' (min(1)) | GREEN |
| CS-FE-3 | Rejects missing isOrigin | GREEN |
| CS-FE-4 | CharacterSnapshotSchema parses WITH feats present | GREEN |
| CS-FE-5 | CharacterSnapshotSchema parses WITHOUT feats (absent valid) | GREEN |
| CS-FE-6 | strictObject unknown-key rejection preserved | GREEN |
| CS-BIO-1 | BiographySnapshotSchema happy path | GREEN |
| CS-BIO-2 | All-empty-string fields accepted (D-22.4 fallback) | GREEN |
| CS-BIO-3 | Rejects missing field (all 5 required on sub-object) | GREEN |
| CS-BIO-4 | CharacterSnapshotSchema parses WITH biography present | GREEN |
| CS-BIO-5 | CharacterSnapshotSchema parses WITHOUT biography (absent valid) | GREEN |

Total workspace tests: **3241 passed** (previously 3230 — +11 new). All 237 test files green.

## TDD Gate Compliance

- RED commit `1d2155b`: tests added first; 9 tests failed (FeatEntrySchema/BiographySnapshotSchema not defined)
- GREEN commit `d70d10a`: schemas implemented; all 11 tests pass

## Verification

- `pnpm --filter @evf/shared-protocol exec tsc --noEmit` → exit 0
- `pnpm lint:ci` → exit 0 (warnings are pre-existing, not from these files)
- `pnpm test` → 3241/3241 passed

## Deviations from Plan

None — plan executed exactly as written.

## Key Decisions Logged

1. `FeatEntrySchema` uses `z.object` (NOT `z.strictObject`) — forward-compat, matching
   `SpellEntrySchema`/`AbilityScoreSchema` precedent. Documented in JSDoc.
2. `BiographySnapshotSchema` uses `z.object` — sub-schemas in this project never use
   `z.strictObject` (only `CharacterSnapshotSchema` and `SkillsSchema` are strict).
3. `category` is `z.string()` NOT a `z.enum(...)` — dnd5e featureTypes is an open taxonomy
   (`CONFIG.DND5E.featureTypes` is user-extensible); the reader passes `system.type.value` verbatim.
4. Pitfall 4 confirmed via CS-FE-6: `z.strictObject + .optional()` correctly allows absent
   OR present-with-valid-type while still rejecting unknown top-level keys.

## Downstream Symbol Names (for Plans 22-02 / 22-03)

| Export | Type | File | Line |
|--------|------|------|------|
| `FeatEntrySchema` | `z.ZodObject` | `character.ts` | 480 |
| `FeatEntry` | TypeScript type | `character.ts` | 507 |
| `BiographySnapshotSchema` | `z.ZodObject` | `character.ts` | 533 |
| `BiographySnapshot` | TypeScript type | `character.ts` | 551 |
| `CharacterSnapshotSchema.feats` | `z.array(FeatEntrySchema).optional()` | `character.ts` | 664 |
| `CharacterSnapshotSchema.biography` | `BiographySnapshotSchema.optional()` | `character.ts` | 671 |

## Known Stubs

None — this plan is schema-only; no renderer or reader wiring. The `feats` and `biography`
fields will be absent (undefined) from all existing snapshots until Plan 22-02 wires the
Foundry-module readers.

## Threat Flags

No new network endpoints, auth paths, file access patterns, or schema changes at trust
boundaries beyond what is documented in the plan's threat_model. The existing
`CharacterSnapshotSchema.safeParse` gate in `CanvasCharacterSheetPanel.onSnapshot()` (T-21-01)
already covers the new optional fields — no new ingress point added (T-22-01, T-22-02 mitigated).

## Self-Check: PASSED

- `/home/aiacos/workspace/EvenFoundryVTT/packages/shared-protocol/src/payloads/character.ts` — FOUND
- `/home/aiacos/workspace/EvenFoundryVTT/packages/shared-protocol/src/payloads/character.test.ts` — FOUND
- Commit `1d2155b` (RED) — FOUND
- Commit `d70d10a` (GREEN) — FOUND
- `grep FeatEntrySchema character.ts` → line 480 — FOUND
- `grep BiographySnapshotSchema character.ts` → line 533 — FOUND
- `grep "feats: z.array" character.ts` → line 664 — FOUND
- `grep "biography: BiographySnapshotSchema" character.ts` → line 671 — FOUND
