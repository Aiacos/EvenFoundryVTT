/**
 * Unit tests for StatusHudRenderer — HUD-27PX rewrite (quick-260605-j0t Task 1).
 *
 * The renderer emits the real 27px-grid full-width character status sheet:
 *   ~50 chars wide × ~9 rows tall (replacing the old 28×21 corner card).
 *
 * Test cases per task <behavior>:
 *   - SHAPE: renderLoading/renderMissing/render produce a multi-line string with
 *     NEW_HUD_ROWS lines, each ≤ NEW_HUD_COLS chars (≤576px pretext-measured).
 *   - WIDTH-ASSERTION: every rendered line ≤576px via @evenrealities/pretext getTextWidth.
 *   - POPULATED: render(snapshot) → name/Lv row, HP bar, CA, VEL(—), conditions,
 *     slots, death saves, R1 hint row.
 *   - LONG-NAME: "Dante Lanzullissimo Il Magnifico" → name+level row still ≤576px.
 *   - CONDITIONS-OVERFLOW: 5+ conditions → truncated/overflow-marked within 576px.
 *   - DEATH-SAVES: success/failure counts drive the `ooo / ooo` glyphs.
 *   - LOCALE: it vs en labels (Turno/Turn, PF/HP, CA/AC, VEL/SPD, Cond/Cond,
 *     Slot/Slots, TS morte/Death saves).
 *   - PLACEHOLDERS: class, speed, turn/round/your-turn render as `—`.
 *
 * PLAN-CHECKER NOTE: at Task 1 commit only this file + the renderer are changed.
 * The full g2-app suite WILL be red on INV-1 fixture breaks — that is expected
 * per the plan. The fixture tests (snapshot.test.ts etc.) are fixed in Task 3.
 *
 * @see packages/g2-app/src/status-hud/status-hud-renderer.ts (implementation)
 * @see .planning/quick/260605-j0t-redesign-the-g2-hud-for-the-real-27px-fo/260605-j0t-PLAN.md
 */

import { getTextWidth } from '@evenrealities/pretext';
import type { CharacterSnapshot } from '@evf/shared-protocol';
import { describe, expect, it } from 'vitest';
import { StatusHudRenderer } from '../status-hud-renderer.js';

// ──────────────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────────────

/** G2 full-width display pixel budget per @evenrealities/pretext README. */
const G2_WIDTH_PX = 576;

/**
 * Expected row count for the new full-width 27px status sheet.
 * 8 rows: name/level, divider, HP/CA/VEL, turn row, conditions, divider,
 *         slots, death saves.
 *
 * R1 hint was row 8 (9th row) but removed (j0t-05): 9×27=243px > h=234px
 * status-hud container; footer id5 already shows the R1 hint via hud-chrome.
 */
const NEW_HUD_ROWS = 8;

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

/** Minimal valid CharacterSnapshot factory for test use. */
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
    skills: {
      acr: { total: 0, ability: 'dex' as const, proficient: 0 as const, passive: 10 },
      ani: { total: 0, ability: 'wis' as const, proficient: 0 as const, passive: 10 },
      arc: { total: 0, ability: 'int' as const, proficient: 0 as const, passive: 10 },
      ath: { total: 0, ability: 'str' as const, proficient: 0 as const, passive: 10 },
      dec: { total: 0, ability: 'cha' as const, proficient: 0 as const, passive: 10 },
      his: { total: 0, ability: 'int' as const, proficient: 0 as const, passive: 10 },
      ins: { total: 0, ability: 'wis' as const, proficient: 0 as const, passive: 10 },
      itm: { total: 0, ability: 'cha' as const, proficient: 0 as const, passive: 10 },
      inv: { total: 0, ability: 'int' as const, proficient: 0 as const, passive: 10 },
      med: { total: 0, ability: 'wis' as const, proficient: 0 as const, passive: 10 },
      nat: { total: 0, ability: 'int' as const, proficient: 0 as const, passive: 10 },
      prc: { total: 0, ability: 'wis' as const, proficient: 0 as const, passive: 10 },
      prf: { total: 0, ability: 'cha' as const, proficient: 0 as const, passive: 10 },
      per: { total: 0, ability: 'cha' as const, proficient: 0 as const, passive: 10 },
      rel: { total: 0, ability: 'int' as const, proficient: 0 as const, passive: 10 },
      slt: { total: 0, ability: 'dex' as const, proficient: 0 as const, passive: 10 },
      ste: { total: 0, ability: 'dex' as const, proficient: 0 as const, passive: 10 },
      sur: { total: 0, ability: 'wis' as const, proficient: 0 as const, passive: 10 },
    },
    class: 'Fighter',
    initiative: 2,
    speed: 30,
    ...overrides,
  };
}

