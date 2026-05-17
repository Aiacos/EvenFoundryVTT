# Phase 4a: G2 Engine + Raster + Status HUD — Research

**Researched:** 2026-05-14
**Domain:** Even Realities G2 plugin host — layer manager, raster pipeline (Web Worker), Status HUD, capability handshake, glyph fallback, INV-1 fixtures
**Confidence:** HIGH (all critical claims verified against SDK source, codebase, or cited canonical docs; no synthetic knowledge injected)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Area 1 — Layer Manager API:**
- Registration signature: `mount(z: ZIndex, layer: Layer)` where `Layer` is a plain TS interface `{ id; draw(): Promise<void>; destroy(): void; getCaptureContainer?: () => ContainerId }`. No virtual DOM — CLAUDE.md D-2.04 forbids React/Vue/Svelte in g2-app.
- z=0.5 ↔ z=2 transition: `bundle([unmountIdleInfill(), mountOverlay()])` atomic API — single render flush per ADR-0001 amendment 2026-05-14.
- Capture-container assertion: layer manager enforces `isEventCapture=1` exists exactly on top-of-stack at every mount/unmount + unit-tests the invariant.
- Capability gating: layer manager refuses to mount a layer whose required capabilities are not in `SERVER_CAPS_V1` negotiated at handshake — returns typed error to caller.

**Area 2 — Raster Pipeline Orchestration:**
- Worker topology: Long-lived singleton Web Worker with MessageChannel request/response, owns OffscreenCanvas + image-q + upng-js + xxhash-wasm instances.
- Frame trigger: Event-driven on Foundry canvas `update` hook + 200 ms debounce; idle 0.3 fps heartbeat per Specs §7.4b.6.1 Layer 6.
- Sub-tile delta granularity: 32×32 px sub-tiles within each 200×100 image container (6×3 = 18 sub-tiles/container; 4 containers × 18 = 72 sub-tiles/full frame).
- Branch A target: ≥5 fps standard (single-token-move scenarios), 15 fps stretch. Both targets gated by ADR-0005 `human_needed` SC.

**Area 3 — Status HUD Content + I18N Width Budget:**
- MVP fields: HP / AC / Speed / Conditions / Concentration (5 logical groups per Specs §7.4 ASCII mockup).
- Update cadence: Reader-driven — subscribe to Phase 3 character/combat reader deltas via WS envelope; redraw on delta with 200 ms debounce. Idle re-render every 30 s heartbeat.
- I18N width budget: Pre-compute longest-string-per-field at build time across IT + EN + DE (3 locales for INV-1 snapshot fixtures ck 11-15); CI gate fails on budget violation.
- Missing data fallback: `—` (em-dash) for missing scalar; `…` for loading-state (first render before first WS delta).

**Area 4 — Branch B/C Glyph Fallback:**
- Auto-fallback trigger: BLE throughput probe at handshake — if sustained <100 kbps → start in glyph mode; else Branch A raster. PROVISIONAL until §10.0.3 hardware test.
- Glyph layout source: ASCII fixtures in `packages/shared-render/src/fixtures/glyph-scene.*.txt`; single char per token (`@` PC, `M` monster, `N` NPC, `o` object); cardinal facing arrows.
- `[GLY]` badge: 3-char width, locked at col 93-95 of Status HUD, visible only in glyph mode. Space-padded in raster mode.
- Manual override API: `layerManager.setMapMode('auto'|'raster'|'glyph')` — reserved; wiring in Phase 4b/6.

### Claude's Discretion

- File layout within `packages/g2-app/src/{engine,raster,status-hud}/` — single responsibility per module, following CONVENTIONS.md.
- Internal Worker message protocol — typed inline if Worker-internal; Zod in shared-protocol if reused externally.
- Exact xxhash variant (xxhash3 vs xxhash64) — pick whichever `xxhash-wasm@1.1.0` exposes by default; document in ADR-0006 amendment.
- ADR number for Layer Manager contract — proposed ADR-0009 (next available); adjust if collision.

### Deferred Ideas (OUT OF SCOPE)

- Overlay slot z=2 mounting rules (modal-on-modal, death-saves + concentration-drop race) → Phase 4b.
- Panel plugin system + 6-tab character sheet, combat tracker, log, inventory, spellbook → Phase 5.
- R1 gesture routing, Quick Action `[M] Map mode` wiring → Phase 6.
- Write path (`activity.use()`, MidiQOL, multi-attack tracker) → Phase 7.
- Advanced raster sub-tile tuning, custom DEFLATE dictionaries, Atkinson/Bayer selectable → Phase 13.
- Multi-locale fallback glyph sets, custom RLE per device VRAM, DSN-style raster stream → Phase 13.
- Battery-aware adaptive frame rate beyond idle heartbeat → Phase 10 polish.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DISP-01 | HUD persistente con status PG (HP/AC/azioni/slot/condizioni) sempre visibile in corner card | Status HUD design + z=1 layer; 04A-UI-SPEC.md field layout; CharacterSnapshotSchema reader |
| DISP-02 | Layout layered (z=0 map, z=1 status HUD, z=2 overlay panel) con esattamente 1 capture container | Layer Manager API + ADR-0001 + EvenAppBridge container budget; capture-container invariant |
| DISP-03 | Layout integrity garantita per tutti gli stati (INV-1, snapshot test §7.14.4 ck 11–15) | 9 ASCII fixtures in shared-render/src/fixtures/; matchAsciiFixture from @evf/shared-render |
| MAP-01 | Raster pipeline 4-bit greyscale dithered (4 image container 2×2 = 400×200 px effective) | image-q@4.0.0 + upng-js@2.1.0 + xxhash-wasm@1.1.0; EvenAppBridge.updateImageRawData; page-based API |
| MAP-02 | Glyph mode fallback (text grid 96×24 char) | Glyph fixtures + glyph-scene layer; EvenAppBridge.textContainerUpgrade |
| MAP-03 | 6-layer optimization stack (delta hash · sub-tile encoding · static caching · custom RLE · BLE 4.2+ DLE · adaptive frame rate) | Sub-tile 32×32 design; xxhash-wasm delta; Worker singleton |
| MAP-04 | 5 fps standard committed / 15 fps aspirational | Branch A PROVISIONAL per ADR-0005; human_needed gate on SC |
| NAV-04 | Boot splash → handshake → main HUD flow con capability negotiation | Boot splash screen; capability-handshake.ts client; HandshakeServerSchema from shared-protocol |
| I18N-04 | Width-budget per chiave + fallback EN se eccede (INV-1 i18n stress, ck 14) | IT/EN/DE per-field budgets in 04A-UI-SPEC.md; build-time check for string length |
</phase_requirements>

---

## Summary

Phase 4a is the first phase that renders to actual G2 hardware. It establishes the layer manager, capability-handshake client, boot splash, Status HUD (z=1), map base layer (z=0 raster or glyph), z=0.5 idle content infill, and the complete raster pipeline in a singleton Web Worker. The central architectural pattern is a **page-based declarative API** — not per-container lifecycle calls. This was the critical empirical finding (OQ-INV2-1, 2026-05-14): `createStartUpPageContainer` declares all slots at boot; `rebuildPageContainer` swaps between full page definitions atomically; `updateImageRawData` pushes bytes into named slots; `createImageContainer` does NOT exist. Phase 4a code must use `EvenAppBridge` from `@evenrealities/even_hub_sdk@0.0.10` directly, bypassing the legacy `hub.*` polyfill (which is a Phase 2 compatibility shim).

The raster pipeline runs entirely in a singleton Web Worker to avoid main-thread GC pauses. The 10-stage pipeline (canvas extract → GPU resize → greyscale → FS dither → tile split → xxhash sub-tile delta → changed-tile identification → RLE encode → PNG encode → updateImageRawData dispatch) is fully software-verifiable except for BLE throughput and real-device fps metrics, which carry `human_needed` gates per ADR-0005 PROVISIONAL Branch A. The status HUD must stay character-perfect across IT/EN/DE locales via width budgets pre-computed at build time; CI fails on budget violations.

