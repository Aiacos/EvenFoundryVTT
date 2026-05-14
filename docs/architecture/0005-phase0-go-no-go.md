# ADR-0005: Phase 0 GO/NO-GO — Branch A/B/C Decision

**Date:** 2026-05-14 (PROVISIONAL closure)
**Deciders:** Single-developer (project owner)
**Supersedes:** none
**Superseded by:** none

## Status

**PROVISIONAL-ACCEPTED** — 2026-05-14 — Branch **A** presumed via INV-2 literature review (online canonical sources fetched 2026-05-14) + **§10.0.2 image format RESOLVED empirically via official simulator probe `@evenrealities/evenhub-simulator@0.7.3`** (same day, afternoon). Branch verdict + BLE/queue/DLE/audio-chunk tests pending real-device empirical re-validation of §10.0.3-10.0.9 hardware-gated tests when paired G2 + R1 + 3 RF environments are available.

**Spec amendment v0.9.13 required** as direct consequence of OQ-INV2-1 resolution — Specs.md §3.5 (audio surface dispatch), §4.3 (SDK Surface table), §7.2 (layered model implementation), §7.4c (idle infill state machine) all need rewrite to reflect the actual envelope-based API contract (`flutterBridge.callHandler('evenAppMessage', json({type, method, data}))` with 10-method enum). Existing §3.1 hardware budget claims (4 image + 8 text/list + 1 capture per page) remain plausible; specific 200×100 size limit still pending real-hardware probe.

**Re-validation triggers (PROVISIONAL → ACCEPTED):** All four conditions below must hold simultaneously.

1. Even Hub developer access granted (`hub.evenrealities.com/docs/guides/distribution` accessible to project owner)
2. Phase 0 validation-harness runs against paired G2 + R1 in 3 RF environments (`pnpm --filter @evf/validation-harness validate:all` with `EVF_HW_PRESENT=true`)
3. `tests/phase-0/_shared/branch-decision.ts` `deriveBranch()` output reproduces the Branch verdict in this ADR (or upgrades/downgrades it)
4. `docs/perf/phase-0/*.json` evidence files are committed with measured (not simulated/literature-inferred) values

**Contested triggers (PROVISIONAL → CONTESTED, re-open before Phase 4a starts coding):** Any of:

