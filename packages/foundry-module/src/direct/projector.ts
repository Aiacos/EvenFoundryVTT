/**
 * Direct projector — the Foundry-client end of the G2 channel (ADR-0016 §Decision
 * Outcome 5, amended by ADR-0017 §Decision 6).
 *
 * Listens on the Foundry socket relay (`module.evenfoundryvtt`) for sealed envelopes
 * addressed to {@link PROJECTOR_ADDRESS}, authenticates them with the sender device's
 * AES key, and — **only when this client is the elected responder of that device**
 * (`election.ts`: the player's own client when connected and holding the key, else a
 * GM that can open the key) — answers:
 *
 * - `hello`  → `welcome` (+ one-time key rotation; the password too when a GM answers
 *   for a device it paired) then full snapshots
 * - `get`    → `snapshot` of character / combat / log / map for the paired actor
 * - `invoke` → `dispatchTool` (ADR-0011 single-workflow-origin, one origin per device
 *   at a time), `rid` = idempotency key; `targets` (MapSnapshot token ids) are translated
 *   to token document UUIDs, and on a player client also become that player's own
 *   Foundry targets (vanilla dnd5e reads `game.user.targets`)
 * - after the hello snapshots, during combat: the paired actor's action economy and
 *   movement budget (`r1.action.economy`, `r1.movement.budget` deltas)
 * - `ping`   → `pong`
 *
 * It also pushes `delta` messages (hook subscribers, write-path watchers, chat log,
 * throttled map refreshes) to every online device it is elected for.
 *
 * Every client runs a projector (players too). A non-elected client that can open the
 * key still tracks the device as online, so it can take over immediately — with fresh
 * snapshots — when the election changes (`userConnected`). Every message leaves sealed
 * `from` {@link PROJECTOR_ADDRESS}: the glasses do not care which client answered.
 *
 * @see docs/architecture/0016-direct-foundry-streaming.md
 * @see docs/architecture/0017-player-owned-glasses-hybrid-projector.md
 * @see docs/architecture/0011-foundry-write-path-single-workflow-origin.md
 * @see packages/shared-protocol/src/direct/ (wire contract)
 */
import {
  type AppMessage,
  AppMessageSchema,
  DIRECT_SOCKET_EVENT,
  deviceKeyContext,
  generateDeviceKey,
  importDeviceKey,
  LOG_DELTA_TYPE,
  MAX_ENVELOPE_AGE_MS,
  open,
  openSealed,
  PROJECTOR_ADDRESS,
  type ProjectorMessage,
  R1_ACTION_ECONOMY_TYPE,
  R1_MOVEMENT_BUDGET_TYPE,
  R1_ROLL_REQUEST_TYPE,
  SealedEnvelopeSchema,
  type SnapshotTopic,
  seal,
} from '@evf/shared-protocol';
import { getCharacterSnapshot } from '../readers/character-reader.js';
import { getCombatSnapshot } from '../readers/combat-reader.js';
import {
  type ChatMessageLike,
  getLogEventTail,
  isMessageVisibleTo,
  toLogEvent,
} from '../readers/log-reader.js';
import { getActionEconomy } from '../write-path/combat-action-tracker.js';
import { getMovementBudget } from '../write-path/combat-movement-tracker.js';
import { dispatchTool, isToolId } from '../write-path/tool-registry.js';
import { type DeviceContext, deviceContext } from './election.js';
import { generatePassword, setG2Password } from './g2-user.js';
import { deliverPassword } from './glasses-access.js';
import { myPrivateKey } from './identity-keys.js';
import { readMapSnapshot, resolveTargetUuids } from './map-reader.js';
import { applyOwnTargets } from './own-targets.js';
import {
  type DeviceMeta,
  getDevice,
  listDevices,
  setDeviceKey,
  touchDevice,
  updateDeviceMeta,
} from './pairing-store.js';
import { parseRollRequest, type RollRequestMessage } from './roll-request.js';
import { rotateSelfKey } from './self-pairing.js';

