import { describe, expect, it } from 'vitest';
import { menuIdOf } from '../hud/input/state-machine.js';
import { screenOf } from '../hud/screen.js';
import { buildScenario, isScenarioName, playlist, SCENARIO_NAMES, TOUR } from './scenarios.js';

const NOW = 1_700_000_000_000;

describe('demo scenarios', () => {
  it('cover every design state M01–M11 exactly once', () => {
    const mocks = SCENARIO_NAMES.map((n) => buildScenario(n, NOW).mock);
    expect(mocks).toEqual(
      Array.from({ length: 11 }, (_, i) => `M${String(i + 1).padStart(2, '0')}`),
    );
  });

  it('start calm (no combat/reaction/result) and move them into the patch', () => {
    for (const name of SCENARIO_NAMES) {
      const s = buildScenario(name, NOW);
      expect(s.initial.combat).toBeNull();
      expect(s.initial.reaction).toBeNull();
      expect(s.initial.lastResult).toBeNull();
    }
    expect(buildScenario('combat-my-turn', NOW).patch.combat?.currentCombatantId).toBe('k1');
    expect(buildScenario('explore', NOW).patch).toEqual({});
  });

  it('rebase fixture timestamps on now', () => {
    const reaction = buildScenario('reaction', NOW).patch.reaction;
    expect(reaction?.expiresAt).toBeGreaterThan(NOW);
    expect(buildScenario('explore', NOW).initial.connection.lastSyncAt).toBe(NOW - 120_000);
    expect(buildScenario('connecting', NOW).initial.connection.lastSyncAt).toBeUndefined();
  });

  it('reach M11 through a live → offline transition (frozen map, not blank)', () => {
    const s = buildScenario('offline', NOW);
    expect(screenOf(s.initial)).toBe('hud');
    expect(s.after?.connection?.status).toBe('offline');
    expect(s.after?.connection?.lastSyncAt).toBe(NOW - 120_000);
    expect(buildScenario('explore', NOW).after).toBeNull();
  });

  it('map each status scenario to its screen', () => {
    expect(screenOf(buildScenario('unpaired', NOW).initial)).toBe('unpaired');
    expect(screenOf(buildScenario('connecting', NOW).initial)).toBe('connecting');
    expect(screenOf(buildScenario('explore', NOW).initial)).toBe('hud');
  });

  it('script sheet pages through the contextual menu', () => {
    const next = { menu: menuIdOf('nextPage') };
    expect(buildScenario('skills', NOW).gestures).toEqual([next, next]);
    expect(buildScenario('spells', NOW).initial.character?.spells.spells.length).toBeGreaterThan(0);
  });

  it('resolve playlists', () => {
    expect(playlist(TOUR)).toEqual({ names: SCENARIO_NAMES, valid: true });
    expect(playlist('actions')).toEqual({ names: ['actions'], valid: true });
    expect(playlist('nope')).toEqual({ names: SCENARIO_NAMES, valid: false });
    expect(isScenarioName('offline')).toBe(true);
    expect(isScenarioName('tour')).toBe(false);
  });
});
