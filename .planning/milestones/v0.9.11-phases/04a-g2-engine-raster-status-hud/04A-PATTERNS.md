# Phase 4a: G2 Engine + Raster + Status HUD — Pattern Map

**Mapped:** 2026-05-14
**Files analyzed:** 22 new/modified files
**Analogs found:** 20 / 22

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `packages/g2-app/src/engine/layer-types.ts` | utility | — | `packages/g2-app/src/wizard/state.ts` | role-match (type/enum defs) |
| `packages/g2-app/src/engine/layer-manager.ts` | service | event-driven | `packages/g2-app/src/wizard/wizard.ts` | role-match (singleton orchestrator) |
| `packages/g2-app/src/engine/page-lifecycle.ts` | service | request-response | `packages/g2-app/src/hub-polyfill.ts` | role-match (EvenAppBridge wrapper) |
| `packages/g2-app/src/engine/capability-handshake.ts` | service | request-response | `packages/bridge/src/ws/handshake.ts` | exact (same WS handshake, client side) |
| `packages/g2-app/src/engine/boot-splash.ts` | component | request-response | `packages/g2-app/src/wizard/steps/completion.ts` | role-match (sequential render flow) |
| `packages/g2-app/src/engine/__tests__/layer-manager.test.ts` | test | — | `packages/bridge/src/ws/handshake.test.ts` | role-match (mock-heavy unit test) |
| `packages/g2-app/src/engine/__tests__/capability-handshake.test.ts` | test | — | `packages/bridge/src/ws/handshake.test.ts` | exact (WS mock pattern) |
| `packages/g2-app/src/engine/__tests__/page-lifecycle.test.ts` | test | — | `packages/g2-app/src/wizard/auto-connect.test.ts` | role-match (EvenAppBridge mock) |
| `packages/g2-app/src/raster/raster-worker.ts` | utility | batch | — | no analog (first Web Worker in codebase) |
| `packages/g2-app/src/raster/raster-controller.ts` | service | event-driven | `packages/bridge/src/ws/delta-emitter.ts` | role-match (singleton, event-fan-out) |
| `packages/g2-app/src/raster/map-base-layer.ts` | component | event-driven | `packages/g2-app/src/wizard/wizard.ts` | role-match (delegates to sub-renderers) |
| `packages/g2-app/src/raster/tile-delta.ts` | utility | transform | `packages/shared-render/src/ascii-grid.ts` | role-match (pure transform, noUncheckedIndexedAccess pattern) |
| `packages/g2-app/src/raster/rle-encoder.ts` | utility | transform | `packages/shared-render/src/ascii-grid.ts` | role-match (pure transform utility) |
| `packages/g2-app/src/raster/glyph-renderer.ts` | component | request-response | `packages/g2-app/src/wizard/steps/completion.ts` | role-match (renders to EvenAppBridge) |
| `packages/g2-app/src/raster/__tests__/*.test.ts` | test | — | `packages/bridge/src/ws/delta-emitter.test.ts` | role-match (class unit tests) |
| `packages/g2-app/src/status-hud/status-hud-layer.ts` | service | event-driven | `packages/g2-app/src/wizard/wizard.ts` | role-match (subscribes to store, delegates render) |
| `packages/g2-app/src/status-hud/status-hud-renderer.ts` | utility | transform | `packages/g2-app/src/wizard/i18n.ts` | role-match (pure transform, locale-aware) |
| `packages/g2-app/src/status-hud/i18n-budgets.ts` | utility | — | `packages/g2-app/src/wizard/i18n.ts` | role-match (i18n locale map + validation) |
| `packages/g2-app/src/status-hud/idle-infill-layer.ts` | component | event-driven | `packages/g2-app/src/wizard/wizard.ts` | role-match (layer lifecycle + EvenAppBridge calls) |
| `packages/g2-app/src/status-hud/__tests__/*.test.ts` | test | — | `packages/g2-app/src/__tests__/example-status-hud.test.ts` | exact (AsciiGrid + matchAsciiFixture pattern) |
| `packages/shared-render/src/fixtures/*.txt` | fixture | — | `packages/shared-render/src/fixtures/status-hud-baseline.txt` | exact |
| `docs/architecture/0009-layer-manager-contract.md` | config | — | `docs/architecture/0001-layered-ui-model.md` | exact (MADR frontmatter + section structure) |

---

## Pattern Assignments

### `packages/g2-app/src/engine/layer-types.ts` (utility, type definitions)

**Analog:** `packages/g2-app/src/wizard/state.ts`

**Imports pattern** (lines 1-5 of state.ts):
```typescript
/**
 * TSDoc header: what this module exports, which ADR/spec sections bind it.
 *
 * @see docs/architecture/0009-layer-manager-contract.md
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04a-CONTEXT.md Area 1
 */
```

