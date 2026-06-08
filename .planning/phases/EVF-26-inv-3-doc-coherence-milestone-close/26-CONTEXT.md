# Phase 26: INV-3 Doc Coherence Milestone Close - Context

**Gathered:** 2026-06-08
**Status:** Ready for planning
**Mode:** Smart-discuss (autonomous) — doc-only milestone close

<domain>
## Phase Boundary

Aggiornare atomicamente (singolo commit INV-3) `Specs.md §7` + `README.md` + `docs/showcase/index.html` perché riflettano il substrato raster come default boot, con i mockup ASCII §7 ricondotti a una subsection "Glyph Fallback Mode — BLE-degraded path". Bump versione Specs v0.9.15 → v0.10.0 con stanza changelog del milestone. NESSUN codice applicativo toccato. Atto di chiusura del milestone v0.10.0.
</domain>

<decisions>
## Implementation Decisions

### D-26.1 — INV-2 round eseguito, NO DRIFT [USER-DECIDED: esegui]
Round INV-2 di re-verify upstream eseguito 2026-06-08 (4 WebFetch paralleli su domini canonici). Risultati (tutti confermati, nessun drift):
- G2 display: "576 x 288 pixels per eye", "4-bit greyscale (16 shades of green)" (hub overview)
- Execution model: "App logic runs on the phone; the glasses handle display rendering and native scroll processing" (verbatim, hub overview)
- Audio: "4-mic array (single audio stream, 16kHz PCM)"; camera/speaker: "None" (hub overview/device-apis)
- Gestures: press/double-press/swipe-up/swipe-down — CLICK_EVENT(0)/DOUBLE_CLICK_EVENT(3)/SCROLL_TOP_EVENT(1)/SCROLL_BOTTOM_EVENT(2); no long-press (hub input-events)
- Constraints verbatim: "no arbitrary pixel drawing, no audio output, no text alignment, no font control, no background colors, ..., no camera (there is none), and images are greyscale only" (hub device-apis)
- dnd5e latest = release-5.3.3 (github dnd5e) — matches stack pin ≥5.3.3
- Image-container hard limits (max 4 images, 20–200×20–100px) NON ri-emersi in questo fetch ma INV-2-verificati 2026-06-05 (memoria `g2-image-container-hard-limits`); invariati.
Il changelog v0.10.0 DEVE registrare "INV-2 Re-verified ✓ 2026-06-08 — no drift (milestone è architettura di rendering interna, nessun nuovo claim upstream)".

### D-26.2 — ASCII mockups PRESERVATI, spostati in subsection (success criterion #2)
I mockup ASCII in Specs §7 NON sono cancellati: vengono annotati come path BLE-degraded e spostati in una subsection "Glyph Fallback Mode — BLE-degraded path", chiaramente labeled, preservando la loro funzione come spec del fallback glyph (e contratto INV-1).

### D-26.3 — Atomic single commit (INV-3, success criterion #1)
Specs §7.2 (nuovo paragrafo raster substrate + CanvasCompositor model) + Specs §7.4 (mockup → subsection Glyph Fallback) + Specs changelog (bump v0.10.0) + README (sezione Rendering: rimuovere stat tipo "10 rows × 50 chars"/"27px", aggiungere descrizione canvas compositor; badge versione → v0.10.0) + docs/showcase/index.html (stats aggiornati line ~473, versione → v0.10.0) — TUTTO in UN solo commit, NESSUN file di codice.

### D-26.4 — Grep coherence guard (success criterion #3)
`grep -n "10 rows × 50 chars\|27px SDK\|text-container.*status" README.md docs/showcase/index.html` → 0 match, O i match rimasti sono esplicitamente in contesto "glyph fallback". (Nota: lo showcase line 473 ha "27px HUD 8-row" v0.9.15 da aggiornare.)

### D-26.5 — Changelog stanza v0.10.0 (success criterion #4)
Stanza changelog Specs v0.9.15 → v0.10.0 che riassume il milestone: CanvasCompositor model (Phase 19), status HUD canvas + VT323 (Phase 20), 6-tab raster character sheet + dati main-tab (Phase 21), features+biography schema (Phase 22), combat tracker raster + AC (Phase 23), delta loop ~5fps xxhash (Phase 24), promozione raster a default boot + glyph fallback (Phase 25), INV-1 raster contract, INV-2 re-verified ✓.

### D-26.6 — inv:all green (success criterion #5)
`pnpm --filter @evf/validation-harness inv:all` (o `inv:all:skip-inv2` se INV-2 network non disponibile in-suite) verde su entrambe le suite (glyph + raster). Il commit INV-3 è l'atto di chiusura del milestone.

### D-26.7 — Pre-bump checklist (CLAUDE.md)
Rispettare la pre-bump checklist: README badge version = Specs header version = showcase hero/version = v0.10.0; verificare riferimenti §; INV-2 round fatto (D-26.1).
</decisions>

<code_context>
## Existing Code Insights

- Specs.md header version: v0.9.15 (line 9) → v0.10.0.
- Specs.md §7.2 = "Layered Rendering Model" (line 1295); §7.4 = "Default View — Character Status Sheet (27px grid)" (line 1363); §7.4a = Map Rendering Pipeline (1468).
- docs/showcase/index.html line ~473: stat span "v0.9.15" + "...1435 g2-app tests · 27px HUD 8-row" → bump version + update stat to raster substrate (current g2-app test count ~1585; workspace 3295).
- README.md: Rendering section + version badge.
- Specs.md changelog: existing stanzas v0.9.6–v0.9.15 as pattern (study format).
- Source of truth for the milestone summary: the SUMMARY.md files of Phases 19–25 (CanvasCompositor, status HUD, char sheet, features/bio, combat tracker, delta loop, promotion).
- INV suites: packages/validation-harness `inv:all` (glyph + raster); raster baseline established Phase 20.
- NO application code may be touched in this phase's atomic commit.
</code_context>

<specifics>
## Specific Ideas

Success criteria (ROADMAP) — all in the single atomic INV-3 commit. Requirement ID: RINV-03.
Pre-bump checklist (CLAUDE.md) applies: version coherence across README badge / Specs header / showcase; § reference integrity; INV-2 round (done, no drift).
</specifics>

<deferred>
## Deferred Ideas

- Hardware UAT of the milestone (handled via prior phases' HUMAN-UAT files); not a doc concern.
- Any new feature work → next milestone.
</deferred>
