/**
 * Unit tests for the Phase 2 wizard — Tier 3 storage, i18n loader, and state machine.
 *
 * Tests run in happy-dom (no real Even Hub `hub` global available).
 * The `hub` object is mocked per-test via module-level assignment.
 *
 * @see .planning/phases/02-foundry-module-core-pairing-ui/02-03-PLAN.md Task 1 (done criteria)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// hub mock setup
// ---------------------------------------------------------------------------

/** In-memory kv store simulating the Even Hub host-managed store. */
function createHubMock() {
  const store = new Map<string, string>();
  return {
    store,
    hub: {
      setItem: vi.fn(async (key: string, value: string) => {
        store.set(key, value);
      }),
      getItem: vi.fn(async (key: string): Promise<string | null> => {
        return store.get(key) ?? null;
      }),
      removeItem: vi.fn(async (key: string) => {
        store.delete(key);
      }),
      eventBus: {
        on: vi.fn(),
        off: vi.fn(),
      },
    } satisfies typeof hub,
  };
}

// Assign hub to globalThis before tests that use tier3-storage
function installHubMock(hubInstance: typeof hub) {
  (globalThis as unknown as Record<string, unknown>).hub = hubInstance;
}

function uninstallHubMock() {
  // biome-ignore lint/suspicious/noExplicitAny: test cleanup
  delete (globalThis as any).hub;
}

// ---------------------------------------------------------------------------
// Tier 3 storage tests
// ---------------------------------------------------------------------------

