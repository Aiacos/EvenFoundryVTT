/**
 * multi-attack-progress-dispatcher — WS-receive trust boundary for MULTI-01 (Plan 07-04).
 *
 * Listens on the shared WebSocket for `r1.multiattack.progress` envelopes
 * emitted by the Foundry module's `weaponAttackHandler` after each attack
 * iteration. Validates with a double trust boundary (EnvelopeSchema outer +
 * MultiAttackProgressPayloadSchema inner), then calls
 * {@link CombatTrackerPanel.setMultiAttackState} to update the `[Atk N/M]` chip.
 *
 * **Double trust boundary (T-07-04-01 mitigation):**
 *   1. Outer envelope shape — `EnvelopeSchema.safeParse(rawMsg)` enforces the
 *      canonical wire format (`proto/seq/ts/type/session_id/payload`).
 *   2. Inner payload shape — `MultiAttackProgressPayloadSchema.safeParse(payload)`
 *      enforces `attackId` (UUID), `current` (int ≥ 1), `total` (int 1-10),
 *      `chatCardId` (nullable string), `actorId` (non-empty string).
 *   Failure of either parse → `console.warn` + silent ignore. Panel never
 *   receives corrupted state. MAPD-5, MAPD-7 verify rejection paths.
 *
 * **Clear-on-final**: when `current === total`, dispatcher calls
 *   `setMultiAttackState(null)` — the chip disappears after the last attack.
 *   MAPD-4 verifies this behavior.
 *
 * **Panel-not-mounted guard**: if `panelRef.current` is `null`, the message
 *   is a silent no-op. MAPD-9 verifies this behavior.
 *
 * **Type-narrowing guard**: envelopes whose `type !== R1_MULTIATTACK_PROGRESS_TYPE`
 *   are silently ignored (other dispatchers handle them). MAPD-6 verifies.
 *
 * @see .planning/phases/07-foundry-module-write-path/07-04-PLAN.md Task 2
 * @see packages/g2-app/src/panels/combat-tracker-panel.ts (setMultiAttackState)
 * @see packages/g2-app/src/panels/conc-conflict-dispatcher.ts (pattern reference)
 */

import {
  EnvelopeSchema,
  MultiAttackProgressPayloadSchema,
  R1_MULTIATTACK_PROGRESS_TYPE,
} from '@evf/shared-protocol';
import type { MultiAttackState } from './combat-tracker-panel.js';

// ─── Interface types ──────────────────────────────────────────────────────────

/**
 * Minimal WebSocket shape the dispatcher consumes.
 *
 * Defined locally (rather than importing lib.dom `WebSocket`) so the dispatcher
 * is testable with the EventEmitter-backed mock socket used by the test harness,
 * which implements `addEventListener` / `removeEventListener` + a `fireMessage`
 * test helper but is NOT a full WHATWG WebSocket.
 */
export interface MultiAttackDispatcherSocket {
  addEventListener(event: 'message', handler: (ev: MessageEvent) => void): void;
  removeEventListener(event: 'message', handler: (ev: MessageEvent) => void): void;
}

/**
 * Minimal panel handle the dispatcher uses to update chip state.
 *
 * Defined locally so tests can supply a `{ setMultiAttackState: vi.fn() }` mock
 * without importing the full `CombatTrackerPanel` class (which has bridge/bus deps).
 */
export interface MultiAttackPanelHandle {
  setMultiAttackState(state: MultiAttackState | null): void;
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

/**
 * Attach the multi-attack-progress dispatcher to the given WebSocket.
 *
 * Subscribes a `message` handler that:
 *
 *   1. Decodes the raw message (`string` directly, or `ArrayBuffer` via
 *      `TextDecoder`).
 *   2. `JSON.parse` — failure → `console.warn` + ignore.
 *   3. `EnvelopeSchema.safeParse` (outer trust boundary). Reject → warn + ignore.
 *   4. Narrow on `envelope.type === R1_MULTIATTACK_PROGRESS_TYPE` — other types
 *      return silently (other dispatchers handle them; not an error condition).
 *   5. `MultiAttackProgressPayloadSchema.safeParse(envelope.payload)` (inner trust
 *      boundary). Reject → warn + ignore.
 *   6. If `panelRef.current` is null (panel not mounted) → silent no-op.
 *   7. If `payload.current === payload.total` (final iteration) →
 *      `panel.setMultiAttackState(null)` (clears chip).
 *      Else → `panel.setMultiAttackState({ current, total, attackId, actorId })`.
 *
 * Returns an unsubscribe closure that removes the message listener. Calling
 * the closure multiple times is idempotent (subsequent `removeEventListener`
 * calls on an already-removed listener are no-ops per the WHATWG spec and
 * our mock implementation).
 *
 * @param ws       WS-like message source supporting add/removeEventListener.
 * @param panelRef Ref to the live CombatTrackerPanel instance (or null if not mounted).
 * @returns Unsubscribe closure.
 */
export function attachMultiAttackProgressHandler(
  ws: MultiAttackDispatcherSocket,
  panelRef: { current: MultiAttackPanelHandle | null },
): () => void {
  const handler = (ev: MessageEvent): void => {
    try {
      // Step 1 — decode raw bytes / string.
      const rawText =
        typeof ev.data === 'string' ? ev.data : new TextDecoder().decode(ev.data as ArrayBuffer);

      // Step 2 — JSON.parse. A throw here is caught by the outer try/catch.
      const parsedJson = JSON.parse(rawText) as unknown;

      // Step 3 — outer envelope shape (canonical EnvelopeSchema).
      const envParse = EnvelopeSchema.safeParse(parsedJson);
      if (!envParse.success) {
        console.warn(
          '[multi-attack-progress-dispatcher] envelope rejected',
          envParse.error.message,
        );
        return;
      }

      // Step 4 — narrow on envelope.type. Silent return for other types.
      if (envParse.data.type !== R1_MULTIATTACK_PROGRESS_TYPE) {
        return;
      }

      // Step 5 — inner payload shape.
      const payloadParse = MultiAttackProgressPayloadSchema.safeParse(envParse.data.payload);
      if (!payloadParse.success) {
        console.warn(
          '[multi-attack-progress-dispatcher] payload rejected',
          payloadParse.error.message,
        );
        return;
      }

      // Step 6 — guard: panel not yet mounted (or already unmounted).
      const panel = panelRef.current;
      if (panel === null) {
        return;
      }

      const { attackId, current, total, actorId } = payloadParse.data;

      // Step 7 — update chip or clear on final iteration.
      if (current === total) {
        panel.setMultiAttackState(null);
      } else {
        panel.setMultiAttackState({ attackId, current, total, actorId });
      }
    } catch (err) {
      // Any synchronous throw (JSON.parse, unexpected SDK shape, etc.) is
      // captured as telemetry; the WS subscription continues. This catch is
      // the last-ditch barrier after the Zod safeParse primary defences.
      console.warn('[multi-attack-progress-dispatcher] handler threw', err);
    }
  };

  ws.addEventListener('message', handler);
  return () => {
    ws.removeEventListener('message', handler);
  };
}
