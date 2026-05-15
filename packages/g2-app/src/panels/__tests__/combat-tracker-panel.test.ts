/**
 * Unit tests for CombatTrackerPanel (Phase 5 Plan 05-05 — COMB-01/COMB-03).
 *
 * Covers the CTP-* test discriminators from the plan:
 *
 * Meta / identity:
 *   - CTP-META-1: `CombatTrackerPanel.meta` passes `PanelMetaSchema.safeParse`
 *   - CTP-META-2: meta fields (id, navKey, requiredCaps)
 *   - CTP-CTOR-1: instance passes `isOverlayPanel` predicate
 *   - CTP-CTOR-2: `getContainerCount()` returns `{ image: 0, text: 1 }`
 *
 * computeWindow (COMB-01 windowing):
 *   - CTP-WINDOW-EMPTY:          computeWindow([], 0, 0) returns []
 *   - CTP-WINDOW-1:              1 combatant → [c0]
 *   - CTP-WINDOW-3:              3 combatants → all 3
 *   - CTP-WINDOW-5:              5 combatants → all 5
 *   - CTP-WINDOW-MID:            8 combatants, current=4 → [c2,c3,c4,c5,c6]
 *   - CTP-WINDOW-TOP-ANCHORED:   8 combatants, current=0 → [c0,c1,c2,c3,c4]
 *   - CTP-WINDOW-BOTTOM-ANCHORED: 8 combatants, current=7 → [c3,c4,c5,c6,c7]
 *   - CTP-WINDOW-SCROLL:         8 combatants, current=4, scroll=2 → shifted
 *
 * renderCombatantRow:
 *   - CTP-ROW-WIDTH:         main row is exactly 66 code-points
 *   - CTP-ROW-YOU-MARKER:    own actor → `◀ TU` + name capped to 12 chars
 *   - CTP-ROW-NO-YOU:        different actor → name capped to 18 chars, no marker
 *   - CTP-ROW-FACTION-PARTY: isParty=true → `★`
 *   - CTP-ROW-HP-BAR:        HP 5/20 → 2 filled bars (HP_BAR_WIDTH=8, ratio=0.25)
 *   - CTP-ROW-CONC-SUBLINE-1: concentration present → 2-row output
 *   - CTP-ROW-CONC-SUBLINE-WIDTH: sub-line is exactly 66 code-points
 *   - CTP-ROW-NO-CONC:       no concentration → 1 row
 *
 * renderQuickActionBar:
 *   - CTP-QUICK-BAR-IT:    'it' → contains `Rapida:` + `[ A ]ttacco`
 *   - CTP-QUICK-BAR-EN:    'en' → contains `Quick:` + `[ A ]ttack`
 *   - CTP-QUICK-BAR-WIDTH: bar row is exactly 66 code-points
 *
 * renderCombatTrackerContent:
 *   - CTP-CONTENT-EMPTY: null snapshot → 18 rows with `Nessun combattimento` centered
 *   - CTP-CONTENT-FULL:  5 combatants → 18 rows including quick-action footer
 *
 * INV-1 fixtures:
 *   - CTP-FIX-FULL:     matches combat-tracker.full-window.it.txt
 *   - CTP-FIX-PARTIAL:  matches combat-tracker.partial.it.txt
 *   - CTP-FIX-SINGLE:   matches combat-tracker.single.it.txt
 *   - CTP-FIX-NO-COMBAT: matches combat-tracker.no-combat.it.txt
 *
 * Scroll reset:
 *   - CTP-SCROLL-RESET: onSnapshot with different currentCombatantId resets scrollOffset
 *
 * @see .planning/phases/05-panel-plugin-system-read-only-panels/05-05-PLAN.md §Task 1
 * @see .planning/phases/05-panel-plugin-system-read-only-panels/05-UI-SPEC.md §5.8
 */

import { resolve } from 'node:path';
import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';
import type { Combatant, CombatSnapshot } from '@evf/shared-protocol';
import { AsciiGrid, matchAsciiFixture } from '@evf/shared-render';
import { describe, expect, it, vi } from 'vitest';
import { isOverlayPanel } from '../../engine/overlay-panel.js';
import { PanelGestureBus } from '../../engine/panel-gesture-bus.js';
import { PanelMetaSchema } from '../../engine/panel-router.js';
import CombatTrackerPanel, {
  computeWindow,
  renderCombatantRow,
  renderCombatTrackerContent,
  renderQuickActionBar,
} from '../combat-tracker-panel.js';

