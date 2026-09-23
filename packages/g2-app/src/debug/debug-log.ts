/**
 * Debug channel — a small structured ring buffer (P5 auto-debug: every feature observable
 * without glasses). Replaces the bridge Debug Console removed by ADR-0016: the buffer lives
 * in the WebView, is shown in the phone page "Diagnostica" section and read by
 * `window.__evf.events()` / the simulator loop.
 *
 * Only created when `?debug=1` or `?demo=…` is present (see `flags.ts`); production
 * sessions without the flag never allocate it (fail-closed).
 *
 * @see docs/architecture/0016-direct-foundry-streaming.md
 */

export type DebugLevel = 'debug' | 'info' | 'warn' | 'error';

/** One structured debug event. */
export interface DebugEntry {
  /** Monotonic sequence number (never reused, survives ring eviction). */
  seq: number;
  /** Epoch ms. */
  ts: number;
  level: DebugLevel;
  /** Emitting subsystem (`hud`, `session`, `demo`, `uncaught`, …). */
  source: string;
  message: string;
  /** Optional structured payload (kept by reference — callers pass plain data). */
  data?: unknown;
}

/** Read side of the buffer (phone page, devtools). */
export interface DebugLogReader {
  /** All retained entries, oldest first. */
  entries(): readonly DebugEntry[];
  /** The last `n` entries, oldest first. */
  tail(n: number): readonly DebugEntry[];
  /** Runs `listener` after every push; returns the unsubscribe function. */
  subscribe(listener: (entry: DebugEntry) => void): () => void;
}

/** Full buffer (write + read). */
export interface DebugLog extends DebugLogReader {
  push(level: DebugLevel, source: string, message: string, data?: unknown): void;
}

/** Default retained entries. */
export const DEBUG_LOG_CAPACITY = 200;

/**
 * Creates a ring buffer.
 *
 * @param options.capacity - Retained entries (oldest evicted first); default 200.
 * @param options.now - Clock (tests).
 */
export function createDebugLog(options: { capacity?: number; now?: () => number } = {}): DebugLog {
  const capacity = Math.max(1, options.capacity ?? DEBUG_LOG_CAPACITY);
  const now = options.now ?? Date.now;
  const buffer: DebugEntry[] = [];
  const listeners = new Set<(entry: DebugEntry) => void>();
  let seq = 0;
  return {
    push(level, source, message, data) {
      seq += 1;
      const entry: DebugEntry = { seq, ts: now(), level, source, message };
      if (data !== undefined) entry.data = data;
      buffer.push(entry);
      if (buffer.length > capacity) buffer.shift();
      for (const l of listeners) l(entry);
    },
    entries: () => [...buffer],
    tail: (n) => (n <= 0 ? [] : buffer.slice(-n)),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

let active: DebugLogReader | null = null;

/**
 * Registers the process-wide buffer shown by the phone page. `main.ts` calls it only in
 * debug/demo mode, so {@link activeDebugLog} stays `null` (section hidden) otherwise.
 */
export function setActiveDebugLog(log: DebugLogReader | null): void {
  active = log;
}

/** The registered buffer, or `null` when the debug channel is off. */
export function activeDebugLog(): DebugLogReader | null {
  return active;
}
