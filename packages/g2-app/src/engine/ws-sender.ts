/**
 * WsSender — stable outbound-socket holder.
 *
 * Panels and probes hold a `WsSender`, never a raw `WebSocket`, so a WS reconnect
 * can redirect every outbound `.send` to the new live socket via {@link WsSender.swap}
 * with NO re-wiring of the holders (the holder's object identity never changes).
 *
 * This is why the reconnect rewire uses a holder for OUTBOUND senders but re-attaches
 * INBOUND listeners: a sender only ever calls `.send(data)` (a redirectable delegation),
 * whereas an `addEventListener('message', fn)` binds to a specific socket instance and
 * cannot be redirected — those must be disposed-and-re-attached against the new socket.
 *
 * The holder satisfies the structural `{ send(data: string): void }` shape that every
 * panel ws-param interface already accepts (SlotPickerWebSocket, ActionOptionsWebSocket,
 * …), so passing the holder in place of a raw socket requires ZERO constructor-signature
 * changes (INV-4 — minimal-churn, no dead code).
 *
 * @see packages/g2-app/src/internal/boot-engine-core.ts (construction + swap on reconnect)
 * @see packages/g2-app/src/engine/ws-reconnect.ts (onReconnected callback that triggers swap)
 */
export class WsSender {
  /** Current outbound target — reassigned by {@link WsSender.swap}. */
  private target: { send(data: string): void };

  /**
   * @param ws The initial outbound target (the boot-time live socket).
   */
  constructor(ws: { send(data: string): void }) {
    this.target = ws;
  }

  /**
   * Send a serialized envelope over the current target socket.
   *
   * @param data The pre-serialized JSON string to transmit.
   */
  send(data: string): void {
    this.target.send(data);
  }

  /**
   * Redirect the holder to a new target socket. Subsequent {@link WsSender.send}
   * calls hit `ws`. The holder's own identity is unchanged, so every panel/probe
   * that captured this holder keeps working without re-construction.
   *
   * @param ws The new live socket to route outbound sends through.
   */
  swap(ws: { send(data: string): void }): void {
    this.target = ws;
  }
}
