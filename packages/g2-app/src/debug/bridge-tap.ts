/**
 * Bridge tap — a transparent proxy around the Even Hub bridge used in debug/demo mode:
 *
 * - **display mirror**: last content of every text container (create/rebuild/upgrade),
 *   exposed by `window.__evf.state().display` (replaces the old bridge display mirror);
 * - **input injection**: synthesises R1/touchpad events (`__evf.dispatch`, demo scripts)
 *   delivered through the same `onEvenHubEvent` path as real gestures;
 * - **leases**: each HUD instance gets its own view; a retired lease becomes inert, and a
 *   second `createStartUpPageContainer` (demo tour restarting the HUD) is turned into
 *   `rebuildPageContainer` — the SDK allows the start-up page only once;
 * - **activity tracking**: `whenIdle()` resolves once no bridge call ran for a while
 *   (the demo emits its `EVF_SCENE` marker after the scene settled).
 *
 * @see hub.evenrealities.com/docs/guides/device-apis (page lifecycle: create once, then rebuild)
 */
import {
  type CreateStartUpPageContainer,
  type EvenAppBridge,
  type EvenHubEvent,
  EventSourceType,
  ImageRawDataUpdateResult,
  MenuItemClickEvent,
  OsEventTypeList,
  RebuildPageContainer,
  StartUpPageCreateResult,
  Sys_ItemEvent,
  Text_ItemEvent,
  type TextContainerProperty,
} from '@evenrealities/even_hub_sdk';

/** Gesture accepted by {@link BridgeTap.inject} / `window.__evf.dispatch`. */
export type TapGesture = 'tap' | 'double' | 'up' | 'down' | { menu: number };

/** Timer surface (injectable for tests). */
export interface TapTimers {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
}

/** One HUD's view of the bridge. */
export interface BridgeLease {
  bridge: EvenAppBridge;
  /** Resolves with the outcome of this lease's first page placement. */
  placed: Promise<boolean>;
  /** Unsubscribes this lease's listeners; later calls become no-ops. */
  retire(): void;
}

export interface BridgeTap {
  lease(): BridgeLease;
  /** Delivers a synthetic gesture to every live lease listener. */
  inject(gesture: TapGesture): void;
  /** Text container name → last content pushed to the glasses. */
  mirror(): Record<string, string>;
  /** Resolves after `quietMs` without bridge activity (or after `maxMs`). */
  whenIdle(quietMs: number, maxMs?: number): Promise<void>;
  /** Removes the real-bridge subscription. */
  dispose(): void;
}

export interface TapOptions {
  timers: TapTimers;
  /**
   * Sees every real event first; returning `true` swallows it (demo tour: a real
   * double-press advances the tour instead of reaching the HUD).
   */
  intercept?: (event: EvenHubEvent) => boolean;
}

/** Maps a gesture to the Even Hub event shape the HUD decodes (`hud/input/events.ts`). */
export function gestureEvent(gesture: TapGesture): EvenHubEvent {
  if (typeof gesture === 'object') {
    return { menuItemClickEvent: new MenuItemClickEvent({ itemID: gesture.menu }) };
  }
  switch (gesture) {
    case 'tap':
      // A real press carries its touch source (the HUD ignores source-less clicks).
      return {
        sysEvent: new Sys_ItemEvent({
          eventType: OsEventTypeList.CLICK_EVENT,
          eventSource: EventSourceType.TOUCH_EVENT_FROM_RING,
        }),
      };
    case 'double':
      return { sysEvent: new Sys_ItemEvent({ eventType: OsEventTypeList.DOUBLE_CLICK_EVENT }) };
    case 'up':
      return { textEvent: new Text_ItemEvent({ eventType: OsEventTypeList.SCROLL_TOP_EVENT }) };
    case 'down':
      return { textEvent: new Text_ItemEvent({ eventType: OsEventTypeList.SCROLL_BOTTOM_EVENT }) };
  }
}

/** True for a (real) double-press event. */
export function isDoublePress(event: EvenHubEvent): boolean {
  return event.sysEvent?.eventType === OsEventTypeList.DOUBLE_CLICK_EVENT;
}

type Listener = (event: EvenHubEvent) => void;

/**
 * Wraps `bridge`. The tap subscribes to the real bridge once and fans events out to the
 * live leases.
 */