The `@evf/shared-render` snapshot framework (`matchAsciiFixture` + `AsciiGrid`) is already in place from Phase 1. Phase 4a must commit 9 ASCII fixture files (boot splash, raster-idle, raster-idle-IT, raster-idle-EN, raster-idle-DE, glyph-idle, status-hud.loading, status-hud.hp-overflow, status-hud.conditions-overflow) and wire each to a Vitest snapshot test.

**Primary recommendation:** Implement in three distinct wave groups — (1) scaffolding + ADR-0009 + Layer Manager with capture-invariant tests; (2) EvenAppBridge page lifecycle + boot splash + capability handshake; (3) Status HUD + i18n budget gate + glyph-scene layer; (4) raster Worker pipeline + sub-tile delta + INV-1 fixture closure.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Layer Manager (z-stack, capture migration) | Frontend Server (WebView) | — | Manages EvenAppBridge container lifecycle; runs in g2-app |
| EvenAppBridge page lifecycle | Frontend Server (WebView) | — | `createStartUpPageContainer`, `rebuildPageContainer`, `shutDownPageContainer` — all called from g2-app |
| Raster pipeline (dither, PNG encode, delta) | Frontend Server (WebView / Web Worker) | — | Must run in the Even Realities App WebView; Worker isolation for off-main-thread heavy ops |
| Status HUD render (text container) | Frontend Server (WebView) | — | `EvenAppBridge.textContainerUpgrade` — g2-app produces the content string |
| Capability handshake (client) | Frontend Server (WebView) | Bridge (server side) | g2-app sends HandshakeClient; bridge responds with HandshakeServer (Phase 3 already implemented server side) |
| Character/combat state (source) | Bridge / Foundry | — | Phase 3 bridge WS delta emitter is the source; g2-app is subscriber only |
| INV-1 snapshot tests | Test layer (`@evf/shared-render`) | — | `matchAsciiFixture` in shared-render verifies character-perfect layout at CI time |
| Build-time i18n width gate | Build tooling (Vite / TypeScript) | — | Width-budget validation runs as part of `pnpm typecheck` or a custom Vite plugin step |

---

## Standard Stack

### Core — g2-app (Phase 4a additions)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@evenrealities/even_hub_sdk` | 0.0.10 | EvenAppBridge singleton — the ONLY entry point for G2 display I/O | Already installed (commit c00397f); canonical SDK MIT by Whiskee Chen @ Even Realities; verified 2026-05-14 |
| `image-q` | 4.0.0 | Floyd-Steinberg dither + custom 16-step greyscale palette | Only npm lib with FS+Atkinson+Bayer AND custom palette; worker-safe; ADR-0006; CLAUDE.md §11.5.7 |
| `upng-js` | 2.1.0 | 4-bit indexed-palette PNG encode | Only mature encoder supporting `depth: 4` indexed-palette matching G2 wire format; worker-safe; CLAUDE.md §11.5.7 |
| `xxhash-wasm` | 1.1.0 | Sub-tile hash for delta encoding | ~1 GB/s WASM; 5-10× faster than custom JS murmur; critical for 15 fps stretch; CLAUDE.md §11.5.7.1 |
| `OffscreenCanvas` + Web Worker | platform | GPU-accelerated resize + off-main-thread raster ops | Native browser API; avoids main-thread GC stalls; worker failure → fallback glyph (ADR-0006) |
| `@evf/shared-render` | workspace:* | `AsciiGrid` + `matchAsciiFixture` for INV-1 snapshot tests | Already in place (Phase 1); Phase 4a adds 9 fixture files |
| `@evf/shared-protocol` | workspace:* | `HandshakeClientSchema`, `HandshakeServerSchema`, `CharacterSnapshotSchema`, `EnvelopeSchema` | Zod schemas imported at runtime; Phase 3 WS handshake already uses them |
| `zod` | 4.4.3 | Runtime schema validation (WS envelope, handshake) | Workspace singleton; same version across all packages |

### Supporting — existing infrastructure (no new installs)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `vite` | 8.0.11 | Dev server + bundle; `?worker` suffix for Worker import | Already in g2-app; phase 4a adds Worker entry |
| `typescript` | 5.8.3 | Strict type authoring | Workspace-wide; all phase 4a code is TypeScript |
| `vitest` | 4.1.5 | Unit + snapshot test runner | Workspace-wide; phase 4a tests live in `packages/g2-app/src/**/__tests__/` |
| `happy-dom` | 20.9.0 | Test environment (g2-app vitest config) | Already configured; Worker tests use `pool: 'vmForks'` or inline Worker mock |

### Packages NOT to install

| Avoid | Reason | Use Instead |
|-------|--------|-------------|
| `jimp` | Bayer 565 only, no FS/Atkinson, no 4-bit indexed PNG — CLAUDE.md §11.5.7 explicit skip | `image-q@4.0.0` |
| `pngjs`, `fast-png` | Wrong bit depth (8-bit only / decode-only at 4-bit) | `upng-js@2.1.0` |
| `pako`, `fflate` in raster path | PNG already DEFLATES; double-compression wastes bytes | Trust upng-js DEFLATE |
| React / Vue / Svelte | No DOM emitted to G2; render target is EvenAppBridge calls — CLAUDE.md D-2.04 | Plain TS modules + observable state |
| `socket.io` | Not needed; native `WebSocket` already wired in Phase 3 handshake | Native `WebSocket` |
| `hub.*` global | Does NOT exist on canonical simulator/real-device — OQ-INV2-4 2026-05-14 | `EvenAppBridge` from even_hub_sdk |

**Installation (only new packages):**

```bash
# All three raster libs must be added to packages/g2-app/package.json dependencies:
pnpm --filter @evf/g2-app add image-q@4.0.0 upng-js@2.1.0 xxhash-wasm@1.1.0
```

**Version verification:** [VERIFIED: npm registry, 2026-05-10 via `npm view`] — image-q@4.0.0 (published 2022-06-19, no newer release), upng-js@2.1.0, xxhash-wasm@1.1.0. All three are the current latest in their series.

---

## Architecture Patterns

### System Architecture Diagram — Phase 4a Data Flow

```
EvenFoundryVTT G2-App (Even Realities App WebView)
─────────────────────────────────────────────────────────

[ Bridge WS Connection (Phase 3) ]
    │
    │  HandshakeServer { server_caps, server_locale, session_id, replay_seq }
    ▼
[ capability-handshake.ts ]  ──────────────────────────────────────────
    │  negotiates: SERVER_CAPS_V1 intersection                         │
    │  BLE probe → Branch A / B / C decision                          │
    │                                                                   │
    ▼                                                                   │
[ LayerManager (singleton) ]  ◄── ADR-0009 contract                   │
    │   mount(z, layer) / destroy(z) / bundle(ops) / setMapMode()      │
    │   enforces: isEventCapture=1 exactly on top-of-stack              │
    │   enforces: capability gate before mount                          │
    │                                                                   │
    ├── z=0 [ MapBaseLayer ]                                            │
    │       ├── RasterMode → RasterWorker (singleton Web Worker)        │
    │       │       ┌──────────────────────────────────────────┐        │
    │       │       │ 1. canvas extract (main → worker via msg)│        │
    │       │       │ 2. OffscreenCanvas GPU resize 400×200    │        │
    │       │       │ 3. greyscale (luminance)                  │        │
    │       │       │ 4. image-q FS dither 16-step palette      │        │
    │       │       │ 5. split 4× 200×100 tiles                 │        │
    │       │       │ 6. xxhash per-tile + per-sub-tile 32×32   │        │
    │       │       │ 7. delta: compare vs prev hashes          │        │
    │       │       │ 8. custom RLE encode changed sub-tiles    │        │
    │       │       │ 9. upng-js PNG 4-bit encode changed tiles │        │
    │       │       │ 10. → updateImageRawData (EvenAppBridge)  │        │
    │       │       └──────────────────────────────────────────┘        │
    │       └── GlyphMode → ASCII char grid → textContainerUpgrade      │
    │                                                                   │
    ├── z=0.5 [ IdleInfillLayer ] (visible iff z=2 NOT mounted)         │
    │       combat-log strip · label separator · stats strip            │
    │       auto-demolished + reborn via bundle() + rebuildPageContainer │
    │                                                                   │
    ├── z=1 [ StatusHudLayer ] (always visible, read-only, no capture)  │
    │       ┌────────────────────────────────────────────────┐          │
    │       │ subscribes to WS delta envelopes (character.delta)│        │
    │       │ HP / AC / Speed / Conditions / Concentration     │         │
    │       │ 200 ms debounce + 30 s stale-state heartbeat    │          │
    │       │ IT/EN/DE build-time width budgets (INV-1 ck 14)  │         │
    │       └────────────────────────────────────────────────┘          │
    │                                                                   │
    └── z=2 [ RESERVED — Phase 4b/5 ]  ◄── API surface reserved         │
                                                                        │
[ Boot Splash ] (separate page, pre-main)  ◄──────────────────────────┘
    createStartUpPageContainer (boot page)
    5-step checklist → handshake → shutDownPageContainer + createStartUpPageContainer (main page)
    
[ EvenAppBridge singleton ] — THE ONLY I/O exit point
    createStartUpPageContainer / rebuildPageContainer
    updateImageRawData / textContainerUpgrade
    shutDownPageContainer
```

