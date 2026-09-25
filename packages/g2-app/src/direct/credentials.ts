/**
 * Pairing credentials of the glasses app (ADR-0019 §Decision Outcome 3).
 *
 * A pairing is a relay room + an AES-256 device key (+ an optional relay override and a
 * label). There is no Foundry URL, user or password: the phone never reaches Foundry.
 *
 * Sources, in order:
 * 1. **QR path** — `location.hash` carries `#evf=<payload>` (the Even Realities App
 *    opened the hosted page from the QR), or the in-app camera read the same QR
 *    ({@link credentialsFromPayload}). The fragment is consumed once and stripped from
 *    the URL with `history.replaceState`.
 * 2. **Persisted** — browser `localStorage` ("survives suspension, kill, and update",
 *    hub.evenrealities.com/docs/reference/faq), mirrored into the Even Hub SDK key-value
 *    store (`setLocalStorage` / `getLocalStorage`), which the everything-evenhub
 *    `device-features` guide recommends because WebView storage is not always reliable.
 * 3. **Code path** — the 16-char code shown under the QR: room and key by HKDF
 *    ({@link credentialsFromCode}).
 *
 * @see docs/architecture/0019-relay-pairing-player-projector.md
 */
import {
  DeviceKeySchema,
  deriveCodePairing,
  type PairingPayload,
  RoomIdSchema,
  readPairingFragment,
} from '@evf/shared-protocol';
import { z } from 'zod';

/** Persisted credential record (device-local). */
export interface Credentials {
  /** Relay room shared with the projector. */
  room: string;
  /** AES-256 device key, base64url. */
  key: string;
  /** Label to show before the first `welcome` (character name), if known. */
  label?: string;
  /** Relay override (development / self-hosted), else the relay the app was built for. */
  relay?: string;
}

/** localStorage / SDK key holding the JSON credential record (v2: relay pairing). */
export const CREDENTIALS_STORAGE_KEY = 'evf.direct.credentials.v2';

/** Local persistence shape — validated on read so a corrupted entry is ignored, not trusted. */
const StoredCredentialsSchema = z.strictObject({
  room: RoomIdSchema,
  key: DeviceKeySchema,
  label: z.string().max(64).optional(),
  relay: z
    .string()
    .regex(/^wss?:\/\/[^\s#?]+$/)
    .optional(),
});

/** Subset of the Even Hub SDK bridge used as a secondary credential store. */
export interface SdkKeyValue {
  setLocalStorage(key: string, value: string): Promise<boolean>;
  getLocalStorage(key: string): Promise<string>;
}

/** Minimal `Storage` surface (browser `localStorage`) — injectable for tests. */
export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Credentials carried by a pairing payload (QR fragment or camera scan). */
export function credentialsFromPayload(payload: PairingPayload): Credentials {
  return {
    room: payload.r,
    key: payload.k,
    ...(payload.l !== undefined ? { label: payload.l } : {}),
    ...(payload.relay !== undefined ? { relay: payload.relay } : {}),
  };
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
  location: Pick<Location, 'pathname' | 'search' | 'hash'>,
  history: Pick<History, 'replaceState'>,
): Credentials | null {
  if (!/(^#|&)evf=/.test(location.hash)) return null;
  const payload = readPairingFragment(location.hash);
  history.replaceState(null, '', `${location.pathname}${location.search}`);
  return payload === null ? null : credentialsFromPayload(payload);
}

/**
 * Builds credentials from the 16-char code (room + key by HKDF, default relay).
 *
 * @throws Error('invalid manual code') when the code does not normalise to 16 chars
 */
export async function credentialsFromCode(code: string): Promise<Credentials> {
  const { room, key } = await deriveCodePairing(code);
  return { room, key };
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
   * Applies a `welcome.rotate` atomically: new room and key replace the old ones in a
   * single record write (label and relay are kept), so a crash mid-way never leaves a
   * mixed pair.
   *
   * @throws Error when there are no credentials to rotate
   */
  async rotate(rotate: { room: string; key: string }): Promise<Credentials> {
    const current = await this.load();
    if (current === null) throw new Error('cannot rotate: no credentials');
    const next = { ...current, room: rotate.room, key: rotate.key };
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
      if (!parsed.success) return null;
      const { label, relay, ...base } = parsed.data;
      return {
        ...base,
        ...(label !== undefined ? { label } : {}),
        ...(relay !== undefined ? { relay } : {}),
      };
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