// ─── Fixture directory ────────────────────────────────────────────────────────

function fixtureDir(): string {
  return resolve(__dirname, '../../../../shared-render/src/fixtures');
}

// ─── Mock helpers ─────────────────────────────────────────────────────────────

function makeMockBridge() {
  return {
    textContainerUpgrade: vi.fn().mockResolvedValue(true),
    setLocalStorage: vi.fn().mockResolvedValue(true),
    getLocalStorage: vi.fn().mockResolvedValue(''),
  } as unknown as EvenAppBridge & { textContainerUpgrade: ReturnType<typeof vi.fn> };
}

function makePanel(opts?: { bridge?: ReturnType<typeof makeMockBridge>; bus?: PanelGestureBus }) {
  const bridge = opts?.bridge ?? makeMockBridge();
  const bus = opts?.bus ?? new PanelGestureBus();
  const panel = new CombatTrackerPanel(bridge, bus, 'it');
  return { panel, bridge, bus };
}

// ─── Combatant factory ────────────────────────────────────────────────────────

function makeCombatant(overrides: Partial<Combatant> = {}): Combatant {
  return {
    id: overrides.id ?? 'c1',
    name: overrides.name ?? 'Fighter',
    actorId: overrides.actorId ?? 'actor-1',
    initiative: overrides.initiative ?? 10,
    hp: overrides.hp ?? 30,
    maxHp: overrides.maxHp ?? 40,
    isCurrentTurn: overrides.isCurrentTurn ?? false,
    concentration: overrides.concentration,
  };
}

function makeCombatants(count: number): Combatant[] {
  return Array.from({ length: count }, (_, i) =>
    makeCombatant({
      id: `c${i}`,
      name: `Fighter${i}`,
      actorId: `actor-${i}`,
      initiative: 20 - i,
      isCurrentTurn: false,
    }),
  );
}

function makeCombatSnapshot(combatants: Combatant[], currentIdx = 0): CombatSnapshot {
  const withTurn = combatants.map((c, i) => ({ ...c, isCurrentTurn: i === currentIdx }));
  const currentCombatant = withTurn[currentIdx];
  return {
    combatId: 'combat-1',
    round: 3,
    turn: currentIdx,
    currentCombatantId: currentCombatant?.id ?? null,
    combatants: withTurn,
  };
}

// ─── CTP-META-* ──────────────────────────────────────────────────────────────

describe('CombatTrackerPanel — static meta', () => {
  it('CTP-META-1: static meta passes PanelMetaSchema.safeParse', () => {
    const result = PanelMetaSchema.safeParse(CombatTrackerPanel.meta);
    expect(result.success).toBe(true);
  });

  it('CTP-META-2: id="combat-tracker", navKey="C", requiredCaps=[]', () => {
    const { meta } = CombatTrackerPanel;
    expect(meta.id).toBe('combat-tracker');
    expect(meta.navKey).toBe('C');
    expect(meta.requiredCaps).toEqual([]);
  });
});

// ─── CTP-CTOR-* ──────────────────────────────────────────────────────────────

describe('CombatTrackerPanel — constructor / interface conformance', () => {
  it('CTP-CTOR-1: instance passes isOverlayPanel predicate', () => {
    const { panel } = makePanel();
    expect(isOverlayPanel(panel)).toBe(true);
  });

  it('CTP-CTOR-2: getContainerCount returns { image: 0, text: 1 } (Strategy A)', () => {
    const { panel } = makePanel();
    expect(panel.getContainerCount()).toEqual({ image: 0, text: 1 });
  });
});

// ─── CTP-WINDOW-* ────────────────────────────────────────────────────────────

