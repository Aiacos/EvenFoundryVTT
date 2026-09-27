/**
 * Maps the transport connection status to the HUD screen (docs/design/g2-sheet-ux.html
 * S10–S12).
 */
import type { AppState } from '../state/app-store.js';

/** `unpaired` = S10, `connecting` = S11, `offline` = S12 (dimmed sheet), `hud` = S1–S9. */
export type Screen = 'unpaired' | 'connecting' | 'offline' | 'hud';

/**
 * A reconnect attempt with a character already on screen stays in S12 (frozen data)
 * instead of flashing the full-screen S11, which would force a flickering rebuild; without
 * a character both `connecting` and `offline` use S11.
 */
export function screenOf(app: AppState): Screen {
  switch (app.connection.status) {
    case 'unpaired':
    case 'revoked':
      return 'unpaired';
    case 'connecting':
      return app.character ? 'offline' : 'connecting';
    case 'offline':
      // Nothing to freeze before the first snapshot (code pending, actor refused, Foundry
      // closed at the first pairing): the full S11 screen names the cause instead of an
      // empty dimmed sheet.
      return app.character ? 'offline' : 'connecting';
    case 'online':
      return 'hud';
  }
}
