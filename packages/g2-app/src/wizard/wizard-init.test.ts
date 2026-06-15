/**
 * Unit tests for wizard.ts — initWizard(), checkRequiredKeys(), step machine.
 *
 * These tests exercise wizard.ts by mounting DOM fixtures and calling initWizard().
 * Step components are allowed to render in happy-dom.
 * Fetch is mocked to skip bridge i18n loading.
 * Hub is mocked for tier3-storage calls.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { detectLocale } from './i18n.js';
import { defaultWizardCatalog } from './i18n-catalog.js';

/** Bundled wizard strings for the test locale — step titles render translated now, not raw keys. */
const WIZ = defaultWizardCatalog(detectLocale());

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createHubMock() {
  const store = new Map<string, string>();
  return {
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
    store,
  };
}

/**
 * Build the minimal DOM structure expected by initWizard().
 * Mirrors the structure in wizard.html.
 */
function buildWizardDOM(): HTMLElement {
  const root = document.createElement('div');
  root.id = 'wizard-root';

  const nav = document.createElement('nav');
  nav.setAttribute('aria-label', 'Setup progress');
  const ol = document.createElement('ol');
  for (let i = 1; i <= 3; i++) {
    const li = document.createElement('li');
    const dot = document.createElement('span');
    dot.className = 'evf-step-dot';
    li.appendChild(dot);
    ol.appendChild(li);
  }
  nav.appendChild(ol);

  const title = document.createElement('h1');
  title.id = 'evf-step-title';
  title.setAttribute('tabindex', '-1');

  const content = document.createElement('main');
  content.id = 'step-content';

  root.appendChild(nav);
  root.appendChild(title);
  root.appendChild(content);
  document.body.appendChild(root);

  return root;
}

describe('wizard.ts — checkRequiredKeys', () => {
  it('returns empty array when all keys present', async () => {
    const { checkRequiredKeys, ALL_I18N_KEYS } = await import('./wizard.js');
    const catalog: Record<string, string> = {};
    for (const key of ALL_I18N_KEYS) {
      catalog[key] = key;
    }
    expect(checkRequiredKeys(catalog)).toEqual([]);
  });

  it('returns missing keys when catalog is empty', async () => {
    const { checkRequiredKeys, ALL_I18N_KEYS } = await import('./wizard.js');
    const missing = checkRequiredKeys({});
    expect(missing).toHaveLength(ALL_I18N_KEYS.length);
  });

  it('returns only the missing keys', async () => {
    const { checkRequiredKeys } = await import('./wizard.js');
    const catalog = { 'evf.wizard.step1.title': 'Title' };
    const missing = checkRequiredKeys(catalog);
    expect(missing).not.toContain('evf.wizard.step1.title');
    expect(missing.length).toBeGreaterThan(0);
  });
});

describe('wizard.ts — ALL_I18N_KEYS', () => {
  it('contains exactly 43 keys', async () => {
    const { ALL_I18N_KEYS } = await import('./wizard.js');
    expect(ALL_I18N_KEYS).toHaveLength(43);
  });

  it('includes all required step keys', async () => {
    const { ALL_I18N_KEYS } = await import('./wizard.js');
    expect(ALL_I18N_KEYS).toContain('evf.wizard.step1.title');
    expect(ALL_I18N_KEYS).toContain('evf.wizard.step2.title');
    expect(ALL_I18N_KEYS).toContain('evf.wizard.step3.title');
    expect(ALL_I18N_KEYS).toContain('evf.wizard.complete.heading');
  });
});

