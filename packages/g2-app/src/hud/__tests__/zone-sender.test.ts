/**
 * Image pacing (docs/design/g2-sheet-ux.html §Vincolo hardware): one image at a time,
 * ≥ 100 ms apart, per-tile hash skip, latest wins, priority tl > tr > bl > br, retry
 * after failures, reset after a page placement. (The map's ≤ 1 fps cadence is tested
 * with `MapFrameGate`.)
 */
import { Pixmap } from '@evf/shared-render';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Tile } from '../layout.js';
import { MIN_GAP_MS, RETRY_MS, ZoneSender } from '../zones/zone-sender.js';

function pix(level: number, w = 20, h = 20): Pixmap {
  const p = new Pixmap(w, h);
  p.fillRect(0, 0, w, h, level);
  return p;
}

describe('ZoneSender', () => {
  let sent: Array<{ region: Tile; at: number }>;
  let result: unknown;
  let inFlight: number;
  let maxInFlight: number;
  let sender: ZoneSender;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    sent = [];
    result = 'success';
    inFlight = 0;
    maxInFlight = 0;
    sender = new ZoneSender(async (region, png) => {
      expect(png[1]).toBe(0x50); // 'P' of the PNG signature
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      sent.push({ region, at: Date.now() });
      await new Promise((r) => setTimeout(r, 30));
      inFlight -= 1;
      if (result instanceof Error) throw result;
      return result;
    });
  });
  afterEach(() => {
    sender.dispose();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('sends in priority order, one at a time, at least 100 ms apart', async () => {
    sender.submit('br', pix(1));
    sender.submit('bl', pix(2));
    sender.submit('tr', pix(3));
    sender.submit('tl', pix(4));
    await vi.advanceTimersByTimeAsync(1000);
    expect(sent.map((s) => s.region)).toEqual(['tl', 'tr', 'bl', 'br']);
    expect(maxInFlight).toBe(1);
    const at = sent.map((x) => x.at);
    for (let i = 1; i < at.length; i++) {
      expect((at[i] ?? 0) - (at[i - 1] ?? 0)).toBeGreaterThanOrEqual(MIN_GAP_MS);
    }
  });

  it('skips unchanged tiles and keeps only the latest pixmap of a queued tile', async () => {
    sender.submit('tl', pix(4));
    await vi.advanceTimersByTimeAsync(500);
    sender.submit('tl', pix(4));
    await vi.advanceTimersByTimeAsync(500);
    expect(sent).toHaveLength(1);
    sender.submit('bl', pix(5));
    sender.submit('bl', pix(6));
    sender.submit('bl', pix(2));
    await vi.advanceTimersByTimeAsync(500);
    expect(sent.map((s) => s.region)).toEqual(['tl', 'bl']);
    sender.submit('bl', pix(2));
    await vi.advanceTimersByTimeAsync(500);
    expect(sent).toHaveLength(2);
  });

  it('retries failed sends (rejected result or thrown error) after the backoff', async () => {
    result = 'sendFailed';
    sender.submit('tl', pix(1));
    await vi.advanceTimersByTimeAsync(200);
    expect(sent).toHaveLength(1);
    expect(console.warn).toHaveBeenCalledWith('[hud] image tl rejected: sendFailed');
    result = new Error('ble');
    await vi.advanceTimersByTimeAsync(RETRY_MS);
    expect(sent).toHaveLength(2);
    expect(console.warn).toHaveBeenCalledWith('[hud] image tl send failed', expect.any(Error));
    result = 'success';
    await vi.advanceTimersByTimeAsync(RETRY_MS);
    expect(sent).toHaveLength(3);
    sender.submit('tl', pix(1));
    await vi.advanceTimersByTimeAsync(RETRY_MS);
    expect(sent).toHaveLength(3);
  });

  it('reset re-sends everything and ignores results of sends started before it', async () => {
    sender.submit('tl', pix(1));
    await vi.advanceTimersByTimeAsync(5);
    sender.reset();
    await vi.advanceTimersByTimeAsync(200);
    sender.submit('tl', pix(1));
    await vi.advanceTimersByTimeAsync(200);
    expect(sent.map((s) => s.region)).toEqual(['tl', 'tl']);
  });

  it('stops after dispose', async () => {
    sender.submit('tl', pix(1));
    sender.dispose();
    sender.submit('bl', pix(1));
    await vi.advanceTimersByTimeAsync(1000);
    expect(sent).toHaveLength(0);
  });
});
