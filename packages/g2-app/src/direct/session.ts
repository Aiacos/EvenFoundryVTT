/**
 * Direct session — the only writer of `connection`, snapshots, `reaction`, `lastResult`,
 * `actionEconomy`, `movement` and `settings` in the {@link AppStore}; implements
 * {@link AppActions} for the HUD.
 *
 * Lifecycle (screens S10 unpaired · S11 connecting · S12 offline):
 *
 * ```
 * unpaired ──pair──▶ connecting ─(server, login, socket, hello→welcome, snapshots)─▶ online
 *     ▲                  │  ▲                                                         │
 *     │ revoked/auth     ▼  │ backoff 1→30 s (+jitter)                  socket lost / │
 *     └──────────────── offline ◀──────── 2 missed pongs · no welcome in 8 s (no-gm) ─┘
 * ```
 *
 * `FOREGROUND_EXIT` closes gracefully (cause `background`); `FOREGROUND_ENTER` reconnects
 * immediately. All traffic is sealed (AES-GCM, `from = userId`, `to = projector`); every
 * envelope addressed to this user is opened, whichever Foundry client sent it: the
 * elected projector may be the player's own browser or a GM's and may switch mid-session
 * (ADR-0017 §Decision 6). Authenticity comes from the device key and the AAD
 * (`projector>userId`), not from the sender id.
 *
 * @see docs/architecture/0016-direct-foundry-streaming.md
 * @see docs/architecture/0017-player-owned-glasses-hybrid-projector.md
 * @see docs/design/g2-thirds-layout.md §Associazione e connessione
 */
import {
  ActionEconomyPayloadSchema,
  ActionResultPayloadSchema,
  type AppMessage,
  CHARACTER_DELTA_TYPE,
  CharacterSnapshotSchema,
  COMBAT_STATE_DELTA_TYPE,
  COMBAT_TARGETS_DELTA_TYPE,
  COMBAT_TURN_DELTA_TYPE,
  CombatSnapshotSchema,
  DIRECT_PROTOCOL_VERSION,
  DIRECT_SOCKET_EVENT,
  EVENT_LOG_DELTA_TYPE,
  importDeviceKey,
  LOG_DELTA_TYPE,
  type LogSnapshot,
  LogSnapshotSchema,
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
  credentialsFromManualCode,
  type JoinUser,
  type KeyValueStorage,
} from './credentials.js';
import { type FoundryClient, FoundryClientError, type SocketLike } from './foundry-client.js';
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

/** One diagnostic line (phone P02 "Diagnostica"). */
export interface DiagnosticEntry {
  at: number;
  level: 'warn' | 'error';
  message: string;
}

/** Non-store session facts shown on the phone page. */
export interface SessionInfo {
  latencyMs: number | null;
  foundryVersion: string | null;
  /** `evenfoundryvtt` version reported by the projector (`welcome.moduleVersion`). */
  moduleVersion: string | null;
  diagnostics: readonly DiagnosticEntry[];
}

/** Subset of {@link FoundryClient} the session needs (injectable). */
export type FoundryClientLike = Pick<
  FoundryClient,
  'probeStatus' | 'fetchJoinPage' | 'login' | 'openSocket' | 'listG2Users'
>;

/** Collaborators and environment of a {@link DirectSession}. */
export interface SessionDeps {
  store: AppStore;
  credentials: CredentialStore;
  /** Foundry base derived from the page URL (manual pairing target). */
  base: string;
  createClient: (base: string) => FoundryClientLike;
  appVersion: string;
  /** Module version this bundle was built with; a different `welcome.moduleVersion` warns. */
  moduleVersion?: string;
  settingsStorage: KeyValueStorage | null;
  deviceLanguage: () => string;
  now?: () => number;
  random?: () => number;
  uuid?: () => string;
}

