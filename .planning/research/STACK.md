# Stack Research — v0.10.0 Raster UI Substrate (STACK ADDITIONS)

**Domain:** Full-screen raster HUD compositor on OffscreenCanvas in a Safari WKWebView Web Worker
**Researched:** 2026-06-05
**Researcher:** GSD research agent (Phase 6)
**Confidence:** HIGH for platform-API decisions; MEDIUM for WKWebView-specific font loading (limited empirical WKWebView data; best approach derived from spec + WebKit tracker + iOS minimum version)
**Scope:** ADDITIONS AND CHANGES ONLY relative to the locked v0.9.x stack. The base stack (image-q 4.0.0, upng-js 2.1.0, xxhash-wasm 1.1.0, Vite 8, TypeScript 5.8.3 strict, Vitest 4, Biome 2, pnpm 10.33.4) is CONFIRMED and not re-researched here.

---

## 0. Executive Decision: No New Heavy Dependencies

The v0.10.0 work is a **substrate swap**: render target moves from SDK text containers to an
OffscreenCanvas. The existing raster pipeline (image-q → upng-js → xxhash-wasm) is unchanged.
All new capability comes from **platform APIs** (OffscreenCanvas 2D API, `createImageBitmap`,
`FontFace`/`WorkerGlobalScope.fonts`) plus one optional small font package (`@fontsource/vt323`
≈ 10 KB WOFF2, OFL-1.1 license). No new runtime dependencies are required.

INV-4 status: zero bloat additions. The "what NOT to add" list is below in §4.

---

## 1. Platform-API Decisions (no package install required)

### 1.1 Static-Layer Pre-Bake and Composite Cache

**Recommendation:** Use a dedicated `OffscreenCanvas` (called "chrome canvas") per static layer
class, render its content once, call `createImageBitmap(chromeCanvas)` to freeze it as an
`ImageBitmap`, then `ctx.drawImage(imageBitmap, 0, 0)` onto the composite canvas each frame.

**Why this approach over alternatives:**

| Approach | Verdict | Notes |
|---|---|---|
| `chromeCanvas.transferToImageBitmap()` | **Do NOT use for caching** | Resets the canvas to blank after call; you lose the source. Use only for one-shot transfer to a different context (e.g. passing a rendered frame out of the Worker). |
| Keep the chrome `OffscreenCanvas` alive and `ctx.drawImage(chromeCanvas, 0, 0)` | **Works, slightly simpler** | Valid and Worker-safe. `OffscreenCanvas` is accepted as a `drawImage` source in the 2D API. Avoids the `ImageBitmap` lifecycle (no `close()` obligation). Recommended when chrome content never changes. |
| `createImageBitmap(chromeCanvas)` → `ctx.drawImage(imageBitmap, ...)` | **Optimal if chrome canvas IS reused repeatedly** | `ImageBitmap` is a GPU-backed texture handle — `drawImage` from it skips the CPU→GPU upload on each frame. Call `imageBitmap.close()` when the chrome changes and you rebuild. |
| Two DOM `<canvas>` elements stacked with CSS z-index | **Not applicable** | No DOM in the Worker or G2 render target. |

**Concrete pattern for this codebase:**

```typescript
// One-time setup (Worker scope, OffscreenCanvas context)
const chromeCanvas = new OffscreenCanvas(576, 288);
const chromeCtx = chromeCanvas.getContext('2d')!;
drawStaticChrome(chromeCtx);                       // borders, labels, tab strip
const chromeBitmap = await createImageBitmap(chromeCanvas); // GPU-resident copy

// Per-frame composite (dynamic data changes)
compositeCtx.drawImage(chromeBitmap, 0, 0);        // paste chrome (GPU→GPU, cheap)
drawDynamicContent(compositeCtx, snapshot);        // HP, AC, conditions, etc.
// → hand off to dither pipeline as before
```

**Worker-safe:** YES. `createImageBitmap` is available on `WorkerGlobalScope` (MDN Baseline:
Widely available since 2023-03). `OffscreenCanvas` as a `drawImage` source is Baseline 2023.

**WKWebView/Safari:** `OffscreenCanvas` partial support landed in Safari 16.2 (2D context);
full support (including Worker usage) in Safari 17.0 (2023-09). Even Realities App requires
iOS 16.0+, meaning some devices may run Safari 16.x with partial support. The 2D draw path
(`getContext('2d')`, `drawImage`, `fillText`, `fillRect`, `strokeRect`) was the first part
shipped in Safari 16 partial support, so static chrome pre-bake is safe on iOS 16+. The
risk is Worker-thread OffscreenCanvas usage: if the Worker path proves unreliable on iOS 16,
fall back to main-thread rendering (render on a document canvas, then pass RGBA to the Worker
for dither/encode — this already exists in `hud-canvas-renderer.ts` as the fallback path
via `document.createElement('canvas')`).

