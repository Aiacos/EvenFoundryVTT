/**
 * Direct session — the only writer of `connection`, snapshots, `reaction`, `lastResult`,
 * `actionEconomy`, `movement` and `settings` in the {@link AppStore}; implements
 * {@link AppActions} for the HUD.
 *
 * Lifecycle (screens S10 unpaired · S11 connecting · S12 offline), ADR-0019:
 *
 * ```
 * unpaired ──pair──▶ connecting ─(relay, projector in the room, hello→welcome, snapshots)─▶ online
 *     ▲                  │  ▲                                                               │
 *     │ revoked          ▼  │ backoff 1→30 s (+jitter)             relay lost · 2 missed pongs │
 *     └──────────────── offline ◀─────────────────────────────────────────────────────────────┘
 *                         ▲ │ no-projector: the relay link stays open; the projector
 *                         └─┘ joining the room (`peer-up`) re-sends `hello` at once
 * ```
 *
 * `FOREGROUND_EXIT` closes gracefully (cause `background`); `FOREGROUND_ENTER` reconnects
 * immediately. All traffic is sealed (AES-GCM, `from = glasses`, `to = projector`). The
 * first `welcome` after a QR/code rotates room and key: they are persisted, then the
 * session reconnects in the new room (single-use QR).
 *
 * @see docs/architecture/0019-relay-pairing-player-projector.md
 * @see docs/architecture/0016-direct-foundry-streaming.md (sealed protocol)
 */
import {
  ActionEconomyPayloadSchema,
  ActionResultPayloadSchema,
  type AppMessage,
  ASSET_REF_PREFIX,
  CHARACTER_DELTA_TYPE,
  CharacterSnapshotSchema,
  COMBAT_STATE_DELTA_TYPE,
  COMBAT_TARGETS_DELTA_TYPE,
  COMBAT_TURN_DELTA_TYPE,
  CombatSnapshotSchema,
  DEFAULT_RELAY_URL,
  DIRECT_PROTOCOL_VERSION,
  EVENT_LOG_DELTA_TYPE,
  GLASSES_ADDRESS,
  importDeviceKey,
  LOG_DELTA_TYPE,
  type LogSnapshot,
  LogSnapshotSchema,
  type MapSnapshot,
  MapSnapshotSchema,
  MovementBudgetPayloadSchema,
  open,
  PROJECTOR_ADDRESS,
  type ProjectorMessage,
  ProjectorMessageSchema,
  R1_ACTION_ECONOMY_TYPE,
  R1_ACTION_RESULT_TYPE,
  R1_MOVEMENT_BUDGET_TYPE,
  R1_MULTIATTACK_PROGRESS_TYPE,
  R1_REACTION_AVAILABLE_TYPE,
  R1_ROLL_REQUEST_TYPE,
  ReactionAvailablePayloadSchema,
  RollRequestPayloadSchema,
  readPairingText,
  SCENE_VIEWPORT_DELTA_TYPE,
  SealedEnvelopeSchema,
  SNAPSHOT_TOPICS,
  type SnapshotTopic,
  seal,
} from '@evf/shared-protocol';
import type { ZodType } from 'zod';
import type {
  AppActions,
  AppSettings,
  AppState,
  AppStore,
  ConnectionState,
  ConnectSteps,
  InvokeResult,
} from '../state/app-store.js';
import { resolveLocale } from '../state/app-store.js';
import {
  type CredentialStore,
  type Credentials,
  credentialsFromLink,
  type KeyValueStorage,
} from './credentials.js';
import { type OpenRelay, type RelayLink, relayHost } from './relay-client.js';
import { loadSettings, saveSettings } from './settings.js';

/** Timing contract (ms). Exported for tests and documentation. */
export const SESSION_TIMING = {
  welcomeTimeout: 8_000,
  snapshotTimeout: 10_000,
  invokeTimeout: 10_000,
  heartbeatInterval: 20_000,
  maxMissedPongs: 2,
  backoffBase: 1_000,
  backoffMax: 30_000,
  /** Jitter as a fraction of the backoff step (0–20 %). */
  backoffJitter: 0.2,
  refreshDebounce: 250,
  countdownTick: 1_000,
} as const;

