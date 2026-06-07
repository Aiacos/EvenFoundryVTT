---
phase: 22-features-biography-schema-extension
plan: 02
subsystem: foundry-module
tags: [reader, feat, biography, tdd, null-safety, html-strip, ambient-types]
dependency_graph:
  requires:
    - 22-01 (FeatEntrySchema + BiographySnapshotSchema in @evf/shared-protocol)
  provides:
    - extractFeats() (packages/foundry-module/src/readers/character-reader.ts)
    - extractBiography() (packages/foundry-module/src/readers/character-reader.ts)
    - stripHtml() inline helper (character-reader.ts)
    - FoundryItem.system.type/description ambient types (foundry-globals.d.ts)
    - Dnd5eDetails.{trait,ideal,bond,flaw,biography} ambient types (foundry-globals.d.ts)
    - getCharacterSnapshot() now emits feats + biography fields
    - FeatEntry + BiographySnapshot re-exported from @evf/shared-protocol index.ts
  affects:
    - packages/g2-app (22-03: paintFeatsTab/paintBioTab data wiring)
tech_stack:
  added: []
  patterns:
    - extractFeats null-safety mirrors extractClass/extractWalkSpeed (early-return on undefined)
    - extractBiography null-safety: EMPTY const + early-return, details.trait (NOT .personality)
    - stripHtml inline regex: html.replace(/<[^>]*>/g, '') — T-22-03 mitigation reader-side
    - foundry-globals.d.ts ambient-only extension (no imports — Pitfall 6 compliance)
key_files:
  created: []
  modified:
    - packages/foundry-module/src/readers/character-reader.ts
    - packages/foundry-module/src/types/foundry-globals.d.ts
    - packages/foundry-module/src/readers/readers.test.ts
    - packages/shared-protocol/src/index.ts
decisions:
  - D-22.3 confirmed: extractFeats category from system.type.value; 'general' fallback for PHB 2014
  - D-22.4 confirmed: details.trait → personality mapping (Pitfall 2 fix)
  - Pitfall 6 compliance: no imports in foundry-globals.d.ts
  - Rule 3 auto-fix: FeatEntry + BiographySnapshot added to @evf/shared-protocol index.ts (were missing)
metrics:
  duration: "4 min"
  completed_date: "2026-06-08"
  tasks_completed: 2
  files_changed: 4
  tests_added: 10
---

# Phase 22 Plan 02: extractFeats() + extractBiography() Readers Summary

**One-liner:** extractFeats() (PHB 2024/2014 paths + HTML strip) + extractBiography() (details.trait→personality, HTML-stripped backstory) wired into getCharacterSnapshot(), with full ambient type extensions in foundry-globals.d.ts.

## What Was Built

### extractFeats() (RDATA-03)

```typescript
export function extractFeats(actor: ReturnType<typeof game.actors.get>): FeatEntry[] {
  if (actor === undefined) return [];
  // filters items by type==='feat'
  // reads system.type.value → category (PHB 2024); fallback 'general' (PHB 2014)
  // isOrigin = typeValue === 'feat' && typeSubtype === 'origin'
  // HTML-strips description.value (T-22-03 mitigation)
}
```

### extractBiography() (RDATA-04)

```typescript
export function extractBiography(actor: ReturnType<typeof game.actors.get>): BiographySnapshot {
  // CRITICAL: reads details.trait (NOT details.personality) → personality
  // reads details.{ideal,bond,flaw} verbatim
  // HTML-strips details.biography.value → backstory (Pitfall 3 / T-22-03)
  // all-empty-string fallback for undefined actor or missing details
}
```

### Inline stripHtml() helper

Duplicated (not imported from g2-app — no cross-package dep) per Pitfall 6:
```typescript
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '');
}
```

### getCharacterSnapshot() wiring

```typescript
return {
  // ... existing fields ...
  speed: extractWalkSpeed(actor),
  feats: extractFeats(actor),      // RDATA-03 — always populated (optional schema field, concrete value)
  biography: extractBiography(actor), // RDATA-04 — always populated
  ...portraitField,
};
```

### foundry-globals.d.ts extensions

Two new ambient type extensions (no imports — Pitfall 6 compliance):

1. `FoundryItem.system.type?: { value?: string; subtype?: string }` — feat category/subtype
2. `FoundryItem.system.description?: { value?: string }` — HTML description field
3. `Dnd5eDetails.trait?: string` — personality traits (labeled "DND5E.PersonalityTraits")
4. `Dnd5eDetails.ideal/bond/flaw?: string` — character ideals/bonds/flaws
5. `Dnd5eDetails.biography?: { value?: string; public?: string }` — HTML backstory

## Test Coverage

10 new tests added in `readers.test.ts`:

| Test ID | Description | Result |
|---------|-------------|--------|
| CR-FT-1 | PHB 2024 origin feat: category='feat', isOrigin=true, HTML stripped | GREEN |
| CR-FT-2 | PHB 2014 feat (no system.type): category='general', isOrigin=false, no throw | GREEN |
| CR-FT-3 | Actor with zero feat items → returns [] | GREEN |
| CR-FT-4 | Background feat → category='background', isOrigin=false | GREEN |
| CR-FT-5 | Actor === undefined → returns [] (null-safety) | GREEN |
| CR-BIO-1 | All fields present: trait→personality, HTML-strips backstory | GREEN |
| CR-BIO-2 | HTML-stripping: complex tags stripped from backstory | GREEN |
| CR-BIO-3 | Empty/missing details → all five fields empty strings, no throw | GREEN |
| CR-BIO-4 | Actor === undefined → all-empty-string BiographySnapshot | GREEN |
| CR-FT-6/CR-BIO-5 | Integration: getCharacterSnapshot() carries feats[] + biography.personality from details.trait | GREEN |