**Core enum + interface pattern** (lines 11-67 of state.ts):
```typescript
// Discriminated enum for compile-time z-index correctness
export enum ZIndex {
  Z0_MAP = 0,
  Z0_5_IDLE_INFILL = 0.5,
  Z1_STATUS_HUD = 1,
  Z2_OVERLAY = 2,
}

// Plain TS interface — no class, no inheritance (D-2.04)
export interface Layer {
  /** Stable identifier for this layer instance. */
  readonly id: string;
  /** Draw/refresh the layer — called by LayerManager on demand. */
  draw(): Promise<void>;
  /** Tear down containers and release all resources. */
  destroy(): void;
  /**
   * If this layer provides the capture container, return its container name.
   * Exactly one mounted layer at a time must return a non-undefined value.
   */
  getCaptureContainer?(): string;
}

// Tagged union for atomic bundle operations
export type LayerOp =
  | { type: 'mount'; z: ZIndex; layer: Layer }
  | { type: 'destroy'; z: ZIndex };
```

**Error type pattern** (lines 22-31 of state.ts):
```typescript
// Typed discriminated error — never throw raw Error strings
export type LayerManagerErrorCode =
  | 'capture_invariant_violated'
  | 'capability_gate_denied'
  | 'z_already_occupied'
  | 'z_not_mounted';

export class LayerManagerError extends Error {
  constructor(
    public readonly code: LayerManagerErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'LayerManagerError';
  }
}
```

---

### `packages/g2-app/src/engine/layer-manager.ts` (service, event-driven)

**Analog:** `packages/g2-app/src/wizard/wizard.ts` (singleton orchestrator pattern) + `packages/g2-app/src/wizard/state.ts` (observable store pattern)

**Module-level singleton + jsdoc pattern** (wizard.ts lines 1-34):
```typescript
/**
 * LayerManager singleton — orchestrates z-stack mount/destroy/bundle operations.
 *
 * Enforces:
 *   - Exactly one isEventCapture=1 container per page at all times (INV-5 / ADR-0001)
 *   - Capability gate: refuses mount if required caps not in negotiated SERVER_CAPS_V1
 *   - Atomic bundle: `bundle(ops)` serializes as a single rebuildPageContainer call
 *
 * No virtual DOM (CLAUDE.md D-2.04). All I/O is via EvenAppBridge.
 *
 * @see docs/architecture/0009-layer-manager-contract.md (ADR-0009)
 * @see docs/architecture/0001-layered-ui-model.md (ADR-0001 + Amendment 1)
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04a-CONTEXT.md Area 1
 */
import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';
import type { ServerCap } from '@evf/shared-protocol';
```

**Private-state + invariant-assert pattern** (wizard.ts destroyCurrentStep + renderStep, lines 143-210):
```typescript
export class LayerManager {
  private readonly layers = new Map<ZIndex, Layer>();
  private negotiatedCaps: ReadonlySet<ServerCap> = new Set();

  constructor(private readonly bridge: EvenAppBridge) {}

  mount(z: ZIndex, layer: Layer, requiredCaps: ServerCap[] = []): void {
    // Capability gate (CONTEXT.md Area 1 locked decision)
    for (const cap of requiredCaps) {
      if (!this.negotiatedCaps.has(cap)) {
        throw new LayerManagerError('capability_gate_denied', `cap '${cap}' not negotiated`);
      }
    }
    this.layers.set(z, layer);
    this._assertCaptureInvariant();
  }

  destroy(z: ZIndex): void {
    this.layers.delete(z);
    this._assertCaptureInvariant();
  }

  /** Atomic bundle: all ops applied then single rebuildPageContainer call. */
  async bundle(ops: LayerOp[]): Promise<void> {
    for (const op of ops) {
      if (op.type === 'mount') this.layers.set(op.z, op.layer);
      else this.layers.delete(op.z);
    }
    this._assertCaptureInvariant();
    await this._flushPage();
  }

  private _assertCaptureInvariant(): void {
    const captureCount = [...this.layers.values()].filter(
      (l) => l.getCaptureContainer?.() !== undefined,
    ).length;
    if (captureCount !== 1) {
      throw new LayerManagerError(
        'capture_invariant_violated',
        `expected 1 capture container, found ${captureCount}`,
      );
    }
  }
}
```

---

### `packages/g2-app/src/engine/page-lifecycle.ts` (service, request-response)

**Analog:** `packages/g2-app/src/hub-polyfill.ts`

**EvenAppBridge import + singleton-get pattern** (hub-polyfill.ts lines 56-99):
```typescript
import {
  CreateStartUpPageContainer,
  EvenAppBridge,
  ImageContainerProperty,
  RebuildPageContainer,
  TextContainerProperty,
  waitForEvenAppBridge,
  StartUpPageCreateResult,
} from '@evenrealities/even_hub_sdk';

/**
 * Wait for the SDK bridge and create the startup page.
 * Must be called exactly once at app boot. On failure throws — caller handles graceful-degrade.
 */
export async function createBootPage(): Promise<EvenAppBridge> {
  const bridge = await waitForEvenAppBridge();
  const result = await bridge.createStartUpPageContainer(
    new CreateStartUpPageContainer({ /* ... */ }),
  );
  if (result !== StartUpPageCreateResult.success) {
    throw new Error(`G2 page boot failed: ${result}`);
  }
  return bridge;
}
```

