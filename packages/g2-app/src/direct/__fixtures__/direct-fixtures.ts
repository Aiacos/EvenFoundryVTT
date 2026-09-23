/**
 * Test fixtures for the direct channel: schema-valid snapshots, an in-memory storage,
 * a fake socket.io socket and a fake GM projector that seals replies with the real
 * AES-GCM envelope (`@evf/shared-protocol`).
 */
import {
  ABILITY_KEYS,
  type ActionResultPayload,
  type CharacterSnapshot,
  type CombatSnapshot,
  DIRECT_SOCKET_EVENT,
  generateDeviceKey,
  importDeviceKey,
  type MapSnapshot,
  open,
  PROJECTOR_ADDRESS,
  type SealedEnvelope,
  SKILL_KEYS,
  seal,
} from '@evf/shared-protocol';
import type { Credentials, KeyValueStorage } from '../credentials.js';
import type { SocketLike } from '../foundry-client.js';

export const USER_ID = 'aB3dE5fG7hI9jK1l';

/** Fresh QR-style credentials. */
export function makeCredentials(overrides: Partial<Credentials> = {}): Credentials {
  return {
    base: 'https://foundry.example/vtt',
    userId: USER_ID,
    password: 'correct-horse-battery',
    key: generateDeviceKey(),
    ...overrides,
  };
}

export function makeCharacter(overrides: Partial<CharacterSnapshot> = {}): CharacterSnapshot {
  const ability = { value: 10, mod: 0, save: 0, proficient: false, dc: 10 };
  const skill = { total: 0, ability: 'dex' as const, proficient: 0 as const, passive: 10 };
  return {
    actorId: 'actor1',
    name: 'Thorin',
    hp: 45,
    maxHp: 68,
    tempHp: 0,
    ac: 18,
    level: 5,
    conditions: [],
    exhaustion: 0,
    death: { success: 0, failure: 0 },
    world: { modernRules: true },
    inventory: [],
    spells: { slots: [], spells: [] },
    abilities: Object.fromEntries(
      ABILITY_KEYS.map((k) => [k, ability]),
    ) as CharacterSnapshot['abilities'],
    skills: Object.fromEntries(SKILL_KEYS.map((k) => [k, skill])) as CharacterSnapshot['skills'],
    ...overrides,
  };
}

export function makeCombat(round = 1): CombatSnapshot {
  return { combatId: 'c1', round, turn: 0, currentCombatantId: null, combatants: [] };
}

export function makeMap(): MapSnapshot {
  return {
    sceneId: 's1',
    name: 'Cripta',
    cols: 10,
    rows: 10,
    gridPx: 100,
    darkness: 0,
    walls: [],
    tokens: [],
  };
}

export function makeActionResult(): ActionResultPayload {
  return {
    idempotencyKey: '3f1c2b4a-5d6e-4f70-8a9b-0c1d2e3f4a5b',
    toolId: 'weapon-attack',
    d20: 17,
    outcome: 'hit',
    status: 'success',
    recipientUserId: USER_ID,
  };
}

/** Map-backed `Storage` subset; `failing` makes every call throw. */
export class MemoryStorage implements KeyValueStorage {
  readonly data = new Map<string, string>();
  failing = false;
  getItem(key: string): string | null {
    if (this.failing) throw new Error('blocked');
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    if (this.failing) throw new Error('blocked');
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    if (this.failing) throw new Error('blocked');
    this.data.delete(key);
  }
}

type Listener = (...args: never[]) => void;

/** In-memory socket.io double: records emits, lets tests deliver server events. */
export class FakeSocket implements SocketLike {
  readonly listeners = new Map<string, Set<Listener>>();
  readonly emitted: Array<{ event: string; args: unknown[] }> = [];
  disconnected = false;

  on(event: string, listener: Listener): this {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)?.add(listener);
    return this;
  }
  off(event: string, listener?: Listener): this {
    if (listener === undefined) this.listeners.delete(event);
    else this.listeners.get(event)?.delete(listener);
    return this;
  }
  emit(event: string, ...args: unknown[]): this {
    this.emitted.push({ event, args });
    return this;
  }
  disconnect(): this {
    this.disconnected = true;
    return this;
  }
  /** Simulates a server → client event. */
  deliver(event: string, ...args: unknown[]): void {
    for (const l of [...(this.listeners.get(event) ?? [])])
      (l as (...a: unknown[]) => void)(...args);
  }
}

/** Plaintext app message as decrypted by the fake GM. */
export type Decoded = Record<string, unknown> & { t: string; rid?: string };

/** Fake GM projector bound to one socket and one device key. */
export class FakeGm {
  private cursor = 0;
  constructor(
    readonly socket: FakeSocket,
    public keyB64: string,
    readonly userId = USER_ID,
  ) {}

  /** Decrypts every envelope the app emitted since the last call. */
  async drain(): Promise<Decoded[]> {
    const key = await importDeviceKey(this.keyB64);
    const out: Decoded[] = [];
    const pending = this.socket.emitted.slice(this.cursor);
    this.cursor = this.socket.emitted.length;
    for (const { event, args } of pending) {
      if (event !== DIRECT_SOCKET_EVENT) continue;
      const opened = await open(key, args[0] as SealedEnvelope);
      if (opened.ok) out.push(opened.message as Decoded);
    }
    return out;
  }

  /** Seals `message` for the app and delivers it on the relay. */
  async reply(
    message: object,
    keyB64 = this.keyB64,
    to = this.userId,
    from: string = PROJECTOR_ADDRESS,
  ): Promise<void> {
    const key = await importDeviceKey(keyB64);
    this.socket.deliver(DIRECT_SOCKET_EVENT, await seal(key, from, to, message));
  }
}

/** Real timer captured at import time, before any test installs fake timers. */
const realSetTimeout = globalThis.setTimeout;

/**
 * Lets real async work (WebCrypto runs on the libuv thread pool, promise chains) finish
 * while timers are faked, by yielding to the real event loop a few times.
 */
export async function settle(rounds = 8): Promise<void> {
  for (let i = 0; i < rounds; i++) await new Promise<void>((resolve) => realSetTimeout(resolve, 1));
}
