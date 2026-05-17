/**
 * reaction-prompt-dispatcher — WS-receive trust boundary for ACT-04 reaction prompts (Plan 13-02).
 *
 * Mirrors `conc-conflict-dispatcher.ts` exactly in structure. Attaches a `message`
 * listener to the WebSocket and, after a 500ms debounce, mounts a
 * {@link ./reaction-prompt-panel.js#ReactionPromptPanel} at z=2 via `layerManager.bundle`.
 *
 * **Double trust boundary (T-13-01a mitigation):**
 *   1. Outer envelope shape — `EnvelopeSchema.safeParse(rawMsg)` enforces the canonical
 *      wire format (`proto/seq/ts/type/session_id/payload`).
 *   2. Inner payload shape — `ReactionAvailablePayloadSchema.safeParse(envelope.payload)`
 *      enforces `kind/sourceName/expiresAt` types.
 *   Failure of either parse → `console.warn` + return. Panel never mounts on malformed input.
 *
 * **T-13-01 anti-spam mitigations (3 guards):**
 *   1. 500ms debounce — coalesces same-tick envelopes (D-13-04). If a second envelope
 *      arrives within 500ms of the first, the first timer is cancelled and a new 500ms
 *      timer starts for the latest payload.
 *   2. Max-one-prompt-at-a-time — if `mountedPanel !== null` when a new envelope arrives,
 *      the envelope is silently dropped (RPD-CONCURRENT-01).
 *   3. 5s auto-timeout — if the player does not interact within 5 seconds of mount, the
 *      panel is destroyed via `layerManager.bundle([{ type: 'destroy', z: Z2_OVERLAY }])`.
 *
 * **Boot wiring (Plan 13-04 scope):** `attachReactionPromptHandler` is called from
 * `boot-engine-core.ts` alongside `attachReactionToastHandler`. This plan ships the
 * module + tests only.
 *
 * @see packages/g2-app/src/panels/conc-conflict-dispatcher.ts (structure reference)
 * @see packages/g2-app/src/panels/reaction-prompt-panel.ts (ReactionPromptPanel)
 * @see packages/g2-app/src/panels/reaction-toast-dispatcher.ts (parallel dispatcher)
 * @see .planning/phases/13-v2-stretch/13-02-PLAN.md Task 2
 */

import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';
import {
  EnvelopeSchema,
  R1_REACTION_AVAILABLE_TYPE,
  type ReactionAvailablePayload,
  ReactionAvailablePayloadSchema,
} from '@evf/shared-protocol';
import type { LayerManager } from '../engine/layer-manager.js';
import { ZIndex } from '../engine/layer-types.js';
import type { PanelGestureBus } from '../engine/panel-gesture-bus.js';
import type { HudLocale } from '../status-hud/i18n-budgets.js';
import type { Toast } from '../status-hud/toast-types.js';
import { ReactionPromptPanel } from './reaction-prompt-panel.js';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Minimal WebSocket shape the dispatcher consumes.
 * Defined locally (no DOM polyfill needed) to match the pattern from conc-conflict-dispatcher.
 */
export interface ReactionDispatcherWs {
  addEventListener(event: 'message', handler: (ev: { data: unknown }) => void): void;
  removeEventListener(event: 'message', handler: (ev: { data: unknown }) => void): void;
  send(data: string): void;
}

/** Unsubscribe handle returned by {@link attachReactionPromptHandler}. */
export type ReactionPromptUnsubscribe = () => void;

/** Dependency bundle injected into the dispatcher. */
export interface ReactionPromptDispatcherDeps {
  /** WS-like message source. */
  ws: ReactionDispatcherWs;
  /** LayerManager singleton for mount/destroy bundles. */
  layerManager: LayerManager;
  /** Even Hub bridge (forwarded to panel for draw). */
  bridge: EvenAppBridge;
  /** In-process gesture bus (forwarded to panel for onMount). */
  gestureBus: PanelGestureBus;
  /** Active HUD locale (forwarded to panel for label lookup). */
  locale: HudLocale;
  /** Active WS session UUID (threaded into outgoing tool.invoke). */
  sessionId: string;
  /** Returns current player actor ID, or null if not yet available. */
  getPlayerActorId: () => string | null;
  /** Returns current player primary weapon item ID, or null if not available. */
  getPlayerWeaponId: () => string | null;
  /** Optional toast queue for error/timeout notifications. */
  getToastQueue?: () => { enqueue: (toast: Toast) => void } | null;
}

// ─── Dispatcher implementation ────────────────────────────────────────────────