**Integration with existing code:** `hud-canvas-renderer.ts::acquireCanvas2d()` already
handles the environment split (document vs OffscreenCanvas). The chrome pre-bake logic
belongs in a new `hud-chrome-layer.ts` module that is called once on init, caching the
`ImageBitmap` (or `OffscreenCanvas`) and exposing a `compositeChrome(ctx)` function.

### 1.2 Font Loading for OffscreenCanvas in a Worker Context

**Context:** The PoC currently uses `'14px monospace'` — a generic system font. The goal is
a crisp dense terminal/VFD aesthetic (Alien Nostromo / phosphor green). This requires loading
a custom bitmap/pixel font inside the Worker (where `document.fonts` is absent).

**Spec situation (as of 2026-06):**

- `WorkerGlobalScope.fonts` (a `FontFaceSet`) is part of the CSS Font Loading API spec and is
  declared as "Baseline Widely available since September 2022" by MDN.
- `FontFace` constructor is available on `WorkerGlobalScope` per WebKit bug 224178 (fixed
  2021-04-22, changeset r276450). This was the final blocker for spec-complete OffscreenCanvas.
- Text rendering on OffscreenCanvas in Workers was fixed in WebKit bug 202793 (2021-04-02).
- **Critical caveat:** `document.fonts` is NOT available in a Worker. The Worker has its own
  `self.fonts` (FontFaceSet). Fonts loaded on the main thread via CSS `@font-face` do NOT
  automatically carry over to the Worker's font registry. Each Worker must load its own fonts.
