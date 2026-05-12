/**
 * Unit tests for Step 3 — Character Selection.
 *
 * Runs in happy-dom environment.
 * `fetch` is mocked via vi.stubGlobal.
 * `hub` global mocked for tier3-storage calls (saveSession on confirm).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStore, defaultI18n, type WizardState, WizardStep } from '../state.js';

// ---------------------------------------------------------------------------
// helpers
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
      eventBus: { on: vi.fn(), off: vi.fn() },
    } satisfies typeof hub,
    store,
  };
}

function makeStore(
  partial: Partial<WizardState> = {},
): ReturnType<typeof createStore<WizardState>> {
  return createStore<WizardState>({
    step: WizardStep.STEP3,
    bridgeUrl: 'https://bridge.local:8910',
    token: 'test-token',
    characterId: '',
    profileId: '00000000-0000-4000-8000-000000000001',
    i18n: defaultI18n,
    error: null,
    ...partial,
  });
}

interface CharacterEntry {
  id: string;
  name: string;
  class?: string;
  level?: number;
}

function makeCharacters(n: number): CharacterEntry[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `char-${i}`,
    name: `Character ${i}`,
    class: 'Fighter',
    level: i + 1,
  }));
}

function makeFetchWithChars(chars: unknown[]) {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => chars,
  }));
}

/** Wait for an element to appear in the container. */
async function waitForElement(
  container: HTMLElement,
  selector: string,
  timeout = 3000,
): Promise<Element> {
  return vi.waitFor(
    () => {
      const el = container.querySelector(selector);
      if (!el) throw new Error(`Element ${selector} not found`);
      return el;
    },
    { timeout },
  );
}

