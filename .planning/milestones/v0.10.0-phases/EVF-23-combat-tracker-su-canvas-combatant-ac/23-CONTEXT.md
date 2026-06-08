# Phase 23: Combat Tracker su Canvas + Combatant AC - Context

**Gathered:** 2026-06-08
**Status:** Ready for planning
**Mode:** Smart-discuss (autonomous) — grey areas resolved with user

<domain>
## Phase Boundary

Il combat tracker è renderizzato come pannello raster overlay z=2 (`CanvasCombatTrackerPanel`) con finestra scorrevole a 5 combattenti, highlight turno corrente, HP e AC reali, gesture di navigazione preservate. `CombatantSchema.ac` esteso (Zod + reader `foundry-module`). Estensione atomica: schema + reader + canvas panel nello stesso phase.

Pattern di riferimento: `CanvasCharacterSheetPanel` (Phase 21-03/04) — dual-interface `CanvasLayer` + `OverlayPanel`, z=`Z2_OVERLAY`, font VT323, container-registry id scheme, `_scrollOffset` per lo scroll within-panel, dirty-gate (`_dirty=false` come ultima riga di paint), `getCaptureContainer()='hud-capture'`. Il combat tracker glyph esistente è il riferimento semantico per contenuto e gesture.
</domain>

<decisions>
## Implementation Decisions

### D-23.1 — CanvasCombatTrackerPanel mirrors CanvasCharacterSheetPanel
Nuovo pannello `CanvasCombatTrackerPanel` come secondo z=2 canvas overlay, costruito sullo stesso pattern dual-interface del character sheet panel. Riusa container-registry, font loader, dirty-gate, e le convenzioni di paint stabilite in Phase 20/21. Id pannello distinto (es. `'canvas-combat-tracker'`).

### D-23.2 — Per-combatant row content (success criterion #1)
Ogni combattente nella finestra mostra: nome, HP corrente/max, ordine iniziativa, indicatore di concentrazione, e `ac` reale. L'AC sostituisce il placeholder `' --'` quando presente; `' --'` resta il fallback quando l'AC manca.

### D-23.3 — Scroll window: auto-follow turno corrente + scroll manuale [USER-DECIDED]
Finestra a 5 combattenti su N totali. Su `combat.delta` la finestra si ri-centra automaticamente per mantenere visibile il combattente di turno corrente (evidenziato full-contrast). Tra i turni, il giocatore può scrollare manualmente con il R1 ring per ispezionare altri combattenti (riusa `_scrollOffset`). L'auto-follow ha precedenza all'arrivo di un nuovo `combat.delta` (ri-centra), poi lo scroll manuale è di nuovo libero fino al prossimo delta.

### D-23.4 — AC reader: system.attributes.ac.value + fallback [USER-DECIDED]
`extractCombatantAc()` (o estensione del combatant reader) legge `actor.system.attributes.ac.value`, stabile tra dnd5e PHB 2014 e 2024. Se assente o non numerico → `ac` resta `undefined` e il renderer mostra `' --'`. Null-safe come gli altri reader (extractClass/extractWalkSpeed). NON calcolare flat+bonus+armor (fuori scope).

### D-23.5 — Gesture parity, no router changes (success criterion #3)
La gesture di apertura/chiusura del combat tracker canvas è semanticamente identica alla versione glyph; la chiusura via double-press è preservata. `PanelGestureBus` e `panel-router.ts` NON sono modificati — il nuovo pannello si registra/instrada attraverso i meccanismi esistenti (come ha fatto il character sheet canvas panel via boot dispatch gate renderMode==='canvas').

### D-23.6 — Atomicity (success criterion #4)
Schema `CombatantSchema.ac` + reader `foundry-module` + `CanvasCombatTrackerPanel` tutti in scope di questo phase — nessuno stato intermedio con schema esteso ma renderer non aggiornato.
</decisions>

<code_context>
## Existing Code Insights

- `packages/shared-protocol/src/payloads/` — `CombatantSchema` (combat delta payload). Add `ac?: number` OPTIONAL (mirror Phase 22 optional pattern → no forced downstream literal mass-update). Verify existing `' --'` placeholder consumer.
- `packages/foundry-module/src/readers/` — combat/combatant reader producing CombatantSchema; add AC extraction reading `actor.system.attributes.ac.value` (combatant.actor). Mirror extractWalkSpeed null-safety.
- `packages/foundry-module/src/types/foundry-globals.d.ts` — extend Dnd5eAttributes with `ac?: { value?: number }` if not present (ambient, import-free).
- `packages/g2-app/src/panels/canvas-character-sheet-panel.ts` — the pattern to mirror for `canvas-combat-tracker-panel.ts` (dual-interface, _scrollOffset, dirty-gate, container ids).
- `packages/g2-app/src/panels/` — existing glyph combat tracker panel/renderer (semantic + gesture reference; `' --'` AC placeholder lives here).
- `packages/g2-app/src/internal/boot-engine-core.ts` — boot dispatch gate renderMode==='canvas' routes panel targets to canvas variants (pattern from 21-03 for 'character-sheet'→'canvas-character-sheet'); add 'combat-tracker'→'canvas-combat-tracker'.
- combat.delta path: the engine receives combat.delta and the panel must re-render + auto-follow current turn.
- INV-1: if glyph combat fixtures change, keep byte-aligned + update raster-hash baseline like 21-05; if a canvas raster-hash baseline is introduced for the combat panel, add a FALSE-PASS guard like 21-05.
</code_context>

<specifics>
## Specific Ideas

Success criteria (ROADMAP), all in this atomic phase:
1. Combat tracker raster shows per windowed combatant: name, HP cur/max, initiative order, concentration indicator, real `ac` (from CombatantSchema.ac + reader) instead of `' --'`.
2. 5-combatant scroll window via R1 scroll; current-turn full-contrast highlight; auto-update on combat.delta.
3. Open/close gesture semantically identical to glyph (double-press close preserved); PanelGestureBus + panel-router.ts unchanged.
4. CombatantSchema.ac extended (Zod + reader); atomic with renderer.
5. pnpm test passes: CanvasCombatTrackerPanel tests (scroll window, current-turn highlight, ac rendering, missing-ac fallback) + CombatantSchema.ac tests (schema validation + reader mock).

Requirement IDs: RCOMB-01, RDATA-05.
</specifics>

<deferred>
## Deferred Ideas

- AC flat+bonus+armor derivation (alternative to D-23.4) — not chosen.
- Delta-loop xxhash optimization is Phase 24, not here.
- Promotion of raster to default boot is Phase 25.
</deferred>