/** After a key rotation the previous key stays accepted this long (ms). */
export const KEY_GRACE_MS = 60_000;
/** Minimum interval between two map snapshots pushed to one device (ms). */
export const MAP_THROTTLE_MS = 1_000;
/** A device is "online" if it sent an authenticated message within this window (ms). */
export const ONLINE_WINDOW_MS = MAX_ENVELOPE_AGE_MS;

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
  'updateScene',
  'canvasReady',
  'targetToken',
] as const;

interface MapThrottle {
  lastSentAt: number;
  timer: ReturnType<typeof setTimeout> | null;
}

/** Principal bound to the idempotency cache for a device (never the key). */
function principalOf(g2UserId: string): string {
  return `g2:${g2UserId}`;
}

type WelcomeMessage = Extract<ProjectorMessage, { t: 'welcome' }>;

/** The metadata a device is served with: `actorId` = the effective projected actor. */
function servedMeta(ctx: DeviceContext): DeviceMeta {
  return { ...ctx.meta, actorId: ctx.actorId };
}

/**
 * Stateful projector. One instance per client (GM or player), created on `ready`.
 */
export class Projector {
  private readonly online = new Map<string, number>();
  /** Last key that authenticated each device (used for pushes). */
  private readonly activeKeys = new Map<string, string>();
  /** Last responder seen per device (detects election changes). */
  private readonly responders = new Map<string, string | null>();
  /** GM-sealed device keys already opened, by ciphertext. */
  private readonly openedGmKeys = new Map<string, string | null>();
  private readonly seq = new Map<string, number>();
  private readonly graceKeys = new Map<string, { key: string; until: number }>();
  private readonly cryptoKeys = new Map<string, CryptoKey>();
  private readonly mapThrottle = new Map<string, MapThrottle>();
  private readonly hookIds: number[] = [];
  private readonly onSocket = (data: unknown): void => {
    void this.handleEnvelope(data).catch((err: unknown) => {
      console.error('[EVF] projector: unhandled error while handling an envelope', err);
    });
  };

  /**
   * Subscribes to the socket relay and to the map / chat hooks.
   *
   * @throws when `game.socket` is unavailable (called before `ready`)
   */
  start(): void {
    if (game.socket === undefined)
      throw new Error('game.socket unavailable — start the projector on ready');
    game.socket.on(DIRECT_SOCKET_EVENT, this.onSocket);
    for (const hook of MAP_HOOKS) {
      this.hookIds.push(Hooks.on(hook, () => this.scheduleMapForAll()));
    }
    this.hookIds.push(
      Hooks.on('createChatMessage', (message: unknown) => this.pushLogMessage(message)),
      Hooks.on('userConnected', () => this.onPresenceChange()),
    );
  }

  /** Unsubscribes everything and cancels pending map timers. */
  stop(): void {
    game.socket?.off?.(DIRECT_SOCKET_EVENT, this.onSocket);
    for (const id of this.hookIds.splice(0)) Hooks.off(id);
    for (const t of this.mapThrottle.values()) if (t.timer !== null) clearTimeout(t.timer);
    this.mapThrottle.clear();
  }

  /** Whether `g2UserId` sent an authenticated message recently. */
  isOnline(g2UserId: string, now: number = Date.now()): boolean {
    const seen = this.online.get(g2UserId);
    return seen !== undefined && now - seen < ONLINE_WINDOW_MS;
  }

  // ─── Inbound ────────────────────────────────────────────────────────────────

