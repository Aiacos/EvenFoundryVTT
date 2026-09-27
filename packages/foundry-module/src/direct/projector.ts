/**
 * Projector — the Foundry-tab end of the glasses channel (ADR-0019, keeping ADR-0016's
 * sealed protocol and ADR-0011's single workflow origin).
 *
 * The tab that showed a pairing QR serves that device: for every pairing stored in this
 * browser it holds one relay socket ({@link RelayConnection}) — under a per-device Web
 * Lock, so a single tab projects — and answers the glasses' sealed messages:
 *
 * - `hello`  → `welcome`. The first `hello` after a QR/code rotates room and key
 *   (single-use QR): the `welcome` carries them, then the projector moves to the new room
 *   and the glasses follow with a fresh `hello`. Otherwise full snapshots follow — once
 *   per link: a repeated `hello` gets only a `welcome`, and any `peer-up` (a glasses socket
 *   joining, or this tab's new socket meeting the glasses already there) starts a new link;
 *   the glasses answer every `peer-up` with a `hello`, even while welcomed.
 * - `get`    → `snapshot` (character / combat / log / map; map pictures go first as
 *   `asset` messages, see `map-assets.ts`)
 * - `invoke` → `dispatchTool` (ADR-0011; `rid` = idempotency key); token-id targets are
 *   translated to UUIDs and, on a player's tab, become that player's own targets
 * - `ping`   → `pong`
 *
 * Every request re-checks, live, that this tab's user still owns the projected actor
 * (`forbidden_actor` otherwise, audited). Deltas from the hook subscribers, write-path
 * watchers, chat log and throttled map refreshes are pushed to every welcomed device.
 *
 * The projector also owns the lifetime of an unused QR: a pending pairing is forgotten
 * when its `expiresAt` passes (timer set when its channel opens; {@link Projector.start}
 * prunes the ones that expired while no tab was open; a frame arriving after `expiresAt`
 * before the timer fired expires it too), whether or not the pairing window is still open. {@link Projector.diagnostics} tells that window what the channel sees.
 *
 * @see docs/architecture/0019-relay-pairing-player-projector.md
 * @see docs/architecture/0011-foundry-write-path-single-workflow-origin.md
 * @see packages/shared-protocol/src/direct/ (wire contract)
 */
import {
  type AppMessage,
  AppMessageSchema,
  type DeviceKey,
  GLASSES_ADDRESS,
  generateDeviceKey,
  generateRoomId,
  importDeviceKey,
  LOG_DELTA_TYPE,
  MapSnapshotSchema,
  type OpenFailure,
  open,
  PROJECTOR_ADDRESS,
  type ProjectorMessage,
  R1_ACTION_ECONOMY_TYPE,
  R1_MOVEMENT_BUDGET_TYPE,
  R1_ROLL_REQUEST_TYPE,
  SealedEnvelopeSchema,
  type SnapshotTopic,
  seal,
} from '@evf/shared-protocol';
import { MODULE_ID } from '../module-id.js';
import { getCharacterSnapshot } from '../readers/character-reader.js';
import { getCombatSnapshot } from '../readers/combat-reader.js';
import {
  type ChatMessageLike,
  getLogEventTail,
  isMessageVisibleTo,
  toLogEvent,
} from '../readers/log-reader.js';
import { writeAuditLog } from '../write-path/audit-log.js';
import { getActionEconomy } from '../write-path/combat-action-tracker.js';
import { getMovementBudget } from '../write-path/combat-movement-tracker.js';
import { hashBearer } from '../write-path/idempotency-cache.js';
import { dispatchTool, isToolId } from '../write-path/tool-registry.js';
import { MapAssetCache } from './map-assets.js';
import { readMapSnapshot, resolveTargetUuids } from './map-reader.js';
import { applyOwnTargets } from './own-targets.js';
import { userOwnsActor } from './ownership.js';
import {
  getPairing,
  listPairings,
  type Pairing,
  pruneExpired,
  removePairing,
  updatePairing,
} from './pairing-store.js';
import {
  type RelayConnection,
  RelayConnection as RelayConnectionImpl,
  type RelayHandlers,
  withProjectorLock,
} from './relay-connection.js';
import { parseRollRequest, type RollRequestMessage } from './roll-request.js';

