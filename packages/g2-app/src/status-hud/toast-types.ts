/**
 * Toast queue type contracts — Zod schema, severity union, runtime constants.
 *
 * The z=1.5 toast layer (`ToastQueueLayer`) consumes these to validate every
 * external `enqueue(toast)` payload before pushing into the FIFO queue. Severity
 * prefixes (`i: ` / `!: ` / `x: `) are intentionally language-neutral per
 * Pitfall 6 (`04B-RESEARCH.md` §Common Pitfalls #6) — they are NOT entries in
 * `i18n-budgets.ts`; the single-char + colon + space form was chosen because it
 * is identical across IT/EN/DE and survives all three locales without budget
 * arithmetic. The `toast_squash_badge_template` + `toast_row_padding_target`
 * keys in `HUD_WIDTH_BUDGETS` (Plan 01 Wave 0) cover the only locale-sensitive
 * surfaces of the toast queue.
 *
 * **Width budget (UI-SPEC §3.2):** the 42-char row is composed of:
 *   3 (severity prefix `i: `) + 38 (message body) + 1 (right margin) = 42.
 *
 *   When the head row carries a squash badge (` [+N]`, leading space + 4-5
 *   chars depending on N), the message is rendered truncated to stay within
 *   the 42-char `TOAST_ROW_WIDTH` budget (the renderer right-pads or truncates
 *   AFTER inserting the badge — see `ToastQueueLayer._buildContent`).
 *
 * **DoS mitigation (T-4b-03-02):** `TOAST_BUFFER_SOFT_CAP = 100` is the soft
 * cap. On overflow, the OLDEST queued (buffered, not visible) toast is dropped
 * and a `console.warn` telemetry line is emitted. Currently-visible toasts are
 * NEVER dropped — they always cycle out through the 3 s dwell timer.
 *
 * @see .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04b-CONTEXT.md §Area 5
 * @see .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-RESEARCH.md §Approach 3 + §Q5
 * @see .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-UI-SPEC.md §3.2
 * @see .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04b-01-SUMMARY.md (Z1_5_TOAST + toast_* budgets landed Wave 0)
 */
import { z } from 'zod';

/**
 * Toast severity literal union.
 *
 * Drives the language-neutral severity prefix glyph (`i: ` / `!: ` / `x: `) per
 * UI-SPEC §3.2 + Pitfall 6. NOT a localised label — the prefix is identical
 * across IT/EN/DE/future locales.
 */
export const ToastSeveritySchema = z.enum(['info', 'warn', 'error']);

/** Inferred runtime type for `ToastSeveritySchema`. */
export type ToastSeverity = z.infer<typeof ToastSeveritySchema>;

/**
 * Zod schema for a single toast payload.
 *
 * - `id` — caller-supplied stable identity (UUID or monotonic string). Used as
 *   the dwell-timer map key. The layer treats this as opaque and never parses
 *   it; uniqueness is the caller's responsibility (duplicate ids overwrite the
 *   existing dwell timer in the map — accept-and-warn semantics, not a hard
 *   error).
 * - `severity` — one of `info | warn | error`.
 * - `message` — display text, max 38 chars (UI-SPEC §3.2 budget: 42-char row
 *   width minus 3-char severity prefix minus 1-char right margin). Empty
 *   message rejected (`min(1)`).
 * - `emittedAt` — `Date.now()` at emit time. Used by the layer to schedule the
 *   3 s dwell timer; non-negative integer.
 *
 * `z.strictObject` (not the default `z.object`) is intentional — rejects any
 * unknown property at the trust boundary so a future field rename does not
 * silently drop data.
 */
export const ToastSchema = z.strictObject({
  /** Caller-supplied stable identity (e.g., UUID or monotonic counter as string). */
  id: z.string().min(1),
  /** Severity drives the single-char prefix glyph (`i:` / `!:` / `x:`). */
  severity: ToastSeveritySchema,
  /** Display text — max 38 char body width per UI-SPEC §3.2 (42 row - 3 prefix - 1 margin). */
  message: z.string().min(1).max(38),
  /** Emit timestamp (`Date.now()`) — drives the 3 s dwell timer schedule. */
  emittedAt: z.number().int().nonnegative(),
});

/** Inferred runtime type for `ToastSchema`. */
export type Toast = z.infer<typeof ToastSchema>;

/**
 * Minimal toast-sink contract shared by both toast layer implementations.
 *
 * `ToastQueueLayer` (glyph, text container) and `CanvasToastLayer` (canvas,
 * drawn-on-canvas) both implement this. Consumers that only enqueue (panels,
 * dispatchers, the panel router) should depend on `ToastSink` — NOT a concrete
 * layer — so the right backend can be selected per render mode at boot.
 */
export interface ToastSink {
  enqueue(toast: Toast): void;
}

/**
 * Language-neutral severity → prefix map.
 *
 * Each prefix is exactly 3 chars: one ASCII alpha + colon + space. The width is
 * load-bearing for the 42-char row budget arithmetic in `ToastQueueLayer`.
 *
 * **Pitfall 6 compliance:** these prefixes are intentionally NOT registered in
 * `HUD_WIDTH_BUDGETS` (`i18n-budgets.ts`). They are identical across all locales
 * and adding them to the budget table would introduce a fake `it/en/de` row that
 * would have to be maintained for no semantic benefit.
 */
export const SEVERITY_PREFIX: Readonly<Record<ToastSeverity, string>> = {
  info: 'i: ',
  warn: '!: ',
  error: 'x: ',
};

/**
 * Per-toast dwell window in milliseconds (UI-SPEC §3.2 / CONTEXT §Area 5).
 *
 * Each visible toast schedules its own `setTimeout(3000)`; on expiry, the toast
 * is unmounted and the next buffered toast (if any) is promoted to visible.
 */
export const TOAST_DWELL_MS = 3000;

/**
 * Maximum concurrent visible toasts (CONTEXT §Area 5 capacity rule).
 *
 * FIFO: head (oldest visible) on block row 0, tail (newest visible) on row 1.
 * A 3rd enqueue while `visible.length === 2` is pushed to `buffered` and the
 * head row gets a ` [+N]` squash badge suffix.
 */
export const TOAST_VISIBLE_CAPACITY = 2;

/**
 * Soft cap on the buffered queue (T-4b-03-02 DoS mitigation).
 *
 * On overflow (`buffered.length === 100`), the OLDEST queued toast is dropped
 * (`buffered.shift()`) and a `console.warn` telemetry line is emitted. Visible
 * toasts are never dropped — they always cycle out via the 3 s dwell timer.
 */
export const TOAST_BUFFER_SOFT_CAP = 100;

/**
 * SDK container name for the single 2-row toast block.
 *
 * Strategy A from Plan 01 (`getContainerCount(): { image: 0, text: 1 }`):
 * the toast layer occupies ONE text/list container regardless of how many
 * toasts are visible. Both rows are joined with `\n` inside the same container.
 * UI-SPEC §3.2 + §7 container budget audit lock this in (`Idle + 1-2 toasts
 * mounted, no overlay = 12 total at budget`).
 */
export const TOAST_CONTAINER_NAME = 'toast-block' as const;

/**
 * Per-row character width budget (UI-SPEC §3.2 + i18n-budgets `toast_row_padding_target.max`).
 *
 * Each rendered row (head + tail) is right-padded with spaces to exactly this
 * width so INV-1 column continuity is preserved across all three states
 * (empty / 1 visible / 2 visible / squashed).
 */
export const TOAST_ROW_WIDTH = 42 as const;
