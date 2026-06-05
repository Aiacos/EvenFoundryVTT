---
status: accepted
date: 2026-05-11
deciders: aiacos (DM/PO/sole-developer)
consulted: Claude Code (Opus 4.7, planning/research agent)
informed: future contributors
---

# ADR-0001: Layered UI Model — z=0 map / z=1 status HUD / z=2 overlay panel

## Status

**ACCEPTED** — 2026-05-11. **AMENDED** — 2026-05-14 (added z=0.5 extension) + **RATIFIED** — 2026-05-17 (Phase 14 — INFILL-01..05 closed). Binds Phase 4a (G2 Engine + Raster + Status HUD), Phase 4b (Overlay Slot + Map Mode Toggle), Phase 5 (Panel Plugin System).

## Context and Problem Statement

Even Realities G2 hardware enforces a strict container budget per `hub.evenrealities.com/docs/guides/device-apis`: **max 4 image containers + 8 text/list containers + exactly 1 container with `isEventCapture: 1`** per page. EVF must surface a persistent player HUD (HP/AC/actions/concentration), an interactive overlay (sheet/combat/spellbook tabs), and a backdrop scene (Foundry map raster or glyph) — without exceeding container budget AND without losing R1 input routing as overlays open/close.

Without an explicit layered model, ad-hoc panel rendering will: collide with container limits at runtime, lose the "always visible" Status HUD invariant (Specs §7.1a), and confuse R1 event routing (which container is the capture target right now?).

## Decision Drivers

- G2 hardware container budget (Specs §3.1, verbatim Even Hub docs)
- INV-1 Layout integrity (Specs §0.1) — character-perfect ASCII layout across all states
- Status HUD persistence requirement (Specs §7.1a — always visible regardless of overlay state)
- Single-capture-container constraint (G2 firmware: exactly 1 input target per page)
- Foundry desktop UI parity (left=map, right=sheet/log, modal overlays in front)
- INV-5 Gesture Determinism (Phase 6 ratification) — top layer always receives R1 events

## Considered Options

- **Option A**: Layered z-stack (z=0 map / z=1 status HUD persistent / z=2 overlay panel slot) with **exactly 1 capture container** that migrates as overlays open/close
- **Option B**: Single composite full-screen page rebuilt per state transition — no persistent regions
- **Option C**: Two-page architecture (HUD page + overlay page) with explicit page swap on R1 input

## Decision Outcome

**Chosen: Option A — Layered z-stack with single capture container.**

Justification: Option A is the only one that satisfies BOTH the hardware container budget AND the INV-1 Status HUD persistence requirement simultaneously. Option B (rebuild per transition) violates "no flicker / always visible" — re-rendering the HUD on every input is wasteful and causes visible blanking on G2's slow refresh. Option C (page swap) breaks INV-5: the player must mentally track "which page am I on" and the HUD vanishes during overlay interaction.

The single-capture-container migration on overlay open/close gives unambiguous R1 input routing: the topmost open layer owns capture; closing it returns capture to the parent layer.

### Consequences

- Good: Status HUD always visible (INV-1 satisfied); R1 input routing always unambiguous (INV-5 satisfied)
- Good: Panel plugin system (Phase 5) has a single, stable contract: "register a panel for the z=2 slot; layer manager handles capture migration"
- Good: Map mode toggle (Phase 4b — raster ↔ glyph) operates entirely at z=0 without disturbing layers above
- Neutral/Risk: Layer manager becomes a critical singleton — bugs cascade across all overlays. Mitigated by INV-1 snapshot tests (`@evf/shared-render` — ADR-0008 + Phase 4a) and capture-container assertion in Phase 4a integration tests.
- Neutral/Risk: Overlay z=2 slot is single-tenant — modals stacked on modals (e.g., concentration drop confirm WHILE death-saves visible) require explicit composition policy in Phase 4b (CONC-01 + DEATH-01 simultaneous edge case).

### Confirmation

- INV-1 snapshot tests via `@evf/shared-render` `matchAsciiFixture` (Phase 4a real fixtures)
- Phase 4a integration test: assert exactly 1 capture container at every state (`page.containers.filter(c => c.isEventCapture === 1).length === 1`)
- Specs.md §7.14.4 ck 1-15 verification checklist (cross-overlay reachability + closability) — Phase 6
- Phase 4a entry gate: this ADR cited as precondition for layer-manager API design

## Pros and Cons of the Options

