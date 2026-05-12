/**
 * @evf/foundry-module — PairModal ApplicationV2 implementation.
 *
 * The DM's onboarding entry point. Opens from Foundry Settings → Module Settings →
 * EvenFoundryVTT → "Pair a G2 device" button (registered in settings.ts).
 *
 * Implements 5 UI states (per 02-UI-SPEC.md §UI-A):
 *   - "empty"              — no devices paired yet
 *   - "active"             — valid bearer, showing QR code
 *   - "pairing-in-progress"— QR shown, awaiting WS handshake confirmation
 *   - "refresh-needed"     — valid bearer, TTL < 1h (accent countdown + Refresh CTA)
 *   - "expired"            — bearer TTL elapsed (expired banner, no QR)
 *
 * Security:
 * - QR payload: { bridge_url, token, internal_secret, world, expires } — ALL values
 *   are taken from a freshly-generated BearerEntry. Token is NEVER rendered in HTML.
 * - QR SVG is triple-mustached in the template ({{{qrSvg}}}) — trusted server-generated
 *   SVG, not user content.
 *
 * Timer behaviour:
 * - A `setInterval` at 60-second granularity updates the countdown `<time>` element.
 * - Interval is stored in `_countdownInterval` and cleared in `close()`.
 *
 * @see 02-02-PLAN.md Task 2 (PairModal specification)
 * @see 02-UI-SPEC.md §UI-A (full layout, states, revoke flow, i18n keys)
 * @see 02-CONTEXT.md D-2.02 (ApplicationV2 dialog framework), D-2.10 (opaque bearer)
 */

import QRCode from 'qrcode';
import type { BearerEntry } from './bearer-registry.js';
import { generateBearer, listBearers, revokeBearer } from './bearer-registry.js';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Modal render state discriminant. */
type ModalState = 'empty' | 'active' | 'pairing-in-progress' | 'refresh-needed' | 'expired';

/** Template context returned by getData(). */
export interface PairModalData extends Record<string, unknown> {
  state: ModalState;
  /** SVG string for the QR code; only present for active/pairing-in-progress/refresh-needed */
  qrSvg?: string;
  /** Human-readable TTL string e.g. "23h 47m"; present when state !== "empty" | "expired" */
  ttlDisplay?: string;
  /** ISO8601 expiry for <time datetime="..."> semantic element */
  expiresIso?: string;
  /** Active (non-revoked) bearer entries for the devices table */
  devices: DeviceRow[];
  /** Pre-localised string map — keys consumed by pair-modal.hbs template */
  i18n: Record<string, string>;
}

