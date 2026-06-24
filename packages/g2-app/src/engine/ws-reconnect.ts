/**
 * WsReconnectController — WebSocket reconnect with exponential backoff +
 * `client_resume` dispatch + SYNC LOST chip lifecycle.
 *
 * Wired into boot-engine-core after the initial handshake. On WS close:
 *   1. Calls `onChipTick({ remainingMs, attempt })` every 1000 ms while counting down.
 *   2. When countdown reaches 0: calls `wsFactory(url)` + `performHandshake(newWs, sessionId)`.
 *   3. On handshake success: sends `client_resume { proto:'evf-v1', type:'client_resume',
 *      session_id, last_seq }` over the new socket.
 *   4. Listens on new socket for bridge response:
 *      - `resume_replay { count }` → calls `onChipUnmount()` (normal resume, chip drops).
 *      - `resume_full_snapshot { reason }` → calls `seqTracker.reset()` +
 *        `onFullRefreshRequired()` (T-10-01 mitigation — stale-seq full refresh).
 *   5. On handshake failure: exponential backoff → retry.
 *
 * **Backoff schedule** (D-Area1): `[1000, 2000, 4000, 8000, 15000, 30000]` ms.
 * Attempt index increments per failure; cap stays at 30 000 ms indefinitely.
 *
 * **In-memory only:** seq tracking is lost on Even App reload — acceptable for
 * single-tenant homelab MVP (CONTEXT.md §Area 1, D-Area1 decision).
 *
 * **T-10-01 mitigation (D-Area5):** `resume_full_snapshot { reason: 'buffer_gap' |
 * 'buffer_expired' }` triggers `seqTracker.reset()` then `onFullRefreshRequired()`
 * before any further envelopes are forwarded. The bridge's gap detection is the
 * authority; the client never bypasses it (test WSR-07).
 *
 * **Lifecycle:** call `dispose()` to cancel any pending timer and remove WS listeners
 * (e.g. in `boot-engine-core.ts` teardown — reverse-mount order, before `unsubR1`).
 *
 * @see packages/g2-app/src/engine/seq-tracker.ts (SeqTracker)
 * @see packages/shared-protocol/src/envelope.ts (ClientResumeSchema)
 * @see packages/bridge/src/ws/resume.ts (server-side resume handler)
 * @see .planning/phases/10-polish-field-test-mvp/10-01-PLAN.md Task 2
 * @see .planning/phases/10-polish-field-test-mvp/10-CONTEXT.md §Area 1 D-Area1
 */
import type { SeqTracker } from './seq-tracker.js';

/**
 * Exponential backoff delay schedule in milliseconds.
 *
 * Per D-Area1 decision: `1s → 2s → 4s → 8s → 15s → 30s` (cap 30s).
 * Index increments per failed reconnect attempt; beyond the last element
 * the controller stays at 30 000 ms indefinitely.
 */
const BACKOFF_DELAYS_MS = [1000, 2000, 4000, 8000, 15000, 30000] as const;

/** EVF WS protocol identifier. */
const PROTO = 'evf-v1' as const;

/** Arguments for `onChipTick` — countdown state for sync-lost-chip render. */
export interface ChipTickArgs {
  /** Remaining ms before the next reconnect attempt. */
  readonly remainingMs: number;
  /** Attempt number (0-indexed: 0 = first attempt after close). */
  readonly attempt: number;
}