export function tapBridge(bridge: EvenAppBridge, options: TapOptions): BridgeTap {
  const { timers } = options;
  const listeners = new Set<Listener>();
  const display = new Map<string, string>();
  let pageCreated = false;
  /** Serialises start-up page creation so a restarted HUD never races the first one. */
  let createChain: Promise<unknown> = Promise.resolve();
  let inflight = 0;
  let lastActivity = timers.now();

  const fanOut = (event: EvenHubEvent): void => {
    for (const l of [...listeners]) l(event);
  };
  const offReal = bridge.onEvenHubEvent((event) => {
    if (options.intercept?.(event) === true) return;
    fanOut(event);
  });

  function track<T>(call: () => Promise<T>): Promise<T> {
    inflight += 1;
    lastActivity = timers.now();
    const done = (): void => {
      inflight -= 1;
      lastActivity = timers.now();
    };
    return call().then(
      (value) => {
        done();
        return value;
      },
      (error: unknown) => {
        done();
        throw error;
      },
    );
  }

  function mirrorPage(texts: readonly TextContainerProperty[] | undefined): void {
    display.clear();
    for (const t of texts ?? []) {
      if (t.containerName !== undefined) display.set(t.containerName, t.content ?? '');
    }
  }

  function lease(): BridgeLease {
    let live = true;
    const own = new Set<Listener>();
    let resolvePlaced: (ok: boolean) => void = () => {};
    const placed = new Promise<boolean>((resolve) => {
      resolvePlaced = resolve;
    });

    const createPage = (c: CreateStartUpPageContainer): Promise<StartUpPageCreateResult> => {
      const run = async (): Promise<StartUpPageCreateResult> => {
        if (!live) return StartUpPageCreateResult.success;
        if (pageCreated) {
          const ok = await track(() => bridge.rebuildPageContainer(new RebuildPageContainer(c)));
          if (ok) mirrorPage(c.textObject);
          resolvePlaced(ok);
          return ok ? StartUpPageCreateResult.success : StartUpPageCreateResult.invalid;
        }
        const res = await track(() => bridge.createStartUpPageContainer(c));
        const ok = res === StartUpPageCreateResult.success;
        if (ok) {
          pageCreated = true;
          mirrorPage(c.textObject);
        }
        resolvePlaced(ok);
        return res;
      };
      const next = createChain.then(run, run);
      createChain = next.catch(() => undefined);
      return next;
    };

    const overrides: Partial<EvenAppBridge> = {
      onEvenHubEvent(callback: Listener) {
        if (!live) return () => {};
        listeners.add(callback);
        own.add(callback);
        return () => {
          listeners.delete(callback);
          own.delete(callback);
        };
      },
      createStartUpPageContainer: createPage,
      async rebuildPageContainer(c) {
        if (!live) return true;
        const ok = await track(() => bridge.rebuildPageContainer(c));
        if (ok) mirrorPage(c.textObject);
        resolvePlaced(ok);
        return ok;
      },
      async textContainerUpgrade(c) {
        if (!live) return false;
        const ok = await track(() => bridge.textContainerUpgrade(c));
        if (ok && c.containerName !== undefined) display.set(c.containerName, c.content ?? '');
        return ok;
      },
      async updateImageRawData(c) {
        if (!live) return ImageRawDataUpdateResult.success;
        return track(() => bridge.updateImageRawData(c));
      },
      async shutDownPageContainer(exitMode) {
        if (!live) return true;
        return track(() => bridge.shutDownPageContainer(exitMode));
      },
    };

    const proxy = new Proxy(bridge, {
      get(target, prop, receiver) {
        if (Object.hasOwn(overrides, prop)) return Reflect.get(overrides, prop);
        const value: unknown = Reflect.get(target, prop, receiver);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });

    return {
      bridge: proxy,
      placed,
      retire() {
        live = false;
        for (const l of own) listeners.delete(l);
        own.clear();
        resolvePlaced(false);
      },
    };
  }

  return {
    lease,
    inject: (gesture) => fanOut(gestureEvent(gesture)),
    mirror: () => Object.fromEntries(display),
    whenIdle(quietMs, maxMs = 5000) {
      const deadline = timers.now() + maxMs;
      return new Promise<void>((resolve) => {
        const check = (): void => {
          const now = timers.now();
          if ((inflight === 0 && now - lastActivity >= quietMs) || now >= deadline) {
            resolve();
            return;
          }
          timers.setTimeout(check, 50);
        };
        check();
      });
    },
    dispose() {
      offReal();
      listeners.clear();
    },
  };
}
