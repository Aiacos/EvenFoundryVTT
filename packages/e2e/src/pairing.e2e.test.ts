// @vitest-environment node
/**
 * Pairing end-to-end with the REAL projector code over a REAL relay (ADR-0019), including
 * the regressions of the dev-mode pairing investigation (closing the window, expiry race,
 * spent QR reopened, double hello burst, clock skew shown under the QR).
 *
 * Nothing of the pairing path is replaced by a test double:
 * - Foundry side: `module.ts` itself (the `init` hook registers settings, the Alt+G
 *   keybinding and the «Collega occhiali G2» window; `startProjector()` is what the `ready`
 *   hook runs), `PairG2App` (relay check → code → QR URL → `projector.open`), the pairing
 *   store (client setting), `Projector` + `RelayConnection` on real WebSockets under a real
 *   Web Lock (`navigator.locks`, Node ≥ 24), the real dnd5e readers, `dispatchTool` + the
 *   `skill-check` handler + the audit log.
 * - Glasses side: the real `DirectSession`, `CredentialStore`, relay opener, and the boot
 *   steps of `startApp` (`consumePairingLink` → `noteLink` → the exported `applyLink`).
 * - The relay: `wrangler dev` or production.
 *
 * Only the browser/Foundry *environment* is faked: the Foundry globals (shared fixtures),
 * an ApplicationV2 base that renders like v13 (renders queued, `_onRender` not awaited),
 * `window.location.origin`, `ChatMessage.create`, and the image APIs the asset encoder
 * uses (`createImageBitmap` / `OffscreenCanvas`). Every WebSocket is wrapped to record a
 * timeline of what went through the relay (role, room, direction, envelope from>to, size).
 *
 * Skipped unless `EVF_RELAY_URL` points at a relay (CI: the "Relay end-to-end" step, local
 * `wrangler dev` only — no scenario needs the internet then):
 *
 *   pnpm --filter @evf/relay exec wrangler dev --port 8799 --ip 127.0.0.1
 *   EVF_RELAY_URL=ws://127.0.0.1:8799 pnpm vitest --run packages/e2e/src/pairing.e2e.test.ts
 *   EVF_RELAY_URL=wss://evf-relay.evf-relay.workers.dev pnpm vitest --run packages/e2e/src/pairing.e2e.test.ts -t E2E-A
 *
 * `EVF_E2E_TRACE_DIR=<dir>` also writes each scenario's timeline as JSON.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  type FoundryMock,
  installFoundry,
  makeActor,
  makeUser,
} from '@evf/foundry-module/src/__tests__/direct-fixtures.js';
import type { PairContext } from '@evf/foundry-module/src/direct/PairG2App.js';
import type { PairingSession } from '@evf/foundry-module/src/direct/pairing-flow.js';
import {
  listPairings,
  PAIRINGS_SETTING,
  type Pairing,
} from '@evf/foundry-module/src/direct/pairing-store.js';
import { MODULE_ID } from '@evf/foundry-module/src/module-id.js';
import { applyLink } from '@evf/g2-app/src/direct/app.js';
import {
  CREDENTIALS_STORAGE_KEY,
  CredentialStore,
  consumePairingLink,
  type KeyValueStorage,
} from '@evf/g2-app/src/direct/credentials.js';
import { createRelayOpener } from '@evf/g2-app/src/direct/relay-client.js';
import { DirectSession, SESSION_TIMING } from '@evf/g2-app/src/direct/session.js';
import { createAppStore } from '@evf/g2-app/src/state/app-store.js';
import {
  CharacterSnapshotSchema,
  DEFAULT_RELAY_URL,
  deriveCodePairing,
  normalizeManualCode,
} from '@evf/shared-protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const RELAY = process.env.EVF_RELAY_URL;
const TRACE_DIR = process.env.EVF_E2E_TRACE_DIR;
const RealWebSocket = globalThis.WebSocket;
const realFetch = globalThis.fetch;

// ─── Timeline (relay traffic, console, steps) ───────────────────────────────────

interface TraceEntry {
  at: number;
  who: string;
  ev: string;
  detail?: string;
}

let t0 = performance.now();
let trace: TraceEntry[] = [];

function rec(who: string, ev: string, detail?: string): void {
  trace.push({
    at: Math.round(performance.now() - t0),
    who,
    ev,
    ...(detail === undefined ? {} : { detail }),
  });
}

/** Step marker of the scenario itself. */
function step(label: string): void {
  rec('test', 'step', label);
}

function describeFrame(data: unknown): string {
  if (typeof data !== 'string') return `binary ${String(data)}`;
  try {
    const frame = JSON.parse(data) as Record<string, unknown>;
    if (typeof frame.relay === 'string') return `ctl ${frame.relay}`;
    if (typeof frame.from === 'string')
      return `env ${frame.from}>${String(frame.to)} ${data.length}B`;
    return `json ${data.length}B`;
  } catch {
    return `text ${data.length}B`;
  }
}

/**
 * WebSocket with a per-role dial delay and a traced timeline. Implements exactly the
 * surface `RelayConnection` (projector) and `createRelayOpener` (glasses) use.
 */
class TracedSocket {
  static delay: Partial<Record<string, number>> = {};
  static open = new Set<TracedSocket>();
  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev: { code: number }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  private ws: WebSocket | null = null;
  private closedEarly = false;
  readonly who: string;

  constructor(private readonly url: string) {
    const u = new URL(url);
    const role = u.searchParams.get('role') ?? '?';
    this.who = `${role}@${(u.pathname.split('/').pop() ?? '').slice(0, 6)}`;
    const delay = TracedSocket.delay[role] ?? 0;
    rec(this.who, 'dial', delay > 0 ? `delayed ${delay} ms` : undefined);
    TracedSocket.open.add(this);
    if (delay > 0) setTimeout(() => this.dial(), delay);
    else this.dial();
  }

  get readyState(): number {
    return this.ws?.readyState ?? (this.closedEarly ? 3 : 0);
  }

