/**
 * ZoneSender — paced, prioritised `updateImageRawData` pipeline for the image tiles
 * (docs/design/g2-sheet-ux.html §Vincolo hardware, SDK notes):
 *
 * - one image in flight at a time, ≥ {@link MIN_GAP_MS} between two sends;
 * - per-tile hash: a tile whose pixels did not change is never re-sent (an AC change
 *   resends only `tl`; the PF box straddles the two top tiles, so a PF change resends
 *   `tl` + `tr`; a map frame resends only `tr`);
 * - latest wins: a newer pixmap replaces a queued one of the same tile;
 * - priority: reading order `tl` (PF digits, CA, portrait) > `tr` (turn chip, map) >
 *   `bl` (sheet) > `br`; the context zone is text and never waits here;
 * - a failed send forgets the tile hash and retries after {@link RETRY_MS}.
 *
 * The map's ≤ 1 fps cadence is enforced upstream, when the top band is composed
 * (`startHud`), because the map shares tile `tr` with the header.
 *
 * PNG encoding happens only when a tile is about to be sent (superseded frames cost
 * nothing).
 */
import type { Pixmap } from '@evf/shared-render';
import { TILES, type Tile } from '../layout.js';
import { encodePng } from './png.js';

export const MIN_GAP_MS = 100;
export const RETRY_MS = 2000;

/** Sends one encoded image; resolves to the SDK `ImageRawDataUpdateResult`. */
export type SendImage = (region: Tile, png: Uint8Array) => Promise<unknown>;

/** Timer surface (injectable for tests). */
export interface SenderTimers {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

const PRIORITY: readonly Tile[] = TILES;

const realTimers: SenderTimers = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export class ZoneSender {
  /** Hash of what the glasses show per region. */
  private readonly shown = new Map<Tile, number>();
  private readonly pending = new Map<Tile, Pixmap>();
  /** Earliest time a tile may be sent again (retry backoff). */
  private readonly notBefore = new Map<Tile, number>();
  private busy = false;
  private timer: unknown = null;
  private lastSendAt = Number.NEGATIVE_INFINITY;
  private disposed = false;
  /** Bumped by {@link reset}: results of sends started before it are ignored. */
  private epoch = 0;

  constructor(
    private readonly send: SendImage,
    private readonly timers: SenderTimers = realTimers,
  ) {}

  /** Queues `pix` for `region` unless the glasses already show exactly these pixels. */
  submit(region: Tile, pix: Pixmap): void {
    if (this.disposed) return;
    if (this.shown.get(region) === pix.hash()) {
      this.pending.delete(region);
      return;
    }
    this.pending.set(region, pix);
    this.schedule();
  }

  /** Forgets what the glasses show (after a page placement or a return to foreground). */
  reset(): void {
    this.epoch += 1;
    this.shown.clear();
    this.pending.clear();
    this.notBefore.clear();
  }

  dispose(): void {
    this.disposed = true;
    this.pending.clear();
    if (this.timer !== null) this.timers.clearTimeout(this.timer);
    this.timer = null;
  }

  private next(now: number): { region: Tile; wait: number } | null {
    let best: { region: Tile; wait: number } | null = null;
    for (const region of PRIORITY) {
      if (!this.pending.has(region)) continue;
      const wait = Math.max(0, (this.notBefore.get(region) ?? 0) - now);
      if (wait === 0) return { region, wait };
      if (best === null || wait < best.wait) best = { region, wait };
    }
    return best;
  }

  /** (Re)arms the timer for the next due region (a new submission may be due sooner). */
  private schedule(): void {
    if (this.disposed || this.busy) return;
    if (this.timer !== null) {
      this.timers.clearTimeout(this.timer);
      this.timer = null;
    }
    const now = this.timers.now();
    const next = this.next(now);
    if (next === null) return;
    const wait = Math.max(next.wait, this.lastSendAt + MIN_GAP_MS - now);
    this.timer = this.timers.setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, wait);
  }

  private async flush(): Promise<void> {
    const now = this.timers.now();
    const next = this.next(now);
    if (this.disposed || next === null || next.wait > 0) {
      this.schedule();
      return;
    }
    const { region } = next;
    const pix = this.pending.get(region);
    if (!pix) return;
    this.pending.delete(region);
    this.busy = true;
    this.lastSendAt = now;
    const epoch = this.epoch;
    const hash = pix.hash();
    let ok = false;
    try {
      const result = String(await this.send(region, encodePng(pix)));
      ok = result === 'success';
      if (!ok) console.warn(`[hud] image ${region} rejected: ${result}`);
    } catch (err) {
      // Degrades via the documented retry below; the failure is reported, not swallowed.
      console.warn(`[hud] image ${region} send failed`, err);
    }
    this.busy = false;
    if (epoch === this.epoch) {
      if (ok) {
        this.shown.set(region, hash);
      } else {
        this.shown.delete(region);
        this.notBefore.set(region, this.timers.now() + RETRY_MS);
        if (!this.pending.has(region)) this.pending.set(region, pix);
      }
    }
    this.schedule();
  }
}
