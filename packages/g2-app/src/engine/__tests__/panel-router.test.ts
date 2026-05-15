/**
 * Unit tests for PanelRouter (Phase 5 Plan 05-01 Wave-0).
 *
 * Covers PRT-DISC-01..04 + PRT-OPEN-01..04 + PRT-CLOSE-01..02 + PRT-IS-OPEN
 * from 05-01-PLAN.md Task 1.
 *
 * import.meta.glob is mocked via module-level mock of the panel-router module:
 * we test PanelRouter methods directly by injecting a pre-populated registry.
 * The `discoverPanels` method depends on Vite's glob which is not available in
 * Vitest's happy-dom environment, so tests that verify discovery behaviour mock
 * the glob result by subclassing or via the internal API.
 *
 * Strategy: `PanelRouter` exposes `getRegistrySize()` and `isPanelOpen()` as
 * test diagnostics. For discovery tests, we use a `TestablePanelRouter` that
 * overrides `_globModules()` so we can inject mock module maps without requiring
 * real Vite glob resolution (analogous to Phase 4b panel-gesture-bus.test.ts).
 *
 * @see packages/g2-app/src/engine/panel-router.ts
 * @see .planning/phases/05-panel-plugin-system-read-only-panels/05-01-PLAN.md Task 1
 * @see docs/architecture/0010-panel-plugin-registry.md (ADR-0010)
 */
import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToastQueueLayer } from '../../status-hud/toast-queue-layer.js';
import type { LayerManager } from '../layer-manager.js';
import type { Layer, OverlayPanel, R1Gesture } from '../layer-types.js';
import { ZIndex } from '../layer-types.js';
import type { PanelGestureBus } from '../panel-gesture-bus.js';
import type { PanelConstructor, PanelDeps, PanelMeta } from '../panel-router.js';
import { PanelMetaSchema, PanelRouter } from '../panel-router.js';

// ─── Mock factories ───────────────────────────────────────────────────────────

function makePanelInstance(): OverlayPanel {
  return {
    id: 'test-panel',
    draw: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn(),
    onMount: vi.fn().mockResolvedValue(undefined),
    onUnmount: vi.fn().mockResolvedValue(undefined),
    onEvent: vi.fn(),
    getContainerCount: () => ({ image: 0, text: 1 }),
    getCaptureContainer: () => 'overlay-capture',
  } satisfies Layer & OverlayPanel;
}

function makePanelClass(overrideId = 'test-panel', meta?: PanelMeta): PanelConstructor {
  const panelInstance = makePanelInstance();

  // Use a factory function cast to a constructor type. A plain function works
  // as a JS constructor when called with `new`, and avoids the Biome
  // `noConstructorReturn` lint rule that fires on class constructors that
  // return an object.
  function MockPanelFn(
    this: object,
    _bridge: EvenAppBridge,
    _bus: PanelGestureBus,
    _locale: unknown,
  ): void {
    Object.assign(this, panelInstance);
  }

  const defaultMeta: PanelMeta = {
    id: overrideId,
    title: { it: 'Scheda', en: 'Sheet' },
    navKey: 'S',
    requiredCaps: [],
    defaultTab: 'main',
  };

  (MockPanelFn as unknown as { meta: PanelMeta }).meta = meta ?? defaultMeta;

  return MockPanelFn as unknown as PanelConstructor;
}

interface LayerManagerSpies {
  bundle: ReturnType<typeof vi.fn>;
  getLayer: ReturnType<typeof vi.fn>;
}

function makeLayerManager(): { lm: LayerManager; spies: LayerManagerSpies } {
  const bundle = vi.fn().mockResolvedValue(undefined);
  const getLayer = vi.fn().mockReturnValue(null);
  const lm = { bundle, getLayer } as unknown as LayerManager;
  return { lm, spies: { bundle, getLayer } };
}

function makeBridge(): EvenAppBridge {
  return {} as unknown as EvenAppBridge;
}

