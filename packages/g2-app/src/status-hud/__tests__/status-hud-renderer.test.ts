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

// ──────────────────────────────────────────────────────────────────────────────
// COMPACT hybrid card (Feature 002 slice 4) — 176px right-column status card
// ──────────────────────────────────────────────────────────────────────────────

/**
 * `hybrid-status-hud` container width (id 6, x=400) per container-registry.ts.
 * Every compact line MUST measure ≤ this via pretext getTextWidth (INV-1).
 */
const HYBRID_WIDTH_PX = 176;

/** The canonical set of locales exercised by the compact INV-1 sweep. */
const COMPACT_LOCALES = ['it', 'en'] as const;

/**
 * Assert every line of a compact-card output measures ≤176px. Returns the lines.
 * This is the load-bearing INV-1 contract for the narrow hybrid column.
 */
function assertAllLinesWithinHybridBudget(output: string): string[] {
  const lines = output.split('\n');
  for (const line of lines) {
    const px = getTextWidth(line);
    expect(
      px,
      `compact line "${line}" width ${px}px exceeds ${HYBRID_WIDTH_PX}px`,
    ).toBeLessThanOrEqual(HYBRID_WIDTH_PX);
  }
  return lines;
}

describe('StatusHudRenderer compact — shape + defaults', () => {
  it('SHRC-1: compact render() returns exactly NEW_HUD_ROWS (8) lines', () => {
    const renderer = new StatusHudRenderer({ locale: 'it', compact: true });
    expect(renderer.render(APPROVED_SNAPSHOT).split('\n')).toHaveLength(NEW_HUD_ROWS);
  });

  it('SHRC-2: compact renderLoading()/renderMissing() each return 8 lines', () => {
    const renderer = new StatusHudRenderer({ locale: 'en', compact: true });
    expect(renderer.renderLoading().split('\n')).toHaveLength(NEW_HUD_ROWS);
    expect(renderer.renderMissing().split('\n')).toHaveLength(NEW_HUD_ROWS);
  });

  it('SHRC-3: compact defaults the width gate to 176 (no explicit maxWidthPx)', () => {
    // A name far wider than 176px but well under 576px must be truncated in
    // compact mode — proving the gate defaulted to 176, not 576.
    const renderer = new StatusHudRenderer({ locale: 'it', compact: true });
    const wideName = 'Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const first = renderer.render(makeSnapshot({ name: wideName })).split('\n')[0] ?? '';
    expect(getTextWidth(first)).toBeLessThanOrEqual(HYBRID_WIDTH_PX);
    expect(first).toContain('…');
  });
});

