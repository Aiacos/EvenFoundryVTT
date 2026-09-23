import { describe, expect, it } from 'vitest';
import { fromBase64Url, toBase64Url } from './base64url.js';
import {
  generateDeviceKey,
  importDeviceKey,
  open,
  PROJECTOR_ADDRESS,
  SealedEnvelopeSchema,
  seal,
} from './envelope.js';
import { MapSnapshotSchema } from './map.js';
import { AppMessageSchema, ProjectorMessageSchema } from './messages.js';
import {
  buildPairingUrl,
  decodePairingPayload,
  deriveKeyFromManualCode,
  encodePairingPayload,
  generateManualCode,
  normalizeManualCode,
  type PairingPayload,
  readPairingFragment,
} from './pairing.js';

const PAYLOAD: PairingPayload = {
  v: 1,
  u: 'aB3dE5fG7hI9jK1l',
  p: 'correct-horse-battery',
  k: generateDeviceKey(),
};

describe('base64url', () => {
  it('round-trips arbitrary bytes without padding', () => {
    const bytes = new Uint8Array([0, 1, 250, 251, 252, 253, 254, 255]);
    const text = toBase64Url(bytes);
    expect(text).not.toMatch(/[+/=]/);
    expect(Array.from(fromBase64Url(text))).toEqual(Array.from(bytes));
  });

  it('rejects non-base64url characters', () => {
    expect(() => fromBase64Url('ab$c')).toThrow('invalid base64url');
  });
});

describe('sealed envelope', () => {
  it('seals and opens a message, stripping ts', async () => {
    const key = await importDeviceKey(generateDeviceKey());
    const env = await seal(key, 'user1', PROJECTOR_ADDRESS, { t: 'ping', rid: 'r1' }, 1_000);
    expect(SealedEnvelopeSchema.parse(env)).toEqual(env);
    expect(env.ct).not.toContain('ping');
    await expect(open(key, env, 2_000)).resolves.toEqual({
      ok: true,
      message: { t: 'ping', rid: 'r1' },
    });
  });

  it('fails authentication when re-addressed (AAD binds from>to)', async () => {
    const key = await importDeviceKey(generateDeviceKey());
    const env = await seal(key, 'user1', PROJECTOR_ADDRESS, { t: 'ping', rid: 'r1' });
    await expect(open(key, { ...env, to: 'user2' })).resolves.toEqual({
      ok: false,
      reason: 'auth',
    });
  });

  it('fails authentication with a different key', async () => {
    const a = await importDeviceKey(generateDeviceKey());
    const b = await importDeviceKey(generateDeviceKey());
    const env = await seal(a, 'u', PROJECTOR_ADDRESS, { t: 'ping', rid: 'r' });
    await expect(open(b, env)).resolves.toEqual({ ok: false, reason: 'auth' });
  });

  it('rejects stale messages outside the replay window', async () => {
    const key = await importDeviceKey(generateDeviceKey());
    const env = await seal(key, 'u', PROJECTOR_ADDRESS, { t: 'ping', rid: 'r' }, 0);
    await expect(open(key, env, 10 * 60_000)).resolves.toEqual({ ok: false, reason: 'stale' });
  });

  it('rejects keys that are not 32 bytes', async () => {
    await expect(importDeviceKey(toBase64Url(new Uint8Array(16)))).rejects.toThrow('32 bytes');
  });
});

describe('pairing payload', () => {
  it('encodes and decodes', () => {
    expect(decodePairingPayload(encodePairingPayload(PAYLOAD))).toEqual(PAYLOAD);
  });

  it('returns null for garbage', () => {
    expect(decodePairingPayload('not-json')).toBeNull();
    expect(decodePairingPayload(toBase64Url(new TextEncoder().encode('{"v":2}')))).toBeNull();
  });

  it('builds a same-origin URL honouring routePrefix and reads it back', () => {
    const url = buildPairingUrl('https://host.example/foundry/', PAYLOAD);
    expect(
      url.startsWith('https://host.example/foundry/modules/evenfoundryvtt/g2/index.html#evf='),
    ).toBe(true);
    expect(readPairingFragment(new URL(url).hash)).toEqual(PAYLOAD);
    expect(readPairingFragment('')).toBeNull();
  });
});

