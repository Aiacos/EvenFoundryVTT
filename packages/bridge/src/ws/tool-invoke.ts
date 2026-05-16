/**
 * WS tool.invoke handler — routes g2-app tool invocations to dispatchTool via socketlib.
 *
 * Phase 7 CR-01 fix: the bridge WS server was missing a handler for `tool.invoke`
 * envelopes, causing both CONC-01 (drop-concentration) and ACT-02
 * (confirm-template-placement) flows to be silently dropped.
 *
 * Flow:
 * 1. Parse raw WS data as JSON → `EnvelopeSchema` (outer carrier).
 * 2. Guard on `envelope.type === 'tool.invoke'`.
 * 3. Validate `envelope.payload` via `ToolInvocationEnvelopePayloadSchema`.
 * 4. Look up session bearer from `SessionStore` for auth context.
 * 5. Forward the validated payload to the injected `dispatchToolFn` (production:
 *    the Foundry-socket-bound dispatchTool wrapper; tests: a vi.fn() spy).
 * 6. Send a `tool.result` response envelope back over the socket.
 *
 * The handler is intentionally side-effect-free with respect to global state —
 * all dependencies are injected so tests can stub `dispatchToolFn` without
 * touching real Foundry globals.
 *
 * @see packages/bridge/src/server.ts (consumer — wires handleToolInvoke in message loop)
 * @see packages/shared-protocol/src/payloads/tool.ts (ToolInvocationEnvelopePayloadSchema)
 * @see docs/architecture/0011-foundry-write-path-single-workflow-origin.md
 * @see .planning/phases/07-foundry-module-write-path/07-REVIEW.md CR-01
 */

import {
  EnvelopeSchema,
  type ToolInvocationEnvelopePayload,
  ToolInvocationEnvelopePayloadSchema,
} from '@evf/shared-protocol';
import type { Logger } from 'pino';
import type { WebSocket } from 'ws';
import type { SessionStore } from './session-store.js';

/**
 * Result returned by a `dispatchToolFn` call.
 *
 * Mirrors the `ToolResult` discriminated union from `foundry-module/tool-registry.ts`
 * without importing the module package (bridge cannot depend on foundry-module).
 */
export interface ToolInvokeResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

/**
 * Injected tool dispatch function type.
 *
 * In production: the Foundry-socket-bound wrapper that calls
 * `socketlibSocket.executeAsGM(handlerId, { payload, bearer })`.
 * In tests: a `vi.fn()` spy that returns a mock `ToolInvokeResult`.
 *
 * @param payload  - Validated `ToolInvocationEnvelopePayload` (toolId + idempotencyKey + args).
 * @param bearer   - Opaque bearer token from the session store (forwarded to dispatchTool
 *                   for bearer-bound idempotency key construction and audit logging).
 */
export type DispatchToolFn = (
  payload: ToolInvocationEnvelopePayload,
  bearer: string,
) => Promise<ToolInvokeResult>;

/**
 * Handle a potential `tool.invoke` WS message on an already-handshaked socket.
 *
 * Non-tool.invoke messages (e.g., `client_resume`) are silently ignored —
 * this handler and `handleResume` coexist in the same message listener and
 * each is responsible for its own envelope type.
 *
 * @param socket         - The WS socket the message arrived on.
 * @param sessionId      - Session ID returned by `handleHandshake` (post-auth identity).
 * @param sessionStore   - Session store for looking up the bearer token.
 * @param dispatchToolFn - Injected function that forwards the payload to Foundry dispatchTool.
 * @param rawData        - Raw socket payload (Buffer or string from the `ws` library).
 * @param logger         - pino logger (redaction config applied at server level).
 */
export async function handleToolInvoke(
  socket: WebSocket,
  sessionId: string,
  sessionStore: SessionStore,
  dispatchToolFn: DispatchToolFn,
  rawData: Buffer | ArrayBuffer | Buffer[] | string,
  logger: Logger,
): Promise<void> {
  // ── Step 1: parse raw bytes to JSON ──────────────────────────────────────────
  let parsed: unknown;
  try {
    const text =
      typeof rawData === 'string'
        ? rawData
        : Buffer.isBuffer(rawData)
          ? rawData.toString('utf-8')
          : Array.isArray(rawData)
            ? Buffer.concat(rawData).toString('utf-8')
            : Buffer.from(rawData).toString('utf-8');
    parsed = JSON.parse(text);
  } catch {
    // Not JSON — silently ignore (may be a different message type).
    return;
  }

  // ── Step 2: validate outer envelope shape ────────────────────────────────────
  const envelopeResult = EnvelopeSchema.safeParse(parsed);
  if (!envelopeResult.success) {
    return; // Not a valid EVF envelope — ignore.
  }

  const envelope = envelopeResult.data;

  // ── Step 3: guard on tool.invoke type ────────────────────────────────────────
  if (envelope.type !== 'tool.invoke') {
    return; // Different envelope type — let other handlers process it.
  }

  // ── Step 4: validate payload via ToolInvocationEnvelopePayloadSchema ─────────
  const payloadResult = ToolInvocationEnvelopePayloadSchema.safeParse(envelope.payload);
  if (!payloadResult.success) {
    logger.warn(
      { sessionId, toolInvokeError: payloadResult.error.message },
      'WS tool.invoke: payload validation failed',
    );
    const errorResponse = {
      proto: 'evf-v1',
      type: 'tool.result',
      session_id: sessionId,
      payload: { success: false, error: 'invalid_payload' },
    };
    socket.send(JSON.stringify(errorResponse));
    return;
  }

  const toolPayload = payloadResult.data;

  // ── Step 5: look up session bearer for auth context ───────────────────────────
  const session = sessionStore.getSession(sessionId);
  if (session === undefined) {
    // Session expired between handshake and this message — reject.
    logger.warn({ sessionId, toolId: toolPayload.toolId }, 'WS tool.invoke: session not found');
    const errorResponse = {
      proto: 'evf-v1',
      type: 'tool.result',
      session_id: sessionId,
      payload: { success: false, error: 'session_not_found' },
    };
    socket.send(JSON.stringify(errorResponse));
    return;
  }

  // ── Step 6: dispatch to Foundry via injected dispatchToolFn ──────────────────
  let result: ToolInvokeResult;
  try {
    result = await dispatchToolFn(toolPayload, session.token);
  } catch (err) {
    logger.error(
      { sessionId, toolId: toolPayload.toolId, err },
      'WS tool.invoke: dispatchToolFn threw unexpectedly',
    );
    result = { success: false, error: err instanceof Error ? err.message : String(err) };
  }

  // ── Step 7: send tool.result response back to g2-app ─────────────────────────
  const response = {
    proto: 'evf-v1',
    type: 'tool.result',
    session_id: sessionId,
    payload: result,
  };
  socket.send(JSON.stringify(response));

  logger.info(
    { sessionId, toolId: toolPayload.toolId, success: result.success },
    'WS tool.invoke: dispatched',
  );
}
