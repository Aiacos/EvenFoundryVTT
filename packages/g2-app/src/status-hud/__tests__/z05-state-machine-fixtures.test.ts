/**
 * Phase 14 Plan 01 — z=0.5 state machine INV-1 snapshot tests.
 *
 * Locks the visual contract for the three layered states A/B/C per UI-SPEC §8.2
 * invariants 1, 2, 4, 5:
 *
 *   - State A — raster idle (z=0 + z=0.5 + z=1)            → glyph-scene.raster-idle*.txt
 *   - State B — overlay-open  (z=0 + z=1 + z=2 panel)      → raster-overlay-open.{it,en}.txt
 *   - State C — glyph idle    (z=0 + z=0.5 + z=1, 2-strip) → glyph-scene.glyph-idle-z05.it.txt
 *
 * Tests are split into two groups:
 *
 *   - `Z05-FX-*` — round-trip each NEW Phase 14 fixture through `matchAsciiFixture`
 *                  (covers INFILL-05 deliverable: idle-fill + overlay-mount INV-1 fixtures).
 *
 *   - `Z05-INV-*` — cross-state column-position equality assertions that prove the
 *                   frame integrity holds across the entire state machine
 *                   (covers INFILL-02 acceptance: 3 z=0.5 strips swap atomically to z=2
 *                   without shifting frame chars or the Status HUD column).
 *
 * Plan deviation (Rule 1, documented in 14-01-SUMMARY.md): the plan text cites
 * frame `║` columns at 0, 71, 95. The actual load-bearing INV-1 fixtures (frozen
 * per UI-SPEC §13 deliverable 1) have the central divider `║` at col 68, not 71.
 * Tests below use the effective columns {0, 68, 95} so they exercise the real
 * contract. Right Status HUD content + frame is therefore cols 69..95.
 *
 * @see .planning/phases/EVF-14-raster-z-0-5-idle-content-infill/14-UI-SPEC.md §8.2
 * @see .planning/phases/EVF-14-raster-z-0-5-idle-content-infill/14-01-PLAN.md
 * @see Specs.md §7.4c — z=0.5 idle infill layer
 * @requirement INFILL-02 — 3 dynamic text containers populating empty raster-mode rows
 * @requirement INFILL-05 — INV-1 fixtures for idle-fill + overlay-mount transitions
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AsciiGrid, matchAsciiFixture } from '@evf/shared-render';
import { describe, expect, it } from 'vitest';

// ──────────────────────────────────────────────────────────────────────────────
// Helpers (mirror loadSceneFixture pattern from snapshot.test.ts)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Load a fixture from `packages/shared-render/src/fixtures/` as an AsciiGrid.
 * Matches the exact path-resolution pattern used by snapshot.test.ts.
 */
function loadSceneFixture(filename: string): AsciiGrid {
  const fixturePath = resolve(__dirname, '../../../../shared-render/src/fixtures', filename);
  const text = readFileSync(fixturePath, 'utf-8');
  return AsciiGrid.fromString(text);
}

/**
 * Extract a codepoint-safe substring of `grid` row `row` from col `col` (inclusive)
 * of length `len`. Uses the grid's underlying `cells` to avoid UTF-16 surrogate
 * issues with `String.prototype.slice` on multi-codepoint glyphs (the existing
 * fixtures contain `→`, `⚔`, `·`, `▶`, etc. — all single codepoints, but the
 * implementation matches `[...string]` semantics per ascii-grid.ts:39).
 */
function sliceCells(grid: AsciiGrid, row: number, col: number, len: number): string {
  const cells = grid.cells[row];
  if (cells === undefined) throw new Error(`sliceCells: row ${row} out of bounds`);
  return cells.slice(col, col + len).join('');
}

