/**
 * IdleInfillLayer — z=0.5 content infill visible only when no z=2 overlay is mounted.
 *
 * Implements the `Layer` interface and is mounted at `ZIndex.Z0_5_IDLE_INFILL`
 * by the boot flow (Plan 05 smoke; Plan 06 production wiring). Renders 3 text
 * containers in raster mode (combat-log strip, label separator, stats strip)
 * or 2 in glyph mode (combat-log omitted — the glyph grid already shows token
 * deltas; UI-SPEC §z=0.5 Idle Content Infill §Glyph mode degradation table).
 *
 * **Atomic lifecycle (ADR-0001 Amendment 1 + CONTEXT.md §Area 1):**
 * the layer's `destroy()` is a no-op because LayerManager.bundle() removes
 * its containers via the single `rebuildPageContainer` flush. The layer
 * relies on the bundle's atomicity for the demolition — there is no per-
 * container teardown to issue.
 *
 * NEVER captures input — `getCaptureContainer` is omitted entirely
 * (render-only). The z=0 MapBaseLayer carries the capture container while
 * idle infill is mounted.
 *
 * Stats strip format (row 19 per UI-SPEC §z=0.5 Stats strip format):
 *
 *   `{mode} {res} · {pipeline} · BLE {N}k · {N} fps · [Q] Quick`
 *
 * Missing fields fall back to `—` (em-dash) per CONTEXT.md §Area 3 missing
 * scalar policy.
 *
 * @see docs/architecture/0001-layered-ui-model.md §Amendment 1 (z=0.5 spec)
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04a-CONTEXT.md §Area 1
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04A-UI-SPEC.md §z=0.5 Idle Content Infill
 * @see .planning/phases/04a-g2-engine-raster-status-hud/04A-PATTERNS.md §idle-infill-layer.ts
 */

import { type EvenAppBridge, TextContainerUpgrade } from '@evenrealities/even_hub_sdk';
import { resolveContainerIdField } from '../engine/container-registry.js';
import type { Layer } from '../engine/layer-types.js';

/** Map-rendering mode — drives the 3-vs-2-container degradation. */
export type IdleInfillMode = 'raster' | 'glyph';

/**
 * Telemetry / stats payload rendered on the stats strip (row 19 of the page).
 *
 * Phase 4a wires the raster controller + BLE probe to push these stats; until
 * Plan 06 plumbs the real source, the layer renders fallbacks (`—`) for any
 * field left unset. Missing optional fields preserve column width exactly.
 */
export interface IdleInfillStats {
  /** `'raster'` or `'glyph'` — surfaces in the stats strip leading segment. */
  readonly mode: IdleInfillMode;
  /** Effective resolution string (e.g. `'400×200'`). Missing → `—`. */
  readonly res: string;
  /** Pipeline tag (e.g. `'FS+RLE+delta'`). Missing → `—`. */
  readonly pipeline: string;
  /** Sustained BLE throughput in kilobits/sec. `undefined` → renders as `—`. */
  readonly bleKbps?: number;
  /** Observed frames-per-second. `undefined` → renders as `—`. */
  readonly fpsObserved?: number;
}

/** Container names for the 3 z=0.5 slots. */
const Z05_COMBAT_LOG = 'z05-combat-log';
const Z05_LABEL = 'z05-label';
const Z05_STATS = 'z05-stats';

/** Total stats-strip width per UI-SPEC §Stats strip format Max-width column. */
const STATS_STRIP_WIDTH = 60;

/** Static label-separator content per UI-SPEC §z=0.5 row 18. */
const LABEL_SEPARATOR_CONTENT = '─── z=0.5 idle infill ──────────────────';

/**
 * z=0.5 Idle Content Infill layer.
 *
 * Constructed by the boot flow; mounted at `ZIndex.Z0_5_IDLE_INFILL` via
 * `LayerManager.bundle` when no z=2 overlay is active. `setMode` swaps the
 * raster ↔ glyph degradation; `setStats` updates the stats strip payload.
 */