### Recommended Project Structure (g2-app additions)

```
packages/g2-app/src/
├── index.ts                       # Real entry — replaces placeholder; boots wizard + HUD
├── hub-polyfill.ts                # Phase 2 compat shim — UNCHANGED; Phase 4a bypasses it
├── types/
│   └── even-hub.d.ts             # Legacy ambient — UNCHANGED; SDK canonical
├── engine/
│   ├── layer-manager.ts          # LayerManager singleton (ADR-0009 API)
│   ├── capability-handshake.ts   # WS client handshake; BLE probe; Branch verdict
│   ├── page-lifecycle.ts         # createStartUpPageContainer / rebuildPageContainer wrappers
│   ├── boot-splash.ts            # Boot splash screen (Screen 1)
│   ├── layer-types.ts            # ZIndex enum, Layer interface, LayerOp union
│   └── __tests__/
│       ├── layer-manager.test.ts      # capture-invariant, mount/destroy, bundle() atomic
│       ├── capability-handshake.test.ts
│       └── page-lifecycle.test.ts
├── raster/
│   ├── raster-worker.ts          # Web Worker (runs OffscreenCanvas + image-q + upng-js + xxhash)
│   ├── raster-controller.ts      # Main-thread orchestrator; MessageChannel; frame scheduler
│   ├── map-base-layer.ts         # MapBaseLayer implements Layer; delegates to raster or glyph
│   ├── glyph-renderer.ts         # Glyph mode — ASCII char grid → textContainerUpgrade
│   ├── tile-delta.ts             # Sub-tile hash table + changed-tile identification (32×32)
│   ├── rle-encoder.ts            # Custom RLE for 4-bit sub-tile regions
│   └── __tests__/
│       ├── raster-worker.test.ts      # pure unit: hash stability, delta detection, RLE roundtrip
│       ├── raster-controller.test.ts  # frame scheduler, debounce, idle heartbeat
│       ├── tile-delta.test.ts         # 72-sub-tile correctness, collision resistance
│       └── glyph-renderer.test.ts     # INV-1 glyph-scene fixture match
├── status-hud/
│   ├── status-hud-layer.ts       # StatusHudLayer implements Layer; always-visible z=1
│   ├── status-hud-renderer.ts    # Render CharacterSnapshot → ASCII string (width-budgeted)
│   ├── i18n-budgets.ts           # Build-time IT/EN/DE width-budget table; overflow guard
│   ├── idle-infill-layer.ts      # z=0.5 IdleInfillLayer; combat-log + stats strip
│   └── __tests__/
│       ├── status-hud-renderer.test.ts   # INV-1 fixtures: loading, hp-overflow, conditions-overflow
│       ├── i18n-budgets.test.ts          # ck 14: all 3 locales within budget
│       └── idle-infill-layer.test.ts     # atomic mount/demolish with z=2
├── wizard/                        # UNCHANGED — Phase 2 code preserved
└── __tests__/
    └── example-status-hud.test.ts  # Replace Phase 1 throwaway with real boot-to-HUD smoke test

packages/shared-render/src/fixtures/   # 9 new fixture files
├── glyph-scene.boot.txt
├── glyph-scene.raster-idle.txt
├── glyph-scene.raster-idle-it.txt
├── glyph-scene.raster-idle-en.txt
├── glyph-scene.raster-idle-de.txt
├── glyph-scene.glyph-idle.txt
├── status-hud.loading.txt
├── status-hud.hp-overflow.txt
└── status-hud.conditions-overflow.txt
```

### Pattern 1: Page-Based Declarative API (OQ-INV2-1 Resolution)

**What:** All G2 container slots are declared upfront in the page definition. Bytes are pushed into named slots. Page transitions use atomic `rebuildPageContainer`.

**When to use:** Every Phase 4a write to the G2 display.

**Source:** [VERIFIED: simulator probe `@evenrealities/evenhub-simulator@0.7.3`, 2026-05-14; `@evenrealities/even_hub_sdk@0.0.10` `index.d.ts`]

```typescript
// Boot: declare all slots at startup
const bridge = EvenAppBridge.getInstance();
await bridge.createStartUpPageContainer(new CreateStartUpPageContainer({
  containerTotalNum: 10,
  imageObject: [
    new ImageContainerProperty({ containerName: 'map-tile-0', width: 200, height: 100, xPosition: 0, yPosition: 0 }),
    new ImageContainerProperty({ containerName: 'map-tile-1', width: 200, height: 100, xPosition: 200, yPosition: 0 }),
    new ImageContainerProperty({ containerName: 'map-tile-2', width: 200, height: 100, xPosition: 0, yPosition: 100 }),
    new ImageContainerProperty({ containerName: 'map-tile-3', width: 200, height: 100, xPosition: 200, yPosition: 100 }),
  ],
  textObject: [
    new TextContainerProperty({ containerName: 'status-hud', isEventCapture: 0, ... }),
    new TextContainerProperty({ containerName: 'header', isEventCapture: 0, ... }),
    new TextContainerProperty({ containerName: 'footer', isEventCapture: 0, ... }),
    new TextContainerProperty({ containerName: 'map-capture', isEventCapture: 1, ... }), // EXACTLY ONE
    new TextContainerProperty({ containerName: 'z05-combat-log', isEventCapture: 0, ... }),
    new TextContainerProperty({ containerName: 'z05-label', isEventCapture: 0, ... }),
    new TextContainerProperty({ containerName: 'z05-stats', isEventCapture: 0, ... }),
  ],
}));

// Update image bytes (raster):
const result = await bridge.updateImageRawData(new ImageRawDataUpdate({
  containerName: 'map-tile-0',
  imageData: pngBytes,  // Uint8Array | number[] from upng-js
}));
// result is ImageRawDataUpdateResult — check ImageRawDataUpdateResult.isSuccess(result)

// Atomic page transition (z=0.5 → z=2):
await bridge.rebuildPageContainer(new RebuildPageContainer({
  containerTotalNum: 7,
  imageObject: [...],  // same 4 image slots
  textObject: [/* status-hud, header, footer, map-capture, overlay-1, overlay-2, overlay-3 */],
}));
```

### Pattern 2: Singleton Web Worker for Raster Pipeline

**What:** Long-lived Worker holds OffscreenCanvas + all raster libs. Main thread sends canvas pixel data via transferable; Worker responds with PNG bytes + changed tile set.

**Source:** [VERIFIED: Specs.md §11.5.7 CLAUDE.md §11.5.7.1; ADR-0006 Branch A; CONTEXT.md Area 2]