// Effective frame-char column positions (drift from PLAN per file-header note).
const FRAME_COLS = [0, 68, 95] as const;
// Per-column "rows that hold a frame glyph at this column". The outer columns
// (0 and 95) hold a frame char on EVERY row — `║` on body rows, corner / `╠`
// / `╚` etc. on separator rows. The central divider column 68 is frame-bearing
// only on the corner rows + body rows 3..20 (`║`); rows 1 (header text) and 22
// (footer text) at col 68 hold CONTENT (e.g. `R` from `R1`), not frame chars,
// so they are excluded from cross-state frame equality.
//
// Original Phase 14 review WR-03: the prior {0, 2, 21, 23} sample (12 cells)
// missed regressions on rows 4..20. We now sweep the full set of frame-bearing
// rows per column — 24 cells on col 0, 24 cells on col 95, 22 cells on col 68
// — for a total of 70 cells per cross-state pair (vs the original 12).
const FRAME_ROWS_BY_COL: Readonly<Record<number, readonly number[]>> = {
  0: Array.from({ length: 24 }, (_, i) => i),
  68: [0, 2, ...Array.from({ length: 18 }, (_, i) => i + 3), 21, 23],
  95: Array.from({ length: 24 }, (_, i) => i),
};

// ──────────────────────────────────────────────────────────────────────────────
// Z05-FX-* — snapshot round-trip for the 3 NEW fixtures
// ──────────────────────────────────────────────────────────────────────────────

