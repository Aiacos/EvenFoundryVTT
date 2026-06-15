/**
 * Unit tests for BridgeConfigModal — the dedicated ApplicationV2 dialog for the
 * EVF bridge configuration (bridge URL + internal secret).
 *
 * Tests verify:
 * - BridgeConfigModal class is exported and defined
 * - _prepareContext() pre-loads the currently-saved bridgeUrl + internalSecret
 *   (and '' when unset; hasSecret reflects whether a secret is present)
 * - _onClickSave with a valid https URL writes BOTH settings + ui.notifications.info
 * - _onClickSave with an invalid URL calls ui.notifications.error and writes NOTHING
 *
 * SECURITY: the internal secret value is never passed to console.* in the SUT.
 *
 * @see packages/foundry-module/src/pair/BridgeConfigModal.ts
 * @see 260604-mjr-PLAN.md Task 1
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Foundry global stubs ─────────────────────────────────────────────────────

class ApplicationV2Stub {
  constructor(_options?: unknown) {}
  element: HTMLElement =
    globalThis.document?.createElement?.('div') ??
    ({ querySelector: () => null, querySelectorAll: () => [] } as unknown as HTMLElement);
  render(_options?: unknown): this {
    return this;
  }
  async close(_options?: unknown): Promise<void> {}
  async _prepareContext(_options?: unknown): Promise<Record<string, unknown>> {
    return {};
  }
  _onRender(_context?: unknown, _options?: unknown): void {}
  static DEFAULT_OPTIONS = { id: '', window: { title: '' }, position: { width: 400 } };
  static PARTS = {};
}

const makeGameMock = (lang = 'en') => {
  const store = new Map<string, unknown>();
  return {
    settings: {
      get: vi.fn((moduleId: string, key: string) => store.get(`${moduleId}.${key}`)),
      set: vi.fn(async (moduleId: string, key: string, value: unknown) => {
        store.set(`${moduleId}.${key}`, value);
      }),
      register: vi.fn(),
      registerMenu: vi.fn(),
    },
    i18n: {
      lang,
      localize: vi.fn((k: string) => k),
    },
    _store: store,
  };
};

/**
 * Renderable view of a BridgeConfigModal instance. The Foundry
 * `HandlebarsApplicationMixin` is not described by the local type declarations, so
 * the mixed-in `element` member is invisible on the static type. This view restores
 * it (plus the click handlers under test) for test wiring only.
 */
interface RenderableModal {
  element: HTMLElement;
  _onClickSave(event: Event): Promise<void>;
  _onClickCancel(event: Event): void;
}

