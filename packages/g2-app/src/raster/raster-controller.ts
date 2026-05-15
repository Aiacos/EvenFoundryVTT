/**
 * RasterController — main-thread orchestrator for the singleton raster Web Worker.
 *
 * Owns:
 *   - Worker lifecycle (`new URL('./raster-worker.ts', import.meta.url)` per
 *     RESEARCH.md Pitfall 4 — the Vite-canonical pattern that emits a worker
 *     chunk in the build and keeps the import resolvable in dev HMR).
 *   - Frame-id correlation: every `requestFrame` increments `frameId` and
 *     parks a `{ resolve }` entry in the `pending` Map; the worker response
 *     is routed back by frameId. Stale ids are dropped with a warning.
 *   - Debounce: 200 ms (CONTEXT.md §Area 2 + Specs §7.4b.6.1 Layer 6 adaptive
 *     frame rate) — burst calls within the window coalesce to the latest
 *     payload.
 *   - Idle heartbeat: 0.3 fps (3333 ms tick) when `startIdleHeartbeat` is
 *     active, so a static scene still refreshes ~once every 3 seconds for
 *     liveness.
 *   - Failure tracking: 3 consecutive `!ImageRawDataUpdateResult.isSuccess`
 *     results within a 5 s window → flip the BLE verdict to `'glyph'` and
 *     surface a warning. No retry storm.
 *   - `implements RasterControllerLike` from `../engine/layer-types.ts` —
 *     this is the B-4 forward-contract closure (MapBaseLayer in Plan 03
 *     Task 2 imported only the interface; this concrete class plugs the
 *     other end of the structural contract).
 *
 * Pixel-data ingress is the responsibility of Plan 06 (foundry-module
 * canvas extractor + WS transfer + `scene-input.ts` dispatcher). This class
 * is the "given pixel data, produce a frame on the G2" half of the chain.
 *
 * Test seam: an optional `workerFactory` injected via the constructor
 * options lets unit tests substitute the real `new Worker(...)` call with a
 * happy-dom-compatible mock from
 * `packages/g2-app/src/__tests__/test-helpers/worker-mock.ts`. The
 * production code path keeps the Vite-canonical URL literal so the bundler
 * emits the worker chunk; the test seam exists ONLY to avoid spinning up
 * an actual Web Worker (which happy-dom 20.x cannot do per RESEARCH.md
 * Pitfall 4).
 *
 * @see docs/architecture/0006-raster-pipeline-library-stack.md (raster pipeline + ADR-0005 PROVISIONAL Branch A)
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04a-CONTEXT.md §Area 2 (200 ms debounce + 0.3 fps heartbeat)
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04A-RESEARCH.md §Pattern 2 + §Pitfall 4
 * @see packages/g2-app/src/engine/layer-types.ts (RasterControllerLike contract)
 * @see packages/g2-app/src/__tests__/test-helpers/worker-mock.ts (Worker mock)
 */
import {
  type EvenAppBridge,
  ImageRawDataUpdate,
  ImageRawDataUpdateResult,
} from '@evenrealities/even_hub_sdk';
import type {
  RasterChangedTile,
  RasterControllerLike,
  RasterResponse,
} from '../engine/layer-types.js';

/** Minimal Worker-like contract honored by both the real `Worker` and the test mock. */
export interface WorkerLike {
  onmessage: ((ev: { data?: unknown; type: string }) => void) | null;
  postMessage(message: unknown, transfer?: ReadonlyArray<Transferable>): void;
  terminate(): void;
}

/** Optional dependencies for tests — substitute the Worker constructor. */
export interface RasterControllerOptions {
  /** Factory returning a Worker-like instance; production omits to use `new Worker`. */
  readonly workerFactory?: () => WorkerLike;
  /** Idle heartbeat interval in milliseconds; default 3333 ms (0.3 fps). */
  readonly idleHeartbeatMs?: number;
  /** Debounce window in milliseconds; default 200 ms (CONTEXT.md §Area 2). */
  readonly debounceMs?: number;
  /** Number of consecutive failures within `failureWindowMs` to trigger glyph fallback. */
  readonly failureThreshold?: number;
  /** Sliding window for consecutive-failure counting; default 5000 ms. */
  readonly failureWindowMs?: number;
}

/** A pending in-flight frame, indexed by `frameId` in `RasterController.pending`. */
interface PendingFrame {
  readonly resolve: (response: RasterResponse) => void;
}

