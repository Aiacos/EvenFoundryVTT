/**
 * BootErrorLayer — single z=1 layer that replaces the StatusHudLayer during a
 * failed boot. Renders the canonical UI-SPEC §3.3 centered panel:
 *
 * ```
 * ┌──────────────────────────────────────────────────────────┐
 * │ {title}                                                  │
 * │                                                          │
 * │ {hintLine1}                                              │
 * │ {hintLine2}                                              │
 * │                                                          │
 * │ {closeAnnotation}                                        │
 * └──────────────────────────────────────────────────────────┘
 * ```
 *
 * The OUTER 96×24 page frame is owned by the boot page schema
 * (`createBootPage` / Phase 4a). BootErrorLayer fills only the centered
 * panel via a single `bridge.textContainerUpgrade` call with the 8-row
 * panel content joined by `\n`. Strategy A (Plan 01 / `Layer.getContainerCount`):
 * `{ image: 0, text: 1 }` — one text container, zero image containers.
 *
 * **Option B (panel frame in container content):** the inner panel border
 * characters (`┌─…─┐`, `│ … │`, `└─…─┘`) are part of the same text payload
 * as the content rows. Alternative Option A — panel frame owned by the page
 * schema — would require modifying `createBootPage()` (Plan 02's domain).
 * Plan 04 picks Option B to keep the panel self-contained inside this single
 * layer and avoid Wave-2 file-overlap.
 *
 * **T-4b-04-04 mitigation:** BootErrorLayer does NOT participate in
 * `LayerManager.bundle()`'s capture-container invariant. The error UI is
 * terminal — the user observes the panel and re-pairs. There is no map
 * layer, no scene-input handler, no z=0 capture provider. The wrapper
 * (`boot-engine-error-wrapper.ts`, Plan 04 Task 3) calls `draw()` directly
 * on `bridge.textContainerUpgrade` and never invokes `LayerManager`. This
 * is the special "boot-failure-layout" path documented in JSDoc.
 *
 * **Phase 6 wiring hook:** the `[X] Close` annotation is a VISUAL CUE only.
 * The TODO(ADR-0009) marker below anchors the Phase 6 task that wires the
 * actual tap gesture through `PanelGestureBus` to `bootEngine.retry()`.
 *
 * @see .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-UI-SPEC.md §3.3 + §5.1-§5.10
 * @see .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-RESEARCH.md §Approach 4
 * @see docs/architecture/0009-layer-manager-contract.md Amendment 1 (error-layer carve-out)
 */

import { type EvenAppBridge, TextContainerUpgrade } from '@evenrealities/even_hub_sdk';
import {
  BOOT_ERROR_CONTENT,
  type BootErrorLocale,
  type BootErrorState,
} from './boot-error-types.js';
import type { Layer } from './layer-types.js';

/**
 * Inner panel width in characters.
 *
 * 60-col panel = 58 chars of inner content + 2 chars of left+right border
 * (`│ ` + ` │`). UI-SPEC §5.1 fixtures have the panel borders at cols 18..77
 * of the 96-wide page (78 - 18 = 60 panel width).
 */
const PANEL_WIDTH = 60;

/** Inner content width (panel minus the `│ ` + ` │` decoration). */
const PANEL_INNER_WIDTH = PANEL_WIDTH - 4; // 56 — accounts for `│ ` left + ` │` right padding

/**
 * Stable container name for the boot-error text payload.
 *
 * The page schema (`createBootPage()`) declares a `'boot-error-block'`
 * text container at the appropriate rows; BootErrorLayer.draw() flushes
 * its 8-row content into that container via `bridge.textContainerUpgrade`.
 */
export const BOOT_ERROR_CONTAINER_NAME = 'boot-error-block' as const;

/**
 * z=1 single-text-container layer that renders the boot-error panel.
 *
 * Mounted by `bootEngineWithErrorUi` (Plan 04 Task 3 wrapper) on the
 * boot-failure path. Replaces the standard StatusHudLayer at z=1 — there
 * is no main-page composition for a failed boot, so this is a layout-level
 * swap (not an overlay). The wrapper calls `bridge.textContainerUpgrade`
 * directly rather than mounting through `LayerManager.bundle()` to bypass
 * the capture-container invariant (see module JSDoc T-4b-04-04).
 *
 * Construction is cheap (3 stored fields) — instances are not pooled.
 */
