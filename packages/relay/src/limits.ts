/**
 * Pure abuse limits for the EVF relay (ADR-0019): frame size and per-socket frame rate.
 */

/** Largest frame the relay forwards (1 MiB); bigger frames close the sender with 1009. */
export const MAX_FRAME_BYTES = 1_048_576;

/** Frames allowed per socket in any rolling {@link RATE_WINDOW_MS} window; more → close 1008. */
export const MAX_FRAMES_PER_WINDOW = 60;

/** Length of the rolling rate window, in milliseconds. */
export const RATE_WINDOW_MS = 1_000;

/**
 * UTF-8 byte length of a string without allocating an encoded copy.
 *
 * Lone surrogates count as 3 bytes (they are encoded as U+FFFD, like `TextEncoder`).
 *
 * @param text - Any JS string.
 * @returns Number of bytes `TextEncoder#encode(text)` would produce.
 */
export function utf8ByteLength(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && isLowSurrogate(text.charCodeAt(i + 1))) {
      bytes += 4;
      i++;
    } else bytes += 3;
  }
  return bytes;
}

function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}

/**
 * Size of a WebSocket frame payload in bytes (UTF-8 for text frames).
 *
 * @param message - Text or binary frame as delivered to `webSocketMessage`.
 * @returns Payload size in bytes.
 */
export function frameByteLength(message: string | ArrayBuffer): number {
  return typeof message === 'string' ? utf8ByteLength(message) : message.byteLength;
}

/**
 * Rolling-window frame counter for one socket.
 *
 * Keeps at most `limit + 1` timestamps; memory-only (a Durable Object hibernation wake-up
 * starts a fresh limiter, which is acceptable for an abuse cap).
 */
export class RateLimiter {
  private readonly stamps: number[] = [];

  /**
   * @param limit - Frames allowed per window.
   * @param windowMs - Rolling window length in milliseconds.
   */
  constructor(
    private readonly limit: number = MAX_FRAMES_PER_WINDOW,
    private readonly windowMs: number = RATE_WINDOW_MS,
  ) {}

  /**
   * Records one frame.
   *
   * @param now - Current time in milliseconds (monotonic enough: `Date.now()`).
   * @returns `true` while the socket is within the limit, `false` once it exceeded it.
   */
  hit(now: number): boolean {
    const cutoff = now - this.windowMs;
    let oldest = this.stamps[0];
    while (oldest !== undefined && oldest <= cutoff) {
      this.stamps.shift();
      oldest = this.stamps[0];
    }
    this.stamps.push(now);
    return this.stamps.length <= this.limit;
  }
}
