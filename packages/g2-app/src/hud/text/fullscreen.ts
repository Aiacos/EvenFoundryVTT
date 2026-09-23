/**
 * Full-screen messages: M09 (first run / revoked) and M10 (connecting).
 * Exactly {@link FULL_LINES} lines, the gesture hint always on the last one.
 *
 * @see docs/design/g2-thirds-layout.md M09, M10
 */
import type { ConnectionState } from '../../state/app-store.js';
import type { HudStrings } from '../i18n.js';
import { GLYPH } from './measure.js';

export const FULL_LINES = 10;
const TITLE = 'EVENFOUNDRYVTT';
const PROGRESS_CELLS = 20;

function pad(lines: string[], footer: string): string[] {
  const out = lines.slice(0, FULL_LINES - 1);
  while (out.length < FULL_LINES - 1) out.push('');
  out.push(footer);
  return out;
}

/** M09 — glasses not paired (or pairing revoked by the GM). */
export function unpairedScreen(revoked: boolean, s: HudStrings): string[] {
  const [intro = '', ...rest] = s.unpaired;
  return pad(
    [TITLE, '', revoked ? s.revoked : intro, ...rest.slice(0, 4), '', rest[4] ?? ''],
    s.footer.exit,
  );
}

/** M10 — connection in progress with per-step checklist and progress bar. */
export function connectingScreen(c: ConnectionState, s: HudStrings): string[] {
  const st = c.steps ?? { server: false, login: false, gm: false, character: false, scene: false };
  const steps: Array<[boolean, string]> = [
    [st.server, s.steps.server],
    [st.login, s.steps.login(c.userName ?? GLYPH.dash)],
    [st.gm, s.steps.gm(c.gmName ?? GLYPH.dash)],
    [st.character, s.steps.character(c.actorName ?? GLYPH.dash)],
    [st.scene, s.steps.scene],
  ];
  const firstTodo = steps.findIndex(([done]) => !done);
  const lines = steps.map(([done, label], i) => {
    const mark = done ? GLYPH.full : i === firstTodo ? GLYPH.cursor : GLYPH.empty;
    return `${mark} ${label}`;
  });
  const doneCount = steps.filter(([done]) => done).length;
  const filled = Math.round((doneCount / steps.length) * PROGRESS_CELLS);
  const bar = GLYPH.barFull.repeat(filled) + GLYPH.barEmpty.repeat(PROGRESS_CELLS - filled);
  return pad([TITLE, s.connectingTo(c.server ?? GLYPH.dash), '', ...lines, bar], s.footer.cancel);
}
