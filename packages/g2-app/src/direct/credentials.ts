/**
 * Pairing credentials of the glasses app (ADR-0019 §Decision Outcome 3).
 *
 * A pairing is a relay room + an AES-256 device key (+ an optional relay override). There
 * is no Foundry URL, user or password: the phone never reaches Foundry.
 *
 * Sources, in order:
 * 1. **QR path** — `location.hash` carries `#c=<code>` (the Even Realities App opened the
 *    hosted page from the QR; `?c=` is accepted too, for hosts that drop the fragment), or
 *    the in-app camera read the same QR ({@link credentialsFromLink}). The link is consumed
 *    once and stripped from the URL with `history.replaceState`
 *    ({@link consumePairingLink}).
 * 2. **Persisted** — browser `localStorage` ("survives suspension, kill, and update",
 *    hub.evenrealities.com/docs/reference/faq), mirrored into the Even Hub SDK key-value
 *    store (`setLocalStorage` / `getLocalStorage`), which the everything-evenhub
 *    `device-features` guide recommends because WebView storage is not always reliable.
 * 3. **Code path** — the 16-char code shown under the QR (or the whole link, typed or
 *    pasted): room and key by HKDF ({@link credentialsFromLink}).
 *
 * @see docs/architecture/0019-relay-pairing-player-projector.md
 */
import {
  DeviceKeySchema,
  deriveCodePairing,
  PAIRING_CODE_KEY,
  PAIRING_RELAY_KEY,
  type PairingLink,
  RelayUrlSchema,
  RoomIdSchema,
  readPairingFragment,
} from '@evf/shared-protocol';
import { z } from 'zod';

/** A confirmed pairing kept aside while a link's code waits for its first `welcome`. */
export interface FallbackCredentials {
  room: string;
  key: string;
  relay?: string;
  from?: string;
}

/** Persisted credential record (device-local). */
export interface Credentials {
  /** Relay room shared with the projector. */
  room: string;
  /** AES-256 device key, base64url. */
  key: string;
  /** Relay override (development / self-hosted), else the relay the app was built for. */
  relay?: string;
  /**
   * Room derived from the code that created this pairing. Kept across the rotation, so the
   * same QR opened again is recognised as already used on this phone (and ignored).
   * Absent on records written before v0.4.2.
   */
  from?: string;
  /**
   * Epoch ms at which a code was saved and not yet answered by a `welcome`; dropped by the
   * rotation. Absent = a confirmed pairing (or a record written before v0.4.2).
   */
  pendingSince?: number;
  /**
   * The confirmed pairing a pairing link replaced (boot / `hashchange`, never a typed code):
   * given back when the link's code gets no `welcome` in time — e.g. a relaunch reloading
   * a spent QR over a pairing rotated before v0.4.2, which has no `from` to recognise it.
   * Dropped by the rotation / confirmation.
   */
  fallback?: FallbackCredentials;
}

/** localStorage / SDK key holding the JSON credential record (v2: relay pairing). */
export const CREDENTIALS_STORAGE_KEY = 'evf.direct.credentials.v2';

/**
 * localStorage / SDK key holding the rooms of codes spent on this phone (JSON array). Kept
 * apart from the credential record so «Scollega» / «Dimentica associazione» / an
 * unanswered code (which clear the record, and its `from`) still let the app recognise a
 * spent link reloaded later.
 */
export const SPENT_CODES_STORAGE_KEY = 'evf.direct.spent-codes.v1';

/** Spent code rooms remembered (most recent last). */
export const SPENT_CODES_MAX = 16;

const FallbackSchema = z.strictObject({
  room: RoomIdSchema,
  key: DeviceKeySchema,
  relay: RelayUrlSchema.optional(),
  from: RoomIdSchema.optional(),
});

/** Local persistence shape — validated on read so a corrupted entry is ignored, not trusted. */
const StoredCredentialsSchema = z.strictObject({
  room: RoomIdSchema,
  key: DeviceKeySchema,
  relay: RelayUrlSchema.optional(),
  from: RoomIdSchema.optional(),
  pendingSince: z.number().int().nonnegative().optional(),
  fallback: FallbackSchema.optional(),
});

const SpentCodesSchema = z.array(RoomIdSchema).max(SPENT_CODES_MAX);