/**
 * Attach the reaction-prompt dispatcher to the given WebSocket.
 *
 * Lifecycle of a single reaction prompt:
 *
 * 1. `r1.reaction.available` envelope arrives via WS message.
 * 2. Double trust-boundary parse (EnvelopeSchema → ReactionAvailablePayloadSchema).
 * 3. If a panel is currently mounted → envelope is silently dropped (T-13-01 guard 2).
 * 4. Otherwise, `clearTimeout(pendingTimerId)` + schedule new `setTimeout(mount, 500)`
 *    (T-13-01 guard 1 — debounce).
 * 5. After 500ms: `mount(payload)`.
 *    a. Resolve `playerActorId` via `deps.getPlayerActorId()`. If null → no mount.
 *    b. Construct `ReactionPromptPanel`.
 *    c. `layerManager.bundle([{ type: 'mount', z: Z2_OVERLAY, layer: panel }])`.
 *    d. `setTimeout(unmount, 5000)` — auto-timeout guard (T-13-01 guard 3).
 * 6. User taps [Y] or [N] → panel calls `onClose` → `clearTimeout(timeoutId)` +
 *    `layerManager.bundle([{ type: 'destroy', z: Z2_OVERLAY }])` + `mountedPanel = null`.
 * 7. Returns unsubscribe closure that removes WS listener + clears all timers + destroys any panel.
 *
 * @param deps  Dependency bundle (see ReactionPromptDispatcherDeps).
 * @returns Unsubscribe closure.
 */
export function attachReactionPromptHandler(
  deps: ReactionPromptDispatcherDeps,
): ReactionPromptUnsubscribe {
  // ── Closure-scoped state (one independent instance per call) ─────────────
  let pendingTimerId: ReturnType<typeof setTimeout> | null = null;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let mountedPanel: ReactionPromptPanel | null = null;

  // ── onClose callback shared between mount path and cleanup ───────────────
  function handleClose(): void {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    mountedPanel = null;
    void deps.layerManager.bundle([{ type: 'destroy', z: ZIndex.Z2_OVERLAY }]);
  }

  // ── Mount the panel ──────────────────────────────────────────────────────
  function mount(payload: ReactionAvailablePayload): void {
    const actorId = deps.getPlayerActorId();
    if (actorId === null || actorId.length === 0) {
      // RPD-NO-ACTOR-01: guard — no actor available, skip mount
      return;
    }

    const weaponId = deps.getPlayerWeaponId();
    const toastQueue = deps.getToastQueue?.() ?? null;

    const panel = new ReactionPromptPanel(
      deps.bridge,
      deps.ws,
      deps.gestureBus,
      payload,
      deps.locale,
      deps.sessionId,
      actorId,
      weaponId,
      handleClose,
      toastQueue?.enqueue.bind(toastQueue) ?? null,
    );

    // T-13-01 guard 3: auto-timeout after 5s
    timeoutId = setTimeout(() => {
      timeoutId = null;
      if (mountedPanel !== null) {
        mountedPanel = null;
        void deps.layerManager.bundle([{ type: 'destroy', z: ZIndex.Z2_OVERLAY }]);
      }
    }, 5000);

    mountedPanel = panel;
    void deps.layerManager.bundle([{ type: 'mount', z: ZIndex.Z2_OVERLAY, layer: panel }]);
  }

  // ── WS message handler ───────────────────────────────────────────────────
  const handler = (ev: { data: unknown }): void => {
    try {
      // Step 1 — decode raw bytes / string
      const rawText =
        typeof ev.data === 'string' ? ev.data : new TextDecoder().decode(ev.data as ArrayBuffer);

      // Step 2 — JSON.parse
      const parsedJson = JSON.parse(rawText) as unknown;

      // Step 3 — outer envelope shape (canonical EnvelopeSchema)
      const envParse = EnvelopeSchema.safeParse(parsedJson);
      if (!envParse.success) {
        console.warn('[reaction-prompt-dispatcher] envelope rejected', envParse.error.message);
        return;
      }

      // Step 4 — narrow on envelope.type. Silent return for other types.
      if (envParse.data.type !== R1_REACTION_AVAILABLE_TYPE) {
        return;
      }

      // Step 5 — inner payload shape (T-13-01a)
      const payloadParse = ReactionAvailablePayloadSchema.safeParse(envParse.data.payload);
      if (!payloadParse.success) {
        console.warn('[reaction-prompt-dispatcher] payload rejected', payloadParse.error.message);
        return;
      }

      const payload = payloadParse.data;

      // T-13-01 guard 2: concurrent-drop — one prompt at a time
      if (mountedPanel !== null) {
        return; // Silently drop (user must resolve current prompt first)
      }

      // T-13-01 guard 1: debounce — cancel previous timer, schedule new one
      if (pendingTimerId !== null) {
        clearTimeout(pendingTimerId);
        pendingTimerId = null;
      }
      pendingTimerId = setTimeout(() => {
        pendingTimerId = null;
        mount(payload);
      }, 500);
    } catch (err) {
      // Defensive catch — JSON.parse, unexpected shape, etc.
      console.warn('[reaction-prompt-dispatcher] handler threw', err);
    }
  };

  deps.ws.addEventListener('message', handler);

  // ── Unsubscribe closure ──────────────────────────────────────────────────
  return (): void => {
    deps.ws.removeEventListener('message', handler);

    // Clear pending debounce timer
    if (pendingTimerId !== null) {
      clearTimeout(pendingTimerId);
      pendingTimerId = null;
    }

    // Clear auto-timeout timer
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }

    // Destroy any mounted panel
    if (mountedPanel !== null) {
      mountedPanel = null;
      void deps.layerManager.bundle([{ type: 'destroy', z: ZIndex.Z2_OVERLAY }]);
    }
  };
}