const NO_STEPS: ConnectSteps = {
  server: false,
  login: false,
  gm: false,
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
  private socket: SocketLike | null = null;
  private socketListener: ((raw: unknown) => void) | null = null;
  private disconnectListener: (() => void) | null = null;
  private key: CryptoKey | null = null;
  private creds: Credentials | null = null;
  private welcomed = false;
  private helloRid = '';
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

  private latencyMs: number | null = null;
  private foundryVersion: string | null = null;
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
   * Manual pairing (P03): derives credentials from the typed code and connects.
   *
   * @throws Error('invalid manual code') when the code is malformed
   */
  async pairManual(userId: string, code: string): Promise<void> {
    const creds = await credentialsFromManualCode(this.deps.base, userId, code);
    await this.deps.credentials.save(creds);
    this.attempt = 0;
    await this.connect();
  }

  /** Lists "(G2)" users on this Foundry for the manual form. */
  listUsers(): Promise<JoinUser[]> {
    return this.deps.createClient(this.deps.base).listG2Users();
  }

  /** {@inheritDoc AppActions.invoke} — 10 s timeout yields `{code:'timeout'}`. */
  invoke(tool: string, input: unknown): Promise<InvokeResult> {
    if (this.socket === null || !this.welcomed) {
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
    if (this.socket === null || !this.welcomed) return;
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

  /** Current non-store facts (latency, Foundry version, diagnostics). */
  info(): SessionInfo {
    return {
      latencyMs: this.latencyMs,
      foundryVersion: this.foundryVersion,
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
    this.creds = creds;
    const client = this.deps.createClient(creds.base);
    this.setConnection({
      ...identityOf(this.store.get().connection),
      status: 'connecting',
      server: new URL(creds.base).host,
      steps: { ...NO_STEPS },
    });
    try {
      const status = await client.probeStatus();
      this.foundryVersion = status?.version ?? null;
      await client.fetchJoinPage();
      if (epoch !== this.epoch) return;
      this.markStep('server');
      await client.login(creds.userId, creds.password);
      if (epoch !== this.epoch) return;
      this.markStep('login');
      this.key = await importDeviceKey(creds.key);
      const socket = await client.openSocket();
      if (epoch !== this.epoch) {
        socket.disconnect();
        return;
      }
      this.attach(socket, epoch);
      this.helloRid = this.uuid();
      this.welcomeTimer = setTimeout(
        () => this.fail('no-gm', 'no welcome from GM'),
        SESSION_TIMING.welcomeTimeout,
      );
      this.send({
        t: 'hello',
        rid: this.helloRid,
        proto: DIRECT_PROTOCOL_VERSION,
        app: this.deps.appVersion,
        locale: this.locale(),
      });
    } catch (error) {
      if (epoch !== this.epoch) return;
      if (error instanceof FoundryClientError && error.kind === 'auth') {
        this.record('error', `login rejected: ${error.message}`);
        await this.revoke('auth');
        return;
      }
      if (error instanceof FoundryClientError && error.kind === 'access') {
        // Credentials are kept: the fix is on the server side (e.g. make the game public).
        this.fail('access', error.message);
        return;
      }
      this.fail('network', error instanceof Error ? error.message : String(error));
    }
  }

  private attach(socket: SocketLike, epoch: number): void {
    this.socket = socket;
    this.lastSeq = -1;
    this.socketListener = (raw: unknown): void => {
      this.inbox = this.inbox.then(() => this.receive(raw, epoch));
    };
    this.disconnectListener = (): void => {
      if (epoch === this.epoch) this.fail('network', 'socket disconnected');
    };
    socket.on(DIRECT_SOCKET_EVENT, this.socketListener);
    socket.on('disconnect', this.disconnectListener);
  }

  /** Tears down socket, timers and pending requests; bumps the epoch. */
  private close(): void {
    this.epoch++;
    this.welcomed = false;
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
    if (this.socket !== null) {
      if (this.socketListener !== null) this.socket.off(DIRECT_SOCKET_EVENT, this.socketListener);
      if (this.disconnectListener !== null) this.socket.off('disconnect', this.disconnectListener);
      this.socket.disconnect();
    }
    this.socket = null;
    this.socketListener = this.disconnectListener = null;
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

  private async revoke(cause?: 'auth'): Promise<void> {
    this.close();
    await this.deps.credentials.clear();
    this.clearData(cause === undefined ? { status: 'revoked' } : { status: 'revoked', cause });
  }

  // ─── Inbound ─────────────────────────────────────────────────────────────

  private async receive(raw: unknown, epoch: number): Promise<void> {
    if (epoch !== this.epoch || this.key === null || this.creds === null) return;
    const env = SealedEnvelopeSchema.safeParse(raw);
    // Other devices' traffic shares the relay: silently skip what is not ours. The sender
    // is informational — any projector holding the device key may answer (ADR-0017).
    if (!env.success || env.data.to !== this.creds.userId) return;
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
        this.record('error', 'pairing revoked by GM');
        return this.revoke();
    }
  }

  private async onWelcome(
    msg: Extract<ProjectorMessage, { t: 'welcome' }>,
    epoch: number,
  ): Promise<void> {
    if (this.welcomed || msg.rid !== this.helloRid) return;
    if (this.welcomeTimer !== null) clearTimeout(this.welcomeTimer);
    this.welcomeTimer = null;
    if (msg.rotate !== undefined) {
      // Persist first, then switch keys: a crash in between keeps a usable pair on disk.
      this.creds = await this.deps.credentials.rotate(msg.rotate);
      const key = await importDeviceKey(msg.rotate.key);
      if (epoch !== this.epoch) return;
      this.key = key;
    }
    this.welcomed = true;
    this.attempt = 0;
    this.checkModuleVersion(msg.moduleVersion);
    const c = this.store.get().connection;
    this.setConnection({
      ...c,
      userName: msg.userName,
      gmName: msg.gmName,
      actorName: msg.actorName,
      worldTitle: msg.worldTitle,
      ...(msg.locale !== undefined ? { foundryLocale: msg.locale } : {}),
      steps: { ...(c.steps ?? NO_STEPS), server: true, login: true, gm: true },
    });
    this.heartbeatTimer = setInterval(() => this.heartbeat(), SESSION_TIMING.heartbeatInterval);
    this.snapshotTimer = setTimeout(() => {
      this.record('warn', 'snapshots incomplete — continuing');
      this.goOnline();
    }, SESSION_TIMING.snapshotTimeout);
    for (const topic of SNAPSHOT_TOPICS) this.refresh(topic);
  }

  /** Records the projector's module version; warns when the bundle was built for another. */
  private checkModuleVersion(reported: string | undefined): void {
    this.moduleVersion = reported ?? null;
    const built = this.deps.moduleVersion;
    if (reported !== undefined && built !== undefined && reported !== built) {
      this.record(
        'warn',
        `Foundry module ${reported} ≠ glasses app built for ${built} — update the glasses app`,
      );
    } else {
      this.emitInfo();
    }
  }

  private onSnapshot(topic: SnapshotTopic, data: unknown): void {
    const parsed = SNAPSHOT_SCHEMAS[topic].safeParse(data);
    if (!parsed.success) {
      this.record('warn', `invalid ${topic} snapshot`);
      return;
    }
    this.store.update({
      [topic]: parsed.data,
      ...(topic === 'combat' && parsed.data === null ? NO_TURN_STATE : {}),
    } as Partial<AppState>);
    this.touchSync();
    if (topic === 'character') this.markStep('character');
    if (topic === 'map') this.markStep('scene');
    const steps = this.store.get().connection.steps;
    if (steps?.gm === true && steps.character && steps.scene) this.goOnline();
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
    const socket = this.socket;
    const key = this.key;
    const creds = this.creds;
    if (socket === null || key === null || creds === null) return;
    seal(key, creds.userId, PROJECTOR_ADDRESS, message, this.now()).then(
      (env) => socket.emit(DIRECT_SOCKET_EVENT, env),
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
    this.creds = null;
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
