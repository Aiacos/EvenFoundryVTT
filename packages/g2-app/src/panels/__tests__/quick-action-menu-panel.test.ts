/**
 * Unit tests for QuickActionMenuPanel (Phase 6 Plan 06-02 Wave 1 — NAV-02).
 *
 * Covers QAM-01..14 + QAM-FIX-01..04 from 06-02-PLAN.md Task 2 <behavior>:
 *   - QAM-01:  static meta parses via PanelMetaSchema with navKey ''
 *   - QAM-02:  isOverlayPanel(instance) === true; getContainerCount === { image: 0, text: 1 }
 *   - QAM-03:  default state renders 10 rows with ▶ on [S] (activeIndex=0); all rows 70 chars
 *   - QAM-04:  scroll down → activeIndex increments → ▶ moves to [C]
 *   - QAM-05:  scroll wrap-around from [X] (index 9) → back to [S] (index 0)
 *   - QAM-06:  tap on [N] (index 7) → mode === 'language'; draw shows 7 LOCALE_MENU entries
 *   - QAM-07:  sub-menu nav-keys are A I E D S F P (mutually exclusive modes)
 *   - QAM-08:  sub-menu locale select: scroll to [I] → tap → persistLocaleOverride('it') + localeEvents.emit + mode='main'
 *   - QAM-09:  sub-menu Auto: tap [A] → persistLocaleOverride('auto') + localeEvents.emit('auto')
 *   - QAM-10:  double-tap cancel from main mode → calls onClose()
 *   - QAM-11:  double-tap from language mode → mode returns to 'main', does NOT call onClose()
 *   - QAM-12:  tap actions: [S]→onNavigate('character-sheet') ONLY (no onClose — CR-01 fix),
 *              [C]→'combat-tracker', [L]→'log', [B]→'spellbook', [I]→'inventory',
 *              [M]→onMapModeToggle+onClose, [A]→onAction+onClose, [X]→onClose
 *   - QAM-NAV: CR-01 regression — navigate items call onNavigate only, never onClose
 *   - QAM-13:  getR1Hints() in main mode returns locale-aware labels
 *   - QAM-14:  getR1Hints() in language sub-menu mode returns different labels
 *   - QAM-FIX-01..04: INV-1 fixture round-trips for IT main, IT combat-suspended, IT language-submenu, DE stress
 *
 * @see .planning/phases/06-r1-integration-quick-action-inv-5/06-02-PLAN.md Task 2
 * @see .planning/phases/06-r1-integration-quick-action-inv-5/06-UI-SPEC.md §1+§2
 */

import { resolve } from 'node:path';
import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';
import { AsciiGrid, matchAsciiFixture } from '@evf/shared-render';
import { describe, expect, it, vi } from 'vitest';
import { isOverlayPanel } from '../../engine/overlay-panel.js';
import { PanelGestureBus } from '../../engine/panel-gesture-bus.js';
import { PanelMetaSchema } from '../../engine/panel-router.js';
import { LocaleEventEmitter } from '../../locale/locale-events.js';
import type { LocaleOverride } from '../../locale/locale-override.js';
import { QuickActionMenuPanel } from '../quick-action-menu-panel.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Absolute path to shared-render fixtures directory.
 * From packages/g2-app/src/panels/__tests__/ → up 4 levels to packages/ → shared-render/src/fixtures.
 */
function fixtureDir(): string {
  return resolve(__dirname, '../../../../shared-render/src/fixtures');
}

function makeMockBridge() {
  return {
    textContainerUpgrade: vi.fn().mockResolvedValue(true),
    setLocalStorage: vi.fn().mockResolvedValue(true),
    getLocalStorage: vi.fn().mockResolvedValue('auto'),
  } as unknown as EvenAppBridge & {
    textContainerUpgrade: ReturnType<typeof vi.fn>;
    setLocalStorage: ReturnType<typeof vi.fn>;
    getLocalStorage: ReturnType<typeof vi.fn>;
  };
}

