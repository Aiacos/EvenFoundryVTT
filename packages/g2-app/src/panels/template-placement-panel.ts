/**
 * TemplatePlacementPanel — z=2 overlay panel for AoE template position confirmation.
 *
 * Mounts when the bridge emits a `template.placement.requested` envelope (Plan 07-03
 * ACT-02). Displays the template type, spell name, template index, and a crosshair
 * position widget. R1 scroll adjusts position; R1 tap emits the confirmation; R1
 * double-tap cancels placement (ADR-0012 D-3 — cancel = close/back for a transient modal).
 *
 * Implements {@link ../engine/layer-types.ts#OverlayPanel} verbatim:
 *
 *   - `onMount()`   — subscribes to {@link ../engine/panel-gesture-bus.ts#PanelGestureBus}
 *   - `onUnmount()` — unsubscribes (T-4b-01-03 no-leak mitigation)
 *   - `onEvent(g)`  — scroll → adjust position; tap → confirm + ws.send; double-tap → cancel + ws.send
 *
 * **Container strategy (Strategy A — ADR-0009 Amendment 1):**
 * Single text container `'overlay-block'` with newline-joined content.
 * Zero image containers.
 *
 * **R1 gesture dispatch:**
 * - scroll-up   → y -= GRID_STEP (50px)
 * - scroll-down → y += GRID_STEP (50px)
 * - tap         → emit `tool.invoke` envelope (toolId: 'confirm-template-placement')
 * - double-tap  → emit `template.placement.cancel` envelope + onClose
 *
 * **Wire format (tap confirm):**
 * The tap emits a `tool.invoke` envelope with the inner payload:
 * `{ toolId: 'confirm-template-placement', args: { placementId, templateIndex, x, y } }`
 *
 * **Wire format (double-tap cancel):**
 * Emits a `template.placement.cancel` envelope with:
 * `{ placementId }` — module discards the placement context.
 *
 * @see .planning/phases/07-foundry-module-write-path/07-03-PLAN.md Task 2
 * @see .planning/phases/07-foundry-module-write-path/07-RESEARCH.md §Q2 (fromActivity + drawPreview bypass)
 * @see packages/g2-app/src/panels/concentration-drop-modal.ts (pattern exemplar)
 * @see docs/architecture/0009-layer-manager-contract.md §Amendment 1 (Strategy A single container)
 */

import { type EvenAppBridge, TextContainerUpgrade } from '@evenrealities/even_hub_sdk';
import {
  TEMPLATE_PLACEMENT_CANCEL_TYPE,
  type TemplatePlacementRequestedPayload,
} from '@evf/shared-protocol';
import { resolveContainerIdField } from '../engine/container-registry.js';
import type { OverlayPanel, R1Gesture } from '../engine/layer-types.js';
import { ZIndex } from '../engine/layer-types.js';
import type { PanelGestureBus } from '../engine/panel-gesture-bus.js';
import { getLabel, type HudLocale } from '../status-hud/i18n-budgets.js';

// WR-03: crypto.randomUUID() is available in the Even Realities App WebView (WKWebView, iOS 15+)
// and in Node 24 test environments. The `declare const` ambient declaration satisfies TypeScript
// without importing from Node built-ins, matching the pattern in concentration-drop-modal.ts:57.
// Tests stub crypto.randomUUID via vi.stubGlobal('crypto', { randomUUID: () => '<uuid>' }).
declare const crypto: { randomUUID(): string };

// ─── Constants ────────────────────────────────────────────────────────────────

/** Stable container name (Strategy A — single overlay-block container per ADR-0009 Amd 1). */
const TMPL_CONTAINER_NAME = 'overlay-block' as const;

/** Panel frame outer width (matches conc-modal's 60 chars — consistent overlay frame). */
const PANEL_WIDTH = 60;

/** Inner content width (PANEL_WIDTH minus `│ ` + ` │` = -4). */
const PANEL_INNER_WIDTH = PANEL_WIDTH - 4;

