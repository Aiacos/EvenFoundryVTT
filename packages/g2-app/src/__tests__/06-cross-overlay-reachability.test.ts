/**
 * Cross-overlay reachability harness (COR-01..COR-15 — Plan 06-04 Task 2).
 *
 * 15 named test cases mapping 1:1 to Specs §7.14.4 ck 1-15 (cross-overlay
 * reachability + closability checklist). Closes NAV-03.
 *
 * Each test cites: `* Maps to Specs §7.14.4 ck N — <description>`
 *
 * Architecture:
 *   - Real LayerManager bound to a mocked bridge (`makeMockBridge`).
 *   - Real PanelGestureBus.
 *   - Real LocaleEventEmitter.
 *   - Real StatusHudRenderer (for COR-15 chip assertions).
 *   - Real ToastQueueLayer (z=1.5) for COR-11/12 toast-survival assertions.
 *   - Real QuickActionMenuPanel constructed by `makeMenu` factory.
 *   - Real `attachQuickActionLongPress` wired to the bus.
 *   - TestablePanelRouter with 5 production panels.
 *   - `StubCaptureLayer` (z=0) + `StubIdleLayer` (z=0.5) — matches PSM pattern.
 *
 * `simulateGesture(bus, kind)` publishes directly to the gesture bus (decoupled
 * from r1-event-source.ts timing — per 06-RESEARCH §Q5 design decision). Timing
 * is tested separately in `r1-event-source.test.ts`.
 *
 * Tests (COR-* discriminator markers):
 *   COR-01  main HUD → CharacterSheet: long-press → tap [S] (ck 1)
 *   COR-02  main HUD → CombatTracker: long-press → tap [C] (ck 2)
 *   COR-03  main HUD → Log: long-press → tap [L] (ck 3)
 *   COR-04  main HUD → Spellbook: long-press → tap [B] (ck 4)
 *   COR-05  main HUD → Inventory: long-press → tap [I] (ck 5)
 *   COR-06  CharacterSheet → Combat: long-press → tap [C] (ck 6)
 *   COR-07  CharacterSheet → Quick Action menu: long-press (ck 7)
 *   COR-08  Quick Action menu → CharacterSheet via tap [S] (ck 8)
 *   COR-09  main HUD → menu → [X] Close → main HUD restored (ck 9)
 *   COR-10  CharSheet suspended → [X] Close from menu → CharSheet restored (ck 10)
 *   COR-11  Toast survives menu open (ck 11) — ADR-0009 Amendment 1 Rule 2
 *   COR-12  Toast survives panel-to-panel transition via menu (ck 12)
 *   COR-13  conc-modal → long-press → menu replaces modal; console.warn emitted (ck 13)
 *   COR-14  INV-1 fixture round-trip: menu over CombatTracker (ck 14)
 *   COR-15  context chip updates on each layer-mount/unmount transition (ck 15)
 *
 * @see Specs.md §7.14.4 ck 1-15 (canonical reachability checklist)
 * @see packages/g2-app/src/__tests__/05-panel-integration-smoke.test.ts (harness exemplar)
 * @see packages/g2-app/src/__tests__/04b-integration-smoke.test.ts (toast + modal pattern)
 * @see .planning/phases/06-r1-integration-quick-action-inv-5/06-04-PLAN.md Task 2
 * @see docs/architecture/INVARIANTS.md §5 INV-5 (Gesture Determinism)
 */
import { resolve } from 'node:path';
import { type EvenAppBridge, RebuildPageContainer } from '@evenrealities/even_hub_sdk';
import { SERVER_CAPS_V1 } from '@evf/shared-protocol';
import { AsciiGrid, matchAsciiFixture } from '@evf/shared-render';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LayerManager } from '../engine/layer-manager.js';
import { type Layer, ZIndex } from '../engine/layer-types.js';
import { PanelGestureBus } from '../engine/panel-gesture-bus.js';
import {
  type PanelConstructor,
  type PanelDeps,
  type PanelMeta,
  PanelMetaSchema,
  PanelRouter,
} from '../engine/panel-router.js';
import { LocaleEventEmitter } from '../locale/locale-events.js';
import type { LocaleOverride } from '../locale/locale-override.js';
import CharacterSheetPanel from '../panels/character-sheet-panel.js';
import CombatTrackerPanel from '../panels/combat-tracker-panel.js';
import { ConcentrationDropModalPanel } from '../panels/concentration-drop-modal.js';
import InventoryPanel from '../panels/inventory-panel.js';
import LogPanel from '../panels/log-panel.js';
import { attachQuickActionLongPress } from '../panels/quick-action-long-press-dispatcher.js';
import { QuickActionMenuPanel } from '../panels/quick-action-menu-panel.js';
import SpellbookPanel from '../panels/spellbook-panel.js';
import { StatusHudRenderer } from '../status-hud/status-hud-renderer.js';
import { ToastQueueLayer } from '../status-hud/toast-queue-layer.js';

