/**
 * DebugEventBus — bounded in-memory ring buffer of {@link DebugEvent}s with
 * push / query / subscribe / clear + STRUCTURAL token redaction.
 *
 * Quick Task 260529-h5e Wave 2.
 *
 * The bus is the single observability sink for the debug backend: the WS inbound
 * tap, the DeltaEmitter `onEmit` hook, tool dispatches, and the g2-app display-op
 * mirror all `push()` here, and `GET /debug/events` + WS `/debug/stream` read it.
 *
 * # Security — T-h5e-03 / T-h5e-05
 *
 * - Bounded ring (default cap 2000) prevents unbounded memory growth (DoS accept).
 * - W-4 STRUCTURAL REDACTION: tokens are scrubbed on `push()` everywhere they can
 *   appear — free-form `summary` strings AND arbitrarily-nested `payload` values —
 *   not merely by field name. Two complementary passes run:
 *     1. Known-token scrub: any registered session bearer token (set via
 *        {@link setKnownTokens}) is replaced by a ≤8-char hint wherever it appears,
 *        including inside larger strings.
 *     2. Token-shaped heuristic: object fields literally named token / bearer /
 *        secret / authorization / apiKey (case-insensitive) have their string values
 *        reduced to a hint, catching tokens we do not (yet) know about.
 *   The pino redact list already covers logs; this bus bypasses pino so it must
 *   redact independently.
 *
 * @see ./debug-routes.ts (consumers)
 * @see ../server.ts (producers — taps + onEmit hook)
 * @see packages/shared-protocol/src/debug/debug-events.ts (DebugEvent shape)
 */
import type { DebugEvent } from '@evf/shared-protocol';

/** Filter for {@link DebugEventBus.query}. */
export interface DebugEventFilter {
  /** Return at most this many (newest) events. */
  tail?: number;
  /** Match `event.type` exactly. */
  type?: string;
  /** Match `event.direction` exactly. */
  direction?: string;
  /** Match `event.sessionId` exactly. */
  sessionId?: string;
}

/** Object field names whose string values are always token-shaped (case-insensitive). */
const TOKEN_FIELD_NAMES = new Set([
  'token',
  'bearer',
  'secret',
  'authorization',
  'apikey',
  'forgepassword',
]);

/** Minimum length for the token-shaped heuristic to treat a string value as a secret. */
const TOKEN_SHAPED_MIN_LEN = 16;

/** Reduce a raw token to a short, non-reversible hint (first ≤8 chars + ellipsis). */
function hintFor(raw: string): string {
  return `${raw.slice(0, Math.min(8, raw.length))}…`;
}

/**
 * Bounded ring buffer of debug events with structural token redaction.
 */
export class DebugEventBus {
  private readonly cap: number;
  private readonly buffer: DebugEvent[] = [];
  private nextId = 1;
  private readonly subscribers = new Set<(e: DebugEvent) => void>();
  /** Known session bearer tokens to scrub from any string (W-4 pass 1). */
  private knownTokens: string[] = [];

  /**
   * @param opts.cap - Maximum retained events (default 2000). Oldest evicted first.
   */
  constructor(opts: { cap?: number } = {}) {
    this.cap = opts.cap ?? 2000;
  }

  /**
   * Register the set of known session bearer tokens to scrub on push.
   *
   * Called by the server with the live SessionStore tokens so a token echoed inside
   * a free-form summary or nested payload is caught even if it is not in a
   * token-named field. Copies the array defensively.
   */
  setKnownTokens(tokens: readonly string[]): void {
    // Keep only non-trivial tokens to avoid scrubbing short/empty strings everywhere.
    this.knownTokens = tokens.filter((t) => t.length >= 6);
  }

  /**
   * Push a partial event (id is assigned here, starting at 1) after redaction.
   *
   * @param partial - Event without `id`.
   * @returns The stored, redacted event (with assigned `id`).
   */
  push(partial: Omit<DebugEvent, 'id'>): DebugEvent {
    const event: DebugEvent = this.redact({ ...partial, id: this.nextId++ });
    this.buffer.push(event);
    if (this.buffer.length > this.cap) {
      this.buffer.splice(0, this.buffer.length - this.cap);
    }
    for (const fn of this.subscribers) {
      fn(event);
    }
    return event;
  }

