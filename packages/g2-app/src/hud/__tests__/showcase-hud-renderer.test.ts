/**
 * Unit tests for the production showcase HUD renderer.
 *
 * Drives {@link drawShowcaseHud} with a recording 2D-context mock and asserts the
 * glanceable vitals render (name, `Lv{level} {class}`, HP, AC, speed), that the
 * speed affordance is the VECTOR BOOT (never the `⚔` glyph), that the footer uses
 * only the canonical gesture set (no `long=`), and that it never throws for a
 * populated OR `null` snapshot.
 */

import type { CharacterSnapshot } from '@evf/shared-protocol';
import { describe, expect, it, vi } from 'vitest';
import { drawShowcaseHud, type ShowcaseHudModel } from '../showcase-hud-renderer.js';

/** A recording 2D-context mock — captures every `fillText` string + counts paths. */
function recordingCtx() {
  const texts: string[] = [];
  const ctx = {
    fillText: vi.fn((s: string) => {
      texts.push(String(s));
    }),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    rect: vi.fn(),
    fill: vi.fn(),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    font: '',
    textAlign: '' as CanvasTextAlign,
    textBaseline: '' as CanvasTextBaseline,
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, texts, raw: ctx };
}

/** A complete, valid snapshot with optional overrides. */
function makeSnapshot(over: Partial<CharacterSnapshot> = {}): CharacterSnapshot {
  const ability = (value: number, mod: number) => ({
    value,
    mod,
    save: mod,
    proficient: false,
    dc: 8,
  });
  const skill = (a: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha') => ({
    total: 0,
    ability: a,
    proficient: 0 as const,
    passive: 10,
  });
  return {
    actorId: 'a1',
    name: 'Thorin',
    hp: 45,
    maxHp: 68,
    tempHp: 10,
    ac: 18,
    level: 5,
    class: 'Fighter',
    initiative: 2,
    speed: 30,
    conditions: ['concentrato', 'benedetto'],
    exhaustion: 0,
    death: { success: 0, failure: 0 },
    world: { modernRules: false },
    inventory: [],
    spells: {
      slots: [
        { level: 1, value: 3, max: 4 },
        { level: 2, value: 1, max: 3 },
        { level: 3, value: 0, max: 2 },
      ],
      spells: [],
    },
    abilities: {
      str: ability(16, 3),
      dex: ability(14, 2),
      con: ability(15, 2),
      int: ability(10, 0),
      wis: ability(12, 1),
      cha: ability(13, 1),
    },
    skills: {
      acr: skill('dex'),
      ani: skill('wis'),
      arc: skill('int'),
      ath: skill('str'),
      dec: skill('cha'),
      his: skill('int'),
      ins: skill('wis'),
      itm: skill('cha'),
      inv: skill('int'),
      med: skill('wis'),
      nat: skill('int'),
      prc: skill('wis'),
      prf: skill('cha'),
      per: skill('cha'),
      rel: skill('int'),
      slt: skill('dex'),
      ste: skill('dex'),
      sur: skill('wis'),
    },
    ...over,
  } as CharacterSnapshot;
}

/** Base model wrapping a snapshot (spy map painter). Override any header field via `over`. */
function makeModel(
  snapshot: CharacterSnapshot | null,
  paint = vi.fn(),
  over: Omit<Partial<ShowcaseHudModel>, 'paintMap'> = {},
): ShowcaseHudModel & { paintMap: ReturnType<typeof vi.fn> } {
  return {
    sceneName: 'Sala Banchetti',
    round: 3,
    turn: 2,
    turnMax: 5,
    battery: 92,
    snapshot,
    ...over,
    paintMap: paint,
  };
}

