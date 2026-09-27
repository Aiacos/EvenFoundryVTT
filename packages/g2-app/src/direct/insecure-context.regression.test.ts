/**
 * Regression (BUG-2 of the pairing investigation, H1): on `http://<LAN-IP>` — the page
 * `pnpm dev:glasses` (v0.3.0/0.3.1) told players to set as «Glasses app page» — the WebView
 * has no `crypto.subtle` and no `crypto.randomUUID` (both `[SecureContext]`), only
 * `getRandomValues`. Pairing used to throw `TypeError … reading 'importKey'` (shown as
 * «Codice non valido»), and the first `hello` threw on `randomUUID`. With the crypto
 * fallback the code pairs and a WebCrypto projector opens the `hello`.
 */
import { deriveCodePairing } from '@evf/shared-protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppStore } from '../state/app-store.js';
import {
  type Decoded,
  FakeProjector,
  FakeRelay,
  MemoryStorage,
  settle,
} from './__fixtures__/direct-fixtures.js';
import { CredentialStore } from './credentials.js';
import { DirectSession } from './session.js';

const CODE = '7QK3-MX9P-2HRA-C4TE';
const real = globalThis.crypto;
let session: DirectSession | null = null;

beforeEach(() => {
  // No real timers: the hello grace and the 5-minute pending-code expiry never fire here.
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
});

afterEach(() => {
  session?.dispose();
  session = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('pairing in an insecure context (no WebCrypto)', () => {
  it('BUG-2 a valid code pairs and the hello opens on a WebCrypto projector', async () => {
    const { room, key } = await deriveCodePairing(CODE);
    vi.stubGlobal('crypto', { getRandomValues: real.getRandomValues.bind(real) });
    const storage = new MemoryStorage();
    const relay = new FakeRelay();
    // No `uuid` injected: the default request-id generator must not need randomUUID.
    const paired = new DirectSession({
      store: createAppStore(),
      credentials: new CredentialStore(storage, () => {}),
      openRelay: relay.open,
      appVersion: 'test',
      settingsStorage: storage,
      deviceLanguage: () => 'it',
    });
    session = paired;

    await expect(paired.pairCode(CODE)).resolves.toBeUndefined();
    relay.last.setPeer(true); // the projector is in the room: hello at once
    await settle();
    expect(relay.last.room).toBe(room);

    vi.unstubAllGlobals();
    const sent: Decoded[] = await new FakeProjector(relay.last, key).drain();
    expect(sent.map((m) => m.t)).toContain('hello');
    expect(sent.find((m) => m.t === 'hello')?.rid).toMatch(/^[0-9a-f-]{36}$/);
  });
});
