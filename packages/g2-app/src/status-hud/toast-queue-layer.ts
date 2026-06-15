/**
 * ToastQueueLayer — z=1.5 FIFO toast queue with `[+N]` squash badge.
 *
 * Implements the `Layer` interface (`../engine/layer-types.ts`) and is mounted
 * by the LayerManager at `ZIndex.Z1_5_TOAST` (carved out from the differential
 * demolish rule per ADR-0009 Amendment 1 Rule 2 — toast survives z=2 overlay
 * open). Strategy A from Plan 01 (`getContainerCount(): { image: 0, text: 1 }`):
 * the layer occupies exactly ONE text container (`'toast-block'`) regardless of
 * how many toasts are visible; both rows are joined with `\n` inside the same
 * container.
 *
 * **FIFO semantics (CONTEXT §Area 5 + RESEARCH §Q5):**
 *   - Max 2 visible. Oldest on block row 0 (head); newest on block row 1 (tail).
 *   - Dwell 3 s per visible toast. On expiry, head is removed; tail promotes to
 *     head; oldest buffered promotes to tail; new dwell timer starts for the
 *     promoted toast.
 *   - On enqueue with `visible.length === 2`, push to `buffered`.
 *   - Squash badge: when `buffered.length > 0`, head's content gets a `' [+N]'`
 *     suffix (leading space) where `N = min(buffered.length, 99)`. When
 *     `buffered.length > 99`, the display is capped at `[+99]` and a
 *     `console.warn` telemetry line fires (T-4b-03-05 mitigation, DoS scenario
 *     overlapping with T-4b-03-02).
 *
 * **DoS mitigation (T-4b-03-02):** `TOAST_BUFFER_SOFT_CAP = 100`. On overflow,
 * the OLDEST queued toast is dropped (`buffered.shift()`) + `console.warn`.
 * Visible toasts are never dropped.
 *
 * **Trust boundary (T-4b-03-01):** the public `enqueue(toast)` runs
 * `ToastSchema.safeParse` on every payload. Failure → `console.warn` + ignore
 * (no throw, no rendering of malformed content).
 *
 * **Timer leak mitigation (T-4b-03-03):** `destroy()` iterates the dwell-timer
 * map and clears every active timer before clearing the map and resetting the
 * queues. Idempotent — second invocations are no-ops on empty state.
 *
 * **Delta short-circuit:** `_redrawIfChanged()` compares the new content
 * string against `renderedContent`; if identical, no bridge call is made.
 * Keeps the bridge wire quiet across no-op redraws (e.g., dwell expiry of an
 * already-empty queue).
 *
 * No virtual DOM — render output is a single `bridge.textContainerUpgrade`
 * call per state change (D-2.04, CLAUDE.md).
 *
 * @see docs/architecture/0009-layer-manager-contract.md §Amendment 1 (Rule 2: z=1.5 carve-out)
 * @see .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04b-CONTEXT.md §Area 5
 * @see .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-RESEARCH.md §Approach 3 + §Q5 + §Pitfall 6
 * @see .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-UI-SPEC.md §3.2 (4 visual states)
 */

import { type EvenAppBridge, TextContainerUpgrade } from '@evenrealities/even_hub_sdk';
import { resolveContainerIdField } from '../engine/container-registry.js';
import type { Layer } from '../engine/layer-types.js';
import {
  SEVERITY_PREFIX,
  TOAST_BUFFER_SOFT_CAP,
  TOAST_CONTAINER_NAME,
  TOAST_DWELL_MS,
  TOAST_ROW_WIDTH,
  TOAST_VISIBLE_CAPACITY,
  type Toast,
  ToastSchema,
} from './toast-types.js';

/** Constructor options for `ToastQueueLayer`. */
export interface ToastQueueLayerOpts {
  /** Even Hub bridge handle used for `textContainerUpgrade` calls. */
  readonly bridge: EvenAppBridge;
}

/**
 * z=1.5 FIFO toast queue layer.
 *
 * Construct once per app boot and mount via `layerManager.mount(Z1_5_TOAST, …)`.
 * External producers (combat-log adapter, save resolver, etc.) call
 * `enqueue(toast)` on this instance; the layer drives its own redraws and
 * dwell-timer scheduling.
 */
export class ToastQueueLayer implements Layer {
  /** Stable id used by LayerManager + telemetry. */
  public readonly id = 'toast-queue';

  private readonly bridge: EvenAppBridge;

  /** Visible toasts (length 0..TOAST_VISIBLE_CAPACITY). Index 0 = head. */
  private visible: Toast[] = [];
  /** Queued toasts beyond capacity (length 0..TOAST_BUFFER_SOFT_CAP). FIFO. */
  private buffered: Toast[] = [];
  /** Dwell timers keyed by toast id — cleared on dwell-out or destroy. */
  private readonly dwellTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  /** Last content string flushed to the bridge — for delta short-circuit. */
  private renderedContent: string = '';

  constructor(opts: ToastQueueLayerOpts) {
    this.bridge = opts.bridge;
  }