/** Single row in the paired devices table. */
export interface DeviceRow {
  token: string;
  alias: string;
  pairedDate: string;
  lastSeenRelative: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Threshold below which TTL is considered "refresh needed" (1 hour in ms). */
const REFRESH_THRESHOLD_MS = 60 * 60 * 1000;

/** Countdown update interval (60 seconds). */
const COUNTDOWN_INTERVAL_MS = 60 * 1000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Formats a millisecond duration into human-readable "Xh Ym" format.
 * If < 1 hour: shows only minutes. If < 1 minute: shows "< 1m".
 */
function formatTtl(ms: number): string {
  if (ms <= 0) return '0m';
  const totalMinutes = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  return minutes > 0 ? `${minutes}m` : '< 1m';
}

/**
 * Formats a relative "last seen" string from a unix timestamp.
 *
 * @param lastSeenAt - Unix epoch ms or null (never seen)
 * @returns Relative string: "Online", "2 min ago", "1 h ago", ">24 h ago"
 */
function formatLastSeen(lastSeenAt: number | null): string {
  if (lastSeenAt === null) return '—';
  const diffMs = Date.now() - lastSeenAt;
  const diffMinutes = Math.floor(diffMs / 60_000);
  if (diffMinutes < 2) return 'Online';
  if (diffMinutes < 60) return `${diffMinutes} min ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} h ago`;
  return '>24 h ago';
}

/**
 * Formats an ISO date string "YYYY-MM-DD" from a unix epoch ms timestamp.
 */
function formatDate(epochMs: number): string {
  return new Date(epochMs).toISOString().split('T')[0] ?? '';
}

/**
 * Builds a DeviceRow from a BearerEntry for template rendering.
 * Token value included as `token` — only rendered in `data-token-id` attribute for revoke,
 * never rendered in visible text.
 */
function toDeviceRow(entry: BearerEntry): DeviceRow {
  return {
    token: entry.token,
    alias: entry.alias,
    pairedDate: formatDate(entry.createdAt),
    lastSeenRelative: formatLastSeen(entry.lastSeenAt),
  };
}

/**
 * Builds the QR payload object per Specs §7.14.7.3 and 02-02-PLAN.md H-1 fix.
 * Includes bridge_url, token, internal_secret, world, expires (unix seconds).
 */
function buildQrPayload(
  entry: BearerEntry,
  bridgeUrl: string,
  worldId: string,
): Record<string, unknown> {
  return {
    bridge_url: bridgeUrl,
    token: entry.token,
    internal_secret: entry.internalSecret,
    world: worldId,
    expires: Math.floor(entry.expiresAt / 1000), // unix seconds
  };
}

// ─── I18N helper ─────────────────────────────────────────────────────────────

/**
 * Returns the pre-localised i18n object for the template.
 * All keys are resolved via `game.i18n.localize()` here so the template
 * uses `{{i18n.key}}` (pre-resolved string), never raw key lookup.
 */
function buildI18n(): Record<string, string> {
  const l = (key: string) => game.i18n.localize(key);
  return {
    title: l('evf.pair.modal.title'),
    scanInstruction: l('evf.pair.qr.scan_instruction'),
    refresh: l('evf.pair.qr.refresh'),
    awaiting: l('evf.pair.qr.awaiting'),
    expiredTitle: l('evf.pair.qr.expired.title'),
    expiredBody: l('evf.pair.qr.expired.body'),
    expiredCta: l('evf.pair.qr.expired.cta'),
    tableHeading: l('evf.pair.table.heading'),
    colAlias: l('evf.pair.table.col.alias'),
    colPaired: l('evf.pair.table.col.paired'),
    colLastSeen: l('evf.pair.table.col.last_seen'),
    colAction: l('evf.pair.table.col.action'),
    emptyHeading: l('evf.pair.table.empty.heading'),
    emptyBody: l('evf.pair.table.empty.body'),
    revokeButton: l('evf.pair.revoke.button'),
    revokeConfirmBody: l('evf.pair.revoke.confirm.body'),
    revokeConfirmCancel: l('evf.pair.revoke.confirm.cancel'),
    revokeConfirmProceed: l('evf.pair.revoke.confirm.proceed'),
    revokeSuccess: l('evf.pair.revoke.success'),
    revokeErrorBridge: l('evf.pair.revoke.error.bridge_unreachable'),
  };
}

// ─── PairModal ────────────────────────────────────────────────────────────────

/**
 * ApplicationV2 pair modal — DM's pairing entry point.
 *
 * Opened from Foundry Settings → Module Settings → EvenFoundryVTT →
 * "Pair a G2 device" (registered via `game.settings.registerMenu` in settings.ts).
 *
 * The modal lifecycle:
 * 1. `render(true)` — opens and calls `getData()` → builds QR SVG + state
 * 2. `_activateListeners(html)` — binds Revoke/Refresh click handlers + countdown timer
 * 3. `close()` — clears countdown interval, closes modal
 *
 * @see 02-UI-SPEC.md §UI-A for the full wireframe, states, and revoke flow.
 */
export class PairModal extends ApplicationV2 {
  private readonly _bridgeUrl: string;
  private readonly _worldId: string;
  private _countdownInterval: ReturnType<typeof setInterval> | null = null;

  /**
   * @param bridgeUrl - Bridge URL to include in the QR payload
   * @param worldId - Foundry world ID to include in the QR payload
   */
  constructor(bridgeUrl: string, worldId: string) {
    super();
    this._bridgeUrl = bridgeUrl;
    this._worldId = worldId;
  }

  /** @override */
  static override get defaultOptions(): {
    id: string;
    title: string;
    template: string;
    width: number;
    height: string | number;
    resizable: boolean;
    [key: string]: unknown;
  } {
    return {
      ...ApplicationV2.defaultOptions,
      id: 'evf-pair-modal',
      title: game.i18n.localize('evf.pair.modal.title'),
      template: 'modules/evenfoundryvtt/templates/pair-modal.hbs',
      width: 540,
      height: 'auto',
      resizable: false,
    };
  }

  /**
   * Computes the modal state from the currently active bearers.
   *
   * State priority (first match wins):
   * 1. "empty"           — no non-revoked bearers
   * 2. "expired"         — all non-revoked bearers are expired
   * 3. "refresh-needed"  — at least one non-revoked, non-expired bearer with TTL < 1h
   * 4. "active"          — at least one non-revoked, non-expired bearer with TTL ≥ 1h
   */
  private _computeState(): { state: ModalState; activeEntry?: BearerEntry } {
    const bearers = listBearers(); // already filters revoked entries

    if (bearers.length === 0) {
      return { state: 'empty' };
    }

    const now = Date.now();
    const nonExpired = bearers.filter((e) => e.expiresAt > now);

    if (nonExpired.length === 0) {
      return { state: 'expired' };
    }

    // Use the most recently created non-expired entry as the "active" entry for QR
    const active = nonExpired[0];
    if (!active) {
      return { state: 'expired' };
    }
    const ttlMs = active.expiresAt - now;

    if (ttlMs < REFRESH_THRESHOLD_MS) {
      return { state: 'refresh-needed', activeEntry: active };
    }

    return { state: 'active', activeEntry: active };
  }

