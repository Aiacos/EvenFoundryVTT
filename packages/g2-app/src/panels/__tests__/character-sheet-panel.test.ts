/**
 * Unit tests for CharacterSheetPanel (Phase 5 Plan 05-02 — SHEET-01/SHEET-04).
 *
 * Covers (per 05-02-PLAN.md §Task 1 + §Task 2):
 *
 * Meta / identity:
 *   - CHSP-META-1: `CharacterSheetPanel.meta` passes `PanelMetaSchema.safeParse`
 *   - CHSP-META-2: meta fields (id, navKey, defaultTab, requiredCaps)
 *   - CHSP-CTOR-1: instance passes `isOverlayPanel` predicate
 *   - CHSP-CTOR-2: `getContainerCount()` returns `{ image: 0, text: 1 }`
 *
 * Lifecycle:
 *   - CHSP-MOUNT-1:  onMount subscribes to gestureBus (bus.size() === 1)
 *   - CHSP-UNMOUNT-1: onUnmount unsubscribes (bus.size() === 0); idempotent double-unmount
 *
 * Tab cycle:
 *   - CHSP-TAP-1:       6 sequential taps cycle through all 6 tabs and return to Main
 *   - CHSP-TAP-2:       tap from Main → Skills (forward direction)
 *   - CHSP-SCROLL-UP-1: scroll-up from Main → Bio (wrap backward)
 *   - CHSP-SCROLL-DOWN-1: scroll-down behaves identically to tap (forward)
 *
 * Persistence:
 *   - CHSP-PERSIST-1:  tap triggers `bridge.setLocalStorage('view.sheet.lastTab', 'skills')`
 *   - CHSP-RESTORE-1:  stored 'spells' → onMount sets activeTabIndex to 3
 *   - CHSP-RESTORE-2:  stored 'invalid' → onMount defaults to 0
 *   - CHSP-RESTORE-3:  getLocalStorage throws → onMount defaults to 0
 *
 * buildTabStrip:
 *   - CHSP-TABSTRIP-1: `buildTabStrip(0)` is exactly 70 code-points and contains '▶MAI'
 *   - CHSP-TABSTRIP-2: `buildTabStrip(3)` is exactly 70 code-points and contains '▶SPL'
 *
 * draw():
 *   - CHSP-DRAW-1: draw issues exactly one bridge.textContainerUpgrade with containerName 'overlay-block'
 *
 * No-op gestures:
 *   - CHSP-DBL-TAP-1:    double-tap is a no-op (no state change, no draw call)
 *   - CHSP-LONG-PRESS-1: long-press is a no-op stub (no state change, no draw call)
 *
 * INV-1 fixtures (SHEET-04 ck 13):
 *   - CHSP-FIX-MAIN:      buildTabStrip(0) matches sheet.tab-strip.main-active.it.txt
 *   - CHSP-FIX-SKILLS:    buildTabStrip(1) matches sheet.tab-strip.skills-active.it.txt
 *   - CHSP-FIX-INVENTORY: buildTabStrip(2) matches sheet.tab-strip.inventory-active.it.txt
 *   - CHSP-FIX-SPELLS:    buildTabStrip(3) matches sheet.tab-strip.spells-active.it.txt
 *   - CHSP-FIX-FEATS:     buildTabStrip(4) matches sheet.tab-strip.feats-active.it.txt
 *   - CHSP-FIX-BIO:       buildTabStrip(5) matches sheet.tab-strip.bio-active.it.txt
 *
 * @see .planning/phases/05-panel-plugin-system-read-only-panels/05-02-PLAN.md §Task 1 + §Task 2
 * @see .planning/phases/05-panel-plugin-system-read-only-panels/05-UI-SPEC.md §4.2 + §5.2
 */

import { resolve } from 'node:path';
import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';
import { AsciiGrid, matchAsciiFixture } from '@evf/shared-render';
import { describe, expect, it, vi } from 'vitest';
import { isOverlayPanel } from '../../engine/overlay-panel.js';
import { PanelGestureBus } from '../../engine/panel-gesture-bus.js';
import { PanelMetaSchema } from '../../engine/panel-router.js';
import CharacterSheetPanel, {
  buildTabStrip,
  PERSIST_KEY,
  TAB_LABELS,
  TABS,
} from '../character-sheet-panel.js';

