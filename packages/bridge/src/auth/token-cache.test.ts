/**
 * Unit tests for TokenCache.
 *
 * Covers: cache hit (within TTL), cache miss (expired TTL), explicit invalidation,
 * foundry_unreachable default stub, negative result caching (short TTL +
 * foundry_unreachable not cached).
 */
import { describe, expect, it, vi } from 'vitest';
import { TokenCache, type ValidateTokenResult } from './token-cache.js';

const VALID_RESULT: ValidateTokenResult = {
  valid: true,
  entry: {
    alias: 'Test G2',
    expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    worldId: 'test-world',
    userId: 'test-user',
  },
  authorizedActorIds: ['test-actor'],
};

const INVALID_RESULT: ValidateTokenResult = {
  valid: false,
  reason: 'unknown_token',
};

describe('TokenCache', () => {
  describe('cache miss → calls foundryValidateFn', () => {
    it('calls the validation function on first access', async () => {
      const fn = vi.fn().mockResolvedValue(VALID_RESULT);
      const cache = new TokenCache(fn);

      const result = await cache.validate('token-abc');

      expect(fn).toHaveBeenCalledOnce();
      expect(fn).toHaveBeenCalledWith('token-abc');
      expect(result).toEqual(VALID_RESULT);
    });

    it('stores result in cache after first call', async () => {
      const fn = vi.fn().mockResolvedValue(VALID_RESULT);
      const cache = new TokenCache(fn);

      await cache.validate('token-abc');
      await cache.validate('token-abc');

      expect(fn).toHaveBeenCalledOnce();
    });
  });

  describe('cache hit (within TTL)', () => {
    it('returns cached result without calling foundryValidateFn again', async () => {
      const fn = vi.fn().mockResolvedValue(VALID_RESULT);
      const cache = new TokenCache(fn);

      const first = await cache.validate('token-xyz');
      const second = await cache.validate('token-xyz');

      expect(fn).toHaveBeenCalledOnce();
      expect(second).toEqual(first);
    });
  });

  describe('cache expiry (TTL elapsed)', () => {
    it('re-calls foundryValidateFn after TTL expires', async () => {
      const now = Date.now();
      vi.useFakeTimers();
      vi.setSystemTime(now);

      const fn = vi.fn().mockResolvedValue(VALID_RESULT);
      const cache = new TokenCache(fn);

      await cache.validate('token-ttl');
      expect(fn).toHaveBeenCalledOnce();

      // Advance past 5-minute TTL
      vi.advanceTimersByTime(5 * 60 * 1000 + 1);

      await cache.validate('token-ttl');
      expect(fn).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
    });

    it('returns stale result before TTL expires', async () => {
      const now = Date.now();
      vi.useFakeTimers();
      vi.setSystemTime(now);

      const fn = vi.fn().mockResolvedValue(VALID_RESULT);
      const cache = new TokenCache(fn);

      await cache.validate('token-ttl2');
      vi.advanceTimersByTime(5 * 60 * 1000 - 1); // 1ms before expiry
      await cache.validate('token-ttl2');

      expect(fn).toHaveBeenCalledOnce();

      vi.useRealTimers();
    });
  });

  describe('explicit invalidation', () => {
    it('forces re-validation after invalidateToken', async () => {
      const fn = vi.fn().mockResolvedValue(VALID_RESULT);
      const cache = new TokenCache(fn);

      await cache.validate('token-inv');
      cache.invalidateToken('token-inv');
      await cache.validate('token-inv');

      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('reduces cache size after invalidation', async () => {
      const fn = vi.fn().mockResolvedValue(VALID_RESULT);
      const cache = new TokenCache(fn);

      await cache.validate('token-size');
      expect(cache.size).toBe(1);

      cache.invalidateToken('token-size');
      expect(cache.size).toBe(0);
    });

    it('is a no-op for a token not in the cache', () => {
      const fn = vi.fn().mockResolvedValue(VALID_RESULT);
      const cache = new TokenCache(fn);

      // Should not throw
      expect(() => cache.invalidateToken('ghost-token')).not.toThrow();
    });
  });

  describe('default stub (no foundryValidateFn provided)', () => {
    it('returns foundry_unreachable when no fn injected', async () => {
      const cache = new TokenCache();
      const result = await cache.validate('any-token');

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('foundry_unreachable');
    });
  });

  describe('negative result caching', () => {
    it('caches invalid results to avoid hammering Foundry with bad tokens', async () => {
      const fn = vi.fn().mockResolvedValue(INVALID_RESULT);
      const cache = new TokenCache(fn);

      await cache.validate('bad-token');
      await cache.validate('bad-token');
      await cache.validate('bad-token');

      expect(fn).toHaveBeenCalledOnce();
    });

    it('expires a negative (invalid) result FASTER than a positive one', async () => {
      vi.useFakeTimers();
      try {
        const invalidFn = vi.fn().mockResolvedValue(INVALID_RESULT);
        const invalidCache = new TokenCache(invalidFn);
        const validFn = vi.fn().mockResolvedValue(VALID_RESULT);
        const validCache = new TokenCache(validFn);

        await invalidCache.validate('bad-token');
        await validCache.validate('good-token');

        // Advance 11s: past the 10s negative TTL but well within the 5min positive TTL.
        vi.advanceTimersByTime(11 * 1000);

        await invalidCache.validate('bad-token'); // negative entry expired → re-call
        await validCache.validate('good-token'); // positive entry still warm → no re-call

        expect(invalidFn).toHaveBeenCalledTimes(2);
        expect(validFn).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it('does NOT cache foundry_unreachable (recovery is never pinned)', async () => {
      const fn = vi
        .fn<(t: string) => Promise<ValidateTokenResult>>()
        .mockResolvedValueOnce({ valid: false, reason: 'foundry_unreachable' })
        .mockResolvedValueOnce({ valid: false, reason: 'foundry_unreachable' })
        .mockResolvedValue(VALID_RESULT);
      const cache = new TokenCache(fn);

      // Two unreachable calls must BOTH hit Foundry (no caching of the transient error).
      const r1 = await cache.validate('tok');
      const r2 = await cache.validate('tok');
      expect(r1.reason).toBe('foundry_unreachable');
      expect(r2.reason).toBe('foundry_unreachable');
      expect(fn).toHaveBeenCalledTimes(2);
      // No entry was cached for the unreachable verdicts.
      expect(cache.size).toBe(0);

      // Once Foundry recovers, the very next call sees the valid result immediately.
      const r3 = await cache.validate('tok');
      expect(r3.valid).toBe(true);
      expect(fn).toHaveBeenCalledTimes(3);
    });
  });

  describe('size', () => {
    it('tracks number of cached entries', async () => {
      const fn = vi.fn().mockResolvedValue(VALID_RESULT);
      const cache = new TokenCache(fn);

      expect(cache.size).toBe(0);

      await cache.validate('t1');
      await cache.validate('t2');
      expect(cache.size).toBe(2);
    });
  });

  describe('multiple tokens independently cached', () => {
    it('validates each token independently', async () => {
      const fn = vi.fn().mockImplementation(async (t: string): Promise<ValidateTokenResult> => {
        if (t === 'valid-token') return VALID_RESULT;
        return INVALID_RESULT;
      });
      const cache = new TokenCache(fn);

      const r1 = await cache.validate('valid-token');
      const r2 = await cache.validate('invalid-token');

      expect(r1.valid).toBe(true);
      expect(r2.valid).toBe(false);
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe('metricsHooks (Plan 03-03 observability)', () => {
    it('fires onMiss on first validate (cache cold)', async () => {
      const fn = vi.fn().mockResolvedValue(VALID_RESULT);
      const onHit = vi.fn();
      const onMiss = vi.fn();
      const cache = new TokenCache(fn, { onHit, onMiss });

      await cache.validate('token-cold');

      expect(onMiss).toHaveBeenCalledOnce();
      expect(onHit).not.toHaveBeenCalled();
    });

    it('fires onHit on second validate within TTL (cache warm)', async () => {
      const fn = vi.fn().mockResolvedValue(VALID_RESULT);
      const onHit = vi.fn();
      const onMiss = vi.fn();
      const cache = new TokenCache(fn, { onHit, onMiss });

      await cache.validate('token-warm'); // miss
      await cache.validate('token-warm'); // hit

      expect(onMiss).toHaveBeenCalledOnce();
      expect(onHit).toHaveBeenCalledOnce();
    });

    it('does not throw when metricsHooks is omitted (default no-op)', async () => {
      const fn = vi.fn().mockResolvedValue(VALID_RESULT);
      const cache = new TokenCache(fn); // no metricsHooks

      await expect(cache.validate('token-nohooks')).resolves.toEqual(VALID_RESULT);
    });
  });
});
