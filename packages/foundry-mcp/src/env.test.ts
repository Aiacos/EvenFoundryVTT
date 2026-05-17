/**
 * Tests for parseMcpEnv() — RED phase (TDD Task 1 — Plan 11-01).
 *
 * Covers all 7 behavioral cases:
 * 1. Happy-path with required env vars → returns McpEnv with defaults
 * 2. Empty EVF_BEARER → throws BootError 'EVF_BEARER required'
 * 3. Missing EVF_BEARER → throws BootError 'EVF_BEARER required'
 * 4. Missing EVF_BRIDGE_URL → throws BootError 'EVF_BRIDGE_URL required'
 * 5. Custom MCP_HTTP_PORT → httpPort overridden
 * 6. Invalid MCP_HTTP_PORT (non-integer) → throws BootError 'MCP_HTTP_PORT must be integer'
 * 7. BootError.message never contains the bearer value (T-11-01)
 *
 * Tests use plain object injection (parseMcpEnv accepts env param) — no vi.stubEnv needed.
 */

import { describe, expect, it } from 'vitest';
import { BootError, parseMcpEnv } from './env.js';

describe('parseMcpEnv', () => {
  it('case 1: returns McpEnv with defaults given required vars', () => {
    const result = parseMcpEnv({ EVF_BEARER: 'abc', EVF_BRIDGE_URL: 'http://localhost:8910' });
    expect(result).toEqual({
      bearer: 'abc',
      bridgeUrl: 'http://localhost:8910',
      httpPort: 8911,
      logLevel: 'info',
    });
  });

  it('case 2: throws BootError when EVF_BEARER is empty string', () => {
    expect(() => parseMcpEnv({ EVF_BEARER: '', EVF_BRIDGE_URL: 'http://localhost:8910' })).toThrow(
      BootError,
    );
    expect(() => parseMcpEnv({ EVF_BEARER: '', EVF_BRIDGE_URL: 'http://localhost:8910' })).toThrow(
      'EVF_BEARER required',
    );
  });

  it('case 3: throws BootError when EVF_BEARER is missing', () => {
    expect(() => parseMcpEnv({ EVF_BRIDGE_URL: 'http://localhost:8910' })).toThrow(BootError);
    expect(() => parseMcpEnv({ EVF_BRIDGE_URL: 'http://localhost:8910' })).toThrow(
      'EVF_BEARER required',
    );
  });

  it('case 4: throws BootError when EVF_BRIDGE_URL is missing', () => {
    expect(() => parseMcpEnv({ EVF_BEARER: 'abc' })).toThrow(BootError);
    expect(() => parseMcpEnv({ EVF_BEARER: 'abc' })).toThrow('EVF_BRIDGE_URL required');
  });

  it('case 5: uses custom MCP_HTTP_PORT when provided', () => {
    const result = parseMcpEnv({
      EVF_BEARER: 'abc',
      EVF_BRIDGE_URL: 'http://x',
      MCP_HTTP_PORT: '9999',
    });
    expect(result.httpPort).toBe(9999);
  });

  it('case 6: throws BootError when MCP_HTTP_PORT is not a number', () => {
    expect(() =>
      parseMcpEnv({ EVF_BEARER: 'abc', EVF_BRIDGE_URL: 'http://x', MCP_HTTP_PORT: 'not-a-number' }),
    ).toThrow(BootError);
    expect(() =>
      parseMcpEnv({ EVF_BEARER: 'abc', EVF_BRIDGE_URL: 'http://x', MCP_HTTP_PORT: 'not-a-number' }),
    ).toThrow('MCP_HTTP_PORT must be integer');
  });

  it('case 7: BootError.message never includes the bearer value (T-11-01)', () => {
    const secretBearer = 'super-secret-token-12345';
    // Trigger a BootError via missing bridgeUrl (not via bearer itself)
    let caughtErr: BootError | undefined;
    try {
      // Pass a valid bearer but invalid configuration to get a BootError triggered
      // with EVF_BEARER in scope — just make sure the error doesn't leak it
      parseMcpEnv({ EVF_BEARER: secretBearer, EVF_BRIDGE_URL: '' });
    } catch (err) {
      if (err instanceof BootError) {
        caughtErr = err;
      }
    }
    expect(caughtErr).toBeInstanceOf(BootError);
    expect(caughtErr?.message).not.toContain(secretBearer);
    expect(caughtErr?.toString()).not.toContain(secretBearer);
  });
});
