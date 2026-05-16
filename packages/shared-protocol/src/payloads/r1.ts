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
 * # Hardware-pending (SC-06-01)
 *
 * The Bridge currently classifies `long-press` directly (fires when the SDK
 * long-press threshold is met). The `double-tap` variant is synthesised by the
 * Bridge from two rapid `tap` events. The `longPressMs` timing constant in
 * `r1-timings.ts` is currently a client-side guard reserved for future
 * hardware-tuning closure via SC-06-01.
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
 * Wire kinds:
 * - `'tap'`        — single tap on the R1 ring (maps to internal `{ kind: 'tap' }`)
 * - `'scroll-up'`  — ring scroll upward (maps to internal `{ kind: 'scroll', direction: 'up' }`)
 * - `'scroll-down'`— ring scroll downward (maps to internal `{ kind: 'scroll', direction: 'down' }`)
 * - `'long-press'` — held press (Bridge classifies; maps to internal `{ kind: 'long-press' }`)
 * - `'double-tap'` — two rapid taps (Bridge synthesises; maps to internal `{ kind: 'double-tap' }`)
 *
 * @see Specs.md §3.2 (R1 hardware gesture model — verified source)
 * @see Specs.md §10.0.1 (Phase 0 GO criteria for long-press ≥500 ms detection)
 * @see .planning/phases/06-r1-integration-quick-action-inv-5/06-RESEARCH.md §Q7 (wire→internal translation rationale)
 */
export const R1GesturePayloadSchema = z
  .object({
    kind: z.enum(['tap', 'scroll-up', 'scroll-down', 'long-press', 'double-tap']),
    timestamp: z.number().int(),
  })
  .strict();

export type R1GesturePayload = z.infer<typeof R1GesturePayloadSchema>;
