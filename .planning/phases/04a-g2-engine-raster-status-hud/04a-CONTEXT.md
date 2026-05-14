# Phase 4a: G2 Engine + Raster + Status HUD - Context

**Gathered:** 2026-05-14
**Status:** Ready for planning
**Mode:** Smart discuss (4 grey areas resolved via batch table, all "Accept all")

<domain>
## Phase Boundary

G2 boots, completes capability handshake, paints a persistent layered HUD with always-visible Status card (z=1), and renders the Foundry scene as a 4-bit dithered raster at z=0 (or auto-falls back to glyph view when BLE throughput is insufficient). End of Phase 4a: stable layer-manager API + working scene pixel pipeline. ADR-0009 ratifies the Layer Manager contract; ADR-0006 Branch A pipeline lands in code.

**Hardware-dependent success criteria** (raster ≥5 fps standard, BLE p50 latency envelope, Branch B/C auto-fallback under real BLE conditions) inherit `human_needed` gating per ADR-0005 PROVISIONAL closure. Software-side correctness is fully verifiable via Vitest + INV-1 snapshot fixtures.

**Out of scope** (Phase 4b+): overlay slot mounting rules at z=2, panel plugin system, R1 event routing, write path, multi-attack tracker. This phase reserves the API surface but does not consume z=2 itself.

</domain>

<decisions>
## Implementation Decisions

### Area 1: Layer Manager API

- **Registration signature**: `mount(z: ZIndex, layer: Layer)` where `Layer` is a plain TS interface `{ id; draw(): Promise<void>; destroy(): void; getCaptureContainer?: () => ContainerId }`. No virtual DOM — CLAUDE.md D-2.04 forbids React/Vue/Svelte in g2-app; render target is `EvenAppBridge` envelope calls.
- **z=0.5 ↔ z=2 transition**: Explicit `bundle([unmountIdleInfill(), mountOverlay()])` atomic API — single render flush per ADR-0001 amendment 2026-05-14 (no intermediate frame with both z=0.5 idle infill and z=2 overlay visible).
- **Capture-container assertion**: Layer manager **enforces** `isEventCapture=1` exists exactly on top-of-stack at every mount/unmount + unit-tests the invariant. Locks down INV-5 (Gesture Determinism, ratified in Phase 6 but binding here).
- **Capability gating**: Layer manager refuses to mount a layer whose required capabilities aren't in `SERVER_CAPS_V1` negotiated at handshake — returns typed error to caller (no silent degradation; INV-1 enforcement).

### Area 2: Raster Pipeline Orchestration

- **Worker topology**: Long-lived singleton Web Worker with `MessageChannel` request/response, owns `OffscreenCanvas` + `image-q` + `upng-js` + `xxhash-wasm` instances. Avoids per-frame GC churn (Specs §11.5.7 pitfall 9, ADR-0006).
- **Frame trigger**: Event-driven on Foundry canvas `update` hook + 200 ms debounce; idle 0.3 fps heartbeat per Specs §7.4b.6.1 Layer 6 adaptive frame rate.
- **Sub-tile delta granularity**: **32×32 px sub-tiles within each 200×100 image container** (6×3 grid = 18 sub-tiles per container; 4 containers × 18 = 72 sub-tiles per full frame). xxhash-wasm hash per sub-tile; custom RLE encodes only changed sub-tiles.
- **Branch A target commitment**: **≥5 fps standard** (single-token-move scenarios), **15 fps stretch** per Specs §7.4b.6.1 layered optimization stack. Both targets gated by Phase 0 PROVISIONAL Branch A measurements (ADR-0005 — `human_needed` SC on §10.0.3-9).

### Area 3: Status HUD Content + I18N Width Budget