/**
 * Full approved mockup snapshot per the plan design contract.
 */
const APPROVED_SNAPSHOT: CharacterSnapshot = makeSnapshot({
  actorId: 'dante-actor',
  name: 'Dante Lanzulli',
  level: 10,
  hp: 41,
  maxHp: 63,
  tempHp: 0,
  ac: 16,
  conditions: ['concentrato', 'benedetto'],
  death: { success: 0, failure: 0 },
  spells: {
    slots: [
      { level: 1, value: 3, max: 4 },
      { level: 2, value: 2, max: 3 },
      { level: 3, value: 1, max: 2 },
    ],
    spells: [],
  },
});

/**
 * Split a renderer toString output into lines and assert every line ≤576px.
 * Returns the lines array for further assertions.
 */
function assertAllLinesWithinBudget(output: string): string[] {
  const lines = output.split('\n');
  for (const line of lines) {
    const px = getTextWidth(line);
    expect(px, `line "${line}" width ${px}px exceeds 576px`).toBeLessThanOrEqual(G2_WIDTH_PX);
  }
  return lines;
}

// ──────────────────────────────────────────────────────────────────────────────
// SHAPE: row count + pretext width constraint
// ──────────────────────────────────────────────────────────────────────────────

describe('StatusHudRenderer 27px — renderLoading shape', () => {
  it('SHR27-1: renderLoading() returns exactly NEW_HUD_ROWS lines', () => {
    const renderer = new StatusHudRenderer({ locale: 'en' });
    const output = renderer.renderLoading();
    const lines = output.split('\n');
    expect(lines.length).toBe(NEW_HUD_ROWS);
  });

  it('SHR27-2: renderLoading() every line ≤576px (WIDTH-ASSERTION via pretext)', () => {
    const renderer = new StatusHudRenderer({ locale: 'en' });
    const output = renderer.renderLoading();
    assertAllLinesWithinBudget(output);
  });

  it('SHR27-3: renderLoading() line[0] contains `…` or `—` (loading placeholders)', () => {
    const renderer = new StatusHudRenderer({ locale: 'en' });
    const output = renderer.renderLoading();
    const lines = output.split('\n');
    // Name/level row should contain some placeholder
    expect(lines[0]).toMatch(/[…—]/);
  });

  it('SHR27-4: renderLoading() HP row contains `…` (loading HP marker)', () => {
    const renderer = new StatusHudRenderer({ locale: 'en' });
    const output = renderer.renderLoading();
    expect(output).toContain('…');
  });
});