  private dial(): void {
    if (this.closedEarly) return;
    const ws = new RealWebSocket(this.url);
    this.ws = ws;
    ws.onopen = (ev) => {
      rec(this.who, 'open');
      this.onopen?.(ev);
    };
    ws.onmessage = (ev) => {
      rec(this.who, 'in', describeFrame(ev.data));
      this.onmessage?.({ data: ev.data });
    };
    ws.onclose = (ev) => {
      rec(this.who, 'closed', `code ${ev.code}`);
      TracedSocket.open.delete(this);
      this.onclose?.({ code: ev.code });
    };
    ws.onerror = (ev) => {
      rec(this.who, 'error');
      this.onerror?.(ev);
    };
  }

  send(data: string): void {
    rec(this.who, 'out', describeFrame(data));
    this.ws?.send(data);
  }

  close(code?: number, reason?: string): void {
    rec(this.who, 'close()', `${code ?? ''} ${reason ?? ''}`.trim());
    TracedSocket.open.delete(this);
    if (this.ws === null) {
      this.closedEarly = true;
      return;
    }
    this.ws.close(code, reason);
  }
}

// ─── Browser / Foundry environment ────────────────────────────────────────────

/** ApplicationV2 registry (`foundry.applications.instances`). */
let instances: Map<string, unknown>;

/**
 * ApplicationV2 base close to v13: renders are queued one at a time, the instance is
 * registered on render, `_onRender` runs after the render without being awaited,
 * `close()` unregisters and runs `_onClose`.
 */
class FakeApplicationV2 {
  /** Every window ever created (killed at the end of each test). */
  static all = new Set<FakeApplicationV2>();
  static DEFAULT_OPTIONS: { id?: string } = {};
  element = { querySelector: (_s: string) => null } as unknown as HTMLElement;
  rendered = false;
  renders = 0;
  lastContext: unknown = null;
  private queue: Promise<unknown> = Promise.resolve();
  /** Registry of the tab that created the window. */
  private readonly registry = instances;

  constructor() {
    FakeApplicationV2.all.add(this);
  }

  /** The page went away: the window dies with it (no `_onClose`, no discard). */
  kill(): void {
    const self = this as unknown as Record<string, unknown>;
    if (typeof self.stopTicker === 'function') (self.stopTicker as () => void).call(this);
    (self.unsubscribe as (() => void) | null | undefined)?.();
    this.rendered = false;
    this.registry.delete(this.id);
    FakeApplicationV2.all.delete(this);
  }

  get id(): string {
    return (this.constructor as typeof FakeApplicationV2).DEFAULT_OPTIONS.id ?? 'app';
  }

  render(options: { force?: boolean } = {}): Promise<this> {
    const run = async (): Promise<this> => {
      if (!this.rendered && options.force !== true) return this;
      this.lastContext = await this._prepareContext();
      this.renders++;
      this.rendered = true;
      this.registry.set(this.id, this);
      void Promise.resolve()
        .then(() => this._onRender())
        .catch((err: unknown) => rec('window', 'onRender-error', String(err)));
      return this;
    };
    const next = this.queue.then(run);
    this.queue = next.catch(() => undefined);
    return next;
  }

  async close(): Promise<this> {
    this.registry.delete(this.id);
    this.rendered = false;
    this._onClose();
    return this;
  }

  async _prepareContext(): Promise<unknown> {
    return {};
  }
  async _onRender(): Promise<void> {}
  _onClose(): void {}
}

/** What the tests read from the pairing window. */
interface PairWindow {
  session: PairingSession | null;
  expired: boolean;
  cancelled: boolean;
  connected: string | null;
  relayOk: boolean | null;
  renders: number;
  lastContext: PairContext | null;
  close(): Promise<unknown>;
  cancelQr(): Promise<void>;
  _prepareContext(): Promise<PairContext>;
}

/** Labels (i18n keys) of the live status under the QR. */
async function liveLabels(win: PairWindow): Promise<string[]> {
  return (await win._prepareContext()).live.map((item) => item.label);
}

/** In-memory `localStorage` of the phone WebView (survives a page reload). */
class MemoryStorage implements KeyValueStorage {
  readonly map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

const chatCreate = vi.fn(async (data: unknown) => data);

function stubBrowser(): void {
  instances = new Map();
  vi.stubGlobal('foundry', {
    utils: { getRoute: (p: string) => `/game${p}` },
    applications: {
      instances,
      api: {
        ApplicationV2: FakeApplicationV2,
        HandlebarsApplicationMixin: <T>(base: T) => base,
      },
    },
  });
  vi.stubGlobal('window', { location: { origin: 'https://evf.forge-vtt.com' } });
  vi.stubGlobal('ChatMessage', { create: chatCreate });
  vi.stubGlobal('WebSocket', TracedSocket);
  // Same-origin scene art: the projector tab fetches it from Foundry.
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (/^https?:\/\//.test(url)) return realFetch(url, init);
      return new Response(new Blob([new Uint8Array(1024)], { type: 'image/webp' }));
    }),
  );
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ width: 4000, height: 3000, close() {} })),
  );
  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      constructor(
        readonly width: number,
        readonly height: number,
      ) {}
      getContext() {
        return { imageSmoothingQuality: 'low', drawImage() {} };
      }
      async convertToBlob(opts: { type: string }) {
        // ~0.25 B/px, the order of magnitude of a q=0.75 JPEG of a battle map.
        const bytes = new Uint8Array(Math.round(this.width * this.height * 0.25));
        for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 31) & 255;
        return new Blob([bytes], { type: opts.type });
      }
    },
  );
}

function thorin() {
  return makeActor('thorin', 'Thorin', {
    ownership: { p1: 3 },
    img: 'worlds/w/portraits/thorin.webp',
    rollSkill: vi.fn(async () => [{ total: 17, formula: '1d20 + 3' }]),
  });
}

function crypt(actor: Record<string, unknown>) {
  return {
    id: 's1',
    name: 'Cripta',
    grid: { size: 100, distance: 5 },
    dimensions: { sceneX: 0, sceneY: 0, sceneWidth: 2000, sceneHeight: 1500 },
    background: { src: 'worlds/w/maps/crypt.webp' },
    environment: { darknessLevel: 0 },
    walls: { contents: [] },
    tokens: {
      contents: [
        {
          id: 'tok1',
          uuid: 'Scene.s1.Token.tok1',
          name: 'Thorin',
          x: 300,
          y: 400,
          width: 1,
          height: 1,
          disposition: 1,
          hidden: false,
          actorId: 'thorin',
          actor,
          texture: { src: 'worlds/w/tokens/thorin.webp' },
        },
      ],
      get: () => undefined,
    },
  };
}

