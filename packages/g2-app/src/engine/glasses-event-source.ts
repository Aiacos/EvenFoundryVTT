/**
 * glasses-event-source.ts — SDK touch-event → PanelGestureBus producer.
 *
 * # Why this module exists (debug `canvas-sheet-overlay-wont-open`, 2026-06-09)
 *
 *   The R1 ring and the G2 touchpad both deliver gestures to the WebView through
 *   the Even Hub SDK event stream (`EvenAppBridge.onEvenHubEvent` →
 *   `event.textEvent` with `eventType: OsEventTypeList` on the `isEventCapture`
 *   container — `hub.evenrealities.com/docs/guides/input-events`). Until this
 *   module landed, the ONLY gesture producer was `r1-event-source.ts`, which
 *   listens for `r1.gesture` WS envelopes — and the bridge only emits those from
 *   the `/debug/simulate-gesture` test route. Production hardware input therefore
 *   had NO producer: every touchpad/ring gesture was logged by the SDK and
 *   silently discarded. This module closes that gap.
 *
 * # Pipeline (mirrors `r1-event-source.ts` steps 6-8)
 *
 *   1. `bridge.onEvenHubEvent(handler)` — SDK push subscription.
 *   2. Narrow on `event.textEvent` OR `event.sysEvent` — the host splits the
 *      gesture set across BOTH shapes (observed live on evenhub-simulator
 *      0.7.x, 2026-06-09): scrolls arrive as `textEvent` on the capture
 *      container (`{containerID:4, eventType:1|2}`), while clicks/double-clicks
 *      arrive as `sysEvent` (`{eventSource:1, eventType?:0|3}`). Audio/list
 *      events belong to other consumers (e.g. `audio-capture.ts`) → silent skip.
 *   3. Narrow on `eventType` ∈ gesture subset (CLICK 0, SCROLL_TOP 1,
 *      SCROLL_BOTTOM 2, DOUBLE_CLICK 3). Lifecycle events (FOREGROUND_* 4/5,
 *      *_EXIT 6/7, IMU 8) → silent skip (handled elsewhere / not gestures).
 *      PB default-omission: `eventType` is OMITTED on the wire when it equals
 *      the protobuf default `0` (CLICK_EVENT) — `eventType ?? 0` recovers it.
 *      For `sysEvent` the omitted-zero reading is accepted only when
 *      `eventSource` is a real touch source (TOUCH_EVENT_FROM_* = 1|2|3), so
 *      non-gesture sys events with both fields omitted are not misread as taps.
 *   4. INV-5 root-state telemetry: `layerManager.getTopLayer() === null` emits a
 *      `console.warn` but DOES NOT drop — router-level bus subscribers
 *      (`quick-action-overscroll-dispatcher`, `root-exit-dispatcher`) operate at
 *      the root and rely on bus delivery (same contract as `r1-event-source.ts`).
 *   5. Translate `OsEventTypeList` → internal `R1Gesture` shape.
 *   6. `gestureBus.publish(gesture)` — INV-5 single-receiver contract.
 *   7. `opts.onPublish?.()` — lets the boot module schedule a HUD recomposite
 *      (`HudDeltaDriver.requestCycle()`) since SDK events do not transit the WS
 *      event bus the delta driver subscribes to.
 *
 * # Gesture set (ADR-0012 / INV-2 re-verified 2026-05-31)
 *
 *   press / double-press / swipe-up / swipe-down only — no long-press.
 *
 * @see packages/g2-app/src/engine/r1-event-source.ts (WS debug-path producer)
 * @see packages/g2-app/src/engine/panel-gesture-bus.ts (single-receiver bus)
 * @see packages/g2-app/src/engine/hud-delta-driver.ts (requestCycle consumer)
 * @see .planning/debug/canvas-sheet-overlay-wont-open.md (root-cause session)
 */

import type { EvenAppBridge, EvenHubEvent } from '@evenrealities/even_hub_sdk';
import type { LayerManager } from './layer-manager.js';
import type { R1Gesture } from './layer-types.js';
import type { PanelGestureBus } from './panel-gesture-bus.js';

// ─── Options ─────────────────────────────────────────────────────────────────

/** Optional hooks for {@link attachGlassesEventSource}. */
export interface GlassesEventSourceOpts {
  /**
   * Invoked after every successful `gestureBus.publish`.
   *
   * Boot wires this to `HudDeltaDriver.requestCycle()` so gesture-driven panel
   * state changes (menu selection, sheet tab nav) trigger a debounced canvas
   * recomposite. SDK events never reach the WS event bus, so without this hook
   * a dirty layer would stay un-painted until the next Foundry delta arrived.
   */
  onPublish?: () => void;
}

// ─── OsEventTypeList gesture subset ──────────────────────────────────────────

