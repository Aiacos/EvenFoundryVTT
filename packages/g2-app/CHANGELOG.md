# @evf/g2-app

## 0.3.0

### Minor Changes

- 8566158: Canvas Inventory/Spellbook panels now mirror the Skills panel: a `▶` cursor
  windows the flat item/spell list (swipe-up/down moves it) and a TAP uses the
  highlighted item / casts the highlighted spell DIRECTLY via a `use-item` /
  `cast-spell` `tool.invoke` (boot-side `canvasItemDispatch` / `canvasSpellDispatch`),
  bypassing the Action-Options confirm modal. This fixes two bugs: the glyph
  scroll-offset renderer showed no cursor, and the modal path silently swallowed the
  dispatch for any item/spell with `requiresTarget` (no canvas target picker).
  Targeting is resolved Foundry-side by `activity.use()`; per-actor write authz
  (ADR-0014) is unchanged. Shared cursor-windowing (`windowCursorRows` /
  `clampCursorIndex`) is extracted into `canvas-selectable-list.ts` and reused by the
  Skills panel (DRY).
- f076fc6: Canvas Inventory/Spellbook taps now open the glasses-native **TargetPicker** when
  the tapped weapon/spell needs a target, instead of always dispatching with
  `targets: []` (which made MidiQOL fire "at nothing"). `resolveRequest` now derives
  `requiresTarget` from the same heuristic the glyph panels use — spells with a real
  range that are not reactions, and inventory items that are not consumables. The
  boot-side `canvasItemDispatch` / `canvasSpellDispatch` branch on that flag: when a
  target is required they open the new `CanvasTargetPickerPanel` (z=2 overlay,
  combatants-only MVP) built from a cached `CombatSnapshot` (boot subscribes to
  `combat.turn` / `combat.state` on the stable `wsEventBus`); the picker appends
  `targets: [chosen]` to the `tool.invoke`. Self/area/reaction spells and consumables
  still dispatch directly. Inventory **weapons** route to the `weapon-attack` tool (whose
  MidiQOL branch forwards the picked target as `targetUuids`, so the attack actually hits);
  non-weapon items keep `use-item` (which ignores targets) and dispatch directly. The
  existing glyph `TargetPickerPanel` renders to a TEXT
  container (`{image:0,text:1}`) and trips LayerManager's canvas container-budget
  assertion in canvas mode, so a canvas-rendered picker (`{0,0}`, paints to the shared
  compositor) was added, reusing `resolveValidTargets` + `describeTargetRow`. Per-actor
  write authz (ADR-0014) is unchanged.
- 8c4c5e3: Feature 001 — Foundry-to-G2 HUD UX slice:

  - **Direct-link connection** — one canonical connection profile to the bridge; removed the
    implicit `localhost:8910` default (the on-phone "unreachable bridge" bug). `bridgeUrl` is
    persisted; the bearer token stays in memory and is re-acquired by the wizard (T-02-01 upheld).
  - **Unified view selection** — the map-view mode dropdown is removed; the roster selector gains a
    synthetic "Party" entry (→ streaming overview), a PC → actor (owner-elected). Pure
    `toPlayerViewRequest` mapping; `client_player_view` wire shape unchanged (shared-protocol doc only).
  - **D&D-styled sheet + shared icon dictionary** — new `icon-dictionary` as the single source for
    glyph + canvas paths (consolidates item-type / proficiency / spell-slot / vitals glyphs,
    byte-identical → INV-1 fixtures unchanged); double-ruled canvas frame + corner brackets; Main-tab
    vitals drawn as icons.
  - **Composited FPS badge** — FPS split into its own small corner widget via `EVF_FPS_CORNER`
    (build-time `VITE_EVF_FPS_CORNER`, default bottom-right); yields below the status card on overlap.

