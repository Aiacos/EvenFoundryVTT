# Firmware & SDK Compatibility

Version matrix for all hardware and platform dependencies in EvenFoundryVTT. This file is the
**canonical reference** for which SDK / firmware versions are verified and what the forward-compat
policy is for each.

**INV-2 note:** every version pin listed here was verified against a canonical upstream source. Per
`CLAUDE.md §Project Invariants > INV-2`, re-verify before each version bump using ≥4 parallel
WebFetch requests against canonical domains. Aggregator / blog / AI-summary sources are not
authoritative.

---

## Verified versions

| Component | Pinned version | Verified date | Source |
|-----------|---------------|---------------|--------|
| `@evenrealities/even_hub_sdk` | **0.0.10** | 2026-05-14 | `STATE.md` Quick Tasks `oq-inv2-4-hub-polyfill-via-evenrealities-sdk` — full 1 292-line `index.d.ts` read; MIT license, author: Whiskee Chen @ Even Realities. |
| G2 firmware identifier | `"g2"` (model string) | 2026-05-14 | `STATE.md` Quick Tasks `adr-0005-oq-inv2-1-resolution-via-simulator` — `getGlassesInfo()` probe on simulator returned `{ model: "g2" }`. |
| FoundryVTT host | ≥ v13.347 (verified v14) | 2026-05-10 | Live `system.json` at `github.com/foundryvtt/dnd5e` tag `release-5.3.3`: `compatibility.minimum: "13.347"`, `compatibility.verified: "14"`. |
| dnd5e game system | ≥ 5.3.3 (latest: 5.3.3) | 2026-05-07 | GitHub Releases: `github.com/foundryvtt/dnd5e/releases` — `5.3.3` released 2026-05-07. |
| socketlib | latest (Foundry module) | 2026-05-10 | `github.com/farling42/foundryvtt-socketlib` — **not on npm** (`npm view socketlib` → E404; confirmed). Installed as a Foundry module. |
| midi-qol | latest (optional) | 2026-05-10 | `gitlab.com/tposney/midi-qol` — optional module; enables full attack → damage → save → effect flow. |

---

## Hardware limits (verbatim per SDK `index.d.ts`)

From `@evenrealities/even_hub_sdk@0.0.10` `index.d.ts` (1 292 lines, verified 2026-05-14):

| Parameter | Limit | Notes |
|-----------|-------|-------|
| Image width | 20–288 px | Per `createImageContainer` constraints |
| Image height | 20–144 px | Per `createImageContainer` constraints |
| `containerTotalNum` | 1–12 | Total containers per page |
| `textObject` | max 8 per page | Text/list container budget |
| `imageObject` | max 4 per page | Image container budget |
| Capture container | max 1 | Must set `isEventCapture: 1` to receive R1 events |
| Audio | PCM 16 kHz s16le mono | Via `bridge.audioControl(true)` + `event.audioEvent.audioPcm` |
| No speaker | — | G2 has **no audio output** (verbatim SDK docs). All feedback is visual. |
| No camera | — | G2 has **no camera** (verbatim SDK docs). |

These constraints are canonical for the EVF raster pipeline (Specs.md §3.1 + §7.2) and the
4-image / 8-text container budget (Specs.md §7.1a).

> **INV-1 binding:** any ASCII mockup or runtime layout that violates these hardware limits fails
> the INV-1 gate. The `matchAsciiFixture` snapshot tests enforce this at build time.

---

## Forward-compat policy

`@evenrealities/even_hub_sdk` is **pre-1.0** (semver-exempt by convention). This means:

- **Any minor bump** (`0.0.10 → 0.0.11`) is treated as potentially breaking.
- Before upgrading, run a full **INV-2 re-verification** per `CLAUDE.md §Pre-bump checklist`:
  - ≥4 parallel WebFetch against canonical upstream sources (Even Hub docs, Even Realities product pages).
  - Check `index.d.ts` diff for changes to `containerTotalNum`, image dimension limits, `EvenAppBridge` API surface, audio API.
  - Log all drift findings as `Re-verified ✓` or `Drift: <description>` in Specs.md changelog.
- Run a **Phase-0-style probe sweep** (per `STATE.md Quick Tasks 2026-05-14 oq-inv2-4`):
  - `getGlassesInfo()` — model string, firmware version.
  - `createImageContainer` with a boundary-condition payload (width=288, height=144).
  - `bridge.audioControl(true)` → confirm PCM chunk size and format.
  - R1 event delivery — tap + scroll + long-press sequence with timing measurement.
- Update `docs/firmware-compatibility.md` (this file) with the new verified version + date + source.
- The version bump lands in an **INV-3 atomic commit** (Specs.md + README.md + showcase + this file).

> **No auto-upgrades.** Even Hub SDK is not pinned to a semver range (`^` or `~`). The
> `packages/g2-app/package.json` uses an **exact version pin** (`"0.0.10"`) to prevent accidental
> upgrades during `pnpm install --frozen-lockfile` CI runs.

---

## See also

- `Specs.md §3.1` — G2 display + hardware constraints canonical.
- `Specs.md §3.5` — audio capture API (PCM 16 kHz s16le mono, BLE LC3 decoded by Hub SDK).
- `Specs.md §3.6` — EvenAI non-API constraint (proprietary, no transcript subscription).
- `packages/g2-app/package.json` line 14 — `"@evenrealities/even_hub_sdk": "0.0.10"` (exact pin).
- `STATE.md Quick Tasks 2026-05-14` — `oq-inv2-4-hub-polyfill-via-evenrealities-sdk` full SDK probe notes.
- `CLAUDE.md §Pre-bump checklist` — full re-verification protocol.