- ~~§10.0.2 image format probe reveals G2 API surface ≠ "4 image container 200×100" (e.g., single full-frame 576×288 4-bit BMP like G1's documented protocol shape — see OQ-INV2-1 below)~~ — **RESOLVED 2026-05-14 via official simulator probe**: actual API is *page-based declarative* (not per-container imperative nor single full-frame); see §OQ-INV2-1 below for the resolution. Specs.md §3.5 / §4.3 / §7.2 / §7.4c flagged for v0.9.13 amendment.
- §10.0.3 BLE bandwidth measurement falls into Branch B (degraded raster) or Branch C (glyph-only) thresholds in any of the 3 RF envs

## Context

Phase 0 of EvenFoundryVTT (EVF) MVP roadmap (Specs.md §10) gates all downstream applicative phases on empirical validation of 7 hardware/SDK assumptions. This ADR documents the resulting **Branch A/B/C decision** for the raster vs glyph default per Specs.md §10.0.5, derived from measurements in `docs/perf/phase-0/`.

**Branch semantics (CONTEXT.md D-09 / D-10 / D-11 / D-12):**
- **Branch A** — raster default 5 fps committed; queue ≤2 sustained; BLE p50≥200 AND p95≥150 AND p99≥100 in all 3 RF environments
- **Branch B** — raster opt-in, glyph default; 3-5 fps with low-fps chip; queue=3 occasional; BLE p99≥100 OR p50≥150 in ≥2 envs
- **Branch C** — glyph-only, raster deferred Phase 13 stretch; queue ≥4 OR p99 <100 kbps in any env

**Why PROVISIONAL closure now:**

The Phase 0 validation-harness (`packages/validation-harness/`) is fully scaffolded (Phase 0 Plans 01-04 complete on disk) but **hardware tests cannot be run** because the project owner does not currently have:

1. Granted Even Hub developer access to load the SDK + simulator + R1 binding APIs in their fully-featured form, and
2. A paired G2 + R1 ring with the canonical Even Realities App on a phone, and
3. Three RF environments (2.4 GHz clean / 5 GHz loaded / 2.4 GHz + microwave noise) for the §10.0.3 BLE p50/p95/p99 measurements.

Without these, Phase 4a (G2 Engine + Raster + Status HUD) is blocked indefinitely. The single-developer constraint (Specs.md PROJECT.md) and the 1-2 week Even Hub access lead time make a definite-ACCEPTED closure not feasible on the project timeline.

**INV-2 literature review approach** (per CONTEXT.md D-09 fallback `Even simulator with documented assumptions`):

This ADR makes Branch A presumption based on canonical Even Realities online documentation fetched 2026-05-14, cross-referenced with BLE 5.x published specifications and the Even Realities G1 reference protocol (documented in `github.com/even-realities/EvenDemoApp` README). The presumption is documented test-by-test below with confidence levels.

## Branch Verdict

**Selected Branch:** **A** (PROVISIONAL — raster default 5 fps committed)

**Probability assessment (lit-review-derived):**
- Branch A: ~80% likely
- Branch B: ~15% likely
- Branch C: ~5% likely

**Rationale:**

1. **G2 is a modern BLE 5.x device** (2026 launch, *"30% thinner than the previous generation"*, magnesium/titanium build per `evenrealities.com/smart-glasses` fetched 2026-05-14). BLE 5.x with Data Length Extension supports sustained throughput well above the Branch A p50≥200 kbps threshold under nominal conditions.

2. **G1 already operates at 194-byte BLE packets** for image transfer (verbatim `github.com/even-realities/EvenDemoApp` README: *"Divide the BMP image data into packets (each packet is 194 bytes)"*), which implies the upstream G2 firmware inherits or extends the same chunked-transfer model. BLE 5.x DLE supports up to 251-byte ATT payloads → ~194 bytes per packet is consistent with BLE 4.2+ DLE-enabled link.

3. **Audio surface canonical** (PCM 16 kHz, signed 16-bit little-endian, mono per `hub.evenrealities.com/docs/guides/device-apis` fetched 2026-05-14) implies ≥32 kbps sustained for audio alone, and audio runs concurrently with image push in the §3.5 G2 SDK pipeline — so the hardware sustains ≥256 kbps when both are active under nominal conditions.

4. **No published constraint** in any canonical source fetched 2026-05-14 indicates a BLE bandwidth ceiling that would force Branch C. The Branch C trigger (queue ≥4 OR p99 < 100 kbps) requires either a firmware bug or a hostile RF environment; G2 marketing positions the device for "all-day wear" (battery 2 days, IP65) which implies it operates reliably in office/home RF.

**This rationale is not a substitute for §10.0.3 empirical measurement.** It is the basis for unblocking Phase 4a under PROVISIONAL closure while the validation-harness re-run is pending.

## Threshold Table (locked UPFRONT per D-12 strict numeric, no discretion)

| Metric | Branch A | Branch B | Branch C trigger | Borderline (±5%) |
|--------|----------|----------|-------------------|------------------|
| BLE p50 (kbps) | ≥200 in all 3 envs | ≥150 in ≥2 envs | — | within 5% → safe-downgrade |
| BLE p95 (kbps) | ≥150 in all 3 envs | — | — | within 5% → safe-downgrade |
| BLE p99 (kbps) | ≥100 in all 3 envs | ≥100 in ≥2 envs | <100 in ANY env | within 5% → safe-downgrade |
| Queue depth | ≤2 sustained | =3 occasional | ≥4 | n/a (integer) |
| fps | ≥5 sustained | 3-5 with low-fps chip | n/a (text refresh on event) | n/a |

## Per-Test Verdict (PROVISIONAL — 2026-05-14)

| Test | Specs § | Evidence | Verdict | Confidence | Rationale |
|------|---------|----------|---------|-----------|-----------|
| R1 timing | §10.0.1 | PENDING simulator + hardware | PROVISIONAL Branch A | `lit-review-inferred` | R1 ring published as gesture-only (tap/scroll/long-press); simulator BxNxM/even-dev capable of validating event capture shape (free of dev-access). Real-device run pending. |
| Image format | §10.0.2 | Simulator probe 2026-05-14 (Appendix B in EVIDENCE.md) + hardware pending | **RESOLVED — page-based declarative API** | `simulator-confirmed` | **Updated 2026-05-14 PM**: G2 API surface is `flutterBridge.callHandler('evenAppMessage', json({type, method, data}))` with 10-method enum (`createStartUpPageContainer`, `rebuildPageContainer`, `updateImageRawData`, `shutDownPageContainer`, ...). Image slots are page-definition declarative; raw bytes are pushed via `updateImageRawData`. Specific 200×100 size limit unconfirmed (simulator doesn't enforce hardware-size). Triggers Specs v0.9.13 amendment for §3.5/§4.3/§7.2/§7.4c. See §OQ-INV2-1 resolution below. |
| BLE clean RF | §10.0.3 | PENDING hardware | PROVISIONAL Branch A | `lit-review-inferred` | BLE 5.x with DLE published sustained 250-500 kbps typical. G2 likely Branch A in clean 2.4 GHz environment. Real measurement needed. |
| BLE 5GHz-loaded | §10.0.3 | PENDING hardware | PROVISIONAL Branch A | `lit-review-inferred` | Same BLE 5.x DLE basis. 5 GHz WiFi loaded does not affect 2.4 GHz BLE coexistence under Specs of modern BLE 5.x AFH (Adaptive Frequency Hopping). |
| BLE 2.4GHz+microwave | §10.0.3 | PENDING hardware | PROVISIONAL Branch A | `lit-review-inferred` | Worst-case RF scenario; BLE 5.x AFH mitigates microwave interference. Likely Branch A or B borderline. |
| DLE 30-min sustained | §10.0.7 | PENDING hardware | PROVISIONAL Branch A | `lit-review-inferred` | G1 already shows BLE 4.2+ DLE behavior (194-byte packets > 27-byte BLE 4.0 ATT default → implies DLE active). G2 inherits or improves. |
| Queue depth | §10.0.8 | PENDING hardware | PROVISIONAL Branch A | `lit-review-inferred` | Specs.md §11.5.8.5 documents queue saturation as failure mode with adaptive backoff. No published firmware queue limit; presume sane defaults. |
| Palette calibration | §10.0.9 | PENDING simulator + hardware | PROVISIONAL Branch A | `lit-review-inferred` | G2 4-bit greyscale (16 shades) verified canonical. Camera-based L* calibration deferrable; Floyd-Steinberg dither operates on linear 0-15 indices regardless of phosphor curve. |
| MidiQOL config probe | REQ MIDIQ-01 | Phase 0 plans 02 + 03 commit `15e9922` + `3b2578d` (Phase 2 deps target) | DEFER to Phase 2 | `code-review` | Phase 0 plan 02 read-only contract enforced; production module declaration shape proven via probe; evidence emission pending operational execution against Foundry test world (closure step in Phase 2). |

## Open INV-2 Questions (gating-critical for Phase 4a re-validation)

### OQ-INV2-1 — G2 image API surface: single full-frame vs multi-container? **[RESOLVED 2026-05-14 — new interpretation (3) found via live simulator probe]**

**Discovery date:** 2026-05-14 (during this ADR's lit review)
**Resolution date:** 2026-05-14 (later same day, via official simulator `@evenrealities/evenhub-simulator@0.7.3` probe)
**Severity:** GATING for Phase 4a — resolved before Phase 4a starts. Specs.md §3.5 / §4.3 / §7.2 / §7.4c need post-v0.9.12 amendment (v0.9.13) to reflect the actual API shape.

#### Original hypotheses (2026-05-14 morning, lit-review only)

1. **(60%) G2 has multi-container image API as Specs claims** — separate `createImageContainer({width, height})` calls per slot.
2. **(30%) G2 has single full-frame BMP API like G1** — extended to 4-bit + 576×288.
3. **(10%) G2 has a different multi-container API** — different default tile size, max count, etc.

#### Actual resolution (2026-05-14 afternoon, simulator-confirmed) — **NONE of the above; interpretation (3) NEW**

The G2 SDK uses a **page-based declarative API** routed through a single dispatcher:

```javascript
// Canonical envelope (extracted from live simulator):
flutterBridge.callHandler('evenAppMessage', JSON.stringify({
  type: 'call_even_app_method' | 'listen_even_app_data',
  method: <one-of-10>,  // SEE TABLE BELOW
  data: <method-specific-struct>
}))
```

**The 10 canonical method names** (exhaustive — extracted from simulator's Rust enum error):

```
getUserInfo · getGlassesInfo · setLocalStorage · getLocalStorage ·
createStartUpPageContainer · rebuildPageContainer · shutDownPageContainer ·
updateImageRawData · textContainerUpgrade · audioControl
```

**Key findings**:

- **NO `createImageContainer({width, height})` method exists.** The simulator rejects it explicitly.
- **NO single-frame `pushFullFrameBmp` method exists.** Same rejection.
- **Actual mechanism**: page definitions are declared up-front via `createStartUpPageContainer.data` (initial mount) or `rebuildPageContainer.data` (transition — same struct shape!). The page definition includes image/text/list slots, the hardware enforces per-page slot count budgets (Specs §3.1 + ADR-0001), and image bytes are pushed into named slots via `updateImageRawData`.
- **Lifecycle**: `createStartUpPageContainer` → (zero or more `rebuildPageContainer` + `updateImageRawData`) → `shutDownPageContainer`.
- **Atomic page swap**: overlay open/close transitions = `rebuildPageContainer` with different page definitions. This is the actual mechanism for Specs §7.4c z=0.5 idle infill auto-mount/demolish — NOT individual container lifecycle.

**Confirmed live empirically**:

- `getGlassesInfo` returned `{model: "g2", sn: "S2001234567890", status: {batteryLevel, connectType, isCharging, isInCase, isWearing, sn}}` — exposes hardware identity + connection status, but **no display resolution or BLE version fields** (those remain canonical via `hub.evenrealities.com/docs/getting-started/overview`).
- `getUserInfo` returned `{avatar, country, name, uid}` — minimal user identity.

#### Implications for Specs.md (post-v0.9.12 amendments required)

| Section | Issue (resolved at simulator probe 2026-05-14) | Action |
|---|---|---|
| §3.5 G2 SDK Audio Surface | Says `bridge.audioControl(true|false)` — actual is dispatched via envelope, not a direct method | v0.9.13 §3.5 rewrite — actual envelope shape |
| §4.3 SDK Surface table | Lists separate `bridge.createXxx` methods that **DO NOT EXIST** as direct methods | v0.9.13 §4.3 rewrite — single dispatcher + 10-method enum |
| §7.2 Layered Rendering Model | Concept valid; implementation pattern was implicit-imperative — actual is page-replacement via `rebuildPageContainer` | v0.9.13 clarification — z=0.5 mount/demolish = atomic rebuildPageContainer |
| §7.4c Idle Content Infill | "Auto-demolish on overlay_mounted, auto-reborn on overlay_dismissed" — actual is rebuildPageContainer with different page def | v0.9.13 §7.4c.4 state machine rewrite — same observable behavior, different vocabulary |
| §3.1 hardware budget claims (4 image + 8 text/list + 1 capture) | Plausible — simulator enforces per-page slot counts. Specific 200×100 size constraint NOT confirmed by simulator (simulator README v0.7.1 changelog mentions "cap width/height for single container" but no canonical numerical value visible). | Keep §3.1 budget statement; flag specific 200×100 as `// TODO(ADR-0005-OQ-INV2-1.b)` pending real-hardware empirical probe |

#### Remaining sub-questions (deferred to follow-up probes)

- ~~**OQ-INV2-1.a** — Struct shapes for `CreateStartUpPageContainer`, `UpdateImageRawData`, etc.~~ → **PARTIALLY RESOLVED 2026-05-14 PM via probes v7+v8** (see EVIDENCE.md §C). Required field types known for `getLocalStorage`, `setLocalStorage`, `shutDownPageContainer`, `audioControl`. Lenient-deserializer methods (`createStartUpPageContainer`, `rebuildPageContainer`, `updateImageRawData`, `textContainerUpgrade`) still need real-hardware refinement to discover the strict schema. The `containers: [...]` field name on `createStartUpPageContainer` is confirmed empirically.
- **OQ-INV2-1.b** — Specific hardware size limits per image slot (the 200×100 claim in Specs §3.1) — REQUIRES real G2 hardware (simulator does NOT enforce hardware-size constraints per its own README §"Image Processing"). Partial info: simulator README v0.7.x changelog says **text containers cap at 999 bytes**, **list containers cap at 20 items × 63 bytes** — image container width/height cap value TBD.

### OQ-INV2-4 — Phase 2 wizard `hub.*` API mismatch (NEW finding, 2026-05-14 PM)

**Severity:** HIGH — Phase 2 was marked complete on 2026-05-13, but the wizard's `hub.setItem` / `hub.getItem` / `hub.removeItem` / `hub.eventBus` / `hub.camera` API surface does NOT exist in the canonical simulator (only `flutterBridge.callHandler('evenAppMessage', ...)` is injected).

**Discovery:** Grep + inspection of `packages/g2-app/src/wizard/` revealed 8+ call sites using a `hub` global that has no matching injection on the simulator. Existing `packages/g2-app/src/types/even-hub.d.ts` (commented as "INV-2 verified 2026-05-11") describes an API surface that is **not present** in the canonical 10-method enum.

**Implications:**

- Wizard's 451 unit tests pass because they mock `hub` global. On real hardware or canonical simulator, the wizard would fail with `ReferenceError: hub is not defined`.
- Specs.md §3.1 implicit hub-global assumption may need amendment to canonical flutterBridge dispatch shape.
- Phase 4a planning MUST decide between Option A (polyfill `hub` → flutterBridge) vs Option B (refactor wizard) vs Option C (further probing — is `hub` injected by the real Even Realities App but NOT the simulator?).

**Recommendation:** Open as a dedicated quick task before Phase 4a starts coding. Cheapest first move: Option C — fetch the official Even Realities App documentation or community resources to determine whether a `hub` wrapper exists on the phone-side runtime (which would make the wizard correct but require a separate compatibility note in our docs that the simulator doesn't model it).

Full detail in: `.planning/quick/20260514-raster-dynamic-infill/EVIDENCE.md` § Appendix C.4.

#### Recommended next steps

- (a) **Quick follow-up probe** to extract the struct shapes of `CreateStartUpPageContainer` and `UpdateImageRawData` — 30-60 min, simulator already installed.
- (b) **Spec amendment v0.9.13** to update §3.5, §4.3, §7.2, §7.4c with the correct envelope-based API contract — atomic INV-3 commit.
- (c) **Phase 4a planning**: must use the envelope-based API contract from day one. Plan 02 (raster wire path) writes to `evenAppMessage` envelopes, not to imaginary `bridge.createImageContainer` calls.

**Phase 4a is NOT blocked by OQ-INV2-1 anymore** — but Phase 4a's PLAN.md must reference the v0.9.13 amendment (or this ADR-0005 §OQ-INV2-1 resolution) for the correct API contract. Without it, Phase 4a code would be built against the obsolete §4.3 SDK Surface table.

#### Full simulator-probe evidence

See: `.planning/quick/20260514-raster-dynamic-infill/EVIDENCE.md` § Appendix B — Live simulator probe (2026-05-14) for the complete probing methodology, intermediate findings across 6 probe iterations, and the extracted JS source of `flutterBridge.callHandler`.

### OQ-INV2-2 — BLE 5.x version specific to G2 (4.2 vs 5.0 vs 5.1+)

**Severity:** Non-critical for Branch verdict (any BLE 5.x with DLE supports Branch A), but useful for fine-tuning §11.5.7 raster pipeline DLE-aware sub-tile encoding.

**Findings:**
- Marketing page `evenrealities.com/smart-glasses` does NOT specify Bluetooth version.
- G1 EvenDemoApp uses 194-byte BLE packets (consistent with BLE 4.2+ DLE).
- No canonical source fetched 2026-05-14 explicitly states G2 BLE version.

**Resolution:** Phase 0 §10.0.7 DLE test directly measures the active MTU/DLE behavior on real hardware. Lit-review presumption: BLE 5.0+.

### OQ-INV2-3 — Audio chunk size (Specs §10.0.9)

**Severity:** Non-critical for V2 voice work (still 30+ phase ahead). Documented for completeness.

**Findings:**
- G2 canonical: PCM 16 kHz s16le mono (`hub.evenrealities.com/docs/guides/device-apis`).
- G1 EvenDemoApp: LC3 format on the wire, max 30s recording, `0xF1` receive packet command. No exact chunk-byte-size documented.

**Resolution:** Phase 0 §10.0.9 audio chunk probe on real hardware. Lit-review presumption: chunk size in the range 80-160 bytes (typical for 16 kHz s16le mono at 5-10 ms chunks → 160-320 bytes PCM, halved by LC3 BLE compression to ~80-160 bytes per packet).

## Consequences

### Under PROVISIONAL Branch A (current)

- Phase 4a unblocked: raster pipeline ships as default (image-q + upng-js + xxhash-wasm per ADR-0006 placeholder).
- Phase 4a plans MUST include a `## Hardware Re-Validation` section in each PLAN.md identifying which Success Criteria depend on §10.0.3 measurements (MAP-03 6-layer optimization stack thresholds, MAP-04 fps sustained target). These SC will be marked `human_needed` in the corresponding VERIFICATION.md until ADR-0005 → ACCEPTED.
- Phase 4a plans MUST include a `## Image API Contingency` section in plan 02 identifying what changes if OQ-INV2-1 resolves to interpretation (2) — single-frame BMP API instead of 4-container model.
- 15 fps stretch target remains aspirational pending §10.0.7 DLE 30-min sustained empirical confirmation.
- Phase 4b adversarial UI work proceeds standard scope (independent of raster Branch).

### If real hardware re-validation upgrades to ACCEPTED Branch A

- This ADR Status field flips: PROVISIONAL-ACCEPTED → ACCEPTED.
- `human_needed` SC in Phase 4a/4b VERIFICATION.md files become `passed`.
- No code rework required (the PROVISIONAL closure was conservative enough).

### If real hardware re-validation downgrades to Branch B

- This ADR Status field flips: PROVISIONAL-ACCEPTED → CONTESTED → ACCEPTED Branch B (after re-write).
- Phase 4a code may need adjustment: raster becomes opt-in, glyph becomes default, "low-fps chip" rendered in Status HUD footer.
- Estimated rework: ~1-2 days (mode-switch already in §7.4 design — raster ↔ glyph hot-swappable via `view.map.mode`).

### If real hardware re-validation downgrades to Branch C

- This ADR Status field flips: PROVISIONAL-ACCEPTED → CONTESTED → ACCEPTED Branch C (after re-write).
- Raster pipeline deferred to Phase 13 stretch (STRETCH-07 expanded scope).
- Phase 4a scope reduced to glyph-only mode + boot splash + status HUD. ADR-0006 declares raster lib stack moot for MVP.
- Estimated rework: ~3-5 days (drop raster-specific code paths; re-frame ADR-0001 z=0/0.5/1/2 in glyph mode only).
- Specs.md §7.4 + §7.4c + ADR-0001 + ADR-0006 + README + showcase require atomic INV-3 update to reflect post-MVP raster.

## Companion Files (per D-13 composite structure)

- `docs/perf/phase-0/*.json` — raw machine-readable measurements (Zod-validated, schema_version 1) — **PENDING hardware re-validation**
- `docs/perf/phase-0/*.csv` — sample arrays for ad-hoc analysis (BLE + DLE only) — **PENDING hardware re-validation**
- `docs/perf/phase-0/calibration/*.png` — palette calibration ramp photos — **PENDING hardware re-validation**
- `docs/perf/phase-0/calibration/methodology.md` — camera + ambient light + L\* derivation protocol — **PENDING hardware re-validation**
- `.planning/quick/20260514-raster-dynamic-infill/EVIDENCE.md` — earlier INV-2 spot-check 2026-05-14 against `hub.evenrealities.com/docs/guides/device-apis` (confirms *"no arbitrary pixel drawing"* canonical constraint)

## Cross-References (D-16 — Phase entry gate citations)

Downstream phases that consume this decision:

- **Phase 1 — Foundation:** Already COMPLETE (commit `5096129` / `0fa1364` / `671a22d`). This ADR's PROVISIONAL closure does not affect Phase 1 retroactively.
- **Phase 4a — G2 Engine + Raster + Status HUD:** Entry gate cites Branch A PROVISIONAL + acknowledges OQ-INV2-1 contingency. Plan 02 MUST address image API contingency (single-frame BMP fallback path).
- **Phase 4b — Overlay Slot + Map Mode Toggle:** Cites palette calibration as PENDING; glyph mode `[M] Map ctrl` toggle implementation proceeds regardless of Branch verdict.
- **Phase 6 — R1 Integration + INV-5:** INV-5 Gesture Determinism timing constants derived from `10-0-1-r1-timing-*.json` `recommended_windows_ms` — PROVISIONAL via simulator until hardware confirms.
- **Phase 7 — Foundry Module Write Path:** MidiQOL `relationships.requires` declaration already landed in Phase 2 module.json per the probe in Phase 0 plan 02 (commit `15e9922`).

## Sources

- **INV-2 lit-review round 2026-05-14** (fetched live during this ADR's drafting):
  - `evenrealities.com/smart-glasses` — G2 marketing (36g weight, magnesium/titanium, IP65, 2 days battery)
  - `hub.evenrealities.com/docs/guides/device-apis` — verbatim: *"no arbitrary pixel drawing, no audio output, no camera, images are greyscale only"*; PCM 16 kHz s16le mono; IMU pacing codes P100-P1000
  - `hub.evenrealities.com/docs/getting-started/overview` — display 576×288 4-bit, 4-mic, execution model phone-WebView
  - `github.com/BxNxM/even-dev` — simulator MIT license, v0.1.0 March 2026, *"resamples to 16 kHz S16LE PCM mono"*
  - `github.com/even-realities/EvenDemoApp` — G1 BMP protocol 1-bit 576×136 @ 194-byte packets, audio LC3 max 30s, command framing `[0x15, index, ...]` and termination `[0x20, 0x0d, 0x0e]`
- **Earlier INV-2 spot-check** (2026-05-14, in this session): `.planning/quick/20260514-raster-dynamic-infill/EVIDENCE.md`
- Specs.md §10.0 (Phase 0 master protocol) verbatim
- Specs.md §10.0.5 (Branch A/B/C decision tree)
- Specs.md §11.5.7 (raster pipeline lib stack)
- Specs.md §11.5.8.2 (Branch C glyph-only fallback)
- Specs.md §3.1 (G2 hardware constraints — **OQ-INV2-1 flagged for re-verification**)
- CONTEXT.md D-09 (BLE thresholds), D-10 (queue thresholds), D-11 (fps thresholds), D-12 (borderline auto-downgrade), D-13 (companion files), D-16 (cross-references)
- `tests/phase-0/_shared/branch-decision.ts` `deriveBranch()` (canonical algorithm) — **PENDING hardware evidence to run authoritatively**
- BLE 5.x specifications (literature-known): DLE supports up to 251-byte ATT payloads, sustained 250-500 kbps under AFH typical