**Error handling pattern** (hub-polyfill.ts lines 97-102):
```typescript
let bridge: EvenAppBridge | null = null;
try {
  bridge = EvenAppBridge.getInstance();
} catch (e) {
  console.warn('[EVF] page-lifecycle: EvenAppBridge.getInstance() threw — bridge unavailable:', e);
}
```

---

### `packages/g2-app/src/engine/capability-handshake.ts` (service, request-response)

**Analog:** `packages/bridge/src/ws/handshake.ts` (server side of same handshake)

**Imports pattern** (handshake.ts lines 19-30):
```typescript
import {
  HandshakeClientSchema,
  type HandshakeServer,
  HandshakeServerSchema,
  SERVER_CAPS_V1,
} from '@evf/shared-protocol';
import type { WebSocket } from 'ws';
```
For the client side, replace the `ws` type import with native `WebSocket`.

**Core handshake send + receive pattern** (handshake.ts lines 61-170, client-side inversion):
```typescript
/**
 * Perform WS capability handshake with the bridge.
 *
 * Sends HandshakeClientSchema message, awaits HandshakeServerSchema response.
 * On schema parse failure or timeout, rejects with a typed error.
 *
 * @returns Negotiated HandshakeServer payload (server_caps, session_id, replay_seq)
 */
export async function performHandshake(
  ws: WebSocket,
  token: string,
  locale: string,
  sessionId?: string,
): Promise<HandshakeServer> {
  const clientMsg = {
    proto: 'evf-v1' as const,
    token,
    locale,
    capabilities: [...SERVER_CAPS_V1],
    ...(sessionId !== undefined ? { session_id: sessionId } : {}),
  };
  ws.send(JSON.stringify(clientMsg));

  return new Promise((resolve, reject) => {
    ws.addEventListener('message', (ev) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(ev.data as string);
      } catch {
        reject(new HandshakeError('parse_failed', 'Non-JSON handshake response'));
        return;
      }
      const result = HandshakeServerSchema.safeParse(parsed);
      if (!result.success) {
        reject(new HandshakeError('schema_failed', result.error.message));
        return;
      }
      resolve(result.data);
    }, { once: true });
  });
}
```

**BLE probe pattern** (after handshake — new, no analog — use RESEARCH.md code examples):
```typescript
// After handshake: probe BLE throughput to decide Branch A (raster) vs Branch B/C (glyph)
// server_caps intersection drives LayerManager.setNegotiatedCaps(server.server_caps)
// BLE <100 kbps threshold → layerManager.setMapMode('glyph') else 'raster'
```

---

### `packages/g2-app/src/engine/boot-splash.ts` (component, request-response)

**Analog:** `packages/g2-app/src/wizard/steps/completion.ts` (sequential init + render pattern)

**Render-and-return pattern** (completion.ts structure):
```typescript
/**
 * Boot splash — renders the 5-step checklist on the G2 boot page.
 *
 * Calls createBootPage(), renders checklist steps one-by-one via textContainerUpgrade,
 * then transitions to the main page by calling shutDownPageContainer + createBootPage(mainPage).
 *
 * @see 04A-UI-SPEC.md §Screen 1 — Boot Splash
 */
export async function showBootSplash(bridge: EvenAppBridge): Promise<void> {
  // 5-step sequential checklist — each step updates the boot-splash text container
  const steps = [
    '[1/5] Connessione bridge ...',
    '[2/5] Handshake ...',
    '[3/5] Personaggio ...',
    '[4/5] Scena ...',
    '[5/5] HUD ...',
  ];
  for (const step of steps) {
    await bridge.textContainerUpgrade(/* ... */);
  }
}
```

---

### `packages/g2-app/src/engine/__tests__/layer-manager.test.ts` (test)

**Analog:** `packages/bridge/src/ws/handshake.test.ts`

