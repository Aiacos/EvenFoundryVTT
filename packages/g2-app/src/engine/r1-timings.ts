/**
 * R1 ring gesture timing constants — Plan 06-01.
 *
 * Exports `DEFAULT_R1_TIMINGS`, a frozen const holding the four timing
 * windows used by the R1 event source provider. These values were determined
 * by the Phase 6 CONTEXT.md §Area 1 decision and are marked [ASSUMED] pending
 * hardware-validation closure via SC-06-01 (Phase 0 §10.0.1 timing test).
 *
 * # Timing semantic notes (D-Area-1 + RESEARCH.md §Q1)
 *
 * - `tapMs` (250 ms) — single-tap window (client guard). [ASSUMED]
 * - `doubleTapWindowMs` (350 ms) — second tap must arrive within this
 *   window after the first for it to count as a double-tap. [ASSUMED]
 *   NOTE: the Bridge currently synthesises double-tap events directly;
 *   this field is reserved for client-side disambiguation if needed.
 *   (`long-press` was retired by ADR-0012 — no duration-based input exists.)
 * - `scrollDebounceMs` (50 ms) — scroll event debounce. [ASSUMED]
 *   Currently documented but not actively applied in Phase 6 software;
 *   closes via SC-06-01 hardware-tuning.
 *
 * # Hardware-pending (SC-06-01)
 *
 * `DEFAULT_R1_TIMINGS` values will be validated against a real R1 ring
 * via `pnpm --filter @evf/validation-harness validate:all` when Even Hub
 * access is available (ADR-0005 Branch A `human_needed` carry-forward).
 *
 * @see Specs.md §3.2 (R1 hardware gesture model — 4 canonical gestures, ADR-0012)
 * @see Specs.md §10.0.1 (Phase 0 GO/NO-GO timing test)
 * @see .planning/phases/06-r1-integration-quick-action-inv-5/06-CONTEXT.md §Area 1 (timing defaults decision)
 * @see .planning/phases/06-r1-integration-quick-action-inv-5/06-RESEARCH.md §Q1 (assumptions analysis)
 * @see .planning/phases/06-r1-integration-quick-action-inv-5/06-01-PLAN.md Task 1
 */

/**
 * R1 gesture timing configuration.
 *
 * All values are in milliseconds. All fields are readonly (enforced by the
 * `Object.freeze` call on `DEFAULT_R1_TIMINGS`). Hardware-tuning replaces
 * the export with an updated frozen object rather than mutating the default.
 */
export type R1Timings = {
  /** Single-tap window in ms. [ASSUMED — SC-06-01 pending] */
  readonly tapMs: number;
  /** Double-tap second-tap arrival window in ms. [ASSUMED — SC-06-01 pending] */
  readonly doubleTapWindowMs: number;
  /** Scroll event debounce window in ms. [ASSUMED — SC-06-01 pending] */
  readonly scrollDebounceMs: number;
};

/**
 * Default R1 timing constants.
 *
 * Frozen at declaration time — prevents accidental mutation by any consumer
 * (hardware-tuning code in SC-06-01 follow-up will create a new object, not
 * mutate this one). Object.isFrozen(DEFAULT_R1_TIMINGS) === true is verified
 * by RT-02 unit test.
 *
 * All values are [ASSUMED] pending SC-06-01 hardware-validation closure.
 */
export const DEFAULT_R1_TIMINGS: R1Timings = Object.freeze({
  tapMs: 250,
  doubleTapWindowMs: 350,
  scrollDebounceMs: 50,
});
