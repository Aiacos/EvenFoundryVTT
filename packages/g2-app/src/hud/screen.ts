/**
 * Maps the transport connection status to the HUD screen (docs/design/g2-sheet-ux.html
 * S10–S12).
 */
import type { AppState } from '../state/app-store.js';

/** `unpaired` = S10, `connecting` = S11, `offline` = S12 (dimmed sheet), `hud` = S1–S9. */
export type Screen = 'unpaired' | 'connecting' | 'offline' | 'hud';

/**
 * A reconnect attempt with a character already on screen stays in S12 (frozen data)
 * instead of flashing the full-screen S11, which would force a flickering rebuild.
 */
export function screenOf(app: AppState): Screen {
  switch (app.connection.status) {
    case 'unpaired':
    case 'revoked':
      return 'unpaired';
    case 'connecting':
      return app.character ? 'offline' : 'connecting';
    case 'offline':
      return 'offline';
    case 'online':
      return 'hud';
  }
}
