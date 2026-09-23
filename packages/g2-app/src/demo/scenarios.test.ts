import { describe, expect, it } from 'vitest';
import { screenOf } from '../hud/screen.js';
import { buildScenario, isScenarioName, playlist, SCENARIO_NAMES, TOUR } from './scenarios.js';

const NOW = 1_700_000_000_000;

describe('demo scenarios', () => {
  it('cover every design screen S1–S12 exactly once', () => {
    const mocks = SCENARIO_NAMES.map((n) => buildScenario(n, NOW).mock);
    expect(mocks).toEqual(Array.from({ length: 12 }, (_, i) => `S${i + 1}`));
  });

  it('start calm (no combat/reaction/result) and move them into the patch', () => {
    for (const name of SCENARIO_NAMES) {
      const s = buildScenario(name, NOW);
      expect(s.initial.combat).toBeNull();
      expect(s.initial.reaction).toBeNull();
      expect(s.initial.lastResult).toBeNull();
      expect(s.initial.rollRequest).toBeNull();
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

  it('reach S12 through a live → offline transition (frozen map, not blank)', () => {
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

  it('deliver the GM roll request (S8) and the 0 PF state (S9) as the HUD sees them in play', () => {
    expect(buildScenario('saves', NOW).patch.rollRequest).toMatchObject({ kind: 'save' });
    expect(buildScenario('dying', NOW).initial.character?.hp).toBe(0);
    expect(buildScenario('spells', NOW).gestures).toEqual(['tap', 'down', 'down', 'tap', 'down']);
  });

  it('resolve playlists', () => {
    expect(playlist(TOUR)).toEqual({ names: SCENARIO_NAMES, valid: true });
    expect(playlist('actions')).toEqual({ names: ['actions'], valid: true });
    expect(playlist('nope')).toEqual({ names: SCENARIO_NAMES, valid: false });
    expect(isScenarioName('offline')).toBe(true);
    expect(isScenarioName('tour')).toBe(false);
  });
});
