/**
 * R1 ring gesture wire-protocol payload schemas — Phase 6 Plan 01.
 *
 * Defines the payload shape for `r1.gesture` envelopes emitted by the Bridge
 * when the Even R1 ring fires a gesture event. The g2-app `r1-event-source.ts`
 * provider validates incoming envelopes at the WS-receive trust boundary using
 * the double trust boundary pattern (outer `EnvelopeSchema.safeParse` + inner
 * `R1GesturePayloadSchema.safeParse` per the `conc-conflict-dispatcher.ts` exemplar).
 *
 * # Wire format vs. internal R1Gesture union
 *
 * The wire payload uses `kind: 'scroll-up' | 'scroll-down'` (flat strings
 * matching the Even Hub SDK event names). The internal `R1Gesture` union in
 * `packages/g2-app/src/engine/layer-types.ts` uses a discriminated shape
 * `{ kind: 'scroll'; direction: 'up' | 'down' }`. The translation between
 * the two lives exclusively in `r1-event-source.ts` (attachR1EventSource),
 * not in callers — CONTEXT.md D-Area-1 + RESEARCH.md §Q7.
 *
 * # Gesture synthesis
 *
 * The `double-tap` variant is synthesised by the Bridge from two rapid `tap`
 * events. `long-press` was removed (ADR-0012) — it is not a hardware gesture.
 *
 * @see Specs.md §3.2 (R1 hardware gesture model)
 * @see Specs.md §4.4 (R1 SDK event surface)
 * @see Specs.md §10.0.1 (Phase 0 GO/NO-GO timing criteria)
 * @see ../envelope.ts (EnvelopeSchema — canonical wire carrier)
 * @see ../../packages/g2-app/src/engine/r1-event-source.ts (wire → internal translation)
 * @see .planning/phases/06-r1-integration-quick-action-inv-5/06-01-PLAN.md Task 1
 */
import { z } from 'zod';

/**
 * Wire-protocol discriminant for R1 gesture envelopes.
 *
 * Routed on `envelope.type` by the g2-app boot-engine WS handler →
 * `r1-event-source.ts` provider. Bridge emits this type string when any R1
 * ring gesture is detected.
 */
export const R1_GESTURE_TYPE = 'r1.gesture' as const;

/**
 * R1 gesture wire-payload schema.
 *
 * Strict-object: extra fields are rejected. Validates the `payload` field
 * inside a `r1.gesture` {@link EnvelopeSchema} envelope.
 *
 * Fields:
 * - `kind`      — Wire gesture discriminant. `'scroll-up'` and `'scroll-down'`
 *                 are flat strings (Bridge SDK naming); the internal `R1Gesture`
 *                 union uses `{ kind: 'scroll', direction: … }` — translation
 *                 lives in `attachR1EventSource`, NOT in callers.
 * - `timestamp` — Bridge-side `Date.now()` ms epoch at gesture detection time.
 *                 Integer required (no fractional milliseconds from the SDK).
 *
 * Wire kinds (the COMPLETE Even hardware gesture set — `guides/input-events`,
 * INV-2 re-verified 2026-05-31; there is NO long-press / duration-based input):
 * - `'tap'`        — single tap / press, `CLICK_EVENT(0)` (maps to internal `{ kind: 'tap' }`)
 * - `'scroll-up'`  — swipe-up, `SCROLL_TOP_EVENT(1)` (maps to internal `{ kind: 'scroll', direction: 'up' }`)
 * - `'scroll-down'`— swipe-down, `SCROLL_BOTTOM_EVENT(2)` (maps to internal `{ kind: 'scroll', direction: 'down' }`)
 * - `'double-tap'` — double-press, `DOUBLE_CLICK_EVENT(3)` (maps to internal `{ kind: 'double-tap' }`)
 *
 * `long-press` was retired by ADR-0012: the Quick-Action menu now opens via
 * over-scroll (swipe-up at the focused layer's top boundary), detected client-side
 * in g2-app — so no new wire kind is needed.
 *
 * @see Specs.md §3.2 (R1 hardware gesture model — verified source)
 * @see docs/architecture/0012-r1-gesture-model-overscroll-exit-lifecycle.md (D-1)
 * @see .planning/phases/06-r1-integration-quick-action-inv-5/06-RESEARCH.md §Q7 (wire→internal translation rationale)
 */
export const R1GesturePayloadSchema = z
  .object({
    kind: z.enum(['tap', 'scroll-up', 'scroll-down', 'double-tap']),
    timestamp: z.number().int(),
  })
  .strict();

export type R1GesturePayload = z.infer<typeof R1GesturePayloadSchema>;
