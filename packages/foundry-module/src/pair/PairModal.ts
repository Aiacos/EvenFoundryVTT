/**
 * @evf/foundry-module — PairModal ApplicationV2 implementation.
 *
 * Every user's self-service pairing entry point. Opens from Foundry Settings →
 * Module Settings → EvenFoundryVTT → "Pair a G2 device" button (registered in
 * settings.ts, now available to ALL users, not just the GM).
 *
 * Pairing (secure, ADR-0014): every user pairs a bearer bound to THEIR OWN
 * `game.user.id` — there is no user-picker; you can only pair your own device.
 * The mint splits by permission:
 *   - **GM** → {@link generateBearer} writes the bearer DIRECTLY into the world-scope
 *     `bearerRegistry`. A GM can write world settings, so the token is a LIVE bearer
 *     the instant it is generated (no flag, no ingestion wait) and the modal resolves
 *     straight to `active`. This is the common single-tenant homelab operator path.
 *   - **Non-GM player** → cannot write the world registry, so the token is generated
 *     client-side via `generateOpaqueToken` and written as a `pendingPair` flag on the
 *     player's OWN `User` document (only that user can write their own flags → identity
 *     authenticated by document ownership). A GM client ingests the flag into the world
 *     registry (see self-pair-ingestion.ts); the modal shows `pairing-in-progress` and
 *     auto-flips to `active` the moment a GM materialises it (via the `updateSetting`
 *     registry-change listener in {@link _onRender}).
 *
 * Either way, a `bearerRegistry` change re-emits the registry to the bridge (module.ts
 * `updateSetting` hook), so a freshly-generated token is recognised within one round-trip.
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
import {
  generateBearer,
  generateOpaqueToken,
  listBearers,
  revokeBearer,
  TTL_24H_MS,
} from './bearer-registry.js';

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
  /** true when state === "active" (a live, non-expiring bearer) — gates the "generate new token" CTA */
  isActive: boolean;
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
  /** Current user's active (non-revoked) bearer entries for the devices table */
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

/** Pending-pair flag shape read for the "pairing-in-progress" state. */
interface PendingPairFlag {
  alias: string;
  token: string;
  bridgeUrl: string;
  worldId: string;
  createdAt: number;
}

/**
 * Returns the registry bearers bound to the CURRENT user (everyone is self-only:
 * a user only ever sees and pairs their own devices, ADR-0014). Newest first
 * (inherits the `listBearers` sort). Empty when the user has no bearers.
 */
function currentUserBearers(): BearerEntry[] {
  const selfId = game.user?.id;
  if (typeof selfId !== 'string' || selfId.length === 0) {
    return [];
  }
  return listBearers().filter((e) => e.userId === selfId);
}

/**
 * Reads the current user's own `pendingPair` flag (the self-service mint awaiting
 * GM ingestion). Returns `null` when absent or malformed.
 */
function readPendingPair(): PendingPairFlag | null {
  const raw = game.user?.getFlag(MODULE_ID, 'pendingPair');
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }
  const o = raw as Record<string, unknown>;
  if (
    typeof o.token !== 'string' ||
    o.token.length === 0 ||
    typeof o.bridgeUrl !== 'string' ||
    typeof o.alias !== 'string'
  ) {
    return null;
  }
  return {
    alias: o.alias,
    token: o.token,
    bridgeUrl: o.bridgeUrl,
    worldId: typeof o.worldId === 'string' ? o.worldId : '',
    createdAt: typeof o.createdAt === 'number' ? o.createdAt : Date.now(),
  };
}

/**
 * Converts the current user's `pendingPair` flag into a synthetic {@link BearerEntry}
 * so it can be treated uniformly with registry bearers. The flag IS a first-class,
 * self-authenticated bearer (only the user can write their own flag) — it works
 * standalone without GM ingestion — so the modal shows it as an ACTIVE device, not a
 * perpetual "awaiting" placeholder. Expiry mirrors the registry default (createdAt + 24h).
 */
function flagToBearer(flag: PendingPairFlag): BearerEntry {
  return {
    token: flag.token,
    alias: flag.alias || 'G2',
    worldId: flag.worldId,
    userId: game.user?.id ?? '',
    bridgeUrl: flag.bridgeUrl,
    internalSecret: '',
    createdAt: flag.createdAt,
    expiresAt: flag.createdAt + TTL_24H_MS,
    lastSeenAt: null,
    revokedAt: null,
  };
}

/**
 * The CURRENT user's devices, unified across both storage paths: GM-written world
 * registry bearers ({@link currentUserBearers}) PLUS this user's own self-service
 * `pendingPair` flag ({@link readPendingPair} → {@link flagToBearer}). Deduped by token
 * (registry-first, in case a flag was just ingested) and sorted newest-first.
 */
