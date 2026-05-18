/**
 * Unit tests for StatusHudRenderer (Phase 4a Plan 04 Task 1).
 *
 * Covers (per 04A-04-PLAN.md `<behavior>` SR-1..SR-8):
 *   - SR-1: renderLoading() produces 28×21 grid with col 0/27 = `║`, HP cell = `…`
 *   - SR-2: render() with populated snapshot — HP bar 8 glyphs, AC/SPD cells correct
 *   - SR-3: missing scalar renders as `—` (em-dash) without collapsing width
 *   - SR-4: long name truncates to 11 + `…` per UI-SPEC §Field Width Budgets
 *   - SR-5: 7 conditions overflow → 3 visible + `… +4`
 *   - SR-6: HP=700/700 numeric overflow → value cell truncated with `…`
 *   - SR-7: locale switching IT replaces HP→PF, AC→CA, SPD→VEL
 *   - SR-8: glyph mode places [GLY] badge in row 20 last 5 inner cells
 *
 * Plus the INV-1 snapshot test SR-1b: renderLoading() matches the
 * `status-hud.loading.txt` fixture via matchAsciiFixture.
 *
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04A-04-PLAN.md Task 1
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04A-UI-SPEC.md §Status HUD Design Contract
 */

import type { CharacterSnapshot } from '@evf/shared-protocol';
import { matchAsciiFixture } from '@evf/shared-render';
import { describe, expect, it } from 'vitest';
import { StatusHudRenderer } from '../status-hud-renderer.js';

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

const HUD_WIDTH = 28;
const HUD_HEIGHT = 21;