- Font spec restriction: use only absolute pixel units (e.g. `'16px VT323'`). Relative units
  (`em`, `rem`, viewport units) have undefined behavior in OffscreenCanvas contexts and may
  resolve to 0 in Workers (WHATWG issue #7847). This is not a problem for our use case; we
  always use `px` for the HUD.

**Recommended approach — two-step FontFace load inside the Worker:**

```typescript
// In the Worker (or in hud-canvas-renderer.ts running off-main-thread)
const resp = await fetch('/fonts/VT323-Regular.woff2');
const buf  = await resp.arrayBuffer();
const face = new FontFace('VT323', buf);
await face.load();
self.fonts.add(face);   // WorkerGlobalScope.fonts — NOT document.fonts
// Now ctx.font = '16px VT323' resolves correctly
```

**Why `fetch` + `ArrayBuffer` instead of URL string in FontFace constructor:**
- A URL-based `new FontFace('VT323', 'url(/fonts/VT323-Regular.woff2)')` also works
  (`face.load()` resolves when fetched), but the `ArrayBuffer` path gives you explicit
  control over the fetch (cache headers, error handling) and avoids any same-origin issues
  in the WKWebView plugin-host context.
- Either form works in Workers; the `ArrayBuffer` form is preferred for plugin-host deployments
  where relative URL resolution from a Worker scope may differ from the main thread.

**Fallback if Worker font loading fails on a target iOS device:**
If `self.fonts` is unavailable or `FontFace` throws (observed on some pre-Safari-17 WKWebView
configurations), fall back to `'16px monospace'` (system fallback). The HUD will look less
sharp but will be functionally correct. The `hud-canvas-renderer.ts` font constant should be
a runtime-resolved value with this fallback chain, not a module-level `const`.

**Integration:** The font must be loaded BEFORE the first `renderHudFrame` call that uses it.
The `boot-hud-raster-poc.ts` boot sequence should await font initialization before subscribing
to `character.delta`. A `loadHudFont(): Promise<void>` helper in `hud-canvas-renderer.ts`
(or a new `hud-font-loader.ts`) that resolves immediately if the font is already loaded is
the right abstraction.

---

## 2. Optional Small Package: VT323 Pixel Font

**Recommendation:** Add `@fontsource/vt323` (npm package) as an optional production dependency
of `packages/g2-app`. Use it as the pixel font for the HUD.

| Item | Details |
|---|---|
| Package | `@fontsource/vt323` |
| Current version | **5.2.7** (verified 2026-06-05 via `npm view @fontsource/vt323 version`) |
| License | **OFL-1.1** (SIL Open Font License 1.1) — permissive, no viral, attribution in font file |
| Size (WOFF2) | ~10–15 KB for the single weight file (WOFF2 is the on-wire format) |
| Format | Provides WOFF2 + WOFF font files in `node_modules/@fontsource/vt323/files/` |
| Origin | DEC VT320 terminal glyphs; electron-beam phosphor smearing emulation via outline construction |

**Why VT323 for this use case:**
- Designed from actual DEC VT320 terminal character cells — authentic CRT/phosphor aesthetic,
  exactly the "Alien Nostromo / VFD" look specified in Specs §0 Project.
- Monospaced — column alignment in the HUD (HP bars, AC, conditions) is layout-critical (INV-1).
- Available as WOFF2 via Fontsource = self-hostable without Google Fonts network dependency
  (INV-2: no external CDN in prod; Even Hub whitelist allows only explicit origins).
- Best visual sizes: **16px, 20px** (multiples of the native 8px bitmap step). The PoC uses
  14px `monospace`; switching to 16px VT323 gives ~18 rows in 288px (vs 20 rows at 14px —
  acceptable density trade-off for the aesthetic gain).
- Worker-loadable: self-hosted WOFF2 is fetched and loaded via the `FontFace` + `ArrayBuffer`
  path above. No DOM dependency.

**Installation (add to `packages/g2-app`):**
```bash
pnpm --filter @evf/g2-app add @fontsource/vt323@5.2.7
```

**Usage in the Worker:**
```typescript
// In hud-font-loader.ts (Worker scope)
import vt323Url from '@fontsource/vt323/files/vt323-latin-400-normal.woff2?url';
// Vite ?url suffix returns the hashed file URL — works in Worker imports at build time.
// At runtime (Worker), use:
const resp = await fetch(vt323Url);
const buf  = await resp.arrayBuffer();
const face = new FontFace('VT323', buf);
await face.load();
self.fonts.add(face);
```

The Vite `?url` suffix resolves the font file path at build time and emits the asset into the
bundle output directory, so the WOFF2 is served alongside the JS. No Google Fonts CDN required.

**Alternatives considered:**

| Font | Decision | Reason |
|---|---|---|
| `'14px monospace'` (current PoC) | Fallback only | System monospace varies by device (Courier New on macOS, Droid Mono on Android). No pixel-perfect CRT aesthetic. Acceptable as fallback. |
| Press Start 2P (`@fontsource/press-start-2p` 5.2.7) | Rejected | 8px bitmap native → at 16px looks blocky/video-game, not VFD/terminal. Wrong aesthetic for a glanceable status HUD. |
| Px437 / Oldschool PC Font Pack (int10h.org) | Deferred | Superior fidelity (exact IBM PC Code Page 437 bitmaps), available as TTF/WOFF (no WOFF2). OFL-1.1 + CC-BY-SA-4.0 (attribution required). Worth evaluating if VT323 CRT smearing is too thick at small sizes. Must be manually added to `packages/g2-app/public/fonts/` (not on npm). |
| Cozette / Spleen | Not evaluated | These are bitmap .bdf fonts for terminals; no known WOFF2 npm packaging. Would require build-time conversion. Deferred. |
| System `monospace` generic | Fallback | Device-variable, no terminal aesthetic. Use as the `catch` branch in the font load sequence. |

---

## 3. What Changes in Existing Modules

### 3.1 `hud-canvas-renderer.ts` — changes needed

The current PoC renderer creates a new canvas **every frame** via `acquireCanvas2d()` and
immediately discards it. For production raster HUD:

1. **Pre-bake static chrome once** — extract the border/divider/label drawing code into
   `drawChrome(ctx)`. Call it once, cache the result as an `ImageBitmap` (or keep the
   `OffscreenCanvas` alive). On each frame, `compositeCtx.drawImage(chromeBitmap, 0, 0)`
   then overlay dynamic content.
2. **Reuse the composite canvas** — hold a single long-lived `OffscreenCanvas(576, 288)` per
   renderer instance. Clear with `ctx.clearRect` each frame instead of recreating.
3. **Font load gate** — the renderer must not be called before the VT323 font is loaded.
   Expose `isReady(): boolean` or make `init(): Promise<void>` awaitable.
4. **Font string** — change `const HUD_FONT = '14px monospace'` to `'16px VT323'` with
   fallback `'16px monospace'` if `VT323` unavailable (runtime-resolved, not `const`).

### 3.2 `hud-raster-frame.ts` — no changes required

`buildHudTiles` operates on the RGBA output of `renderHudFrame`. The pre-bake/font changes
are upstream; `buildHudTiles` is agnostic to canvas state.

### 3.3 `hud-live-render.ts` — no changes required for TODO-raster #1

The orchestration wrapper is already DI-injectable; `render` dep is swapped to the new
stateful renderer without touching orchestration.

### 3.4 New file: `hud-font-loader.ts` (recommended)

Isolates the Worker-scoped `FontFace` + `self.fonts.add` logic. Returns a `Promise<string>`
that resolves to the usable font string (`'16px VT323'` or `'16px monospace'` as fallback).
This is the single point that encapsulates the WKWebView font-loading caveat.

### 3.5 New file: `hud-chrome-layer.ts` (recommended)

Encapsulates the static-chrome pre-bake: `init(width, height): Promise<ImageBitmap>` renders
the frame borders, dividers, tab strips, and any static labels once, freezes to `ImageBitmap`,
and exposes `composite(ctx: OffscreenCanvasRenderingContext2D): void` that `drawImage`s it.
When the chrome definition changes (e.g., tab strip layout changes), call `invalidate()` to
trigger a re-bake on next frame.

---

## 4. What NOT to Add (INV-4 bloat gate)

| Do NOT add | Why | Use instead |
|---|---|---|
| `fabric.js` / `konva.js` / `pixi.js` | Full 2D scene graph — massive bundle (>200 KB gz). We don't need retained-mode or hit-testing. | Native `OffscreenCanvas` 2D API |
| `opentype.js` / `fontkit` | Runtime font parsing/shaping. We don't need metrics beyond `measureText`. | Platform `ctx.font` + `ctx.measureText` |
| `@google-fonts/*` CDN link | Even Hub `app.json` whitelist forbids wildcards; external CDN is an out-of-whitelist domain at runtime. | Self-hosted via `@fontsource/vt323` WOFF2 |
| `pako` / `fflate` (for fonts) | PNG already DEFLATES; adding a second zlib layer on WOFF2 assets wastes bytes. | Serve WOFF2 directly (pre-compressed by format) |
| `ImageBitmapRenderingContext` (as primary render target) | Designed for low-overhead video frame transfer. Our pipeline needs the 2D draw API (fillText, drawImage, fillRect). | `OffscreenCanvas.getContext('2d')` |
| `document.fonts.add()` in a Worker | `document` is absent in Workers — this throws `ReferenceError`. | `self.fonts.add(face)` (WorkerGlobalScope.fonts) |
| `@font-face` CSS (in Worker) | No CSS resolver in Workers. Font CSS on main thread does NOT carry over to Worker font registry. | `new FontFace(...) + self.fonts.add()` |
| Font antialiasing / subpixel rendering hints | G2 is 4-bit greyscale + dithered. Subpixel hints produce rainbow fringing that dithering destroys. | Pixel fonts + integer-pixel sizes only |
| `sharp` for chrome/font pre-bake | Server-side (libvips), can't run in browser Worker. | OffscreenCanvas + `createImageBitmap` (Worker-native) |

---

## 5. Version Compatibility Notes

| Concern | Verdict |
|---|---|
| `OffscreenCanvas` + `getContext('2d')` in Worker on iOS 16 | SAFE: partial support in Safari 16.2 covers 2D context. Worker usage may be limited; main-thread fallback (`document.createElement`) is already in `acquireCanvas2d()`. |
| `OffscreenCanvas` + `getContext('2d')` in Worker on iOS 17+ | SAFE: full support since Safari 17.0 (2023-09). iOS 17 is the safe baseline for Worker-based rendering. |
| `createImageBitmap(canvas)` in Worker | SAFE on iOS 17+ (Baseline Widely available 2023-03). Treat as optional optimization; `ctx.drawImage(OffscreenCanvas)` is an equivalent fallback. |
| `WorkerGlobalScope.fonts` + `FontFace` in Worker | SAFE on Safari 17+ (WebKit bug 224178 fixed 2021; shipped in subsequent Safari release). On Safari 16 WKWebView, empirical status is uncertain — the ArrayBuffer FontFace load is the most robust path; degrade to `'16px monospace'` on catch. |
| `new FontFace('VT323', arrayBuffer)` syntax | SAFE: `FontFace` from `ArrayBuffer` is Baseline Widely available. The constructor accepts `ArrayBuffer | ArrayBufferView | string`. |
| `'16px VT323'` ctx.font with absolute px unit | SAFE: absolute px units are fully specified for OffscreenCanvas workers (WHATWG issue #7847 only concerns relative units). |
| `@fontsource/vt323` WOFF2 asset size | ~10–15 KB — well within the g2-app bundle ceiling (INV-4 200 KB gz). |

---

## 6. Platform API Compatibility Summary

| API | Worker-safe | No DOM | WKWebView iOS 16 | WKWebView iOS 17+ | Confidence |
|---|---|---|---|---|---|
| `new OffscreenCanvas(w, h)` | YES | YES | Partial | Full | HIGH |
| `OffscreenCanvas.getContext('2d')` | YES | YES | YES | YES | HIGH |
| `ctx.drawImage(OffscreenCanvas, 0, 0)` | YES | YES | YES | YES | HIGH |
| `createImageBitmap(canvas)` | YES | YES | Uncertain | YES | MEDIUM |
| `imageBitmap.close()` | YES | YES | YES | YES | HIGH |
| `ctx.fillText()` + `ctx.font = '16px X'` | YES | YES | YES | YES | HIGH |
| `ctx.measureText()` | YES | YES | YES | YES | HIGH |
| `new FontFace(name, arrayBuffer)` | YES | YES | Uncertain | YES | MEDIUM |
| `face.load()` | YES | YES | Uncertain | YES | MEDIUM |
| `self.fonts.add(face)` (WorkerGlobalScope) | YES | YES | Uncertain | YES | MEDIUM |
| `ctx.getImageData(0, 0, w, h)` | YES | YES | YES | YES | HIGH |

"Uncertain" = WebKit bug is fixed but WKWebView version data is sparse; implement with
try/catch and `'16px monospace'` fallback.

---

## 7. Sources

- MDN `FontFace` — https://developer.mozilla.org/en-US/docs/Web/API/FontFace — "Available in Web Workers. Baseline Widely available since January 2020."
- MDN `WorkerGlobalScope.fonts` — https://developer.mozilla.org/en-US/docs/Web/API/WorkerGlobalScope/fonts — "Baseline Widely available since September 2022."
- MDN `OffscreenCanvas.transferToImageBitmap()` — https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas/transferToImageBitmap — "Baseline Widely available since March 2023." Blanks the source canvas on call.
- MDN Canvas Optimizing — https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas — pre-render static content to offscreen canvas, `ctx.drawImage(offscreenCanvas)` pattern.
- WebKit bug 202793 (text rendering on OffscreenCanvas in Worker) — https://bugs.webkit.org/show_bug.cgi?id=202793 — FIXED 2021-04-02 (r275420).
- WebKit bug 224178 (FontFace in Workers for OffscreenCanvas) — https://bugs.webkit.org/show_bug.cgi?id=224178 — FIXED 2021-04-22 (r276450); described as "last major bug for feature-complete OffscreenCanvas."
- WHATWG HTML issue #7847 (OffscreenCanvasRenderingContext2D font setter) — https://github.com/whatwg/html/issues/7847 — relative CSS units undefined in Worker; absolute `px` required.
- Can I Use — OffscreenCanvas — https://caniuse.com/offscreencanvas — Safari 16.2 partial, Safari 17.0 full.
- Can I WebView — WKWebView — https://caniwebview.com/clients/wkwebview/ — OffscreenCanvas and FontFace listed as "support unknown" for WKWebView (macOS); iOS data sparse.
- Even Realities App Store — https://apps.apple.com/us/app/even-realities/id6747017725 — requires iOS 16.0+.
- `@fontsource/vt323` npm — https://www.npmjs.com/package/@fontsource/vt323 — version 5.2.7, OFL-1.1. Verified 2026-06-05.
- VT323 project — https://github.com/phoikoi/VT323 — DEC VT320 glyph origin, OFL-1.1, TTF available.
- int10h.org Oldschool PC Fonts — https://int10h.org/oldschool-pc-fonts/readme/ — Px437 / Bm437 in TTF/WOFF/FON/OTB, CC-BY-SA-4.0. No npm package.
- WebKit Safari 17.0 release notes — https://webkit.org/blog/14445/webkit-features-in-safari-17-0/ — OffscreenCanvas WebGL added in 17.0; 2D was Safari 16.4.

---

## 8. Confirmed Unchanged Stack (DO NOT RE-RESEARCH)

The following are locked from prior research and in-tree. Do not re-evaluate for v0.10.0.

| Technology | Version in tree | Status |
|---|---|---|
| `image-q` | 4.0.0 | Confirmed — dither pipeline unchanged |
| `upng-js` | 2.1.0 | Confirmed — 4-bit PNG encode unchanged |
| `xxhash-wasm` | 1.1.0 | Confirmed — delta hash (TODO-raster #2, deferred) |
| Vite | 8.x | Confirmed — handles `?url` and `?worker` imports |
| TypeScript | 5.8.3 strict | Confirmed |
| Vitest | 4.x + happy-dom | Confirmed |
| Biome | 2.x | Confirmed |
| pnpm | 10.33.4 | Confirmed |
| `@evenrealities/even_hub_sdk` | hand-typed d.ts | Confirmed — `updateImageRawData` is the push API |
