/**
 * ReactionPromptPanel — z=2 overlay panel for ACT-04 reaction execution (Plan 13-02).
 *
 * Implements {@link ../engine/layer-types.js#OverlayPanel} verbatim, mirroring
 * {@link ./concentration-drop-modal.js#ConcentrationDropModalPanel} structure.
 *
 * Mounted by {@link ./reaction-prompt-dispatcher.js#attachReactionPromptHandler} after
 * a 500ms debounce (D-13-04). The player sees:
 *
 * ```
 * ┌─[ REAZIONE: Shield disponibile ]──────────────────────────┐
 * │                                                            │
 * │  Goblin Boss attacca! Usa Shield?                          │
 * │                                                            │
 * │  [Y] Lancia Shield (-1 reaz)                               │
 * │  [N] Annulla                                               │
 * │                                                            │
 * └────────────────────────────────────────────────────────────┘
 * ```
 *
 * **Gesture dispatch (ACT-04):**
 * - `tap`        → emit `tool.invoke` via ws.send + call onClose
 * - `double-tap` → call onClose without emission (cancel)
 * - other        → ignored (panel stays mounted)
 *
 * **Envelope kind → tool mapping:**
 * - `shield`             → `cast-shield` (slot_level=1 fixed, no upcast)
 * - `counterspell`       → `cast-counterspell` (slot_level=3 default, target_caster_id=sourceName)
 * - `opportunity-attack` → `opportunity-attack` (item_id=playerWeaponId, target_id=payload.sourceName)
 *
 * **Fail-safe (RPP-07):** if playerActorId is null, no envelope is sent; onClose is called.
 * The dispatcher responsible for constructing this panel should check actorId availability
 * before mounting — but defensively the panel never crashes.
 *
 * **Container strategy (Strategy A — ADR-0009 Amendment 1):**
 * Single text container `'overlay-block'`, 12 rows, 60 cp wide.
 *
 * **W-13 regression guard:** the emitted tool.invoke envelope uses the canonical
 * {@link @evf/shared-protocol#EnvelopeSchema} shape (proto/seq/ts/type/session_id/payload).
 * RPP-12 round-trip test verifies this for all 3 kinds.
 *
 * **Single-workflow-origin discipline (ADR-0011):** this file emits the tool.invoke
 * envelope; the write path is executed in foundry-module/write-path/handlers/. g2-app
 * NEVER calls activity.use() directly. CI Gate 8 enforces this.
 *
 * @see packages/g2-app/src/panels/concentration-drop-modal.ts (structure reference)
 * @see packages/g2-app/src/panels/reaction-prompt-dispatcher.ts (lifecycle owner)
 * @see .planning/phases/13-v2-stretch/13-02-PLAN.md Task 1
 */

import { type EvenAppBridge, TextContainerUpgrade } from '@evenrealities/even_hub_sdk';
import type { ReactionAvailablePayload } from '@evf/shared-protocol';
import type { OverlayPanel, R1Gesture } from '../engine/layer-types.js';
import type { PanelGestureBus } from '../engine/panel-gesture-bus.js';
import { getLabel, type HudLocale } from '../status-hud/i18n-budgets.js';
import type { Toast } from '../status-hud/toast-types.js';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Stable text-container name (single-container Strategy A). */
export const REACTION_PROMPT_CONTAINER_NAME = 'overlay-block' as const;

/** Panel frame outer width (60 chars — same as conc modal). */
const MODAL_WIDTH = 60;

/** Inner content width (MODAL_WIDTH − 4 for `│ ` + ` │`). */
const MODAL_INNER_WIDTH = MODAL_WIDTH - 4;

/** Max code-points for the sourceName field in the subject line. */
const SOURCE_NAME_BUDGET = 30;

// ─── Types ────────────────────────────────────────────────────────────────────

/** Minimal WebSocket send interface (matches conc modal pattern). */
export interface ReactionPanelWebSocket {
  send(data: string): void;
}

/** onClose callback — called after Y confirm OR N cancel. */
export type ReactionPanelCloseHandler = () => void;

// ─── Panel implementation ─────────────────────────────────────────────────────