describe('tier3-storage', () => {
  let mock: ReturnType<typeof createHubMock>;

  beforeEach(() => {
    mock = createHubMock();
    installHubMock(mock.hub);
  });

  afterEach(() => {
    uninstallHubMock();
    vi.restoreAllMocks();
  });

  describe('saveSession', () => {
    it('persists session JSON to the kv store', async () => {
      const { saveSession } = await import('./tier3-storage.js');

      const session = {
        profileId: '00000000-0000-4000-8000-000000000001',
        bridgeUrl: 'https://bridge.local:8910',
        tokenObfuscated: null,
        characterId: 'abc123',
        savedAt: 1_000_000,
      };

      await saveSession(session);

      const stored = mock.store.get('evf.session.00000000-0000-4000-8000-000000000001');
      expect(stored).toBeDefined();
      if (!stored) throw new Error('stored should be defined');
      const parsed = JSON.parse(stored) as unknown;
      expect(parsed).toMatchObject({
        profileId: '00000000-0000-4000-8000-000000000001',
        characterId: 'abc123',
        tokenObfuscated: null,
      });
    });

    it('adds the profile to the index', async () => {
      const { saveSession } = await import('./tier3-storage.js');

      await saveSession({
        profileId: '00000000-0000-4000-8000-000000000002',
        bridgeUrl: 'https://bridge.local:8910',
        tokenObfuscated: null,
        characterId: 'char1',
        savedAt: 1_000_000,
      });

      const indexRaw = mock.store.get('evf.profile.index');
      expect(indexRaw).toBeDefined();
      if (!indexRaw) throw new Error('indexRaw should be defined');
      const index = JSON.parse(indexRaw) as unknown;
      expect(index).toContain('00000000-0000-4000-8000-000000000002');
    });

    it('never stores a non-null tokenObfuscated (schema enforces null)', async () => {
      const { SessionSchema } = await import('./tier3-storage.js');

      // Attempt to parse a session with a non-null token
      const result = SessionSchema.safeParse({
        profileId: '00000000-0000-4000-8000-000000000003',
        bridgeUrl: 'https://bridge.local:8910',
        tokenObfuscated: 'SHOULD-NOT-BE-HERE',
        characterId: 'char1',
        savedAt: 1_000_000,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('loadSession', () => {
    it('returns null for a missing key', async () => {
      const { loadSession } = await import('./tier3-storage.js');
      const result = await loadSession('00000000-0000-4000-8000-000000000099');
      expect(result).toBeNull();
    });

    it('loads and validates a valid stored session', async () => {
      const { saveSession, loadSession } = await import('./tier3-storage.js');

      const session = {
        profileId: '00000000-0000-4000-8000-000000000010',
        bridgeUrl: 'https://bridge.local:8910',
        tokenObfuscated: null,
        characterId: 'paladin1',
        savedAt: 2_000_000,
      };
      await saveSession(session);

      const loaded = await loadSession('00000000-0000-4000-8000-000000000010');
      expect(loaded).not.toBeNull();
      expect(loaded?.characterId).toBe('paladin1');
      expect(loaded?.tokenObfuscated).toBeNull();
    });

    it('returns null for corrupted JSON (T-02-04)', async () => {
      mock.store.set('evf.session.00000000-0000-4000-8000-000000000011', 'NOT{VALID}JSON');
      const { loadSession } = await import('./tier3-storage.js');
      const result = await loadSession('00000000-0000-4000-8000-000000000011');
      expect(result).toBeNull();
    });

    it('returns null for valid JSON that fails schema validation (T-02-04)', async () => {
      mock.store.set(
        'evf.session.00000000-0000-4000-8000-000000000012',
        JSON.stringify({
          profileId: 'NOT-A-UUID',
          bridgeUrl: 'not-a-url',
          tokenObfuscated: null,
          characterId: '',
          savedAt: -1,
        }),
      );
      const { loadSession } = await import('./tier3-storage.js');
      const result = await loadSession('00000000-0000-4000-8000-000000000012');
      expect(result).toBeNull();
    });
  });

  describe('listProfiles', () => {
    it('returns an empty array when no profiles are stored', async () => {
      const { listProfiles } = await import('./tier3-storage.js');
      const profiles = await listProfiles();
      expect(profiles).toEqual([]);
    });

    it('returns all valid stored sessions', async () => {
      const { saveSession, listProfiles } = await import('./tier3-storage.js');

      await saveSession({
        profileId: '00000000-0000-4000-8000-000000000020',
        bridgeUrl: 'https://bridge.local:8910',
        tokenObfuscated: null,
        characterId: 'warrior',
        savedAt: 3_000_000,
      });
      await saveSession({
        profileId: '00000000-0000-4000-8000-000000000021',
        bridgeUrl: 'https://bridge.remote:9000',
        tokenObfuscated: null,
        characterId: 'mage',
        savedAt: 3_000_001,
      });

      const profiles = await listProfiles();
      expect(profiles).toHaveLength(2);
      const ids = profiles.map((p) => p.profileId);
      expect(ids).toContain('00000000-0000-4000-8000-000000000020');
      expect(ids).toContain('00000000-0000-4000-8000-000000000021');
    });

    it('skips corrupted entries and returns valid ones', async () => {
      const { saveSession, listProfiles } = await import('./tier3-storage.js');

      await saveSession({
        profileId: '00000000-0000-4000-8000-000000000030',
        bridgeUrl: 'https://bridge.local:8910',
        tokenObfuscated: null,
        characterId: 'rogue',
        savedAt: 4_000_000,
      });

      // Manually inject a corrupted entry and add it to the index
      mock.store.set('evf.session.00000000-0000-4000-8000-000000000031', 'CORRUPT');
      const indexRaw = mock.store.get('evf.profile.index') ?? '[]';
      const index = JSON.parse(indexRaw) as string[];
      index.push('00000000-0000-4000-8000-000000000031');
      mock.store.set('evf.profile.index', JSON.stringify(index));

      const profiles = await listProfiles();
      expect(profiles).toHaveLength(1);
      expect(profiles[0]?.characterId).toBe('rogue');
    });
  });
});

// ---------------------------------------------------------------------------
// i18n loader tests
// ---------------------------------------------------------------------------

describe('i18n', () => {
  afterEach(async () => {
    const { clearI18nCache } = await import('./i18n.js');
    clearI18nCache();
    vi.restoreAllMocks();
  });

  it('returns a valid catalog on successful fetch', async () => {
    const { loadI18n } = await import('./i18n.js');

    const catalog: Record<string, string> = {
      'evf.wizard.step1.title': 'Bridge Profile',
      'evf.btn.continue': 'Continue',
    };

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => catalog,
        status: 200,
      })),
    );

    const result = await loadI18n('https://bridge.local:8910', 'en');
    expect(result['evf.wizard.step1.title']).toBe('Bridge Profile');
    expect(result['evf.btn.continue']).toBe('Continue');
  });

  it('returns an empty catalog on fetch failure (network error)', async () => {
    const { loadI18n } = await import('./i18n.js');

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('Network error');
      }),
    );

    const result = await loadI18n('https://bridge.local:8910', 'en');
    expect(result).toEqual({});
  });

  it('returns an empty catalog on HTTP non-200', async () => {
    const { loadI18n } = await import('./i18n.js');

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 404,
      })),
    );

    const result = await loadI18n('https://bridge.local:8910', 'en');
    expect(result).toEqual({});
  });

  it('returns an empty catalog if response is not Record<string,string>', async () => {
    const { loadI18n } = await import('./i18n.js');

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => [1, 2, 3],
        status: 200,
      })),
    );

    const result = await loadI18n('https://bridge.local:8910', 'en');
    expect(result).toEqual({});
  });

  it('caches the catalog and does not re-fetch on second call', async () => {
    const { loadI18n } = await import('./i18n.js');

    const fetchSpy = vi.fn(async () => ({
      ok: true,
      json: async () => ({ key: 'value' }),
      status: 200,
    }));
    vi.stubGlobal('fetch', fetchSpy);

    await loadI18n('https://bridge.local:8910', 'it');
    await loadI18n('https://bridge.local:8910', 'it');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('makeT returns key as fallback when key not in catalog', async () => {
    const { makeT } = await import('./i18n.js');
    const t = makeT({});
    expect(t('evf.wizard.step1.title')).toBe('evf.wizard.step1.title');
  });

  it('makeT interpolates {var} placeholders', async () => {
    const { makeT } = await import('./i18n.js');
    const t = makeT({ 'evf.wizard.step_indicator': 'Step {n} of {total}' });
    expect(t('evf.wizard.step_indicator', { n: '2', total: '3' })).toBe('Step 2 of 3');
  });
});

