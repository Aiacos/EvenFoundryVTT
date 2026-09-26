/**
 * Test fixtures for the direct channel: schema-valid snapshots, an in-memory storage, a
 * fake relay link and a fake projector that seals replies with the real AES-GCM envelope
 * (`@evf/shared-protocol`).
 */
import {
  ABILITY_KEYS,
  type ActionResultPayload,
  type CharacterSnapshot,
  type CombatSnapshot,
  GLASSES_ADDRESS,
  generateDeviceKey,
  generateRoomId,
  importDeviceKey,
  type MapSnapshot,
  open,
  PROJECTOR_ADDRESS,
  type SealedEnvelope,
  SKILL_KEYS,
  seal,
} from '@evf/shared-protocol';
import type { Credentials, KeyValueStorage } from '../credentials.js';
import type { OpenRelay, RelayLink } from '../relay-client.js';

/** Foundry user id of the projecting player (action results name it). */
export const USER_ID = 'aB3dE5fG7hI9jK1l';

/** Fresh QR-style credentials. */
export function makeCredentials(overrides: Partial<Credentials> = {}): Credentials {
  return { room: generateRoomId(), key: generateDeviceKey(), ...overrides };
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

/** In-memory relay link: records sent frames, lets tests deliver frames / peer events. */
export class FakeLink implements RelayLink {
  readonly sent: unknown[] = [];
  closed = false;
  open = true;
  private frame: (frame: unknown) => void = () => {};
  private peer: (up: boolean) => void = () => {};
  private closeListener: (code: number) => void = () => {};
  constructor(
    readonly relay: string,
    readonly room: string,
  ) {}
  send(frame: object): boolean {
    if (!this.open) return false;
    this.sent.push(frame);
    return true;
  }
  onFrame(listener: (frame: unknown) => void): void {
    this.frame = listener;
  }
  onPeer(listener: (up: boolean) => void): void {
    this.peer = listener;
  }
  onClose(listener: (code: number) => void): void {
    this.closeListener = listener;
  }
  close(): void {
    this.closed = true;
    this.open = false;
  }
  /** Relay → app frame. */
  deliver(frame: unknown): void {
    this.frame(frame);
  }
  /** Relay control: the projector joined / left. */
  setPeer(up: boolean): void {
    this.peer(up);
  }
  /** The relay dropped the socket. */
  drop(code = 1006): void {
    this.open = false;
    this.closeListener(code);
  }
}

/** A fake relay: `open` resolves a new {@link FakeLink} (or fails when `failing`). */
export class FakeRelay {
  readonly links: FakeLink[] = [];
  failing: Error | null = null;
  readonly open: OpenRelay = async (relay, room) => {
    if (this.failing !== null) throw this.failing;
    const link = new FakeLink(relay, room);
    this.links.push(link);
    return link;
  };
  /** The most recent link. */
  get last(): FakeLink {
    const link = this.links[this.links.length - 1];
    if (link === undefined) throw new Error('no relay link opened');
    return link;
  }
}

/** Plaintext app message as decrypted by the fake projector. */
export type Decoded = Record<string, unknown> & { t: string; rid?: string };

/** Fake projector on one link with one device key. */
export class FakeProjector {
  private cursor = 0;
  constructor(
    readonly link: FakeLink,
    public keyB64: string,
  ) {}

  /** Decrypts every frame the app sent since the last call. */
  async drain(): Promise<Decoded[]> {
    const key = await importDeviceKey(this.keyB64);
    const out: Decoded[] = [];
    const pending = this.link.sent.slice(this.cursor);
    this.cursor = this.link.sent.length;
    for (const frame of pending) {
      const env = frame as SealedEnvelope;
      if (env.from !== GLASSES_ADDRESS || env.to !== PROJECTOR_ADDRESS) continue;
      const opened = await open(key, env);
      if (opened.ok) out.push(opened.message as Decoded);
    }
    return out;
  }

  /** Seals `message` for the app and delivers it on the link. */
  async reply(
    message: object,
    keyB64 = this.keyB64,
    from: string = PROJECTOR_ADDRESS,
    to: string = GLASSES_ADDRESS,
  ): Promise<void> {
    const key = await importDeviceKey(keyB64);
    this.link.deliver(await seal(key, from, to, message));
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