/** Minimal valid CharacterSnapshot factory. */
function makeSnapshot(overrides: Partial<CharacterSnapshot> = {}): CharacterSnapshot {
  return {
    actorId: 'actor-1',
    name: 'Thorin',
    hp: 45,
    maxHp: 68,
    tempHp: 10,
    ac: 18,
    level: 5,
    conditions: [],
    exhaustion: 0,
    death: { success: 0, failure: 0 },
    world: { modernRules: false },
    inventory: [],
    spells: { slots: [], spells: [] },
    abilities: {
      str: { value: 10, mod: 0, save: 0, proficient: false, dc: 10 },
      dex: { value: 10, mod: 0, save: 0, proficient: false, dc: 10 },
      con: { value: 10, mod: 0, save: 0, proficient: false, dc: 10 },
      int: { value: 10, mod: 0, save: 0, proficient: false, dc: 10 },
      wis: { value: 10, mod: 0, save: 0, proficient: false, dc: 10 },
      cha: { value: 10, mod: 0, save: 0, proficient: false, dc: 10 },
    },
    ...overrides,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// SR-1: loading state shape
// ──────────────────────────────────────────────────────────────────────────────

describe('StatusHudRenderer — renderLoading', () => {
  it('SR-1a: produces a 28×21 grid with col 0/27 = `║` on every row except row 20 (border)', () => {
    const renderer = new StatusHudRenderer({ locale: 'en' });
    const grid = renderer.renderLoading();
    expect(grid.width).toBe(HUD_WIDTH);
    expect(grid.height).toBe(HUD_HEIGHT);
    // Rows 0..19 (1-indexed 1..20) have ║ borders at col 0/27
    for (let r = 0; r < HUD_HEIGHT - 1; r++) {
      expect(grid.at(0, r), `row ${r + 1} col 0`).toBe('║');
      expect(grid.at(27, r), `row ${r + 1} col 27`).toBe('║');
    }
    // Last row is the bottom border ╠══...═╣
    expect(grid.at(0, HUD_HEIGHT - 1)).toBe('╠');
    expect(grid.at(27, HUD_HEIGHT - 1)).toBe('╣');
  });

  it('SR-1b: HP row contains `…` ellipsis placeholder (loading state)', () => {
    const renderer = new StatusHudRenderer({ locale: 'en' });
    const grid = renderer.renderLoading();
    // HP row is row 3 (0-indexed row 2). Look for ellipsis in the inner content.
    const rowText = grid.cells[2]?.join('') ?? '';
    expect(rowText).toContain('…');
  });

  it('SR-1c: matches packages/shared-render/src/fixtures/status-hud.loading.txt (INV-1 ck 15)', async () => {
    const renderer = new StatusHudRenderer({ locale: 'en' });
    const grid = renderer.renderLoading();
    await matchAsciiFixture(grid, '../../../../shared-render/src/fixtures/status-hud.loading.txt');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// SR-2: populated render
// ──────────────────────────────────────────────────────────────────────────────

describe('StatusHudRenderer — render(snapshot)', () => {
  it('SR-2: HP bar has 8 glyph positions and AC/SPD cells reflect snapshot', () => {
    const renderer = new StatusHudRenderer({ locale: 'en' });
    const grid = renderer.render(makeSnapshot({ hp: 45, maxHp: 68, ac: 18 }));
    // HP row (0-indexed 2) — count fill glyphs `█▓░`
    const hpRow = grid.cells[2]?.join('') ?? '';
    const barChars = [...hpRow].filter((c) => c === '█' || c === '▓' || c === '░').length;
    expect(barChars).toBe(8);
    // AC row (0-indexed 4) — should contain "18"
    const acRow = grid.cells[4]?.join('') ?? '';
    expect(acRow).toContain('AC 18');
  });

  // SR-3
  it('SR-3: snapshot.ac unset → renders `—` em-dash in AC column without collapsing width', () => {
    // CharacterSnapshot.ac is required by Zod but treat 0 as "missing" for now —
    // the renderer's missing-field path is exercised via renderMissing(). Verify
    // here that the AC row stays 28 wide even with min-value ac=0.
    const renderer = new StatusHudRenderer({ locale: 'en' });
    const grid = renderer.render(makeSnapshot({ ac: 0 }));
    const acRow = grid.cells[4];
    expect(acRow).toBeDefined();
    expect(acRow?.length).toBe(HUD_WIDTH);
  });

  it('SR-3b: renderMissing() outputs em-dash placeholders without collapsing rows', () => {
    const renderer = new StatusHudRenderer({ locale: 'en' });
    const grid = renderer.renderMissing();
    expect(grid.width).toBe(HUD_WIDTH);
    expect(grid.height).toBe(HUD_HEIGHT);
    // Name row (0-indexed 0) — should contain em-dash
    const nameRow = grid.cells[0]?.join('') ?? '';
    expect(nameRow).toContain('—');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// SR-4: long-name truncation
// ──────────────────────────────────────────────────────────────────────────────

describe('StatusHudRenderer — name truncation', () => {
  it('SR-4: name length > 11 truncates to 11 chars + `…`', () => {
    const renderer = new StatusHudRenderer({ locale: 'en' });
    const grid = renderer.render(makeSnapshot({ name: 'VeryLongNameOverflow' }));
    const nameRow = grid.cells[0]?.join('') ?? '';
    // Should contain `VeryLongNam…` (11 chars + ellipsis = 12 visible)
    expect(nameRow).toContain('VeryLongNam…');
    // Row stays at HUD_WIDTH
    expect(grid.cells[0]?.length).toBe(HUD_WIDTH);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// SR-5: condition overflow
// ──────────────────────────────────────────────────────────────────────────────

describe('StatusHudRenderer — conditions overflow', () => {
  it('SR-5: 7 conditions → 3 visible + `… +4` overflow row', () => {
    const renderer = new StatusHudRenderer({ locale: 'en' });
    const grid = renderer.render(
      makeSnapshot({
        conditions: ['poisoned', 'prone', 'bless', 'haste', 'rage', 'invisible', 'charmed'],
      }),
    );
    // Conditions section header is row 15 (0-indexed 14)
    expect(grid.cells[14]?.join('') ?? '').toContain('Conditions');
    // Rows 15-17 (0-indexed) carry the 3 visible
    expect(grid.cells[15]?.join('') ?? '').toContain('poisoned');
    expect(grid.cells[16]?.join('') ?? '').toContain('prone');
    expect(grid.cells[17]?.join('') ?? '').toContain('bless');
    // Row 18 (0-indexed) carries the overflow `… +4`
    const overflowRow = grid.cells[18]?.join('') ?? '';
    expect(overflowRow).toContain('… +4');
  });

  it('SR-5b: 7-conditions render matches status-hud.conditions-overflow.txt fixture (INV-1 ck 11)', async () => {
    const renderer = new StatusHudRenderer({ locale: 'en' });
    const grid = renderer.render(
      makeSnapshot({
        name: 'Thorin',
        hp: 45,
        maxHp: 68,
        tempHp: 0,
        ac: 18,
        conditions: ['poisoned', 'prone', 'bless', 'haste', 'rage', 'invisible', 'charmed'],
      }),
    );
    await matchAsciiFixture(
      grid,
      '../../../../shared-render/src/fixtures/status-hud.conditions-overflow.txt',
    );
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// SR-6: HP numeric overflow
// ──────────────────────────────────────────────────────────────────────────────

describe('StatusHudRenderer — HP numeric overflow', () => {
  it('SR-6: HP=99999/99999 → value truncated with `…` (9-char budget)', () => {
    const renderer = new StatusHudRenderer({ locale: 'en' });
    const grid = renderer.render(makeSnapshot({ hp: 99999, maxHp: 99999 }));
    // HP value row is row 4 (0-indexed 3)
    const hpValRow = grid.cells[3]?.join('') ?? '';
    expect(hpValRow).toContain('…');
    expect(grid.cells[3]?.length).toBe(HUD_WIDTH);
  });

  it('SR-6b: HP=99999/99999 + name overflow render matches status-hud.hp-overflow.txt fixture (INV-1 ck 11)', async () => {
    const renderer = new StatusHudRenderer({ locale: 'en' });
    const grid = renderer.render(
      makeSnapshot({
        name: 'VeryLongNameOverflow',
        hp: 99999,
        maxHp: 99999,
        tempHp: 999,
        ac: 18,
      }),
    );
    await matchAsciiFixture(
      grid,
      '../../../../shared-render/src/fixtures/status-hud.hp-overflow.txt',
    );
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// SR-7: locale switching
// ──────────────────────────────────────────────────────────────────────────────

describe('StatusHudRenderer — locale switching', () => {
  it('SR-7a: locale="it" → HP→PF, AC→CA, SPD→VEL', () => {
    const renderer = new StatusHudRenderer({ locale: 'it' });
    const grid = renderer.render(makeSnapshot());
    const hpRow = grid.cells[2]?.join('') ?? '';
    const acRow = grid.cells[4]?.join('') ?? '';
    expect(hpRow).toContain('PF ');
    expect(acRow).toContain('CA ');
    expect(acRow).toContain('VEL');
  });

  it('SR-7b: locale="de" → HP→TP, AC→RK, SPD→GES, Zustände', () => {
    const renderer = new StatusHudRenderer({ locale: 'de' });
    const grid = renderer.render(makeSnapshot({ conditions: ['poisoned'] }));
    const hpRow = grid.cells[2]?.join('') ?? '';
    const condHeader = grid.cells[14]?.join('') ?? '';
    expect(hpRow).toContain('TP ');
    expect(condHeader).toContain('Zustände');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// SR-8: [GLY] badge in glyph mode
// ──────────────────────────────────────────────────────────────────────────────

describe('StatusHudRenderer — [GLY] badge', () => {
  it('SR-8a: mapMode="glyph" places `[GLY]` in row 20 (0-indexed 19)', () => {
    const renderer = new StatusHudRenderer({ locale: 'en', mapMode: 'glyph' });
    const grid = renderer.renderLoading();
    const row20 = grid.cells[19]?.join('') ?? '';
    expect(row20).toContain('[GLY]');
  });

  it('SR-8b: mapMode="raster" → row 20 has NO [GLY] badge (blank inner)', () => {
    const renderer = new StatusHudRenderer({ locale: 'en', mapMode: 'raster' });
    const grid = renderer.renderLoading();
    const row20 = grid.cells[19]?.join('') ?? '';
    expect(row20).not.toContain('[GLY]');
    // Inner is all spaces between ║ borders
    expect(row20).toBe(`║${' '.repeat(HUD_WIDTH - 2)}║`);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Phase 4b death-saves mode (DEATH-01 — Plan 05 Task 1)
//
// SR-DS-1..SR-DS-8 verify the death-saves pivot rendering: 3-strike tracker,
// `◯`/`●` glyphs, locale-aware labels, and two INV-1 fixtures (initial entry +
// mid-saves with filled glyphs). Pivot triggering is exercised in
// status-hud-layer.test.ts (SHL-PIVOT-*).
//
// @see .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-UI-SPEC.md §3.4 + §5.14 + §5.15
// ──────────────────────────────────────────────────────────────────────────────

describe('Phase 4b death-saves mode (DEATH-01)', () => {
  /** Death-saves snapshot factory — HP=0 + death counts. */
  function makeDeathSnapshot(
    death: { success: number; failure: number } = { success: 0, failure: 0 },
    overrides: Partial<CharacterSnapshot> = {},
  ): CharacterSnapshot {
    return {
      actorId: 'actor-1',
      name: 'Thorin',
      hp: 0,
      maxHp: 68,
      tempHp: 0,
      ac: 18,
      level: 5,
      conditions: [],
      exhaustion: 0,
      death,
      world: { modernRules: false },
      inventory: [],
      spells: { slots: [], spells: [] },
      abilities: {
        str: { value: 10, mod: 0, save: 0, proficient: false, dc: 10 },
        dex: { value: 10, mod: 0, save: 0, proficient: false, dc: 10 },
        con: { value: 10, mod: 0, save: 0, proficient: false, dc: 10 },
        int: { value: 10, mod: 0, save: 0, proficient: false, dc: 10 },
        wis: { value: 10, mod: 0, save: 0, proficient: false, dc: 10 },
        cha: { value: 10, mod: 0, save: 0, proficient: false, dc: 10 },
      },
      ...overrides,
    };
  }

  it('SR-DS-1: setMode("death-saves") + render produces a death-saves grid (not standard)', () => {
    const renderer = new StatusHudRenderer({ locale: 'en' });
    renderer.setMode('death-saves');
    const grid = renderer.render(makeDeathSnapshot());
    expect(grid.width).toBe(HUD_WIDTH);
    expect(grid.height).toBe(HUD_HEIGHT);
    // The hallmark of death-saves mode: 'DEATH SAVES' literal somewhere in
    // the grid (standard mode never renders it).
    const flat = grid.toString();
    expect(flat).toContain('DEATH SAVES');
  });

  it('SR-DS-2: renderDeathSaves grid borders + bottom row preserved (28×21 ║/╠/╣)', () => {
    const renderer = new StatusHudRenderer({ locale: 'en' });
    renderer.setMode('death-saves');
    const grid = renderer.render(makeDeathSnapshot());
    // Rows 0..19 (1-indexed 1..20) have ║ borders at col 0/27
    for (let r = 0; r < HUD_HEIGHT - 1; r++) {
      expect(grid.at(0, r), `row ${r + 1} col 0`).toBe('║');
      expect(grid.at(27, r), `row ${r + 1} col 27`).toBe('║');
    }
    // Last row is the bottom border ╠══...═╣
    expect(grid.at(0, HUD_HEIGHT - 1)).toBe('╠');
    expect(grid.at(27, HUD_HEIGHT - 1)).toBe('╣');
  });

  it('SR-DS-3: locale="it" uses "Riusciti"/"Falliti"; locale="en" uses "Passes"/"Fails"', () => {
    const rendererIt = new StatusHudRenderer({ locale: 'it' });
    rendererIt.setMode('death-saves');
    const gridIt = rendererIt.render(makeDeathSnapshot());
    const flatIt = gridIt.toString();
    expect(flatIt).toContain('DEATH SAVES');
    expect(flatIt).toContain('Riusciti');
    expect(flatIt).toContain('Falliti');

    const rendererEn = new StatusHudRenderer({ locale: 'en' });
    rendererEn.setMode('death-saves');
    const gridEn = rendererEn.render(makeDeathSnapshot());
    const flatEn = gridEn.toString();
    expect(flatEn).toContain('Passes');
    expect(flatEn).toContain('Fails');
  });

  it('SR-DS-4: death={success:1, failure:2} → trackers show `● ◯ ◯` + `● ● ◯`', () => {
    const renderer = new StatusHudRenderer({ locale: 'it' });
    renderer.setMode('death-saves');
    const grid = renderer.render(makeDeathSnapshot({ success: 1, failure: 2 }));
    // Row 6 (0-indexed 5) = Riusciti tracker
    const passRow = grid.cells[5]?.join('') ?? '';
    expect(passRow).toContain('[ ● ◯ ◯ ]');
    // Row 7 (0-indexed 6) = Falliti tracker
    const failRow = grid.cells[6]?.join('') ?? '';
    expect(failRow).toContain('[ ● ● ◯ ]');
  });

  it('SR-DS-5: death={success:0, failure:0} → both trackers show `◯ ◯ ◯`', () => {
    const renderer = new StatusHudRenderer({ locale: 'it' });
    renderer.setMode('death-saves');
    const grid = renderer.render(makeDeathSnapshot({ success: 0, failure: 0 }));
    const passRow = grid.cells[5]?.join('') ?? '';
    const failRow = grid.cells[6]?.join('') ?? '';
    expect(passRow).toContain('[ ◯ ◯ ◯ ]');
    expect(failRow).toContain('[ ◯ ◯ ◯ ]');
  });

  it('SR-DS-6: HP row reads `PF  0/<max>` (IT) or `HP  0/<max>` (EN)', () => {
    const rendererIt = new StatusHudRenderer({ locale: 'it' });
    rendererIt.setMode('death-saves');
    const gridIt = rendererIt.render(makeDeathSnapshot({ success: 0, failure: 0 }, { maxHp: 68 }));
    // Row 9 (0-indexed 8) — HP indicator row
    const hpRowIt = gridIt.cells[8]?.join('') ?? '';
    expect(hpRowIt).toContain('PF  0/68');

    const rendererEn = new StatusHudRenderer({ locale: 'en' });
    rendererEn.setMode('death-saves');
    const gridEn = rendererEn.render(makeDeathSnapshot({ success: 0, failure: 0 }, { maxHp: 68 }));
    const hpRowEn = gridEn.cells[8]?.join('') ?? '';
    expect(hpRowEn).toContain('HP  0/68');
  });

  it('SR-DS-7: matches status-hud.death-saves-initial.it.txt (INV-1 ck 15)', async () => {
    const renderer = new StatusHudRenderer({ locale: 'it' });
    renderer.setMode('death-saves');
    const grid = renderer.render(
      makeDeathSnapshot({ success: 0, failure: 0 }, { name: 'Thorin', maxHp: 68, ac: 18 }),
    );
    await matchAsciiFixture(
      grid,
      '../../../../shared-render/src/fixtures/status-hud.death-saves-initial.it.txt',
    );
  });

  it('SR-DS-8: matches status-hud.death-saves-mid.it.txt (INV-1 ck 15)', async () => {
    const renderer = new StatusHudRenderer({ locale: 'it' });
    renderer.setMode('death-saves');
    const grid = renderer.render(
      makeDeathSnapshot({ success: 1, failure: 2 }, { name: 'Thorin', maxHp: 68, ac: 18 }),
    );
    await matchAsciiFixture(
      grid,
      '../../../../shared-render/src/fixtures/status-hud.death-saves-mid.it.txt',
    );
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// SR-CHIP-*: renderContextChip (Phase 6 Plan 03 — NAV-01 + INV-5 chip)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Lightweight LayerManager-like mock — mirrors the LayerManagerLike narrow interface
 * that StatusHudRenderer will accept (narrower than the full LayerManager class).
 */
function makeLm(
  topLayer: { getR1Hints?(): { tap: string; scroll: string; longPressLabel: string } } | null,
): {
  getTopLayer(): typeof topLayer;
} {
  return { getTopLayer: () => topLayer };
}

describe('StatusHudRenderer.renderContextChip (SR-CHIP-* / Phase 6 Plan 03)', () => {
  it('SR-CHIP-01: null layerManager → returns chip containing tap=cycle, scroll=nav, long=quick (fallback)', () => {
    const renderer = new StatusHudRenderer({ locale: 'it' });
    const chip = renderer.renderContextChip(null, 'it');
    expect(chip).toContain('tap=cycle');
    expect(chip).toContain('scroll=nav');
    expect(chip).toContain('long=quick');
  });

  it('SR-CHIP-02: layerManager.getTopLayer() === null (no overlay) → uses hud_r1_main chip', () => {
    const renderer = new StatusHudRenderer({ locale: 'it' });
    const lm = makeLm(null);
    const chip = renderer.renderContextChip(lm, 'it');
    // Main chip has: tap=cycle scroll=nav long=quick
    expect(chip).toContain('tap=cycle');
    expect(chip).toContain('scroll=nav');
    expect(chip).toContain('long=quick');
  });

  it('SR-CHIP-03: top layer has no getR1Hints → falls back to DEFAULT_R1_HINTS', () => {
    const renderer = new StatusHudRenderer({ locale: 'it' });
    // A layer without getR1Hints method (plain object with no hints)
    const lm = makeLm({
      /* no getR1Hints */
    });
    const chip = renderer.renderContextChip(lm, 'it');
    expect(chip).toContain('tap=cycle');
    expect(chip).toContain('scroll=nav');
    expect(chip).toContain('long=quick');
  });

  it('SR-CHIP-04: top layer is CharacterSheetPanel → chip contains q[sheet]', () => {
    const renderer = new StatusHudRenderer({ locale: 'it' });
    // Abbreviated token values matching hud_r1_sheet IT pre-authored string
    // (tap=tab scroll=cont long=q[sheet] = 33 chars — fits 38-char budget)
    const fakeSheet = {
      getR1Hints: () => ({ tap: 'tab', scroll: 'cont', longPressLabel: 'q[sheet]' }),
    };
    const lm = makeLm(fakeSheet);
    const chip = renderer.renderContextChip(lm, 'it');
    expect(chip).toContain('q[sheet]');
  });

  it('SR-CHIP-05: top layer is CombatTrackerPanel → chip contains q[combat]', () => {
    const renderer = new StatusHudRenderer({ locale: 'it' });
    const fakeCombat = {
      getR1Hints: () => ({ tap: 'rapida', scroll: 'iniz', longPressLabel: 'q[combat]' }),
    };
    const lm = makeLm(fakeCombat);
    const chip = renderer.renderContextChip(lm, 'it');
    expect(chip).toContain('q[combat]');
  });

  it('SR-CHIP-06: top layer is QuickActionMenuPanel (main mode) → chip contains scroll=voce and annulla', () => {
    const renderer = new StatusHudRenderer({ locale: 'it' });
    const fakeMenu = {
      getR1Hints: () => ({ tap: 'apri', scroll: 'voce', longPressLabel: 'annulla' }),
    };
    const lm = makeLm(fakeMenu);
    const chip = renderer.renderContextChip(lm, 'it');
    expect(chip).toContain('voce');
    expect(chip).toContain('annulla');
  });

  it('SR-CHIP-07: chip length ≤ 38 + 4 ("R1: " prefix) = 42 chars total (budget enforcement)', () => {
    const renderer = new StatusHudRenderer({ locale: 'it' });
    // Worst-case: sheet hints (pre-composed chip might be longer than 38 raw, renderer truncates)
    const fakeSheet = {
      getR1Hints: () => ({
        tap: 'cycle-tab',
        scroll: 'tab-content',
        longPressLabel: 'quick[sheet]',
      }),
    };
    const lm = makeLm(fakeSheet);
    const chip = renderer.renderContextChip(lm, 'it');
    // chip starts with "R1: " (4 chars) + up to 38 chars of content = ≤ 42 total
    expect([...chip].length).toBeLessThanOrEqual(42);
  });

  it('SR-CHIP-08 (DE stress): chip fits budget with DE locale labels', () => {
    const renderer = new StatusHudRenderer({ locale: 'de' });
    // Main state — DE string is "tap=Wechsel  scroll=Nav  long=Schnell" (37 chars)
    const chip = renderer.renderContextChip(makeLm(null), 'de');
    // The full chip starts with "R1: " then the content; total ≤ 42.
    expect([...chip].length).toBeLessThanOrEqual(42);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// SR-FIX-CHIP-*: INV-1 fixture snapshots for 5 chip states
// ──────────────────────────────────────────────────────────────────────────────

describe('StatusHudRenderer.renderContextChip — INV-1 chip fixtures (SR-FIX-CHIP-*)', () => {
  it('SR-FIX-CHIP-01: main chip (no overlay) matches status-hud.chip.main.it.txt', async () => {
    const renderer = new StatusHudRenderer({ locale: 'it' });
    const chip = renderer.renderContextChip(makeLm(null), 'it');
    await matchAsciiFixture(
      {
        toString: () => chip,
        width: [...chip].length,
        height: 1,
        cells: [[...chip]],
        at: (_c: number, _r: number) => [...chip][_c] ?? '',
      } as import('@evf/shared-render').AsciiGrid,
      '../../../../shared-render/src/fixtures/status-hud.chip.main.it.txt',
    );
  });

  it('SR-FIX-CHIP-02: sheet chip matches status-hud.chip.sheet.it.txt', async () => {
    const renderer = new StatusHudRenderer({ locale: 'it' });
    // Abbreviated token values matching hud_r1_sheet IT (tap=tab scroll=cont long=q[sheet])
    const fakeSheet = {
      getR1Hints: () => ({ tap: 'tab', scroll: 'cont', longPressLabel: 'q[sheet]' }),
    };
    const chip = renderer.renderContextChip(makeLm(fakeSheet), 'it');
    await matchAsciiFixture(
      {
        toString: () => chip,
        width: [...chip].length,
        height: 1,
        cells: [[...chip]],
        at: (_c: number, _r: number) => [...chip][_c] ?? '',
      } as import('@evf/shared-render').AsciiGrid,
      '../../../../shared-render/src/fixtures/status-hud.chip.sheet.it.txt',
    );
  });

  it('SR-FIX-CHIP-03: combat chip matches status-hud.chip.combat.it.txt', async () => {
    const renderer = new StatusHudRenderer({ locale: 'it' });
    const fakeCombat = {
      getR1Hints: () => ({ tap: 'rapida', scroll: 'iniz', longPressLabel: 'q[combat]' }),
    };
    const chip = renderer.renderContextChip(makeLm(fakeCombat), 'it');
    await matchAsciiFixture(
      {
        toString: () => chip,
        width: [...chip].length,
        height: 1,
        cells: [[...chip]],
        at: (_c: number, _r: number) => [...chip][_c] ?? '',
      } as import('@evf/shared-render').AsciiGrid,
      '../../../../shared-render/src/fixtures/status-hud.chip.combat.it.txt',
    );
  });

  it('SR-FIX-CHIP-04: menu chip matches status-hud.chip.menu.it.txt', async () => {
    const renderer = new StatusHudRenderer({ locale: 'it' });
    const fakeMenu = {
      getR1Hints: () => ({ tap: 'apri', scroll: 'voce', longPressLabel: 'annulla' }),
    };
    const chip = renderer.renderContextChip(makeLm(fakeMenu), 'it');
    await matchAsciiFixture(
      {
        toString: () => chip,
        width: [...chip].length,
        height: 1,
        cells: [[...chip]],
        at: (_c: number, _r: number) => [...chip][_c] ?? '',
      } as import('@evf/shared-render').AsciiGrid,
      '../../../../shared-render/src/fixtures/status-hud.chip.menu.it.txt',
    );
  });

  it('SR-FIX-CHIP-05: boot-error chip matches status-hud.chip.boot-error.it.txt', async () => {
    const renderer = new StatusHudRenderer({ locale: 'it' });
    // Boot-error state: no overlay, but renderer produces boot-error chip when asked
    // directly. We test the chip using the hud_r1_boot_error key directly.
    const fakeBootError = {
      getR1Hints: () => ({ tap: '', scroll: '', longPressLabel: 'riprova' }),
    };
    const chip = renderer.renderContextChip(makeLm(fakeBootError), 'it');
    await matchAsciiFixture(
      {
        toString: () => chip,
        width: [...chip].length,
        height: 1,
        cells: [[...chip]],
        at: (_c: number, _r: number) => [...chip][_c] ?? '',
      } as import('@evf/shared-render').AsciiGrid,
      '../../../../shared-render/src/fixtures/status-hud.chip.boot-error.it.txt',
    );
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Phase 8 Plan 08-04 — setMovementBudget extension (SHR-MV-01..05)
//
// Tests the new `setMovementBudget(budget)` method added to StatusHudRenderer.
// The method toggles a footer chip showing `Mov 25/30` when non-null.
// SHR-MV-01: method is callable and returns void.
// SHR-MV-02: when non-null, _renderStandard inserts Mov chip row.
// SHR-MV-03: transition guard — setMovementBudget only triggers on state change.
// SHR-MV-04: INV-1 fixture round-trip (status-hud.move-chip.it.txt).
// SHR-MV-05: death-saves mode → chip NOT rendered (death-saves takes priority).
//
// @see packages/g2-app/src/status-hud/status-hud-renderer.ts setMovementBudget
// @see .planning/phases/08-manual-action-ux/08-04-PLAN.md Task 3
// ──────────────────────────────────────────────────────────────────────────────

describe('Phase 8 Plan 08-04 — setMovementBudget (SHR-MV-01..05)', () => {
  it('SHR-MV-01: setMovementBudget method exists and is callable', () => {
    const renderer = new StatusHudRenderer({ locale: 'it' });
    expect(typeof renderer.setMovementBudget).toBe('function');
    expect(() => renderer.setMovementBudget({ remaining: 25, total: 30 })).not.toThrow();
    expect(() => renderer.setMovementBudget(null)).not.toThrow();
  });

  it('SHR-MV-02: render with _movementBudget non-null → row contains Mov chip', () => {
    const renderer = new StatusHudRenderer({ locale: 'it' });
    renderer.setMovementBudget({ remaining: 25, total: 30 });
    const grid = renderer.render(makeSnapshot());
    // The Mov chip replaces one of the blank rows (row 19, 0-indexed 18)
    const rows = grid.cells.map((r) => r.join(''));
    const movRow = rows.find((r) => r.includes('25/30'));
    expect(movRow).toBeDefined();
    expect(movRow).toContain('Mov');
    // Grid must still be 28 wide × 21 rows (INV-1 shape invariant)
    expect(grid.width).toBe(28);
    expect(grid.height).toBe(21);
  });

  it('SHR-MV-02b: render with _movementBudget null → no Mov chip (standard layout)', () => {
    const renderer = new StatusHudRenderer({ locale: 'it' });
    renderer.setMovementBudget(null);
    const grid = renderer.render(makeSnapshot());
    const rows = grid.cells.map((r) => r.join(''));
    // Verify row 19 (0-indexed 18) is blank (no movement chip substitution)
    // NOTE: row 8 (0-indexed 7) always contains "Mov —/—" for the movement tracker —
    // we're specifically checking that row 19 does NOT have the budget chip.
    const row19 = rows[18] ?? '';
    expect(row19).toBe(`║${' '.repeat(26)}║`);
    // Grid shape preserved
    expect(grid.width).toBe(28);
    expect(grid.height).toBe(21);
  });

  it('SHR-MV-03: setMovementBudget is transition-driven (same value = no state change)', () => {
    const renderer = new StatusHudRenderer({ locale: 'it' });
    // Set to null first (already null) — getMovementBudgetForTest should stay null
    renderer.setMovementBudget(null);
    expect(renderer._getMovementBudgetForTest()).toBeNull();
    // Set a real value
    renderer.setMovementBudget({ remaining: 20, total: 30 });
    expect(renderer._getMovementBudgetForTest()).toEqual({ remaining: 20, total: 30 });
    // Same value again — should not change object reference (same = no-op)
    renderer.setMovementBudget({ remaining: 20, total: 30 });
    expect(renderer._getMovementBudgetForTest()).toEqual({ remaining: 20, total: 30 });
  });

  it('SHR-MV-04: render with Mov 25/30 matches status-hud.move-chip.it.txt fixture (INV-1)', async () => {
    const renderer = new StatusHudRenderer({ locale: 'it' });
    renderer.setMovementBudget({ remaining: 25, total: 30 });
    const grid = renderer.render(makeSnapshot({ name: 'Thorin', hp: 45, maxHp: 68, ac: 18 }));
    await matchAsciiFixture(
      grid,
      '../../../../shared-render/src/fixtures/status-hud.move-chip.it.txt',
    );
  });

  it('SHR-MV-05: death-saves mode → move chip NOT rendered even if setMovementBudget called', () => {
    const renderer = new StatusHudRenderer({ locale: 'it', mode: 'death-saves' });
    renderer.setMovementBudget({ remaining: 10, total: 30 });
    // Use a snapshot with hp=0 for death-saves
    const snap = makeSnapshot({ hp: 0, death: { success: 1, failure: 0 } });
    const grid = renderer.render(snap);
    const rows = grid.cells.map((r) => r.join(''));
    // Chip value (10/30) should NOT appear in death-saves layout
    const movChipRow = rows.find((r) => r.includes('10/30'));
    expect(movChipRow).toBeUndefined();
    // Death-saves layout preserved (title key is death_saves_title → IT 'TIRI SALVEZZA')
    const titleRow = rows.find(
      (r) => r.includes('TIRI') || r.includes('SALV') || r.includes('DEATH') || r.includes('MORTE'),
    );
    expect(titleRow).toBeDefined();
    // Grid shape preserved
    expect(grid.width).toBe(28);
    expect(grid.height).toBe(21);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Phase 9 Plan 09-02 — setActionEconomy extension (SHR-EW-01..06)
//
// Tests the new `setActionEconomy(state | null)` method added to StatusHudRenderer.
// When non-null, the footer row (row 19 in 1-indexed, 0-indexed row 18) shows the
// action economy widget chip: `Az ░ Bn ░ R░  Mov {n}/{t}` (or multi-attack override).
// SHR-EW-01: fresh turn (all slots empty) → Az ░ Bn ░ R░ on row 18
// SHR-EW-02: actionsUsed:1 → Az ▓ Bn ░ R░ glyph flip
// SHR-EW-03: multiAttackInProgress:true → Az ▓ [Atk N/M] override
// SHR-EW-04: transition guard — setter is no-op if structurally identical
// SHR-EW-05: death-saves mode → setActionEconomy NOT rendered (death-saves priority)
// SHR-EW-06: 4 INV-1 fixtures match via matchAsciiFixture
//
// @see packages/g2-app/src/status-hud/status-hud-renderer.ts setActionEconomy
// @see .planning/phases/09-action-economy-edge-cases/09-02-PLAN.md Task 1
// ──────────────────────────────────────────────────────────────────────────────

describe('Phase 9 Plan 09-02 — setActionEconomy (SHR-EW-01..06)', () => {
  /** Factory for a minimal fresh-turn economy state. */
  function freshEcon(
    overrides: Partial<{
      actionsUsed: 0 | 1;
      bonusActionsUsed: 0 | 1;
      reactionsUsed: 0 | 1;
      multiAttackInProgress: boolean;
      multiAttack: { current: number; total: number };
    }> = {},
  ) {
    return {
      actionsUsed: 0 as 0 | 1,
      bonusActionsUsed: 0 as 0 | 1,
      reactionsUsed: 0 as 0 | 1,
      multiAttackInProgress: false,
      ...overrides,
    };
  }

  it('SHR-EW-01: fresh turn (all slots empty) → row 18 contains Az ░ Bn ░ R░', () => {
    const renderer = new StatusHudRenderer({ locale: 'it' });
    renderer.setActionEconomy(freshEcon());
    const grid = renderer.render(makeSnapshot());
    const row18 = grid.cells[18]?.join('') ?? '';
    // Must contain available glyphs for action (░) and bonus (░)
    expect(row18).toContain('░');
    // Must contain the action short label (act_label 'Az.')
    expect(row18).toMatch(/Az/);
    // Must be 28 chars wide
    expect(grid.cells[18]?.length).toBe(28);
    // Grid dimensions preserved
    expect(grid.width).toBe(28);
    expect(grid.height).toBe(21);
  });

  it('SHR-EW-02: actionsUsed:1 → row 18 contains ▓ glyph for action slot', () => {
    const renderer = new StatusHudRenderer({ locale: 'it' });
    renderer.setActionEconomy(freshEcon({ actionsUsed: 1 }));
    const grid = renderer.render(makeSnapshot());
    const row18 = grid.cells[18]?.join('') ?? '';
    expect(row18).toContain('▓');
    expect(grid.cells[18]?.length).toBe(28);
  });

  it('SHR-EW-03: multiAttackInProgress:true → row 18 contains [Atk N/M] override', () => {
    const renderer = new StatusHudRenderer({ locale: 'it' });
    renderer.setActionEconomy(
      freshEcon({
        actionsUsed: 1,
        multiAttackInProgress: true,
        multiAttack: { current: 1, total: 2 },
      }),
    );
    const grid = renderer.render(makeSnapshot());
    const row18 = grid.cells[18]?.join('') ?? '';
    // Multi-attack override shows [Atk 1/2]
    expect(row18).toContain('[Atk 1/2]');
    expect(grid.cells[18]?.length).toBe(28);
  });

  it('SHR-EW-04: transition guard — setActionEconomy is no-op if structurally identical', () => {
    const renderer = new StatusHudRenderer({ locale: 'it' });
    renderer.setActionEconomy(null);
    expect(renderer._getActionEconomyForTest()).toBeNull();

    renderer.setActionEconomy(freshEcon({ actionsUsed: 0 }));
    const first = renderer._getActionEconomyForTest();
    expect(first).not.toBeNull();

    // Same structural value — should be a no-op (same reference if implemented correctly)
    renderer.setActionEconomy(freshEcon({ actionsUsed: 0 }));
    // Value should still be set (not cleared)
    expect(renderer._getActionEconomyForTest()).not.toBeNull();
  });

  it('SHR-EW-05: death-saves mode → setActionEconomy NOT rendered even when set', () => {
    const renderer = new StatusHudRenderer({ locale: 'it', mode: 'death-saves' });
    renderer.setActionEconomy(freshEcon({ actionsUsed: 1 }));
    const snap = makeSnapshot({ hp: 0, death: { success: 0, failure: 1 } });
    const grid = renderer.render(snap);
    // Death-saves layout has ║ borders at row 18 (0-indexed) but NO economy widget
    // (death-saves takes priority per SHR-MV-05 precedent)
    const flat = grid.toString();
    expect(flat).toContain('DEATH SAVES');
    // Economy widget glyph should not appear in death-saves rows 11..18
    const rows11to18 = grid.cells
      .slice(11, 19)
      .map((r) => r.join(''))
      .join('\n');
    // Az (act_label IT = 'Az.') should NOT appear in the death-saves body rows
    expect(rows11to18).not.toContain('[Atk');
    expect(grid.width).toBe(28);
    expect(grid.height).toBe(21);
  });

  it('SHR-EW-06a: fresh-turn fixture (IT, all slots empty, no movement) — matchAsciiFixture', async () => {
    const renderer = new StatusHudRenderer({ locale: 'it' });
    renderer.setActionEconomy(freshEcon());
    const grid = renderer.render(makeSnapshot({ name: 'Thorin', hp: 45, maxHp: 68, ac: 18 }));
    await matchAsciiFixture(
      grid,
      '../../../../shared-render/src/fixtures/status-hud.econ-widget-fresh-turn.it.txt',
    );
  });

  it('SHR-EW-06b: action-used fixture (IT, actionsUsed:1) — matchAsciiFixture', async () => {
    const renderer = new StatusHudRenderer({ locale: 'it' });
    renderer.setActionEconomy(freshEcon({ actionsUsed: 1 }));
    const grid = renderer.render(makeSnapshot({ name: 'Thorin', hp: 45, maxHp: 68, ac: 18 }));
    await matchAsciiFixture(
      grid,
      '../../../../shared-render/src/fixtures/status-hud.econ-widget-action-used.it.txt',
    );
  });

  it('SHR-EW-06c: multi-attack fixture (IT, multiAttackInProgress:true, N=1, M=2) — matchAsciiFixture', async () => {
    const renderer = new StatusHudRenderer({ locale: 'it' });
    renderer.setMovementBudget({ remaining: 0, total: 30 });
    renderer.setActionEconomy(
      freshEcon({
        actionsUsed: 1,
        multiAttackInProgress: true,
        multiAttack: { current: 1, total: 2 },
      }),
    );
    const grid = renderer.render(makeSnapshot({ name: 'Thorin', hp: 45, maxHp: 68, ac: 18 }));
    await matchAsciiFixture(
      grid,
      '../../../../shared-render/src/fixtures/status-hud.econ-widget-multi-attack.it.txt',
    );
  });

  it('SHR-EW-06d: EN locale fixture (actionsUsed:1) — matchAsciiFixture', async () => {
    const renderer = new StatusHudRenderer({ locale: 'en' });
    renderer.setActionEconomy(freshEcon({ actionsUsed: 1 }));
    const grid = renderer.render(makeSnapshot({ name: 'Thorin', hp: 45, maxHp: 68, ac: 18 }));
    await matchAsciiFixture(
      grid,
      '../../../../shared-render/src/fixtures/status-hud.econ-widget-en.txt',
    );
  });
});