/** Constructor options for WsReconnectController. */
export interface WsReconnectControllerOpts {
  /** The live WebSocket to listen for 'close' events on. */
  readonly ws: WebSocket;
  /** Bridge WebSocket URL — passed to `wsFactory` on each reconnect. */
  readonly url: string;
  /** Session UUID from the original handshake — forwarded in `client_resume`. */
  readonly sessionId: string;
  /** SeqTracker instance shared with boot-engine-core's envelope observer. */
  readonly seqTracker: SeqTracker;
  /**
   * Factory that creates a new WebSocket for reconnect.
   * Default: `(url) => new WebSocket(url)`.
   */
  readonly wsFactory: (url: string) => WebSocket;
  /**
   * Re-runs the capability handshake on a fresh socket.
   * Returns a promise resolving to `{ session_id }` on success.
   * Rejects on handshake failure (triggers backoff retry).
   */
  readonly performHandshake: (ws: WebSocket, sessionId: string) => Promise<{ session_id: string }>;
  /**
   * Called every 1000 ms during countdown with remaining ms + attempt index.
   * Used by sync-lost-chip to update the countdown display.
   */
  readonly onChipTick: (args: ChipTickArgs) => void;
  /**
   * Called when the controller successfully resumes (`resume_replay` received).
   * The caller should unmount the SYNC LOST chip and restore the normal R1 chip.
   */
  readonly onChipUnmount: () => void;
  /**
   * Called when the bridge replies with `resume_full_snapshot`.
   * The caller should trigger a REST GET /v1/actor to re-fetch full state.
   * (T-10-01 mitigation — stale-seq forced full refresh.)
   */
  readonly onFullRefreshRequired: () => void;
  /**
   * Fired with the now-live WebSocket immediately after a successful resume, so the
   * host can rebind persistent INBOUND listeners (sceneInput, R1, dispatchers, the
   * wsEvents bus) onto the new socket AND swap the outbound `WsSender` target via
   * `holder.swap(newWs)` (quick-task 260529-khy — BLOCKER 2 full rewire).
   *
   * Fires BEFORE `onChipUnmount` on BOTH resume paths. On `resume_full_snapshot` it
   * fires AFTER `seqTracker.reset()` and BEFORE `onFullRefreshRequired`.
   *
   * Optional — absent callback is a no-op (backward compatible; existing callers that
   * never reconnect twice or never rebind keep working unchanged).
   */
  readonly onReconnected?: (newWs: WebSocket) => void;
}

/**
 * WS reconnect controller with exponential backoff + resume dispatch.
 *
 * Attaches a 'close' listener to the supplied WebSocket in the constructor.
 * All reconnect state is encapsulated; the caller only needs to:
 *   1. Construct with `new WsReconnectController(opts)`.
 *   2. Call `dispose()` in the boot teardown.
 */
export class WsReconnectController {
  private readonly opts: WsReconnectControllerOpts;

  /** Current attempt index into BACKOFF_DELAYS_MS (capped at last element). */
  private attemptIndex = 0;

  /** Active countdown timer (null when idle or disposed). */
  private countdownTimer: ReturnType<typeof setTimeout> | null = null;
  /**
   * Active intermediate tick timer (recursive setTimeout chain).
   * Null when idle, disposed, or no intermediate ticks remain.
   */
  private tickInterval: ReturnType<typeof setTimeout> | null = null;

  /** Whether dispose() has been called. */
  private disposed = false;

  /** Bound close handler — stored so it can be removed via removeEventListener. */
  private readonly _onClose: () => void;

  /**
   * The socket the 'close' listener is currently armed on (BLOCKER 1 fix —
   * quick-task 260529-khy).
   *
   * Initialised to `opts.ws`; re-pointed to the new live socket on each successful
   * reconnect so REPEATED disconnects are each detected. `dispose()` removes the
   * listener from THIS socket (not the original `opts.ws`).
   */
  private currentWs: WebSocket;