/** Copies a parsed record, leaving out the optional fields that are absent. */
function compact<T extends { relay?: string | undefined; from?: string | undefined }>(
  record: T,
): Omit<T, 'relay' | 'from'> & { relay?: string; from?: string } {
  const { relay, from, ...base } = record;
  return {
    ...base,
    ...(relay !== undefined ? { relay } : {}),
    ...(from !== undefined ? { from } : {}),
  };
}

/** A parsed record as {@link Credentials} (absent optional fields left out). */
function toCredentials(record: z.infer<typeof StoredCredentialsSchema>): Credentials {
  const { pendingSince, fallback, ...base } = record;
  return {
    ...compact(base),
    ...(pendingSince !== undefined ? { pendingSince } : {}),
    ...(fallback !== undefined ? { fallback: compact(fallback) } : {}),
  };
}

/** The pairing itself, without the bookkeeping of a pending code (`pendingSince`, `fallback`). */
export function settledCredentials(record: Credentials): FallbackCredentials {
  const { pendingSince: _pending, fallback: _fallback, ...pairing } = record;
  return pairing;
}

/** Subset of the Even Hub SDK bridge used as a secondary credential store. */
export interface SdkKeyValue {
  setLocalStorage(key: string, value: string): Promise<boolean>;
  getLocalStorage(key: string): Promise<string>;
}

/** Minimal `Storage` surface (browser `localStorage`) — injectable for tests. */
export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/**
 * What the page URL carried at boot (or on a `hashchange`):
 * - `none` — no pairing key;
 * - `code` — a valid pairing link;
 * - `invalid` — a `c` key whose value is not a 16-char code (or a bad relay);
 * - `legacy` — the `#evf=` QR of a module older than v0.13.0 (ADR-0016 pairing payload),
 *   which this app cannot use: the player must update EvenFoundryVTT in Foundry.
 */
export type BootLink =
  | { kind: 'none' }
  | { kind: 'code'; link: PairingLink }
  | { kind: 'invalid' }
  | { kind: 'legacy' };

