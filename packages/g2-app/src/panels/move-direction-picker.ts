/**
 * MoveDirectionPicker — z=2 OverlayPanel for player move-token gesture (Plan 08-04 — ACT-01).
 *
 * Renders an 8-direction compass per CONTEXT.md §Specifics mockup:
 *
 * ```
 * ┌──────────────────────────────────────────────┐
 * │ MOVIMENTO  (rimangono 25 ft)                 │
 * │                                              │
 * │        N                                     │
 * │   NW  ▶NE                                    │
 * │ W              E                             │
 * │   SW    SE                                   │
 * │        S                                     │
 * │                                              │
 * │  [tap] commit  [×2] annulla                  │
 * └──────────────────────────────────────────────┘
 * ```
 *
 * ## Gesture dispatch
 *
 * - scroll-down → cycle direction forward (N → NE → E → … → NW → N)
 * - scroll-up   → cycle direction reverse (N → NW → W → … → NE → N)
 * - tap          → normal: emit `tool.invoke` move-token envelope + onClose.
 *                  exhausted (remainingFeet ≤ 0): no-op (MDP-06 guard).
 * - double-tap  → cancel + onClose (no emit)
 *
 * The Quick Action menu opens via over-scroll at the router level (ADR-0012) — the
 * panel never opens it itself.
 *
 * ## Delta strategy
 *
 * `computeDelta(direction, gridSizePixels)` maps 8 compass points to `{dx, dy}`
 * in canvas pixel units. One move step = one grid square = `gridSizePixels` px.
 * New position = `{ x: currentX + dx, y: currentY + dy }`.
 *
 * ## W-4 envelope invariant
 *
 * Outgoing `tool.invoke` envelope uses canonical `EnvelopeSchema` shape verbatim:
 * `proto/seq/ts/type/session_id/payload` — carrier field is `payload` (NOT `value`).
 * Inner `args` validates against `MoveTokenInputSchema` (T-08-01-01).
 *
 * ## Exhausted state (MDP-06 + MDP-13)
 *
 * When `remainingFeet ≤ 0`, tap is a no-op and a different layout is rendered:
 * the compass is replaced with a centred `Movimento esaurito` hint. Double-tap
 * still cancels to close the panel (double-tap = cancel per MDP-08).
 *
 * ## Container strategy (Strategy A — ADR-0009 Amendment 1)
 *
 * Single text container `'overlay-block'`. `getContainerCount()` returns
 * `{ image: 0, text: 1 }`. No image containers.
 *
 * ## 14-socketlib-handler invariant
 *
 * This panel registers NO new socketlib handlers. Emission is via the existing
 * `ws.send` WebSocket channel — count stays 14.
 *
 * @see .planning/phases/08-manual-action-ux/08-CONTEXT.md §Specifics (mockup)
 * @see .planning/phases/08-manual-action-ux/08-04-PLAN.md Task 3
 * @see packages/g2-app/src/panels/action-options-modal.ts (modal pattern exemplar)
 * @see packages/shared-protocol/src/tools/move-token.ts (MoveTokenInputSchema)
 */

import { type EvenAppBridge, TextContainerUpgrade } from '@evenrealities/even_hub_sdk';
import { resolveContainerIdField } from '../engine/container-registry.js';
import type { OverlayPanel, R1Gesture } from '../engine/layer-types.js';
import type { PanelGestureBus } from '../engine/panel-gesture-bus.js';
import { getLabel, type HudLocale } from '../status-hud/i18n-budgets.js';
import { parseR1HintString } from '../status-hud/r1-hint-parser.js';

// WR-03: crypto.randomUUID() is available in the Even Realities App WebView
// (Safari WKWebView on iOS 15+ / Baseline 2021). The `declare const` ambient
// declaration satisfies TypeScript without importing from Node built-ins,
// matching the pattern in concentration-drop-modal.ts:57.
// Tests stub crypto.randomUUID via vi.stubGlobal('crypto', { randomUUID: () => '<uuid>' }).
declare const crypto: { randomUUID(): string };

// ─── Constants ────────────────────────────────────────────────────────────────

/** Stable container name (Strategy A — single overlay-block container per ADR-0009 Amd 1). */
const MOVE_PICKER_CONTAINER_NAME = 'overlay-block' as const;

