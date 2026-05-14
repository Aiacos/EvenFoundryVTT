---
slug: raster-dynamic-infill
date: 2026-05-14
type: quick-task
flags: --research (inline INV-2)
status: in-progress
---

# Quick Task — Raster Dynamic Content Infill (z=0.5 layer)

**Origin:** User request 2026-05-14 — *"vorrei aumentare l'area della mappa rasterizzata in modo che non ci siano spazi vuoti"*.

## Discovery (compressed)

1. INV-2 cross-check (4 parallel WebFetch) confirmed the canonical hardware constraint *"no arbitrary pixel drawing"* on `hub.evenrealities.com/docs/guides/device-apis` (2026-05-14). Full INV-2 evidence: `EVIDENCE.md`.
2. The image container budget (4 × 200×100 max = 400×200 effective raster) is hardware-locked. Pushing past it is **structurally impossible** without breaking ADR-0001 + Specs §3.1.
3. The "empty space" the user noticed is **not raster-fillable** — it's the **~5 idle rows of the map area between the 2×2 tiles and the footer** (~330 char of unused text-grid real estate when no z=2 overlay is mounted).
4. Decision matrix: original Option B as I framed it (5th raster tile) violates container budget. **CORRECTED-B**: introduce a new layer `z=0.5 Idle Content Infill` that fills the empty rows with dynamic text containers (combat log mini, quick-action prompts, mode/fps/BLE stats). Auto-demolished when z=2 overlay mounts. INV-2 compatible, INV-1 compatible, no upstream challenge.
5. User confirmed CORRECTED-B 2026-05-14.

## Scope (atomic spec change v0.9.11 → v0.9.12)

| Artifact | Change |
|---|---|
| `Specs.md` §7.2 | Add `z=0.5 Idle Content Infill` to layered model + state machine. |
| `Specs.md` §7.3 | Update canvas allocation mockup to show z=0.5 region. |
| `Specs.md` §7.4 | Update default raster-mode mockup with idle-fill rows. |
| `Specs.md` §7.4 NEW `7.4c` | New subsection "Idle Content Infill — z=0.5 layer". |
| `Specs.md` §7.5 dynamic-allocation table | Add row for z=0.5 text container budget impact. |
| `Specs.md` §11.5.7 | Note z=0.5 update path (text container delta only, no raster impact). |
| `Specs.md` §11.5.8 | Add failure mode: z=2 mount mid-render → z=0.5 eviction race. |
| `Specs.md` Changelog | Bump v0.9.11 → v0.9.12 with INV-2 re-verification + dynamic infill rationale. |
| `README.md` | Bump version badge + add bullet on z=0.5 layer. |
| `docs/showcase/index.html` | Bump hero version + relevant layered-model section. |
| `docs/architecture/0001-layered-ui-model.md` | Amend ACCEPTED ADR to note z=0.5 extension (or new ADR-0009 if material). Decision: amend — z=0.5 is consistent with single-capture-container premise, no semantic change to z=0/1/2. |
| `.planning/STATE.md` | Append to "Quick Tasks Completed" table. |
| Atomic commit | INV-3 single commit covering all the above. |

## INV-1 invariants to maintain

- Idle-state mockup (z=0 + z=0.5 + z=1) must remain char-precision.
- Overlay-open mockup (z=0 + z=1 + z=2) must remain char-precision and visually demonstrate z=0.5 disappearance with **no flicker / no layout shift** for z=0 and z=1.
- Frame corners, dividers, column boundaries: identical column positions across both states.

## Container budget after change

| State | Image | Text/list | Capture | Notes |
|---|---|---|---|---|
| MAIN_MAP raster idle (z=0+z=0.5+z=1) | 4 (2×2 raster) | 5-8 (Header + Status HUD + Footer + **3 z=0.5 infill**) | 1 (z=0) | At budget cap; safe |
| MAIN_MAP raster + overlay-open | 4 or 3 (degraded) | 4-5 (Header + Status HUD + Footer + 1 overlay text/list) | 1 (z=2) | Well below cap |
| MAIN_MAP glyph idle | 0 | 5-8 (same as raster + z=0.5) | 1 (z=0) | Glyph mode is text-only; z=0.5 still applies |

## Open items / followup

- The specific 200×100 number was not directly visible on `hub.evenrealities.com/docs/guides/device-apis` at fetch 2026-05-14 — broad "no arbitrary pixel drawing" constraint holds, but the precise dimension may live in a JS-rendered SDK reference page not fetched via WebFetch. Flagged as INV-2 follow-up; non-blocking for this change.
- Phase 0 GO/NO-GO (§10.0) does not need to add a new gate — z=0.5 uses existing text container API.
- Phase 4a/4b plans (when written) will reference the new §7.4c.