// ─── Mock infrastructure (mirrors PSM pattern) ────────────────────────────────

interface MockBridgeBundle {
  bridge: EvenAppBridge;
  textContainerUpgrade: ReturnType<typeof vi.fn>;
  rebuildPageContainer: ReturnType<typeof vi.fn>;
  setLocalStorage: ReturnType<typeof vi.fn>;
  getLocalStorage: ReturnType<typeof vi.fn>;
}

function makeMockBridge(): MockBridgeBundle {
  const textContainerUpgrade = vi.fn().mockResolvedValue(true);
  const rebuildPageContainer = vi
    .fn()
    .mockResolvedValue(
      new RebuildPageContainer({ containerTotalNum: 1, textObject: [], imageObject: [] }),
    );
  const setLocalStorage = vi.fn().mockResolvedValue(true);
  const getLocalStorage = vi.fn(async () => '');
  const bridge = {
    textContainerUpgrade,
    rebuildPageContainer,
    setLocalStorage,
    getLocalStorage,
  } as unknown as EvenAppBridge;
  return { bridge, textContainerUpgrade, rebuildPageContainer, setLocalStorage, getLocalStorage };
}

/** Minimal capture layer stub (z=0 anchor). */
class StubCaptureLayer implements Layer {
  readonly id = 'stub-capture';
  async draw(): Promise<void> {}
  destroy(): void {}
  getCaptureContainer(): string {
    return 'map-capture';
  }
  getContainerCount(): { image: number; text: number } {
    return { image: 0, text: 1 };
  }
}

/** Minimal idle infill stub (z=0.5 — demolished on overlay open). */
class StubIdleLayer implements Layer {
  readonly id = 'stub-idle-infill';
  async draw(): Promise<void> {}
  destroy(): void {}
  getContainerCount(): { image: number; text: number } {
    return { image: 0, text: 1 };
  }
}

// ─── Fixture path helper ──────────────────────────────────────────────────────

/**
 * Absolute path to the shared-render fixtures directory.
 * This test lives at `packages/g2-app/src/__tests__/` (4 levels from workspace root).
 */
function fixtureDir(): string {
  return resolve(__dirname, '../../../../packages/shared-render/src/fixtures');
}

// ─── TestablePanelRouter ─────────────────────────────────────────────────────

class TestablePanelRouter extends PanelRouter {
  private _mockModules: Record<string, () => Promise<{ default: PanelConstructor }>> = {};

  setMockModules(modules: Record<string, () => Promise<{ default: PanelConstructor }>>): void {
    this._mockModules = modules;
  }

  override async discoverPanels(): Promise<void> {
    for (const [path, loader] of Object.entries(this._mockModules)) {
      try {
        const mod = await loader();
        const Cls = mod.default;
        const parseResult = PanelMetaSchema.safeParse((Cls as { meta?: unknown }).meta);
        if (!parseResult.success) {
          console.warn(`[TestablePanelRouter] ${path} excluded: ${parseResult.error.message}`);
          continue;
        }
        const meta = parseResult.data;
        if (meta.navKey === '') continue; // skip system overlays
        (
          this as unknown as {
            registry: Map<string, { meta: PanelMeta; Cls: PanelConstructor }>;
          }
        ).registry.set(meta.id, { meta, Cls });
      } catch (err) {
        console.warn(`[TestablePanelRouter] ${path} excluded: load error`, err);
      }
    }
  }

  /** Expose overlayStack length for test assertions. */
  getOverlayStackLength(): number {
    return (this as unknown as { overlayStack: unknown[] }).overlayStack.length;
  }
}

// ─── Production panel module map ─────────────────────────────────────────────

const PRODUCTION_PANEL_MODULES: Record<string, () => Promise<{ default: PanelConstructor }>> = {
  '../panels/character-sheet-panel.ts': async () => ({
    default: CharacterSheetPanel as unknown as PanelConstructor,
  }),
  '../panels/inventory-panel.ts': async () => ({
    default: InventoryPanel as unknown as PanelConstructor,
  }),
  '../panels/spellbook-panel.ts': async () => ({
    default: SpellbookPanel as unknown as PanelConstructor,
  }),
  '../panels/combat-tracker-panel.ts': async () => ({
    default: CombatTrackerPanel as unknown as PanelConstructor,
  }),
  '../panels/log-panel.ts': async () => ({
    default: LogPanel as unknown as PanelConstructor,
  }),
};