  /**
   * Re-render the layer immediately (no debounce).
   *
   * Called by LayerManager during bundle flushes. The delta short-circuit still
   * applies — if the content hasn't changed since the last render, no bridge
   * call is made.
   */
  async draw(): Promise<void> {
    await this._redrawIfChanged();
  }

  /**
   * Tear down the layer.
   *
   * Clears every active dwell timer, then resets visible/buffered queues and
   * the timer map. Idempotent — second invocations are no-ops on empty state.
   * T-4b-03-03 mitigation: ensures no `setTimeout` survives the layer's life.
   */
  destroy(): void {
    for (const timer of this.dwellTimers.values()) {
      clearTimeout(timer);
    }
    this.dwellTimers.clear();
    this.visible = [];
    this.buffered = [];
    this.renderedContent = '';
  }

  /**
   * Report the layer's container footprint (Plan 01 Strategy A).
   *
   * Always `{ image: 0, text: 1 }` — single `'toast-block'` text container with
   * 2-row newline-separated content. LayerManager.bundle() sums this with the
   * other mounted layers' counts to assert the SDK 4-image / 8-text cap.
   */
  getContainerCount(): { image: 0; text: 1 } {
    return { image: 0, text: 1 };
  }

  /**
   * Enqueue an external toast payload.
   *
   * 1. `ToastSchema.safeParse` runs first — failure → `console.warn` + return
   *    with no state change (T-4b-03-01 mitigation).
   * 2. If `visible.length < TOAST_VISIBLE_CAPACITY`: push to visible. If this
   *    is the FIRST visible toast (i.e., the head was previously empty),
   *    schedule a single dwell timer for it. Subsequent enqueues that land on
   *    the tail slot do NOT schedule their own dwell — they wait for the head
   *    to expire (FIFO sequential cycling per RESEARCH §Q5: "cycle through
   *    over the next ~10.5 seconds (3 s × ceil(7/2) ≈ 11 s)").
   * 3. Else: push to `buffered`. If `buffered.length >= TOAST_BUFFER_SOFT_CAP`
   *    BEFORE the push, drop the oldest queued (`buffered.shift()`) and emit a
   *    telemetry warn (T-4b-03-02 mitigation). Then push, redraw.
   *
   * Redraw is fire-and-forget — the underlying `textContainerUpgrade` returns
   * a Promise but callers don't await `enqueue`. Tests can flush pending work
   * via `vi.advanceTimersByTimeAsync(0)` (microtask drain) or by awaiting
   * `draw()` explicitly.
   *
   * **Sequential dwell rationale:** scheduling a separate dwell timer per
   * visible toast would mean simultaneous enqueues all expire at the same
   * wall-clock time — defeating the FIFO cycling property and producing a
   * single-frame "empty queue" flash before the next promotion. Anchoring the
   * dwell to the HEAD-only keeps the visible queue stable: head expires after
   * 3 s, tail promotes to head + buffered promotes to tail, fresh 3 s window
   * starts for the new head, repeat.
   *
   * @param toast Toast payload (validated via `ToastSchema.safeParse`).
   */
  enqueue(toast: Toast): void {
    const parsed = ToastSchema.safeParse(toast);
    if (!parsed.success) {
      console.warn('[toast-queue-layer] invalid Toast payload', parsed.error.issues);
      return;
    }
    const valid: Toast = parsed.data;

    if (this.visible.length < TOAST_VISIBLE_CAPACITY) {
      const wasEmpty = this.visible.length === 0;
      this.visible.push(valid);
      // Head-anchored dwell: only schedule a timer when the head slot was
      // previously empty (i.e., this is the new head). Tail-slot enqueues
      // ride the existing head's dwell window.
      if (wasEmpty) {
        this._scheduleDwell(valid);
      }
    } else {
      // Apply soft cap BEFORE pushing — if buffered is already at cap, drop the
      // oldest queued first so the new toast can claim the freed slot.
      if (this.buffered.length >= TOAST_BUFFER_SOFT_CAP) {
        const dropped = this.buffered.shift();
        console.warn(
          '[toast-queue-layer] soft cap exceeded; dropping oldest queued toast',
          dropped?.id,
        );
      }
      this.buffered.push(valid);
    }

    void this._redrawIfChanged();
  }

  /** Diagnostic — current visible-slot count (test surface). */
  getVisibleCount(): number {
    return this.visible.length;
  }

