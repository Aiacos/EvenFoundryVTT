/**
 * Unit tests for the ADR-0016 direct-sideload GO/NO-GO pure helpers.
 *
 * @see packages/validation-harness/src/direct-sideload.ts
 * @see docs/architecture/0016-direct-foundry-streaming.md §Confirmation / GO-NO-GO gates
 */

import { describe, expect, it } from 'vitest';
import {
  apiStatusUrl,
  checkHttps,
  evaluateApiStatus,
  evaluateEntry,
  evaluateHardwareAnswers,
  evaluateReachability,
  g2EntryUrl,
  HARDWARE_CHECKLIST,
  type HttpOutcome,
  normalizeFoundryUrl,
  parseSideloadArgs,
  qrUrlForm,
  summarize,
} from '../direct-sideload.js';

const html = (status: number, contentType = 'text/html; charset=utf-8'): HttpOutcome => ({
  kind: 'response',
  status,
  contentType,
  body: '<!doctype html>',
});

describe('normalizeFoundryUrl', () => {
  it('strips trailing slashes, query and fragment but keeps the routePrefix', () => {
    expect(normalizeFoundryUrl(' https://vtt.example.org/foundry//?x=1#y ')).toEqual({
      ok: true,
      base: 'https://vtt.example.org/foundry',
    });
    expect(normalizeFoundryUrl('https://vtt.example.org:30000/')).toEqual({
      ok: true,
      base: 'https://vtt.example.org:30000',
    });
  });

  it('accepts http (reported later by checkHttps) and rejects other schemes / garbage', () => {
    expect(normalizeFoundryUrl('http://10.0.0.2:30000')).toEqual({
      ok: true,
      base: 'http://10.0.0.2:30000',
    });
    expect(normalizeFoundryUrl('')).toEqual({ ok: false, error: 'FOUNDRY_URL is empty' });
    expect(normalizeFoundryUrl('foundry.local').ok).toBe(false);
    expect(normalizeFoundryUrl('ftp://foundry.local').ok).toBe(false);
  });
});

describe('URL builders', () => {
  const base = 'https://vtt.example.org/foundry';

  it('derives the module-served entry and status URLs', () => {
    expect(g2EntryUrl(base)).toBe(
      'https://vtt.example.org/foundry/modules/evenfoundryvtt/g2/index.html',
    );
    expect(apiStatusUrl(base)).toBe('https://vtt.example.org/foundry/api/status');
  });

  it('prints the QR form with placeholders only (fragment, never real secrets)', () => {
    const qr = qrUrlForm(base);
    expect(qr.startsWith(`${g2EntryUrl(base)}#evf=`)).toBe(true);
    expect(qr).toContain('<password>');
    expect(qr).toContain('<K>');
  });
});

describe('checkHttps', () => {
  it('passes https and fails http', () => {
    expect(checkHttps('https://a.example').verdict).toBe('pass');
    expect(checkHttps('http://a.example').verdict).toBe('fail');
  });
});

describe('evaluateReachability', () => {
  it('treats any <500 answer (incl. /join redirect) as reachable', () => {
    expect(evaluateReachability(html(302)).verdict).toBe('pass');
    expect(evaluateReachability(html(503)).verdict).toBe('fail');
  });

  it('fails on transport errors such as a self-signed certificate', () => {
    const r = evaluateReachability({ kind: 'error', message: 'DEPTH_ZERO_SELF_SIGNED_CERT' });
    expect(r.verdict).toBe('fail');
    expect(r.detail).toContain('DEPTH_ZERO_SELF_SIGNED_CERT');
  });
});

describe('evaluateEntry', () => {
  it('passes only for HTTP 200 text/html', () => {
    expect(evaluateEntry(html(200))).toEqual({
      id: 'g2-entry',
      verdict: 'pass',
      detail: 'HTTP 200 text/html',
    });
  });

  it('fails on 404 (module missing / zip without g2/), wrong type, or transport error', () => {
    expect(evaluateEntry(html(404)).detail).toContain('g2/');
    expect(evaluateEntry(html(200, 'application/json')).verdict).toBe('fail');
    expect(evaluateEntry(html(200, '')).detail).toContain('(none)');
    expect(evaluateEntry({ kind: 'error', message: 'ETIMEDOUT' }).verdict).toBe('fail');
  });
});

describe('evaluateApiStatus', () => {
  const json = (body: string, status = 200): HttpOutcome => ({
    kind: 'response',
    status,
    contentType: 'application/json',
    body,
  });

  it('reports the Foundry version when exposed', () => {
    expect(evaluateApiStatus(json('{"active":true,"version":"13.347"}')).detail).toBe(
      'Foundry version 13.347',
    );
    expect(evaluateApiStatus(json('{"active":true}')).detail).toBe('Foundry version unknown');
  });

  it('is skipped (never NO-GO) when absent, non-JSON or unreachable', () => {
    expect(evaluateApiStatus(json('{}', 404)).verdict).toBe('skipped');
    expect(evaluateApiStatus(html(200)).verdict).toBe('skipped');
    expect(evaluateApiStatus(json('not json')).verdict).toBe('skipped');
    expect(evaluateApiStatus({ kind: 'error', message: 'ECONNRESET' }).verdict).toBe('skipped');
  });
});

describe('hardware checklist', () => {
  it('covers the four ADR-0016 confirmation steps', () => {
    expect(HARDWARE_CHECKLIST.map((s) => s.id)).toEqual([
      'hw-qr-load',
      'hw-sdk-bridge',
      'hw-cookie-persist',
      'hw-socket-reconnect',
    ]);
  });

  it('maps operator answers to pass/fail and unanswered steps to skipped', () => {
    const results = evaluateHardwareAnswers({ 'hw-qr-load': true, 'hw-sdk-bridge': false });
    expect(results.map((r) => r.verdict)).toEqual(['pass', 'fail', 'skipped', 'skipped']);
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

describe('parseSideloadArgs', () => {
  it('parses --skip-hardware and tolerates the pnpm `--` separator', () => {
    expect(parseSideloadArgs([])).toEqual({ skipHardware: false });
    expect(parseSideloadArgs(['--', '--skip-hardware'])).toEqual({ skipHardware: true });
  });

  it('rejects unknown flags', () => {
    expect(() => parseSideloadArgs(['--verbose'])).toThrow(/unknown argument/);
  });
});