/** Grid step in scene units (1 grid square = 50px — adjustable in future phases). */
const GRID_STEP = 50;

// ─── WebSocket shape ──────────────────────────────────────────────────────────

/**
 * Minimal WebSocket send shape consumed by the panel.
 *
 * Tests inject a mock with this interface; production passes the real WebSocket.
 */
export interface TemplatePanelWebSocket {
  send(data: string): void;
}

// ─── Close handler ────────────────────────────────────────────────────────────

/** Invoked when the user confirms (tap) or cancels (double-tap). */
export type TemplatePanelCloseHandler = () => void;

// ─── Panel ────────────────────────────────────────────────────────────────────

/**
 * z=2 overlay panel — AoE template position confirmation.
 *
 * Constructed by {@link template-placement-dispatcher.ts} when a
 * `template.placement.requested` envelope arrives. The dispatcher mounts it via
 * `layerManager.bundle([{ type: 'mount', z: Z2_OVERLAY, layer: panel }])`.
 *
 * Internal position state starts at (x=0, y=0) — the player scrolls to the
 * desired location before tapping. A future plan may initialise from the actor's
 * token position.
 */
export class TemplatePlacementPanel implements OverlayPanel {
  /** Stable id — used by LayerManager + telemetry. */
  public readonly id = 'template-placement-panel';

  /** ZIndex — required by the LayerManager bundle API + tests. */
  public readonly z = ZIndex.Z2_OVERLAY;

  private readonly bridge: EvenAppBridge;
  private readonly ws: TemplatePanelWebSocket;
  private readonly gestureBus: PanelGestureBus;
  private readonly payload: TemplatePlacementRequestedPayload;
  private readonly locale: HudLocale;
  private readonly sessionId: string;
  private readonly onCloseCb: TemplatePanelCloseHandler;

  /** Current canvas X position (player-adjustable via R1 scroll — future: X axis). */
  private x = 0;

  /** Current canvas Y position (player-adjustable via R1 scroll). */
  private y = 0;

  /** Unsubscribe closure from PanelGestureBus.subscribe — null until onMount. */
  private unsubscribe: (() => void) | null = null;

  constructor(
    bridge: EvenAppBridge,
    ws: TemplatePanelWebSocket,
    gestureBus: PanelGestureBus,
    payload: TemplatePlacementRequestedPayload,
    locale: HudLocale,
    sessionId: string,
    onClose: TemplatePanelCloseHandler,
  ) {
    this.bridge = bridge;
    this.ws = ws;
    this.gestureBus = gestureBus;
    this.payload = payload;
    this.locale = locale;
    this.sessionId = sessionId;
    this.onCloseCb = onClose;
  }

  // ─── OverlayPanel lifecycle ────────────────────────────────────────────────

  /**
   * Subscribe to the gesture bus.
   *
   * LayerManager.bundle() awaits this BEFORE the rebuildPageContainer flush.
   * T-4b-01-03: subscriptions acquired here MUST be released in onUnmount.
   */
  async onMount(): Promise<void> {
    this.unsubscribe = this.gestureBus.subscribe((gesture) => this.onEvent(gesture));
  }

