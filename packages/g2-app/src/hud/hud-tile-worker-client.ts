/**
 * hud-tile-worker-client.ts — request/response client for `hud-tile.worker.ts`.
 *
 * Off-main-thread HUD tile building (layout B perf lever, 2026-06-10): the
 * delta driver hands the composited 576×288 RGBA buffer to the Worker
 * (transferred, zero copy) and awaits the 4 dithered 4-bit PNG tiles. While
 * the Worker dithers/encodes, the WebView main thread stays free for
 * gestures, WS traffic and panel paints.
 *
 * Environment handling:
 *   - `createHudTileWorkerClient()` returns `null` when `Worker` is not
 *     available (happy-dom unit tests, exotic hosts) — the driver then uses
 *     the synchronous `buildHudTiles` fallback, byte-identical output.
 *   - A Worker `{ error }` response or a crashed Worker rejects the pending
 *     promise; the driver catches and falls back to the sync path for that
 *     cycle (fail-soft — a dropped frame, never a dead loop).
 *
 * @see packages/g2-app/src/hud/hud-tile.worker.ts (Worker twin)
 * @see packages/g2-app/src/engine/hud-delta-driver.ts (consumer via opts.buildTilesAsync)
 */

import type { HudTile } from './hud-raster-frame.js';

/** Pending request bookkeeping — one in-flight request at a time (driver is serialized). */
interface Pending {
  readonly resolve: (tiles: HudTile[]) => void;
  readonly reject: (err: Error) => void;
}

/** Async tile builder surface consumed by `HudDeltaDriver`. */
export interface HudTileWorkerClient {
  /**
   * Build the 4 HUD tiles off-thread.
   *
   * @param rgba Composited 576×288×4 buffer. The underlying ArrayBuffer is
   *   TRANSFERRED to the Worker — the caller must not reuse it afterwards
   *   (the driver always passes a fresh `composite()` copy).
   * @returns The 4 dithered 4-bit PNG tiles in container-id order.
   */
  buildTiles(rgba: Uint8ClampedArray): Promise<HudTile[]>;
  /** Terminate the underlying Worker (boot teardown). */
  destroy(): void;
}

/**
 * Create the Worker-backed tile builder, or `null` when Workers are
 * unavailable in the current environment (driver falls back to sync).
 *
 * @returns Client or `null`.
 */
export function createHudTileWorkerClient(): HudTileWorkerClient | null {
  if (typeof Worker === 'undefined') {
    return null;
  }
  // happy-dom defines Worker but never loads module workers — a request would
  // hang forever. Unit/integration tests always use the sync path.
  if (typeof process !== 'undefined' && process.env?.VITEST !== undefined) {
    return null;
  }
  let worker: Worker;
  try {
    worker = new Worker(new URL('./hud-tile.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    return null;
  }

  let seq = 0;
  let dead = false;
  const pending = new Map<number, Pending>();

  worker.onmessage = (ev: MessageEvent): void => {
    const data = ev.data as {
      seq: number;
      tiles?: Array<{ id: number; name: string; bytes: Uint8Array }>;
      error?: string;
    };
    const p = pending.get(data.seq);
    if (p === undefined) {
      return;
    }
    pending.delete(data.seq);
    if (data.tiles !== undefined) {
      p.resolve(
        data.tiles.map((t) => ({ containerID: t.id, containerName: t.name, bytes: t.bytes })),
      );
    } else {
      p.reject(new Error(data.error ?? 'hud-tile worker error'));
    }
  };
  worker.onerror = (ev: ErrorEvent): void => {
    // Reject everything in flight — driver falls back to sync for the cycle.
    for (const [k, p] of pending) {
      pending.delete(k);
      p.reject(new Error(`hud-tile worker crashed: ${ev.message}`));
    }
  };

  return {
    buildTiles(rgba: Uint8ClampedArray): Promise<HudTile[]> {
      if (dead) {
        return Promise.reject(new Error('hud-tile worker marked dead'));
      }
      const id = ++seq;
      return new Promise<HudTile[]>((resolve, reject) => {
        // Resilience timeout: a Worker that never answers (broken host) must
        // not stall the render loop — reject, mark dead, sync path forever.
        const timer = setTimeout(() => {
          if (pending.delete(id)) {
            dead = true;
            reject(new Error('hud-tile worker timeout — falling back to sync'));
          }
        }, 1000);
        pending.set(id, {
          resolve: (tiles) => {
            clearTimeout(timer);
            resolve(tiles);
          },
          reject: (err) => {
            clearTimeout(timer);
            reject(err);
          },
        });
        // Transfer the underlying buffer — zero-copy handoff.
        worker.postMessage({ seq: id, rgba: rgba.buffer }, [rgba.buffer]);
      });
    },
    destroy(): void {
      worker.terminate();
      for (const [k, p] of pending) {
        pending.delete(k);
        p.reject(new Error('hud-tile worker destroyed'));
      }
    },
  };
}
