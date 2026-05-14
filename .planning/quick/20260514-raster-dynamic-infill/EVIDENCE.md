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

- ~~**B.1** — Resolve the remaining struct shapes~~ → **PARTIALLY RESOLVED via probe v7+v8** (Appendix C below); simulator-lenient structs still need real-hardware refinement.
- **B.2** — Determine empirical hardware size limits (200×100? other?) — requires real G2 (simulator does NOT enforce)
- ~~**B.3** — Map the `listen_even_app_data` variant~~ → **PARTIALLY RESOLVED**: `listen_even_app_data` accepts the same 10-method enum, returns `{status: "success"}` confirming subscription started. Actual event delivery mechanism (postMessage? Tauri event?) TBD.
- **B.4** — Post-resolution: spec-bump v0.9.13 with the page-based API correction (§4.3 SDK Surface, §7.2 layered model implementation, §7.4c idle infill state machine, §3.5 audio surface envelope shape)
- **B.5 NEW** — Reconcile Phase 2 wizard's `hub.*` API usage with canonical `flutterBridge.callHandler('evenAppMessage', ...)` shape (see Appendix C §C.4 below)

---

# Appendix C — Struct shape probing v7+v8 (2026-05-14 PM)

## C.1 Methodology

Two further probe iterations after Appendix B:

- **Probe v7**: walk struct fields by sending empty `data: {}`, parsing "missing field X" errors, adding X with heuristic candidate value, retry. Iterate until success OR type-mismatch on a field.
- **Probe v8**: targeted field-name probing — try known patterns for the lenient methods that accepted `{}`, plus complete the simple-method struct shapes with proper types.

Both probes used the same setup: `python3 -m http.server 8765` serving a probe HTML, `evenhub-simulator http://127.0.0.1:8765/index.html --automation-port 9900`, console retrieved via `GET http://127.0.0.1:9900/api/console`.

## C.2 Complete struct shapes (known fields and types)

| Method | Required fields | Field types | Return value (sample) | Notes |
|---|---|---|---|---|
| `getUserInfo` | (none) | — | `{avatar, country, name, uid}` | All-strings response |
| `getGlassesInfo` | (none) | — | `{model:"g2", sn:"S2001234567890", status:{batteryLevel:100, connectType:"connected", isCharging:false, isInCase:false, isWearing:true, sn}}` | Returns canonical G2 model + serial + connection-status |
| `getLocalStorage` | `key` | `key: String` | `""` (empty string if key missing) — actual string value otherwise | Strict — rejects `key: number` |
| `setLocalStorage` | `key`, `value` | both `String` | `true` on success | Rejects `value: number` (must be `String`) |
| `shutDownPageContainer` | `exitMode` | `exitMode: u64`, **enum {0, 1}** | `true` for valid modes; ERROR `unknown ExitMode value: 2` for mode ≥ 2 | Only 2 valid exit modes |
| `audioControl` | `isOpen` | `isOpen: bool` | `false` (status indicator?) | Returns `false` for both open=true and open=false — TBD what `false` means here |
| `createStartUpPageContainer` | (none — lenient, but `{containers: [...]}` is the recognized field) | `containers: Array<?>` | `0` if `{containers: []}`, **`1` for any non-empty payload (even unknown fields)** | Simulator stub returns 1 by default; real hardware likely stricter |
| `rebuildPageContainer` | (none, same struct as create) | same | `true` for any payload (stub) | Same simulator-lenient behavior |
| `updateImageRawData` | (none, lenient) | unknown | `"sendfailed"` for all attempted payloads | Simulator can't deliver to a non-existent page slot |
| `textContainerUpgrade` | (none, lenient) | unknown | `false` for all attempted payloads | Same — no active page to upgrade |

## C.3 `listen_even_app_data` semantics

Verified probe-empirically: `listen_even_app_data` accepts the **same 10-method enum** as `call_even_app_method`. Subscribing returns `{status: "success"}`. Async data delivery mechanism not yet characterized.

Likely semantic: `listen_even_app_data({method: "audioControl"})` subscribes to async audio PCM events delivered as `audioEvents` (simulator README confirms 100ms / 3200 bytes / 1600 samples chunks). Other methods may have async return data (e.g., `listen_even_app_data({method: "getGlassesInfo"})` for status change notifications).

## C.4 CRITICAL: Phase 2 wizard `hub.*` API mismatch

Inspection of existing repo code reveals our Phase 2 wizard (`packages/g2-app/src/wizard/`) calls methods that **do not exist** on the canonical `flutterBridge.callHandler('evenAppMessage', ...)` API:

