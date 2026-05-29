/**
 * makeInboundTap — the gated WS inbound debug tap (W-2).
 *
 * Quick Task 260529-h5e Wave 2.
 *
 * # W-2 contract
 *
 * The debug-enabled boolean is captured ONCE as a closure `const` at build time and
 * is NOT re-read from `process.env` per message. When disabled the returned function
 * is a true no-op: it does ZERO work per message (no JSON parse, no bus.push), so the
 * production hot path pays at most one already-evaluated boolean closure capture.
 *
 * When enabled, each raw WS frame is best-effort-parsed for `type` / `seq` (falling
 * back to `'unparsed'` / `null`) and a single `inbound` {@link DebugEvent} is pushed.
 *
 * @param debugEnabled - Captured at buildServer() time (do NOT pass a getter).
 * @param bus          - The DebugEventBus to push inbound events into.
 * @returns A per-message tap `(sessionId, raw) => void`.
 *
 * @see ../server.ts (consumer — wires this inside the WS message loop)
 */
import type { DebugEventBus } from './debug-event-bus.js';

/** Coerce a raw `ws` payload to a UTF-8 string for best-effort parsing. */
function toText(raw: Buffer | ArrayBuffer | Buffer[] | string): string {
  if (typeof raw === 'string') return raw;
  if (Buffer.isBuffer(raw)) return raw.toString('utf-8');
  if (Array.isArray(raw)) return Buffer.concat(raw).toString('utf-8');
  return Buffer.from(raw).toString('utf-8');
}

export function makeInboundTap(
  debugEnabled: boolean,
  bus: DebugEventBus,
): (sessionId: string, raw: Buffer | ArrayBuffer | Buffer[] | string) => void {
  // Disabled: return a no-op so production does ZERO work per message.
  if (!debugEnabled) {
    return () => {};
  }

  return (sessionId, raw) => {
    let type = 'unparsed';
    let seq: number | null = null;
    try {
      const parsed = JSON.parse(toText(raw)) as { type?: unknown; seq?: unknown };
      if (typeof parsed.type === 'string') type = parsed.type;
      if (typeof parsed.seq === 'number') seq = parsed.seq;
    } catch {
      // Non-JSON frame — keep the 'unparsed' summary.
    }
    bus.push({
      ts: Date.now(),
      direction: 'inbound',
      sessionId,
      type,
      seq,
      summary: type,
      payload: undefined,
    });
  };
}
