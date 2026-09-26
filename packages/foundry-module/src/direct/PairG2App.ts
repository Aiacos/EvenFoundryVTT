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
 * Below: the glasses paired in THIS browser (status online / waiting / offline, last
 * contact, «Scollega» with inline confirmation). An unused QR expires after 5 minutes and
 * is forgotten; a new one is one click away.
 *
 * Built as `HandlebarsApplicationMixin(ApplicationV2)` (Foundry v13+ API); the class is
 * created by a factory at `init` because `foundry.applications.api` is a runtime global.
 *
 * @see https://foundryvtt.com/api/v13/classes/foundry.applications.api.ApplicationV2.html
 */
import { ownedCharacters } from './ownership.js';
import {
  checkRelay,
  expirePairing,
  PAIRING_TTL_MS,
  type PairingEndpoints,
  type PairingSession,
  startPairing,
} from './pairing-flow.js';
import { getPairing, listPairings } from './pairing-store.js';
import type { DeviceStatus, Projector } from './projector.js';

/** Template path served by Foundry. */
export const PAIR_TEMPLATE = 'modules/evenfoundryvtt/templates/pair-g2.hbs' as const;

/** ApplicationV2 id (one instance at a time). */
export const PAIR_APP_ID = 'evf-pair-g2' as const;

/** Setup guide section shown when the relay is unreachable. */
const GUIDE_RELAY =
  'https://github.com/Aiacos/EvenFoundryVTT/blob/main/docs/setup-guide.md#-troubleshooting';

/** Countdown refresh period (ms). */
const TICK_MS = 1_000;

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
  relayUrl: string;
  guide: string;
  session: SessionView | null;
  expired: boolean;
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
 */
export function createPairG2App(projector: Projector, endpoints: () => PairingEndpoints) {
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
      },
    };

    static PARTS = { main: { template: PAIR_TEMPLATE } };

    session: PairingSession | null = null;
    expired = false;
    connected: string | null = null;
    relayOk: boolean | null = null;
    selectedActor: string | null = null;
    confirmingRevoke: string | null = null;
    private ticker: ReturnType<typeof setInterval> | null = null;
    private unsubscribe: (() => void) | null = null;
    private starting = false;

    /** Opens the window (reusing the open instance), optionally on `actorId`. */
    static async openFor(actorId: string | null = null): Promise<PairG2App> {
      // `foundry.applications.instances` (v13+ registry of rendered ApplicationV2s) is
      // outside our minimal global typings.
      const registry = (foundry.applications as { instances?: Map<string, unknown> }).instances;
      const open = registry?.get(PAIR_APP_ID);
      const app = open instanceof PairG2App ? open : new PairG2App();
      if (actorId !== null && actorId !== app.selectedActor) {
        app.selectedActor = actorId;
        await app.discardSession();
      }
      return app.render({ force: true });
    }

    /** The character the QR is for: selected, else assigned, else the first owned. */
    currentActor(): string | null {
      const actors = pickableActors();
      const ids = new Set(actors.map((a) => a.id));
      return (
        [this.selectedActor, game.user.character?.id, actors[0]?.id].find(
          (id): id is string => typeof id === 'string' && ids.has(id),
        ) ?? null
      );
    }

    protected override async _prepareContext(): Promise<PairContext> {
      const now = Date.now();
      const actor = this.currentActor();
      const { relayUrl } = endpoints();
      return {
        actors: pickableActors().map((a) => ({ ...a, selected: a.id === actor })),
        noActor: actor === null,
        relayDown: this.relayOk === false,
        relayUrl,
        guide: GUIDE_RELAY,
        session: this.session === null ? null : sessionView(this.session, now),
        expired: this.expired,
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

    protected override _onClose(): void {
      this.stopTicker();
      this.unsubscribe?.();
      this.unsubscribe = null;
      void this.discardSession();
    }

    /**
     * Opening the window pairs: checks the relay once, then shows a QR for the current
     * character unless one is showing, just connected, or expired (then it waits for a
     * click on «Nuovo QR»).
     */
    async autoStart(): Promise<void> {
      if (this.session !== null || this.connected !== null || this.expired || this.starting) return;
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

    /** The glasses connected (secrets rotated) → success state. */
    private async onProjectorChange(): Promise<void> {
      const session = this.session;
      if (session !== null && getPairing(session.deviceId)?.expiresAt === null) {
        this.connected = session.actorName;
        this.session = null;
        this.stopTicker();
        ui.notifications?.info(
          game.i18n.format('evf.pair.connected.toast', { actor: session.actorName }),
        );
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
      await this.discardSession();
      this.expired = true;
      await this.render();
    }

    /** «Nuovo QR»: a fresh session (after expiry or success). */
    async newQr(): Promise<void> {
      await this.discardSession();
      this.expired = false;
      this.connected = null;
      await this.autoStart();
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
      if (session === null) return;
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
