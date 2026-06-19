/**
 * Unit tests for Step 1 — Bridge Profile / URL entry.
 *
 * Runs in happy-dom (environment set in packages/g2-app/vitest.config.ts).
 * The `hub` global is mocked via globalThis assignment for tier3-storage calls.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStore, defaultI18n, type WizardState, WizardStep } from '../state.js';

// ---------------------------------------------------------------------------
// hub mock (needed because step1-profile imports tier3-storage which may need hub)
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

function makeStore(
  partial: Partial<WizardState> = {},
): ReturnType<typeof createStore<WizardState>> {
  return createStore<WizardState>({
    step: WizardStep.STEP1,
    bridgeUrl: '',
    token: '',
    characterId: '',
    profileId: '00000000-0000-4000-8000-000000000001',
    i18n: defaultI18n,
    error: null,
    ...partial,
  });
}

describe('step1-profile — BRIDGE_URL_REGEX', () => {
  it('matches https URLs with OR without a port (D1 — full origin); rejects no-scheme/host/spaces', async () => {
    const { BRIDGE_URL_REGEX } = await import('./step1-profile.js');
    expect(BRIDGE_URL_REGEX.test('https://bridge.local:8910')).toBe(true);
    expect(BRIDGE_URL_REGEX.test('http://192.168.1.10:8910')).toBe(true);
    // Feature 001 D1: port-less https origins (443) + Forge world URLs now validate.
    expect(BRIDGE_URL_REGEX.test('https://evenfoundry.lucifer-tnas.mywire.org')).toBe(true);
    expect(BRIDGE_URL_REGEX.test('https://eu.forge-vtt.com/invite/aiacos-vecna/dae6a476')).toBe(
      true,
    );
    // Still rejected: no scheme, missing host, embedded space.
    expect(BRIDGE_URL_REGEX.test('bridge.local:8910')).toBe(false);
    expect(BRIDGE_URL_REGEX.test('https://:8910')).toBe(false);
    expect(BRIDGE_URL_REGEX.test('https://bridge local')).toBe(false);
  });
});

describe('step1-profile — render()', () => {
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

  it('renders a form with URL input and Continue button', async () => {
    const Step1 = await import('./step1-profile.js');
    const store = makeStore();

    Step1.render(container, store, defaultI18n);

    expect(container.querySelector('#evf-bridge-url')).toBeTruthy();
    expect(container.querySelector('button[type="button"]')).toBeTruthy();
    // Continue button should be disabled (empty URL)
    const btn = container.querySelector<HTMLButtonElement>('.evf-btn-primary');
    expect(btn?.disabled).toBe(true);
  });

  it('pre-fills URL input when store has bridgeUrl', async () => {
    const Step1 = await import('./step1-profile.js');
    const store = makeStore({ bridgeUrl: 'https://bridge.local:8910' });

    Step1.render(container, store, defaultI18n);

    const input = container.querySelector<HTMLInputElement>('#evf-bridge-url');
    expect(input?.value).toBe('https://bridge.local:8910');
  });

  it('Continue button is enabled when store already has a valid bridgeUrl', async () => {
    const Step1 = await import('./step1-profile.js');
    const store = makeStore({ bridgeUrl: 'https://bridge.local:8910' });

    Step1.render(container, store, defaultI18n);

    const btn = container.querySelector<HTMLButtonElement>('.evf-btn-primary');
    expect(btn?.disabled).toBe(false);
  });

  it('enables Continue button when valid URL is typed', async () => {
    const Step1 = await import('./step1-profile.js');
    const store = makeStore();

    Step1.render(container, store, defaultI18n);

    const input = container.querySelector<HTMLInputElement>('#evf-bridge-url');
    const btn = container.querySelector<HTMLButtonElement>('.evf-btn-primary');

    expect(btn?.disabled).toBe(true);

    if (input) {
      input.value = 'https://bridge.local:8910';
      input.dispatchEvent(new Event('input'));
    }

    expect(btn?.disabled).toBe(false);
  });

  it('keeps Continue disabled for an invalid URL', async () => {
    const Step1 = await import('./step1-profile.js');
    const store = makeStore();

    Step1.render(container, store, defaultI18n);

    const input = container.querySelector<HTMLInputElement>('#evf-bridge-url');
    const btn = container.querySelector<HTMLButtonElement>('.evf-btn-primary');

    if (input) {
      input.value = 'not-a-url';
      input.dispatchEvent(new Event('input'));
    }

    expect(btn?.disabled).toBe(true);
  });

  it('shows error message on blur with invalid URL', async () => {
    const Step1 = await import('./step1-profile.js');
    const store = makeStore();

    Step1.render(container, store, defaultI18n);

    const input = container.querySelector<HTMLInputElement>('#evf-bridge-url');

    if (input) {
      input.value = 'not-a-url';
      input.dispatchEvent(new Event('blur'));
    }

    const errorEl = container.querySelector('#evf-url-error');
    expect(errorEl?.classList.contains('evf-hidden')).toBe(false);
  });

  it('hides error message when URL becomes valid on blur', async () => {
    const Step1 = await import('./step1-profile.js');
    const store = makeStore();

    Step1.render(container, store, defaultI18n);

    const input = container.querySelector<HTMLInputElement>('#evf-bridge-url');

    if (input) {
      // First type invalid
      input.value = 'not-a-url';
      input.dispatchEvent(new Event('blur'));
      // Then fix it
      input.value = 'https://bridge.local:8910';
      input.dispatchEvent(new Event('blur'));
    }

    const errorEl = container.querySelector('#evf-url-error');
    expect(errorEl?.classList.contains('evf-hidden')).toBe(true);
  });

  it('advances to STEP2 when Continue is clicked with valid URL', async () => {
    const Step1 = await import('./step1-profile.js');
    const store = makeStore();

    Step1.render(container, store, defaultI18n);

    const input = container.querySelector<HTMLInputElement>('#evf-bridge-url');
    const btn = container.querySelector<HTMLButtonElement>('.evf-btn-primary');

    if (input) {
      input.value = 'https://bridge.local:8910';
      input.dispatchEvent(new Event('input'));
    }

    btn?.click();

    expect(store.get().step).toBe(WizardStep.STEP2);
    expect(store.get().bridgeUrl).toBe('https://bridge.local:8910');
  });

  it('does not advance to STEP2 when Continue is clicked with invalid URL', async () => {
    const Step1 = await import('./step1-profile.js');
    const store = makeStore();

    Step1.render(container, store, defaultI18n);

    // Force-enable and click with no value
    const btn = container.querySelector<HTMLButtonElement>('.evf-btn-primary');
    if (btn) btn.disabled = false;
    btn?.click();

    expect(store.get().step).toBe(WizardStep.STEP1);
  });

  it('destroy() cleans up without errors', async () => {
    const Step1 = await import('./step1-profile.js');
    const store = makeStore();

    Step1.render(container, store, defaultI18n);
    expect(() => Step1.destroy()).not.toThrow();
  });

  it('destroy() is idempotent (calling twice is safe)', async () => {
    const Step1 = await import('./step1-profile.js');
    const store = makeStore();

    Step1.render(container, store, defaultI18n);
    Step1.destroy();
    expect(() => Step1.destroy()).not.toThrow();
  });

  it('renders profile select with no-profile option', async () => {
    const Step1 = await import('./step1-profile.js');
    const store = makeStore();

    Step1.render(container, store, defaultI18n);

    const select = container.querySelector<HTMLSelectElement>('#evf-profile-select');
    expect(select).toBeTruthy();
    expect(select?.options[0]?.value).toBe('');
  });

  it('blur with empty URL does not show error', async () => {
    const Step1 = await import('./step1-profile.js');
    const store = makeStore();

    Step1.render(container, store, defaultI18n);

    const input = container.querySelector<HTMLInputElement>('#evf-bridge-url');
    if (input) {
      input.value = '';
      input.dispatchEvent(new Event('blur'));
    }

    const errorEl = container.querySelector('#evf-url-error');
    // Empty URL → no error shown (only shown if user typed something invalid)
    expect(errorEl?.classList.contains('evf-hidden')).toBe(true);
  });

  it('profile select change with saved profile fills URL and enables Continue', async () => {
    const Step1 = await import('./step1-profile.js');
    const store = makeStore();

    Step1.render(container, store, defaultI18n);

    const select = container.querySelector<HTMLSelectElement>('#evf-profile-select');
    const btn = container.querySelector<HTMLButtonElement>('.evf-btn-primary');

    // Add an option manually (simulating a loaded profile)
    if (select) {
      const opt = document.createElement('option');
      opt.value = 'profile-1';
      opt.dataset.bridgeUrl = 'https://saved.bridge:8910';
      select.appendChild(opt);
      select.value = 'profile-1';
      select.dispatchEvent(new Event('change'));
    }

    expect(btn?.disabled).toBe(false);
  });

  it('profile select reset to empty re-enables URL input', async () => {
    const Step1 = await import('./step1-profile.js');
    const store = makeStore();

    Step1.render(container, store, defaultI18n);

    const select = container.querySelector<HTMLSelectElement>('#evf-profile-select');

    // Select a profile first, then reset
    if (select) {
      const opt = document.createElement('option');
      opt.value = 'profile-1';
      opt.dataset.bridgeUrl = 'https://saved.bridge:8910';
      select.appendChild(opt);
      select.value = 'profile-1';
      select.dispatchEvent(new Event('change'));

      // Now reset
      select.value = '';
      select.dispatchEvent(new Event('change'));
    }

    const input = container.querySelector<HTMLInputElement>('#evf-bridge-url');
    expect(input?.disabled).toBe(false);
  });
});