/**
 * Panel frame outer width (46 chars — matches CONTEXT.md mockup `┌──...──┐`).
 * Inner content = 44 chars.
 */
const PANEL_WIDTH = 46;
/** Inner content width (PANEL_WIDTH minus `│ ` + ` │` = -4). */
const PANEL_INNER_WIDTH = PANEL_WIDTH - 2; // 44

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * 8 compass directions the player can select via R1 scroll.
 *
 * Language-neutral 2-char letters per Phase 4b Plan 03 Pitfall 6 precedent
 * (same as N/NE/E/SE/S/SW/W/NW compass abbreviations used universally).
 */
export type MoveDirection = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';

/**
 * Ordered compass cycle for scroll navigation.
 *
 * scroll-down advances forward; scroll-up reverses. Wraps cyclically.
 */
const DIRECTION_ORDER: ReadonlyArray<MoveDirection> = [
  'N',
  'NE',
  'E',
  'SE',
  'S',
  'SW',
  'W',
  'NW',
] as const;

/**
 * Move request context passed from the dispatcher.
 *
 * `currentX/currentY` are absolute canvas pixel coordinates of the token's
 * current position. `gridSizePixels` is canvas pixels per grid square (default
 * 100px = 5ft in dnd5e standard grid). `remainingFeet` drives the exhausted gate.
 */
export interface MoveRequest {
  readonly actorId: string;
  readonly tokenId: string;
  readonly currentX: number;
  readonly currentY: number;
  readonly remainingFeet: number;
  readonly gridSizePixels: number;
}

/**
 * Minimal WebSocket send shape consumed by the panel.
 *
 * Tests inject a mock with this interface; production passes the real WebSocket.
 */
export interface MoveDirectionPickerWebSocket {
  send(data: string): void;
}

/** Invoked when the user confirms (tap) or cancels (double-tap). */
export type MoveDirectionPickerCloseHandler = () => void;

// ─── Pure helpers ─────────────────────────────────────────────────────────────

/**
 * Map a compass direction to a canvas-pixel delta pair.
 *
 * One move step = one grid square = `gridSizePixels` canvas units.
 *
 * Coordinate convention (Foundry canvas): x increases right, y increases DOWN.
 * N = "up" on the screen = decreasing y. S = increasing y.
 *
 * @param direction  Compass direction
 * @param gridSizePixels Canvas pixels per grid square (default 100 = 5ft/sq)
 * @returns `{ dx, dy }` pixel delta to apply to currentX / currentY
 */
export function computeDelta(
  direction: MoveDirection,
  gridSizePixels: number,
): { dx: number; dy: number } {
  const g = gridSizePixels;
  switch (direction) {
    case 'N':
      return { dx: 0, dy: -g };
    case 'NE':
      return { dx: g, dy: -g };
    case 'E':
      return { dx: g, dy: 0 };
    case 'SE':
      return { dx: g, dy: g };
    case 'S':
      return { dx: 0, dy: g };
    case 'SW':
      return { dx: -g, dy: g };
    case 'W':
      return { dx: -g, dy: 0 };
    case 'NW':
      return { dx: -g, dy: -g };
  }
}

// ─── Panel ────────────────────────────────────────────────────────────────────

/**
 * z=2 overlay panel — 8-direction move-token compass picker.
 *
 * Constructed by the move-direction dispatcher (Plan 08-05 wires boot-side)
 * when the player opens the move action surface (e.g., [M] quick action or
 * plan 08-05 boot-engine-core.ts openMoveDirectionPicker callback).
 *
 * Emits a canonical `tool.invoke` envelope (toolId: 'move-token') with absolute
 * `{token_id, x, y}` args computed from `currentX/Y + computeDelta(direction)`.
 */
export class MoveDirectionPicker implements OverlayPanel {
  /** Stable id — used by LayerManager + telemetry. */
  public readonly id = 'move-direction-picker';

  private readonly bridge: EvenAppBridge;
  private readonly ws: MoveDirectionPickerWebSocket;
  private readonly gestureBus: PanelGestureBus;
  private readonly request: MoveRequest;
  private readonly locale: HudLocale;
  private readonly sessionId: string;
  private readonly onCloseCb: MoveDirectionPickerCloseHandler;