  /**
   * Validates, authenticates and handles one relay payload. Anything not addressed to
   * the projector, from an unknown sender, or failing authentication is dropped; a
   * device this client is not elected for is only marked online.
   */
  async handleEnvelope(raw: unknown, now: number = Date.now()): Promise<void> {
    const parsed = SealedEnvelopeSchema.safeParse(raw);
    if (!parsed.success || parsed.data.to !== PROJECTOR_ADDRESS) return;
    const envelope = parsed.data;
    const device = getDevice(envelope.from);
    if (device === null) return;
    const ctx = deviceContext(device.meta);
    const elected = ctx.responderId === game.user.id;
    const key = await this.localKey(ctx);
    if (key === null) return;

    const opened = await this.openWithKeys(envelope, key, now);
    if (opened === null) {
      if (elected) {
        console.warn(
          `[EVF] projector: rejected envelope from ${envelope.from} (authentication failed)`,
        );
      }
      return;
    }
    const g2UserId = device.meta.g2UserId;
    this.online.set(g2UserId, now);
    this.activeKeys.set(g2UserId, key);
    this.responders.set(g2UserId, ctx.responderId);
    if (!elected) return;

    const message = AppMessageSchema.safeParse(opened);
    if (!message.success) {
      console.warn(
        `[EVF] projector: malformed message from ${envelope.from}`,
        message.error.message,
      );
      return;
    }
    await touchDevice(g2UserId, now);
    await this.dispatch(ctx, key, message.data);
  }

  /**
   * The device key THIS client can use for `ctx`, or null: the player's own storage
   * for a self-paired device on the player's client, the player's `gmKeys` entry for
   * this GM (opened with this client's identity key), or this browser's storage for a
   * device paired on the player's behalf / legacy record.
   */
  private async localKey(ctx: DeviceContext): Promise<string | null> {
    const { g2UserId, playerUserId } = ctx.meta;
    if (ctx.selfDevice === null || game.user.id === playerUserId) {
      return getDevice(g2UserId)?.key ?? null;
    }
    if (!game.user.isGM) return null;
    const entry = ctx.gmKeys[game.user.id];
    if (entry === undefined) return null;
    const cached = this.openedGmKeys.get(entry.blob.ct);
    if (cached !== undefined) return cached;
    const priv = await myPrivateKey();
    const key =
      priv === null
        ? null
        : await openSealed(priv, entry.blob, deviceKeyContext(g2UserId, game.user.id));
    this.openedGmKeys.set(entry.blob.ct, key);
    return key;
  }

  private async openWithKeys(
    envelope: Parameters<typeof open>[1],
    key: string,
    now: number,
  ): Promise<Record<string, unknown> | null> {
    const result = await open(await this.cryptoKey(key), envelope, now);
    if (result.ok) return result.message;
    const grace = this.graceKeys.get(envelope.from);
    if (result.reason !== 'auth' || grace === undefined || grace.until < now) return null;
    const retry = await open(await this.cryptoKey(grace.key), envelope, now);
    return retry.ok ? retry.message : null;
  }

  private async dispatch(ctx: DeviceContext, key: string, message: AppMessage): Promise<void> {
    const meta = servedMeta(ctx);
    switch (message.t) {
      case 'hello':
        await this.onHello(ctx, key, message.rid);
        return;
      case 'get':
        await this.send(meta.g2UserId, key, {
          t: 'snapshot',
          rid: message.rid,
          what: message.what,
          data: this.snapshot(meta, message.what),
        });
        return;
      case 'invoke':
        await this.onInvoke(meta, key, message.rid, message.tool, message.input);
        return;
      case 'ping':
        await this.send(meta.g2UserId, key, { t: 'pong', rid: message.rid });
        return;
    }
  }

  private async onHello(ctx: DeviceContext, key: string, rid: string): Promise<void> {
    const meta = servedMeta(ctx);
    const actor = game.actors.get(meta.actorId);
    if (actor === undefined) {
      await this.send(meta.g2UserId, key, {
        t: 'result',
        rid,
        ok: false,
        error: { code: 'actor_missing', message: `actor ${meta.actorId} no longer exists` },
      });
      return;
    }
    const welcome: WelcomeMessage = {
      t: 'welcome',
      rid,
      actorId: actor.id,
      actorName: actor.name,
      userName: meta.label,
      gmName: game.users.activeGM?.name ?? '',
      worldTitle: game.world?.title ?? '',
      ...(game.i18n?.lang ? { locale: game.i18n.lang } : {}),
    };

    if (ctx.selfDevice?.pendingRotation === true && game.user.id === meta.playerUserId) {
      await this.rotateSelfPaired(meta, key, welcome);
      return;
    }
    if (ctx.selfDevice === null && meta.pendingRotation && game.user.isGM) {
      await this.rotateGmPaired(meta, key, welcome);
      return;
    }
    await this.send(meta.g2UserId, key, welcome);
    await this.pushAllSnapshots(meta, key);
  }

