/**
 * Maps Even Hub events (SDK 0.0.15) to HUD inputs.
 *
 * The event-capture container is a full-screen text container, so:
 * - swipes arrive as `textEvent` SCROLL_TOP / SCROLL_BOTTOM;
 * - press / double-press arrive as `sysEvent` (CLICK is 0 and is omitted by
 *   protobuf → `eventType ?? 0`);
 * - LONG_PRESS (extra, not in the R1 canonical set) is left to the OS, which opens
 *   the page's `menuObject`; the choice arrives as `menuItemClickEvent`.
 *
 * @see https://hub.evenrealities.com/docs/build/input (fetched 2026-09-23)
 */
import { type EvenHubEvent, OsEventTypeList } from '@evenrealities/even_hub_sdk';
import type { HudInput } from './state-machine.js';

/** HUD input or a lifecycle signal (`foreground` = app returned to the foreground). */
export type GestureEvent = HudInput | { t: 'foreground' };

function scroll(type: OsEventTypeList | undefined): GestureEvent | null {
  if (type === OsEventTypeList.SCROLL_TOP_EVENT) return { t: 'up' };
  if (type === OsEventTypeList.SCROLL_BOTTOM_EVENT) return { t: 'down' };
  return null;
}

/**
 * @returns The HUD input for `ev`, or null for events the HUD ignores.
 */
export function toGestureEvent(ev: EvenHubEvent): GestureEvent | null {
  if (ev.menuItemClickEvent) {
    const id = ev.menuItemClickEvent.itemID;
    return id === undefined ? null : { t: 'menu', id };
  }
  if (ev.textEvent) return scroll(ev.textEvent.eventType);
  if (ev.sysEvent) {
    const type = ev.sysEvent.eventType ?? OsEventTypeList.CLICK_EVENT;
    switch (type) {
      case OsEventTypeList.CLICK_EVENT:
        return { t: 'tap' };
      case OsEventTypeList.DOUBLE_CLICK_EVENT:
        return { t: 'double' };
      case OsEventTypeList.FOREGROUND_ENTER_EVENT:
        return { t: 'foreground' };
      default:
        return scroll(type);
    }
  }
  return null;
}
