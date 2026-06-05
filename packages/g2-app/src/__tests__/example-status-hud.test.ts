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
// matchAsciiFixture replaced by toMatchFileSnapshot for HUD-27PX string output (SE-1)
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

describe('Phase 4a Status HUD INV-1 fixture round-trip (Plan 05 example-status-hud)', () => {
  it('SE-1 (ck 15): renderLoading matches status-hud.loading.txt fixture', async () => {
    const renderer = new StatusHudRenderer({ locale: 'en' });
    // HUD-27PX: renderer returns a string (not AsciiGrid); use toMatchFileSnapshot directly
    const output = renderer.renderLoading();
    // 3 dirs up from packages/g2-app/src/__tests__/ → packages/ → shared-render/src/fixtures/
    await expect(`${output}\n`).toMatchFileSnapshot(
      '../../../shared-render/src/fixtures/status-hud.loading.txt',
    );
  });

  it('SE-2 (ck 14): IT-locale render emits Italian width-budget labels', () => {
    const renderer = new StatusHudRenderer({ locale: 'it' });
    // HUD-27PX: renderer returns a string directly (no .toString() needed)
    const rendered = renderer.render(IDLE_SNAPSHOT);
    // IT-locale labels per HUD_WIDTH_BUDGETS (UI-SPEC §i18n Width Budget):
    //   hp_label='PF', ac_label='CA', speed_label='VEL',
    //   conditions_section='Condizioni' (via hud27_cond_prefix: 'Cond:')
    // Note: move_label='Mov' is preserved in i18n but not rendered in the
    //   status-sheet default view (it's an overlay-only widget — HUD-27PX)
    expect(rendered).toContain('PF');
    expect(rendered).toContain('CA');
    expect(rendered).toContain('VEL');
    expect(rendered).toContain('Cond:'); // hud27_cond_prefix
  });

  it('SE-3 (ck 14): DE-locale render emits German width-budget labels', () => {
    const renderer = new StatusHudRenderer({ locale: 'de' });
    // HUD-27PX: renderer returns a string directly
    const rendered = renderer.render(IDLE_SNAPSHOT);
    // DE-locale labels: hp_label='TP', ac_label='RK', speed_label='GES',
    //   hud27_cond_prefix='Zust:' (conditions row prefix)
    // Note: move_label='Bew', conditions_section='Zustände' are overlay/i18n-budget
    //   keys not rendered in the status-sheet default view
    expect(rendered).toContain('TP');
    expect(rendered).toContain('RK');
    expect(rendered).toContain('GES');
    expect(rendered).toContain('Zust:'); // hud27_cond_prefix for DE
  });
});
