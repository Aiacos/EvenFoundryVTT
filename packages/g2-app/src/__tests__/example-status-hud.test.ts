/**
 * THROWAWAY example test — proves shared-render snapshot framework wires through end-to-end.
 * Phase 4a replaces this with real Status HUD render tests.
 *
 * @see CONTEXT.md D-1.16 — wire-up demonstration
 * @see RESEARCH.md §Code Examples / Snapshot framework
 */

import { AsciiGrid, matchAsciiFixture } from '@evf/shared-render';
import { describe, it } from 'vitest';

describe('Status HUD snapshot wire-up (D-1.16 example)', () => {
  it('matches baseline fixture', async () => {
    // Phase 1 placeholder: hand-construct the grid that matches the fixture.
    // Phase 4a will compute the grid from real Status HUD render output.
    const grid = AsciiGrid.fromString(
      [
        '┌──────────────┐',
        '│ HP   42/42   │',
        '│ AC   16      │',
        '│ Action  ●    │',
        '│ Bonus   ●    │',
        '│ React   ○    │',
        '└──────────────┘',
      ].join('\n'),
    );
    await matchAsciiFixture(
      grid,
      // Path relative to THIS test file, pointing at the fixture.
      // packages/g2-app/src/__tests__/ → ../../../ = packages/ → shared-render/src/fixtures/
      '../../../shared-render/src/fixtures/status-hud-baseline.txt',
    );
  });
});