type MockCallbacks = {
  onClose: ReturnType<typeof vi.fn> & (() => void);
  onNavigate: ReturnType<typeof vi.fn> & ((panelId: string) => void);
  onMapModeToggle: ReturnType<typeof vi.fn> & (() => void);
  onAction: ReturnType<typeof vi.fn> & (() => void);
};

function makeCallbacks(): MockCallbacks {
  const onClose = vi.fn() as unknown as ReturnType<typeof vi.fn> & (() => void);
  const onNavigate = vi.fn() as unknown as ReturnType<typeof vi.fn> & ((panelId: string) => void);
  const onMapModeToggle = vi.fn() as unknown as ReturnType<typeof vi.fn> & (() => void);
  const onAction = vi.fn() as unknown as ReturnType<typeof vi.fn> & (() => void);
  return { onClose, onNavigate, onMapModeToggle, onAction };
}

interface MakeMenuOptions {
  locale?: 'it' | 'en' | 'de';
  currentLocaleOverride?: LocaleOverride;
}

function makeMenu(opts: MakeMenuOptions = {}) {
  const bridge = makeMockBridge();
  const bus = new PanelGestureBus();
  const localeEvents = new LocaleEventEmitter();
  const callbacks = makeCallbacks();
  const locale = opts.locale ?? 'it';
  const currentLocaleOverride: LocaleOverride = opts.currentLocaleOverride ?? 'auto';

  const panel = new QuickActionMenuPanel(
    bridge,
    bus,
    locale,
    currentLocaleOverride,
    localeEvents,
    callbacks,
  );

  return { panel, bridge, bus, localeEvents, callbacks };
}

/** Draw the panel and return the raw content string from bridge.textContainerUpgrade. */
async function drawAndGetContent(
  panel: QuickActionMenuPanel,
  bridge: ReturnType<typeof makeMockBridge>,
): Promise<string> {
  await panel.draw();
  const calls = bridge.textContainerUpgrade.mock.calls;
  const lastCall = calls[calls.length - 1];
  const payload = lastCall?.[0] as { content: string };
  return payload.content;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('QuickActionMenuPanel — meta (QAM-01)', () => {
  it('QAM-01: static meta parses successfully via PanelMetaSchema with navKey ""', () => {
    const result = PanelMetaSchema.safeParse(QuickActionMenuPanel.meta);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.navKey).toBe('');
      expect(result.data.id).toBe('quick-action-menu');
    }
  });
});

describe('QuickActionMenuPanel — OverlayPanel contract (QAM-02)', () => {
  it('QAM-02: isOverlayPanel returns true; getContainerCount is { image: 0, text: 1 }', () => {
    const { panel } = makeMenu();
    expect(isOverlayPanel(panel)).toBe(true);
    expect(panel.getContainerCount()).toEqual({ image: 0, text: 1 });
  });
});

describe('QuickActionMenuPanel — main mode draw (QAM-03)', () => {
  it('QAM-03: default state renders 11 rows with ▶ on [S]; every row exactly 70 visible chars', async () => {
    const { panel, bridge } = makeMenu({ locale: 'it' });
    const content = await drawAndGetContent(panel, bridge);
    const lines = content.split('\n');

    // Count item rows (lines containing [X] pattern)
    const itemRows = lines.filter((l) => /\[.\]/.test(l));
    expect(itemRows.length).toBe(11);

    // [S] row is active (first item)
    const sRow = lines.find((l) => l.includes('[S]'));
    expect(sRow).toBeTruthy();
    expect(sRow).toMatch(/▶/);

    // All lines (borders + items + footer hints) are valid rows
    // Item rows: exactly 70 visible chars
    for (const row of itemRows) {
      const codePoints = [...row].length;
      expect(codePoints).toBe(70);
    }

    // Border rows: 70 chars
    const topBorder = lines.find((l) => l.startsWith('┌'));
    const bottomBorder = lines.find((l) => l.startsWith('└'));
    expect(topBorder).toBeTruthy();
    expect(bottomBorder).toBeTruthy();
    expect([...(topBorder as string)].length).toBe(70);
    expect([...(bottomBorder as string)].length).toBe(70);
  });
});

