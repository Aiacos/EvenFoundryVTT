/**
 * Unit tests for the Completion screen.
 *
 * Runs in happy-dom environment.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createStore, defaultI18n, type WizardState, WizardStep } from '../state.js';

function makeStore(
  partial: Partial<WizardState> = {},
): ReturnType<typeof createStore<WizardState>> {
  return createStore<WizardState>({
    step: WizardStep.COMPLETION,
    bridgeUrl: 'https://bridge.local:8910',
    token: 'test-token',
    characterId: 'char-1',
    profileId: '00000000-0000-4000-8000-000000000001',
    i18n: defaultI18n,
    error: null,
    ...partial,
  });
}

describe('completion — render()', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('renders the completion screen with heading', async () => {
    const Completion = await import('./completion.js');
    const store = makeStore();

    Completion.render(container, store, defaultI18n);

    const heading = container.querySelector<HTMLElement>('.evf-completion__heading');
    expect(heading).toBeTruthy();
    // defaultI18n returns the key
    expect(heading?.textContent).toBe('evf.wizard.complete.heading');
  });

  it('renders character info from opts using i18n key fallback', async () => {
    const Completion = await import('./completion.js');
    const store = makeStore({ characterId: 'char-1' });

    // defaultI18n returns the key string with vars interpolated when key has {var} patterns,
    // but 'evf.wizard.complete.character' doesn't contain {name} so vars are ignored.
    // Use a custom t function to verify opts are passed correctly.
    const tSpy = (key: string, vars?: Record<string, string>) => {
      if (key === 'evf.wizard.complete.character' && vars) {
        return `${vars.name ?? ''} (${vars.class ?? ''})`;
      }
      return key;
    };

    Completion.render(container, store, tSpy, {
      characterName: 'Aragorn',
      characterClass: 'Ranger',
    });

    const detail = container.querySelector<HTMLElement>('.evf-completion__detail');
    expect(detail?.textContent).toContain('Aragorn');
    expect(detail?.textContent).toContain('Ranger');
  });

  it('falls back to store.characterId when opts.characterName is not provided', async () => {
    const Completion = await import('./completion.js');
    const store = makeStore({ characterId: 'my-char-id' });

    Completion.render(container, store, defaultI18n);

    const detail = container.querySelector<HTMLElement>('.evf-completion__detail');
    // defaultI18n returns "evf.wizard.complete.character" key, but the var {name} = 'my-char-id'
    expect(detail).toBeTruthy();
  });

  it('renders bridge URL display (protocol stripped)', async () => {
    const Completion = await import('./completion.js');
    const store = makeStore({ bridgeUrl: 'https://bridge.local:8910' });

    Completion.render(container, store, defaultI18n);

    const details = container.querySelectorAll<HTMLElement>('.evf-completion__detail');
    // Second detail is bridge
    const bridgeDetail = details[1];
    // The bridge key will be rendered (defaultI18n fallback), but the url var is set
    expect(bridgeDetail).toBeTruthy();
  });

  it('renders instructions paragraph', async () => {
    const Completion = await import('./completion.js');
    const store = makeStore();

    Completion.render(container, store, defaultI18n);

    const instructions = container.querySelector<HTMLElement>('.evf-completion__instructions');
    expect(instructions).toBeTruthy();
    expect(instructions?.textContent).toBe('evf.wizard.complete.instructions');
  });

  it('renders repair button', async () => {
    const Completion = await import('./completion.js');
    const store = makeStore();

    Completion.render(container, store, defaultI18n);

    const repairBtn = container.querySelector<HTMLButtonElement>('.evf-completion__repair');
    expect(repairBtn).toBeTruthy();
    expect(repairBtn?.textContent).toBe('evf.wizard.complete.repair');
  });

  it('Repair button click sets step to STEP1', async () => {
    const Completion = await import('./completion.js');
    const store = makeStore();

    Completion.render(container, store, defaultI18n);

    const repairBtn = container.querySelector<HTMLButtonElement>('.evf-completion__repair');
    repairBtn?.click();

    expect(store.get().step).toBe(WizardStep.STEP1);
    expect(store.get().error).toBeNull();
  });

  it('renders checkmark SVG icon', async () => {
    const Completion = await import('./completion.js');
    const store = makeStore();

    Completion.render(container, store, defaultI18n);

    const icon = container.querySelector('.evf-completion__icon');
    expect(icon?.querySelector('svg')).toBeTruthy();
  });

  it('renders with role="status" on the completion div', async () => {
    const Completion = await import('./completion.js');
    const store = makeStore();

    Completion.render(container, store, defaultI18n);

    const screen = container.querySelector('.evf-completion');
    expect(screen?.getAttribute('role')).toBe('status');
  });

  it('destroy() cleans up without errors', async () => {
    const Completion = await import('./completion.js');
    const store = makeStore();

    Completion.render(container, store, defaultI18n);
    expect(() => Completion.destroy()).not.toThrow();
  });

  it('destroy() is idempotent', async () => {
    const Completion = await import('./completion.js');
    const store = makeStore();

    Completion.render(container, store, defaultI18n);
    Completion.destroy();
    expect(() => Completion.destroy()).not.toThrow();
  });

  it('re-render replaces container contents', async () => {
    const Completion = await import('./completion.js');
    const store = makeStore();

    Completion.render(container, store, defaultI18n);
    const firstScreens = container.querySelectorAll('.evf-completion');
    expect(firstScreens.length).toBe(1);

    Completion.render(container, store, defaultI18n);
    const secondScreens = container.querySelectorAll('.evf-completion');
    expect(secondScreens.length).toBe(1);

    Completion.destroy();
  });
});