describe('wizard.ts — initWizard()', () => {
  let root: HTMLElement;

  beforeEach(() => {
    vi.resetModules();
    const hubMock = createHubMock();
    (globalThis as unknown as Record<string, unknown>).hub = hubMock.hub;

    // Mock fetch: return empty i18n catalog
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({}),
      })),
    );

    root = buildWizardDOM();
  });

  afterEach(() => {
    document.body.removeChild(root);
    // biome-ignore lint/suspicious/noExplicitAny: test cleanup
    delete (globalThis as any).hub;
    vi.restoreAllMocks();
  });

  it('aborts gracefully when #step-content is missing', async () => {
    // Remove #step-content
    const content = document.getElementById('step-content');
    content?.remove();

    const { initWizard } = await import('./wizard.js');

    // Should not throw
    await expect(initWizard()).resolves.toBeUndefined();
  });

  it('renders Step 1 on first load', async () => {
    const { initWizard } = await import('./wizard.js');
    await initWizard();

    const stepContent = document.getElementById('step-content');
    expect(stepContent?.innerHTML).not.toBe('');
    // Step 1 renders a URL input
    expect(stepContent?.querySelector('#evf-bridge-url')).toBeTruthy();
  });

  it('updates step title when rendered', async () => {
    const { initWizard } = await import('./wizard.js');
    await initWizard();

    const stepTitle = document.getElementById('evf-step-title');
    // defaultI18n returns key when bridge URL is empty (no i18n loaded)
    expect(stepTitle?.textContent).toBe(WIZ['evf.wizard.step1.title']);
  });

  it('step indicator marks step 1 as current', async () => {
    const { initWizard } = await import('./wizard.js');
    await initWizard();

    const stepItems = document.querySelectorAll('nav[aria-label="Setup progress"] ol li');
    expect(stepItems[0]?.getAttribute('aria-current')).toBe('step');
    expect(stepItems[1]?.hasAttribute('aria-current')).toBe(false);
    expect(stepItems[2]?.hasAttribute('aria-current')).toBe(false);
  });

  it('step 1 dot has active class', async () => {
    const { initWizard } = await import('./wizard.js');
    await initWizard();

    const dots = document.querySelectorAll('.evf-step-dot');
    expect(dots[0]?.classList.contains('evf-step-dot--active')).toBe(true);
    expect(dots[1]?.classList.contains('evf-step-dot--future')).toBe(true);
    expect(dots[2]?.classList.contains('evf-step-dot--future')).toBe(true);
  });

  it('step indicator has aria-label set for each item', async () => {
    const { initWizard } = await import('./wizard.js');
    await initWizard();

    const stepItems = document.querySelectorAll('nav[aria-label="Setup progress"] ol li');
    for (const item of Array.from(stepItems)) {
      expect(item.hasAttribute('aria-label')).toBe(true);
    }
  });

  it('handles missing step indicator nav gracefully (no throw)', async () => {
    // Remove nav
    document.querySelector('nav[aria-label="Setup progress"]')?.remove();

    const { initWizard } = await import('./wizard.js');
    await expect(initWizard()).resolves.toBeUndefined();
  });

  it('handles missing step title gracefully (no throw)', async () => {
    document.getElementById('evf-step-title')?.remove();

    const { initWizard } = await import('./wizard.js');
    await expect(initWizard()).resolves.toBeUndefined();
  });

  it('initAutoConnect failure is swallowed (hub.eventBus unavailable)', async () => {
    // Remove hub to simulate unavailability
    // biome-ignore lint/suspicious/noExplicitAny: test cleanup
    delete (globalThis as any).hub;

    const { initWizard } = await import('./wizard.js');
    // Should not throw — auto-connect failure is caught
    await expect(initWizard()).resolves.toBeUndefined();
  });
});