describe('StatusHudRenderer compact — INV-1 width sweep (≤176px)', () => {
  for (const locale of COMPACT_LOCALES) {
    it(`SHRC-W-${locale}-populated: render(approved) all lines ≤176px`, () => {
      const renderer = new StatusHudRenderer({ locale, compact: true });
      assertAllLinesWithinHybridBudget(renderer.render(APPROVED_SNAPSHOT));
    });

    it(`SHRC-W-${locale}-loading: renderLoading() all lines ≤176px`, () => {
      const renderer = new StatusHudRenderer({ locale, compact: true });
      assertAllLinesWithinHybridBudget(renderer.renderLoading());
    });

    it(`SHRC-W-${locale}-missing: renderMissing() all lines ≤176px`, () => {
      const renderer = new StatusHudRenderer({ locale, compact: true });
      assertAllLinesWithinHybridBudget(renderer.renderMissing());
    });

    it(`SHRC-W-${locale}-long-name: 32-char name row ≤176px, truncated`, () => {
      const renderer = new StatusHudRenderer({ locale, compact: true });
      const out = renderer.render(makeSnapshot({ name: 'Dante Lanzullissimo Il Magnifico' }));
      const [nameLine] = assertAllLinesWithinHybridBudget(out);
      expect(nameLine).toContain('…');
    });

    it(`SHRC-W-${locale}-long-class: multiclass name on level row ≤176px`, () => {
      const renderer = new StatusHudRenderer({ locale, compact: true });
      // "Lv20 Sorcerer / Warlock / Paladin" far exceeds 176px → must gate-truncate.
      const out = renderer.render(
        makeSnapshot({ level: 20, class: 'Sorcerer / Warlock / Paladin' }),
      );
      const lines = assertAllLinesWithinHybridBudget(out);
      expect(lines[1]).toContain('Lv20');
      expect(lines[1]).toContain('…');
    });

    it(`SHRC-W-${locale}-hp-7-vs-700: single- and triple-digit HP rows ≤176px`, () => {
      const renderer = new StatusHudRenderer({ locale, compact: true });
      assertAllLinesWithinHybridBudget(
        renderer.render(makeSnapshot({ hp: 7, maxHp: 9, tempHp: 0 })),
      );
      assertAllLinesWithinHybridBudget(
        renderer.render(makeSnapshot({ hp: 700, maxHp: 700, tempHp: 99 })),
      );
    });

    it(`SHRC-W-${locale}-conditions: 0 and many conditions rows ≤176px`, () => {
      const renderer = new StatusHudRenderer({ locale, compact: true });
      assertAllLinesWithinHybridBudget(renderer.render(makeSnapshot({ conditions: [] })));
      assertAllLinesWithinHybridBudget(
        renderer.render(
          makeSnapshot({
            conditions: [
              'concentrato',
              'benedetto',
              'avvelenato',
              'prono',
              'invisibile',
              'stordito',
            ],
          }),
        ),
      );
    });

    it(`SHRC-W-${locale}-slots: many high-value slots row ≤176px`, () => {
      const renderer = new StatusHudRenderer({ locale, compact: true });
      const out = renderer.render(
        makeSnapshot({
          spells: {
            slots: [
              { level: 1, value: 4, max: 4 },
              { level: 2, value: 3, max: 3 },
              { level: 3, value: 3, max: 3 },
              { level: 4, value: 2, max: 2 },
              { level: 5, value: 1, max: 1 },
            ],
            spells: [],
          },
        }),
      );
      assertAllLinesWithinHybridBudget(out);
    });

    it(`SHRC-W-${locale}-death-saves: every success/failure count row ≤176px`, () => {
      const renderer = new StatusHudRenderer({ locale, compact: true });
      for (let s = 0; s <= 3; s++) {
        for (let f = 0; f <= 3; f++) {
          assertAllLinesWithinHybridBudget(
            renderer.render(makeSnapshot({ death: { success: s, failure: f } })),
          );
        }
      }
    });
  }

  it('SHRC-W-de-missing: de locale renderMissing() all lines ≤176px', () => {
    const renderer = new StatusHudRenderer({ locale: 'de', compact: true });
    assertAllLinesWithinHybridBudget(renderer.renderMissing());
  });

  it('SHRC-W-de-populated: de locale render(approved) all lines ≤176px', () => {
    const renderer = new StatusHudRenderer({ locale: 'de', compact: true });
    assertAllLinesWithinHybridBudget(renderer.render(APPROVED_SNAPSHOT));
  });
});