- 2d5a35b: HUD render completeness + character selection end-to-end (real-pairing session).

  Four improvements shipped in tasks e9t, etr, f9s, and flv:

  - `createWsEventBus` refactored to a single persistent listener with per-channel last-value
    replay: `subscribe()` synchronously delivers the cached payload before registering for
    futures, and the bus is created at step 5a (before the handshake) so the bridge's
    on-connect `character.delta` is never dropped (e9t). LIVE SIM VERIFIED: first render of
    real character data on connect (Artemis · PF 55/88 · CA 18) with no post-connect push.
  - `writeHeaderChrome` + `writeFooterChrome` in `engine/hud-chrome.ts` populate the header
    and footer containers after the bundle flush, replacing the SDK "Text" placeholder with
    the canonical Specs §7.4 content (etr). INV-1 zero fixture drift.
  - `finalizeIdleRender(idleInfill, mapBase)` extracted in boot-engine-core and called at
    step 13: `idleInfill.draw()` + `mapBase.draw()` (with raster+no-scene writing an
    empty-string `textContainerUpgrade` to clear `map-capture`) erase the last SDK "Text"
    placeholders from the idle display (f9s). Full clean HUD verified in simulator.
  - `BootEngineOpts.characterId` threaded into `performCapabilityHandshake` as `actorId`;
    `launchApp` resolves `?actor=<id>` URL override > Tier3 `session.characterId` > undefined
    so the chosen PC is delivered to the bridge on connect (flv). LIVE SIM VERIFIED: loading
    `?actor=6KWxQXAiJgz4zKlS` (Dante) rendered "Dante Lanzu… · PF 41/63" on the glasses.

  No new dependencies. INV-1 zero fixture drift across all four tasks.

- e17065e: Layout B — full-screen 576×288 map: 4 image tiles of 288×144 (SDK verbatim max, INV-2 drift corrected from 200×100) cover the entire G2 display; the extractor emits 576×288 frames; status/fps move into a translucent raster corner card (top-right) drawn over the map; the native hud-status container is removed (the host renders image containers over text).
- 2895613: The Quick Action menu now opens on a TAP from the base view (map / status-HUD),
  replacing the swipe-up over-scroll trigger (ADR-0012 Amendment 2). A tap is gated
  on the LayerManager z=2 overlay slot being empty, so it opens the menu ONLY from
  the base view; inside a panel a tap stays the panel's own action (activate the
  cursor entry in Inventario/Libro, cycle the tab in the sheet, confirm in a modal).
  Checking the z=2 slot (not just PanelRouter state) also covers overlays mounted
  directly on the LayerManager (concentration-drop modal), removing the old
  over-scroll modal-replacement/state-loss edge. `quick-action-tap-dispatcher.ts`
  replaces `quick-action-overscroll-dispatcher.ts`.
- a823240: Phase-8 write channel + skill-check tool, end-to-end.

  The bridge could receive `tool.invoke` envelopes but had no way to execute write
  tools in Foundry (it cannot use socketlib; the only bridge↔Foundry channel was the
  one-way module → `/internal/delta` POST). This adds a poll-based REVERSE channel that
  mirrors the player-view stream-request pattern:

  - **bridge**: a new in-memory `ToolInvocationQueue` (`enqueue`/`drainPending`/`resolveResult`
    with a 10s `foundry_timeout`) and two internal-secret-guarded, rate-limit-exempt
    routes — `GET /internal/tool-requests` (drain pending) and `POST /internal/tool-result`
    (resolve the awaiting promise). The production WS dispatch now enqueues on this queue
    (the test override is preserved).
  - **foundry-module**: a GM-gated `tool-invocation-poller` (≈1s cadence, fault-tolerant)
    polls the bridge, dispatches each write, and POSTs the result back. The ADR-0014
    per-actor write authorization was extracted into a single shared
    `dispatchToolAuthorized` used by BOTH the socketlib adapter and the new poller, so
    both channels enforce identical authorization. No new socketlib handler is added
    (the `socket.register` count stays 17).
  - **skill-check tool**: new `skill-check` write tool — `actor.rollSkill({ skill,
advantage, disadvantage })` (dnd5e 5.x config-object API). Added to the shared
    `TOOL_ID_SCHEMA`, the module `ToolId`/`TOOL_HANDLER_IDS`, and a new handler.
  - **g2-app**: a new interactive canvas Skills panel (Quick Action `[K]`) that, on tap,
    dispatches a `skill-check` `tool.invoke` directly (no ActionOptions modal), plus the
    `[K]` menu item, icon, and `quick_item_skills` i18n key (IT/EN/DE).

### Patch Changes

