/**
 * Unit tests for isDebugEnabled() — the existence gate for all debug routes.
 *
 * Quick Task 260529-h5e Wave 2.
 *
 * Three-layer security model (plan <security_model>):
 *   - returns false when EVF_DEBUG is unset or !== 'true'.
 *   - returns true when EVF_DEBUG==='true' and NODE_ENV!=='production'.
 *   - returns false in production unless EVF_DEBUG_ALLOW_PROD==='true' (then true).
 *
 * @see ./is-debug-enabled.ts
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isDebugEnabled } from './is-debug-enabled.js';

describe('isDebugEnabled', () => {
  let savedDebug: string | undefined;
  let savedEnv: string | undefined;
  let savedAllowProd: string | undefined;

  beforeEach(() => {
    savedDebug = process.env.EVF_DEBUG;
    savedEnv = process.env.NODE_ENV;
    savedAllowProd = process.env.EVF_DEBUG_ALLOW_PROD;
  });

  afterEach(() => {
    // Restore env after each test (no cross-test leakage).
    restore('EVF_DEBUG', savedDebug);
    restore('NODE_ENV', savedEnv);
    restore('EVF_DEBUG_ALLOW_PROD', savedAllowProd);
  });

  function restore(key: string, value: string | undefined): void {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  it('returns false when EVF_DEBUG is unset', () => {
    delete process.env.EVF_DEBUG;
    process.env.NODE_ENV = 'development';
    expect(isDebugEnabled()).toBe(false);
  });

  it('returns false when EVF_DEBUG is not exactly "true"', () => {
    process.env.NODE_ENV = 'development';
    for (const v of ['1', 'yes', 'TRUE', 'on', '']) {
      process.env.EVF_DEBUG = v;
      expect(isDebugEnabled(), `EVF_DEBUG='${v}' must be off`).toBe(false);
    }
  });

  it('returns true when EVF_DEBUG==="true" and NODE_ENV!=="production"', () => {
    process.env.EVF_DEBUG = 'true';
    process.env.NODE_ENV = 'development';
    delete process.env.EVF_DEBUG_ALLOW_PROD;
    expect(isDebugEnabled()).toBe(true);
  });

  it('returns false in production even when EVF_DEBUG==="true" (double opt-in required)', () => {
    process.env.EVF_DEBUG = 'true';
    process.env.NODE_ENV = 'production';
    delete process.env.EVF_DEBUG_ALLOW_PROD;
    expect(isDebugEnabled()).toBe(false);
  });

  it('returns true in production only with EVF_DEBUG_ALLOW_PROD==="true"', () => {
    process.env.EVF_DEBUG = 'true';
    process.env.NODE_ENV = 'production';
    process.env.EVF_DEBUG_ALLOW_PROD = 'true';
    expect(isDebugEnabled()).toBe(true);
  });
});
