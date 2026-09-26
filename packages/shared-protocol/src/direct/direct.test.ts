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
  deriveCodePairing,
  generateManualCode,
  generateRoomId,
  normalizeManualCode,
  readPairingFragment,
  readPairingText,
} from './pairing.js';
import { RelayControlSchema, relayHealthUrl, relayRoomUrl } from './relay.js';

const CODE = '7QK3MX9P2HRAC4TE';

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

describe('pairing link (QR)', () => {
  it('carries only the code: short URL, fragment replaced', () => {
    const url = buildPairingUrl('https://aiacos.github.io/EvenFoundryVTT/app/#old', {
      code: '7qk3-mx9p-2hra-c4te',
    });
    expect(url).toBe(`https://aiacos.github.io/EvenFoundryVTT/app/#c=${CODE}`);
    expect(url.length).toBeLessThanOrEqual(64);
    expect(readPairingFragment(new URL(url).hash)).toEqual({ code: CODE });
    expect(readPairingFragment('')).toBeNull();
    expect(readPairingFragment('#c=short')).toBeNull();
  });

  it('adds a ws(s) relay only for dev / self-host, and rejects bad input', () => {
    const url = buildPairingUrl('http://192.168.1.5:5173/', {
      code: CODE,
      relay: 'ws://192.168.1.5:8787',
    });
    expect(readPairingFragment(new URL(url).hash)).toEqual({
      code: CODE,
      relay: 'ws://192.168.1.5:8787',
    });
    expect(readPairingFragment(`#c=${CODE}&relay=https://x.example`)).toBeNull();
    expect(() => buildPairingUrl('https://a/', { code: 'nope' })).toThrow('invalid pairing code');
    expect(() => buildPairingUrl('https://a/', { code: CODE, relay: 'https://x' })).toThrow();
    expect(generateRoomId()).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it('reads a scanned QR text whatever its origin, a bare fragment or just the code', () => {
    const url = buildPairingUrl('http://192.168.1.5:5173/', { code: CODE });
    expect(readPairingText(url)).toEqual({ code: CODE });
    expect(readPairingText(`c=${CODE}`)).toEqual({ code: CODE });
    expect(readPairingText(' 7QK3-MX9P-2HRA-C4TE ')).toEqual({ code: CODE });
    expect(readPairingText('https://example.com/no-payload')).toBeNull();
  });
});

describe('relay contract', () => {
  it('builds room and health URLs from any relay spelling', () => {
    expect(relayRoomUrl('wss://relay.example/', 'room_1', 'glasses')).toBe(
      'wss://relay.example/r/room_1?role=glasses',
    );
    expect(relayRoomUrl('https://relay.example', 'r', 'projector')).toBe(
      'wss://relay.example/r/r?role=projector',
    );
    expect(relayRoomUrl('http://10.0.0.2:8787', 'r', 'projector')).toBe(
      'ws://10.0.0.2:8787/r/r?role=projector',
    );
    expect(relayHealthUrl('wss://relay.example/')).toBe('https://relay.example/health');
    expect(relayHealthUrl('ws://10.0.0.2:8787')).toBe('http://10.0.0.2:8787/health');
  });

  it('parses the relay control frames only', () => {
    expect(RelayControlSchema.safeParse({ relay: 'peer-up' }).success).toBe(true);
    expect(RelayControlSchema.safeParse({ relay: 'other' }).success).toBe(false);
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

  it('derives a stable room (16 bytes) and an independent key (32 bytes)', async () => {
    const a = await deriveCodePairing('7QK3-MX9P-2HRA-C4TE');
    expect(await deriveCodePairing('7qk3mx9p2hrac4te')).toEqual(a);
    expect((await deriveCodePairing('7QK3-MX9P-2HRA-C4TA')).room).not.toBe(a.room);
    expect(fromBase64Url(a.room).byteLength).toBe(16);
    expect(fromBase64Url(a.key).byteLength).toBe(32);
    expect(a.key.startsWith(a.room)).toBe(false);
    await expect(deriveCodePairing('short')).rejects.toThrow('invalid manual code');
  });
});

describe('message schemas', () => {
  it('accepts every app message kind and rejects unknown ones', () => {
    for (const m of [
      { t: 'hello', rid: '1', proto: 2, app: '0.10.0', locale: 'it' },
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
      {
        t: 'welcome',
        rid: '1',
        actorId: 'a',
        actorName: 'Thorin',
        userName: 'Luca (G2)',
        gmName: 'Anna',
        worldTitle: 'W',
        locale: 'it',
        moduleVersion: '0.2.0',
      },
      { t: 'snapshot', what: 'character', data: {} },
      { t: 'delta', seq: 3, topic: 'character.delta', data: {} },
      { t: 'result', rid: '3', ok: true, data: null },
      { t: 'result', rid: '3', ok: false, error: { code: 'E', message: 'm' } },
      { t: 'pong', rid: '4' },
      { t: 'revoked' },
      { t: 'asset', id: 'bg_1', data: 'data:image/jpeg;base64,/9j/4AAQ' },
      {
        t: 'welcome',
        rid: '1',
        actorId: 'a',
        actorName: 'Thorin',
        userName: 'Luca',
        gmName: '',
        worldTitle: 'W',
        rotate: { room: generateRoomId(), key: generateDeviceKey() },
      },
    ]) {
      expect(ProjectorMessageSchema.safeParse(m).success).toBe(true);
    }
    const welcome = {
      t: 'welcome',
      rid: '1',
      actorId: 'a',
      actorName: '',
      userName: '',
      gmName: '',
      worldTitle: '',
    };
    expect(ProjectorMessageSchema.safeParse({ ...welcome, moduleVersion: '' }).success).toBe(false);
    expect(
      ProjectorMessageSchema.safeParse({ ...welcome, rotate: { key: generateDeviceKey() } })
        .success,
    ).toBe(false);
    for (const data of ['https://evil.example/x.png', 'data:text/html;base64,PGh0bWw+']) {
      expect(ProjectorMessageSchema.safeParse({ t: 'asset', id: 'a', data }).success).toBe(false);
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
