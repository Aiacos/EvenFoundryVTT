# Implementation Plan: Direct Foundry → G2 Streaming (port onto `develop`, v0.12.0)

**Branch**: `feature/direct-streaming-port` | **Date**: 2026-09-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-direct-streaming/spec.md`

## Summary

`feature/direct-streaming-v2` (22 commits from merge-base `25cd90f`) is merged onto
`origin/develop` (627 bridge-era commits, up to `d97b12e`), keeping the remote history.
Our ADRs are renumbered 0012/0013/0014 → **0016/0017/0018** first, because the remote line
already used 0012–0015. Bridge, Docker and `foundry-mcp` are deleted; the remote's real-Foundry
and real-G2 fixes are carried over; docs move to **v0.12.0** (the remote Specs line ended at
v0.11.0, so our former v0.10.0 is renumbered).

## Technical Context

**Language/Version**: TypeScript 5.8 strict, Node 24 (tooling only — no runtime server)

**Primary Dependencies**: `@evenrealities/even_hub_sdk` 0.0.15, `@evenrealities/pretext` 0.1.4, `socket.io-client` 4.8, `upng-js` 2.1.0, Zod 4, `qrcode`; Foundry v13.347+/v14 + dnd5e 5.3.x, optional MidiQOL

**Storage**: Foundry documents (world settings, user flags `flags.evenfoundryvtt.*`), phone `localStorage`

**Testing**: Vitest 4 (coverage ≥ 80%), INV-1 pixel fixtures (`packages/shared-render/src/fixtures/sheet.*.txt`), Even Hub simulator (`sim:check`), `validation-harness` hardware GO/NO-GO

**Target Platform**: Even Realities App WebView (iOS/Android) + Foundry browser clients

**Project Type**: pnpm monorepo — `foundry-module`, `g2-app`, `shared-protocol`, `shared-render`, `validation-harness`

**Performance Goals**: map ≤ 1 fps on hash change; image updates ≥ 100 ms apart; context text updates instant (`textContainerUpgrade`)

**Constraints**: ≤ 4 image (≤ 288×144) + ≤ 8 text containers, one capture container with `content ' '`; images on the 2×2 288×144 grid from (0,0); BLE ~10–30 KB/s

## Constitution Check

| Principle | Gate for this feature | Status |
|-----------|----------------------|--------|
| I. Code Quality & Zero Dead Code | Bridge/MCP/deploy, bearer and capture code deleted, not stubbed; no stale bridge wording in kept comments. | PASS (in progress) |
| II. Test-First & Coverage | Remote regression tests for kept fixes ported; new hardware regression tests (ids, capture `' '`, no text under image, grid anchors, sync-replay subscribe, bundle without `node:fs`). | PASS (planned) |
| III. Layout & UX Consistency (INV-1) | Pixel fixtures unchanged by the tile split; S1–S12 × IT/EN × min/max. | PASS (gated) |
| IV. Performance Budgets | Map ≤ 1 fps + hash skip; paced image sends. | PASS |
| V. Autonomous Debug & Validation | Debug channel + `?demo=` + `sim:check`; rejected-rebuild probe logs and falls back. | PASS (planned) |
| VI. Source-Verified Research (INV-2) | Geometry fact from `d97b12e` (real host); SDK 0.0.15 types; hub docs re-verified 2026-09-23. | PASS |
| VII. Documentation Coherence (INV-3) | Specs + README + showcase + wiki + ADR status notes in one commit. | PASS (planned) |
| VIII. Repository Hygiene | `assets/__pycache__` removed; bridge-only changesets deleted. | PASS (planned) |
| IX. Reliable, Useful CI/CD | Our gates kept (ADR-0011, socketlib confinement, module assets, wiki links); remote release fixes ported. | PASS (planned) |
| X. Subagent Orchestration | Parallel scoped agents per area (code ports, docs). | PASS |
| XI. Chapter Icons | Headings in README/docs/wiki/showcase use the canonical map. | PASS (planned) |

## Merge decisions

| Area | Decision |
|------|----------|
| `packages/bridge`, `packages/foundry-mcp`, `deploy/`, `tools/pv-doctor.mjs` | deleted (ADR-0016) |
| `packages/g2-app` | ours (from-scratch rewrite), version base 0.2.5 from remote |
| `foundry-module` readers / write path | ours as base + remote fixes (below) |
| `shared-protocol` | ours + feats/biography, qty ≥ 0, combatant `ac`, `skill-check` |
| `shared-render` | ours (`src/pixel`) + remote `./ascii-grid` subpath; test matchers to a `./testing` subpath |
| Remote ADR-0012 | kept canonical (gesture model) |
| Remote ADR-0013/0014/0015, 0011 Amd 2 | superseded by 0018 / 0017 / 0016 / 0017 (status notes, bodies untouched) |
| `.planning/` | stays deleted (Spec Kit) |

## Fixes kept from the bridge-era line

`Activity#use(usage, dialog, message)` with `configure:false` in the dialog argument (`184f172`,
removes a 10 s hang on every cast/attack/use) · null `hp.temp` → 0 (`448a56c`) · stable fallback
item id (`079e6d6`) · dnd5e 5.1 spell `method`/`prepared` (`0ce4322`, corrected: `prepared` is a
number 0/1/2) · inventory quantity 0 (`b6d7d14`) · damage tuple label (`5486ff8`) · audit-log
write bounded to 2.5 s (`fbb9f83`) · `skill-check` handler · combatant `ac` · feats/biography
readers · esmodule cache-bust filename (`7f37b5f`) · graceful release-notes step (`729521d`) ·
`.ehpk` attached to releases · `release.yml` `actions: write`.

## Real-G2 facts the code must respect

Non-grid image offsets are rejected by the real host (`d97b12e`) → sheet page = top band
576×144 rendered once and split at x = 288 into tiles (0,0)/(288,0), sheet tile (0,144),
context text (288,144) · container ids: images first, then text · images render over text ·
capture container `content ' '`, exactly one · click `eventType` omitted → 0 · ABNORMAL_EXIT
handled · no `node:fs` in the browser bundle · `Error` logged as `String(err)`.

## Versions

Specs/README/showcase **v0.12.0**. Packages (changesets, minor = breaking pre-1.0):
foundry-module 0.1.55 → **0.2.0** (release tag `v0.2.0`), g2-app 0.2.5 → 0.3.0,
shared-protocol 0.2.0 → 0.3.0, shared-render 0.1.1 → 0.2.0, validation-harness 0.1.0 → 0.2.0.
PR #39 (bridge-era Version Packages) is closed without merging.

## Project Structure

```text
packages/
├── foundry-module/   # module + projector + write path; serves g2/ (built g2-app)
├── g2-app/           # glasses app: direct session, HUD zones, pixel zones, phone page
├── shared-protocol/  # Zod schemas, sealed envelope, ECDH sealing (src/direct/)
├── shared-render/    # 4-bit pixel renderer, bitmap fonts, INV-1 fixtures
└── validation-harness/  # hardware GO/NO-GO (validate:direct-sideload)
```

## Complexity Tracking

None — the port removes a service and two packages.
