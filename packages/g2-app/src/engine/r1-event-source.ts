/**
 * R1 event source provider — WS-receive trust boundary for R1 gesture events.
 *
 * `attachR1EventSource` subscribes a `message` handler to the Bridge WebSocket
 * and performs the double trust boundary validation pattern before publishing
 * each gesture to the `PanelGestureBus`.
 *
 * # Double trust boundary (T-06-01-01 mitigation)
 *
 *   1. **Outer envelope shape** — `EnvelopeSchema.safeParse` enforces the
 *      canonical wire format (`proto/seq/ts/type/session_id/payload`).
 *   2. **Inner payload shape** — `R1GesturePayloadSchema.safeParse` enforces
 *      `kind ∈ {tap, scroll-up, scroll-down, double-tap}` + integer
 *      `timestamp`.
 *   Failure of the outer envelope → silent skip (bridge sends many envelope types
 *   on the same socket; non-r1.gesture types are normal traffic, not errors).
 *   Narrowing on `type !== R1_GESTURE_TYPE` → also silent skip.
 *   Failure of the inner payload → `console.warn` + skip (the type field matched
 *   but the payload is wrong — likely a schema mismatch, worth surfacing).
 *
 * # Wire → internal R1Gesture translation (RESEARCH §Q7)
 *
 *   Bridge wire kinds (`'scroll-up'` / `'scroll-down'` / `'tap'` / `'double-tap'`)
 *   are the bridge's server-side-normalized strings, mapped from the
 *   SDK's `OsEventTypeList` enum values carried with `EventSourceType.TOUCH_EVENT_FROM_RING`
 *   ring-input events (`@evenrealities/even_hub_sdk` `index.d.ts` lines 707 / 733).
 *   The flat-string normalization is performed server-side by the bridge, not by the SDK.
 *   The internal `R1Gesture` discriminated union uses
 *   `{ kind: 'scroll'; direction: 'up' | 'down' }`. Translation lives here —
 *   callers of `PanelGestureBus.subscribe` always see the internal shape.
 *
 * # INV-5 root-state telemetry (step 6)
 *
 *   When `layerManager.getTopLayer()` returns `null` (no OverlayPanel currently
 *   mounted — the normal canvas-mode idle state where only z=0/0.5/1 layers are
 *   active), the gesture is still published to the bus. Router-level bus subscribers
 *   (`quick-action-overscroll-dispatcher`, `root-exit-dispatcher`) are designed to
 *   operate in exactly this state: they receive gestures via the bus and check the
 *   layer state themselves. A `console.warn` is emitted as telemetry so the no-panel
 *   state is observable, but it no longer drops the gesture.
 *
 *   NOTE: The previous behaviour (drop + no-op) was a Phase 20 regression — canvas
 *   default boot leaves no OverlayPanel at the root, so the over-scroll entry point
 *   to the Quick Action menu was silently unreachable. R1E-08 test updated accordingly.
 *
 * # Gesture set (ADR-0012)
 *
 *   The four canonical Even hardware gestures are tap / double-tap / swipe-up /
 *   swipe-down. `long-press` was retired — the Quick-Action menu opens via
 *   over-scroll (swipe-up at a layer's top boundary), detected downstream by the
 *   `quick-action-overscroll-dispatcher`, not here.
 *
 * @see packages/shared-protocol/src/payloads/r1.ts (R1GesturePayloadSchema)
 * @see docs/architecture/0012-r1-gesture-model-overscroll-exit-lifecycle.md
 * @see packages/g2-app/src/engine/layer-manager.ts (getTopLayer)
 * @see packages/g2-app/src/panels/conc-conflict-dispatcher.ts (double-trust exemplar)
 * @see docs/architecture/INVARIANTS.md §5 INV-5 (Gesture Determinism)
 * @see Specs.md §4.4 (R1 SDK event surface)
 * @see .planning/phases/06-r1-integration-quick-action-inv-5/06-CONTEXT.md §Area 1 D-Area-1
 * @see .planning/phases/06-r1-integration-quick-action-inv-5/06-RESEARCH.md §Q7 (wire-to-internal translation)
 * @see .planning/phases/06-r1-integration-quick-action-inv-5/06-01-PLAN.md Task 2
 */

import { EnvelopeSchema, R1_GESTURE_TYPE, R1GesturePayloadSchema } from '@evf/shared-protocol';
import type { LayerManager } from './layer-manager.js';
import type { R1Gesture } from './layer-types.js';
import type { PanelGestureBus } from './panel-gesture-bus.js';
import { DEFAULT_R1_TIMINGS, type R1Timings } from './r1-timings.js';

/**
 * Minimal WebSocket shape the provider consumes.
 *
 * Narrower than the full WHATWG `WebSocket` type — defined locally so the
 * provider is testable with the EventEmitter-backed `MockWebSocket` used in
 * `r1-event-source.test.ts`. Mirrors the `ConcModalWebSocket` / `ConcDispatcherSocket`
 * patterns from Phase 4b/5 (resolves RESEARCH Q-OQ3).
 */
export interface R1EventSourceWebSocket {
  addEventListener(type: 'message', handler: (event: MessageEvent) => void): void;
  removeEventListener(type: 'message', handler: (event: MessageEvent) => void): void;
}