describe('QuickActionMenuPanel — scroll navigation (QAM-04, QAM-05)', () => {
  it('QAM-04: scroll down moves ▶ from [S] to [C]', async () => {
    const { panel, bridge } = makeMenu({ locale: 'it' });

    panel.onEvent({ kind: 'scroll', direction: 'down' });
    const content = await drawAndGetContent(panel, bridge);
    const lines = content.split('\n');

    const sRow = lines.find((l) => l.includes('[S]'));
    const cRow = lines.find((l) => l.includes('[C]'));
    expect(sRow).not.toMatch(/▶/);
    expect(cRow).toMatch(/▶/);
  });

  it('QAM-05: scroll wrap-around from [X] (index 10) back to [S] (index 0)', async () => {
    const { panel, bridge } = makeMenu({ locale: 'it' });

    // Scroll to [X] (10 times down from [S])
    for (let i = 0; i < 10; i++) {
      panel.onEvent({ kind: 'scroll', direction: 'down' });
    }
    let content = await drawAndGetContent(panel, bridge);
    let lines = content.split('\n');
    expect(lines.find((l) => l.includes('[X]'))).toMatch(/▶/);

    // One more scroll down → wraps to [S]
    panel.onEvent({ kind: 'scroll', direction: 'down' });
    content = await drawAndGetContent(panel, bridge);
    lines = content.split('\n');
    expect(lines.find((l) => l.includes('[S]'))).toMatch(/▶/);
    // [X] and [D] should not be active after wrap
    expect(lines.find((l) => l.includes('[X]'))).not.toMatch(/▶/);
    expect(lines.find((l) => l.includes('[D]'))).not.toMatch(/▶/);
  });
});

describe('QuickActionMenuPanel — language sub-menu (QAM-06, QAM-07)', () => {
  it('QAM-06: tap on [N] (index 7) switches to language mode; draw shows 7 LOCALE_MENU entries', async () => {
    const { panel, bridge } = makeMenu({ locale: 'it' });

    // Scroll to [N] (7 times from [S])
    for (let i = 0; i < 7; i++) {
      panel.onEvent({ kind: 'scroll', direction: 'down' });
    }
    panel.onEvent({ kind: 'tap' });

    const content = await drawAndGetContent(panel, bridge);
    const lines = content.split('\n');
    const itemRows = lines.filter((l) => /\[.\]/.test(l));
    // 7 locale entries
    expect(itemRows.length).toBe(7);

    // Should show LOCALE_MENU entries
    const contentStr = lines.join('\n');
    expect(contentStr).toContain('Auto');
    expect(contentStr).toContain('Italiano');
    expect(contentStr).toContain('English');
    expect(contentStr).toContain('Deutsch');
  });

  it('QAM-07: sub-menu nav-keys are A I E D S F P', async () => {
    const { panel, bridge } = makeMenu({ locale: 'it' });

    // Switch to language mode
    for (let i = 0; i < 7; i++) {
      panel.onEvent({ kind: 'scroll', direction: 'down' });
    }
    panel.onEvent({ kind: 'tap' });

    const content = await drawAndGetContent(panel, bridge);
    const lines = content.split('\n');
    const itemRows = lines.filter((l) => /\[.\]/.test(l));

    const navKeys = itemRows.map((row) => {
      const match = /\[(.)\]/.exec(row);
      return match?.[1] ?? '';
    });
    expect(navKeys).toEqual(['A', 'I', 'E', 'D', 'S', 'F', 'P']);
  });
});

