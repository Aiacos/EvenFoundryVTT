/**
 * One projector ⇄ relay WebSocket for one paired device (ADR-0019 §Decision Outcome 2).
 *
 * - Connects to `<relay>/r/<room>?role=projector`, reconnects with exponential backoff
 *   (1 → 30 s) after any drop, except when the relay says a newer projector socket
 *   replaced this one (close {@link RELAY_CLOSE_REPLACED}): two projectors for one room
 *   must not fight.
 * - Relay control frames (`{"relay":"peer-up|peer-down"}`) become `onPeer`; every other
 *   JSON frame is handed to `onFrame` unparsed beyond JSON (the projector validates it).
 * - Outgoing frames are paced to {@link MAX_OUTGOING_FRAMES_PER_SECOND} per rolling second,
 *   queued in order: the relay closes a socket that sends more than 60 frames/s (1008,
 *   `packages/relay/src/limits.ts`), and a pairing burst on a scene with many pictures
 *   (one `asset` frame each) would otherwise cross it.
 * - {@link withProjectorLock} makes sure only ONE tab of this browser projects a device:
 *   the Web Locks API queues the other tabs until the holder closes.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API
 * @see packages/relay/README.md (wire contract)
 */
import { RELAY_CLOSE_REPLACED, RelayControlSchema, relayRoomUrl } from '@evf/shared-protocol';

/** Backoff bounds (ms). */
export const RELAY_BACKOFF = { base: 1_000, max: 30_000 } as const;

/**
 * Frames sent per relay socket in any rolling second. The relay's abuse cap is 60
 * (`MAX_FRAMES_PER_WINDOW`, packages/relay/src/limits.ts); 40 leaves room for clock skew
 * between this tab and the relay and for frames already in flight.
 */
export const MAX_OUTGOING_FRAMES_PER_SECOND = 40;

/** Length of the pacing window (ms), the relay's `RATE_WINDOW_MS`. */
const PACING_WINDOW_MS = 1_000;

/** The WebSocket surface used here (injectable for tests). */
export interface SocketLike {
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

/** Callbacks of a {@link RelayConnection}. */
export interface RelayHandlers {
  /** A JSON app frame arrived (a sealed envelope, validated by the caller). */
  onFrame(frame: unknown): void;
  /** The glasses joined (`true`) or left (`false`) the room. */
  onPeer(up: boolean): void;
  /** The relay socket opened (`true`) or dropped (`false`). */
  onLink(up: boolean): void;
}

/** Injectable environment. */
export interface RelayDeps {
  createSocket(url: string): SocketLike;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  /** Clock of the pacing window (ms). */
  now(): number;
}

/** A frame waiting for its turn on the socket it was queued for. */
interface Outgoing {
  data: string;
  socket: SocketLike;
  resolve: () => void;
  reject: (err: Error) => void;
}

const BROWSER_DEPS: RelayDeps = {
  now: () => Date.now(),
  createSocket: (url) => new WebSocket(url) as unknown as SocketLike,
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/** Backoff for attempt `n` (1-based): 1, 2, 4 … 30 s. */
export function relayBackoff(attempt: number): number {
  return Math.min(RELAY_BACKOFF.max, RELAY_BACKOFF.base * 2 ** Math.max(0, attempt - 1));
}

/** A self-healing projector socket to one relay room. */
export class RelayConnection {
  private socket: SocketLike | null = null;
  private timer: unknown = null;
  private attempt = 0;
  private stopped = true;
  private room: string;
  /** Frames not yet written, oldest first. */
  private readonly queue: Outgoing[] = [];
  /** Send times of the frames written in the current pacing window, oldest first. */
  private readonly sentAt: number[] = [];
  private pumpTimer: unknown = null;

  /**
   * @param relayBase - relay origin (`wss://…`)
   * @param room - initial room id
   */
  constructor(
    private readonly relayBase: string,
    room: string,
    private readonly handlers: RelayHandlers,
    private readonly deps: RelayDeps = BROWSER_DEPS,
  ) {
    this.room = room;
  }

  /** Whether the relay socket is open. */
  get connected(): boolean {
    return this.socket?.readyState === OPEN;
  }

  /** Opens the socket (idempotent). */
  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.open();
  }

  /** Closes for good (no reconnect). */
  stop(): void {
    this.stopped = true;
    this.clearTimer();
    this.drop(1000, 'stopped');
    if (this.pumpTimer !== null) this.deps.clearTimeout(this.pumpTimer);
    this.pumpTimer = null;
  }

  /** Moves to another room (pairing rotation): reconnects there immediately. */
  switchRoom(room: string): void {
    if (room === this.room) return;
    this.room = room;
    if (this.stopped) return;
    this.clearTimer();
    this.drop(1000, 'room rotated');
    this.attempt = 0;
    this.open();
  }

  /**
   * Queues a JSON-serialised frame on the open socket. Frames go out in call order, at
   * most {@link MAX_OUTGOING_FRAMES_PER_SECOND} per rolling second.
   *
   * @returns resolves once the frame is written to the socket
   * @throws (rejects) when the socket is not open, or goes away before the frame's turn
   *   (the frame is dropped: the glasses re-request state after reconnecting)
   */
  send(frame: object): Promise<void> {
    const socket = this.socket;
    if (socket === null || socket.readyState !== OPEN) {
      return Promise.reject(new Error('relay not connected'));
    }
    return new Promise((resolve, reject) => {
      this.queue.push({ data: JSON.stringify(frame), socket, resolve, reject });
      this.pump();
    });
  }

  /** Writes queued frames while the pacing window has room, then waits for it. */
  private pump(): void {
    if (this.pumpTimer !== null) return;
    for (let next = this.queue[0]; next !== undefined; next = this.queue[0]) {
      const now = this.deps.now();
      while ((this.sentAt[0] ?? Number.POSITIVE_INFINITY) <= now - PACING_WINDOW_MS) {
        this.sentAt.shift();
      }
      const oldest = this.sentAt[0];
      if (oldest !== undefined && this.sentAt.length >= MAX_OUTGOING_FRAMES_PER_SECOND) {
        this.pumpTimer = this.deps.setTimeout(
          () => {
            this.pumpTimer = null;
            this.pump();
          },
          oldest + PACING_WINDOW_MS - now,
        );
        return;
      }
      this.queue.shift();
      if (next.socket !== this.socket || next.socket.readyState !== OPEN) {
        next.reject(new Error('relay socket closed before the frame was sent'));
        continue;
      }
      next.socket.send(next.data);
      this.sentAt.push(now);
      next.resolve();
    }
  }

  /** Rejects every queued frame (its socket is gone). */
  private rejectQueued(reason: string): void {
    for (const frame of this.queue.splice(0)) frame.reject(new Error(reason));
  }

  private open(): void {
    const socket = this.deps.createSocket(relayRoomUrl(this.relayBase, this.room, 'projector'));
    this.socket = socket;
    socket.onopen = () => {
      if (this.socket !== socket) return;
      this.attempt = 0;
      this.handlers.onLink(true);
    };
    socket.onmessage = (ev) => {
      if (this.socket === socket) this.receive(ev.data);
    };
    socket.onerror = () => {
      // The close event that always follows carries the handling; errors are not
      // inspectable in browsers (no detail on WebSocket error events).
    };
    socket.onclose = (ev) => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.rejectQueued(`relay socket closed (${ev.code})`);
      this.handlers.onPeer(false);
      this.handlers.onLink(false);
      if (this.stopped) return;
      if (ev.code === RELAY_CLOSE_REPLACED) {
        console.warn('[EVF] relay: another projector took over this device — standing by');
        this.stopped = true;
        return;
      }
      this.attempt++;
      this.timer = this.deps.setTimeout(() => {
        this.timer = null;
        if (!this.stopped) this.open();
      }, relayBackoff(this.attempt));
    };
  }