/** Minimum interval between two map snapshots pushed to one device (ms). */
export const MAP_THROTTLE_MS = 1_000;
/** `lastSeenAt` is persisted at most this often (ms). */
export const SEEN_PERSIST_MS = 60_000;

/**
 * Snapshots pushed after `welcome`, in this order: the app goes online once it has
 * `character` + `map`, so those come first.
 */
const HELLO_SNAPSHOT_ORDER: readonly SnapshotTopic[] = ['character', 'map', 'combat', 'log'];

/** Foundry hooks after which the map snapshot is refreshed. */
const MAP_HOOKS = [
  'createToken',
  'updateToken',
  'deleteToken',
  'createWall',
  'updateWall',
  'deleteWall',
  'createTile',
  'updateTile',
  'deleteTile',
  'updateScene',
  'canvasReady',
  'targetToken',
] as const;

/** Link state of a device, as shown in the pairing window. */
export type DeviceStatus = 'offline' | 'waiting' | 'online';

/**
 * What a device's channel sees right now, shown live under the pairing QR.
 *
 * `rejected` is why the last frame from the glasses was refused (`stale`: sealed more
 * than 2 minutes away from this PC's clock; `auth`: another key, e.g. an old or foreign
 * code; `malformed`: not a valid envelope or message), cleared by the next good frame.
 */
export interface ChannelDiagnostics {
  /** This tab's relay socket is open. */
  relay: boolean;
  /** The glasses are in the relay room (`peer-up` seen). */
  glasses: boolean;
  rejected: OpenFailure | null;
}

/** Opens a relay connection (injectable for tests). */
export type ConnectionFactory = (
  relayBase: string,
  room: string,
  handlers: RelayHandlers,
) => RelayConnection;

/** Collaborators of a {@link Projector}. */
export interface ProjectorDeps {
  /**
   * Relay origin (module setting, read when a device connects) for pairings that do not
   * record their own relay (made before v0.4.2).
   */
  relayBase: () => string;
  connect?: ConnectionFactory;
  assets?: MapAssetCache;
  /** Per-device single-tab guard (see {@link withProjectorLock}). */
  lock?: (deviceId: string, hold: () => void) => () => void;
  now?: () => number;
}

/** Per-device runtime state. */
interface Channel {
  deviceId: string;
  link: RelayConnection | null;
  release: () => void;
  keyB64: string;
  linkUp: boolean;
  peerUp: boolean;
  welcomed: boolean;
  seq: number;
  /** Tail of the inbound queue: frames are handled one at a time, in arrival order. */
  inbox: Promise<void>;
  outbox: Promise<void>;
  sentAssets: Set<string>;
  seenPersistedAt: number;
  mapLastSent: number;
  mapTimer: ReturnType<typeof setTimeout> | null;
  /** Forgets the pairing when its unused QR expires (pending pairings only). */
  expiryTimer: ReturnType<typeof setTimeout> | null;
  /** Why the last frame from the glasses was refused, until a good one arrives. */
  rejected: OpenFailure | null;
}

/** Principal bound to the idempotency cache for a device (never the key). */
function principalOf(deviceId: string): string {
  return `g2:${deviceId}`;
}

type WelcomeMessage = Extract<ProjectorMessage, { t: 'welcome' }>;

/** The projector of this browser tab. */
export class Projector {
  private readonly channels = new Map<string, Channel>();
  private readonly cryptoKeys = new Map<string, DeviceKey>();
  private readonly listeners = new Set<() => void>();
  private readonly hookIds: number[] = [];
  private readonly connect: ConnectionFactory;
  private readonly assets: MapAssetCache;
  private readonly lock: (deviceId: string, hold: () => void) => () => void;
  private readonly now: () => number;

  constructor(private readonly deps: ProjectorDeps) {
    this.connect =
      deps.connect ?? ((base, room, handlers) => new RelayConnectionImpl(base, room, handlers));
    this.assets = deps.assets ?? new MapAssetCache();
    this.lock = deps.lock ?? ((id, hold) => withProjectorLock(id, hold));
    this.now = deps.now ?? Date.now;
  }

