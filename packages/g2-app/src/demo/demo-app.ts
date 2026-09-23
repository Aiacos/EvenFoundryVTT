/**
 * Demo mode boot (`?demo=<scenario>|tour`): the real phone page and the real glasses HUD
 * fed by scripted fixtures and a fake transport — never contacts Foundry (P5: every
 * feature observable and drivable without glasses or a server).
 *
 * Tour: every scenario in turn. Each step restarts the HUD on a fresh store state (the
 * bridge tap turns the second start-up page into a rebuild), replays its gestures, waits
 * for the bridge to settle, then logs `EVF_SCENE <i>/<n> <name> <layout>`. A real
 * double-press — or `?dwell=<ms>` — advances; single scenarios forward every gesture
 * to the HUD so the full input state machine can be exercised.
 *
 * @see scripts/sim-check.ts (simulator loop consuming the markers)
 */
import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';
import { type BridgeLease, type BridgeTap, isDoublePress, tapBridge } from '../debug/bridge-tap.js';
import { emitMarker } from '../debug/capture.js';
import type { DebugLog } from '../debug/debug-log.js';
import type { HudOptions } from '../hud/index.js';
import { mountPhonePage } from '../phone/phone-page.js';
import { type AppActions, type AppStore, createAppStore } from '../state/app-store.js';
import { createDemoTransport, type DemoTimers } from './demo-actions.js';
import { demoDecoder } from './portrait-art.js';
import { buildScenario, playlist, type ScenarioName } from './scenarios.js';

/** Bridge quiet time before a scene counts as rendered. */
export const SCENE_SETTLE_MS = 600;

export interface DemoEnvironment {
  root: HTMLElement;
  /** Raw `?demo=` value. */
  request: string;
  /** Tour auto-advance, or `null` for manual (double-press). */
  dwellMs: number | null;
  log: DebugLog;
  deviceLanguage: () => string;
  getBridge: () => Promise<EvenAppBridge | null>;
  /** HUD entry point (`startHud`); the demo injects its portrait decoder. */
  startHud: (
    bridge: EvenAppBridge,
    store: AppStore,
    actions: AppActions,
    options: HudOptions,
  ) => () => void;
  timers: DemoTimers;
}

export interface DemoHandle {
  store: AppStore;
  /** Bridge tap, or `null` in a plain browser (phone page only). */
  tap: BridgeTap | null;
  /** Scenario currently shown. */
  current(): ScenarioName;
  /** Resolves once the first scenario settled (immediately without a bridge). */
  settled: Promise<void>;
  /** Shows the next playlist entry (wraps around); resolves once it settled. */
  next(): Promise<void>;
  stop(): void;
}

/** Layout reported in the scene marker, derived from the text containers on the glasses. */
export function layoutOf(display: Record<string, string>): 'full' | 'sheet' {
  return 'ctx-body' in display ? 'sheet' : 'full';
}

/**
 * Boots the demo.
 *
 * @returns Handle, as soon as the bridge lookup finished (`settled` tracks the first
 *   scene).
 */
export async function startDemo(env: DemoEnvironment): Promise<DemoHandle> {
  const { log, timers } = env;
  const { names, valid } = playlist(env.request);
  if (!valid) log.push('warn', 'demo', `unknown scenario "${env.request}" — playing the tour`);
  const tour = names.length > 1;

  const store = createAppStore();
  const transport = createDemoTransport({
    store,
    log,
    timers,
    deviceLanguage: env.deviceLanguage,
  });
  let index = 0;
  const head = names[0];
  if (head === undefined) throw new Error('demo: empty playlist');
  const first: ScenarioName = head;
  let current = first;
  store.update(buildScenario(first, timers.now()).initial);
  const unmountPhone = mountPhonePage(env.root, store, transport, log);

  const bridge = await env.getBridge();
  if (bridge === null) {
    log.push('info', 'demo', 'no Even App bridge — phone page only');
    return {
      store,
      tap: null,
      current: () => current,
      settled: Promise.resolve(),
      next: async () => {},
      stop: unmountPhone,
    };
  }

  let step = 0;
  let lease: BridgeLease | null = null;
  let stopHud = (): void => {};
  let ready = false;

  const tap = tapBridge(bridge, {
    timers,
    intercept: (event) => {
      if (!tour || !isDoublePress(event)) return false;
      void show(index + 1);
      return true;
    },
  });

  async function show(i: number): Promise<void> {
    step += 1;
    const mine = step;
    index = i % names.length;
    const name = names[index] ?? first;
    current = name;
    stopHud();
    lease?.retire();
    const scenario = buildScenario(name, timers.now());
    log.push('info', 'demo', `scene ${index + 1}/${names.length} ${name} (${scenario.mock})`);
    store.update(scenario.initial);
    const own = tap.lease();
    lease = own;
    stopHud = env.startHud(own.bridge, store, transport, { decoder: demoDecoder });
    store.update(scenario.patch);
    for (const g of scenario.gestures) tap.inject(g);

    const placed = await own.placed;
    await tap.whenIdle(SCENE_SETTLE_MS);
    if (mine !== step) return;
    if (scenario.after !== null) {
      store.update(scenario.after);
      await tap.whenIdle(SCENE_SETTLE_MS);
      if (mine !== step) return;
    }
    if (!placed) log.push('warn', 'demo', `scene ${name}: page placement failed`);
    emitMarker(log, 'EVF_SCENE', `${index + 1}/${names.length} ${name} ${layoutOf(tap.mirror())}`);
    if (!ready) {
      ready = true;
      emitMarker(log, 'EVF_READY');
    }
    if (tour && env.dwellMs !== null) {
      timers.setTimeout(() => {
        if (mine === step) void show(index + 1);
      }, env.dwellMs);
    }
  }

  return {
    store,
    tap,
    current: () => current,
    settled: show(0),
    next: () => show(index + 1),
    stop() {
      step += 1;
      stopHud();
      lease?.retire();
      tap.dispose();
      unmountPhone();
    },
  };
}