/**
 * Attach the R1 gesture event source to the given WebSocket.
 *
 * Subscribes a `message` handler that:
 *
 *   1. Decodes raw bytes / string (outer `try/catch` belt-and-suspenders).
 *   2. `JSON.parse` — failure → `console.warn` + ignore.
 *   3. `EnvelopeSchema.safeParse` — reject → warn + ignore.
 *   4. Narrow on `envelope.type === R1_GESTURE_TYPE` — other types → silent skip
 *      (normal: bridge sends many envelope types on the same socket).
 *   5. `R1GesturePayloadSchema.safeParse(envelope.payload)` — reject → warn + ignore.
 *   6. `layerManager.getTopLayer()` — when null (no OverlayPanel mounted, i.e. canvas
 *      idle state), emit a `console.warn` telemetry entry and CONTINUE publishing.
 *      Router-level dispatchers (overscroll, root-exit) are the intended receivers
 *      in the root/idle state and rely on bus delivery.
 *   7. Translate wire kind → internal `R1Gesture` shape.
 *   8. `gestureBus.publish(gesture)` — single-receiver architectural contract (INV-5).
 *
 * Returns an idempotent unsubscribe closure.
 *
 * @param ws            WS-like message source supporting add/removeEventListener
 * @param gestureBus    Shared in-process gesture bus (Phase 4b/5 panels subscribe)
 * @param layerManager  LayerManager singleton — `getTopLayer()` is the INV-5 authority
 * @param _timings      Timing constants (defaults to `DEFAULT_R1_TIMINGS`; reserved for SC-06-01 hardware-tuning closure)
 * @returns             Idempotent unsubscribe closure
 */
export function attachR1EventSource(
  ws: R1EventSourceWebSocket,
  gestureBus: PanelGestureBus,
  layerManager: LayerManager,
  _timings: R1Timings = DEFAULT_R1_TIMINGS,
): () => void {
  const handler = (ev: MessageEvent): void => {
    try {
      // Step 1 — decode raw bytes / string.
      const rawText =
        typeof ev.data === 'string' ? ev.data : new TextDecoder().decode(ev.data as ArrayBuffer);

      // Step 2 — JSON.parse. Failure caught by outer try/catch below.
      const parsedJson = JSON.parse(rawText) as unknown;

      // Step 3 — outer envelope shape.
      const envParse = EnvelopeSchema.safeParse(parsedJson);
      if (!envParse.success) {
        // Not a valid evf-v1 envelope — warn and skip.
        // (Bridge may send non-evf envelopes in some configurations.)
        console.warn('[r1-event-source] envelope rejected', envParse.error.message);
        return;
      }

      // Step 4 — narrow on envelope.type. Silent return for other types
      // (e.g., 'character.delta', 'conc.conflict', 'frame_pixels') — they
      // belong to other dispatchers and aren't an error condition here.
      if (envParse.data.type !== R1_GESTURE_TYPE) {
        return;
      }

      // Step 5 — inner payload shape.
      const payloadParse = R1GesturePayloadSchema.safeParse(envParse.data.payload);
      if (!payloadParse.success) {
        console.warn('[r1-event-source] invalid payload', payloadParse.error.issues);
        return;
      }

      // Step 6 — INV-5 root-state telemetry (no early return).
      // When no OverlayPanel is mounted (canvas idle state — z=0/0.5/1 only),
      // getTopLayer() returns null. We emit a telemetry warn so the state is
      // observable, but we DO NOT drop the gesture: router-level bus subscribers
      // (quick-action-overscroll-dispatcher, root-exit-dispatcher) are designed
      // to operate at the root and must receive gestures through the bus.
      // The previous drop behaviour was a Phase 20 regression (canvas default boot
      // never mounts a z=2 OverlayPanel at idle, silently killing all gestures).
      const top = layerManager.getTopLayer();
      if (top === null) {
        console.warn(
          '[r1-event-source] no top layer — routing to bus for router-level dispatchers (INV-5)',
          `wire-kind: ${payloadParse.data.kind}`,
        );
        // CONTINUE — do not return. Fall through to step 7/8.
      }

      // Step 7 — wire-to-internal R1Gesture translation.
      // Wire: bridge-normalized strings ('scroll-up' | 'scroll-down' | 'tap' | …)
      //   mapped server-side from SDK OsEventTypeList + EventSourceType.TOUCH_EVENT_FROM_RING.
      // Internal: { kind: 'scroll'; direction: 'up' | 'down' }
      // All other wire kinds pass through as-is.
      let gesture: R1Gesture;
      const { kind } = payloadParse.data;
      if (kind === 'scroll-up') {
        gesture = { kind: 'scroll', direction: 'up' };
      } else if (kind === 'scroll-down') {
        gesture = { kind: 'scroll', direction: 'down' };
      } else {
        // 'tap' | 'double-tap' — pass through verbatim.
        gesture = { kind } as R1Gesture;
      }

      // Step 8 — publish to bus. Per-subscriber try/catch in bus isolates faulty
      // panels (T-4b-01-03 carry). INV-5 architectural constraint: at any moment
      // only one panel is subscribed (panels subscribe in onMount, unsubscribe in
      // onUnmount per T-4b-01-03).
      gestureBus.publish(gesture);
    } catch (err) {
      // Any synchronous throw (JSON.parse, unexpected SDK shape, etc.) is captured
      // as telemetry; the WS subscription continues. Belt-and-suspenders — the Zod
      // safeParse calls above are the primary defence; this catch is the last-ditch
      // barrier (mirrors conc-conflict-dispatcher.ts T-4b-05-01 pattern).
      console.warn('[r1-event-source] handler threw', err);
    }
  };

  ws.addEventListener('message', handler);

  // Idempotent unsubscribe closure — mirrors conc-conflict-dispatcher.ts pattern.
  let removed = false;
  return (): void => {
    if (!removed) {
      removed = true;
      ws.removeEventListener('message', handler);
    }
  };
}