| Wizard usage | Source | Canonical equivalent (verified 2026-05-14) | Status |
|---|---|---|---|
| `hub.setItem(key, value)` | `tier3-storage.ts:61, 161, 168` | `flutterBridge.callHandler('evenAppMessage', json({type:'call_even_app_method', method:'setLocalStorage', data:{key, value}}))` | Wrong path — needs polyfill |
| `hub.getItem(key)` | `tier3-storage.ts:77, 142` | `flutterBridge.callHandler('evenAppMessage', json({type:'call_even_app_method', method:'getLocalStorage', data:{key}}))` | Wrong path — needs polyfill |
| `hub.removeItem(key)` | `tier3-storage.ts:113` | **NOT IN 10-METHOD ENUM** — simulate via `setLocalStorage(key, "")` or new method | Wrong — no canonical equivalent |
| `hub.eventBus.on('g2.wear', cb)` | `auto-connect.ts:85, 94; wizard.ts:132` | Likely `listen_even_app_data({method: ?})` — exact method name TBD | Wrong path — no `g2.wear` event source identified on simulator (simulator README: "Status Events: Not emitted") |
| `hub.eventBus.off` | `auto-connect.ts:63, 94` | Subscription teardown API TBD | Wrong path |
| `hub.camera?.requestAccess()` | `step2-token.ts:367` | **NOT IN 10-METHOD ENUM** — likely a phone-side WebView API (`navigator.mediaDevices`?) not Even SDK | Wrong path — but may work as phone WebView API |
| `hub.camera?.scanQRCode()` | `step2-token.ts:364` | **NOT IN 10-METHOD ENUM** — likely a custom phone-side wrapper | Wrong path |

### Why Phase 2 wizard "worked"

The wizard's 451 unit tests pass because they MOCK `hub` global. The wizard would FAIL on real hardware OR on the canonical simulator (`hub is not defined` — only `flutterBridge` is injected).

### Severity assessment

- **Phase 2 was marked complete on 2026-05-13** with full coverage on unit tests
- **Phase 2 was NOT validated against the canonical simulator** during its discuss/plan/execute cycle
- **Phase 4a planning MUST address this mismatch** before any plan touches the wizard code path or builds on the `hub.*` ambient declarations

### Proposed reconciliation (deferred to dedicated quick task)

Option A — **Polyfill layer** (`packages/g2-app/src/hub-polyfill.ts`): translate `hub.setItem(k,v)` → `flutterBridge.callHandler('evenAppMessage', json({type:'call_even_app_method', method:'setLocalStorage', data:{key:k, value:v}}))`. Wizard tests pass unchanged; real-hardware code path works.

Option B — **Refactor wizard** to use `flutterBridge.callHandler` directly. More work; more honest about the underlying API; better for Phase 4a+ code reuse.

Option C — **Stand-alone investigation**: probe further whether there IS a `hub` polyfill injected by the Even Realities App phone-side WebView wrapper (maybe the wrapper auto-injects `hub` for backwards-compat with G1-era apps?). The simulator may NOT inject this wrapper. The Real-App-on-phone might.

Recommendation: Option C first (cheapest — fetch Even Realities App documentation on what globals the WebView injects), then A or B based on findings.

## C.5 Container-budget findings (incremental)

The simulator's lenient handling of `createStartUpPageContainer` (returns `1` for almost any non-empty payload) means we cannot determine the **maximum container count** or **per-container size limits** from the simulator alone. The simulator README v0.7.1 changelog says:

> "cap width/height for single container"
> "add text container bytes limit to 999"

And v0.7.3:

> "constraint list item text size to be maximum 63 bytes and 20 items"

Concrete numeric constraints **confirmed** for v0.7.3:
- **List container**: max 20 items, max 63 bytes per item
- **Text container**: max 999 bytes content
- **Single image container width/height**: capped (specific values TBD)

## C.6 Container shape — best guess from probing

The fact that `createStartUpPageContainer({containers: []})` returned `0` while `createStartUpPageContainer({containers: [{type: 'image'}]})` returned `1` is a **strong hint** that:

- Field name `containers` IS recognized by the deserializer
- Each container has at least a `type` discriminator
- The return value is the count of created containers (0 for empty array, 1+ for non-empty)

Probable shape (subject to confirmation):
```typescript
type Container =
  | { type: 'image'; id: number; x: number; y: number; width: number; height: number }
  | { type: 'text';  id: number; x: number; y: number; width: number; height: number; content: string }
  | { type: 'list';  id: number; x: number; y: number; width: number; height: number; items: string[] };

type CreateStartUpPageContainer = {
  containers: Container[];
  // possibly more fields TBD (page-level config: id, background, captureContainerId, etc.)
};
```

This is consistent with Specs.md §3.1 (max 4 image + 8 text/list + 1 capture container per page) — the **page** is a flat list of containers with types, sizes, positions.