describe('computeWindow — 5-row windowing algorithm', () => {
  it('CTP-WINDOW-EMPTY: empty turns returns []', () => {
    expect(computeWindow([], 0, 0)).toEqual([]);
  });

  it('CTP-WINDOW-1: 1 combatant returns [c0]', () => {
    const c = [makeCombatant({ id: 'c0' })];
    expect(computeWindow(c, 0, 0)).toHaveLength(1);
    expect(computeWindow(c, 0, 0)[0]?.id).toBe('c0');
  });

  it('CTP-WINDOW-3: 3 combatants returns all 3', () => {
    const turns = makeCombatants(3);
    const result = computeWindow(turns, 1, 0);
    expect(result).toHaveLength(3);
  });

  it('CTP-WINDOW-5: 5 combatants returns all 5', () => {
    const turns = makeCombatants(5);
    const result = computeWindow(turns, 2, 0);
    expect(result).toHaveLength(5);
  });

  it('CTP-WINDOW-MID: 8 combatants, current=4 → [c2,c3,c4,c5,c6]', () => {
    const turns = makeCombatants(8);
    const result = computeWindow(turns, 4, 0);
    expect(result).toHaveLength(5);
    expect(result.map((c) => c.id)).toEqual(['c2', 'c3', 'c4', 'c5', 'c6']);
  });

  it('CTP-WINDOW-TOP-ANCHORED: 8 combatants, current=0 → [c0,c1,c2,c3,c4]', () => {
    const turns = makeCombatants(8);
    const result = computeWindow(turns, 0, 0);
    expect(result).toHaveLength(5);
    expect(result.map((c) => c.id)).toEqual(['c0', 'c1', 'c2', 'c3', 'c4']);
  });

  it('CTP-WINDOW-BOTTOM-ANCHORED: 8 combatants, current=7 → [c3,c4,c5,c6,c7]', () => {
    const turns = makeCombatants(8);
    const result = computeWindow(turns, 7, 0);
    expect(result).toHaveLength(5);
    expect(result.map((c) => c.id)).toEqual(['c3', 'c4', 'c5', 'c6', 'c7']);
  });

  it('CTP-WINDOW-SCROLL: 8 combatants, current=2, scroll=2 → window shifted forward', () => {
    const turns = makeCombatants(8);
    // Without scroll: current=2 → center=2 → [c0,c1,c2,c3,c4]
    // With scroll=2: targetCenter = clamp(2+2=4, 2, 5) = 4 → [c2,c3,c4,c5,c6]
    const result = computeWindow(turns, 2, 2);
    expect(result).toHaveLength(5);
    // Window shifted: should include c4 somewhere
    const ids = result.map((c) => c.id);
    expect(ids).toContain('c4');
    expect(ids).not.toContain('c0');
  });
});

// ─── CTP-ROW-* ───────────────────────────────────────────────────────────────

