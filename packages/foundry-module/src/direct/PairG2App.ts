/**
 * «Associa occhiali G2» window (mock P01) — GM only. Opened from the settings menu or
 * from the Players list context menu (`players-menu.ts`, player + character
 * preselected).
 *
 * Three states, one screen:
 * - **idle** — steps 1-2-3 and the primary *Genera QR* button;
 * - **session** — large QR, countdown (progress bar + `mm:ss`, then hidden and
 *   credentials rotated), manual 16-char code grouped `XXXX-XXXX-XXXX-XXXX` + copy;
 * - **connected** — reached automatically when the device completes its first
 *   `hello` while the window is open («Occhiali collegati · Thorin»). Detected on the
 *   1-second countdown tick from state the projector already maintains: the device is
 *   online (`Projector.isOnline`) or its one-time credentials were consumed
 *   (`DeviceMeta.pendingRotation === false`, written by the projector on `hello`).
 *
 * Always visible: environment checks as status pills (HTTPS · public address · module
 * served · socket) with an actionable fix + setup-guide link per failure, and the
 * paired-device list (online dot, actor, relative last contact, *Revoca* with inline
 * confirmation). Styles: `styles/pair-g2.css` (module.json `styles`).
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
  PAIRING_TTL_MS,
  type PairingSession,
  revokePairing,
  startPairing,
} from './pairing-flow.js';
import { getDevice, listDevices } from './pairing-store.js';
import type { PairTarget } from './players-menu.js';
import type { Projector } from './projector.js';

/** Template path served by Foundry. */
export const PAIR_TEMPLATE = 'modules/evenfoundryvtt/templates/pair-g2.hbs' as const;

/** ApplicationV2 id of the pairing window (one instance at a time). */
export const PAIR_APP_ID = 'evf-pair-g2' as const;

/** Setup guide on GitHub; anchors are the GitHub slugs of its headings. */
const SETUP_GUIDE = 'https://github.com/Aiacos/EvenFoundryVTT/blob/main/docs/setup-guide.md';
const GUIDE_HTTPS = `${SETUP_GUIDE}#-https-reachable-from-the-phone`;
const GUIDE_INSTALL = `${SETUP_GUIDE}#-install-the-module`;
const GUIDE_TROUBLESHOOTING = `${SETUP_GUIDE}#-troubleshooting`;

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

/** Visual state of one environment check pill. */
export type CheckState = 'ok' | 'warn' | 'error';

/** One environment check, ready for the template. */
export interface CheckRow {
  key: keyof EnvironmentCheck;
  state: CheckState;
  /** Font Awesome classes of the pill icon. */
  icon: string;
  /** i18n key of the pill label. */
  label: string;
  /** i18n key of the fix, only when the check did not pass. */
  fix: string | null;
  /** Setup-guide section explaining the fix (only when the check did not pass). */
  guide: string | null;
}

/** The device that connected while the window was open. */
export interface ConnectedDevice {
  label: string;
  actorName: string;
}

/** Session as rendered: countdown text, progress and the code split in groups. */
export type SessionView = PairingSession & {
  remaining: string;
  /** Seconds left (value of the `<progress>` bar). */
  secondsLeft: number;
  /** Total lifetime in seconds (max of the `<progress>` bar). */
  secondsTotal: number;
  /** `XXXX-XXXX-XXXX-XXXX` → `['XXXX', 'XXXX', 'XXXX', 'XXXX']`. */
  codeGroups: string[];
};

/** Template context of `pair-g2.hbs`. */
export interface PairContext {
  players: Array<{ id: string; name: string; selected: boolean }>;
  actors: Array<{ id: string; name: string; selected: boolean }>;
  session: SessionView | null;
  expired: boolean;
  connected: ConnectedDevice | null;
  checks: CheckRow[];
  checksOk: boolean;
  baseUrlHint: string;
  devices: DeviceRow[];
}

/** Environment checks → status pills (socket loss is transient: warning, not error). */
export function toCheckRows(checks: EnvironmentCheck): CheckRow[] {
  const row = (key: keyof EnvironmentCheck, failState: CheckState, guide: string): CheckRow => {
    const ok = checks[key];
    const state: CheckState = ok ? 'ok' : failState;
    return {
      key,
      state,
      icon: {
        ok: 'fas fa-circle-check',
        warn: 'fas fa-triangle-exclamation',
        error: 'fas fa-circle-xmark',
      }[state],
      label: `evf.pair.check.${key}`,
      fix: ok ? null : `evf.pair.check.${key}_fix`,
      guide: ok ? null : guide,
    };
  };
  return [
    row('https', 'error', GUIDE_HTTPS),
    row('publicHost', 'error', GUIDE_HTTPS),
    row('served', 'error', GUIDE_INSTALL),
    row('socket', 'warn', GUIDE_TROUBLESHOOTING),
  ];
}