- ba2c68a: dev-only debug/control harness — /debug/agent control channel + g2-app agent driving the wizard
- 337584d: feat(dev): DEV-ONLY no-token mode — skip the wizard access-token step + bridge bearer bypass

  A flag-gated developer convenience so the pairing flow can be exercised without a
  real bearer token (and without Foundry).

  - **bridge** (`EVF_DEV_NO_AUTH=true`, honored only when `NODE_ENV !== 'production'`,
    with the same prod double-opt-in as the debug harness): `TokenCache.validate`
    short-circuits to a synthetic 24h dev session, an `onRequest` hook injects a
    sentinel bearer for token-less requests so per-route 401 guards pass, CORS reflects
    any origin (so a local Vite/simulator can reach it), and `GET /v1/characters`
    serves a small mock roster when no Foundry world is connected.
  - **g2-app** (`VITE_EVF_NO_AUTH=true`): the wizard skips Step 2 (token entry) —
    Step 1 advances straight to Step 3 — and `VITE_EVF_DEV_BRIDGE_URL`
    (default `http://localhost:8910` when no-auth is on) pre-fills the bridge URL so the
    tester never types it. Gated on the explicit flag (NOT `import.meta.env.DEV`) so
    Vitest keeps exercising the real token flow; absent in production builds.

- 49116ce: HudDeltaDriver: trailing-edge re-arm throttle — delivered HUD fps ~17 → ≥25 under continuous frame input (period = max(interval, cycleTime)).
- 381858e: Add on-glasses HUD dither toggle (`[D] Dither` menu item in Quick Action menu).

  Users can now switch between Bayer 4×4 ordered-dither (ON, default — smooth gradients) and direct nearest-of-16-level quantization (OFF — crisper/blockier) without a rebuild. The choice persists across reboots via the Even Hub kv store (`view.hud.dither`). The flag is honored by both the Worker tile-build path and the synchronous fallback (byte-identical per mode).

- a705477: Canvas-mode full-screen streamed map + hud-status native container (quick-task 260610-d42)

  - canvas-extractor: continuous ~1Hz interval capture + canvasPan hook replaces one-shot request model
  - MapCanvasLayer at z=0: full-screen Foundry viewport stream routed from scene-input in canvas mode, replacing the legacy RasterController scene path
  - hud-status native G2 text container (id=5): status line (PF/CA/LV) pushed via bridge.textContainerUpgrade on each character.delta; opaque full-frame fill removed so z=0 map shows through
  - canvas-mode root double-tap exit restored: root-exit-dispatcher now fires on getTopLayer()===null (both canvas and glyph modes)

- 452293b: Fix canvas-mode crash when activating an item/spell from the interactive
  Inventario/Libro panels (Feature 001 Option B). Tapping an entry pushed the
  glyph `ActionOptionsModal` (a native text container), which violates the
  canvas-layer contract (`{ image: 0, text: 0 }`, ADR-0013 Amendment 1) and threw
  `canvas mode: layer 'action-options-modal' declared non-zero container count`,
  falling back to the map. Added `CanvasActionOptionsModal` — a canvas-composited
  subclass that reuses the parent's gesture + `tool.invoke` envelope logic verbatim
  and only swaps the rendering surface (compact centred box, `draw()` no-op,
  `getContainerCount()` → `{ image: 0, text: 0 }`). Wired both `canvasItemDispatch`
  and `canvasSpellDispatch` in boot-engine-core to the new modal.
- 748d304: Fix doubled/overlapping canvas status-HUD header. Two causes: (CHROME-01) `writeHeaderChrome`/`writeFooterChrome` ran unconditionally in canvas mode, writing glyph chrome into the `hud-capture` text container (id=4) — now guarded behind `getRenderMode() !== 'canvas'`; (FIX-DD-01) `CanvasStatusHudLayer._drawDynamic` used hardcoded x-offsets that overlapped at VT323 16px — now positioned dynamically via `ctx.measureText`. Adds regression tests. Verified clean in the EvenHub simulator: header renders `PF 41/63 CA 18 LV 10` as a single non-overlapping line.
- 18c3d92: fix(engine): derive the bridge WebSocket connect URL from the REST base URL

  `bootEngine` opened `new WebSocket(opts.bridgeUrl)` against the raw REST base
  (e.g. `https://host:443`) — wrong scheme, no `/ws` path — so the WebSocket never
  connected and the engine threw at step 5 ("[EVF] launch: bootEngine failed"),
  leaving the glasses black.

  Added a pure, unit-tested `toWsConnectUrl(baseUrl)` helper
  (`engine/ws-url.ts`): `http→ws` / `https→wss`, trailing slashes stripped, `/ws`
  appended, idempotent for already-`ws`-scheme and already-`/ws` inputs. Both
  WS-open sites in `boot-engine-core.ts` (initial connect + the
  `WsReconnectController` url) now route through it. `opts.bridgeUrl` stays the
  REST base URL contract; the displayop and audio consumers keep using it as the
  HTTP(S) base unchanged.

