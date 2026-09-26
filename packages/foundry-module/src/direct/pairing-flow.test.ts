import {
  DEFAULT_RELAY_URL,
  deriveCodePairing,
  normalizeManualCode,
  readPairingText,
} from '@evf/shared-protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installFoundry, makeActor, makeUser } from '../__tests__/direct-fixtures.js';
import { ownedCharacters, userOwnsActor } from './ownership.js';
import { checkRelay, expirePairing, PAIRING_TTL_MS, startPairing } from './pairing-flow.js';
import { getPairing } from './pairing-store.js';

const APP = 'https://aiacos.github.io/EvenFoundryVTT/app/';

function setup(localIsGM = false) {
  const luca = makeUser('p1', 'Luca');
  const f = installFoundry({
    users: [luca, makeUser('gm2', 'Marta', { isGM: true, role: 4 })],
    localIsGM,
    actors: [
      makeActor('thorin', 'Thorin', { ownership: { p1: 3 } }),
      makeActor('borin', 'Borin', { ownership: { default: 3 } }),
      makeActor('goblin', 'Goblin', { ownership: {} }),
      makeActor('npc', 'Npc', { type: 'npc', ownership: { p1: 3 } }),
    ],
  });
  if (!localIsGM) f.game.user = luca;
  return f;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ownership', () => {
  beforeEach(() => setup());

  it('OW-01 player owns by user id or default; never an unknown actor', () => {
    expect(userOwnsActor('thorin', 'p1')).toBe(true);
    expect(userOwnsActor('borin', 'p1')).toBe(true);
    expect(userOwnsActor('goblin', 'p1')).toBe(false);
    expect(userOwnsActor('missing', 'p1')).toBe(false);
  });

  it('OW-02 a GM owns every actor', () => {
    expect(userOwnsActor('goblin', 'gm2')).toBe(true);
  });

  it('OW-03 ownedCharacters lists owned characters only, by name', () => {
    expect(ownedCharacters('p1')).toEqual([
      { id: 'borin', name: 'Borin' },
      { id: 'thorin', name: 'Thorin' },
    ]);
  });
});

describe('startPairing (no GM, no Foundry user)', () => {
  beforeEach(() => setup());

  it('PF-01 stores a pending pairing whose room/key derive from the shown code', async () => {
    const session = await startPairing(
      'thorin',
      { appUrl: APP, relayUrl: DEFAULT_RELAY_URL },
      1_000,
    );
    expect(session.expiresAt).toBe(1_000 + PAIRING_TTL_MS);
    expect(session.code).toMatch(/^[0-9A-Z]{4}(-[0-9A-Z]{4}){3}$/);
    expect(session.qrSvg).toContain('<svg');
    const stored = getPairing(session.deviceId);
    expect(stored).toMatchObject({
      actorId: 'thorin',
      label: 'Thorin',
      expiresAt: session.expiresAt,
    });
    const derived = await deriveCodePairing(session.code);
    expect(stored?.room).toBe(derived.room);
    expect(stored?.key).toBe(derived.key);
    expect(normalizeManualCode(session.code)).not.toBeNull();
    expect(session.url).toBe(`${APP}#c=${normalizeManualCode(session.code)}`);
    expect(session.url.length).toBeLessThanOrEqual(64);
    expect(session.appUrl).toBe(APP);
    expect(readPairingText(session.url)).toEqual({ code: normalizeManualCode(session.code) });
    // Quiet zone of 4 modules around a small (version 4, 33 modules) QR: 41 × 41 viewBox.
    expect(session.qrSvg).toContain('viewBox="0 0 41 41"');
  });

  it('PF-02 embeds a non-default relay (dev / self-host) in the QR', async () => {
    const session = await startPairing('thorin', { appUrl: APP, relayUrl: 'ws://10.0.0.2:8787' });
    expect(readPairingText(session.url)?.relay).toBe('ws://10.0.0.2:8787');
  });

  it('PF-03 refuses actors the user does not own, and unknown actors', async () => {
    const endpoints = { appUrl: APP, relayUrl: DEFAULT_RELAY_URL };
    await expect(startPairing('goblin', endpoints)).rejects.toThrow('does not own');
    await expect(startPairing('missing', endpoints)).rejects.toThrow('not found');
  });

  it('PF-04 expirePairing forgets only a still-pending pairing', async () => {
    const session = await startPairing('thorin', { appUrl: APP, relayUrl: DEFAULT_RELAY_URL });
    expect(await expirePairing(session.deviceId)).toBe(true);
    expect(getPairing(session.deviceId)).toBeNull();
    expect(await expirePairing(session.deviceId)).toBe(false);
  });
});

describe('checkRelay (gate G1)', () => {
  it('PF-05 true on a 200 /health, false on errors and non-2xx', async () => {
    const fetchMock = vi.fn(async () => new Response('ok', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await checkRelay('wss://relay.example')).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith('https://relay.example/health', expect.anything());
    fetchMock.mockResolvedValueOnce(new Response('no', { status: 503 }));
    expect(await checkRelay('wss://relay.example')).toBe(false);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    fetchMock.mockRejectedValueOnce(new TypeError('blocked by CSP'));
    expect(await checkRelay('wss://relay.example')).toBe(false);
  });
});