  /** Current selected direction (default 'N'). */
  private selectedDirection: MoveDirection = 'N';

  /** Unsubscribe closure from PanelGestureBus.subscribe — null until onMount. */
  private unsubscribe: (() => void) | null = null;

  constructor(
    bridge: EvenAppBridge,
    ws: MoveDirectionPickerWebSocket,
    gestureBus: PanelGestureBus,
    request: MoveRequest,
    locale: HudLocale,
    sessionId: string,
    onClose: MoveDirectionPickerCloseHandler,
  ) {
    this.bridge = bridge;
    this.ws = ws;
    this.gestureBus = gestureBus;
    this.request = request;
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
   * - scroll-down → advance selectedDirection (forward cycle)
   * - scroll-up   → retreat selectedDirection (reverse cycle)
   * - tap          → normal: emit move-token + onClose; exhausted: no-op
   * - double-tap  → cancel + onClose (no emit)
   *
   * Quick Action opens via over-scroll at the router level (ADR-0012) — the panel
   * does not handle it.
   */
  onEvent(gesture: R1Gesture): void {
    switch (gesture.kind) {
      case 'scroll': {
        const idx = DIRECTION_ORDER.indexOf(this.selectedDirection);
        if (gesture.direction === 'down') {
          this.selectedDirection = DIRECTION_ORDER[
            (idx + 1) % DIRECTION_ORDER.length
          ] as MoveDirection;
        } else {
          this.selectedDirection = DIRECTION_ORDER[
            (idx + DIRECTION_ORDER.length - 1) % DIRECTION_ORDER.length
          ] as MoveDirection;
        }
        // Trigger re-draw after direction update
        void this.draw();
        break;
      }

      case 'tap': {
        // MDP-06: exhausted guard — no emit when remainingFeet ≤ 0
        if (this.request.remainingFeet <= 0) {
          // No-op. console.warn telemetry for movement-exhausted tap.
          // console.warn allowed per biome.jsonc noConsole allow:[error,warn]
          console.warn('[move-direction-picker] tap on exhausted movement — no-op');
          return;
        }
        // MDP-07: emit canonical tool.invoke envelope
        const { dx, dy } = computeDelta(this.selectedDirection, this.request.gridSizePixels);
        const newX = this.request.currentX + dx;
        const newY = this.request.currentY + dy;
        const envelope = {
          proto: 'evf-v1' as const,
          seq: 0,
          ts: Date.now(),
          type: 'tool.invoke' as const,
          session_id: this.sessionId,
          payload: {
            toolId: 'move-token',
            idempotencyKey: crypto.randomUUID(), // WR-03: required by ToolInvocationEnvelopePayloadSchema
            args: {
              token_id: this.request.tokenId,
              x: newX,
              y: newY,
            },
          },
        };
        this.ws.send(JSON.stringify(envelope));
        this.onCloseCb();
        break;
      }

      case 'double-tap': {
        // MDP-08: cancel without emitting
        this.onCloseCb();
        break;
      }
    }
  }

  /**
   * Whether the panel is at its top boundary (ADR-0012 D-2).
   *
   * The compass picker is a single-screen modal with no vertical scroll cursor,
   * so it is always at the top — any swipe-up is an over-scroll that the
   * router-level dispatcher routes to the Quick Action menu.
   */
  isAtTopBoundary(): boolean {
    return true;
  }

  // ─── Layer contract ────────────────────────────────────────────────────────

  /**
   * Render the panel content via a single `bridge.textContainerUpgrade` call.
   *
   * Compass layout when `remainingFeet > 0`; exhausted layout when `remainingFeet ≤ 0`.
   * Called by LayerManager on mount and by onEvent (scroll) to refresh direction.
   */
  async draw(): Promise<void> {
    const lines = this._buildLines();
    const payload = new TextContainerUpgrade({
      // Overlay-only name → resolveContainerId returns undefined (addressed by
      // name until the overlay-id rebuild path lands; see container-registry.ts).
      ...resolveContainerIdField(MOVE_PICKER_CONTAINER_NAME),
      containerName: MOVE_PICKER_CONTAINER_NAME,
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
   * R1 context chip hints from pre-authored `hud_r1_move_picker` i18n key.
   *
   * Format: `tap=commit scroll=direzione qa=annulla` (locale-aware per i18n-budgets.ts).
   */
  getR1Hints(): {
    readonly tap: string;
    readonly scroll: string;
    readonly quickActionLabel: string;
  } {
    return parseR1HintString(getLabel('hud_r1_move_picker', this.locale));
  }

  // ─── Test-only accessor ────────────────────────────────────────────────────

  /**
   * Test-only: expose current selectedDirection.
   *
   * Allows unit tests to assert scroll cycles without inspecting rendered content.
   * Production code MUST NOT depend on this.
   */
  _getDirectionForTest(): MoveDirection {
    return this.selectedDirection;
  }

  // ─── Private rendering ────────────────────────────────────────────────────

  /**
   * Build panel rows.
   *
   * Normal layout (10 rows) when `remainingFeet > 0`:
   * ```
   * ┌──────────────────────────────────────────────┐
   * │ MOVIMENTO  (rimangono 25 ft)                 │
   * │                                              │
   * │        N                                     │
   * │   NW  ▶NE                                    │
   * │ W              E                             │
   * │   SW    SE                                   │
   * │        S                                     │
   * │                                              │
   * │  [tap] commit  [×2] annulla                  │
   * └──────────────────────────────────────────────┘
   * ```
   *
   * Exhausted layout (10 rows) when `remainingFeet ≤ 0`:
   * ```
   * ┌──────────────────────────────────────────────┐
   * │ MOVIMENTO  (rimangono 0 ft)                  │
   * │                                              │
   * │                                              │
   * │        Movimento esaurito                    │
   * │                                              │
   * │                                              │
   * │                                              │
   * │                                              │
   * │  [×2] annulla                                │
   * └──────────────────────────────────────────────┘
   * ```
   */
  private _buildLines(): string[] {
    const exhausted = this.request.remainingFeet <= 0;
    const topBorder = `┌${'─'.repeat(PANEL_WIDTH - 2)}┐`;
    const bottomBorder = `└${'─'.repeat(PANEL_WIDTH - 2)}┘`;

    // Title row: MOVIMENTO  (rimangono N ft)
    const title = getLabel('move_picker_title', this.locale);
    const remaining = Math.max(0, this.request.remainingFeet);
    const remainTemplate = getLabel('move_picker_remaining_template', this.locale);
    const remainStr = remainTemplate.replace('{n}', String(remaining));
    const titleContent = `${title}  (${remainStr})`;

    if (exhausted) {
      const hint = getLabel('move_picker_exhausted_hint', this.locale);
      const cancelHint = getLabel('move_picker_cancel_hint', this.locale);
      return [
        topBorder,
        this._innerRow(` ${titleContent}`),
        this._innerRow(''),
        this._innerRow(''),
        this._innerRow(`        ${hint}`),
        this._innerRow(''),
        this._innerRow(''),
        this._innerRow(''),
        this._innerRow(''),
        this._innerRow(`  [×2] ${cancelHint}`),
        bottomBorder,
      ];
    }

    // Normal compass layout.
    // Render each compass direction; selected = prefixed with ▶, others bare.
    const d = this.selectedDirection;
    const fmt = (dir: MoveDirection): string => (d === dir ? `▶${dir}` : dir);

    const confirmHint = getLabel('move_picker_confirm_hint', this.locale);
    const cancelHint = getLabel('move_picker_cancel_hint', this.locale);

    return [
      topBorder,
      this._innerRow(` ${titleContent}`),
      this._innerRow(''),
      this._innerRow(`        ${fmt('N')}`),
      this._innerRow(`   ${fmt('NW')}  ${fmt('NE')}`),
      this._innerRow(` ${fmt('W')}              ${fmt('E')}`),
      this._innerRow(`   ${fmt('SW')}    ${fmt('SE')}`),
      this._innerRow(`        ${fmt('S')}`),
      this._innerRow(''),
      this._innerRow(`  [tap] ${confirmHint}  [×2] ${cancelHint}`),
      bottomBorder,
    ];
  }

  /**
   * Wrap inner content with `│ ` ... ` │` panel borders (right-padded to PANEL_INNER_WIDTH).
   *
   * Content shorter than {@link PANEL_INNER_WIDTH} is right-padded.
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
    return `│${inner}│`;
  }
}
