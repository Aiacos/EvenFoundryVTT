# Phase 22: Features + Biography Schema Extension - Context

**Gathered:** 2026-06-08
**Status:** Ready for planning
**Mode:** Smart-discuss (autonomous) — grey areas resolved with user

<domain>
## Phase Boundary

`CharacterSnapshotSchema` porta `feats[]` e `biography` con reader nel `foundry-module`; i tab Features e Biography della scheda raster (già costruiti in Phase 21-03, attualmente con fixture hardcoded `DEFAULT_FEATS` / testo hardcoded) mostrano dati reali del personaggio.

This is the data-extension twin of Phase 21-01 (which added class/initiative/speed). Same atomic pattern: schema + foundry-module reader + canvas tab renderers updated together — no intermediate state where the schema is extended but the renderers still show fixtures.
</domain>

<decisions>
## Implementation Decisions

### D-22.1 — feats[] / biography are OPTIONAL schema fields
Per ROADMAP success criterion #4 ("nuovi campi opzionali"): add `feats?: FeatEntry[]` and `biography?: {...}` as OPTIONAL on `CharacterSnapshotSchema` so the ~26 downstream CharacterSnapshot literals across g2-app/bridge/foundry-mcp suites do NOT all need updating to compile under TS strict. Renderers fall back gracefully (empty feats array → "no feats"; biography omitted → empty-string fallback).

### D-22.2 — FeatEntry shape (from ROADMAP)
`FeatEntry = { category: string, name: string, isOrigin: boolean, description: string }`, validated by Zod.

### D-22.3 — extractFeats(): heuristic dnd5e-version-aware categorization [USER-DECIDED]
`extractFeats()` reads `actor.items` filtered to `type === 'feat'`. Determine `category` from `system.type.value` when present (dnd5e 2024); determine `isOrigin` via origin/background-feat detection (`system.type.subtype` / `system.type.value === 'origin'` / relevant flag). **Graceful fallback** when those fields are absent (dnd5e 2014 feats-as-plain-items): `category = 'general'`, `isOrigin = false`. Never throw on missing structure — mirror the null-safety style of the existing extractClass/extractWalkSpeed readers.

### D-22.4 — biography fields
`biography` carries `personality`, `ideal`, `bond`, `flaw`, `backstory` from the reader (dnd5e `system.details.*`). Omitted/empty → empty-string fallback per success criterion #5.

### D-22.5 — Bio tab: FULL gesture-driven scroll [USER-DECIDED — overrides truncate default]
The canvas Biography tab implements gesture-driven scroll so the full backstory is readable on the G2 (~10 rows × ~50 char). This adds scroll state (scroll offset, paging, scroll gesture handling) to the Bio tab beyond the static-tab pattern of the other tabs. Reuse the existing gesture/scroll plumbing where possible (panel-gesture-bus, over-scroll conventions from ADR-0012/GEST-01). Labelled fields (personality/ideal/bond/flaw) render above the scrollable backstory region.
</decisions>

<code_context>
## Existing Code Insights

- `packages/shared-protocol/src/payloads/character.ts` — `CharacterSnapshotSchema`; follow the 21-01 pattern (class/initiative/speed were added REQUIRED there, but per D-22.1 these new fields are OPTIONAL).
- `packages/foundry-module/src/readers/character-reader.ts` — `extractClass`/`extractInitiativeModifier`/`extractWalkSpeed` + `getCharacterSnapshot` wiring (lines ~520-651). Add `extractFeats()` / `extractBiography()` in the same style; wire into `getCharacterSnapshot`.
- `packages/foundry-module/src/types/foundry-globals.d.ts` — extend `Dnd5eAttributes` / actor item types as needed (feat item shape, `system.details.*`).
- `packages/g2-app/src/panels/character-sheet-tab-renderers.ts` — `paintFeatsTab` / `paintBioTab` currently use hardcoded fixtures (`DEFAULT_FEATS`). Replace with real snapshot data. Bio tab gains scroll (D-22.5).
- `packages/g2-app/src/panels/canvas-character-sheet-panel.ts` — owns active tab + (per 21 CR-01 fix) inline tab-strip; Bio scroll state lives here or in the renderer call.
- Downstream test literals: ~26 CharacterSnapshot literals across suites — optional fields mean no forced mass-update, but add focused tests per success criterion.
</code_context>

<specifics>
## Specific Ideas

Success criteria (from ROADMAP), all in scope of this single atomic phase:
1. `feats` is `FeatEntry[]` Zod-validated; `extractFeats()` filters `actor.items` by feat type; Features tab shows real feats (not `DEFAULT_FEATS`).
2. `biography` carries personality/ideal/bond/flaw/backstory from reader; Bio tab shows real bio (not hardcoded).
3. Atomic: schema + reader + Feats tab + Bio tab all in this phase — no intermediate broken state.
4. Downstream CharacterSnapshot literals compile under TS strict (optional fields, no mass update needed).
5. `pnpm test` passes with: schema tests (FeatEntry validation, empty feats array, biography omitted → empty fallback), reader tests (mock actor.items → extractFeats output incl. 2014/2024 paths), renderer tests (Feats tab real vs empty; Bio tab scroll).

INV-1: if any glyph fixtures change as a result, keep them byte-aligned and update the raster-hash baseline only when a legitimate canvas-output change occurs.
</specifics>

<deferred>
## Deferred Ideas

- Combat-related and other tabs are out of scope (Phase 23 handles combat tracker).
- Truncate-only Bio rendering was the alternative to D-22.5 scroll; not chosen.
</deferred>