Total foundry-module tests: **558 passed** (previously 548 — +10 new). All 34 test files green.

## TDD Gate Compliance

- RED commit `13eadde`: 10 tests added first (extractFeats/extractBiography not exported → TypeError)
- GREEN commit `75fce05`: implementation complete; all 558 tests pass

## Verification

- `pnpm --filter @evf/foundry-module test -- --run` → 558/558 passed
- `pnpm --filter @evf/foundry-module exec tsc --noEmit` → exit 0
- `pnpm lint:ci` → 0 errors on touched files (pre-existing unrelated errors in other files out of scope)
- CI Gate 8 socketlib handler count = **17** preserved (read-path-only extension, no new handler)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] FeatEntry + BiographySnapshot missing from @evf/shared-protocol index.ts**

- **Found during:** Task 1 GREEN — `pnpm --filter @evf/foundry-module exec tsc --noEmit` reported `TS2305: Module '"@evf/shared-protocol"' has no exported member 'BiographySnapshot'` and `FeatEntry`
- **Issue:** Plan 22-01 added the schemas to `character.ts` but omitted the re-exports from `index.ts`. The types were only accessible via direct file import, not the package barrel.
- **Fix:** Added `type BiographySnapshot`, `BiographySnapshotSchema`, `type FeatEntry`, `FeatEntrySchema` to `packages/shared-protocol/src/index.ts` export block (alphabetically sorted within character.ts section)
- **Files modified:** `packages/shared-protocol/src/index.ts`
- **Commit:** `75fce05`

**2. [Rule 3 - TypeScript] Dnd5eDetails cast required double-unknown**

- **Found during:** Task 2 GREEN — `TS2352: Conversion of type 'Dnd5eDetails' to type 'Record<string, unknown>' may be a mistake`
- **Issue:** `actor.system.details` is typed as `Dnd5eDetails` (specific interface), which TypeScript rejects as a direct cast to `Record<string, unknown>` since neither overlaps sufficiently.
- **Fix:** Changed `as Record<string, unknown> | undefined` to `as unknown as Record<string, unknown> | undefined` (double-cast through `unknown`) — standard TypeScript pattern for crossing non-overlapping type boundaries.
- **Files modified:** `packages/foundry-module/src/readers/character-reader.ts` line 585
- **Commit:** `75fce05`

## Known Stubs

None — extractFeats() and extractBiography() emit concrete values from real actor data. The `feats` and `biography` fields are now populated on every getCharacterSnapshot() call. The g2-app renderers (Plan 22-03) still render from `DEFAULT_FEATS`/hardcoded text until Plan 22-03 wires `snapshot.feats` and `snapshot.biography`.

## Downstream Symbol Names (for Plan 22-03)

| Export | Type | File | Line |
|--------|------|------|------|
| `extractFeats` | `(actor) => FeatEntry[]` | `character-reader.ts` | 542 |
| `extractBiography` | `(actor) => BiographySnapshot` | `character-reader.ts` | 581 |
| `getCharacterSnapshot().feats` | `FeatEntry[]` | wired at line 740 | — |
| `getCharacterSnapshot().biography` | `BiographySnapshot` | wired at line 741 | — |

## Threat Surface Scan

No new network endpoints, auth paths, or trust boundaries introduced. The threat mitigations from the plan's threat model are implemented:

| Threat ID | Mitigation | Implemented |
|-----------|------------|-------------|
| T-22-03 | HTML injection via biography.value / feat description → strip reader-side | stripHtml() applied in extractFeats() + extractBiography() |
| T-22-04 | DoS via missing dnd5e fields throwing | null-safe reads (`?? '' / ?? [] / ?? {}`); actor === undefined early-returns |

## Self-Check: PASSED

- `/home/aiacos/workspace/EvenFoundryVTT/packages/foundry-module/src/readers/character-reader.ts` — FOUND
- `/home/aiacos/workspace/EvenFoundryVTT/packages/foundry-module/src/types/foundry-globals.d.ts` — FOUND
- `/home/aiacos/workspace/EvenFoundryVTT/packages/foundry-module/src/readers/readers.test.ts` — FOUND
- `/home/aiacos/workspace/EvenFoundryVTT/packages/shared-protocol/src/index.ts` — FOUND
- Commit `13eadde` (RED) — FOUND
- Commit `75fce05` (GREEN) — FOUND
- `grep "function extractFeats" character-reader.ts` → line 542 — FOUND
- `grep "function extractBiography" character-reader.ts` → line 581 — FOUND
- `grep "feats: extractFeats(actor)" character-reader.ts` → line 740 — FOUND
- `grep "biography: extractBiography(actor)" character-reader.ts` → line 741 — FOUND
- `grep "details.trait" character-reader.ts` → line 589 (Pitfall 2 gate) — FOUND
- `grep "type?: {" foundry-globals.d.ts` → FoundryItem.system.type extension — FOUND
- `grep "trait?: string" foundry-globals.d.ts` → Dnd5eDetails.trait — FOUND
- socketlib count = 17 — CONFIRMED
