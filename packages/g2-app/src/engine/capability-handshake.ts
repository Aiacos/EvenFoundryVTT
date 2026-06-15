/**
 * Capability handshake — WS client half of the Phase 3 bridge handshake.
 *
 * Pairs with `packages/bridge/src/ws/handshake.ts` (server side):
 *   1. Open WS connection to the bridge
 *   2. Send `HandshakeClient` JSON (proto/token/locale/capabilities[/session_id])
 *   3. Receive `HandshakeServer` JSON → resolve negotiated caps + session_id
 *   4. BLE-probe (separate function `probeBleThroughput`) decides
 *      raster vs glyph mode for `LayerManager.setMapMode()`
 *
 * Threat-model T-4a-02-01 / T-4a-02-03 mitigations:
 *   - Every JSON.parse is wrapped in try/catch → HandshakeError('parse_failed')
 *   - Every wire-parsed object goes through `HandshakeServerSchema.safeParse`
 *     (NEVER .parse) → schema failure throws HandshakeError('schema_failed')
 *   - The receive listener is bounded by a configurable timeout (default 10 s).
 *     On timeout we remove the message listener and reject with
 *     HandshakeError('timeout') so the caller can render boot-error UI
 *     (Phase 4b BOOT-01).
 *
 * BLE probe threshold (Branch A vs Branch B/C decision):
 *   - 100 kbps sustained is the Branch A → Branch B/C trigger
 *     (CONTEXT.md Area 4 + ADR-0005 PROVISIONAL). TODO(ADR-0005-OQ-INV2-1.b):
 *     re-tune on real hardware once §10.0.3 BLE measurements land.
 *
 * @see docs/architecture/0002-protocol-versioning.md (handshake protocol)
 * @see docs/architecture/0009-layer-manager-contract.md (consumer of negotiated caps)
 * @see docs/architecture/0005-phase0-go-no-go.md (PROVISIONAL Branch A threshold)
 * @see packages/bridge/src/ws/handshake.ts (server-side handshake)
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04a-CONTEXT.md §Area 4
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04A-02-PLAN.md Task 2
 */

import { type HandshakeServer, HandshakeServerSchema, SERVER_CAPS_V1 } from '@evf/shared-protocol';

/**
 * Discriminator-coded handshake error.
 *
 * Mirrors the LayerManagerError pattern from `layer-types.ts` — callers
 * discriminate on `.code` and never on `.message`. Codes:
 *
 *   - `parse_failed`     — wire payload was not valid JSON
 *   - `schema_failed`    — JSON parsed but failed HandshakeServerSchema
 *   - `timeout`          — no response within the configured window
 *   - `transport_error`  — reserved for ws-level errors surfaced by callers
 */
export class HandshakeError extends Error {
  public readonly code: 'parse_failed' | 'schema_failed' | 'timeout' | 'transport_error';

  constructor(
    code: 'parse_failed' | 'schema_failed' | 'timeout' | 'transport_error',
    message: string,
  ) {
    super(message);
    this.code = code;
    this.name = 'HandshakeError';
  }
}

/**
 * Send the client-side handshake and resolve with the negotiated server response.
 *
 * Wire shape (client → server):
 * ```json
 * {
 *   "proto": "evf-v1",
 *   "token": "<24h-bearer>",
 *   "locale": "it",
 *   "capabilities": ["read_char", "read_combat", "read_scene", "subscribe"],
 *   "session_id": "<uuid v4>"   // only on reconnect
 * }
 * ```
 *
 * Wire shape (server → client) — see `HandshakeServerSchema` for the
 * canonical Zod definition:
 * ```json
 * {
 *   "proto_chosen": "evf-v1",
 *   "server_caps": [...],
 *   "server_locale": "it",
 *   "session_id": "<uuid v4>",
 *   "replay_seq": 0
 * }
 * ```
 *
 * The `_options` ignored placeholder reserves the `addEventListener` 3rd
 * argument shape we'd pass at runtime (`{ once: true }`). Tests pass a
 * mocked socket whose `addEventListener` may or may not honour the option;
 * the function does not rely on it for correctness — the timeout race
 * removes the listener defensively.
 *
 * @param ws         - Native WebSocket (or compatible mock) — must be OPEN
 * @param token      - 24h bearer (paired via QR; see Specs §11.5.4)
 * @param locale     - BCP-47 primary tag (`'it'`, `'en'`, ...)
 * @param sessionId  - Optional UUID v4 for reconnect (resume from replay_seq)
 * @param timeoutMs  - Reject after this many ms with HandshakeError('timeout'); default 10 s
 * @param actorId    - Optional selected PC actor id (FLV-CHAR-SELECT); when set the bridge
 *                     pins this session's `character.delta` to that actor so the HUD
 *                     renders the player's chosen PC instead of always `characters[0]`.
 *                     Omit entirely (do not pass `""`) to preserve back-compat.
 */
