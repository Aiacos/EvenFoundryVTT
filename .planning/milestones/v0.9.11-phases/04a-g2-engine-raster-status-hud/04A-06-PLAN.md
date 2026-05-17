---
phase: 04a
plan: 06
type: execute
wave: 2
depends_on: ["04a-02"]
files_modified:
  - packages/foundry-module/src/canvas-extractor.ts
  - packages/foundry-module/src/canvas-extractor.test.ts
  - packages/foundry-module/src/module.ts
  - packages/shared-protocol/src/payloads/frame.ts
  - packages/shared-protocol/src/payloads/frame.test.ts
  - packages/shared-protocol/src/index.ts
  - packages/g2-app/src/scene-input.ts
  - packages/g2-app/src/__tests__/scene-input.test.ts
autonomous: true
requirements: [MAP-01]
user_setup: []
tags: [foundry-module, shared-protocol, g2-app, raster-data-source, pixi-canvas, ws-frame-pixels, wave-2]
must_haves:
  truths:
    - "Foundry-side canvas-extractor.ts subscribes to canvasReady + canvas refresh hooks; on token/scene update (debounced 200 ms) extracts pixels via canvas.app.renderer.extract.pixels(canvas.stage)"
    - "Extracted RGBA Uint8ClampedArray is cropped/resized to fit the 288×144 hardware bound (per OQ-INV2-4 SDK polyfill discovery) and dispatched over the bridge WS as a typed `frame_pixels` envelope conforming to shared-protocol `EnvelopeSchema` (`payload` carries the validated `FramePixels` shape; `session_id: z.string().uuid()` is populated from the existing pair registry per Phase 3 handshake)"
    - "shared-protocol FramePixelsSchema validates { width: number (20-288), height: number (20-144), pixelsB64: base64-encoded RGBA bytes, sceneId: string, ts: number } via Zod safeParse at both bridge boundary (Phase 3 inherits) and g2-app receive boundary (this plan)"
    - "g2-app/src/scene-input.ts attachSceneInputToWs(ws, controller) registers a ws.addEventListener('message', ...) handler that parses incoming envelopes via `EnvelopeSchema.safeParse`; on `envelope.type === 'frame_pixels'` validates `envelope.payload` via `FramePixelsSchema.safeParse` then decodes base64 → Uint8ClampedArray → calls controller.requestFrame(pixelData, width, height)"
    - "scene-input.ts dispatches a fresh Uint8ClampedArray whose underlying ArrayBuffer is transferable-capable (own buffer, byteOffset === 0); RasterController.requestFrame is responsible for the actual `postMessage(msg, [buffer])` zero-copy transfer to the Worker (verified end-to-end by Plan 03 RC-2). Plan 06 SI-7 verifies only the prerequisite (the typed array owns its buffer), not the final Worker handoff."
    - "All three packages typecheck + lint:ci + test:coverage green; tests colocated beside source per the established convention (verified across bridge, foundry-module, g2-app, shared-protocol)"
  artifacts:
    - path: "packages/foundry-module/src/canvas-extractor.ts"
      provides: "Foundry-side PIXI canvas extraction + debounced WS dispatch; registers hooks on init/canvasReady; called from module.ts ready hook"
      exports: ["registerCanvasExtractor", "extractCurrentFrame"]
    - path: "packages/shared-protocol/src/payloads/frame.ts"
      provides: "FramePixelsSchema Zod schema + type FramePixels + helper encodeFramePixels/decodeFramePixels (base64 ↔ Uint8ClampedArray)"
      exports: ["FramePixelsSchema", "FramePixels", "encodeFramePixels", "decodeFramePixels"]
    - path: "packages/g2-app/src/scene-input.ts"
      provides: "attachSceneInputToWs WS message receiver that dispatches frame_pixels envelopes (validated via EnvelopeSchema + FramePixelsSchema) to RasterControllerLike.requestFrame"
      exports: ["attachSceneInputToWs", "type UnsubscribeFn"]
  key_links:
    - from: "packages/foundry-module/src/canvas-extractor.ts"
      to: "Foundry PIXI canvas (canvas.app.renderer.extract.pixels)"
      via: "Hooks.on('canvasReady') + Hooks.on('drawCanvas') + Hooks.on('refreshToken') + Hooks.on('updateScene')"
      pattern: "Hooks\\.on\\('(canvasReady|drawCanvas|refreshToken|updateScene)'"
    - from: "packages/foundry-module/src/canvas-extractor.ts"
      to: "Phase 3 bridge WS"
      via: "BridgeDeltaEmitter.send via existing Phase 2 socket adapter or POST /internal/delta — emitter wraps the typed payload in shared-protocol `EnvelopeSchema` (proto/seq/ts/type='frame_pixels'/session_id/payload)"
      pattern: "bridgeDeltaEmitter|/internal/delta"
    - from: "packages/shared-protocol/src/payloads/frame.ts"
      to: "packages/shared-protocol/src/index.ts"
      via: "re-export FramePixelsSchema + FramePixels + encodeFramePixels + decodeFramePixels for cross-package consumption"
      pattern: "export.*FramePixels"
    - from: "packages/g2-app/src/scene-input.ts"
      to: "packages/g2-app/src/engine/layer-types.ts RasterControllerLike"
      via: "constructor accepts a RasterControllerLike (type-only); calls controller.requestFrame on validated frame_pixels"
      pattern: "RasterControllerLike"
    - from: "packages/g2-app/src/scene-input.ts"
      to: "packages/shared-protocol EnvelopeSchema + FramePixelsSchema"
      via: "Two-layer safeParse at ws.message receive boundary: outer envelope via EnvelopeSchema, then payload via FramePixelsSchema when envelope.type === 'frame_pixels'"
      pattern: "EnvelopeSchema\\.safeParse|FramePixelsSchema\\.safeParse"
    - from: "packages/g2-app/src/index.ts (Plan 05)"
      to: "packages/g2-app/src/scene-input.ts attachSceneInputToWs"
      via: "bootEngine wires attachSceneInputToWs(ws, controller) after handshake"
      pattern: "attachSceneInputToWs"