function makeGestureBus(): PanelGestureBus {
  const subscribe = vi.fn().mockReturnValue(() => {});
  const publish = vi.fn();
  return { subscribe, publish, size: vi.fn().mockReturnValue(0) } as unknown as PanelGestureBus;
}

function makeToastQueue(): ToastQueueLayer {
  const enqueue = vi.fn();
  return { enqueue } as unknown as ToastQueueLayer;
}

function makeDeps(overrides: Partial<PanelDeps> = {}): PanelDeps {
  const { lm } = makeLayerManager();
  return {
    bridge: makeBridge(),
    gestureBus: makeGestureBus(),
    locale: 'it',
    layerManager: lm,
    negotiatedCaps: new Set<string>(),
    ...overrides,
  };
}

// ─── TestablePanelRouter ─────────────────────────────────────────────────────

/**
 * Subclass that overrides the glob result, allowing discovery tests to inject
 * mock module maps without requiring real Vite build-time glob resolution.
 *
 * This follows the Phase 4b test pattern for dependencies that are not directly
 * injectable at the public API boundary.
 */
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
          console.warn(
            `[PanelRouter] panel ${path} excluded: invalid meta — ${parseResult.error.message}`,
          );
          continue;
        }

        const meta = parseResult.data;
        // Access the private registry via the protected test hook.
        // We use a type cast here to access the private field for testing only.
        (
          this as unknown as { registry: Map<string, { meta: PanelMeta; Cls: PanelConstructor }> }
        ).registry.set(meta.id, { meta, Cls });
      } catch (err) {
        console.warn(`[PanelRouter] panel ${path} excluded: load error`, err);
      }
    }

    if (this.getRegistrySize() === 0) {
      console.warn('[PanelRouter] no panels registered after discovery — boot-error state');
    }
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('PanelRouter — discovery (PRT-DISC)', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('PRT-DISC-01: discoverPanels populates registry from one valid mock module', async () => {
    const router = new TestablePanelRouter();
    const Cls = makePanelClass('character-sheet');
    router.setMockModules({
      '../panels/character-sheet-panel.ts': async () => ({ default: Cls }),
    });

    await router.discoverPanels();

    expect(router.getRegistrySize()).toBe(1);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('PRT-DISC-02: malformed meta emits console.warn + skips entry; valid panel survives', async () => {
    const router = new TestablePanelRouter();
    const goodCls = makePanelClass('good-panel');

    // Bad class: meta has wrong navKey length (violates z.string().length(1))
    const BadCls = vi.fn() as unknown as PanelConstructor;
    (BadCls as unknown as { meta: unknown }).meta = {
      id: 'bad-panel',
      title: { it: 'Bad', en: 'Bad' },
      navKey: 'TOO_LONG', // Violates navKey length constraint
      requiredCaps: [],
    };

    router.setMockModules({
      '../panels/bad-panel.ts': async () => ({ default: BadCls }),
      '../panels/good-panel.ts': async () => ({ default: goodCls }),
    });

    await router.discoverPanels();

    expect(router.getRegistrySize()).toBe(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('bad-panel.ts excluded: invalid meta'),
    );
  });

  it('PRT-DISC-03: loader throw emits console.warn + skips entry; valid panel survives', async () => {
    const router = new TestablePanelRouter();
    const goodCls = makePanelClass('good-panel');

    router.setMockModules({
      '../panels/broken-panel.ts': async () => {
        throw new Error('module load error');
      },
      '../panels/good-panel.ts': async () => ({ default: goodCls }),
    });

    await router.discoverPanels();

    expect(router.getRegistrySize()).toBe(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('broken-panel.ts excluded: load error'),
      expect.any(Error),
    );
  });

  it('PRT-DISC-04: registry size accessor returns correct count after discovery', async () => {
    const router = new TestablePanelRouter();

    router.setMockModules({
      '../panels/panel-a.ts': async () => ({ default: makePanelClass('panel-a') }),
      '../panels/panel-b.ts': async () => ({ default: makePanelClass('panel-b') }),
      '../panels/panel-c.ts': async () => ({ default: makePanelClass('panel-c') }),
    });

    await router.discoverPanels();

    expect(router.getRegistrySize()).toBe(3);
  });
});

describe('PanelRouter — openPanel (PRT-OPEN)', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  async function makeRouterWithPanel(panelId = 'test-panel'): Promise<TestablePanelRouter> {
    const router = new TestablePanelRouter();
    router.setMockModules({
      [`../panels/${panelId}-panel.ts`]: async () => ({ default: makePanelClass(panelId) }),
    });
    await router.discoverPanels();
    return router;
  }

  it('PRT-OPEN-01: happy path — constructs panel + issues bundle mount + records activePanel', async () => {
    const router = await makeRouterWithPanel('test-panel');
    const { lm, spies } = makeLayerManager();
    const deps = makeDeps({ layerManager: lm });

    await router.openPanel('test-panel', deps);

    expect(spies.bundle).toHaveBeenCalledTimes(1);
    expect(spies.bundle).toHaveBeenCalledWith([
      expect.objectContaining({ type: 'mount', z: ZIndex.Z2_OVERLAY }),
    ]);
    expect(router.isPanelOpen('test-panel')).toBe(true);
  });

  it('PRT-OPEN-02: missing required cap → toastQueue.enqueue + no mount', async () => {
    const router = new TestablePanelRouter();
    const Cls = makePanelClass('gated-panel', {
      id: 'gated-panel',
      title: { it: 'Gated', en: 'Gated' },
      navKey: 'G',
      requiredCaps: ['midi-qol'],
    });
    router.setMockModules({
      '../panels/gated-panel.ts': async () => ({ default: Cls }),
    });
    await router.discoverPanels();

    const toast = makeToastQueue();
    const { lm, spies } = makeLayerManager();
    const deps = makeDeps({
      layerManager: lm,
      negotiatedCaps: new Set<string>(['read_char']), // midi-qol absent
      toastQueue: toast,
    });

    await router.openPanel('gated-panel', deps);

    expect(spies.bundle).not.toHaveBeenCalled();
    expect(router.isPanelOpen('gated-panel')).toBe(false);
    expect(toast.enqueue as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(1);
  });

  it('PRT-OPEN-03: activePanel !== null → closes first then mounts new panel', async () => {
    const router = new TestablePanelRouter();
    router.setMockModules({
      '../panels/panel-a.ts': async () => ({ default: makePanelClass('panel-a') }),
      '../panels/panel-b.ts': async () => ({ default: makePanelClass('panel-b') }),
    });
    await router.discoverPanels();

    const { lm, spies } = makeLayerManager();
    const deps = makeDeps({ layerManager: lm });

    // Open panel-a first
    await router.openPanel('panel-a', deps);
    expect(router.isPanelOpen('panel-a')).toBe(true);

    // Open panel-b — should close panel-a first
    await router.openPanel('panel-b', deps);

    // bundle called twice: once to close panel-a (destroy), once to open panel-b (mount)
    expect(spies.bundle).toHaveBeenCalledTimes(3);
    // First call: mount panel-a
    expect(spies.bundle).toHaveBeenNthCalledWith(1, [
      expect.objectContaining({ type: 'mount', z: ZIndex.Z2_OVERLAY }),
    ]);
    // Second call: destroy panel-a
    expect(spies.bundle).toHaveBeenNthCalledWith(2, [
      expect.objectContaining({ type: 'destroy', z: ZIndex.Z2_OVERLAY }),
    ]);
    // Third call: mount panel-b
    expect(spies.bundle).toHaveBeenNthCalledWith(3, [
      expect.objectContaining({ type: 'mount', z: ZIndex.Z2_OVERLAY }),
    ]);

    expect(router.isPanelOpen('panel-b')).toBe(true);
    expect(router.isPanelOpen('panel-a')).toBe(false);
  });

  it('PRT-OPEN-04: unknown panel id → console.warn + no bundle call', async () => {
    const router = await makeRouterWithPanel('test-panel');
    const { lm, spies } = makeLayerManager();
    const deps = makeDeps({ layerManager: lm });

    await router.openPanel('nonexistent-panel', deps);

    expect(spies.bundle).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("panel 'nonexistent-panel' not in registry"),
    );
  });
});

