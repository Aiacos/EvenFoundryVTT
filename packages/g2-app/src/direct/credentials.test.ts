import { buildPairingUrl, deriveKeyFromManualCode, generateDeviceKey } from '@evf/shared-protocol';
import { describe, expect, it, vi } from 'vitest';
import { MemoryStorage, makeCredentials, USER_ID } from './__fixtures__/direct-fixtures.js';
import {
  CREDENTIALS_STORAGE_KEY,
  CredentialStore,
  consumePairingFragment,
  credentialsFromManualCode,
  deriveFoundryBase,
  parseJoinUsers,
  type SdkKeyValue,
} from './credentials.js';

function locationOf(url: string) {
  const u = new URL(url);
  return { origin: u.origin, pathname: u.pathname, search: u.search, hash: u.hash };
}

describe('deriveFoundryBase', () => {
  it('keeps the routePrefix before /modules/evenfoundryvtt/', () => {
    expect(
      deriveFoundryBase(locationOf('https://h.example/vtt/modules/evenfoundryvtt/g2/index.html')),
    ).toBe('https://h.example/vtt');
    expect(
      deriveFoundryBase(locationOf('https://h.example/modules/evenfoundryvtt/g2/index.html')),
    ).toBe('https://h.example');
  });

  it('falls back to the bare origin outside the module path (dev preview)', () => {
    expect(deriveFoundryBase(locationOf('http://localhost:5173/index.html'))).toBe(
      'http://localhost:5173',
    );
  });
});

describe('consumePairingFragment', () => {
  const payload = { v: 1 as const, u: USER_ID, p: 'correct-horse-battery', k: generateDeviceKey() };

  it('parses the QR fragment, derives base and strips the fragment', () => {
    const url = buildPairingUrl('https://h.example/vtt', payload);
    const history = { replaceState: vi.fn() };
    const creds = consumePairingFragment(locationOf(`${url.replace('#', '?x=1#')}`), history);
    expect(creds).toEqual({
      base: 'https://h.example/vtt',
      userId: payload.u,
      password: payload.p,
      key: payload.k,
    });
    expect(history.replaceState).toHaveBeenCalledWith(
      null,
      '',
      '/vtt/modules/evenfoundryvtt/g2/index.html?x=1',
    );
  });

  it('strips a malformed evf fragment and returns null', () => {
    const history = { replaceState: vi.fn() };
    expect(
      consumePairingFragment(
        locationOf('https://h.example/modules/evenfoundryvtt/g2/index.html#evf=garbage'),
        history,
      ),
    ).toBeNull();
    expect(history.replaceState).toHaveBeenCalledOnce();
  });

  it('leaves unrelated fragments alone', () => {
    const history = { replaceState: vi.fn() };
    expect(consumePairingFragment(locationOf('https://h.example/#section'), history)).toBeNull();
    expect(history.replaceState).not.toHaveBeenCalled();
  });
});

describe('credentialsFromManualCode', () => {
  it('uses the normalised code as password and HKDF key', async () => {
    const creds = await credentialsFromManualCode('https://h', 'user1', '7qk3 mx9p 2hra c4te');
    expect(creds).toEqual({
      base: 'https://h',
      userId: 'user1',
      password: '7QK3MX9P2HRAC4TE',
      key: await deriveKeyFromManualCode('7QK3-MX9P-2HRA-C4TE', 'user1'),
    });
  });

  it('rejects malformed codes', async () => {
    await expect(credentialsFromManualCode('https://h', 'u', 'short')).rejects.toThrow(
      'invalid manual code',
    );
  });
});

describe('parseJoinUsers', () => {
  const html = `<!doctype html><html><body><form id="join-game">
    <select name="userid">
      <option value="">Select user</option>
      <option value="gm0000000000000a">Anna</option>
      <option value="zz00000000000001">Zoe (G2)</option>
      <option value="lu00000000000002"> Luca (G2) </option>
      <option value="off0000000000003" disabled>Old (G2)</option>
    </select><input name="password" type="password"></form></body></html>`;

  it('lists only enabled "(G2)" users sorted by name', () => {
    expect(parseJoinUsers(html)).toEqual([
      { id: 'lu00000000000002', name: 'Luca (G2)' },
      { id: 'zz00000000000001', name: 'Zoe (G2)' },
    ]);
  });

  it('accepts the v14 camelCase select name', () => {
    expect(parseJoinUsers(html.replace('name="userid"', 'name="userId"'))).toHaveLength(2);
  });

  it('returns an empty list when no select is present (client-rendered join page)', () => {
    expect(parseJoinUsers('<html><body><div id="setup"></div></body></html>')).toEqual([]);
  });
});