threat_model:
  trust_boundaries:
    - description: "Foundry PIXI canvas → canvas-extractor: trusted (player's own desktop rendering)"
    - description: "Canvas-extractor → bridge WS: payload crosses Phase 3 EnvelopeSchema boundary (proto/seq/ts/type/session_id + idempotency key); bridge enforces bearer auth + per-token rate limit"
    - description: "Bridge WS → g2-app scene-input: untrusted message envelope crosses into g2-app; MUST safeParse via EnvelopeSchema (outer) + FramePixelsSchema (payload) before reaching RasterController"
    - description: "Base64 decode (scene-input → controller): bounded buffer size; max 288 × 144 × 4 = 165,888 bytes RGBA per frame"
  threats:
    - id: "T-4a-06-01"
      category: "D"
      component: "canvas-extractor.ts PIXI extraction blocks Foundry desktop UI thread"
      disposition: "mitigate"
      mitigation_plan: "Debounce extraction at 200 ms per CONTEXT.md Area 2; never call extract.pixels synchronously inside a hook callback — schedule via requestIdleCallback or setTimeout(0). Real-device perf gate carries human_needed per ADR-0005 SC #5 (Specs §11.5.7 pitfall 11)."
    - id: "T-4a-06-02"
      category: "T"
      component: "scene-input.ts WS message receive parse"
      disposition: "mitigate"
      mitigation_plan: "Every ws.message payload JSON.parse'd in try/catch (failure → log + drop). Then EnvelopeSchema.safeParse — failure → log + drop. Then narrow on `envelope.type === 'frame_pixels'`; then FramePixelsSchema.safeParse on `envelope.payload` — failure → log + drop. Base64 decode bounded by schema (width ≤ 288, height ≤ 144); decoded buffer length verified against width × height × 4 — mismatch → drop. RasterController.requestFrame is never called with unvalidated input."
    - id: "T-4a-06-03"
      category: "I"
      component: "frame_pixels payload contains scene tokens visible to player"
      disposition: "accept"
      mitigation_plan: "Same scene already visible on player's Foundry desktop. No PII exfiltration beyond existing Phase 2 reader surface."
    - id: "T-4a-06-04"
      category: "S"
      component: "Bridge frame_pixels endpoint authorization"
      disposition: "mitigate"
      mitigation_plan: "frame_pixels envelope dispatched via existing Phase 3 bridge auth (bearer 24h + per-token rate limit). Plan 06 does NOT introduce a new bridge endpoint; it reuses the existing /internal/delta or WS push channel and reuses the existing `EnvelopeSchema` shape (adds `type: 'frame_pixels'` discriminant; `session_id` populated from the existing pair registry). If Phase 3's contract requires a new typed envelope, add to the existing tool registry. T-4a-06-04 mitigation reference: Phase 3 bearer auth + rate-limit gate."
    - id: "T-4a-06-05"
      category: "D"
      component: "Per-frame transferable ArrayBuffer hand-off"
      disposition: "mitigate"
      mitigation_plan: "scene-input.ts hands a fresh Uint8ClampedArray (own ArrayBuffer, byteOffset === 0) to RasterController.requestFrame. The actual transferable `postMessage(msg, [buffer])` zero-copy transfer to the Worker is RasterController's responsibility (Plan 03 RC-2 verifies the final transfer). Plan 06 SI-7 verifies only the prerequisite — that the buffer is transferable-capable when it reaches RasterController."
---

<objective>
Ship the **raster input data source** chain that Plan 03's pipeline consumes. This plan closes B-5 from the plan-checker report: the systemic gap where Plans 01-05 ship the raster output pipeline but no plan supplies the pixel data.

Purpose: Plan 03 implements `RasterController.requestFrame(pixelData, w, h)` as the entry point into the raster Worker pipeline, but until this plan ships, NO code path supplies `pixelData`. This plan:

1. **Foundry side (`packages/foundry-module/src/canvas-extractor.ts`):** registers Foundry hooks that extract pixels from the PIXI canvas via `canvas.app.renderer.extract.pixels(canvas.stage)`, crops/resizes to the 288×144 hardware bound (per OQ-INV2-4 SDK polyfill discovery — verified 2026-05-14 in STATE.md), and dispatches them as a `frame_pixels`-typed `EnvelopeSchema` over the existing Phase 3 bridge WS.
2. **Wire format (`packages/shared-protocol/src/payloads/frame.ts`):** Zod schema `FramePixelsSchema` that bridges + g2-app share. Defines width/height bounds + base64 pixel encoding for cross-WS transport. Both producers and consumers safeParse at the boundary (defense-in-depth). The outer envelope is shared-protocol's existing `EnvelopeSchema` — Plan 06 does NOT define a new envelope schema; it defines only the typed payload (`FramePixelsSchema`) carried in `envelope.payload`.
3. **g2-app side (`packages/g2-app/src/scene-input.ts`):** WS receiver `attachSceneInputToWs(ws, controller)` that listens for `frame_pixels` envelopes via `EnvelopeSchema.safeParse` (outer) + `FramePixelsSchema.safeParse` (inner `envelope.payload`), decodes base64 → Uint8ClampedArray (fresh ArrayBuffer for downstream zero-copy Worker handoff per Specs §11.5.7), and dispatches to `controller.requestFrame(pixelData, width, height)`.

REVISION 1 (2026-05-15) — NEW plan per 04A-PLAN-CHECK.md B-5:
- B-5 closure: 3 cross-package artifacts span Foundry module, shared protocol, and g2-app. Each side parsed via Zod safeParse (defense-in-depth across WS boundary).
- MAP-01 (raster pipeline 4-bit greyscale dithered) ownership split: **input path** (canvas extraction + WS transfer + dispatch) belongs to this plan; **output path** (Worker pipeline + updateImageRawData) belongs to Plan 03. Plan 05 smoke test exercises the composed chain.
- Wave 2 (parallel with Plan 03 + Plan 04): zero `files_modified` overlap with either:
  - Plan 03 owns `packages/g2-app/src/raster/**` — Plan 06 owns `packages/g2-app/src/scene-input.ts` (top-level g2-app/src; not under raster/)
  - Plan 04 owns `packages/g2-app/src/status-hud/**` + 9 fixtures — Plan 06 owns no fixture
  - Plan 06 owns `packages/foundry-module/src/canvas-extractor.ts` + `packages/shared-protocol/src/payloads/frame.ts` — Plans 03/04 touch neither package