// ─── A Foundry tab (projector) ────────────────────────────────────────────────

interface Tab {
  f: FoundryMock;
  mod: typeof import('@evf/foundry-module/src/module.js');
  /** Presses Alt+G and waits for the window to show a QR (or settle). */
  pressAltG(): Promise<PairWindow>;
  window(): PairWindow | undefined;
  /** The browser's persisted client settings (what survives a reload). */
  storage(): Map<string, unknown>;
  /** Tab closed / reloaded: the page goes away (no `_onClose`), locks and sockets drop. */
  unload(): void;
}

/**
 * Opens a Foundry tab of the player's browser: installs the globals, imports a FRESH
 * module instance, runs its `init` hook and `startProjector()` (the `ready` hook's work).
 *
 * @param persisted - client settings of this browser from an earlier tab (reload)
 */
async function openTab(persisted: Map<string, unknown> | null, relay: string): Promise<Tab> {
  const actor = thorin();
  const luca = makeUser('p1', 'Luca', { character: { id: 'thorin' } });
  const f = installFoundry({
    users: [luca],
    localIsGM: false,
    actors: [actor],
    scene: crypt(actor),
  });
  f.game.user = luca;
  // A GM is online (the audit log whispers to GMs; the fixture's GM is not the local user).
  (f.users[0] as { isGM: boolean }).isGM = true;
  if (persisted !== null) for (const [k, v] of persisted) f.settings.set(k, structuredClone(v));
  f.settings.set(`${MODULE_ID}.relayUrl`, relay);
  stubBrowser();
  vi.resetModules();
  const mod = await import('@evf/foundry-module/src/module.js');
  f.fire('init');
  await mod.startProjector();
  rec('tab', 'ready', `${listPairings().length} pairing(s) in this browser`);
  const current = () => instances.get('evf-pair-g2') as PairWindow | undefined;
  return {
    f,
    mod,
    window: current,
    storage: () => f.settings,
    async pressAltG() {
      const binding = f.keybindings.get(`${MODULE_ID}.pairGlasses`);
      expect(binding?.onDown).toBeTypeOf('function');
      binding?.onDown?.();
      await vi.waitFor(
        () => {
          const w = current();
          if (w === undefined || (w.session === null && w.relayOk !== false)) {
            throw new Error('window still preparing');
          }
        },
        { timeout: 10_000, interval: 10 },
      );
      const w = current() as PairWindow;
      rec('window', 'qr', w.session?.url ?? `relayOk=${String(w.relayOk)}`);
      return w;
    },
    unload() {
      rec('tab', 'unload');
      (current() as unknown as FakeApplicationV2 | undefined)?.kill();
      mod.projector.stop();
    },
  };
}

// ─── The glasses (phone WebView) ──────────────────────────────────────────────

interface Glasses {
  session: DirectSession;
  store: ReturnType<typeof createAppStore>;
  storage: MemoryStorage;
  status(): ReturnType<ReturnType<typeof createAppStore>['get']>['connection'];
  /** What the phone WebView does when it loads `url` (startApp's pairing lines). */
  boot(url: string | null): Promise<void>;
  diagnostics(): string[];
}

function glasses(
  storage: MemoryStorage = new MemoryStorage(),
  clock: () => number = Date.now,
  builtInRelay: string = DEFAULT_RELAY_URL,
): Glasses {
  const store = createAppStore();
  const warnings: string[] = [];
  const session = new DirectSession({
    store,
    credentials: new CredentialStore(storage, (m, e) => warnings.push(`${m}: ${String(e)}`)),
    openRelay: createRelayOpener(),
    // The hosted page / .ehpk are built for the production relay; a QR may override it.
    relayUrl: builtInRelay,
    appVersion: 'e2e',
    settingsStorage: storage,
    deviceLanguage: () => 'it',
    now: () => clock(),
  });
  let lastStatus = '';
  store.subscribe((state) => {
    const c = state.connection;
    const label = `${c.status}${c.cause ? `/${c.cause}` : ''}`;
    if (label !== lastStatus) {
      lastStatus = label;
      rec('glasses', 'status', label);
    }
  });
  const seen = new WeakSet<object>();
  session.subscribeInfo((info) => {
    for (const d of info.diagnostics) {
      if (seen.has(d)) continue;
      seen.add(d);
      rec('glasses', `diag-${d.level}`, d.message);
    }
  });
  return {
    session,
    store,
    storage,
    status: () => store.get().connection,
    async boot(url) {
      rec('glasses', 'boot', url ?? '(no fragment)');
      // startApp's steps (app.ts): read + strip the link, note it, apply it (shipped code).
      const u = new URL(url ?? 'https://aiacos.github.io/EvenFoundryVTT/app/');
      const link = consumePairingLink(
        { pathname: u.pathname, search: u.search, hash: u.hash },
        { replaceState: () => {} },
      );
      session.noteLink(link.kind);
      await applyLink(session, link);
    },
    diagnostics: () => [
      ...session.info().diagnostics.map((d) => `${d.level}: ${d.message}`),
      ...warnings,
    ],
  };
}

// ─── Harness lifecycle ────────────────────────────────────────────────────────

const WAIT = { timeout: 15_000, interval: 20 };
let consoleLines: string[];
let cleanups: Array<() => void>;

beforeEach(() => {
  t0 = performance.now();
  trace = [];
  consoleLines = [];
  cleanups = [];
  TracedSocket.delay = {};
  for (const level of ['warn', 'error'] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      const line = args.map((a) => (a instanceof Error ? a.message : String(a))).join(' ');
      consoleLines.push(`${level}: ${line}`);
      rec('console', level, line);
    });
  }
});