**Mock factory + describe/it pattern** (handshake.test.ts lines 30-90):
```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock EvenAppBridge — minimal surface the LayerManager touches
function makeMockBridge() {
  return {
    createStartUpPageContainer: vi.fn().mockResolvedValue('success'),
    rebuildPageContainer: vi.fn().mockResolvedValue('success'),
    textContainerUpgrade: vi.fn().mockResolvedValue(undefined),
    updateImageRawData: vi.fn().mockResolvedValue('success'),
    shutDownPageContainer: vi.fn().mockResolvedValue(undefined),
  };
}

// Layer factory with capture-container support
function makeMockLayer(id: string, captureContainer?: string): Layer {
  return {
    id,
    draw: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn(),
    ...(captureContainer !== undefined
      ? { getCaptureContainer: () => captureContainer }
      : {}),
  };
}

describe('LayerManager — capture-container invariant', () => {
  let bridge: ReturnType<typeof makeMockBridge>;
  let lm: LayerManager;

  beforeEach(() => {
    bridge = makeMockBridge();
    lm = new LayerManager(bridge as unknown as EvenAppBridge);
  });

  it('enforces exactly 1 capture container after mount()', () => {
    const mapLayer = makeMockLayer('map', 'map-capture');
    const hudLayer = makeMockLayer('hud'); // no capture
    lm.mount(ZIndex.Z0_MAP, mapLayer);
    lm.mount(ZIndex.Z1_STATUS_HUD, hudLayer);
    // No throw = invariant satisfied
    expect(() => lm.mount(ZIndex.Z0_MAP, mapLayer)).not.toThrow();
  });

  it('throws capture_invariant_violated when 0 capture containers exist', () => {
    const noCaptureLayer = makeMockLayer('bad');
    expect(() => lm.mount(ZIndex.Z0_MAP, noCaptureLayer)).toThrow(LayerManagerError);
  });

  it('throws capture_invariant_violated when 2 capture containers exist', () => {
    const layer1 = makeMockLayer('a', 'cap-a');
    const layer2 = makeMockLayer('b', 'cap-b');
    lm.mount(ZIndex.Z0_MAP, layer1);
    expect(() => lm.mount(ZIndex.Z1_STATUS_HUD, layer2)).toThrow(LayerManagerError);
  });
});
```

---

### `packages/g2-app/src/engine/__tests__/capability-handshake.test.ts` (test)

**Analog:** `packages/bridge/src/ws/handshake.test.ts`

**MockSocket pattern** (handshake.test.ts lines 40-58):
```typescript
import { EventEmitter } from 'node:events';

// Client-side test: MockSocket that can fire 'message' from the test
interface MockSocket extends EventEmitter {
  send: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
}

function makeMockSocket(): MockSocket {
  const emitter = new EventEmitter() as MockSocket;
  emitter.send = vi.fn();
  emitter.close = vi.fn();
  // Native WebSocket uses addEventListener, not .on — bridge the gap
  emitter.addEventListener = vi.fn((event: string, handler: (ev: { data: string }) => void) => {
    emitter.once(event, (data: string) => handler({ data }));
  });
  emitter.removeEventListener = vi.fn();
  return emitter;
}
```

---

### `packages/g2-app/src/raster/raster-worker.ts` (utility, batch)

**No close analog** — first Web Worker in the codebase. Use RESEARCH.md Pattern 2 directly.

**Worker entry boilerplate** (from RESEARCH.md lines 322-338):
```typescript
/**
 * Raster pipeline Web Worker — long-lived singleton.
 *
 * Owns: OffscreenCanvas + image-q + upng-js + xxhash-wasm instances.
 * Receives: RasterRequest via postMessage (main thread → worker).
 * Sends: RasterResponse via postMessage (worker → main thread, Transferable).
 *
 * IMPORTANT: Do NOT import any DOM-bound APIs here. All three raster libs are
 * worker-safe (no DOM dep). See ADR-0006 Branch A.
 *
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04A-RESEARCH.md Pattern 2
 */
import { createXXHash3 } from 'xxhash-wasm';
import * as ImageQ from 'image-q';
import * as UPNG from 'upng-js';

// Types declared inline — Worker-internal only, not shared-protocol
interface RasterRequest {
  frameId: number;
  pixelData: ImageData;
  width: number;
  height: number;
}

interface RasterResponse {
  frameId: number;
  changedTiles: ChangedTile[];
}

interface ChangedTile {
  index: number;      // 0-3 (which of the 4 200×100 tiles)
  pngBytes: Uint8Array;
}

// Lazy WASM init — first frame request triggers init
let xxhash: Awaited<ReturnType<typeof createXXHash3>> | null = null;

self.onmessage = async (ev: MessageEvent<RasterRequest>) => {
  // ... 10-stage pipeline per RESEARCH.md architecture diagram
};
```

**noUncheckedIndexedAccess guard pattern** (ascii-grid.ts lines 24-27 — canonical precedent):
```typescript
// For tile hash array access, follow AsciiGrid's guard pattern:
const prevHash = prevHashes[i] ?? 0;  // NOT prevHashes[i] directly
const currHash = currHashes[i] ?? 0;
```

---

### `packages/g2-app/src/raster/raster-controller.ts` (service, event-driven)

**Analog:** `packages/bridge/src/ws/delta-emitter.ts` (singleton with Map + event fanout)

**Singleton class + Map pattern** (delta-emitter.ts lines 65-80):
```typescript
/**
 * RasterController — main-thread orchestrator for the singleton raster Worker.
 *
 * Manages: Worker lifecycle, MessageChannel request/response, frame debounce,
 * idle heartbeat (0.3 fps when idle per Specs §7.4b.6.1 Layer 6).
 *
 * Frame trigger: event-driven on Foundry canvas `update` hook + 200 ms debounce.
 *
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04A-RESEARCH.md Pattern 2
 */
export class RasterController {
  // Vite Web Worker import pattern (RESEARCH.md Pitfall 4)
  private readonly worker = new Worker(
    new URL('./raster-worker.ts', import.meta.url),
    { type: 'module' },
  );
  private frameId = 0;
  private readonly pending = new Map<number, { resolve: (r: RasterResponse) => void }>();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private idleTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly bridge: EvenAppBridge) {
    this.worker.onmessage = (ev: MessageEvent<RasterResponse>) => {
      const pending = this.pending.get(ev.data.frameId);
      if (pending !== undefined) {
        this.pending.delete(ev.data.frameId);
        pending.resolve(ev.data);
      }
    };
  }
}
```

