/**
 * Unit tests for the ADR-0019 relay GO/NO-GO pure helpers.
 *
 * @see packages/validation-harness/src/relay-check.ts
 * @see docs/architecture/0019-relay-pairing-player-projector.md
 */

import { describe, expect, it } from 'vitest';
import {
  evaluateCors,
  evaluateHardwareAnswers,
  evaluateHealth,
  evaluateOversize,
  evaluateRoundtrip,
  HARDWARE_CHECKLIST,
  type HealthOutcome,
  healthUrl,
  normalizeRelayUrl,
  parseControl,
  parseRelayArgs,
  roomIdFromBytes,
  roomUrl,
  summarize,
} from '../relay-check.js';

const health = (status: number, body = 'ok', allowOrigin: string | null = '*'): HealthOutcome => ({
  kind: 'response',
  status,
  body,
  allowOrigin,
});

describe('normalizeRelayUrl', () => {
  it('maps every accepted scheme to its WebSocket spelling and keeps the path prefix', () => {
    expect(normalizeRelayUrl('wss://relay.example.org')).toEqual({
      ok: true,
      base: 'wss://relay.example.org',
    });
    expect(normalizeRelayUrl(' https://relay.example.org/evf//?x=1#y ')).toEqual({
      ok: true,
      base: 'wss://relay.example.org/evf',
    });
    expect(normalizeRelayUrl('http://127.0.0.1:8787/')).toEqual({
      ok: true,
      base: 'ws://127.0.0.1:8787',
    });
    expect(normalizeRelayUrl('ws://127.0.0.1:8799')).toEqual({
      ok: true,
      base: 'ws://127.0.0.1:8799',
    });
  });

  it('rejects empty, relative and non-web schemes without echoing the URL', () => {
    expect(normalizeRelayUrl('  ')).toEqual({ ok: false, error: 'RELAY_URL is empty' });
    expect(normalizeRelayUrl('relay.example.org')).toEqual({
      ok: false,
      error: 'RELAY_URL is not an absolute URL',
    });
    const ftp = normalizeRelayUrl('ftp://relay.example.org');
    expect(ftp.ok).toBe(false);
    expect(ftp.ok ? '' : ftp.error).toContain("'ftp:'");
  });
});

describe('URL builders', () => {
  it('derives the http(s) health URL and the ws(s) room URLs', () => {
    expect(healthUrl('wss://relay.example.org/evf')).toBe('https://relay.example.org/evf/health');
    expect(healthUrl('ws://127.0.0.1:8787')).toBe('http://127.0.0.1:8787/health');
    expect(roomUrl('wss://relay.example.org', 'A'.repeat(22), 'glasses')).toBe(
      `wss://relay.example.org/r/${'A'.repeat(22)}?role=glasses`,
    );
  });
});

describe('roomIdFromBytes', () => {
  it('encodes 16 bytes as a 22-char base64url id the relay accepts', () => {
    const id = roomIdFromBytes(new Uint8Array(16).fill(0xfb));
    expect(id).toMatch(/^[A-Za-z0-9_-]{22,64}$/);
    expect(id).toHaveLength(22);
  });

  it('refuses too little randomness', () => {
    expect(() => roomIdFromBytes(new Uint8Array(8))).toThrow(/16 random bytes/);
  });
});

describe('parseControl', () => {
  it('recognises relay control frames only', () => {
    expect(parseControl('{"relay":"peer-up"}')).toBe('peer-up');
    expect(parseControl('{"relay":"peer-down"}')).toBe('peer-down');
    expect(parseControl('{"relay":"peer-sideways"}')).toBeNull();
    expect(parseControl('{"relay":"peer-up","x":1}')).toBeNull();
    expect(parseControl('not json')).toBeNull();
  });
});