// ─── Fixture directory ────────────────────────────────────────────────────────

/**
 * Absolute path to the shared-render fixtures directory.
 *
 * Mirrors the `../../../../shared-render/src/fixtures` relative path pattern
 * used by `packages/g2-app/src/status-hud/__tests__/snapshot.test.ts` (SR-DS-7/8).
 * The test file is at `packages/g2-app/src/panels/__tests__/`, so the relative
 * path climbs: __tests__/ → panels/ → src/ → g2-app/ → packages/ → then into
 * shared-render (5 levels up from __tests__ to workspace root = ../../../../..
 * from __tests__, or equivalently ../../../../shared-render from g2-app/).
 */
function fixtureDir(): string {
  return resolve(__dirname, '../../../../shared-render/src/fixtures');
}

// ─── Mock helpers ─────────────────────────────────────────────────────────────

/**
 * Create a mock bridge pre-configured with:
 * - `textContainerUpgrade`: resolves to `true`
 * - `setLocalStorage`: resolves to `true`
 * - `getLocalStorage`: resolves to `''` (key absent / first-ever mount)
 *
 * Override individual mocks via `opts` for persistence tests.
 */
function makeMockBridge(opts?: {
  getLocalStorageImpl?: (key: string) => Promise<string>;
  setLocalStorageImpl?: (key: string, value: string) => Promise<boolean>;
}) {
  return {
    textContainerUpgrade: vi.fn().mockResolvedValue(true),
    setLocalStorage: opts?.setLocalStorageImpl
      ? vi.fn().mockImplementation(opts.setLocalStorageImpl)
      : vi.fn().mockResolvedValue(true),
    getLocalStorage: opts?.getLocalStorageImpl
      ? vi.fn().mockImplementation(opts.getLocalStorageImpl)
      : vi.fn().mockResolvedValue(''),
  } as unknown as EvenAppBridge & {
    textContainerUpgrade: ReturnType<typeof vi.fn>;
    setLocalStorage: ReturnType<typeof vi.fn>;
    getLocalStorage: ReturnType<typeof vi.fn>;
  };
}

/**
 * Instantiate a CharacterSheetPanel with mock bridge + bus.
 *
 * Does NOT call `onMount()` — caller controls when to mount.
 */
function makePanel(opts?: { bridge?: ReturnType<typeof makeMockBridge>; bus?: PanelGestureBus }) {
  const bridge = opts?.bridge ?? makeMockBridge();
  const bus = opts?.bus ?? new PanelGestureBus();
  const panel = new CharacterSheetPanel(bridge, bus, 'it');
  return { panel, bridge, bus };
}

// ─── CHSP-META-* ─────────────────────────────────────────────────────────────

describe('CharacterSheetPanel — static meta', () => {
  it('CHSP-META-1: static meta passes PanelMetaSchema.safeParse', () => {
    const result = PanelMetaSchema.safeParse(CharacterSheetPanel.meta);
    expect(result.success).toBe(true);
  });

  it('CHSP-META-2: id="character-sheet", navKey="S", defaultTab="main", requiredCaps=[]', () => {
    const { meta } = CharacterSheetPanel;
    expect(meta.id).toBe('character-sheet');
    expect(meta.navKey).toBe('S');
    expect(meta.defaultTab).toBe('main');
    expect(meta.requiredCaps).toEqual([]);
  });
});

// ─── CHSP-CTOR-* ─────────────────────────────────────────────────────────────

describe('CharacterSheetPanel — constructor / interface conformance', () => {
  it('CHSP-CTOR-1: instance passes isOverlayPanel predicate', () => {
    const { panel } = makePanel();
    expect(isOverlayPanel(panel)).toBe(true);
  });

  it('CHSP-CTOR-2: getContainerCount returns { image: 0, text: 1 } (Strategy A)', () => {
    const { panel } = makePanel();
    expect(panel.getContainerCount()).toEqual({ image: 0, text: 1 });
  });
});