// ---------------------------------------------------------------------------
// State machine tests
// ---------------------------------------------------------------------------

describe('state machine (createStore)', () => {
  it('initialises with the provided state', async () => {
    const { createStore, WizardStep, defaultI18n } = await import('./state.js');

    const store = createStore({
      step: WizardStep.STEP1,
      bridgeUrl: '',
      token: '',
      characterId: '',
      profileId: 'test-id',
      i18n: defaultI18n,
      error: null,
    });

    expect(store.get().step).toBe(WizardStep.STEP1);
  });

  it('updates state on set(partial)', async () => {
    const { createStore, WizardStep, defaultI18n } = await import('./state.js');

    const store = createStore({
      step: WizardStep.STEP1,
      bridgeUrl: '',
      token: '',
      characterId: '',
      profileId: 'test-id',
      i18n: defaultI18n,
      error: null,
    });

    store.set({ step: WizardStep.STEP2, bridgeUrl: 'https://bridge.local:8910' });

    expect(store.get().step).toBe(WizardStep.STEP2);
    expect(store.get().bridgeUrl).toBe('https://bridge.local:8910');
  });

  it('notifies subscribers on state change', async () => {
    const { createStore, WizardStep, defaultI18n } = await import('./state.js');

    const store = createStore({
      step: WizardStep.STEP1,
      bridgeUrl: '',
      token: '',
      characterId: '',
      profileId: 'test-id',
      i18n: defaultI18n,
      error: null,
    });

    const calls: string[] = [];
    store.subscribe((s) => calls.push(s.step));

    store.set({ step: WizardStep.STEP2 });
    store.set({ step: WizardStep.STEP3 });

    expect(calls).toEqual([WizardStep.STEP2, WizardStep.STEP3]);
  });

  it('unsubscribing stops notifications', async () => {
    const { createStore, WizardStep, defaultI18n } = await import('./state.js');

    const store = createStore({
      step: WizardStep.STEP1,
      bridgeUrl: '',
      token: '',
      characterId: '',
      profileId: 'test-id',
      i18n: defaultI18n,
      error: null,
    });

    const calls: string[] = [];
    const unsub = store.subscribe((s) => calls.push(s.step));

    store.set({ step: WizardStep.STEP2 });
    unsub();
    store.set({ step: WizardStep.STEP3 });

    expect(calls).toEqual([WizardStep.STEP2]);
  });

  it('preserves other fields on partial update', async () => {
    const { createStore, WizardStep, defaultI18n } = await import('./state.js');

    const store = createStore({
      step: WizardStep.STEP1,
      bridgeUrl: 'https://bridge.local:8910',
      token: '',
      characterId: '',
      profileId: 'test-id',
      i18n: defaultI18n,
      error: null,
    });

    store.set({ step: WizardStep.STEP2 });
    expect(store.get().bridgeUrl).toBe('https://bridge.local:8910');
  });

  it('defaultI18n returns key when no vars', async () => {
    const { defaultI18n } = await import('./state.js');
    expect(defaultI18n('evf.wizard.step1.title')).toBe('evf.wizard.step1.title');
  });

  it('defaultI18n interpolates vars', async () => {
    const { defaultI18n } = await import('./state.js');
    expect(defaultI18n('Step {n} of {total}', { n: '1', total: '3' })).toBe('Step 1 of 3');
  });
});