function currentUserDevices(): BearerEntry[] {
  const registry = currentUserBearers();
  const flag = readPendingPair();
  const seen = new Set(registry.map((b) => b.token));
  const flagBearer = flag !== null && !seen.has(flag.token) ? [flagToBearer(flag)] : [];
  return [...registry, ...flagBearer].sort((a, b) => b.createdAt - a.createdAt);
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
    refresh: l('evf.pair.qr.refresh'),
    regenerate: l('evf.pair.qr.regenerate'),
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

  /**
   * `updateSetting` hook id for live `bearerRegistry` changes, or null when not armed.
   * Lets an OPEN modal re-render the moment the registry changes externally — e.g. a GM
   * ingests this player's pending pair, or a bearer is rotated/revoked on another client —
   * so `pairing-in-progress` auto-flips to `active` and the device list stays current
   * without a manual reopen (fixes the "doesn't update dynamically" stall). Torn down in
   * {@link close}.
   */
  private _registryHookId: number | null = null;

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
   * Computes the modal state from the CURRENT USER's bearers (self-service:
   * everyone is self-only, ADR-0014) plus the user's own `pendingPair` flag.
   *
   * State priority (first match wins):
   * 1. "active" / "refresh-needed" — a current-user non-revoked, non-expired
   *    registry bearer exists (refresh-needed when its TTL < 1h).
   * 2. "pairing-in-progress" — no registry bearer yet, but the user has a pending
   *    flag (a freshly-minted token whose value is not yet in the registry — it
   *    awaits GM ingestion). Credentials come from the flag.
   * 3. "expired" — the user has bearers but all are expired (and no pending flag).
   * 4. "empty" — the user has no bearers and no pending flag.
   */
  private _computeState(): {
    state: ModalState;
    activeEntry?: BearerEntry;
  } {
    // Unified: registry bearers (GM-written) + this user's own pendingPair flag
    // (player-written, a first-class self-authenticated bearer). The flag is a LIVE
    // device — it works standalone without GM ingestion — so it participates in the
    // active/refresh-needed/expired states exactly like a registry bearer.
    const devices = currentUserDevices();
    const now = Date.now();
    const nonExpired = devices.filter((e) => e.expiresAt > now); // newest-first

    // 1. A live device (registry bearer OR the pending-pair flag) for this user.
    const active = nonExpired[0];
    if (active) {
      const ttlMs = active.expiresAt - now;
      if (ttlMs < REFRESH_THRESHOLD_MS) {
        return { state: 'refresh-needed', activeEntry: active };
      }
      return { state: 'active', activeEntry: active };
    }

    // 2. The user has device(s) but they are all expired.
    if (devices.length > 0) {
      return { state: 'expired' };
    }

    // 3. Nothing for this user.
    return { state: 'empty' };
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
    // The devices table shows the CURRENT user's devices across BOTH stores (registry
    // bearers + own pending-pair flag) so a freshly-paired player device is listed
    // (no more "no devices paired" while a token is shown).
    const devices = currentUserDevices().map(toDeviceRow);
    const i18n = buildI18n();

    const isEmpty = state === 'empty';
    const isExpired = state === 'expired';
    const isRefreshNeeded = state === 'refresh-needed';
    const isActive = state === 'active';
    // `isPairing` is retired — a pending-pair flag is now a live `active` device, not a
    // perpetual "awaiting" placeholder. Kept false for template/type back-compat.
    const isPairing = false;
    const showCredentials = !isEmpty && !isExpired;

    if (isEmpty || isExpired) {
      return {
        state,
        isEmpty,
        isExpired,
        isRefreshNeeded,
        isPairing,
        isActive,
        showCredentials,
        devices,
        i18n,
      };
    }

    // active | refresh-needed — credentials + countdown from the live device (a registry
    // bearer OR the pending-pair flag, both carry a real createdAt+24h expiry).
    // biome-ignore lint/style/noNonNullAssertion: activeEntry is guaranteed for active/refresh-needed
    const entry = activeEntry!;
    const ttlMs = entry.expiresAt - Date.now();

    return {
      state,
      isEmpty,
      isExpired,
      isRefreshNeeded,
      isPairing,
      isActive,
      showCredentials,
      // Always the CURRENT bridge URL to paste into the wizard (the live setting), not
      // the value stored on the bearer (which could be stale if the bridge moved).
      bridgeUrl: readBridgeUrl(),
      token: entry.token,
      ttlDisplay: formatTtl(ttlMs),
      expiresIso: new Date(entry.expiresAt).toISOString(),
      expiresAtMs: entry.expiresAt,
      devices,
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

    // New Code / Generate-new button (empty + expired states, and the active-state
    // "generate new token" CTA). querySelectorAll: states are mutually exclusive so
    // there is normally one, but bind them all to be robust.
    const newCodeButtons = Array.from(html.querySelectorAll('[data-action="new-code"]'));
    for (const btn of newCodeButtons) {
      btn.addEventListener('click', (event) => this._onClickRefresh(event));
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

    // Live registry refresh: arm ONCE (persists across re-renders) so an external
    // bearerRegistry change re-renders the open modal. A non-GM's pairing-in-progress
    // flips to active the instant a GM ingests the pending pair; revokes/rotations on
    // other clients also reflect live. Torn down in close().
    if (this._registryHookId === null) {
      this._registryHookId = Hooks.on('updateSetting', (...args: unknown[]) => {
        const setting = args[0] as { key?: string } | null;
        if (setting?.key === `${MODULE_ID}.bearerRegistry`) {
          void this.render({ force: true });
        }
      });
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

    // Two device stores → two revoke paths (a non-GM player cannot write the world
    // registry, so revoking a registry bearer that way silently failed — the old
    // "only works after reopening" bug):
    //   - the player's OWN pendingPair flag → unsetFlag (they CAN delete their own flag).
    //   - a world-registry bearer → revokeBearer (GM-written, GM-revoked).
    // Either write fires the corresponding updateUser/updateSetting hook, which re-emits
    // to the bridge AND re-renders this modal live (see _onRender registry listener).
    const flag = readPendingPair();
    const revoke =
      flag !== null && flag.token === tokenId
        ? game.user.unsetFlag(MODULE_ID, 'pendingPair')
        : revokeBearer(tokenId);

    // Await the (async) revoke so the re-render observes the revocation (read-after-write).
    revoke
      .then(() => {
        void this.render({ force: true });
      })
      .catch((err: unknown) => {
        console.error('[EVF] PairModal revoke error:', err);
      });
  }

  /**
   * Mints a NEW bearer for the CURRENT user. Two paths by permission (ADR-0014):
   *
   * - **GM** → writes the bearer DIRECTLY into the world-scope `bearerRegistry`
   *   ({@link generateBearer}). A GM can write world settings, so the token is a LIVE
   *   registry bearer the instant it is generated — no `pendingPair` flag, no waiting
   *   for ingestion. The world-setting change fires the module's `updateSetting`
   *   re-emit (module.ts) so the bridge cache is warmed at once and the modal resolves
   *   straight to the `active` state. This is the common single-tenant homelab path and
   *   fixes the "token never becomes valid" stall for an operator who IS the GM.
   *
   * - **Non-GM player** → cannot write the world registry, so it mints a high-entropy
   *   token client-side ({@link generateOpaqueToken}) and writes it as a `pendingPair`
   *   flag on the player's OWN `User` document (bound identity authenticated by document
   *   ownership). A GM client ingests it (self-pair-ingestion.ts); the modal shows
   *   `pairing-in-progress` and auto-flips to `active` via the registry-change listener
   *   ({@link _onRender}) the moment a GM materialises it.
   *
   * The alias is propagated from the current user's existing device (WR-04) so a
   * re-mint keeps the label; a first pairing defaults to a non-empty `'G2'` (the bridge
   * schema requires a non-empty alias — empty aliases otherwise poison the registry push).
   */
  private async _generateForSelf(): Promise<void> {
    const userId = game.user?.id;
    if (!userId) {
      return;
    }
    // Propagate the current user's existing device alias (any store, newest first);
    // default to a non-empty label so the registry snapshot validates at the bridge.
    const alias = currentUserDevices()[0]?.alias || 'G2';
    const bridgeUrl = readBridgeUrl();
    const worldId = readWorldId();

    if (game.user?.isGM === true) {
      // GM: write the live registry bearer directly — valid immediately.
      await generateBearer(alias, bridgeUrl, worldId, userId);
    } else {
      // Non-GM player: write a pendingPair flag — a first-class self-authenticated
      // bearer that works STANDALONE (validateBearer/readBearerRegistry resolve it),
      // so the device is live at once. A GM that later ingests it just upgrades it to
      // the persistent world registry.
      await game.user.setFlag(MODULE_ID, 'pendingPair', {
        alias,
        token: generateOpaqueToken(),
        bridgeUrl,
        worldId,
        createdAt: Date.now(),
      });
    }
    await this.render({ force: true });
  }

  /**
   * Handles click on "Refresh", "New Code" (expired state), or first-code button (empty state).
   *
   * Self-service (ADR-0014): mints a fresh token bound to the CURRENT user via
   * {@link _generateForSelf} (writes the `pendingPair` flag → GM ingests). The
   * modal re-renders in place showing the new token (pairing-in-progress until a
   * GM materialises it).
   *
   * @param event - DOM click event
   */
  _onClickRefresh(event: Event): void {
    event.preventDefault();
    this._generateForSelf().catch((err: unknown) => {
      console.error('[EVF] PairModal refresh error:', err);
    });
  }

  /**
   * Toggles the token field between masked (dots) and revealed (plain text).
   *
   * The masked element (`[data-token-mask]`) and the plain element (`[data-token-plain]`)
   * both exist in the DOM; this handler flips their `display` and swaps the button label
   * between "Reveal" and "Hide". Inline `style.display` is used (NOT a CSS class): the
   * module ships no stylesheet, so the old `.evf-hidden` class was a no-op and BOTH the
   * dots AND the plain token rendered at once — the "two fields" bug from the screenshot.
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
    const revealed = plain.style.display !== 'none';
    if (revealed) {
      plain.style.display = 'none';
      mask.style.display = '';
      btn.textContent = i18n.copyReveal ?? 'Reveal';
    } else {
      plain.style.display = '';
      mask.style.display = 'none';
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
    if (this._registryHookId !== null) {
      Hooks.off(this._registryHookId);
      this._registryHookId = null;
    }
    return super.close(options);
  }
}