/** Number of log events kept in the store (tail window). */
export const LOG_TAIL_MAX = 50;

/** Diagnostic entries kept for the phone "Diagnostica" section. */
export const DIAGNOSTICS_MAX = 20;

/** Scene pictures kept for the map (`asset` messages, one scene's worth). */
export const ASSETS_MAX = 128;

/** One diagnostic line (phone P02 "Diagnostica"). */
export interface DiagnosticEntry {
  at: number;
  level: 'warn' | 'error';
  message: string;
}

/** Non-store session facts shown on the phone page. */
export interface SessionInfo {
  latencyMs: number | null;
  /** `evenfoundryvtt` version reported by the projector (`welcome.moduleVersion`). */
  moduleVersion: string | null;
  diagnostics: readonly DiagnosticEntry[];
}

/** Collaborators and environment of a {@link DirectSession}. */
export interface SessionDeps {
  store: AppStore;
  credentials: CredentialStore;
  /** Opens relay links (browser WebSocket; tests inject a fake). */
  openRelay: OpenRelay;
  /** Relay the app was built for (credentials may override it: dev / self-host). */
  relayUrl?: string;
  appVersion: string;
  settingsStorage: KeyValueStorage | null;
  deviceLanguage: () => string;
  now?: () => number;
  random?: () => number;
  uuid?: () => string;
}

const NO_STEPS: ConnectSteps = {
  relay: false,
  projector: false,
  paired: false,
  character: false,
  scene: false,
};

/** Schemas used to validate `snapshot` payloads per topic (`null` = nothing active). */
const SNAPSHOT_SCHEMAS: Record<SnapshotTopic, ZodType> = {
  character: CharacterSnapshotSchema.nullable(),
  combat: CombatSnapshotSchema.nullable(),
  map: MapSnapshotSchema.nullable(),
  log: LogSnapshotSchema.nullable(),
};

/** Per-turn combat state dropped when combat ends (a new encounter starts fresh). */
const NO_TURN_STATE: Pick<AppState, 'actionEconomy' | 'movement'> = {
  actionEconomy: null,
  movement: null,
};

/** Delta topics that invalidate a snapshot and trigger a (debounced) re-fetch. */
const REFRESH_TOPICS: Readonly<Record<string, SnapshotTopic>> = {
  [SCENE_VIEWPORT_DELTA_TYPE]: 'map',
  [COMBAT_TARGETS_DELTA_TYPE]: 'map',
  [EVENT_LOG_DELTA_TYPE]: 'log',
};

/** Keeps identity fields of a connection state, dropping transient ones. */
function identityOf(c: ConnectionState): Omit<ConnectionState, 'status'> {
  const out: Omit<ConnectionState, 'status'> = {};
  if (c.server !== undefined) out.server = c.server;
  if (c.userName !== undefined) out.userName = c.userName;
  if (c.gmName !== undefined) out.gmName = c.gmName;
  if (c.actorName !== undefined) out.actorName = c.actorName;
  if (c.worldTitle !== undefined) out.worldTitle = c.worldTitle;
  if (c.foundryLocale !== undefined) out.foundryLocale = c.foundryLocale;
  if (c.lastSyncAt !== undefined) out.lastSyncAt = c.lastSyncAt;
  return out;
}

/** Appends log events, de-duplicated by id, ordered by timestamp, capped to the tail. */
export function mergeLog(current: LogSnapshot | null, incoming: LogSnapshot): LogSnapshot {
  const byId = new Map((current?.events ?? []).map((e) => [e.id, e]));
  for (const e of incoming.events) byId.set(e.id, e);
  const events = [...byId.values()].sort((a, b) => a.timestamp - b.timestamp);
  return { events: events.slice(-LOG_TAIL_MAX) };
}

