# Implementation Plan: Foundry-to-G2 HUD — connection, view selection, D&D sheet UI, composited FPS

**Branch**: `feat/hud-raster-rendering` | **Date**: 2026-06-18 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-foundry-g2-hud/spec.md` + user direction:
clean up & simplify the EvenHub-app ⇄ Foundry/Forge connection (one direct link); choose the player
view by selecting a player — or the **Party** view — from the plugin options (fold the mode setting
into the roster selector, with a synthetic "Party" entry = streaming user); refine the sheet UI
(Spell, Inventory, Bio, Skills, …) to look like a D&D sheet, with icons, on the compositor; composite
a smaller FPS badge, default bottom-right, with an env var to pick the corner; clean up & optimize the
code; update/rewrite the docs.

## Summary

Deliver an enhancement slice over the existing EVF system that (1) replaces the four-source connection
config with one canonical "direct link" profile to the bridge origin, (2) unifies map-view selection
into the roster selector with a synthetic "Party" entry (removing the separate mode dropdown), (3)
restyles the character-sheet tabs into a D&D-sheet look with a shared icon set on the canvas
compositor, (4) splits the FPS readout into a small composited badge whose corner is set by
`EVF_FPS_CORNER`, and (5) removes the dead code these changes surface and refreshes the technical +
user docs. The map source itself (owner-elected browser capture vs. streaming user) is unchanged; this
slice simplifies how the user *chooses* and *connects*, and how the sheet *looks*.

## Technical Context

**Language/Version**: TypeScript 5.8.3 (strict + 6 flags). Node 24 (bridge). Browser ESM (g2-app).

**Primary Dependencies**: g2-app — Vite 8, `image-q`, `upng-js`, `xxhash-wasm`, OffscreenCanvas + Web
Worker, native WebSocket/fetch (no DOM framework). bridge — Fastify 5, `@fastify/websocket`, `ws`,
`zod`, `pino`, `prom-client`. foundry-module — Foundry ≥13.347 + dnd5e ≥5.3.3, `socketlib`, `tsup`.
shared-protocol — `zod` schemas (single source of truth).

**Storage**: Bridge in-memory `Map`+TTL (Tier-1). g2-app uses the Even Hub kv store (no
localStorage). No database.

**Testing**: Vitest 4 (`test.projects` workspace) + v8 coverage (≥80%). INV-1 ASCII/layout snapshot
matcher (`shared-render`). `tools/pv-doctor.mjs` for live end-to-end diagnostics.

**Target Platform**: Even Realities G2 glasses (576×288, 4-bit greyscale) driven by the paired phone's
Even Hub WebView; bridge runs as a homelab Docker service fronting FoundryVTT (Forge or self-hosted).

**Project Type**: Multi-package monorepo (pnpm) — phone-WebView plugin (g2-app) + Node bridge +
Foundry module + shared protocol/render libs.

**Performance Goals**: Map stream 5 fps committed / 15 fps stretch. Sheet/overlay compositing and the
FPS badge MUST not regress the frame budget; the FPS badge is a cheap z=1 redraw.

**Constraints**: 576×288 4-bit greyscale; max 4 image containers (map uses them) → sheet UI + icons are
canvas-composited, not image containers; ring gestures press/double-press/swipe only; no camera (no QR
pairing); IT + EN, character-perfect layout (INV-1); deterministic core (no AI dependency).

**Scale/Scope**: Single-tenant homelab; one Foundry world; a handful of paired devices. This slice
touches g2-app (settings/connection/panels/status-hud), the player-view protocol mapping, minor bridge
wiring, plus docs — no new services.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate for this feature | Status |
|-----------|----------------------|--------|
| I. Code Quality & Zero Dead Code | Removed mode-dropdown path, redundant connection branches, and duplicated glyph/icon lookups MUST be deleted (not left dead); Biome + tsc strict clean. | PASS (planned) |
| II. Test-First & Coverage | New pure logic (selection→mode map, fps-corner geometry, icon lookup) unit-tested; connection profile + view-selection integration-tested; coverage ≥80% held. | PASS (planned) |
| III. Layout & UX Consistency (INV-1) | Every restyled tab + the FPS badge MUST pass character-/pixel-perfect snapshot tests across states + IT/EN. | PASS (gated) |
| IV. Performance Budgets | Compositor sheet redraw + FPS badge MUST stay within the frame budget; measured, not assumed. | PASS (gated) |
| V. Autonomous Debug & Validation | `pv-doctor` extended to drive/observe view selection (Party vs PC) end-to-end. | PASS (planned) |
| VI. Source-Verified Research (INV-2) | No new SDK/hardware claims; existing canonical constraints (4 image containers, no camera, gesture set) honored. | PASS |
| VII. Documentation Coherence (INV-3) | Pairing/install runbook, ADR-0015, Specs/README/showcase, `EVF_FPS_CORNER` in `.env.example` updated in the same changes. | PASS (planned) |
| VIII. Repository Hygiene | No new secrets/scratch; `.env.local` dev hack removed from the default path; atomic commits. | PASS (planned) |
| IX. Reliable, Useful CI/CD | All gates green; no test weakened; artifacts reproducible. | PASS (gated) |
| X. Disciplined Subagent Orchestration | Used two scoped read-only Explore agents to map UI + (already-known) connection seams; conclusions captured, not file dumps. | PASS |

**No violations** → Complexity Tracking left empty.

## Project Structure

### Documentation (this feature)

```text
specs/001-foundry-g2-hud/
├── plan.md              # This file
├── research.md          # Phase 0 — design decisions D1..D6
├── data-model.md        # Phase 1 — entities + state
├── quickstart.md        # Phase 1 — runnable validation guide
├── contracts/           # Phase 1 — protocol/UI/env contracts
│   ├── player-view-selection.md
│   ├── connection-profile.md
│   └── fps-corner-env.md
└── tasks.md             # Phase 2 — created by /speckit-tasks (NOT here)
```

### Source Code (repository root)

```text
packages/
├── g2-app/                         # phone-WebView plugin (primary surface for this slice)
│   └── src/
│       ├── phone/
│       │   └── settings-panel.ts          # D2: fold mode→roster ("Party"); remove mode dropdown
│       ├── wizard/
│       │   ├── is-dev-no-auth.ts           # D1: collapse connection sources → one profile
│       │   ├── state.ts                     # D1: single { bridgeUrl, token } source of truth
│       │   └── steps/                       # D1: simplify pairing steps
│       ├── internal/
│       │   └── boot-engine-core.ts          # D1/D2: connection wiring; selection→client_player_view
│       ├── panels/
│       │   ├── icon-dictionary.ts           # D3: NEW — shared icon set (glyph + canvas)
│       │   ├── canvas-character-sheet-panel.ts   # D3: D&D-sheet chrome + icons
│       │   ├── character-sheet-tab-renderers.ts  # D3: paint*Tab D&D restyle
│       │   ├── inventory-panel.ts / spellbook-panel.ts  # D3: tab restyle + icons
│       └── status-hud/
│           └── canvas-status-hud-layer.ts   # D4: small FPS badge + EVF_FPS_CORNER
├── shared-protocol/
│   └── src/payloads/player-view.ts          # D2: selection semantics (Party→streaming, PC→actor)
├── bridge/
│   └── src/ws/client-player-view-handler.ts # D2: accepts the unified selection (mostly unchanged)
└── foundry-module/                          # (no change expected this slice)

deploy/.env.example                          # D4/D6: EVF_FPS_CORNER (+ connection notes)
docs/release/evenhub.md                      # D6: direct-link install runbook
docs/architecture/0015-player-view-map-capture.md  # D6: view-selection + connection model
tools/pv-doctor.mjs                          # V: drive/observe Party vs PC selection
```

**Structure Decision**: Existing pnpm monorepo; this slice is centered in `packages/g2-app` (settings,
connection, panels, status-hud) with a thin `shared-protocol` selection-semantics touch and minimal
bridge wiring. No new packages or services.

## Complexity Tracking

> No Constitution violations — section intentionally empty.
