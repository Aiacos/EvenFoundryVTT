/**
 * INV-1 ck 11/12 snapshot tests for the z=1.5 toast queue (Phase 4b Plan 03 Task 2).
 *
 * Three dedicated `it()` blocks assert the 3 canonical toast-queue states
 * against character-perfect 96×24 fixtures:
 *   - TS-INV1-ck11-single   → 1 visible toast, no badge
 *   - TS-INV1-ck11-dual     → 2 visible toasts FIFO, no badge
 *   - TS-INV1-ck12-squashed → 2 visible + 7 buffered, head shows `[+7]`
 *                              (Fireball + 8 saves stress case, SC #3)
 *
 * **Dedicated file (not an extension of `snapshot.test.ts`):** Plan 03 lives
 * in Wave 2 alongside Plan 04; the Phase 4a `snapshot.test.ts` is reserved
 * for boot-error fixture cases that Plan 04 may add. Keeping toast snapshots
 * in a separate file eliminates same-wave file-overlap conflicts (per Plan
 * 03 frontmatter `files_modified`).
 *
 * **buildToastScenePage helper:** composes the canonical 96×24 page from the
 * Phase 4a IT raster-idle baseline + toast-block overlay at rows 19-20 of the
 * map area (cols 25..66). The z=0.5 idle infill strip at rows 18-20 is
 * demolished when the toast layer mounts (UI-SPEC §5.11 note) — the helper
 * blanks those map-area cells before painting the toast rows. The right-side
 * Status HUD region (cols 68-95) is preserved verbatim from the baseline.
 *
 * The fixtures themselves are committed under `packages/shared-render/src/fixtures/`
 * and were extracted character-for-character from UI-SPEC §5.11/§5.12/§5.13.
 *
 * @see .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-03-PLAN.md Task 2
 * @see .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-UI-SPEC.md §3.2 + §5.11-§5.13
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AsciiGrid, matchAsciiFixture } from '@evf/shared-render';
import { describe, expect, it } from 'vitest';
import { SEVERITY_PREFIX, type Toast } from '../toast-types.js';

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

/** Column where the map-area inner cells start (after the col-0 `║` border). */
const MAP_INNER_LEFT_COL = 1;
/** Column where the map-area inner cells end (the col-67 `║` divider is exclusive). */
const MAP_INNER_RIGHT_EXCLUSIVE = 67;
/** Row of the "above-toast" blank line that replaces the z=0.5 label separator. */
const TOAST_PRE_ROW_IDX = 18;
/** Row that carries the toast block's head (row 0 of the 2-row block). */
const TOAST_HEAD_ROW_IDX = 19;
/** Row that carries the toast block's tail (row 1 of the 2-row block). */
const TOAST_TAIL_ROW_IDX = 20;
/** Leading-space indent of the toast content within the map area (UI-SPEC §3.2). */
const TOAST_INDENT = '                         '; // 25 spaces

/** Resolve a fixture path relative to the @evf/shared-render package. */
function resolveFixture(filename: string): string {
  // packages/g2-app/src/status-hud/__tests__/ → 4 dirs up = packages/
  return resolve(__dirname, '../../../../shared-render/src/fixtures', filename);
}

/** Load the canonical Phase 4a IT baseline as the toast-scene background. */
function loadIdleBaseline(): string[] {
  const text = readFileSync(resolveFixture('glyph-scene.raster-idle-it.txt'), 'utf-8');
  const lines = text.split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  return lines;
}

/**
 * Replace the substring of `line` at [start, end) with `replacement`, padding
 * the replacement with trailing spaces if it is shorter than the slot width.
 *
 * Used to surgically overwrite the map-area cells without disturbing the
 * right-side Status HUD column (col 68+).
 */
function spliceAt(line: string, start: number, end: number, replacement: string): string {
  const slotWidth = end - start;
  const padded =
    replacement.length >= slotWidth
      ? replacement.slice(0, slotWidth)
      : replacement + ' '.repeat(slotWidth - replacement.length);
  return line.slice(0, start) + padded + line.slice(end);
}

/** Render one toast row's content (prefix + message + optional badge). */
function renderToastBody(toast: Toast, badge: string): string {
  return `${TOAST_INDENT}${SEVERITY_PREFIX[toast.severity]}${toast.message}${badge}`;
}

/**
 * Compose the full 96×24 page for a given toast-queue state.
 *
 * Steps:
 *   1. Load the Phase 4a IT baseline (`glyph-scene.raster-idle-it.txt`).
 *   2. Demolish the z=0.5 strip rows (18, 20) by blanking the map-area cells.
 *   3. Paint the head toast on row 19 with optional `[+N]` squash badge.
 *   4. Paint the tail toast on row 20 if `visibleToasts.length === 2`.
 *   5. Wrap the modified lines into an AsciiGrid.
 */
