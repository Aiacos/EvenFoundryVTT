import { describe, expect, it, vi } from 'vitest';
import { ALL_ICON_IDS, drawIcon, IconId, iconToUnicode } from './icon-dictionary.js';

describe('iconToUnicode', () => {
  it('resolves every IconId to a non-undefined glyph', () => {
    for (const id of ALL_ICON_IDS) {
      expect(typeof iconToUnicode(id)).toBe('string');
    }
    // Completeness: the public enum and the lookup agree.
    expect(ALL_ICON_IDS).toEqual(Object.values(IconId));
  });

  it('matches the legacy inventory item-type glyphs', () => {
    expect(iconToUnicode(IconId.Weapon)).toBe('⚔');
    expect(iconToUnicode(IconId.Armor)).toBe('⛨');
    expect(iconToUnicode(IconId.Consumable)).toBe('▶');
    expect(iconToUnicode(IconId.Currency)).toBe(' ');
  });

  it('matches the legacy skill/save proficiency glyphs (○ ◉ ★)', () => {
    expect(iconToUnicode(IconId.ProfNone)).toBe('○');
    expect(iconToUnicode(IconId.ProfProficient)).toBe('◉');
    expect(iconToUnicode(IconId.ProfExpertise)).toBe('★');
  });

  it('matches the legacy spellbook slot + marker glyphs', () => {
    expect(iconToUnicode(IconId.SlotFilled)).toBe('▓');
    expect(iconToUnicode(IconId.SlotEmpty)).toBe('░');
    expect(iconToUnicode(IconId.SpellPrepared)).toBe('▶');
    expect(iconToUnicode(IconId.SpellAlwaysPrepared)).toBe('≡');
  });

  it('matches the legacy vitals glyphs', () => {
    expect(iconToUnicode(IconId.ArmorClass)).toBe('⛨');
    expect(iconToUnicode(IconId.Initiative)).toBe('⚡');
    expect(iconToUnicode(IconId.Speed)).toBe('⚔');
  });
});

describe('drawIcon (stub)', () => {
  function fakeCtx() {
    return {
      save: vi.fn(),
      restore: vi.fn(),
      fillText: vi.fn(),
      fillStyle: '',
      font: '',
      textAlign: '' as CanvasTextAlign,
      textBaseline: '' as CanvasTextBaseline,
    };
  }

  it('fills the glyph centered in bounds with the given color', () => {
    const ctx = fakeCtx();
    drawIcon(
      ctx as unknown as CanvasRenderingContext2D,
      IconId.Weapon,
      {
        x: 10,
        y: 20,
        w: 16,
        h: 16,
      },
      '#0f0',
    );
    expect(ctx.fillText).toHaveBeenCalledWith('⚔', 18, 28);
    expect(ctx.save).toHaveBeenCalledOnce();
    expect(ctx.restore).toHaveBeenCalledOnce();
  });

  it('draws nothing for a blank icon (Currency)', () => {
    const ctx = fakeCtx();
    drawIcon(
      ctx as unknown as CanvasRenderingContext2D,
      IconId.Currency,
      {
        x: 0,
        y: 0,
        w: 16,
        h: 16,
      },
      '#0f0',
    );
    expect(ctx.fillText).not.toHaveBeenCalled();
  });
});