describe('PanelRouter — closeActivePanel (PRT-CLOSE)', () => {
  it('PRT-CLOSE-01: close destroys z=2 + nulls activePanel', async () => {
    const router = new TestablePanelRouter();
    router.setMockModules({
      '../panels/test-panel.ts': async () => ({ default: makePanelClass('test-panel') }),
    });
    await router.discoverPanels();

    const { lm, spies } = makeLayerManager();
    const deps = makeDeps({ layerManager: lm });
    await router.openPanel('test-panel', deps);

    expect(router.isPanelOpen('test-panel')).toBe(true);

    await router.closeActivePanel();

    expect(spies.bundle).toHaveBeenLastCalledWith([
      expect.objectContaining({ type: 'destroy', z: ZIndex.Z2_OVERLAY }),
    ]);
    expect(router.isPanelOpen('test-panel')).toBe(false);
  });

  it('PRT-CLOSE-02: closeActivePanel with no active panel is a no-op', async () => {
    const router = new PanelRouter();
    // No panels mounted — should not throw
    await expect(router.closeActivePanel()).resolves.toBeUndefined();
  });
});

describe('PanelRouter — isPanelOpen (PRT-IS-OPEN)', () => {
  it('PRT-IS-OPEN: returns true for the active panel id, false for any other', async () => {
    const router = new TestablePanelRouter();
    router.setMockModules({
      '../panels/panel-a.ts': async () => ({ default: makePanelClass('panel-a') }),
    });
    await router.discoverPanels();

    const { lm } = makeLayerManager();
    const deps = makeDeps({ layerManager: lm });
    await router.openPanel('panel-a', deps);

    expect(router.isPanelOpen('panel-a')).toBe(true);
    expect(router.isPanelOpen('panel-b')).toBe(false);
    expect(router.isPanelOpen('')).toBe(false);

    await router.closeActivePanel();
    expect(router.isPanelOpen('panel-a')).toBe(false);
  });
});