describe('CredentialStore', () => {
  const warn = vi.fn();

  it('saves to localStorage and the SDK mirror, and loads back', async () => {
    const storage = new MemoryStorage();
    const mirror: SdkKeyValue = {
      setLocalStorage: vi.fn(async () => true),
      getLocalStorage: vi.fn(async () => ''),
    };
    const store = new CredentialStore(storage, warn);
    store.attachMirror(mirror);
    const creds = makeCredentials();
    await store.save(creds);
    expect(JSON.parse(storage.data.get(CREDENTIALS_STORAGE_KEY) ?? '')).toEqual(creds);
    expect(mirror.setLocalStorage).toHaveBeenCalledWith(
      CREDENTIALS_STORAGE_KEY,
      JSON.stringify(creds),
    );
    expect(await new CredentialStore(storage, warn).load()).toEqual(creds);
  });

  it('recovers from the SDK mirror when localStorage is empty and back-fills it', async () => {
    const storage = new MemoryStorage();
    const creds = makeCredentials();
    const store = new CredentialStore(storage, warn);
    store.attachMirror({
      setLocalStorage: async () => true,
      getLocalStorage: async () => JSON.stringify(creds),
    });
    expect(await store.load()).toEqual(creds);
    expect(storage.data.has(CREDENTIALS_STORAGE_KEY)).toBe(true);
  });

  it('ignores corrupted or schema-invalid records', async () => {
    const storage = new MemoryStorage();
    storage.data.set(CREDENTIALS_STORAGE_KEY, '{not json');
    expect(await new CredentialStore(storage, warn).load()).toBeNull();
    storage.data.set(CREDENTIALS_STORAGE_KEY, JSON.stringify({ base: 'x' }));
    expect(await new CredentialStore(storage, warn).load()).toBeNull();
  });

  it('rotates password and key atomically in one record', async () => {
    const storage = new MemoryStorage();
    const store = new CredentialStore(storage, warn);
    await store.save(makeCredentials());
    const key = generateDeviceKey();
    const next = await store.rotate({ password: 'rotated-password-123', key });
    expect(next.password).toBe('rotated-password-123');
    expect(next.key).toBe(key);
    expect(JSON.parse(storage.data.get(CREDENTIALS_STORAGE_KEY) ?? '')).toEqual(next);
  });

  it('a key-only rotation (player-client projector, ADR-0013) keeps the password', async () => {
    const storage = new MemoryStorage();
    const store = new CredentialStore(storage, warn);
    const creds = makeCredentials();
    await store.save(creds);
    const key = generateDeviceKey();
    const next = await store.rotate({ key });
    expect(next).toEqual({ ...creds, key });
    expect(JSON.parse(storage.data.get(CREDENTIALS_STORAGE_KEY) ?? '')).toEqual(next);
  });

  it('refuses to rotate without credentials', async () => {
    await expect(
      new CredentialStore(new MemoryStorage(), warn).rotate({ password: 'x'.repeat(12), key: 'k' }),
    ).rejects.toThrow('no credentials');
  });

  it('clears every backend', async () => {
    const storage = new MemoryStorage();
    const setLocalStorage = vi.fn(async () => true);
    const store = new CredentialStore(storage, warn);
    store.attachMirror({ setLocalStorage, getLocalStorage: async () => '' });
    await store.save(makeCredentials());
    await store.clear();
    expect(storage.data.size).toBe(0);
    expect(setLocalStorage).toHaveBeenLastCalledWith(CREDENTIALS_STORAGE_KEY, '');
    expect(await store.load()).toBeNull();
  });

  it('degrades to memory with warnings when every backend fails', async () => {
    const storage = new MemoryStorage();
    storage.failing = true;
    const onWarn = vi.fn();
    const store = new CredentialStore(storage, onWarn);
    store.attachMirror({
      setLocalStorage: async () => {
        throw new Error('sdk down');
      },
      getLocalStorage: async () => {
        throw new Error('sdk down');
      },
    });
    expect(await store.load()).toBeNull();
    const creds = makeCredentials();
    await store.save(creds);
    expect(await store.load()).toEqual(creds);
    await store.clear();
    expect(onWarn.mock.calls.map((c) => c[0])).toEqual([
      'localStorage getItem failed',
      'sdk getLocalStorage failed',
      'localStorage setItem failed',
      'sdk setLocalStorage failed',
      'localStorage removeItem failed',
      'sdk setLocalStorage failed',
    ]);
  });

  it('works without any storage (null)', async () => {
    const store = new CredentialStore(null, warn);
    expect(await store.load()).toBeNull();
    const creds = makeCredentials();
    await store.save(creds);
    expect(await store.load()).toEqual(creds);
  });
});
