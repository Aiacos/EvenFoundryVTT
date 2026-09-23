import { afterEach, describe, expect, it, vi } from 'vitest';
import { installFoundry, makeActor, makeUser } from '../__tests__/direct-fixtures.js';
import {
  deleteG2User,
  ensureG2User,
  findG2User,
  g2UserName,
  generatePassword,
  grantActorOwnership,
  isG2User,
  setG2Password,
} from './g2-user.js';

afterEach(() => vi.unstubAllGlobals());

describe('g2-user', () => {
  it('GU-01 name + password shape', () => {
    expect(g2UserName('Luca')).toBe('Luca (G2)');
    const p = generatePassword();
    expect(p).toMatch(/^[A-Za-z0-9_-]{24}$/);
    expect(generatePassword()).not.toBe(p);
  });

  it('GU-02 creates a PLAYER user flagged for the player (never GM/assistant)', async () => {
    const luca = makeUser('p1', 'Luca');
    const f = installFoundry({ users: [luca] });
    const g2 = await ensureG2User(luca as unknown as FoundryUser, 'secret-password-1');
    expect(f.createUser).toHaveBeenCalledWith({
      name: 'Luca (G2)',
      role: 1,
      password: 'secret-password-1',
      flags: { evenfoundryvtt: { g2For: 'p1' } },
    });
    expect(isG2User(g2)).toBe(true);
    expect(findG2User('p1')?.id).toBe(g2.id);
  });

  it('GU-03 refreshes the existing G2 user and forces role back to PLAYER', async () => {
    const luca = makeUser('p1', 'Luca');
    const existing = makeUser('g2a', 'old', {
      role: 3,
      flags: { evenfoundryvtt: { g2For: 'p1' } },
    });
    const f = installFoundry({ users: [luca, existing] });
    const g2 = await ensureG2User(luca as unknown as FoundryUser, 'another-password');
    expect(g2).toBe(existing);
    expect(f.createUser).not.toHaveBeenCalled();
    expect(existing.update).toHaveBeenCalledWith({
      name: 'Luca (G2)',
      role: 1,
      password: 'another-password',
    });
  });

  it('GU-04 refuses to pair a G2 user and reports create refusal', async () => {
    const g2 = makeUser('g2a', 'x (G2)', { flags: { evenfoundryvtt: { g2For: 'p1' } } });
    const luca = makeUser('p1', 'Luca');
    const f = installFoundry({ users: [g2, luca] });
    await expect(ensureG2User(g2 as unknown as FoundryUser, 'pw-123456789')).rejects.toThrow(
      /cannot pair/,
    );
    const bob = makeUser('p2', 'Bob');
    f.users.push(bob);
    f.createUser.mockResolvedValueOnce(undefined);
    await expect(ensureG2User(bob as unknown as FoundryUser, 'pw-123456789')).rejects.toThrow(
      /refused/,
    );
  });

  it('GU-05 grants OWNER on the chosen actor only and resets the previous actor', async () => {
    const thorin = makeActor('a1', 'Thorin');
    const mira = makeActor('a2', 'Mira');
    installFoundry({ actors: [thorin, mira] });
    await grantActorOwnership('g2a', 'a1', null);
    expect(thorin.ownership).toEqual({ g2a: 3 });
    await grantActorOwnership('g2a', 'a2', 'a1');
    expect(thorin.ownership).toEqual({ g2a: 0 });
    expect(mira.ownership).toEqual({ g2a: 3 });
    await expect(grantActorOwnership('g2a', 'missing', null)).rejects.toThrow(/not found/);
  });

  it('GU-06 setG2Password updates; delete only removes G2 users', async () => {
    const g2 = makeUser('g2a', 'Luca (G2)', { flags: { evenfoundryvtt: { g2For: 'p1' } } });
    const luca = makeUser('p1', 'Luca');
    installFoundry({ users: [g2, luca] });
    await setG2Password('g2a', 'new-password-xyz');
    expect(g2.update).toHaveBeenCalledWith({ password: 'new-password-xyz' });
    await expect(setG2Password('nope', 'x')).rejects.toThrow(/not found/);
    await deleteG2User('g2a');
    expect(g2.delete).toHaveBeenCalled();
    await expect(deleteG2User('p1')).rejects.toThrow(/non-G2/);
    await expect(deleteG2User('ghost')).resolves.toBeUndefined();
  });
});
