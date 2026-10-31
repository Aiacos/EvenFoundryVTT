/**
 * Serialises every HUD → glasses bridge call (page, text, image, shutdown).
 *
 * Even Hub guidance: concurrent render calls over the shared BLE link can drop the
 * connection ("Serialize all bridge calls"), and a flaky hop can hang a call for ~30 s
 * ("Add a per-call timeout to BLE calls"). Each call therefore runs alone: its caller is
 * rejected after {@link BRIDGE_CALL_TIMEOUT_MS} (and decides how to degrade), but the
 * queue stays blocked until the underlying call really settles — a timed-out call may
 * still be on the wire — or, for a call that never settles, until
 * {@link BRIDGE_CALL_HARD_CAP_MS}, so the HUD cannot stay dark forever.
 *
 * @see https://hub.evenrealities.com/docs/build/display (fetched 2026-09-23)
 * @see everything-evenhub:glasses-ui skill, «Best Practices» (serialise, per-call timeout)
 */

/** The caller of a bridge call is rejected after this long. */
export const BRIDGE_CALL_TIMEOUT_MS = 5000;
/** The queue moves on after this long even if a call never settles (≈ the ~30 s BLE hang). */
export const BRIDGE_CALL_HARD_CAP_MS = 30_000;

export interface BridgeQueue {
  /** Runs `call` after every previously queued call settled (or hit the hard cap). */
  run<T>(call: () => Promise<T>): Promise<T>;
}

/** Resolves when `p` settles or after `ms`, whichever comes first; never rejects. */
function settledOrCap(p: Promise<unknown>, ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    const done = () => {
      clearTimeout(timer);
      resolve();
    };
    p.then(done, done);
  });
}

/** Rejects after `ms` unless `p` settles first (the call itself keeps running). */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`bridge call timed out after ${ms} ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/**
 * @param timeoutMs - Caller-side timeout of one call.
 * @param hardCapMs - Longest a never-settling call may block the queue.
 */
export function createBridgeQueue(
  timeoutMs = BRIDGE_CALL_TIMEOUT_MS,
  hardCapMs = BRIDGE_CALL_HARD_CAP_MS,
): BridgeQueue {
  let tail: Promise<void> = Promise.resolve();
  return {
    run<T>(call: () => Promise<T>): Promise<T> {
      let release: () => void = () => undefined;
      const done = new Promise<void>((r) => {
        release = r;
      });
      const result = tail.then(() => {
        // `Promise.resolve().then` turns a synchronous throw into a rejection.
        const pending = Promise.resolve().then(call);
        void settledOrCap(pending, hardCapMs).then(release);
        return withTimeout(pending, timeoutMs);
      });
      tail = done;
      return result;
    },
  };
}
