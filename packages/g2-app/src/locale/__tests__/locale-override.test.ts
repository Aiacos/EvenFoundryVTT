/**
 * locale-override.ts unit tests (LO-* markers — Phase 5 Plan 06).
 *
 * Tests `loadLocaleOverride` and `persistLocaleOverride` against a mock
 * `EvenAppBridge`. All tests are pure unit-level — no Even Hub runtime needed.
 *
 * @see packages/g2-app/src/locale/locale-override.ts
 * @see .planning/phases/05-panel-plugin-system-read-only-panels/05-06-PLAN.md Task 1
 */
import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';
import { describe, expect, it, vi } from 'vitest';
import {
  LOCALE_OVERRIDE_KEY,
  loadLocaleOverride,
  persistLocaleOverride,
} from '../locale-override.js';

// ─── Mock factory ─────────────────────────────────────────────────────────────

function makeBridge(overrides: {
  getLocalStorage?: (key: string) => Promise<string>;
  setLocalStorage?: (key: string, value: string) => Promise<boolean>;
}): EvenAppBridge {
  return {
    getLocalStorage: overrides.getLocalStorage ?? vi.fn().mockResolvedValue(''),
    setLocalStorage: overrides.setLocalStorage ?? vi.fn().mockResolvedValue(true),
  } as unknown as EvenAppBridge;
}

// ─── loadLocaleOverride ────────────────────────────────────────────────────────

describe('loadLocaleOverride', () => {
  it('LO-LOAD-AUTO: empty string (missing key) → returns auto', async () => {
    const bridge = makeBridge({ getLocalStorage: vi.fn().mockResolvedValue('') });
    const result = await loadLocaleOverride(bridge);
    expect(result).toBe('auto');
  });

  it('LO-LOAD-IT: stored "it" → returns "it"', async () => {
    const bridge = makeBridge({ getLocalStorage: vi.fn().mockResolvedValue('it') });
    const result = await loadLocaleOverride(bridge);
    expect(result).toBe('it');
  });

  it('LO-LOAD-EN: stored "en" → returns "en"', async () => {
    const bridge = makeBridge({ getLocalStorage: vi.fn().mockResolvedValue('en') });
    const result = await loadLocaleOverride(bridge);
    expect(result).toBe('en');
  });

  it('LO-LOAD-DE: stored "de" → returns "de"', async () => {
    const bridge = makeBridge({ getLocalStorage: vi.fn().mockResolvedValue('de') });
    const result = await loadLocaleOverride(bridge);
    expect(result).toBe('de');
  });

  it('LO-LOAD-ES: stored "es" (best-effort) → returns "es"', async () => {
    const bridge = makeBridge({ getLocalStorage: vi.fn().mockResolvedValue('es') });
    const result = await loadLocaleOverride(bridge);
    expect(result).toBe('es');
  });

  it('LO-LOAD-FR: stored "fr" (best-effort) → returns "fr"', async () => {
    const bridge = makeBridge({ getLocalStorage: vi.fn().mockResolvedValue('fr') });
    const result = await loadLocaleOverride(bridge);
    expect(result).toBe('fr');
  });

  it('LO-LOAD-PT-BR: stored "pt-br" (best-effort) → returns "pt-br"', async () => {
    const bridge = makeBridge({ getLocalStorage: vi.fn().mockResolvedValue('pt-br') });
    const result = await loadLocaleOverride(bridge);
    expect(result).toBe('pt-br');
  });

  it('LO-LOAD-STORED-AUTO: stored "auto" → returns "auto"', async () => {
    const bridge = makeBridge({ getLocalStorage: vi.fn().mockResolvedValue('auto') });
    const result = await loadLocaleOverride(bridge);
    expect(result).toBe('auto');
  });

  it('LO-LOAD-INVALID: stored "xx" (unknown code) → returns "auto" (defensive normalise)', async () => {
    const bridge = makeBridge({ getLocalStorage: vi.fn().mockResolvedValue('xx') });
    const result = await loadLocaleOverride(bridge);
    expect(result).toBe('auto');
  });

  it('LO-LOAD-INVALID-JP: stored "jp" (unknown code) → returns "auto"', async () => {
    const bridge = makeBridge({ getLocalStorage: vi.fn().mockResolvedValue('jp') });
    const result = await loadLocaleOverride(bridge);
    expect(result).toBe('auto');
  });

  it('LO-LOAD-THROW: getLocalStorage throws → returns "auto" without throwing', async () => {
    const bridge = makeBridge({
      getLocalStorage: vi.fn().mockRejectedValue(new Error('bridge unavailable')),
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const result = await loadLocaleOverride(bridge);
      expect(result).toBe('auto');
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('locale-override'),
        expect.any(Error),
      );
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('LO-LOAD-KEY: getLocalStorage is called with the correct key', async () => {
    const getLocalStorage = vi.fn().mockResolvedValue('it');
    const bridge = makeBridge({ getLocalStorage });
    await loadLocaleOverride(bridge);
    expect(getLocalStorage).toHaveBeenCalledWith(LOCALE_OVERRIDE_KEY);
    expect(LOCALE_OVERRIDE_KEY).toBe('view.locale.override');
  });
});

// ─── persistLocaleOverride ────────────────────────────────────────────────────

describe('persistLocaleOverride', () => {
  it('LO-PERSIST: setLocalStorage called with correct key + value', async () => {
    const setLocalStorage = vi.fn().mockResolvedValue(true);
    const bridge = makeBridge({ setLocalStorage });
    await persistLocaleOverride(bridge, 'en');
    expect(setLocalStorage).toHaveBeenCalledWith(LOCALE_OVERRIDE_KEY, 'en');
  });

  it('LO-PERSIST-AUTO: persisting "auto" writes "auto" to kv store', async () => {
    const setLocalStorage = vi.fn().mockResolvedValue(true);
    const bridge = makeBridge({ setLocalStorage });
    await persistLocaleOverride(bridge, 'auto');
    expect(setLocalStorage).toHaveBeenCalledWith(LOCALE_OVERRIDE_KEY, 'auto');
  });

  it('LO-PERSIST-ES: persisting "es" (best-effort) resolves without error', async () => {
    const setLocalStorage = vi.fn().mockResolvedValue(true);
    const bridge = makeBridge({ setLocalStorage });
    await expect(persistLocaleOverride(bridge, 'es')).resolves.toBeUndefined();
    expect(setLocalStorage).toHaveBeenCalledWith(LOCALE_OVERRIDE_KEY, 'es');
  });

  it('LO-PERSIST-THROW: setLocalStorage throws → resolves without exception (cosmetic)', async () => {
    const bridge = makeBridge({
      setLocalStorage: vi.fn().mockRejectedValue(new Error('storage full')),
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await expect(persistLocaleOverride(bridge, 'de')).resolves.toBeUndefined();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('LO-PERSIST-FALSE: setLocalStorage returns false → still resolves without exception', async () => {
    const bridge = makeBridge({
      setLocalStorage: vi.fn().mockResolvedValue(false),
    });
    await expect(persistLocaleOverride(bridge, 'fr')).resolves.toBeUndefined();
  });
});
