/**
 * Glasses-side relay link (ADR-0019 §Decision Outcome 2): one WebSocket to
 * `<relay>/r/<room>?role=glasses`. Replaces the former same-origin Foundry client — the
 * phone never talks to Foundry.
 *
 * App frames are sealed envelopes (JSON); the relay's own control frames
 * `{"relay":"peer-up|peer-down"}` tell whether the projector (the player's Foundry tab)
 * is in the room. Reconnection policy lives in the session; this module only opens,
 * forwards and closes.
 *
 * @see packages/relay/README.md (wire contract)
 */
import { RelayControlSchema, relayRoomUrl } from '@evf/shared-protocol';

/** An open relay link. */
export interface RelayLink {
  /** Sends a JSON frame; false when the socket is no longer open (dropped). */
  send(frame: object): boolean;
  /** Registers the app-frame handler (sealed envelopes, still unvalidated). */
  onFrame(listener: (frame: unknown) => void): void;
  /** Registers the projector presence handler. */
  onPeer(listener: (up: boolean) => void): void;
  /** Registers the close handler (called once, not after {@link RelayLink.close}). */
  onClose(listener: (code: number) => void): void;
  /** Closes the link (no close callback). */
  close(): void;
}

/** Opens a link to `room` on the relay at `relayBase`. */
export type OpenRelay = (relayBase: string, room: string) => Promise<RelayLink>;

/** Minimal WebSocket surface (injectable for tests). */
export interface WebSocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: { code: number }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
}

/** `WebSocket.OPEN`. */
const OPEN = 1;
/** How long the relay may take to accept the socket (ms). */
export const RELAY_OPEN_TIMEOUT_MS = 10_000;

/**
 * Creates the browser {@link OpenRelay}.
 *
 * @param createSocket - WebSocket factory (tests inject a fake)
 * @param timeoutMs - open timeout
 */
export function createRelayOpener(
  createSocket: (url: string) => WebSocketLike = (url) =>
    new WebSocket(url) as unknown as WebSocketLike,
  timeoutMs: number = RELAY_OPEN_TIMEOUT_MS,
): OpenRelay {
  return (relayBase, room) =>
    new Promise<RelayLink>((resolve, reject) => {
      const socket = createSocket(relayRoomUrl(relayBase, room, 'glasses'));
      let frameListener: (frame: unknown) => void = () => {};
      let peerListener: (up: boolean) => void = () => {};
      let closeListener: (code: number) => void = () => {};
      let opened = false;
      const timer = setTimeout(() => {
        socket.onopen = socket.onclose = socket.onerror = socket.onmessage = null;
        socket.close();
        reject(new Error(`relay did not answer within ${timeoutMs} ms`));
      }, timeoutMs);
      socket.onerror = () => {
        // Browsers give no detail on WebSocket errors; the close event follows.
      };
      socket.onmessage = (ev) => {
        if (typeof ev.data !== 'string') return;
        let frame: unknown;
        try {
          frame = JSON.parse(ev.data);
        } catch {
          // Not ours: the relay only forwards JSON envelopes and control frames.
          return;
        }
        const control = RelayControlSchema.safeParse(frame);
        if (control.success) peerListener(control.data.relay === 'peer-up');
        else frameListener(frame);
      };
      socket.onclose = (ev) => {
        clearTimeout(timer);
        if (!opened) {
          reject(new Error(`relay closed the connection (${ev.code})`));
          return;
        }
        closeListener(ev.code);
      };
      socket.onopen = () => {
        clearTimeout(timer);
        opened = true;
        resolve({
          send(frame) {
            if (socket.readyState !== OPEN) return false;
            socket.send(JSON.stringify(frame));
            return true;
          },
          onFrame(listener) {
            frameListener = listener;
          },
          onPeer(listener) {
            peerListener = listener;
          },
          onClose(listener) {
            closeListener = listener;
          },
          close() {
            socket.onopen = socket.onclose = socket.onerror = socket.onmessage = null;
            socket.close(1000, 'closed by the app');
          },
        });
      };
    });
}

/** Host of a relay URL, for display ("relay.example"). */
export function relayHost(relayBase: string): string {
  try {
    return new URL(relayBase.replace(/^ws/, 'http')).host;
  } catch {
    return relayBase;
  }
}