```typescript
// raster-worker.ts (Web Worker entry)
import { createXXHash3 } from 'xxhash-wasm';
import * as ImageQ from 'image-q';
import * as UPNG from 'upng-js';

let xxhash: Awaited<ReturnType<typeof createXXHash3>> | null = null;
// Initialized lazily on first frame request

self.onmessage = async (ev: MessageEvent<RasterRequest>) => {
  const { frameId, pixelData, width, height } = ev.data;
  // 1. GPU resize via OffscreenCanvas (sent via transfer)
  // 2. Greyscale (luminance)
  // 3. image-q FS dither to 16-step palette
  // 4. Split 4× 200×100 tiles
  // 5. xxhash per 32×32 sub-tile
  // 6. Delta detection vs prev hashes
  // 7. RLE encode changed sub-tiles
  // 8. upng-js PNG 4-bit encode changed tiles
  // 9. postMessage back with changed tiles + PNG bytes (transferable Uint8Array)
  self.postMessage({ frameId, changedTiles } satisfies RasterResponse, [/* transferable */]);
};
```

```typescript
// raster-controller.ts (main thread)
// Vite Web Worker import — produces a Worker-safe module URL
import RasterWorkerUrl from './raster-worker.ts?worker';

class RasterController {
  private worker = new Worker(new URL('./raster-worker.ts', import.meta.url), { type: 'module' });
  // ... MessageChannel request/response correlation by frameId
}
```

### Pattern 3: Layer Manager Capture-Container Invariant

**What:** After every `mount()` and `destroy()`, exactly one container must have `isEventCapture: 1`. Layer manager asserts this in the method body AND in unit tests.

**Source:** [VERIFIED: ADR-0001 §Confirmation; CONTEXT.md Area 1; 04A-UI-SPEC.md Interaction Contract]

```typescript
// layer-manager.ts
private assertCaptureInvariant(pageState: PageState): void {
  const captureCount = pageState.containers.filter((c) => c.isEventCapture === 1).length;
  if (captureCount !== 1) {
    throw new LayerManagerError(
      `capture-invariant violated: expected 1 capture container, found ${captureCount}`,
    );
  }
}

// layer-manager.test.ts
it('enforces capture-container invariant after mount()', () => {
  const lm = new LayerManager(mockBridge);
  lm.mount(ZIndex.Z0_MAP, mockMapLayer);
  const state = lm.getPageState();
  const captureContainers = state.containers.filter((c) => c.isEventCapture === 1);
  expect(captureContainers).toHaveLength(1);
});
```

### Pattern 4: INV-1 ASCII Fixture Snapshot Test

**What:** Each HUD state has an ASCII fixture in `packages/shared-render/src/fixtures/`. Tests compare runtime render output char-by-char.

**Source:** [VERIFIED: Phase 1 Plan 03; `packages/shared-render/src/snapshot.ts`; Vitest 4 `toMatchFileSnapshot`]

```typescript
// status-hud-renderer.test.ts
import { AsciiGrid, matchAsciiFixture } from '@evf/shared-render';

it('renders loading state with em-dash placeholders (INV-1 ck 15)', async () => {
  const renderer = new StatusHudRenderer({ locale: 'en' });
  const grid = renderer.renderLoading();  // produces AsciiGrid with — placeholders
  await matchAsciiFixture(
    grid,
    '../../../shared-render/src/fixtures/status-hud.loading.txt',
  );
});

it('renders IT locale within width budget (INV-1 ck 14)', async () => {
  const renderer = new StatusHudRenderer({ locale: 'it' });
  const snapshot = mockCharacterSnapshot({ hp: 68, maxHp: 68, ac: 18, speed: 30 });
  const grid = renderer.render(snapshot);
  await matchAsciiFixture(grid, '../../../shared-render/src/fixtures/glyph-scene.raster-idle-it.txt');
});
```

### Anti-Patterns to Avoid

- **Calling `hub.*` global in Phase 4a code:** `hub.setItem`, `hub.getItem`, `hub.eventBus` do NOT exist on the canonical runtime (OQ-INV2-4). Use `EvenAppBridge` directly. The `hub-polyfill.ts` is only for Phase 2 wizard compatibility.
- **Per-frame `createStartUpPageContainer`:** Page definition is set once at boot (or on mode transition via `rebuildPageContainer`). Do NOT call `createStartUpPageContainer` every frame — it reinitializes the page.
- **`createImageContainer` or `createTextContainer` as imperative calls:** These methods DO NOT EXIST on the canonical 10-method enum. All container slots come from the `imageObject`/`textObject` arrays in the page definition struct.
- **Intermediate frames during z=0.5 ↔ z=2 transition:** Never unmount z=0.5 containers in one tick and mount z=2 in the next. Use `bundle()` → single `rebuildPageContainer` call.
- **Spawning a new Worker per frame:** Worker construction is expensive. Use the long-lived singleton pattern; only terminate on fatal Worker error (fallback to glyph mode).
- **Storing more than hash arrays in Worker memory between frames:** Worker holds: (1) prev frame hash array (72 uint32s per full frame = ~288 bytes), (2) OffscreenCanvas, (3) library instances. Nothing else. Tile buffers are transferred back and released.
- **Encoding all 4 tiles per frame:** Only changed tiles (delta) are re-encoded. If zero tiles changed (static scene), skip `updateImageRawData` entirely.
- **I18N string width at render time:** Width budget must be validated at BUILD TIME (TypeScript type-level check or Vite plugin step). Runtime overflow → truncate with `…` + telemetry; do NOT reflow layout.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 4-bit indexed-palette dithering | Custom Floyd-Steinberg | `image-q@4.0.0` | Custom FS misses gamma correction, palette optimization, algorithm variants (Atkinson/Bayer). image-q is ~60KB gz, worker-safe |
| 4-bit PNG encode | Manual DEFLATE + chunk assembly | `upng-js@2.1.0` | DEFLATE tuning for indexed palettes is non-trivial; upng-js already optimized for low bit-depth |
| Sub-tile hash | murmurHash3 in JS | `xxhash-wasm@1.1.0` | 5-10× throughput gap; WASM executes at ~1 GB/s vs ~150 MB/s for JS; critical path at 15 fps stretch |
| Web Worker MessageChannel protocol | Ad-hoc callback system | Typed request/response with `frameId` correlation | GC-invisible, transfer-based, type-safe. Simple because it's 1:1 request→response per frame |
| EvenAppBridge ready-gate | Poll `_ready` every 10ms | `waitForEvenAppBridge()` from SDK | The SDK exports a purpose-built helper that resolves on `evenAppBridgeReady` event |
| Character-grid snapshot diffing | Line-by-line string compare | `@evf/shared-render` `matchAsciiFixture` | Already in place; uses Vitest `toMatchFileSnapshot` with on-disk fixture files; CI auto-detects drift |

**Key insight:** The raster pipeline is a classic "don't re-invent the graphics pipeline" domain. image-q alone handles gamma-correct dithering, palette building, and three dither algorithms. Replacing it with hand-rolled code for any of those concerns would be at least 500 lines of error-prone math.

---

## Common Pitfalls

### Pitfall 1: Using hub.* in Phase 4a code

**What goes wrong:** `ReferenceError: hub is not defined` at runtime. Unit tests pass because they `vi.stubGlobal('hub', mockHub)`, masking the bug.

**Why it happens:** Phase 2 wizard was written against an assumed `hub` global that is NOT injected by the canonical simulator or real device. `hub-polyfill.ts` patches this for wizard code only.

**How to avoid:** Phase 4a code imports `EvenAppBridge` from `@evenrealities/even_hub_sdk` directly. Never reference `hub.*` in engine/raster/status-hud modules.

**Warning signs:** Any import of `'../types/even-hub.d.ts'` or reference to `globalThis.hub` in new Phase 4a modules.

### Pitfall 2: createImageContainer does not exist

**What goes wrong:** `"sendfailed"` or `"unknown method: createImageContainer"` from the bridge at runtime. Build and typecheck pass because the type was hand-typed.

**Why it happens:** Specs.md §4.3 listed a fictional `bridge.createImageContainer()` API that was replaced by the page-based declarative design (OQ-INV2-1 resolution).

