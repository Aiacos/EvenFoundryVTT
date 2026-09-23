/**
 * Pairing credentials for the direct Foundry channel (ADR-0012 §Decision Outcome 3).
 *
 * Sources, in order:
 * 1. **QR path** — `location.hash` carries `#evf=<payload>` ({@link readPairingFragment});
 *    the fragment is consumed once and stripped from the URL with `history.replaceState`
 *    so it never lingers in history or screenshots.
 * 2. **Persisted** — browser `localStorage` (survives WebView suspend/update per
 *    hub.evenrealities.com/docs/build/background-lifecycle: "localStorage — Always
 *    survives (persisted to disk)"), mirrored best-effort into the Even Hub SDK
 *    key-value store (`setLocalStorage` / `getLocalStorage`, SDK 0.0.15).
 * 3. **Manual path** — the user picks a "(G2)" Foundry user and types the 16-char code:
 *    password = normalised code, key = HKDF(code, userId) ({@link deriveKeyFromManualCode}).
 *
 * The Foundry base (`origin` + optional routePrefix) is derived from the page URL, since
 * the app is served by Foundry itself at `<base>/modules/evenfoundryvtt/g2/index.html`.
 *
 * @see docs/architecture/0012-direct-foundry-streaming.md
 * @see docs/design/g2-thirds-layout.md §Associazione e connessione
 */
import {
  deriveKeyFromManualCode,
  normalizeManualCode,
  readPairingFragment,
} from '@evf/shared-protocol';
import { z } from 'zod';

/** Persisted credential record (device-local; never sent anywhere but Foundry `/join`). */
export interface Credentials {
  /** Foundry base URL: origin plus routePrefix, no trailing slash. */
  base: string;
  /** Foundry user id of the dedicated "(G2)" user. */
  userId: string;
  /** Foundry password of that user. */
  password: string;
  /** AES-256 device key, base64url. */
  key: string;
}

/** localStorage / SDK key holding the JSON credential record. */
export const CREDENTIALS_STORAGE_KEY = 'evf.direct.credentials.v1';

/** Path segment that marks where the module assets start inside the page URL. */
const MODULE_PATH_MARKER = '/modules/evenfoundryvtt/';

/** Local persistence shape — validated on read so a corrupted entry is ignored, not trusted. */
const StoredCredentialsSchema = z.strictObject({
  base: z.string().min(1),
  userId: z.string().min(1).max(64),
  password: z.string().min(1).max(128),
  key: z.string().min(43).max(44),
});

/** Subset of the Even Hub SDK bridge used as a secondary credential store. */
export interface SdkKeyValue {
  setLocalStorage(key: string, value: string): Promise<boolean>;
  getLocalStorage(key: string): Promise<string>;
}

/** Minimal `Storage` surface (browser `localStorage`) — injectable for tests. */
export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/**
 * Derives the Foundry base URL from the page location.
 *
 * `https://h/foundry/modules/evenfoundryvtt/g2/index.html` → `https://h/foundry`.
 * Outside the module path (dev preview) the bare origin is returned.
 */
export function deriveFoundryBase(location: Pick<Location, 'origin' | 'pathname'>): string {
  const idx = location.pathname.indexOf(MODULE_PATH_MARKER);
  const prefix = idx >= 0 ? location.pathname.slice(0, idx) : '';
  return `${location.origin}${prefix.replace(/\/+$/, '')}`;
}

/**
 * Reads `#evf=…` from the page URL, strips the fragment, and returns credentials.
 *
 * The fragment is removed whenever it contains an `evf` key — even if malformed — so a
 * broken QR never stays in the address bar.
 *
 * @returns credentials, or `null` when no valid payload is present
 */
