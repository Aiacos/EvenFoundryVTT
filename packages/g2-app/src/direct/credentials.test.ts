import {
  buildPairingUrl,
  deriveCodePairing,
  generateDeviceKey,
  generateRoomId,
} from '@evf/shared-protocol';
import { describe, expect, it, vi } from 'vitest';
import { MemoryStorage, makeCredentials } from './__fixtures__/direct-fixtures.js';
import {
  CREDENTIALS_STORAGE_KEY,
  CredentialStore,
  consumePairingLink,
  credentialsFromLink,
  type SdkKeyValue,
} from './credentials.js';

function locationOf(url: string) {
  const u = new URL(url);
  return { pathname: u.pathname, search: u.search, hash: u.hash };
}

const CODE = '7QK3MX9P2HRAC4TE';

/** A live `location` + `history` pair, like the browser's: `replaceState` rewrites it. */
function liveWindow(url: string) {
  const location = locationOf(url);
  const history = {
    replaceState: vi.fn((_state: unknown, _title: string, next: string) => {
      const u = new URL(next, url);
      Object.assign(location, { pathname: u.pathname, search: u.search, hash: u.hash });
    }),
  };
  return { location, history };
}

describe('consumePairingLink', () => {
  it('regression: reads the link BEFORE stripping it (window.location is live)', () => {
    const url = buildPairingUrl('https://aiacos.github.io/EvenFoundryVTT/app/', {
      code: CODE,
      relay: 'ws://127.0.0.1:8787',
    });
    const fromHash = liveWindow(url.replace('#', '?debug=1#'));
    expect(consumePairingLink(fromHash.location, fromHash.history)).toEqual({
      kind: 'code',
      link: { code: CODE, relay: 'ws://127.0.0.1:8787' },
    });
    expect(fromHash.location).toMatchObject({ search: '?debug=1', hash: '' });
    const fromQuery = liveWindow(`https://h.example/app/?debug=1&c=${CODE}`);
    expect(consumePairingLink(fromQuery.location, fromQuery.history)).toEqual({
      kind: 'code',
      link: { code: CODE },
    });
    expect(fromQuery.location.search).toBe('?debug=1');
  });

  it('reads the code from the QR fragment and strips it from the URL', () => {
    const url = buildPairingUrl('https://aiacos.github.io/EvenFoundryVTT/app/index.html', {
      code: CODE,
    });
    const history = { replaceState: vi.fn() };
    expect(consumePairingLink(locationOf(url.replace('#', '?x=1#')), history)).toEqual({
      kind: 'code',
      link: { code: CODE },
    });
    expect(history.replaceState).toHaveBeenCalledWith(
      null,
      '',
      '/EvenFoundryVTT/app/index.html?x=1',
    );
  });

  it('accepts a capitalised key (#C=, typed on a phone keyboard)', () => {
    const history = { replaceState: vi.fn() };
    expect(consumePairingLink(locationOf(`https://h.example/#C=${CODE}`), history)).toEqual({
      kind: 'code',
      link: { code: CODE },
    });
    expect(history.replaceState).toHaveBeenCalledWith(null, '', '/');
  });

  it('accepts ?c= in the query (host dropped the fragment), strips only the pairing keys', () => {
    const history = { replaceState: vi.fn() };
    const url = `https://h.example/app/?debug=1&C=${CODE}&relay=ws://10.0.0.2:8787`;
    expect(consumePairingLink(locationOf(url), history)).toEqual({
      kind: 'code',
      link: { code: CODE, relay: 'ws://10.0.0.2:8787' },
    });
    expect(history.replaceState).toHaveBeenCalledWith(null, '', '/app/?debug=1');
    const bare = { replaceState: vi.fn() };
    expect(consumePairingLink(locationOf(`https://h.example/app/?c=${CODE}#x`), bare)).toEqual({
      kind: 'code',
      link: { code: CODE },
    });
    expect(bare.replaceState).toHaveBeenCalledWith(null, '', '/app/#x');
  });

  it('the fragment wins over the query', () => {
    const other = '0000000000000000';
    const history = { replaceState: vi.fn() };
    expect(
      consumePairingLink(locationOf(`https://h.example/?c=${other}#c=${CODE}`), history),
    ).toEqual({ kind: 'code', link: { code: CODE } });
    expect(history.replaceState).toHaveBeenCalledWith(null, '', '/');
  });

  it('strips a malformed code and reports it invalid', () => {
    const history = { replaceState: vi.fn() };
    expect(consumePairingLink(locationOf('https://h.example/#c=garbage'), history)).toEqual({
      kind: 'invalid',
    });
    expect(history.replaceState).toHaveBeenCalledOnce();
  });

  it('recognises the legacy #evf= QR of an old module (and strips it)', () => {
    const history = { replaceState: vi.fn() };
    expect(consumePairingLink(locationOf('https://h.example/#evf=eyJhIjoxfQ'), history)).toEqual({
      kind: 'legacy',
    });
    expect(history.replaceState).toHaveBeenCalledWith(null, '', '/');
  });

  it('leaves unrelated fragments and queries alone', () => {
    const history = { replaceState: vi.fn() };
    expect(consumePairingLink(locationOf('https://h.example/?debug=1#section'), history)).toEqual({
      kind: 'none',
    });
    expect(history.replaceState).not.toHaveBeenCalled();
  });
});

