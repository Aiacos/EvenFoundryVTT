# Phase 13: V2 Stretch — Context

**Gathered:** 2026-05-17
**Status:** Ready for planning
**Source:** smart-discuss (autonomous batch — minimal scope, ACT-04 + STRETCH-06 accepted)

<domain>
## Phase Boundary

Minimal V2 stretch closure: **ACT-04 Reaction Execution + STRETCH-06 Sheet portrait** (feature-flagged). Remaining STRETCH-01..05/07/08 deferred to future milestones.

**Ships:**

1. **ReactionPromptPanel** (new OverlayPanel z=2). Appears 500ms after REACT-01 toast (Phase 7) fires. Y=fire reaction, N=dismiss.
2. **3 reaction handlers** in `packages/foundry-module/src/write-path/handlers/`:
   - `cast-shield` (Wizard/Sorcerer, +5 AC, consumes reaction slot).
   - `cast-counterspell` (ability check, consumes reaction slot + spell slot).
   - `opportunity-attack` (Ready Action chained).
3. **Reaction slot accounting** — extends Phase 9's `combat-action-tracker` to increment `reactionsUsed` on handler success; widget renders `R▓` (already in Phase 9).
4. **STRETCH-06 Sheet portrait** — 100×60 dithered image on Bio tab of CharacterSheetPanel. Feature-flagged via `view.features.portrait` Even Hub setLocalStorage. Default OFF.
5. **Portrait rendering** — reuses Phase 4a raster pipeline (image-q + upng-js + xxhash-wasm + OffscreenCanvas).

**Closure signals:**
- ACT-04 + STRETCH-06 software-closed.
- 7 stretches deferred (STRETCH-01 multi-player, STRETCH-02 server-side canvas, STRETCH-03 biometric, STRETCH-04 dnd5e v6.x, STRETCH-05 PF2e, STRETCH-07 DSN, STRETCH-08 cloud) — explicitly documented in deferred section.
- Running hardware-pending: 33 → **35** (SC-13-01 reaction trigger UAT, SC-13-02 portrait fidelity on real G2).

**NOT in scope:**
- Multi-player (STRETCH-01) — too broad.
- Multi-tenant cloud (STRETCH-08) — Phase 14+ if ever.
- dnd5e v6.x or PF2e — depend on those systems releasing; per-system adapter work.

</domain>

<decisions>
## Implementation Decisions

### Area 1: ACT-04 Reaction Execution

- **`ReactionPromptPanel`** at `packages/g2-app/src/panels/reaction-prompt-panel.ts`:
  - OverlayPanel z=2 (Strategy A single 'overlay-block' container).
  - Appears 500ms after REACT-01 toast — debounce avoids interrupting a flurry of toasts.
  - Layout: `[REAZIONE: Shield disponibile]\nGoblin attacca te (15 → 17 ▲)\n\n[Y] Lancia Shield (-1 reaz)\n[N] Annulla`.
  - Tap-Y = dispatch the matching reaction handler. Tap-N or 5s timeout = dismiss without firing.
- **3 reaction handlers** in `packages/foundry-module/src/write-path/handlers/`:
  - `cast-shield.ts` — `activity.use({ configure: false, spell: { consume: { spellSlots: true, reaction: true } } })`. Verify dnd5e 5.3.3 Shield spell shape.
  - `cast-counterspell.ts` — `activity.use(...)` + opposing ability check resolution via dnd5e workflow. Slot consumed.
  - `opportunity-attack.ts` — chains a weapon-attack with `flags.dnd5e.opportunityAttack: true`.
- **Slot accounting:** `combat-action-tracker.ts` (Phase 9) extended:
  - Add to filter: `audit.toolId in ['cast-shield', 'cast-counterspell', 'opportunity-attack']` → increment `reactionsUsed`.
  - Phase 9 widget already renders `R▓` when set.
- **socketlib handler count:** Phase 13 ADDS 3 new handlers (14 → **17**). New invariant: 17 from Phase 13 onward. Tests updated accordingly.
- **Reaction-PROMPT-trigger pipeline:**
  - Phase 7 reaction-watcher emits `r1.reaction.available` with `kind: 'Shield' | 'Counterspell' | 'OpportunityAttack'`.
  - Phase 7 reaction-toast-dispatcher already shows the toast.
  - **Phase 13** adds a parallel `reaction-prompt-dispatcher.ts` that pushes ReactionPromptPanel after 500ms grace.

### Area 2: STRETCH-06 Sheet Portrait