/** The code key (any case) in a fragment / query string. */
const CODE_KEY = new RegExp(`(^[#?]|&)${PAIRING_CODE_KEY}=`, 'i');
/** The legacy `evf` key of the pre-ADR-0019 QR. */
const LEGACY_KEY = /(^#|&)evf=/i;
/** Query keys that belong to a pairing link (stripped once read). */
const LINK_KEYS: ReadonlySet<string> = new Set([PAIRING_CODE_KEY, PAIRING_RELAY_KEY]);

/**
 * Reads the pairing link from the page URL and strips it: `#c=<code>[&relay=…]` (the QR),
 * `?c=<code>` (fallback for a host that drops the fragment; the other query keys, such as
 * `debug`, are kept), or the legacy `#evf=`. Keys match case-insensitively; the fragment
 * wins over the query. A malformed link is stripped too, so it never stays in the address
 * bar.
 */
export function consumePairingLink(
  location: Pick<Location, 'pathname' | 'search' | 'hash'>,
  history: Pick<History, 'replaceState'>,
): BootLink {
  // Read everything first: `window.location` is live, `replaceState` below empties it.
  const { pathname, search: query, hash: fragment } = location;
  const inHash = CODE_KEY.test(fragment);
  const inQuery = CODE_KEY.test(query);
  const legacy = !inHash && LEGACY_KEY.test(fragment);
  if (!inHash && !inQuery && !legacy) return { kind: 'none' };
  const link = legacy ? null : readPairingFragment(inHash ? fragment : query.replace(/^\?/, '#'));
  let search = query;
  if (inQuery) {
    const params = new URLSearchParams(query);
    for (const key of [...params.keys()]) if (LINK_KEYS.has(key.toLowerCase())) params.delete(key);
    const rest = params.toString();
    search = rest === '' ? '' : `?${rest}`;
  }
  const hash = inHash || legacy ? '' : fragment;
  history.replaceState(null, '', `${pathname}${search}${hash}`);
  if (legacy) return { kind: 'legacy' };
  return link === null ? { kind: 'invalid' } : { kind: 'code', link };
}

/**
 * Credentials of a pairing link (QR) or of a typed code: room + key by HKDF, `from` = the
 * derived room, plus the relay override when the link carries one.
 *
 * @throws Error('invalid manual code') when the code does not normalise to 16 chars
 * @throws CryptoBackendError when no crypto backend can run on this page
 */
export async function credentialsFromLink(link: PairingLink): Promise<Credentials> {
  const { room, key } = await deriveCodePairing(link.code);
  return { room, key, ...(link.relay !== undefined ? { relay: link.relay } : {}), from: room };
}

/** Parses a stored spent-codes list; null when absent or corrupted. */
function parseSpent(raw: string | null | undefined): string[] | null {
  if (raw === null || raw === undefined || raw === '') return null;
  try {
    const parsed = SpentCodesSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    // Corrupted JSON: nothing remembered (a spent link would wait 5 minutes once more).
    return null;
  }
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
  private spent: string[] | null = null;
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
   * Applies a `welcome.rotate` atomically: new room and key replace the old ones in a
   * single record write (the relay override and `from` are kept; `pendingSince` and the
   * `fallback` are dropped), so a crash mid-way never leaves a mixed pair. The code room
   * (`from`) is remembered as spent.
   *
   * @throws Error when there are no credentials to rotate
   */
  async rotate(rotate: { room: string; key: string }): Promise<Credentials> {
    const current = await this.load();
    if (current === null) throw new Error('cannot rotate: no credentials');
    const next = { ...settledCredentials(current), room: rotate.room, key: rotate.key };
    await this.save(next);
    if (current.from !== undefined) await this.markSpent(current.from);
    return next;
  }

  /**
   * Marks a pending code as answered (a `welcome` without rotation): drops `pendingSince`
   * and the `fallback`. No write when nothing is pending.
   */
  async confirm(): Promise<void> {
    const current = await this.load();
    if (current?.pendingSince === undefined) return;
    await this.save(settledCredentials(current));
  }

  /** Whether the code whose derived room is `room` was spent on this phone. */
  async isSpent(room: string): Promise<boolean> {
    return (await this.loadSpent()).includes(room);
  }

  /** Remembers a code room as spent (the most recent {@link SPENT_CODES_MAX}). */
  async markSpent(room: string): Promise<void> {
    const current = await this.loadSpent();
    if (current.includes(room)) return;
    const next = [...current, room].slice(-SPENT_CODES_MAX);
    this.spent = next;
    const json = JSON.stringify(next);
    this.writeLocal(json, SPENT_CODES_STORAGE_KEY);
    await this.writeMirror(json, SPENT_CODES_STORAGE_KEY);
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

  /** Spent code rooms: localStorage, else the SDK mirror; a corrupted list counts as empty. */
  private async loadSpent(): Promise<string[]> {
    if (this.spent !== null) return this.spent;
    let list = parseSpent(this.readLocal(SPENT_CODES_STORAGE_KEY));
    if (list === null && this.mirror !== null) {
      try {
        list = parseSpent(await this.mirror.getLocalStorage(SPENT_CODES_STORAGE_KEY));
      } catch (error) {
        this.warn('sdk getLocalStorage failed', error);
      }
    }
    this.spent = list ?? [];
    return this.spent;
  }

  private parse(raw: string | null | undefined): Credentials | null {
    if (raw === null || raw === undefined || raw === '') return null;
    try {
      const parsed = StoredCredentialsSchema.safeParse(JSON.parse(raw));
      return parsed.success ? toCredentials(parsed.data) : null;
    } catch {
      // Corrupted JSON is equivalent to "no credentials" — the user re-pairs.
      return null;
    }
  }

  private readLocal(key: string = CREDENTIALS_STORAGE_KEY): string | null {
    try {
      return this.storage?.getItem(key) ?? null;
    } catch (error) {
      this.warn('localStorage getItem failed', error);
      return null;
    }
  }

  private writeLocal(json: string, key: string = CREDENTIALS_STORAGE_KEY): void {
    try {
      this.storage?.setItem(key, json);
    } catch (error) {
      this.warn('localStorage setItem failed', error);
    }
  }

  private async writeMirror(json: string, key: string = CREDENTIALS_STORAGE_KEY): Promise<void> {
    if (this.mirror === null) return;
    try {
      await this.mirror.setLocalStorage(key, json);
    } catch (error) {
      this.warn('sdk setLocalStorage failed', error);
    }
  }
}
