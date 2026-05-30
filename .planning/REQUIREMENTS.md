# Requirements: EvenFoundryVTT — Milestone v0.9.14 "Release & Distribution + deferred hardening"

**Defined:** 2026-05-30
**Core Value:** Il giocatore di ruolo non distoglie mai lo sguardo dalla scena fisica — e ora il sistema è effettivamente **installabile** da un utente reale.

## v1 Requirements

Requirements for milestone v0.9.14. Each maps to exactly one roadmap phase (19–22).

### Release & Distribution (REL) — *Phase 19, sequenced first, independent of all other phases*

- [ ] **REL-01**: On a GitFlow release (version tag on `main`), CI builds `foundry-module` and attaches `module.json` + `evenfoundryvtt.zip` to the GitHub Release such that a user can install it in Foundry via the "Install Module" manifest URL.
- [ ] **REL-02**: On a version tag, CI builds the `bridge` as a multi-stage `node:24-alpine` Docker image and pushes it to GHCR (`ghcr.io/<owner>/evf-bridge:<version>` + `:latest`), pullable by an end user.
- [ ] **REL-03**: On a version tag, CI builds the `g2-app` Vite production bundle and attaches a `g2-app-dist.zip` to the GitHub Release for a static plugin host.
- [ ] **REL-04**: The GitHub Release page is auto-populated with release notes aggregated from the Changesets changelog across the released packages (no manual copy-paste).
- [ ] **REL-05**: `README.md` has an "Installation" section documenting how an end user installs each of the 3 components (foundry-module via manifest URL, bridge via `docker run`/compose from GHCR, g2-app static host), kept coherent with `Specs.md` + showcase per INV-3.

### Background-state & Lifecycle (LIFE) — *Phase 20*

- [ ] **LIFE-01**: An INV-2 verification round confirms the actual lifecycle-event surface of `@evenrealities/even_hub_sdk@0.0.10` (`onEvenHubEvent` FOREGROUND_ENTER/EXIT/ABNORMAL_EXIT/SYSTEM_EXIT via `OsEventTypeList`), documented with canonical-source citations — `setBackgroundState`/`onBackgroundRestore` confirmed absent on 0.0.10.
- [ ] **LIFE-02**: Engine session state (active panel, last-confirmed seq, negotiated caps, effective locale, map mode) survives a phone background→foreground cycle without resetting to boot.
- [ ] **LIFE-03**: The user can exit the plugin from the glasses/ring via `bridge.shutDownPageContainer(...)` wired to a reserved gesture.
- [ ] **LIFE-04**: On background/abnormal-exit lifecycle events the app stops hardware capture (`audioControl(false)`) and tears down cleanly (no mic left hot).

### Render Correctness (REND) — *Phase 21*

- [ ] **REND-01**: `LayerManager._flushPage` assembles the real container schema from mounted layers so `overlay-block` and `toast-block` are declared and actually render on hardware (not empty arrays); exactly one emitted container carries `isEventCapture:1`.
- [ ] **REND-02**: INV-1 layout integrity is validated against LVGL pixel metrics (not just character counts) for alignment-bearing columns, reconciling the proportional-font reality with the char-grid model.
- [ ] **REND-03**: HUD card and glyph map fit the 576×288 / 27px-line canvas (≤10 rows for a full-screen container); vertical overflow of the 21-row HUD/glyph layouts is resolved or re-budgeted.

### Localization & Tier-4 Polish (LOC) — *Phase 22*

- [ ] **LOC-01**: DE locale support + minor Tier-4 items carried from the 2026-05-29 deep review are addressed (or explicitly re-deferred with reasoning if hardware/spec-blocked).

## v2 Requirements

Deferred to future milestones. Tracked but not in current roadmap.

### Write Path Extension
- **SKILL-WR-01**: Skill-check write path (`evf.rollSkill` socketlib handler + `skill_check` dispatch un-stub + Skills-tab gesture wiring + toast feedback).
- **SAVE-WR-01**: Saving-throw write path (`evf.rollAbilitySave` handler), mirror of Phase 8 manual-action UX.
- **SPELL-DC-01**: Spells tab DC data-binding (primed by Phase 16 `abilities.<k>.dc`).

### Hardware UAT
- **UAT-01**: Execute the 35 software-complete `human_needed` SCs against real G2 + R1 + Even Hub; close ADR-0005 PROVISIONAL → ACCEPTED.

## Out of Scope

Explicitly excluded for v0.9.14.

| Feature | Reason |
|---------|--------|
| npm publish of `@evf/shared-*` | Internal deps only; Changesets stays pre-1.0 no-publish (user-confirmed 2026-05-30). Not needed to run the system. |
| `foundry-mcp` (V2) release artifact | V2 optional surface; not part of the core installable MVP. Add when V2 ships. |
| `.ehpk` Even Hub packaging for g2-app | Static dist zip chosen for v0.9.14; `.ehpk` can be added later if Even Hub store distribution is pursued. |
| Cloud / multi-tenant hosting of release artifacts | Single-tenant homelab MVP; cloud is STRETCH-08. |
| Hardware UAT execution | Requires physical G2 + R1 + Even Hub access (ADR-0005 carry pattern). |
| `setBackgroundState`/`onBackgroundRestore` SDK calls | Confirmed absent on SDK 0.0.10 — LIFE phase uses the `onEvenHubEvent` lifecycle pattern instead. |

## Traceability

Roadmap created 2026-05-30. All 13 v1 requirements mapped to Phases 19–22.

| Requirement | Phase | Status |
|-------------|-------|--------|
| REL-01 | Phase 19 | Pending |
| REL-02 | Phase 19 | Pending |
| REL-03 | Phase 19 | Pending |
| REL-04 | Phase 19 | Pending |
| REL-05 | Phase 19 | Pending |
| LIFE-01 | Phase 20 | Pending |
| LIFE-02 | Phase 20 | Pending |
| LIFE-03 | Phase 20 | Pending |
| LIFE-04 | Phase 20 | Pending |
| REND-01 | Phase 21 | Pending |
| REND-02 | Phase 21 | Pending |
| REND-03 | Phase 21 | Pending |
| LOC-01 | Phase 22 | Pending |

**Coverage:**
- v1 requirements: 13 total
- Mapped to phases: 13
- Unmapped: 0 ✓

---
*Requirements defined: 2026-05-30*
*Last updated: 2026-05-30 — roadmap Phases 19–22 created; all 13 v1 REQ-IDs mapped*