### Option A — Layered z-stack

- Good: Single source of truth for "which layer owns input"; matches Foundry desktop UI mental model; clean Panel API contract for Phase 5
- Neutral: Requires careful layer-manager implementation (Phase 4a/4b heavy concentration of complexity)
- Bad: Single-tenant overlay slot — modal-on-modal cases need explicit policy (acceptable; rare in 5e flows)

### Option B — Single composite full-screen

- Bad: Violates INV-1 Status HUD persistence; visible flicker on every state change; G2 refresh latency makes "always visible" impossible without persistence

### Option C — Two-page architecture (HUD + overlay)

- Good: Simpler container budget math (each page is independent)
- Bad: Violates INV-5 (HUD vanishes during overlay) and INV-1 (player loses status awareness mid-action); requires explicit "back to HUD" gesture (extra cognitive load)

## More Information

- Specs.md §2.1 (UI architecture overview), §3.1 (G2 hardware constraints), §5.4 (state-store), §7.2 (layered render pipeline), §7.4c (Idle Content Infill z=0.5 — added v0.9.12), §7.14.4 ck 1-15 (cross-overlay verification)
- Related ADRs: [ADR-0002](./0002-protocol-versioning.md) (envelope shape feeds layer state), [ADR-0008](./0008-code-quality-configuration.md) (snapshot framework infra)
- Phase entry-gate citations: Phase 4a (G2 Engine + Raster + Status HUD) — layer manager implementation; Phase 4b (Overlay Slot + Map Mode Toggle) — z=2 slot contract; Phase 5 (Panel Plugin System) — Panel API consumes the slot
- Sources: `hub.evenrealities.com/docs/guides/device-apis` (container budget verbatim, verified Phase 0 INV-2 round + v0.9.12 spot-check 2026-05-14)

## Amendments

### Amendment 1 — z=0.5 Idle Content Infill layer (2026-05-14, Specs v0.9.12)

**Status:** ACCEPTED — extends Option A without overturning it.

**Trigger:** User request to "ridurre gli spazi vuoti" in the raster-mode default view (§7.4). The 4-tile 2×2 raster only fills ~13 rows of the 21-row map area, leaving ~3 row visually empty when no overlay is mounted.

**Decision:** Introduce a new `z=0.5 Idle Content Infill` layer between `z=0` (map) and `z=1` (status HUD), specified in Specs §7.4c. The new layer:

- **Reuses text/list container budget** (not image), so the hardware ceiling of 4 image containers is preserved untouched
- **Is rendered ONLY when z=2 is not mounted** — auto-demolished on `overlay_mounted`, auto-reborn on `overlay_dismissed`
- **Never captures input** — z=0 (or z=2 when active) retains capture; z=0.5 is render-only, same as z=1
- **Contains** (MVP default): combat-log strip (1 row, last event from `combat.recentEvents[0]`), z=0.5 label-separator (1 row), stats strip (1 row, mode + resolution + pipeline + BLE throughput + observed fps)
- **Atomic with z=2 lifecycle:** the `layer-manager` (Phase 4a) serializes `(unmount-all-z=0.5) + (mount-z=2)` as a single bundle on `overlay_mounted` — no intermediate frame with both visible. New failure-mode mitigation documented in Specs §11.5.8.6.

**Consistency check vs original Option A:**

- ✓ Container budget invariant preserved (4 image + 8 text/list + 1 capture — z=0.5 uses 3 of the 8 text/list slots, idle state at-cap)
- ✓ Status HUD persistence (z=1 always visible) — unchanged
- ✓ Single capture container — unchanged (z=0.5 is read-only)
- ✓ R1 input routing (INV-5) — unchanged (top-of-stack with `isEventCapture=1` rule still applies)
- ✓ Panel Plugin System (Phase 5) contract — extended with one new invariant: mounting a panel triggers z=0.5 demolish (a layer-manager guarantee, not a panel decision)

**Why amend instead of new ADR:** the change is additive — it does not alter any of the original Decision Drivers, Considered Options, or Decision Outcome. The single-capture-container premise, the layered z-stack, and the container-budget reasoning all hold verbatim. A separate ADR-0009 would duplicate the context. Amendment keeps the architectural narrative coherent for future readers.

