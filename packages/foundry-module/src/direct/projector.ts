/**
 * Direct projector — the GM-client end of the G2 channel (ADR-0012 §Decision Outcome 5).
 *
 * Listens on the Foundry socket relay (`module.evenfoundryvtt`) for sealed envelopes
 * addressed to {@link GM_ADDRESS}, authenticates them with the sender device's AES key
 * (from {@link getDevice}), and answers:
 *
 * - `hello`  → `welcome` (+ one-time credential rotation) then full snapshots
 * - `get`    → `snapshot` of character / combat / log / map for the paired actor
 * - `invoke` → `dispatchTool` (ADR-0011 single-workflow-origin), `rid` = idempotency key;
 *   `targets` (MapSnapshot token ids) are translated to token document UUIDs here
 * - after the hello snapshots, during combat: the paired actor's action economy and
 *   movement budget (`r1.action.economy`, `r1.movement.budget` deltas)
 * - `ping`   → `pong`
 *
 * It also pushes `delta` messages (hook subscribers, write-path watchers, chat log,
 * throttled map refreshes) to every online paired device concerned by the change.
 *
 * Only the client where `game.user` is the active GM (`game.users.activeGM`) runs
 * the projector; other GM clients stay silent so replies are never duplicated.
 * Keys live in the pairing GM browser only, so that browser must be the active GM.
 *
 * Every message leaves sealed: other clients on the relay only see ciphertext.
 *
 * @see docs/architecture/0012-direct-foundry-streaming.md
 * @see docs/architecture/0011-foundry-write-path-single-workflow-origin.md
 * @see packages/shared-protocol/src/direct/ (wire contract)
 */
import {
  type AppMessage,
  AppMessageSchema,
  DIRECT_SOCKET_EVENT,
  GM_ADDRESS,
  generateDeviceKey,
  importDeviceKey,
  LOG_DELTA_TYPE,
  MAX_ENVELOPE_AGE_MS,
  open,
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
import { generatePassword, setG2Password } from './g2-user.js';
import { readMapSnapshot, resolveTargetUuids } from './map-reader.js';
import {
  type DeviceMeta,
  getDevice,
  listDevices,
  setDeviceKey,
  touchDevice,
  updateDeviceMeta,
} from './pairing-store.js';
import { parseRollRequest, type RollRequestMessage } from './roll-request.js';

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

/** True when this client must act as projector (GM and the designated active GM). */
export function isActiveProjector(): boolean {
  if (!game.user.isGM) return false;
  const active = game.users.activeGM;
  return active === undefined || active === null || active.id === game.user.id;
}

/**
 * Stateful projector. One instance per GM client, created on `ready`.
 */
export class Projector {
  private readonly online = new Map<string, number>();
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
   * Validates, authenticates and handles one relay payload. Anything not addressed
   * to the GM, from an unknown sender, or failing authentication is dropped.
   */
  async handleEnvelope(raw: unknown, now: number = Date.now()): Promise<void> {
    if (!isActiveProjector()) return;
    const parsed = SealedEnvelopeSchema.safeParse(raw);
    if (!parsed.success || parsed.data.to !== GM_ADDRESS) return;
    const envelope = parsed.data;
    const device = getDevice(envelope.from);
    if (device === null || device.key === null) return;

    const opened = await this.openWithKeys(envelope, device.key, now);
    if (opened === null) {
      console.warn(
        `[EVF] projector: rejected envelope from ${envelope.from} (authentication failed)`,
      );
      return;
    }
    const message = AppMessageSchema.safeParse(opened);
    if (!message.success) {
      console.warn(
        `[EVF] projector: malformed message from ${envelope.from}`,
        message.error.message,
      );
      return;
    }

    this.online.set(device.meta.g2UserId, now);
    await touchDevice(device.meta.g2UserId, now);
    await this.dispatch(device.meta, device.key, message.data);
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

  private async dispatch(meta: DeviceMeta, key: string, message: AppMessage): Promise<void> {
    switch (message.t) {
      case 'hello':
        await this.onHello(meta, key, message.rid);
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

  private async onHello(meta: DeviceMeta, key: string, rid: string): Promise<void> {
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
    const welcome: ProjectorMessage = {
      t: 'welcome',
      rid,
      actorId: actor.id,
      actorName: actor.name,
      userName: meta.label,
      gmName: game.user.name ?? '',
      worldTitle: game.world?.title ?? '',
      ...(game.i18n?.lang ? { locale: game.i18n.lang } : {}),
    };

    if (meta.pendingRotation) {
      // One-time credentials: set the new Foundry password first (if it fails the
      // welcome goes out without `rotate` and the QR stays valid), send the new key
      // sealed with the OLD key, then persist it and keep the old one for a grace period.
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
      await this.send(meta.g2UserId, key, { ...welcome, rotate: { password, key: newKey } });
      this.graceKeys.set(meta.g2UserId, { key, until: Date.now() + KEY_GRACE_MS });
      await setDeviceKey(meta.g2UserId, newKey);
      await updateDeviceMeta(meta.g2UserId, { pendingRotation: false });
      await this.pushAllSnapshots(meta, newKey);
      return;
    }
    await this.send(meta.g2UserId, key, welcome);
    await this.pushAllSnapshots(meta, key);
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

  /** Sends `{t:'revoked'}` to a device (before the GM deletes it). No-op without key. */
  async revoke(g2UserId: string): Promise<void> {
    const device = getDevice(g2UserId);
    if (device === null || device.key === null) return;
    await this.send(g2UserId, device.key, { t: 'revoked' });
    this.online.delete(g2UserId);
    this.graceKeys.delete(g2UserId);
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
      const device = getDevice(g2UserId);
      if (device === null || device.key === null || !this.isOnline(g2UserId)) return;
      this.fireAndForget(
        this.send(g2UserId, device.key, {
          t: 'snapshot',
          what: 'map',
          data: this.snapshot(device.meta, 'map'),
        }),
      );
    }, wait);
  }

  private onlineDevices(): Array<{ meta: DeviceMeta; key: string }> {
    if (!isActiveProjector()) return [];
    const out: Array<{ meta: DeviceMeta; key: string }> = [];
    for (const meta of listDevices()) {
      if (!this.isOnline(meta.g2UserId)) continue;
      const key = getDevice(meta.g2UserId)?.key;
      if (typeof key === 'string') out.push({ meta, key });
    }
    return out;
  }

  private sendDelta(g2UserId: string, key: string, topic: string, data: unknown): Promise<void> {
    const seq = (this.seq.get(g2UserId) ?? 0) + 1;
    this.seq.set(g2UserId, seq);
    return this.send(g2UserId, key, { t: 'delta', seq, topic, data });
  }

  private async send(g2UserId: string, key: string, message: ProjectorMessage): Promise<void> {
    const envelope = await seal(await this.cryptoKey(key), GM_ADDRESS, g2UserId, message);
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