---

### `packages/g2-app/src/raster/tile-delta.ts` (utility, transform)

**Analog:** `packages/shared-render/src/ascii-grid.ts` (pure transform utility with noUncheckedIndexedAccess guards)

**Pure utility class pattern** (ascii-grid.ts lines 12-52):
```typescript
/**
 * Sub-tile delta hash table for the raster pipeline.
 *
 * Stores xxhash3 hashes for 72 sub-tiles per full frame (4 tiles × 18 sub-tiles each).
 * Compares prev vs curr hashes to identify changed tiles.
 *
 * `noUncheckedIndexedAccess` guard: all array reads use `?? 0` fallback per AsciiGrid precedent.
 *
 * @see packages/shared-render/src/ascii-grid.ts (noUncheckedIndexedAccess precedent)
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04a-CONTEXT.md Area 2
 */
export class TileDelta {
  private prevHashes: Uint32Array;
  readonly subTileCount: number;

  constructor(tilesPerFrame: number, subTilesPerTile: number) {
    this.subTileCount = tilesPerFrame * subTilesPerTile;
    this.prevHashes = new Uint32Array(this.subTileCount);
  }

  /** Returns indices of tiles that changed vs. previous frame. */
  detectChanges(currHashes: Uint32Array): number[] {
    const changed: number[] = [];
    for (let i = 0; i < this.subTileCount; i++) {
      const prev = this.prevHashes[i] ?? 0;  // noUncheckedIndexedAccess guard
      const curr = currHashes[i] ?? 0;
      if (prev !== curr) changed.push(i);
    }
    this.prevHashes = currHashes;
    return changed;
  }
}
```

---

### `packages/g2-app/src/raster/glyph-renderer.ts` (component, request-response)

**Analog:** `packages/g2-app/src/wizard/steps/completion.ts` (renders content to a fixed container)

**Render-function with EvenAppBridge pattern** (completion.ts structure + hub-polyfill.ts SDK usage):
```typescript
/**
 * Glyph mode renderer — maps the Foundry scene to a 96×24 ASCII char grid
 * and pushes it to the z=0 text container via textContainerUpgrade.
 *
 * Called by MapBaseLayer when BLE mode is 'glyph' or 'auto' with <100 kbps.
 * Character mapping: @ PC, M monster, N NPC, o object; cardinal facing arrows.
 *
 * @see packages/shared-render/src/fixtures/glyph-scene.*.txt (INV-1 fixtures)
 * @see 04A-UI-SPEC.md §Map Base Layer — Glyph Mode
 */
import { AsciiGrid } from '@evf/shared-render';
import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';

export async function renderGlyphScene(
  bridge: EvenAppBridge,
  sceneData: SceneSnapshot,
): Promise<void> {
  const grid = buildGlyphGrid(sceneData);
  const content = grid.toString();
  // textContainerUpgrade per OQ-INV2-1 — no createTextContainer
  await bridge.textContainerUpgrade(/* containerName: 'map-glyph', content */);
}
```

---

### `packages/g2-app/src/status-hud/status-hud-layer.ts` (service, event-driven)

**Analog:** `packages/g2-app/src/wizard/wizard.ts` (subscribe to store, delegate to renderer)

**Store subscribe + draw pattern** (wizard.ts lines 114-219):
```typescript
/**
 * StatusHudLayer — always-visible z=1 layer implementing the Layer interface.
 *
 * Subscribes to WS character.delta envelopes (Phase 3 DeltaEmitter fanout).
 * Debounces 200 ms; idle heartbeat re-render every 30 s for stale-state recovery.
 * Never captures input (getCaptureContainer returns undefined).
 *
 * @see 04A-UI-SPEC.md §Status HUD Corner Card
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04a-CONTEXT.md Area 3
 */
export class StatusHudLayer implements Layer {
  readonly id = 'status-hud';
  private unsubscribe: (() => void) | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly bridge: EvenAppBridge,
    private readonly renderer: StatusHudRenderer,
    private readonly wsEvents: EventTarget,  // or observable store
  ) {}

  async draw(): Promise<void> {
    // render current state → textContainerUpgrade
  }

  destroy(): void {
    this.unsubscribe?.();
    if (this.debounceTimer !== null) clearTimeout(this.debounceTimer);
    if (this.heartbeatTimer !== null) clearInterval(this.heartbeatTimer);
  }
  // No getCaptureContainer — z=1 is read-only
}
```

---

