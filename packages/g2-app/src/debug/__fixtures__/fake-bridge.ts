/**
 * Recording fake of the Even Hub bridge surface used by the HUD, for the debug/demo
 * tests (bridge tap, demo boot).
 */
import type { EvenAppBridge, EvenHubEvent } from '@evenrealities/even_hub_sdk';

export interface FakeCall {
  method: string;
  arg: unknown;
}

/** Fake bridge: every call is recorded and resolves with `results[method]`. */
export function fakeBridge() {
  const calls: FakeCall[] = [];
  const listeners = new Set<(e: EvenHubEvent) => void>();
  const results: Record<string, unknown> = {
    create: 0,
    rebuild: true,
    text: true,
    image: 'success',
    shutdown: true,
  };
  const rec =
    (method: string) =>
    async (arg: unknown): Promise<unknown> => {
      calls.push({ method, arg });
      const r = results[method];
      if (r instanceof Error) throw r;
      return r;
    };
  const bridge = {
    createStartUpPageContainer: rec('create'),
    rebuildPageContainer: rec('rebuild'),
    textContainerUpgrade: rec('text'),
    updateImageRawData: rec('image'),
    shutDownPageContainer: rec('shutdown'),
    getDeviceInfo: async () => ({ model: 'fake' }),
    onEvenHubEvent: (cb: (e: EvenHubEvent) => void) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
  return {
    bridge: bridge as unknown as EvenAppBridge,
    calls,
    results,
    /** Emits a real (host) event. */
    emit: (e: EvenHubEvent) => {
      for (const l of [...listeners]) l(e);
    },
    listenerCount: () => listeners.size,
    of: (method: string) => calls.filter((c) => c.method === method),
  };
}
