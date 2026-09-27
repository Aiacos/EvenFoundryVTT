/**
 * Crypto backend (ADR-0019 Amendment 2 · P0-A): WebCrypto when the page is a secure
 * context, the audited noble fallback otherwise (plain-http LAN pages, where
 * `crypto.subtle` and `crypto.randomUUID` are `[SecureContext]`-only and undefined).
 * Both backends must produce byte-identical wire data.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fromBase64Url, toBase64Url } from './base64url.js';
import {
  aesGcmOpen,
  aesGcmSeal,
  CryptoBackendError,
  cryptoBackend,
  type DeviceKey,
  hkdfSha256,
  importAesKey,
  randomId,
  sha256Digest,
} from './crypto.js';
import {
  GLASSES_ADDRESS,
  generateDeviceKey,
  importDeviceKey,
  open,
  PROJECTOR_ADDRESS,
  seal,
} from './envelope.js';
import { deriveCodePairing, PAIRING_TTL_MS } from './pairing.js';

const real = globalThis.crypto;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const encoder = new TextEncoder();

/** What a WebView exposes on `http://<LAN-IP>`: `getRandomValues` only. */
function stubInsecureContext(): void {
  vi.stubGlobal('crypto', { getRandomValues: real.getRandomValues.bind(real) });
}

/** Imports the key with the fallback backend (secure-context features hidden meanwhile). */
async function fallbackKey(keyB64: string): Promise<DeviceKey> {
  stubInsecureContext();
  try {
    return await importDeviceKey(keyB64);
  } finally {
    vi.unstubAllGlobals();
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.doUnmock('./crypto-fallback.js');
  vi.resetModules();
});

describe('cryptoBackend', () => {
  it('is webcrypto in a secure context and fallback without crypto.subtle', () => {
    expect(cryptoBackend()).toBe('webcrypto');
    stubInsecureContext();
    expect(cryptoBackend()).toBe('fallback');
  });
});

describe('fallback ≡ WebCrypto', () => {
  it('derives the same room and key from a code', async () => {
    const expected = await deriveCodePairing('7QK3MX9P2HRAC4TE');
    stubInsecureContext();
    await expect(deriveCodePairing('7QK3MX9P2HRAC4TE')).resolves.toEqual(expected);
  });

  it('matches the RFC 5869 HKDF-SHA256 test case 1 on both backends', async () => {
    const ikm = new Uint8Array(22).fill(0x0b);
    const salt = Uint8Array.from({ length: 13 }, (_, i) => i);
    const info = Uint8Array.from({ length: 10 }, (_, i) => 0xf0 + i);
    const okm =
      '3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865';
    const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
    expect(hex(await hkdfSha256(ikm, salt, info, 42))).toBe(okm);
    stubInsecureContext();
    expect(hex(await hkdfSha256(ikm, salt, info, 42))).toBe(okm);
  });

  it('digests like WebCrypto (SHA-256 of "abc")', async () => {
    const abc = encoder.encode('abc');
    const web = await sha256Digest(abc);
    expect(toBase64Url(web)).toBe('ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0');
    stubInsecureContext();
    expect(await sha256Digest(abc)).toEqual(web);
  });

  it('seals with the fallback and opens with WebCrypto, and the reverse', async () => {
    const keyB64 = generateDeviceKey();
    const soft = await fallbackKey(keyB64);
    const web = await importDeviceKey(keyB64);
    const msg = { t: 'ping', rid: 'r1' };

    const bySoft = await seal(soft, GLASSES_ADDRESS, PROJECTOR_ADDRESS, msg, 1_000);
    await expect(open(web, bySoft, 1_000)).resolves.toEqual({ ok: true, message: msg });

    const byWeb = await seal(web, PROJECTOR_ADDRESS, GLASSES_ADDRESS, msg, 1_000);
    await expect(open(soft, byWeb, 1_000)).resolves.toEqual({ ok: true, message: msg });
  });

  it('produces byte-identical ciphertext for the same key, IV and AAD', async () => {
    const raw = real.getRandomValues(new Uint8Array(32));
    const iv = real.getRandomValues(new Uint8Array(12));
    const aad = encoder.encode('glasses>projector');
    const pt = encoder.encode('{"t":"hello"}');
    const web = await aesGcmSeal(await importAesKey(raw), iv, aad, pt);
    stubInsecureContext();
    const soft = await importAesKey(raw);
    expect(await aesGcmSeal(soft, iv, aad, pt)).toEqual(web);
    expect(await aesGcmOpen(soft, iv, aad, web)).toEqual(pt);
  });

  it('refuses a wrong AAD or a truncated ciphertext with reason auth, like WebCrypto', async () => {
    const keyB64 = generateDeviceKey();
    const soft = await fallbackKey(keyB64);
    const web = await importDeviceKey(keyB64);
    for (const key of [soft, web]) {
      const env = await seal(key, GLASSES_ADDRESS, PROJECTOR_ADDRESS, { t: 'ping', rid: 'r' });
      await expect(open(key, { ...env, to: 'someone-else' })).resolves.toEqual({
        ok: false,
        reason: 'auth',
      });
      const short = toBase64Url(fromBase64Url(env.ct).slice(0, 8));
      await expect(open(key, { ...env, ct: short })).resolves.toEqual({
        ok: false,
        reason: 'auth',
      });
    }
  });
});