  /** Drops expired QR sessions, opens a channel per pairing and subscribes the hooks. */
  async start(): Promise<void> {
    await pruneExpired(this.now());
    for (const pairing of listPairings()) this.open(pairing.deviceId);
    for (const hook of MAP_HOOKS) {
      this.hookIds.push(Hooks.on(hook, () => this.scheduleMapForAll()));
    }
    this.hookIds.push(
      Hooks.on('createChatMessage', (message: unknown) => this.pushLogMessage(message)),
    );
  }

  /** Closes every channel and unsubscribes. */
  stop(): void {
    for (const id of this.hookIds.splice(0)) Hooks.off(id);
    for (const id of [...this.channels.keys()]) this.close(id);
  }

  /** Starts serving a pairing just saved in this browser (pairing window). */
  open(deviceId: string): void {
    if (this.channels.has(deviceId)) return;
    const pairing = getPairing(deviceId);
    if (pairing === null) return;
    const channel: Channel = {
      deviceId,
      link: null,
      release: () => {},
      keyB64: pairing.key,
      linkUp: false,
      peerUp: false,
      welcomed: false,
      seq: 0,
      inbox: Promise.resolve(),
      outbox: Promise.resolve(),
      sentAssets: new Set(),
      seenPersistedAt: 0,
      mapLastSent: 0,
      mapTimer: null,
      expiryTimer: null,
      rejected: null,
    };
    this.channels.set(deviceId, channel);
    if (pairing.expiresAt !== null) {
      channel.expiryTimer = setTimeout(
        () => {
          channel.expiryTimer = null;
          this.expire(deviceId).catch((err: unknown) => {
            console.error(`[EVF] projector: could not forget the expired QR of ${deviceId}`, err);
          });
        },
        Math.max(0, pairing.expiresAt - this.now()),
      );
    }
    channel.release = this.lock(deviceId, () => {
      if (this.channels.get(deviceId) !== channel) return;
      // The relay the pairing was made on: the glasses keep dialling the relay of their QR
      // even after the relay setting of this browser changed.
      channel.link = this.connect(pairing.relay ?? this.deps.relayBase(), pairing.room, {
        onFrame: (frame) => {
          // Serialised: two `hello`s racing on a fresh QR (the glasses re-send on the
          // relay's `peer-up`) must not rotate the secrets twice.
          channel.inbox = channel.inbox
            .then(() => this.handleFrame(channel, frame))
            .catch((err: unknown) => {
              console.error('[EVF] projector: unhandled error while handling a frame', err);
            });
        },
        onPeer: (up) => {
          channel.peerUp = up;
          // Down: the glasses left. Up: a glasses socket joined — a new link that needs
          // the full state again (after its `hello`).
          channel.welcomed = false;
          this.emit();
        },
        onLink: (up) => {
          channel.linkUp = up;
          this.emit();
        },
      });
      channel.link.start();
    });
  }

  /** Link state of a device for the pairing window. */
  status(deviceId: string): DeviceStatus {
    const channel = this.channels.get(deviceId);
    if (channel === undefined || !channel.linkUp) return 'offline';
    return channel.peerUp && channel.welcomed ? 'online' : 'waiting';
  }

  /** Live view of a device's channel for the pairing window (all false when not served). */
  diagnostics(deviceId: string): ChannelDiagnostics {
    const channel = this.channels.get(deviceId);
    if (channel === undefined) return { relay: false, glasses: false, rejected: null };
    return { relay: channel.linkUp, glasses: channel.peerUp, rejected: channel.rejected };
  }

  /** Subscribes to status changes (pairing window); returns the unsubscribe function. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Revokes a device: notifies the glasses (best effort), closes the channel and forgets
   * the pairing in this browser.
   */
  async revoke(deviceId: string): Promise<void> {
    const channel = this.channels.get(deviceId);
    if (channel?.link?.connected === true) {
      try {
        await this.send(channel, { t: 'revoked' });
      } catch (err) {
        console.warn(`[EVF] could not notify ${deviceId} of the revocation`, err);
      }
    }
    this.close(deviceId);
    await removePairing(deviceId);
    this.emit();
  }