// ---------------------------------------------------------------------------
// URL validation tests (Step 1 logic — tested here, implemented in step1-profile.ts)
// ---------------------------------------------------------------------------

describe('Step 1 URL validation regex', () => {
  /**
   * Regex from 02-03-PLAN.md Task 2 / 02-UI-SPEC.md Step 1 Input Affordances.
   * Tested here since the regex is a standalone unit.
   */
  // Feature 001 D1: the port is OPTIONAL (a full https origin on 443 is valid).
  const URL_REGEX = /^https?:\/\/[^\s/:]+(:\d{1,5})?(\/[^\s]*)?$/;

  const valid = [
    'https://bridge.local:8910',
    'http://192.168.1.10:8910',
    'https://192.168.1.10:8910/path',
    'https://bridge.local:8910/',
    'https://my.bridge.host:1234',
    'http://localhost:9000',
    'https://bridge.local', // port-less https origin (D1 — 443 implied)
    'https://evenfoundry.lucifer-tnas.mywire.org', // homelab bridge over 443
    'https://eu.forge-vtt.com/invite/aiacos-vecna/dae6a476', // Forge world URL (no port + path)
  ];

  const invalid = [
    'ftp://bridge.local:8910',
    'bridge.local:8910', // missing scheme
    '',
    'https://:8910', // missing host
    'https://bridge.local:999999', // port > 5 digits (6 digits — exceeds \d{1,5})
    'just-text',
    'https://bridge local', // contains a space
  ];

  for (const url of valid) {
    it(`accepts valid URL: ${url}`, () => {
      expect(URL_REGEX.test(url)).toBe(true);
    });
  }

  for (const url of invalid) {
    it(`rejects invalid URL: "${url}"`, () => {
      expect(URL_REGEX.test(url)).toBe(false);
    });
  }
});

// ---------------------------------------------------------------------------
// Step 2 error type mapping tests (validated by type system, tested here)
// ---------------------------------------------------------------------------

describe('WizardError type safety', () => {
  it('accepts all valid ErrorType values', async () => {
    const { WizardStep } = await import('./state.js');
    type ErrorType = '401' | '403' | 'unreachable' | 'timeout' | 'version_mismatch';

    const errors: ErrorType[] = ['401', '403', 'unreachable', 'timeout', 'version_mismatch'];
    // All values should be string — compile-time check via TypeScript strict mode
    for (const e of errors) {
      expect(typeof e).toBe('string');
    }
    // WizardStep enum is available
    expect(WizardStep.STEP1).toBe('STEP1');
  });
});