### `packages/g2-app/src/status-hud/status-hud-renderer.ts` (utility, transform)

**Analog:** `packages/g2-app/src/wizard/i18n.ts` (pure transform function, locale-aware, no side effects)

**Pure function + locale parameter pattern** (i18n.ts lines 117-127):
```typescript
/**
 * Render a CharacterSnapshot into an AsciiGrid for the status HUD corner card.
 *
 * Width-budgeted: all field labels and values are pre-validated against the
 * build-time i18n width budget table. Runtime overflow → truncate with '…' + telemetry.
 *
 * @see packages/g2-app/src/status-hud/i18n-budgets.ts (per-field max widths)
 * @see packages/shared-render/src/fixtures/status-hud.*.txt (INV-1 fixtures)
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04a-CONTEXT.md Area 3
 */
import { AsciiGrid } from '@evf/shared-render';
import type { CharacterSnapshot } from '@evf/shared-protocol';

export class StatusHudRenderer {
  constructor(private readonly locale: 'it' | 'en' | 'de') {}

  /** Render a loaded snapshot. Never throws — missing fields → '—' em-dash placeholder. */
  render(snapshot: CharacterSnapshot): AsciiGrid {
    // width-budgeted rendering per i18n-budgets.ts
  }

  /** Loading state (before first WS delta): all value columns show '…'. */
  renderLoading(): AsciiGrid {
    // column-aligned '…' placeholder per CONTEXT.md Area 3
  }
}
```

**Missing-data fallback pattern** (i18n.ts lines 120-126):
```typescript
// em-dash for missing scalar — never collapse layout
const hp = snapshot.hp !== undefined ? String(snapshot.hp) : '—';
// truncate with … on overflow — never reflow
const truncated = value.length <= budget ? value : `${value.slice(0, budget - 1)}…`;
```

---

### `packages/g2-app/src/status-hud/i18n-budgets.ts` (utility, type definitions)

**Analog:** `packages/g2-app/src/wizard/i18n.ts` + `packages/g2-app/src/wizard/wizard.ts` (ALL_I18N_KEYS pattern)

**Const-as-truth + validation function pattern** (wizard.ts lines 41-91):
```typescript
/**
 * Build-time i18n width-budget table for the Status HUD.
 *
 * Each entry: maximum character width a field label or value may occupy in the
 * 28-char Status HUD column (col 68-95), across IT + EN + DE locales.
 *
 * CI gate: any translation string exceeding its budget fails pnpm typecheck
 * via a type-level assertion (satisfies WidthBudgetRow).
 *
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04a-CONTEXT.md Area 3 (I18N width budget)
 * @see 04A-UI-SPEC.md §I18N Width Budgets
 */
export const HUD_WIDTH_BUDGETS = {
  hp_label:        { it: 2, en: 2, de: 2, max: 2 },
  hp_value:        { it: 7, en: 7, de: 7, max: 7 },  // "000/000" format
  ac_label:        { it: 2, en: 2, de: 2, max: 2 },
  ac_value:        { it: 3, en: 3, de: 3, max: 3 },
  speed_label:     { it: 5, en: 5, de: 5, max: 5 },
  speed_value:     { it: 6, en: 6, de: 6, max: 6 },  // "000 ft" or "000 m"
  conditions:      { it: 26, en: 26, de: 26, max: 26 },
  concentration:   { it: 4, en: 4, de: 4, max: 4 },  // "CONC" badge
  gly_badge:       { it: 5, en: 5, de: 5, max: 5 },  // "[GLY]" or "     "
} as const satisfies Record<string, WidthBudgetRow>;

/** Validate a rendered value does not exceed its budget. */
export function assertWithinBudget(value: string, field: keyof typeof HUD_WIDTH_BUDGETS): void {
  const budget = HUD_WIDTH_BUDGETS[field].max;
  if (value.length > budget) {
    console.warn(`[EVF] i18n-budgets: '${field}' exceeded budget ${budget}: "${value}"`);
    // CI build-time check via TypeScript; runtime is log-only + truncate
  }
}
```

---

### `packages/g2-app/src/status-hud/idle-infill-layer.ts` (component, event-driven)

**Analog:** `packages/g2-app/src/wizard/wizard.ts` (lifecycle pattern) + `packages/g2-app/src/hub-polyfill.ts` (EvenAppBridge method calls)

**Layer interface implementation with cleanup pattern** (wizard.ts destroyCurrentStep pattern):
```typescript
/**
 * IdleInfillLayer — z=0.5 content infill, visible ONLY when z=2 is not mounted.
 *
 * Contents (MVP): combat-log strip (1 row), label separator (1 row), stats strip (1 row).
 * Lifecycle managed by LayerManager.bundle() — demolished atomically on overlay_mounted.
 *
 * @see docs/architecture/0001-layered-ui-model.md §Amendment 1 (z=0.5 spec)
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04a-CONTEXT.md Area 1
 */
export class IdleInfillLayer implements Layer {
  readonly id = 'idle-infill';
  // No getCaptureContainer — z=0.5 is render-only

  async draw(): Promise<void> {
    // textContainerUpgrade for z05-combat-log, z05-label, z05-stats
  }

  destroy(): void {
    // containers are removed via rebuildPageContainer by LayerManager.bundle()
    // no individual teardown needed
  }
}
```

