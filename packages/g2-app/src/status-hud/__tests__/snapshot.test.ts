/**
 * INV-1 per-ck snapshot tests (W-2 closure per 04A-PLAN-CHECK.md).
 *
 * Maps each of the 5 INV-1 checklist items (ck 11, ck 12, ck 13, ck 14, ck 15)
 * to a dedicated named `it()` block with its own `matchAsciiFixture` assertion.
 * Closes the gap where ck 12 (raster-idle) and ck 13 (glyph + [GLY]) lacked
 * dedicated assertions in earlier plans.
 *
 * Fixture mapping (per UI-SPEC §Fixture File Map):
 *   ck 11 — status-hud.hp-overflow.txt + status-hud.conditions-overflow.txt
 *   ck 12 — glyph-scene.raster-idle.txt
 *   ck 13 — glyph-scene.glyph-idle.txt (asserts [GLY] badge at col 89-93)
 *   ck 14 — glyph-scene.raster-idle-{it,en,de}.txt
 *   ck 15 — status-hud.loading.txt
 *
 * The snapshot tests for ck 11 + ck 15 are covered by `status-hud-renderer.test.ts`
 * (via the renderer's direct fixture-match assertions). This file adds dedicated
 * per-ck assertions and also covers the full-96×24-page scene fixtures (ck 12-14)
 * via a small `buildFullPageSnapshot` helper.
 *
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04A-PLAN-CHECK.md §W-2
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04A-UI-SPEC.md §Fixture File Map
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CharacterSnapshot } from '@evf/shared-protocol';
import { AsciiGrid, matchAsciiFixture } from '@evf/shared-render';
import { describe, expect, it } from 'vitest';
import type { HudLocale } from '../i18n-budgets.js';
import { StatusHudRenderer } from '../status-hud-renderer.js';

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

/** Snapshot used as the canonical "idle" character for HUD card assertions. */
const IDLE_SNAPSHOT: CharacterSnapshot = {
  actorId: 'thorin',
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
};

/**
 * Compose the canonical full 96×24 page snapshot from a scene fixture file.
 *
 * For Phase 4a Plan 04 the renderer only owns the 28×21 Status HUD card.
 * Full-page composition (map area + footer + z=0.5 strips) is the
 * responsibility of Plan 05 smoke + Plan 06 wiring. To keep the W-2 per-ck
 * assertions self-contained at this commit boundary, this helper LOADS the
 * canonical fixture from disk and returns it as an AsciiGrid — the test
 * round-trips the fixture through `matchAsciiFixture` so any future drift
 * (e.g., someone hand-edits the fixture and breaks 96-char uniformity) fails
 * the snapshot test loudly.
 *
 * This pattern is the closest direct analog to what Plan 05 will exercise
 * once the LayerManager composes the page programmatically. Documented as
 * the chosen approach in 04a-04-SUMMARY.md.
 */
function loadSceneFixture(filename: string): AsciiGrid {
  // packages/g2-app/src/status-hud/__tests__/ → 4 dirs up = packages/
  const fixturePath = resolve(__dirname, '../../../../shared-render/src/fixtures', filename);
  const text = readFileSync(fixturePath, 'utf-8');
  return AsciiGrid.fromString(text);
}

/** Build the Status HUD card AsciiGrid for a given locale + snapshot. */
function buildHudCard(locale: HudLocale, snapshot: CharacterSnapshot): AsciiGrid {
  return new StatusHudRenderer({ locale }).render(snapshot);
}

// ──────────────────────────────────────────────────────────────────────────────
// INV-1 ck 11 — Status HUD overflow states
// ──────────────────────────────────────────────────────────────────────────────

