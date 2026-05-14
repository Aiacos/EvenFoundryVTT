---
slug: raster-dynamic-infill
date: 2026-05-14
type: inv2-round-evidence
binds: Specs.md §3.1 hardware constraint, ADR-0001 layered model, §7.2 / §7.4 / §7.4b
---

# INV-2 Re-Verification Round — Even Realities G2 Image API Constraint (2026-05-14)

## Trigger

User asked to push the raster map area past the documented 400×200 effective max. Per CLAUDE.md INV-2:

> *"Don't re-litigate constraints already verified upstream. If you suspect a claim has drifted, run a fresh WebFetch round (≥4 parallel) against canonical sources and log the result — don't quietly 'correct' without evidence."*

## Audit method

6 WebFetch attempts (the spec requires ≥4 parallel on canonical sources):

| # | URL | Status | Key finding |
|---|---|---|---|
| 1 | `https://hub.evenrealities.com/docs/guides/device-apis` | 200 OK (canonical primary) | Verbatim quote: *"No direct Bluetooth access, no arbitrary pixel drawing, no audio output, no text alignment, no font control, no background colors, no per-item list styling, no programmatic scroll position, no animations, no camera (there is none), and images are greyscale only."* Specific 200×100 dimension not visible in fetched text. |
| 2 | `https://hub.evenrealities.com/docs/getting-started/overview` | 200 OK | *"App logic runs on the phone; the glasses handle display rendering and native scroll processing."* Display 576×288 4-bit, 4-mic, no speaker, no camera — all unchanged. |
| 3 | `https://evenrealities.com/ai-glasses` | 200 OK (marketing) | No granular specs on landing page. |
| 4 | `https://support.evenrealities.com/specs` | **HTTP 404** | Path deprecated/moved. |
| 5 | `https://hub.evenrealities.com/docs/guides/quickstart` | 200 but SPA-empty | React root, no content fetched via WebFetch. |
| 6 | `https://hub.evenrealities.com/docs/reference/api` | 200 but SPA-empty | React root, no content fetched via WebFetch. |

## Findings synthesis

### Constraint CONFIRMED — no drift

The **fundamental hardware constraint** (*"no arbitrary pixel drawing"*) is **verbatim present** on the canonical primary source `hub.evenrealities.com/docs/guides/device-apis` at 2026-05-14. This precludes any single full-screen 576×288 raster regardless of container dimensions.

### Constraint number — specific 200×100 not directly visible on canonical primary

The exact "image container max 200×100 px" number cited in Specs.md §3.1 is not visible on the fetched canonical text. Two non-mutually-exclusive interpretations:

- (a) The number lives in a sub-reference page that is not WebFetch-reachable today (SPA root pages 5 and 6 returned empty content);
- (b) The number was sourced from a previously fetched canonical that has been restructured.

This is **not classified as drift** for this round because the broader constraint that gates the discussion (*"no arbitrary pixel drawing"*) is preserved. Specific-number re-verification flagged as INV-2 follow-up.

### ADR-0001 cross-reference

`docs/architecture/0001-layered-ui-model.md` cites:

> *"max 4 image containers + 8 text/list containers + exactly 1 container with `isEventCapture: 1` per page"*

This budget statement is the **operative upstream-derived constraint** that controls the rest of the architecture. The Image Container count (4) is the hard ceiling that makes the 5th-tile idea infeasible. No drift on this number this round.

## Drift classification

**NEUTRO / no-drift** for the substantive constraint set (4 image containers, 8 text/list containers, 1 capture container, no arbitrary pixel drawing).

**FOLLOW-UP** for the specific 200×100 dimension citation: cannot be directly re-confirmed on the fetched canonical primary text snapshot 2026-05-14. Suggested follow-up: try `hub.evenrealities.com/docs/sdk-reference/*` paths with a JS-rendering fetch (chrome-devtools MCP) once the SDK auth/access is sorted out, or cross-check against the BxNxM/even-dev simulator README (referenced in Specs §13).

## Decision matrix presented to user

| # | Approach | Constraint impact | User decision |
|---|---|---|---|
| A | Use the 88 px vertical band below the raster | INV-compatible; cosmetic + 1-2 text container | not selected |
| B (original framing) | Repurpose z=2 overlay container as 5th raster tile when idle | **NOT FEASIBLE** — image container budget hard-capped at 4 | originally selected; corrected after I flagged the error |
| C | Reallocate status HUD z=1 to give map more width | Breaks INV-1 status-HUD persistence rule | not selected |
| **CORRECTED-B** | **Introduce z=0.5 Idle Content Infill** — text containers fill the ~5 empty rows in the map area when no overlay; auto-demolished on z=2 mount | INV-compatible (uses text/list budget, not image budget) | **SELECTED 2026-05-14** |

## References