describe('step3-character — render()', () => {
  let container: HTMLElement;
  let hubMock: ReturnType<typeof createHubMock>;

  beforeEach(() => {
    vi.resetModules();
    container = document.createElement('div');
    document.body.appendChild(container);
    hubMock = createHubMock();
    (globalThis as unknown as Record<string, unknown>).hub = hubMock.hub;
  });

  afterEach(() => {
    document.body.removeChild(container);
    // biome-ignore lint/suspicious/noExplicitAny: test cleanup
    delete (globalThis as any).hub;
    vi.restoreAllMocks();
  });

  it('renders loading state initially', async () => {
    const Step3 = await import('./step3-character.js');
    const store = makeStore();

    // Fetch that never resolves (so we see loading state)
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    );

    Step3.render(container, store, defaultI18n);

    const statusRegion = container.querySelector<HTMLElement>('.evf-status');
    expect(statusRegion?.textContent).toContain('evf.wizard.step3.loading');

    Step3.destroy();
  });

  it('renders card grid for ≤8 characters', async () => {
    const Step3 = await import('./step3-character.js');
    const store = makeStore();
    const chars = makeCharacters(3);

    vi.stubGlobal('fetch', makeFetchWithChars(chars));

    Step3.render(container, store, defaultI18n);

    await waitForElement(container, '.evf-char-grid');

    const cards = container.querySelectorAll('.evf-char-card');
    expect(cards.length).toBe(3);

    Step3.destroy();
  });

  it('renders dropdown for >8 characters', async () => {
    const Step3 = await import('./step3-character.js');
    const store = makeStore();
    const chars = makeCharacters(9);

    vi.stubGlobal('fetch', makeFetchWithChars(chars));

    Step3.render(container, store, defaultI18n);

    await waitForElement(container, 'select.evf-select');

    const opts = container.querySelectorAll<HTMLOptionElement>('select.evf-select option');
    // 1 placeholder + 9 characters = 10 options
    expect(opts.length).toBe(10);

    Step3.destroy();
  });

  it('Confirm button is disabled until a character is selected (card grid)', async () => {
    const Step3 = await import('./step3-character.js');
    const store = makeStore();
    const chars = makeCharacters(2);

    vi.stubGlobal('fetch', makeFetchWithChars(chars));

    Step3.render(container, store, defaultI18n);

    await waitForElement(container, '.evf-char-grid');

    const ctaRow = container.querySelector('.wizard-cta');
    const confirmBtn = ctaRow?.querySelector<HTMLButtonElement>('.evf-btn-primary');
    expect(confirmBtn?.disabled).toBe(true);

    Step3.destroy();
  });

  it('selecting a card enables Confirm button', async () => {
    const Step3 = await import('./step3-character.js');
    const store = makeStore();
    const chars = makeCharacters(2);

    vi.stubGlobal('fetch', makeFetchWithChars(chars));

    Step3.render(container, store, defaultI18n);

    await waitForElement(container, '.evf-char-grid');

    const firstCard = container.querySelector<HTMLButtonElement>('.evf-char-card');
    firstCard?.click();

    const ctaRow = container.querySelector('.wizard-cta');
    const confirmBtn = ctaRow?.querySelector<HTMLButtonElement>('.evf-btn-primary');
    expect(confirmBtn?.disabled).toBe(false);

    Step3.destroy();
  });

  it('card selection sets aria-pressed and selected class', async () => {
    const Step3 = await import('./step3-character.js');
    const store = makeStore();
    const chars = makeCharacters(3);

    vi.stubGlobal('fetch', makeFetchWithChars(chars));

    Step3.render(container, store, defaultI18n);

    await waitForElement(container, '.evf-char-grid');

    const cards = container.querySelectorAll<HTMLButtonElement>('.evf-char-card');
    cards[0]?.click();
    expect(cards[0]?.getAttribute('aria-pressed')).toBe('true');
    expect(cards[0]?.classList.contains('evf-char-card--selected')).toBe(true);

    // Select second card — first should deselect
    cards[1]?.click();
    expect(cards[0]?.getAttribute('aria-pressed')).toBe('false');
    expect(cards[1]?.getAttribute('aria-pressed')).toBe('true');

    Step3.destroy();
  });

  it('confirming a selected card advances to COMPLETION', async () => {
    const Step3 = await import('./step3-character.js');
    const store = makeStore();
    const chars = makeCharacters(1);

    vi.stubGlobal('fetch', makeFetchWithChars(chars));

    Step3.render(container, store, defaultI18n);

    await waitForElement(container, '.evf-char-grid');

    const card = container.querySelector<HTMLButtonElement>('.evf-char-card');
    card?.click();

    const ctaRow = container.querySelector('.wizard-cta');
    const confirmBtn = ctaRow?.querySelector<HTMLButtonElement>('.evf-btn-primary');
    confirmBtn?.click();

    // Wait for both step AND characterId (set in same store.set call)
    await vi.waitFor(
      () => {
        const s = store.get();
        if (s.step !== WizardStep.COMPLETION) throw new Error(`step is ${s.step}`);
        return s;
      },
      { timeout: 2000 },
    );

    const finalState = store.get();
    expect(finalState.step).toBe(WizardStep.COMPLETION);
    expect(finalState.characterId).toBe('char-0');

    Step3.destroy();
  });

  it('getSelectedCharacter returns selected character details', async () => {
    const Step3 = await import('./step3-character.js');
    const store = makeStore();
    const chars = makeCharacters(1);

    vi.stubGlobal('fetch', makeFetchWithChars(chars));

    Step3.render(container, store, defaultI18n);

    await waitForElement(container, '.evf-char-grid');

    const card = container.querySelector<HTMLButtonElement>('.evf-char-card');
    card?.click();

    const selected = Step3.getSelectedCharacter();
    expect(selected.id).toBe('char-0');
    expect(selected.name).toBe('Character 0');
    expect(selected.characterClass).toBe('Fighter');

    Step3.destroy();
  });

  it('dropdown: selecting an option enables Confirm', async () => {
    const Step3 = await import('./step3-character.js');
    const store = makeStore();
    const chars = makeCharacters(10);

    vi.stubGlobal('fetch', makeFetchWithChars(chars));

    Step3.render(container, store, defaultI18n);

    await waitForElement(container, 'select.evf-select');

    const select = container.querySelector<HTMLSelectElement>('select.evf-select');
    if (select) {
      select.value = 'char-0';
      select.dispatchEvent(new Event('change'));
    }

    const ctaRow = container.querySelector('.wizard-cta');
    const confirmBtn = ctaRow?.querySelector<HTMLButtonElement>('.evf-btn-primary');
    expect(confirmBtn?.disabled).toBe(false);

    Step3.destroy();
  });

  it('renders empty state when API returns no characters', async () => {
    const Step3 = await import('./step3-character.js');
    const store = makeStore();

    vi.stubGlobal('fetch', makeFetchWithChars([]));

    Step3.render(container, store, defaultI18n);

    await vi.waitFor(
      () => {
        const errRegion = container.querySelector('.evf-error-msg');
        if (!errRegion || errRegion.classList.contains('evf-hidden'))
          throw new Error('not visible yet');
        return errRegion;
      },
      { timeout: 2000 },
    );

    const errorRegion = container.querySelector('.evf-error-msg');
    expect(errorRegion?.classList.contains('evf-hidden')).toBe(false);

    Step3.destroy();
  });

  it('renders fetch error when API returns non-ok response', async () => {
    const Step3 = await import('./step3-character.js');
    const store = makeStore();

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 500,
        json: async () => ({}),
      })),
    );

    Step3.render(container, store, defaultI18n);

    await vi.waitFor(
      () => {
        const errRegion = container.querySelector('.evf-error-msg');
        if (!errRegion || errRegion.classList.contains('evf-hidden'))
          throw new Error('not visible yet');
        return errRegion;
      },
      { timeout: 2000 },
    );

    const errorRegion = container.querySelector('.evf-error-msg');
    expect(errorRegion?.classList.contains('evf-hidden')).toBe(false);

    Step3.destroy();
  });

  it('renders fetch error when network throws', async () => {
    const Step3 = await import('./step3-character.js');
    const store = makeStore();

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('Network error');
      }),
    );

    Step3.render(container, store, defaultI18n);

    await vi.waitFor(
      () => {
        const errRegion = container.querySelector('.evf-error-msg');
        if (!errRegion || errRegion.classList.contains('evf-hidden'))
          throw new Error('not visible yet');
        return errRegion;
      },
      { timeout: 2000 },
    );

    Step3.destroy();
  });

  it('Back button navigates to STEP2', async () => {
    const Step3 = await import('./step3-character.js');
    const store = makeStore();

    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    );

    Step3.render(container, store, defaultI18n);

    const ctaRow = container.querySelector('.wizard-cta');
    const backBtn = ctaRow?.querySelector<HTMLButtonElement>('.evf-btn-ghost');
    backBtn?.click();

    expect(store.get().step).toBe(WizardStep.STEP2);
    expect(store.get().error).toBeNull();
  });

  it('destroy() cleans up without errors', async () => {
    const Step3 = await import('./step3-character.js');
    const store = makeStore();

    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    );

    Step3.render(container, store, defaultI18n);
    expect(() => Step3.destroy()).not.toThrow();
  });

  it('destroy() is idempotent', async () => {
    const Step3 = await import('./step3-character.js');
    const store = makeStore();

    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    );

    Step3.render(container, store, defaultI18n);
    Step3.destroy();
    expect(() => Step3.destroy()).not.toThrow();
  });

  it('_parseCharacters handles non-array body gracefully (shows empty state)', async () => {
    const Step3 = await import('./step3-character.js');
    const store = makeStore();

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => 'not-an-array',
      })),
    );

    Step3.render(container, store, defaultI18n);

    // Non-array → empty → show empty state message
    await vi.waitFor(
      () => {
        const errRegion = container.querySelector('.evf-error-msg');
        if (!errRegion || errRegion.classList.contains('evf-hidden'))
          throw new Error('not visible yet');
        return errRegion;
      },
      { timeout: 2000 },
    );

    Step3.destroy();
  });

  it('Confirm without selection does not advance step', async () => {
    const Step3 = await import('./step3-character.js');
    const store = makeStore();
    const chars = makeCharacters(1);

    vi.stubGlobal('fetch', makeFetchWithChars(chars));

    Step3.render(container, store, defaultI18n);

    await waitForElement(container, '.evf-char-grid');

    // Confirm without selecting anything
    const ctaRow = container.querySelector('.wizard-cta');
    const confirmBtn = ctaRow?.querySelector<HTMLButtonElement>('.evf-btn-primary');
    if (confirmBtn) confirmBtn.disabled = false;
    confirmBtn?.click();

    await new Promise((r) => setTimeout(r, 20));
    expect(store.get().step).toBe(WizardStep.STEP3);

    Step3.destroy();
  });

  it('Retry button in fetch error state re-fetches', async () => {
    const Step3 = await import('./step3-character.js');
    const store = makeStore();

    let callCount = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        callCount++;
        return { ok: false, status: 500, json: async () => ({}) };
      }),
    );

    Step3.render(container, store, defaultI18n);

    // Wait for initial fetch error
    await vi.waitFor(
      () => {
        const errRegion = container.querySelector('.evf-error-msg');
        if (!errRegion || errRegion.classList.contains('evf-hidden'))
          throw new Error('not visible yet');
        return errRegion;
      },
      { timeout: 2000 },
    );

    expect(callCount).toBe(1);

    // Find retry button (inside error region)
    const errorRegion = container.querySelector<HTMLElement>('.evf-error-msg');
    const retryBtn = errorRegion?.querySelector<HTMLButtonElement>('.evf-btn-ghost');
    retryBtn?.click();

    // Second fetch should happen
    await vi.waitFor(() => callCount >= 2, { timeout: 2000 });
    expect(callCount).toBeGreaterThanOrEqual(2);

    Step3.destroy();
  });
});
