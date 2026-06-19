/**
 * Unit tests for SettingsDisplaySchema + ClientSettingMessageSchema
 * (bidirectional settings-sync payload, Quick Task R81 T14).
 *
 * Covers:
 *   - Type constants (SETTINGS_DISPLAY_TYPE / CLIENT_SETTING_TYPE literals)
 *   - Numeric bound edges: brightness -100..100, webpQuality 0..100, captureFps 1..60
 *     (accept at edges, reject just-outside, reject non-integer)
 *   - All-optional `.partial()`: empty `{}` and single-field objects accept
 *   - Full-snapshot round-trip (parse → infer → re-parse)
 *   - ClientSettingMessageSchema strict-rejection of an unknown extra field
 *   - SettingsDisplayEditSchema non-empty refinement (empty `{}` rejected on the
 *     upstream write channel; the downstream snapshot schema stays permissive)
 */
import { describe, expect, it } from 'vitest';

import {
  CLIENT_SETTING_TYPE,
  ClientSettingMessageSchema,
  SETTINGS_DISPLAY_TYPE,
  type SettingsDisplay,
  SettingsDisplayEditSchema,
  SettingsDisplaySchema,
} from './settings-display.js';

// ─── Type constants ────────────────────────────────────────────────────────────

describe('settings-display type constants', () => {
  it('SETTINGS_DISPLAY_TYPE equals "settings.display"', () => {
    expect(SETTINGS_DISPLAY_TYPE).toBe('settings.display');
  });

  it('CLIENT_SETTING_TYPE equals "client_setting"', () => {
    expect(CLIENT_SETTING_TYPE).toBe('client_setting');
  });
});

// ─── SettingsDisplaySchema — partial / optional ────────────────────────────────

describe('SettingsDisplaySchema — partial (all-optional)', () => {
  it('accepts an empty object {}', () => {
    expect(SettingsDisplaySchema.safeParse({}).success).toBe(true);
  });

  it('accepts a single-key object (dither only)', () => {
    expect(SettingsDisplaySchema.safeParse({ dither: true }).success).toBe(true);
  });

  it('accepts a single-key object (normalize only)', () => {
    expect(SettingsDisplaySchema.safeParse({ normalize: false }).success).toBe(true);
  });

  it('accepts a single-key object (brightness only)', () => {
    expect(SettingsDisplaySchema.safeParse({ brightness: 0 }).success).toBe(true);
  });
});

// ─── SettingsDisplaySchema — brightness bounds (-100..100) ─────────────────────

describe('SettingsDisplaySchema — brightness bounds', () => {
  it('accepts brightness=-100 (min edge)', () => {
    expect(SettingsDisplaySchema.safeParse({ brightness: -100 }).success).toBe(true);
  });

  it('accepts brightness=100 (max edge)', () => {
    expect(SettingsDisplaySchema.safeParse({ brightness: 100 }).success).toBe(true);
  });

  it('rejects brightness=-101 (below min)', () => {
    expect(SettingsDisplaySchema.safeParse({ brightness: -101 }).success).toBe(false);
  });

  it('rejects brightness=101 (above max)', () => {
    expect(SettingsDisplaySchema.safeParse({ brightness: 101 }).success).toBe(false);
  });

  it('rejects non-integer brightness (float)', () => {
    expect(SettingsDisplaySchema.safeParse({ brightness: 12.5 }).success).toBe(false);
  });
});

// ─── SettingsDisplaySchema — webpQuality bounds (0..100) ───────────────────────

describe('SettingsDisplaySchema — webpQuality bounds', () => {
  it('accepts webpQuality=0 (min edge, lossless PNG)', () => {
    expect(SettingsDisplaySchema.safeParse({ webpQuality: 0 }).success).toBe(true);
  });

  it('accepts webpQuality=100 (max edge)', () => {
    expect(SettingsDisplaySchema.safeParse({ webpQuality: 100 }).success).toBe(true);
  });

  it('rejects webpQuality=-1 (below min)', () => {
    expect(SettingsDisplaySchema.safeParse({ webpQuality: -1 }).success).toBe(false);
  });

  it('rejects webpQuality=101 (above max)', () => {
    expect(SettingsDisplaySchema.safeParse({ webpQuality: 101 }).success).toBe(false);
  });

  it('rejects non-integer webpQuality (float)', () => {
    expect(SettingsDisplaySchema.safeParse({ webpQuality: 50.5 }).success).toBe(false);
  });
});

// ─── SettingsDisplaySchema — captureFps bounds (1..60) ─────────────────────────

