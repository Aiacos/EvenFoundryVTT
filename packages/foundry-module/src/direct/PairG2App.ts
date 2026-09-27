/**
 * «Collega occhiali G2» — the one pairing window, for players and GMs alike (ADR-0019).
 *
 * Designed for the fewest clicks: opening it IS pairing.
 * 1. The character is preselected (the user's assigned character, else the first one
 *    they own); a GM sees every character.
 * 2. The relay is checked (`GET /health`, gate G1) and, if reachable, the QR + 16-char
 *    code appear at once — no «generate» button. Changing the character regenerates it.
 * 3. When the glasses connect (the projector rotated the single-use secrets), the window
 *    switches to «Occhiali collegati · <character>» by itself.
 *
 * Under the QR, live: relay connected, glasses in the room, and why the last frame of the
 * glasses was refused (clocks apart, another code, malformed). A QR page or relay that is
 * not the default is flagged, with «Ripristina predefinito» (a plain-http LAN page left
 * over from development breaks every scan once its server is off).
 *
 * Below: the glasses paired in THIS browser (status online / waiting / offline, last
 * contact, «Scollega» with inline confirmation). An unused QR expires after 5 minutes and
 * is forgotten by the projector — closing the window does not cancel it, and reopening
 * it within the 5 minutes (from any entry point) shows the same QR; «Annulla QR» kills it
 * at once (a QR seen by someone else must not stay redeemable); a new one is one click away.
 *
 * Built as `HandlebarsApplicationMixin(ApplicationV2)` (Foundry v13+ API); the class is
 * created by a factory at `init` because `foundry.applications.api` is a runtime global.
 *
 * @see https://foundryvtt.com/api/v13/classes/foundry.applications.api.ApplicationV2.html
 */
import { DEFAULT_APP_URL, DEFAULT_RELAY_URL, PAIRING_TTL_MS } from '@evf/shared-protocol';
import { ownedCharacters } from './ownership.js';
import {
  checkRelay,
  expirePairing,
  type PairingEndpoints,
  type PairingSession,
  startPairing,
} from './pairing-flow.js';
import { getPairing, listPairings } from './pairing-store.js';
import type { ChannelDiagnostics, DeviceStatus, Projector } from './projector.js';

/** Template path served by Foundry. */
export const PAIR_TEMPLATE = 'modules/evenfoundryvtt/templates/pair-g2.hbs' as const;

/** ApplicationV2 id (one instance at a time). */
export const PAIR_APP_ID = 'evf-pair-g2' as const;

/** Setup guide section shown when the relay is unreachable. */
const GUIDE_RELAY =
  'https://github.com/Aiacos/EvenFoundryVTT/blob/main/docs/setup-guide.md#-troubleshooting';

/** Countdown refresh period (ms). */
const TICK_MS = 1_000;

/** Hosts where plain `http:` / `ws:` is still a secure context (the developer's own PC). */
const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * How a pairing endpoint differs from its default: `insecure` = plain `http:`/`ws:` on a
 * host other than this PC (a LAN dev server: dead once it stops, never a secure context),
 * `custom` = any other non-default value, null = the default.
 */
export type EndpointNotice = 'insecure' | 'custom' | null;

/** A flagged pairing endpoint as rendered, with its «Ripristina predefinito» button. */
export interface EndpointNoticeView {
  kind: Exclude<EndpointNotice, null>;
  /** Setting to reset (the button's `data-endpoint`). */
  which: keyof PairingEndpoints;
  url: string;
  /** Notice colour: plain http on the LAN is an error, anything else a warning. */
  tone: 'error' | 'warn';
  /** i18n key of the explanation. */
  label: string;
}

/** One line of the live status under the QR. */
export interface LiveItem {
  state: 'ok' | 'wait' | 'error';
  /** Font Awesome icon class. */
  icon: string;
  /** i18n key. */
  label: string;
}

/** Resets one pairing endpoint setting to its default (module settings). */
export type ResetEndpoint = (which: keyof PairingEndpoints) => Promise<void>;

/** One row of the paired-devices list. */
export interface DeviceRow {
  deviceId: string;
  label: string;
  status: DeviceStatus;
  /** i18n key of the status. */
  statusLabel: string;
  lastSeen: string;
  confirming: boolean;
}

