/**
 * Unit tests for glyph-renderer (Phase 4a Plan 03 Task 2).
 *
 * Covers (per 04A-03-PLAN.md `<behavior>` block):
 *   - GR-1: PC token + facing arrow placed at correct (x,y) and (x+1,y)
 *   - GR-2: two enemy monsters with id-derived lowercase glyphs placed at (x,y)..(x+1,y)
 *   - GR-3: NPC → `N`; Object → `o`
 *   - GR-4: terrain wall (▓) and floor (░) rendered correctly
 *   - GR-5: default grid width is 66 chars (col 0-65) per UI-SPEC §Glyph Mode
 *   - GR-6: renderGlyphScene calls bridge.textContainerUpgrade exactly once with 'map-capture'
 *
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04A-03-PLAN.md Task 2
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04A-UI-SPEC.md §Glyph Dictionary
 */
import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';
import { describe, expect, it, vi } from 'vitest';
import { buildGlyphGrid, renderGlyphScene } from '../glyph-renderer.js';

describe('glyph-renderer — buildGlyphGrid', () => {
  it('GR-1: PC token at (10, 5) facing east → `@` at (10, 5) and `▶` at (11, 5)', () => {
    const grid = buildGlyphGrid({
      tokens: [{ kind: 'pc', x: 10, y: 5, facing: 'east' }],
      width: 66,
      height: 21,
    });
    expect(grid.at(10, 5)).toBe('@');
    expect(grid.at(11, 5)).toBe('▶');
  });

  it('GR-2: two monsters with ids g1, g2 → `g`+`1` and `g`+`2`', () => {
    const grid = buildGlyphGrid({
      tokens: [
        { kind: 'monster', id: 'g1', x: 20, y: 8 },
        { kind: 'monster', id: 'g2', x: 30, y: 8 },
      ],
      width: 66,
      height: 21,
    });
    expect(grid.at(20, 8)).toBe('g');
    expect(grid.at(21, 8)).toBe('1');
    expect(grid.at(30, 8)).toBe('g');
    expect(grid.at(31, 8)).toBe('2');
  });

  it('GR-3: NPC kind → `N`; Object kind → `o`', () => {
    const grid = buildGlyphGrid({
      tokens: [
        { kind: 'npc', x: 4, y: 4 },
        { kind: 'object', x: 8, y: 12 },
      ],
      width: 66,
      height: 21,
    });
    expect(grid.at(4, 4)).toBe('N');
    expect(grid.at(8, 12)).toBe('o');
  });

  it('GR-4: terrain wall (▓) + floor (░) render at the declared coordinates', () => {
    const grid = buildGlyphGrid({
      tokens: [],
      terrain: [
        { kind: 'wall', x: 0, y: 0 },
        { kind: 'floor', x: 1, y: 0 },
      ],
      width: 66,
      height: 21,
    });
    expect(grid.at(0, 0)).toBe('▓');
    expect(grid.at(1, 0)).toBe('░');
  });

  it('GR-5: default scene width is 66 chars (col 0..65)', () => {
    const grid = buildGlyphGrid({
      tokens: [],
      width: 66,
      height: 21,
    });
    expect(grid.width).toBe(66);
    // Every row is space-padded to the declared width.
    const last = grid.at(65, 0);
    expect(last).toBe(' ');
  });
});

describe('glyph-renderer — renderGlyphScene', () => {
  it('GR-6: calls bridge.textContainerUpgrade exactly once with containerName "map-capture"', async () => {
    const upgrade = vi.fn().mockResolvedValue(true);
    const bridge = {
      textContainerUpgrade: upgrade,
    } as unknown as EvenAppBridge;
    await renderGlyphScene(bridge, {
      tokens: [{ kind: 'pc', x: 5, y: 5 }],
      width: 66,
      height: 21,
    });
    expect(upgrade).toHaveBeenCalledTimes(1);
    const arg = upgrade.mock.calls[0]?.[0];
    expect(arg?.containerName).toBe('map-capture');
    expect(typeof arg?.content).toBe('string');
  });
});