/**
 * z=2 overlay panel — reaction prompt for ACT-04 (Shield / Counterspell / Opportunity Attack).
 *
 * Constructed by {@link ./reaction-prompt-dispatcher.js#attachReactionPromptHandler}
 * after the 500ms debounce fires. The dispatcher owns the mount lifecycle;
 * the panel's `onClose` callback issues the destroy bundle.
 */
export class ReactionPromptPanel implements OverlayPanel {
  /** Stable id used by LayerManager + telemetry. */
  public readonly id = 'reaction-prompt';

  private readonly bridge: EvenAppBridge;
  private readonly ws: ReactionPanelWebSocket;
  private readonly gestureBus: PanelGestureBus;
  private readonly payload: ReactionAvailablePayload;
  private readonly locale: HudLocale;
  private readonly sessionId: string;
  /** Player actor ID — null if unavailable (fail-safe path). */
  private readonly playerActorId: string | null;
  /** Player's primary weapon item ID — null if unavailable (OA fallback). */
  private readonly playerWeaponId: string | null;
  private readonly onCloseCb: ReactionPanelCloseHandler;
  /** Optional toast queue for error / timeout notifications. */
  private readonly onTimeoutToast: ((toast: Toast) => void) | null | undefined;

  /** Unsubscribe closure from PanelGestureBus.subscribe; set in onMount, cleared in onUnmount. */
  private unsubscribe: (() => void) | null = null;

  /**
   * Construct the reaction prompt panel.
   *
   * @param bridge         Even Hub bridge for textContainerUpgrade render.
   * @param ws             WebSocket-like send sink for outgoing tool.invoke envelope.
   * @param gestureBus     In-process gesture bus — subscribed in onMount.
   * @param payload        Parsed ReactionAvailablePayload from the inbound WS envelope.
   * @param locale         Active HUD locale — drives label lookup.
   * @param sessionId      Active WS session UUID — threaded into outgoing envelope.
   * @param playerActorId  Player's Foundry actor ID. Null = no envelope emitted on tap.
   * @param playerWeaponId Player's primary weapon item ID. Used for opportunity-attack.
   * @param onClose        Called after Y confirm or N cancel.
   * @param onTimeoutToast Optional: called with an error toast if emit is impossible.
   */
  constructor(
    bridge: EvenAppBridge,
    ws: ReactionPanelWebSocket,
    gestureBus: PanelGestureBus,
    payload: ReactionAvailablePayload,
    locale: HudLocale,
    sessionId: string,
    playerActorId: string | null,
    playerWeaponId: string | null,
    onClose: ReactionPanelCloseHandler,
    onTimeoutToast?: ((toast: Toast) => void) | null,
  ) {
    this.bridge = bridge;
    this.ws = ws;
    this.gestureBus = gestureBus;
    this.payload = payload;
    this.locale = locale;
    this.sessionId = sessionId;
    this.playerActorId = playerActorId;
    this.playerWeaponId = playerWeaponId;
    this.onCloseCb = onClose;
    this.onTimeoutToast = onTimeoutToast ?? null;
  }

  /**
   * Render the 12-row panel via a single `bridge.textContainerUpgrade` call.
   *
   * Layout (60 cp wide):
   * ```
   * ┌─[ REAZIONE: Shield ]───────────────────────────────────┐
   * │                                                        │
   * │  <subject line>                                        │
   * │                                                        │
   * │  [Y] Lancia Shield (-1 reaz)                           │
   * │  [N] Annulla                                           │
   * │                                                        │
   * │                                                        │
   * │                                                        │
   * │                                                        │
   * │                                                        │
   * └────────────────────────────────────────────────────────┘
   * ```
   */
  async draw(): Promise<void> {
    const lines = this._buildLines();
    const payload = new TextContainerUpgrade({
      containerName: REACTION_PROMPT_CONTAINER_NAME,
      content: lines.join('\n'),
    });
    await this.bridge.textContainerUpgrade(payload);
  }

  /** Tear down — no-op (bus unsubscribe is in onUnmount per LayerManager contract). */
  destroy(): void {
    // Intentionally empty — Strategy A single-container needs no per-container cleanup.
  }