export class IdleInfillLayer implements Layer {
  /** Stable id used by LayerManager + telemetry. */
  public readonly id = 'idle-infill';

  /** Current rendering mode — drives the 3-vs-2-container split. */
  private mode: IdleInfillMode;
  /** Most-recent stats payload — drained on every `draw()`. */
  private stats: IdleInfillStats | null = null;

  constructor(
    private readonly bridge: EvenAppBridge,
    mode: IdleInfillMode = 'raster',
  ) {
    this.mode = mode;
  }

  /** Update the active mode (raster vs glyph). Idempotent. */
  setMode(mode: IdleInfillMode): void {
    this.mode = mode;
  }

  /** Stash a fresh stats payload — next `draw()` paints it. */
  setStats(stats: IdleInfillStats): void {
    this.stats = stats;
  }

  /**
   * Paint the z=0.5 strips.
   *
   * Raster mode: 3 `textContainerUpgrade` calls (combat-log, label, stats).
   * Glyph mode: 2 calls (combat-log omitted — UI-SPEC §z=0.5 Glyph degradation).
   *
   * Combat-log content for Phase 4a is a static placeholder (Plan 06 wires the
   * real `combat.recentEvents[0]` source). The stats strip composes the
   * pipeline string via `_formatStatsStrip`.
   */
  async draw(): Promise<void> {
    const statsContent = this._formatStatsStrip();

    if (this.mode === 'raster') {
      await this.bridge.textContainerUpgrade(
        new TextContainerUpgrade({
          ...resolveContainerIdField(Z05_COMBAT_LOG),
          containerName: Z05_COMBAT_LOG,
          // Phase 4a placeholder — Plan 06 wires combat.recentEvents[0]
          content: '⚔ —',
        }),
      );
    }

    await this.bridge.textContainerUpgrade(
      new TextContainerUpgrade({
        ...resolveContainerIdField(Z05_LABEL),
        containerName: Z05_LABEL,
        content: LABEL_SEPARATOR_CONTENT,
      }),
    );

    await this.bridge.textContainerUpgrade(
      new TextContainerUpgrade({
        ...resolveContainerIdField(Z05_STATS),
        containerName: Z05_STATS,
        content: statsContent,
      }),
    );
  }

  /**
   * No-op teardown.
   *
   * LayerManager.bundle() removes the layer's text containers via the single
   * `rebuildPageContainer` flush (ADR-0001 Amendment 1 atomic lifecycle).
   * There is no per-container teardown to issue from here.
   */
  destroy(): void {
    // Intentionally empty — see class JSDoc + ADR-0001 Amendment 1.
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Internal — stats strip formatting
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Build the row-19 stats strip per UI-SPEC §Stats strip format.
   *
   * Format: `{mode} {res} · {pipeline} · BLE {N}k · {N} fps · [Q] Quick`
   *
   * Missing optional fields render as `—` (em-dash) — width preserved. The
   * output is truncated/padded to `STATS_STRIP_WIDTH` chars (40) per the
   * UI-SPEC Max-width column.
   */
  private _formatStatsStrip(): string {
    const s = this.stats;
    const mode = s?.mode ?? this.mode;
    const res = s?.res ?? '—';
    const pipeline = s?.pipeline ?? '—';
    const ble = s?.bleKbps !== undefined ? `${s.bleKbps}k` : '—';
    const fps = s?.fpsObserved !== undefined ? `${s.fpsObserved}` : '—';

    const raw = `${mode} ${res} · ${pipeline} · BLE ${ble} · ${fps} fps · [Q] Quick`;
    const codepoints = [...raw];
    if (codepoints.length >= STATS_STRIP_WIDTH) {
      return codepoints.slice(0, STATS_STRIP_WIDTH).join('');
    }
    return raw + ' '.repeat(STATS_STRIP_WIDTH - codepoints.length);
  }
}