const DEFAULT_DEBOUNCE_MS = 200;
const DEFAULT_IDLE_MS = 3333; // 0.3 fps
const DEFAULT_FAILURE_THRESHOLD = 3;
const DEFAULT_FAILURE_WINDOW_MS = 5000;

/**
 * Spawn the production raster Worker using the Vite-canonical URL pattern.
 *
 * Kept as a module-level factory so it can be stubbed in tests; the body is
 * intentionally minimal so the Vite bundler statically recognises the
 * `new URL('./raster-worker.ts', import.meta.url)` literal at build time
 * (RESEARCH.md Pitfall 4).
 */
function defaultWorkerFactory(): WorkerLike {
  // `Worker` is wider than `WorkerLike` (extra DOM event-target surface);
  // the structural cast is safe because we only consume the WorkerLike
  // subset. Vite statically recognises the URL literal here regardless
  // of the surrounding cast (RESEARCH.md Pitfall 4 verified).
  return new Worker(new URL('./raster-worker.ts', import.meta.url), {
    type: 'module',
  }) as unknown as WorkerLike;
}

/**
 * Main-thread orchestrator implementing the Plan 01 forward contract.
 *
 * Construct once per app boot (paired with the `EvenAppBridge` instance);
 * the underlying Worker is torn down via `terminate()`.
 */
export class RasterController implements RasterControllerLike {
  private readonly worker: WorkerLike;
  private readonly debounceMs: number;
  private readonly idleHeartbeatMs: number;
  private readonly failureThreshold: number;
  private readonly failureWindowMs: number;

  private frameId = 0;
  private readonly pending = new Map<number, PendingFrame>();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingPayload: {
    pixelData: Uint8ClampedArray | ImageData;
    width: number;
    height: number;
    resolver: PendingFrame;
  } | null = null;
  private idleTimer: ReturnType<typeof setInterval> | null = null;
  private idleSceneSource: (() => Uint8ClampedArray | null) | null = null;
  private failureTimestamps: number[] = [];
  private bleVerdict: 'raster' | 'glyph' | null = null;

  constructor(
    private readonly bridge: EvenAppBridge,
    options: RasterControllerOptions = {},
  ) {
    this.worker = (options.workerFactory ?? defaultWorkerFactory)();
    this.debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
    this.idleHeartbeatMs = options.idleHeartbeatMs ?? DEFAULT_IDLE_MS;
    this.failureThreshold = options.failureThreshold ?? DEFAULT_FAILURE_THRESHOLD;
    this.failureWindowMs = options.failureWindowMs ?? DEFAULT_FAILURE_WINDOW_MS;
    this.worker.onmessage = (ev): void => {
      this._handleWorkerResponse(ev.data);
    };
  }

  /**
   * Queue a frame for processing.
   *
   * Within the 200 ms debounce window, only the LAST call's pixel data is
   * eventually sent to the worker. Earlier callers within the window are
   * resolved with a `skipped: true` sentinel response so they don't park
   * forever in the pending map.
   */
  requestFrame(
    pixelData: Uint8ClampedArray | ImageData,
    width: number,
    height: number,
  ): Promise<RasterResponse> {
    return new Promise<RasterResponse>((resolve) => {
      const resolver: PendingFrame = { resolve };
      // Resolve any earlier debounced caller with a skipped sentinel.
      if (this.pendingPayload !== null) {
        this.pendingPayload.resolver.resolve({
          frameId: -1,
          changedTiles: [],
          skipped: true,
        });
      }
      this.pendingPayload = { pixelData, width, height, resolver };
      if (this.debounceTimer !== null) {
        clearTimeout(this.debounceTimer);
      }
      this.debounceTimer = setTimeout(() => {
        this._flushDebounce();
      }, this.debounceMs);
    });
  }

  /** Force the BLE-verdict mode (called by capability-handshake post-probe). */
  setBleVerdict(verdict: 'raster' | 'glyph'): void {
    this.bleVerdict = verdict;
  }

  /** Read the current BLE verdict (null until first probe completes). */
  getBleVerdict(): 'raster' | 'glyph' | null {
    return this.bleVerdict;
  }

