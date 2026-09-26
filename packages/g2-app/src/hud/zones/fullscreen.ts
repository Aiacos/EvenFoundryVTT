/**
 * Full-screen states drawn as four 288 × 144 image tiles (docs/design/g2-sheet-ux.html
 * `fullscreen()`): S10 first run / pairing revoked and S11 connecting. Using the image
 * budget keeps the look of the spec (numbered circles, phone + QR glyph, per-step
 * status marks, progress bar) that firmware text cannot draw.
 */
import { disc, drawText, fitText, LABEL_FONT, MEDIUM_FONT, Pixmap } from '@evf/shared-render';
import type { ConnectionState } from '../../state/app-store.js';
import type { HudStrings } from '../i18n.js';
import { SCREEN_H, SCREEN_W } from '../layout.js';

/** What the full screen shows. */
export type FullScreen =
  | { kind: 'pair'; revoked: boolean }
  | { kind: 'connect'; connection: ConnectionState };

function frame(p: Pixmap, s: HudStrings, subtitle: string): void {
  p.roundRect(4, 4, 568, 280, 8, 6);
  drawText(p, MEDIUM_FONT, s.appTitle, 24, 22, 15, 'left', true);
  drawText(p, LABEL_FONT, fitText(LABEL_FONT, subtitle, 530), 24, 44, 9);
  p.hline(20, 556, 58, 4);
}

function pairScreen(p: Pixmap, revoked: boolean, s: HudStrings): void {
  frame(p, s, revoked ? s.revokedSubtitle : s.unpairedSubtitle);
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

function connectScreen(p: Pixmap, c: ConnectionState, s: HudStrings): void {
  frame(p, s, s.connectingTo(c.server ?? '—'));
  const st = c.steps ?? {
    relay: false,
    projector: false,
    paired: false,
    character: false,
    scene: false,
  };
  const steps: Array<[boolean, string]> = [
    [st.relay, s.steps.relay],
    [st.projector, s.steps.projector],
    [st.paired, s.steps.paired(c.userName ?? '—')],
    [st.character, s.steps.character(c.actorName ?? c.label ?? '—')],
    [st.scene, s.steps.scene],
  ];
  const current = steps.findIndex(([done]) => !done);
  steps.forEach(([done, label], i) => {
    const y = 84 + i * 30;
    if (done) disc(p, 34, y + 5, 7, 14, true);
    else if (i === current) {
      disc(p, 34, y + 5, 7, 14, false);
      disc(p, 34, y + 5, 3, 14, true);
    } else disc(p, 34, y + 5, 7, 5, false);
    drawText(
      p,
      MEDIUM_FONT,
      fitText(MEDIUM_FONT, label, 500),
      52,
      y,
      done || i === current ? 14 : 7,
    );
  });
  const done = steps.filter(([d]) => d).length;
  p.fillRect(24, 244, 528, 8, 3);
  p.fillRect(24, 244, Math.round((528 * done) / steps.length), 8, 13);
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
  if (screen.kind === 'pair') pairScreen(p, screen.revoked, s);
  else connectScreen(p, screen.connection, s);
  return p;
}