  /** The unused QR of `deviceId` expired: close its channel and forget it (no notice). */
  private async expire(deviceId: string): Promise<void> {
    if (getPairing(deviceId)?.expiresAt === null) return;
    this.close(deviceId);
    await removePairing(deviceId);
    this.emit();
  }

  // ─── Inbound ────────────────────────────────────────────────────────────────

  /**
   * Validates, authenticates and handles one relay frame. Anything not addressed to the
   * projector or failing authentication is dropped (and warned).
   */
  async handleFrame(channel: Channel, frame: unknown): Promise<void> {
    const parsed = SealedEnvelopeSchema.safeParse(frame);
    if (!parsed.success) {
      this.noteRejection(channel, 'malformed');
      return;
    }
    if (parsed.data.to !== PROJECTOR_ADDRESS || parsed.data.from !== GLASSES_ADDRESS) return;
    const opened = await open(await this.cryptoKey(channel.keyB64), parsed.data, this.now());
    if (!opened.ok) {
      console.warn(`[EVF] projector: rejected a frame for ${channel.deviceId} (${opened.reason})`);
      this.noteRejection(channel, opened.reason);
      return;
    }
    const message = AppMessageSchema.safeParse(opened.message);
    if (!message.success) {
      console.warn(`[EVF] projector: malformed message for ${channel.deviceId}`);
      this.noteRejection(channel, 'malformed');
      return;
    }
    this.noteRejection(channel, null);
    const pairing = getPairing(channel.deviceId);
    if (pairing === null) return;
    if (pairing.expiresAt !== null && pairing.expiresAt <= this.now()) {
      // The QR expired on this tab's clock but its timer has not fired (timers are late
      // after a sleeping laptop): single use within 5 minutes holds regardless.
      await this.expire(channel.deviceId);
      return;
    }
    await this.touch(channel, pairing);
    await this.dispatch(channel, pairing, message.data);
  }

  /** Records why the last glasses frame was refused (null: accepted); emits on change. */
  private noteRejection(channel: Channel, reason: OpenFailure | null): void {
    if (channel.rejected === reason) return;
    channel.rejected = reason;
    this.emit();
  }

  private async dispatch(channel: Channel, pairing: Pairing, message: AppMessage): Promise<void> {
    switch (message.t) {
      case 'hello':
        await this.onHello(channel, pairing, message.rid);
        return;
      case 'get':
        if (!(await this.authorized(channel, pairing, message.rid, `get:${message.what}`, null)))
          return;
        await this.sendSnapshot(channel, pairing, message.what, message.rid);
        return;
      case 'invoke':
        await this.onInvoke(channel, pairing, message.rid, message.tool, message.input);
        return;
      case 'ping':
        await this.send(channel, { t: 'pong', rid: message.rid });
        return;
    }
  }

  /**
   * Live ownership check: this tab's user must still own the projected actor. A denial
   * answers `forbidden_actor`, is logged and leaves a GM-whispered audit entry.
   *
   * @returns whether the request may proceed
   */
  private async authorized(
    channel: Channel,
    pairing: Pairing,
    rid: string,
    what: string,
    input: unknown,
  ): Promise<boolean> {
    if (userOwnsActor(pairing.actorId, game.user.id)) return true;
    const error = 'forbidden_actor';
    console.warn(
      `[EVF] projector: denied ${what} for ${pairing.deviceId} — ${game.user.id} no longer owns actor ${pairing.actorId}`,
    );
    this.fireAndForget(
      hashBearer(principalOf(pairing.deviceId)).then((hash) =>
        writeAuditLog({
          tool: what,
          payload: input,
          idempotencyKey: rid,
          actorId: pairing.actorId,
          result: { success: false, error },
          timestamp: this.now(),
          bearer_id: hash.slice(0, 8),
        }),
      ),
    );
    await this.send(channel, {
      t: 'result',
      rid,
      ok: false,
      error: { code: error, message: 'you no longer own this character' },
    });
    return false;
  }