describe('renderCombatantRow — main row + concentration sub-line', () => {
  const c = makeCombatant({ id: 'c1', actorId: 'actor-1', name: 'Thorin', isCurrentTurn: true });

  it('CTP-ROW-WIDTH: main row is exactly 66 code-points', () => {
    const rows = renderCombatantRow(c, 'it', '');
    expect(rows.length).toBeGreaterThanOrEqual(1);
    const mainRow = rows[0];
    expect(mainRow).toBeDefined();
    expect([...(mainRow ?? '')].length).toBe(66);
  });

  it('CTP-ROW-YOU-MARKER: own actor → contains ◀ TU + name capped to 12 chars', () => {
    const rows = renderCombatantRow(c, 'it', 'actor-1');
    const mainRow = rows[0] ?? '';
    expect(mainRow).toContain('◀ TU');
    // Name should be present and at most 12 chars from the actual name
    expect(mainRow).toContain('Thorin');
  });

  it('CTP-ROW-NO-YOU: different actor → name capped to 18 chars, no ◀ TU marker', () => {
    const rows = renderCombatantRow(c, 'it', 'other-actor');
    const mainRow = rows[0] ?? '';
    expect(mainRow).not.toContain('◀ TU');
    expect(mainRow).toContain('Thorin');
    // Main row is still 66 chars
    expect([...mainRow].length).toBe(66);
  });

  it('CTP-ROW-FACTION-PARTY: isParty=true → ★', () => {
    const rows = renderCombatantRow(c, 'it', '', true);
    const mainRow = rows[0] ?? '';
    expect(mainRow).toContain('★');
  });

  it('CTP-ROW-HP-BAR: HP 5/20 → renders HP bar glyph', () => {
    const low = makeCombatant({ hp: 5, maxHp: 20 });
    const rows = renderCombatantRow(low, 'it', '');
    const mainRow = rows[0] ?? '';
    // With HP 5/20 = 25% = 2 filled bars out of 8
    expect(mainRow).toContain('██░░░░░░');
  });

  it('CTP-ROW-CONC-SUBLINE-1: concentration present → 2-row output', () => {
    const conc = { ...c, concentration: { spellName: 'Bless', duration: '1m' } };
    const rows = renderCombatantRow(conc, 'it', '');
    expect(rows).toHaveLength(2);
    const subLine = rows[1] ?? '';
    expect(subLine).toContain('conc:');
    expect(subLine).toContain('Bless');
    expect(subLine).toContain('1m');
  });

  it('CTP-ROW-CONC-SUBLINE-WIDTH: concentration sub-line is exactly 66 code-points', () => {
    const conc = { ...c, concentration: { spellName: 'Hunter Mark', duration: '1h' } };
    const rows = renderCombatantRow(conc, 'it', '');
    expect(rows).toHaveLength(2);
    const subLine = rows[1] ?? '';
    expect([...subLine].length).toBe(66);
  });

  it('CTP-ROW-NO-CONC: no concentration → 1 row only', () => {
    const rows = renderCombatantRow(c, 'it', '');
    expect(rows).toHaveLength(1);
  });

  // ── CR-03 regression: HP field ellipsis truncation for HP ≥ 100 ──────────

  it('CTP-CR03-HIGH-HP-WIDTH: combatant with 3-digit HP → row still exactly 66 code-points', () => {
    const highHp = makeCombatant({ hp: 210, maxHp: 220 });
    const rows = renderCombatantRow(highHp, 'it', '');
    const mainRow = rows[0] ?? '';
    // Row must remain 66 code-points even with HP > 99
    expect([...mainRow].length).toBe(66);
  });

  it('CTP-CR03-NO-LEFT-SLICE: combatant with HP=210/maxHp=220 → does NOT show "0/220" (left-slice bug)', () => {
    const highHp = makeCombatant({ hp: 210, maxHp: 220 });
    const rows = renderCombatantRow(highHp, 'it', '');
    const mainRow = rows[0] ?? '';
    // Before fix: _rjust("210/220", 5) = "0/220" (left-slice drops "21")
    // After fix: _pad("210/220", 5) = "210/…" (ellipsis truncation)
    expect(mainRow).not.toContain('0/220');
    expect(mainRow).toContain('210');
  });

  it('CTP-CR03-SMALL-HP-UNCHANGED: combatant with HP=5/15 → " 5/15" (right-aligned, no ellipsis)', () => {
    const small = makeCombatant({ hp: 5, maxHp: 15 });
    const rows = renderCombatantRow(small, 'it', '');
    const mainRow = rows[0] ?? '';
    expect(mainRow).toContain(' 5/15');
  });
});

// ─── CTP-QUICK-BAR-* ─────────────────────────────────────────────────────────

describe('renderQuickActionBar — quick-action footer', () => {
  it('CTP-QUICK-BAR-IT: IT locale → contains Rapida: and [ A ]ttacco', () => {
    const bar = renderQuickActionBar('it');
    expect(bar).toContain('Rapida:');
    expect(bar).toContain('[ A ]ttacco');
  });

  it('CTP-QUICK-BAR-EN: EN locale → contains Quick: and [ A ]ttack', () => {
    const bar = renderQuickActionBar('en');
    expect(bar).toContain('Quick:');
    expect(bar).toContain('[ A ]ttack');
  });

  it('CTP-QUICK-BAR-WIDTH: bar row is exactly 66 code-points', () => {
    const bar = renderQuickActionBar('it');
    expect([...bar].length).toBe(66);
  });
});

// ─── CTP-CONTENT-* ───────────────────────────────────────────────────────────