describe('without WebCrypto (insecure context)', () => {
  it('pairs, seals, opens and makes request ids with getRandomValues only', async () => {
    const expected = await deriveCodePairing('7QK3-MX9P-2HRA-C4TE');
    stubInsecureContext();
    const pairing = await deriveCodePairing('7QK3-MX9P-2HRA-C4TE');
    expect(pairing).toEqual(expected);
    const key = await importDeviceKey(pairing.key);
    const env = await seal(key, GLASSES_ADDRESS, PROJECTOR_ADDRESS, { t: 'hello' });
    await expect(open(key, env)).resolves.toEqual({ ok: true, message: { t: 'hello' } });
    const ids = new Set([randomId(), randomId(), randomId()]);
    expect(ids.size).toBe(3);
    for (const id of ids) expect(id).toMatch(UUID_V4);
  });

  it('rejects with context when the fallback chunk cannot be loaded, then retries', async () => {
    vi.resetModules();
    vi.doMock('./crypto-fallback.js', () => {
      throw new Error('chunk offline');
    });
    const fresh = await import('./crypto.js');
    stubInsecureContext();
    await expect(fresh.sha256Digest(encoder.encode('x'))).rejects.toThrow(
      /crypto fallback failed to load \(no WebCrypto.*Error/,
    );
    const key = await fresh.importAesKey(new Uint8Array(32));
    const iv = new Uint8Array(12);
    await expect(fresh.aesGcmOpen(key, iv, iv, new Uint8Array(16))).rejects.toThrow(
      fresh.CryptoBackendError,
    );
    vi.doUnmock('./crypto-fallback.js');
    await expect(fresh.sha256Digest(encoder.encode('abc'))).resolves.toHaveLength(32);
  });
});

describe('randomId', () => {
  it('uses crypto.randomUUID when available', () => {
    vi.stubGlobal('crypto', { ...real, randomUUID: () => 'from-randomUUID' });
    expect(randomId()).toBe('from-randomUUID');
  });
});

describe('device key handle', () => {
  it('rejects a key that importDeviceKey did not make (seal and open throw, never "auth")', async () => {
    const forged = { backend: 'webcrypto' } as DeviceKey;
    await expect(seal(forged, GLASSES_ADDRESS, PROJECTOR_ADDRESS, { t: 'ping' })).rejects.toThrow(
      CryptoBackendError,
    );
    const key = await importDeviceKey(generateDeviceKey());
    const env = await seal(key, GLASSES_ADDRESS, PROJECTOR_ADDRESS, { t: 'ping' });
    await expect(open(forged, env)).rejects.toThrow('unknown device key');
  });

  it('reports the backend it was imported with', async () => {
    const keyB64 = generateDeviceKey();
    expect((await importDeviceKey(keyB64)).backend).toBe('webcrypto');
    expect((await fallbackKey(keyB64)).backend).toBe('fallback');
  });
});

describe('PAIRING_TTL_MS', () => {
  it('is the 5-minute single-use window shared by projector and glasses', () => {
    expect(PAIRING_TTL_MS).toBe(300_000);
  });
});