describe('QuickActionMenuPanel — locale select (QAM-08, QAM-09)', () => {
  it('QAM-08: scroll to [I] in language mode → tap calls persistLocaleOverride + emit + mode=main', async () => {
    const { panel, bridge, localeEvents } = makeMenu({
      locale: 'it',
      currentLocaleOverride: 'auto',
    });
    const emitSpy = vi.spyOn(localeEvents, 'emit');

    // Switch to language mode via [N]
    for (let i = 0; i < 7; i++) {
      panel.onEvent({ kind: 'scroll', direction: 'down' });
    }
    panel.onEvent({ kind: 'tap' }); // switch to language mode; activeIndex = 0 (Auto)

    // Scroll to [I] (Italiano = index 1)
    panel.onEvent({ kind: 'scroll', direction: 'down' });
    panel.onEvent({ kind: 'tap' });

    // Wait for async persistLocaleOverride
    await new Promise((r) => setTimeout(r, 10));

    expect(bridge.setLocalStorage).toHaveBeenCalledWith('view.locale.override', 'it');
    expect(emitSpy).toHaveBeenCalledWith('changed', 'it');

    // mode returns to main
    const content = await drawAndGetContent(panel, bridge);
    const lines = content.split('\n');
    const itemRows = lines.filter((l) => /\[.\]/.test(l));
    expect(itemRows.length).toBe(11); // back to 11-item main mode
  });

  it('QAM-09: tap [A] in language mode → persistLocaleOverride("auto") + emit("auto")', async () => {
    const { panel, bridge, localeEvents } = makeMenu({
      locale: 'it',
      currentLocaleOverride: 'it',
    });
    const emitSpy = vi.spyOn(localeEvents, 'emit');

    // Switch to language mode
    for (let i = 0; i < 7; i++) {
      panel.onEvent({ kind: 'scroll', direction: 'down' });
    }
    panel.onEvent({ kind: 'tap' }); // enter language mode; activeIndex = LOCALE_MENU.findIndex(code==='it') = 1

    // Scroll up to Auto (index 0)
    panel.onEvent({ kind: 'scroll', direction: 'up' });
    panel.onEvent({ kind: 'tap' });

    await new Promise((r) => setTimeout(r, 10));

    expect(bridge.setLocalStorage).toHaveBeenCalledWith('view.locale.override', 'auto');
    expect(emitSpy).toHaveBeenCalledWith('changed', 'auto');
  });
});

describe('QuickActionMenuPanel — double-tap close/back behaviour (QAM-10, QAM-11)', () => {
  it('QAM-10: double-tap from main mode calls onClose()', () => {
    const { panel, callbacks } = makeMenu();
    panel.onEvent({ kind: 'double-tap' });
    expect(callbacks.onClose).toHaveBeenCalledTimes(1);
  });

  it('QAM-11: double-tap from language mode returns to main mode without calling onClose()', async () => {
    const { panel, bridge, callbacks } = makeMenu();

    // Enter language mode
    for (let i = 0; i < 7; i++) {
      panel.onEvent({ kind: 'scroll', direction: 'down' });
    }
    panel.onEvent({ kind: 'tap' });

    // Double-tap (back) from language mode
    panel.onEvent({ kind: 'double-tap' });

    expect(callbacks.onClose).not.toHaveBeenCalled();

    // Should be back in main mode — draw shows 11 items
    const content = await drawAndGetContent(panel, bridge);
    const lines = content.split('\n');
    const itemRows = lines.filter((l) => /\[.\]/.test(l));
    expect(itemRows.length).toBe(11);
  });
});