- edae764: Fix the scene-frame pipeline dimension contradiction that made every `frame_pixels` payload un-processable: `FramePixelsSchema` capped frames at 288×144 (pre-ADR-0013 SDK-polyfill bound) while `raster-worker.ts` rejects anything that is not the canonical 400×200 raster region. Schema bounds now admit 20–400 × 20–200; `canvas-extractor` always emits exactly 400×200 (center-crop + opaque-black letterbox, pure byte copy); `scene-input` center-pads undersized frames to the canonical region as consumer-side defence. Live-sim verified: a real 400×200 scene frame now dithers and renders on the glasses end-to-end.
- 7164293: fix(g2-app): G2 spec compliance — capture containers carry content single-space; glyph status-view page gains exactly-one capture target (status-hud)
- 96d2022: Add frame_png wire format (greyscale lossless PNG ~1-5KB vs 427KB RGBA) for the map stream: new FramePngSchema in shared-protocol, DM-configurable captureIntervalMs + leading+trailing hook throttle + identical-frame hash-skip + PNG encode in foundry-module v0.1.15, frame_png decode in g2-app (frame_pixels back-compat retained).
- a6c8fc8: Latency-audit follow-up: residual fps fixes + map brightness + bidirectional display-settings sync.

  **Performance (residual latency removed):**

  - foundry-module: the capture loop no longer awaits the native encode — `runEncodeJob` is fire-and-forget behind the single-flight latest-wins queue, so the loop re-arms after acquire+process only (the encode genuinely overlaps the next capture). Raises the producer ceiling well past 30 fps.
  - foundry-module: lossy WebP wire format via `OffscreenCanvas.convertToBlob` (new `mapWebpQuality` world setting, default 75) — ~4–7× smaller than PNG, cutting the per-hop bandwidth from ~22 to ~4 Mbit/s at 30 fps. Transparent PNG fallback on hosts without WebP encoding.
  - foundry-module: the `/internal/delta` frame POST is now single-flight latest-wins with a 5 s `AbortSignal.timeout`, so a slow WAN can no longer accumulate unbounded in-flight requests.
  - bridge: frame deltas (`frame_png`/`frame_pixels`/`frame_stats`) are excluded from the replay buffer (no ~160 MB/session growth, no stale-frame replay burst on reconnect) and reuse the current seq (gap detection stays correct). Per-session `bufferedAmount` backpressure drops frames for a saturated client instead of queuing unbounded.
  - g2-app: the HudDeltaDriver throttle (33 ms ≈ 30 fps cap) is now configurable per boot via `BootEngineOpts.hudMinIntervalMs` / `?hudms=` for lab tuning.

  **Map brightness:** new `mapBrightness` client setting (−100..+100 luma gain) applied module-side before the 16-level quantize, with on-glasses `[+]`/`[-]` Quick Action menu rows.

  **Bidirectional display-settings sync:** the five map settings (dither, brightness, WebP quality, capture fps, contrast-normalize) stay in sync between Foundry and the glasses and are controllable from both. Downstream over a new `settings.display` delta (cached by the bridge, pushed on connect); upstream over a `client_setting` WS message that the bridge piggybacks on the module's next frame-POST response (no new connection / no polling — the module is push-only). New `@evf/shared-protocol` payload `settings-display.ts`.

- df66691: fix(pairing): install via Even Hub + paste token (remove unrealizable QR-scan path)

  The previous design assumed the player would scan the Foundry PairModal QR with the Even
  Realities app. This is impossible: the Even Hub platform exposes no camera / QR-scan API to
  apps (canonical `hub.evenrealities.com/docs/guides/device-apis`: "no camera (there is none)"),
  the app runs in the phone WebView, and the PairModal hid the token from text so the DM could
  not hand it over either.

  Real flow: install the EVF app via Even Hub (dev `evenhub qr` loads the plugin-host URL into
  the Even app; prod `.ehpk` → portal review → store), then open the app → wizard → enter the
  bridge URL + **paste** the token shown in the Foundry PairModal → pick a character.

  - `@evf/foundry-module` PairModal: removed QR generation (dropped the `qrcode` dependency),
    now renders the bridge URL + bearer token as copyable text. The token is masked by default
    with a Reveal/Copy control (scoped security relaxation — pairing is otherwise impossible).
    i18n realigned: removed `evf.pair.qr.scan_instruction`, added `evf.pair.copy.*` (IT + EN).
  - `@evf/g2-app` wizard step 2: removed the dead QR-scan path (`hub.camera`, `_probeCameraApi`,
    `evf.wizard.step2.scan_qr_btn`) per INV-4; the `hub.camera` type and polyfill field are gone.
    Paste-from-clipboard + manual entry + the `/v1/health` connect check are unchanged.