describe('drawShowcaseHud — populated snapshot', () => {
  it('renders name, Lv{level} {class}, HP cur/max, AC and speed values', () => {
    const { ctx, texts } = recordingCtx();
    drawShowcaseHud(ctx, makeModel(makeSnapshot()));
    const joined = texts.join('|');
    expect(joined).toContain('Thorin');
    expect(joined).toContain('Lv5 Fighter');
    expect(joined).toContain('45/68');
    expect(texts).toContain('18'); // AC
    expect(texts).toContain('30'); // speed
  });

  it('draws a vector BOOT for speed and never the ⚔ glyph', () => {
    const { ctx, texts, raw } = recordingCtx();
    drawShowcaseHud(ctx, makeModel(makeSnapshot()));
    // The boot is the only rect-path shape (3 rects: leg/foot/toe).
    expect(raw.rect).toHaveBeenCalledTimes(3);
    expect(raw.fill).toHaveBeenCalled();
    expect(texts.join('')).not.toContain('⚔');
  });

  it('invokes the map painter over the framed region', () => {
    const paint = vi.fn();
    const { ctx } = recordingCtx();
    drawShowcaseHud(ctx, makeModel(makeSnapshot(), paint));
    expect(paint).toHaveBeenCalledOnce();
    const [, x, y, w, h] = paint.mock.calls[0] as [unknown, number, number, number, number];
    expect({ x, y, w, h }).toEqual({ x: 8, y: 31, w: 222, h: 139 });
  });

  it('footer uses only canonical gestures (no long-press)', () => {
    const { ctx, texts } = recordingCtx();
    drawShowcaseHud(ctx, makeModel(makeSnapshot()));
    const joined = texts.join('|');
    expect(joined).not.toContain('long=');
    expect(joined).toContain('scroll=pan');
  });

  it('header renders battery percent, round and 1-indexed turn when battery is known', () => {
    const { ctx, texts } = recordingCtx();
    drawShowcaseHud(ctx, makeModel(makeSnapshot(), vi.fn(), { round: 3, turn: 2, turnMax: 5 }));
    const joined = texts.join('|');
    expect(joined).toContain('⌁92%');
    // turn is 0-indexed in the model → displayed as turn+1 (2 → 3).
    expect(joined).toContain('R3·T3/5');
  });

  it('header renders ⌁— when battery is null (unknown / device status not read yet)', () => {
    const { ctx, texts } = recordingCtx();
    drawShowcaseHud(ctx, makeModel(makeSnapshot(), vi.fn(), { battery: null }));
    const joined = texts.join('|');
    expect(joined).toContain('⌁—');
    expect(joined).not.toContain('⌁92%');
    expect(joined).not.toContain('null');
  });

  it('header displays the first turn as T1 (0-indexed turn 0 → turn+1)', () => {
    const { ctx, texts } = recordingCtx();
    drawShowcaseHud(ctx, makeModel(makeSnapshot(), vi.fn(), { round: 1, turn: 0, turnMax: 4 }));
    expect(texts.join('|')).toContain('R1·T1/4');
  });

  it('shows temp HP suffix when tempHp > 0', () => {
    const { ctx, texts } = recordingCtx();
    drawShowcaseHud(ctx, makeModel(makeSnapshot({ tempHp: 10 })));
    expect(texts.join('|')).toContain('45/68  +10');
  });

  it('omits class when the class string is empty', () => {
    const { ctx, texts } = recordingCtx();
    drawShowcaseHud(ctx, makeModel(makeSnapshot({ class: '' })));
    expect(texts).toContain('Lv5');
  });

  it('renders an all-empty HP bar without dividing by zero (maxHp 0)', () => {
    const { ctx, texts } = recordingCtx();
    expect(() => drawShowcaseHud(ctx, makeModel(makeSnapshot({ hp: 0, maxHp: 0 })))).not.toThrow();
    expect(texts.join('|')).toContain('░░░░░░░░░░░░');
  });

  it('falls back to — for slots when there are none, and skips conditions when empty', () => {
    const { ctx, texts } = recordingCtx();
    drawShowcaseHud(
      ctx,
      makeModel(makeSnapshot({ spells: { slots: [], spells: [] }, conditions: [] })),
    );
    const joined = texts.join('|');
    expect(joined).toContain('SLOTS');
    expect(joined).toContain('—'); // slot placeholder
    expect(joined).not.toContain('▶'); // no condition marker
  });

  it('wraps spell slots across two lines when more than two groups are available', () => {
    const { ctx, texts } = recordingCtx();
    drawShowcaseHud(
      ctx,
      makeModel(
        makeSnapshot({
          spells: {
            slots: [
              { level: 1, value: 2, max: 4 },
              { level: 2, value: 1, max: 3 },
              { level: 3, value: 1, max: 2 },
            ],
            spells: [],
          },
        }),
      ),
    );
    // Two groups per line → the 3rd group forces a second SLOTS line.
    const slotLines = texts.filter((t) => /^\d[▓░]/.test(t));
    expect(slotLines.length).toBe(2);
  });
});

describe('drawShowcaseHud — null snapshot (loading state)', () => {
  it('never throws and renders — / … placeholders', () => {
    const { ctx, texts } = recordingCtx();
    expect(() => drawShowcaseHud(ctx, makeModel(null))).not.toThrow();
    const joined = texts.join('|');
    expect(joined).toContain('—'); // name / AC / speed placeholder
    expect(joined).toContain('…'); // HP loading marker
    expect(joined).not.toContain('⚔');
  });

  it('still draws the boot and the header/footer chrome when loading', () => {
    const { ctx, texts, raw } = recordingCtx();
    drawShowcaseHud(ctx, makeModel(null));
    expect(raw.rect).toHaveBeenCalledTimes(3); // boot still drawn
    expect(texts.join('|')).toContain('SALA BANCHETTI'); // header still rendered
  });
});