// ─── CHSP-MOUNT-1 / CHSP-UNMOUNT-1 ──────────────────────────────────────────

describe('CharacterSheetPanel — gesture bus lifecycle (T-4b-01-03)', () => {
  it('CHSP-MOUNT-1: onMount subscribes to gestureBus (bus.size() === 1)', async () => {
    const bus = new PanelGestureBus();
    const { panel } = makePanel({ bus });
    expect(bus.size()).toBe(0);
    await panel.onMount();
    expect(bus.size()).toBe(1);
  });

  it('CHSP-UNMOUNT-1: onUnmount unsubscribes (bus.size() === 0); double-unmount is safe', async () => {
    const bus = new PanelGestureBus();
    const { panel } = makePanel({ bus });
    await panel.onMount();
    expect(bus.size()).toBe(1);
    await panel.onUnmount();
    expect(bus.size()).toBe(0);
    // Second unmount must not throw or under-count.
    await panel.onUnmount();
    expect(bus.size()).toBe(0);
  });
});

// ─── CHSP-TAP-* / CHSP-SCROLL-* ──────────────────────────────────────────────

describe('CharacterSheetPanel — tab cycle via tap + scroll gestures', () => {
  it('CHSP-TAP-1: 6 sequential tap gestures cycle through all tabs and return to Main', async () => {
    const bus = new PanelGestureBus();
    const { panel } = makePanel({ bus });
    await panel.onMount();

    // Capture the active tab by inspecting the textContainerUpgrade content.
    // After onMount activeTabIndex === 0 (MAI). Each tap advances by 1.
    const getTabLabel = () => {
      const calls = (panel as unknown as { bridge: ReturnType<typeof makeMockBridge> }).bridge
        .textContainerUpgrade.mock.calls;
      const lastCall = calls[calls.length - 1]?.[0] as { content: string } | undefined;
      return lastCall?.content ?? '';
    };

    // 0 → 1 (SKI)
    bus.publish({ kind: 'tap' });
    expect(getTabLabel()).toContain('▶SKI');

    // 1 → 2 (INV)
    bus.publish({ kind: 'tap' });
    expect(getTabLabel()).toContain('▶INV');

    // 2 → 3 (SPL)
    bus.publish({ kind: 'tap' });
    expect(getTabLabel()).toContain('▶SPL');

    // 3 → 4 (FEA)
    bus.publish({ kind: 'tap' });
    expect(getTabLabel()).toContain('▶FEA');

    // 4 → 5 (BIO)
    bus.publish({ kind: 'tap' });
    expect(getTabLabel()).toContain('▶BIO');

    // 5 → 0 (MAI — wrap)
    bus.publish({ kind: 'tap' });
    expect(getTabLabel()).toContain('▶MAI');
  });

  it('CHSP-TAP-2: tap from Main → Skills (forward direction confirmed)', async () => {
    const bus = new PanelGestureBus();
    const { panel, bridge } = makePanel({ bus });
    await panel.onMount();

    bus.publish({ kind: 'tap' });
    const lastContent = (bridge.textContainerUpgrade.mock.lastCall?.[0] as { content: string })
      .content;
    expect(lastContent).toContain('▶SKI');
    // Main is now inactive.
    expect(lastContent).not.toContain('▶MAI');
  });

  it('CHSP-SCROLL-UP-1: scroll-up from Main → Bio (wrap backward)', async () => {
    const bus = new PanelGestureBus();
    const { panel, bridge } = makePanel({ bus });
    await panel.onMount();

    bus.publish({ kind: 'scroll', direction: 'up' });
    const lastContent = (bridge.textContainerUpgrade.mock.lastCall?.[0] as { content: string })
      .content;
    expect(lastContent).toContain('▶BIO');
  });

  it('CHSP-SCROLL-DOWN-1: scroll-down behaves identically to tap (forward)', async () => {
    const bus = new PanelGestureBus();
    const { panel, bridge } = makePanel({ bus });
    await panel.onMount();

    bus.publish({ kind: 'scroll', direction: 'down' });
    const lastContent = (bridge.textContainerUpgrade.mock.lastCall?.[0] as { content: string })
      .content;
    expect(lastContent).toContain('▶SKI');
  });
});

