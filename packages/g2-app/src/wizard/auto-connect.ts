/**
 * Auto-connect handler — registers G2 wear event and attempts WS handshake.
 *
 * Triggered by `hub.eventBus` event `g2.wear` (Even SDK, D-2.09).
 *
 * Flow:
 *   1. `g2.wear` received.
 *   2. Read Tier 3 session for the current profile.
 *   3. No session → wizard Step 1.
 *   4. Session found → attempt WS handshake (Phase 3/4a stub here).
 *   5. Handshake 401 → wizard Step 2 (pre-filled URL).
 *   6. Bridge unreachable → store error, wizard REPAIR step.
 *
 * The WS handshake is a STUB in Phase 2.
 * Phase 4a will replace `openHandshakeWebSocket` with the real WS connect logic.
 *
 * @see .planning/phases/02-foundry-module-core-pairing-ui/02-CONTEXT.md D-2.09, D-2.13
 * @see .planning/phases/02-foundry-module-core-pairing-ui/02-03-PLAN.md Task 2
 * @see docs/architecture/0002-protocol-versioning.md ADR-0002 (WS handshake envelope)
 */

import type { WizardState } from './state.js';
import { type Store, WizardStep } from './state.js';
import { loadSession } from './tier3-storage.js';

/**
 * WS handshake client envelope shape (ADR-0002).
 * Client sends this JSON object on WebSocket open.
 */
export interface WsHandshakeClient {
  proto: 'evf-v1';
  token: string;
  locale: string;
  capabilities: string[];
}

/**
 * WS handshake server response shape (ADR-0002).
 * Server replies with this JSON object.
 */
export interface WsHandshakeServer {
  proto_chosen: 'evf-v1';
  server_caps: string[];
  server_locale: string;
  session_id: string;
  replay_seq: number;
}

/** Active `g2.wear` handler reference (used for cleanup). */
let _wearHandler: (() => void) | null = null;

/**
 * Initialize the auto-connect subsystem.
 *
 * Registers a `g2.wear` event listener on the Even Hub event bus.
 * Idempotent — calling this multiple times removes the previous listener first.
 *
 * @param store - Wizard state store.
 * @param profileId - The active profile UUID to load from Tier 3.
 */
export function initAutoConnect(store: Store<WizardState>, profileId: string): void {
  if (_wearHandler) {
    hub.eventBus.off('g2.wear', _wearHandler);
    _wearHandler = null;
  }

  async function handleWear(): Promise<void> {
    const session = await loadSession(profileId);

    if (!session) {
      // No session stored — restart wizard from Step 1
      store.set({ step: WizardStep.STEP1, error: null });
      return;
    }

    // Session found — attempt WS handshake
    await openHandshakeWebSocket(session.bridgeUrl, store);
  }

  // Wrap async handler for synchronous eventBus.on callback
  _wearHandler = () => {
    void handleWear();
  };

  hub.eventBus.on('g2.wear', _wearHandler);
}

/**
 * Deregister the `g2.wear` listener.
 * Call on wizard unmount / plugin teardown.
 */
export function cleanupAutoConnect(): void {
  if (_wearHandler) {
    hub.eventBus.off('g2.wear', _wearHandler);
    _wearHandler = null;
  }
}

/**
 * Attempt WS handshake with the bridge.
 *
 * STUB — Phase 2 shell only. Phase 4a fills the real WS connect logic per ADR-0002.
 *
 * On token expiry (401 close): sets store to STEP2 with url pre-filled.
 * On bridge unreachable: sets store to REPAIR.
 *
 * @param bridgeUrl - The bridge URL from the stored session.
 * @param store - Wizard state store (for error + step updates).
 */
export async function openHandshakeWebSocket(
  bridgeUrl: string,
  store: Store<WizardState>,
): Promise<void> {
  // TODO (ADR-0002): Plan 04 wires real WS connect. This stub logs the session and returns.
  // The real implementation will:
  //   1. Open WebSocket to `${bridgeUrl.replace('https://', 'wss://').replace('http://', 'ws://')}/v1/ws`
  //   2. Send WsHandshakeClient envelope on open
  //   3. Parse WsHandshakeServer response
  //   4. On success: emit to G2 display layer (Phase 4a)
  //   5. On 401 close: store.set({ step: WizardStep.STEP2, error: { type: '401', url: bridgeUrl } })
  //   6. On unreachable: store.set({ step: WizardStep.REPAIR, error: { type: 'unreachable', url: bridgeUrl } })
  console.warn(
    `[EVF] auto-connect: WS handshake stub called for ${bridgeUrl}. Phase 4a wires real connect.`,
  );
  void store; // Phase 4a will use store
}
