/**
 * «Associa occhiali G2» window (mock P01) — GM-only settings menu.
 *
 * The GM picks player + character, presses *Genera nuovo QR*, and the window shows
 * the QR (5-minute countdown, then hidden and credentials rotated), the manual
 * 16-char code under it, the environment checks (HTTPS · module served · socket) and
 * the list of paired devices with last contact and *Revoca*.
 *
 * Built as `HandlebarsApplicationMixin(ApplicationV2)` (Foundry v13+ API). The class
 * is created by a factory at `init` time because `foundry.applications.api` is a
 * runtime global (tests stub it before calling the factory).
 *
 * @see https://foundryvtt.com/api/v13/classes/foundry.applications.api.ApplicationV2.html
 * @see docs/design/g2-thirds-layout.md §P01
 */
import { listPlayerCharacters } from '../readers/character-reader.js';
import { isG2User } from './g2-user.js';
import {
  checkEnvironment,
  type EnvironmentCheck,
  expirePairing,
  type PairingSession,
  revokePairing,
  startPairing,
} from './pairing-flow.js';
import { listDevices } from './pairing-store.js';
import type { Projector } from './projector.js';

/** Template path served by Foundry. */
export const PAIR_TEMPLATE = 'modules/evenfoundryvtt/templates/pair-g2.hbs' as const;

/** Countdown refresh period (ms). */
const TICK_MS = 1_000;

/** One row of the paired-devices list. */
export interface DeviceRow {
  g2UserId: string;
  label: string;
  actorName: string;
  online: boolean;
  lastSeen: string;
  confirming: boolean;
}

/** Template context of `pair-g2.hbs`. */
export interface PairContext {
  players: Array<{ id: string; name: string; selected: boolean }>;
  actors: Array<{ id: string; name: string; selected: boolean }>;
  session: (PairingSession & { remaining: string }) | null;
  expired: boolean;
  checks: EnvironmentCheck | null;
  baseUrlHint: string;
  devices: DeviceRow[];
}

/** `mm:ss` of a non-negative duration. */
export function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Localised "last contact" text for a device. */
export function formatLastSeen(lastSeenAt: number | null, online: boolean, now: number): string {
  if (online) {
    const seconds = lastSeenAt === null ? 0 : Math.max(0, Math.round((now - lastSeenAt) / 1000));
    return game.i18n.format('evf.pair.devices.seen_seconds', { seconds });
  }
  if (lastSeenAt === null) return game.i18n.localize('evf.pair.devices.never');
  const minutes = Math.max(1, Math.round((now - lastSeenAt) / 60_000));
  return game.i18n.format('evf.pair.devices.seen_minutes', { minutes });
}

/** Minimal element surface used by the action handlers (keeps tests DOM-light). */
interface ActionTarget {
  dataset: DOMStringMap;
}

/**
 * Creates the PairG2App class bound to the projector (used for online state and to
 * seal `revoked` before a device is deleted).
 */