- 3327b77: Fix blank glasses render: address every G2 container by its numeric `containerID` and give text containers geometry. A single shared container registry (`engine/container-registry.ts`) is now the only place container ids + pixel geometry live; the boot/main page schema and `LayerManager._flushPage` rebuild the canonical 11-container base schema from it (ids 0-10, text geometry, one isEventCapture=1), and every `textContainerUpgrade` / `updateImageRawData` site threads the registry-resolved `containerID`. Also repairs `_flushPage` which previously emitted an empty page that wiped all containers after boot.
- 5842195: Wire production launch glue: index.html now boots the HUD engine (no-auth dev fallback for the simulator; wizard fallback when unpaired; completion→engine handoff).
- Updated dependencies [b385bf8]
- Updated dependencies [8c4c5e3]
- Updated dependencies [edae764]
- Updated dependencies [96d2022]
- Updated dependencies [2d5a35b]
- Updated dependencies [a6c8fc8]
- Updated dependencies [e17065e]
- Updated dependencies [a823240]
- Updated dependencies [0038f94]
  - @evf/shared-protocol@0.3.0

## 0.2.2

### Patch Changes

- e11cf2c: Dev/deploy ergonomics for on-glasses testing and the permanent-install (Even Hub submission) path.

  - `pnpm --filter @evf/g2-app dev` now binds `--host 0.0.0.0 --port 5173` so the Even app can reach
    the dev server over the LAN (scan the `dev:qr` QR → dev mode, no trial expiry).
  - Turnkey HTTPS deploy: `deploy/Caddyfile` + `deploy/docker-compose.https.yml` (Caddy reverse
    proxy with auto Let's Encrypt — fronts the bridge + serves the g2-app plugin host), and
    `deploy/sync-app-whitelist.mjs` to fill `app.json`'s network whitelist from `deploy/.env`.
    Documented in `docs/release/evenhub.md` (incl. Cloudflare/Tailscale tunnel alternatives for
    homelabs without a public IP).

- be05f4b: Fix the phone-setup wizard showing raw i18n key names (e.g. `evf.wizard.step1.title`) instead
  of labels. The wizard fetched all strings from the bridge (`/v1/i18n/{lang}`), but Step 1 is
  where you enter the bridge URL — so there is no bridge to fetch from yet (chicken-and-egg), and
  the catalog also never defined the wizard keys. Adds a bundled IT/EN wizard catalog
  (`wizard/i18n-catalog.ts`, all 44 keys) used as the base, with the bridge catalog merged on top
  when connected. Every wizard step is now readable with no bridge.

## 0.2.1

### Patch Changes

- cf4330d: Add an Even Hub-compatible app icon and a `description` to the plugin manifest, and document the
  dev-mode test flow (fixing the "trial version expired" trap).

  - `app.json` now carries `description` + `icon` (`icon.png`), bundled into the `.ehpk` (the Even
    Hub `pack` accepts both fields). The icon is a greyscale d20 (Even Hub requires monochrome
    foreground + background), regenerable via `assets/generate-icon.py`; the same icon is reused as
    the Docker image / Compose icon (OCI label).
  - New scripts: `pack:ehpk` (fresh build + pack) and `dev:qr` (`evenhub qr` for on-device dev mode
    with hot reload — the no-expiry path; `.ehpk` portal trials expire). Documented in README, the
    Even Hub runbook, and the wiki (`docs/wiki/Testing-and-Distribution.md`).

## 0.2.0

### Minor Changes

- 36aea7f: Retire the `long-press` R1 gesture (ADR-0012; GEST-01 / EXIT-01 / LIFE-01).

  Canonical Even Realities docs (`guides/input-events`, INV-2 re-verified 2026-05-31)
  confirm the complete hardware gesture set is **press / double-press / swipe-up /
  swipe-down only** — there is no long-press / duration-based input.

  - **GEST-01** — `long-press` removed from the wire enum (`R1GesturePayloadSchema`), the
    bridge gesture surface, the internal `R1Gesture` union, all 12 panels, the status-HUD
    hint chip (token `long=` → `qa=`, field `longPressLabel` → `quickActionLabel`), i18n
    keys, and tests. The Quick-Action menu now opens via **over-scroll** (swipe-up at the
    focused layer's top boundary) — new `Layer.isAtTopBoundary()` + the renamed
    `quick-action-overscroll-dispatcher`. Per-panel context actions remapped:
    `inventory`/`spellbook` Action Options → `tap`; `template-placement` cancel → `double-tap`.
  - **EXIT-01 / LIFE-03** — new `root-exit-dispatcher`: a `double-tap` on the bare map root
    calls `bridge.shutDownPageContainer(1)` (Mode 1 graceful exit dialog), satisfying the
    Even Hub app-submission requirement.
  - **LIFE-01** — INV-2 verification of the SDK lifecycle surface (`OsEventTypeList` 4/5/6 +
    `shutDownPageContainer`) documented in ADR-0012.

  `Specs.md` §3.2/§7.13a/§7.14.x + ASCII mockups (INV-1), `README.md`, and the showcase were
  updated atomically (INV-3).

### Patch Changes

- 722d63e: Emit the Vite HTML entry at the dist root (`dist/index.html`) via `root: 'src'` +
  `outDir: '../dist'`, and restore the Even Hub manifest `entrypoint` to the canonical
  `index.html`. This supersedes the earlier `src/index.html` band-aid (which leaked
  Vite's source path into the published manifest) and re-aligns `app.json` with the
  documented entrypoint in `docs/release/evenhub.md`, `.planning/REQUIREMENTS.md`
  (DIST-EHUB-01) and `Specs.md`. Verified: `evenhub pack` succeeds against
  `dist/index.html`.
- Updated dependencies [36aea7f]
  - @evf/shared-protocol@0.2.0
  - @evf/shared-render@0.1.1

## 0.1.1

### Patch Changes

- cfc02e5: Fix `app.json` `entrypoint` to `src/index.html` — Vite emits the entry at
  `dist/src/index.html`, so the Even Hub `pack` step now resolves it correctly
  (verified: `Successfully packed ... (99940 bytes)`).
- 83d0c0c: Add Even Hub manifest (`app.json`) for the g2-app plugin + CI packaging pipeline
  (`evenhub-pack.yml`) that builds and packs a submission-ready `.ehpk` on every merge
  to main. Closes DIST-EHUB-01 (portal submission remains manual — Even Hub has no
  non-interactive CI submit). See `docs/release/evenhub.md`.

## 0.1.0

### Minor Changes

- 40d3a52: Quick Task 260529-h5e — Debug Console (Waves 1-4: shared-protocol schemas + bridge backend + CRT dashboard + g2-app display-op mirror)

  Dev-only, gated observability + command system for the bridge.

  **@evf/shared-protocol (Wave 1):**

  - Add lean debug-console schemas under `src/debug/debug-events.ts`: `DebugEventSchema`,
    `DisplayOpPayloadSchema` (+ `R1_DEBUG_DISPLAYOP_TYPE`), `DebugInjectBodySchema`,
    `DebugDispatchBodySchema` (optional UUID `idempotencyKey`), `DebugGestureBodySchema`
    (reuses the canonical 5 R1 gesture kinds). All re-exported from the package barrel.

  **@evf/bridge (Wave 2):**

  - `isDebugEnabled()` existence gate (prod-safe double opt-in via `EVF_DEBUG` +
    `EVF_DEBUG_ALLOW_PROD`); when off, `/debug/*` routes are never registered (genuine 404).
  - `DebugEventBus` bounded ring buffer (push/query/subscribe/clear) with STRUCTURAL token
    redaction (scrubs known session tokens + token-shaped fields in summaries and nested payloads).
  - `registerDebugRoutes()` — 7 secret-gated endpoints (`/debug/state|events|inject|dispatch-tool|
simulate-gesture|displayop` + WS `/debug/stream`). `requireSecret` mirrors the timing-safe
    `secretsEqual` from `internal-delta.ts`. `/debug/dispatch-tool` routes through the SAME injected
    `dispatchToolFn` (ADR-0011 — no `activity.use` in the bridge; socketlib handler count unchanged)
    and generates a FRESH uuid per call when `idempotencyKey` is omitted.
  - Additive `DeltaEmitter.onEmit?` hook (default undefined = zero overhead) + gated WS inbound tap
    (`makeInboundTap`, no work per message when disabled). `SessionStore.listSessions()` added for
    the redacted snapshot.

  **@evf/bridge (Wave 3):**

  - Single-file phosphor-green CRT debug console dashboard, inlined as a TS string constant
    (`dashboard.ts`) so it survives the tsup bundle with no runtime asset resolution. Served at
    `GET /debug/console` (+ `/debug` alias), secret-gated: 200 `text/html` when enabled+authed,
    401 on bad secret, 404 when debug disabled. Live WS `/debug/stream` feed with direction/type/
    session filters, `/debug/state` poll panel, and inject/dispatch-tool/simulate-gesture forms.

  **@evf/g2-app (Wave 4):**

  - `DebugMirror` (`src/engine/debug-mirror.ts`) copies the PerfProbe zero-overhead pattern:
    `record()` is a hard no-op when disabled (no allocations, sink never called); when enabled it
    stamps `ts` and POSTs a `DisplayOpPayload` to the bridge `/debug/displayop` sink.
  - `LayerManager` gains an optional injected `debugMirror?` (default undefined ⇒ byte-identical to
    prior behavior — all existing tests pass unchanged). When present it records `mount`/`destroy`
    ops during a bundle and a `rebuild` (z-stack summary + container count) after `_flushPage()`.
  - Boot wiring (`boot-engine-core.ts`) constructs the mirror enabled ONLY under `?debug=true`
    (parallel to the perf-probe `?probe=true` opt-in); default off. The mirror POSTs to a debug HTTP
    endpoint — it never calls `activity.use` and adds no socketlib handler (ADR-0011; Gate 8 = 17).
    The live "what the glasses show" feed is hardware-deferred; software tests mock the POST sink.

- 5e53f98: Phase 4a: G2 Engine + Raster + Status HUD — layer manager, raster pipeline (image-q + upng-js + xxhash-wasm + OffscreenCanvas Web Worker singleton), Status HUD z=1 with IT/EN/DE width budgets, glyph fallback, 9 INV-1 ASCII fixtures.

### Patch Changes

- 4d49f90: Fix 3 G2 SDK-conformance findings: portrait image-tile target (CRITICAL), audio-stream WS bearer auth for WKWebView (IMPORTANT), and R1 wire-kind provenance comment (INV-2).

  **B1 — CRITICAL (g2-app):** Portrait override in `map-base-layer.ts` was targeting `'map-capture'` (the TEXT capture container) with a non-existent `index` field hidden behind an `as unknown as` cast. Fixed to use a typed `ImageRawDataUpdate({ containerName: 'map-tile-${slot}', imageData: bytes })` targeting the correct IMAGE tile container, and check `ImageRawDataUpdateResult.isSuccess(result)` with a `console.warn` on failure. INV-4 cast removed.

  **B2 — IMPORTANT production bug (g2-app + bridge):** Browser/WKWebView WebSocket ignores the `headers` option — the bearer was silently dropped in production, causing close 1008 on every audio-stream WS upgrade. Fixed both sides: `audio-capture.ts` appends `?token=<encoded>` to the WS URL (with the Authorization header retained for the Node-ws test path); `audio-stream-route.ts` reads `?token=` as a header fallback, routing both through the same `tokenCache.validate` gate. Token is never logged. New test ASR-09 asserts query-param auth succeeds without an Authorization header.

  **B3 — INV-2 doc drift (g2-app):** `r1-event-source.ts` comment incorrectly attributed wire kinds to "flat string enums from the Even Hub SDK". Corrected to state they are the bridge's server-side-normalized strings mapped from `OsEventTypeList` + `EventSourceType.TOUCH_EVENT_FROM_RING`. Comment-only change.

- f44b008: Quick-task 260529-g0j: three source-verified write-path/dispatcher hardening fixes.

  - **FIX D** (`tool-registry.ts` `dispatchTool`): close the in-flight idempotency race. A module-scoped `Map<cacheKey, Promise<ToolResult>>` collapses truly-concurrent duplicate calls (same bearer + idempotencyKey, both cache-misses) to ONE `handler.handle`, ONE `moduleIdempotencyStore.set`, and ONE audit-log write; the second caller awaits the shared promise and receives the identical result. The entry is deleted in a `finally`, so only OVERLAPPING calls are deduped — a later sequential retry re-runs (preserving WR-01: failures are not cached and stay retryable). Cache-hit short-circuit and always-resolves-never-rejects semantics unchanged.
  - **FIX E** (`combat-movement-tracker.ts`): add a `deleteCombat` hook that clears `_state` + `_lastPosition` so stale `usedThisTurn` from an ended encounter cannot leak into a freshly created combat before its first turn-advance. Mirrors the existing defensive try/catch/never-return-false pattern; the unsubscribe closure now also `Hooks.off`s the deleteCombat hook.
  - **FIX F** (`reaction-prompt-dispatcher.ts` `handleClose`): add an early-return idempotency guard (`if (mountedPanel === null) return;`) so a late gesture after the 5s auto-timeout does not issue a redundant second destroy bundle. Mirrors the auto-timeout's existing `mountedPanel !== null` gate.

- c80d16f: Quick-task 260529-khy: codebase-review fixes — Tier 1 (R1/R2/R3) + Tier 3 hardening.

  **Wave 1 — R1 FULL WebSocket reconnect rewire (CRITICAL, g2-app):**
  After a WS reconnect, ALL functionality recovers (display + input + outbound
  action dispatch) AND repeated reconnects work.

  - BLOCKER 1 — repeated-reconnect close re-arm (`ws-reconnect.ts`): the controller
    tracks `currentWs` and re-arms its `'close'` listener on the new socket after each
    successful reconnect, so a second/third disconnect is detected (previously reconnect
    worked exactly once → permanent dark on the next drop). `dispose()` removes the
    listener from `currentWs`, not the original socket.
  - BLOCKER 2 — outbound + missed inbound (`ws-sender.ts`, `status-hud-layer.ts`,
    `boot-engine-core.ts`): new `WsSender` holder gives panels/probes a stable
    outbound-socket indirection (`send`/`swap`) structurally assignable to the narrow
    panel `{send}` interfaces, so a reconnect's `holder.swap(newWs)` redirects every
    outbound sender (perfProbe + SlotPicker + both ActionOptionsModal) with no panel
    churn. A new optional `onReconnected(newWs)` controller callback fires after resume
    (before chip-unmount on both resume paths); the boot handler swaps the holder +
    disposes-and-re-attaches all 7 inbound listeners against the live socket — including
    reaction-prompt + portrait (the two sources missed in the first rewire) — plus
    `StatusHudLayer.rebindWsEvents` for the 3 HUD channels.

  **Wave 2 — Tier 1 robustness:**

  - R2 (g2-app `raster-controller.ts`): a fatal worker error now settles ALL pending
    frames (and a debounced `pendingPayload`) with the existing `RasterResponse.error`
    shape, clears the map and logs — previously a worker crash left awaiting callers
    parked forever.
  - R3 (foundry-module `combat-action-tracker.ts`): subscribe `deleteCombat` (mirroring
    combat-movement-tracker FIX E) to clear `_state` + `_attackIdSeen` on combat removal;
    unsubscribe closure offs the new hook id. (Hooks.on, not a socketlib handler — CI
    Gate 8 socketlib count stays 17.)

  **Wave 3 — Tier 3 hardening:**

  - R-longpress (g2-app spellbook + inventory panels): long-press now resolves the item
    under the cursor ROW via a header-aware row→item map instead of indexing the flat
    array with the content-row scroll offset (which dispatched the wrong item after
    scrolling past a section header).
  - shared-protocol schema bounds: `d20` → `int().min(1).max(20).nullable()`; debug-events
    `id` `.min(1)`, `ts` (+ perf-sample) and layer-index `z` `.int()`.
  - foundry-mcp `spell-lookup.ts`: relocate mass-cure-wounds (level 5) into a dedicated L5
    grouping + fix block-count comments (SPELL_LOOKUP length stays 70, SKT-02 gate).
  - foundry-mcp `bridge-client.ts`: snapshot getters pass `null` default to `_restGet`
    (network failure → null, not undefined); `ws.onclose` early-returns on a pre-handshake
    close so it does not fall through to the 4001 / other-close branches.
  - foundry-module `character-reader.ts`: spell `range.value === 0` with a non-self/touch
    unit renders `--` (not `0m`).
  - validation-harness `inv-suite.ts`: INV-5 returns `skipped` (not green) when the COR-
    vitest run exits 0 with no matching tests ("no test files found").

  Backward compatible: `onReconnected` is optional; `WsSender`, `rebindWsEvents`,
  `worker.onerror`, the deleteCombat hook and the row→item maps are all additive; schema
  tightenings reject only previously-invalid values; the bridge-client null default makes
  the `… | null` return type honest.

- Updated dependencies [498c01f]
- Updated dependencies [0eaa5aa]
- Updated dependencies [7f5d0d1]
- Updated dependencies [a05f35e]
- Updated dependencies [6959c54]
- Updated dependencies [40d3a52]
- Updated dependencies [5e53f98]
- Updated dependencies [c80d16f]
  - @evf/shared-protocol@0.1.0
  - @evf/shared-render@0.1.0