/** Backoff delay for attempt `n` (1-based): 1, 2, 4 … 30 s plus up to 20 % jitter, capped. */
export function backoffDelay(attempt: number, random: number): number {
  const step = Math.min(
    SESSION_TIMING.backoffMax,
    SESSION_TIMING.backoffBase * 2 ** Math.max(0, attempt - 1),
  );
  return Math.min(
    SESSION_TIMING.backoffMax,
    Math.round(step * (1 + SESSION_TIMING.backoffJitter * random)),
  );
}

interface PendingInvoke {
  resolve: (result: InvokeResult) => void;
  timer: ReturnType<typeof setTimeout>;
}

/** Offline causes (subset of {@link ConnectionState.cause}). */
type OfflineCause = NonNullable<ConnectionState['cause']>;

/**
 * Replaces `evf-asset:<id>` references with the pictures received in `asset` messages;
 * a picture not received (yet) is dropped (the phone then draws the schematic map).
 */
export function hydrateMap(map: MapSnapshot, assets: ReadonlyMap<string, string>): MapSnapshot {
  const resolve = (src: string): string | undefined =>
    src.startsWith(ASSET_REF_PREFIX) ? assets.get(src.slice(ASSET_REF_PREFIX.length)) : undefined;
  const { background, tiles, ...base } = map;
  const bgSrc = background === undefined ? undefined : resolve(background.src);
  const hydratedTiles = (tiles ?? []).flatMap((t) => {
    const src = resolve(t.src);
    return src === undefined ? [] : [{ ...t, src }];
  });
  return {
    ...base,
    ...(background !== undefined && bgSrc !== undefined
      ? { background: { ...background, src: bgSrc } }
      : {}),
    ...(hydratedTiles.length > 0 ? { tiles: hydratedTiles } : {}),
    tokens: map.tokens.map(({ img, ...token }) => {
      const src = img === undefined ? undefined : resolve(img);
      return src === undefined ? token : { ...token, img: src };
    }),
  };
}

/**
 * Direct-channel session: construct with {@link SessionDeps}, then call {@link DirectSession.start}.
 */
export class DirectSession implements AppActions {
  private readonly store: AppStore;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly uuid: () => string;

  /** Bumped on every connect/close; async continuations from older epochs are dropped. */
  private epoch = 0;
  private attempt = 0;
  private link: RelayLink | null = null;
  private key: CryptoKey | null = null;
  private welcomed = false;
  /** Every `hello` of the current link: the `welcome` may answer any of them. */
  private readonly helloRids = new Set<string>();
  private lastSeq = -1;
  private inbox: Promise<void> = Promise.resolve();

  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private countdownTimer: ReturnType<typeof setInterval> | null = null;
  private welcomeTimer: ReturnType<typeof setTimeout> | null = null;
  private snapshotTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private readonly refreshTimers = new Map<SnapshotTopic, ReturnType<typeof setTimeout>>();
  private readonly pending = new Map<string, PendingInvoke>();
  private pendingPing: { rid: string; sentAt: number } | null = null;
  private missedPongs = 0;
  private readonly assets = new Map<string, string>();

  private latencyMs: number | null = null;
  private moduleVersion: string | null = null;
  private readonly diagnostics: DiagnosticEntry[] = [];
  private readonly infoListeners = new Set<(info: SessionInfo) => void>();