describe('wizard.ts — state machine transitions via DOM', () => {
  let root: HTMLElement;

  beforeEach(() => {
    vi.resetModules();
    const hubMock = createHubMock();
    (globalThis as unknown as Record<string, unknown>).hub = hubMock.hub;

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        // Return characters for /v1/characters, empty i18n otherwise
        if (typeof url === 'string' && url.includes('/v1/characters')) {
          return {
            ok: true,
            status: 200,
            json: async () => [{ id: 'char-1', name: 'Legolas', class: 'Ranger' }],
          };
        }
        if (typeof url === 'string' && url.includes('/v1/health')) {
          return { ok: true, status: 200, json: async () => ({}) };
        }
        return { ok: true, status: 200, json: async () => ({}) };
      }),
    );

    root = buildWizardDOM();
  });

  afterEach(() => {
    document.body.removeChild(root);
    // biome-ignore lint/suspicious/noExplicitAny: test cleanup
    delete (globalThis as any).hub;
    vi.restoreAllMocks();
  });

  it('advancing from Step 1 renders Step 2', async () => {
    const { initWizard } = await import('./wizard.js');
    await initWizard();

    // Fill in bridge URL and click Continue
    const urlInput = document.querySelector<HTMLInputElement>('#evf-bridge-url');
    const continueBtn = document.querySelector<HTMLButtonElement>('.evf-btn-primary');

    if (urlInput) {
      urlInput.value = 'https://bridge.local:8910';
      urlInput.dispatchEvent(new Event('input'));
    }
    continueBtn?.click();

    // Step 2 should now be rendered
    await vi.waitFor(
      () => {
        if (!document.getElementById('evf-token-input')) throw new Error('step2 not rendered');
      },
      { timeout: 2000 },
    );

    expect(document.getElementById('evf-token-input')).toBeTruthy();
    expect(document.getElementById('evf-step-title')?.textContent).toBe(
      WIZ['evf.wizard.step2.title'],
    );
  });

  it('step indicator updates when advancing to Step 2', async () => {
    const { initWizard } = await import('./wizard.js');
    await initWizard();

    const urlInput = document.querySelector<HTMLInputElement>('#evf-bridge-url');
    const continueBtn = document.querySelector<HTMLButtonElement>('.evf-btn-primary');

    if (urlInput) {
      urlInput.value = 'https://bridge.local:8910';
      urlInput.dispatchEvent(new Event('input'));
    }
    continueBtn?.click();

    await vi.waitFor(
      () => {
        if (!document.getElementById('evf-token-input')) throw new Error('step2 not rendered');
      },
      { timeout: 2000 },
    );

    const stepItems = document.querySelectorAll('nav[aria-label="Setup progress"] ol li');
    expect(stepItems[1]?.getAttribute('aria-current')).toBe('step');
    // Step 1 should now be 'past'
    expect(
      stepItems[0]?.querySelector('.evf-step-dot')?.classList.contains('evf-step-dot--past'),
    ).toBe(true);
  });

  it('advancing from Step 2 renders Step 3', async () => {
    const { initWizard } = await import('./wizard.js');
    await initWizard();

    // Step 1 → 2
    const urlInput = document.querySelector<HTMLInputElement>('#evf-bridge-url');
    const continueBtn = document.querySelector<HTMLButtonElement>('.evf-btn-primary');
    if (urlInput) {
      urlInput.value = 'https://bridge.local:8910';
      urlInput.dispatchEvent(new Event('input'));
    }
    continueBtn?.click();

    await vi.waitFor(
      () => {
        if (!document.getElementById('evf-token-input')) throw new Error('step2 not rendered');
      },
      { timeout: 2000 },
    );

    // Step 2 → 3: enter token and click Connect
    const tokenInput = document.querySelector<HTMLInputElement>('#evf-token-input');
    if (tokenInput) {
      tokenInput.value = 'my-valid-bearer-token-1234567890123456';
      tokenInput.dispatchEvent(new Event('input'));
    }

    const connectBtn = document.querySelector<HTMLButtonElement>('#evf-connect-btn');
    connectBtn?.click();

    await vi.waitFor(
      () => {
        const stepTitle = document.getElementById('evf-step-title');
        if (stepTitle?.textContent !== WIZ['evf.wizard.step3.title'])
          throw new Error('not on step 3 yet');
      },
      { timeout: 3000 },
    );

    expect(document.getElementById('evf-step-title')?.textContent).toBe(
      WIZ['evf.wizard.step3.title'],
    );
  });
});

describe('wizard.ts — REPAIR / COMPLETION step titles', () => {
  it('clearI18nCache is exported and callable', async () => {
    const { clearI18nCache } = await import('./wizard.js');
    expect(typeof clearI18nCache).toBe('function');
    expect(() => clearI18nCache()).not.toThrow();
  });
});