export async function performCapabilityHandshake(
  ws: WebSocket,
  token: string,
  locale: string,
  sessionId?: string,
  timeoutMs: number = 10_000,
  actorId?: string,
): Promise<HandshakeServer> {
  // Build the client payload — only attach session_id and actorId when supplied so
  // the schema's `.optional()` fields validate cleanly under `exactOptionalPropertyTypes`.
  const clientMsg = {
    proto: 'evf-v1' as const,
    token,
    locale,
    capabilities: [...SERVER_CAPS_V1] as string[],
    ...(sessionId !== undefined ? { session_id: sessionId } : {}),
    ...(actorId !== undefined ? { actorId } : {}),
  };
  ws.send(JSON.stringify(clientMsg));

  return new Promise<HandshakeServer>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const onMessage = (ev: MessageEvent | { data: unknown }): void => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      ws.removeEventListener?.('message', onMessage as EventListener);

      const raw = (ev as { data: unknown }).data;
      // Wire payload should be a string. WebSocket binary frames are not
      // expected here; coerce to string defensively and let parse fail
      // if the host emitted a Blob/ArrayBuffer.
      const rawStr = typeof raw === 'string' ? raw : String(raw);

      let parsed: unknown;
      try {
        parsed = JSON.parse(rawStr);
      } catch {
        reject(new HandshakeError('parse_failed', 'Non-JSON handshake response'));
        return;
      }

      const result = HandshakeServerSchema.safeParse(parsed);
      if (!result.success) {
        reject(
          new HandshakeError(
            'schema_failed',
            `HandshakeServerSchema validation failed: ${result.error.message}`,
          ),
        );
        return;
      }
      resolve(result.data);
    };

    // Subscribe — pass { once: true } for hosts that honour it; the
    // explicit removeEventListener inside onMessage covers hosts that
    // don't (e.g., our EventEmitter mock).
    ws.addEventListener('message', onMessage as EventListener, { once: true });

    timer = setTimeout(() => {
      ws.removeEventListener?.('message', onMessage as EventListener);
      reject(new HandshakeError('timeout', `handshake timed out after ${timeoutMs} ms`));
    }, timeoutMs);
  });
}

/**
 * Classify BLE throughput as raster-capable / glyph-only / not-yet-decided.
 *
 * Returns:
 *   - `'auto'`  — durationMs < 500 (insufficient sample window;
 *                 caller queues frames and re-probes)
 *   - `'glyph'` — sustained throughput < 100 kbps (Branch B/C fallback)
 *   - `'raster'` — sustained throughput ≥ 100 kbps (Branch A)
 *
 * The 100 kbps threshold is the CONTEXT.md Area 4 + ADR-0005 PROVISIONAL
 * boundary. TODO(ADR-0005-OQ-INV2-1.b): re-tune once §10.0.3 hardware BLE
 * measurements land — the constant is intentionally inlined here (no
 * config plumbing) so the eventual hardware adjustment lands as a single
 * diff in this function.
 *
 * @param bytesObserved - Bytes received in the sample window
 * @param durationMs    - Length of the sample window in milliseconds
 */
export function probeBleThroughput(
  bytesObserved: number,
  durationMs: number,
): 'auto' | 'raster' | 'glyph' {
  if (durationMs < 500) {
    return 'auto';
  }
  const kbps = (bytesObserved * 8) / 1000 / (durationMs / 1000);
  // 100 kbps is the Branch A / Branch B/C boundary (ADR-0005 PROVISIONAL).
  // TODO(ADR-0005): re-tune on real G2 hardware measurements (OQ-INV2-1.b).
  return kbps < 100 ? 'glyph' : 'raster';
}
