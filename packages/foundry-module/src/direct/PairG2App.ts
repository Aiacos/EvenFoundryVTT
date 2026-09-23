/**
 * Glasses pairing window (mock P01) — one component, two modes (ADR-0017):
 *
 * - **GM mode** «Associa occhiali G2» (settings menu, Players list entry on a player):
 *   one-time enablement of player-owned glasses («Abilita occhiali per i giocatori»,
 *   per player or all, with status not enabled / enabled / paired / online and
 *   «Rigenera password»), pairing **on behalf** of a player without Foundry (QR shown
 *   on the GM screen, ADR-0016 flow), and revocation;
 * - **player mode** «Associa i miei occhiali» (player settings menu, Players list
 *   entry on themselves): self-service QR for the player's own glasses, generated in
 *   the player's browser (`self-pairing.ts`) — no GM needed after enablement.
 *
 * Three pairing states, one screen (both modes):
 * - **idle** — steps 1-2-3 and the primary *Genera QR* button;
 * - **session** — large QR, countdown (progress bar + `mm:ss`, then hidden and
 *   credentials rotated), manual 16-char code grouped `XXXX-XXXX-XXXX-XXXX` + copy;
 * - **connected** — reached automatically when the device completes its first
 *   `hello` while the window is open («Occhiali collegati · Thorin»). Detected on the
 *   1-second countdown tick from state the projector already maintains: the device is
 *   online (`Projector.isOnline`) or its one-time credentials were consumed
 *   (`pendingRotation === false` — world `DeviceMeta` for GM pairing, the player's own
 *   `device` flag for self-service — written by the projector on `hello`).
 *
 * Always visible: environment checks as status pills (HTTPS · public address · module
 * served · socket) with an actionable fix + setup-guide link per failure; in GM mode
 * also the paired-device list (online dot, actor, relative last contact, *Revoca* with
 * inline confirmation). Styles: `styles/pair-g2.css` (module.json `styles`).
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
  eligiblePlayers,
  enableGlasses,
  getAccess,
  openMyPassword,
  regeneratePassword,
} from './glasses-access.js';
import { readSelfDevice } from './glasses-flags.js';
import { keyIdOf, publicKeyOf } from './identity-keys.js';
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
import {
  expireSelfPairing,
  ownedCharacters,
  type SelfPairingBlock,
  SelfPairingError,
  startSelfPairing,
} from './self-pairing.js';

/** Template path served by Foundry. */
export const PAIR_TEMPLATE = 'modules/evenfoundryvtt/templates/pair-g2.hbs' as const;

/** ApplicationV2 id of the GM pairing window (one instance at a time). */
export const PAIR_APP_ID = 'evf-pair-g2' as const;
/** ApplicationV2 id of the player's own pairing window. */
export const PAIR_SELF_APP_ID = 'evf-pair-my-g2' as const;

/** Who uses the window: the GM (enablement + on-behalf) or a player (self-service). */
export type PairMode = 'gm' | 'player';

/** Glasses status of a player, as shown in the GM enablement list. */
export type GlassesStatus = 'disabled' | 'enabled' | 'paired' | 'online';

/** One row of the GM enablement list. */
export interface EnablementRow {
  playerUserId: string;
  name: string;
  status: GlassesStatus;
  /** i18n key of the status pill. */
  statusLabel: string;
  enabled: boolean;
  /** Enabled, but the password is not yet sealed for the player's current browser. */
  waiting: boolean;
}

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
  mode: PairMode;
  isGm: boolean;
  /** Player mode: why self-service pairing is unavailable. */
  selfBlock: SelfPairingBlock | null;
  /** i18n key explaining {@link PairContext.selfBlock}. */
  selfBlockLabel: string | null;
  /** GM mode: glasses status per player. */
  enablement: EnablementRow[];
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

/** Groups of the manual code (dash separated); none when there is no manual code. */
export function codeGroups(code: string | null): string[] {
  return (code ?? '').split('-').filter((g) => g.length > 0);
}

/**
 * Glasses status of `player` (GM enablement list): online > paired > enabled >
 * disabled. "Paired" = self-paired (player flag) or paired on behalf (GM-held key).
 */