  constructor(private readonly deps: SessionDeps) {
    this.store = deps.store;
    this.now = deps.now ?? Date.now;
    this.random = deps.random ?? Math.random;
    this.uuid = deps.uuid ?? (() => globalThis.crypto.randomUUID());
    const settings = loadSettings(deps.settingsStorage, this.reportWarning);
    this.store.update({ settings });
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  /**
   * Starts the session: persists fragment credentials (QR path) if given, then connects
   * with whatever is stored, or shows `unpaired` (S10 / P03).
   */
  async start(fragment: Credentials | null): Promise<void> {
    if (fragment !== null) await this.deps.credentials.save(fragment);
    await this.connect();
  }

  /** {@inheritDoc AppActions.reconnect} — resets backoff and connects now. */
  reconnect(): void {
    this.attempt = 0;
    void this.connect();
  }

  /** Stops the connection without forgetting credentials (P02 "Disconnetti"). */
  disconnect(): void {
    if (!this.isPaired()) return;
    this.close();
    this.setConnection({ status: 'offline', ...identityOf(this.store.get().connection) });
  }

  /** Forgets the pairing on this device and returns to `unpaired` (P02 diagnostics). */
  async forget(): Promise<void> {
    this.close();
    await this.deps.credentials.clear();
    this.clearData({ status: 'unpaired' });
  }

  /**
   * Handles Even Hub foreground transitions: exit closes gracefully (cause
   * `background`), enter reconnects immediately.
   */
  onForeground(enter: boolean): void {
    if (!this.isPaired()) return;
    if (enter) {
      if (this.store.get().connection.status !== 'online') this.reconnect();
      return;
    }
    this.close();
    this.setConnection({
      status: 'offline',
      cause: 'background',
      ...identityOf(this.store.get().connection),
    });
  }

  /**
   * Pairs with the 16-char code shown under the QR (P03) and connects.
   *
   * @throws Error('invalid manual code') when the code is malformed
   */
  async pairCode(code: string): Promise<void> {
    await this.pairWith(await credentialsFromLink({ code }));
  }

  /**
   * Pairs with the text of a scanned QR (the in-app camera, P03) and connects.
   *
   * @throws Error('not a pairing QR') when the text carries no pairing payload
   */
  async pairScanned(text: string): Promise<void> {
    const link = readPairingText(text);
    if (link === null) throw new Error('not a pairing QR');
    await this.pairWith(await credentialsFromLink(link));
  }

  private async pairWith(creds: Credentials): Promise<void> {
    await this.deps.credentials.save(creds);
    this.attempt = 0;
    await this.connect();
  }

  /** {@inheritDoc AppActions.invoke} — 10 s timeout yields `{code:'timeout'}`. */
  invoke(tool: string, input: unknown): Promise<InvokeResult> {
    if (this.link === null || !this.welcomed) {
      return Promise.resolve({ ok: false, error: { code: 'offline', message: 'not connected' } });
    }
    const rid = this.uuid();
    return new Promise<InvokeResult>((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(rid);
        resolve({ ok: false, error: { code: 'timeout', message: `${tool} timed out` } });
      }, SESSION_TIMING.invokeTimeout);
      this.pending.set(rid, { resolve, timer });
      this.send({ t: 'invoke', rid, tool, input });
    });
  }

  /** {@inheritDoc AppActions.refresh} */
  refresh(topic: SnapshotTopic): void {
    if (this.link === null || !this.welcomed) return;
    this.send({ t: 'get', rid: this.uuid(), what: topic });
  }

  /** {@inheritDoc AppActions.updateSettings} — persisted in localStorage. */
  updateSettings(patch: Partial<AppSettings>): void {
    const settings = { ...this.store.get().settings, ...patch };
    saveSettings(this.deps.settingsStorage, settings, this.reportWarning);
    this.store.update({ settings });
  }

  /** Effective UI locale (setting → Foundry language → device language). */
  locale(): 'it' | 'en' {
    return resolveLocale(this.store.get(), this.deps.deviceLanguage());
  }

  /** Current non-store facts (latency, module version, diagnostics). */
  info(): SessionInfo {
    return {
      latencyMs: this.latencyMs,
      moduleVersion: this.moduleVersion,
      diagnostics: [...this.diagnostics],
    };
  }

  /** Subscribes to {@link info} changes; returns the unsubscribe function. */
  subscribeInfo(listener: (info: SessionInfo) => void): () => void {
    this.infoListeners.add(listener);
    return () => this.infoListeners.delete(listener);
  }

  /** Releases every timer and the socket (page unload / tests). */
  dispose(): void {
    this.close();
  }

  // ─── Connect flow ────────────────────────────────────────────────────────

  private async connect(): Promise<void> {
    this.close();
    const epoch = this.epoch;
    const creds = await this.deps.credentials.load();
    if (epoch !== this.epoch) return;
    if (creds === null) {
      this.clearData({ status: 'unpaired' });
      return;
    }
    const relay = creds.relay ?? this.deps.relayUrl ?? DEFAULT_RELAY_URL;
    this.setConnection({
      ...identityOf(this.store.get().connection),
      status: 'connecting',
      server: relayHost(relay),
      steps: { ...NO_STEPS },
    });
    try {
      this.key = await importDeviceKey(creds.key);
      const link = await this.deps.openRelay(relay, creds.room);
      if (epoch !== this.epoch) {
        link.close();
        return;
      }
      this.attach(link, epoch);
      this.markStep('relay');
      this.sayHello();
    } catch (error) {
      if (epoch !== this.epoch) return;
      this.fail('network', error instanceof Error ? error.message : String(error));
    }
  }

  private attach(link: RelayLink, epoch: number): void {
    this.link = link;
    this.lastSeq = -1;
    link.onFrame((raw) => {
      this.inbox = this.inbox.then(() => this.receive(raw, epoch));
    });
    link.onPeer((up) => {
      if (epoch === this.epoch) this.onPeer(up);
    });
    link.onClose((code) => {
      if (epoch === this.epoch) this.fail('network', `relay link closed (${code})`);
    });
  }

  /**
   * Sends `hello` and waits for the `welcome`. Without an answer the projector (the
   * player's Foundry tab) is not in the room: the session shows `no-projector`, keeps the
   * relay link and says `hello` again every {@link SESSION_TIMING.welcomeTimeout} — and at
   * once when the relay reports the projector joining ({@link onPeer}). Several `hello`s
   * may be in flight (the relay's `peer-up` races the first one): the `welcome` may answer
   * any of them.
   */
  private sayHello(): void {
    if (this.welcomeTimer !== null) clearTimeout(this.welcomeTimer);
    const rid = this.uuid();
    this.helloRids.add(rid);
    this.welcomeTimer = setTimeout(() => {
      this.welcomeTimer = null;
      this.waitForProjector();
      this.sayHello();
    }, SESSION_TIMING.welcomeTimeout);
    this.send({
      t: 'hello',
      rid,
      proto: DIRECT_PROTOCOL_VERSION,
      app: this.deps.appVersion,
      locale: this.locale(),
    });
  }

  /** Projector absent: offline (`no-projector`), link kept, no retry countdown. */
  private waitForProjector(): void {
    this.stopHeartbeat();
    this.welcomed = false;
    const c = this.store.get().connection;
    if (c.status === 'offline' && c.cause === 'no-projector') return;
    this.record('warn', 'no-projector: the Foundry tab that paired these glasses is not open');
    this.setConnection({
      ...identityOf(this.store.get().connection),
      status: 'offline',
      cause: 'no-projector',
    });
  }

  /** Relay presence of the projector. */
  private onPeer(up: boolean): void {
    if (up) {
      this.markStep('projector');
      if (this.welcomed) return;
      const c = this.store.get().connection;
      if (c.status === 'offline') {
        this.setConnection({
          ...identityOf(c),
          status: 'connecting',
          steps: { ...NO_STEPS, relay: true, projector: true },
        });
      }
      this.sayHello();
      return;
    }
    if (!this.welcomed) return;
    this.waitForProjector();
    this.sayHello();
  }

  /** Tears down the link, timers and pending requests; bumps the epoch. */
  private close(): void {
    this.epoch++;
    this.welcomed = false;
    this.helloRids.clear();
    for (const t of [this.retryTimer, this.welcomeTimer, this.snapshotTimer])
      if (t !== null) clearTimeout(t);
    for (const t of [this.countdownTimer, this.heartbeatTimer]) if (t !== null) clearInterval(t);
    this.retryTimer = this.welcomeTimer = this.snapshotTimer = null;
    this.countdownTimer = this.heartbeatTimer = null;
    for (const t of this.refreshTimers.values()) clearTimeout(t);
    this.refreshTimers.clear();
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.resolve({ ok: false, error: { code: 'offline', message: 'connection closed' } });
    }
    this.pending.clear();
    this.pendingPing = null;
    this.missedPongs = 0;
    this.link?.close();
    this.link = null;
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
    this.pendingPing = null;
    this.missedPongs = 0;
  }

  /** Goes offline and schedules a reconnect with exponential backoff. */
  private fail(cause: OfflineCause, message: string): void {
    this.record('error', `${cause}: ${message}`);
    this.close();
    this.attempt++;
    const delay = backoffDelay(this.attempt, this.random());
    const retryAt = this.now() + delay;
    this.setConnection({
      ...identityOf(this.store.get().connection),
      status: 'offline',
      cause,
      attempt: this.attempt,
      retryInMs: delay,
    });
    this.retryTimer = setTimeout(() => void this.connect(), delay);
    this.countdownTimer = setInterval(() => {
      const c = this.store.get().connection;
      if (c.status !== 'offline') return;
      this.setConnection({ ...c, retryInMs: Math.max(0, retryAt - this.now()) });
    }, SESSION_TIMING.countdownTick);
  }

  private async revoke(): Promise<void> {
    this.close();
    await this.deps.credentials.clear();
    this.clearData({ status: 'revoked' });
  }

  // ─── Inbound ─────────────────────────────────────────────────────────────

  private async receive(raw: unknown, epoch: number): Promise<void> {
    if (epoch !== this.epoch || this.key === null) return;
    const env = SealedEnvelopeSchema.safeParse(raw);
    if (!env.success || env.data.to !== GLASSES_ADDRESS || env.data.from !== PROJECTOR_ADDRESS) {
      this.record('warn', 'unexpected relay frame dropped');
      return;
    }
    const opened = await open(this.key, env.data, this.now());
    if (epoch !== this.epoch) return;
    if (!opened.ok) {
      this.record('warn', `envelope rejected (${opened.reason})`);
      return;
    }
    const msg = ProjectorMessageSchema.safeParse(opened.message);
    if (!msg.success) {
      this.record('warn', 'invalid projector message');
      return;
    }
    await this.dispatch(msg.data, epoch);
  }

  private async dispatch(msg: ProjectorMessage, epoch: number): Promise<void> {
    switch (msg.t) {
      case 'welcome':
        return this.onWelcome(msg, epoch);
      case 'snapshot':
        return this.onSnapshot(msg.what, msg.data);
      case 'delta':
        return this.onDelta(msg.seq, msg.topic, msg.data);
      case 'result': {
        const p = this.pending.get(msg.rid);
        if (p === undefined) return;
        clearTimeout(p.timer);
        this.pending.delete(msg.rid);
        p.resolve(msg.ok ? { ok: true, data: msg.data } : { ok: false, error: msg.error });
        return;
      }
      case 'pong':
        this.missedPongs = 0;
        if (this.pendingPing?.rid === msg.rid) {
          this.latencyMs = this.now() - this.pendingPing.sentAt;
          this.pendingPing = null;
          this.emitInfo();
        }
        return;
      case 'revoked':
        this.record('error', 'pairing revoked from Foundry');
        return this.revoke();
      case 'asset':
        this.assets.delete(msg.id);
        this.assets.set(msg.id, msg.data);
        while (this.assets.size > ASSETS_MAX) {
          const oldest = this.assets.keys().next().value;
          if (oldest === undefined) break;
          this.assets.delete(oldest);
        }
        return;
    }
  }

  private async onWelcome(
    msg: Extract<ProjectorMessage, { t: 'welcome' }>,
    epoch: number,
  ): Promise<void> {
    if (this.welcomed || !this.helloRids.has(msg.rid)) return;
    this.helloRids.clear();
    if (this.welcomeTimer !== null) clearTimeout(this.welcomeTimer);
    this.welcomeTimer = null;
    if (msg.rotate !== undefined) {
      // Single-use QR/code: persist the fresh room + key, then meet the projector there.
      await this.deps.credentials.rotate(msg.rotate);
      if (epoch !== this.epoch) return;
      this.record('warn', 'pairing secrets rotated — moving to the new room');
      this.attempt = 0;
      await this.connect();
      return;
    }
    this.welcomed = true;
    this.attempt = 0;
    this.moduleVersion = msg.moduleVersion ?? null;
    this.emitInfo();
    const c = this.store.get().connection;
    this.setConnection({
      ...c,
      status: c.status === 'offline' ? 'connecting' : c.status,
      userName: msg.userName,
      gmName: msg.gmName,
      actorName: msg.actorName,
      worldTitle: msg.worldTitle,
      ...(msg.locale !== undefined ? { foundryLocale: msg.locale } : {}),
      steps: { ...(c.steps ?? NO_STEPS), relay: true, projector: true, paired: true },
    });
    this.heartbeatTimer = setInterval(() => this.heartbeat(), SESSION_TIMING.heartbeatInterval);
    this.snapshotTimer = setTimeout(() => {
      this.record('warn', 'snapshots incomplete — continuing');
      this.goOnline();
    }, SESSION_TIMING.snapshotTimeout);
    for (const topic of SNAPSHOT_TOPICS) this.refresh(topic);
  }

  private onSnapshot(topic: SnapshotTopic, data: unknown): void {
    const parsed = SNAPSHOT_SCHEMAS[topic].safeParse(data);
    if (!parsed.success) {
      this.record('warn', `invalid ${topic} snapshot`);
      return;
    }
    const value =
      topic === 'map' && parsed.data !== null
        ? hydrateMap(parsed.data as MapSnapshot, this.assets)
        : parsed.data;
    this.store.update({
      [topic]: value,
      ...(topic === 'combat' && parsed.data === null ? NO_TURN_STATE : {}),
    } as Partial<AppState>);
    this.touchSync();
    if (topic === 'character') this.markStep('character');
    if (topic === 'map') this.markStep('scene');
    const steps = this.store.get().connection.steps;
    if (steps?.paired === true && steps.character && steps.scene) this.goOnline();
  }

  private onDelta(seq: number, topic: string, data: unknown): void {
    if (this.lastSeq >= 0 && seq > this.lastSeq + 1) {
      this.record('warn', `delta gap ${this.lastSeq}→${seq}: resync`);
      for (const t of SNAPSHOT_TOPICS) this.scheduleRefresh(t);
    }
    this.lastSeq = seq;
    const refreshTopic = REFRESH_TOPICS[topic];
    if (refreshTopic !== undefined) {
      this.scheduleRefresh(refreshTopic);
      return;
    }
    switch (topic) {
      case CHARACTER_DELTA_TYPE:
        this.applyDelta(topic, CharacterSnapshotSchema, data, (character) => ({ character }));
        break;
      case COMBAT_TURN_DELTA_TYPE:
      case COMBAT_STATE_DELTA_TYPE:
        this.applyDelta(topic, CombatSnapshotSchema.nullable(), data, (combat) =>
          combat === null ? { combat, ...NO_TURN_STATE } : { combat },
        );
        break;
      case R1_ACTION_ECONOMY_TYPE:
        this.applyDelta(topic, ActionEconomyPayloadSchema, data, (actionEconomy) => ({
          actionEconomy,
        }));
        break;
      case R1_MOVEMENT_BUDGET_TYPE:
        this.applyDelta(topic, MovementBudgetPayloadSchema, data, (movement) => ({ movement }));
        break;
      case R1_MULTIATTACK_PROGRESS_TYPE:
        // Deliberately not stored: the HUD attacks one roll per tap (`count: 1`) and the
        // character snapshot does not expose attacks-per-action, so an "Attacks n/m" row
        // could not be truthful.
        break;
      case LOG_DELTA_TYPE:
        this.applyDelta(topic, LogSnapshotSchema, data, (log) => ({
          log: mergeLog(this.store.get().log, log),
        }));
        break;
      case R1_ACTION_RESULT_TYPE:
        this.applyDelta(topic, ActionResultPayloadSchema, data, (lastResult) => ({ lastResult }));
        break;
      case R1_REACTION_AVAILABLE_TYPE:
        this.applyDelta(topic, ReactionAvailablePayloadSchema, data, (reaction) => ({ reaction }));
        break;
      case R1_ROLL_REQUEST_TYPE:
        this.applyDelta(topic, RollRequestPayloadSchema, data, (rollRequest) => ({ rollRequest }));
        break;
      default:
        this.record('warn', `unhandled delta topic ${topic}`);
    }
  }

  private applyDelta<T>(
    topic: string,
    schema: ZodType<T>,
    data: unknown,
    toPatch: (value: T) => Partial<AppState>,
  ): void {
    const parsed = schema.safeParse(data);
    if (!parsed.success) {
      this.record('warn', `invalid ${topic} delta`);
      return;
    }
    this.store.update(toPatch(parsed.data));
    this.touchSync();
  }

  // ─── Outbound & helpers ──────────────────────────────────────────────────

  private send(message: AppMessage): void {
    const link = this.link;
    const key = this.key;
    if (link === null || key === null) return;
    seal(key, GLASSES_ADDRESS, PROJECTOR_ADDRESS, message, this.now()).then(
      (env) => {
        if (!link.send(env)) this.record('warn', `${message.t} dropped: relay link closed`);
      },
      (error: unknown) => this.record('error', `seal failed: ${String(error)}`),
    );
  }

  private heartbeat(): void {
    if (this.pendingPing !== null) {
      this.missedPongs++;
      if (this.missedPongs >= SESSION_TIMING.maxMissedPongs) {
        this.fail('network', `${this.missedPongs} missed pongs`);
        return;
      }
    }
    this.pendingPing = { rid: this.uuid(), sentAt: this.now() };
    this.send({ t: 'ping', rid: this.pendingPing.rid });
  }

  private scheduleRefresh(topic: SnapshotTopic): void {
    if (this.refreshTimers.has(topic)) return;
    this.refreshTimers.set(
      topic,
      setTimeout(() => {
        this.refreshTimers.delete(topic);
        this.refresh(topic);
      }, SESSION_TIMING.refreshDebounce),
    );
  }

  private goOnline(): void {
    if (this.snapshotTimer !== null) clearTimeout(this.snapshotTimer);
    this.snapshotTimer = null;
    const c = this.store.get().connection;
    if (c.status !== 'connecting') return;
    this.setConnection({ ...identityOf(c), status: 'online' });
  }

  private markStep(step: keyof ConnectSteps): void {
    const c = this.store.get().connection;
    if (c.status !== 'connecting') return;
    this.setConnection({ ...c, steps: { ...(c.steps ?? NO_STEPS), [step]: true } });
  }

  private touchSync(): void {
    const c = this.store.get().connection;
    this.setConnection({ ...c, lastSyncAt: this.now() });
  }

  private setConnection(connection: ConnectionState): void {
    this.store.update({ connection });
  }

  private clearData(connection: ConnectionState): void {
    this.key = null;
    this.store.update({
      connection,
      character: null,
      combat: null,
      map: null,
      log: null,
      reaction: null,
      lastResult: null,
      ...NO_TURN_STATE,
    });
  }

  private isPaired(): boolean {
    const status = this.store.get().connection.status;
    return status !== 'unpaired' && status !== 'revoked';
  }

  /** Records a recoverable (storage) warning in the diagnostics ring. */
  readonly reportWarning = (message: string, error: unknown): void => {
    this.record('warn', `${message}: ${String(error)}`);
  };

  private record(level: DiagnosticEntry['level'], message: string): void {
    this.diagnostics.push({ at: this.now(), level, message });
    if (this.diagnostics.length > DIAGNOSTICS_MAX) this.diagnostics.shift();
    this.emitInfo();
  }

  private emitInfo(): void {
    const info = this.info();
    for (const l of this.infoListeners) l(info);
  }
}
