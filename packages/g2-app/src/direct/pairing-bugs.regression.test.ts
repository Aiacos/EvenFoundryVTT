/**
 * Regressions of the glasses-side pairing defects found by the dev-mode pairing
 * investigation (real-relay E2E `pairing.e2e.test.ts` F2/BR-5, simulator runs, code
 * review). Each test failed before its fix:
 *
 * - BUG-1 / H3 — re-opening the spent `#c=` link overwrote the rotated pairing;
 * - H2 / H5 — an unanswered code left the phone on «Foundry chiuso» forever;
 * - H6 — two `hello`s on connect made the projector push everything twice;
 * - hello refused (`actor_missing` / `forbidden_actor`) was ignored;
 * - relay close 4000 (another app instance took the pairing) looped reconnecting.
 */
import {
  deriveCodePairing,
  generateDeviceKey,
  generateRoomId,
  PAIRING_TTL_MS,
  RELAY_CLOSE_REPLACED,
} from '@evf/shared-protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppStore } from '../state/app-store.js';
import {
  FakeProjector,
  FakeRelay,
  MemoryStorage,
  makeCharacter,
  makeCredentials,
  makeMap,
  settle,
} from './__fixtures__/direct-fixtures.js';
import {
  CREDENTIALS_STORAGE_KEY,
  CredentialStore,
  credentialsFromLink,
  SPENT_CODES_STORAGE_KEY,
} from './credentials.js';
import { DirectSession, PAIRING_ERROR, SESSION_TIMING } from './session.js';

const LINK = { code: '7QK3MX9P2HRAC4TE' };

const WELCOME = {
  t: 'welcome',
  actorId: 'actor1',
  actorName: 'Thorin',
  userName: 'Luca',
  gmName: 'Anna',
  worldTitle: 'Cripta',
};

function harness(storage = new MemoryStorage()) {
  const store = createAppStore();
  const relay = new FakeRelay();
  let n = 0;
  const session = new DirectSession({
    store,
    credentials: new CredentialStore(storage, () => {}),
    openRelay: relay.open,
    appVersion: 'test',
    settingsStorage: storage,
    deviceLanguage: () => 'it',
    random: () => 0,
    uuid: () => `rid-${++n}`,
  });
  return { store, relay, session, storage };
}