export function createPairG2App(projector: Projector) {
  const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

  class PairG2App extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
      id: 'evf-pair-g2',
      tag: 'div',
      classes: ['evf-pair-g2'],
      window: { title: 'evf.pair.title', icon: 'fas fa-glasses' },
      position: { width: 640, height: 'auto' },
      actions: {
        pair(this: PairG2App): Promise<void> {
          return this.pair();
        },
        copyCode(this: PairG2App): Promise<void> {
          return this.copyCode();
        },
        revoke(this: PairG2App, _event: Event, target: ActionTarget): Promise<void> {
          return this.askRevoke(target.dataset.userId);
        },
        confirmRevoke(this: PairG2App, _event: Event, target: ActionTarget): Promise<void> {
          return this.revoke(target.dataset.userId);
        },
      },
    };

    static PARTS = { main: { template: PAIR_TEMPLATE } };

    session: PairingSession | null = null;
    expired = false;
    checks: EnvironmentCheck | null = null;
    confirmingRevoke: string | null = null;
    selectedPlayer: string | null = null;
    selectedActor: string | null = null;
    private ticker: ReturnType<typeof setInterval> | null = null;

    protected override async _prepareContext(): Promise<PairContext> {
      this.checks ??= await checkEnvironment();
      const now = Date.now();
      const players = game.users.contents.filter((u) => !u.isGM && !isG2User(u));
      const actors = listPlayerCharacters();
      const player = this.selectedPlayer ?? players[0]?.id ?? null;
      const actor =
        this.selectedActor ??
        game.users.get(player ?? '')?.character?.id ??
        actors[0]?.actorId ??
        null;
      return {
        players: players.map((u) => ({
          id: u.id,
          name: u.name ?? u.id,
          selected: u.id === player,
        })),
        actors: actors.map((a) => ({ id: a.actorId, name: a.name, selected: a.actorId === actor })),
        session:
          this.session === null
            ? null
            : { ...this.session, remaining: formatRemaining(this.session.expiresAt - now) },
        expired: this.expired,
        checks: this.checks,
        baseUrlHint: this.session?.url.split('#')[0] ?? '',
        devices: listDevices().map((d) => {
          const online = projector.isOnline(d.g2UserId, now);
          return {
            g2UserId: d.g2UserId,
            label: d.label,
            actorName: game.actors.get(d.actorId)?.name ?? '—',
            online,
            lastSeen: formatLastSeen(d.lastSeenAt, online, now),
            confirming: this.confirmingRevoke === d.g2UserId,
          };
        }),
      };
    }

    protected override async _onRender(): Promise<void> {
      this.stopTicker();
      if (this.session !== null) this.ticker = setInterval(() => void this.tick(), TICK_MS);
      this.element.querySelectorAll<HTMLSelectElement>('select[data-field]').forEach((select) => {
        select.addEventListener('change', () => {
          if (select.dataset.field === 'player') this.selectedPlayer = select.value;
          else this.selectedActor = select.value;
        });
      });
    }

    protected override _onClose(): void {
      this.stopTicker();
    }

    /** Countdown step: update the timer text, expire the session at 00:00. */
    async tick(now: number = Date.now()): Promise<void> {
      if (this.session === null) return;
      const left = this.session.expiresAt - now;
      const el = this.element.querySelector('[data-countdown]');
      if (el !== null) el.textContent = formatRemaining(left);
      if (left > 0) return;
      const { g2UserId } = this.session;
      this.session = null;
      this.expired = true;
      this.stopTicker();
      try {
        await expirePairing(g2UserId);
      } catch (err) {
        console.error('[EVF] could not rotate expired pairing credentials', err);
        ui.notifications?.error(game.i18n.localize('evf.pair.error.expire'));
      }
      await this.render();
    }

    /** Generates a new QR + code for the selected player / character. */
    async pair(): Promise<void> {
      const context = await this._prepareContext();
      const player = context.players.find((p) => p.selected)?.id;
      const actor = context.actors.find((a) => a.selected)?.id;
      if (player === undefined || actor === undefined) {
        ui.notifications?.error(game.i18n.localize('evf.pair.error.select'));
        return;
      }
      try {
        this.session = await startPairing(player, actor);
        this.expired = false;
      } catch (err) {
        console.error('[EVF] pairing failed', err);
        ui.notifications?.error(game.i18n.localize('evf.pair.error.pair'));
      }
      await this.render();
    }

    /** Copies the manual code to the clipboard. */
    async copyCode(): Promise<void> {
      if (this.session === null) return;
      try {
        await navigator.clipboard.writeText(this.session.code);
        ui.notifications?.info(game.i18n.localize('evf.pair.code_copied'));
      } catch (err) {
        console.warn('[EVF] clipboard unavailable', err);
        ui.notifications?.error(game.i18n.localize('evf.pair.error.clipboard'));
      }
    }

    /** First click on *Revoca*: ask for confirmation inline. */
    async askRevoke(g2UserId: string | undefined): Promise<void> {
      this.confirmingRevoke = g2UserId ?? null;
      await this.render();
    }

    /** Confirmed revocation: notify glasses, delete the "(G2)" user, forget the key. */
    async revoke(g2UserId: string | undefined): Promise<void> {
      this.confirmingRevoke = null;
      if (g2UserId === undefined) return;
      try {
        await revokePairing(g2UserId, (id) => projector.revoke(id));
        if (this.session?.g2UserId === g2UserId) this.session = null;
        ui.notifications?.info(game.i18n.localize('evf.pair.revoked'));
      } catch (err) {
        console.error('[EVF] revocation failed', err);
        ui.notifications?.error(game.i18n.localize('evf.pair.error.revoke'));
      }
      await this.render();
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
