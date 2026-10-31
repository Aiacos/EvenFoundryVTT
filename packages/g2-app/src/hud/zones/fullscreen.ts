/**
 * Full-screen states drawn as four 288 × 144 image tiles (docs/design/g2-sheet-ux.html
 * `fullscreen()`): S10 first run / pairing revoked and S11 connecting. A failure leads
 * with its cause and ends with the remedy, both in the medium face (no micro-caps-only
 * critical fact). Using the image
 * budget keeps the look of the spec (numbered circles, phone + QR glyph, per-step
 * status marks, progress bar) that firmware text cannot draw.
 */
import { disc, drawText, fitText, LABEL_FONT, MEDIUM_FONT, Pixmap } from '@evf/shared-render';
import type { ConnectionState } from '../../state/app-store.js';
import type { HudStrings } from '../i18n.js';
import { SCREEN_H, SCREEN_W } from '../layout.js';

/**
 * What the full screen shows. `pair.unanswered`: the last code got no answer (S10 with
 * the «make a new QR» subtitle).
 */
export type FullScreen =
  | { kind: 'pair'; revoked: boolean; unanswered?: true }
  | { kind: 'connect'; connection: ConnectionState };

/** Headline (medium caps) and subtitle (label caps) of a full screen. */
export interface ScreenTitle {
  headline: string;
  subtitle: string;
}

/** State mark of an S11 step. */
export type StepState = 'done' | 'current' | 'failed' | 'todo';

/** Text content of S11 (pure, so tests can read it without pixels). */
export interface ConnectLayout extends ScreenTitle {
  steps: Array<{ label: string; state: StepState }>;
  /** What the player does next (offline only), drawn in place of the progress bar. */
  remedy: string | null;
}

function frame(p: Pixmap, title: ScreenTitle): void {
  p.roundRect(4, 4, 568, 280, 8, 6);
  drawText(p, MEDIUM_FONT, fitText(MEDIUM_FONT, title.headline, 528), 24, 22, 15, 'left', true);
  drawText(p, LABEL_FONT, fitText(LABEL_FONT, title.subtitle, 530), 24, 44, 9);
  p.hline(20, 556, 58, 4);
}

/**
 * S10 title: the app name on a first run; after a failure the cause leads (headline) and
 * the subtitle says what to do — never the same screen with a different footnote.
 */
export function pairLayout(
  screen: Extract<FullScreen, { kind: 'pair' }>,
  s: HudStrings,
): ScreenTitle {
  const notice = screen.revoked
    ? s.pairNotices.revoked
    : screen.unanswered === true
      ? s.pairNotices.unanswered
      : null;
  return notice
    ? { headline: notice[0], subtitle: notice[1] }
    : { headline: s.appTitle, subtitle: s.unpairedSubtitle };
}

function pairScreen(p: Pixmap, screen: Extract<FullScreen, { kind: 'pair' }>, s: HudStrings): void {
  frame(p, pairLayout(screen, s));
  s.pairSteps.forEach(([a, b], i) => {
    const y = 92 + i * 56;
    disc(p, 38, y, 13, 12, false);
    drawText(p, MEDIUM_FONT, String(i + 1), 38, y - 5, 15, 'center', true);
    drawText(p, MEDIUM_FONT, fitText(MEDIUM_FONT, a, 350), 62, y - 13, 14);
    drawText(p, LABEL_FONT, fitText(LABEL_FONT, b, 350), 62, y + 5, 9);
  });
  // Phone with a QR glyph (the QR itself is shown by Foundry, not by the glasses).
  p.roundRect(430, 76, 86, 150, 10, 11);
  p.roundRect(446, 96, 54, 54, 2, 13);
  for (let i = 0; i < 7; i++) {
    for (let j = 0; j < 7; j++) {
      const finder = (i < 2 && j < 2) || (i > 4 && j < 2) || (i < 2 && j > 4);
      if (finder || (i * 3 + j * 5 + i * j) % 4 === 0)
        p.fillRect(449 + i * 7, 99 + j * 7, 6, 6, 14);
    }
  }
  drawText(p, LABEL_FONT, s.scan, 473, 172, 12, 'center', true);
  drawText(p, LABEL_FONT, s.exitHint, 552, 266, 8, 'right');
}

/**
 * S11 content. Offline before the first snapshot (code pending, actor refused, Foundry
 * closed at the first pairing) is a failure screen: the cause is the headline, the first
 * step not reached is marked failed (a pending code only waits: «in progress») and the
 * remedy replaces the progress bar. Unknown names are left out of the step labels.
 */
export function connectLayout(c: ConnectionState, s: HudStrings): ConnectLayout {
  const st = c.steps ?? {
    relay: false,
    projector: false,
    paired: false,
    character: false,
    scene: false,
  };
  const rows: Array<[boolean, string]> = [
    [st.relay, s.steps.relay],
    [st.projector, s.steps.projector],
    [st.paired, s.steps.paired(c.userName)],
    [st.character, s.steps.character(c.actorName)],
    [st.scene, s.steps.scene],
  ];
  const offline = c.status === 'offline';
  const cause = c.cause ?? 'network';
  const stuck = rows.findIndex(([done]) => !done);
  const stuckState: StepState = offline && cause !== 'code-pending' ? 'failed' : 'current';
  return {
    headline: offline ? s.offlineCauses[cause] : s.appTitle,
    subtitle: s.connectingTo(c.server),
    steps: rows.map(([done, label], i) => ({
      label,
      state: done ? 'done' : i === stuck ? stuckState : 'todo',
    })),
    remedy: offline ? s.remedies[cause] : null,
  };
}

function connectScreen(p: Pixmap, c: ConnectionState, s: HudStrings): void {
  const layout = connectLayout(c, s);
  frame(p, layout);
  layout.steps.forEach(({ label, state }, i) => {
    const y = 84 + i * 30;
    if (state === 'done') disc(p, 34, y + 5, 7, 14, true);
    else if (state === 'current') {
      disc(p, 34, y + 5, 7, 14, false);
      disc(p, 34, y + 5, 3, 14, true);
    } else if (state === 'failed') {
      // ✗ in a ring: the step where it stopped (shape, not only brightness).
      disc(p, 34, y + 5, 7, 15, false);
      p.line(31, y + 2, 37, y + 8, 15);
      p.line(37, y + 2, 31, y + 8, 15);
    } else disc(p, 34, y + 5, 7, 5, false);
    drawText(p, MEDIUM_FONT, fitText(MEDIUM_FONT, label, 500), 52, y, state === 'todo' ? 7 : 14);
  });
  if (layout.remedy !== null) {
    drawText(p, MEDIUM_FONT, fitText(MEDIUM_FONT, `› ${layout.remedy}`, 528), 24, 240, 15);
  } else {
    const done = layout.steps.filter((st) => st.state === 'done').length;
    p.fillRect(24, 244, 528, 8, 3);
    p.fillRect(24, 244, Math.round((528 * done) / layout.steps.length), 8, 13);
  }
  drawText(p, LABEL_FONT, s.cancelHint, 552, 266, 8, 'right');
}

/**
 * Renders a full screen (576 × 288).
 *
 * @param screen - Which screen and its data.
 * @param s - Locale strings.
 */
export function renderFullScreen(screen: FullScreen, s: HudStrings): Pixmap {
  const p = new Pixmap(SCREEN_W, SCREEN_H);
  if (screen.kind === 'pair') pairScreen(p, screen, s);
  else connectScreen(p, screen.connection, s);
  return p;
}