/** Classifies `url` against its default `fallback` (trailing `/` ignored). */
export function endpointNotice(url: string, fallback: string): EndpointNotice {
  const trim = (u: string): string => u.replace(/\/+$/, '');
  if (trim(url) === trim(fallback)) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'custom';
  }
  const plain = parsed.protocol === 'http:' || parsed.protocol === 'ws:';
  return plain && !LOOPBACK_HOSTS.has(parsed.hostname) ? 'insecure' : 'custom';
}

/** Notice of one endpoint setting, or null when it is the default. */
function noticeView(
  which: keyof PairingEndpoints,
  url: string,
  fallback: string,
): EndpointNoticeView | null {
  const kind = endpointNotice(url, fallback);
  if (kind === null) return null;
  const name = which === 'appUrl' ? 'app' : 'relay';
  return {
    kind,
    which,
    url,
    tone: kind === 'insecure' ? 'error' : 'warn',
    label: `evf.pair.notice.${name}_${kind}`,
  };
}

/** Live status lines of a pending pairing's channel. */
export function liveItems(d: ChannelDiagnostics): LiveItem[] {
  const items: LiveItem[] = [
    d.relay
      ? { state: 'ok', icon: 'fa-tower-broadcast', label: 'evf.pair.live.relay_up' }
      : { state: 'error', icon: 'fa-tower-broadcast', label: 'evf.pair.live.relay_down' },
    d.glasses
      ? { state: 'ok', icon: 'fa-glasses', label: 'evf.pair.live.glasses_in' }
      : { state: 'wait', icon: 'fa-glasses', label: 'evf.pair.live.glasses_waiting' },
  ];
  if (d.rejected !== null) {
    items.push({
      state: 'error',
      icon: d.rejected === 'stale' ? 'fa-clock' : 'fa-triangle-exclamation',
      label: `evf.pair.live.rejected_${d.rejected}`,
    });
  }
  return items;
}

/** Session as rendered: countdown text, progress and the code split in groups. */
export type SessionView = PairingSession & {
  remaining: string;
  secondsLeft: number;
  secondsTotal: number;
  codeGroups: string[];
};

/** Template context of `pair-g2.hbs`. */
export interface PairContext {
  actors: Array<{ id: string; name: string; selected: boolean }>;
  /** No character to pair (the user owns none). */
  noActor: boolean;
  /** The relay did not answer the health check. */
  relayDown: boolean;
  /** Relay in use (shown when it is unreachable). */
  relayUrl: string;
  /** Non-default QR page / relay, each with «Ripristina predefinito» (empty: defaults). */
  endpointNotices: EndpointNoticeView[];
  guide: string;
  session: SessionView | null;
  /** Live status of the QR's channel (empty without a QR). */
  live: LiveItem[];
  expired: boolean;
  /** The player cancelled the shown QR («Annulla QR»): no new one until «Nuovo QR». */
  cancelled: boolean;
  /** «Ingrandisci QR» is on: the QR is drawn about twice as large, steps below it. */
  bigQr: boolean;
  /** Character name of the device that just connected. */
  connected: string | null;
  devices: DeviceRow[];
}

/** `mm:ss` of a non-negative duration. */
export function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Template view of a pairing session at `now`. */
export function sessionView(session: PairingSession, now: number): SessionView {
  const left = session.expiresAt - now;
  return {
    ...session,
    remaining: formatRemaining(left),
    secondsLeft: Math.max(0, Math.ceil(left / 1000)),
    secondsTotal: PAIRING_TTL_MS / 1000,
    codeGroups: session.code.split('-'),
  };
}

/** Localised "last contact" text of a device. */
export function formatLastSeen(
  lastSeenAt: number | null,
  status: DeviceStatus,
  now: number,
): string {
  if (status === 'online') return game.i18n.localize('evf.pair.devices.now');
  if (lastSeenAt === null) return game.i18n.localize('evf.pair.devices.never');
  const minutes = Math.max(1, Math.round((now - lastSeenAt) / 60_000));
  return game.i18n.format('evf.pair.devices.seen_minutes', { minutes });
}

/** Characters offered by the picker: every character for a GM, owned ones otherwise. */
function pickableActors(): Array<{ id: string; name: string }> {
  return ownedCharacters(game.user.id);
}

/** Minimal element surface used by the action handlers (keeps tests DOM-light). */
interface ActionTarget {
  dataset: DOMStringMap;
}

/**
 * Creates the pairing window class.
 *
 * @param projector - this tab's projector (device status, opening/revoking channels)
 * @param endpoints - app page + relay the QR points at (module settings)
 * @param resetEndpoint - puts one of them back to its default («Ripristina predefinito»)
 */
