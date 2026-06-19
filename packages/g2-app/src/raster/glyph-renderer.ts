/**
 * Glyph-mode scene renderer for the G2 map base layer.
 *
 * Branch B/C fallback for `BLE throughput < 100 kbps` or manual user override
 * via `[M] Map mode`. Produces a 66×21 (default) `AsciiGrid` mirroring the
 * Foundry scene as canonical single-character glyphs per the UI-SPEC §Glyph
 * Dictionary table (`@` PC, `M`/`a..z`+digit enemy, `N` NPC, `o` object;
 * cardinal facing arrows `▶◀▲▼`; terrain `░` floor / `▒` rough / `▓` wall /
 * `~` water / `≡` door / `·` FoW unseen).
 *
 * Wire surface: a single `bridge.textContainerUpgrade` call against the
 * canonical capture container name `map-capture` (UI-SPEC §Container Budget
 * — glyph mode reuses the txt-1 z=0 slot). No `rebuildPageContainer`, no
 * image containers.
 *
 * The renderer is split into a pure `buildGlyphGrid(scene)` factory (used by
 * tests + Plan 04 INV-1 fixture comparison) and a thin `renderGlyphScene`
 * wrapper that performs the bridge dispatch.
 *
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04A-UI-SPEC.md §Glyph Dictionary
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04A-UI-SPEC.md §Screen 3 (Glyph Mode)
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04a-CONTEXT.md §Area 4
 * @see packages/shared-render/src/ascii-grid.ts (AsciiGrid public API)
 */
import { type EvenAppBridge, TextContainerUpgrade } from '@evenrealities/even_hub_sdk';
// Import from the browser-safe `/ascii-grid` subpath, NOT the package root: the
// root index re-exports `matchAsciiFixture` (snapshot.ts), which statically
// imports `node:fs` — pulling that into the browser bundle throws an uncaught
// "node:fs externalized" error at boot and blanks the whole app.
import { AsciiGrid, type Cell } from '@evf/shared-render/ascii-grid';
import { resolveContainerIdField } from '../engine/container-registry.js';

/** Token kinds renderable in glyph mode (UI-SPEC §Glyph Dictionary). */
export type GlyphTokenKind = 'pc' | 'monster' | 'npc' | 'object';

/** Cardinal facing directions for token arrows (UI-SPEC §Glyph Dictionary). */
export type GlyphFacing = 'east' | 'west' | 'north' | 'south';

/** Terrain kinds renderable in glyph mode (UI-SPEC §Glyph Dictionary). */
export type GlyphTerrainKind = 'floor' | 'rough' | 'wall' | 'water' | 'door' | 'fow';

/** One renderable token (PC, enemy, NPC, object) in a glyph scene. */
export interface GlyphToken {
  readonly kind: GlyphTokenKind;
  readonly x: number;
  readonly y: number;
  /** Stable identifier for enemies — drives the digit suffix glyph (e.g. `g1`, `g2`). */
  readonly id?: string;
  /** Cardinal facing direction; renders an arrow glyph in the adjacent cell. */
  readonly facing?: GlyphFacing;
}

/** One renderable terrain cell in a glyph scene. */
export interface GlyphTerrain {
  readonly kind: GlyphTerrainKind;
  readonly x: number;
  readonly y: number;
}

/** Full input shape for a glyph scene render. */
export interface GlyphSceneInput {
  readonly tokens: ReadonlyArray<GlyphToken>;
  readonly terrain?: ReadonlyArray<GlyphTerrain>;
  readonly width: number;
  readonly height: number;
}

// ──────────────────────────────────────────────────────────────────────────────
// Glyph dictionary (UI-SPEC §Glyph Dictionary — verbatim)
// ──────────────────────────────────────────────────────────────────────────────

const TERRAIN_GLYPH: Record<GlyphTerrainKind, Cell> = {
  floor: '░',
  rough: '▒',
  wall: '▓',
  water: '~',
  door: '≡',
  fow: '·',
};

const FACING_ARROW: Record<GlyphFacing, Cell> = {
  east: '▶',
  west: '◀',
  north: '▲',
  south: '▼',
};

/** Resolve the primary glyph cell for a token. */
function tokenPrimaryCell(token: GlyphToken): Cell {
  switch (token.kind) {
    case 'pc':
      return '@';
    case 'monster':
      // Enemy → lowercase letter (default 'g') derived from the first
      // alphabetic char of `id`. Specs §7.4a.1 + UI-SPEC §Glyph Dictionary.
      return token.id ? (token.id[0] ?? 'g').toLowerCase() : 'g';
    case 'npc':
      return 'N';
    case 'object':
      return 'o';
  }
}