describe('BridgeConfigModal', () => {
  let gameMock: ReturnType<typeof makeGameMock>;
  let uiInfo: ReturnType<typeof vi.fn>;
  let uiError: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('foundry', {
      applications: {
        api: {
          ApplicationV2: ApplicationV2Stub,
          HandlebarsApplicationMixin: (Base: unknown) => Base,
        },
      },
    });
    // module.ts registers `Hooks.once('init', …)` at import time — stub Hooks so the
    // SUT's `import { MODULE_ID } from '../module.js'` does not throw ReferenceError.
    vi.stubGlobal('Hooks', { once: vi.fn(), on: vi.fn() });
    gameMock = makeGameMock('it');
    vi.stubGlobal('game', gameMock);
    uiInfo = vi.fn();
    uiError = vi.fn();
    vi.stubGlobal('ui', { notifications: { info: uiInfo, error: uiError } });
  });

  it('BridgeConfigModal class is exported', async () => {
    const { BridgeConfigModal } = await import('./BridgeConfigModal.js');
    expect(BridgeConfigModal).toBeDefined();
    expect(typeof BridgeConfigModal).toBe('function');
  });

  describe('_prepareContext() pre-load', () => {
    it('returns the saved bridgeUrl + internalSecret (hasSecret=true when secret present)', async () => {
      gameMock._store.set('evenfoundryvtt.bridgeUrl', 'https://bridge.example.com:8910');
      gameMock._store.set('evenfoundryvtt.bridgeInternalSecret', 's3cret-value');

      const { BridgeConfigModal } = await import('./BridgeConfigModal.js');
      const modal = new BridgeConfigModal();
      const data = await modal._prepareContext({});
      expect(data.bridgeUrl).toBe('https://bridge.example.com:8910');
      expect(data.internalSecret).toBe('s3cret-value');
      expect(data.hasSecret).toBe(true);
      expect(data.i18n).toBeDefined();
    });

    it("returns '' for both when unset (hasSecret=false)", async () => {
      const { BridgeConfigModal } = await import('./BridgeConfigModal.js');
      const modal = new BridgeConfigModal();
      const data = await modal._prepareContext({});
      expect(data.bridgeUrl).toBe('');
      expect(data.internalSecret).toBe('');
      expect(data.hasSecret).toBe(false);
    });

    it('coerces a non-string saved value to an empty string', async () => {
      // Defensive: a corrupted setting value should not leak a non-string into the template.
      gameMock._store.set('evenfoundryvtt.bridgeUrl', 12345 as unknown);
      const { BridgeConfigModal } = await import('./BridgeConfigModal.js');
      const modal = new BridgeConfigModal();
      const data = await modal._prepareContext({});
      expect(data.bridgeUrl).toBe('');
    });
  });

  describe('_onClickSave()', () => {
    /** Builds a fake form element exposing the two named inputs. */
    function stubFormInputs(
      modal: RenderableModal,
      url: string,
      secret: string,
    ): { urlInput: { value: string }; secretInput: { value: string; type: string } } {
      const urlInput = { value: url };
      const secretInput = { value: secret, type: 'password' };
      modal.element = {
        querySelector: (sel: string) => {
          if (sel.includes('bridgeUrl')) return urlInput;
          if (sel.includes('bridgeInternalSecret')) return secretInput;
          return null;
        },
      } as unknown as HTMLElement;
      return { urlInput, secretInput };
    }

    it('with a valid https URL writes BOTH settings and shows an info notification', async () => {
      const { BridgeConfigModal } = await import('./BridgeConfigModal.js');
      const modal = new BridgeConfigModal() as unknown as RenderableModal;
      const closeSpy = vi
        .spyOn(modal as unknown as { close: () => Promise<void> }, 'close')
        .mockResolvedValue(undefined);
      stubFormInputs(modal, 'https://bridge.example.com:8910', 'my-secret');

      const event = { preventDefault: vi.fn() } as unknown as Event;
      await modal._onClickSave(event);

      expect(gameMock.settings.set).toHaveBeenCalledWith(
        'evenfoundryvtt',
        'bridgeUrl',
        'https://bridge.example.com:8910',
      );
      expect(gameMock.settings.set).toHaveBeenCalledWith(
        'evenfoundryvtt',
        'bridgeInternalSecret',
        'my-secret',
      );
      expect(uiInfo).toHaveBeenCalled();
      expect(uiError).not.toHaveBeenCalled();
      expect(closeSpy).toHaveBeenCalled();
    });

    it('preserves the exact secret value (no trimming) on save', async () => {
      const { BridgeConfigModal } = await import('./BridgeConfigModal.js');
      const modal = new BridgeConfigModal() as unknown as RenderableModal;
      vi.spyOn(modal as unknown as { close: () => Promise<void> }, 'close').mockResolvedValue(
        undefined,
      );
      stubFormInputs(modal, 'https://bridge.example.com:8910', '  spaced secret  ');

      await modal._onClickSave({ preventDefault: vi.fn() } as unknown as Event);

      expect(gameMock.settings.set).toHaveBeenCalledWith(
        'evenfoundryvtt',
        'bridgeInternalSecret',
        '  spaced secret  ',
      );
    });

    it('with an invalid URL calls ui.notifications.error and does NOT write any setting', async () => {
      const { BridgeConfigModal } = await import('./BridgeConfigModal.js');
      const modal = new BridgeConfigModal() as unknown as RenderableModal;
      vi.spyOn(modal as unknown as { close: () => Promise<void> }, 'close').mockResolvedValue(
        undefined,
      );
      stubFormInputs(modal, 'not-a-url', 'my-secret');

      await modal._onClickSave({ preventDefault: vi.fn() } as unknown as Event);

      expect(uiError).toHaveBeenCalled();
      expect(gameMock.settings.set).not.toHaveBeenCalled();
      expect(uiInfo).not.toHaveBeenCalled();
    });
  });
});