describe('wizard.ts — COMPLETION step rendering (step indicator + title)', () => {
  let root: HTMLElement;

  beforeEach(() => {
    vi.resetModules();
    const hubMock = createHubMock();
    (globalThis as unknown as Record<string, unknown>).hub = hubMock.hub;

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (typeof url === 'string' && url.includes('/v1/characters')) {
          return {
            ok: true,
            status: 200,
            json: async () => [{ id: 'char-1', name: 'Legolas', class: 'Ranger' }],
          };
        }
        if (typeof url === 'string' && url.includes('/v1/health')) {
          return { ok: true, status: 200, json: async () => ({}) };
        }
        return { ok: true, status: 200, json: async () => ({}) };
      }),
    );

    root = buildWizardDOM();
  });

  afterEach(() => {
    document.body.removeChild(root);
    // biome-ignore lint/suspicious/noExplicitAny: test cleanup
    delete (globalThis as any).hub;
    vi.restoreAllMocks();
  });

  it('renders COMPLETION screen after completing step 3', async () => {
    const { initWizard } = await import('./wizard.js');
    await initWizard();

    // Step 1 → 2
    const urlInput = document.querySelector<HTMLInputElement>('#evf-bridge-url');
    if (urlInput) {
      urlInput.value = 'https://bridge.local:8910';
      urlInput.dispatchEvent(new Event('input'));
    }
    document.querySelector<HTMLButtonElement>('.evf-btn-primary')?.click();

    await vi.waitFor(
      () => {
        if (!document.getElementById('evf-token-input')) throw new Error('no step2');
      },
      { timeout: 2000 },
    );

    // Step 2 → 3
    const tokenInput = document.querySelector<HTMLInputElement>('#evf-token-input');
    if (tokenInput) {
      tokenInput.value = 'my-valid-bearer-token-1234567890123456';
      tokenInput.dispatchEvent(new Event('input'));
    }
    document.querySelector<HTMLButtonElement>('#evf-connect-btn')?.click();

    await vi.waitFor(
      () => {
        const t = document.getElementById('evf-step-title');
        if (t?.textContent !== WIZ['evf.wizard.step3.title']) throw new Error('no step3');
      },
      { timeout: 3000 },
    );

    // Step 3: select character and confirm
    await vi.waitFor(
      () => {
        if (!document.querySelector('.evf-char-card')) throw new Error('no char cards yet');
      },
      { timeout: 3000 },
    );

    const charCard = document.querySelector<HTMLButtonElement>('.evf-char-card');
    charCard?.click();

    const ctaRow = document.querySelector('.wizard-cta');
    const confirmBtn = ctaRow?.querySelector<HTMLButtonElement>('.evf-btn-primary');
    confirmBtn?.click();

    // Wait for COMPLETION screen
    await vi.waitFor(
      () => {
        const t = document.getElementById('evf-step-title');
        if (t?.textContent !== WIZ['evf.wizard.complete.heading'])
          throw new Error('not completion yet');
      },
      { timeout: 3000 },
    );

    expect(document.getElementById('evf-step-title')?.textContent).toBe(
      WIZ['evf.wizard.complete.heading'],
    );
    // For COMPLETION, _updateStepIndicator returns early (no step number) — leaving prior state.
    // The step title IS updated to the completion heading (verified above).
    // Completion screen element should be present
    expect(document.querySelector('.evf-completion')).toBeTruthy();
  });
});

describe('wizard.ts — i18n loading when bridgeUrl is set in initial state', () => {
  let root: HTMLElement;

  beforeEach(() => {
    vi.resetModules();
    const hubMock = createHubMock();
    (globalThis as unknown as Record<string, unknown>).hub = hubMock.hub;
    root = buildWizardDOM();
  });

  afterEach(() => {
    document.body.removeChild(root);
    // biome-ignore lint/suspicious/noExplicitAny: test cleanup
    delete (globalThis as any).hub;
    vi.restoreAllMocks();
  });

  it('loads i18n when store has bridgeUrl (covers the if(bridgeUrl) branch)', async () => {
    // Mock createInitialState to return a state with bridgeUrl
    // Instead, mock tier3-storage to return a profile with bridgeUrl,
    // and override createInitialState by mocking state.ts module.

    // Simpler approach: stub the state.js module to return initial state with bridgeUrl
    vi.doMock('./state.js', async (importOriginal) => {
      const original = await importOriginal<typeof import('./state.js')>();
      return {
        ...original,
        createInitialState: () => ({
          ...original.createInitialState(),
          bridgeUrl: 'https://bridge.local:8910',
        }),
      };
    });

    const i18nCatalog = {
      'evf.wizard.step1.title': 'Bridge Profile',
      'evf.btn.continue': 'Continue',
    };

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => i18nCatalog,
      })),
    );

    const { initWizard } = await import('./wizard.js');
    await initWizard();

    // If i18n was loaded, the step title should use the catalog value
    const stepTitle = document.getElementById('evf-step-title');
    expect(stepTitle?.textContent).toBe('Bridge Profile');
  });

  it('logs warning when i18n keys are missing (covers the if(missing.length > 0) branch)', async () => {
    // doMock state.js to return bridgeUrl
    vi.doMock('./state.js', async (importOriginal) => {
      const original = await importOriginal<typeof import('./state.js')>();
      return {
        ...original,
        createInitialState: () => ({
          ...original.createInitialState(),
          bridgeUrl: 'https://bridge.local:8910',
        }),
      };
    });

    // Return a catalog with only 1 key (missing all others → triggers missing key warning)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ 'evf.wizard.step1.title': 'Title' }),
      })),
    );

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { initWizard } = await import('./wizard.js');
    await initWizard();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('not served by bridge'),
      expect.anything(),
    );
  });
});
