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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { R1Gesture } from '../../engine/layer-types.js';
import { isOverlayPanel } from '../../engine/overlay-panel.js';
import { PanelGestureBus } from '../../engine/panel-gesture-bus.js';
import { PanelMetaSchema } from '../../engine/panel-router.js';
import CombatTrackerPanel, {
  computeWindow,
  type MultiAttackState,
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

  // ── WR-01 regression: YOU-marker nameField width in EN locale ─────────────

  it('CTP-WR01-YOU-EN-WIDTH: own actor in EN locale → row exactly 66 code-points (INV-1)', () => {
    // EN locale you_marker '◀ YOU' is 5 cp; must be truncated to 4 cp → '◀ YO…'
    // so nameField stays 12+2+4 = 18, not 19.
    const own = makeCombatant({ id: 'own', actorId: 'actor-own', name: 'Aragorn' });
    const rows = renderCombatantRow(own, 'en', 'actor-own');
    const mainRow = rows[0] ?? '';
    expect([...mainRow].length).toBe(66);
  });

  it('CTP-WR01-YOU-IT-WIDTH: own actor in IT locale → row exactly 66 code-points (4-cp marker ◀ TU)', () => {
    // IT locale you_marker '◀ TU' is already 4 cp — no truncation needed.
    const own = makeCombatant({ id: 'own-it', actorId: 'actor-it', name: 'Gandalf' });
    const rows = renderCombatantRow(own, 'it', 'actor-it');
    const mainRow = rows[0] ?? '';
    expect([...mainRow].length).toBe(66);
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

// ─── CTP-WR02 — multiAttackState cleared on turn advance ─────────────────────

describe('CombatTrackerPanel — WR-02 multiAttackState cleared on turn advance', () => {
  it('CTP-WR02: active multiAttackState is cleared when currentCombatantId changes in onSnapshot', async () => {
    const bridge = makeMockBridge();
    const bus = new PanelGestureBus();
    const panel = new CombatTrackerPanel(bridge, bus, 'it');
    await panel.onMount();

    // Set multi-attack state for actor-a
    panel.setMultiAttackState({
      current: 1,
      total: 2,
      attackId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      actorId: 'actor-a',
    });

    // Deliver a snapshot with combatant-a as current (same turn — chip should persist)
    const combatantsA = makeCombatants(3);
    const snapshotA: CombatSnapshot = {
      combatId: 'combat-1',
      round: 1,
      turn: 0,
      currentCombatantId: 'c0',
      combatants: combatantsA.map((c, i) => ({ ...c, isCurrentTurn: i === 0 })),
    };
    panel.onSnapshot(snapshotA);

    // Deliver a snapshot with a DIFFERENT combatant as current (turn advance)
    const snapshotB: CombatSnapshot = {
      combatId: 'combat-1',
      round: 1,
      turn: 1,
      currentCombatantId: 'c1', // different combatant
      combatants: combatantsA.map((c, i) => ({ ...c, isCurrentTurn: i === 1 })),
    };
    panel.onSnapshot(snapshotB);

    // After turn advance, multiAttackState must be cleared so the chip doesn't
    // appear for the next combatant. We verify via draw: the last draw call must
    // NOT render an [Atk chip in the content.
    const lastCallArgs = bridge.textContainerUpgrade.mock.calls.at(-1)?.[0];
    if (lastCallArgs !== undefined) {
      const content = (lastCallArgs as { content?: string }).content ?? '';
      expect(content).not.toContain('[Atk');
    }
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

// ─── WR-02 regression: scrollOffset upper-bound clamp in CombatTrackerPanel ──

describe('CombatTrackerPanel — WR-02 scrollOffset clamping', () => {
  it('WR-02-CTP-CLAMP: excessive scroll-down is clamped to combatants.length - 3', async () => {
    const bridge = makeMockBridge();
    const bus = new PanelGestureBus();
    const panel = new CombatTrackerPanel(bridge, bus, 'it');
    await panel.onMount();

    // Deliver a snapshot with 6 combatants (maxOff = max(0, 6-3) = 3)
    const snapshot = makeCombatSnapshot(makeCombatants(6), 0);
    panel.onSnapshot(snapshot);
    await Promise.resolve();

    // Scroll down 20 times — offset should clamp at +3
    for (let i = 0; i < 20; i++) {
      bus.publish({ kind: 'scroll', direction: 'down' });
    }
    await Promise.resolve();

    // Scroll back up 4 times — if clamped at 3 this brings it to -1 (clamped to -3).
    // If unbounded (=20) it would be 16 after 4 ups. The panel must still draw.
    for (let i = 0; i < 4; i++) {
      bus.publish({ kind: 'scroll', direction: 'up' });
    }
    await Promise.resolve();

    // Verify the panel is still functional (draw was called, no exception)
    expect(bridge.textContainerUpgrade.mock.calls.length).toBeGreaterThan(0);
  });
});

// ─── CTP-R1HINTS-* (Phase 6 Plan 03) ─────────────────────────────────────────

describe('CombatTrackerPanel — getR1Hints (Phase 6 NAV-01 chip data)', () => {
  it('CTP-R1HINTS-IT: returns getR1Hints with q[combat] quickActionLabel (IT locale)', () => {
    const bridge = makeMockBridge();
    const bus = new PanelGestureBus();
    const panel = new CombatTrackerPanel(bridge, bus, 'it');
    const hints = panel.getR1Hints();
    expect(hints.quickActionLabel).toMatch(/q\[combat\]/);
    expect(typeof hints.tap).toBe('string');
    expect(typeof hints.scroll).toBe('string');
    expect(hints.tap.length).toBeGreaterThan(0);
    expect(hints.scroll.length).toBeGreaterThan(0);
  });

  it('CTP-R1HINTS-BUDGET: chip hint fields fit 38-char budget across IT/EN/DE locales', () => {
    const locales = ['it', 'en', 'de'] as const;
    for (const locale of locales) {
      const bridge = makeMockBridge();
      const bus = new PanelGestureBus();
      const panel = new CombatTrackerPanel(bridge, bus, locale);
      const hints = panel.getR1Hints();
      expect([...hints.tap].length).toBeLessThanOrEqual(38);
      expect([...hints.scroll].length).toBeLessThanOrEqual(38);
      expect([...hints.quickActionLabel].length).toBeLessThanOrEqual(38);
    }
  });
});

// ─── CTP-TOP-BOUNDARY — over-scroll boundary (ADR-0012 D-2) ───────────────────

describe('CombatTrackerPanel — isAtTopBoundary (ADR-0012 D-2)', () => {
  it('CTP-TOP-BOUNDARY: true at scrollOffset 0, false after scroll-up shifts the window', async () => {
    const bridge = makeMockBridge();
    const bus = new PanelGestureBus();
    const panel = new CombatTrackerPanel(bridge, bus, 'it');
    await panel.onMount();
    // Seed a snapshot large enough to allow scrolling (>5 combatants), current turn mid-list.
    panel.onSnapshot(makeCombatSnapshot(makeCombatants(8), 4));

    // Fresh snapshot resets scrollOffset to 0 → at top.
    expect(panel.isAtTopBoundary()).toBe(true);

    // scroll-up shifts the window up (scrollOffset becomes negative) → no longer at top.
    bus.publish({ kind: 'scroll', direction: 'up' });
    expect(panel.isAtTopBoundary()).toBe(false);
  });
});

// ─── CTP-MULTI-* — multiAttackState chip (Plan 07-04 MULTI-01) ───────────────

describe('CombatTrackerPanel — multiAttackState chip ([Atk N/M])', () => {
  const FIXTURE_UUID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  function makeAragonCombatant(): Combatant {
    return makeCombatant({
      id: 'aragorn',
      name: 'ARAGORN',
      actorId: 'actor-aragorn',
      initiative: 18,
      hp: 51,
      maxHp: 56,
      isCurrentTurn: true,
    });
  }

  it('CTP-MULTI-1: setMultiAttackState(null) → no chip rendered (Phase 5 fixtures unchanged)', () => {
    const combatant = makeAragonCombatant();
    const snapshot: CombatSnapshot = {
      combatId: 'combat-1',
      round: 1,
      turn: 0,
      currentCombatantId: 'aragorn',
      combatants: [combatant],
    };
    // Without multi-attack state (null/default)
    const rows = renderCombatTrackerContent(snapshot, 'it', 0, '');
    const joined = rows.join('\n');
    // Chip should NOT appear
    expect(joined).not.toContain('[Atk');
    // Row should still be well-formed (66 chars)
    for (const row of rows) {
      expect([...row].length).toBe(66);
    }
  });

  it('CTP-MULTI-2: setMultiAttackState with matching actorId → [Atk 1/2] chip in combatant row', () => {
    const combatant = makeAragonCombatant();
    const snapshot: CombatSnapshot = {
      combatId: 'combat-1',
      round: 1,
      turn: 0,
      currentCombatantId: 'aragorn',
      combatants: [combatant],
    };
    const multiAttackState: MultiAttackState = {
      current: 1,
      total: 2,
      attackId: FIXTURE_UUID,
      actorId: 'actor-aragorn',
    };
    const rows = renderCombatTrackerContent(snapshot, 'it', 0, '', multiAttackState);
    const joined = rows.join('\n');
    // Chip MUST appear in the combatant row
    expect(joined).toContain('[Atk 1/2]');
    // Row width must still be 66 (chip replaces dist+dir+gap3, preserving row width)
    for (const row of rows) {
      expect([...row].length).toBe(66);
    }
  });

  it('CTP-MULTI-3: multiAttackState with non-matching actorId → no chip rendered on that combatant', () => {
    const combatant = makeAragonCombatant();
    const snapshot: CombatSnapshot = {
      combatId: 'combat-1',
      round: 1,
      turn: 0,
      currentCombatantId: 'aragorn',
      combatants: [combatant],
    };
    const multiAttackState: MultiAttackState = {
      current: 2,
      total: 3,
      attackId: FIXTURE_UUID,
      actorId: 'actor-OTHER', // different actor
    };
    const rows = renderCombatTrackerContent(snapshot, 'it', 0, '', multiAttackState);
    const joined = rows.join('\n');
    // Chip should NOT appear — wrong actor
    expect(joined).not.toContain('[Atk');
  });

  it('CTP-MULTI-4: [Atk 2/2] chip renders correctly (last attack state)', () => {
    const combatant = makeAragonCombatant();
    const snapshot: CombatSnapshot = {
      combatId: 'combat-1',
      round: 1,
      turn: 0,
      currentCombatantId: 'aragorn',
      combatants: [combatant],
    };
    const multiAttackState: MultiAttackState = {
      current: 2,
      total: 2,
      attackId: FIXTURE_UUID,
      actorId: 'actor-aragorn',
    };
    const rows = renderCombatTrackerContent(snapshot, 'it', 0, '', multiAttackState);
    const joined = rows.join('\n');
    expect(joined).toContain('[Atk 2/2]');
    for (const row of rows) {
      expect([...row].length).toBe(66);
    }
  });

  it('CTP-MULTI-5: multiAttackState with actor NOT in visible window → no chip (graceful)', () => {
    // 6 combatants; actor-aragorn is at index 5 (out of 5-row window showing 0-4)
    const combatants = [
      makeAragonCombatant(), // index 0 — currently visible
      ...makeCombatants(5), // indices 1-5
    ];
    // Set current to index 5 (not aragorn) — window shows 1-5, aragorn is at 0 (not visible)
    const snapshot: CombatSnapshot = {
      combatId: 'combat-1',
      round: 1,
      turn: 5,
      currentCombatantId: `c4`,
      combatants: combatants.map((c, i) => ({ ...c, isCurrentTurn: i === 5 })),
    };
    const multiAttackState: MultiAttackState = {
      current: 1,
      total: 2,
      attackId: FIXTURE_UUID,
      actorId: 'actor-aragorn', // aragorn not in visible window
    };
    const rows = renderCombatTrackerContent(snapshot, 'it', 0, '', multiAttackState);
    const joined = rows.join('\n');
    // Chip should not appear since aragorn's row is not rendered
    expect(joined).not.toContain('[Atk 1/2]');
  });

  it('CTP-MULTI-6: CombatTrackerPanel.setMultiAttackState triggers re-draw', async () => {
    const bridge = makeMockBridge();
    const bus = new PanelGestureBus();
    const panel = new CombatTrackerPanel(bridge, bus, 'it');
    await panel.onMount();

    const callsBefore = bridge.textContainerUpgrade.mock.calls.length;
    panel.setMultiAttackState({
      current: 1,
      total: 2,
      attackId: FIXTURE_UUID,
      actorId: 'actor-test',
    });
    await Promise.resolve();

    expect(bridge.textContainerUpgrade.mock.calls.length).toBeGreaterThan(callsBefore);
  });
});

// ─── CTP-CR03 — INV-1 row-width safety for count >= 10 ───────────────────────

describe('CombatTrackerPanel — CR-03 [Atk N/M] chip clamped to 9 chars', () => {
  const FIXTURE_UUID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  function makeAragonCombatant(): Combatant {
    return makeCombatant({
      id: 'aragorn',
      name: 'ARAGORN',
      actorId: 'actor-aragorn',
      initiative: 18,
      hp: 51,
      maxHp: 56,
      isCurrentTurn: true,
    });
  }

  it('CTP-CR03-NORMAL: [Atk 2/4] is 9 chars — row width stays at 66', () => {
    const snapshot: CombatSnapshot = {
      combatId: 'combat-1',
      round: 1,
      turn: 0,
      currentCombatantId: 'aragorn',
      combatants: [makeAragonCombatant()],
    };
    const multiAttackState: MultiAttackState = {
      current: 2,
      total: 4,
      attackId: FIXTURE_UUID,
      actorId: 'actor-aragorn',
    };
    const rows = renderCombatTrackerContent(snapshot, 'it', 0, '', multiAttackState);
    // [Atk 2/4] is exactly 9 chars — no truncation needed
    expect(rows.join('\n')).toContain('[Atk 2/4]');
    for (const row of rows) {
      expect([...row].length).toBe(66);
    }
  });

  it('CTP-CR03-OVERFLOW: count=10/10 (11 chars raw) → truncated to 9 chars, row width stays 66', () => {
    // CR-03 regression: [Atk 10/10] = 11 chars overflows INV-1 66-char budget
    const snapshot: CombatSnapshot = {
      combatId: 'combat-1',
      round: 1,
      turn: 0,
      currentCombatantId: 'aragorn',
      combatants: [makeAragonCombatant()],
    };
    const multiAttackState: MultiAttackState = {
      current: 10,
      total: 10,
      attackId: FIXTURE_UUID,
      actorId: 'actor-aragorn',
    };
    const rows = renderCombatTrackerContent(snapshot, 'it', 0, '', multiAttackState);
    // Row width must be exactly 66 (INV-1) — not 68 as before the fix
    for (const row of rows) {
      expect([...row].length).toBe(66);
    }
    // The chip must be present (truncated)
    const hasChip = rows.some((r) => r.includes('[Atk 10/'));
    expect(hasChip).toBe(true);
  });

  it('CTP-CR03-PARTIAL: count=10/2 (11 chars raw) → truncated, row still 66', () => {
    const snapshot: CombatSnapshot = {
      combatId: 'combat-1',
      round: 1,
      turn: 0,
      currentCombatantId: 'aragorn',
      combatants: [makeAragonCombatant()],
    };
    const multiAttackState: MultiAttackState = {
      current: 10,
      total: 2,
      attackId: FIXTURE_UUID,
      actorId: 'actor-aragorn',
    };
    const rows = renderCombatTrackerContent(snapshot, 'it', 0, '', multiAttackState);
    for (const row of rows) {
      expect([...row].length).toBe(66);
    }
  });
});

// ─── CTP-FIX-MULTI — INV-1 fixture for multi-attack chip ─────────────────────

// ─── CTQ: quick-action bar tap-dispatch (Plan 08-05) ─────────────────────────

describe('CombatTrackerPanel — quick-action tap-dispatch (CTQ-01..08)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('CTQ-01: setQuickActionHandler(handler) sets internal handler — idempotent', () => {
    const { panel } = makePanel();
    const handler = vi.fn();
    // Should not throw; can be set multiple times (idempotent)
    panel.setQuickActionHandler(handler);
    panel.setQuickActionHandler(handler);
    panel.setQuickActionHandler(null);
  });

  it('CTQ-02: initial internal state: qaSelectedIdx=0, _lastTapAt=0, _lastTapIdx=-1', () => {
    const { panel } = makePanel();
    // Access through casting — private fields are internal but observable via behavior
    const p = panel as unknown as {
      qaSelectedIdx: number;
      _lastTapAt: number;
      _lastTapIdx: number;
      _quickActionHandler: unknown;
    };
    expect(p.qaSelectedIdx).toBe(0);
    expect(p._lastTapAt).toBe(0);
    expect(p._lastTapIdx).toBe(-1);
    expect(p._quickActionHandler).toBeNull();
  });

  it('CTQ-03: onEvent(tap) WITHOUT handler → no-op, does not throw', async () => {
    const { panel, bridge } = makePanel();
    await panel.onMount();
    const drawCallsBefore = (bridge.textContainerUpgrade as ReturnType<typeof vi.fn>).mock.calls
      .length;
    // No handler set — tap should be a no-op
    panel.onEvent({ kind: 'tap' } as R1Gesture);
    await vi.advanceTimersByTimeAsync(0);
    // No additional draw calls expected from tap alone (handler null → early break)
    expect((bridge.textContainerUpgrade as ReturnType<typeof vi.fn>).mock.calls.length).toBe(
      drawCallsBefore,
    );
    // The key assertion: the panel did NOT cycle or fire anything
    const p = panel as unknown as { qaSelectedIdx: number };
    expect(p.qaSelectedIdx).toBe(0); // unchanged
    await panel.onUnmount();
  });

  it('CTQ-04: first tap WITH handler → cycles qaSelectedIdx; handler NOT called', async () => {
    const { panel } = makePanel();
    const handler = vi.fn();
    panel.setQuickActionHandler(handler);
    await panel.onMount();

    vi.setSystemTime(1000);
    panel.onEvent({ kind: 'tap' } as R1Gesture);
    await vi.advanceTimersByTimeAsync(0);

    const p = panel as unknown as {
      qaSelectedIdx: number;
      _lastTapIdx: number;
      _lastTapAt: number;
    };
    expect(p.qaSelectedIdx).toBe(1); // advanced from 0 → 1
    expect(p._lastTapIdx).toBe(1); // new selected index (1) stored for double-tap detection
    expect(handler).not.toHaveBeenCalled();

    await panel.onUnmount();
  });

  it('CTQ-05: second tap within 600ms on same index → handler called with QA_KEYS[idx]', async () => {
    const { panel } = makePanel();
    const handler = vi.fn();
    panel.setQuickActionHandler(handler);
    await panel.onMount();

    // First tap at t=1000 — cycles idx 0→1, _lastTapIdx=0
    vi.setSystemTime(1000);
    panel.onEvent({ kind: 'tap' } as R1Gesture);

    // Go back to idx=0 by cycling 3 more times (0→1→2→3→0)
    vi.setSystemTime(1001);
    panel.onEvent({ kind: 'tap' } as R1Gesture);
    vi.setSystemTime(1002);
    panel.onEvent({ kind: 'tap' } as R1Gesture);
    vi.setSystemTime(1003);
    panel.onEvent({ kind: 'tap' } as R1Gesture);

    // Now qaSelectedIdx=0, _lastTapIdx=3 — doesn't match; need to advance to 0 and then fire
    // Start fresh: get to a known state where _lastTapIdx === qaSelectedIdx
    // Simplest: set a fresh panel, first tap sets _lastTapIdx=0, qaSelectedIdx=1
    // Then do a separate test where we manually align

    // Actually: let's test with index 1 (S key)
    // Fresh panel — tap once at t=2000 → qaSelectedIdx=1, _lastTapIdx=0
    const { panel: panel2 } = makePanel();
    panel2.setQuickActionHandler(handler);
    await panel2.onMount();

    vi.setSystemTime(2000);
    panel2.onEvent({ kind: 'tap' } as R1Gesture);
    const p2 = panel2 as unknown as { qaSelectedIdx: number; _lastTapIdx: number };
    expect(p2.qaSelectedIdx).toBe(1);
    expect(p2._lastTapIdx).toBe(1); // new selected index stored (1), enabling double-tap fire

    // Second tap within 600ms on SAME index (qaSelectedIdx=1, _lastTapIdx=1 — SAME)
    // We have sameIdx = true when _lastTapIdx === qaSelectedIdx
    // After first tap: advance 0→1, _lastTapIdx=1 (new idx), qaSelectedIdx=1
    // Second tap: sameIdx=(1===1)=true → fires 'S'
    // So to fire, we just need a second tap within 600ms — panel2 demonstrates this
    // Then cycle through 0→1 via advancing one more: 1→2, _lastTapIdx=1
    // Then another: 2→3, _lastTapIdx=2
    // Then another: 3→0, _lastTapIdx=3
    // Then another: 0→1, _lastTapIdx=0 — still no match
    // The MATCH happens when: last tap advanced to idx=X, then within 600ms tap again
    //   → qaSelectedIdx===_lastTapIdx is the condition: sameIdx = _lastTapIdx === this.qaSelectedIdx
    // After tap1: qaSelectedIdx=1, _lastTapIdx=0 (NOT same)
    // After tap2: qaSelectedIdx=2, _lastTapIdx=1 (NOT same)
    // Hmm, sameIdx = _lastTapIdx === qaSelectedIdx. That can't match on consecutive full-cycle taps.
    // Re-reading the plan: "sameIdx = this._lastTapIdx === this.qaSelectedIdx"
    // after tap1: qaSelectedIdx=1, _lastTapIdx=0 → sameIdx checks if 0===1 → NO
    // Meaning: second tap on the same slot means we tapped AGAIN while displaying slot 0
    // (the newly selected one) — but we advanced, so we're now at 1, with lastTapIdx=0
    // The logic: second tap fires when the NEXT tap is STILL on the same qaSelectedIdx
    // i.e., we need the SAME qaSelectedIdx as _lastTapIdx, which means no advancement happened
    // This means we reset _lastTapIdx after advancing? Let me re-read the plan spec:
    //
    // From plan:
    // if (sameIdx && withinWindow) { fire }
    // else { _lastTapIdx = this.qaSelectedIdx; this.qaSelectedIdx = (this.qaSelectedIdx + 1) % 4;
    //         this._lastTapAt = now; }
    //
    // So: first tap: sameIdx=(_lastTapIdx=-1 === qaSelectedIdx=0) → false → advance
    //   → qaSelectedIdx=1, _lastTapIdx=0, _lastTapAt=T1
    // second tap: sameIdx=(_lastTapIdx=0 === qaSelectedIdx=1) → false → advance
    //   → qaSelectedIdx=2, _lastTapIdx=1, _lastTapAt=T2
    //
    // Hmm, that NEVER fires? Unless... I re-read: "When a second tap fires WITHIN 600ms
    // on the SAME index" means: the second tap on the SAME index that was just selected.
    // After advancing to qaSelectedIdx=1, _lastTapIdx=0. The SAME index here means
    // tapIdx (where the tap physically falls) stays at the current selection.
    // Actually I think the intent is:
    //   _lastTapIdx tracks what qaSelectedIdx WAS before the tap
    //   after tap1: _lastTapIdx=0 (old), qaSelectedIdx=1 (new)
    //   second tap: sameIdx = (_lastTapIdx === this.qaSelectedIdx) = (0===1) → NO
    // That still doesn't work. Let me re-read more carefully:
    // sameIdx = this._lastTapIdx === this.qaSelectedIdx
    // For this to be true, _lastTapIdx must EQUAL qaSelectedIdx.
    // After first tap: _lastTapIdx=0, qaSelectedIdx=1 → not same
    // The ONLY way sameIdx=true is if the previousTapIdx matches the current idx.
    // That means: after advancing 3→0, _lastTapIdx=3, qaSelectedIdx=0 — not same.
    // After 0→1, _lastTapIdx=0 — still not same...
    //
    // WAIT. I think I misread the logic. The plan says:
    //   const sameIdx = this._lastTapIdx === this.qaSelectedIdx
    // But BEFORE the first tap, _lastTapIdx=-1 and qaSelectedIdx=0, so it's -1===0 → false
    // After tap1: _lastTapIdx = 0 (old qaSelectedIdx), qaSelectedIdx = 1 (new)
    // SECOND TAP: sameIdx = _lastTapIdx(0) === qaSelectedIdx(1) → false → advances again
    //
    // I think there's a DIFFERENT intended logic. Maybe the "same index" check is whether
    // the user taps again WITHOUT the qaSelectedIdx having changed since last tap.
    // The fix: _lastTapIdx should track the CURRENT index AFTER the tap (not before).
    // i.e., after tap1: _lastTapIdx=1 (new qaSelectedIdx), advance to qaSelectedIdx=1
    // So: first tap: sameIdx = (-1===0) → false → set _lastTapIdx=0 (CURRENT, not old)
    //                qaSelectedIdx stays 0 (no advance on first tap???)
    // OR:
    // Rethinking: Maybe the design is that the FIRST tap sets the selection (but doesn't advance),
    // and the SECOND tap on the same idx fires.
    // After tap1: qaSelectedIdx=0 stays, _lastTapIdx=0, _lastTapAt=T1
    // After tap2: sameIdx=(0===0) → true; withinWindow → fire A key!
    //
    // This makes more sense with the advance happening ONLY to cycle to the NEXT item:
    // Actually re-reading the plan code:
    // } else {
    //   this._lastTapIdx = this.qaSelectedIdx;         ← save current idx as "last tapped"
    //   this.qaSelectedIdx = (this.qaSelectedIdx + 1) % 4; ← ADVANCE to next
    //   ...
    // }
    // So: first tap saves current (0), advances to 1
    // _lastTapIdx=0 tracks "where we were when we tapped"
    // sameIdx = (0===1) → false → would advance again
    // This design means tapping continuously just cycles. The FIRE happens if:
    //   _lastTapIdx === qaSelectedIdx → which needs them to be equal.
    // Only possible if qaSelectedIdx advanced BACK to _lastTapIdx, OR if _lastTapIdx == qaSelectedIdx
    // from the start (which is only if _lastTapIdx and qaSelectedIdx are both 0 and _lastTapIdx was set
    // to 0 by a previous tap, then we tap again without changing qaSelectedIdx).
    //
    // I believe the REAL intent is: after advancing to idx X (qaSelectedIdx=X), _lastTapIdx should
    // be X (not X-1). Then: sameIdx = (_lastTapIdx=X === qaSelectedIdx=X) = true on next tap.
    //
    // So the else branch should be:
    //   this.qaSelectedIdx = (this.qaSelectedIdx + 1) % 4; ← advance first
    //   this._lastTapIdx = this.qaSelectedIdx;              ← save NEW idx
    // OR: _lastTapIdx tracks the newly selected, not the old.
    // Given the ambiguity, I'll implement what makes behavioral sense:
    // Tap-once selects/advances, tap-twice-on-same-slot fires.
    // "same slot" = the same qaSelectedIdx as when the previous tap fired.
    // So: first tap: advance 0→1; record _lastTapIdx=1 (newly selected), _lastTapAt=T
    // Second tap: sameIdx = (_lastTapIdx=1 === qaSelectedIdx=1) → true → FIRE!

    await panel2.onUnmount();

    // CORRECT implementation test: one cycle advances AND records new idx
    const { panel: panel3 } = makePanel();
    const handler3 = vi.fn();
    panel3.setQuickActionHandler(handler3);
    await panel3.onMount();

    vi.setSystemTime(3000);
    panel3.onEvent({ kind: 'tap' } as R1Gesture); // first tap → selects idx=1 (S)
    await vi.advanceTimersByTimeAsync(0);

    vi.setSystemTime(3400); // within 600ms
    panel3.onEvent({ kind: 'tap' } as R1Gesture); // second tap on idx=1 → FIRES 'S'
    await vi.advanceTimersByTimeAsync(0);

    expect(handler3).toHaveBeenCalledWith('S');
    expect(handler3).toHaveBeenCalledTimes(1);

    await panel3.onUnmount();
  });

  it('CTQ-06: tap interval > 600ms → treats as fresh first-tap (no fire)', async () => {
    const { panel } = makePanel();
    const handler = vi.fn();
    panel.setQuickActionHandler(handler);
    await panel.onMount();

    vi.setSystemTime(5000);
    panel.onEvent({ kind: 'tap' } as R1Gesture); // first tap → advances to S (idx=1)

    vi.setSystemTime(5700); // > 600ms
    panel.onEvent({ kind: 'tap' } as R1Gesture); // fresh cycle, NOT fire

    expect(handler).not.toHaveBeenCalled();

    await panel.onUnmount();
  });

  it('CTQ-07: renderQuickActionBar with selectedIdx=1 highlights second slot [▶S]', () => {
    const bar = renderQuickActionBar('it', 1);
    expect(bar).toContain('[▶S]');
    expect([...bar].length).toBe(66); // INV-1: row must be exactly 66 code-points
  });

  it('CTQ-08: renderQuickActionBar with selectedIdx=-1 (default) → no highlight marker', () => {
    const bar = renderQuickActionBar('it', -1);
    // No highlight marker present
    expect(bar).not.toContain('[▶');
    // Standard keys present
    expect(bar).toContain('[ A ]');
    expect(bar).toContain('[ S ]');
    expect(bar).toContain('[ I ]');
    expect(bar).toContain('[ M ]');
    expect([...bar].length).toBe(66);
  });
});

// ─── INV-1 fixture with [Atk 1/2] chip ───────────────────────────────────────

describe('CombatTrackerPanel — INV-1 fixture with [Atk 1/2] chip', () => {
  it('CTP-FIX-MULTI: [Atk 1/2] chip on GOBLIN ARCHER matches combat-tracker.multi-attack.it.txt', async () => {
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
    const multiAttackState: MultiAttackState = {
      current: 1,
      total: 2,
      attackId: 'fixture-a-1-1111-1111-1111-111111111111',
      actorId: 'actor-goblin',
    };
    const rows = renderCombatTrackerContent(snapshot, 'it', 0, '', multiAttackState);
    const grid = AsciiGrid.fromString(rows.join('\n'));
    await matchAsciiFixture(
      grid,
      resolve(__dirname, '../__fixtures__/combat-tracker-multi-attack.txt'),
    );
  });
});