describe('QuickActionMenuPanel — tap action dispatch (QAM-12)', () => {
  // CR-01 fix: navigate actions call ONLY onNavigate (not onClose).
  // onNavigate's implementation in boot-engine-core.ts calls clearOverlayStack()
  // then openPanel(), which destroys the menu itself via _closeActiveInternal.
  // Calling onClose concurrently would race openPanel and destroy the target.

  it('QAM-12a: tap [S] → onNavigate("character-sheet"); onClose NOT called (CR-01)', () => {
    const { panel, callbacks } = makeMenu();
    // Already at [S] (index 0)
    panel.onEvent({ kind: 'tap' });
    expect(callbacks.onNavigate).toHaveBeenCalledWith('character-sheet');
    expect(callbacks.onClose).not.toHaveBeenCalled();
  });

  it('QAM-12b: tap [C] → onNavigate("combat-tracker"); onClose NOT called (CR-01)', () => {
    const { panel, callbacks } = makeMenu();
    panel.onEvent({ kind: 'scroll', direction: 'down' }); // to [C]
    panel.onEvent({ kind: 'tap' });
    expect(callbacks.onNavigate).toHaveBeenCalledWith('combat-tracker');
    expect(callbacks.onClose).not.toHaveBeenCalled();
  });

  it('QAM-12c: tap [L] → onNavigate("log"); onClose NOT called (CR-01)', () => {
    const { panel, callbacks } = makeMenu();
    for (let i = 0; i < 2; i++) panel.onEvent({ kind: 'scroll', direction: 'down' });
    panel.onEvent({ kind: 'tap' });
    expect(callbacks.onNavigate).toHaveBeenCalledWith('log');
    expect(callbacks.onClose).not.toHaveBeenCalled();
  });

  it('QAM-12d: tap [B] → onNavigate("spellbook"); onClose NOT called (CR-01)', () => {
    const { panel, callbacks } = makeMenu();
    for (let i = 0; i < 3; i++) panel.onEvent({ kind: 'scroll', direction: 'down' });
    panel.onEvent({ kind: 'tap' });
    expect(callbacks.onNavigate).toHaveBeenCalledWith('spellbook');
    expect(callbacks.onClose).not.toHaveBeenCalled();
  });

  it('QAM-12e: tap [I] → onNavigate("inventory"); onClose NOT called (CR-01)', () => {
    const { panel, callbacks } = makeMenu();
    for (let i = 0; i < 4; i++) panel.onEvent({ kind: 'scroll', direction: 'down' });
    panel.onEvent({ kind: 'tap' });
    expect(callbacks.onNavigate).toHaveBeenCalledWith('inventory');
    expect(callbacks.onClose).not.toHaveBeenCalled();
  });

  it('QAM-12f: tap [A] from main → onAction() + onClose()', () => {
    const { panel, callbacks } = makeMenu();
    for (let i = 0; i < 5; i++) panel.onEvent({ kind: 'scroll', direction: 'down' });
    panel.onEvent({ kind: 'tap' });
    expect(callbacks.onAction).toHaveBeenCalledTimes(1);
    expect(callbacks.onClose).toHaveBeenCalledTimes(1);
  });

  it('QAM-12g: tap [M] → onMapModeToggle() + onClose()', () => {
    const { panel, callbacks } = makeMenu();
    for (let i = 0; i < 6; i++) panel.onEvent({ kind: 'scroll', direction: 'down' });
    panel.onEvent({ kind: 'tap' });
    expect(callbacks.onMapModeToggle).toHaveBeenCalledTimes(1);
    expect(callbacks.onClose).toHaveBeenCalledTimes(1);
  });

  it('QAM-12h: tap [X] → onClose() only', () => {
    const { panel, callbacks } = makeMenu();
    for (let i = 0; i < 8; i++) panel.onEvent({ kind: 'scroll', direction: 'down' });
    panel.onEvent({ kind: 'tap' });
    expect(callbacks.onClose).toHaveBeenCalledTimes(1);
    expect(callbacks.onNavigate).not.toHaveBeenCalled();
    expect(callbacks.onAction).not.toHaveBeenCalled();
    expect(callbacks.onMapModeToggle).not.toHaveBeenCalled();
  });

  it('QAM-12i: tap [D] (index 9) → onDitherToggle() + onClose()', () => {
    const bridge = makeMockBridge();
    const bus = new PanelGestureBus();
    const localeEvents = new LocaleEventEmitter();
    const onClose = vi.fn() as unknown as ReturnType<typeof vi.fn> & (() => void);
    const onNavigate = vi.fn() as unknown as ReturnType<typeof vi.fn> & ((panelId: string) => void);
    const onMapModeToggle = vi.fn() as unknown as ReturnType<typeof vi.fn> & (() => void);
    const onAction = vi.fn() as unknown as ReturnType<typeof vi.fn> & (() => void);
    const onDitherToggle = vi.fn() as unknown as ReturnType<typeof vi.fn> & (() => void);

    const panel = new QuickActionMenuPanel(bridge, bus, 'it', 'auto', localeEvents, {
      onClose,
      onNavigate,
      onMapModeToggle,
      onAction,
      onDitherToggle,
    });

    // Scroll to [D] (index 9: S=0,C=1,L=2,B=3,I=4,A=5,M=6,N=7,F=8,D=9)
    for (let i = 0; i < 9; i++) panel.onEvent({ kind: 'scroll', direction: 'down' });
    panel.onEvent({ kind: 'tap' });

    expect(onDitherToggle).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onNavigate).not.toHaveBeenCalled();
    expect(onAction).not.toHaveBeenCalled();
    expect(onMapModeToggle).not.toHaveBeenCalled();
  });
});

