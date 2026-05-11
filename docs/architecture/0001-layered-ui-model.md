---
status: accepted
date: 2026-05-11
deciders: aiacos (DM/PO/sole-developer)
consulted: Claude Code (Opus 4.7, planning/research agent)
informed: future contributors
---

# ADR-0001: Layered UI Model — z=0 map / z=1 status HUD / z=2 overlay panel

## Status

**ACCEPTED** — 2026-05-11. Binds Phase 4a (G2 Engine + Raster + Status HUD), Phase 4b (Overlay Slot + Map Mode Toggle), Phase 5 (Panel Plugin System).

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

- Specs.md §2.1 (UI architecture overview), §3.1 (G2 hardware constraints), §5.4 (state-store), §7.2 (layered render pipeline), §7.14.4 ck 1-15 (cross-overlay verification)
- Related ADRs: [ADR-0002](./0002-protocol-versioning.md) (envelope shape feeds layer state), [ADR-0008](./0008-code-quality-configuration.md) (snapshot framework infra)
- Phase entry-gate citations: Phase 4a (G2 Engine + Raster + Status HUD) — layer manager implementation; Phase 4b (Overlay Slot + Map Mode Toggle) — z=2 slot contract; Phase 5 (Panel Plugin System) — Panel API consumes the slot
- Sources: `hub.evenrealities.com/docs/guides/device-apis` (container budget verbatim, verified Phase 0 INV-2 round)