/** Resolve the secondary "id digit" cell for an enemy (e.g. `g1` ← `g` + `1`). */
function tokenSecondaryCell(token: GlyphToken): Cell | null {
  if (token.kind !== 'monster') {
    return null;
  }
  const id = token.id ?? '';
  if (id.length < 2) {
    return null;
  }
  const second = id[1];
  return second !== undefined ? second : null;
}

/** Resolve `(dx, dy)` offset for a facing arrow (placed adjacent to the token). */
function facingOffset(facing: GlyphFacing): { dx: number; dy: number } {
  switch (facing) {
    case 'east':
      return { dx: 1, dy: 0 };
    case 'west':
      return { dx: -1, dy: 0 };
    case 'north':
      return { dx: 0, dy: -1 };
    case 'south':
      return { dx: 0, dy: 1 };
  }
}

/**
 * Build a uniform-width `AsciiGrid` from a glyph scene.
 *
 * Rendering order (later layers overwrite earlier):
 *   1. blank space-filled grid of declared `width × height`
 *   2. terrain cells (floor / rough / wall / etc.)
 *   3. token primary cells (PC `@`, enemy `g1` first half, NPC `N`, object `o`)
 *   4. token id-digit cells (enemy second half — `1` of `g1`)
 *   5. facing arrows (`▶◀▲▼` adjacent to token)
 *
 * Out-of-bounds coordinates are silently dropped — the renderer must never
 * throw on a partially-visible scene (Plan 06 culls before dispatch).
 *
 * @param scene  Token + terrain coordinates with explicit grid dimensions.
 * @returns      An `AsciiGrid` of the declared `width × height`.
 */
export function buildGlyphGrid(scene: GlyphSceneInput): AsciiGrid {
  const { width, height, tokens, terrain } = scene;
  // Mutable 2D buffer — written column-by-column then materialized as a
  // frozen ReadonlyArray<ReadonlyArray<Cell>> when handing to AsciiGrid.
  const buf: Cell[][] = [];
  for (let r = 0; r < height; r++) {
    const row: Cell[] = new Array(width);
    for (let c = 0; c < width; c++) {
      row[c] = ' ';
    }
    buf.push(row);
  }
  // Helper: write a cell with bounds-check (silent drop on miss).
  const write = (col: number, row: number, cell: Cell): void => {
    if (col < 0 || col >= width || row < 0 || row >= height) {
      return;
    }
    const target = buf[row];
    if (target === undefined) {
      return;
    }
    target[col] = cell;
  };
  // 1. Terrain layer.
  if (terrain !== undefined) {
    for (const t of terrain) {
      write(t.x, t.y, TERRAIN_GLYPH[t.kind]);
    }
  }
  // 2. Token primary + secondary + facing arrow.
  for (const token of tokens) {
    write(token.x, token.y, tokenPrimaryCell(token));
    const secondary = tokenSecondaryCell(token);
    if (secondary !== null) {
      write(token.x + 1, token.y, secondary);
    }
    if (token.facing !== undefined) {
      const { dx, dy } = facingOffset(token.facing);
      write(token.x + dx, token.y + dy, FACING_ARROW[token.facing]);
    }
  }
  return new AsciiGrid(buf);
}

/**
 * Render `scene` to the G2 via a single `bridge.textContainerUpgrade` call.
 *
 * The default container name `map-capture` is the canonical capture container
 * declared by `page-lifecycle.createBootPage()` / `createMainPage()` (UI-SPEC
 * §Container Budget Allocation, glyph mode row); callers may override for
 * tests but production code uses the default.
 *
 * @param bridge          Resolved `EvenAppBridge` singleton.
 * @param scene           Glyph scene input.
 * @param containerName   Target text container name; defaults to `'map-capture'`.
 */
export async function renderGlyphScene(
  bridge: EvenAppBridge,
  scene: GlyphSceneInput,
  containerName: string = 'map-capture',
): Promise<void> {
  const grid = buildGlyphGrid(scene);
  const payload = new TextContainerUpgrade({
    ...resolveContainerIdField(containerName),
    containerName,
    content: grid.toString(),
  });
  await bridge.textContainerUpgrade(payload);
}