  /** Diagnostic — current buffered (non-visible) count (test surface). */
  getBufferedCount(): number {
    return this.buffered.length;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Internal — dwell scheduling + content building + delta detection
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Schedule the 3 s head-anchored dwell timer.
   *
   * Only the HEAD toast carries an active dwell timer (RESEARCH §Q5 sequential
   * cycling — see `enqueue` JSDoc for the rationale). On expiry:
   *
   * 1. Remove the head from `visible`; clear the timer-map entry.
   * 2. Promote the oldest buffered (if any) to the tail slot.
   * 3. If the queue is non-empty, schedule a fresh dwell for the NEW head
   *    (`visible[0]`).
   * 4. Redraw.
   *
   * If a timer for the same id already exists (duplicate enqueue with the
   * same id), it is cleared first to keep the map invariant of one timer per
   * id.
   */
  private _scheduleDwell(toast: Toast): void {
    const existing = this.dwellTimers.get(toast.id);
    if (existing !== undefined) {
      clearTimeout(existing);
    }
    const timer = setTimeout(() => {
      this.dwellTimers.delete(toast.id);
      // Remove the toast from visible (it may have shifted index since
      // scheduling, but the id is the stable handle).
      const idx = this.visible.findIndex((t) => t.id === toast.id);
      if (idx >= 0) {
        this.visible.splice(idx, 1);
      }
      // Promote the oldest buffered toast (if any) to fill the freed tail slot.
      if (this.buffered.length > 0) {
        const promoted = this.buffered.shift();
        if (promoted !== undefined) {
          this.visible.push(promoted);
        }
      }
      // Head-anchored cycling: only schedule the next dwell for the NEW HEAD
      // (visible[0]), which is whatever toast was previously the tail (or the
      // promoted buffered if the queue had only one visible).
      const newHead = this.visible[0];
      if (newHead !== undefined) {
        this._scheduleDwell(newHead);
      }
      void this._redrawIfChanged();
    }, TOAST_DWELL_MS);
    this.dwellTimers.set(toast.id, timer);
  }

  /**
   * Build the 2-row newline-separated content string for the toast-block.
   *
   * Row 0 (head): `SEVERITY_PREFIX[head.severity] + head.message` plus the
   *   ` [+N]` squash badge if `buffered.length > 0`. Right-padded with spaces
   *   to exactly `TOAST_ROW_WIDTH` (42) chars.
   * Row 1 (tail): `SEVERITY_PREFIX[tail.severity] + tail.message`. Right-padded
   *   to 42 chars. If only 1 visible toast, row 1 is 42 spaces.
   *
   * Both rows are produced when at least one toast is visible. When the queue
   * is empty (`visible.length === 0`), returns the empty string — caller's
   * delta short-circuit will skip the bridge call.
   */
  private _buildContent(): string {
    if (this.visible.length === 0) {
      return '';
    }
    const head = this.visible[0];
    if (head === undefined) {
      return '';
    }
    const headBody = SEVERITY_PREFIX[head.severity] + head.message + this._renderBadge();
    const row0 = this._padRow(headBody);

    let row1: string;
    if (this.visible.length >= 2) {
      const tail = this.visible[1];
      if (tail === undefined) {
        row1 = this._padRow('');
      } else {
        row1 = this._padRow(SEVERITY_PREFIX[tail.severity] + tail.message);
      }
    } else {
      row1 = this._padRow('');
    }
    return `${row0}\n${row1}`;
  }

  /**
   * Render the squash badge suffix.
   *
   * Returns `' [+N]'` (with the leading space) when `buffered.length > 0`;
   * otherwise the empty string. `N` is capped at 99 — overflow scenarios
   * (which should be unreachable under the soft cap but exist for paranoia)
   * trigger a telemetry warn (T-4b-03-05 mitigation).
   */
  private _renderBadge(): string {
    const count = this.buffered.length;
    if (count === 0) {
      return '';
    }
    if (count > 99) {
      console.warn('[toast-queue-layer] buffered toast count exceeds display cap (99)', count);
    }
    const displayCount = Math.min(count, 99);
    return ` [+${displayCount}]`;
  }

  /**
   * Right-pad a content string with spaces (or truncate) to `TOAST_ROW_WIDTH`.
   *
   * Truncation is necessary defensively: although `ToastSchema.message.max(38)`
   * + 3-char prefix + 5-char badge worst case = 46 chars, the input is also
   * sanitised at the trust boundary so the truncation branch is fire-prevention
   * (catches a future schema change that loosens the budget). Truncation cuts
   * mid-grapheme is acceptable here (ASCII-only severity prefix + ASCII-only
   * badge means only the message body can contain multi-byte chars, and Zod's
   * `.max(38)` limits the JS `.length`).
   */
  private _padRow(content: string): string {
    if (content.length >= TOAST_ROW_WIDTH) {
      return content.slice(0, TOAST_ROW_WIDTH);
    }
    return content + ' '.repeat(TOAST_ROW_WIDTH - content.length);
  }

  /**
   * Build the current content and flush to the bridge if it differs from the
   * last-rendered content.
   *
   * Delta short-circuit: if the new content string equals `renderedContent`,
   * no bridge call is made. This avoids redundant `textContainerUpgrade`
   * flushes when, e.g., a dwell expires on an already-empty queue and triggers
   * a redraw that produces the same empty content.
   */
  private async _redrawIfChanged(): Promise<void> {
    const content = this._buildContent();
    if (content === this.renderedContent) {
      return;
    }
    this.renderedContent = content;
    const payload = new TextContainerUpgrade({
      // Overlay-only name → resolveContainerId returns undefined (addressed by
      // name until the overlay-id rebuild path lands; see container-registry.ts).
      ...resolveContainerIdField(TOAST_CONTAINER_NAME),
      containerName: TOAST_CONTAINER_NAME,
      content,
    });
    await this.bridge.textContainerUpgrade(payload);
  }
}