export function createPairG2App(
  projector: Projector,
  endpoints: () => PairingEndpoints,
  resetEndpoint: ResetEndpoint,
) {
  const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

  class PairG2App extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
      id: PAIR_APP_ID,
      tag: 'div',
      classes: ['evf-pair-g2'],
      window: { title: 'evf.pair.title', icon: 'fas fa-glasses' },
      position: { width: 620, height: 'auto' },
      actions: {
        newQr(this: PairG2App): Promise<void> {
          return this.newQr();
        },
        cancelQr(this: PairG2App): Promise<void> {
          return this.cancelQr();
        },
        toggleQrSize(this: PairG2App): Promise<void> {
          return this.toggleQrSize();
        },
        copyCode(this: PairG2App): Promise<void> {
          return this.copyCode();
        },
        recheck(this: PairG2App): Promise<void> {
          return this.recheck();
        },
        revoke(this: PairG2App, _event: Event, target: ActionTarget): Promise<void> {
          return this.askRevoke(target.dataset.deviceId);
        },
        confirmRevoke(this: PairG2App, _event: Event, target: ActionTarget): Promise<void> {
          return this.revoke(target.dataset.deviceId);
        },
        resetEndpoint(this: PairG2App, _event: Event, target: ActionTarget): Promise<void> {
          return this.resetEndpoint(target.dataset.endpoint);
        },
      },
    };

    static PARTS = { main: { template: PAIR_TEMPLATE } };

    /**
     * The QR this tab is showing, shared by every instance of the window: closing it does
     * not cancel the pairing (the projector expires it), so reopening shows it again.
     */
    private static shown: PairingSession | null = null;

    get session(): PairingSession | null {
      return PairG2App.shown;
    }

    set session(value: PairingSession | null) {
      PairG2App.shown = value;
    }

    expired = false;
    cancelled = false;
    /** «Ingrandisci QR»: the QR drawn about twice as large (kept across new QRs). */
    bigQr = false;
    connected: string | null = null;
    relayOk: boolean | null = null;
    selectedActor: string | null = null;
    confirmingRevoke: string | null = null;
    private ticker: ReturnType<typeof setInterval> | null = null;
    private unsubscribe: (() => void) | null = null;
    private starting = false;
    /** Not reconciled with the pairing store yet (a window just (re)opened). */
    private fresh = true;

    /**
     * Opens the window (reusing the open instance), optionally on `actorId`. The QR being
     * shown is kept when it is already for `actorId` — the Players-list entry reopening a
     * closed window must not kill the QR the phone is scanning; another character
     * replaces it.
     */
    static async openFor(actorId: string | null = null): Promise<PairG2App> {
      // `foundry.applications.instances` (v13+ registry of rendered ApplicationV2s) is
      // outside our minimal global typings.
      const registry = (foundry.applications as { instances?: Map<string, unknown> }).instances;
      const open = registry?.get(PAIR_APP_ID);
      const app = open instanceof PairG2App ? open : new PairG2App();
      if (actorId !== null) {
        const showing = app.selectedActor ?? app.session?.actorId ?? null;
        app.selectedActor = actorId;
        if (actorId !== showing) await app.discardSession();
      }
      return app.render({ force: true });
    }

    /** The character the QR is for: selected, else the shown QR's, else assigned, else the first owned. */
    currentActor(): string | null {
      const actors = pickableActors();
      const ids = new Set(actors.map((a) => a.id));
      return (
        [this.selectedActor, this.session?.actorId, game.user.character?.id, actors[0]?.id].find(
          (id): id is string => typeof id === 'string' && ids.has(id),
        ) ?? null
      );
    }

    protected override async _prepareContext(): Promise<PairContext> {
      const now = Date.now();
      this.reconcile(now);
      const actor = this.currentActor();
      const { appUrl, relayUrl } = endpoints();
      const session = this.session;
      return {
        actors: pickableActors().map((a) => ({ ...a, selected: a.id === actor })),
        noActor: actor === null,
        relayDown: this.relayOk === false,
        relayUrl,
        endpointNotices: [
          noticeView('appUrl', appUrl, DEFAULT_APP_URL),
          noticeView('relayUrl', relayUrl, DEFAULT_RELAY_URL),
        ].filter((n): n is EndpointNoticeView => n !== null),
        guide: GUIDE_RELAY,
        session: session === null ? null : sessionView(session, now),
        live: session === null ? [] : liveItems(projector.diagnostics(session.deviceId)),
        expired: this.expired,
        cancelled: this.cancelled,
        bigQr: this.bigQr,
        connected: this.connected,
        devices: listPairings()
          .filter((p) => p.expiresAt === null)
          .map((p) => {
            const status = projector.status(p.deviceId);
            return {
              deviceId: p.deviceId,
              label: p.label,
              status,
              statusLabel: `evf.pair.devices.${status}`,
              lastSeen: formatLastSeen(p.lastSeenAt, status, now),
              confirming: this.confirmingRevoke === p.deviceId,
            };
          }),
      };
    }

    protected override async _onRender(): Promise<void> {
      this.stopTicker();
      this.unsubscribe ??= projector.subscribe(() => void this.onProjectorChange());
      if (this.session !== null) this.ticker = setInterval(() => void this.tick(), TICK_MS);
      this.element
        .querySelector<HTMLSelectElement>('select[data-field="actor"]')
        ?.addEventListener('change', (event) => {
          this.selectedActor = (event.target as HTMLSelectElement).value;
          void this.discardSession().then(() => this.autoStart());
        });
      await this.autoStart();
    }

    /**
     * Closing only stops the countdown and the status updates: the QR keeps working until
     * it expires (the projector forgets it then), so a scan right after ✕/ESC still pairs.
     */
    protected override _onClose(): void {
      this.stopTicker();
      this.unsubscribe?.();
      this.unsubscribe = null;
    }

    /**
     * Drops a shown QR that is no longer pending (expired, forgotten or already used). In
     * a window that was just (re)opened this is silent — a fresh QR follows; in an open
     * window it becomes «scaduto» / «collegati» instead of a new QR behind the player's back.
     * A QR past 00:00 on this clock that is still pending (the projector's timer is late,
     * e.g. after the laptop slept) is forgotten here too.
     */
    private reconcile(now: number): void {
      const fresh = this.fresh;
      this.fresh = false;
      const session = this.session;
      if (session === null) return;
      const pairing = getPairing(session.deviceId);
      if (pairing !== null && pairing.expiresAt !== null && session.expiresAt > now) return;
      this.session = null;
      this.stopTicker();
      if (pairing !== null && pairing.expiresAt !== null) void this.forget(session);
      if (fresh) return;
      if (pairing?.expiresAt === null) this.connected = session.actorName;
      else this.expired = true;
    }

    /**
     * Opening the window pairs: checks the relay once, then shows a QR for the current
     * character unless one is showing, just connected, expired or cancelled (then it waits
     * for a click on «Nuovo QR»).
     */
    async autoStart(): Promise<void> {
      this.reconcile(Date.now());
      if (
        this.session !== null ||
        this.connected !== null ||
        this.expired ||
        this.cancelled ||
        this.starting
      )
        return;
      const actor = this.currentActor();
      if (actor === null) return;
      this.starting = true;
      try {
        if (this.relayOk === null) {
          this.relayOk = await checkRelay(endpoints().relayUrl);
          if (!this.relayOk) {
            await this.render();
            return;
          }
        }
        if (!this.relayOk) return;
        this.session = await startPairing(actor, endpoints());
        projector.open(this.session.deviceId);
      } catch (err) {
        console.error('[EVF] pairing failed', err);
        ui.notifications?.error(game.i18n.localize('evf.pair.error.pair'));
      } finally {
        this.starting = false;
      }
      await this.render();
    }

    /**
     * Projector news: the glasses connected (secrets rotated) → success state; the QR was
     * forgotten (the projector's expiry) → «scaduto». Always re-renders (live status).
     */
    private async onProjectorChange(): Promise<void> {
      const session = this.session;
      const pairing = session === null ? null : getPairing(session.deviceId);
      if (session !== null && pairing?.expiresAt === null) {
        this.connected = session.actorName;
        this.session = null;
        this.stopTicker();
        ui.notifications?.info(
          game.i18n.format('evf.pair.connected.toast', { actor: session.actorName }),
        );
      } else if (session !== null && pairing === null) {
        this.session = null;
        this.expired = true;
        this.stopTicker();
      }
      await this.render();
    }

    /** Countdown step; at 00:00 the unused QR is forgotten. */
    async tick(now: number = Date.now()): Promise<void> {
      if (this.session === null) return;
      const left = this.session.expiresAt - now;
      const el = this.element.querySelector('[data-countdown]');
      if (el !== null) el.textContent = formatRemaining(left);
      const bar = this.element.querySelector<HTMLProgressElement>('progress[data-countdown-bar]');
      if (bar !== null) bar.value = Math.max(0, Math.ceil(left / 1000));
      if (left > 0) return;
      // Expired first: the discard below makes the projector emit, and a render in between
      // must not see "no QR, not expired" and start a new one.
      this.expired = true;
      await this.discardSession();
      await this.render();
    }

    /** «Nuovo QR»: a fresh session (after expiry, cancellation or success). */
    async newQr(): Promise<void> {
      await this.discardSession();
      this.expired = false;
      this.cancelled = false;
      this.connected = null;
      await this.autoStart();
    }

    /**
     * «Annulla QR»: the shown QR / code stops working now (pending pairing forgotten, its
     * channel closed) — closing the window leaves it redeemable until it expires.
     */
    async cancelQr(): Promise<void> {
      // Cancelled first: the discard makes the projector emit, and a render in between
      // must not see "no QR" and start a new one.
      this.cancelled = true;
      await this.discardSession();
      ui.notifications?.info(game.i18n.localize('evf.pair.cancelled_toast'));
      await this.render();
    }

    /**
     * «Ingrandisci QR» / «Riduci QR» (or a click on the QR): a phone *photo* needs the QR
     * large — at 256 px it fills ~13 % of a photo taken from 30 cm, where decoding succeeds
     * ~40 % of the time; twice as large, ~90 % (g2-app `qr-scan.ts` SCAN_PLAN measurements).
     */
    async toggleQrSize(): Promise<void> {
      this.bigQr = !this.bigQr;
      await this.render();
    }

    /** Copies the code to the clipboard. */
    async copyCode(): Promise<void> {
      const code = this.session?.code;
      if (code === undefined) return;
      try {
        await navigator.clipboard.writeText(code);
        ui.notifications?.info(game.i18n.localize('evf.pair.code_copied'));
      } catch (err) {
        console.warn('[EVF] clipboard unavailable', err);
        ui.notifications?.error(game.i18n.localize('evf.pair.error.clipboard'));
      }
    }

    /** Re-runs the relay check (after fixing the network / setting). */
    async recheck(): Promise<void> {
      this.relayOk = null;
      await this.autoStart();
    }

    /**
     * «Ripristina predefinito»: puts the app page or the relay back to the default and
     * shows a new QR (the relay is checked again first).
     */
    async resetEndpoint(which: string | undefined): Promise<void> {
      if (which !== 'appUrl' && which !== 'relayUrl') return;
      try {
        await resetEndpoint(which);
      } catch (err) {
        console.error(`[EVF] could not reset the ${which} setting`, err);
        ui.notifications?.error(game.i18n.localize('evf.pair.error.reset'));
        return;
      }
      ui.notifications?.info(game.i18n.localize('evf.pair.notice.reset_done'));
      if (which === 'relayUrl') this.relayOk = null;
      await this.newQr();
    }

    /** First click on «Scollega»: ask for confirmation inline. */
    async askRevoke(deviceId: string | undefined): Promise<void> {
      this.confirmingRevoke = deviceId ?? null;
      await this.render();
    }

    /** Confirmed: tells the glasses, closes the channel, forgets the pairing. */
    async revoke(deviceId: string | undefined): Promise<void> {
      this.confirmingRevoke = null;
      if (deviceId === undefined) return;
      try {
        await projector.revoke(deviceId);
        ui.notifications?.info(game.i18n.localize('evf.pair.revoked'));
      } catch (err) {
        console.error('[EVF] revocation failed', err);
        ui.notifications?.error(game.i18n.localize('evf.pair.error.revoke'));
      }
      await this.render();
    }

    /** Drops the showing QR (unused → forgotten, channel closed). */
    private async discardSession(): Promise<void> {
      const session = this.session;
      this.session = null;
      this.stopTicker();
      if (session !== null) await this.forget(session);
    }

    /** Forgets `session`'s pairing if still unused and closes its channel; never throws. */
    private async forget(session: PairingSession): Promise<void> {
      try {
        if (await expirePairing(session.deviceId)) await projector.revoke(session.deviceId);
      } catch (err) {
        console.error('[EVF] could not discard the pairing session', err);
      }
    }

    private stopTicker(): void {
      if (this.ticker !== null) {
        clearInterval(this.ticker);
        this.ticker = null;
      }
    }
  }

  return PairG2App;
}
