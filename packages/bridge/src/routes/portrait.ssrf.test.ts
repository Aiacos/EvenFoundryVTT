/**
 * Unit tests for validatePortraitUrl SSRF hardening (T-13-02).
 *
 * MEDIUM finding (review cleanup): the deny-list was hostname-string-based only.
 * Hardened to:
 *   (b) reject by RESOLVED private/loopback/link-local IP range (in any
 *       decimal/hex/octal/packed/IPv4-mapped-IPv6 form), not just specific names;
 *   (c) treat an EMPTY allowedHosts as HARD-DENY (fail-safe), never an open proxy.
 * Part (a) — redirect:'manual' — is covered in portrait-renderer.test.ts (PR-RENDER-06).
 *
 * @see packages/bridge/src/routes/portrait.ts (validatePortraitUrl)
 */

import { describe, expect, it } from 'vitest';
import { validatePortraitUrl } from './portrait.js';

const FOUNDRY_ORIGIN = 'http://foundry.example.com';
const ALLOWED = ['foundry.example.com'];

describe('validatePortraitUrl SSRF hardening', () => {
  it('empty allowedHosts is a HARD-DENY (fail-safe), not match-anything', () => {
    const r = validatePortraitUrl('http://foundry.example.com/p.webp', FOUNDRY_ORIGIN, []);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.statusCode).toBe(403);
      expect(r.error).toBe('portrait_url_no_allowed_hosts');
    }
  });

  it('allows a configured host through when allowedHosts is non-empty', () => {
    const r = validatePortraitUrl('http://foundry.example.com/p.webp', FOUNDRY_ORIGIN, ALLOWED);
    expect(r.ok).toBe(true);
  });

  // ── Private / internal IP-literal denial (resolved-range, not name) ──────────
  const PRIVATE_IP_URLS: Array<[string, string]> = [
    ['dotted loopback', 'http://127.0.0.1/p.webp'],
    ['loopback range', 'http://127.1.2.3/p.webp'],
    ['private 10/8', 'http://10.0.0.5/p.webp'],
    ['private 172.16/12', 'http://172.16.5.5/p.webp'],
    ['private 192.168/16', 'http://192.168.1.10/p.webp'],
    ['link-local 169.254', 'http://169.254.169.254/latest/meta-data/'],
    ['CGNAT 100.64/10', 'http://100.64.0.1/p.webp'],
    ['packed-decimal loopback', 'http://2130706433/p.webp'], // 127.0.0.1
    ['hex loopback', 'http://0x7f.0.0.1/p.webp'],
    ['octal loopback', 'http://0177.0.0.1/p.webp'],
    ['short-form loopback', 'http://127.1/p.webp'],
    ['ipv4-mapped ipv6', 'http://[::ffff:127.0.0.1]/p.webp'],
    ['ipv6 loopback', 'http://[::1]/p.webp'],
  ];

  for (const [label, url] of PRIVATE_IP_URLS) {
    it(`denies private/internal IP literal: ${label} (${url})`, () => {
      // Even with a permissive allowedHosts, a private IP literal must be denied.
      const r = validatePortraitUrl(url, FOUNDRY_ORIGIN, [
        ...ALLOWED,
        '127.0.0.1',
        '[::1]',
        '169.254.169.254',
      ]);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.statusCode).toBe(403);
        // ::1 and the name-listed 169.254/127 hit the name deny-list first; the rest
        // hit the IP-range deny. Both are acceptable denials.
        expect(['portrait_url_private_ip_denied', 'portrait_url_hostname_denied']).toContain(
          r.error,
        );
      }
    });
  }

  it('still allows a normal public host (not an IP literal)', () => {
    const r = validatePortraitUrl('https://cdn.example.com/p.webp', FOUNDRY_ORIGIN, [
      'cdn.example.com',
    ]);
    expect(r.ok).toBe(true);
  });

  it('rejects a non-http(s) scheme', () => {
    const r = validatePortraitUrl('file:///etc/passwd', FOUNDRY_ORIGIN, ALLOWED);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.statusCode).toBe(400);
  });
});