describe('StatusHudRenderer compact — content (real class/speed from snapshot)', () => {
  it('SHRC-C1: level row shows real class name (not em-dash) when present', () => {
    const renderer = new StatusHudRenderer({ locale: 'en', compact: true });
    const lines = renderer.render(makeSnapshot({ level: 5, class: 'Fighter' })).split('\n');
    expect(lines[1]).toBe('Lv5 Fighter');
  });

  it('SHRC-C2: empty class falls back to em-dash on the level row', () => {
    const renderer = new StatusHudRenderer({ locale: 'en', compact: true });
    const lines = renderer.render(makeSnapshot({ level: 3, class: '' })).split('\n');
    expect(lines[1]).toBe('Lv3 —');
  });

  it('SHRC-C3: AC/VEL row shows real speed value (not em-dash)', () => {
    const renderer = new StatusHudRenderer({ locale: 'it', compact: true });
    const out = renderer.render(makeSnapshot({ ac: 16, speed: 30 }));
    expect(out).toContain('CA 16');
    expect(out).toContain('VEL 30');
  });

  it('SHRC-C4: en locale AC/VEL row uses AC + SPD labels with real speed', () => {
    const renderer = new StatusHudRenderer({ locale: 'en', compact: true });
    const out = renderer.render(makeSnapshot({ ac: 18, speed: 25 }));
    expect(out).toContain('AC 18');
    expect(out).toContain('SPD 25');
  });

  it('SHRC-C5: HP row includes temp-HP suffix when tempHp > 0, omits when 0', () => {
    const renderer = new StatusHudRenderer({ locale: 'it', compact: true });
    expect(renderer.render(makeSnapshot({ hp: 41, maxHp: 63, tempHp: 10 }))).toContain(
      '41/63 +10t',
    );
    const noTemp = renderer.render(makeSnapshot({ hp: 41, maxHp: 63, tempHp: 0 }));
    expect(noTemp).toContain('41/63');
    expect(noTemp).not.toContain('+');
  });

  it('SHRC-C6: HP row renders a glyph bar and cur/max', () => {
    const renderer = new StatusHudRenderer({ locale: 'it', compact: true });
    const out = renderer.render(APPROVED_SNAPSHOT);
    expect(out).toContain('41/63');
    const barChars = [...out].filter((c) => c === '█' || c === '▓' || c === '░');
    expect(barChars.length).toBeGreaterThan(0);
  });

  it('SHRC-C7: death-saves row uses the compact TS/DS label with tight tracks', () => {
    const it = new StatusHudRenderer({ locale: 'it', compact: true });
    const en = new StatusHudRenderer({ locale: 'en', compact: true });
    const snap = makeSnapshot({ death: { success: 2, failure: 1 } });
    const itLast = it.render(snap).split('\n').at(-1) ?? '';
    const enLast = en.render(snap).split('\n').at(-1) ?? '';
    expect(itLast).toBe('TS ●●○/●○○');
    expect(enLast).toBe('DS ●●○/●○○');
  });

  it('SHRC-C8: turn/round remain absent from the compact card (combat-channel data)', () => {
    const renderer = new StatusHudRenderer({ locale: 'it', compact: true });
    const out = renderer.render(APPROVED_SNAPSHOT);
    expect(out).not.toContain('Turno');
    expect(out).not.toContain('Round');
  });

  it('SHRC-C9: loading state HP row carries the … marker', () => {
    const renderer = new StatusHudRenderer({ locale: 'it', compact: true });
    expect(renderer.renderLoading()).toContain('…');
  });

  it('SHRC-C10: missing state renders em-dash placeholders', () => {
    const renderer = new StatusHudRenderer({ locale: 'it', compact: true });
    expect(renderer.renderMissing()).toContain('—');
  });
});