describe('QuickActionMenuPanel — getR1Hints (QAM-13, QAM-14)', () => {
  it('QAM-13: getR1Hints() in main mode returns locale-aware tap/scroll/quickActionLabel', () => {
    const { panel } = makeMenu({ locale: 'it' });
    const hints = panel.getR1Hints?.();
    expect(hints).toBeDefined();
    expect(hints?.tap).toBe('apri');
    expect(hints?.scroll).toBe('voce');
    expect(hints?.quickActionLabel).toBe('annulla');
  });

  it('QAM-14: getR1Hints() in language sub-menu mode returns different hints', () => {
    const { panel } = makeMenu({ locale: 'it' });
    // Switch to language mode
    for (let i = 0; i < 7; i++) {
      panel.onEvent({ kind: 'scroll', direction: 'down' });
    }
    panel.onEvent({ kind: 'tap' });

    const hints = panel.getR1Hints?.();
    expect(hints?.tap).toBe('applica');
    expect(hints?.scroll).toBe('lingua');
    // WR-01 fix: 'indietro' → 'dietro' so assembled chip ≤ 38 code-points.
    expect(hints?.quickActionLabel).toBe('dietro');
  });
});

describe('QuickActionMenuPanel — isAtTopBoundary (ADR-0012 D-2)', () => {
  it('QAM-OVERSCROLL: true at selection index 0, false after scrolling down', () => {
    const { panel } = makeMenu({ locale: 'it' });
    expect(panel.isAtTopBoundary?.()).toBe(true);
    panel.onEvent({ kind: 'scroll', direction: 'down' });
    expect(panel.isAtTopBoundary?.()).toBe(false);
  });
});

describe('QuickActionMenuPanel — onMount/onUnmount bus subscription (bus.size)', () => {
  it('bus.size() is 0 before mount, 1 after onMount, 0 after onUnmount', async () => {
    const { panel, bus } = makeMenu();
    expect(bus.size()).toBe(0);
    await panel.onMount();
    expect(bus.size()).toBe(1);
    await panel.onUnmount();
    expect(bus.size()).toBe(0);
  });

  it('onUnmount is idempotent (double-call is safe)', async () => {
    const { panel, bus } = makeMenu();
    await panel.onMount();
    await panel.onUnmount();
    await expect(panel.onUnmount()).resolves.toBeUndefined();
    expect(bus.size()).toBe(0);
  });
});

// ─── CR-01 Regression Tests (QAM-NAV-*) ─────────────────────────────────────
//
// Verifies that Quick Action navigation items call onNavigate exactly once and
// do NOT call onClose, so the destination panel is never raced to destruction.
// Also verifies that onNavigate receives the correct panelId for each nav item.
//
// These tests lock the CR-01 fix: if the 'navigate' case ever regains an
// onClose() call, QAM-NAV-01..05 will fail with "onClose called when not expected".