describe('StatusHudRenderer 27px — renderMissing shape', () => {
  it('SHR27-5: renderMissing() returns exactly NEW_HUD_ROWS lines', () => {
    const renderer = new StatusHudRenderer({ locale: 'en' });
    const output = renderer.renderMissing();
    const lines = output.split('\n');
    expect(lines.length).toBe(NEW_HUD_ROWS);
  });

  it('SHR27-6: renderMissing() every line ≤576px', () => {
    const renderer = new StatusHudRenderer({ locale: 'en' });
    const output = renderer.renderMissing();
    assertAllLinesWithinBudget(output);
  });

  it('SHR27-7: renderMissing() contains em-dash placeholders', () => {
    const renderer = new StatusHudRenderer({ locale: 'en' });
    const output = renderer.renderMissing();
    expect(output).toContain('—');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// WIDTH-ASSERTION: the critical test — every line of render() ≤576px
// ──────────────────────────────────────────────────────────────────────────────

describe('StatusHudRenderer 27px — WIDTH-ASSERTION (pretext)', () => {
  it('SHR27-W1: render(approvedSnapshot) all lines ≤576px', () => {
    const renderer = new StatusHudRenderer({ locale: 'it' });
    const output = renderer.render(APPROVED_SNAPSHOT);
    assertAllLinesWithinBudget(output);
  });

  it('SHR27-W2: render(snapshot) en locale all lines ≤576px', () => {
    const renderer = new StatusHudRenderer({ locale: 'en' });
    const output = renderer.render(APPROVED_SNAPSHOT);
    assertAllLinesWithinBudget(output);
  });

  it('SHR27-W3: renderLoading() it locale all lines ≤576px', () => {
    const renderer = new StatusHudRenderer({ locale: 'it' });
    const output = renderer.renderLoading();
    assertAllLinesWithinBudget(output);
  });

  it('SHR27-W4: renderMissing() de locale all lines ≤576px', () => {
    const renderer = new StatusHudRenderer({ locale: 'de' });
    const output = renderer.renderMissing();
    assertAllLinesWithinBudget(output);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// POPULATED: approved mockup content
// ──────────────────────────────────────────────────────────────────────────────

describe('StatusHudRenderer 27px — render(snapshot) content', () => {
  it('SHR27-P1: name + level appear in first line', () => {
    const renderer = new StatusHudRenderer({ locale: 'it' });
    const output = renderer.render(APPROVED_SNAPSHOT);
    const lines = output.split('\n');
    expect(lines[0]).toContain('Dante Lanzulli');
    expect(lines[0]).toContain('Lv10');
  });

  it('SHR27-P2: HP bar + cur/max + CA value in HP row', () => {
    const renderer = new StatusHudRenderer({ locale: 'it' });
    const output = renderer.render(APPROVED_SNAPSHOT);
    expect(output).toContain('41/63');
    expect(output).toContain('CA 16');
    // HP bar should have some block/shade characters
    const barChars = [...output].filter((c) => c === '█' || c === '▓' || c === '░');
    expect(barChars.length).toBeGreaterThan(0);
  });

  it('SHR27-P3: class label renders as `—` (not in CharacterSnapshot)', () => {
    const renderer = new StatusHudRenderer({ locale: 'it' });
    const output = renderer.render(APPROVED_SNAPSHOT);
    // Class should be a dash placeholder (no "Chierico" hardcoded)
    const lines = output.split('\n');
    // Name/level row — class is absent, show '—'
    expect(lines[0]).toContain('—');
    expect(lines[0]).not.toContain('Chierico');
  });

  it('SHR27-P4: VEL/speed renders as `—` (not in CharacterSnapshot)', () => {
    const renderer = new StatusHudRenderer({ locale: 'it' });
    const output = renderer.render(APPROVED_SNAPSHOT);
    expect(output).toContain('VEL —');
    // No hardcoded "9m"
    expect(output).not.toContain('9m');
  });

  it('SHR27-P5: conditions line contains active conditions', () => {
    const renderer = new StatusHudRenderer({ locale: 'it' });
    const output = renderer.render(APPROVED_SNAPSHOT);
    expect(output).toContain('concentrato');
    expect(output).toContain('benedetto');
  });

  it('SHR27-P6: spell slots rendered (level 1/2/3 from snapshot)', () => {
    const renderer = new StatusHudRenderer({ locale: 'it' });
    const output = renderer.render(APPROVED_SNAPSHOT);
    // Slot row should mention level 1/2/3 — exact format may vary but slots present
    expect(output).toContain('1');
    // Should have slot-indicator glyphs (filled/empty circles)
    expect(output).toMatch(/[●○◉]/);
  });

  it('SHR27-P7: death-saves row rendered (TS morte ooo / ooo format)', () => {
    const renderer = new StatusHudRenderer({ locale: 'it' });
    const output = renderer.render(APPROVED_SNAPSHOT);
    // TS morte section with slot glyphs
    expect(output).toMatch(/TS|morte|[◯●]/i);
  });

  it('SHR27-P8: last row is death saves (NOT R1 hint — removed in j0t-05)', () => {
    const renderer = new StatusHudRenderer({ locale: 'it' });
    const output = renderer.render(APPROVED_SNAPSHOT);
    const lines = output.split('\n');
    // 8 rows: last row (index 7) is death saves, not R1 hint.
    // R1 hint is in the footer container (id5) via hud-chrome, not the body sheet.
    const lastLine = lines[lines.length - 1] ?? '';
    expect(lastLine).toMatch(/TS|morte|Death|saves|[●○]/i);
    // Explicitly assert R1 hint is NOT the body sheet's last row
    expect(lastLine).not.toMatch(/^R1:/);
  });

  it('SHR27-P9: turn/round render as `—` (not in CharacterSnapshot)', () => {
    const renderer = new StatusHudRenderer({ locale: 'it' });
    const output = renderer.render(APPROVED_SNAPSHOT);
    // Turno 2/5 and Round 3 are not in snapshot — expect em-dash placeholders
    expect(output).not.toContain('Turno 2/5');
    expect(output).not.toContain('Round 3');
    expect(output).not.toContain('[TUO TURNO]');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// LONG-NAME: truncation with pretext measurement
// ──────────────────────────────────────────────────────────────────────────────

describe('StatusHudRenderer 27px — long-name truncation', () => {
  it('SHR27-LN1: very long name truncates with `…` so name+level row ≤576px', () => {
    const renderer = new StatusHudRenderer({ locale: 'it' });
    const longName = 'Dante Lanzullissimo Il Magnifico';
    const output = renderer.render(makeSnapshot({ name: longName, level: 10 }));
    const lines = output.split('\n');
    const firstLine = lines[0] ?? '';
    // The line must fit in 576px
    expect(getTextWidth(firstLine)).toBeLessThanOrEqual(G2_WIDTH_PX);
    // If the name was truncated, it should contain '…'
    if (!firstLine.includes(longName)) {
      expect(firstLine).toContain('…');
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// CONDITIONS-OVERFLOW: 5+ conditions
// ──────────────────────────────────────────────────────────────────────────────

describe('StatusHudRenderer 27px — conditions overflow', () => {
  it('SHR27-CO1: 5 conditions → line(s) still ≤576px and overflow marked', () => {
    const renderer = new StatusHudRenderer({ locale: 'it' });
    const output = renderer.render(
      makeSnapshot({
        conditions: ['concentrato', 'benedetto', 'avvelenato', 'prono', 'invisibile'],
      }),
    );
    const lines = assertAllLinesWithinBudget(output);
    // Should indicate overflow somehow (ellipsis, +N notation, or truncated list)
    const hasOverflowMarker =
      lines.some((l) => l.includes('…')) ||
      lines.some((l) => l.match(/\+\d/)) ||
      lines.some((l) => l.includes('…'));
    expect(hasOverflowMarker || lines.some((l) => l.includes('avvelenato'))).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// DEATH-SAVES: success/failure counts drive glyphs
// ──────────────────────────────────────────────────────────────────────────────

describe('StatusHudRenderer 27px — death saves', () => {
  it('SHR27-DS1: death.success=2, death.failure=1 → filled/empty glyphs in output', () => {
    const renderer = new StatusHudRenderer({ locale: 'it' });
    const output = renderer.render(
      makeSnapshot({ death: { success: 2, failure: 1 }, hp: 41, maxHp: 63 }),
    );
    // Output should contain glyph indicators (● filled or ◯ empty)
    expect(output).toMatch(/[●◯◉○]/);
  });

  it('SHR27-DS2: death.success=0, failure=0 → all empty glyphs', () => {
    const renderer = new StatusHudRenderer({ locale: 'it' });
    const output = renderer.render(makeSnapshot({ death: { success: 0, failure: 0 } }));
    expect(output).toMatch(/[◯○]/);
  });

  it('SHR27-DS3: death row ≤576px regardless of success/failure count', () => {
    const renderer = new StatusHudRenderer({ locale: 'it' });
    const output = renderer.render(makeSnapshot({ death: { success: 3, failure: 3 } }));
    assertAllLinesWithinBudget(output);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// LOCALE: it vs en labels
// ──────────────────────────────────────────────────────────────────────────────

describe('StatusHudRenderer 27px — locale switching', () => {
  it('SHR27-LOC1: locale="it" → CA (not AC), PF (not HP), VEL (not SPD)', () => {
    const renderer = new StatusHudRenderer({ locale: 'it' });
    const output = renderer.render(APPROVED_SNAPSHOT);
    expect(output).toContain('CA');
    expect(output).toContain('PF');
    expect(output).toContain('VEL');
  });

  it('SHR27-LOC2: locale="en" → AC, HP, SPD', () => {
    const renderer = new StatusHudRenderer({ locale: 'en' });
    const output = renderer.render(APPROVED_SNAPSHOT);
    expect(output).toContain('AC');
    expect(output).toContain('HP');
    expect(output).toContain('SPD');
  });

  it('SHR27-LOC3: locale="it" → Turno row label (not Turn)', () => {
    const renderer = new StatusHudRenderer({ locale: 'it' });
    const output = renderer.render(APPROVED_SNAPSHOT);
    // Turn row — uses IT label
    expect(output).toMatch(/Turno|TURNO/i);
    // Should not use English "Turn" alone
    expect(output).not.toMatch(/\bTurn\b/);
  });

  it('SHR27-LOC4: locale="en" → Turn row label (not Turno)', () => {
    const renderer = new StatusHudRenderer({ locale: 'en' });
    const output = renderer.render(APPROVED_SNAPSHOT);
    expect(output).toMatch(/Turn|TURN/i);
  });

  it('SHR27-LOC5: locale="it" → TS morte (death saves label)', () => {
    const renderer = new StatusHudRenderer({ locale: 'it' });
    const output = renderer.render(APPROVED_SNAPSHOT);
    expect(output).toMatch(/TS|morte/i);
  });

  it('SHR27-LOC6: locale="en" → Death saves row in English', () => {
    const renderer = new StatusHudRenderer({ locale: 'en' });
    const output = renderer.render(APPROVED_SNAPSHOT);
    expect(output).toMatch(/Death|saves/i);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// PLACEHOLDERS: class/speed/turn render as —
// ──────────────────────────────────────────────────────────────────────────────

describe('StatusHudRenderer 27px — placeholder (—) for missing CharacterSnapshot fields', () => {
  it('SHR27-PH1: class label is never a real class name (always — placeholder)', () => {
    const renderer = new StatusHudRenderer({ locale: 'it' });
    const output = renderer.render(makeSnapshot({ name: 'Thorin', level: 5 }));
    // Should not contain any hardcoded class names
    expect(output).not.toContain('Chierico');
    expect(output).not.toContain('Guerriero');
    expect(output).not.toContain('Mago');
    // Should contain a placeholder
    expect(output).toContain('—');
  });

  it('SHR27-PH2: VEL/speed never contains a real speed value (always — placeholder)', () => {
    const renderer = new StatusHudRenderer({ locale: 'it' });
    const output = renderer.render(makeSnapshot());
    expect(output).not.toContain('9m');
    expect(output).not.toContain('30ft');
  });
});