/** `mm:ss` of a non-negative duration. */
export function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Groups of the manual code (dash separated). */
export function codeGroups(code: string): string[] {
  return code.split('-').filter((g) => g.length > 0);
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

/** Template view of a pairing session at `now`. */
export function sessionView(session: PairingSession, now: number): SessionView {
  const left = session.expiresAt - now;
  return {
    ...session,
    remaining: formatRemaining(left),
    secondsLeft: Math.max(0, Math.ceil(left / 1000)),
    secondsTotal: PAIRING_TTL_MS / 1000,
    codeGroups: codeGroups(session.code),
  };
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
      id: PAIR_APP_ID,
      tag: 'div',
      classes: ['evf-pair-g2'],
      window: { title: 'evf.pair.title', icon: 'fas fa-glasses' },
      position: { width: 680, height: 'auto' },
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
        recheck(this: PairG2App): Promise<void> {
          return this.recheck();
        },
        pairAnother(this: PairG2App): Promise<void> {
          return this.pairAnother();
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
    connected: ConnectedDevice | null = null;
    private ticker: ReturnType<typeof setInterval> | null = null;

    /**
     * Opens the pairing window preselected on `target`, reusing the open instance
     * (ApplicationV2 ids are unique) when there is one.
     */
    static async openFor(target: PairTarget): Promise<PairG2App> {
      // `foundry.applications.instances` (v13+ registry of rendered ApplicationV2s) is
      // outside our minimal global typings.
      const registry = (foundry.applications as { instances?: Map<string, unknown> }).instances;
      const open = registry?.get(PAIR_APP_ID);
      const app = open instanceof PairG2App ? open : new PairG2App();
      app.preselect(target);
      return app.render({ force: true });
    }

    /** Selects player + actor (Players list shortcut) and leaves the success state. */
    preselect(target: PairTarget): void {
      this.selectedPlayer = target.playerUserId;
      this.selectedActor = target.actorId;
      this.connected = null;
    }

    protected override async _prepareContext(): Promise<PairContext> {
      this.checks ??= await checkEnvironment();
      const checkRows = toCheckRows(this.checks);
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
        session: this.session === null ? null : sessionView(this.session, now),
        expired: this.expired,
        connected: this.connected,
        checks: checkRows,
        checksOk: checkRows.every((c) => c.state === 'ok'),
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
          if (select.dataset.field !== 'player') {
            this.selectedActor = select.value;
            return;
          }
          // New player → preselect their assigned character (if any) and redraw.
          this.selectedPlayer = select.value;
          const character = game.users.get(select.value)?.character?.id;
          if (character !== undefined) this.selectedActor = character;
          void this.render();
        });
      });
    }

    protected override _onClose(): void {
      this.stopTicker();
    }

    /**
     * Countdown step: switch to the success state when the device connected, else
     * update timer text + progress bar and expire the session at 00:00.
     */
    async tick(now: number = Date.now()): Promise<void> {
      if (this.session === null) return;
      if (this.hasConnected(this.session.g2UserId, now)) {
        this.connected = { label: this.session.label, actorName: this.session.actorName };
        this.session = null;
        this.expired = false;
        this.stopTicker();
        ui.notifications?.info(
          game.i18n.format('evf.pair.connected.toast', { actor: this.connected.actorName }),
        );
        await this.render();
        return;
      }
      const left = this.session.expiresAt - now;
      const el = this.element.querySelector('[data-countdown]');
      if (el !== null) el.textContent = formatRemaining(left);
      const bar = this.element.querySelector<HTMLProgressElement>('progress[data-countdown-bar]');
      if (bar !== null) bar.value = Math.max(0, Math.ceil(left / 1000));
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
        this.connected = null;
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

    /** Re-runs the environment checks (after the GM fixed something). */
    async recheck(): Promise<void> {
      this.checks = null;
      await this.render();
    }

    /** Leaves the success state for the next pairing. */
    async pairAnother(): Promise<void> {
      this.connected = null;
      await this.render();
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

    /** The device of the open session said `hello` (online, or one-time creds used). */
    private hasConnected(g2UserId: string, now: number): boolean {
      if (projector.isOnline(g2UserId, now)) return true;
      return getDevice(g2UserId)?.meta.pendingRotation === false;
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
