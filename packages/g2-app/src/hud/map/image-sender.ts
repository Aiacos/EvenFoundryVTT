/**
 * ImageSender — paced, serialised `updateImageRawData` queue for the map tiles.
 *
 * Contract (docs/design/g2-thirds-layout.md §Mappa pixelata + SDK notes):
 * - one image update in flight at a time, ≥ 100 ms between sends (SDK 0.0.14 limit);
 * - ≤ 1 map frame per second (a frame = the tiles submitted since the last one);
 * - latest-wins per container: a tile superseded before it is sent is dropped;
 * - two consecutive failed frames → `onFallback()` (column B switches to glyphs).
 */

export interface TileUpdate {
  id: number;
  name: string;
  data: Uint8Array;
}

/** Sends one tile; resolves to the SDK `ImageRawDataUpdateResult` (`'success'` = ok). */
export type SendTile = (tile: TileUpdate) => Promise<unknown>;

export interface ImageSenderOptions {
  minGapMs?: number;
  minFrameMs?: number;
  maxFailures?: number;
  /** Called after every frame with its outcome. */
  onFrame?: (ok: boolean) => void;
  /** Called once `maxFailures` consecutive frames failed. */
  onFallback?: () => void;
}

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export class ImageSender {
  private readonly pending = new Map<number, TileUpdate>();
  private readonly minGapMs: number;
  private readonly minFrameMs: number;
  private readonly maxFailures: number;
  private busy = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private lastSendAt = Number.NEGATIVE_INFINITY;
  private lastFrameAt = Number.NEGATIVE_INFINITY;
  private failures = 0;
  private disposed = false;

  constructor(
    private readonly send: SendTile,
    private readonly opts: ImageSenderOptions = {},
  ) {
    this.minGapMs = opts.minGapMs ?? 100;
    this.minFrameMs = opts.minFrameMs ?? 1000;
    this.maxFailures = opts.maxFailures ?? 2;
  }

  /** Queues tiles for the next frame (replacing not-yet-sent tiles of the same container). */
  submit(tiles: readonly TileUpdate[]): void {
    for (const t of tiles) this.pending.set(t.id, t);
    this.schedule();
  }

  /** Drops queued tiles and the failure streak (after a page rebuild). */
  reset(): void {
    this.pending.clear();
    this.failures = 0;
  }

  dispose(): void {
    this.disposed = true;
    this.pending.clear();
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
  }

  private schedule(): void {
    if (this.disposed || this.busy || this.timer !== undefined || this.pending.size === 0) return;
    const now = Date.now();
    const wait = Math.max(
      0,
      this.lastFrameAt + this.minFrameMs - now,
      this.lastSendAt + this.minGapMs - now,
    );
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.flush();
    }, wait);
  }

  private async flush(): Promise<void> {
    if (this.disposed || this.pending.size === 0) return;
    this.busy = true;
    this.lastFrameAt = Date.now();
    const frame = [...this.pending.values()];
    this.pending.clear();
    let ok = true;
    for (const tile of frame) {
      const gap = this.lastSendAt + this.minGapMs - Date.now();
      if (gap > 0) await delay(gap);
      if (this.disposed) return;
      this.lastSendAt = Date.now();
      try {
        const result = await this.send(tile);
        if (String(result) !== 'success') ok = false;
      } catch {
        // Degrades via the documented fallback: counted as a failed frame below.
        ok = false;
      }
    }
    this.busy = false;
    this.failures = ok ? 0 : this.failures + 1;
    this.opts.onFrame?.(ok);
    if (!ok && this.failures >= this.maxFailures) {
      this.failures = 0;
      this.opts.onFallback?.();
    }
    this.schedule();
  }
}