export function glassesStatus(
  player: Pick<FoundryUser, 'id' | 'flags'>,
  isOnline: (g2UserId: string) => boolean,
): { status: GlassesStatus; waiting: boolean } {
  const access = getAccess(player.id);
  const device = listDevices().find((d) => d.playerUserId === player.id);
  const g2UserId = access?.g2UserId ?? device?.g2UserId;
  const pub = publicKeyOf(player);
  const waiting = access !== null && (pub === null || access.sealedFor !== keyIdOf(pub));
  if (g2UserId === undefined) return { status: 'disabled', waiting };
  if (isOnline(g2UserId) || game.users.get(g2UserId)?.active === true) {
    return { status: 'online', waiting };
  }
  const selfPaired = readSelfDevice(player)?.g2UserId === g2UserId;
  // keyHolder: a GM id (paired on behalf) or undefined (legacy ADR-0016 pairing).
  const gmPaired = device !== undefined && device.keyHolder !== null;
  if (selfPaired || gmPaired) return { status: 'paired', waiting };
  return { status: access === null ? 'disabled' : 'enabled', waiting };
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
 * Creates the pairing window class bound to the projector (used for online state and
 * to seal `revoked` before a device is deleted).
 *
 * @param projector - this client's projector
 * @param mode      - `'gm'` (default) or `'player'` (self-service, «Associa i miei occhiali»)
 */
export function createPairG2App(projector: Projector, mode: PairMode = 'gm') {
  const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
  const isGmMode = mode === 'gm';

  class PairG2App extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
      id: isGmMode ? PAIR_APP_ID : PAIR_SELF_APP_ID,
      tag: 'div',
      classes: ['evf-pair-g2'],
      window: {
        title: isGmMode ? 'evf.pair.title' : 'evf.pair.self.title',
        icon: 'fas fa-glasses',
      },
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
        enable(this: PairG2App, _event: Event, target: ActionTarget): Promise<void> {
          return this.enable(target.dataset.userId === undefined ? [] : [target.dataset.userId]);
        },
        enableAll(this: PairG2App): Promise<void> {
          return this.enable(
            eligiblePlayers()
              .filter((u) => getAccess(u.id) === null)
              .map((u) => u.id),
          );
        },
        regenerate(this: PairG2App, _event: Event, target: ActionTarget): Promise<void> {
          return this.regenerate(target.dataset.userId);
        },
      },
    };

    static PARTS = { main: { template: PAIR_TEMPLATE } };

    readonly mode: PairMode = mode;
    session: PairingSession | null = null;
    expired = false;
    checks: EnvironmentCheck | null = null;
    confirmingRevoke: string | null = null;
    selectedPlayer: string | null = null;
    selectedActor: string | null = null;
    connected: ConnectedDevice | null = null;
    private ticker: ReturnType<typeof setInterval> | null = null;

    /**
     * Opens the window (preselected on `target` in GM mode), reusing the open instance
     * (ApplicationV2 ids are unique) when there is one.
     */
    static async openFor(target: PairTarget | null): Promise<PairG2App> {
      // `foundry.applications.instances` (v13+ registry of rendered ApplicationV2s) is
      // outside our minimal global typings.
      const registry = (foundry.applications as { instances?: Map<string, unknown> }).instances;
      const open = registry?.get(PairG2App.DEFAULT_OPTIONS.id);
      const app = open instanceof PairG2App ? open : new PairG2App();
      if (target !== null) app.preselect(target);
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
      const base = {
        mode: this.mode,
        isGm: isGmMode,
        session: this.session === null ? null : sessionView(this.session, now),
        expired: this.expired,
        connected: this.connected,
        checks: checkRows,
        checksOk: checkRows.every((c) => c.state === 'ok'),
        baseUrlHint: this.session?.url.split('#')[0] ?? '',
      };
      const view = isGmMode ? this.gmContext(now) : await this.selfContext();
      return {
        ...base,
        ...view,
        selfBlockLabel: view.selfBlock === null ? null : `evf.pair.self.${view.selfBlock}`,
      };
    }

    private gmContext(
      now: number,
    ): Pick<PairContext, 'selfBlock' | 'enablement' | 'players' | 'actors' | 'devices'> {
      const players = game.users.contents.filter((u) => !u.isGM && !isG2User(u));
      const actors = listPlayerCharacters();
      const player = this.selectedPlayer ?? players[0]?.id ?? null;
      const actor =
        this.selectedActor ??
        game.users.get(player ?? '')?.character?.id ??
        actors[0]?.actorId ??
        null;
      const isOnline = (id: string): boolean => projector.isOnline(id, now);
      return {
        selfBlock: null,
        enablement: players.map((u) => {
          const { status, waiting } = glassesStatus(u, isOnline);
          return {
            playerUserId: u.id,
            name: u.name ?? u.id,
            status,
            statusLabel: `evf.pair.enable.status.${status}`,
            enabled: getAccess(u.id) !== null,
            waiting,
          };
        }),
        players: players.map((u) => ({
          id: u.id,
          name: u.name ?? u.id,
          selected: u.id === player,
        })),
        actors: actors.map((a) => ({ id: a.actorId, name: a.name, selected: a.actorId === actor })),
        devices: listDevices().map((d) => {
          const online = isOnline(d.g2UserId);
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

    private async selfContext(): Promise<
      Pick<PairContext, 'selfBlock' | 'enablement' | 'players' | 'actors' | 'devices'>
    > {
      const owned = ownedCharacters();
      const device = readSelfDevice(game.user);
      const actor =
        this.selectedActor ?? device?.actorId ?? game.user.character?.id ?? owned[0]?.id ?? null;
      let selfBlock: SelfPairingBlock | null = null;
      if (getAccess(game.user.id) === null) selfBlock = 'not_enabled';
      else if ((await openMyPassword()) === null) selfBlock = 'password_pending';
      else if (owned.length === 0) selfBlock = 'no_actor';
      return {
        selfBlock,
        enablement: [],
        players: [],
        actors: owned.map((a) => ({ id: a.id, name: a.name, selected: a.id === actor })),
        devices: [],
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
        if (isGmMode) await expirePairing(g2UserId);
        else await expireSelfPairing(g2UserId);
      } catch (err) {
        console.error('[EVF] could not rotate expired pairing credentials', err);
        ui.notifications?.error(game.i18n.localize('evf.pair.error.expire'));
      }
      await this.render();
    }

    /**
     * Generates a new QR + code: for the selected player / character (GM mode, on the
     * player's behalf) or for this player's own glasses (player mode).
     */
    async pair(): Promise<void> {
      const context = await this._prepareContext();
      const player = context.players.find((p) => p.selected)?.id;
      const actor = context.actors.find((a) => a.selected)?.id;
      if ((isGmMode && player === undefined) || actor === undefined) {
        ui.notifications?.error(game.i18n.localize('evf.pair.error.select'));
        return;
      }
      try {
        this.session =
          player === undefined ? await startSelfPairing(actor) : await startPairing(player, actor);
        this.expired = false;
        this.connected = null;
      } catch (err) {
        if (err instanceof SelfPairingError) {
          ui.notifications?.error(game.i18n.localize(`evf.pair.self.${err.reason}`));
        } else {
          console.error('[EVF] pairing failed', err);
          ui.notifications?.error(game.i18n.localize('evf.pair.error.pair'));
        }
      }
      await this.render();
    }

    /** Copies the manual code to the clipboard. */
    async copyCode(): Promise<void> {
      const code = this.session?.code;
      if (code === undefined || code === null) return;
      try {
        await navigator.clipboard.writeText(code);
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

    /** «Abilita occhiali per i giocatori»: enables each player in turn (GM mode). */
    async enable(playerUserIds: readonly string[]): Promise<void> {
      let failed = false;
      for (const id of playerUserIds) {
        try {
          await enableGlasses(id);
        } catch (err) {
          failed = true;
          console.error(`[EVF] could not enable glasses for ${id}`, err);
        }
      }
      if (failed) ui.notifications?.error(game.i18n.localize('evf.pair.error.enable'));
      else if (playerUserIds.length > 0) {
        ui.notifications?.info(
          game.i18n.format('evf.pair.enable.done', { count: playerUserIds.length }),
        );
      }
      await this.render();
    }

    /** «Rigenera password» for one enabled player (GM mode). */
    async regenerate(playerUserId: string | undefined): Promise<void> {
      if (playerUserId === undefined) return;
      try {
        await regeneratePassword(playerUserId);
        ui.notifications?.info(game.i18n.localize('evf.pair.enable.regenerated'));
      } catch (err) {
        console.error('[EVF] password regeneration failed', err);
        ui.notifications?.error(game.i18n.localize('evf.pair.error.regenerate'));
      }
      await this.render();
    }

    /** The device of the open session said `hello` (online, or one-time creds used). */
    private hasConnected(g2UserId: string, now: number): boolean {
      if (projector.isOnline(g2UserId, now)) return true;
      if (!isGmMode) {
        const own = readSelfDevice(game.user);
        return own?.g2UserId === g2UserId && !own.pendingRotation;
      }
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
