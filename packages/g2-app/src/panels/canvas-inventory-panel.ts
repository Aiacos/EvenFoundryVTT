/**
 * CanvasInventoryPanel — canvas-mode INTERACTIVE inventory (Feature 001, Option B).
 *
 * Opened by the Quick Action `[I] Inventario` in canvas mode. Swipe-up/down moves a
 * cursor through the items; tap activates the cursor item (Action Options →
 * `activity.use()`). Reuses the glyph standalone renderer + row→item map + resolver
 * verbatim, so the cursor↔row mapping and the dispatched request are identical to
 * the glyph `InventoryPanel`.
 *
 * @see packages/g2-app/src/panels/canvas-selectable-list.ts (base)
 * @see packages/g2-app/src/panels/inventory-panel.ts (selection logic)
 */

import type { CharacterSnapshot } from '@evf/shared-protocol';
import type { PanelMeta } from '../engine/panel-router.js';
import type { HudLocale } from '../status-hud/i18n-budgets.js';
import type { ActionOptionsRequest } from './action-options-modal.js';
import { CanvasSelectableListPanel } from './canvas-selectable-list.js';
import {
  buildInventoryRowItemMap,
  renderInventoryStandaloneContent,
  resolveItemAtRow,
} from './inventory-panel.js';

/** Canvas interactive inventory overlay panel. */
export default class CanvasInventoryPanel extends CanvasSelectableListPanel {
  static meta: PanelMeta = {
    id: 'canvas-inventory',
    title: { it: 'Inventario', en: 'Inventory', de: 'Inventar' },
    navKey: 'I',
    requiredCaps: [],
  };

  public readonly id = 'canvas-inventory';

  protected headerTitle(locale: HudLocale): string {
    return locale === 'it' ? 'INVENTARIO' : 'INVENTORY';
  }

  protected renderRows(
    snapshot: CharacterSnapshot | null,
    locale: HudLocale,
    cursor: number,
  ): string[] {
    return renderInventoryStandaloneContent(snapshot, locale, cursor);
  }

  protected resolveRequest(
    snapshot: CharacterSnapshot,
    locale: HudLocale,
    cursor: number,
  ): ActionOptionsRequest | null {
    const rowMap = buildInventoryRowItemMap(snapshot, locale);
    const item = resolveItemAtRow(
      rowMap,
      CanvasSelectableListPanel.clampCursor(cursor, rowMap.length),
    );
    if (item == null) return null;
    // consumables self-target; everything else needs an explicit target (glyph parity).
    return {
      kind: 'item',
      name: item.name,
      actorId: snapshot.actorId,
      itemId: item.id,
      requiresTarget: item.type !== 'consumable',
    };
  }
}