- **Portrait source:** `actor.img` (Foundry actor portrait URL). Phase 13 extends `character-reader.ts` (Phase 2/5) to surface `portrait.url` field in CharacterSnapshotSchema.
- **Portrait fetch + dither:** Bridge-side image proxy fetches the URL, dithers to 100×60 4-bit greyscale (Phase 4a image-q + upng-js pipeline), caches by URL hash. Emits `r1.portrait.ready` envelope with `{ actorId, pngBytes: base64 }`.
- **g2-app render:** CharacterSheetPanel Bio tab — checks `view.features.portrait` Hub setLocalStorage. If `'on'` AND portrait cached, render the 100×60 image at top of Bio tab.
- **Feature flag:** `view.features.portrait` ∈ `'on' | 'off'`. Default `'off'`. Boot reads at step 9 alongside `view.locale.override`. Phase 6 Quick Action menu unchanged (no UI toggle for the flag — V2 stretch, off by default).
- **Image container budget impact:** Bio tab is z=2 overlay. Adding 1 image container = z=2 (3 text + 1 image). z=0 map (4 image + 1 text) + z=1 status HUD (1-3 text) + z=2 Bio (1 image + 3 text) = 5 image, EXCEEDS 4-image cap. RESOLUTION: when portrait active on Bio tab, z=0 MapBaseLayer image count reduces from 4 to 3 (one image slot reassigned). Phase 4a's LayerManager.bundle handles this via slot reassignment.

### Plan Decomposition (anticipated)

| Wave | Plan | Title |
|------|------|-------|
| 0 | 13-01 | 3 reaction handlers (shield/counterspell/opp-attack) + tool registry registration + audit log + socketlib count → 17 |
| 1 | 13-02 | ReactionPromptPanel + reaction-prompt-dispatcher + 500ms debounce + combat-action-tracker reaction slot accounting + INV-1 fixtures |
| 2 | 13-03 | character-reader portrait.url extension + bridge-side image proxy + r1.portrait.ready envelope + cache by URL hash |
| 3 | 13-04 | CharacterSheetPanel Bio tab portrait render + view.features.portrait flag + container budget slot reassignment + INV-1 fixtures + Phase 13 closure |

4 plans, sequential.

### Threat Model

- **T-13-01** Reaction prompt spam — mitigated by 500ms debounce + Phase 4b toast queue squash.
- **T-13-02** Portrait URL untrusted — bridge proxy validates `actor.img` is HTTPS + same origin as Foundry; rejects external URLs.
- **T-13-03** Portrait cache poisoning — bridge cache keyed by SHA256(URL) + actor ownership check.
- **T-13-04** Reaction handler bypass — same single-workflow-origin discipline as Phase 7 (CI Gate 8 + executeAsGM).

### Hardware-pending SCs

- **SC-13-01:** Reaction prompt triggers correctly on real Foundry world with dnd5e 5.3.3 (real `dnd5e.preUseActivity` hook firing).
- **SC-13-02:** Sheet portrait renders character-perfect at 100×60 4-bit on real G2 phosphor.

2 SCs carry to ADR-0005 Branch A. Running project total: **33 + 2 = 35 hardware-pending SCs**.

</decisions>

<canonical_refs>
- Specs.md §7.5 (Sheet Bio tab portrait mockup)
- Specs.md §11.5.7 (raster pipeline — image-q + upng-js)
- packages/foundry-module/src/write-path/reaction-watcher.ts (Phase 7 — preUseActivity hook)
- packages/foundry-module/src/write-path/reaction-toast-dispatcher.ts (Phase 7 — toast emit)
- packages/g2-app/src/panels/concentration-drop-modal.ts (Phase 4b — modal exemplar)
- packages/g2-app/src/panels/character-sheet-panel.ts (Phase 5 — Bio tab extend)
- packages/g2-app/src/engine/raster-* (Phase 4a — raster pipeline reuse)
- packages/foundry-module/src/write-path/combat-action-tracker.ts (Phase 9 — extend filter)

</canonical_refs>

<deferred>
**7 STRETCH items explicitly deferred (post-v0.9.12 milestones):**

- STRETCH-01: Multi-player sync (4× G2 simultaneous).
- STRETCH-02: Server-side canvas extract (headless Foundry).
- STRETCH-03: Biometric narrative (R1 HR/HRV).
- STRETCH-04: dnd5e v6.x adapter (when ships).
- STRETCH-05: PF2e adapter.
- STRETCH-07: Dice So Nice raster stream.
- STRETCH-08: Multi-tenant cloud SaaS.

Future per-stretch development: `/gsd-autonomous --only N` after a new milestone defines scope.

</deferred>

---

*Phase 13 context — 2026-05-17 via smart-discuss (2 areas, MINIMAL V2 scope)*
