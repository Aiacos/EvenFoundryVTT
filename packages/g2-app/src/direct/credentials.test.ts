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
  consumePairingFragment,
  credentialsFromLink,
  type SdkKeyValue,
} from './credentials.js';

function locationOf(url: string) {
  const u = new URL(url);
  return { pathname: u.pathname, search: u.search, hash: u.hash };
}

const CODE = '7QK3MX9P2HRAC4TE';

describe('consumePairingFragment', () => {
  it('reads the code from the QR fragment and strips it from the URL', () => {
    const url = buildPairingUrl('https://aiacos.github.io/EvenFoundryVTT/app/index.html', {
      code: CODE,
    });
    const history = { replaceState: vi.fn() };
    expect(consumePairingFragment(locationOf(url.replace('#', '?x=1#')), history)).toEqual({
      code: CODE,
    });
    expect(history.replaceState).toHaveBeenCalledWith(
      null,
      '',
      '/EvenFoundryVTT/app/index.html?x=1',
    );
  });

  it('strips a malformed code fragment and returns null', () => {
    const history = { replaceState: vi.fn() };
    expect(consumePairingFragment(locationOf('https://h.example/#c=garbage'), history)).toBeNull();
    expect(history.replaceState).toHaveBeenCalledOnce();
  });

  it('leaves unrelated fragments alone', () => {
    const history = { replaceState: vi.fn() };
    expect(consumePairingFragment(locationOf('https://h.example/#section'), history)).toBeNull();
    expect(history.replaceState).not.toHaveBeenCalled();
  });
});

describe('credentialsFromLink', () => {
  it('derives room and key from the code; keeps a relay override', async () => {
    const derived = await deriveCodePairing(CODE);
    expect(await credentialsFromLink({ code: '7qk3 mx9p 2hra c4te' })).toEqual(derived);
    expect(await credentialsFromLink({ code: CODE, relay: 'ws://x:1' })).toEqual({
      ...derived,
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
