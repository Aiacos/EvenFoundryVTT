/**
 * bus-log-stream — bridge the bridge's pino logger into the {@link DebugEventBus}
 * as `direction: 'log'` events, so log lines surface in `/debug/events`,
 * `/debug/stream`, and the CRT dashboard alongside protocol traffic.
 *
 * Quick Task 260529-icd Task 1.
 *
 * # Why a multistream sink (not a pino transport)
 *
 * A pino *transport* runs in a worker thread and therefore cannot reach the
 * in-process DebugEventBus singleton. We instead register this sink as one leg of
 * `pino.multistream([...])`, which runs IN-PROCESS in the main thread — the same
 * thread that owns the bus. The other leg is `pino.destination(1)` (stdout), so
 * normal logging is untouched.
 *
 * # Security
 *
 * The chunk handed to {@link createBusLogStream} is ALREADY redacted by pino's
 * own `redact` config (the multistream runs after serialization). On top of that,
 * `bus.push()` applies its own W-4 structural token scrub — double safety so a
 * logged bearer/token never reaches the dashboard.
 *
 * # Robustness
 *
 * `write()` wraps parse+push in try/catch: a malformed NDJSON line MUST never crash
 * logging. On any parse/push error the line is silently dropped (no event).
 *
 * @see ./debug-event-bus.ts (the sink target)
 * @see ../server.ts (wires this into pino.multistream when isDebugEnabled())
 */
import type { DebugEventBus } from './debug-event-bus.js';

/** pino numeric level → short label (10 trace … 60 fatal). */
const LEVEL_LABELS: Readonly<Record<number, string>> = {
  10: 'trace',
  20: 'debug',
  30: 'info',
  40: 'warn',
  50: 'error',
  60: 'fatal',
};

/**
 * Map a pino numeric level to its short label.
 *
 * @param level - The numeric pino level (10/20/30/40/50/60).
 * @returns The label (`trace`…`fatal`), or `lvl<N>` for an unrecognised value.
 */
export function levelLabel(level: number): string {
  return LEVEL_LABELS[level] ?? `lvl${level}`;
}

/** Minimal pino-multistream sink: an object exposing a synchronous `write`. */
export interface BusLogSink {
  /** Receive one serialized NDJSON pino line (already redacted). */
  write(chunk: string | Buffer): void;
}

/**
 * Create a multistream sink that forwards each redacted pino NDJSON line into the
 * given {@link DebugEventBus} as a `direction: 'log'` event.
 *
 * The produced event:
 * - `direction`: `'log'`
 * - `type`: `'log.' + levelLabel(parsed.level)` (e.g. `log.warn`)
 * - `sessionId`: `parsed.sessionId ?? null`
 * - `seq`: `null`
 * - `summary`: `parsed.msg ?? ''`
 * - `payload`: the full parsed (redacted) log object
 *
 * @param bus - The in-process DebugEventBus to push into.
 * @returns A sink object suitable for `pino.multistream([{ stream }])`.
 */
export function createBusLogStream(bus: DebugEventBus): BusLogSink {
  return {
    write(chunk: string | Buffer): void {
      try {
        const line = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
        const parsed = JSON.parse(line) as {
          level: number;
          msg?: string;
          sessionId?: string | null;
        };
        bus.push({
          ts: Date.now(),
          direction: 'log',
          type: `log.${levelLabel(parsed.level)}`,
          sessionId: parsed.sessionId ?? null,
          seq: null,
          summary: parsed.msg ?? '',
          payload: parsed,
        });
      } catch {
        // Defensive: a malformed/non-JSON line must NEVER crash logging.
      }
    },
  };
}