**INV-2 status:** Container budget statement (`max 4 image + 8 text/list + 1 capture per page`) re-verified against `hub.evenrealities.com/docs/guides/device-apis` 2026-05-14 — drift verdict NEUTRO. Broader canonical constraint *"no arbitrary pixel drawing, no audio output, no camera"* confirmed verbatim. Specific 200×100 per-image-container dimension not directly visible on the canonical primary fetch snapshot 2026-05-14 — flagged as INV-2 follow-up (non-blocker for this amendment). Full evidence: `.planning/quick/20260514-raster-dynamic-infill/EVIDENCE.md`.

**Phase 14 ratification (2026-05-17):** Phase 14 (commit hash TBD — set by the commit step) ratifies the z=0.5 contract end-to-end: INV-1 fixtures locked (3 added — `raster-overlay-open.it.txt`, `raster-overlay-open.en.txt`, `glyph-scene.glyph-idle-z05.it.txt`); cross-state column-equality invariants verified (Z05-INV-01..04 in `packages/g2-app/src/status-hud/__tests__/z05-state-machine-fixtures.test.ts`); race coverage locked (LMT-DD-07 in `packages/g2-app/src/engine/__tests__/layer-manager.test.ts`). Full UI contract: `.planning/phases/EVF-14-raster-z-0-5-idle-content-infill/14-UI-SPEC.md` (Approval flipped to APPROVED Phase 14).

### Amendment 2 — Character Status Sheet as default base layer (2026-06-05, Specs v0.9.14)

**Status:** ACCEPTED — amends the z=0 assumption; does not overturn the layered model.

**Trigger:** Real-glasses test revealed "scritte troppo grandi" — the G2 LVGL font has a fixed 27px line height (no font control per SDK); the old 28×21 corner card was designed for a ~12px/24-row grid. Text appeared ~2.25× too big, overlapping, and clipping on real hardware (user report 2026-06-05).

**Decision:** The **default always-on glasses view** is now the **full-width Character Status Sheet** (~9 rows × ~50 chars, 576px wide, 27px grid), NOT the raster/glyph map. Specifically:

- `z=1` (StatusHudLayer) is now the **visible default base layer** — the status sheet fills the full 576px width
- `z=0` (MapBaseLayer) is **preserved in the layer stack** but its `draw()` is NOT called at boot for the default view — the map becomes a gesture-opened mode (deferred to Phase 20 / GEST-01 map-mode toggle)
- `z=0.5` (IdleInfillLayer) is similarly **preserved but not painted** in the default view (idle-infill only fills empty map rows; with the status sheet as base there are no empty map rows)
- All layer instances (`mapBase`, `idleInfill`) are still constructed and mounted in `lm.bundle()` so the deferred map-mode gesture toggle can re-activate them without a boot restart

**Why this overturns the pre-v0.9.14 z=0 assumption:** ADR-0001 (2026-05-11) assumed "z=0 map is always the bottom layer and always visible." The 27px font grid makes it physically impossible to show the map (z=0) AND readable character data (z=1) simultaneously within the 576×288 pixel budget AND a 27px line height. The character's status data is more "glanceable" than the map (the map is the physical table; the player looks DOWN at it naturally — Specs.md Core Value). Therefore z=1 becomes the primary visible layer.

**Consistency check vs original Option A:**

- ✓ Container budget invariant preserved (4 image + 8 text/list + 1 capture — same registry, same IDs)
- ✓ Status HUD persistence (z=1 always visible) — STRENGTHENED (now also the visible base)
- ✓ Single capture container — unchanged (map-capture id=7 is still the sole `isEventCapture=1` container)
- ✓ R1 input routing (INV-5) — unchanged (top-of-stack rule applies; map gesture toggle is future)
- ✓ Panel Plugin System (Phase 5) contract — unchanged (z=2 overlays mount above z=1 status sheet)
- ⚠ **Amendment to original**: z=0 map is no longer the default visible base. This is a design shift, not a contradiction — the layered z-stack model holds, but z=1 is now "always on top" in the default view.

**INV-2 note:** No new hardware claims. The 27px line height + ~50-char budget cites the prior `@evenrealities/pretext` measurement (verified on this project via the library's README + font data from EvenHub firmware).

**DEFERRED follow-up:** A dedicated "g2-app UI 27px density rework" phase will:
1. Update all overlay panel renderers (combat tracker, inventory, spellbook, etc.) to the 27px grid
2. Implement the real map-mode gesture toggle (Phase 20 / GEST-01)
3. Re-evaluate the z=0.5 idle-infill role in map mode