- **MVP fields**: HP / AC / Speed / Conditions / Concentration (5 lines per Specs §7.4 ASCII mockup). Spell-slots, initiative, action-economy preview deferred to Phase 5 panel system.
- **Update cadence**: Reader-driven — subscribe to Phase 3 character/combat reader deltas via the WS envelope; redraw on delta with 200 ms debounce. Idle re-render every 30 s heartbeat for stale-state recovery.
- **I18N width budget strategy**: Pre-compute longest-string-per-field at **build time** across IT + EN + DE (3 locales for INV-1 snapshot fixtures ck11-15); reserve max-width column in the ASCII layout. CI gate: any new translation string exceeding budget fails the build (INV-1 enforcement).
- **Missing/loading data fallback**: Placeholder glyph `—` (em-dash) for missing data, preserves column width exactly; never collapses layout. Loading state: pulsing `…` only on first render before first delta arrives from the WS.

### Area 4: Branch B/C Glyph Fallback

- **Auto-fallback trigger**: BLE throughput probe at handshake (uses Phase 0 ADR-0005 measured envelope). If sustained <100 kbps → start in glyph mode; else Branch A raster. PROVISIONAL Branch A presumed via INV-2 lit-review until hardware test (§10.0.3 SC carries `human_needed`).
- **Glyph view layout source**: ASCII fixtures in `packages/shared-render/src/fixtures/glyph-scene.*.txt` mirroring map z=0; single character per token (`@` PC, `M` monster, `N` NPC, `o` object); cardinal facing arrows. Maintains INV-1 character-grid alignment.
- **User-visible mode indicator**: Bottom-right corner `[GLY]` badge in z=1 status HUD (3-char width, locked column); always visible while in fallback. Toggled off in raster mode.
- **Manual override**: Quick Action `[M] Map mode` lets player force raster ↔ glyph; persists per-device via Tier 4 hub kv. **Phase 4a reserves the API surface** (`layerManager.setMapMode('auto'|'raster'|'glyph')`); actual Quick Action wiring lands in Phase 4b/6.

### Claude's Discretion

