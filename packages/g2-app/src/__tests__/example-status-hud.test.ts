/**
 * Phase 4a Status HUD INV-1 fixture round-trip tests.
 *
 * Replaces the Phase 1 throwaway placeholder. Consumes the real
 * `StatusHudRenderer` from `packages/g2-app/src/status-hud/` and the canonical
 * Plan 04 fixtures in `packages/shared-render/src/fixtures/`. Path offset is
 * 3 dirs up from `src/__tests__/` to `packages/`.
 *
 * Coverage map (INV-1 ck 14 + ck 15 spot-coverage at the package-level
 * smoke layer — full per-ck snapshot tests live in Plan 04's
 * `packages/g2-app/src/status-hud/__tests__/snapshot.test.ts`):
 *
 *   - SE-1 (ck 15)   — `renderLoading()` matches `status-hud.loading.txt`
 *   - SE-2 (ck 14 IT) — IT-locale render emits Italian width-budget labels
 *     (`PF`, `CA`, `VEL`, `Mov`, `Condizioni`) — assertion via `grid.toString()`
 *     substring check (full-page composition is Plan 05 LayerManager bundle).
 *   - SE-3 (ck 14 DE) — DE-locale render emits German width-budget labels
 *     (`TP`, `RK`, `GES`, `Bew`, `Zustände`).
 *
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04a-04-SUMMARY.md (fixtures + i18n)
 * @see packages/shared-render/src/fixtures/
 */
import type { CharacterSnapshot } from '@evf/shared-protocol';
import { matchAsciiFixture } from '@evf/shared-render';
import { describe, expect, it } from 'vitest';
import { StatusHudRenderer } from '../status-hud/status-hud-renderer.js';

/**
 * Canonical idle CharacterSnapshot fixture for the Phase 4a HUD card tests.
 *
 * Conforms to `CharacterSnapshotSchema` (actorId / name / hp / maxHp / tempHp /
 * ac / level / conditions / exhaustion). Mid-tier values exercise both the
 * HP bar fill rendering and the no-overflow path.
 */
const IDLE_SNAPSHOT: CharacterSnapshot = {
  actorId: 'pc-aiacos',
  name: 'Aiacos',
  ac: 16,
  hp: 36,
  maxHp: 36,
  tempHp: 0,
  level: 5,
  conditions: [],
  exhaustion: 0,
  death: { success: 0, failure: 0 },
  world: { modernRules: false },
  inventory: [],
  spells: { slots: [], spells: [] },
};

describe('Phase 4a Status HUD INV-1 fixture round-trip (Plan 05 example-status-hud)', () => {
  it('SE-1 (ck 15): renderLoading matches status-hud.loading.txt fixture', async () => {
    const renderer = new StatusHudRenderer({ locale: 'en' });
    const grid = renderer.renderLoading();
    // 3 dirs up from packages/g2-app/src/__tests__/ → packages/ → shared-render/src/fixtures/
    await matchAsciiFixture(grid, '../../../shared-render/src/fixtures/status-hud.loading.txt');
  });

  it('SE-2 (ck 14): IT-locale render emits Italian width-budget labels', () => {
    const renderer = new StatusHudRenderer({ locale: 'it' });
    const grid = renderer.render(IDLE_SNAPSHOT);
    const rendered = grid.toString();
    // IT-locale labels per HUD_WIDTH_BUDGETS (UI-SPEC §i18n Width Budget):
    //   hp_label='PF', ac_label='CA', speed_label='VEL', move_label='Mov',
    //   conditions_section='Condizioni'
    expect(rendered).toContain('PF');
    expect(rendered).toContain('CA');
    expect(rendered).toContain('VEL');
    expect(rendered).toContain('Mov');
    expect(rendered).toContain('Condizioni');
  });

  it('SE-3 (ck 14): DE-locale render emits German width-budget labels', () => {
    const renderer = new StatusHudRenderer({ locale: 'de' });
    const grid = renderer.render(IDLE_SNAPSHOT);
    const rendered = grid.toString();
    // DE-locale labels: hp_label='TP', ac_label='RK', speed_label='GES',
    //   move_label='Bew', conditions_section='Zustände'
    expect(rendered).toContain('TP');
    expect(rendered).toContain('RK');
    expect(rendered).toContain('GES');
    expect(rendered).toContain('Bew');
    expect(rendered).toContain('Zustände');
  });
});
