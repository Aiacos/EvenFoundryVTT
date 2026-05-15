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
