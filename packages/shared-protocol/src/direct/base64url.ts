/**
 * Dependency-free base64url (RFC 4648 §5, no padding) for binary ↔ string.
 * Works in browsers and Node without `Buffer`.
 */

/** Encodes bytes as unpadded base64url. */
export function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Decodes unpadded (or padded) base64url; throws on invalid characters. */
export function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]*={0,2}$/.test(text)) throw new Error('invalid base64url');
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