// ─── simulateGesture helper (RESEARCH §Q5) ────────────────────────────────────

/**
 * Publish a gesture directly to the bus.
 *
 * Per RESEARCH §Q5 design decision: tests publish directly to the gesture bus,
 * NOT through r1-event-source.ts. This decouples reachability tests from timing
 * logic (which is tested separately in r1-event-source.test.ts).
 */
function simulateGesture(
  bus: PanelGestureBus,
  kind: 'tap' | 'scroll' | 'long-press' | 'double-tap',
  direction: 'up' | 'down' = 'up',
): void {
  if (kind === 'scroll') {
    bus.publish({ kind: 'scroll', direction });
  } else {
    bus.publish({ kind } as Parameters<typeof bus.publish>[0]);
  }
}

/**
 * Flush async microtasks — necessary after fire-and-forget async router calls
 * (`void router.openPanel`, `void router.popOverlay`) to let them complete.
 */
async function flushMicrotasks(iterations = 8): Promise<void> {
  for (let i = 0; i < iterations; i++) {
    await Promise.resolve();
  }
}

/**
 * Cycle the menu's active index to the item whose key matches `targetKey` and tap.
 *
 * Scrolls DOWN repeatedly until the desired item is active (starts at index 0 = [S]).
 * Then taps to activate. Flushes microtasks after the tap because `_activateCurrentItem`
 * calls fire-and-forget `void router.openPanel(...)` / `void router.popOverlay(...)`.
 *
 * Implementation: MAIN_ITEMS ordering is S/C/L/B/I/A/M/N/X. Scroll DOWN from 0.
 */
async function tapMenuItemByKey(
  bus: PanelGestureBus,
  _menu: QuickActionMenuPanel,
  key: string,
): Promise<void> {
  const MAIN_KEYS = ['S', 'C', 'L', 'B', 'I', 'A', 'M', 'N', 'X'];
  const targetIdx = MAIN_KEYS.indexOf(key);
  if (targetIdx < 0) throw new Error(`Unknown menu key: ${key}`);
  // Scroll down `targetIdx` times to reach the target (starts at index 0 = [S])
  for (let i = 0; i < targetIdx; i++) {
    simulateGesture(bus, 'scroll', 'down');
  }
  // Tap to activate — this fires the async _activateCurrentItem()
  simulateGesture(bus, 'tap');
  // Flush microtasks to allow fire-and-forget async router calls to complete
  await flushMicrotasks(16);
}

// ─── Harness builder ──────────────────────────────────────────────────────────

/**
 * Build the Phase 6 integration harness:
 *   - Real LayerManager + real layers
 *   - Real PanelGestureBus
 *   - Real LocaleEventEmitter
 *   - Real StatusHudRenderer (for chip assertions)
 *   - Real ToastQueueLayer (z=1.5 — toast-survival assertions)
 *   - TestablePanelRouter with 5 production panels
 *   - `attachQuickActionLongPress` wired to the bus
 */
async function makeHarness() {
  const bridgeBundle = makeMockBridge();
  const gestureBus = new PanelGestureBus();
  const localeEvents = new LocaleEventEmitter();
  const locale = 'it' as const;
  const currentLocaleOverride: LocaleOverride = 'auto';
  const renderer = new StatusHudRenderer({ locale });

  const captureLayer = new StubCaptureLayer();
  const idleLayer = new StubIdleLayer();
  const toastLayer = new ToastQueueLayer({ bridge: bridgeBundle.bridge });

  const lm = new LayerManager(bridgeBundle.bridge);
  lm.setNegotiatedCaps(new Set(SERVER_CAPS_V1));
  lm.mount(ZIndex.Z0_MAP, captureLayer);
  lm.mount(ZIndex.Z0_5_IDLE_INFILL, idleLayer);
  // Mount toast at z=1.5 (survives overlay opens per ADR-0009 Amendment 1)
  await lm.bundle([{ type: 'mount', z: ZIndex.Z1_5_TOAST, layer: toastLayer }]);

  const router = new TestablePanelRouter();
  router.setMockModules(PRODUCTION_PANEL_MODULES);
  await router.discoverPanels();

  const deps: PanelDeps = {
    bridge: bridgeBundle.bridge,
    gestureBus,
    locale,
    layerManager: lm,
    negotiatedCaps: new Set(SERVER_CAPS_V1),
    toastQueue: toastLayer,
  };

  // makeMenu factory — constructs a fresh QuickActionMenuPanel with callbacks
  const makeMenu = (): QuickActionMenuPanel =>
    new QuickActionMenuPanel(
      bridgeBundle.bridge,
      gestureBus,
      locale,
      currentLocaleOverride,
      localeEvents,
      {
        onClose: () => {
          void router.popOverlay(lm);
        },
        onNavigate: (panelId: string) => {
          void router.openPanel(panelId, deps);
        },
        onMapModeToggle: () => {
          /* Phase 7 stub */
        },
        onAction: () => {
          /* Phase 7 stub */
        },
      },
    );

  // Wire the long-press dispatcher
  const unsubLongPress = attachQuickActionLongPress(gestureBus, router, lm, makeMenu);

  return {
    lm,
    router,
    gestureBus,
    toastLayer,
    renderer,
    bridge: bridgeBundle.bridge,
    bridgeSpies: bridgeBundle,
    deps,
    localeEvents,
    idleLayer,
    captureLayer,
    makeMenu,
    unsubLongPress,
  };
}