  /**
   * Builds the template context for the pair modal.
   *
   * QR generation (qrcode@1.5.4): only runs for active/pairing-in-progress/refresh-needed
   * states. The SVG output is trusted (generated server-side, not from user input).
   *
   * @returns PairModalData template context
   */
  override async getData(): Promise<PairModalData> {
    const { state, activeEntry } = this._computeState();
    const devices = listBearers().map(toDeviceRow);
    const i18n = buildI18n();

    if (state === 'empty' || state === 'expired') {
      return { state, devices, i18n };
    }

    // state: active | refresh-needed | pairing-in-progress
    // biome-ignore lint/style/noNonNullAssertion: activeEntry is guaranteed for non-empty/expired states
    const entry = activeEntry!;
    const ttlMs = entry.expiresAt - Date.now();
    const ttlDisplay = formatTtl(ttlMs);
    const expiresIso = new Date(entry.expiresAt).toISOString();

    // Generate QR SVG (T-02-01: token value enters only the SVG, not the rendered HTML text)
    const payload = buildQrPayload(entry, this._bridgeUrl, this._worldId);
    const qrSvg = await QRCode.toString(JSON.stringify(payload), { type: 'svg' });

    return { state, qrSvg, ttlDisplay, expiresIso, devices, i18n };
  }

  /**
   * Binds DOM event listeners and starts the 60-second countdown timer.
   *
   * @param html - The rendered HTML element (root of the ApplicationV2 content area)
   */
  override _activateListeners(html: HTMLElement): void {
    super._activateListeners(html);

    // Revoke button handlers
    const revokeButtons = Array.from(html.querySelectorAll('[data-action="revoke"]'));
    for (const btn of revokeButtons) {
      btn.addEventListener('click', (event: Event) => this._onClickRevoke(event));
    }

    // Refresh button handler
    const refreshBtn = html.querySelector('[data-action="refresh"]');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', (event) => this._onClickRefresh(event));
    }

    // New Code button (expired state)
    const newCodeBtn = html.querySelector('[data-action="new-code"]');
    if (newCodeBtn) {
      newCodeBtn.addEventListener('click', (event) => this._onClickRefresh(event));
    }

    // Start countdown timer
    this._startCountdown(html);
  }

  /**
   * Starts the 60-second countdown interval, updating the `<time>` element in-place.
   *
   * @param html - Root HTML element to query for the time element
   */
  private _startCountdown(html: HTMLElement): void {
    this._stopCountdown();
    const timeEl = html.querySelector('time[data-countdown]');
    if (!timeEl) return;

    this._countdownInterval = setInterval(() => {
      const expiresAttr = timeEl.getAttribute('data-expires');
      if (!expiresAttr) return;
      const expiresAt = Number(expiresAttr);
      if (Number.isNaN(expiresAt)) return;
      const ttlMs = expiresAt - Date.now();
      timeEl.textContent = formatTtl(ttlMs);

      // Apply accent colour when < 1h remaining
      if (ttlMs < REFRESH_THRESHOLD_MS) {
        timeEl.classList.add('evf-ttl--urgent');
      }
    }, COUNTDOWN_INTERVAL_MS);
  }

  /**
   * Clears the countdown interval if running.
   */
  private _stopCountdown(): void {
    if (this._countdownInterval !== null) {
      clearInterval(this._countdownInterval);
      this._countdownInterval = null;
    }
  }

  /**
   * Handles click on a "Revoke" button.
   *
   * Extracts `data-token-id` from the clicked element, calls revokeBearer,
   * and re-renders the modal.
   *
   * Per 02-UI-SPEC.md §Revoke Flow: the row is replaced inline with a confirmation
   * prompt before the actual revoke executes. This handler is triggered on the
   * "Confirm Revoke" button (second click), not the initial "Revoke" click.
   *
   * @param event - DOM click event
   */
  _onClickRevoke(event: Event): void {
    event.preventDefault();
    const target = event.currentTarget as HTMLElement | null;
    const tokenId = target?.dataset?.tokenId;
    if (!tokenId) return;

    revokeBearer(tokenId);
    this.render(true);
  }

  /**
   * Handles click on "Refresh" or "New Code" button.
   *
   * Generates a new bearer (with `refresh=true` to apply 60s grace on the old token),
   * and re-renders the modal in-place. The QR SVG updates without a full modal reload.
   *
   * @param event - DOM click event
   */
  _onClickRefresh(event: Event): void {
    event.preventDefault();
    // Propagate the existing device alias so the refreshed entry keeps its label (WR-04).
    // listBearers() returns non-revoked entries; the first is the active device.
    const currentAlias = listBearers()[0]?.alias ?? '';
    // Generate new bearer with grace period (D-2.11)
    generateBearer(currentAlias, this._bridgeUrl, this._worldId, true)
      .then(() => {
        this.render(true);
      })
      .catch((err: unknown) => {
        console.error('[EVF] PairModal refresh error:', err);
      });
  }

  /**
   * Closes the modal and clears the countdown timer.
   *
   * @override
   */
  override async close(options?: { animate?: boolean }): Promise<void> {
    this._stopCountdown();
    return super.close(options);
  }
}