describe('credentialsFromLink', () => {
  it('derives room and key from the code; keeps a relay override', async () => {
    const derived = await deriveCodePairing(CODE);
    // `from` = the room the code derives: recognises the same link opened again.
    expect(await credentialsFromLink({ code: '7qk3 mx9p 2hra c4te' })).toEqual({
      ...derived,
      from: derived.room,
    });
    expect(await credentialsFromLink({ code: CODE, relay: 'ws://x:1' })).toEqual({
      ...derived,
      from: derived.room,
      relay: 'ws://x:1',
    });
    await expect(credentialsFromLink({ code: 'short' })).rejects.toThrow('invalid manual code');
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
    // A v1 (Foundry login) record under the old key is simply not read: re-pair.
    storage.data.set('evf.direct.credentials.v1', JSON.stringify({ userId: 'u' }));
    storage.data.delete(CREDENTIALS_STORAGE_KEY);
    expect(await new CredentialStore(storage, warn).load()).toBeNull();
  });

  it('rotates room and key atomically in one record, keeping label and relay', async () => {
    const storage = new MemoryStorage();
    const store = new CredentialStore(storage, warn);
    const creds = makeCredentials({ relay: 'ws://10.0.0.2:8787' });
    await store.save(creds);
    const rotate = { room: generateRoomId(), key: generateDeviceKey() };
    const next = await store.rotate(rotate);
    expect(next).toEqual({ ...creds, ...rotate });
    expect(JSON.parse(storage.data.get(CREDENTIALS_STORAGE_KEY) ?? '')).toEqual(next);
    expect(await new CredentialStore(storage, warn).load()).toEqual(next);
  });

  it('rotation keeps `from` and drops `pendingSince`; confirm drops it too', async () => {
    const storage = new MemoryStorage();
    const store = new CredentialStore(storage, warn);
    const creds = makeCredentials();
    await store.save({ ...creds, from: creds.room, pendingSince: 42 });
    expect(await new CredentialStore(storage, warn).load()).toEqual({
      ...creds,
      from: creds.room,
      pendingSince: 42,
    });
    const rotate = { room: generateRoomId(), key: generateDeviceKey() };
    expect(await store.rotate(rotate)).toEqual({ ...rotate, from: creds.room });
    await store.save({ ...creds, pendingSince: 7 });
    await store.confirm();
    expect(JSON.parse(storage.data.get(CREDENTIALS_STORAGE_KEY) ?? '')).toEqual(creds);
    const writes = vi.spyOn(storage, 'setItem');
    await store.confirm(); // nothing pending: no write
    expect(writes).not.toHaveBeenCalled();
  });

  it('reads records written before `from` / `pendingSince` existed', async () => {
    const storage = new MemoryStorage();
    const old = makeCredentials({ relay: 'wss://self.example' });
    storage.data.set(CREDENTIALS_STORAGE_KEY, JSON.stringify(old));
    expect(await new CredentialStore(storage, warn).load()).toEqual(old);
    storage.data.set(CREDENTIALS_STORAGE_KEY, JSON.stringify({ ...old, pendingSince: -1 }));
    expect(await new CredentialStore(storage, warn).load()).toBeNull();
  });

  it('refuses to rotate without credentials', async () => {
    await expect(
      new CredentialStore(new MemoryStorage(), warn).rotate({ room: 'r', key: 'k' }),
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