afterEach(async (ctx) => {
  for (const c of cleanups.splice(0).reverse()) c();
  for (const s of [...TracedSocket.open]) s.close(1000, 'test over');
  for (const w of [...FakeApplicationV2.all]) w.kill();
  // Let in-flight renders / seals settle before the globals go away.
  await new Promise((r) => setTimeout(r, 200));
  const name = (ctx.task.name.split(' ')[0] ?? 'scenario').replace(/[^\w-]/g, '_');
  if (TRACE_DIR !== undefined) {
    mkdirSync(TRACE_DIR, { recursive: true });
    writeFileSync(
      join(TRACE_DIR, `${name}-${RELAY?.startsWith('wss') ? 'prod' : 'local'}.json`),
      JSON.stringify({ relay: RELAY, trace, console: consoleLines }, null, 1),
    );
  }
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** Registers a tab / glasses for cleanup at the end of the test. */
function track<T extends { unload?: () => void; session?: DirectSession }>(x: T): T {
  cleanups.push(() => {
    if (x.session !== undefined) x.session.dispose();
    if (x.unload !== undefined) x.unload();
  });
  return x;
}

function framesOf(pattern: RegExp): TraceEntry[] {
  return trace.filter((e) => pattern.test(`${e.who} ${e.ev} ${e.detail ?? ''}`));
}

function at(pattern: RegExp): number | undefined {
  return framesOf(pattern)[0]?.at;
}

function storedCredentials(g: Glasses): { room: string; key: string; relay?: string } | null {
  const raw = g.storage.getItem(CREDENTIALS_STORAGE_KEY);
  return raw === null ? null : (JSON.parse(raw) as { room: string; key: string; relay?: string });
}

/**
 * Offline causes of glasses whose code got no answer: `no-projector`, or `code-pending`
 * while the code is not confirmed yet.
 */
const NO_ANSWER = ['no-projector', 'code-pending'];

/** Sizes of the sealed frames the projector sent (bytes; its own `out` lines only). */
function projectorFrameSizes(): number[] {
  return framesOf(/^projector@\S+ out env projector>glasses/).map((e) =>
    Number(/(\d+)B/.exec(e.detail ?? '')?.[1] ?? 0),
  );
}

// ─── Scenarios ────────────────────────────────────────────────────────────────

describe.skipIf(RELAY === undefined)(
  `pairing end-to-end, real projector + real relay (${RELAY})`,
  () => {
    const relay = RELAY as string;

    it('E2E-00 fixture sanity: the real character reader yields a snapshot the glasses accept', async () => {
      const tab = track(await openTab(null, relay));
      const { getCharacterSnapshot } = await import(
        '@evf/foundry-module/src/readers/character-reader.js'
      );
      const parsed = CharacterSnapshotSchema.safeParse(getCharacterSnapshot('thorin'));
      expect(parsed.success, JSON.stringify(parsed.error?.issues.slice(0, 3))).toBe(true);
      expect(tab.mod.projector.projectedActors()).toEqual([]);
    });

    it('E2E-A Alt+G → QR → glasses boot from the QR URL → rotate → online, sheet + map + asset, invoke', async () => {
      const tab = track(await openTab(null, relay));
      step('Alt+G');
      const win = await tab.pressAltG();
      expect(win.relayOk).toBe(true);
      const qr = win.session as PairingSession;
      // What the QR encodes and what the window prints.
      expect(qr.url).toMatch(/^https:\/\/aiacos\.github\.io\/EvenFoundryVTT\/app\/#c=[0-9A-Z]{16}/);
      expect(qr.url.length).toBeLessThanOrEqual(relay === DEFAULT_RELAY_URL ? 63 : 120);
      expect(normalizeManualCode(qr.code)).toBe(new URL(qr.url).hash.slice(3, 19));
      if (relay !== DEFAULT_RELAY_URL) expect(qr.url).toContain(`&relay=${relay}`);
      const pending = listPairings();
      expect(pending).toHaveLength(1);
      expect(pending[0]?.room).toBe((await deriveCodePairing(qr.code)).room);
      // The projector joined the code room; the window says so under the QR.
      await vi.waitFor(() => expect(at(/^projector@\S+ open/)).toBeDefined(), WAIT);
      expect(tab.mod.projector.status(qr.deviceId)).toBe('waiting');
      expect(await liveLabels(win)).toEqual([
        'evf.pair.live.relay_up',
        'evf.pair.live.glasses_waiting',
      ]);
      // The QR opens the default page (a local relay is flagged «custom», never the page).
      expect((await win._prepareContext()).endpointNotices.map((n) => n.which)).not.toContain(
        'appUrl',
      );

      step('glasses boot from the QR URL');
      const g = track(glasses());
      await g.boot(qr.url);
      await vi.waitFor(() => expect(g.status().status).toBe('online'), WAIT);
      step('glasses online');

      // Rotation happened: stored credentials are no longer the code-derived ones.
      const codeCreds = await deriveCodePairing(qr.code);
      const stored = storedCredentials(g);
      expect(stored?.room).not.toBe(codeCreds.room);
      expect(stored?.key).not.toBe(codeCreds.key);
      const persisted = listPairings()[0] as Pairing;
      expect(persisted).toMatchObject({ room: stored?.room, key: stored?.key, expiresAt: null });

      // HUD data.
      const state = g.store.get();
      expect(state.connection).toMatchObject({
        userName: 'Luca',
        actorName: 'Thorin',
        gmName: 'Anna',
      });
      expect(state.character?.name).toBe('Thorin');
      expect(state.map?.name).toBe('Cripta');
      expect(state.map?.background?.src).toMatch(/^data:image\/jpeg;base64,/);
      expect(state.map?.tokens[0]).toMatchObject({ id: 'tok1', kind: 'self' });
      expect(state.map?.tokens[0]?.img).toMatch(/^data:image\/png;base64,/);

      // The window flips to success by itself; the device row is online.
      await vi.waitFor(() => expect(win.connected).toBe('Thorin'), WAIT);
      expect(tab.mod.projector.status(qr.deviceId)).toBe('online');
      const ctx = await win._prepareContext();
      expect(ctx.devices).toMatchObject([
        { deviceId: qr.deviceId, status: 'online', label: 'Thorin' },
      ]);

      // A repeated hello on the welcomed link (e.g. the glasses re-saying it on a peer-up):
      // the projector answers with a welcome only. The invoke below is handled after it
      // (frames are handled one at a time), so a second push would already be on the wire.
      step('second hello on the welcomed link');
      (g.session as unknown as { sendHello(): void }).sendHello();

      step('invoke skill-check');
      const result = await g.session.invoke('skill-check', { skill: 'prc' });
      expect(result).toMatchObject({
        ok: true,
        data: { kind: 'skill', skill: 'prc', result: [{ total: 17 }] },
      });
      const rollSkill = (tab.f.actors.get('thorin') as { rollSkill: ReturnType<typeof vi.fn> })
        .rollSkill;
      expect(rollSkill).toHaveBeenCalledWith(
        { skill: 'prc', advantage: false, disadvantage: false },
        { configure: false },
      );
      await vi.waitFor(() => expect(chatCreate).toHaveBeenCalled());
      step('invoke done');

      // Timeline facts.
      const firstHello = at(/^glasses@\S+ out env glasses>projector/);
      const online = at(/^glasses status online/);
      rec('test', 'summary', `first hello at ${firstHello} ms, online at ${online} ms`);
      // Exactly one rotation, and the relay carried the asset in one frame < 1 MiB.
      expect(g.diagnostics().filter((d) => d.includes('rotated'))).toHaveLength(1);
      const sizes = projectorFrameSizes();
      const biggest = Math.max(...sizes);
      expect(biggest).toBeGreaterThan(50_000);
      expect(biggest).toBeLessThan(1_048_576);
      // Regression (double hello → double push, H6): the background picture went out once,
      // although the projector got a second hello on the welcomed link.
      expect(sizes.filter((n) => n > 50_000)).toHaveLength(1);
      expect(consoleLines.filter((l) => l.startsWith('error'))).toEqual([]);
    }, 60_000);

    it('E2E-B1 glasses first: the projector socket reaches the room 3 s after the scan', async () => {
      const tab = track(await openTab(null, relay));
      TracedSocket.delay.projector = 3_000;
      const win = await tab.pressAltG();
      const qr = win.session as PairingSession;
      const g = track(glasses());
      step('glasses boot (projector not yet in the room)');
      await g.boot(qr.url);
      await vi.waitFor(() => expect(g.status().steps?.relay).toBe(true), WAIT);
      expect(g.status().status).toBe('connecting');
      await vi.waitFor(() => expect(g.status().status).toBe('online'), WAIT);
      const online = at(/^glasses status online/) as number;
      const projectorOpen = at(/^projector@\S+ open/) as number;
      rec(
        'test',
        'summary',
        `projector joined at ${projectorOpen} ms, glasses online at ${online} ms`,
      );
      expect(online - projectorOpen).toBeLessThan(SESSION_TIMING.welcomeTimeout);
      await vi.waitFor(() => expect(win.connected).toBe('Thorin'), WAIT);
    }, 60_000);

    it('E2E-B2 window first: the glasses scan 3 s after the QR appeared', async () => {
      const tab = track(await openTab(null, relay));
      const win = await tab.pressAltG();
      const qr = win.session as PairingSession;
      await new Promise((r) => setTimeout(r, 3_000));
      const g = track(glasses());
      await g.boot(qr.url);
      await vi.waitFor(() => expect(g.status().status).toBe('online'), WAIT);
      await vi.waitFor(() => expect(win.connected).toBe('Thorin'), WAIT);
    }, 60_000);

    it('E2E-B3/C paired glasses wait (no-projector) → tab reload 3 s later → online without re-scanning', async () => {
      const tab1 = await openTab(null, relay);
      const win = await tab1.pressAltG();
      const qr = win.session as PairingSession;
      const g = track(glasses());
      await g.boot(qr.url);
      await vi.waitFor(() => expect(g.status().status).toBe('online'), WAIT);
      const credsAfterPairing = storedCredentials(g);

      step('tab reload: the page goes away');
      const persisted = new Map(tab1.storage());
      tab1.unload();
      await vi.waitFor(
        () => expect(g.status()).toMatchObject({ status: 'offline', cause: 'no-projector' }),
        WAIT,
      );
      step('glasses show no-projector');
      await new Promise((r) => setTimeout(r, 3_000));

      step('new tab, same browser storage');
      const tab2 = track(await openTab(persisted, relay));
      const pairings = listPairings();
      expect(pairings).toHaveLength(1);
      expect(pairings[0]).toMatchObject({ deviceId: qr.deviceId, expiresAt: null });
      expect(pairings[0]?.lastSeenAt).not.toBeNull();
      await vi.waitFor(() => expect(g.status().status).toBe('online'), WAIT);
      step('glasses back online');
      expect(storedCredentials(g)).toEqual(credsAfterPairing);
      expect(tab2.mod.projector.status(qr.deviceId)).toBe('online');
      const back = at(/new tab/) as number;
      const online = trace.filter((e) => e.ev === 'status' && e.detail === 'online').pop()
        ?.at as number;
      rec('test', 'summary', `reconnected ${online - back} ms after the new tab started`);
      expect(online - back).toBeLessThan(SESSION_TIMING.welcomeTimeout + 2_000);
    }, 90_000);

    it('E2E-D manual code: lowercase with dashes, and the whole link typed with a capital first letter', async () => {
      const tab = track(await openTab(null, relay));
      const win = await tab.pressAltG();
      const qr = win.session as PairingSession;
      const g = track(glasses());
      await g.boot(null);
      expect(g.status().status).toBe('unpaired');
      // The phone page's field: code as shown, lowercased by the keyboard (a local relay
      // needs the whole link: only the link carries `&relay=`).
      const typed = relay === DEFAULT_RELAY_URL ? qr.code.toLowerCase() : qr.url.toLowerCase();
      step(`pairCode(${typed})`);
      await g.session.pairCode(typed);
      await vi.waitFor(() => expect(g.status().status).toBe('online'), WAIT);
      await vi.waitFor(() => expect(win.connected).toBe('Thorin'), WAIT);

      // Second window session, typed exactly as a phone keyboard would: capital first letter.
      const g2 = track(glasses());
      await win.close();
      const win2 = await tab.pressAltG();
      const qr2 = win2.session as PairingSession;
      const lower = qr2.code.toLowerCase();
      const typed2 = `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`;
      await g2.boot(null);
      if (relay === DEFAULT_RELAY_URL) {
        await g2.session.pairCode(typed2);
      } else {
        // Local relay: the bare code would send the glasses to the production relay, so the
        // player must type the whole link (it carries &relay=).
        await g2.session.pairCode(
          `Https://aiacos.github.io/evenfoundryvtt/app/#c=${lower}&relay=${relay}`,
        );
      }
      await vi.waitFor(() => expect(g2.status().status).toBe('online'), WAIT);
    }, 60_000);

    it('E2E-D2 local/self-hosted relay: the bare 16-char code sends the glasses to the relay the app was built for', async () => {
      if (relay === DEFAULT_RELAY_URL) return;
      const tab = track(await openTab(null, relay));
      const win = await tab.pressAltG();
      const qr = win.session as PairingSession;
      // The app's built-in relay stands in for production (no internet in CI): a local
      // address where no relay listens.
      const builtIn = 'ws://127.0.0.1:9';
      const g = track(glasses(new MemoryStorage(), Date.now, builtIn));
      await g.boot(null);
      await g.session.pairCode(qr.code);
      expect(g.status().server).toBe('127.0.0.1:9');
      expect(g.session.info().boot.relay).toBe('127.0.0.1:9');
      // The built-in relay does not answer: the glasses never reach the QR's relay room.
      await vi.waitFor(
        () => expect(g.status()).toMatchObject({ status: 'offline', cause: 'network' }),
        WAIT,
      );
      expect(framesOf(/^glasses@\S+ open/)).toHaveLength(0);
      expect(tab.mod.projector.diagnostics(qr.deviceId).glasses).toBe(false);
      expect(win.connected).toBeNull();
    }, 60_000);

    it('E2E-E regression: window closed before scanning — the QR still pairs (the projector keeps it)', async () => {
      const tab = track(await openTab(null, relay));
      const win = await tab.pressAltG();
      const qr = win.session as PairingSession;
      await vi.waitFor(() => expect(tab.mod.projector.status(qr.deviceId)).toBe('waiting'), WAIT);
      step('close the window');
      await win.close();
      await new Promise((r) => setTimeout(r, 300));
      expect(listPairings().map((p) => p.deviceId)).toEqual([qr.deviceId]);
      expect(framesOf(/^projector@\S+ close\(\)/)).toHaveLength(0);
      const g = track(glasses());
      await g.boot(qr.url);
      await vi.waitFor(() => expect(g.status().status).toBe('online'), WAIT);
      step('glasses online with the window closed');
      expect(tab.mod.projector.status(qr.deviceId)).toBe('online');
      expect(listPairings()[0]).toMatchObject({ deviceId: qr.deviceId, expiresAt: null });
      // Reopening lists the glasses online and shows a fresh QR (the old one is spent).
      const again = await tab.pressAltG();
      expect(again.session?.code).not.toBe(qr.code);
      const ctx = await again._prepareContext();
      expect(ctx.devices).toMatchObject([{ deviceId: qr.deviceId, status: 'online' }]);
    }, 60_000);

    it('E2E-E2 regression: window closed right after the scan, while the phone page is still loading (1.5 s)', async () => {
      const tab = track(await openTab(null, relay));
      const win = await tab.pressAltG();
      const qr = win.session as PairingSession;
      const g = track(glasses());
      // The player scans, sees the phone react, closes the Foundry window; the WebView needs
      // ~1.5 s (page load + bridge wait of main.ts) before the session starts.
      step('scan; window closed 200 ms later');
      setTimeout(() => void win.close(), 200);
      await new Promise((r) => setTimeout(r, 1_500));
      await g.boot(qr.url);
      await vi.waitFor(() => expect(g.status().status).toBe('online'), WAIT);
      rec('test', 'summary', `glasses: ${g.status().status}`);
      expect(listPairings()).toMatchObject([{ deviceId: qr.deviceId, expiresAt: null }]);
    }, 60_000);

    it('E2E-E4 «Annulla QR»: the cancelled code no longer pairs', async () => {
      const tab = track(await openTab(null, relay));
      const win = await tab.pressAltG();
      const qr = win.session as PairingSession;
      step('«Annulla QR»');
      await win.cancelQr();
      expect(win.cancelled).toBe(true);
      expect(listPairings()).toHaveLength(0);
      await vi.waitFor(() => expect(framesOf(/^projector@\S+ close\(\)/)).toHaveLength(1), WAIT);
      const g = track(glasses());
      await g.boot(qr.url);
      await vi.waitFor(
        () => {
          expect(g.status().status).toBe('offline');
          expect(NO_ANSWER).toContain(g.status().cause);
        },
        {
          timeout: SESSION_TIMING.helloGrace + SESSION_TIMING.welcomeTimeout + 4_000,
          interval: 50,
        },
      );
      expect(win.connected).toBeNull();
      expect(win.session).toBeNull();
    }, 60_000);

    it('E2E-E3 reopening the window within the 5 minutes shows the same QR, code and countdown', async () => {
      const tab = track(await openTab(null, relay));
      const win = await tab.pressAltG();
      const qr = win.session as PairingSession;
      await win.close();
      step('Alt+G again');
      const again = await tab.pressAltG();
      expect(again.session).toMatchObject({
        deviceId: qr.deviceId,
        code: qr.code,
        url: qr.url,
        expiresAt: qr.expiresAt,
      });
      expect(listPairings()).toHaveLength(1);
      const g = track(glasses());
      await g.boot(qr.url);
      await vi.waitFor(() => expect(g.status().status).toBe('online'), WAIT);
      await vi.waitFor(() => expect(again.connected).toBe('Thorin'), WAIT);
    }, 60_000);

    it('E2E-H phone clock 5 minutes ahead: the window shows why the glasses are refused', async () => {
      const tab = track(await openTab(null, relay));
      const win = await tab.pressAltG();
      const qr = win.session as PairingSession;
      const g = track(glasses(new MemoryStorage(), () => Date.now() + 5 * 60_000));
      await g.boot(qr.url);
      await vi.waitFor(
        () => expect(tab.mod.projector.diagnostics(qr.deviceId).rejected).toBe('stale'),
        WAIT,
      );
      expect(await liveLabels(win)).toEqual([
        'evf.pair.live.relay_up',
        'evf.pair.live.glasses_in',
        'evf.pair.live.rejected_stale',
      ]);
      expect(win.connected).toBeNull();
      expect(consoleLines.join('\n')).toContain('(stale)');
    }, 60_000);

    it('E2E-F1 after 5 minutes the unused QR expires: window says expired, the scan gets no-projector', async () => {
      const tab = track(await openTab(null, relay));
      const win = await tab.pressAltG();
      const qr = win.session as PairingSession;
      step('5 minutes pass (Date faked, timers real)');
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(qr.expiresAt + 1_000);
      await vi.waitFor(() => expect(win.expired).toBe(true), { timeout: 3_000, interval: 50 });
      // The expired QR is forgotten and its channel closed — and (regression: expiry race)
      // no new QR / pending pairing was started behind the player's back.
      await new Promise((r) => setTimeout(r, 300));
      expect(win.session).toBeNull();
      expect(listPairings()).toHaveLength(0);
      expect((await win._prepareContext()).expired).toBe(true);
      const g = track(glasses());
      await g.boot(qr.url);
      await vi.waitFor(
        () => {
          expect(g.status().status).toBe('offline');
          expect(NO_ANSWER).toContain(g.status().cause);
        },
        { timeout: SESSION_TIMING.welcomeTimeout + 4_000, interval: 50 },
      );
    }, 60_000);

    it('E2E-F1b a pending QR saved before a reload is pruned when the new tab starts after expiry', async () => {
      const tab1 = await openTab(null, relay);
      const win = await tab1.pressAltG();
      const qr = win.session as PairingSession;
      const persisted = new Map(tab1.storage());
      tab1.unload(); // reload without closing the window: the pending pairing stays stored
      expect(
        (persisted.get(`${MODULE_ID}.${PAIRINGS_SETTING}`) as Record<string, unknown>)[qr.deviceId],
      ).toBeDefined();
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(qr.expiresAt + 1);
      track(await openTab(persisted, relay));
      expect(listPairings()).toHaveLength(0);
    }, 60_000);

    it('E2E-F1c a reload within the 5 minutes keeps the pending QR working (the new tab serves it)', async () => {
      const tab1 = await openTab(null, relay);
      const win = await tab1.pressAltG();
      const qr = win.session as PairingSession;
      const persisted = new Map(tab1.storage());
      tab1.unload();
      const tab2 = track(await openTab(persisted, relay));
      expect(listPairings()).toHaveLength(1);
      const g = track(glasses());
      await g.boot(qr.url);
      await vi.waitFor(() => expect(g.status().status).toBe('online'), WAIT);
      expect(tab2.mod.projector.status(qr.deviceId)).toBe('online');
    }, 60_000);

    it('E2E-F2 a second scan of the spent QR: another phone gets no answer; the SAME phone reopening the QR URL keeps its working pairing', async () => {
      const tab = track(await openTab(null, relay));
      const win = await tab.pressAltG();
      const qr = win.session as PairingSession;
      const phone = new MemoryStorage();
      const g1 = glasses(phone);
      await g1.boot(qr.url);
      await vi.waitFor(() => expect(g1.status().status).toBe('online'), WAIT);
      const good = storedCredentials(g1);

      step('another phone scans the spent QR');
      const other = track(glasses());
      await other.boot(qr.url);
      await vi.waitFor(
        () => {
          expect(other.status().status).toBe('offline');
          expect(NO_ANSWER).toContain(other.status().cause);
        },
        { timeout: SESSION_TIMING.welcomeTimeout + 4_000, interval: 50 },
      );
      other.session.dispose();

      step('same phone: the WebView loads the QR URL again (reopen / reload with #c=)');
      g1.session.dispose(); // the old page is gone
      const g1again = track(glasses(phone));
      await g1again.boot(qr.url);
      await vi.waitFor(() => expect(g1again.status().status).toBe('online'), WAIT);
      const after = storedCredentials(g1again);
      rec('test', 'summary', `stored creds ${after?.room === good?.room ? 'kept' : 'OVERWRITTEN'}`);
      // Regression: the spent code no longer replaces the rotated credentials.
      expect(after?.room).toBe(good?.room);
      expect(after?.key).toBe(good?.key);
      expect(win.connected).toBe('Thorin');
      expect(tab.mod.projector.status(qr.deviceId)).toBe('online');
    }, 60_000);
  },
);

// ─── The real glasses-app bundle in a real browser engine ─────────────────────
//
// The phone WebView of the Even Realities App is Chromium on Android. Here the SAME bundle
// that GitHub Pages serves (`packages/g2-app/dist`, identical hash) runs in headless
// Chromium against the real projector above and the production relay, opened:
//  - from the deployed https page (what the Foundry QR opens),
//  - from http://<LAN-IP>:<port> (what `pnpm dev:glasses` serves: not a secure context, so
//    the @evf/shared-protocol crypto fallback runs),
//  - from http://127.0.0.1:<port> (control: loopback is a secure context).
//
// BR-2 (LAN IP) and BR-3 (loopback) serve the local build and follow the QR's `&relay=`, so
// they run against `wrangler dev` too (CI); BR-1/4/5 open the deployed Pages page and need
// the production relay.
//
//   pnpm --filter @evf/g2-app build
//   EVF_RELAY_URL=ws://127.0.0.1:8799 \
//   EVF_CHROMIUM="$(node -e "console.log(require('@playwright/test').chromium.executablePath())")" \
//   EVF_LAN_IP="$(hostname -I | awk '{print $1}')" \
//   pnpm vitest --run packages/e2e/src/pairing.e2e.test.ts -t BR-

const CHROMIUM = process.env.EVF_CHROMIUM;
const LAN_IP = process.env.EVF_LAN_IP;
const DIST = join(import.meta.dirname, '../../g2-app/dist');

interface PageProbe {
  secure: boolean;
  subtle: boolean;
  randomUUID: boolean;
  status: string | null;
  cause: string | null;
  text: string;
}

async function serveDist(host: string): Promise<{ origin: string; close(): Promise<void> }> {
  const { createServer } = await import('node:http');
  const { readFile } = await import('node:fs/promises');
  const types: Record<string, string> = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.png': 'image/png',
  };
  const server = createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://x').pathname;
    const file = join(DIST, path === '/' ? 'index.html' : path);
    readFile(file).then(
      (body) => {
        const type = types[file.slice(file.lastIndexOf('.'))] ?? 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': type });
        res.end(body);
      },
      () => {
        res.writeHead(404);
        res.end();
      },
    );
  });
  await new Promise<void>((resolve) => server.listen(0, host, resolve));
  const { port } = server.address() as { port: number };
  return {
    origin: `http://${host}:${port}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

/** `…/app/#c=CODE` → `…/app/?debug=1#c=CODE` (exposes `window.__evf`). */
function withDebug(url: string): string {
  const [base, hash] = url.split('#');
  return `${base}?debug=1#${hash}`;
}

describe.skipIf(RELAY === undefined || CHROMIUM === undefined)(
  `the real glasses-app bundle in Chromium (${RELAY})`,
  () => {
    const relay = RELAY as string;
    const production = relay === DEFAULT_RELAY_URL;

    async function launch() {
      const { chromium } = await import('@playwright/test');
      const browser = await chromium.launch({ executablePath: CHROMIUM as string, headless: true });
      const page = await browser.newPage({ locale: 'it-IT' });
      page.on('console', (m) => rec('page', `console-${m.type()}`, m.text().slice(0, 300)));
      page.on('pageerror', (e) => rec('page', 'pageerror', String(e).slice(0, 300)));
      cleanups.push(() => void browser.close());
      const probe = (): Promise<PageProbe> =>
        page.evaluate(() => {
          type Evf = {
            state(): { app: { connection: { status: string; cause?: string } } | null };
          };
          const evf = (window as unknown as { __evf?: Evf }).__evf;
          const c = evf?.state().app?.connection;
          return {
            secure: window.isSecureContext,
            subtle: typeof globalThis.crypto?.subtle !== 'undefined',
            randomUUID: typeof globalThis.crypto?.randomUUID === 'function',
            status: c?.status ?? null,
            cause: c?.cause ?? null,
            text: document.body.innerText.slice(0, 400),
          };
        });
      return { page, probe };
    }

    /**
     * Projector tab shows a QR; the browser opens `pageUrl`, where `{CODE}` = the code and
     * `{LINK}` = the QR's fragment (the code plus `&relay=` for a local relay).
     */
    async function pairFromBrowser(pageUrl: string) {
      const tab = track(await openTab(null, relay));
      const win = await tab.pressAltG();
      const qr = win.session as PairingSession;
      const { page, probe } = await launch();
      const url = pageUrl
        .replace('{CODE}', normalizeManualCode(qr.code) as string)
        .replace('{LINK}', new URL(qr.url).hash);
      step(`browser opens ${url}`);
      await page.goto(url);
      return { win, qr, page, probe };
    }

    const ONLINE = { timeout: 20_000, interval: 200 };

    it.skipIf(!production)(
      'BR-1 deployed https page opened from the Foundry QR → online; the window flips to «collegati»',
      async () => {
        const tab = track(await openTab(null, relay));
        const win = await tab.pressAltG();
        const qr = win.session as PairingSession;
        const { page, probe } = await launch();
        step(`browser opens ${withDebug(qr.url)}`);
        await page.goto(withDebug(qr.url));
        await vi.waitFor(async () => expect((await probe()).status).toBe('online'), ONLINE);
        const p = await probe();
        rec('test', 'summary', JSON.stringify(p));
        expect(p).toMatchObject({ secure: true, subtle: true, randomUUID: true });
        expect(page.url()).not.toContain('#c=');
        await vi.waitFor(() => expect(win.connected).toBe('Thorin'), WAIT);
      },
      60_000,
    );

    it.skipIf(!production)(
      'BR-4 deployed https page WITHOUT the fragment (host dropped it) → typed lowercase code → online',
      async () => {
        const { win, qr, page, probe } = await pairFromBrowser(
          'https://aiacos.github.io/EvenFoundryVTT/app/?debug=1',
        );
        await vi.waitFor(async () => expect((await probe()).status).toBe('unpaired'), ONLINE);
        const lower = qr.code.toLowerCase();
        await page.fill('#evf-code', `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`);
        await page.click('form button[type=submit]');
        await vi.waitFor(async () => expect((await probe()).status).toBe('online'), ONLINE);
        await vi.waitFor(() => expect(win.connected).toBe('Thorin'), WAIT);
      },
      60_000,
    );

    it.skipIf(!production)(
      'BR-5 deployed https page: reopening the spent QR URL in the same WebView keeps a working pairing',
      async () => {
        const tab = track(await openTab(null, relay));
        const win = await tab.pressAltG();
        const qr = win.session as PairingSession;
        const { page, probe } = await launch();
        await page.goto(withDebug(qr.url));
        await vi.waitFor(async () => expect((await probe()).status).toBe('online'), ONLINE);
        const creds = () => page.evaluate(() => localStorage.getItem('evf.direct.credentials.v2'));
        const good = await creds();
        step('plain reload (fragment already stripped) → still online');
        await page.reload();
        await vi.waitFor(async () => expect((await probe()).status).toBe('online'), ONLINE);
        expect(await creds()).toBe(good);
        step('the host opens the scanned URL again (with #c=)');
        await page.goto('about:blank');
        await page.goto(withDebug(qr.url));
        await vi.waitFor(async () => expect((await probe()).status).toBe('online'), ONLINE);
        const after = await creds();
        rec('test', 'summary', `after reopen: creds ${after === good ? 'kept' : 'OVERWRITTEN'}`);
        expect(JSON.parse(after ?? '{}')).toMatchObject({
          room: (JSON.parse(good ?? '{}') as { room: string }).room,
        });
        expect(win.connected).toBe('Thorin');
      },
      60_000,
    );

    it('BR-3 control: the same bundle over http://127.0.0.1 (loopback = secure context) → online', async () => {
      const server = await serveDist('127.0.0.1');
      cleanups.push(() => void server.close());
      const { win, probe } = await pairFromBrowser(`${server.origin}/?debug=1{LINK}`);
      await vi.waitFor(async () => expect((await probe()).status).toBe('online'), ONLINE);
      await vi.waitFor(() => expect(win.connected).toBe('Thorin'), WAIT);
    }, 60_000);

    it.skipIf(LAN_IP === undefined)(
      'BR-2 the same bundle over http://<LAN-IP> (pnpm dev:glasses): no WebCrypto, the fallback pairs anyway',
      async () => {
        const server = await serveDist(LAN_IP as string);
        cleanups.push(() => void server.close());
        const { win, probe } = await pairFromBrowser(`${server.origin}/?debug=1{LINK}`);
        await vi.waitFor(async () => expect((await probe()).status).toBe('online'), ONLINE);
        const p = await probe();
        rec('test', 'summary', `after QR: ${JSON.stringify(p)}`);
        expect(p).toMatchObject({ secure: false, subtle: false, randomUUID: false });
        await vi.waitFor(() => expect(win.connected).toBe('Thorin'), WAIT);
      },
      60_000,
    );
  },
);
