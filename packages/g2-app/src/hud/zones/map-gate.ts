/**
 * Map frame cadence (≤ 1 fps). The map shares image tile `tr` with the right half of
 * the header, so its pacing cannot live in the per-tile sender (a turn-chip or PF change
 * must never wait for the map): instead the top band is composed with the last accepted
 * map frame until {@link MAP_MIN_INTERVAL_MS} has elapsed. Real-G2 BLE budget: the
 * phone → glasses link is ~25 KB/s, so the map must never stream (remote be5167e).
 */
import type { Pixmap } from '@evf/shared-render';

export const MAP_MIN_INTERVAL_MS = 1000;

/** Frame to compose now, and when a newer frame may be taken (0 = nothing withheld). */
export interface GatedFrame {
  pix: Pixmap;
  retryInMs: number;
}

export class MapFrameGate {
  private last: { pix: Pixmap; hash: number; at: number; key: string } | null = null;

  constructor(private readonly now: () => number = () => Date.now()) {}

  /**
   * @param fresh - The map as rendered for the current state.
   * @param key - Context whose change bypasses the cadence (layout, dimming, scene).
   * @returns `fresh` when it is unchanged, new context, or ≥ 1 s after the last accepted
   *   frame; otherwise the last accepted frame plus the wait before `fresh` is due.
   */
  take(fresh: Pixmap, key: string): GatedFrame {
    const now = this.now();
    const hash = fresh.hash();
    const last = this.last;
    if (last !== null && last.key === key) {
      if (last.hash === hash) return { pix: fresh, retryInMs: 0 };
      const due = last.at + MAP_MIN_INTERVAL_MS - now;
      if (due > 0) return { pix: last.pix, retryInMs: due };
    }
    this.last = { pix: fresh, hash, at: now, key };
    return { pix: fresh, retryInMs: 0 };
  }

  /** Forgets the last frame (next frame is taken immediately). */
  reset(): void {
    this.last = null;
  }
}