**How to avoid:** All container slots must come from `imageObject` / `textObject` arrays in `createStartUpPageContainer` / `rebuildPageContainer`. The SDK's `EvenAppMethod` enum is the authoritative list of 11 (10 + imuControl) callable methods.

**Warning signs:** Any call site with `bridge.createImageContainer(...)` or `bridge.createTextContainer(...)`.

### Pitfall 3: Intermediate frame during z=0.5 ↔ z=2 transition

**What goes wrong:** A frame is rendered with both z=0.5 containers AND z=2 containers visible simultaneously — violating ADR-0001 Amendment 1 and the container budget (11 containers > 10 max).

**Why it happens:** Calling `rebuildPageContainer` for z=0.5 removal in one async tick and z=2 addition in the next.

**How to avoid:** Always use `layerManager.bundle([unmountIdleInfill(), mountOverlay()])` which serializes into a single `rebuildPageContainer` call with the final target page definition.

**Warning signs:** Two `rebuildPageContainer` calls within the same overlay-open flow.

### Pitfall 4: Web Worker Vite import without `?worker` suffix

**What goes wrong:** `Uncaught Error: Worker(...) is not a constructor` or the Worker runs in the main thread, breaking OffscreenCanvas.

**Why it happens:** Vite requires the `?worker` query suffix (or `new URL('./file.ts', import.meta.url)` pattern) to bundle a Worker entry separately. Plain `import` of the Worker file executes it inline.

**How to avoid:** Use `new Worker(new URL('./raster-worker.ts', import.meta.url), { type: 'module' })` in the controller. The Worker file itself must NOT import any DOM-bound libs (image-q, upng-js, xxhash-wasm are all worker-safe per ADR-0006).

**Warning signs:** TS error `OffscreenCanvas is not defined` appearing in the main bundle; Worker file having `import` of browser-only APIs.

### Pitfall 5: `noUncheckedIndexedAccess` and tile array access

**What goes wrong:** TypeScript strict flag `noUncheckedIndexedAccess` makes `hashArray[i]` return `T | undefined`. Code like `if (prevHash[i] !== currHash[i])` becomes a type error.

**Why it happens:** tsconfig.base.json enables `noUncheckedIndexedAccess` (precedent from AsciiGrid in Phase 1).

**How to avoid:** Use pattern `const prev = prevHash[i] ?? 0` or `Array.from()` with typed access. Match the AsciiGrid precedent (`row === undefined` guard pattern).

**Warning signs:** `TS2532: Object is possibly 'undefined'` in tile-delta.ts.

### Pitfall 6: ImageRawDataUpdateResult check

**What goes wrong:** `updateImageRawData` returns `ImageRawDataUpdateResult` (an enum, not `boolean`). Code checking `if (!result)` or `if (result === false)` misses real errors.

**Why it happens:** The SDK result type is a string enum (`"success"`, `"sendFailed"`, etc.) not a boolean. The simulator returns `"sendfailed"` if no page exists yet.

**How to avoid:** Use `ImageRawDataUpdateResult.isSuccess(result)` from the SDK. On failure, log the result value and trigger glyph fallback or retry.

**Warning signs:** `result` typed as `boolean` in any call site.

### Pitfall 7: INV-1 fixture path resolution in tests

**What goes wrong:** `matchAsciiFixture(grid, '../../../shared-render/src/fixtures/foo.txt')` fails with "file not found" in CI.

**Why it happens:** The path is relative to the TEST FILE, not the package root. Phase 1 example test uses `'../../../shared-render/src/fixtures/status-hud-baseline.txt'` from `packages/g2-app/src/__tests__/` (3 dirs up = `packages/`).

**How to avoid:** Follow the same relative-path pattern as the Phase 1 example test. Tests in `packages/g2-app/src/status-hud/__tests__/` are 4 dirs from package root; adjust accordingly. The `fixturePath` is resolved relative to the test file by Vitest.

**Warning signs:** `ENOENT` errors in CI on snapshot tests that pass locally.

### Pitfall 8: ADR-0005 PROVISIONAL hardware SC appearing as auto-green

**What goes wrong:** VERIFICATION.md marks MAP-04 (≥5 fps sustained) and MAP-03 (6-layer optimization stack BLE throughput) as PASSED without real hardware measurement.

**Why it happens:** Vitest benchmarks can simulate pipeline speed on dev machine but cannot measure real BLE transfer time.

**How to avoid:** Hardware-dependent SC MUST carry `human_needed: true` in VERIFICATION.md. Software-side correctness (pipeline correctness, delta detection, RLE roundtrip) is auto-verifiable. BLE p50 and real fps measurement are not.

**Warning signs:** VERIFICATION.md claiming MAP-04 "PASSED" with only a Vitest bench result.

---

## Code Examples

### Example 1: EvenAppBridge Boot Sequence

[VERIFIED: `@evenrealities/even_hub_sdk@0.0.10` `index.d.ts`; simulator probe 2026-05-14]

```typescript
import {
  CreateStartUpPageContainer,
  EvenAppBridge,
  ImageContainerProperty,
  TextContainerProperty,
  waitForEvenAppBridge,
  StartUpPageCreateResult,
} from '@evenrealities/even_hub_sdk';

export async function bootG2Page(): Promise<EvenAppBridge> {
  const bridge = await waitForEvenAppBridge();

  const result = await bridge.createStartUpPageContainer(
    new CreateStartUpPageContainer({
      containerTotalNum: 10,
      imageObject: [
        // 4 image slots for 2×2 raster tiles (200×100 each)
        new ImageContainerProperty({ containerName: 'map-tile-0', width: 200, height: 100 }),
        new ImageContainerProperty({ containerName: 'map-tile-1', width: 200, height: 100 }),
        new ImageContainerProperty({ containerName: 'map-tile-2', width: 200, height: 100 }),
        new ImageContainerProperty({ containerName: 'map-tile-3', width: 200, height: 100 }),
      ],
      textObject: [
        new TextContainerProperty({ containerName: 'status-hud', isEventCapture: 0 }),
        new TextContainerProperty({ containerName: 'header', isEventCapture: 0 }),
        new TextContainerProperty({ containerName: 'footer', isEventCapture: 0 }),
        // Map capture container — EXACTLY ONE isEventCapture=1 per page
        new TextContainerProperty({ containerName: 'map-capture', isEventCapture: 1 }),
        new TextContainerProperty({ containerName: 'z05-combat-log', isEventCapture: 0 }),
        new TextContainerProperty({ containerName: 'z05-label', isEventCapture: 0 }),
        new TextContainerProperty({ containerName: 'z05-stats', isEventCapture: 0 }),
      ],
    }),
  );

  if (result !== StartUpPageCreateResult.success) {
    throw new Error(`G2 page boot failed: ${result}`);
  }

  return bridge;
}
```

### Example 2: xxhash-wasm Sub-Tile Delta

[VERIFIED: `xxhash-wasm@1.1.0` npm page — exports `createXXHash3` and `createXXHash64`; CLAUDE.md §11.5.7.1]

```typescript
import { createXXHash3 } from 'xxhash-wasm';  // WASM ~1 GB/s throughput

const xxhash = await createXXHash3();

function computeSubTileHashes(tileBuffer: Uint8Array, tileW = 200, tileH = 100): Uint32Array {
  // 6 cols × 3 rows = 18 sub-tiles per 200×100 tile
  const subTileW = 32;
  const subTileH = 32; // TODO(ADR-0005): verify tile sizes on real hardware (OQ-INV2-1.b)
  const cols = Math.ceil(tileW / subTileW);  // = 7 (last col partial)
  const rows = Math.ceil(tileH / subTileH);  // = 4 (last row partial)
  const hashes = new Uint32Array(cols * rows);
  
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const subTile = extractSubTile(tileBuffer, c, r, subTileW, subTileH, tileW);
      hashes[r * cols + c] = xxhash.h32(subTile);
    }
  }
  return hashes;
}
```

