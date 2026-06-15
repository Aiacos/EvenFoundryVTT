/**
 * @evf/foundry-module — PairModal ApplicationV2 implementation.
 *
 * The DM's onboarding entry point. Opens from Foundry Settings → Module Settings →
 * EvenFoundryVTT → "Pair a G2 device" button (registered in settings.ts).
 *
 * Implements 5 UI states (per 02-UI-SPEC.md §UI-A):
 *   - "empty"              — no devices paired yet
 *   - "active"             — valid bearer, showing copyable bridge URL + token
 *   - "pairing-in-progress"— credentials shown, awaiting WS handshake confirmation
 *   - "refresh-needed"     — valid bearer, TTL < 1h (accent countdown + Refresh CTA)
 *   - "expired"            — bearer TTL elapsed (expired banner, no credentials)
 *
 * Pairing model (post-GEST/INV-2 correction, ADR-0005 §OQ-INV2-4 resolved):
 * - The Even Hub platform exposes NO camera / QR-scan API to apps (canonical:
 *   hub.evenrealities.com/docs/guides/device-apis — "no camera (there is none)"), and the
 *   app runs in the phone WebView. A QR therefore cannot be scanned by the Even Realities
 *   app. The only viable token transfer is COPY (here) + PASTE (in the g2-app wizard step 2).
 * - The user installs the EVF app via Even Hub (dev: `evenhub qr` loads the plugin-host URL
 *   into the Even app; prod: `.ehpk` → portal review → install from the Even Hub store), then
 *   opens it → wizard → enters the bridge URL + pastes the token shown here → picks a character.
 *
 * Security:
 * - The bridge URL and bearer token are rendered into the DOM so the DM can copy them. The
 *   token is masked by default (dots) and only revealed on explicit user action ("Reveal").
 *   This is an intentional, scoped relaxation of the previous "token is NEVER rendered" rule:
 *   without a readable/copyable token, pairing is impossible on real hardware. The token is
 *   never logged and never leaves the local DM browser except via the user's clipboard.
 * - `internal_secret` is NOT rendered or copyable here — it is provisioned to the bridge by
 *   the bearer registry, not handed to the player.
 *
 * Timer behaviour:
 * - A `setInterval` at 60-second granularity updates the countdown `<time>` element.
 * - Interval is stored in `_countdownInterval` and cleared in `close()`.
 *
 * Template boolean flags:
 * - Foundry VTT does not register an `eq` Handlebars helper. All state comparisons are
 *   resolved in `_prepareContext` and exposed as boolean flags (`isEmpty`, `isExpired`,
 *   `isRefreshNeeded`, `isPairing`, `showCredentials`) so the template uses `{{#if flag}}` only.
 *
 * @see 02-02-PLAN.md Task 2 (PairModal specification)
 * @see 02-UI-SPEC.md §UI-A (full layout, states, revoke flow, i18n keys)
 * @see 02-CONTEXT.md D-2.02 (ApplicationV2 dialog framework), D-2.10 (opaque bearer)
 */

import { MODULE_ID } from '../module.js';
import type { BearerEntry } from './bearer-registry.js';
import { generateBearer, listBearers, revokeBearer } from './bearer-registry.js';

// Foundry v13+: ApplicationV2 + HandlebarsApplicationMixin live under foundry.applications.api.
// ApplicationV2 is abstract about rendering — a renderable subclass MUST provide `_renderHTML`/
// `_replaceHTML`, which HandlebarsApplicationMixin supplies (it renders `static PARTS` templates).
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

// ─── Types ────────────────────────────────────────────────────────────────────

/** Modal render state discriminant. */
type ModalState = 'empty' | 'active' | 'pairing-in-progress' | 'refresh-needed' | 'expired';

