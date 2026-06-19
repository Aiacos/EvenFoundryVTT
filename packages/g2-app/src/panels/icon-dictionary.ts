/**
 * Shared icon dictionary — single source of truth for the sheet/HUD icon set.
 *
 * Feature 001 (D3): the canvas-composited D&D-sheet UI draws icons (abilities,
 * proficiency, item types, spell slots, …). Historically each panel kept its own
 * inline glyph map (`ITEM_GLYPHS` in inventory-panel, `PROF_GLYPHS` in
 * character-sheet-tab-renderers, `SLOT_*` in spellbook-panel, vitals glyphs inline).
 * This module consolidates them so the glyph fallback and the canvas-path render
 * stay consistent (Constitution I — one source for both render paths).
 *
 * Two render paths share one definition:
 *  - {@link iconToUnicode} — the existing Unicode glyph (low-bandwidth glyph fallback).
 *  - {@link drawIcon}      — a canvas-path render at a fixed cell size (the compositor).
 *
 * On the 576×288 4-bit phosphor display the icon set renders as crisp Unicode glyphs
 * centered in their cell (the canvas "path" for these symbolic icons): one definition
 * feeds both the glyph fallback and the canvas compositor, so they never drift
 * (Constitution I). A caller needing a true vector shape can extend {@link drawIcon}
 * per-id without changing any call site.
 *
 * @see specs/001-foundry-g2-hud/data-model.md (Icon)
 * @see specs/001-foundry-g2-hud/research.md D3
 */

/** Canvas 2D context accepted by {@link drawIcon} (browser or worker offscreen). */
type IconCtx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Fixed pixel bounds an icon is drawn into. */
export interface IconBounds {
  /** X of the top-left corner (pixels). */
  readonly x: number;
  /** Y of the top-left corner (pixels). */
  readonly y: number;
  /** Width in pixels. */
  readonly w: number;
  /** Height in pixels. */
  readonly h: number;
}

/**
 * Stable identifiers for every icon the sheet/HUD can draw.
 *
 * Values are kebab-case strings (stable across builds; safe as snapshot keys).
 */
export enum IconId {
  /** Inventory: weapon (legacy `⚔`). */
  Weapon = 'weapon',
  /** Inventory: armor / equipment (legacy `⛨`). */
  Armor = 'armor',
  /** Inventory: consumable / container (legacy `▶`). */
  Consumable = 'consumable',
  /** Inventory: currency / other (legacy blank). */
  Currency = 'currency',
  /** Proficiency: untrained (legacy `○`, ProfLevel 0). */
  ProfNone = 'prof-none',
  /** Proficiency: proficient (legacy `◉`, ProfLevel 1; half-prof rounds up). */
  ProfProficient = 'prof-proficient',
  /** Proficiency: expertise / mastery (legacy `★`, ProfLevel 2). */
  ProfExpertise = 'prof-expertise',
  /** Spell slot: spent/filled (legacy `▓`). */
  SlotFilled = 'slot-filled',
  /** Spell slot: available/empty (legacy `░`). */
  SlotEmpty = 'slot-empty',
  /** Vitals: armor class (legacy `⛨`). */
  ArmorClass = 'armor-class',
  /** Vitals: initiative (legacy `⚡`). */
  Initiative = 'initiative',
  /** Vitals: speed (legacy `⚔`). */
  Speed = 'speed',
  /** Spellbook: prepared / cursor marker (legacy `▶`). */
  SpellPrepared = 'spell-prepared',
  /** Spellbook: always-prepared (legacy `≡`, PHB 2024). */
  SpellAlwaysPrepared = 'spell-always-prepared',
}

/**
 * Unicode glyph for each icon — the de-duplicated legacy inventory/skill/spell glyphs.
 *
 * Some semantically-distinct icons intentionally share a glyph (e.g. {@link IconId.Armor}
 * and {@link IconId.ArmorClass} are both `⛨`; {@link IconId.Weapon} and {@link IconId.Speed}
 * are both `⚔`) — they remain separate IconIds so the canvas path can diverge later.
 */
const ICON_UNICODE: Record<IconId, string> = {
  [IconId.Weapon]: '⚔',
  [IconId.Armor]: '⛨',
  [IconId.Consumable]: '▶',
  [IconId.Currency]: ' ',
  [IconId.ProfNone]: '○',
  [IconId.ProfProficient]: '◉',
  [IconId.ProfExpertise]: '★',
  [IconId.SlotFilled]: '▓',
  [IconId.SlotEmpty]: '░',
  [IconId.ArmorClass]: '⛨',
  [IconId.Initiative]: '⚡',
  [IconId.Speed]: '⚔',
  [IconId.SpellPrepared]: '▶',
  [IconId.SpellAlwaysPrepared]: '≡',
};

/** Default icon cell size (pixels) for the canvas path. */
export const ICON_CELL_PX = 16 as const;

/**
 * Resolve an icon to its Unicode glyph (low-bandwidth glyph fallback path).
 *
 * @param id The icon identifier.
 * @returns The single-glyph string for that icon.
 */
export function iconToUnicode(id: IconId): string {
  return ICON_UNICODE[id];
}

/**
 * Every icon id, in declaration order — for completeness tests and palette UIs.
 */
export const ALL_ICON_IDS: readonly IconId[] = Object.values(IconId);

/**
 * Draw an icon into the canvas at a fixed cell size (compositor path).
 *
 * Phase-2 stub: renders the {@link iconToUnicode} glyph centered in `bounds`, using
 * `fill` as the glyph color. US3 (T023) replaces this with per-icon vector/text paths.
 *
 * @param ctx    The 2D canvas context to draw into.
 * @param id     The icon to draw.
 * @param bounds The pixel box to render the icon within.
 * @param fill   The fill style (color) for the icon.
 */
export function drawIcon(ctx: IconCtx, id: IconId, bounds: IconBounds, fill: string): void {
  const glyph = iconToUnicode(id);
  if (glyph.trim() === '') {
    return; // blank icon (e.g. Currency) — nothing to draw
  }
  const cell = Math.min(bounds.w, bounds.h, ICON_CELL_PX);
  ctx.save();
  ctx.fillStyle = fill;
  ctx.font = `${cell}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(glyph, bounds.x + bounds.w / 2, bounds.y + bounds.h / 2);
  ctx.restore();
}