describe('evaluateHealth', () => {
  it('passes only on HTTP 200 with body ok', () => {
    expect(evaluateHealth(health(200, 'ok\n'))).toEqual({
      id: 'health',
      verdict: 'pass',
      detail: 'HTTP 200 ok',
    });
    expect(evaluateHealth(health(200, 'hello')).verdict).toBe('fail');
    expect(evaluateHealth(health(404)).detail).toContain('HTTP 404');
    expect(evaluateHealth({ kind: 'error', message: 'ENOTFOUND' }).detail).toContain('ENOTFOUND');
  });
});

describe('evaluateCors', () => {
  it('requires Access-Control-Allow-Origin: *', () => {
    expect(evaluateCors(health(200)).verdict).toBe('pass');
    expect(evaluateCors(health(200, 'ok', null)).detail).toContain('(absent)');
    expect(evaluateCors(health(200, 'ok', 'https://x.example')).verdict).toBe('fail');
    expect(evaluateCors({ kind: 'error', message: 'ECONNREFUSED' }).verdict).toBe('fail');
  });
});

describe('evaluateRoundtrip', () => {
  it('reports the RTT on success and the failing stage otherwise', () => {
    const ok = evaluateRoundtrip({ kind: 'ok', rttMs: 12.345 });
    expect(ok.verdict).toBe('pass');
    expect(ok.detail).toContain('RTT 12.3 ms');
    expect(
      evaluateRoundtrip({ kind: 'error', stage: 'glasses-peer-up', message: 'timeout' }),
    ).toEqual({ id: 'room-roundtrip', verdict: 'fail', detail: 'glasses-peer-up: timeout' });
  });
});

describe('evaluateOversize', () => {
  it('passes on close 1009 and is otherwise skipped (never NO-GO)', () => {
    expect(evaluateOversize({ kind: 'closed', code: 1009 }).verdict).toBe('pass');
    const other = evaluateOversize({ kind: 'closed', code: 1006 });
    expect(other.verdict).toBe('skipped');
    expect(other.detail).toContain('1006');
    expect(evaluateOversize({ kind: 'other', message: 'still open' })).toEqual({
      id: 'oversize',
      verdict: 'skipped',
      detail: 'informational: still open',
    });
  });
});

describe('hardware checklist', () => {
  it('covers research gates G1–G2 (a–g)', () => {
    expect(HARDWARE_CHECKLIST.map((s) => s.id)).toEqual([
      'hw-forge-v14',
      'hw-selfhost-v13-v14',
      'hw-qr-scan',
      'hw-code-pair',
      'hw-lock-5min',
      'hw-kill-reopen',
      'hw-projector-close',
    ]);
  });

  it('maps operator answers to pass/fail and unanswered steps to skipped', () => {
    const results = evaluateHardwareAnswers({ 'hw-forge-v14': true, 'hw-selfhost-v13-v14': false });
    expect(results.map((r) => r.verdict)).toEqual([
      'pass',
      'fail',
      'skipped',
      'skipped',
      'skipped',
      'skipped',
      'skipped',
    ]);
  });
});

describe('summarize', () => {
  it('is NO-GO on any fail and GO otherwise (skipped is neutral)', () => {
    expect(summarize([{ id: 'a', verdict: 'pass', detail: '' }])).toEqual({
      verdict: 'pass',
      exitCode: 0,
    });
    expect(summarize([{ id: 'a', verdict: 'skipped', detail: '' }]).exitCode).toBe(0);
    expect(
      summarize([
        { id: 'a', verdict: 'pass', detail: '' },
        { id: 'b', verdict: 'fail', detail: '' },
      ]),
    ).toEqual({ verdict: 'fail', exitCode: 1 });
  });
});

describe('parseRelayArgs', () => {
  it('parses --skip-hardware and tolerates the pnpm `--` separator', () => {
    expect(parseRelayArgs([])).toEqual({ skipHardware: false });
    expect(parseRelayArgs(['--', '--skip-hardware'])).toEqual({ skipHardware: true });
  });

  it('rejects unknown flags', () => {
    expect(() => parseRelayArgs(['--verbose'])).toThrow(/unknown argument/);
  });
});
