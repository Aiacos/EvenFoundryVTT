import { describe, expect, it } from 'vitest';
import { fromBase64Url, toBase64Url } from './base64url.js';
import {
  deviceKeyContext,
  GlassesAccessSchema,
  GmKeyEntrySchema,
  passwordContext,
  SelfDeviceSchema,
} from './custody.js';
import {
  generateIdentityKeyPair,
  IdentityPublicJwkSchema,
  importIdentityPrivateKey,
  openSealed,
  SealedBlobSchema,
  sealFor,
} from './ecdh.js';
import { ProjectorMessageSchema } from './messages.js';

describe('ECDH identity keys + sealed blobs (ADR-0013)', () => {
  it('EC-01 generates a P-256 pair whose public part carries no private member', async () => {
    const pair = await generateIdentityKeyPair();
    expect(IdentityPublicJwkSchema.parse(pair.publicJwk)).toEqual(pair.publicJwk);
    expect(pair.publicJwk).not.toHaveProperty('d');
    expect(pair.privateJwk.d).toEqual(expect.any(String));
  });

  it('EC-02 round-trips a secret for the recipient key and context', async () => {
    const bob = await generateIdentityKeyPair();
    const blob = await sealFor(bob.publicJwk, 'correct-horse-battery', 'pw:g2a');
    expect(SealedBlobSchema.parse(blob)).toEqual(blob);
    expect(blob.ct).not.toContain('horse');
    const priv = await importIdentityPrivateKey(bob.privateJwk);
    await expect(openSealed(priv, blob, 'pw:g2a')).resolves.toBe('correct-horse-battery');
  });

  it('EC-03 each seal uses a fresh ephemeral key and IV', async () => {
    const bob = await generateIdentityKeyPair();
    const a = await sealFor(bob.publicJwk, 'x', 'c');
    const b = await sealFor(bob.publicJwk, 'x', 'c');
    expect(a.epk).not.toEqual(b.epk);
    expect(a.iv).not.toBe(b.iv);
  });

  it('EC-04 the wrong private key cannot open', async () => {
    const bob = await generateIdentityKeyPair();
    const eve = await generateIdentityKeyPair();
    const blob = await sealFor(bob.publicJwk, 'secret', 'pw:g2a');
    const evePriv = await importIdentityPrivateKey(eve.privateJwk);
    await expect(openSealed(evePriv, blob, 'pw:g2a')).resolves.toBeNull();
  });

  it('EC-05 tampered ciphertext, IV or ephemeral key fail; another context fails', async () => {
    const bob = await generateIdentityKeyPair();
    const priv = await importIdentityPrivateKey(bob.privateJwk);
    const blob = await sealFor(bob.publicJwk, 'secret', 'pw:g2a');
    const flip = (b64: string): string => {
      const bytes = fromBase64Url(b64);
      bytes[0] = (bytes[0] ?? 0) ^ 1;
      return toBase64Url(bytes);
    };
    const other = await generateIdentityKeyPair();
    await expect(openSealed(priv, { ...blob, ct: flip(blob.ct) }, 'pw:g2a')).resolves.toBeNull();
    await expect(openSealed(priv, { ...blob, iv: flip(blob.iv) }, 'pw:g2a')).resolves.toBeNull();
    await expect(openSealed(priv, { ...blob, epk: other.publicJwk }, 'pw:g2a')).resolves.toBeNull();
    await expect(openSealed(priv, blob, 'pw:g2b')).resolves.toBeNull();
  });

  it('EC-06 malformed blobs and invalid curve points return null, never throw', async () => {
    const bob = await generateIdentityKeyPair();
    const priv = await importIdentityPrivateKey(bob.privateJwk);
    await expect(openSealed(priv, null, 'c')).resolves.toBeNull();
    await expect(openSealed(priv, { v: 2 }, 'c')).resolves.toBeNull();
    const blob = await sealFor(bob.publicJwk, 'x', 'c');
    const bogus = { ...blob, epk: { ...blob.epk, x: 'A'.repeat(43) } };
    await expect(openSealed(priv, bogus, 'c')).resolves.toBeNull();
  });

  it('EC-07 custody records validate sealed blobs and reject secrets in clear', async () => {
    const bob = await generateIdentityKeyPair();
    const blob = await sealFor(bob.publicJwk, 'k', deviceKeyContext('g2a', 'gm1'));
    expect(GmKeyEntrySchema.safeParse({ for: bob.publicJwk.x, blob }).success).toBe(true);
    expect(GmKeyEntrySchema.safeParse({ for: 'x', blob: 'plain-key' }).success).toBe(false);
    const access = { g2UserId: 'g2a', sealed: null, sealedFor: null, updatedAt: 1 };
    expect(GlassesAccessSchema.parse(access)).toEqual(access);
    expect(passwordContext('g2a')).toBe('pw:g2a');
    expect(SelfDeviceSchema.safeParse({ g2UserId: 'g2a' }).success).toBe(false);
  });

  it('EC-08 welcome.rotate may omit the password (player-client projector)', () => {
    const key = 'k'.repeat(43);
    const welcome = {
      t: 'welcome',
      rid: 'r',
      actorId: 'a',
      actorName: 'A',
      userName: 'U',
      gmName: 'G',
      worldTitle: 'W',
      rotate: { key },
    };
    expect(ProjectorMessageSchema.safeParse(welcome).success).toBe(true);
  });
});