describe('manual code', () => {
  it('generates 16 unambiguous chars grouped by four', () => {
    const code = generateManualCode();
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$/);
    expect(normalizeManualCode(code)).toBe(code.replace(/-/g, ''));
  });

  it('normalises lowercase and look-alike glyphs, rejects bad length', () => {
    expect(normalizeManualCode('7qk3 mx9p 2hra c4te')).toBe('7QK3MX9P2HRAC4TE');
    expect(normalizeManualCode('O0IL-0000-0000-0000')).toBe('0011000000000000');
    expect(normalizeManualCode('ABC')).toBeNull();
    expect(normalizeManualCode('UUUU-UUUU-UUUU-UUUU')).toBeNull();
  });

  it('derives a stable 32-byte key bound to the user id', async () => {
    const a = await deriveKeyFromManualCode('7QK3-MX9P-2HRA-C4TE', 'user1');
    expect(await deriveKeyFromManualCode('7qk3mx9p2hrac4te', 'user1')).toBe(a);
    expect(await deriveKeyFromManualCode('7QK3-MX9P-2HRA-C4TE', 'user2')).not.toBe(a);
    expect(fromBase64Url(a).byteLength).toBe(32);
    await expect(deriveKeyFromManualCode('short', 'u')).rejects.toThrow('invalid manual code');
  });
});

describe('message schemas', () => {
  it('accepts every app message kind and rejects unknown ones', () => {
    for (const m of [
      { t: 'hello', rid: '1', proto: 1, app: '0.10.0', locale: 'it' },
      { t: 'get', rid: '2', what: 'map' },
      { t: 'invoke', rid: '3', tool: 'weapon-attack', input: { itemId: 'x' } },
      { t: 'ping', rid: '4' },
    ]) {
      expect(AppMessageSchema.safeParse(m).success).toBe(true);
    }
    expect(AppMessageSchema.safeParse({ t: 'hack', rid: '1' }).success).toBe(false);
    expect(AppMessageSchema.safeParse({ t: 'get', rid: '1', what: 'secrets' }).success).toBe(false);
  });

  it('accepts projector messages including both result arms', () => {
    for (const m of [
      {
        t: 'welcome',
        rid: '1',
        actorId: 'a',
        actorName: 'Thorin',
        userName: 'Luca (G2)',
        gmName: 'Anna',
        worldTitle: 'W',
      },
      { t: 'snapshot', what: 'character', data: {} },
      { t: 'delta', seq: 3, topic: 'character.delta', data: {} },
      { t: 'result', rid: '3', ok: true, data: null },
      { t: 'result', rid: '3', ok: false, error: { code: 'E', message: 'm' } },
      { t: 'pong', rid: '4' },
      { t: 'revoked' },
    ]) {
      expect(ProjectorMessageSchema.safeParse(m).success).toBe(true);
    }
  });
});

describe('MapSnapshot', () => {
  it('validates a minimal scene', () => {
    const snap = {
      sceneId: 's',
      name: 'Cripta',
      cols: 30,
      rows: 20,
      gridPx: 100,
      darkness: 0.2,
      walls: [{ c: [0, 0, 10, 0] }, { c: [5, 0, 5, 5], door: true }],
      tokens: [{ id: 't', name: 'Thorin', kind: 'self', x: 3, y: 4, w: 1, h: 1, hp: 0.66 }],
      selfTokenId: 't',
    };
    expect(MapSnapshotSchema.parse(snap)).toEqual(snap);
    expect(MapSnapshotSchema.safeParse({ ...snap, darkness: 2 }).success).toBe(false);
  });
});
