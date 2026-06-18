# Tasks: Foundry-to-G2 HUD — connection, view selection, D&D sheet UI, composited FPS

**Feature**: 001-foundry-g2-hud · **Plan**: [plan.md](./plan.md) · **Spec**: [spec.md](./spec.md)

This is an enhancement slice. The four user stories below are the plan's independently-testable
deliverables (D1–D4); polish covers D5/D6. Tests are included because the project Constitution
(Principle II) mandates test-first + ≥80% coverage. Every change runs `pnpm lint:ci` + `pnpm typecheck`
+ affected tests before commit.

**Story → spec mapping**: US1 Connection ↔ FR-011/FR-015 · US2 View selection ↔ spec US5 (FR-007/008) ·
US3 Sheet UI ↔ spec US1 (FR-001/013) · US4 FPS badge ↔ spec US7 (FR-012).

---

## Phase 1: Setup

- [X] T001 Confirm the feature branch + green baseline: on `feat/hud-raster-rendering`, run `pnpm install --frozen-lockfile && pnpm lint:ci && pnpm typecheck && pnpm test` and record the baseline pass counts in `specs/001-foundry-g2-hud/quickstart.md` notes.
- [X] T002 [P] Add `EVF_FPS_CORNER` (domain: top-left|top-right|bottom-left|bottom-right, default bottom-right) to `deploy/.env.example` with a one-line description.
- [X] T003 [P] Add `VITE_EVF_FPS_CORNER` documentation to the g2-app config section in `docs/release/evenhub.md` (build-time corner selection).

---

## Phase 2: Foundational (blocking prerequisites)

**Purpose**: shared pure logic + scaffolds the user stories depend on. No user story is complete until
its own phase, but these unblock several.

- [X] T004 [P] Create the pure selection→request mapping `toPlayerViewRequest(selection)` in `packages/g2-app/src/phone/player-view-selection.ts` (`"party"` → `{mode:"streaming"}`, `<actorId>` → `{mode:"actor",actorId}`), per contracts/player-view-selection.md.
- [X] T005 [P] Unit test the mapping in `packages/g2-app/src/phone/player-view-selection.test.ts` (party, a PC, empty/invalid → no request).
- [X] T006 [P] Create the shared icon dictionary scaffold in `packages/g2-app/src/panels/icon-dictionary.ts` (`IconId` enum, `iconToUnicode(id)` re-exporting the existing glyphs de-duplicated, and a `drawIcon(ctx,id,bounds,fill)` stub at a fixed cell size).
- [X] T007 [P] Unit test `iconToUnicode` round-trip + completeness in `packages/g2-app/src/panels/icon-dictionary.test.ts` (every IconId resolves; matches the legacy inventory/skill glyphs).
- [X] T008 [P] Create the pure FPS-badge geometry `fpsBadgeRect(corner, size)` in `packages/g2-app/src/status-hud/fps-badge-geometry.ts` (4 corners → on-screen `{x,y,w,h}` against 576×288 + margin) per contracts/fps-corner-env.md.
- [X] T009 [P] Unit test `fpsBadgeRect` in `packages/g2-app/src/status-hud/fps-badge-geometry.test.ts` (all four corners fully on-screen; default resolution when corner invalid/absent).

**Checkpoint**: pure logic for US2/US3/US4 exists and is green in isolation.

---

## Phase 3: US1 — Direct-link connection (Priority: P1)

**Goal**: one canonical connection profile to the bridge origin; remove the 4-source ambiguity and the
`localhost` default from the user path. **Independent test**: a plugin with a saved `{bridgeUrl,token}`
reaches a live HUD with no dev env var; drop/restore auto-recovers within ~30s.

- [X] T010 [US1] Define the single `ConnectionProfile` source-of-truth (kv-backed `{bridgeUrl,token}`) and its resolver in `packages/g2-app/src/wizard/is-dev-no-auth.ts` (saved profile wins; dev overrides explicitly gated; no implicit `localhost`), per contracts/connection-profile.md.
- [X] T011 [US1] Update `packages/g2-app/src/wizard/state.ts` so the wizard state reads/writes the single ConnectionProfile (remove duplicate URL/token sources).
- [X] T012 [US1] Simplify the pairing steps in `packages/g2-app/src/wizard/steps/` to the direct-link flow (install + paste bridgeUrl + token; no QR/dev-server detour in the default path).
- [X] T013 [US1] Update connection wiring in `packages/g2-app/src/internal/boot-engine-core.ts` to consume the ConnectionProfile (one `bridgeUrl`/`token`), keep auto-reconnect, and remove the redundant default/override branches.
- [X] T014 [P] [US1] Remove the `packages/g2-app/.env.local` dev hack from the default path and ensure it is only an explicitly-gated dev escape hatch (documented, gitignored).
- [X] T015 [US1] Unit/integration test the resolver precedence in `packages/g2-app/src/wizard/is-dev-no-auth.test.ts` (saved profile used; no `localhost` default in a user build; dev override only when explicitly enabled).
- [X] T016 [US1] Adjust the existing settings-panel/boot tests that asserted the old multi-source connection to the single-profile contract (keep them green).