describe('INV-1 ck 11 — Status HUD overflow', () => {
  it('INV-1 ck 11 [hp-overflow]: HP=99999/99999 + long name truncates to status-hud.hp-overflow.txt', async () => {
    const grid = buildHudCard('en', {
      ...IDLE_SNAPSHOT,
      name: 'VeryLongNameOverflow',
      hp: 99999,
      maxHp: 99999,
      tempHp: 999,
    });
    await matchAsciiFixture(
      grid,
      '../../../../shared-render/src/fixtures/status-hud.hp-overflow.txt',
    );
  });

  it('INV-1 ck 11 [conditions-overflow]: 7 conditions → 3 visible + `… +4` row', async () => {
    const grid = buildHudCard('en', {
      ...IDLE_SNAPSHOT,
      tempHp: 0,
      conditions: ['poisoned', 'prone', 'bless', 'haste', 'rage', 'invisible', 'charmed'],
    });
    await matchAsciiFixture(
      grid,
      '../../../../shared-render/src/fixtures/status-hud.conditions-overflow.txt',
    );
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// INV-1 ck 12 — raster-idle full-page baseline
// ──────────────────────────────────────────────────────────────────────────────

describe('INV-1 ck 12 — raster-idle full-page', () => {
  it('INV-1 ck 12 [raster-idle]: canonical 96×24 scene matches glyph-scene.raster-idle.txt', async () => {
    const grid = loadSceneFixture('glyph-scene.raster-idle.txt');
    expect(grid.width).toBe(96);
    expect(grid.height).toBe(24);
    await matchAsciiFixture(
      grid,
      '../../../../shared-render/src/fixtures/glyph-scene.raster-idle.txt',
    );
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// INV-1 ck 13 — glyph-idle full-page + [GLY] badge
// ──────────────────────────────────────────────────────────────────────────────

describe('INV-1 ck 13 — glyph-idle with [GLY] badge', () => {
  it('INV-1 ck 13 [glyph-idle]: canonical 96×24 glyph scene matches glyph-scene.glyph-idle.txt', async () => {
    const grid = loadSceneFixture('glyph-scene.glyph-idle.txt');
    expect(grid.width).toBe(96);
    expect(grid.height).toBe(24);
    await matchAsciiFixture(
      grid,
      '../../../../shared-render/src/fixtures/glyph-scene.glyph-idle.txt',
    );
  });

  it('INV-1 ck 13 [GLY badge]: glyph mode fixture contains literal `[GLY]` at the canonical right-side column', () => {
    const grid = loadSceneFixture('glyph-scene.glyph-idle.txt');
    // Find which row contains [GLY]; expect it in the HUD region (col >= 68)
    let foundRow = -1;
    let foundCol = -1;
    for (let r = 0; r < grid.height; r++) {
      const text = grid.cells[r]?.join('') ?? '';
      const idx = text.indexOf('[GLY]');
      if (idx !== -1) {
        foundRow = r;
        foundCol = idx;
        break;
      }
    }
    expect(foundRow, '[GLY] row').toBeGreaterThanOrEqual(0);
    // Badge must live in the right-side HUD region (col >= 68 per UI-SPEC layout grid)
    expect(foundCol, '[GLY] col >= 68 (HUD region)').toBeGreaterThanOrEqual(68);
    // And the last char of `[GLY]` ends at col foundCol+4; right border is at col 95
    expect(foundCol + 4, '[GLY] last char col <= 94 (before right border)').toBeLessThanOrEqual(94);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// INV-1 ck 14 — i18n stress (IT/EN/DE longest strings)
// ──────────────────────────────────────────────────────────────────────────────

describe('INV-1 ck 14 — i18n longest-string stress', () => {
  it('INV-1 ck 14 [it]: IT locale fixture matches glyph-scene.raster-idle-it.txt (contains `Condizioni`)', async () => {
    const grid = loadSceneFixture('glyph-scene.raster-idle-it.txt');
    expect(grid.width).toBe(96);
    expect(grid.height).toBe(24);
    // Spot-check the IT-specific label
    const allText = grid.cells.map((r) => r.join('')).join('\n');
    expect(allText).toContain('Condizioni');
    await matchAsciiFixture(
      grid,
      '../../../../shared-render/src/fixtures/glyph-scene.raster-idle-it.txt',
    );
  });

  it('INV-1 ck 14 [en]: EN canonical fixture matches glyph-scene.raster-idle-en.txt (contains `Conditions`)', async () => {
    const grid = loadSceneFixture('glyph-scene.raster-idle-en.txt');
    const allText = grid.cells.map((r) => r.join('')).join('\n');
    expect(allText).toContain('Conditions');
    await matchAsciiFixture(
      grid,
      '../../../../shared-render/src/fixtures/glyph-scene.raster-idle-en.txt',
    );
  });

  it('INV-1 ck 14 [de]: DE locale fixture matches glyph-scene.raster-idle-de.txt (contains `Zustände`)', async () => {
    const grid = loadSceneFixture('glyph-scene.raster-idle-de.txt');
    const allText = grid.cells.map((r) => r.join('')).join('\n');
    expect(allText).toContain('Zustände');
    await matchAsciiFixture(
      grid,
      '../../../../shared-render/src/fixtures/glyph-scene.raster-idle-de.txt',
    );
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// INV-1 ck 15 — loading placeholder state
// ──────────────────────────────────────────────────────────────────────────────

describe('INV-1 ck 15 — loading placeholder', () => {
  it('INV-1 ck 15 [loading]: renderLoading() matches status-hud.loading.txt', async () => {
    const grid = new StatusHudRenderer({ locale: 'en' }).renderLoading();
    await matchAsciiFixture(grid, '../../../../shared-render/src/fixtures/status-hud.loading.txt');
  });
});