  private async onHello(channel: Channel, pairing: Pairing, rid: string): Promise<void> {
    const actor = game.actors.get(pairing.actorId);
    if (actor === undefined) {
      await this.send(channel, {
        t: 'result',
        rid,
        ok: false,
        error: { code: 'actor_missing', message: `actor ${pairing.actorId} no longer exists` },
      });
      return;
    }
    if (!(await this.authorized(channel, pairing, rid, 'hello', null))) return;
    const moduleVersion = game.modules?.get(MODULE_ID)?.version;
    const welcome: WelcomeMessage = {
      t: 'welcome',
      rid,
      actorId: actor.id,
      actorName: actor.name,
      userName: game.user.name ?? '',
      gmName: game.users.activeGM?.name ?? '',
      worldTitle: game.world?.title ?? '',
      ...(game.i18n?.lang ? { locale: game.i18n.lang } : {}),
      ...(moduleVersion ? { moduleVersion } : {}),
    };

    if (pairing.expiresAt !== null) {
      // First contact through the QR/code: hand over fresh secrets and move rooms. The
      // glasses persist them, follow into the new room and say `hello` again.
      const rotate = { room: generateRoomId(), key: generateDeviceKey() };
      await this.send(channel, { ...welcome, rotate });
      await updatePairing(pairing.deviceId, { ...rotate, expiresAt: null });
      channel.keyB64 = rotate.key;
      channel.welcomed = false;
      channel.sentAssets.clear();
      if (channel.expiryTimer !== null) clearTimeout(channel.expiryTimer);
      channel.expiryTimer = null;
      channel.link?.switchRoom(rotate.room);
      this.emit();
      return;
    }
    await this.send(channel, welcome);
    // A repeated `hello` on this link: the state is already on its way — a second full
    // push would only double the burst (relay 60 frames/s cap on big scenes, H6).
    if (channel.welcomed) return;
    channel.welcomed = true;
    channel.sentAssets.clear();
    this.emit();
    await this.pushAllSnapshots(channel, pairing);
  }

  private async pushAllSnapshots(channel: Channel, pairing: Pairing): Promise<void> {
    for (const what of HELLO_SNAPSHOT_ORDER) await this.sendSnapshot(channel, pairing, what);
    // Combat trackers only emit on change: prime the device with the current turn state.
    if (game.combat !== null && game.combat !== undefined) {
      await this.sendDelta(
        channel,
        R1_ACTION_ECONOMY_TYPE,
        getActionEconomy(pairing.actorId, game.user.id),
      );
      await this.sendDelta(channel, R1_MOVEMENT_BUDGET_TYPE, getMovementBudget(pairing.actorId));
    }
  }