// ─── CHSP-PERSIST-* / CHSP-RESTORE-* ─────────────────────────────────────────

describe('CharacterSheetPanel — last-viewed tab persistence (T-05-02-01)', () => {
  it('CHSP-PERSIST-1: tap triggers setLocalStorage with key view.sheet.lastTab and value "skills"', async () => {
    const bus = new PanelGestureBus();
    const bridge = makeMockBridge();
    const { panel } = makePanel({ bridge, bus });
    await panel.onMount();

    bus.publish({ kind: 'tap' }); // Main → Skills
    // Allow the async persistence to settle.
    await vi.waitFor(() => {
      expect(bridge.setLocalStorage).toHaveBeenCalledWith(PERSIST_KEY, 'skills');
    });
  });

  it('CHSP-RESTORE-1: stored "spells" → onMount sets activeTabIndex to 3', async () => {
    const bridge = makeMockBridge({
      getLocalStorageImpl: async (_key: string) => 'spells',
    });
    const { panel } = makePanel({ bridge });
    await panel.onMount();

    // After restoring "spells" (index 3), the rendered content should contain ▶SPL.
    const lastContent = (bridge.textContainerUpgrade.mock.lastCall?.[0] as { content: string })
      .content;
    expect(lastContent).toContain('▶SPL');
  });

  it('CHSP-RESTORE-2: stored "invalid" → onMount defaults to 0 (Main)', async () => {
    const bridge = makeMockBridge({
      getLocalStorageImpl: async (_key: string) => 'invalid-tab-id',
    });
    const { panel } = makePanel({ bridge });
    await panel.onMount();

    const lastContent = (bridge.textContainerUpgrade.mock.lastCall?.[0] as { content: string })
      .content;
    expect(lastContent).toContain('▶MAI');
  });

  it('CHSP-RESTORE-3: getLocalStorage throws → onMount defaults to 0 (Main), no throw', async () => {
    const bridge = makeMockBridge({
      getLocalStorageImpl: async (_key: string) => {
        throw new Error('storage unavailable');
      },
    });
    const { panel } = makePanel({ bridge });

    // Must not throw.
    await expect(panel.onMount()).resolves.toBeUndefined();

    const lastContent = (bridge.textContainerUpgrade.mock.lastCall?.[0] as { content: string })
      .content;
    expect(lastContent).toContain('▶MAI');
  });
});

// ─── CHSP-TABSTRIP-* ──────────────────────────────────────────────────────────

describe('buildTabStrip — pure helper width + content', () => {
  it('CHSP-TABSTRIP-1: buildTabStrip(0) is exactly 70 code-points and contains ▶MAI', () => {
    const row = buildTabStrip(0);
    expect([...row].length).toBe(70);
    expect(row).toContain('▶MAI');
    expect(row.startsWith('┌─')).toBe(true);
    expect(row.endsWith('┐')).toBe(true);
  });

  it('CHSP-TABSTRIP-2: buildTabStrip(3) is exactly 70 code-points and contains ▶SPL', () => {
    const row = buildTabStrip(3);
    expect([...row].length).toBe(70);
    expect(row).toContain('▶SPL');
  });

  it('All 6 buildTabStrip calls produce exactly 70 code-points', () => {
    for (let i = 0; i < TABS.length; i++) {
      const row = buildTabStrip(i);
      expect([...row].length).toBe(70);
      expect(row).toContain(`▶${TAB_LABELS[i]}`);
    }
  });
});

// ─── CHSP-DRAW-1 ─────────────────────────────────────────────────────────────