/** Template context returned by _prepareContext(). */
export interface PairModalData extends Record<string, unknown> {
  state: ModalState;
  /** true when state === "empty"; used in template instead of `eq` helper */
  isEmpty: boolean;
  /** true when state === "expired"; used in template instead of `eq` helper */
  isExpired: boolean;
  /** true when state === "refresh-needed"; used in template instead of `eq` helper */
  isRefreshNeeded: boolean;
  /** true when state === "pairing-in-progress"; used in template instead of `eq` helper */
  isPairing: boolean;
  /** true when copyable credentials should be shown (active | pairing-in-progress | refresh-needed) */
  showCredentials: boolean;
  /** Bridge URL to paste into the wizard; present when showCredentials is true */
  bridgeUrl?: string;
  /** Bearer token to paste into the wizard; present when showCredentials is true */
  token?: string;
  /** Human-readable TTL string e.g. "23h 47m"; present when showCredentials is true */
  ttlDisplay?: string;
  /** ISO8601 expiry for <time datetime="..."> semantic element */
  expiresIso?: string;
  /** Unix epoch milliseconds for data-expires attribute (countdown JS reads this) */
  expiresAtMs?: number;
  /** Active (non-revoked) bearer entries for the devices table */
  devices: DeviceRow[];
  /**
   * Foundry users selectable in the pairing form (ADR-0014). The DM picks which
   * Foundry `User` a device represents; the selected user's owned-actor set
   * becomes the bearer's authorization scope. `selected` is precomputed here
   * (Foundry registers no `eq` Handlebars helper — the template uses the boolean).
   */
  users: UserOption[];
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

/**
 * Single option in the pairing user selector (ADR-0014).
 *
 * `selected` is precomputed in `_prepareContext` (default: first non-GM player,
 * else first user) so the template renders `<option ... {{#if selected}}selected{{/if}}>`
 * without an `eq` helper.
 */
export interface UserOption {
  id: string;
  name: string;
  selected: boolean;
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
 * Reads the saved bridge URL from the module's settings store, coercing any non-string
 * (corrupted / unexpected / unset) value to an empty string so it never leaks `undefined`
 * into the DOM. Mirrors BridgeConfigModal.readStringSetting('bridgeUrl').
 */
function readBridgeUrl(): string {
  const value = game.settings.get(MODULE_ID, 'bridgeUrl');
  return typeof value === 'string' ? value : '';
}

/**
 * Reads the current Foundry world ID, coercing to an empty string when unavailable.
 * The world ID is provisioned to the bridge alongside the bearer (D-2.10).
 */
function readWorldId(): string {
  const id = game.world?.id;
  return typeof id === 'string' ? id : '';
}

/**
 * Builds the pairing user-selector options from `game.users` (ADR-0014).
 *
 * Default selection (precomputed `selected` flag — no `eq` Handlebars helper):
 * the first non-GM player, else the first user, else none. The DM may override
 * the selection in the form. Returns `[]` defensively when `game.users` is
 * unavailable (the form then omits the selector and pairing falls back to no
 * user — fail-closed at validate time).
 *
 * @returns Ordered list of `{ id, name, selected }` options.
 */
function buildUserOptions(): UserOption[] {
  const users = game.users?.contents;
  if (!Array.isArray(users) || users.length === 0) {
    return [];
  }

  // Default to the first non-GM player; fall back to the first user.
  const firstPlayer = users.find((u) => u.isGM === false);
  const defaultUser = firstPlayer ?? users[0];
  const defaultId = defaultUser?.id;

  return users.map((u) => ({
    id: u.id,
    name: u.name,
    selected: u.id === defaultId,
  }));
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

// ─── I18N helper ─────────────────────────────────────────────────────────────

/**
 * Returns the pre-localised i18n object for the template.
 * All keys are resolved via `game.i18n.localize()` here so the template
 * uses `{{i18n.key}}` (pre-resolved string), never raw key lookup.
 *
 * Keys provided:
 * - title, refresh, awaiting — credentials region
 * - copyInstruction — tells the DM to paste these into the EVF app wizard on the phone
 * - copyBridgeUrl, copyToken, copyReveal, copyHide, copyCopied — copy/reveal UX
 * - expiresIn — countdown label (maps to evf.pair.qr.expires_in)
 * - expiredTitle, expiredBody, expiredCta — expired banner
 * - tableHeading, colAlias, colPaired, colLastSeen, colAction — devices table header
 * - emptyHeading, emptyBody — empty state copy
 * - revokeButton, revokeConfirmBody, revokeConfirmCancel, revokeConfirmProceed — revoke flow
 * - revokeSuccess, revokeErrorBridge — revoke feedback
 * - close — footer close button
 */
function buildI18n(): Record<string, string> {
  const l = (key: string) => game.i18n.localize(key);
  return {
    title: l('evf.pair.modal.title'),
    copyInstruction: l('evf.pair.copy.instruction'),
    copyBridgeUrl: l('evf.pair.copy.bridge_url'),
    copyToken: l('evf.pair.copy.token'),
    copyReveal: l('evf.pair.copy.reveal'),
    copyHide: l('evf.pair.copy.hide'),
    copyButton: l('evf.pair.copy.copy'),
    copyCopied: l('evf.pair.copy.copied'),
    userSelectLabel: l('evf.pair.user.select_label'),
    refresh: l('evf.pair.qr.refresh'),
    awaiting: l('evf.pair.qr.awaiting'),
    expiresIn: l('evf.pair.qr.expires_in'),
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
    close: l('evf.pair.modal.close'),
  };
}

// ─── PairModal ────────────────────────────────────────────────────────────────

/**
 * ApplicationV2 pair modal — DM's pairing entry point.
 *
 * Opened from Foundry Settings → Module Settings → EvenFoundryVTT →
 * "Pair a G2 device" (registered via `game.settings.registerMenu` in settings.ts).
 *
 * Construction: `registerMenu` instantiates the class with `new type()` (NO args), so the
 * modal takes no constructor parameters. The bridge URL is read from the `bridgeUrl` world
 * setting and the world ID from `game.world.id` at render time (mirrors BridgeConfigModal).
 *
 * The modal lifecycle:
 * 1. `render(true)` — opens and calls `_prepareContext()` → builds copyable credentials + state
 * 2. `_onRender(context, options)` — binds Revoke/Refresh/NewCode/Reveal/Copy handlers + countdown
 * 3. `close()` — clears countdown interval, closes modal
 *
 * @see 02-UI-SPEC.md §UI-A for the full wireframe, states, and revoke flow.
 */
export class PairModal extends HandlebarsApplicationMixin(ApplicationV2) {
  private _countdownInterval: ReturnType<typeof setInterval> | null = null;

  /** ApplicationV2 window/position config (replaces the v1 `defaultOptions` getter). */
  static override DEFAULT_OPTIONS = {
    id: 'evf-pair-modal',
    classes: ['evf-pair-modal'],
    position: { width: 540, height: 'auto' as const },
    // ApplicationV2 localises `window.title` automatically when it is an i18n key.
    window: { title: 'evf.pair.modal.title', resizable: false },
  };

  /** HandlebarsApplicationMixin renders these template parts (supplies _renderHTML/_replaceHTML). */
  static override PARTS = {
    main: { template: 'modules/evenfoundryvtt/templates/pair-modal.hbs' },
  };

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

    // Use the most recently created non-expired entry as the "active" entry for credentials
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
   * All state comparisons are resolved here as boolean flags to avoid the use of
   * the `eq` Handlebars helper, which Foundry VTT does not register by default.
   *
   * For active/refresh-needed/pairing-in-progress states the bridge URL and bearer token
   * are placed in the context so the template can render them as copyable fields (the token
   * masked by default; see the security note in the file header).
   *
   * @returns PairModalData template context
   */
  override async _prepareContext(_options: unknown): Promise<PairModalData> {
    const { state, activeEntry } = this._computeState();
    const devices = listBearers().map(toDeviceRow);
    // ADR-0014: precompute the user-selector options (with default selected flag)
    // here so the template needs no `eq` helper.
    const users = buildUserOptions();
    const i18n = buildI18n();

    const isEmpty = state === 'empty';
    const isExpired = state === 'expired';
    const isRefreshNeeded = state === 'refresh-needed';
    const isPairing = state === 'pairing-in-progress';
    const showCredentials = !isEmpty && !isExpired;

    if (isEmpty || isExpired) {
      return {
        state,
        isEmpty,
        isExpired,
        isRefreshNeeded,
        isPairing,
        showCredentials,
        devices,
        users,
        i18n,
      };
    }

    // state: active | refresh-needed | pairing-in-progress
    // biome-ignore lint/style/noNonNullAssertion: activeEntry is guaranteed for non-empty/expired states
    const entry = activeEntry!;
    const ttlMs = entry.expiresAt - Date.now();
    const ttlDisplay = formatTtl(ttlMs);
    const expiresIso = new Date(entry.expiresAt).toISOString();
    const expiresAtMs = entry.expiresAt;

    return {
      state,
      isEmpty,
      isExpired,
      isRefreshNeeded,
      isPairing,
      showCredentials,
      bridgeUrl: readBridgeUrl(),
      token: entry.token,
      ttlDisplay,
      expiresIso,
      expiresAtMs,
      devices,
      users,
      i18n,
    };
  }

  /**
   * Binds DOM event listeners and starts the 60-second countdown timer.
   *
   * @param context - Prepared render context (unused here)
   * @param options - Render options (unused here)
   */
  override _onRender(context: unknown, options: unknown): void {
    super._onRender(context as never, options as never);

    // `this.element` is the root content element after an ApplicationV2 render.
    const html = this.element;

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

    // New Code button (expired state or empty state)
    const newCodeBtn = html.querySelector('[data-action="new-code"]');
    if (newCodeBtn) {
      newCodeBtn.addEventListener('click', (event) => this._onClickRefresh(event));
    }

    // Reveal/hide token handlers
    const revealButtons = Array.from(html.querySelectorAll('[data-action="reveal-token"]'));
    for (const btn of revealButtons) {
      btn.addEventListener('click', (event) => this._onClickReveal(event));
    }

    // Copy handlers (bridge URL + token)
    const copyButtons = Array.from(html.querySelectorAll('[data-action="copy"]'));
    for (const btn of copyButtons) {
      btn.addEventListener('click', (event) => this._onClickCopy(event));
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

    // Await the (async) revoke so the re-render observes the revocation
    // (read-after-write). Fire-and-forget at the DOM-handler boundary.
    revokeBearer(tokenId)
      .then(() => {
        void this.render({ force: true });
      })
      .catch((err: unknown) => {
        console.error('[EVF] PairModal revoke error:', err);
      });
  }

  /**
   * Reads the currently-selected Foundry user id from the pairing form's
   * `<select data-user-select>` (ADR-0014).
   *
   * Falls back to the default selection (first non-GM player, else first user)
   * when the selector is absent or has no value — mirrors {@link buildUserOptions}
   * so a refresh that occurs before any explicit DM choice still binds to a sane
   * default. Returns `''` when no users exist at all (validate-time fail-closed).
   *
   * @returns The selected Foundry user id, or the default, or `''`.
   */
  private _readSelectedUserId(): string {
    const select = this.element.querySelector<HTMLSelectElement>('[data-user-select]');
    const fromDom = select?.value;
    if (typeof fromDom === 'string' && fromDom.length > 0) {
      return fromDom;
    }
    // Fall back to the precomputed default (first non-GM player else first user).
    const defaultOption = buildUserOptions().find((u) => u.selected);
    return defaultOption?.id ?? '';
  }

  /**
   * Handles click on "Refresh", "New Code" (expired state), or first-code button (empty state).
   *
   * Generates a new bearer (with `refresh=true` to apply 60s grace on the old token),
   * and re-renders the modal in-place. The credentials update without a full modal reload.
   *
   * ADR-0014: binds the new bearer to the Foundry user selected in the form
   * (`_readSelectedUserId`). The bearer's authorized actor set is derived live
   * from that user's Foundry ownership at validate time.
   *
   * @param event - DOM click event
   */
  _onClickRefresh(event: Event): void {
    event.preventDefault();
    // Propagate the existing device alias so the refreshed entry keeps its label (WR-04).
    // listBearers() returns non-revoked entries; the first is the active device.
    const currentAlias = listBearers()[0]?.alias ?? '';
    // ADR-0014: bind to the DM-selected Foundry user (default: first non-GM player).
    const selectedUserId = this._readSelectedUserId();
    // Generate new bearer with grace period (D-2.11). Bridge URL + world ID are read from
    // settings / game.world at call time (no-arg construction path; see class doc).
    generateBearer(currentAlias, readBridgeUrl(), readWorldId(), selectedUserId, true)
      .then(() => {
        void this.render({ force: true });
      })
      .catch((err: unknown) => {
        console.error('[EVF] PairModal refresh error:', err);
      });
  }

  /**
   * Toggles the token field between masked (dots) and revealed (plain text).
   *
   * The masked element (`[data-token-mask]`) and the plain element (`[data-token-plain]`)
   * both exist in the DOM; this handler flips their visibility and swaps the button label
   * between "Reveal" and "Hide".
   *
   * @param event - DOM click event
   */
  _onClickReveal(event: Event): void {
    event.preventDefault();
    const html = this.element;
    const mask = html.querySelector<HTMLElement>('[data-token-mask]');
    const plain = html.querySelector<HTMLElement>('[data-token-plain]');
    const btn = event.currentTarget as HTMLElement | null;
    if (!mask || !plain || !btn) return;

    const i18n = buildI18n();
    const revealed = plain.classList.contains('evf-hidden') === false;
    if (revealed) {
      plain.classList.add('evf-hidden');
      mask.classList.remove('evf-hidden');
      btn.textContent = i18n.copyReveal ?? 'Reveal';
    } else {
      plain.classList.remove('evf-hidden');
      mask.classList.add('evf-hidden');
      btn.textContent = i18n.copyHide ?? 'Hide';
    }
  }

  /**
   * Copies the value from `data-copy-value` on the clicked element to the clipboard and
   * briefly swaps the button label to a "Copied" confirmation.
   *
   * Uses `navigator.clipboard.writeText` with graceful degradation when the Clipboard API
   * is unavailable (the value remains selectable in the DOM as a fallback).
   *
   * @param event - DOM click event
   */
  _onClickCopy(event: Event): void {
    event.preventDefault();
    const btn = event.currentTarget as HTMLElement | null;
    const value = btn?.dataset?.copyValue;
    if (!btn || !value) return;

    const restore = btn.textContent ?? '';
    const i18n = buildI18n();

    const confirm = () => {
      btn.textContent = i18n.copyCopied ?? 'Copied';
      setTimeout(() => {
        btn.textContent = restore;
      }, 1500);
    };

    if (navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(value)
        .then(confirm)
        .catch(() => {
          // Clipboard blocked — the value is still selectable in the DOM.
        });
    }
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
