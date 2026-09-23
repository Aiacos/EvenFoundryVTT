/**
 * ADR-0013 §Confirmation — election matrix: player active/inactive × GM active/none ×
 * key present/absent, plus custody variants (self-paired, on behalf, legacy).
 */
import { generateIdentityKeyPair, type SealedBlob, type SelfDevice } from '@evf/shared-protocol';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installFoundry, makeActor, makeUser } from '../__tests__/direct-fixtures.js';
import { deviceContext, type ElectionInput, electResponder, userOwnsActor } from './election.js';
import type { DeviceMeta } from './pairing-store.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

const SELF: SelfDevice = {
  g2UserId: 'g2a',
  actorId: 'mira',
  pendingRotation: false,
  playerHasKey: true,
  updatedAt: 1,
};

function input(extra: Partial<ElectionInput>): ElectionInput {
  return {
    playerUserId: 'p1',
    playerActive: true,
    selfDevice: SELF,
    activeGMId: 'gm1',
    activeGmIds: ['gm1'],
    gmCanOpen: () => true,
    ...extra,
  };
}

describe('electResponder — matrix', () => {
  const cases: Array<[string, Partial<ElectionInput>, string | null]> = [
    ['player active + key → player', {}, 'p1'],
    [
      'player active, key lost → GM with key',
      { selfDevice: { ...SELF, playerHasKey: false } },
      'gm1',
    ],
    ['player inactive, GM active with key → GM', { playerActive: false }, 'gm1'],
    [
      'player inactive, GM active without key → nobody',
      { playerActive: false, gmCanOpen: () => false },
      null,
    ],
    [
      'player inactive, no GM → nobody',
      { playerActive: false, activeGMId: null, activeGmIds: [] },
      null,
    ],
    ['player active + key, no GM → player', { activeGMId: null, activeGmIds: [] }, 'p1'],
    ['paired on behalf (no self device), player active → GM', { selfDevice: null }, 'gm1'],
    [
      'paired on behalf, GM without key → nobody',
      { selfDevice: null, gmCanOpen: () => false },
      null,
    ],
  ];
  for (const [name, extra, expected] of cases) {
    it(`EL-${name}`, () => expect(electResponder(input(extra))).toBe(expected));
  }

  it('EL-multi prefers the designated active GM, else the lowest id among key holders', () => {
    const base = { playerActive: false, activeGmIds: ['gmB', 'gmA', 'gmC'] };
    expect(electResponder(input({ ...base, activeGMId: 'gmC' }))).toBe('gmC');
    expect(
      electResponder(input({ ...base, activeGMId: 'gmC', gmCanOpen: (id) => id !== 'gmC' })),
    ).toBe('gmA');
  });
});

describe('deviceContext — from Foundry state', () => {
  const blob = (): SealedBlob => ({
    v: 1,
    epk: { kty: 'EC', crv: 'P-256', x: 'x'.repeat(43), y: 'y'.repeat(43) },
    iv: 'i'.repeat(16),
    ct: 'c',
  });

  function meta(extra: Partial<DeviceMeta> = {}): DeviceMeta {
    return {
      g2UserId: 'g2a',
      playerUserId: 'p1',
      actorId: 'thorin',
      label: 'Luca (G2)',
      createdAt: 1,
      lastSeenAt: null,
      pendingRotation: false,
      ...extra,
    };
  }

  it('EL-ctx-01 legacy record (no keyHolder): the active GM answers, GM actor projected', () => {
    installFoundry({ users: [makeUser('p1', 'Luca')] });
    const ctx = deviceContext(meta());
    expect(ctx).toMatchObject({ responderId: 'gm1', selfDevice: null, actorId: 'thorin' });
  });

  it('EL-ctx-02 on behalf: only the key holder answers, even when not the active GM', () => {
    const gm2 = makeUser('gm2', 'Bo', { isGM: true });
    installFoundry({ users: [makeUser('p1', 'Luca'), gm2] });
    expect(deviceContext(meta({ keyHolder: 'gm2' })).responderId).toBe('gm2');
    expect(deviceContext(meta({ keyHolder: null })).responderId).toBeNull();
    gm2.active = false;
    expect(deviceContext(meta({ keyHolder: 'gm2' })).responderId).toBeNull();
  });

  it('EL-ctx-03 self-paired: player when active; else the GM whose gmKeys entry matches its current key', async () => {
    const gmPair = await generateIdentityKeyPair();
    const player = makeUser('p1', 'Luca');
    const f = installFoundry({
      users: [player],
      actors: [makeActor('mira', 'Mira', { ownership: { p1: 3 } }), makeActor('thorin', 'Thorin')],
    });
    f.game.user.flags = { evenfoundryvtt: { pub: gmPair.publicJwk } };
    player.flags = {
      evenfoundryvtt: { device: SELF, gmKeys: { gm1: { for: gmPair.publicJwk.x, blob: blob() } } },
    };
    expect(deviceContext(meta())).toMatchObject({ responderId: 'p1', actorId: 'mira' });
    player.active = false;
    expect(deviceContext(meta()).responderId).toBe('gm1');
    // The GM opened Foundry in a new browser: its entry is stale until the player re-seals.
    const fresh = await generateIdentityKeyPair();
    f.game.user.flags = { evenfoundryvtt: { pub: fresh.publicJwk } };
    expect(deviceContext(meta()).responderId).toBeNull();
  });

  it('EL-ctx-04 a self device for another G2 user, or an unowned actor, is ignored', () => {
    const player = makeUser('p1', 'Luca');
    installFoundry({ users: [player], actors: [makeActor('mira', 'Mira')] });
    player.flags = { evenfoundryvtt: { device: { ...SELF, g2UserId: 'other' } } };
    expect(deviceContext(meta()).selfDevice).toBeNull();
    player.flags = { evenfoundryvtt: { device: SELF } };
    // Mira is not owned by p1: the player cannot redirect the glasses to it.
    expect(deviceContext(meta()).actorId).toBe('thorin');
  });

  it('EL-ctx-05 userOwnsActor: explicit or default OWNER only', () => {
    installFoundry({
      actors: [
        makeActor('a', 'A', { ownership: { p1: 3 } }),
        makeActor('b', 'B', { ownership: { default: 3 } }),
        makeActor('c', 'C', { ownership: { p1: 2 } }),
      ],
    });
    expect(['a', 'b', 'c', 'zz'].map((id) => userOwnsActor(id, 'p1'))).toEqual([
      true,
      true,
      false,
      false,
    ]);
  });
});
