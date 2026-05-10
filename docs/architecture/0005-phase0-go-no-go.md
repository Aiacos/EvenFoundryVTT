# ADR-0005: Phase 0 GO/NO-GO — Branch A/B/C Decision

**Date:** TBD (Phase 0 closure date)
**Deciders:** Single-developer (project owner)
**Supersedes:** none
**Superseded by:** none

## Status

**PROPOSED** — template stub. Will move to ACCEPTED at Phase 0 closure (Plan 04) once Branch verdict + per-test rationale + companion files are populated per CONTEXT.md D-13.

## Context

Phase 0 of EvenFoundryVTT (EVF) MVP roadmap (Specs.md §10) gates all downstream applicative phases on empirical validation of 7 hardware/SDK assumptions. This ADR documents the resulting **Branch A/B/C decision** for the raster vs glyph default per Specs.md §10.0.5, derived from measurements in `docs/perf/phase-0/`.

**Branch semantics (CONTEXT.md D-09 / D-10 / D-11 / D-12):**
- **Branch A** — raster default 5 fps committed; queue ≤2 sustained; BLE p50≥200 AND p95≥150 AND p99≥100 in all 3 RF environments
- **Branch B** — raster opt-in, glyph default; 3-5 fps with low-fps chip; queue=3 occasional; BLE p99≥100 OR p50≥150 in ≥2 envs
- **Branch C** — glyph-only, raster deferred Phase 13 stretch; queue ≥4 OR p99 <100 kbps in any env

## Branch Verdict

**Selected Branch:** TBD (populate at closure)

**Rationale:** TBD (populated at closure — cite `tests/phase-0/_shared/branch-decision.ts` `deriveBranch()` output verbatim)

## Threshold Table (locked UPFRONT per D-12 strict numeric, no discretion)

| Metric | Branch A | Branch B | Branch C trigger | Borderline (±5%) |
|--------|----------|----------|-------------------|------------------|
| BLE p50 (kbps) | ≥200 in all 3 envs | ≥150 in ≥2 envs | — | within 5% → safe-downgrade |
| BLE p95 (kbps) | ≥150 in all 3 envs | — | — | within 5% → safe-downgrade |
| BLE p99 (kbps) | ≥100 in all 3 envs | ≥100 in ≥2 envs | <100 in ANY env | within 5% → safe-downgrade |
| Queue depth | ≤2 sustained | =3 occasional | ≥4 | n/a (integer) |
| fps | ≥5 sustained | 3-5 with low-fps chip | n/a (text refresh on event) | n/a |

## Per-Test Verdict (populate at closure)

| Test | Specs § | Evidence File | Verdict | Rationale |
|------|---------|---------------|---------|-----------|
| R1 timing | §10.0.1 | TBD | TBD | TBD |
| Image format | §10.0.2 | TBD | TBD | TBD |
| BLE clean | §10.0.3 | TBD | TBD | TBD |
| BLE 5GHz-loaded | §10.0.3 | TBD | TBD | TBD |
| BLE 2.4GHz+microwave | §10.0.3 | TBD | TBD | TBD |
| DLE 30-min sustained | §10.0.7 | TBD | TBD | TBD |
| Queue depth | §10.0.8 | TBD | TBD | TBD |
| Palette calibration | §10.0.9 | TBD | TBD | TBD |
| MidiQOL config probe | REQ MIDIQ-01 | TBD | TBD | TBD |

## Consequences

### Branch A (if selected)
- Phase 4a raster pipeline ships as default (image-q + upng-js + xxhash-wasm per ADR-0006)
- 15 fps stretch unlocked if DLE 30-min sustained passes (separate gate per D-11)
- Phase 4b adversarial UI work proceeds standard scope

### Branch B (if selected)
- Phase 4a raster ships as opt-in mode + glyph default
- Adaptive fps Layer 6 active by default + warning chip in Status HUD footer
- "Low-fps" chip rendered when queue=3 sustained

### Branch C (if selected)
- Raster pipeline deferred to Phase 13 stretch (STRETCH-07 expanded scope)
- Phase 4a scope reduced to glyph-only mode + boot splash + status HUD
- ADR-0006 declares raster lib stack moot for MVP
- Phase 4b scope unchanged (adversarial UI work independent of raster)

## Companion Files (per D-13 composite structure)

- `docs/perf/phase-0/*.json` — raw machine-readable measurements (Zod-validated, schema_version 1)
- `docs/perf/phase-0/*.csv` — sample arrays for ad-hoc analysis (BLE + DLE only)
- `docs/perf/phase-0/calibration/*.png` — palette calibration ramp photos
- `docs/perf/phase-0/calibration/methodology.md` — camera + ambient light + L\* derivation protocol

## Cross-References (D-16 — Phase entry gate citations)

Downstream phases that consume this decision:
- **Phase 1 — Foundation:** Unblocked when this ADR documents Branch (any of A/B/C) + 4 critical tests pass per D-04 (BLE multi-env, queue depth, format, R1 timing). Phase 1 monorepo + ADRs 0001-0004 + 0008 may proceed in parallel per D-02.
- **Phase 4a — G2 Engine + Raster + Status HUD:** Entry gate cites Branch verdict + raster scheduler config from `docs/perf/phase-0/10-0-8-queue-depth-*.json`
- **Phase 4b — Overlay Slot + Map Mode Toggle:** Cites palette calibration from `10-0-9-palette-calibration-*.json` for `[M] Map ctrl` glyph mode
- **Phase 6 — R1 Integration + INV-5:** INV-5 Gesture Determinism timing constants derived from `10-0-1-r1-timing-*.json` `recommended_windows_ms`
- **Phase 7 — Foundry Module Write Path:** MidiQOL `relationships.requires` declaration derived from `midiqol-config-probe-*.json` (declaration lands in Phase 2 module.json per CONTEXT.md)

## Sources

- Specs.md §10.0 (Phase 0 master protocol) verbatim
- Specs.md §10.0.5 (Branch A/B/C decision tree)
- Specs.md §11.5.7 (raster pipeline lib stack)
- Specs.md §11.5.8.2 (Branch C glyph-only fallback)
- CONTEXT.md D-09 (BLE thresholds), D-10 (queue thresholds), D-11 (fps thresholds), D-12 (borderline auto-downgrade)
- `tests/phase-0/_shared/branch-decision.ts` `deriveBranch()` (canonical algorithm)