  /** Lifecycle: subscribe to gesture bus. */
  async onMount(): Promise<void> {
    this.unsubscribe = this.gestureBus.subscribe((gesture) => this.onEvent(gesture));
  }

  /**
   * Lifecycle: unsubscribe from gesture bus.
   *
   * Idempotent — the null guard makes a second call safe (T-4b-01-03 pattern).
   */
  async onUnmount(): Promise<void> {
    if (this.unsubscribe !== null) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  /**
   * Handle an R1 gesture from the gesture bus.
   *
   * - `tap`        → emit tool.invoke + onClose
   * - `double-tap` → onClose only (cancel)
   * - other        → ignored
   */
  onEvent(gesture: R1Gesture): void {
    if (gesture.kind === 'tap') {
      this._handleConfirm();
    } else if (gesture.kind === 'double-tap') {
      this.onCloseCb();
    }
    // scroll, long-press → panel stays mounted
  }

  /**
   * Strategy A container footprint — one text container, zero image containers.
   *
   * The `'overlay-block'` text container holds the 12-row newline-joined content.
   */
  getContainerCount(): { image: 0; text: 1 } {
    return { image: 0, text: 1 };
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  /**
   * Emit the tool.invoke envelope on [Y] tap.
   *
   * Fail-safe: if playerActorId is null, do NOT emit — call onClose and
   * optionally enqueue an error toast (RPP-07 defensive behavior).
   */
  private _handleConfirm(): void {
    if (this.playerActorId === null || this.playerActorId.length === 0) {
      // RPP-07: no actor — cannot emit; close silently (fail-safe)
      if (this.onTimeoutToast !== null && this.onTimeoutToast !== undefined) {
        this.onTimeoutToast({
          id: `reaction-no-actor-${Date.now()}`,
          severity: 'error',
          message: 'ERR: reaction no actor',
          emittedAt: Date.now(),
        });
      }
      this.onCloseCb();
      return;
    }

    const toolPayload = this._buildToolPayload();
    const envelope = {
      proto: 'evf-v1' as const,
      seq: 0,
      ts: Date.now(),
      type: 'tool.invoke' as const,
      session_id: this.sessionId,
      payload: toolPayload,
    };
    this.ws.send(JSON.stringify(envelope));
    this.onCloseCb();
  }

  /**
   * Build the tool-specific payload based on reaction kind.
   *
   * - shield             → cast-shield (slot_level=1)
   * - counterspell       → cast-counterspell (slot_level=3, target_caster_id=sourceName)
   * - opportunity-attack → opportunity-attack (item_id=playerWeaponId, target_id=sourceName)
   */
  private _buildToolPayload(): Record<string, unknown> {
    const actorId = this.playerActorId!; // null guard done before call
    switch (this.payload.kind) {
      case 'shield':
        return {
          toolId: 'cast-shield' as const,
          idempotencyKey: this._uuid(),
          args: {
            actor_id: actorId,
            slot_level: 1,
          },
        };

      case 'counterspell':
        return {
          toolId: 'cast-counterspell' as const,
          idempotencyKey: this._uuid(),
          args: {
            actor_id: actorId,
            slot_level: 3,
            // Phase 13 MVP: use sourceName as target_caster_id approximation
            // V2 will resolve via game.actors lookup (post-milestone)
            target_caster_id: this.payload.sourceName || '<unknown>',
          },
        };

      case 'opportunity-attack':
        return {
          toolId: 'opportunity-attack' as const,
          idempotencyKey: this._uuid(),
          args: {
            actor_id: actorId,
            // item_id defaults to playerWeaponId; '<unknown>' sentinel if unavailable
            item_id: this.playerWeaponId ?? '<unknown>',
            // target_id: use sourceName as deterministic target approximation
            target_id: this.payload.sourceName || '<unknown>',
          },
        };
    }
  }

  /**
   * Build the 12 panel rows (pure function over payload + locale).
   *
   * Row layout:
   *   0: top border with title bracket `[ <TITLE>: <kind> ]`
   *   1: blank
   *   2: subject line (sourceName + subject template)
   *   3: blank
   *   4: Y button row
   *   5: N button row
   *   6..10: blank
   *   11: bottom border
   */
  private _buildLines(): string[] {
    const title = getLabel('reaction_prompt_title', this.locale);
    const kindLabel = this._kindLabel();
    const titleBracket = `[ ${title}: ${kindLabel} ]`;
    const topInner = `─${titleBracket}${'─'.repeat(Math.max(0, MODAL_WIDTH - 2 - 1 - [...titleBracket].length))}`;
    const topBorder = `┌${topInner}┐`;
    const bottomBorder = `└${'─'.repeat(MODAL_WIDTH - 2)}┘`;

    const subjectTemplate = getLabel(this._subjectKey(), this.locale);
    const truncatedSource = this._truncate(this.payload.sourceName, SOURCE_NAME_BUDGET);
    const subject = subjectTemplate.replace('{actor}', truncatedSource);

    const yButton = getLabel(this._yButtonKey(), this.locale);
    const nButton = getLabel('reaction_prompt_n_cancel', this.locale);

    return [
      topBorder,
      this._innerRow(''),
      this._innerRow(`  ${subject}`),
      this._innerRow(''),
      this._innerRow(`  ${yButton}`),
      this._innerRow(`  ${nButton}`),
      this._innerRow(''),
      this._innerRow(''),
      this._innerRow(''),
      this._innerRow(''),
      this._innerRow(''),
      bottomBorder,
    ];
  }

  /** Localized kind label for the title bracket. */
  private _kindLabel(): string {
    switch (this.payload.kind) {
      case 'shield':
        return this.locale === 'it' ? 'Shield' : 'Shield';
      case 'counterspell':
        return this.locale === 'it' ? 'Contromagia' : 'Counterspell';
      case 'opportunity-attack':
        return this.locale === 'it' ? 'Att. Opportunità' : 'Opp. Attack';
    }
  }

  /** i18n key for the subject line template. */
  private _subjectKey(): Parameters<typeof getLabel>[0] {
    switch (this.payload.kind) {
      case 'shield':
        return 'reaction_prompt_subject_shield';
      case 'counterspell':
        return 'reaction_prompt_subject_counterspell';
      case 'opportunity-attack':
        return 'reaction_prompt_subject_opp_attack';
    }
  }

  /** i18n key for the Y-button row. */
  private _yButtonKey(): Parameters<typeof getLabel>[0] {
    switch (this.payload.kind) {
      case 'shield':
        return 'reaction_prompt_y_shield';
      case 'counterspell':
        return 'reaction_prompt_y_counterspell';
      case 'opportunity-attack':
        return 'reaction_prompt_y_opp_attack';
    }
  }

  /**
   * Wrap inner content with the `│ ` ... ` │` panel side borders.
   * Right-pads to MODAL_INNER_WIDTH (56 cp); truncates if longer.
   * Returns a row of exactly MODAL_WIDTH (60) visible code-points.
   */
  private _innerRow(text: string): string {
    const cps = [...text];
    let inner: string;
    if (cps.length >= MODAL_INNER_WIDTH) {
      inner = `${cps.slice(0, MODAL_INNER_WIDTH - 1).join('')}…`;
    } else {
      inner = `${text}${' '.repeat(MODAL_INNER_WIDTH - cps.length)}`;
    }
    return `│ ${inner} │`;
  }

  /**
   * Truncate `value` to `max` code-points, appending `…` if cut.
   * Mirrors StatusHudRenderer.truncateField (INV-1 width-budget rule).
   */
  private _truncate(value: string, max: number): string {
    const cps = [...value];
    if (cps.length <= max) return value;
    return `${cps.slice(0, max - 1).join('')}…`;
  }

  /**
   * Generate a random UUID v4 string for idempotencyKey.
   *
   * Uses `crypto.randomUUID()` (available in WKWebView — Baseline 2021).
   * Tests stub via `vi.stubGlobal('crypto', { randomUUID: () => '...' })`.
   */
  private _uuid(): string {
    // biome-ignore lint/suspicious/noExplicitAny: crypto global not typed in happy-dom
    return (globalThis as unknown as { crypto: { randomUUID(): string } }).crypto.randomUUID();
  }
}