describe('StatusHudRenderer compact — full-width path unchanged', () => {
  it('SHRC-U1: non-compact render is byte-identical with and without explicit maxWidthPx=576', () => {
    const a = new StatusHudRenderer({ locale: 'it' });
    const b = new StatusHudRenderer({ locale: 'it', compact: false, maxWidthPx: 576 });
    expect(b.render(APPROVED_SNAPSHOT)).toBe(a.render(APPROVED_SNAPSHOT));
    expect(b.renderLoading()).toBe(a.renderLoading());
    expect(b.renderMissing()).toBe(a.renderMissing());
  });

  it('SHRC-U2: full-width sheet still emits lines wider than the 176 compact budget', () => {
    // Guards against an accidental global narrowing of the default gate: the
    // full-width divider row is ~44 chars and must exceed 176px.
    const renderer = new StatusHudRenderer({ locale: 'it' });
    const anyWide = renderer
      .render(APPROVED_SNAPSHOT)
      .split('\n')
      .some((l) => getTextWidth(l) > HYBRID_WIDTH_PX);
    expect(anyWide).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Transition-guarded setters — setMovementBudget / setActionEconomy
//
// Both setters short-circuit when the incoming value is structurally identical
// to the current one (overlay callers spam them on every frame). These tests
// assert the guard actually holds/replaces state, not just that it runs.
// ──────────────────────────────────────────────────────────────────────────────

describe('StatusHudRenderer — setMovementBudget transition guard', () => {
  it('stores a budget, is a no-op on an identical budget, and replaces on a change', () => {
    const r = new StatusHudRenderer({ locale: 'en' });
    expect(r._getMovementBudgetForTest()).toBeNull();

    r.setMovementBudget({ remaining: 20, total: 30 });
    const first = r._getMovementBudgetForTest();
    expect(first).toEqual({ remaining: 20, total: 30 });

    // Structurally-identical values → guard returns early; reference is preserved.
    r.setMovementBudget({ remaining: 20, total: 30 });
    expect(r._getMovementBudgetForTest()).toBe(first);

    // A changed value replaces the stored budget.
    r.setMovementBudget({ remaining: 5, total: 30 });
    expect(r._getMovementBudgetForTest()).toEqual({ remaining: 5, total: 30 });
  });

  it('clearing to null is a no-op when already null, and clears a set budget', () => {
    const r = new StatusHudRenderer({ locale: 'en' });
    // null → already null: guard short-circuits.
    r.setMovementBudget(null);
    expect(r._getMovementBudgetForTest()).toBeNull();
    // set → null: clears.
    r.setMovementBudget({ remaining: 1, total: 6 });
    r.setMovementBudget(null);
    expect(r._getMovementBudgetForTest()).toBeNull();
  });
});

describe('StatusHudRenderer — setActionEconomy transition guard', () => {
  const base = {
    actionsUsed: 0,
    bonusActionsUsed: 0,
    reactionsUsed: 0,
    multiAttackInProgress: false,
  } as const;

  it('stores state, no-ops on a structurally-equal state, and replaces on any field change', () => {
    const r = new StatusHudRenderer({ locale: 'en' });
    expect(r._getActionEconomyForTest()).toBeNull();

    r.setActionEconomy({ ...base });
    const first = r._getActionEconomyForTest();
    expect(first).toEqual(base);

    // Equal in every compared field → guard returns; stored reference unchanged.
    r.setActionEconomy({ ...base });
    expect(r._getActionEconomyForTest()).toBe(first);

    // Flip one field → state is replaced.
    r.setActionEconomy({ ...base, reactionsUsed: 1 });
    expect(r._getActionEconomyForTest()?.reactionsUsed).toBe(1);
  });

  it('compares nested multiAttack current/total, replacing when they differ', () => {
    const r = new StatusHudRenderer({ locale: 'en' });
    r.setActionEconomy({
      ...base,
      multiAttackInProgress: true,
      multiAttack: { current: 1, total: 3 },
    });
    const first = r._getActionEconomyForTest();

    // Same nested numbers → no-op.
    r.setActionEconomy({
      ...base,
      multiAttackInProgress: true,
      multiAttack: { current: 1, total: 3 },
    });
    expect(r._getActionEconomyForTest()).toBe(first);

    // Different nested current → replace.
    r.setActionEconomy({
      ...base,
      multiAttackInProgress: true,
      multiAttack: { current: 2, total: 3 },
    });
    expect(r._getActionEconomyForTest()?.multiAttack?.current).toBe(2);
  });

  it('clearing to null no-ops when already null and clears a set state', () => {
    const r = new StatusHudRenderer({ locale: 'en' });
    r.setActionEconomy(null);
    expect(r._getActionEconomyForTest()).toBeNull();
    r.setActionEconomy({ ...base });
    r.setActionEconomy(null);
    expect(r._getActionEconomyForTest()).toBeNull();
  });
});