/**
 * Map the SDK `OsEventTypeList` ordinals that represent gestures to the internal
 * `R1Gesture` shape. Non-gesture ordinals (4-8) are intentionally absent.
 *
 * Wire mapping (verbatim `hub.evenrealities.com/docs/guides/input-events`):
 *   CLICK_EVENT(0) → tap · SCROLL_TOP_EVENT(1) → scroll/up ·
 *   SCROLL_BOTTOM_EVENT(2) → scroll/down · DOUBLE_CLICK_EVENT(3) → double-tap
 */
const GESTURE_BY_EVENT_TYPE: Readonly<Record<number, R1Gesture>> = {
  0: { kind: 'tap' },
  1: { kind: 'scroll', direction: 'up' },
  2: { kind: 'scroll', direction: 'down' },
  3: { kind: 'double-tap' },
};

// ─── attachGlassesEventSource ────────────────────────────────────────────────

/**
 * Subscribe to the Even Hub SDK event stream and publish touchpad/ring gestures
 * to the shared {@link PanelGestureBus}.
 *
 * Returns an idempotent unsubscribe closure (mirrors `attachR1EventSource`).
 *
 * @param bridge        Even Hub SDK bridge singleton (`onEvenHubEvent` producer)
 * @param gestureBus    Shared in-process gesture bus (INV-5 single receiver)
 * @param layerManager  LayerManager singleton — `getTopLayer()` root-state telemetry
 * @param opts          Optional hooks (post-publish recomposite scheduling)
 * @returns             Idempotent unsubscribe closure
 */
export function attachGlassesEventSource(
  bridge: EvenAppBridge,
  gestureBus: PanelGestureBus,
  layerManager: LayerManager,
  opts: GlassesEventSourceOpts = {},
): () => void {
  // Fail-soft guard: `EvenAppBridge` is hand-typed against an external runtime
  // (even-hub.d.ts + hub-polyfill.ts) — host/polyfill variants without the SDK
  // event stream must not crash boot. Warn (observable telemetry, INV-5 spirit:
  // never a silent drop) and return a no-op unsubscribe.
  if (typeof bridge.onEvenHubEvent !== 'function') {
    console.warn(
      '[glasses-event-source] bridge.onEvenHubEvent unavailable — SDK gesture source disabled',
    );
    return (): void => {};
  }
  const handler = (event: EvenHubEvent): void => {
    try {
      // Step 2/3 — extract a gesture ordinal from textEvent OR sysEvent
      // (the host splits the gesture set across both shapes — see module JSDoc).
      let eventType: number;
      if (event.textEvent !== undefined) {
        // Scrolls (and container-bound clicks) — PB default-omission: an
        // omitted eventType is the protobuf default 0 (CLICK_EVENT).
        eventType = event.textEvent.eventType ?? 0;
      } else if (event.sysEvent !== undefined) {
        const sysEvent = event.sysEvent;
        if (sysEvent.imuData !== undefined) {
          return; // IMU data report — not a gesture.
        }
        eventType = sysEvent.eventType ?? 0;
        // Omitted-zero ambiguity guard: accept the implied CLICK only when the
        // event source is a real touch origin (TOUCH_EVENT_FROM_GLASSES_R=1,
        // TOUCH_EVENT_FROM_RING=2, TOUCH_EVENT_FROM_GLASSES_L=3). A non-gesture
        // sys event with both fields omitted must not be misread as a tap.
        if (eventType === 0) {
          const source = sysEvent.eventSource ?? 0;
          if (source < 1 || source > 3) {
            return;
          }
        }
      } else {
        return; // audio / list event — not ours.
      }

      const gesture = GESTURE_BY_EVENT_TYPE[eventType];
      if (gesture === undefined) {
        return; // lifecycle / IMU ordinal — silent skip.
      }

      // Step 4 — INV-5 root-state telemetry (no early return — see module JSDoc).
      if (layerManager.getTopLayer() === null) {
        console.warn(
          '[glasses-event-source] no top layer — routing to bus for router-level dispatchers (INV-5)',
          `eventType: ${eventType}`,
        );
      }

      // Steps 5-6 — publish the translated gesture.
      gestureBus.publish(gesture);

      // Step 7 — schedule a debounced HUD recomposite.
      opts.onPublish?.();
    } catch (err) {
      // Last-ditch barrier — the SDK stream must survive a faulty consumer
      // (mirrors r1-event-source.ts T-4b-05-01 pattern).
      console.warn('[glasses-event-source] handler threw', err);
    }
  };

  const unsubscribe = bridge.onEvenHubEvent(handler);

  // Idempotent unsubscribe closure — mirrors r1-event-source.ts pattern.
  let removed = false;
  return (): void => {
    if (!removed) {
      removed = true;
      unsubscribe();
    }
  };
}