export class BootErrorLayer implements Layer {
  /** Stable id for logging + telemetry. */
  public readonly id = 'boot-error';

  private readonly bridge: EvenAppBridge;
  private readonly state: BootErrorState;
  private readonly locale: BootErrorLocale;

  /**
   * @param bridge Even Hub bridge handle used for the single textContainerUpgrade call.
   * @param state  Resolved {@link BootErrorState} from `bootErrorFromException`.
   * @param locale UI locale — picks the right column of `BOOT_ERROR_CONTENT`.
   */
  constructor(bridge: EvenAppBridge, state: BootErrorState, locale: BootErrorLocale) {
    this.bridge = bridge;
    this.state = state;
    this.locale = locale;
  }

  /**
   * Build the 8-row panel content + flush to the bridge in a single
   * `textContainerUpgrade` call.
   *
   * Resolves with `void` once the bridge promise settles. The wrapper's
   * error path swallows render-failures via its own try/catch — this
   * function does NOT swallow; it propagates the bridge's rejection upward
   * so the wrapper's console.error telemetry fires (T-4b-04-06).
   *
   * Performance: every call rebuilds the 8 rows from scratch. The layer
   * is mounted once on the failure path and never re-drawn (Phase 6 retry
   * tears it down and constructs a fresh BootEngineHandle), so caching is
   * unnecessary YAGNI.
   */
  async draw(): Promise<void> {
    const content = BOOT_ERROR_CONTENT[this.state][this.locale];
    const lines = [
      `┌${'─'.repeat(PANEL_WIDTH - 2)}┐`,
      this._innerRow(content.title),
      this._innerRow(''),
      this._innerRow(content.hintLine1),
      this._innerRow(content.hintLine2),
      this._innerRow(''),
      // TODO(ADR-0009): Phase 6 wires `[X] Close` to bootEngine.retry()
      // via the PanelGestureBus tap-gesture channel. Plan 04 ships the
      // visual annotation only — the gesture handler lands in Phase 6.
      this._innerRow(content.closeAnnotation),
      `└${'─'.repeat(PANEL_WIDTH - 2)}┘`,
    ];
    const payload = new TextContainerUpgrade({
      containerName: BOOT_ERROR_CONTAINER_NAME,
      content: lines.join('\n'),
    });
    await this.bridge.textContainerUpgrade(payload);
  }

  /**
   * Tear down the layer.
   *
   * BootErrorLayer holds no timers, no subscriptions, no Workers — the layer
   * is purely a render-once-then-stay-visible layout. `destroy()` is a no-op
   * by design and idempotent (a second call is safe). T-4b-04-04 trust
   * boundary: the layer does not need to release a capture provider because
   * it never registered one (no `getCaptureContainer` method).
   */
  destroy(): void {
    // Intentionally empty — BootErrorLayer holds no releasable resources.
  }

  /**
   * Strategy A container footprint per ADR-0009 Amendment 1 / Plan 01.
   *
   * BootErrorLayer occupies exactly one text container (`'boot-error-block'`)
   * regardless of which state / locale is rendered. No image containers.
   */
  getContainerCount(): { image: 0; text: 1 } {
    return { image: 0, text: 1 };
  }

  /**
   * Pad / truncate a content string to the inner panel width and wrap with
   * the side borders `│ … │`.
   *
   * UI-SPEC §3.3 contract: every inner row is 60 chars wide
   * (`│ <56-char-content> │`). Content shorter than 56 chars is right-padded
   * with spaces; content longer than 56 chars is truncated (defensive — every
   * BOOT_ERROR_CONTENT value is width-budgeted at ≤ 50 chars per UI-SPEC §4.3
   * which is well under the 56-char inner width).
   */
  private _innerRow(text: string): string {
    const padded =
      text.length >= PANEL_INNER_WIDTH
        ? text.slice(0, PANEL_INNER_WIDTH)
        : text + ' '.repeat(PANEL_INNER_WIDTH - text.length);
    return `│ ${padded} │`;
  }
}