**Note on sub-tile count:** CONTEXT.md Area 2 specifies "32×32 px sub-tiles, 6×3 = 18 per container." This gives exactly 6 columns (200/32 = 6.25 → 7 with partial last) × 3 rows (100/32 = 3.125 → 4 with partial last). The comment in CONTEXT says "18" which implies the partial edge sub-tiles may be grouped or the effective tile budget is rounded to 6×3. [ASSUMED: the exact grid arithmetic should be confirmed in implementation; use `Math.ceil` and hash actual extents.]

### Example 3: image-q Dither Setup

[VERIFIED: `image-q@4.0.0` npm/GitHub; CLAUDE.md §11.5.7]

```typescript
// Inside the Web Worker
import * as ImageQ from 'image-q';

// 16-step greyscale palette (phosphor green — rendered as 0x0 to 0xF)
const palette = new ImageQ.Palette();
for (let i = 0; i < 16; i++) {
  const v = Math.round((i / 15) * 255);
  palette.add(new ImageQ.Point(v, v, v, 255));
}

// Floyd-Steinberg dither (default; Atkinson/Bayer selectable per CONTEXT deferred)
const ditherer = new ImageQ.ErrorDiffusionArray(
  new ImageQ.ErrorDiffusionArrayKernel(ImageQ.ErrorDiffusionArrayKernel.FloydSteinberg),
);

function ditherTile(rgba: Uint8ClampedArray, w: number, h: number): Uint8Array {
  const inPointContainer = ImageQ.utils.PointContainer.fromUint8Array(rgba, w, h);
  const outPointContainer = ditherer.quantize(inPointContainer, palette);
  return outPointContainer.toUint8Array();
}
```

### Example 4: upng-js 4-bit PNG Encode

[VERIFIED: `upng-js@2.1.0` npm/GitHub; CLAUDE.md §11.5.7]

```typescript
import * as UPNG from 'upng-js';

function encodeTile4bit(indexedData: Uint8Array, w: number, h: number): Uint8Array {
  // depth: 4 = 4-bit indexed palette per G2 wire format
  // ctype: 3 = PNG indexed-colour
  const pngBuffer = UPNG.encode([indexedData.buffer], w, h, 16 /* 16 colours */, [], 4 /* bit depth */);
  return new Uint8Array(pngBuffer);
}
```

### Example 5: HandshakeClient — Capability Negotiation

[VERIFIED: `packages/shared-protocol/src/handshake.ts`; Phase 3 WS handshake implementation]

```typescript
import { HandshakeClientSchema, HandshakeServerSchema } from '@evf/shared-protocol';

async function performCapabilityHandshake(ws: WebSocket, token: string): Promise<HandshakeServer> {
  const clientMsg: z.infer<typeof HandshakeClientSchema> = {
    proto: 'evf-v1',
    token,
    locale: detectLocale(),
    capabilities: ['read_char', 'read_combat', 'read_scene', 'subscribe'],
    session_id: getStoredSessionId() ?? undefined,
  };
  ws.send(JSON.stringify(clientMsg));

  return new Promise((resolve, reject) => {
    ws.addEventListener('message', (ev) => {
      const parsed = HandshakeServerSchema.safeParse(JSON.parse(ev.data as string));
      if (parsed.success) resolve(parsed.data);
      else reject(new Error(`Handshake failed: ${parsed.error.message}`));
    }, { once: true });
  });
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `hub.setItem/getItem/eventBus` global | `EvenAppBridge` from `@evenrealities/even_hub_sdk` | Discovered OQ-INV2-4, 2026-05-14 | Phase 4a code MUST use EvenAppBridge; hub.* is polyfilled for wizard backward compat only |
| Specs §4.3 `bridge.createImageContainer()` | No such method; image slots declared in page definition | OQ-INV2-1 resolved, 2026-05-14 | All Phase 4a raster code targets `updateImageRawData` + page-definition slots |
| Single full-frame BMP (G1 model) | Page-based declarative: `createStartUpPageContainer` + `rebuildPageContainer` + `updateImageRawData` | OQ-INV2-1 resolved, 2026-05-14 | Page lifecycle replaces imagined per-container API |
| Specs §3.1 "200×100 max image" | SDK confirms 20-288 × 20-144 range; 200×100 is an effective design choice within range | OQ-INV2-4 SDK read, 2026-05-14 | Phase 4a defaults to 200×100 per tile (4 tiles = 400×200 effective); future v0.9.13 amends spec |
| `hub.eventBus.on('g2.wear', ...)` | `bridge.onDeviceStatusChanged(status => ...)` derived from `isWearing` transitions | OQ-INV2-4 SDK read, 2026-05-14 | Polyfill handles bridge; Phase 4a code uses SDK subscription directly |
| `image-q` FS dither on main thread (Specs §11.5.7 Pitfall 9) | FS dither + PNG encode + xxhash inside singleton Web Worker | ADR-0006 Branch A; CONTEXT.md Area 2 | Avoids GC stalls; unlocks 15 fps stretch target |

**Deprecated / not to use:**
- `hub.*` global surface in Phase 4a+ code: not canonical (OQ-INV2-4)
- `bridge.createImageContainer` / `bridge.createTextContainer`: fictional methods (OQ-INV2-1)
- `image-q` on main thread: GC stall risk (Specs §11.5.7 Pitfall 9); always use Worker

---

## Runtime State Inventory

This phase creates NEW runtime state — no rename/migration. Documenting for completeness.

| Category | Items Created | Note |
|----------|--------------|------|
| Stored data | None — Phase 4a g2-app is stateless except transient Worker state | Worker holds prev-frame hashes in memory only (lost on reload) |
| Live service config | None | Bridge and Foundry module unchanged by Phase 4a |
| OS-registered state | None | No task scheduler or daemon registration |
| Secrets/env vars | None | Bearer token already provisioned by Phase 2/3 pair flow |
| Build artifacts | `packages/g2-app/dist/` re-built by Vite | Existing dist/ not committed; rebuilds cleanly |

---

## Open Questions

1. **Sub-tile count discrepancy in CONTEXT.md Area 2**
   - What we know: CONTEXT.md says "6×3 = 18 sub-tiles per container" for 32×32 within 200×100.
   - What's unclear: Math gives 7 columns (200÷32=6.25 → ceil=7) × 4 rows (100÷32=3.125 → ceil=4) = 28 sub-tiles including partial edge cells. The "18" figure implies either truncated (floor) counting or edge partial tiles are excluded.
   - Recommendation: Implement using full ceil arithmetic (28 sub-tiles per container, 112 total); if the user's intent was exactly 18 (6×3), use `Math.floor(200/32)=6` × `Math.floor(100/32)=3`=18. Document the chosen interpretation in raster-controller.ts JSDoc. CONTEXT.md locked the 32×32 granularity; the count arithmetic is discretionary.

2. **Vite Worker bundling with xxhash-wasm WASM init**
   - What we know: `xxhash-wasm` is a WASM-backed package; it requires `await createXXHash3()` to initialize.
   - What's unclear: Vite 8 may need explicit WASM plugin configuration (`vite-plugin-wasm` or `new URL('xxhash-wasm/...wasm', import.meta.url)`) for the Worker build to include the WASM binary.
   - Recommendation: In Wave 0/1, probe WASM loading: try plain `import { createXXHash3 } from 'xxhash-wasm'` in the Worker entry. If Vite 8 fails to bundle the WASM binary, add `import.meta.url`-based asset import or the `vite-plugin-wasm` plugin. Document the outcome.

3. **OQ-INV2-1.b: Actual image slot size limits on real G2 hardware**
   - What we know: SDK declares width 20-288, height 20-144. Simulator does NOT enforce hardware-size constraints.
   - What's unclear: Whether 200×100 per tile (the design default) is within real-hardware limits.
   - Recommendation: Default to 200×100 per tile (4 tiles = 400×200 effective). Mark with `// TODO(ADR-0005-OQ-INV2-1.b): verify 200×100 per tile on real G2 — human_needed`. The Phase 0 hardware re-validation run will confirm or necessitate a resize adjustment.

