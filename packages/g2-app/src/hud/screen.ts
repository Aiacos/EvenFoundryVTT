/**
 * Maps the transport connection status to the HUD screen (mocks M09–M11).
 */
import type { AppState } from '../state/app-store.js';

/** `unpaired` = M09, `connecting` = M10, `offline` = M11 (frozen thirds), `hud` = M01–M08. */
export type Screen = 'unpaired' | 'connecting' | 'offline' | 'hud';

/**
 * A reconnect attempt with a character already on screen stays in M11 (frozen data)
 * instead of flashing the full-screen M10, which would force a flickering rebuild.
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
