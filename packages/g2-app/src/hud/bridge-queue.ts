/**
 * Serialises every HUD → glasses bridge call (page, text, image, shutdown).
 *
 * Even Hub guidance: concurrent render calls over the shared BLE link can drop the
 * connection, and a flaky hop can hang a call for ~30 s — each call therefore runs
 * alone and is capped by a timeout (the queue keeps moving after a timeout; the
 * caller receives the rejection and decides how to degrade).
 *
 * @see https://hub.evenrealities.com/docs/build/display (fetched 2026-09-23)
 */

export const BRIDGE_CALL_TIMEOUT_MS = 5000;

export interface BridgeQueue {
  /** Runs `call` after every previously queued call settled. */
  run<T>(call: () => Promise<T>): Promise<T>;
}

export function createBridgeQueue(timeoutMs = BRIDGE_CALL_TIMEOUT_MS): BridgeQueue {
  let tail: Promise<unknown> = Promise.resolve();
  return {
    run<T>(call: () => Promise<T>): Promise<T> {
      const result = tail.then(
        () =>
          new Promise<T>((resolve, reject) => {
            const timer = setTimeout(
              () => reject(new Error(`bridge call timed out after ${timeoutMs} ms`)),
              timeoutMs,
            );
            call().then(
              (v) => {
                clearTimeout(timer);
                resolve(v);
              },
              (e: unknown) => {
                clearTimeout(timer);
                reject(e);
              },
            );
          }),
      );
      tail = result.catch(() => undefined);
      return result;
    },
  };
}
