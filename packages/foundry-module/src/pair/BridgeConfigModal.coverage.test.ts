/**
 * Branch-coverage tests for BridgeConfigModal — the handler-binding (_onRender),
 * cancel, reveal toggle, null-input, and i18n-fallback arms not exercised by the
 * primary BridgeConfigModal.test.ts suite. Every test asserts observable DOM /
 * settings / notification effects.
 *
 * @see packages/foundry-module/src/pair/BridgeConfigModal.ts
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

class ApplicationV2Stub {
  element: HTMLElement = { querySelector: () => null } as unknown as HTMLElement;
  render(): this {
    return this;
  }
  async close(): Promise<void> {}
  _onRender(_c?: unknown, _o?: unknown): void {}
  static DEFAULT_OPTIONS = { id: '', window: { title: '' }, position: { width: 400 } };
  static PARTS = {};
}

/** `localize` returning undefined forces the SUT's `?? 'literal'` fallback arms. */
function makeGameMock(localizeUndefined = false) {
  const store = new Map<string, unknown>();
  return {
    settings: {
      get: vi.fn((m: string, k: string) => store.get(`${m}.${k}`)),
      set: vi.fn(async (m: string, k: string, v: unknown) => {
        store.set(`${m}.${k}`, v);
      }),
      register: vi.fn(),
      registerMenu: vi.fn(),
    },
    i18n: { lang: 'en', localize: vi.fn((k: string) => (localizeUndefined ? undefined : k)) },
    _store: store,
  };
}

interface Renderable {
  element: HTMLElement;
  _onRender(c: unknown, o: unknown): void;
  _onClickSave(e: Event): Promise<void>;
  _onClickCancel(e: Event): void;
  _onClickReveal(e: Event): void;
  close(): Promise<void>;
}

let uiInfo: ReturnType<typeof vi.fn>;
let uiError: ReturnType<typeof vi.fn>;
let gameMock: ReturnType<typeof makeGameMock>;

function stubGlobals(localizeUndefined = false) {
  vi.stubGlobal('foundry', {
    applications: {
      api: { ApplicationV2: ApplicationV2Stub, HandlebarsApplicationMixin: (B: unknown) => B },
    },
  });
  vi.stubGlobal('Hooks', { once: vi.fn(), on: vi.fn() });
  gameMock = makeGameMock(localizeUndefined);
  vi.stubGlobal('game', gameMock);
  uiInfo = vi.fn();
  uiError = vi.fn();
  vi.stubGlobal('ui', { notifications: { info: uiInfo, error: uiError } });
}

beforeEach(() => {
  vi.resetModules();
  stubGlobals();
});

describe('_onRender handler binding', () => {
  it('binds click listeners on all three present buttons', async () => {
    const { BridgeConfigModal } = await import('./BridgeConfigModal.js');
    const modal = new BridgeConfigModal() as unknown as Renderable;
    const listeners: Record<string, (e: Event) => void> = {};
    const mkBtn = (action: string) => ({
      addEventListener: (_ev: string, cb: (e: Event) => void) => {
        listeners[action] = cb;
      },
    });
    modal.element = {
      querySelector: (sel: string) => {
        if (sel.includes('save')) return mkBtn('save');
        if (sel.includes('cancel')) return mkBtn('cancel');
        if (sel.includes('reveal-secret')) return mkBtn('reveal');
        return null;
      },
    } as unknown as HTMLElement;

    modal._onRender({}, {});
    // All three actions bound → their handlers registered.
    expect(Object.keys(listeners).sort()).toEqual(['cancel', 'reveal', 'save']);
  });

  it('binds nothing when the buttons are absent (querySelector → null)', async () => {
    const { BridgeConfigModal } = await import('./BridgeConfigModal.js');
    const modal = new BridgeConfigModal() as unknown as Renderable;
    modal.element = { querySelector: () => null } as unknown as HTMLElement;
    // Should not throw when no buttons exist.
    expect(() => modal._onRender({}, {})).not.toThrow();
  });
});