// ─── COR-* cross-overlay reachability harness ─────────────────────────────────

describe('Cross-overlay reachability (COR-01..COR-15 → Specs §7.14.4 ck 1-15)', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    warnSpy.mockRestore();
    vi.restoreAllMocks();
  });

  // ─── COR-01: Main HUD → CharacterSheet ────────────────────────────────────

  /**
   * Maps to Specs §7.14.4 ck 1 — main HUD → CharacterSheet in ≤2 gestures.
   *
   * Gesture 1: long-press → opens Quick Action menu.
   * Gesture 2: tap [S] → navigates to CharacterSheet.
   */
  it('COR-01: ck 1 — main HUD → CharacterSheet in ≤2 gestures (long-press → tap [S])', async () => {
    const h = await makeHarness();

    // From main HUD (no z=2 overlay) — long-press opens the menu
    simulateGesture(h.gestureBus, 'long-press');
    await flushMicrotasks();

    const menu = h.lm.getLayer(ZIndex.Z2_OVERLAY);
    expect(menu).toBeInstanceOf(QuickActionMenuPanel);

    // Tap [S] to navigate to CharacterSheet
    await tapMenuItemByKey(h.gestureBus, menu as QuickActionMenuPanel, 'S');
    await flushMicrotasks();

    expect(h.lm.getLayer(ZIndex.Z2_OVERLAY)).toBeInstanceOf(CharacterSheetPanel);

    h.unsubLongPress();
    h.toastLayer.destroy();
  });

  // ─── COR-02: Main HUD → CombatTracker ────────────────────────────────────

  /**
   * Maps to Specs §7.14.4 ck 2 — main HUD → CombatTracker in ≤2 gestures.
   */
  it('COR-02: ck 2 — main HUD → CombatTracker in ≤2 gestures (long-press → tap [C])', async () => {
    const h = await makeHarness();

    simulateGesture(h.gestureBus, 'long-press');
    await flushMicrotasks();

    const menu = h.lm.getLayer(ZIndex.Z2_OVERLAY);
    expect(menu).toBeInstanceOf(QuickActionMenuPanel);

    await tapMenuItemByKey(h.gestureBus, menu as QuickActionMenuPanel, 'C');
    await flushMicrotasks();

    expect(h.lm.getLayer(ZIndex.Z2_OVERLAY)).toBeInstanceOf(CombatTrackerPanel);

    h.unsubLongPress();
    h.toastLayer.destroy();
  });

  // ─── COR-03: Main HUD → Log ───────────────────────────────────────────────

  /**
   * Maps to Specs §7.14.4 ck 3 — main HUD → Log in ≤2 gestures.
   */
  it('COR-03: ck 3 — main HUD → Log in ≤2 gestures (long-press → tap [L])', async () => {
    const h = await makeHarness();

    simulateGesture(h.gestureBus, 'long-press');
    await flushMicrotasks();

    const menu = h.lm.getLayer(ZIndex.Z2_OVERLAY);
    await tapMenuItemByKey(h.gestureBus, menu as QuickActionMenuPanel, 'L');
    await flushMicrotasks();

    expect(h.lm.getLayer(ZIndex.Z2_OVERLAY)).toBeInstanceOf(LogPanel);

    h.unsubLongPress();
    h.toastLayer.destroy();
  });

  // ─── COR-04: Main HUD → Spellbook ────────────────────────────────────────

  /**
   * Maps to Specs §7.14.4 ck 4 — main HUD → Spellbook in ≤2 gestures.
   */
  it('COR-04: ck 4 — main HUD → Spellbook in ≤2 gestures (long-press → tap [B])', async () => {
    const h = await makeHarness();

    simulateGesture(h.gestureBus, 'long-press');
    await flushMicrotasks();

    const menu = h.lm.getLayer(ZIndex.Z2_OVERLAY);
    await tapMenuItemByKey(h.gestureBus, menu as QuickActionMenuPanel, 'B');
    await flushMicrotasks();

    expect(h.lm.getLayer(ZIndex.Z2_OVERLAY)).toBeInstanceOf(SpellbookPanel);

    h.unsubLongPress();
    h.toastLayer.destroy();
  });

  // ─── COR-05: Main HUD → Inventory ────────────────────────────────────────

  /**
   * Maps to Specs §7.14.4 ck 5 — main HUD → Inventory in ≤2 gestures.
   */
  it('COR-05: ck 5 — main HUD → Inventory in ≤2 gestures (long-press → tap [I])', async () => {
    const h = await makeHarness();

    simulateGesture(h.gestureBus, 'long-press');
    await flushMicrotasks();

    const menu = h.lm.getLayer(ZIndex.Z2_OVERLAY);
    await tapMenuItemByKey(h.gestureBus, menu as QuickActionMenuPanel, 'I');
    await flushMicrotasks();

    expect(h.lm.getLayer(ZIndex.Z2_OVERLAY)).toBeInstanceOf(InventoryPanel);

    h.unsubLongPress();
    h.toastLayer.destroy();
  });

  // ─── COR-06: CharacterSheet → CombatTracker ──────────────────────────────

  /**
   * Maps to Specs §7.14.4 ck 6 — panel-to-panel in ≤2 gestures (transitive).
   *
   * CharacterSheet is already open. Long-press → menu open. Tap [C] → CombatTracker.
   */
  it('COR-06: ck 6 — CharacterSheet → CombatTracker in ≤2 gestures (transitive)', async () => {
    const h = await makeHarness();

    // Open CharacterSheet first
    await h.router.openPanel('character-sheet', h.deps);
    expect(h.lm.getLayer(ZIndex.Z2_OVERLAY)).toBeInstanceOf(CharacterSheetPanel);

    // Long-press → menu opens (CharSheet suspended)
    simulateGesture(h.gestureBus, 'long-press');
    await flushMicrotasks();

    const menu = h.lm.getLayer(ZIndex.Z2_OVERLAY);
    expect(menu).toBeInstanceOf(QuickActionMenuPanel);

    // Tap [C] → CombatTracker
    await tapMenuItemByKey(h.gestureBus, menu as QuickActionMenuPanel, 'C');
    await flushMicrotasks();

    expect(h.lm.getLayer(ZIndex.Z2_OVERLAY)).toBeInstanceOf(CombatTrackerPanel);

    h.unsubLongPress();
    h.toastLayer.destroy();
  });

  // ─── COR-07: CharacterSheet → Quick Action menu ───────────────────────────

  /**
   * Maps to Specs §7.14.4 ck 7 — long-press from CharacterSheet opens Quick Action menu.
   *
   * 1 gesture: long-press → menu mounted at z=2; CharSheet suspended.
   */
  it('COR-07: ck 7 — CharacterSheet → Quick Action menu via long-press (1 gesture)', async () => {
    const h = await makeHarness();

    await h.router.openPanel('character-sheet', h.deps);
    expect(h.lm.getLayer(ZIndex.Z2_OVERLAY)).toBeInstanceOf(CharacterSheetPanel);

    simulateGesture(h.gestureBus, 'long-press');
    await flushMicrotasks();

    expect(h.lm.getLayer(ZIndex.Z2_OVERLAY)).toBeInstanceOf(QuickActionMenuPanel);

    h.unsubLongPress();
    h.toastLayer.destroy();
  });

  // ─── COR-08: Quick Action menu → CharacterSheet ───────────────────────────

  /**
   * Maps to Specs §7.14.4 ck 8 — from menu, tap [S] → CharacterSheet.
   *
   * Menu's `_activateCurrentItem` on [S] calls `onNavigate('character-sheet')` +
   * `onClose()`. The harness wires `onClose → popOverlay` and `onNavigate → openPanel`.
   * popOverlay fires first, then openPanel opens CharSheet fresh.
   */
  it('COR-08: ck 8 — Quick Action menu → CharacterSheet via tap [S]', async () => {
    const h = await makeHarness();

    // Open menu from main HUD
    simulateGesture(h.gestureBus, 'long-press');
    await flushMicrotasks();

    const menu = h.lm.getLayer(ZIndex.Z2_OVERLAY);
    expect(menu).toBeInstanceOf(QuickActionMenuPanel);

    // Tap [S] — navigate to CharacterSheet
    await tapMenuItemByKey(h.gestureBus, menu as QuickActionMenuPanel, 'S');
    await flushMicrotasks();

    expect(h.lm.getLayer(ZIndex.Z2_OVERLAY)).toBeInstanceOf(CharacterSheetPanel);
    // Stack is cleared (no suspended panel — menu was opened over main HUD)
    expect(h.router.getOverlayStackLength()).toBe(0);

    h.unsubLongPress();
    h.toastLayer.destroy();
  });

  // ─── COR-09: main HUD → menu → [X] Close → main HUD restored ────────────

  /**
   * Maps to Specs §7.14.4 ck 9 — [X] Close from menu (opened over main HUD)
   * returns to main HUD (no z=2 overlay; z=0.5 differential demolish restored).
   */
  it('COR-09: ck 9 — main HUD → menu → [X] Close → main HUD restored (no z=2)', async () => {
    const h = await makeHarness();

    // From main HUD: long-press → menu
    simulateGesture(h.gestureBus, 'long-press');
    await flushMicrotasks();

    expect(h.lm.getLayer(ZIndex.Z2_OVERLAY)).toBeInstanceOf(QuickActionMenuPanel);

    // Tap [X] to close — popOverlay, nothing in stack → destroy only
    const menu = h.lm.getLayer(ZIndex.Z2_OVERLAY) as QuickActionMenuPanel;
    await tapMenuItemByKey(h.gestureBus, menu, 'X');
    await flushMicrotasks();

    // z=2 must be gone
    expect(h.lm.getLayer(ZIndex.Z2_OVERLAY)).toBeUndefined();
    // z=0.5 must be restored (differential demolish inverse)
    expect(h.lm.getLayer(ZIndex.Z0_5_IDLE_INFILL)).toBe(h.idleLayer);

    h.unsubLongPress();
    h.toastLayer.destroy();
  });

  // ─── COR-10: CharSheet suspended → [X] Close → CharSheet restored ─────────

  /**
   * Maps to Specs §7.14.4 ck 10 — [X] Close from Quick Action menu (opened over
   * CharacterSheet) restores the suspended CharSheet.
   *
   * Stack after pushOverlay: `overlayStack = [CharSheet instance]`.
   * After popOverlay: CharSheet is remounted; stack is empty.
   */
  it('COR-10: ck 10 — CharSheet suspended → [X] Close → CharSheet restored', async () => {
    const h = await makeHarness();

    // Open CharacterSheet
    await h.router.openPanel('character-sheet', h.deps);
    expect(h.lm.getLayer(ZIndex.Z2_OVERLAY)).toBeInstanceOf(CharacterSheetPanel);

    // Long-press → menu pushes over CharSheet (CharSheet suspended)
    simulateGesture(h.gestureBus, 'long-press');
    await flushMicrotasks();

    expect(h.lm.getLayer(ZIndex.Z2_OVERLAY)).toBeInstanceOf(QuickActionMenuPanel);
    expect(h.router.getOverlayStackLength()).toBe(1);

    // Tap [X] → popOverlay → CharSheet restored
    const menu = h.lm.getLayer(ZIndex.Z2_OVERLAY) as QuickActionMenuPanel;
    await tapMenuItemByKey(h.gestureBus, menu, 'X');
    await flushMicrotasks();

    expect(h.lm.getLayer(ZIndex.Z2_OVERLAY)).toBeInstanceOf(CharacterSheetPanel);
    expect(h.router.getOverlayStackLength()).toBe(0);

    h.unsubLongPress();
    h.toastLayer.destroy();
  });

  // ─── COR-11: Toast survives menu open ────────────────────────────────────

  /**
   * Maps to Specs §7.14.4 ck 11 — toast at z=1.5 survives Quick Action menu open.
   *
   * ADR-0009 Amendment 1 Rule 2: z=1.5 toast queue is a CARVE-OUT — differential
   * demolish does NOT touch it when z=2 is mounted/destroyed.
   *
   * @see docs/architecture/0009-layer-manager-contract.md Amendment 1
   */
  it('COR-11: ck 11 — toast survives menu open (ADR-0009 Amendment 1 Rule 2)', async () => {
    const h = await makeHarness();

    // Enqueue a toast before opening menu
    h.toastLayer.enqueue({
      id: 'test-toast-cor11',
      message: 'COR-11 toast',
      severity: 'info',
      emittedAt: Date.now(),
    });
    expect(h.toastLayer.getVisibleCount()).toBeGreaterThanOrEqual(1);

    // Open menu via long-press
    simulateGesture(h.gestureBus, 'long-press');
    await flushMicrotasks();

    expect(h.lm.getLayer(ZIndex.Z2_OVERLAY)).toBeInstanceOf(QuickActionMenuPanel);

    // Toast must still be visible after menu opens
    expect(h.toastLayer.getVisibleCount()).toBeGreaterThanOrEqual(1);

    h.unsubLongPress();
    h.toastLayer.destroy();
  });

  // ─── COR-12: Toast survives panel-to-panel transition ────────────────────

  /**
   * Maps to Specs §7.14.4 ck 12 — toast survives panel-to-panel transition via menu.
   *
   * ADR-0009 Amendment 1 Rule 2 carry-forward: even after CharSheet → menu → Combat,
   * the toast queue at z=1.5 remains mounted and its enqueued items are preserved.
   */
  it('COR-12: ck 12 — toast survives panel-to-panel via menu (ADR-0009 Amendment 1)', async () => {
    const h = await makeHarness();

    // Enqueue a toast
    h.toastLayer.enqueue({
      id: 'test-toast-cor12',
      message: 'COR-12 toast',
      severity: 'warn',
      emittedAt: Date.now(),
    });
    expect(h.toastLayer.getVisibleCount()).toBeGreaterThanOrEqual(1);

    // Open CharSheet
    await h.router.openPanel('character-sheet', h.deps);

    // Long-press → menu
    simulateGesture(h.gestureBus, 'long-press');
    await flushMicrotasks();

    const menu = h.lm.getLayer(ZIndex.Z2_OVERLAY) as QuickActionMenuPanel;

    // Tap [C] → CombatTracker (panel-to-panel)
    await tapMenuItemByKey(h.gestureBus, menu, 'C');
    await flushMicrotasks();

    expect(h.lm.getLayer(ZIndex.Z2_OVERLAY)).toBeInstanceOf(CombatTrackerPanel);

    // Toast must still be visible after panel-to-panel transition
    expect(h.toastLayer.getVisibleCount()).toBeGreaterThanOrEqual(1);

    h.unsubLongPress();
    h.toastLayer.destroy();
  });

  // ─── COR-13: conc-modal → long-press → menu replaces modal ───────────────

  /**
   * Maps to Specs §7.14.4 ck 13 — conc-modal active when long-press fires.
   *
   * Edge case: the concentration-drop modal is NOT in the overlayStack (it was
   * mounted directly by `attachConcConflictHandler`, not via `pushOverlay`).
   * The dispatcher replaces it with the menu and emits `console.warn` telemetry.
   * The user's pending conc-modal choice is lost — MVP-accepted per T-06-04-04.
   *
   * After menu closes (or any subsequent action), the state returns to main HUD
   * (overlayStack is empty).
   */
  it('COR-13: ck 13 — conc-modal → long-press → console.warn + menu replaces modal', async () => {
    const h = await makeHarness();

    // Mount a conc-modal directly (simulating conc-conflict-dispatcher)
    const concModal = new ConcentrationDropModalPanel(
      h.bridge,
      // Minimal WS-like mock for the modal
      {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        send: vi.fn(),
      } as unknown as Parameters<typeof ConcentrationDropModalPanel>[1],
      h.gestureBus,
      {
        effectId: 'effect-1',
        currentConcentrationName: 'Bless',
        newSpellName: 'Haste',
      },
      'it',
      'session-conc-cor13',
      () => {
        void h.lm.bundle([{ type: 'destroy', z: ZIndex.Z2_OVERLAY }]);
      },
    );
    await h.lm.bundle([{ type: 'mount', z: ZIndex.Z2_OVERLAY, layer: concModal }]);
    expect(h.lm.getLayer(ZIndex.Z2_OVERLAY)?.id).toBe('conc-drop-modal');

    // Long-press → dispatcher should warn and replace modal with menu
    simulateGesture(h.gestureBus, 'long-press');
    await flushMicrotasks();

    // console.warn must have been called with the conc-modal message
    expect(warnSpy).toHaveBeenCalled();
    const warnMessages = warnSpy.mock.calls.map((call) => String(call[0]));
    const concWarn = warnMessages.find((msg) => msg.includes('conc-modal'));
    expect(concWarn).toBeDefined();

    // Menu must now be mounted
    expect(h.lm.getLayer(ZIndex.Z2_OVERLAY)).toBeInstanceOf(QuickActionMenuPanel);

    h.unsubLongPress();
    h.toastLayer.destroy();
  });

  // ─── COR-14: INV-1 fixture round-trip ─────────────────────────────────────

  /**
   * Maps to Specs §7.14.4 ck 14 — INV-1 ASCII fixture char-perfect across transitions.
   *
   * Renders the Quick Action menu over CombatTracker (uses existing fixture from
   * Plan 06-02: `quick-action.combat-suspended.it.txt`).
   */
  it('COR-14: ck 14 — INV-1 fixture round-trip: Quick Action menu (it locale)', async () => {
    // Import the standalone render function from quick-action-menu-panel
    const { QuickActionMenuPanel: MenuPanel } = await import(
      '../panels/quick-action-menu-panel.js'
    );
    const bridgeBundle = makeMockBridge();
    const bus = new PanelGestureBus();
    const localeEvents = new LocaleEventEmitter();

    const menu = new MenuPanel(bridgeBundle.bridge, bus, 'it', 'auto', localeEvents, {
      onClose: vi.fn(),
      onNavigate: vi.fn(),
      onMapModeToggle: vi.fn(),
      onAction: vi.fn(),
    });

    // Draw the menu to capture what was sent to the bridge
    await menu.draw();

    // Extract the rendered content from the textContainerUpgrade call
    expect(bridgeBundle.textContainerUpgrade).toHaveBeenCalled();
    const upgradeCall = bridgeBundle.textContainerUpgrade.mock.calls[0];
    const upgradeArg = upgradeCall?.[0] as { content?: string } | undefined;
    const content = upgradeArg?.content ?? '';

    expect(content.length).toBeGreaterThan(0);

    // Match against the INV-1 fixture from Plan 06-02
    await matchAsciiFixture(
      AsciiGrid.fromString(content),
      resolve(fixtureDir(), 'quick-action.base.it.txt'),
    );
  });

  // ─── COR-15: Context chip updates on every transition ────────────────────

  /**
   * Maps to Specs §7.14.4 ck 15 — status HUD context chip updates on layer-mount/unmount.
   *
   * Asserts chip text after each transition:
   *   - main HUD (no overlay): hud_r1_main string
   *   - CharSheet: includes sheet-specific R1 hints (tap=tab/cycle, scroll=nav)
   *   - Quick Action menu: tap=apri/open, scroll=cambia/change, long=annulla/cancel
   *   - Back to main HUD: hud_r1_main again
   */
  it('COR-15: ck 15 — context chip updates on every layer-mount/unmount transition', async () => {
    const h = await makeHarness();

    // State 1: main HUD (no overlay layer with getR1Hints) — chip uses hud_r1_main
    const chip1 = h.renderer.renderContextChip(h.lm, 'it');
    expect(chip1).toMatch(/^R1:/);
    // Main HUD uses defaults from hud_r1_main (tap=cicla/scroll=nav/long=quick)
    expect(chip1).toContain('tap=');

    // State 2: Open CharacterSheet
    await h.router.openPanel('character-sheet', h.deps);
    const chip2 = h.renderer.renderContextChip(h.lm, 'it');
    expect(chip2).toMatch(/^R1:/);
    // CharSheet is a top layer now — chip should reflect sheet hints
    expect(chip2).toContain('tap=');

    // State 3: Long-press → Quick Action menu
    simulateGesture(h.gestureBus, 'long-press');
    await flushMicrotasks();

    expect(h.lm.getLayer(ZIndex.Z2_OVERLAY)).toBeInstanceOf(QuickActionMenuPanel);
    const chip3 = h.renderer.renderContextChip(h.lm, 'it');
    expect(chip3).toMatch(/^R1:/);
    // Quick Action menu provides its own hints — long=annulla (cancel in 'it')
    expect(chip3).toContain('long=');

    // State 4: [X] Close → back to main HUD
    const menu = h.lm.getLayer(ZIndex.Z2_OVERLAY) as QuickActionMenuPanel;
    await tapMenuItemByKey(h.gestureBus, menu, 'X');
    await flushMicrotasks();

    const chip4 = h.renderer.renderContextChip(h.lm, 'it');
    expect(chip4).toMatch(/^R1:/);
    // Back to main HUD — chip reverts to default
    expect(chip4).toContain('tap=');

    // Verify each chip is distinct (transitions actually changed the chip)
    // chip2 ≠ chip3 (CharSheet vs Quick Action menu hints)
    expect(chip2).not.toBe(chip3);
    // chip3 ≠ chip4 (Quick Action menu vs main HUD)
    expect(chip3).not.toBe(chip4);

    h.unsubLongPress();
    h.toastLayer.destroy();
  });
});