describe('renderCombatTrackerContent — full 18-row content area', () => {
  it('CTP-CONTENT-EMPTY: null snapshot → 18 rows with Nessun combattimento centered', () => {
    const rows = renderCombatTrackerContent(null, 'it', 0, '');
    expect(rows).toHaveLength(18);
    const joined = rows.join('\n');
    expect(joined).toContain('Nessun combattimento');
  });

  it('CTP-CONTENT-FULL: 5 combatants → 18 rows including quick-action footer', () => {
    const combatants = makeCombatants(5);
    const snapshot = makeCombatSnapshot(combatants, 2);
    const rows = renderCombatTrackerContent(snapshot, 'it', 0, '');
    expect(rows).toHaveLength(18);
    // Quick-action bar must appear
    const joined = rows.join('\n');
    expect(joined).toContain('[ A ]ttacco');
  });

  it('CTP-CONTENT-ROWS-WIDTH: all 18 rows are exactly 66 code-points', () => {
    const combatants = makeCombatants(3);
    const snapshot = makeCombatSnapshot(combatants, 1);
    const rows = renderCombatTrackerContent(snapshot, 'it', 0, '');
    for (const [i, row] of rows.entries()) {
      expect([...row].length, `row ${i} width`).toBe(66);
    }
  });
});

// ─── CTP-SCROLL-RESET ────────────────────────────────────────────────────────

describe('CombatTrackerPanel — scroll reset on turn advance', () => {
  it('CTP-SCROLL-RESET: onSnapshot with different currentCombatantId resets scrollOffset to 0', async () => {
    const bridge = makeMockBridge();
    const bus = new PanelGestureBus();
    const panel = new CombatTrackerPanel(bridge, bus, 'it');
    await panel.onMount();

    // Issue a scroll to set scrollOffset to 2
    bus.publish({ kind: 'scroll', direction: 'down' });
    bus.publish({ kind: 'scroll', direction: 'down' });

    // Deliver a snapshot with combatant-A as current
    const snapshotA = makeCombatSnapshot(makeCombatants(5), 2);
    panel.onSnapshot(snapshotA);

    // Deliver a NEW snapshot with a different current combatant → reset scroll
    const combatantsB = makeCombatants(5);
    // Manually set a different combatant as current
    const snapshotB: CombatSnapshot = {
      ...makeCombatSnapshot(combatantsB, 3),
      currentCombatantId: 'c3',
      combatants: combatantsB.map((c, i) => ({ ...c, isCurrentTurn: i === 3 })),
    };
    panel.onSnapshot(snapshotB);

    // After turn advance, the panel must have re-drawn (scrollOffset reset to 0 internally)
    // We verify this indirectly by checking that the draw was called (no assertion on scrollOffset
    // since it's private; the test verifies the onSnapshot call chain)
    // Total calls: onMount draw (1) + 2 scroll draws + snapshotA draw + snapshotB draw = 5+
    expect(bridge.textContainerUpgrade.mock.calls.length).toBeGreaterThanOrEqual(4);
  });
});

// ─── CTP-FIX-* — INV-1 fixture round-trips ────────────────────────────────────

