/**
 * Zone E (firmware text) for every design screen: INV-1 budgets (lines ≤ region
 * capacity, pixel width ≤ budget, only font-present glyphs) for S1–S12 × IT/EN ×
 * min/max content, and the content of each screen (docs/design/g2-sheet-ux.html).
 */
import { getTextWidth } from '@evenrealities/pretext';
import { describe, expect, it } from 'vitest';
import { character, mockStates, online } from '../../demo/fixtures.js';
import type { AppState } from '../../state/app-store.js';
import { strings } from '../i18n.js';
import { buildEntries } from '../input/entries.js';
import { initialUi } from '../input/ui-state.js';
import { TEXT, type TextRegion } from '../layout.js';
import { contextView } from '../text/context.js';
import { gauge, sanitize, spread } from '../text/measure.js';
import { layoutModeFor, renderTexts } from '../view.js';

const NOW = 120_000;

function texts(id: string, loc: 'it' | 'en' = 'it', v: 'min' | 'max' = 'min') {
  const m = mockStates(v).find((x) => x.id === id);
  if (!m) throw new Error(id);
  return renderTexts(layoutModeFor(m.app), {
    app: m.app,
    ui: m.ui,
    strings: strings(loc),
    now: NOW,
  });
}

describe('INV-1 zone E budgets', () => {
  it('every region fits its lines and pixel budget with drawable glyphs only', () => {
    for (const v of ['min', 'max'] as const) {
      for (const loc of ['it', 'en'] as const) {
        for (const m of mockStates(v)) {
          const out = texts(m.id, loc, v);
          for (const [region, c] of Object.entries(out) as [TextRegion, { content: string }][]) {
            const spec = TEXT[region];
            const lines = c.content.split('\n');
            expect(lines.length, `${m.id} ${region}`).toBeLessThanOrEqual(Math.max(1, spec.lines));
            for (const l of lines) {
              expect(getTextWidth(l), `${m.id} ${loc} ${v} ${region}: ${l}`).toBeLessThanOrEqual(
                spec.budgetPx,
              );
              expect(sanitize(l)).toBe(l);
            }
          }
        }
      }
    }
  });

  it('never truncates a gesture hint (the footer must always be fully readable)', () => {
    for (const loc of ['it', 'en'] as const) {
      for (const hint of Object.values(strings(loc).footer)) {
        expect(getTextWidth(hint), hint).toBeLessThanOrEqual(TEXT.ctxFoot.budgetPx);
      }
    }
  });

  it('every offline cause (S12 and its pairing variants) fits zone E in IT and EN', () => {
    const causes = [
      'no-projector',
      'network',
      'background',
      'code-pending',
      'actor',
      'replaced',
    ] as const;
    for (const loc of ['it', 'en'] as const) {
      expect(Object.keys(strings(loc).offlineCauses).sort()).toEqual([...causes].sort());
      for (const cause of causes) {
        const app = online('min', {
          connection: { status: 'offline', cause, retryInMs: 30_000, attempt: 12, lastSyncAt: 0 },
        });
        const out = renderTexts('sheet', { app, ui: initialUi(), strings: strings(loc), now: NOW });
        const body = out.ctxBody?.content.split('\n') ?? [];
        // Never truncated: the cause line is exactly the string (INV-1, no best effort).
        expect(body[0], `${loc} ${cause}`).toBe(strings(loc).offlineCauses[cause]);
        for (const l of body) {
          expect(getTextWidth(l), `${loc} ${cause}: ${l}`).toBeLessThanOrEqual(
            TEXT.ctxBody.budgetPx,
          );
          expect(sanitize(l)).toBe(l);
        }
      }
    }
  });

  it('a pairing taken by another app names the glasses, not an unnamed «them»', () => {
    expect(strings('it').offlineCauses.replaced).toBe("Occhiali usati da un'altra app");
    expect(strings('en').offlineCauses.replaced).toBe('Glasses used by another app');
  });

  it('full screens only carry the capture layer (their content is image tiles)', () => {
    expect(texts('S10')).toEqual({ bg: { content: ' ', color: 4 } });
    expect(Object.keys(texts('S11'))).toEqual(['bg']);
  });
});