  /**
   * Player client, first `hello` after a self-service QR: only the device key rotates
   * (a player cannot change a Foundry password); the new key is re-sealed for the GMs.
   */
  private async rotateSelfPaired(
    meta: DeviceMeta,
    key: string,
    welcome: WelcomeMessage,
  ): Promise<void> {
    const newKey = generateDeviceKey();
    await this.send(meta.g2UserId, key, { ...welcome, rotate: { key: newKey } });
    this.graceKeys.set(meta.g2UserId, { key, until: Date.now() + KEY_GRACE_MS });
    this.activeKeys.set(meta.g2UserId, newKey);
    await rotateSelfKey(meta.g2UserId, newKey);
    await this.pushAllSnapshots(meta, newKey);
  }

  /**
   * GM client, first `hello` after a QR shown on the player's behalf: one-time
   * credentials. The new Foundry password is set first (if it fails the welcome goes
   * out without `rotate` and the QR stays valid), the new key is sent sealed with the
   * OLD key, then persisted; the old key stays accepted for a grace period. When the
   * player has glasses enabled, the new password is re-delivered sealed to them.
   */
  private async rotateGmPaired(
    meta: DeviceMeta,
    key: string,
    welcome: WelcomeMessage,
  ): Promise<void> {
    const password = generatePassword();
    const newKey = generateDeviceKey();
    try {
      await setG2Password(meta.g2UserId, password);
    } catch (err) {
      console.error(
        `[EVF] projector: password rotation failed for ${meta.g2UserId}; keeping pairing credentials`,
        err,
      );
      await this.send(meta.g2UserId, key, welcome);
      await this.pushAllSnapshots(meta, key);
      return;
    }
    await this.send(meta.g2UserId, key, {
      ...welcome,
      rotate: { password, key: newKey },
    });
    this.graceKeys.set(meta.g2UserId, { key, until: Date.now() + KEY_GRACE_MS });
    this.activeKeys.set(meta.g2UserId, newKey);
    await setDeviceKey(meta.g2UserId, newKey);
    await updateDeviceMeta(meta.g2UserId, { pendingRotation: false });
    await deliverPassword(meta.playerUserId, meta.g2UserId, password);
    await this.pushAllSnapshots(meta, newKey);
  }

  private async pushAllSnapshots(meta: DeviceMeta, key: string): Promise<void> {
    for (const what of HELLO_SNAPSHOT_ORDER) {
      await this.send(meta.g2UserId, key, { t: 'snapshot', what, data: this.snapshot(meta, what) });
    }
    // Combat trackers only emit on change: prime the device with the current turn state.
    if (game.combat !== null && game.combat !== undefined) {
      await this.sendDelta(
        meta.g2UserId,
        key,
        R1_ACTION_ECONOMY_TYPE,
        getActionEconomy(meta.actorId, meta.playerUserId),
      );
      await this.sendDelta(
        meta.g2UserId,
        key,
        R1_MOVEMENT_BUDGET_TYPE,
        getMovementBudget(meta.actorId),
      );
    }
  }