describe('_onClickCancel', () => {
  it('closes without writing any setting', async () => {
    const { BridgeConfigModal } = await import('./BridgeConfigModal.js');
    const modal = new BridgeConfigModal() as unknown as Renderable;
    const closeSpy = vi.spyOn(modal, 'close').mockResolvedValue(undefined);
    const preventDefault = vi.fn();
    modal._onClickCancel({ preventDefault } as unknown as Event);
    expect(preventDefault).toHaveBeenCalled();
    expect(closeSpy).toHaveBeenCalled();
    expect(gameMock.settings.set).not.toHaveBeenCalled();
  });
});

describe('_onClickReveal toggle', () => {
  function revealSetup(initialType: string) {
    const secretInput = { type: initialType } as HTMLInputElement;
    const btn = { textContent: 'X' } as HTMLElement;
    const element = {
      querySelector: (sel: string) => (sel.includes('bridgeInternalSecret') ? secretInput : null),
    } as unknown as HTMLElement;
    return { secretInput, btn, element };
  }

  it('password → text reveals the value and sets the Hide label', async () => {
    const { BridgeConfigModal } = await import('./BridgeConfigModal.js');
    const modal = new BridgeConfigModal() as unknown as Renderable;
    const { secretInput, btn, element } = revealSetup('password');
    modal.element = element;
    modal._onClickReveal({ preventDefault: vi.fn(), currentTarget: btn } as unknown as Event);
    expect(secretInput.type).toBe('text');
    expect(btn.textContent).toBe('evf.bridgecfg.hide');
  });

  it('text → password re-masks the value and sets the Reveal label', async () => {
    const { BridgeConfigModal } = await import('./BridgeConfigModal.js');
    const modal = new BridgeConfigModal() as unknown as Renderable;
    const { secretInput, btn, element } = revealSetup('text');
    modal.element = element;
    modal._onClickReveal({ preventDefault: vi.fn(), currentTarget: btn } as unknown as Event);
    expect(secretInput.type).toBe('password');
    expect(btn.textContent).toBe('evf.bridgecfg.reveal');
  });

  it('returns early when the secret input is missing (no throw)', async () => {
    const { BridgeConfigModal } = await import('./BridgeConfigModal.js');
    const modal = new BridgeConfigModal() as unknown as Renderable;
    modal.element = { querySelector: () => null } as unknown as HTMLElement;
    const btn = { textContent: 'X' } as HTMLElement;
    expect(() =>
      modal._onClickReveal({ preventDefault: vi.fn(), currentTarget: btn } as unknown as Event),
    ).not.toThrow();
    expect(btn.textContent).toBe('X'); // unchanged — early return
  });
});

describe('_onClickSave null-input and i18n-fallback arms', () => {
  it('missing url input → treated as empty → invalid URL error, no write', async () => {
    const { BridgeConfigModal } = await import('./BridgeConfigModal.js');
    const modal = new BridgeConfigModal() as unknown as Renderable;
    modal.element = { querySelector: () => null } as unknown as HTMLElement;
    await modal._onClickSave({ preventDefault: vi.fn() } as unknown as Event);
    expect(uiError).toHaveBeenCalled();
    expect(gameMock.settings.set).not.toHaveBeenCalled();
  });

  it('uses the hard-coded invalidUrl fallback when localize yields undefined', async () => {
    vi.resetModules();
    stubGlobals(true); // localize → undefined
    const { BridgeConfigModal } = await import('./BridgeConfigModal.js');
    const modal = new BridgeConfigModal() as unknown as Renderable;
    modal.element = {
      querySelector: () => ({ value: 'not a url' }),
    } as unknown as HTMLElement;
    await modal._onClickSave({ preventDefault: vi.fn() } as unknown as Event);
    expect(uiError).toHaveBeenCalledWith('Enter a valid URL including scheme and port.');
  });

  it('uses the hard-coded saved fallback when localize yields undefined', async () => {
    vi.resetModules();
    stubGlobals(true); // localize → undefined
    const { BridgeConfigModal } = await import('./BridgeConfigModal.js');
    const modal = new BridgeConfigModal() as unknown as Renderable;
    vi.spyOn(modal, 'close').mockResolvedValue(undefined);
    modal.element = {
      querySelector: (sel: string) =>
        sel.includes('bridgeUrl') ? { value: 'https://b:8910' } : { value: 's', type: 'password' },
    } as unknown as HTMLElement;
    await modal._onClickSave({ preventDefault: vi.fn() } as unknown as Event);
    expect(uiInfo).toHaveBeenCalledWith('Bridge configuration saved.');
  });
});
