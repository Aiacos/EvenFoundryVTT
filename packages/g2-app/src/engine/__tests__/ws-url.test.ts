/**
 * Unit tests for {@link toWsConnectUrl} (Quick Task 260604-pai).
 *
 * Covers the WS connect-URL derivation contract (per 260604-pai-PLAN.md
 * Task 1 `<behavior>` block):
 *   - http(s) REST base → ws(s) connect URL ending in `/ws`
 *   - trailing-slash strip (single + collapse multiple)
 *   - idempotency for inputs already on a ws/wss scheme and/or already
 *     ending in `/ws` (no double scheme-conversion, no double `/ws`)
 *
 * @see packages/g2-app/src/engine/ws-url.ts
 */
import { describe, expect, it } from 'vitest';
import { toWsConnectUrl } from '../ws-url.js';

describe('toWsConnectUrl', () => {
  it('converts https REST base to wss connect URL with /ws appended', () => {
    expect(toWsConnectUrl('https://h:443')).toBe('wss://h:443/ws');
  });

  it('converts http REST base to ws connect URL with /ws appended', () => {
    expect(toWsConnectUrl('http://h:8910')).toBe('ws://h:8910/ws');
  });

  it('strips a single trailing slash before appending /ws', () => {
    expect(toWsConnectUrl('https://h:443/')).toBe('wss://h:443/ws');
  });

  it('collapses multiple trailing slashes before appending /ws', () => {
    expect(toWsConnectUrl('https://h:443///')).toBe('wss://h:443/ws');
  });

  it('is idempotent for a wss-scheme input already ending in /ws', () => {
    expect(toWsConnectUrl('wss://h/ws')).toBe('wss://h/ws');
  });

  it('is idempotent for a ws-scheme input already ending in /ws', () => {
    expect(toWsConnectUrl('ws://h:8910/ws')).toBe('ws://h:8910/ws');
  });

  it('preserves the ws-reconnect.test.ts contract string unchanged', () => {
    expect(toWsConnectUrl('wss://test.local/ws')).toBe('wss://test.local/ws');
  });

  it('leaves a non-/ws ws-scheme input path as-is (no force /ws append)', () => {
    // Already a ws-scheme connect URL: do NOT scheme-convert, do NOT force /ws.
    // This keeps existing boot-engine fixtures byte-stable.
    expect(toWsConnectUrl('ws://test/bridge')).toBe('ws://test/bridge');
  });

  it('is idempotent under double application', () => {
    expect(toWsConnectUrl(toWsConnectUrl('https://h:443'))).toBe('wss://h:443/ws');
  });
});
