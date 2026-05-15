/**
 * happy-dom-compatible mocks for OffscreenCanvas + Worker.
 *
 * happy-dom 20.x does not expose a full `OffscreenCanvas` implementation and its
 * `Worker` polyfill cannot execute the `new Worker(new URL(..., import.meta.url),
 * { type: 'module' })` import pattern that Vite emits at build time
 * (RESEARCH.md Pitfall 4). These helpers provide minimal hand-rolled stubs so
 * Plan 03 raster-controller / raster-worker unit tests can run under Vitest's
 * happy-dom environment without spinning up real Web Workers.
 *
 * Scope: ONLY the surface the raster pipeline touches — `getContext('2d')` with
 * `drawImage` / `getImageData` / `putImageData` / `imageSmoothingQuality` on the
 * OffscreenCanvas side; `postMessage` / `onmessage` / `addEventListener` /
 * `removeEventListener` / `terminate` on the Worker side.
 *
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04A-RESEARCH.md Pitfall 4 (Vite Worker import)
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04A-VALIDATION.md §Wave 0 Requirements
 * @see packages/g2-app/vitest.config.ts (happy-dom environment)
 */

/**
 * Minimal 2D context shape the raster pipeline touches.
 *
 * Intentionally NOT typed as `OffscreenCanvasRenderingContext2D` — happy-dom
 * does not register that lib type in its happy-dom typings. The
 * raster-controller tests cast through `unknown` when handing this to code
 * that expects the real DOM type.
 */
export interface MockCanvas2DContext {
  imageSmoothingQuality: 'low' | 'medium' | 'high';
  drawImage: (
    image: unknown,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx?: number,
    dy?: number,
    dw?: number,
    dh?: number,
  ) => void;
  getImageData: (sx: number, sy: number, sw: number, sh: number) => ImageData;
  putImageData: (data: ImageData, dx: number, dy: number) => void;
}

/**
 * Minimal OffscreenCanvas-compatible shape exposed by `createMockOffscreenCanvas`.
 *
 * Mirrors the small subset of `OffscreenCanvas` the pipeline uses; cast via
 * `as unknown as OffscreenCanvas` at the test boundary.
 */
export interface MockOffscreenCanvas {
  readonly width: number;
  readonly height: number;
  getContext(contextId: '2d'): MockCanvas2DContext;
}

/**
 * Create a hand-rolled OffscreenCanvas mock for happy-dom test runs.
 *
 * The returned `getContext('2d')` always yields the same context instance
 * (no per-call clone), making it cheap to spy on call counts in Vitest.
 *
 * @param width  - canvas width in CSS pixels (>=1)
 * @param height - canvas height in CSS pixels (>=1)
 */
export function createMockOffscreenCanvas(width: number, height: number): MockOffscreenCanvas {
  if (width < 1 || height < 1) {
    throw new Error(`[worker-mock] invalid OffscreenCanvas size ${width}x${height}`);
  }
  const ctx: MockCanvas2DContext = {
    imageSmoothingQuality: 'high',
    drawImage: () => {
      /* noop — tests spy via vi.spyOn() when needed */
    },
    getImageData: (_sx, _sy, sw, sh) => {
      const buf = new Uint8ClampedArray(sw * sh * 4);
      return { data: buf, width: sw, height: sh, colorSpace: 'srgb' } as ImageData;
    },
    putImageData: () => {
      /* noop */
    },
  };
  return {
    width,
    height,
    getContext: () => ctx,
  };
}

/** Listener handler shape — matches the WHATWG `EventListener` signature loosely. */
type MockEventHandler = (event: { data?: unknown; type: string }) => void;

/**
 * Minimal Worker-compatible shape returned by `createMockWorker`.
 *
 * Implementations of `postMessage` push synchronously into the internal queue
 * but never forward to a real worker thread — tests drive responses via
 * `_dispatchMessage` (see test-helper-internal section in raster-controller
 * tests).
 */
export interface MockWorker {
  /** Set the `onmessage` handler (matches Worker's `onmessage` property). */
  onmessage: MockEventHandler | null;
  /** Set the `onerror` handler (matches Worker's `onerror` property). */
  onerror: MockEventHandler | null;
  /** Send a message to the (mock) worker. Captured for assertions. */
  postMessage(message: unknown, transfer?: ReadonlyArray<Transferable>): void;
  /** Subscribe to messages or errors. */
  addEventListener(type: 'message' | 'error', handler: MockEventHandler): void;
  /** Unsubscribe a previously registered handler. */
  removeEventListener(type: 'message' | 'error', handler: MockEventHandler): void;
  /** Terminate the worker; subsequent `postMessage` calls become no-ops. */
  terminate(): void;
  /**
   * Test-only: synchronously dispatch a `MessageEvent`-shaped object to all
   * registered message listeners (including `onmessage`). Mirrors what the
   * real Worker runtime would do when the worker thread `postMessage`s back.
   */
  _dispatchMessage(data: unknown): void;
  /**
   * Test-only: read the messages sent into this worker via `postMessage`.
   *
   * Returns a fresh array snapshot — mutations on the returned array do not
   * affect the mock's internal queue.
   */
  _sentMessages(): ReadonlyArray<unknown>;
}

/**
 * Create a hand-rolled Worker mock for happy-dom test runs.
 *
 * Does NOT execute any worker script — tests provide responses through
 * `_dispatchMessage(...)`. This lets raster-controller unit tests assert the
 * exact request payload shape AND the response routing without ever booting
 * an OffscreenCanvas pipeline.
 */
export function createMockWorker(): MockWorker {
  const messageListeners = new Set<MockEventHandler>();
  const errorListeners = new Set<MockEventHandler>();
  const sent: unknown[] = [];
  let terminated = false;

  const worker: MockWorker = {
    onmessage: null,
    onerror: null,

    postMessage(message: unknown): void {
      if (terminated) {
        return;
      }
      sent.push(message);
    },

    addEventListener(type, handler): void {
      if (type === 'message') {
        messageListeners.add(handler);
      } else {
        errorListeners.add(handler);
      }
    },

    removeEventListener(type, handler): void {
      if (type === 'message') {
        messageListeners.delete(handler);
      } else {
        errorListeners.delete(handler);
      }
    },

    terminate(): void {
      terminated = true;
      messageListeners.clear();
      errorListeners.clear();
    },

    _dispatchMessage(data: unknown): void {
      if (terminated) {
        return;
      }
      const event = { data, type: 'message' };
      if (worker.onmessage !== null) {
        worker.onmessage(event);
      }
      for (const fn of messageListeners) {
        fn(event);
      }
    },

    _sentMessages(): ReadonlyArray<unknown> {
      return [...sent];
    },
  };

  return worker;
}
