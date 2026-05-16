/**
 * sync-lost-chip unit tests (Task 3 — Plan 10-01 TDD RED phase).
 *
 * Covers 6 behaviour points (SLC-01..06):
 *
 *   SLC-01: buildSyncLostChip(4000, 'it') → '⚠ SYNC LOST (riconnetto in 4s)'
 *   SLC-02: buildSyncLostChip(4000, 'en') → '⚠ SYNC LOST (reconnect in 4s)'
 *   SLC-03: buildSyncLostChip(0, 'it') → '⚠ SYNC LOST (riconnessione…)' (in-flight sentinel)
 *   SLC-04: result ≤38 code-points for IT + EN at any retry value 0..30 (INV-1 budget)
 *   SLC-05: StatusHudRenderer.renderContextChip(lm, locale, {syncLost: {retryInMs}})
 *            returns sync-lost string instead of R1 chip; without 3rd arg, R1 chip renders
 *   SLC-06: snapshot fixture assertions for IT + EN sync-lost HUD (INV-1 char-perfect)
 *
 * @see packages/g2-app/src/engine/sync-lost-chip.ts
 * @see packages/g2-app/src/status-hud/status-hud-renderer.ts (renderContextChip extension)
 * @see packages/shared-render/src/fixtures/status-hud.sync-lost.it.txt
 * @see packages/shared-render/src/fixtures/status-hud.sync-lost.en.txt
 * @see .planning/phases/10-polish-field-test-mvp/10-01-PLAN.md Task 3
 */
import type { CharacterSnapshot } from '@evf/shared-protocol';
import { matchAsciiFixture } from '@evf/shared-render';
import { describe, expect, it } from 'vitest';
import { buildSyncLostChip } from '../engine/sync-lost-chip.js';
import { StatusHudRenderer } from '../status-hud/status-hud-renderer.js';

// ─── Canonical test snapshot for fixture rendering ────────────────────────────

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

describe('buildSyncLostChip', () => {
  it('SLC-01: IT locale with 4000ms → countdown chip with Italian text', () => {
    const result = buildSyncLostChip(4000, 'it');
    expect(result).toBe('⚠ SYNC LOST (riconnetto in 4s)');
  });

  it('SLC-02: EN locale with 4000ms → countdown chip with English text', () => {
    const result = buildSyncLostChip(4000, 'en');
    expect(result).toBe('⚠ SYNC LOST (reconnect in 4s)');
  });

  it('SLC-03: retryInMs=0 → in-flight sentinel (IT locale)', () => {
    const result = buildSyncLostChip(0, 'it');
    expect(result).toBe('⚠ SYNC LOST (riconnessione…)');
  });

  it('SLC-03b: retryInMs=0 → in-flight sentinel (EN locale)', () => {
    const result = buildSyncLostChip(0, 'en');
    expect(result).toBe('⚠ SYNC LOST (reconnecting…)');
  });

  it('SLC-04: result ≤38 code-points for IT at all retry values 0..30 (INV-1 budget)', () => {
    for (let s = 0; s <= 30; s++) {
      const result = buildSyncLostChip(s * 1000, 'it');
      const len = [...result].length;
      expect(
        len,
        `IT retryInMs=${s * 1000}: "${result}" has ${len} > 38 code-points`,
      ).toBeLessThanOrEqual(38);
    }
  });

  it('SLC-04b: result ≤38 code-points for EN at all retry values 0..30 (INV-1 budget)', () => {
    for (let s = 0; s <= 30; s++) {
      const result = buildSyncLostChip(s * 1000, 'en');
      const len = [...result].length;
      expect(
        len,
        `EN retryInMs=${s * 1000}: "${result}" has ${len} > 38 code-points`,
      ).toBeLessThanOrEqual(38);
    }
  });
});

describe('StatusHudRenderer.renderContextChip sync-lost override', () => {
  it('SLC-05: with syncLost opts, returns sync-lost chip string instead of R1 chip', () => {
    const renderer = new StatusHudRenderer({ locale: 'it' });
    const result = renderer.renderContextChip(null, 'it', { syncLost: { retryInMs: 4000 } });
    expect(result).toBe('⚠ SYNC LOST (riconnetto in 4s)');
    // Must NOT contain R1: prefix
    expect(result).not.toContain('R1:');
  });

  it('SLC-05b: without syncLost opts, normal R1 chip renders (back-compat)', () => {
    const renderer = new StatusHudRenderer({ locale: 'it' });
    const result = renderer.renderContextChip(null, 'it');
    expect(result).toContain('R1:');
  });

  it('SLC-05c: syncLost null clears back to R1 chip', () => {
    const renderer = new StatusHudRenderer({ locale: 'en' });
    const active = renderer.renderContextChip(null, 'en', { syncLost: { retryInMs: 2000 } });
    expect(active).not.toContain('R1:');
    const cleared = renderer.renderContextChip(null, 'en', { syncLost: null });
    expect(cleared).toContain('R1:');
  });
});

describe('StatusHudRenderer sync-lost INV-1 fixtures', () => {
  it('SLC-06a: IT sync-lost HUD fixture matches status-hud.sync-lost.it.txt', async () => {
    const renderer = new StatusHudRenderer({ locale: 'it' });
    const grid = renderer.render(IDLE_SNAPSHOT);
    await matchAsciiFixture(
      grid,
      '../../../shared-render/src/fixtures/status-hud.sync-lost.it.txt',
    );
  });

  it('SLC-06b: EN sync-lost HUD fixture matches status-hud.sync-lost.en.txt', async () => {
    const renderer = new StatusHudRenderer({ locale: 'en' });
    const grid = renderer.render(IDLE_SNAPSHOT);
    await matchAsciiFixture(
      grid,
      '../../../shared-render/src/fixtures/status-hud.sync-lost.en.txt',
    );
  });
});