---

### `packages/g2-app/src/status-hud/__tests__/status-hud-renderer.test.ts` (test)

**Analog:** `packages/g2-app/src/__tests__/example-status-hud.test.ts` (exact match — AsciiGrid + matchAsciiFixture)

**INV-1 snapshot test pattern** (example-status-hud.test.ts lines 1-34):
```typescript
/**
 * INV-1 snapshot tests for StatusHudRenderer.
 *
 * Covers: loading state, hp-overflow, conditions-overflow, IT/EN/DE locale budgets.
 * Fixture path relative to THIS file:
 *   packages/g2-app/src/status-hud/__tests__/ → 4 dirs up = packages/
 *   → ../../../../shared-render/src/fixtures/status-hud.loading.txt
 *
 * @see packages/shared-render/src/snapshot.ts (matchAsciiFixture)
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04A-RESEARCH.md Pitfall 7
 */
import { AsciiGrid, matchAsciiFixture } from '@evf/shared-render';
import { describe, it } from 'vitest';
import { StatusHudRenderer } from '../status-hud-renderer.js';

describe('StatusHudRenderer — INV-1 fixture snapshots', () => {
  it('renders loading state with em-dash placeholders (INV-1 ck 15)', async () => {
    const renderer = new StatusHudRenderer({ locale: 'en' });
    const grid = renderer.renderLoading();
    await matchAsciiFixture(
      grid,
      '../../../../shared-render/src/fixtures/status-hud.loading.txt',
    );
  });

  it('renders IT locale within width budget (INV-1 ck 14)', async () => {
    const renderer = new StatusHudRenderer({ locale: 'it' });
    const grid = renderer.render(mockSnapshot({ hp: 68, maxHp: 68, ac: 18 }));
    await matchAsciiFixture(
      grid,
      '../../../../shared-render/src/fixtures/glyph-scene.raster-idle-it.txt',
    );
  });
});
```

**IMPORTANT — fixture path offset table:**

| Test file location | Hops to `packages/` | Path prefix |
|---|---|---|
| `packages/g2-app/src/__tests__/` | 3 | `../../../shared-render/src/fixtures/` |
| `packages/g2-app/src/status-hud/__tests__/` | 4 | `../../../../shared-render/src/fixtures/` |
| `packages/g2-app/src/raster/__tests__/` | 4 | `../../../../shared-render/src/fixtures/` |
| `packages/g2-app/src/engine/__tests__/` | 4 | `../../../../shared-render/src/fixtures/` |

---

### `packages/shared-render/src/fixtures/*.txt` (fixture files)

**Analog:** `packages/shared-render/src/fixtures/status-hud-baseline.txt`

**Format rules** (snapshot.ts line 22 — serializer appends `\n`):
```
Each fixture = grid rows joined by LF + trailing newline.
Width MUST be uniform across all rows (AsciiGrid constructor enforces this).
Box-drawing chars (┌ ┐ └ ┘ │ ─) are UTF-8 multi-byte — character count, not byte count.
Column 68 divider (│ or space) must appear at char position 68 in every row of HUD fixtures.
```

**Fixture naming convention** (from RESEARCH.md lines 255-263):
```
status-hud.loading.txt           ← loading state (all '…' placeholders)
status-hud.hp-overflow.txt       ← HP value wider than budget (shows '…' truncation)
status-hud.conditions-overflow.txt  ← conditions list wider than 26 chars
glyph-scene.boot.txt             ← boot splash text container
glyph-scene.raster-idle.txt      ← raster mode idle (English canonical)
glyph-scene.raster-idle-it.txt   ← IT locale width-budget stress test
glyph-scene.raster-idle-en.txt   ← EN locale (same as raster-idle)
glyph-scene.raster-idle-de.txt   ← DE locale width-budget stress test
glyph-scene.glyph-idle.txt       ← glyph mode default
```

---

### `docs/architecture/0009-layer-manager-contract.md` (ADR)

**Analog:** `docs/architecture/0001-layered-ui-model.md` (MADR format)

**MADR frontmatter + section structure** (ADR-0001 lines 1-82):
```markdown
---
status: accepted
date: 2026-05-14
deciders: aiacos (DM/PO/sole-developer)
consulted: Claude Code (Sonnet 4.6, pattern-mapping/planning agent)
informed: future contributors
---

# ADR-0009: Layer Manager Contract — mount/destroy/bundle API + capture-container invariant

## Status

**ACCEPTED** — 2026-05-14. Binds Phase 4a implementation.

## Context and Problem Statement
## Decision Drivers
## Considered Options
## Decision Outcome
### Consequences
### Confirmation
## Pros and Cons of the Options
## More Information
## Amendments
```

