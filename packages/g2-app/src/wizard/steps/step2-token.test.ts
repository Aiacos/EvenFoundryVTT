/**
 * Unit tests for Step 2 — Bearer Token Entry.
 *
 * Runs in happy-dom environment.
 * `fetch` is mocked via vi.stubGlobal for connection test flows.
 *
 * There is no QR-scan path: the Even Hub platform exposes no camera API to apps
 * (canonical: "no camera (there is none)"). Token transfer is paste / manual entry only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStore, defaultI18n, type WizardState, WizardStep } from '../state.js';

function makeStore(
  partial: Partial<WizardState> = {},
): ReturnType<typeof createStore<WizardState>> {
  return createStore<WizardState>({
    step: WizardStep.STEP2,
    bridgeUrl: 'https://bridge.local:8910',
    token: '',
    characterId: '',
    profileId: '00000000-0000-4000-8000-000000000001',
    i18n: defaultI18n,
    error: null,
    ...partial,
  });
}

function makeFetchOk(status = 200) {
  return vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({}),
  }));
}

describe('step2-token — render()', () => {
  let container: HTMLElement;

  beforeEach(() => {
    vi.resetModules();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
    vi.restoreAllMocks();
  });

  it('renders token input, Show/Hide toggle, Back and Connect buttons', async () => {
    const Step2 = await import('./step2-token.js');
    const store = makeStore();

    Step2.render(container, store, defaultI18n);

    expect(container.querySelector('#evf-token-input')).toBeTruthy();
    expect(container.querySelector('#evf-connect-btn')).toBeTruthy();

    const connectBtn = container.querySelector<HTMLButtonElement>('#evf-connect-btn');
    expect(connectBtn?.disabled).toBe(true); // disabled until token entered
  });

  it('enables Connect button when token is entered', async () => {
    const Step2 = await import('./step2-token.js');
    const store = makeStore();

    Step2.render(container, store, defaultI18n);

    const input = container.querySelector<HTMLInputElement>('#evf-token-input');
    const connectBtn = container.querySelector<HTMLButtonElement>('#evf-connect-btn');

    if (input) {
      input.value = 'some-token-value';
      input.dispatchEvent(new Event('input'));
    }

    expect(connectBtn?.disabled).toBe(false);
  });

  it('disables Connect button again when token is cleared', async () => {
    const Step2 = await import('./step2-token.js');
    const store = makeStore();

    Step2.render(container, store, defaultI18n);

    const input = container.querySelector<HTMLInputElement>('#evf-token-input');
    const connectBtn = container.querySelector<HTMLButtonElement>('#evf-connect-btn');

    if (input) {
      input.value = 'some-token';
      input.dispatchEvent(new Event('input'));
      expect(connectBtn?.disabled).toBe(false);
      input.value = '';
      input.dispatchEvent(new Event('input'));
    }

    expect(connectBtn?.disabled).toBe(true);
  });

  it('shows short token hint for tokens below 32 chars', async () => {
    const Step2 = await import('./step2-token.js');
    const store = makeStore();

    Step2.render(container, store, defaultI18n);

    const input = container.querySelector<HTMLInputElement>('#evf-token-input');
    const hint = container.querySelector<HTMLElement>('#evf-token-hint');

    if (input) {
      input.value = 'short';
      input.dispatchEvent(new Event('input'));
    }

    expect(hint?.classList.contains('evf-hidden')).toBe(false);
  });

  it('hides short token hint for tokens >= 32 chars', async () => {
    const Step2 = await import('./step2-token.js');
    const store = makeStore();

    Step2.render(container, store, defaultI18n);

    const input = container.querySelector<HTMLInputElement>('#evf-token-input');
    const hint = container.querySelector<HTMLElement>('#evf-token-hint');

    if (input) {
      input.value = 'a'.repeat(32);
      input.dispatchEvent(new Event('input'));
    }

    expect(hint?.classList.contains('evf-hidden')).toBe(true);
  });

  it('Show/Hide toggle changes input type between password and text', async () => {
    const Step2 = await import('./step2-token.js');
    const store = makeStore();

    Step2.render(container, store, defaultI18n);

    const input = container.querySelector<HTMLInputElement>('#evf-token-input');
    expect(input?.type).toBe('password');

    // Find the show/hide toggle (ghost button before paste button)
    const ghostBtns = container.querySelectorAll<HTMLButtonElement>('.evf-btn-ghost');
    const showToggle = ghostBtns[0]; // first ghost button is show/hide
    showToggle?.click();

    expect(input?.type).toBe('text');

    // Click again to hide
    showToggle?.click();
    expect(input?.type).toBe('password');
  });

  it('Back button navigates to STEP1', async () => {
    const Step2 = await import('./step2-token.js');
    const store = makeStore();

    Step2.render(container, store, defaultI18n);

    // Back button is the ghost button in the CTA row
    const ctaRow = container.querySelector('.wizard-cta');
    const backBtn = ctaRow?.querySelector<HTMLButtonElement>('.evf-btn-ghost');
    backBtn?.click();

    expect(store.get().step).toBe(WizardStep.STEP1);
    expect(store.get().error).toBeNull();
  });

  it('Connect button: 200 response advances to STEP3', async () => {
    const Step2 = await import('./step2-token.js');
    const store = makeStore();

    vi.stubGlobal('fetch', makeFetchOk(200));

    Step2.render(container, store, defaultI18n);

    const input = container.querySelector<HTMLInputElement>('#evf-token-input');
    const connectBtn = container.querySelector<HTMLButtonElement>('#evf-connect-btn');

    if (input) {
      input.value = 'my-valid-bearer-token-1234567890';
      input.dispatchEvent(new Event('input'));
    }

    connectBtn?.click();

    // Wait for async connect
    await vi.waitFor(() => {
      return store.get().step === WizardStep.STEP3;
    });

    expect(store.get().token).toBe('my-valid-bearer-token-1234567890');
    expect(store.get().error).toBeNull();
  });

  it('Connect button: 401 response sets error.type = "401"', async () => {
    const Step2 = await import('./step2-token.js');
    const store = makeStore();

    vi.stubGlobal('fetch', makeFetchOk(401));

    Step2.render(container, store, defaultI18n);

    const input = container.querySelector<HTMLInputElement>('#evf-token-input');
    const connectBtn = container.querySelector<HTMLButtonElement>('#evf-connect-btn');

    if (input) {
      input.value = 'bad-token';
      input.dispatchEvent(new Event('input'));
    }

    connectBtn?.click();

    await vi.waitFor(() => store.get().error !== null);

    expect(store.get().error?.type).toBe('401');
    expect(store.get().step).toBe(WizardStep.STEP2);
  });

  it('Connect button: 403 response sets error.type = "403"', async () => {
    const Step2 = await import('./step2-token.js');
    const store = makeStore();

    vi.stubGlobal('fetch', makeFetchOk(403));

    Step2.render(container, store, defaultI18n);

    const input = container.querySelector<HTMLInputElement>('#evf-token-input');
    const connectBtn = container.querySelector<HTMLButtonElement>('#evf-connect-btn');

    if (input) {
      input.value = 'expired-token';
      input.dispatchEvent(new Event('input'));
    }

    connectBtn?.click();

    await vi.waitFor(() => store.get().error !== null);

    expect(store.get().error?.type).toBe('403');
  });

  it('Connect button: 426 response sets error.type = "version_mismatch"', async () => {
    const Step2 = await import('./step2-token.js');
    const store = makeStore();

    vi.stubGlobal('fetch', makeFetchOk(426));

    Step2.render(container, store, defaultI18n);

    const input = container.querySelector<HTMLInputElement>('#evf-token-input');
    const connectBtn = container.querySelector<HTMLButtonElement>('#evf-connect-btn');

    if (input) {
      input.value = 'any-token';
      input.dispatchEvent(new Event('input'));
    }

    connectBtn?.click();

    await vi.waitFor(() => store.get().error !== null);

    expect(store.get().error?.type).toBe('version_mismatch');
  });

  it('Connect button: unexpected status sets error.type = "unreachable"', async () => {
    const Step2 = await import('./step2-token.js');
    const store = makeStore();

    vi.stubGlobal('fetch', makeFetchOk(500));

    Step2.render(container, store, defaultI18n);

    const input = container.querySelector<HTMLInputElement>('#evf-token-input');
    const connectBtn = container.querySelector<HTMLButtonElement>('#evf-connect-btn');

    if (input) {
      input.value = 'any-token';
      input.dispatchEvent(new Event('input'));
    }

    connectBtn?.click();

    await vi.waitFor(() => store.get().error !== null);

    expect(store.get().error?.type).toBe('unreachable');
  });

  it('Connect button: network error sets error.type = "unreachable"', async () => {
    const Step2 = await import('./step2-token.js');
    const store = makeStore();

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('Network error');
      }),
    );

    Step2.render(container, store, defaultI18n);

    const input = container.querySelector<HTMLInputElement>('#evf-token-input');
    const connectBtn = container.querySelector<HTMLButtonElement>('#evf-connect-btn');

    if (input) {
      input.value = 'any-token';
      input.dispatchEvent(new Event('input'));
    }

    connectBtn?.click();

    await vi.waitFor(() => store.get().error !== null);

    expect(store.get().error?.type).toBe('unreachable');
  });

  it('Connect button: AbortError sets error.type = "timeout"', async () => {
    const Step2 = await import('./step2-token.js');
    const store = makeStore();

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        const err = new DOMException('The operation was aborted.', 'AbortError');
        throw err;
      }),
    );

    Step2.render(container, store, defaultI18n);

    const input = container.querySelector<HTMLInputElement>('#evf-token-input');
    const connectBtn = container.querySelector<HTMLButtonElement>('#evf-connect-btn');

    if (input) {
      input.value = 'any-token';
      input.dispatchEvent(new Event('input'));
    }

    connectBtn?.click();

    await vi.waitFor(() => store.get().error !== null);

    expect(store.get().error?.type).toBe('timeout');
  });

  it('shows existing error from store when re-entering step', async () => {
    const Step2 = await import('./step2-token.js');
    const store = makeStore({ error: { type: '401', url: 'https://bridge.local:8910' } });

    Step2.render(container, store, defaultI18n);

    const errorRegion = container.querySelector<HTMLElement>('#evf-connect-error');
    expect(errorRegion?.classList.contains('evf-hidden')).toBe(false);
  });

  it('typing in input clears error display', async () => {
    const Step2 = await import('./step2-token.js');
    const store = makeStore({ error: { type: '401', url: 'https://bridge.local:8910' } });

    Step2.render(container, store, defaultI18n);

    const input = container.querySelector<HTMLInputElement>('#evf-token-input');
    const errorRegion = container.querySelector<HTMLElement>('#evf-connect-error');

    // Initially visible
    expect(errorRegion?.classList.contains('evf-hidden')).toBe(false);

    // Type to clear
    if (input) {
      input.value = 'new-token';
      input.dispatchEvent(new Event('input'));
    }

    expect(errorRegion?.classList.contains('evf-hidden')).toBe(true);
  });

  it('Paste button does nothing when clipboard API unavailable', async () => {
    const Step2 = await import('./step2-token.js');
    const store = makeStore();

    // navigator.clipboard is undefined in happy-dom
    Step2.render(container, store, defaultI18n);

    const ghostBtns = container.querySelectorAll<HTMLButtonElement>('.evf-btn-ghost');
    const pasteBtn = ghostBtns[1]; // second ghost button (after show/hide)

    // Should not throw
    expect(() => pasteBtn?.click()).not.toThrow();
  });

  it('Paste button reads clipboard and fills token when clipboard API available', async () => {
    const Step2 = await import('./step2-token.js');
    const store = makeStore();

    // Mock navigator.clipboard.readText
    const clipboardText = 'pasted-token-from-clipboard-1234567890';
    vi.stubGlobal('navigator', {
      clipboard: {
        readText: vi.fn(async () => clipboardText),
      },
    });

    Step2.render(container, store, defaultI18n);

    const ghostBtns = container.querySelectorAll<HTMLButtonElement>('.evf-btn-ghost');
    const pasteBtn = ghostBtns[1]; // paste button
    pasteBtn?.click();

    await vi.waitFor(
      () => {
        const input = container.querySelector<HTMLInputElement>('#evf-token-input');
        if (input?.value !== clipboardText) throw new Error('not pasted yet');
      },
      { timeout: 2000 },
    );

    const input = container.querySelector<HTMLInputElement>('#evf-token-input');
    expect(input?.value).toBe(clipboardText);
    // Connect button should be enabled after paste
    const connectBtn = container.querySelector<HTMLButtonElement>('#evf-connect-btn');
    expect(connectBtn?.disabled).toBe(false);

    Step2.destroy();
  });

  it('Paste button handles clipboard permission denied gracefully', async () => {
    const Step2 = await import('./step2-token.js');
    const store = makeStore();

    vi.stubGlobal('navigator', {
      clipboard: {
        readText: vi.fn(async () => {
          throw new DOMException('Permission denied', 'NotAllowedError');
        }),
      },
    });

    Step2.render(container, store, defaultI18n);

    const ghostBtns = container.querySelectorAll<HTMLButtonElement>('.evf-btn-ghost');
    const pasteBtn = ghostBtns[1];

    // Should not throw
    expect(() => pasteBtn?.click()).not.toThrow();

    // After async rejection, state should not change
    await new Promise((r) => setTimeout(r, 20));
    expect(store.get().step).toBe(WizardStep.STEP2);

    Step2.destroy();
  });

  it('destroy() cleans up without errors', async () => {
    const Step2 = await import('./step2-token.js');
    const store = makeStore();

    Step2.render(container, store, defaultI18n);
    expect(() => Step2.destroy()).not.toThrow();
  });

  it('destroy() is idempotent', async () => {
    const Step2 = await import('./step2-token.js');
    const store = makeStore();

    Step2.render(container, store, defaultI18n);
    Step2.destroy();
    expect(() => Step2.destroy()).not.toThrow();
  });

  it('re-render calls destroy on previous step first', async () => {
    const Step2 = await import('./step2-token.js');
    const store = makeStore();

    Step2.render(container, store, defaultI18n);
    // Render again — should not throw (calls destroy internally)
    expect(() => Step2.render(container, store, defaultI18n)).not.toThrow();
    Step2.destroy();
  });

  it('Connect is skipped when token is empty (even if button enabled by force)', async () => {
    const Step2 = await import('./step2-token.js');
    const store = makeStore();

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    Step2.render(container, store, defaultI18n);

    const connectBtn = container.querySelector<HTMLButtonElement>('#evf-connect-btn');
    if (connectBtn) connectBtn.disabled = false;
    connectBtn?.click();

    // fetch should not have been called
    await new Promise((r) => setTimeout(r, 10));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