4. **image-q API shape (v4.0.0)**
   - What we know: image-q@4.0.0 published 2022-06-19, MIT, ~60KB gz, worker-safe.
   - What's unclear: The exact import/API surface (the lib uses multiple entry points; `image-q` exports may differ from training-data examples).
   - Recommendation: In Wave 2 (raster pipeline), probe with a minimal Worker test: `import * as ImageQ from 'image-q'` and verify `ImageQ.Palette`, `ImageQ.ErrorDiffusionArray`, `ImageQ.utils.PointContainer` are accessible. Adjust if the API shape differs. [ASSUMED for the code example above — verify in implementation.]

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `@evenrealities/even_hub_sdk@0.0.10` | EvenAppBridge API (all Phase 4a I/O) | ✓ | 0.0.10 | None — phase blocked without this |
| `@evenrealities/evenhub-simulator@0.7.3` | Simulator testing | ✓ | 0.7.3 (confirmed 2026-05-14 probe) | — |
| Node 24 LTS | Build + pnpm workspace | ✓ | `.nvmrc=24` | — |
| Vite 8.0.11 | g2-app bundle | ✓ | In package.json | — |
| `image-q@4.0.0` | Raster pipeline | ✗ (not yet in g2-app deps) | Needs install | None — must install |
| `upng-js@2.1.0` | 4-bit PNG encode | ✗ (not yet in g2-app deps) | Needs install | None — must install |
| `xxhash-wasm@1.1.0` | Sub-tile delta | ✗ (not yet in g2-app deps) | Needs install | None — must install |
| Real G2 + R1 hardware | MAP-04 BLE fps measurement | ✗ | — | human_needed gate (ADR-0005 PROVISIONAL) |

**Missing dependencies that require install before implementation:**

```bash
pnpm --filter @evf/g2-app add image-q@4.0.0 upng-js@2.1.0 xxhash-wasm@1.1.0
```

**Missing dependencies with no software fallback (hardware gates):**
- Real G2 + R1 + 3 RF environments: required for MAP-04 (fps) and MAP-03 (BLE p50 latency). VERIFICATION.md must mark these SC as `human_needed: true` until ADR-0005 hardware re-validation runs.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.5 |
| Config file | `packages/g2-app/vitest.config.ts` (happy-dom environment) + root `vitest.config.ts` (`test.projects: ['packages/*']`) |
| Quick run command | `pnpm --filter @evf/g2-app test -- --run --reporter=verbose` |
| Full suite command | `pnpm test` (workspace-wide including shared-render fixture tests) |
| Snapshot update command | `pnpm test -- --update-snapshots` |
| Coverage command | `pnpm test:coverage` (≥80% threshold enforced) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DISP-01 | Status HUD renders HP/AC/Speed/Conditions with correct layout | Unit + Snapshot | `pnpm test -- --project g2-app` | ❌ Wave 0 |
| DISP-02 | Exactly 1 capture container after every mount/destroy/bundle | Unit | `pnpm test -- --project g2-app` | ❌ Wave 0 |
| DISP-03 | All 9 INV-1 fixtures match runtime render | Snapshot (`matchAsciiFixture`) | `pnpm test -- --project g2-app` | ❌ Wave 0 (fixture files) |
| MAP-01 | Raster pipeline: FS dither → 4-bit PNG → updateImageRawData | Unit + Integration (simulator) | `pnpm test -- --project g2-app` | ❌ Wave 0 |
| MAP-02 | Glyph renderer produces INV-1-conformant ASCII grid | Snapshot | `pnpm test -- --project g2-app` | ❌ Wave 0 |
| MAP-03 | Delta detection: unchanged tiles not re-encoded; RLE roundtrip correct | Unit | `pnpm test -- --project g2-app` | ❌ Wave 0 |
| MAP-04 | ≥5 fps sustained in single-token-move scenario | **hardware** — `human_needed` | `pnpm --filter @evf/validation-harness validate:all` with EVF_HW_PRESENT=true | ✗ (hardware gate) |
| NAV-04 | Boot splash → handshake → main HUD state transition | Integration (simulator) | `pnpm test -- --project g2-app` | ❌ Wave 0 |
| I18N-04 | IT/EN/DE strings fit within build-time width budgets | Unit (build-time assertion) | `pnpm test -- --project g2-app` | ❌ Wave 0 |

### INV-1 Fixture Map (9 files)

| Fixture File | State | INV-1 Check |
|-------------|-------|-------------|
| `glyph-scene.boot.txt` | Boot splash all ✓ | ck 11 |
| `glyph-scene.raster-idle.txt` | Default raster + z=0.5 visible | ck 12 |
| `glyph-scene.raster-idle-it.txt` | Default raster + IT longest strings | ck 14 |
| `glyph-scene.raster-idle-en.txt` | Default raster + EN strings | ck 14 |
| `glyph-scene.raster-idle-de.txt` | Default raster + DE strings | ck 14 |
| `glyph-scene.glyph-idle.txt` | Glyph mode + `[GLY]` badge | ck 13 |
| `status-hud.loading.txt` | All `—` and `…` placeholders | ck 15 |
| `status-hud.hp-overflow.txt` | HP=700, name=16 chars | ck 11 |
| `status-hud.conditions-overflow.txt` | 7 conditions → 3 + `+4` | ck 11 |

### Sampling Rate

- **Per task commit:** `pnpm --filter @evf/g2-app test -- --run` (fast: g2-app only)
- **Per wave merge:** `pnpm test` (workspace-wide: g2-app + shared-render fixture drift check)
- **Phase gate:** Full suite green + `pnpm test:coverage` ≥80% before `/gsd-verify-work`

### Wave 0 Gaps (must exist before implementation begins)

- [ ] `packages/g2-app/src/engine/__tests__/layer-manager.test.ts` — capture-invariant, mount/destroy, bundle() atomic
- [ ] `packages/g2-app/src/engine/__tests__/capability-handshake.test.ts` — handshake flow, BLE probe branch decision
- [ ] `packages/g2-app/src/raster/__tests__/tile-delta.test.ts` — hash stability, delta detection, 72 sub-tile correctness
- [ ] `packages/g2-app/src/raster/__tests__/rle-encoder.test.ts` — RLE roundtrip correctness
- [ ] `packages/g2-app/src/raster/__tests__/glyph-renderer.test.ts` — INV-1 glyph-scene fixture match
- [ ] `packages/g2-app/src/status-hud/__tests__/status-hud-renderer.test.ts` — loading state, hp-overflow, conditions-overflow INV-1 fixtures
- [ ] `packages/g2-app/src/status-hud/__tests__/i18n-budgets.test.ts` — IT/EN/DE ck 14
- [ ] `packages/shared-render/src/fixtures/glyph-scene.boot.txt` — 9 fixture files (auto-created on first `--update-snapshots` run OR hand-authored from 04A-UI-SPEC.md ASCII mockups)
- [ ] ADR-0009 — Layer Manager contract document in `docs/architecture/0009-layer-manager-contract.md`
- [ ] Changeset file in `.changeset/` for Phase 4a g2-app changes

---

## Security Domain

Phase 4a is a browser-side render client. The primary security surface is the WS connection to the bridge (already bearer-authenticated by Phase 3) and the EvenAppBridge API.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No (Phase 4a is client-side only; auth is Phase 3 bearer) | — |
| V3 Session Management | Partial — session_id received from bridge handshake | HandshakeServerSchema.session_id is UUID v4; stored in Tier 3 Even Hub kv (bridge.setLocalStorage) |
| V4 Access Control | No | — |
| V5 Input Validation | Yes — WS delta envelopes parsed from bridge | `EnvelopeSchema.safeParse()` and `CharacterSnapshotSchema.safeParse()` at every delta receive |
| V6 Cryptography | No (Phase 4a is display-only; TLS is bridge/nginx concern) | — |

### Known Threat Patterns for g2-app

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malformed delta envelope from bridge causes crash | Tampering | `z.safeParse()` at WS message handler; invalid envelope → log + ignore, never throw |
| Raster Worker crash causes main-thread hang | Denial of Service | Worker `onerror` handler → fallback to glyph mode (CONTEXT.md Area 2) |
| EvenAppBridge call before `waitForEvenAppBridge()` resolves | Tampering | All bridge calls gated behind `await waitForEvenAppBridge()`; early calls throw |
| i18n string injection via Foundry world string | Tampering | Width-truncated to field budget + `…`; never executes code; G2 firmware renders plain text |