  /**
   * Start the 0.3 fps idle heartbeat.
   *
   * Each tick consults `getCurrentScene` and dispatches a fresh requestFrame
   * iff a scene is available. The tick interval is configurable via the
   * constructor options for test determinism.
   */
  startIdleHeartbeat(getCurrentScene: () => Uint8ClampedArray | null): void {
    this.idleSceneSource = getCurrentScene;
    if (this.idleTimer !== null) {
      clearInterval(this.idleTimer);
    }
    this.idleTimer = setInterval(() => {
      const scene = this.idleSceneSource?.();
      if (scene !== null && scene !== undefined) {
        void this.requestFrame(scene, 400, 200);
      }
    }, this.idleHeartbeatMs);
  }

  /** Stop the idle heartbeat (idempotent). */
  stopIdleHeartbeat(): void {
    if (this.idleTimer !== null) {
      clearInterval(this.idleTimer);
      this.idleTimer = null;
    }
    this.idleSceneSource = null;
  }

  /** Terminate the worker, clear pending state, drop all timers. */
  terminate(): void {
    this.worker.terminate();
    this.pending.clear();
    this.pendingPayload = null;
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.stopIdleHeartbeat();
  }

  /**
   * Fire the queued payload at the worker once the debounce window elapses.
   *
   * Increments the frame id, parks the resolver in `pending`, and posts the
   * message. The pixel data is sent as-is (not transferred) because the
   * caller may want to reuse the buffer for the next debounce cycle.
   */
  private _flushDebounce(): void {
    this.debounceTimer = null;
    const payload = this.pendingPayload;
    if (payload === null) {
      return;
    }
    this.pendingPayload = null;
    this.frameId++;
    const id = this.frameId;
    this.pending.set(id, payload.resolver);
    this.worker.postMessage({
      frameId: id,
      pixelData: payload.pixelData,
      width: payload.width,
      height: payload.height,
    });
  }

  /**
   * Receive a worker response and route it to the matching pending caller.
   *
   * Stale frame ids (caller already resolved or worker echo arrived out of
   * order) are dropped with a `console.warn` so a misbehaving worker does
   * not throw on the main thread.
   */
  private _handleWorkerResponse(data: unknown): void {
    if (typeof data !== 'object' || data === null) {
      console.warn('[EVF] raster-controller: non-object worker response, dropping');
      return;
    }
    const response = data as RasterResponse;
    const pending = this.pending.get(response.frameId);
    if (pending === undefined) {
      console.warn(
        `[EVF] raster-controller: unknown frameId ${response.frameId} from worker — dropping`,
      );
      return;
    }
    this.pending.delete(response.frameId);
    pending.resolve(response);
    // Dispatch changed tiles to the bridge asynchronously — never await
    // here because the resolver semantics promise to fire as soon as the
    // worker speaks.
    void this._dispatchChangedTiles(response.changedTiles);
  }

  /**
   * Push every changed tile through `bridge.updateImageRawData` and track
   * consecutive failures for the BLE-verdict fallback path.
   *
   * Result-check uses `ImageRawDataUpdateResult.isSuccess(result)` per
   * RESEARCH.md Pitfall 6 (never bare boolean compare).
   */
  private async _dispatchChangedTiles(tiles: ReadonlyArray<RasterChangedTile>): Promise<void> {
    for (const tile of tiles) {
      const payload = new ImageRawDataUpdate({
        containerName: `map-tile-${tile.index}`,
        imageData: tile.pngBytes,
      });
      const result = await this.bridge.updateImageRawData(payload);
      if (!ImageRawDataUpdateResult.isSuccess(result)) {
        this._recordFailure();
      } else {
        // Successful dispatch resets the consecutive-failure window.
        this.failureTimestamps = [];
      }
    }
  }

  /**
   * Append a failure timestamp + check threshold inside the sliding window.
   *
   * On 3 consecutive failures within 5 s the verdict flips to `'glyph'`
   * (no retry storm — the controller stops dispatching raster tiles until
   * a future probe upgrades the verdict back to raster).
   */
  private _recordFailure(): void {
    const now = Date.now();
    this.failureTimestamps = this.failureTimestamps.filter((t) => now - t < this.failureWindowMs);
    this.failureTimestamps.push(now);
    if (this.failureTimestamps.length >= this.failureThreshold) {
      this.bleVerdict = 'glyph';
      console.warn(
        '[EVF] raster-controller: 3 consecutive updateImageRawData failures within 5 s — flipping BLE verdict to "glyph"',
      );
      this.failureTimestamps = [];
    }
  }
}