  /**
   * Release the gesture bus subscription (idempotent).
   *
   * T-4b-01-03 mitigation: second call is safe (null guard).
   */
  async onUnmount(): Promise<void> {
    if (this.unsubscribe !== null) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  /**
   * Handle a published R1 gesture.
   *
   * Dispatch:
   * - scroll-up   → y -= GRID_STEP; re-draw
   * - scroll-down → y += GRID_STEP; re-draw
   * - tap         → emit `tool.invoke` confirm envelope + onClose
   * - double-tap  → emit `template.placement.cancel` envelope + onClose (ADR-0012 D-3)
   */
  onEvent(gesture: R1Gesture): void {
    switch (gesture.kind) {
      case 'scroll':
        if (gesture.direction === 'up') {
          this.y -= GRID_STEP;
        } else {
          this.y += GRID_STEP;
        }
        // Trigger re-draw after position update (fire-and-forget; errors logged by bridge)
        void this.draw();
        break;

      case 'tap': {
        // Emit confirm envelope → module commits via createEmbeddedDocuments
        // WR-03: include idempotencyKey (UUID v4) required by ToolInvocationEnvelopePayloadSchema.
        // Without it, bridge-side validation rejects the envelope after CR-01 fix lands.
        const confirmEnvelope = {
          proto: 'evf-v1' as const,
          seq: 0,
          ts: Date.now(),
          type: 'tool.invoke' as const,
          session_id: this.sessionId,
          payload: {
            toolId: 'confirm-template-placement',
            idempotencyKey: crypto.randomUUID(), // WR-03: required by ToolInvocationEnvelopePayloadSchema
            args: {
              placementId: this.payload.placementId,
              templateIndex: this.payload.templateIndex,
              x: this.x,
              y: this.y,
            },
          },
        };
        this.ws.send(JSON.stringify(confirmEnvelope));
        this.onCloseCb();
        break;
      }

      case 'double-tap': {
        // ADR-0012 D-3: double-tap (= close/back) cancels the transient placement.
        // Emit cancel envelope → module discards placement context.
        const cancelEnvelope = {
          proto: 'evf-v1' as const,
          seq: 0,
          ts: Date.now(),
          type: TEMPLATE_PLACEMENT_CANCEL_TYPE,
          session_id: this.sessionId,
          payload: {
            placementId: this.payload.placementId,
          },
        };
        this.ws.send(JSON.stringify(cancelEnvelope));
        this.onCloseCb();
        break;
      }
    }
  }

  /**
   * INV-5 over-scroll boundary probe (ADR-0012 D-2).
   *
   * The template-placement panel is a single-screen transient modal with no
   * scroll offset, so it is always at its top boundary — a swipe-up here is an
   * over-scroll that the router-level dispatcher routes to the Quick Action menu.
   */
  isAtTopBoundary(): boolean {
    return true;
  }

  // ─── Layer contract ────────────────────────────────────────────────────────

  /**
   * Render the panel content via a single `bridge.textContainerUpgrade` call.
   *
   * Builds the panel layout (11-row box with crosshair position widget).
   * Called by LayerManager on mount and by onEvent (scroll) to refresh position.
   */
  async draw(): Promise<void> {
    const lines = this._buildLines();
    const payload = new TextContainerUpgrade({
      // Overlay-only name → resolveContainerId returns undefined (addressed by
      // name until the overlay-id rebuild path lands; see container-registry.ts).
      ...resolveContainerIdField(TMPL_CONTAINER_NAME),
      containerName: TMPL_CONTAINER_NAME,
      content: lines.join('\n'),
    });
    await this.bridge.textContainerUpgrade(payload);
  }

  /** Tear down — no-op (cleanup is in onUnmount). */
  destroy(): void {
    // Intentionally empty — onUnmount handles subscription cleanup.
  }

  /**
   * Container footprint — Strategy A: one text container, zero image.
   *
   * @returns `{ image: 0, text: 1 }`
   */
  getContainerCount(): { image: 0; text: 1 } {
    return { image: 0, text: 1 };
  }

  /**
   * R1 context chip hints for the status HUD chip (Phase 6 NAV-01 pattern).
   *
   * Returns localised hints showing scroll=pos, tap=confirm, and the
   * quick-action affordance label (over-scroll → Quick Action, ADR-0012 D-2).
   */
  getR1Hints(): {
    readonly tap: string;
    readonly scroll: string;
    readonly quickActionLabel: string;
  } {
    return {
      tap: getLabel('hud_r1_tmpl_tap', this.locale),
      scroll: getLabel('hud_r1_tmpl_scroll', this.locale),
      quickActionLabel: getLabel('hud_r1_tmpl_long', this.locale),
    };
  }

  // ─── Test-only accessor ────────────────────────────────────────────────────

  /**
   * Test-only: expose current position state.
   *
   * Allows unit tests to assert that scroll events correctly adjust position
   * without inspecting rendered content. Production code MUST NOT depend on this.
   */
  _getPositionForTest(): { x: number; y: number } {
    return { x: this.x, y: this.y };
  }

  // ─── Private rendering ────────────────────────────────────────────────────

  /**
   * Build the panel rows.
   *
   * Layout (10 rows):
   * ```
   * ┌─[ POSIZIONAMENTO ]────────────────────────┐
   * │  Incantesimo: <spellName>                  │
   * │  Template [1/1] ◉ circle · 20ft            │
   * │                                            │
   * │  ╔══ Posizione ═══════════════╗            │
   * │  ║  X: 000  Y: 000           ║            │
   * │  ╚═══════════════════════════╝            │
   * │                                            │
   * │   [R1] Conferma       [×2] Annulla         │
   * └────────────────────────────────────────────┘
   * ```
   *
   * The cancel affordance is double-tap (ADR-0012 D-3); the hint string text is
   * owned by the i18n slice (`tmpl_long_hint` key, retired-label naming).
   */
  private _buildLines(): string[] {
    const title = getLabel('tmpl_title', this.locale);
    const spellLabel = getLabel('tmpl_spell_label', this.locale);
    const indexLabel = getLabel('tmpl_index_label', this.locale);
    const posLabel = getLabel('tmpl_position_label', this.locale);
    const tapHint = getLabel('tmpl_tap_hint', this.locale);
    const cancelHint = getLabel('tmpl_long_hint', this.locale);

    // Top border with title
    const titleBracket = `[ ${title} ]`;
    const topInner = `─${titleBracket}${'─'.repeat(PANEL_WIDTH - 2 - 1 - titleBracket.length)}`;
    const topBorder = `┌${topInner}┐`;
    const bottomBorder = `└${'─'.repeat(PANEL_WIDTH - 2)}┘`;

    // Spell name (truncated to inner width)
    const spellName = this._truncate(this.payload.spellName, 30);
    const templateInfo = `${indexLabel} [${this.payload.templateIndex + 1}/${this.payload.total}] · ${this.payload.type} · ${this.payload.distance}ft`;

    // Position display
    const xStr = String(Math.round(this.x)).padStart(3, ' ');
    const yStr = String(Math.round(this.y)).padStart(3, ' ');
    const posLine = `X: ${xStr}  Y: ${yStr}`;

    // Button row
    const btnRow = `${tapHint.padEnd(20)}${cancelHint}`;

    const lines: string[] = [
      topBorder,
      this._innerRow(`  ${spellLabel} ${spellName}`),
      this._innerRow(`  ${this._truncate(templateInfo, PANEL_INNER_WIDTH - 2)}`),
      this._innerRow(''),
      this._innerRow(`  ${posLabel}`),
      this._innerRow(`    ${posLine}`),
      this._innerRow(''),
      this._innerRow(`  ${btnRow}`),
      this._innerRow(''),
      bottomBorder,
    ];
    return lines;
  }

  /**
   * Wrap inner content with `│ ` ... ` │` panel borders.
   *
   * Content shorter than {@link PANEL_INNER_WIDTH} (= 56) is right-padded.
   * Longer content is truncated with `…`.
   */
  private _innerRow(text: string): string {
    const cps = [...text];
    let inner: string;
    if (cps.length >= PANEL_INNER_WIDTH) {
      inner = `${cps.slice(0, PANEL_INNER_WIDTH - 1).join('')}…`;
    } else {
      inner = `${text}${' '.repeat(PANEL_INNER_WIDTH - cps.length)}`;
    }
    return `│ ${inner} │`;
  }

  /**
   * Truncate `value` to `max` code-points, appending `…` if cut.
   */
  private _truncate(value: string, max: number): string {
    const cps = [...value];
    if (cps.length <= max) {
      return value;
    }
    return `${cps.slice(0, max - 1).join('')}…`;
  }
}