  /**
   * Query buffered events oldest-first, applying filters then a `tail` cap.
   */
  query(filter: DebugEventFilter = {}): DebugEvent[] {
    let result = this.buffer;
    if (filter.type !== undefined) result = result.filter((e) => e.type === filter.type);
    if (filter.direction !== undefined)
      result = result.filter((e) => e.direction === filter.direction);
    if (filter.sessionId !== undefined)
      result = result.filter((e) => e.sessionId === filter.sessionId);
    if (filter.tail !== undefined && result.length > filter.tail) {
      result = result.slice(result.length - filter.tail);
    } else if (result === this.buffer) {
      // Always return a copy so callers cannot mutate internal state.
      result = result.slice();
    }
    return result;
  }

  /**
   * Subscribe to every SUBSEQUENT push.
   *
   * @returns An idempotent unsubscribe function.
   */
  subscribe(fn: (e: DebugEvent) => void): () => void {
    this.subscribers.add(fn);
    return () => {
      this.subscribers.delete(fn);
    };
  }

  /** Current number of live subscribers (W-3 teardown assertions). */
  get subscriberCount(): number {
    return this.subscribers.size;
  }

  /**
   * Current number of retained events (≤ cap).
   *
   * Cheap O(1) read for the `/debug/state` snapshot (Quick Task 260529-icd).
   */
  get size(): number {
    return this.buffer.length;
  }

  /**
   * Count retained events by direction, seeding all 7 keys at 0.
   *
   * Used by the `/debug/state` snapshot (Quick Task 260529-icd) to summarise the
   * ring buffer without dumping events. O(n) over the bounded buffer.
   *
   * Extended in Quick Task 260604-cwa with `'agent-log'` and `'agent-result'`
   * keys (additive — seeded at 0 so existing consumers see no change).
   *
   * @returns A record with an integer count for each {@link DebugEvent.direction}.
   */
  byDirection(): Record<DebugEvent['direction'], number> {
    const counts: Record<DebugEvent['direction'], number> = {
      inbound: 0,
      outbound: 0,
      tool: 0,
      log: 0,
      display: 0,
      'agent-log': 0,
      'agent-result': 0,
    };
    for (const e of this.buffer) {
      counts[e.direction] += 1;
    }
    return counts;
  }

  /** Empty the buffer (subscribers are retained). */
  clear(): void {
    this.buffer.length = 0;
  }

  // ── Redaction (W-4) ───────────────────────────────────────────────────────────

  /** Apply structural redaction to summary + payload (mutates a shallow copy). */
  private redact(event: DebugEvent): DebugEvent {
    return {
      ...event,
      summary: this.scrubString(event.summary),
      payload: this.scrubValue(event.payload),
    };
  }

  /** Replace any known token occurrence inside a free-form string with its hint. */
  private scrubString(value: string): string {
    let out = value;
    for (const token of this.knownTokens) {
      if (out.includes(token)) {
        out = out.split(token).join(hintFor(token));
      }
    }
    return out;
  }

  /** Recursively scrub a value: known tokens in strings + token-shaped named fields. */
  private scrubValue(value: unknown, fieldName?: string): unknown {
    if (typeof value === 'string') {
      const scrubbed = this.scrubString(value);
      // Token-shaped heuristic: a long string under a token-named field is a secret.
      if (
        fieldName !== undefined &&
        TOKEN_FIELD_NAMES.has(fieldName.toLowerCase()) &&
        scrubbed.length >= TOKEN_SHAPED_MIN_LEN
      ) {
        return hintFor(scrubbed);
      }
      return scrubbed;
    }
    if (Array.isArray(value)) {
      return value.map((v) => this.scrubValue(v));
    }
    if (value !== null && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) {
        out[k] = this.scrubValue(v, k);
      }
      return out;
    }
    return value;
  }
}