**Checkpoint**: US1 independently deliverable — connect via one profile, auto-recover; gates green.

---

## Phase 4: US2 — View selection: Party vs PC (Priority: P1)

**Goal**: one roster selector with a synthetic "Party" entry; remove the mode dropdown. **Independent
test**: selecting Party → streaming source; selecting a consenting PC → that PC's view; a non-consenting
PC → "unavailable".

- [ ] T017 [US2] Inject the synthetic top **"Party"** entry into the roster selector and remove `buildPlayerViewSelect` (the off/streaming/actor dropdown) in `packages/g2-app/src/phone/settings-panel.ts`.
- [ ] T018 [US2] Drive the player-view request from the roster `change` handler via `toPlayerViewRequest` (Party→streaming, PC→actor) in `packages/g2-app/src/phone/settings-panel.ts`; keep the live actor re-pin for PCs.
- [ ] T019 [US2] Update boot-time + change-time emission in `packages/g2-app/src/internal/boot-engine-core.ts` so the unified selection maps to `client_player_view{mode,actorId?}` (default boot selection = Party).
- [ ] T020 [P] [US2] Confirm/extend the selection semantics doc-comments in `packages/shared-protocol/src/payloads/player-view.ts` (Party→streaming, PC→actor); no new wire field.
- [ ] T021 [US2] Update `packages/g2-app/src/phone/settings-panel.test.ts` — remove mode-dropdown tests; assert Party + PC selection produce the correct `client_player_view` requests and re-drive on PC change.
- [ ] T022 [P] [US2] Extend `tools/pv-doctor.mjs` to label/drive "party" vs a PC selection (report which source is active) for live validation (Constitution V).

**Checkpoint**: US2 independently deliverable — single selector chooses Party or a PC; gates green.

---

## Phase 5: US3 — D&D-styled sheet UI + icons (Priority: P2)

**Goal**: restyle the canvas sheet tabs to a D&D-sheet look with the shared icon set; INV-1 alignment
preserved. **Independent test**: each tab renders the new chrome + icons; snapshot tests pass across
content extremes and IT/EN.

- [ ] T023 [US3] Implement `drawIcon` (canvas path) for all `IconId`s in `packages/g2-app/src/panels/icon-dictionary.ts` at the fixed cell size (replace inline glyph lookups behind this module).
- [ ] T024 [US3] Add D&D-sheet chrome (shared frame/header) to `packages/g2-app/src/panels/canvas-character-sheet-panel.ts` (pre-baked chrome bitmap) and route tab paints through it.
- [ ] T025 [P] [US3] Restyle Main + Skills tab paints (icons for abilities/proficiency) in `packages/g2-app/src/panels/character-sheet-tab-renderers.ts`.
- [ ] T026 [P] [US3] Restyle Inventory tab + icons in `packages/g2-app/src/panels/inventory-panel.ts` (use `drawIcon`, drop the local `itemGlyph` map).
- [ ] T027 [P] [US3] Restyle Spellbook tab + icons (spell slots/levels) in `packages/g2-app/src/panels/spellbook-panel.ts`.
- [ ] T028 [P] [US3] Restyle Feats + Bio tab paints in `packages/g2-app/src/panels/character-sheet-tab-renderers.ts`.
- [ ] T029 [US3] Add INV-1 snapshot tests for every restyled tab across states (HP 7/700, long name, condition overflow) and IT/EN in `packages/g2-app/src/panels/__tests__/` (extend the existing sheet snapshot suite).
- [ ] T030 [US3] Capture simulator screenshots of each tab for visual confirmation and attach to the quickstart notes (manual visual gate alongside snapshots).

**Checkpoint**: US3 independently deliverable — sheet tabs look like a D&D sheet with icons; INV-1 green.

---

## Phase 6: US4 — Composited FPS badge with `EVF_FPS_CORNER` (Priority: P3)