const stored = (storage: MemoryStorage) =>
  JSON.parse(storage.getItem(CREDENTIALS_STORAGE_KEY) ?? 'null') as Record<string, unknown> | null;

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
    now: 1_000_000,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('pairing regressions (glasses side)', () => {
  it('BUG-1 reopening the spent QR URL (#c= again) must keep the rotated credentials', async () => {
    const storage = new MemoryStorage();
    // First load of the QR URL, then the projector's welcome{rotate} (single-use QR).
    const first = new CredentialStore(storage, () => {});
    await first.save(await credentialsFromLink(LINK));
    const rotated = await first.rotate({ room: generateRoomId(), key: generateDeviceKey() });

    // The WebView loads the same URL again (host reopens the scanned link).
    const again = harness(storage);
    await again.session.start(await credentialsFromLink(LINK));

    expect(again.relay.last.room).toBe(rotated.room);
    expect(stored(storage)).toMatchObject({ room: rotated.room, key: rotated.key });
    expect(again.session.info().boot.link).toBe('used');
    expect(again.session.info().diagnostics.at(-1)?.message).toMatch(/already used on this phone/);
    again.session.dispose();
  });

  it('BUG-1 typing the spent code again is refused with a precise error, pairing kept', async () => {
    const storage = new MemoryStorage();
    const first = new CredentialStore(storage, () => {});
    await first.save(await credentialsFromLink(LINK));
    const rotated = await first.rotate({ room: generateRoomId(), key: generateDeviceKey() });
    const h = harness(storage);
    await h.session.start(null);
    await expect(h.session.pairCode('7QK3-MX9P-2HRA-C4TE')).rejects.toThrow(PAIRING_ERROR.codeUsed);
    expect(stored(storage)).toMatchObject({ room: rotated.room });
    h.session.dispose();
  });

  it('BUG-1 typing a code again while it is still pending retries it (not «already used»)', async () => {
    const h = harness();
    await h.session.pairCode('7QK3-MX9P-2HRA-C4TE');
    vi.advanceTimersByTime(60_000);
    await h.session.pairCode('7QK3 MX9P 2HRA C4TE');
    await settle();
    const { room } = await deriveCodePairing(LINK.code);
    // Same pending record (the projector's 5 min run from the first save), connected again.
    expect(stored(h.storage)).toMatchObject({ room, from: room, pendingSince: 1_000_000 });
    expect(h.relay.links).toHaveLength(2);
    expect(h.relay.last.room).toBe(room);
    expect(h.session.info().boot.link).not.toBe('used');
    h.session.dispose();
  });

  it('H2/H5 an unanswered code is «code-pending», then expires to unpaired with a notice', async () => {
    const h = harness();
    await h.session.pairCode('7QK3-MX9P-2HRA-C4TE');
    await settle();
    expect(stored(h.storage)).toMatchObject({
      from: (await deriveCodePairing(LINK.code)).room,
      pendingSince: 1_000_000,
    });
    vi.advanceTimersByTime(SESSION_TIMING.helloGrace + SESSION_TIMING.welcomeTimeout);
    expect(h.store.get().connection).toMatchObject({ status: 'offline', cause: 'code-pending' });
    // The glasses show S11 with the cause: the relay step is done, Foundry is the next one.
    expect(h.store.get().connection.steps).toMatchObject({ relay: true, projector: false });
    vi.advanceTimersByTime(PAIRING_TTL_MS);
    await settle();
    expect(h.store.get().connection).toEqual({ status: 'unpaired', notice: 'code-unanswered' });
    expect(stored(h.storage)).toBeNull();
    expect(h.relay.last.closed).toBe(true);
    h.session.dispose();
  });

  it('H2 a code saved long ago (app relaunched after the TTL) expires at once', async () => {
    const storage = new MemoryStorage();
    const creds = await credentialsFromLink(LINK);
    storage.setItem(
      CREDENTIALS_STORAGE_KEY,
      JSON.stringify({ ...creds, pendingSince: 1_000_000 - PAIRING_TTL_MS - 1 }),
    );
    const h = harness(storage);
    await h.session.start(null);
    vi.advanceTimersByTime(0);
    await settle();
    expect(h.store.get().connection).toEqual({ status: 'unpaired', notice: 'code-unanswered' });
  });

  it('H2 the welcome confirms the code: rotation drops pendingSince, no expiry afterwards', async () => {
    const h = harness();
    await h.session.pairCode('7QK3-MX9P-2HRA-C4TE');
    const { key } = await deriveCodePairing(LINK.code);
    h.relay.last.setPeer(true);
    await settle();
    const gm = new FakeProjector(h.relay.last, key);
    const [hello] = await gm.drain();
    const rotate = { room: generateRoomId(), key: generateDeviceKey() };
    await gm.reply({ ...WELCOME, rid: hello?.rid, rotate });
    await settle();
    expect(stored(h.storage)).not.toHaveProperty('pendingSince');
    expect(stored(h.storage)).toMatchObject({ room: rotate.room });
    vi.advanceTimersByTime(PAIRING_TTL_MS * 2);
    await settle();
    expect(h.store.get().connection.status).not.toBe('unpaired');
    h.session.dispose();
  });

  it('H2 a welcome without rotation also confirms a pending code', async () => {
    const h = harness();
    await h.session.pairCode('7QK3-MX9P-2HRA-C4TE');
    const { key } = await deriveCodePairing(LINK.code);
    h.relay.last.setPeer(true);
    await settle();
    const gm = new FakeProjector(h.relay.last, key);
    const [hello] = await gm.drain();
    await gm.reply({ ...WELCOME, rid: hello?.rid });
    await settle();
    expect(stored(h.storage)).not.toHaveProperty('pendingSince');
    vi.advanceTimersByTime(PAIRING_TTL_MS * 2);
    await settle();
    expect(h.store.get().connection.status).not.toBe('unpaired');
    h.session.dispose();
  });

  it('H6 the projector already in the room gets ONE hello (peer-up on join), none after welcome', async () => {
    const h = harness();
    const creds = makeCredentials();
    await h.session.start(creds);
    h.relay.last.setPeer(true); // relay: peer-up to the newcomer right after the join
    await settle();
    const gm = new FakeProjector(h.relay.last, creds.key);
    const hellos = await gm.drain();
    expect(hellos.map((m) => m.t)).toEqual(['hello']);
    await gm.reply({ ...WELCOME, rid: hellos[0]?.rid });
    await gm.reply({ t: 'snapshot', what: 'character', data: makeCharacter() });
    await gm.reply({ t: 'snapshot', what: 'map', data: makeMap() });
    await settle();
    vi.advanceTimersByTime(SESSION_TIMING.helloGrace + SESSION_TIMING.welcomeTimeout);
    await settle();
    expect((await gm.drain()).filter((m) => m.t === 'hello')).toEqual([]);
    expect(h.store.get().connection.status).toBe('online');
    h.session.dispose();
  });

  it('H6b regression: welcomed, a peer-up with no peer-down (projector socket replaced, 4000) says hello once more', async () => {
    const h = harness();
    const creds = makeCredentials();
    await h.session.start(creds);
    h.relay.last.setPeer(true);
    await settle();
    const gm = new FakeProjector(h.relay.last, creds.key);
    const [hello] = await gm.drain();
    await gm.reply({ ...WELCOME, rid: hello?.rid });
    await gm.reply({ t: 'snapshot', what: 'character', data: makeCharacter() });
    await gm.reply({ t: 'snapshot', what: 'map', data: makeMap() });
    await settle();
    expect(h.store.get().connection.status).toBe('online');
    await gm.drain(); // the gets that followed the welcome
    // The projector's new socket replaced its half-open one: the relay says only peer-up.
    // Its new link is un-welcomed and pushes nothing until a hello.
    h.relay.last.setPeer(true);
    await settle();
    const again = await gm.drain();
    expect(again.map((m) => m.t)).toEqual(['hello']);
    // Answered by a welcome + the push; no welcome-timeout loop, still online.
    await gm.reply({ ...WELCOME, rid: again[0]?.rid, actorName: 'Thorin II' });
    await gm.reply({ t: 'snapshot', what: 'character', data: makeCharacter() });
    vi.advanceTimersByTime(SESSION_TIMING.welcomeTimeout * 2);
    await settle();
    expect((await gm.drain()).filter((m) => m.t === 'hello')).toEqual([]);
    expect(h.store.get().connection.status).toBe('online');
    h.session.dispose();
  });

  it('H6 without a peer-up the hello still goes out after the grace (robust to any relay)', async () => {
    const h = harness();
    const creds = makeCredentials();
    await h.session.start(creds);
    await settle();
    const gm = new FakeProjector(h.relay.last, creds.key);
    expect(await gm.drain()).toEqual([]);
    vi.advanceTimersByTime(SESSION_TIMING.helloGrace);
    await settle();
    expect((await gm.drain()).map((m) => m.t)).toEqual(['hello']);
    h.session.dispose();
  });

  it('hello refused (actor_missing / forbidden_actor): offline «actor», slower hello retries', async () => {
    const h = harness();
    const creds = makeCredentials();
    await h.session.start(creds);
    h.relay.last.setPeer(true);
    await settle();
    const gm = new FakeProjector(h.relay.last, creds.key);
    const [hello] = await gm.drain();
    await gm.reply({
      t: 'result',
      rid: hello?.rid,
      ok: false,
      error: { code: 'actor_missing', message: 'actor a1 no longer exists' },
    });
    await settle();
    expect(h.store.get().connection).toMatchObject({ status: 'offline', cause: 'actor' });
    expect(h.store.get().connection.steps).toMatchObject({
      relay: true,
      projector: true,
      paired: false,
    });
    expect(h.session.info().diagnostics.at(-1)?.message).toMatch(/actor_missing/);
    // The welcome timeout passes: the projector answered, so the cause stays «actor».
    vi.advanceTimersByTime(SESSION_TIMING.welcomeTimeout);
    await settle();
    expect(h.store.get().connection.cause).toBe('actor');
    const [retry] = await gm.drain();
    expect(retry?.t).toBe('hello');
    await gm.reply({
      t: 'result',
      rid: retry?.rid,
      ok: false,
      error: { code: 'forbidden_actor', message: 'you no longer own this character' },
    });
    await settle();
    // Slower cadence: nothing after another welcome timeout, a hello after actorRetry.
    vi.advanceTimersByTime(SESSION_TIMING.welcomeTimeout);
    await settle();
    expect(await gm.drain()).toEqual([]);
    vi.advanceTimersByTime(SESSION_TIMING.actorRetry - SESSION_TIMING.welcomeTimeout);
    await settle();
    expect((await gm.drain()).map((m) => m.t)).toEqual(['hello']);
    expect(h.store.get().connection.cause).toBe('actor');
    h.session.dispose();
  });

  it('other hello refusals are recorded, not ignored', async () => {
    const h = harness();
    const creds = makeCredentials();
    await h.session.start(creds);
    h.relay.last.setPeer(true);
    await settle();
    const gm = new FakeProjector(h.relay.last, creds.key);
    const [hello] = await gm.drain();
    await gm.reply({
      t: 'result',
      rid: hello?.rid,
      ok: false,
      error: { code: 'unsupported', message: 'protocol 1' },
    });
    await settle();
    expect(h.session.info().diagnostics.at(-1)?.message).toBe(
      'hello refused (unsupported): protocol 1',
    );
    expect(h.store.get().connection.status).toBe('connecting');
    h.session.dispose();
  });

  it('close 4000 (another app instance took the pairing): no reconnect loop, «replaced»', async () => {
    const h = harness();
    const creds = makeCredentials();
    await h.session.start(creds);
    await settle();
    h.relay.last.drop(RELAY_CLOSE_REPLACED);
    expect(h.store.get().connection).toMatchObject({ status: 'offline', cause: 'replaced' });
    expect(h.store.get().connection.retryInMs).toBeUndefined();
    vi.advanceTimersByTime(120_000);
    await settle();
    expect(h.relay.links).toHaveLength(1);
    // «Riconnetti» takes the pairing back.
    h.session.reconnect();
    await settle();
    expect(h.relay.links).toHaveLength(2);
    h.session.dispose();
  });

  it('H3b regression: the spent link reloaded after «Scollega» stays spent (no 5-minute pending wait)', async () => {
    const storage = new MemoryStorage();
    const h = harness(storage);
    await h.session.start(await credentialsFromLink(LINK));
    const { key } = await deriveCodePairing(LINK.code);
    h.relay.last.setPeer(true);
    await settle();
    let gm = new FakeProjector(h.relay.last, key);
    const [hello] = await gm.drain();
    const rotate = { room: generateRoomId(), key: generateDeviceKey() };
    await gm.reply({ ...WELCOME, rid: hello?.rid, rotate });
    await settle();
    // «Scollega» from Foundry: the record — and its `from` — is cleared.
    gm = new FakeProjector(h.relay.last, rotate.key);
    await gm.reply({ t: 'revoked' });
    await settle();
    expect(h.store.get().connection.status).toBe('revoked');
    expect(stored(storage)).toBeNull();
    h.session.dispose();
    // The Even App relaunches with the originally scanned URL.
    const again = harness(storage);
    await again.session.start(await credentialsFromLink(LINK));
    await settle();
    expect(stored(storage)).toBeNull();
    expect(again.store.get().connection.status).toBe('unpaired');
    expect(again.session.info().boot.link).toBe('used');
    expect(again.relay.links).toHaveLength(0);
    again.session.dispose();
  });

  it('H3b regression: an unanswered code is spent too — reloading its link does not wait again', async () => {
    const storage = new MemoryStorage();
    const h = harness(storage);
    await h.session.start(await credentialsFromLink(LINK));
    vi.advanceTimersByTime(PAIRING_TTL_MS);
    await settle();
    expect(h.store.get().connection).toEqual({ status: 'unpaired', notice: 'code-unanswered' });
    h.session.dispose();
    const again = harness(storage);
    await again.session.start(await credentialsFromLink(LINK));
    await settle();
    expect(stored(storage)).toBeNull();
    expect(again.session.info().boot.link).toBe('used');
    again.session.dispose();
  });

  it('H3c regression: a link over a pairing without `from` (rotated before v0.4.2) gives it back if unanswered', async () => {
    const storage = new MemoryStorage();
    const old = makeCredentials(); // no `from`, confirmed
    storage.setItem(CREDENTIALS_STORAGE_KEY, JSON.stringify(old));
    const h = harness(storage);
    // The relaunch reloads the (spent) QR the pairing was made with.
    await h.session.start(await credentialsFromLink(LINK));
    const { room } = await deriveCodePairing(LINK.code);
    expect(stored(storage)).toMatchObject({ room, fallback: { room: old.room, key: old.key } });
    vi.advanceTimersByTime(PAIRING_TTL_MS);
    await settle();
    // The old pairing is back and connecting in its room; the dead code is remembered.
    expect(stored(storage)).toEqual({ room: old.room, key: old.key });
    expect(h.relay.last.room).toBe(old.room);
    expect(h.store.get().connection.status).toBe('connecting');
    expect(JSON.parse(storage.getItem(SPENT_CODES_STORAGE_KEY) ?? '[]')).toEqual([room]);
    h.session.dispose();
    // Next relaunch with the same URL: ignored at once.
    const again = harness(storage);
    await again.session.start(await credentialsFromLink(LINK));
    expect(stored(storage)).toEqual({ room: old.room, key: old.key });
    expect(again.session.info().boot.link).toBe('used');
    again.session.dispose();
  });

  it('H3c the welcome of the new code drops the fallback; a typed code keeps none', async () => {
    const storage = new MemoryStorage();
    storage.setItem(CREDENTIALS_STORAGE_KEY, JSON.stringify(makeCredentials()));
    const h = harness(storage);
    await h.session.start(await credentialsFromLink(LINK));
    const { key } = await deriveCodePairing(LINK.code);
    h.relay.last.setPeer(true);
    await settle();
    const gm = new FakeProjector(h.relay.last, key);
    const [hello] = await gm.drain();
    const rotate = { room: generateRoomId(), key: generateDeviceKey() };
    await gm.reply({ ...WELCOME, rid: hello?.rid, rotate });
    await settle();
    expect(stored(storage)).not.toHaveProperty('fallback');
    h.session.dispose();
    const typed = harness();
    typed.storage.setItem(CREDENTIALS_STORAGE_KEY, JSON.stringify(makeCredentials()));
    await typed.session.pairCode('7QK3-MX9P-2HRA-C4TE');
    expect(stored(typed.storage)).not.toHaveProperty('fallback');
    typed.session.dispose();
  });

  it('pending-code expiry is disarmed by «Dimentica associazione» (no late «no answer» notice)', async () => {
    const h = harness();
    await h.session.pairCode('7QK3-MX9P-2HRA-C4TE');
    await h.session.forget();
    vi.advanceTimersByTime(PAIRING_TTL_MS);
    await settle();
    expect(h.store.get().connection).toEqual({ status: 'unpaired' });
    h.session.dispose();
  });

  it('pending-code expiry is disarmed by a revocation («Annulla QR» in Foundry): «revoked» stays', async () => {
    const h = harness();
    await h.session.pairCode('7QK3-MX9P-2HRA-C4TE');
    const { key } = await deriveCodePairing(LINK.code);
    await settle();
    await new FakeProjector(h.relay.last, key).reply({ t: 'revoked' });
    await settle();
    expect(h.store.get().connection.status).toBe('revoked');
    vi.advanceTimersByTime(PAIRING_TTL_MS);
    await settle();
    expect(h.store.get().connection).toEqual({ status: 'revoked' });
    h.session.dispose();
  });

  it('a pending code expiring after dispose() does nothing', async () => {
    const h = harness();
    await h.session.pairCode('7QK3-MX9P-2HRA-C4TE');
    h.session.dispose();
    vi.advanceTimersByTime(PAIRING_TTL_MS);
    await settle();
    expect(stored(h.storage)).not.toBeNull();
    expect(h.store.get().connection.notice).toBeUndefined();
  });

  it('regression: one failing inbound frame (storage error on the rotation) does not block the next ones', async () => {
    const h = harness();
    const credentials = new CredentialStore(h.storage, () => {});
    const session = new DirectSession({
      store: h.store,
      credentials,
      openRelay: h.relay.open,
      appVersion: 'test',
      settingsStorage: h.storage,
      deviceLanguage: () => 'it',
      random: () => 0,
    });
    await session.pairCode('7QK3-MX9P-2HRA-C4TE');
    const { key } = await deriveCodePairing(LINK.code);
    h.relay.last.setPeer(true);
    await settle();
    const gm = new FakeProjector(h.relay.last, key);
    const [hello] = await gm.drain();
    vi.spyOn(credentials, 'rotate').mockRejectedValueOnce(new Error('quota exceeded'));
    await gm.reply({
      ...WELCOME,
      rid: hello?.rid,
      rotate: { room: generateRoomId(), key: generateDeviceKey() },
    });
    await settle();
    expect(session.info().diagnostics.at(-1)?.message).toBe(
      'inbound frame failed: Error: quota exceeded',
    );
    // The next frame is still handled.
    await gm.reply({ t: 'revoked' });
    await settle();
    expect(h.store.get().connection.status).toBe('revoked');
    session.dispose();
  });
});