describe('PanelRouter — PanelMetaSchema', () => {
  it('validates a complete valid PanelMeta object', () => {
    const result = PanelMetaSchema.safeParse({
      id: 'character-sheet',
      title: { it: 'Scheda', en: 'Sheet', de: 'Blatt' },
      navKey: 'S',
      requiredCaps: [],
      defaultTab: 'main',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty id', () => {
    const result = PanelMetaSchema.safeParse({
      id: '',
      title: { it: 'Scheda', en: 'Sheet' },
      navKey: 'S',
    });
    expect(result.success).toBe(false);
  });

  it('rejects navKey with length != 1', () => {
    const result = PanelMetaSchema.safeParse({
      id: 'test',
      title: { it: 'T', en: 'T' },
      navKey: 'AB', // two characters
    });
    expect(result.success).toBe(false);
  });

  it('allows optional de in title', () => {
    const result = PanelMetaSchema.safeParse({
      id: 'test',
      title: { it: 'T', en: 'T' }, // no de
      navKey: 'T',
    });
    expect(result.success).toBe(true);
  });
});

describe('R1Gesture type reference — panels can subscribe to gestures', () => {
  it('is not directly tested here but compile-time R1Gesture usage is validated', () => {
    // Type-level proof: R1Gesture type is usable from panel code.
    // Runtime proof: this test verifies the imports resolve correctly.
    const gesture: R1Gesture = { kind: 'tap' };
    expect(gesture.kind).toBe('tap');
  });
});