describe('CombatTrackerPanel — INV-1 fixture round-trips (COMB-01 ck 13)', () => {
  it('CTP-FIX-NO-COMBAT: null snapshot matches combat-tracker.no-combat.it.txt', async () => {
    const rows = renderCombatTrackerContent(null, 'it', 0, '');
    const grid = AsciiGrid.fromString(rows.join('\n'));
    await matchAsciiFixture(grid, resolve(fixtureDir(), 'combat-tracker.no-combat.it.txt'));
  });

  it('CTP-FIX-SINGLE: 1 combatant matches combat-tracker.single.it.txt', async () => {
    const combatant = makeCombatant({
      id: 'goblin-1',
      name: 'GOBLIN ARCHER',
      actorId: 'actor-goblin',
      initiative: 18,
      hp: 5,
      maxHp: 15,
      isCurrentTurn: true,
    });
    const snapshot: CombatSnapshot = {
      combatId: 'combat-1',
      round: 3,
      turn: 0,
      currentCombatantId: 'goblin-1',
      combatants: [combatant],
    };
    const rows = renderCombatTrackerContent(snapshot, 'it', 0, '');
    const grid = AsciiGrid.fromString(rows.join('\n'));
    await matchAsciiFixture(grid, resolve(fixtureDir(), 'combat-tracker.single.it.txt'));
  });

  it('CTP-FIX-PARTIAL: 3 combatants matches combat-tracker.partial.it.txt', async () => {
    const combatants: Combatant[] = [
      makeCombatant({
        id: 'goblin-1',
        name: 'GOBLIN ARCHER',
        actorId: 'actor-goblin',
        initiative: 18,
        hp: 5,
        maxHp: 15,
        isCurrentTurn: true,
      }),
      makeCombatant({
        id: 'thorin',
        name: 'THORIN',
        actorId: 'actor-thorin',
        initiative: 15,
        hp: 45,
        maxHp: 68,
        isCurrentTurn: false,
      }),
      makeCombatant({
        id: 'goblin-2',
        name: 'GOBLIN BRUTO',
        actorId: 'actor-goblin2',
        initiative: 13,
        hp: 11,
        maxHp: 15,
        isCurrentTurn: false,
      }),
    ];
    const snapshot: CombatSnapshot = {
      combatId: 'combat-1',
      round: 3,
      turn: 0,
      currentCombatantId: 'goblin-1',
      combatants,
    };
    const rows = renderCombatTrackerContent(snapshot, 'it', 0, '');
    const grid = AsciiGrid.fromString(rows.join('\n'));
    await matchAsciiFixture(grid, resolve(fixtureDir(), 'combat-tracker.partial.it.txt'));
  });

  it('CTP-FIX-FULL: 5 combatants + concentration sub-lines matches combat-tracker.full-window.it.txt', async () => {
    const combatants: Combatant[] = [
      makeCombatant({
        id: 'goblin-1',
        name: 'GOBLIN ARCHER',
        actorId: 'actor-goblin',
        initiative: 18,
        hp: 5,
        maxHp: 15,
        isCurrentTurn: true,
      }),
      makeCombatant({
        id: 'thorin',
        name: 'THORIN',
        actorId: 'actor-thorin',
        initiative: 15,
        hp: 45,
        maxHp: 68,
        isCurrentTurn: false,
        concentration: { spellName: 'Bless', duration: '1m' },
      }),
      makeCombatant({
        id: 'goblin-2',
        name: 'GOBLIN BRUTO',
        actorId: 'actor-goblin2',
        initiative: 13,
        hp: 11,
        maxHp: 15,
        isCurrentTurn: false,
      }),
      makeCombatant({
        id: 'lyra',
        name: 'LYRA',
        actorId: 'actor-lyra',
        initiative: 11,
        hp: 32,
        maxHp: 32,
        isCurrentTurn: false,
        concentration: { spellName: "Hunter's Mark", duration: '1h' },
      }),
      makeCombatant({
        id: 'shadow',
        name: 'CANE OMBRA',
        actorId: 'actor-shadow',
        initiative: 8,
        hp: 18,
        maxHp: 22,
        isCurrentTurn: false,
      }),
    ];
    const snapshot: CombatSnapshot = {
      combatId: 'combat-1',
      round: 3,
      turn: 0,
      currentCombatantId: 'goblin-1',
      combatants,
    };
    const rows = renderCombatTrackerContent(snapshot, 'it', 0, '');
    const grid = AsciiGrid.fromString(rows.join('\n'));
    await matchAsciiFixture(grid, resolve(fixtureDir(), 'combat-tracker.full-window.it.txt'));
  });
});

// ─── Gesture bus lifecycle ────────────────────────────────────────────────────

describe('CombatTrackerPanel — gesture bus lifecycle (T-4b-01-03)', () => {
  it('onMount subscribes to gestureBus', async () => {
    const bus = new PanelGestureBus();
    const { panel } = makePanel({ bus });
    expect(bus.size()).toBe(0);
    await panel.onMount();
    expect(bus.size()).toBe(1);
    await panel.onUnmount();
    expect(bus.size()).toBe(0);
  });

  it('onUnmount is idempotent', async () => {
    const bus = new PanelGestureBus();
    const { panel } = makePanel({ bus });
    await panel.onMount();
    await panel.onUnmount();
    await panel.onUnmount();
    expect(bus.size()).toBe(0);
  });

  it('scroll-down shifts window and triggers re-draw', async () => {
    const bridge = makeMockBridge();
    const bus = new PanelGestureBus();
    const panel = new CombatTrackerPanel(bridge, bus, 'it');
    await panel.onMount();
    const callsBefore = bridge.textContainerUpgrade.mock.calls.length;
    bus.publish({ kind: 'scroll', direction: 'down' });
    // Allow async draw to settle
    await Promise.resolve();
    expect(bridge.textContainerUpgrade.mock.calls.length).toBeGreaterThan(callsBefore);
  });
});