**Goal**: split the FPS readout into a small composited badge, default bottom-right, corner via env var.
**Independent test**: badge renders bottom-right by default; rebuilding with each corner places it
correctly; INV-1 snapshot per corner.

- [ ] T031 [US4] Read `VITE_EVF_FPS_CORNER` (default bottom-right, invalid→default) and pass it into the status layer options in `packages/g2-app/src/internal/boot-engine-core.ts`.
- [ ] T032 [US4] Render the small FPS badge (smaller font) at `fpsBadgeRect(corner,size)` in `packages/g2-app/src/status-hud/canvas-status-hud-layer.ts`; separate it from the PF/CA/LV card; keep the `[F] FPS` toggle and 1 Hz refresh.
- [ ] T033 [US4] Ensure no overlap when the badge and status card share a corner (deterministic stack/yield) in `packages/g2-app/src/status-hud/canvas-status-hud-layer.ts`.
- [ ] T034 [US4] Add INV-1 snapshot tests for the FPS badge in all four corners in `packages/g2-app/src/status-hud/__tests__/` (each fully on-screen, smaller font, no card overlap).

**Checkpoint**: US4 independently deliverable — corner-configurable composited FPS badge; gates green.

---

## Phase 7: Polish & Cross-Cutting (D5 cleanup + D6 docs)

- [ ] T035 [P] Remove dead code surfaced by US1/US2 (the removed mode-dropdown path, redundant connection branches) and confirm `pnpm lint:ci` (no dead/unreachable code) + coverage held.
- [ ] T036 [P] De-duplicate any remaining inline glyph/icon lookups to `icon-dictionary` (single source for glyph + canvas paths).
- [ ] T037 Measure compositor frame budget with the new sheet chrome + FPS badge (capture/encode/post + ingress/egress fps via `pv-doctor`/`frame_stats`); record results and confirm no regression vs. baseline (Constitution IV).
- [ ] T038 [P] Update `docs/architecture/0015-player-view-map-capture.md` to the unified view-selection model (Party = streaming; PC = owner-elected; no mode dropdown).
- [ ] T039 [P] Update `docs/release/evenhub.md` to the direct-link install/pairing flow (install + paste bridgeUrl + token; `EVF_FPS_CORNER`).
- [ ] T040 Update `Specs.md` + `README.md` + `docs/showcase/index.html` in the SAME commit for any cross-cutting change (view model, `EVF_FPS_CORNER`, UI restyle) per INV-3, with a changelog entry.
- [ ] T041 Final full-suite run (`pnpm lint:ci && pnpm typecheck && pnpm test:coverage && pnpm changeset:status`) — all gates green; add changesets for touched packages.

---

## Dependencies & Execution Order

- **Phase 1 (Setup)** → **Phase 2 (Foundational)** → user-story phases → **Phase 7 (Polish)**.
- **US1 (Connection)** and **US2 (View selection)** are independent of each other but US2's tests are
  easier to validate live once US1's single profile exists; do US1 then US2 (the user's priority order).
- **US3 (Sheet UI)** depends on Phase 2 `icon-dictionary` (T006/T023) but is independent of US1/US2.
- **US4 (FPS badge)** depends on Phase 2 `fpsBadgeRect` (T008) but is independent of the others.
- **Phase 7** depends on US1+US2 (cleanup of removed paths) and US3+US4 (perf measurement, docs).

## Parallel Opportunities

- Phase 1: T002, T003 in parallel.
- Phase 2: T004–T009 mostly parallel (different files): the two pure-logic + icon scaffolds.
- US1: T014 parallel with the wiring tasks (different file).
- US2: T020, T022 parallel with the settings-panel edits.
- US3: T025–T028 (per-tab restyle) parallel after T023/T024.
- US4: tasks are sequential within the same status-layer file.
- Polish: T035, T036, T038, T039 parallel (different files); T037/T040/T041 are gating/sequential.

## Implementation Strategy

- **MVP scope**: **US1 + US2** (the user's stated primary goal — clean direct-link connection + the
  Party/PC selector). Shipping these alone already delivers the "simplify the connection and choose the
  view" value.
- **Incremental delivery**: US1 → US2 → US3 → US4, each an independently testable, separately
  commitable increment, with Polish (cleanup/docs) folded in per increment where it touches that area
  and finalized in Phase 7.
- **Per-increment gate**: `pnpm lint:ci` + `pnpm typecheck` + affected tests + INV-1 snapshots; docs
  updated in the same commit (INV-3).