- File layout within `packages/g2-app/src/{engine,raster,status-hud}/` is at Claude's discretion provided each module has clear single responsibility and follows CONVENTIONS.md.
- Internal Worker message protocol (between main thread and singleton raster Worker) is Claude's choice — must be typed via Zod schemas in `packages/shared-protocol/` if reused, or inline types if Worker-internal.
- Exact xxhash variant (xxhash3 vs xxhash64) — pick whichever wasm binding `xxhash-wasm@1.1.0` exposes by default; document the choice in ADR-0006 amendment.
- ADR number for the Layer Manager contract — proposed **ADR-0009** (next available after 0001-0008); if numbering collides, pick next free.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/g2-app/src/hub-polyfill.ts` — runtime shim mapping legacy `hub.*` calls onto `@evenrealities/even_hub_sdk@0.0.10` `EvenAppBridge` envelope methods (`createStartUpPageContainer`, `updateImageRawData`, `textContainerUpgrade`, `audioControl`, `imuControl`, `shutDownPageContainer`). Phase 4a engine + raster code calls EvenAppBridge directly; polyfill stays for legacy wizard code.
- `packages/g2-app/src/types/even-hub.d.ts` — canonical EvenAppBridge type declarations (mirrors SDK's `index.d.ts`); use as single source of truth for envelope shape.
- `packages/shared-render/` — already exports `AsciiGrid` + INV-1 `matchAsciiFixture` snapshot matcher (Phase 1). Phase 4a adds glyph-scene fixtures and status-HUD locale fixtures here.
- `packages/g2-app/src/wizard/` — Phase 2 reference for module structure (state.ts, i18n.ts, no-VDOM TS state management). Status HUD copies the same patterns.

### Established Patterns
- **No virtual DOM** (D-2.04, wizard/state.ts:4) — plain TS modules, observable state stores, render target is EvenAppBridge envelope calls.
- **TypeScript strict + 6 flags** (tsconfig.base.json) including `noUnusedLocals`, `noUnusedParameters`, `noUncheckedIndexedAccess`. AsciiGrid runtime guard for `row === undefined` is precedent.
- **Vitest 4 `test.projects` workspace** — Phase 4a tests live under `packages/g2-app/src/**/__tests__/` and `packages/shared-render/src/__tests__/`; root vitest aggregates via `--project` filter.
- **Biome 2.4.15** lint+format with `useBiomeIgnoreFolder` for design assets.
- **Conventional Commits** — scope must be one of `g2-app | bridge | foundry-module | shared-protocol | shared-render | validation-harness | foundry-mcp | *` (commitlint.config.js). Phase 4a commits use `g2-app` or `shared-render` scopes.
- **INV-3 atomic doc-coherence** — any Specs § change must update Specs.md + README.md + docs/showcase/index.html in the **same commit**. Phase 4a is unlikely to touch Specs.md but if so (e.g., §7.4 HUD field list refinement), must be atomic.

### Integration Points
- **Bridge WS handshake** — Phase 3 `packages/bridge/` exposes the WS endpoint with bearer auth + capability negotiation. Phase 4a's `capability-handshake.ts` is the **client** half.
- **Phase 3 readers** — character/combat/scene/log readers publish deltas over the WS envelope (`{proto, seq, ts, type, path, value}` per ADR-0002). Phase 4a subscribes for Status HUD updates.
- **EvenAppBridge** — single chokepoint for all G2 I/O. All Phase 4a writes (image data, text container updates, page lifecycle) go through this surface.

</code_context>

<specifics>
## Specific Ideas

- **Hardware-dependent SC carry `human_needed` gates** per ADR-0005 PROVISIONAL Branch A. Phase 4a's VERIFICATION.md must distinguish "software-verified" (Vitest + snapshot fixtures) vs "hardware-pending" (BLE throughput, real device fps measurement). The autonomous workflow will route `human_needed` outcomes through AskUserQuestion at post-execution.
- **OQ-INV2-1.a image API contract** — `updateImageRawData` is page-based declarative (not per-container imperative); pages are defined in `createStartUpPageContainer.data` / `rebuildPageContainer.data` (same struct). Raster pipeline targets this surface, not a synthetic `createImageContainer` (which does NOT exist on canonical Even Hub).
- **Hub polyfill** (already landed in commit c00397f) — kept intact; the new engine/raster code calls `EvenAppBridge` directly, bypassing the legacy `hub.*` shim. Polyfill exists for the Phase 2 wizard's pre-OQ-INV2-4 code.
- **`@evenrealities/even_hub_sdk@0.0.10` image dims**: w=20-288, h=20-144 (NOT 200×100 as Specs §3.1 originally said — Specs is flagged for v0.9.13 amendment). Phase 4a defaults to **200×100 effective tile** (within the 288×144 hardware budget) for the 4-image-container 2×2 layout = 400×200 effective; flagged in code comments for future tuning when v0.9.13 lands.

</specifics>

<deferred>
## Deferred Ideas

- **Overlay slot z=2 mounting rules** (modal-on-modal, death-saves + concentration-drop race) → Phase 4b.
- **Panel plugin system + 6-tab character sheet, combat tracker, log, inventory, spellbook** → Phase 5.
- **R1 gesture routing, Quick Action [M] Map mode wiring** → Phase 6 (Phase 4a reserves the `setMapMode()` API surface only).
- **Write path (`activity.use()` via socketlib executeAsGM, MidiQOL workflow, multi-attack tracker)** → Phase 7.
- **Advanced raster sub-tile tuning, custom DEFLATE dictionaries, alternative dither algorithms (Atkinson, Bayer)** → Phase 13 stretch.
- **Multi-locale fallback glyph sets, custom RLE per device VRAM, DSN-style raster stream** → Phase 13 stretch.
- **Battery-aware adaptive frame rate** (Layer 6 of §7.4b.6.1) — basic adaptive (idle 0.3 fps) lands in 4a; battery-trigger lands in Phase 10 polish.

</deferred>