describe('SettingsDisplaySchema — captureFps bounds', () => {
  it('accepts captureFps=1 (min edge)', () => {
    expect(SettingsDisplaySchema.safeParse({ captureFps: 1 }).success).toBe(true);
  });

  it('accepts captureFps=60 (max edge)', () => {
    expect(SettingsDisplaySchema.safeParse({ captureFps: 60 }).success).toBe(true);
  });

  it('rejects captureFps=0 (below min)', () => {
    expect(SettingsDisplaySchema.safeParse({ captureFps: 0 }).success).toBe(false);
  });

  it('rejects captureFps=61 (above max)', () => {
    expect(SettingsDisplaySchema.safeParse({ captureFps: 61 }).success).toBe(false);
  });

  it('rejects non-integer captureFps (float)', () => {
    expect(SettingsDisplaySchema.safeParse({ captureFps: 30.5 }).success).toBe(false);
  });
});

// ─── SettingsDisplaySchema — full-snapshot round-trip ──────────────────────────

describe('SettingsDisplaySchema — round-trip', () => {
  it('round-trips a full valid snapshot (parse → infer → re-parse)', () => {
    const full: SettingsDisplay = {
      dither: true,
      brightness: -25,
      webpQuality: 80,
      captureFps: 30,
      normalize: false,
    };
    const first = SettingsDisplaySchema.safeParse(full);
    expect(first.success).toBe(true);
    if (!first.success) return;
    expect(first.data).toEqual(full);
    // Re-parse the inferred output to confirm stability.
    const second = SettingsDisplaySchema.safeParse(first.data);
    expect(second.success).toBe(true);
    if (second.success) expect(second.data).toEqual(full);
  });

  it('round-trips a single-key partial', () => {
    const partial: SettingsDisplay = { captureFps: 15 };
    const result = SettingsDisplaySchema.safeParse(partial);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual({ captureFps: 15 });
  });
});

// ─── ClientSettingMessageSchema — strict ───────────────────────────────────────

describe('ClientSettingMessageSchema', () => {
  it('accepts a well-formed client_setting message', () => {
    const result = ClientSettingMessageSchema.safeParse({
      type: CLIENT_SETTING_TYPE,
      settings: { dither: false },
    });
    expect(result.success).toBe(true);
  });

  it('rejects a client_setting message with an empty settings edit ({})', () => {
    // The upstream write channel must NOT accept a no-op edit: an empty {} would
    // still drive the client_setting → pending-box → frame-POST → settings.set
    // round-trip on the live Foundry world. The non-empty refinement guards it.
    const result = ClientSettingMessageSchema.safeParse({
      type: CLIENT_SETTING_TYPE,
      settings: {},
    });
    expect(result.success).toBe(false);
  });

  it('accepts a client_setting message with a single-field settings edit', () => {
    const result = ClientSettingMessageSchema.safeParse({
      type: CLIENT_SETTING_TYPE,
      settings: { brightness: 40 },
    });
    expect(result.success).toBe(true);
  });

  it('rejects a wrong type literal', () => {
    const result = ClientSettingMessageSchema.safeParse({
      type: 'not_client_setting',
      settings: { dither: true },
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown extra top-level field (strictObject)', () => {
    const result = ClientSettingMessageSchema.safeParse({
      type: CLIENT_SETTING_TYPE,
      settings: { dither: true },
      extra: 'leaked',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a missing settings field', () => {
    const result = ClientSettingMessageSchema.safeParse({
      type: CLIENT_SETTING_TYPE,
    });
    expect(result.success).toBe(false);
  });
});

// ─── SettingsDisplayEditSchema — non-empty upstream partial ─────────────────────

describe('SettingsDisplayEditSchema — non-empty upstream edit', () => {
  it('rejects an empty object {} (no-op edit on a write-capable channel)', () => {
    expect(SettingsDisplayEditSchema.safeParse({}).success).toBe(false);
  });

  it('accepts a single-field edit (dither only)', () => {
    expect(SettingsDisplayEditSchema.safeParse({ dither: true }).success).toBe(true);
  });

  it('accepts a multi-field edit', () => {
    expect(SettingsDisplayEditSchema.safeParse({ brightness: 20, captureFps: 30 }).success).toBe(
      true,
    );
  });

  it('still enforces field bounds (rejects out-of-range brightness)', () => {
    expect(SettingsDisplayEditSchema.safeParse({ brightness: 200 }).success).toBe(false);
  });

  it('accepts a full snapshot shape (all keys present)', () => {
    // A full snapshot has ≥1 key, so it satisfies the non-empty edit schema too.
    const full: SettingsDisplay = {
      dither: true,
      brightness: 0,
      webpQuality: 0,
      captureFps: 10,
      normalize: false,
    };
    expect(SettingsDisplayEditSchema.safeParse(full).success).toBe(true);
  });
});