describe('zone E content (IT, design persona)', () => {
  const head = (id: string) => texts(id).ctxHead?.content ?? '';
  const body = (id: string) => texts(id).ctxBody?.content ?? '';
  const foot = (id: string) => texts(id).ctxFoot?.content ?? '';

  it('S1 exploration: scene, newest log first, party gauge further down', () => {
    expect(head('S1')).toMatch(/^Cripta di Vel'Nar +esplorazione$/);
    expect(body('S1').split('\n')[0]).toBe('Mira: Percezione TS riuscito 17');
    expect(foot('S1')).toBe(strings('it').footer.root);
    const all = contextView(online(), { ...initialUi(), scroll: 9 }, strings('it'), NOW, 282);
    expect(all.body.at(-1)).toMatch(/^Mira +■■■■□$/);
  });

  it('S2 initiative with the current turn marked and PF / health gauges', () => {
    expect(head('S2')).toMatch(/^Iniziativa +round 3$/);
    const lines = body('S2').split('\n');
    expect(lines[0]).toMatch(/^▲ Thorin +27\/38$/);
    expect(lines[1]).toMatch(/^Goblin A +■■□□$/);
  });

  it('S3 actions carry bonus and damage right-aligned; S5 spells show slots in the title', () => {
    expect(body('S3').split('\n')[2]).toMatch(/^▼ +Vantaggio: no$/);
    expect(head('S3')).toMatch(/^Azioni +1\/\d$/);
    expect(body('S3').split('\n')[0]).toMatch(/^▶ +Martello da guerra +\+6 · 1d8\+3$/);
    // Pips (190 px) do not fit beside the title in the firmware font: remaining/max.
    // Slot counts keep the head to themselves (a «· 2/4» would read as one more level).
    expect(head('S5')).toMatch(/^Incantesimi +3\/4 2\/3 1\/2$/);
    expect(body('S5')).toMatch(/▶ +Benedizione {2}C +1° · 30 ft/);
    expect(body('S5')).toMatch(/Fiamma sacra +trucchetto\n/);
  });

  it('a list longer than the 3 body lines says so: position in the title, ▼ on the last row', () => {
    const n = buildEntries(
      mockStates('min')[2]?.app ?? online(),
      { ...initialUi(), view: 'actions' },
      strings('it'),
    ).length;
    expect(n).toBeGreaterThan(3);
    expect(head('S3')).toMatch(new RegExp(`^Azioni +1/${n}$`));
    const rows = body('S3').split('\n');
    expect(rows[0]).toMatch(/^▶ /);
    expect(rows[2]).toMatch(/^▼ /);
    // At the bottom the cue flips: ▲ on the first visible row.
    const app = mockStates('min')[2]?.app ?? online();
    const end = contextView(
      app,
      { ...initialUi(), view: 'actions', cursor: n - 1 },
      strings('it'),
      NOW,
      282,
    );
    expect(end.body[0]).toMatch(/^▲ /);
    expect(end.right).toBe(`${n}/${n}`);
    // A list that fits shows no position and no cue (S8: two choices).
    expect(body('S8')).not.toMatch(/▼|▲ /);
  });

  it('S4 targets by distance with the weapon bonus in the title', () => {
    // The weapon and its bonus outrank the position: only the ▼ cue says there is more.
    expect(head('S4')).toMatch(/^Bersaglio +Martello da guerra \+6$/);
    expect(body('S4').split('\n')).toEqual([
      // Enemy health like the initiative list, then the distance.
      expect.stringMatching(/^▶ +Goblin A +■■□□ · 5 ft$/),
      expect.stringMatching(/^ +Goblin B +■■■■ · 10 ft$/),
      expect.stringMatching(/^▼ +Hobgoblin +■■■■ · 30 ft$/),
    ]);
  });

  it('S6 result, S7 reaction countdown, S8 GM request, S9 down, S12 offline', () => {
    // The payoff on one line: roll, bonus, total and outcome; the target in the title.
    expect(head('S6')).toMatch(/^Martello da guerra +→ Goblin A$/);
    expect(body('S6')).toBe('d20 16 +6 = 22 · COLPITO\nDanni 9 contundenti');
    // Reaction type + countdown in the title, only the weapon (and its bonus) per row.
    expect(head('S7')).toMatch(/^▲ Attacco di opportunità +6 s$/);
    expect(body('S7').split('\n')[0]).toMatch(/^▶ +Martello da guerra +\+6$/);
    expect(body('S7').split('\n')[2]).toBe('Innesco: Goblin B');
    expect(head('S8')).toMatch(/^Prova richiesta +dal GM$/);
    expect(body('S8').split('\n')[0]).toMatch(/^Tiro salvezza su SAG +\+7$/);
    expect(body('S8').split('\n')[1]).toMatch(/^▶ +Fatto · d20 al tavolo$/);
    expect(body('S8').split('\n')[2]).toMatch(/^ +Tira in Foundry$/);
    expect(head('S9')).toMatch(/^Sei a terra +round 4$/);
    // The sheet draws the circles: the text says what is left, not the same tally again.
    expect(body('S9')).toBe(
      'Tiro salvezza contro la morte\nAncora 1 fallimento = morte\nAncora 2 successi = stabile',
    );
    expect(head('S12')).toMatch(/^▲ Offline +dati di 2 min fa$/);
    expect(body('S12')).toBe(
      'Foundry del giocatore chiuso\nRiprovo tra 8 s (tentativo 3)\nScheda e mappa congelate',
    );
  });

  it('result: no bonus known → roll and outcome only; no roll → outcome; EN plurals', () => {
    const s = strings('en');
    const payload = { ...mockStates('min')[5]?.app.lastResult } as NonNullable<
      AppState['lastResult']
    >;
    const ui = (bonus: number | null, d20: number | null) => ({
      ...initialUi(),
      view: 'result' as const,
      result: {
        title: 'Fire Bolt',
        target: null,
        bonus,
        shownAt: 0,
        ack: 'ok' as const,
        payload: { ...payload, d20 },
      },
    });
    const app = online();
    expect(contextView(app, ui(null, 12), s, 0, 282).body[0]).toBe('d20 12 · HIT');
    expect(contextView(app, ui(-1, 12), s, 0, 282).body[0]).toBe('d20 12 -1 = 11 · HIT');
    expect(contextView(app, ui(null, null), s, 0, 282).body[0]).toBe('HIT');
    expect(contextView(app, ui(null, 12), s, 0, 282).title).toBe('Fire Bolt');
    const down = online('min', {
      character: { ...character(), hp: 0, death: { success: 2, failure: 0 } },
    });
    expect(contextView(down, initialUi(), s, 0, 282).body.slice(1)).toEqual([
      '3 more failures = death',
      '1 more success = stable',
    ]);
  });

  it('request lines cover checks, skills and DCs; empty lists show a dash', () => {
    const s = strings('en');
    const ui = { ...initialUi(), view: 'request' as const };
    const at = (rollRequest: AppState['rollRequest']) =>
      contextView(online('min', { rollRequest }), ui, s, 0, 282).body;
    expect(at({ messageId: 'a', kind: 'check', ability: 'str', dc: 12 })[0]).toMatch(
      /^STR check +\+3$/,
    );
    expect(at({ messageId: 'a', kind: 'check', ability: 'str', dc: 12 })[1]).toBe('DC 12');
    // Without a DC both choices fit: «Done» (real dice) and «Roll in Foundry».
    const skill = at({ messageId: 'a', kind: 'skill', skill: 'rel' });
    expect(skill[0]).toMatch(/^Religion check +\+6$/);
    expect(skill.slice(1)).toEqual([
      expect.stringMatching(/^▶ +Done/),
      expect.stringMatching(/Roll in Foundry$/),
    ]);
    expect(at({ messageId: 'a', kind: 'check' })[0]).toMatch(/^STR check/);
    expect(at(null)).toHaveLength(1);
    const noCaster = online('min', {
      character: { ...character(), spells: { slots: [], spells: [] } },
    });
    const slot = { ...initialUi(), view: 'slot' as const };
    expect(contextView(noCaster, slot, s, 0, 282).body).toEqual([s.noSlots]);
    const noChar = online('min', { character: null });
    expect(contextView(noChar, { ...initialUi(), view: 'request' }, s, 0, 282).body[0]).toMatch(
      /^▶/,
    );
  });
});

describe('spread', () => {
  it('pushes the right value to the edge and truncates the left label first', () => {
    const line = spread('Martello', '+6', 200);
    expect(line.startsWith('Martello ')).toBe(true);
    expect(line.endsWith('+6')).toBe(true);
    expect(getTextWidth(line)).toBeLessThanOrEqual(200);
    expect(getTextWidth(line)).toBeGreaterThan(190);
    const long = spread(
      'Una lunghissima arma leggendaria dei re sotto la montagna',
      '+10 · 2d6+5',
      200,
    );
    expect(long).toMatch(/…\s+\+10 · 2d6\+5$/);
    expect(spread('solo', '', 100)).toBe('solo');
    expect(gauge(undefined, 3)).toBe('');
  });
});