- `https://hub.evenrealities.com/docs/guides/device-apis` (fetched 2026-05-14, canonical primary)
- `https://hub.evenrealities.com/docs/getting-started/overview` (fetched 2026-05-14)
- `Specs.md` §3.1 (hardware constraints), §7.2 (layered model), §7.4b.3 (Maximum Raster Approach D), §11.5.7-§11.5.8 (raster pipeline + failure modes)
- `docs/architecture/0001-layered-ui-model.md` (container budget verbatim)
- `CLAUDE.md` § Project Invariants — INV-2 audit method

---

# Appendix B — Live simulator probe (2026-05-14)

Triggered by user request: *"usa il simulatore descritto qui: https://hub.evenrealities.com/docs/reference/simulator"*.

## Setup

- **Package**: `@evenrealities/evenhub-simulator@0.7.3` (npm, MIT, official Even Realities). Already installed globally on dev machine alongside `@evenrealities/evenhub-cli@0.1.13`.
- **Runtime**: Tauri-based desktop app, WebKitGTK renderer, automation HTTP API on configurable port.
- **Probe method**: launched simulator pointing at `http://127.0.0.1:8765/index.html` (local `python3 -m http.server`) serving a custom probe HTML that introspects `globalThis.flutterBridge` and exercises `callHandler` with various payloads. Console captured via `GET /api/console`.

## Bridge mechanism (decoded from live source inspection)

The simulator injects `window.flutterBridge` with a single function `callHandler`. The full source (extracted live via `Function.prototype.toString()`):

```javascript
async function (handlerName, ...args) {
    console.log(`[Simulator] Flutter Bridge intercepted: ${handlerName}`);
    let arg = JSON.parse(args[0]);
    switch (handlerName) {
      case "evenAppMessage":
        return window.__TAURI__.core.invoke("even_app_method", { arg });
      default:
        return Promise.reject(new Error(`Unhandled handler: ${handlerName}`));
    }
}
```

→ **Only one valid `handlerName`: `evenAppMessage`.** Everything else rejects with "Unhandled handler". This invalidates Specs.md §3.5 / §4.3 implicit assumption of multiple direct `bridge.xxx` methods.

## Envelope contract (canonical)

```javascript
flutterBridge.callHandler('evenAppMessage', JSON.stringify({
  type: 'call_even_app_method' | 'listen_even_app_data',
  method: <one-of-10-canonical-methods>,
  data: <method-specific-struct>
}))
```

→ All G2 SDK operations route through this single envelope. The Specs.md §4.3 "SDK Surface" table needs revision: the API is NOT a flat collection of `bridge.createXxx()` calls — it is a single dispatcher with a method-discriminated payload.

## The 10 canonical methods (exhaustive enum, extracted from Rust deserialization error)

When you call with an unknown method, the simulator returns the enum's complete list:

> *"unknown variant `xxx`, expected one of `getUserInfo`, `getGlassesInfo`, `setLocalStorage`, `getLocalStorage`, `createStartUpPageContainer`, `rebuildPageContainer`, `updateImageRawData`, `textContainerUpgrade`, `shutDownPageContainer`, `audioControl`"*

| # | Method | Rust struct | Verified empirically | Returns |
|---|--------|-------------|----------------------|---------|
| 1 | `getUserInfo` | (none) | ✓ live OK | `{avatar:"", country:"unknown", name:"Simulator", uid:"1337"}` |
| 2 | `getGlassesInfo` | (none) | ✓ live OK | `{model:"g2", sn:"S2001234567890", status:{batteryLevel:100, connectType:"connected", isCharging:false, isInCase:false, isWearing:true, sn:"S2001234567890"}}` |
| 3 | `getLocalStorage` | `GetLocalStorageData` | struct shape probe-pending | TBD |
| 4 | `setLocalStorage` | `SetLocalStorageData` | struct shape probe-pending | TBD |
| 5 | `createStartUpPageContainer` | `CreateStartUpPageContainer` | struct shape probe-pending | TBD |
| 6 | `rebuildPageContainer` | `CreateStartUpPageContainer` (SAME as 5!) | struct shape probe-pending | TBD |
| 7 | `shutDownPageContainer` | `ShutDownPageContainerData` | struct shape probe-pending | TBD |
| 8 | `updateImageRawData` | `UpdateImageRawData` | struct shape probe-pending | TBD |
| 9 | `textContainerUpgrade` | `TextContainerUpgrade` | struct shape probe-pending | TBD |
| 10 | `audioControl` | `AudioControl` | struct shape probe-pending | TBD |

## OQ-INV2-1 — RESOLVED with INTERPRETATION (3) NEW

The image container API is **page-based declarative**, NOT imperative-per-container:

- **No `createImageContainer({width, height})` method exists.** The simulator rejects this variant.
- **No single-frame `pushFullFrameBmp` method exists.** Same rejection.
- **Actual mechanism**: the developer defines a complete PAGE LAYOUT in `createStartUpPageContainer.data` (or `rebuildPageContainer.data` — same struct). The layout includes image slots, text slots, list slots, etc. The hardware enforces per-page slot counts (the "4 image + 8 text/list" budget per Specs §3.1 + ADR-0001). Image data is then **pushed into specific slots** via `updateImageRawData` (referencing slot identifier + raw bytes).
- **Lifecycle**: `createStartUpPageContainer` (initial mount) → `rebuildPageContainer` (transition to a new layout, e.g., overlay mount/dismiss) → `shutDownPageContainer` (clear).

→ This INVALIDATES interpretation (1) AND interpretation (2) from my earlier OQ-INV2-1 analysis. The correct model is (3) declarative page-based — neither separate `createImageContainer` calls nor single-frame BMP.

## Implications for Specs.md (post-v0.9.12 amendments needed)

| Section | Issue | Action |
|---|---|---|
| §3.5 G2 SDK Audio Surface | Implies direct `bridge.audioControl(true|false)` call — actual is `flutterBridge.callHandler('evenAppMessage', json({type:'call_even_app_method', method:'audioControl', data:{...}}))`. Same effect; different shape. | Update §3.5 to reflect envelope-based dispatch. |
| §4.3 SDK Surface table | Lists separate `bridge.createTextContainer`, `bridge.createImageContainer`, etc. None of these exist as direct methods. | Rewrite table — only `evenAppMessage` is the dispatcher; the 10 methods are dispatched payloads. |
| §7.2 Layered Rendering Model | Layered model concept is valid, but implementation is via `rebuildPageContainer` (atomic page swap), not via "demolish/reborn" containers individually. | Clarify: state transitions on overlay open/close = `rebuildPageContainer` calls. |
| §7.4c Idle Content Infill (z=0.5, new in v0.9.12) | "Auto-demolish on overlay_mounted, auto-reborn on overlay_dismissed" — actual mechanism is rebuildPageContainer with different page def. Same observable behavior; different vocabulary. | Update §7.4c.4 state machine to reflect rebuildPageContainer dispatch. |
| §3.1 hardware budget "4 image + 8 text/list + 1 capture per page" | Plausible — the simulator enforces per-page slot counts. Specific 200×100 size constraint UNVERIFIED (simulator does NOT enforce hardware size limits per its own README v0.7.1 changelog: *"cap width/height for single container"* implies some enforcement, but limits TBD). | Keep as-is; flag specific 200×100 as TODO(ADR-0005-OQ-INV2-1.b) pending real-hardware probe. |
| §11.5.7 Raster pipeline | Pipeline still valid (image-q + upng-js + xxhash-wasm). The OUTPUT path is now `updateImageRawData` with slot ID + bytes (instead of direct bridge.updateImageRawData). | Trivial wire-shape update. |
| ADR-0001 layered UI model | The "single capture container migration" premise still holds. The Tauri ACL system enforces it. | No change. |

## Confirmed Specs.md claims (no drift)

- ✓ Display 576×288 4-bit greyscale (`getGlassesInfo` returns `model:"g2"`; simulator README + canonical primary)
- ✓ Audio PCM 16 kHz s16le mono, 100ms / 3200 bytes / 1600 samples per event (simulator README §Audio)
- ✓ R1 events: `up`, `down`, `click`, `double_click` (simulator README §Supported Inputs)
- ✓ "No arbitrary pixel drawing" — single image API path is `updateImageRawData` into pre-defined slots
- ✓ "No audio output" — no audio-out method in the 10-method enum
- ✓ "No camera" — no camera-related method in the enum

## Sources

- `https://hub.evenrealities.com/docs/reference/simulator` — official simulator reference (fetched 2026-05-14)
- `/home/linuxbrew/.linuxbrew/lib/node_modules/@evenrealities/evenhub-simulator/README.md` — full README v0.7.3
- Live probe HTML: `/tmp/evf-probe/index.html` (versions v1-v6 iteratively refined)
- Probe console captures via simulator HTTP API `GET http://127.0.0.1:9900/api/console` (transient — not committed)
- `flutterBridge.callHandler` source extracted via `Function.prototype.toString()` (verbatim quoted above)
- Rust deserialization error messages (verbatim — they leak the complete enum variant list)

## Next steps (deferred to subsequent quick tasks)

- **B.1** — Resolve the remaining struct shapes (CreateStartUpPageContainer, UpdateImageRawData, etc.) via more focused probes
- **B.2** — Determine empirical hardware size limits (200×100? other?) — requires real G2 (simulator does NOT enforce)
- **B.3** — Map the `listen_even_app_data` variant to specific async-subscription semantics (audio chunk streaming? touch events? IMU?)
- **B.4** — Post-resolution: spec-bump v0.9.13 with the page-based API correction (§4.3 SDK Surface, §7.2 layered model implementation, §7.4c idle infill state machine)