- depends_on: `04a-02` (needs Plan 02 capability-handshake to know the WS exists + handshake's negotiated caps; specifically `subscribe` cap must be in SERVER_CAPS_V1 for frame_pixels push to be authorized). Does NOT depend on Plan 03 — RasterControllerLike type contract (Plan 01) is enough.

REVISION 2 (2026-05-15) — per 04A-PLAN-CHECK.md NF-1 + NF-3 + NF-4:
- **NF-1 (BLOCKER) closure:** Earlier draft invented `WireEnvelopeSchema` and referenced an `envelope.value` field — neither exists. Real exports (verified via `packages/shared-protocol/src/envelope.ts` + `packages/shared-protocol/src/index.ts`): `EnvelopeSchema` is the wire envelope; its carrier field is `payload` (not `value`); `session_id: z.string().uuid()` is REQUIRED. Plan 06 now uses `EnvelopeSchema` + `envelope.payload` consistently; emitters populate `session_id` from the existing pair registry; receivers narrow on `envelope.type === 'frame_pixels'` and parse `envelope.payload` via `FramePixelsSchema.safeParse`.
- **NF-3 closure:** Test files colocated beside source per the established convention (grep-verified across bridge, foundry-module, g2-app, shared-protocol). Paths reconciled in `files_modified` and verify gates:
  - `packages/foundry-module/src/canvas-extractor.test.ts` (NOT `src/__tests__/canvas-extractor.test.ts`)
  - `packages/shared-protocol/src/payloads/frame.test.ts` (NOT `src/__tests__/frame.test.ts`)
  - `packages/g2-app/src/__tests__/scene-input.test.ts` — g2-app already uses `__tests__/` for cross-cutting tests at the package root; keep this path.
- **NF-4 closure:** must_haves SI-7 truth reworded to describe its actual scope (scene-input hands a transferable-capable buffer; final Worker handoff is Plan 03 RC-2's responsibility). No end-to-end zero-copy claim in Plan 06.

Output: 3 source modules + 3 test files (colocated) + integration into module.ts + re-export in shared-protocol/src/index.ts. Software-side correctness fully verifiable via Vitest. Hardware-pending: real Foundry desktop PIXI extract performance (SC #5; carries human_needed per ADR-0005 Plan 05 checkpoint).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/phases/04a-g2-engine-raster-status-hud/04a-CONTEXT.md
@.planning/phases/04a-g2-engine-raster-status-hud/04A-RESEARCH.md
@.planning/phases/04a-g2-engine-raster-status-hud/04A-UI-SPEC.md
@.planning/phases/04a-g2-engine-raster-status-hud/04A-PLAN-CHECK.md
@.planning/phases/04a-g2-engine-raster-status-hud/04a-01-SUMMARY.md
@.planning/phases/04a-g2-engine-raster-status-hud/04a-02-SUMMARY.md
@docs/architecture/0001-layered-ui-model.md
@docs/architecture/0002-protocol-versioning.md
@docs/architecture/0005-phase0-go-no-go.md
@docs/architecture/0006-raster-pipeline-library-stack.md
@packages/foundry-module/src/module.ts
@packages/foundry-module/src/readers/hook-subscribers.ts
@packages/foundry-module/src/readers/scene-reader.ts
@packages/shared-protocol/src/payloads/scene.ts
@packages/shared-protocol/src/envelope.ts
@packages/shared-protocol/src/index.ts
@packages/g2-app/src/engine/layer-types.ts
@packages/bridge/src/ws/delta-emitter.ts

<interfaces>
<!-- Foundry PIXI canvas surface (verified empirically in OQ-INV2-4 STATE.md 2026-05-14). -->
<!-- Foundry exposes the PIXI v7 canvas via `canvas.app.renderer.extract.pixels(canvas.stage)`. -->
<!-- Returns Uint8Array (RGBA, row-major, top-left origin) sized to renderer width × height × 4. -->

From Foundry global runtime (no npm import — Foundry side only; fvtt-types provides ambient declarations in Phase 2):
- `canvas.app.renderer.extract.pixels(target?: PIXI.DisplayObject): Uint8Array` — extracts the rendered pixels of `target` (default: stage). Returns RGBA byte array.
- `canvas.app.renderer.width: number`, `canvas.app.renderer.height: number` — current renderer dimensions.
- `Hooks.on('canvasReady', (canvas) => ...)` — fires once when the active scene's canvas is fully drawn.
- `Hooks.on('drawCanvas', (canvas) => ...)` — fires after a canvas re-render.
- `Hooks.on('refreshToken', (token, options) => ...)` — fires on each token render-refresh (debounce in our handler).
- `Hooks.on('updateScene', (scene, changes, options) => ...)` — fires when a scene document is updated (camera, dimensions, walls, etc.).

From Phase 3 bridge (existing — read packages/bridge/src/ws/delta-emitter.ts):
- The bridge already exposes a `bridgeDeltaEmitter.send(channel: string, payload: unknown)` shape for typed cross-WS push. Plan 06 reuses this — the bridge side wraps the typed payload in `EnvelopeSchema` (`proto: 'evf-v1'`, monotonic `seq`, `ts`, `type: 'frame_pixels'`, `session_id` from the pair registry, `payload: FramePixels`); safeParse runs at both bridge entry AND g2-app exit (defense-in-depth).
- If the bridge does not yet have a `frame_pixels` channel type registered, Plan 06 adds it to the existing Tool Registry / channel registry per ADR-0003.

From @evf/shared-protocol (verified live in `packages/shared-protocol/src/envelope.ts` + `packages/shared-protocol/src/index.ts`):
- `EnvelopeSchema = z.object({ proto: z.literal('evf-v1'), seq: z.number().int().nonnegative(), ts: z.number().int(), type: z.string(), session_id: z.string().uuid(), payload: z.unknown() })` — single source of truth for the wire envelope (ADR-0002).
- `type` discriminator routes to typed payload schemas; `payload` is `z.unknown()` at the envelope layer and refined by the consumer-side schema (`FramePixelsSchema.safeParse(envelope.payload)`).
- **There is no `WireEnvelopeSchema` export.** **The carrier field is `payload`, not `value`.** **`session_id: z.string().uuid()` is REQUIRED.** Plan 06 honors these contracts verbatim.

From packages/g2-app/src/engine/layer-types.ts (Plan 01):
- `interface RasterControllerLike { requestFrame(pixelData, width, height): Promise<RasterResponse>; ... }` — scene-input.ts imports type-only and calls requestFrame.

Hardware bounds per OQ-INV2-4 SDK polyfill discovery (STATE.md 2026-05-14):
- Image width: 20-288 px (inclusive)
- Image height: 20-144 px (inclusive)
- ZIndex map area target: 400×200 effective (4 image containers × 200×100; matches CONTEXT.md Area 2) — but pixel data from Foundry can be larger; the resize step here crops/scales to a chosen input size that the Plan 03 Worker pipeline then resizes again to 400×200. Plan 06 chooses **288×144 as the wire size** (max hardware bound; minimizes resize loss; lets Plan 03 Worker do the final downscale to 400×200 with full data).

FramePixelsSchema (this plan adds, in packages/shared-protocol/src/payloads/frame.ts):
```typescript
export const FramePixelsSchema = z.object({
  sceneId: z.string().min(1),     // Foundry scene._id
  width: z.number().int().min(20).max(288),
  height: z.number().int().min(20).max(144),
  pixelsB64: z.string(),          // base64-encoded RGBA Uint8Array; length must === width * height * 4 after decode
  ts: z.number().int().positive(), // emitter timestamp (ms epoch)
});
export type FramePixels = z.infer<typeof FramePixelsSchema>;
```

Wire envelope shape (uses existing shared-protocol `EnvelopeSchema` — no new schema needed):
```typescript
// Producer side (bridge / canvas-extractor):
const env: Envelope = {
  proto: 'evf-v1',
  seq: nextSeq(),
  ts: Date.now(),
  type: 'frame_pixels',
  session_id: pairRegistry.getSessionId(),  // UUID v4 — required
  payload: framePixels,                      // satisfies FramePixelsSchema
};

// Consumer side (scene-input):
const env = EnvelopeSchema.safeParse(rawMsg);
if (!env.success) return;                         // outer parse failure → drop
if (env.data.type !== 'frame_pixels') return;     // not our envelope
const fp = FramePixelsSchema.safeParse(env.data.payload);
if (!fp.success) return;                          // inner parse failure → drop
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: shared-protocol FramePixelsSchema + base64 helpers (TDD; tests colocated)</name>
  <read_first>
    - packages/shared-protocol/src/envelope.ts (`EnvelopeSchema` real export — the outer wire envelope. **Note:** field is `payload` not `value`; `session_id` is required UUID. Plan 06 does NOT define a new envelope schema.)
    - packages/shared-protocol/src/payloads/scene.ts (existing payload analog — schema shape + re-export pattern)
    - packages/shared-protocol/src/payloads/character.ts (additional analog — Zod schema + type export pattern)
    - packages/shared-protocol/src/index.ts (re-export hub; FramePixelsSchema + FramePixels + helpers must be re-exported here for cross-package consumption)
    - Existing colocated tests in shared-protocol (e.g. `packages/shared-protocol/src/tools/*.test.ts`, `packages/shared-protocol/src/payloads/*.test.ts` if any) — pattern: test files sit BESIDE source. New tests go in the same `payloads/` subdirectory next to `frame.ts`.
    - .planning/phases/04a-g2-engine-raster-status-hud/04A-PLAN-CHECK.md §B-5 + §NF-1 + §NF-3 (FramePixelsSchema requirement; EnvelopeSchema correction; test colocation convention)
  </read_first>
  <files>packages/shared-protocol/src/payloads/frame.ts, packages/shared-protocol/src/payloads/frame.test.ts, packages/shared-protocol/src/index.ts</files>
  <behavior>
    - Test FP-1: `FramePixelsSchema.safeParse({sceneId: 'scene1', width: 288, height: 144, pixelsB64: '<valid base64>', ts: 1234567890000}).success === true`
    - Test FP-2: width = 19 (below min) → safeParse failure with issue path includes 'width'
    - Test FP-3: width = 289 (above max) → safeParse failure
    - Test FP-4: height = 145 (above max) → safeParse failure
    - Test FP-5: pixelsB64 is non-base64-decodable string → roundtrip via `decodeFramePixels` throws Error('FramePixels decode: invalid base64')
    - Test FP-6: `encodeFramePixels(pixelsUint8: Uint8ClampedArray)` returns a base64 string; `decodeFramePixels(b64, width, height)` returns a Uint8ClampedArray with `.length === width * height * 4`
    - Test FP-7: `decodeFramePixels` length-mismatch (decoded length !== width * height * 4) → throws Error('FramePixels decode: length mismatch')
    - Test FP-8: Roundtrip: `decode(encode(input)) === input` (byte-for-byte) for a 288×144 Uint8ClampedArray of random bytes
    - Test FP-9: FramePixelsSchema + helpers re-exported from packages/shared-protocol/src/index.ts (import via `@evf/shared-protocol` works; verify in test via static import `import { FramePixelsSchema, encodeFramePixels, decodeFramePixels } from '@evf/shared-protocol'`)
    - Test FP-10: When `FramePixels` is carried inside an `Envelope`, the round-trip `EnvelopeSchema.safeParse(env)` succeeds AND `FramePixelsSchema.safeParse(env.payload)` succeeds. Use a fixture envelope with `proto: 'evf-v1'`, `seq: 0`, `ts: Date.now()`, `type: 'frame_pixels'`, `session_id: '00000000-0000-4000-8000-000000000000'`, `payload: validFramePixels`. (This locks the cross-schema contract that scene-input.ts depends on.)
  </behavior>
  <action>
    **1. `packages/shared-protocol/src/payloads/frame.ts`:**
    Module JSDoc citing 04A-PLAN-CHECK.md §B-5 + §NF-1 (this schema closes the raster-pipeline data source gap and is the typed `payload` carried inside the shared `EnvelopeSchema`), ADR-0002 (envelope versioning binds the wire format).

    Imports: `import { z } from 'zod'`.

    Exports:
    - `export const FramePixelsSchema = z.object({ sceneId: z.string().min(1), width: z.number().int().min(20).max(288), height: z.number().int().min(20).max(144), pixelsB64: z.string(), ts: z.number().int().positive() })` — bounds from OQ-INV2-4 SDK polyfill discovery (STATE.md 2026-05-14).
    - `export type FramePixels = z.infer<typeof FramePixelsSchema>`
    - `export function encodeFramePixels(pixels: Uint8ClampedArray | Uint8Array): string` — base64 encoder. Implementation: use `Buffer.from(pixels).toString('base64')` if Node API available (foundry-module runs in Foundry's Electron/Node env), else use `btoa(String.fromCharCode(...pixels))` (browser fallback for g2-app side). Decision rule: detect via `typeof Buffer !== 'undefined'`. Document the dual-environment fallback in JSDoc.
    - `export function decodeFramePixels(b64: string, width: number, height: number): Uint8ClampedArray` — base64 decoder + length validator. Implementation: use Buffer if available, else `Uint8ClampedArray.from(atob(b64), c => c.charCodeAt(0))`. Throws `Error('FramePixels decode: invalid base64')` on decode failure; throws `Error('FramePixels decode: length mismatch — expected ${w}×${h}×4 bytes, got ${n}')` if decoded length ≠ width × height × 4. The returned Uint8ClampedArray owns a fresh ArrayBuffer (byteOffset === 0, byteLength === buffer.byteLength) so downstream consumers can transfer it to a Worker.

    Performance note in JSDoc: base64 encoding doubles wire size; for the 288×144 max frame (165,888 RGBA bytes), b64 ≈ 221 KB per full frame. Plan 03's delta encoding only sends changed sub-tiles, so per-frame wire cost is typically much smaller. Document for future v2 optimization: consider binary WS transfer (ArrayBuffer over WebSocket) instead of base64; would halve wire size at the cost of breaking JSON envelope uniformity (deferred to Phase 13 per CONTEXT.md §Deferred).

    Envelope contract reference (JSDoc comment near the schema):
    ```
    /**
     * FramePixels travels inside the shared `EnvelopeSchema` from envelope.ts:
     *   { proto: 'evf-v1', seq, ts, type: 'frame_pixels', session_id, payload: FramePixels }
     * Consumers parse the outer envelope via EnvelopeSchema, narrow on type === 'frame_pixels',
     * then parse envelope.payload via FramePixelsSchema (defense-in-depth two-layer safeParse).
     */
    ```

    **2. `packages/shared-protocol/src/index.ts` re-export:**
    Add a line `export { FramePixelsSchema, type FramePixels, encodeFramePixels, decodeFramePixels } from './payloads/frame.js'`. Read the existing re-export pattern (other payload schemas — character / combat / scene / event) to match the export style.

    **3. `packages/shared-protocol/src/payloads/frame.test.ts` (colocated beside frame.ts):**
    Write tests FIRST matching `<behavior>` FP-1..FP-10 (RED phase). Pure Zod + base64 tests — no mocks needed. FP-10 imports `EnvelopeSchema` from `../envelope.js` (or via package re-export) to lock the cross-schema contract. Then implement to GREEN.

    Constraints:
    - shared-protocol must remain dependency-free except for `zod` (per Phase 1 D-1.04). No Foundry runtime imports here.
    - `noUncheckedIndexedAccess`: Uint8ClampedArray reads are safe (typed-array slots return number, not undefined).
    - JSDoc on every export.
    - TDD discipline: tests RED → schema/helpers implementation → GREEN. Commit at green per Conventional Commits scope `shared-protocol`.
    - **Colocation:** test file lives at `packages/shared-protocol/src/payloads/frame.test.ts` (BESIDE `frame.ts`). Do NOT create a `__tests__/` subdirectory.
  </action>
  <verify>
    <automated>pnpm --filter @evf/shared-protocol test --run -- src/payloads/frame.test.ts && grep -c 'FramePixelsSchema' packages/shared-protocol/src/payloads/frame.ts && grep -c 'min(20).max(288)' packages/shared-protocol/src/payloads/frame.ts && grep -c 'min(20).max(144)' packages/shared-protocol/src/payloads/frame.ts && grep -c 'FramePixelsSchema' packages/shared-protocol/src/index.ts && grep -c 'export function encodeFramePixels' packages/shared-protocol/src/payloads/frame.ts && grep -c 'export function decodeFramePixels' packages/shared-protocol/src/payloads/frame.ts && grep -c 'EnvelopeSchema' packages/shared-protocol/src/payloads/frame.test.ts && pnpm typecheck</automated>
  </verify>
  <done>
    Test file (colocated at `packages/shared-protocol/src/payloads/frame.test.ts`) green (10 tests minimum, including FP-10 cross-schema envelope contract); FramePixelsSchema declares 20-288 width + 20-144 height bounds; encode/decode helpers exist; schema + helpers re-exported from package index; pnpm typecheck exits 0.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: foundry-module canvas-extractor + module.ts wiring (TDD; tests colocated)</name>
  <read_first>
    - packages/foundry-module/src/module.ts (existing Hooks.once('init') + ('ready') registration pattern — analog for adding registerCanvasExtractor call)
    - packages/foundry-module/src/readers/hook-subscribers.ts (existing canvasReady hook subscriber — Plan 06's canvas-extractor.ts joins this pattern but with debouncing + extraction)
    - packages/foundry-module/src/readers/scene-reader.ts (existing canvas access pattern — read for the canonical way to access canvas.app.renderer from inside the module)
    - Existing colocated tests in `packages/foundry-module/src/` — `module.test.ts`, `bearer-registry.test.ts`, etc. all sit BESIDE source. Plan 06's `canvas-extractor.test.ts` joins this pattern at `packages/foundry-module/src/canvas-extractor.test.ts` (NOT `src/__tests__/`).
    - packages/foundry-module/src/types/ (any ambient Foundry types; fvtt-types or hand-rolled — verify PIXI extract types are declared or document the deviation)
    - packages/bridge/src/ws/delta-emitter.ts (the bridge-side dispatch surface — confirm whether the existing emitter accepts a typed `frame_pixels` channel or whether Plan 06 must register a new tool/channel)
    - packages/shared-protocol/src/payloads/frame.ts (Task 1 output — FramePixelsSchema + encodeFramePixels)
    - packages/shared-protocol/src/envelope.ts (`EnvelopeSchema` — frame_pixels envelopes wrap `FramePixels` in the `payload` field with `type: 'frame_pixels'` + a required `session_id: z.string().uuid()`)
    - .planning/phases/04a-g2-engine-raster-status-hud/04A-PLAN-CHECK.md §B-5 + §NF-1 + §NF-3 (Foundry-side extraction requirement + EnvelopeSchema correction + colocated tests)
    - .planning/STATE.md (OQ-INV2-4 entry 2026-05-14 — image bounds 20-288×20-144 verified empirically)
    - docs/architecture/0001-layered-ui-model.md §Confirmation (z=0 map is the consumer of this extraction)
    - Specs.md §11.5.7 pitfall 11 (PIXI extract perf cost; informs the 200 ms debounce decision)
  </read_first>
  <files>packages/foundry-module/src/canvas-extractor.ts, packages/foundry-module/src/canvas-extractor.test.ts, packages/foundry-module/src/module.ts</files>
  <behavior>
    - Test CE-1: `registerCanvasExtractor({ emit: vi.fn(), debounceMs: 200 })` — verify that calling `registerCanvasExtractor` registers Hooks for 'canvasReady', 'drawCanvas', 'refreshToken', 'updateScene' (mock Hooks.on; assert call count + channel names).
    - Test CE-2: When a registered hook fires (simulated via the mocked Hooks system + a fake canvas object exposing `.app.renderer.extract.pixels` and `.app.renderer.{width,height}`), `emit` is called after the debounce window (200 ms; vi.useFakeTimers + vi.advanceTimersByTime) with a payload whose shape satisfies `FramePixelsSchema.safeParse(...).success === true` (the test asserts on the typed payload directly, since the bridge layer is responsible for wrapping it in `EnvelopeSchema`).
    - Test CE-3: Two hook fires within 200 ms → only ONE emit (debounce coalescing).
    - Test CE-4: When canvas.app.renderer is undefined (canvas not ready) → emit NOT called; no throw.
    - Test CE-5: `extractCurrentFrame(canvas)` returns a FramePixels object with width === canvas.app.renderer.width (clamped to ≤288), height === canvas.app.renderer.height (clamped to ≤144), pixelsB64 length consistent with width × height × 4 bytes.
    - Test CE-6: Cropping/resizing path — if canvas dimensions exceed bounds, the extractor downscales OR crops (executor choice; document in 04a-06-SUMMARY.md). Test verifies that a canvas reporting 1920×1080 produces an emitted frame with width=288 height=144 (after downscale OR centered crop).
    - Test CE-7: module.ts on 'ready' calls `registerCanvasExtractor` exactly once with an `emit` function whose call shape matches the existing bridgeDeltaEmitter contract (the emitter wraps the typed payload in `EnvelopeSchema` server-side, populating `session_id` from the pair registry).
  </behavior>
  <action>
    **1. `packages/foundry-module/src/canvas-extractor.ts`:**
    Module JSDoc citing 04A-PLAN-CHECK.md §B-5 + §NF-1 + §NF-3, OQ-INV2-4 SDK image bounds (STATE.md 2026-05-14), Specs.md §11.5.7 pitfall 11 (PIXI extract perf — debounce + idle scheduling).

    Imports:
    - `import { FramePixelsSchema, type FramePixels, encodeFramePixels } from '@evf/shared-protocol'`
    - Foundry globals are ambient (no import needed for `Hooks`, `canvas`); if fvtt-types is configured, declare locally:
      ```
      declare const Hooks: { on(event: string, fn: (...args: unknown[]) => void): void };
      declare const canvas: { app?: { renderer?: { extract: { pixels(target?: unknown): Uint8Array }; width: number; height: number } } } | undefined;
      ```
      OR use existing scene-reader.ts conventions.

    Exports:
    - `export interface CanvasExtractorOpts { emit: (payload: FramePixels) => void; debounceMs?: number; targetWidth?: number; targetHeight?: number }` — the `emit` callback receives the typed payload only; the bridge layer is responsible for wrapping it in `EnvelopeSchema` (populating `proto`/`seq`/`ts`/`type='frame_pixels'`/`session_id` from the pair registry). debounceMs default 200; target defaults 288×144 (max bounds).
    - `export function registerCanvasExtractor(opts: CanvasExtractorOpts): UnregisterFn` — registers the 4 hooks (canvasReady, drawCanvas, refreshToken, updateScene) with debounced extraction. Returns an unregister function (calls Hooks.off for each).
    - `export function extractCurrentFrame(canvas: unknown, opts?: { targetWidth?: number; targetHeight?: number }): FramePixels | null` — pure function: reads canvas.app.renderer.extract.pixels, crops or downscales to target dims, builds the FramePixels object. Returns null if canvas is not ready (no app.renderer). This is the testable core; the hook wrapper just schedules a debounced call to it.

    Cropping/resizing strategy (executor decision documented in 04a-06-SUMMARY.md):
    - Option A (downscale via OffscreenCanvas in module): use OffscreenCanvas + drawImage with imageSmoothingQuality='medium' to downscale the canvas → 288×144 in a single op. Pros: full scene visible; cons: smoothing changes pixels (Worker re-quantize will compensate).
    - Option B (center-crop to 288×144): take the center 288×144 region of the rendered canvas. Pros: lossless pixel mapping; cons: cuts off the rest of the scene (player may not see full map).
    - Option C (downscale to fit + letterbox to fill 288×144): downscale preserving aspect ratio, fill with palette-color borders. Pros: full scene visible + uniform output; cons: more complex.
    - **Recommended:** Option C (downscale + letterbox). Provides the best player UX — full scene visible, output uniform for Plan 03 Worker.

    Debounce semantics:
    - Schedule a single `setTimeout(extractAndEmit, debounceMs)` on each hook fire; cancel + reschedule if a hook fires during the window. After debounce expires, call extractCurrentFrame → FramePixels → opts.emit(framePixels). The bridge-side emitter wraps it in `EnvelopeSchema` (proto/seq/ts/type='frame_pixels'/session_id/payload).
    - Wrap extract.pixels in try/catch — if extraction throws (rare, e.g. context lost), log + skip frame. No retry storm.
    - Schedule via `requestIdleCallback` if available (skip the Foundry desktop UI thread); fall back to setTimeout(0) if not. Document the dual-mode in JSDoc.

    **2. `packages/foundry-module/src/canvas-extractor.test.ts` (COLOCATED beside `canvas-extractor.ts` per NF-3):**
    Write tests FIRST matching `<behavior>` CE-1..CE-7 (RED phase). Mock Foundry's `Hooks` global via `vi.stubGlobal('Hooks', { on: vi.fn(), off: vi.fn() })`. Mock `canvas` global with a fake `app.renderer.extract.pixels` that returns a Uint8Array of known bytes. Use `vi.useFakeTimers()` for debounce verification.

    **3. `packages/foundry-module/src/module.ts` wiring:**
    Read the existing `Hooks.once('ready', () => { ... })` block; ADD a call to `registerCanvasExtractor({ emit: payload => bridgeDeltaEmitter.send('frame_pixels', payload) })` (or whatever the existing emitter contract requires — read packages/bridge/src/ws/delta-emitter.ts + the foundry-module's existing emitter wiring to determine the exact call shape; the emitter is responsible for wrapping the payload in `EnvelopeSchema` server-side, including populating `session_id` from the pair registry). Document the chosen wiring in 04a-06-SUMMARY.md (e.g., "used existing bridgeDeltaEmitter.send with 'frame_pixels' channel" vs "added new Phase 3 channel registration").

    Constraints:
    - INV-4 zero dead code: every exported symbol used by module.ts or tests.
    - JSDoc on every public export.
    - Debounce default 200 ms locked to CONTEXT.md Area 2 cadence (matches Plan 03 RasterController debounce).
    - Phase 3 EnvelopeSchema (proto/seq/ts/type/session_id/payload) is wrapped by the bridge side — Plan 06 emits the typed `FramePixels` value; the bridge wraps the envelope and populates `session_id`. If bridge wiring requires a new channel, add a one-line note in 04a-06-SUMMARY.md.
    - **Idempotency:** registerCanvasExtractor MUST be idempotent (calling twice = no-op the second time); document via JSDoc + test if time permits (not in CE-1..7 but add CE-8 if executor adds the guard).
    - **Colocation:** test file lives at `packages/foundry-module/src/canvas-extractor.test.ts` (BESIDE `canvas-extractor.ts`). Do NOT create a `src/__tests__/` subdirectory.
  </action>
  <verify>
    <automated>pnpm --filter @evf/foundry-module test --run -- src/canvas-extractor.test.ts && grep -c "Hooks.on('canvasReady'" packages/foundry-module/src/canvas-extractor.ts && grep -c 'extractCurrentFrame' packages/foundry-module/src/canvas-extractor.ts && grep -c 'registerCanvasExtractor' packages/foundry-module/src/module.ts && grep -c '200' packages/foundry-module/src/canvas-extractor.ts && grep -c 'FramePixelsSchema\|FramePixels' packages/foundry-module/src/canvas-extractor.ts && pnpm typecheck</automated>
  </verify>
  <done>
    Test file (colocated at `packages/foundry-module/src/canvas-extractor.test.ts`) green (7 tests minimum); canvas-extractor registers all 4 hooks; module.ts wires registerCanvasExtractor on ready with a `frame_pixels` emit channel; 200 ms debounce literal present; FramePixels type/schema imported from shared-protocol; pnpm typecheck exits 0.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: g2-app scene-input.ts WS receiver + dispatch to RasterControllerLike (TDD)</name>
  <read_first>
    - packages/g2-app/src/engine/layer-types.ts (Plan 01 — RasterControllerLike type-only contract that scene-input.ts depends on)
    - packages/shared-protocol/src/payloads/frame.ts (Task 1 output — FramePixelsSchema + decodeFramePixels)
    - packages/shared-protocol/src/envelope.ts (`EnvelopeSchema` REAL EXPORT — outer wrap; scene-input parses the envelope via `EnvelopeSchema.safeParse`, narrows on `envelope.type === 'frame_pixels'`, then parses `envelope.payload` via `FramePixelsSchema.safeParse`. **Do NOT import a `WireEnvelopeSchema` — that name does not exist.** **The carrier field is `payload`, not `value`.** **`session_id: z.string().uuid()` is required and is part of the parsed envelope; scene-input is a consumer so it doesn't need to populate it, but the test fixtures must include a valid UUID for `EnvelopeSchema.safeParse` to succeed.**)
    - packages/g2-app/src/engine/capability-handshake.ts (Plan 02 — pattern for ws message listener registration with addEventListener + cleanup; PATTERNS analog)
    - packages/g2-app/src/__tests__/test-helpers/worker-mock.ts (Plan 01 — mock helpers if needed; this plan also needs MockSocket from PATTERNS.md)
    - .planning/phases/04a-g2-engine-raster-status-hud/04A-PATTERNS.md §MockSocket pattern (for WS message-event simulation)
    - .planning/phases/04a-g2-engine-raster-status-hud/04A-PLAN-CHECK.md §B-5 + §NF-1 + §NF-4 (g2-app side WS receiver + EnvelopeSchema correction + transferable-prerequisite scope correction)
    - .planning/phases/04a-g2-engine-raster-status-hud/04A-RESEARCH.md §Common Pitfalls Pitfall 5 (noUncheckedIndexedAccess for typed-array reads)
  </read_first>
  <files>packages/g2-app/src/scene-input.ts, packages/g2-app/src/__tests__/scene-input.test.ts</files>
  <behavior>
    - Test SI-1: `attachSceneInputToWs(mockSocket, mockController)` returns a function (the unsubscribe).
    - Test SI-2: When mockSocket fires a `message` event with a valid envelope `{proto:'evf-v1', seq:1, ts:Date.now(), type:'frame_pixels', session_id:'00000000-0000-4000-8000-000000000000', payload: validFramePixels}` → mockController.requestFrame is called with a Uint8ClampedArray of length === width × height × 4 + correct width + height args.
    - Test SI-3: Invalid envelope (not JSON, or missing required envelope field like `session_id`) → mockController.requestFrame NOT called; console.warn emitted; no throw.
    - Test SI-4: Valid envelope but type !== 'frame_pixels' (e.g., 'character.delta') → mockController.requestFrame NOT called (envelope is for a different consumer).
    - Test SI-5: Valid envelope with type === 'frame_pixels' but `payload` fails `FramePixelsSchema.safeParse` (e.g., width=10 below the 20-min bound) → mockController.requestFrame NOT called; console.warn emitted; no throw.
    - Test SI-6: pixelsB64 length-mismatch (decoded buffer length ≠ width × height × 4) → mockController.requestFrame NOT called (decodeFramePixels throws; caught + logged).
    - Test SI-7 (NF-4 scope — prerequisite-only): After dispatch, verify that the `Uint8ClampedArray` passed to `controller.requestFrame` is backed by its own fresh `ArrayBuffer` so it is transferable-capable. Assertions: `expect(args[0].byteOffset).toBe(0)` AND `expect(args[0].byteLength).toBe(args[0].buffer.byteLength)`. **This test verifies the PREREQUISITE only; the actual `postMessage(msg, [buffer])` zero-copy transfer to the Worker happens inside `RasterController.requestFrame` and is verified end-to-end by Plan 03 RC-2.** Plan 06 does NOT claim end-to-end zero-copy in must_haves (per NF-4 reword).
    - Test SI-8: Calling the returned unsubscribe function removes the ws.message listener (verify via mockSocket.removeEventListener.mock.calls).
  </behavior>
  <action>
    **1. `packages/g2-app/src/scene-input.ts`:**
    Module JSDoc citing 04A-PLAN-CHECK.md §B-5 + §NF-1 + §NF-4, ADR-0002 (envelope versioning), and ADR-0006 (raster pipeline input source).

    Imports (verbatim — NF-1 correction):
    - `import { EnvelopeSchema, FramePixelsSchema, decodeFramePixels } from '@evf/shared-protocol'`
    - `import type { RasterControllerLike } from './engine/layer-types.js'`

    **Critical:** Do NOT import `WireEnvelopeSchema` — that name does not exist in `@evf/shared-protocol`. The real export is `EnvelopeSchema` and its carrier field is `payload`, not `value`. The package's `index.ts` re-exports `EnvelopeSchema` (verified in `packages/shared-protocol/src/index.ts` lines 14-25).

    Exports:
    - `export type UnsubscribeFn = () => void`
    - `export function attachSceneInputToWs(ws: WebSocket, controller: RasterControllerLike): UnsubscribeFn` — registers a `ws.addEventListener('message', handler)` and returns an unsubscribe closure that calls `ws.removeEventListener('message', handler)`.

    Handler implementation (defense-in-depth two-layer safeParse on the real `EnvelopeSchema`):
    1. Parse the raw message body:
       ```
       const handler = (ev: MessageEvent) => {
         try {
           const rawText = typeof ev.data === 'string'
             ? ev.data
             : new TextDecoder().decode(ev.data as ArrayBuffer);
           const raw = JSON.parse(rawText);

           // Outer envelope parse — validates proto/seq/ts/type/session_id (UUID)/payload.
           const env = EnvelopeSchema.safeParse(raw);
           if (!env.success) {
             console.warn('[scene-input] envelope parse failed', env.error);
             return;
           }
           // Discriminate on type — drop non-frame_pixels envelopes silently.
           if (env.data.type !== 'frame_pixels') return;

           // Inner payload parse — FramePixelsSchema validates width/height bounds + base64 shape.
           const fp = FramePixelsSchema.safeParse(env.data.payload);
           if (!fp.success) {
             console.warn('[scene-input] FramePixels payload parse failed', fp.error);
             return;
           }

           // Decode base64 → fresh Uint8ClampedArray (own ArrayBuffer; transferable-capable).
           const pixels = decodeFramePixels(fp.data.pixelsB64, fp.data.width, fp.data.height);

           // Dispatch to controller. Worker transfer (postMessage with [buffer]) is RasterController's responsibility (Plan 03 RC-2).
           controller
             .requestFrame(pixels, fp.data.width, fp.data.height)
             .catch(err => console.warn('[scene-input] requestFrame rejected', err));
         } catch (err) {
           console.warn('[scene-input] message processing failed', err);
         }
       };
       ws.addEventListener('message', handler);
       return () => ws.removeEventListener('message', handler);
       ```

    Constraints:
    - **All Zod parsing uses `.safeParse()`, never `.parse()`** (T-4a-06-02 defense-in-depth).
    - **Use `EnvelopeSchema` (NOT `WireEnvelopeSchema`); access the carrier as `envelope.payload` (NOT `.value`).**
    - decodeFramePixels throws on length-mismatch or bad base64 — handler catches and logs.
    - controller.requestFrame returns a Promise; handler does NOT await (fire-and-forget for the per-frame path) but DOES attach a `.catch` to log rejections without crashing the WS listener.
    - **Transferable buffer (NF-4 scope):** decodeFramePixels in shared-protocol returns a fresh Uint8ClampedArray with its own ArrayBuffer; pass directly to requestFrame. RasterController is responsible for the actual `postMessage(msg, [buffer])` transfer to the Worker (Plan 03 RC-2 verifies end-to-end). Plan 06's SI-7 verifies only the prerequisite (own buffer).
    - JSDoc on every export. JSDoc on `attachSceneInputToWs` explains:
      1. the two-layer safeParse defense-in-depth strategy (`EnvelopeSchema` outer + `FramePixelsSchema` payload),
      2. the requestFrame fire-and-forget pattern,
      3. the transferable-prerequisite contract (own buffer; final Worker transfer is Plan 03 RC-2's responsibility — NF-4 scope clarification).

    **2. `packages/g2-app/src/__tests__/scene-input.test.ts`:**
    Write tests FIRST matching `<behavior>` SI-1..SI-8 (RED phase). Use MockSocket pattern from PATTERNS.md §capability-handshake.test.ts. Mock RasterControllerLike with `{ requestFrame: vi.fn().mockResolvedValue({ frameId: 1, changedTiles: [] }), setBleVerdict: vi.fn(), getBleVerdict: vi.fn(), startIdleHeartbeat: vi.fn(), stopIdleHeartbeat: vi.fn(), terminate: vi.fn() }`. Fire mock ws.message events via `mockSocket.dispatchMessage(JSON.stringify(envelope))`.

    Test fixtures use the REAL envelope shape (NF-1 closure):
    ```
    const validEnvelope = {
      proto: 'evf-v1',
      seq: 1,
      ts: Date.now(),
      type: 'frame_pixels',
      session_id: '00000000-0000-4000-8000-000000000000',  // any valid UUID v4
      payload: { sceneId: 'scene1', width: 288, height: 144, pixelsB64: '...', ts: Date.now() },
    };
    ```

    Constraints:
    - Test path is `packages/g2-app/src/__tests__/scene-input.test.ts` (3 dirs up to `packages/`; matches g2-app's existing `__tests__/` convention for cross-cutting tests — unchanged by NF-3 because g2-app's convention IS `__tests__/` for cross-cutting tests at the package root).
    - JSDoc on every export.
  </action>
  <verify>
    <automated>pnpm --filter @evf/g2-app test --run -- src/__tests__/scene-input.test.ts && grep -c 'attachSceneInputToWs' packages/g2-app/src/scene-input.ts && grep -c 'FramePixelsSchema.safeParse' packages/g2-app/src/scene-input.ts && grep -c 'EnvelopeSchema.safeParse' packages/g2-app/src/scene-input.ts && bash -c '! grep -E "WireEnvelopeSchema|envelope\\.value|env\\.data\\.value" packages/g2-app/src/scene-input.ts' && grep -c 'decodeFramePixels' packages/g2-app/src/scene-input.ts && grep -c "removeEventListener\\|removeListener" packages/g2-app/src/scene-input.ts && grep -c 'controller.requestFrame' packages/g2-app/src/scene-input.ts && pnpm typecheck && pnpm lint:ci</automated>
  </verify>
  <done>
    Test file green (8 tests minimum); scene-input.ts exports attachSceneInputToWs; both safeParse calls present using the REAL exports (`EnvelopeSchema.safeParse` + `FramePixelsSchema.safeParse` — defense-in-depth); no `WireEnvelopeSchema` or `.value` references anywhere (NF-1 negative grep gate passes); decodeFramePixels called; removeEventListener present (unsubscribe semantics); controller.requestFrame dispatch present; pnpm typecheck + lint:ci both exit 0.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Foundry PIXI canvas → canvas-extractor | Trusted (player's own desktop renderer); pixel data is identical to what player sees |
| Canvas-extractor → bridge WS | Phase 3 `EnvelopeSchema` (proto/seq/ts/type/session_id + bearer auth + per-token rate limit); enforced by Phase 3 bridge contract |
| Bridge WS → g2-app scene-input | Untrusted message envelope crosses into g2-app; MUST safeParse via `EnvelopeSchema` (outer) + `FramePixelsSchema` (inner `envelope.payload`) before reaching RasterController |
| Base64 decode (scene-input → controller) | Bounded buffer size; max 288 × 144 × 4 = 165,888 bytes RGBA per frame |
| scene-input → Worker (via RasterController) | Plan 03 RasterController owns the Worker postMessage transfer (transferable ArrayBuffer); Plan 06 hands a fresh Uint8ClampedArray that owns its buffer (prerequisite only — NF-4 scope) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-4a-06-01 | D | canvas-extractor.ts PIXI extraction blocks Foundry desktop UI thread | mitigate | 200 ms debounce + requestIdleCallback / setTimeout(0) scheduling; real-device perf gate = human_needed per ADR-0005 SC #5 |
| T-4a-06-02 | T | scene-input.ts WS message parse | mitigate | JSON.parse in try/catch; `EnvelopeSchema.safeParse` + `FramePixelsSchema.safeParse` (defense-in-depth two-layer parse on REAL exports per NF-1); decodeFramePixels validates length; failures log + drop, never throw |
| T-4a-06-03 | I | frame_pixels payload contains scene tokens | accept | Same scene already visible on player's Foundry desktop; no new disclosure surface |
| T-4a-06-04 | S | Bridge frame_pixels endpoint authorization | mitigate | Reuses existing Phase 3 bearer auth + per-token rate limit; reuses existing `EnvelopeSchema` (adds `type: 'frame_pixels'` discriminant; `session_id` populated from pair registry); no new auth surface |
| T-4a-06-05 | D | Transferable ArrayBuffer hand-off | mitigate | scene-input hands a fresh Uint8ClampedArray (own buffer; Plan 06 SI-7 verifies the prerequisite); RasterController owns the actual Worker transfer (Plan 03 RC-2 verifies end-to-end zero-copy) |
| T-4a-06-06 | D | Memory growth on rapid hook fires | mitigate | Debounce 200 ms caps emit rate to ≤5/s; single fresh Uint8ClampedArray allocation per emit; old buffers garbage-collected after debounce window |
</threat_model>

<verification>
- `pnpm --filter @evf/shared-protocol test --run` exits 0 with `src/payloads/frame.test.ts` green (colocated per NF-3)
- `pnpm --filter @evf/foundry-module test --run` exits 0 with `src/canvas-extractor.test.ts` green (colocated per NF-3)
- `pnpm --filter @evf/g2-app test --run` exits 0 with `src/__tests__/scene-input.test.ts` green (g2-app convention unchanged)
- `pnpm typecheck && pnpm lint:ci && pnpm test:coverage` exit 0 across full workspace
- FramePixelsSchema bounds 20-288 × 20-144 verified by FP-2..FP-4 tests; cross-schema envelope contract verified by FP-10
- canvas-extractor registers 4 Foundry hooks + debounces at 200 ms (matches Plan 03 RasterController cadence)
- scene-input.ts safeParse-validates at both envelope (`EnvelopeSchema` — NF-1 corrected from `WireEnvelopeSchema`) and FramePixels layers (defense-in-depth); negative grep gate confirms no `WireEnvelopeSchema` / `.value` / `env.data.value` references remain
- Plan 05 smoke test SR-9 verifies the end-to-end chain: MockSocket emits frame_pixels envelope (proto/seq/ts/type/session_id/payload) → scene-input → RasterController.requestFrame

**Hardware-pending verifications (verification_mode: human_needed per ADR-0005 PROVISIONAL Branch A):**
- SC #5: PIXI canvas extract via OffscreenCanvas does NOT block Foundry desktop UI — requires real Foundry desktop with active player session + token drag. Documented in Plan 05 Task 3 checkpoint.
</verification>

<success_criteria>
Plan 06 closes when:
- MAP-01 fully addressed software-side: Foundry PIXI canvas extraction → `EnvelopeSchema { type: 'frame_pixels', session_id, payload: FramePixels }` wire protocol → g2-app scene-input dispatch → RasterController.requestFrame chain is implemented and tested end-to-end against mocks. Plan 03 raster pipeline now has its data source.
- `FramePixelsSchema` is re-exported from `@evf/shared-protocol` main entry; both bridge and g2-app safeParse-validate (defense-in-depth) using the REAL `EnvelopeSchema` outer + `FramePixelsSchema` inner pattern per NF-1
- canvas-extractor registers debounced hooks on Foundry side; emit function is wired to Phase 3 bridge dispatch in module.ts ready hook with a `frame_pixels` channel
- scene-input.ts unsubscribe function returned; Plan 05 bootEngine wires + teardown calls it
- All three packages (shared-protocol, foundry-module, g2-app) typecheck + lint + test green; cross-package boundary respected (no package depends on another's internals); tests colocated beside source per NF-3 (shared-protocol payloads/, foundry-module src/, g2-app uses its existing __tests__/ convention)
- B-5 closure: Plan 03's RasterController.requestFrame entry point is now CALLED by Plan 06's scene-input.ts on every WS frame_pixels message
- NF-1 closure: zero `WireEnvelopeSchema` / `envelope.value` / `env.data.value` references anywhere in plan-derived code (negative grep gate enforces)
- NF-3 closure: test paths colocated per established convention; verify gates updated accordingly
- NF-4 closure: must_haves truths describe SI-7 scope honestly (prerequisite only; end-to-end zero-copy lives in Plan 03 RC-2)
- Plan 05 Task 1 SR-9 smoke test validates the composed chain
- Hardware-pending SC #5 (PIXI extract perf on real Foundry desktop) carries human_needed gate; Plan 05 Task 3 checkpoint surfaces it for operator acknowledgment
</success_criteria>

<output>
After completion, create `.planning/phases/04a-g2-engine-raster-status-hud/04a-06-SUMMARY.md` capturing:
- FramePixelsSchema final shape (including any deviations from the planner-specified bounds — e.g., if executor needed to relax/tighten width/height for SDK compatibility)
- Cropping/resizing strategy chosen (Option A downscale / Option B center-crop / Option C downscale+letterbox)
- module.ts wiring approach (existing bridgeDeltaEmitter reuse on 'frame_pixels' channel vs. new Phase 3 channel registration)
- Test counts per file (target: 10 frame.test (colocated) + 7 canvas-extractor.test (colocated) + 8 scene-input.test (g2-app __tests__/) = 25 minimum)
- Wire-size estimate per frame (base64 of 288×144×4 = ~221 KB max payload; envelope adds ~150 bytes; delta path much smaller)
- Hardware-pending TODO references (e.g., `// TODO(ADR-0005-SC5): verify PIXI extract perf on real Foundry desktop`)
- B-5 closure confirmation: data source path is wired end-to-end software-side; Plan 03's requestFrame is now reachable from a real Foundry hook
- NF-1 closure: `EnvelopeSchema` + `envelope.payload` + required `session_id` used verbatim (no `WireEnvelopeSchema`, no `.value`)
- NF-3 closure: tests colocated beside source for shared-protocol + foundry-module (g2-app uses its existing __tests__/ convention)
- NF-4 closure: SI-7 truth describes prerequisite-only scope; final Worker transfer is Plan 03 RC-2's responsibility
- Cross-package commit list (one commit per package: shared-protocol, foundry-module, g2-app + module.ts wiring commit)
</output>