  private async onInvoke(
    channel: Channel,
    pairing: Pairing,
    rid: string,
    tool: string,
    input: unknown,
  ): Promise<void> {
    const fail = (code: string, message: string): Promise<void> =>
      this.send(channel, { t: 'result', rid, ok: false, error: { code, message } });

    if (!isToolId(tool)) return fail('unknown_tool', `unknown tool "${tool}"`);
    if (!(await this.authorized(channel, pairing, rid, tool, input))) return;
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      return fail('invalid_input', 'input must be an object');
    }
    const args = input as Record<string, unknown>;
    if (args.actor_id !== undefined && args.actor_id !== pairing.actorId) {
      return fail('forbidden_actor', 'a G2 device may only act for its paired actor');
    }
    // The HUD picks targets by MapSnapshot token id; the write path / MidiQOL
    // `targetUuids` need document UUIDs. Only tokens visible on the projected scene pass.
    let targets: string[] | undefined;
    if (args.targets !== undefined) {
      const ids = args.targets;
      if (!Array.isArray(ids) || !ids.every((id): id is string => typeof id === 'string')) {
        return fail('invalid_input', 'targets must be an array of token ids');
      }
      const resolved = resolveTargetUuids(ids);
      if (!resolved.ok) {
        return fail('invalid_target', `token ${resolved.invalidId} is not visible on the scene`);
      }
      targets = resolved.uuids;
      // A player's tab acts as that player: vanilla dnd5e reads `game.user.targets`.
      if (!game.user.isGM) applyOwnTargets(ids);
    }
    const result = await dispatchTool(tool, {
      args: { ...args, ...(targets !== undefined ? { targets } : {}), actor_id: pairing.actorId },
      idempotencyKey: rid,
      bearer: principalOf(pairing.deviceId),
    });
    if (result.success) {
      await this.send(channel, { t: 'result', rid, ok: true, data: result.data });
    } else {
      await fail(result.error, result.error);
    }
  }

  // ─── Snapshots ──────────────────────────────────────────────────────────────

  /** Builds the snapshot payload of `what` for a pairing (null when not available). */
  snapshot(pairing: Pairing, what: Exclude<SnapshotTopic, 'map'>): unknown {
    switch (what) {
      case 'character':
        return getCharacterSnapshot(pairing.actorId);
      case 'combat':
        return getCombatSnapshot();
      case 'log':
        return { events: getLogEventTail(50, [game.user.id]) };
    }
  }

  private async sendSnapshot(
    channel: Channel,
    pairing: Pairing,
    what: SnapshotTopic,
    rid?: string,
  ): Promise<void> {
    const ridPart = rid === undefined ? {} : { rid };
    if (what !== 'map') {
      await this.send(channel, {
        t: 'snapshot',
        ...ridPart,
        what,
        data: this.snapshot(pairing, what),
      });
      return;
    }
    const raw = readMapSnapshot({ actorId: pairing.actorId, userId: game.user.id });
    const parsed = raw === null ? null : MapSnapshotSchema.safeParse(raw);
    if (parsed === null || !parsed.success) {
      if (parsed !== null) console.warn('[EVF] projector: map snapshot failed validation');
      await this.send(channel, { t: 'snapshot', ...ridPart, what, data: null });
      return;
    }
    const prepared = await this.assets.prepare(parsed.data);
    for (const asset of prepared.assets) {
      if (channel.sentAssets.has(asset.id)) continue;
      // Marked before the (paced) send: a concurrent map snapshot of this device must not
      // queue the same picture again. Frames leave in queue order, so its snapshot still
      // follows this asset.
      channel.sentAssets.add(asset.id);
      try {
        await this.send(channel, { t: 'asset', id: asset.id, data: asset.data });
      } catch (err) {
        channel.sentAssets.delete(asset.id);
        throw err;
      }
    }
    await this.send(channel, { t: 'snapshot', ...ridPart, what, data: prepared.map });
  }

  // ─── Outbound ───────────────────────────────────────────────────────────────

  /**
   * Pushes a delta to every welcomed device concerned by `data`: payloads carrying an
   * `actorId` go only to devices paired with that actor, payloads naming a user only when
   * that user is this tab's user, everything else to all.
   *
   * Fire-and-forget (hook callbacks are synchronous); failures are logged.
   */
  readonly pushDelta = (topic: string, data: unknown): void => {
    for (const { channel, pairing } of this.welcomedDevices()) {
      if (!concerns(pairing, data)) continue;
      this.fireAndForget(this.sendDelta(channel, topic, data));
    }
  };

  /** Actors currently projected by this tab (combat trackers watch them). */
  projectedActors(): string[] {
    return listPairings().map((p) => p.actorId);
  }

  /**
   * Relays a new chat message to the devices that may see it: as a log event and, for a
   * dnd5e roll-request card, as an `r1.roll.request` delta (sheet page switch, S8).
   */
  private pushLogMessage(message: unknown): void {
    if (typeof message !== 'object' || message === null) return;
    const chat = message as ChatMessageLike & RollRequestMessage;
    if (!isMessageVisibleTo(chat, [game.user.id])) return;
    const event = toLogEvent(chat);
    const request = parseRollRequest(chat);
    for (const { channel } of this.welcomedDevices()) {
      if (event !== null) this.fireAndForget(this.sendDelta(channel, LOG_DELTA_TYPE, event));
      if (request !== null) {
        this.fireAndForget(this.sendDelta(channel, R1_ROLL_REQUEST_TYPE, request));
      }
    }
  }

  private scheduleMapForAll(): void {
    for (const { channel } of this.welcomedDevices()) this.scheduleMap(channel);
  }

  /** Coalesces map refreshes to at most one per {@link MAP_THROTTLE_MS} per device. */
  private scheduleMap(channel: Channel): void {
    if (channel.mapTimer !== null) return;
    const wait = Math.max(0, channel.mapLastSent + MAP_THROTTLE_MS - this.now());
    channel.mapTimer = setTimeout(() => {
      channel.mapTimer = null;
      channel.mapLastSent = this.now();
      const pairing = getPairing(channel.deviceId);
      if (pairing === null || !channel.welcomed) return;
      this.fireAndForget(this.sendSnapshot(channel, pairing, 'map'));
    }, wait);
  }

  private welcomedDevices(): Array<{ channel: Channel; pairing: Pairing }> {
    const out: Array<{ channel: Channel; pairing: Pairing }> = [];
    for (const channel of this.channels.values()) {
      if (!channel.welcomed) continue;
      const pairing = getPairing(channel.deviceId);
      if (pairing !== null) out.push({ channel, pairing });
    }
    return out;
  }

  private sendDelta(channel: Channel, topic: string, data: unknown): Promise<void> {
    channel.seq++;
    return this.send(channel, { t: 'delta', seq: channel.seq, topic, data });
  }

  /**
   * Seals and sends `message`, **in call order per device**: sealing is async
   * (WebCrypto), so without this queue a later, faster seal could overtake an earlier
   * one (deltas out of `seq` order, a snapshot before the `welcome`). Resolves once the
   * relay socket took the frame (paced, see {@link RelayConnection.send}). A failed send
   * does not block the ones queued after it.
   */
  private send(channel: Channel, message: ProjectorMessage): Promise<void> {
    const keyB64 = channel.keyB64;
    const next = channel.outbox
      .catch(() => undefined)
      .then(async () => {
        const envelope = await seal(
          await this.cryptoKey(keyB64),
          PROJECTOR_ADDRESS,
          GLASSES_ADDRESS,
          message,
          this.now(),
        );
        const link = channel.link;
        try {
          if (link === null) throw new Error('relay not connected');
          await link.send(envelope);
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err);
          throw new Error(`${reason} (${message.t} to ${channel.deviceId} dropped)`);
        }
      });
    channel.outbox = next;
    return next;
  }

  private async touch(channel: Channel, pairing: Pairing): Promise<void> {
    const now = this.now();
    if (now - channel.seenPersistedAt < SEEN_PERSIST_MS) return;
    channel.seenPersistedAt = now;
    await updatePairing(pairing.deviceId, { lastSeenAt: now });
  }

  private close(deviceId: string): void {
    const channel = this.channels.get(deviceId);
    if (channel === undefined) return;
    this.channels.delete(deviceId);
    if (channel.mapTimer !== null) clearTimeout(channel.mapTimer);
    if (channel.expiryTimer !== null) clearTimeout(channel.expiryTimer);
    channel.link?.stop();
    channel.release();
  }

  private async cryptoKey(b64: string): Promise<DeviceKey> {
    const cached = this.cryptoKeys.get(b64);
    if (cached !== undefined) return cached;
    const imported = await importDeviceKey(b64);
    this.cryptoKeys.set(b64, imported);
    return imported;
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  private fireAndForget(p: Promise<void>): void {
    p.catch((err: unknown) => {
      console.error('[EVF] projector: failed to push to a G2 device', err);
    });
  }
}

/** Routing rule of {@link Projector.pushDelta}. */
function concerns(pairing: Pairing, data: unknown): boolean {
  if (typeof data !== 'object' || data === null) return true;
  const d = data as Record<string, unknown>;
  if (typeof d.actorId === 'string') return d.actorId === pairing.actorId;
  if (typeof d.recipientUserId === 'string') return d.recipientUserId === game.user.id;
  if (typeof d.userId === 'string') return d.userId === game.user.id;
  return true;
}