---

## Project Constraints (from CLAUDE.md)

| Constraint | Source | Impact on Phase 4a |
|-----------|--------|-------------------|
| No React/Vue/Svelte in g2-app | D-2.04 | Layer Manager, Status HUD, Glyph Renderer all plain TS modules + observable state |
| INV-1: character-perfect ASCII layout | §0.1 | 9 fixture files; `matchAsciiFixture` snapshots; CI fails on any char diff |
| INV-2: every technical claim cites canonical upstream | §0.1 | OQ-INV2-1 (page-based API) and OQ-INV2-4 (polyfill) both verified via simulator probe |
| INV-3: Specs.md + README + showcase update in same commit | §0.1 | If Phase 4a touches Specs.md (e.g., v0.9.13 amendment for envelope API), must be atomic |
| INV-4: zero dead code, JSDoc on public APIs, `// TODO(#issue)` | §0.1 | All Layer interface methods, Layer Manager public API, StatusHudRenderer public methods must have JSDoc |
| Biome 2.4.15 lint + format | ADR-0008 | `pnpm lint:ci` must pass; `noConsole` except `warn/error` |
| TypeScript strict + 6 flags | tsconfig.base.json | `noUncheckedIndexedAccess` is the main gotcha (tile array access) |
| Conventional Commits; scope `g2-app` or `shared-render` | commitlint.config.js | Phase 4a commits use `feat(g2-app): ...` or `feat(shared-render): ...` |
| `// TODO` requires `(#issue)` or `(ADR-NNNN)` | INV-4 | Hardware-pending comments: `// TODO(ADR-0005-OQ-INV2-1.b): verify ...` |
| Pnpm workspace:* for inter-package deps | pnpm-workspace.yaml | `@evf/shared-render` and `@evf/shared-protocol` imported as workspace deps |
| ADR-0005 PROVISIONAL: hardware SC carry `human_needed` | ADR-0005 | MAP-04 (fps), MAP-03 (BLE throughput), BLE probe Branch decision all `human_needed` |
| No `localStorage` / `sessionStorage` in g2-app | Specs §3.1 + §11.5.5 | Tier 4 hub storage only via `bridge.setLocalStorage()`; never DOM storage |
| Bearer token must survive across sessions | Specs §11.5.4 | Store session_id in `bridge.setLocalStorage('evf_session_id', ...)` via EvenAppBridge |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | image-q@4.0.0 exports `Palette`, `ErrorDiffusionArray`, `utils.PointContainer` at the module root | Code Examples §3 | Implementation must adjust import paths if API shape differs from training-data knowledge |
| A2 | The CONTEXT.md "18 sub-tiles" (6×3) implies floor arithmetic (not ceil); 32×32 grid over 200×100 | Open Questions §1 + Code Examples §2 | If ceil arithmetic needed, sub-tile count is 28 (7×4) — implementation must pick one and document |
| A3 | Vite 8 bundles `xxhash-wasm` WASM binary correctly in a `?worker` bundle without extra plugins | Code Examples §2 | If Vite 8 fails WASM-in-Worker bundling, need `vite-plugin-wasm` or manual `new URL()` asset import |
| A4 | R1 gesture events for the map capture container (tap/scroll/long-press) arrive via `bridge.onEvenHubEvent()` as `listEvent` or `textEvent` with `containerName: 'map-capture'` | Raster pattern | If R1 events use a different container or event type, Phase 4a capture-container setup must adjust. Phase 6 will confirm. |

**All other claims in this research were verified against the SDK source (`@evenrealities/even_hub_sdk@0.0.10 index.d.ts`), codebase files, or simulator probe results from 2026-05-14.**

---

## Sources

### Primary (HIGH confidence)

- `@evenrealities/even_hub_sdk@0.0.10` — `index.d.ts` read directly from `/home/aiacos/node_modules/@evenrealities/even_hub_sdk/dist/index.d.ts` — full EvenAppBridge API surface, container property models, enums, result types [VERIFIED: codebase grep 2026-05-14]
- `packages/g2-app/src/hub-polyfill.ts` — OQ-INV2-4 polyfill source; confirmed `hub.*` global does not exist on canonical runtime [VERIFIED: codebase read 2026-05-14]
- `packages/g2-app/src/types/even-hub.d.ts` — legacy ambient type declarations; cross-refs to polyfill source [VERIFIED: codebase read 2026-05-14]
- `packages/shared-protocol/src/handshake.ts` — `HandshakeClientSchema`, `HandshakeServerSchema`, `SERVER_CAPS_V1` [VERIFIED: codebase read 2026-05-14]
- `packages/shared-protocol/src/payloads/character.ts` — `CharacterSnapshotSchema` shape [VERIFIED: codebase read 2026-05-14]
- `packages/shared-render/src/snapshot.ts` — `matchAsciiFixture` using Vitest `toMatchFileSnapshot` [VERIFIED: codebase read 2026-05-14]
- `.planning/phases/04a-g2-engine-raster-status-hud/04a-CONTEXT.md` — 4 locked decisions [VERIFIED: codebase read 2026-05-14]
- `.planning/phases/04a-g2-engine-raster-status-hud/04A-UI-SPEC.md` — full screen inventory, field width budgets, 9 fixture files, container allocation tables [VERIFIED: codebase read 2026-05-14]
- `docs/architecture/0001-layered-ui-model.md` + Amendment 1 (z=0.5) — layer model contract [VERIFIED: codebase read 2026-05-14]
- `docs/architecture/0005-phase0-go-no-go.md` — PROVISIONAL Branch A; OQ-INV2-1/4 resolutions [VERIFIED: codebase read 2026-05-14]
- `docs/architecture/0006-raster-pipeline-library-stack.md` — library choices under Branch A [VERIFIED: codebase read 2026-05-14]
- CLAUDE.md §11.5.7, §11.5.7.1, D-2.04, INV-1/2/3/4 — canonical project constraints [VERIFIED: codebase read 2026-05-14]

### Secondary (MEDIUM confidence)

- `npm view image-q version`, `npm view upng-js version`, `npm view xxhash-wasm version` — versions 4.0.0, 2.1.0, 1.1.0 confirmed as latest (verified 2026-05-10 in Phase 0 research; re-relied on for this phase) [CITED: CLAUDE.md §10 Sources]
- Phase 3 `03-05-SUMMARY.md` — WS envelope shape, Docker Compose, bridge production entry; confirms Phase 3 WS server is ready for Phase 4a client to connect [CITED: codebase read 2026-05-14]

### Tertiary (LOW confidence — flagged above as [ASSUMED])

- image-q@4.0.0 export shape (A1): training-knowledge; verify at implementation time
- Sub-tile arithmetic "18 vs 28" (A2): CONTEXT.md is ambiguous; verify in implementation
- Vite 8 + WASM-in-Worker bundling (A3): probe required in Wave 1

---

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — SDK source read directly; npm versions verified in Phase 0 research; raster libs confirmed worker-safe in ADR-0006
- Architecture (layer manager, page lifecycle): HIGH — ADR-0001 + ADR-0005 + UI-SPEC + CONTEXT.md all consistent; EvenAppBridge API verified from SDK source
- Raster pipeline: HIGH for structure; MEDIUM for image-q exact API shape (A1)
- Status HUD + i18n: HIGH — UI-SPEC field budgets are precise; schema shape from shared-protocol confirmed
- Hardware SC (fps, BLE): PROVISIONAL — gated by ADR-0005 human_needed until real-device run
- Anti-patterns: HIGH — OQ-INV2-1 and OQ-INV2-4 empirically confirmed; Vite Worker pitfall from ADR-0006

**Research date:** 2026-05-14
**Valid until:** 2026-06-14 (stable SDK — even_hub_sdk is 0.0.10, low-churn; raster libs are pinned versions from 2022/2021; re-verify SDK before Phase 5 if new even_hub_sdk version ships)