describe('CharacterSheetPanel — draw()', () => {
  it('CHSP-DRAW-1: draw issues exactly one textContainerUpgrade with containerName="overlay-block"', async () => {
    const { panel, bridge } = makePanel();
    await panel.draw();
    expect(bridge.textContainerUpgrade).toHaveBeenCalledTimes(1);
    const arg = bridge.textContainerUpgrade.mock.calls[0]?.[0] as { containerName: string };
    expect(arg.containerName).toBe('overlay-block');
  });
});

// ─── CHSP-DBL-TAP-1 / CHSP-LONG-PRESS-1 ─────────────────────────────────────

describe('CharacterSheetPanel — no-op gestures', () => {
  it('CHSP-DBL-TAP-1: double-tap is a no-op (no state change, no additional draw)', async () => {
    const bus = new PanelGestureBus();
    const { panel, bridge } = makePanel({ bus });
    await panel.onMount();
    // onMount calls draw() once.
    const callsBefore = bridge.textContainerUpgrade.mock.calls.length;

    bus.publish({ kind: 'double-tap' });

    // No additional textContainerUpgrade call.
    expect(bridge.textContainerUpgrade.mock.calls.length).toBe(callsBefore);
    // Tab strip still shows MAI active (no state change).
    // (We verify indirectly by checking no new draw was triggered.)
  });

  it('CHSP-LONG-PRESS-1: long-press is a no-op stub (no state change, no additional draw)', async () => {
    const bus = new PanelGestureBus();
    const { panel, bridge } = makePanel({ bus });
    await panel.onMount();
    const callsBefore = bridge.textContainerUpgrade.mock.calls.length;

    bus.publish({ kind: 'long-press' });

    expect(bridge.textContainerUpgrade.mock.calls.length).toBe(callsBefore);
  });
});

// ─── CHSP-FIX-* — INV-1 fixture round-trips (SHEET-04 ck 13) ────────────────

describe('buildTabStrip — INV-1 fixture round-trips (SHEET-04 ck 13)', () => {
  it('CHSP-FIX-MAIN: buildTabStrip(0) matches sheet.tab-strip.main-active.it.txt', async () => {
    const row = buildTabStrip(0);
    const grid = AsciiGrid.fromString(row);
    await matchAsciiFixture(grid, resolve(fixtureDir(), 'sheet.tab-strip.main-active.it.txt'));
  });

  it('CHSP-FIX-SKILLS: buildTabStrip(1) matches sheet.tab-strip.skills-active.it.txt', async () => {
    const row = buildTabStrip(1);
    const grid = AsciiGrid.fromString(row);
    await matchAsciiFixture(grid, resolve(fixtureDir(), 'sheet.tab-strip.skills-active.it.txt'));
  });

  it('CHSP-FIX-INVENTORY: buildTabStrip(2) matches sheet.tab-strip.inventory-active.it.txt', async () => {
    const row = buildTabStrip(2);
    const grid = AsciiGrid.fromString(row);
    await matchAsciiFixture(grid, resolve(fixtureDir(), 'sheet.tab-strip.inventory-active.it.txt'));
  });

  it('CHSP-FIX-SPELLS: buildTabStrip(3) matches sheet.tab-strip.spells-active.it.txt', async () => {
    const row = buildTabStrip(3);
    const grid = AsciiGrid.fromString(row);
    await matchAsciiFixture(grid, resolve(fixtureDir(), 'sheet.tab-strip.spells-active.it.txt'));
  });

  it('CHSP-FIX-FEATS: buildTabStrip(4) matches sheet.tab-strip.feats-active.it.txt', async () => {
    const row = buildTabStrip(4);
    const grid = AsciiGrid.fromString(row);
    await matchAsciiFixture(grid, resolve(fixtureDir(), 'sheet.tab-strip.feats-active.it.txt'));
  });

  it('CHSP-FIX-BIO: buildTabStrip(5) matches sheet.tab-strip.bio-active.it.txt', async () => {
    const row = buildTabStrip(5);
    const grid = AsciiGrid.fromString(row);
    await matchAsciiFixture(grid, resolve(fixtureDir(), 'sheet.tab-strip.bio-active.it.txt'));
  });
});