function buildToastScenePage(opts: { visibleToasts: Toast[]; bufferedCount?: number }): AsciiGrid {
  const lines = loadIdleBaseline();
  expect(lines).toHaveLength(24);

  const buffered = opts.bufferedCount ?? 0;
  const badge = buffered > 0 ? ` [+${Math.min(buffered, 99)}]` : '';

  // Demolish the z=0.5 label-separator (row 18) and stats strip (row 20-area)
  // by blanking the map-area cells. Row 19 is the toast-head row; rows 18/20
  // also need to be blanked for the "single" state to match UI-SPEC §5.11.
  const blankBody = ' '.repeat(MAP_INNER_RIGHT_EXCLUSIVE - MAP_INNER_LEFT_COL);
  for (const rowIdx of [TOAST_PRE_ROW_IDX, TOAST_HEAD_ROW_IDX, TOAST_TAIL_ROW_IDX]) {
    const line = lines[rowIdx];
    if (line === undefined) {
      throw new Error(`buildToastScenePage: missing row ${rowIdx} in baseline`);
    }
    lines[rowIdx] = spliceAt(line, MAP_INNER_LEFT_COL, MAP_INNER_RIGHT_EXCLUSIVE, blankBody);
  }

  // Paint the head row (toast 0).
  const head = opts.visibleToasts[0];
  if (head !== undefined) {
    const headRow = lines[TOAST_HEAD_ROW_IDX];
    if (headRow === undefined) {
      throw new Error('buildToastScenePage: missing head row');
    }
    lines[TOAST_HEAD_ROW_IDX] = spliceAt(
      headRow,
      MAP_INNER_LEFT_COL,
      MAP_INNER_RIGHT_EXCLUSIVE,
      renderToastBody(head, badge),
    );
  }

  // Paint the tail row (toast 1) when 2 toasts are visible.
  const tail = opts.visibleToasts[1];
  if (tail !== undefined) {
    const tailRow = lines[TOAST_TAIL_ROW_IDX];
    if (tailRow === undefined) {
      throw new Error('buildToastScenePage: missing tail row');
    }
    lines[TOAST_TAIL_ROW_IDX] = spliceAt(
      tailRow,
      MAP_INNER_LEFT_COL,
      MAP_INNER_RIGHT_EXCLUSIVE,
      renderToastBody(tail, ''),
    );
  }

  return AsciiGrid.fromString(`${lines.join('\n')}\n`);
}

// ──────────────────────────────────────────────────────────────────────────────
// Toast-queue INV-1 snapshot tests
// ──────────────────────────────────────────────────────────────────────────────

describe('Phase 4b toast queue INV-1', () => {
  it('TS-INV1-ck11-single: 1 info toast visible (no squash badge) matches toast-queue.single.it.txt', async () => {
    const page = buildToastScenePage({
      visibleToasts: [
        {
          id: 't1',
          severity: 'info',
          message: 'Danno 12 slashing',
          emittedAt: 0,
        },
      ],
    });
    expect(page.width).toBe(96);
    expect(page.height).toBe(24);
    await matchAsciiFixture(
      page,
      '../../../../shared-render/src/fixtures/toast-queue.single.it.txt',
    );
  });

  it('TS-INV1-ck11-dual: 2 toasts FIFO (no squash badge) matches toast-queue.dual.it.txt', async () => {
    const page = buildToastScenePage({
      visibleToasts: [
        {
          id: 't1',
          severity: 'info',
          message: 'Tiro Salv. DES superato',
          emittedAt: 0,
        },
        {
          id: 't2',
          severity: 'info',
          message: 'Danno 12 slashing',
          emittedAt: 0,
        },
      ],
    });
    expect(page.width).toBe(96);
    expect(page.height).toBe(24);
    await matchAsciiFixture(page, '../../../../shared-render/src/fixtures/toast-queue.dual.it.txt');
  });

  it('TS-INV1-ck12-squashed: Fireball + 8 saves stress (SC #3) shows [+7] badge on head — matches toast-queue.squashed.it.txt', async () => {
    const page = buildToastScenePage({
      visibleToasts: [
        {
          id: 't1',
          severity: 'info',
          message: 'Tiro Salv. DES superato',
          emittedAt: 0,
        },
        {
          id: 't2',
          severity: 'info',
          message: 'Danno 28 fuoco',
          emittedAt: 0,
        },
      ],
      bufferedCount: 7,
    });
    expect(page.width).toBe(96);
    expect(page.height).toBe(24);
    // Spot-check the [+7] badge literal appears in the page (load-bearing for SC #3).
    const flat = page.cells.map((row) => row.join('')).join('\n');
    expect(flat).toContain('[+7]');
    expect(flat).toContain('Tiro Salv. DES superato');
    expect(flat).toContain('Danno 28 fuoco');
    await matchAsciiFixture(
      page,
      '../../../../shared-render/src/fixtures/toast-queue.squashed.it.txt',
    );
  });
});
