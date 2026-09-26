/**
 * Fake transport for the demo: implements {@link AppActions} (HUD) and the phone page
 * session surface with plausible, deterministic behaviour and no network at all.
 *
 * - `invoke` acknowledges after {@link DEMO_TIMING.ack} and, for a tool known to the
 *   protocol, publishes an `r1.action.result`-shaped `lastResult` after
 *   {@link DEMO_TIMING.result} — the same two-step flow as the GM projector (S6).
 * - `reconnect` walks `connecting → online`; `disconnect` / `forget` mirror P02.
 *
 * Every call is recorded in the debug log (`source: 'demo'`).
 */
import { type ActionResultPayload, TOOL_ID_SCHEMA } from '@evf/shared-protocol';
import type { DebugLog } from '../debug/debug-log.js';
import type { SessionInfo } from '../direct/session.js';
import type { PhoneSession } from '../phone/phone-page.js';
import {
  type AppActions,
  type AppSettings,
  type AppStore,
  type InvokeResult,
  resolveLocale,
} from '../state/app-store.js';

/** Fake latencies (ms). */
export const DEMO_TIMING = {
  /** Invoke acknowledgement from the "projector". */
  ack: 250,
  /** Roll result after the acknowledgement. */
  result: 400,
  /** `connecting → online` after a reconnect. */
  reconnect: 1200,
} as const;

/** Timer surface (injectable for tests). */
export interface DemoTimers {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
}

/** Fake transport = HUD actions + phone session. */
export type DemoTransport = AppActions & PhoneSession;

/**
 * Deterministic d20 for a tool (stable across runs so screenshots are comparable);
 * `weapon-attack` rolls 15, a hit like the design's S6.
 */
function d20For(tool: string): number {
  let h = 0;
  for (const ch of tool) h = (h * 31 + ch.charCodeAt(0)) % 997;
  return 20 - (h % 20);
}

/**
 * Builds the `lastResult` a projector would relay for `tool`, or `null` when the tool
 * id is not part of the protocol (no result card is sent for it).
 */
export function demoResult(tool: string, seq: number): ActionResultPayload | null {
  const parsed = TOOL_ID_SCHEMA.safeParse(tool);
  if (!parsed.success) return null;
  const d20 = d20For(tool);
  return {
    idempotencyKey: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
    toolId: parsed.data,
    d20,
    outcome: d20 >= 10 ? 'hit' : 'miss',
    ...(d20 >= 10 ? { damage: '9' } : {}),
    status: 'success',
    recipientUserId: 'demo-user',
  };
}

/**
 * Creates the fake transport bound to `store`.
 *
 * @param deps.deviceLanguage - Phone language (locale resolution, like the real session).
 */
export function createDemoTransport(deps: {
  store: AppStore;
  log: DebugLog;
  timers: DemoTimers;
  deviceLanguage: () => string;
}): DemoTransport {
  const { store, log, timers } = deps;
  let seq = 0;
  const info = (): SessionInfo => ({
    latencyMs: 42,
    moduleVersion: 'demo',
    diagnostics: [],
  });

  const goOnline = (): void => {
    store.update((s) => ({
      connection: { ...s.connection, status: 'online', lastSyncAt: timers.now() },
    }));
  };

  return {
    invoke(tool: string, input: unknown): Promise<InvokeResult> {
      seq += 1;
      const n = seq;
      log.push('info', 'demo', `invoke ${tool}`, input);
      return new Promise<InvokeResult>((resolve) => {
        timers.setTimeout(() => {
          resolve({ ok: true, data: { demo: true } });
          const result = demoResult(tool, n);
          if (result === null) return;
          // Like the projector: the result card, and the action spent in the economy (S6).
          timers.setTimeout(
            () =>
              store.update((st) => ({
                lastResult: result,
                ...(st.actionEconomy
                  ? { actionEconomy: { ...st.actionEconomy, actionsUsed: 1 } }
                  : {}),
              })),
            DEMO_TIMING.result,
          );
        }, DEMO_TIMING.ack);
      });
    },
    refresh(topic) {
      log.push('debug', 'demo', `refresh ${topic}`);
    },
    reconnect() {
      log.push('info', 'demo', 'reconnect');
      store.update((s) => ({ connection: { ...s.connection, status: 'connecting' } }));
      timers.setTimeout(goOnline, DEMO_TIMING.reconnect);
    },
    disconnect() {
      log.push('info', 'demo', 'disconnect');
      store.update((s) => ({ connection: { ...s.connection, status: 'offline' } }));
    },
    async forget() {
      log.push('info', 'demo', 'forget pairing');
      store.update({ connection: { status: 'unpaired' } });
    },
    async pairCode(code: string) {
      log.push('info', 'demo', `pair code ${code}`);
      store.update({ connection: { status: 'connecting', server: 'demo', userName: 'Demo' } });
      timers.setTimeout(goOnline, DEMO_TIMING.reconnect);
    },
    async pairScanned(text: string) {
      log.push('info', 'demo', `pair scanned ${text.slice(0, 32)}`);
      store.update({ connection: { status: 'connecting', server: 'demo', userName: 'Demo' } });
      timers.setTimeout(goOnline, DEMO_TIMING.reconnect);
    },
    updateSettings(patch: Partial<AppSettings>) {
      log.push('info', 'demo', 'settings', patch);
      store.update((s) => ({ settings: { ...s.settings, ...patch } }));
    },
    locale: () => resolveLocale(store.get(), deps.deviceLanguage()),
    info,
    // Session facts are static in the demo: nothing to notify.
    subscribeInfo: () => () => {},
  };
}