  private async onInvoke(
    meta: DeviceMeta,
    key: string,
    rid: string,
    tool: string,
    input: unknown,
  ): Promise<void> {
    const fail = (code: string, message: string): Promise<void> =>
      this.send(meta.g2UserId, key, { t: 'result', rid, ok: false, error: { code, message } });

    if (!isToolId(tool)) return fail('unknown_tool', `unknown tool "${tool}"`);
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      return fail('invalid_input', 'input must be an object');
    }
    const args = input as Record<string, unknown>;
    if (args.actor_id !== undefined && args.actor_id !== meta.actorId) {
      return fail('forbidden_actor', 'a G2 device may only act for its paired actor');
    }
    // The HUD picks targets by MapSnapshot token id (small wire, simple HUD); the write
    // path / MidiQOL `targetUuids` need document UUIDs. Only tokens this device can
    // see on the projected scene are accepted.
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
      // A player client acts as that player: vanilla dnd5e reads `game.user.targets`.
      if (!game.user.isGM) applyOwnTargets(ids);
    }
    const result = await dispatchTool(tool, {
      args: { ...args, ...(targets !== undefined ? { targets } : {}), actor_id: meta.actorId },
      idempotencyKey: rid,
      bearer: principalOf(meta.g2UserId),
    });
    if (result.success) {
      await this.send(meta.g2UserId, key, { t: 'result', rid, ok: true, data: result.data });
    } else {
      await fail(result.error, result.error);
    }
  }

  // ─── Snapshots ──────────────────────────────────────────────────────────────

  /** Builds the snapshot payload of `what` for a device (null when not available). */
  snapshot(meta: DeviceMeta, what: SnapshotTopic): unknown {
    switch (what) {
      case 'character':
        return getCharacterSnapshot(meta.actorId);
      case 'combat':
        return getCombatSnapshot();
      case 'log':
        return { events: getLogEventTail(50, [meta.playerUserId, meta.g2UserId]) };
      case 'map':
        return readMapSnapshot({
          actorId: meta.actorId,
          playerUserId: meta.playerUserId,
          g2UserId: meta.g2UserId,
        });
    }
  }

  // ─── Outbound ───────────────────────────────────────────────────────────────

  /**
   * Pushes a delta to every online device concerned by `data`: payloads carrying an
   * `actorId` go only to devices paired with that actor, payloads carrying a `userId`
   * only to the device of that player / G2 user, everything else to all.
   *
   * Fire-and-forget (hook callbacks are synchronous); failures are logged.
   */
  readonly pushDelta = (topic: string, data: unknown): void => {
    for (const { meta, key } of this.onlineDevices()) {
      if (!concerns(meta, data)) continue;
      this.fireAndForget(this.sendDelta(meta.g2UserId, key, topic, data));
    }
  };

  /**
   * Sends `{t:'revoked'}` to a device (before the GM deletes it). No-op when this
   * client cannot open the device key.
   */
  async revoke(g2UserId: string): Promise<void> {
    const device = getDevice(g2UserId);
    if (device === null) return;
    const key = this.activeKeys.get(g2UserId) ?? (await this.localKey(deviceContext(device.meta)));
    if (key === null) return;
    await this.send(g2UserId, key, { t: 'revoked' });
    this.online.delete(g2UserId);
    this.activeKeys.delete(g2UserId);
    this.graceKeys.delete(g2UserId);
  }

  /**
   * Election may have changed (a user connected or left): push full snapshots to every
   * online device this client just became responder for, so a projector switch is
   * seamless for the glasses.
   */
  private onPresenceChange(): void {
    for (const meta of listDevices()) {
      const key = this.activeKeys.get(meta.g2UserId);
      if (key === undefined || !this.isOnline(meta.g2UserId)) continue;
      const ctx = deviceContext(meta);
      const previous = this.responders.get(meta.g2UserId);
      this.responders.set(meta.g2UserId, ctx.responderId);
      if (ctx.responderId === game.user.id && previous !== game.user.id) {
        this.fireAndForget(this.pushAllSnapshots(servedMeta(ctx), key));
      }
    }
  }

  /**
   * Relays a new chat message to the devices that may see it: as a log event and, for
   * a dnd5e roll-request card, as an `r1.roll.request` delta (sheet page switch, S8).
   */
  private pushLogMessage(message: unknown): void {
    if (typeof message !== 'object' || message === null) return;
    const chat = message as ChatMessageLike & RollRequestMessage;
    const event = toLogEvent(chat);
    const request = parseRollRequest(chat);
    if (event === null && request === null) return;
    for (const { meta, key } of this.onlineDevices()) {
      if (!isMessageVisibleTo(chat, [meta.playerUserId, meta.g2UserId])) continue;
      if (event !== null) {
        this.fireAndForget(this.sendDelta(meta.g2UserId, key, LOG_DELTA_TYPE, event));
      }
      if (request !== null) {
        this.fireAndForget(this.sendDelta(meta.g2UserId, key, R1_ROLL_REQUEST_TYPE, request));
      }
    }
  }

  private scheduleMapForAll(): void {
    for (const { meta } of this.onlineDevices()) this.scheduleMap(meta.g2UserId);
  }

  /** Coalesces map refreshes to at most one per {@link MAP_THROTTLE_MS} per device. */
  private scheduleMap(g2UserId: string): void {
    const state = this.mapThrottle.get(g2UserId) ?? { lastSentAt: 0, timer: null };
    this.mapThrottle.set(g2UserId, state);
    if (state.timer !== null) return;
    const wait = Math.max(0, state.lastSentAt + MAP_THROTTLE_MS - Date.now());
    state.timer = setTimeout(() => {
      state.timer = null;
      state.lastSentAt = Date.now();
      const target = this.onlineDevices().find((d) => d.meta.g2UserId === g2UserId);
      if (target === undefined) return;
      this.fireAndForget(
        this.send(g2UserId, target.key, {
          t: 'snapshot',
          what: 'map',
          data: this.snapshot(target.meta, 'map'),
        }),
      );
    }, wait);
  }

  /** Online devices this client is currently elected for, with their served metadata. */
  private onlineDevices(): Array<{ meta: DeviceMeta; key: string }> {
    const out: Array<{ meta: DeviceMeta; key: string }> = [];
    for (const meta of listDevices()) {
      const key = this.activeKeys.get(meta.g2UserId);
      if (key === undefined || !this.isOnline(meta.g2UserId)) continue;
      const ctx = deviceContext(meta);
      if (ctx.responderId === game.user.id) out.push({ meta: servedMeta(ctx), key });
    }
    return out;
  }

  private sendDelta(g2UserId: string, key: string, topic: string, data: unknown): Promise<void> {
    const seq = (this.seq.get(g2UserId) ?? 0) + 1;
    this.seq.set(g2UserId, seq);
    return this.send(g2UserId, key, { t: 'delta', seq, topic, data });
  }

  private async send(g2UserId: string, key: string, message: ProjectorMessage): Promise<void> {
    const envelope = await seal(await this.cryptoKey(key), PROJECTOR_ADDRESS, g2UserId, message);
    game.socket?.emit(DIRECT_SOCKET_EVENT, envelope);
  }

  private async cryptoKey(b64: string): Promise<CryptoKey> {
    const cached = this.cryptoKeys.get(b64);
    if (cached !== undefined) return cached;
    const imported = await importDeviceKey(b64);
    this.cryptoKeys.set(b64, imported);
    return imported;
  }

  private fireAndForget(p: Promise<void>): void {
    p.catch((err: unknown) => {
      console.error('[EVF] projector: failed to push to a G2 device', err);
    });
  }
}

/** Routing rule of {@link Projector.pushDelta}. */
function concerns(meta: DeviceMeta, data: unknown): boolean {
  if (typeof data !== 'object' || data === null) return true;
  const d = data as Record<string, unknown>;
  if (typeof d.actorId === 'string') return d.actorId === meta.actorId;
  // Action results name the user who triggered them (the G2 user when dispatched by us).
  if (typeof d.recipientUserId === 'string')
    return d.recipientUserId === meta.g2UserId || d.recipientUserId === meta.playerUserId;
  if (typeof d.userId === 'string')
    return d.userId === meta.playerUserId || d.userId === meta.g2UserId;
  return true;
}