**Key difference from ADR-0001:** ADR-0009 does not require an Amendments section at creation time. Add one only when `bundle()` semantics are extended in Phase 4b.

---

## Shared Patterns

### EvenAppBridge Usage (apply to all engine/raster/status-hud modules)

**Source:** `packages/g2-app/src/hub-polyfill.ts` (lines 56-102) + RESEARCH.md Pattern 1

```typescript
// NEVER call hub.* in Phase 4a+ code — use SDK directly
import { EvenAppBridge, waitForEvenAppBridge } from '@evenrealities/even_hub_sdk';

// Check result enum — NOT boolean
import { ImageRawDataUpdateResult } from '@evenrealities/even_hub_sdk';
const result = await bridge.updateImageRawData(/* ... */);
if (!ImageRawDataUpdateResult.isSuccess(result)) {
  // trigger glyph fallback — never silently ignore
  console.warn('[EVF] updateImageRawData failed:', result);
}
```

**Anti-patterns to copy-paste-guard:**
- `hub.setItem` / `hub.getItem` / `hub.eventBus` — only in wizard/ Phase 2 code
- `bridge.createImageContainer()` / `bridge.createTextContainer()` — do NOT exist
- `createStartUpPageContainer` called per-frame — only called once at boot or mode transition

---

### Observable Store (apply to layer-manager, status-hud-layer, idle-infill-layer)

**Source:** `packages/g2-app/src/wizard/state.ts` (lines 54-105)

```typescript
// Copy the createStore<T> generic pattern verbatim for new state shapes
// Subscriber notification is synchronous (consistent with wizard behavior)
// Unsubscribe function returned from subscribe() — always call in destroy()
import { createStore, type Store } from '../wizard/state.js';
// ... or inline the same pattern if the state shape is Phase 4a-specific
```

---

### TypeScript Strict Guards (apply to all files with array access)

**Source:** `packages/shared-render/src/ascii-grid.ts` (lines 24-27) + CONTEXT.md "Established Patterns"

```typescript
// noUncheckedIndexedAccess: NEVER write arr[i] directly
const cell = this.cells[row]?.[col];          // returns Cell | undefined — correct
const hash = prevHashes[i] ?? 0;              // fallback to 0 for numeric hashes
const row = cells[0];
if (row === undefined) throw new Error('..'); // explicit undefined guard before use
```

---

### Module JSDoc Header (apply to all new files)

**Source:** `packages/g2-app/src/hub-polyfill.ts` (lines 1-54), `packages/bridge/src/ws/handshake.ts` (lines 1-17), `packages/g2-app/src/wizard/state.ts` (lines 1-9)

```typescript
/**
 * [One-line description of what this module exports / does.]
 *
 * [2-3 lines of WHY + any invariants this module enforces.]
 *
 * @see docs/architecture/NNNN-*.md (relevant ADR)
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04a-CONTEXT.md Area N
 * @see Specs.md §X.Y (relevant section)
 */
```

---

### Test File Structure (apply to all Phase 4a tests)

**Source:** `packages/bridge/src/ws/handshake.test.ts` (lines 1-90) + `packages/g2-app/src/wizard/steps/step1-profile.test.ts` (lines 1-77)

```typescript
/**
 * Unit tests for [module].
 *
 * Covers: [bullet list of what is tested]
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// --- Helpers ---
function makeMock[Thing]() { /* ... */ }

describe('[Module] — [feature group]', () => {
  let subject: Subject;

  beforeEach(() => {
    vi.resetModules();
    // setup
  });

  afterEach(() => {
    // biome-ignore lint/suspicious/noExplicitAny: test cleanup
    vi.restoreAllMocks();
  });

  it('[does the expected thing]', () => {
    // arrange / act / assert
  });
});
```

---

### Zod Schema (apply to any new shared-protocol additions)

**Source:** `packages/shared-protocol/src/handshake.ts` + `packages/shared-protocol/src/payloads/character.ts`

```typescript
// z.strictObject for closed shapes (no extra fields allowed at runtime)
// z.object for open/forward-compatible protocol messages
// Always export both schema and inferred type
export const FooSchema = z.strictObject({ ... });
export type Foo = z.infer<typeof FooSchema>;
// Use .safeParse() at WS boundary — NEVER .parse() (throws on input from wire)
```

---

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `packages/g2-app/src/raster/raster-worker.ts` | utility | batch | First Web Worker in the codebase. No prior OffscreenCanvas + Worker pattern exists. Use RESEARCH.md Pattern 2 and Pitfall 4 (Vite `?worker` import). |
| `packages/g2-app/src/raster/rle-encoder.ts` | utility | transform | No prior binary encoding utilities. Use RESEARCH.md code examples; pattern is straightforward run-length encode over Uint8Array. |

---

## Metadata

**Analog search scope:** `packages/g2-app/src/`, `packages/bridge/src/ws/`, `packages/shared-render/src/`, `packages/shared-protocol/src/`, `docs/architecture/`
**Files scanned:** 32
**Pattern extraction date:** 2026-05-14