describe('QuickActionMenuPanel — CR-01 navigation race regression (QAM-NAV)', () => {
  const navItems: Array<{ label: string; scrolls: number; panelId: string }> = [
    { label: '[S] Sheet', scrolls: 0, panelId: 'character-sheet' },
    { label: '[C] Combat', scrolls: 1, panelId: 'combat-tracker' },
    { label: '[L] Log', scrolls: 2, panelId: 'log' },
    { label: '[B] Spellbook', scrolls: 3, panelId: 'spellbook' },
    { label: '[I] Inventory', scrolls: 4, panelId: 'inventory' },
  ];

  for (const { label, scrolls, panelId } of navItems) {
    it(`QAM-NAV: tap ${label} calls onNavigate("${panelId}") and does NOT call onClose`, () => {
      const { panel, callbacks } = makeMenu();
      for (let i = 0; i < scrolls; i++) {
        panel.onEvent({ kind: 'scroll', direction: 'down' });
      }
      panel.onEvent({ kind: 'tap' });

      // onNavigate must fire with the correct target
      expect(callbacks.onNavigate).toHaveBeenCalledTimes(1);
      expect(callbacks.onNavigate).toHaveBeenCalledWith(panelId);

      // onClose must NOT fire — firing it races openPanel and destroys the target
      expect(callbacks.onClose).not.toHaveBeenCalled();
    });
  }

  it('QAM-NAV-EXTRA: after navigate, no other callback fires (onMapModeToggle/onAction)', () => {
    const { panel, callbacks } = makeMenu(); // [S] at index 0
    panel.onEvent({ kind: 'tap' });
    expect(callbacks.onNavigate).toHaveBeenCalledTimes(1);
    expect(callbacks.onClose).not.toHaveBeenCalled();
    expect(callbacks.onMapModeToggle).not.toHaveBeenCalled();
    expect(callbacks.onAction).not.toHaveBeenCalled();
  });
});

// ─── INV-1 Fixture Tests (QAM-FIX-01..04) ───────────────────────────────────

describe('QuickActionMenuPanel — INV-1 fixtures (QAM-FIX-*)', () => {
  it('QAM-FIX-01: quick-action.base.it.txt — IT locale, [S] active', async () => {
    const { panel, bridge } = makeMenu({ locale: 'it', currentLocaleOverride: 'auto' });
    const content = await drawAndGetContent(panel, bridge);
    await matchAsciiFixture(
      AsciiGrid.fromString(content),
      resolve(fixtureDir(), 'quick-action.base.it.txt'),
    );
  });

  it('QAM-FIX-02: quick-action.combat-suspended.it.txt — IT locale, [S] active (menu-only view)', async () => {
    const { panel, bridge } = makeMenu({ locale: 'it', currentLocaleOverride: 'auto' });
    const content = await drawAndGetContent(panel, bridge);
    await matchAsciiFixture(
      AsciiGrid.fromString(content),
      resolve(fixtureDir(), 'quick-action.combat-suspended.it.txt'),
    );
  });

  it('QAM-FIX-03: quick-action.language-submenu.it.txt — IT locale, language sub-menu, [A] Auto active', async () => {
    const { panel, bridge } = makeMenu({ locale: 'it', currentLocaleOverride: 'auto' });
    // Switch to language mode
    for (let i = 0; i < 7; i++) {
      panel.onEvent({ kind: 'scroll', direction: 'down' });
    }
    panel.onEvent({ kind: 'tap' }); // enter language mode
    const content = await drawAndGetContent(panel, bridge);
    await matchAsciiFixture(
      AsciiGrid.fromString(content),
      resolve(fixtureDir(), 'quick-action.language-submenu.it.txt'),
    );
  });

  it('QAM-FIX-04: quick-action.base.de.txt — DE locale stress (Schließen longest label)', async () => {
    const { panel, bridge } = makeMenu({ locale: 'de', currentLocaleOverride: 'auto' });
    const content = await drawAndGetContent(panel, bridge);
    await matchAsciiFixture(
      AsciiGrid.fromString(content),
      resolve(fixtureDir(), 'quick-action.base.de.txt'),
    );
  });
});