export function consumePairingFragment(
  location: Pick<Location, 'origin' | 'pathname' | 'search' | 'hash'>,
  history: Pick<History, 'replaceState'>,
): Credentials | null {
  if (!/(^#|&)evf=/.test(location.hash)) return null;
  const payload = readPairingFragment(location.hash);
  history.replaceState(null, '', `${location.pathname}${location.search}`);
  if (payload === null) return null;
  return {
    base: deriveFoundryBase(location),
    userId: payload.u,
    password: payload.p,
    key: payload.k,
  };
}

/**
 * Builds credentials for the manual path (P03).
 *
 * @throws Error('invalid manual code') when the code does not normalise to 16 chars
 */
export async function credentialsFromManualCode(
  base: string,
  userId: string,
  code: string,
): Promise<Credentials> {
  const password = normalizeManualCode(code);
  if (password === null) throw new Error('invalid manual code');
  return { base, userId, password, key: await deriveKeyFromManualCode(password, userId) };
}

/** A Foundry user offered by the `/join` page. */
export interface JoinUser {
  id: string;
  name: string;
}

/** Suffix that identifies users created by the pairing dialog (P01). */
export const G2_USER_SUFFIX = '(G2)';

/**
 * Parses the user `<select>` of Foundry's `/join` HTML (fallback when `getJoinData` over
 * the socket is unavailable). Accepts both `name="userid"` (v13) and `name="userId"` (v14).
 * Only users whose name ends with "(G2)" are returned; disabled/empty options are skipped.
 */
export function parseJoinUsers(html: string): JoinUser[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const select = doc.querySelector('select[name="userid"], select[name="userId"]');
  if (select === null) return [];
  const users: JoinUser[] = [];
  for (const option of Array.from(select.querySelectorAll('option'))) {
    const id = option.value.trim();
    const name = (option.textContent ?? '').trim();
    if (id !== '' && !option.disabled) users.push({ id, name });
  }
  return filterG2Users(users);
}

/** Keeps only "(G2)" users, sorted by name. */
export function filterG2Users(users: readonly JoinUser[]): JoinUser[] {
  return users
    .filter((u) => u.name.trim().endsWith(G2_USER_SUFFIX))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Diagnostic sink for storage failures (never fatal). */
export type StorageWarn = (message: string, error: unknown) => void;

/**
 * Credential persistence: `localStorage` primary, SDK key-value mirror secondary.
 *
 * Every storage call is wrapped: private mode / blocked storage degrades to the other
 * backend (and, as a last resort, to in-memory for this page lifetime) with a warning.
 */
export class CredentialStore {
  private memory: Credentials | null = null;
  private mirror: SdkKeyValue | null = null;

  /**
   * @param storage browser storage, or `null` when unavailable
   * @param warn    diagnostics sink for recoverable storage errors
   */
  constructor(
    private readonly storage: KeyValueStorage | null,
    private readonly warn: StorageWarn,
  ) {}

  /** Attaches the SDK key-value store once the Even App bridge is ready. */
  attachMirror(mirror: SdkKeyValue): void {
    this.mirror = mirror;
  }

  /** Loads persisted credentials (localStorage, then SDK mirror). */
  async load(): Promise<Credentials | null> {
    if (this.memory !== null) return this.memory;
    const fromLocal = this.parse(this.readLocal());
    if (fromLocal !== null) {
      this.memory = fromLocal;
      return fromLocal;
    }
    if (this.mirror === null) return null;
    try {
      const fromMirror = this.parse(await this.mirror.getLocalStorage(CREDENTIALS_STORAGE_KEY));
      if (fromMirror !== null) this.writeLocal(JSON.stringify(fromMirror));
      this.memory = fromMirror;
      return fromMirror;
    } catch (error) {
      this.warn('sdk getLocalStorage failed', error);
      return null;
    }
  }

  /** Persists credentials to every available backend. */
  async save(credentials: Credentials): Promise<void> {
    this.memory = credentials;
    const json = JSON.stringify(credentials);
    this.writeLocal(json);
    await this.writeMirror(json);
  }

  /**
   * Applies a `welcome.rotate` atomically: the new key (and password, when present)
   * replace the old ones in a single record write, so a crash mid-way never leaves a
   * mixed pair. A player-client projector rotates only the key (ADR-0013): a player
   * cannot change a Foundry password, so the current one is kept.
   *
   * @throws Error when there are no credentials to rotate
   */
  async rotate(rotate: { password?: string | undefined; key: string }): Promise<Credentials> {
    const current = await this.load();
    if (current === null) throw new Error('cannot rotate: no credentials');
    const next = { ...current, password: rotate.password ?? current.password, key: rotate.key };
    await this.save(next);
    return next;
  }

  /** Forgets the credentials everywhere (revocation / unpair). */
  async clear(): Promise<void> {
    this.memory = null;
    try {
      this.storage?.removeItem(CREDENTIALS_STORAGE_KEY);
    } catch (error) {
      this.warn('localStorage removeItem failed', error);
    }
    // The SDK has no delete: an empty string is read back as "absent" by `parse`.
    await this.writeMirror('');
  }

  private parse(raw: string | null | undefined): Credentials | null {
    if (raw === null || raw === undefined || raw === '') return null;
    try {
      const parsed = StoredCredentialsSchema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : null;
    } catch {
      // Corrupted JSON is equivalent to "no credentials" — the user re-pairs.
      return null;
    }
  }

  private readLocal(): string | null {
    try {
      return this.storage?.getItem(CREDENTIALS_STORAGE_KEY) ?? null;
    } catch (error) {
      this.warn('localStorage getItem failed', error);
      return null;
    }
  }

  private writeLocal(json: string): void {
    try {
      this.storage?.setItem(CREDENTIALS_STORAGE_KEY, json);
    } catch (error) {
      this.warn('localStorage setItem failed', error);
    }
  }

  private async writeMirror(json: string): Promise<void> {
    if (this.mirror === null) return;
    try {
      await this.mirror.setLocalStorage(CREDENTIALS_STORAGE_KEY, json);
    } catch (error) {
      this.warn('sdk setLocalStorage failed', error);
    }
  }
}