describe('Z05-FX — Phase 14 new INV-1 fixtures round-trip', () => {
  it('Z05-FX-01: raster-overlay-open.it.txt matches its own canonical bytes (INFILL-05 State B IT)', async () => {
    const grid = loadSceneFixture('raster-overlay-open.it.txt');
    expect(grid.width, 'State B IT width = 96').toBe(96);
    expect(grid.height, 'State B IT height = 24').toBe(24);
    await matchAsciiFixture(
      grid,
      '../../../../shared-render/src/fixtures/raster-overlay-open.it.txt',
    );
  });

  it('Z05-FX-02: raster-overlay-open.en.txt matches its own canonical bytes (INFILL-05 State B EN)', async () => {
    const grid = loadSceneFixture('raster-overlay-open.en.txt');
    expect(grid.width, 'State B EN width = 96').toBe(96);
    expect(grid.height, 'State B EN height = 24').toBe(24);
    await matchAsciiFixture(
      grid,
      '../../../../shared-render/src/fixtures/raster-overlay-open.en.txt',
    );
  });

  it('Z05-FX-03: glyph-scene.glyph-idle-z05.it.txt matches its own canonical bytes (INFILL-05 State C glyph + z=0.5)', async () => {
    const grid = loadSceneFixture('glyph-scene.glyph-idle-z05.it.txt');
    expect(grid.width, 'State C width = 96').toBe(96);
    expect(grid.height, 'State C height = 24').toBe(24);
    await matchAsciiFixture(
      grid,
      '../../../../shared-render/src/fixtures/glyph-scene.glyph-idle-z05.it.txt',
    );
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Z05-INV-* — cross-state column-position equality (UI-SPEC §8.2)
// ──────────────────────────────────────────────────────────────────────────────

describe('Z05-INV — cross-state INV-1 invariants (UI-SPEC §8.2)', () => {
  it('Z05-INV-01a (UI-SPEC §8.2 invariant 1, EN pair): frame chars at cols {0, 68, 95} on every frame-bearing row are byte-identical between State A EN-canonical and State B EN', () => {
    // EN-locale coherent pair: canonical baseline (raster-idle.txt, EN) ↔ State B EN.
    // Per UI-SPEC §8.2 inv.1, frame chars must occupy the same column in every state.
    // Iterates each column's frame-bearing rows (24 each for cols 0/95, 22 for col 68
    // — rows 1 and 22 at col 68 are CONTENT, not frame; see FRAME_ROWS_BY_COL).
    // An internal-row regression shifting `║` at col 68 on rows 3..20 — e.g., a frame
    // redraw bug pulling col 68 → col 67 — is now caught (Phase 14 review WR-03,
    // expanded from the original 12-cell corner sample).
    const gridA = loadSceneFixture('glyph-scene.raster-idle.txt');
    const gridB = loadSceneFixture('raster-overlay-open.en.txt');

    for (const col of FRAME_COLS) {
      for (const row of FRAME_ROWS_BY_COL[col] ?? []) {
        const a = gridA.at(col, row);
        const b = gridB.at(col, row);
        expect(
          a,
          `UI-SPEC §8.2 inv.1 (EN): State A col ${col} row ${row} must equal State B (got A=${JSON.stringify(a)} B=${JSON.stringify(b)})`,
        ).toBe(b);
      }
    }
  });

  it('Z05-INV-01b (UI-SPEC §8.2 invariant 1, IT pair): frame chars at cols {0, 68, 95} on every frame-bearing row are byte-identical across State A IT, State B IT, State C IT', () => {
    // IT-locale coherent triplet: raster-idle-it ↔ raster-overlay-open.it ↔ glyph-idle-z05.it.
    // The only locale where we currently own ALL THREE state fixtures is IT, so the
    // strongest cross-state frame-equality contract lives here. EN gets covered by
    // Z05-INV-01a (A↔B only, since `glyph-scene.glyph-idle-z05.en.txt` doesn't exist).
    // Full frame-bearing-row sweep per WR-03 — see FRAME_ROWS_BY_COL for per-col rows.
    const gridA = loadSceneFixture('glyph-scene.raster-idle-it.txt');
    const gridB = loadSceneFixture('raster-overlay-open.it.txt');
    const gridC = loadSceneFixture('glyph-scene.glyph-idle-z05.it.txt');

    for (const col of FRAME_COLS) {
      for (const row of FRAME_ROWS_BY_COL[col] ?? []) {
        const a = gridA.at(col, row);
        const b = gridB.at(col, row);
        const c = gridC.at(col, row);
        expect(
          a,
          `UI-SPEC §8.2 inv.1 (IT): State A col ${col} row ${row} must equal State B (got A=${JSON.stringify(a)} B=${JSON.stringify(b)})`,
        ).toBe(b);
        expect(
          a,
          `UI-SPEC §8.2 inv.1 (IT): State A col ${col} row ${row} must equal State C (got A=${JSON.stringify(a)} C=${JSON.stringify(c)})`,
        ).toBe(c);
      }
    }
  });

  it('Z05-INV-02 (UI-SPEC §8.2 invariant 2): right Status HUD column (cols 69..95) is byte-identical between State A EN and State B EN for rows 3..20', () => {
    const gridA = loadSceneFixture('glyph-scene.raster-idle.txt');
    const gridB = loadSceneFixture('raster-overlay-open.en.txt');

    for (let row = 3; row <= 20; row++) {
      for (let col = 69; col <= 95; col++) {
        const a = gridA.at(col, row);
        const b = gridB.at(col, row);
        expect(
          a,
          `UI-SPEC §8.2 inv.2: Status HUD col ${col} row ${row} must be byte-identical A↔B (got A=${JSON.stringify(a)} B=${JSON.stringify(b)})`,
        ).toBe(b);
      }
    }
  });

  it('Z05-INV-02b (UI-SPEC §8.2 invariant 2, IT locale): right Status HUD column (cols 69..95) is byte-identical between State A IT and State B IT for rows 3..20', () => {
    // IT is the project's primary locale per CLAUDE.md — UI-SPEC §8.2 invariant 2
    // ("byte-identical in A and B") is a per-locale property, so it must be locked
    // for IT independently from the EN pair (Z05-INV-02 above). A future regression
    // mutating IT-locale Status HUD on overlay mount would silently pass CI if this
    // assertion were absent. Empirically verified 0 mismatches at INV-1 freeze.
    const gridA = loadSceneFixture('glyph-scene.raster-idle-it.txt');
    const gridB = loadSceneFixture('raster-overlay-open.it.txt');

    for (let row = 3; row <= 20; row++) {
      for (let col = 69; col <= 95; col++) {
        const a = gridA.at(col, row);
        const b = gridB.at(col, row);
        expect(
          a,
          `UI-SPEC §8.2 inv.2 (IT): Status HUD col ${col} row ${row} must be byte-identical A↔B (got A=${JSON.stringify(a)} B=${JSON.stringify(b)})`,
        ).toBe(b);
      }
    }
  });

  it('Z05-INV-02b-triade (UI-SPEC §8.2 invariant 2 + WR-UI-03): right Status HUD column (cols 69..95) is byte-identical across triade A_it ↔ B_it ↔ C_it for rows 3..20', () => {
    // Closes WR-UI-03 regression-detection gap: original Z05-INV-02b only asserted
    // A_it ↔ B_it. C_it (glyph-scene.glyph-idle-z05.it.txt) was NOT in the byte-identity
    // chain, allowing the EN-baseline copy-paste leak (Conditions vs Condizioni, row 17
    // + ROUND vs TURNO row 1 + PF/HP, CA/AC, VEL/SPD, Az./Act, Slot/Slots locale leaks
    // on rows 5/7/9/12) to pass CI. Triade extension closes the gap.
    //
    // Exception (UI-SPEC §6.3): C-state-only `[GLY]` glyph-mode marker at row 20
    // cols 89..93 is legitimate visual contract (NOT a locale leak) — exempted via
    // a precise cell-skip rather than dropping row 20 from the sweep so any future
    // accidental drift on the rest of row 20 cols 69..88, 94..95 is still caught.
    const gridA = loadSceneFixture('glyph-scene.raster-idle-it.txt');
    const gridC = loadSceneFixture('glyph-scene.glyph-idle-z05.it.txt');
    for (let row = 3; row <= 20; row++) {
      for (let col = 69; col <= 95; col++) {
        // Skip the C-state-only [GLY] glyph-mode marker (UI-SPEC §6.3).
        if (row === 20 && col >= 89 && col <= 93) continue;
        const a = gridA.at(col, row);
        const c = gridC.at(col, row);
        expect(
          c,
          `WR-UI-03 triade: C_it col ${col} row ${row} must match A_it (got A=${JSON.stringify(a)} C=${JSON.stringify(c)})`,
        ).toBe(a);
      }
    }
  });

  it('Z05-INV-03 (UI-SPEC §8.2 invariant 4): frame columns {0, 68, 95} on every frame-bearing row match between State A IT and State B IT', () => {
    // Full frame-bearing-row sweep per WR-03 (matches Z05-INV-01a/01b coverage)
    // so an internal-row frame regression on the IT pair fails loudly here.
    const gridA = loadSceneFixture('glyph-scene.raster-idle-it.txt');
    const gridB = loadSceneFixture('raster-overlay-open.it.txt');

    for (const col of FRAME_COLS) {
      for (const row of FRAME_ROWS_BY_COL[col] ?? []) {
        const a = gridA.at(col, row);
        const b = gridB.at(col, row);
        expect(
          a,
          `UI-SPEC §8.2 inv.4: IT State A col ${col} row ${row} must equal IT State B (got A=${JSON.stringify(a)} B=${JSON.stringify(b)})`,
        ).toBe(b);
      }
    }
  });

  it('Z05-INV-04 (UI-SPEC §8.2 invariant 5): State B row 18 has z=2 panel header at cols 4..14 (`┌─[ SHEET ·`) AND right Status HUD content at cols 71..82 contains `▶ Bless (7r)`', () => {
    const gridB = loadSceneFixture('raster-overlay-open.en.txt');

    // Left half: cols 4..14 (11 chars) must start with the panel header prefix.
    const panelHeader = sliceCells(gridB, 18, 4, 11);
    expect(
      panelHeader,
      'UI-SPEC §8.2 inv.5: State B row 18 left half must show z=2 panel header (`┌─[ SHEET ·`)',
    ).toBe('┌─[ SHEET ·');

    // Right half: cols 71..82 (12 chars) must contain `▶ Bless (7r)` literal.
    const hudSnippet = sliceCells(gridB, 18, 71, 12);
    expect(
      hudSnippet,
      'UI-SPEC §8.2 inv.5: State B row 18 right half (Status HUD) must contain `▶ Bless (7r)`',
    ).toBe('▶ Bless (7r)');
  });
});