  private receive(data: unknown): void {
    if (typeof data !== 'string') return;
    let frame: unknown;
    try {
      frame = JSON.parse(data);
    } catch {
      console.warn('[EVF] relay: dropped a non-JSON frame');
      return;
    }
    const control = RelayControlSchema.safeParse(frame);
    if (control.success) {
      this.handlers.onPeer(control.data.relay === 'peer-up');
      return;
    }
    this.handlers.onFrame(frame);
  }

  private drop(code: number, reason: string): void {
    const socket = this.socket;
    this.socket = null;
    if (socket === null) return;
    socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null;
    socket.close(code, reason);
    this.rejectQueued(`relay socket closed (${reason})`);
    this.handlers.onPeer(false);
    this.handlers.onLink(false);
  }

  private clearTimer(): void {
    if (this.timer !== null) this.deps.clearTimeout(this.timer);
    this.timer = null;
  }
}

/** Minimal Web Locks surface (`navigator.locks`). */
export interface LockManagerLike {
  request(name: string, callback: (lock: unknown) => Promise<void>): Promise<void>;
}

/**
 * Runs `hold` while this tab owns the projector lock of `deviceId`; other tabs of the
 * same browser wait in the lock queue and take over when the holder's tab closes or
 * `release` is called. Without Web Locks (insecure `http:` origins) it runs at once —
 * the relay's replace rule then keeps the newest tab.
 *
 * @param hold - called once the lock is held; resolves `release` to give it back
 */
export function withProjectorLock(
  deviceId: string,
  hold: () => void,
  locks: LockManagerLike | null | undefined = (
    globalThis.navigator as { locks?: LockManagerLike | null } | undefined
  )?.locks,
): () => void {
  let done = false;
  let resolveReleased: () => void = () => {};
  const released = new Promise<void>((resolve) => {
    resolveReleased = resolve;
  });
  const release = (): void => {
    done = true;
    resolveReleased();
  };
  if (locks === undefined || locks === null) {
    hold();
    return release;
  }
  locks
    .request(`evf-projector-${deviceId}`, async () => {
      // Released while still queued: never start projecting.
      if (done) return;
      hold();
      await released;
    })
    .catch((err: unknown) => {
      console.error(`[EVF] projector lock for ${deviceId} failed`, err);
    });
  return release;
}