  constructor(opts: WsReconnectControllerOpts) {
    this.opts = opts;
    this.currentWs = opts.ws;
    this._onClose = () => this._handleClose();
    // Arm the 'close' listener on the current live socket. Re-armed on `currentWs`
    // after each successful reconnect so a second/third disconnect is also detected.
    this.currentWs.addEventListener('close', this._onClose as EventListener);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Public API
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Cancel any pending reconnect timer, remove the 'close' listener from the
   * CURRENT live socket (`currentWs` — re-armed on each successful reconnect, so
   * after N reconnects this removes it from the Nth socket, NOT the original
   * `opts.ws`), and prevent any further reconnect attempts.
   *
   * Called in boot-engine-core teardown (reverse-mount order, before unsubR1).
   * Idempotent — second calls are no-ops.
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.currentWs.removeEventListener('close', this._onClose as EventListener);
    this._clearTimers();
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Internal — reconnect lifecycle
  // ──────────────────────────────────────────────────────────────────────────

  /** Handle the 'close' event on the original WS — start countdown. */
  private _handleClose(): void {
    if (this.disposed) return;
    this._startCountdown();
  }

  /**
   * Start the backoff countdown for the current `attemptIndex`.
   *
   * Fires `onChipTick` every 1000 ms. When the countdown reaches 0,
   * calls `_attemptReconnect()`.
   *
   * Uses a recursive setTimeout pattern instead of setInterval to avoid
   * infinite-loop detection in vitest fake timers (the interval can trigger
   * >10000 times across nested runAllTimersAsync calls when chaining retries).
   */
  private _startCountdown(): void {
    this._clearTimers();

    // noUncheckedIndexedAccess: Math.min clamps index to [0, length-1] so the
    // element is always defined — but TS still infers `T | undefined` for const arrays.
    // The nullish fallback is defensive only and can never trigger at runtime.
    const cappedIndex = Math.min(this.attemptIndex, BACKOFF_DELAYS_MS.length - 1);
    const delayMs: number = BACKOFF_DELAYS_MS[cappedIndex] ?? 30000;
    const attempt = this.attemptIndex;
    let remainingMs = delayMs;

    // Initial tick so the chip shows the full delay immediately
    this.opts.onChipTick({ remainingMs, attempt });

    // Schedule the final timer that fires the reconnect attempt after `delayMs`
    this.countdownTimer = setTimeout(() => {
      this._clearTimers();
      void this._attemptReconnect();
    }, delayMs);

    // Schedule intermediate 1s ticks to update the countdown display.
    // Each tick schedules the next one (recursive setTimeout chain) so vitest
    // fake timers do not run the whole chain at once during runAllTimersAsync.
    const scheduleTick = (afterMs: number): void => {
      if (this.disposed || afterMs >= delayMs) return;
      this.tickInterval = setTimeout(() => {
        remainingMs = Math.max(0, delayMs - afterMs - 1000);
        this.opts.onChipTick({ remainingMs, attempt });
        scheduleTick(afterMs + 1000);
      }, 1000);
    };
    scheduleTick(0);
  }

  /** Clear the countdown timeout and any pending tick timeout. */
  private _clearTimers(): void {
    if (this.countdownTimer !== null) {
      clearTimeout(this.countdownTimer);
      this.countdownTimer = null;
    }
    if (this.tickInterval !== null) {
      clearTimeout(this.tickInterval);
      this.tickInterval = null;
    }
  }

  /**
   * Resolve once `ws` reaches OPEN; reject if it errors or closes before opening.
   *
   * Mirrors boot-engine-core's `awaitWsOpen` so the reconnect handshake never runs
   * against a still-CONNECTING socket (whose `.send()` would throw). Static + pure so
   * it has no dependency on instance state; a rejection here is caught by
   * {@link _attemptReconnect} and converted into a normal backoff retry.
   */
  private static _awaitOpen(ws: WebSocket): Promise<void> {
    // WebSocket.OPEN === 1 in browsers + the Node `ws` polyfill.
    if (ws.readyState === 1) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
      const cleanup = (): void => {
        ws.removeEventListener('open', onOpen as EventListener);
        ws.removeEventListener('error', onFail as EventListener);
        ws.removeEventListener('close', onFail as EventListener);
      };
      const onOpen = (): void => {
        cleanup();
        resolve();
      };
      const onFail = (ev: Event): void => {
        cleanup();
        reject(new Error(`[ws-reconnect] socket ${String(ev.type)} before open`));
      };
      ws.addEventListener('open', onOpen as EventListener);
      ws.addEventListener('error', onFail as EventListener);
      ws.addEventListener('close', onFail as EventListener);
    });
  }

  /**
   * Attempt to reconnect: create new WS + run handshake + send client_resume.
   *
   * On success: sends client_resume, attaches resume response listener.
   * On failure: increments attemptIndex + starts another countdown (backoff).
   */
  private async _attemptReconnect(): Promise<void> {
    if (this.disposed) return;

    // Signal in-flight (retryInMs = 0) via a final chip tick before the attempt
    this.opts.onChipTick({ remainingMs: 0, attempt: this.attemptIndex });

    const newWs = this.opts.wsFactory(this.opts.url);

    try {
      // A freshly-created reconnect socket starts in CONNECTING. performHandshake
      // (capability-handshake.ts) REQUIRES an OPEN socket — it `.send()`s the handshake
      // immediately, which THROWS on a CONNECTING socket. Without awaiting 'open' first
      // the handshake rejects every attempt, the bridge idle-times-out the connection
      // (close 4400), the backoff loops forever, and the outbound WsSender is never
      // swapped — so after ANY bridge restart the glasses tap silently stops reaching
      // Foundry. Boot already gates on `awaitWsOpen`; the reconnect path must too.
      await WsReconnectController._awaitOpen(newWs);
      if (this.disposed) return;

      const handshakeResult = await this.opts.performHandshake(newWs, this.opts.sessionId);

      if (this.disposed) return;

      // Reset attempt index on successful handshake
      this.attemptIndex = 0;

      // Build client_resume — clamp last_seq to 0 per ClientResumeSchema nonnegative
      const rawSeq = this.opts.seqTracker.getLastConfirmedSeq();
      const lastSeq = rawSeq < 0 ? 0 : rawSeq;

      const resumeMsg = JSON.stringify({
        proto: PROTO,
        type: 'client_resume',
        session_id: handshakeResult.session_id,
        last_seq: lastSeq,
      });
      newWs.send(resumeMsg);

      // BLOCKER 1 (quick-task 260529-khy) — RE-ARM the 'close' listener on the new
      // live socket so REPEATED disconnects are each detected. Done synchronously (no
      // await between the three steps) so no close can slip through a half-armed window.
      this.currentWs.removeEventListener('close', this._onClose as EventListener);
      this.currentWs = newWs;
      newWs.addEventListener('close', this._onClose as EventListener);

      // Attach one-time listener for resume response
      this._attachResumeListener(newWs);
    } catch {
      if (this.disposed) return;
      // Handshake failed — increment backoff index and retry
      this.attemptIndex = Math.min(this.attemptIndex + 1, BACKOFF_DELAYS_MS.length - 1);
      this._startCountdown();
    }
  }

  /**
   * Attach a 'message' listener on the new socket to handle the bridge's
   * resume response (`resume_replay` or `resume_full_snapshot`).
   *
   * The listener is self-removing after the first matching message so there
   * are no long-lived subscriptions beyond the reconnect window.
   *
   * T-10-01 mitigation: `resume_full_snapshot { reason: 'buffer_gap' }` calls
   * `seqTracker.reset()` + `onFullRefreshRequired()` BEFORE forwarding any further
   * envelopes. The bridge's gap detection is the authority.
   */
  private _attachResumeListener(ws: WebSocket): void {
    const onMessage = (ev: Event): void => {
      const msgEv = ev as MessageEvent;
      let parsed: unknown;
      try {
        const text =
          typeof msgEv.data === 'string'
            ? msgEv.data
            : new TextDecoder().decode(msgEv.data as ArrayBuffer);
        parsed = JSON.parse(text);
      } catch {
        return;
      }

      const msg = parsed as Record<string, unknown>;
      if (msg.type !== 'resume_replay' && msg.type !== 'resume_full_snapshot') {
        // Not a resume response — ignore (createWsEventBus handles all other types)
        return;
      }

      // Self-remove once we have the resume response
      ws.removeEventListener('message', onMessage as EventListener);

      if (msg.type === 'resume_replay') {
        // Normal resume: contiguous replay follows, chip unmounts.
        // quick-task 260529-khy — fire onReconnected with the now-live socket BEFORE
        // onChipUnmount so the host rebinds inbound listeners + swaps the WsSender first.
        this.opts.onReconnected?.(ws);
        this.opts.onChipUnmount();
      } else {
        // resume_full_snapshot — T-10-01 mitigation
        // 1. Reset seq tracker so stale seq cannot cause another partial replay
        this.opts.seqTracker.reset();
        // 2. quick-task 260529-khy — rebind/swap onto the live socket AFTER the reset
        //    and BEFORE the full-refresh + chip-unmount callbacks.
        this.opts.onReconnected?.(ws);
        // 3. Notify caller to re-fetch via REST BEFORE any further envelope processing
        this.opts.onFullRefreshRequired();
        // 4. Also unmount the chip (connection is live, just needs full refresh)
        this.opts.onChipUnmount();
      }
    };

    ws.addEventListener('message', onMessage as EventListener);
  }
}
