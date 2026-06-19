/**
 * Unit tests for PairModal — ApplicationV2 pair modal.
 *
 * Tests verify:
 * - PairModal class is defined and extends ApplicationV2
 * - _prepareContext() returns correct state based on bearer TTL
 * - All 5 modal states are returned correctly: active, empty, refresh-needed, expired, pairing-in-progress
 * - _prepareContext() includes copyable bridgeUrl + token for active/refresh-needed states
 * - _prepareContext() excludes credentials for expired/empty state (banner / empty copy instead)
 * - _prepareContext() populates boolean flags (isEmpty, isExpired, isRefreshNeeded, isPairing, showCredentials)
 * - _prepareContext() populates expiresAtMs (epoch ms, not ISO) for active states
 * - _prepareContext() i18n includes expiresIn and close keys (regression for missing-key defects)
 * - _onClickRevoke extracts token-id and calls revokeBearer
 * - _onClickRefresh (self-service) writes a pendingPair flag with a client-generated
 *   token and does NOT call generateBearer directly (ADR-0014 self-service pairing)
 * - empty state exposes new-code button wiring via _onRender
 *
 * Pairing model: no QR — the token + bridge URL are rendered as copyable text (token masked
 * by default). The Even Hub platform has no camera/QR-scan API for apps (ADR-0005 §OQ-INV2-4).
 *
 * @see packages/foundry-module/src/pair/PairModal.ts
 * @see 02-02-PLAN.md Task 2 (PairModal ApplicationV2)
 * @see 02-UI-SPEC.md §UI-A (pair modal 6 states + revoke flow)
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

class ApplicationStub {
  get title(): string {
    return '';
  }
}

const makeHooksMock = () => ({
  once: vi.fn(),
  on: vi.fn(),
});

const makeGameMock = (
  lang = 'en',
  users: Array<{ id: string; name: string; isGM: boolean }> = [
    { id: 'user-gm', name: 'Gamemaster', isGM: true },
    { id: 'user-aiacos', name: 'Aiacos', isGM: false },
    { id: 'user-bea', name: 'Bea', isGM: false },
  ],
) => {
  const store = new Map<string, unknown>();
  // Pre-seed the bridgeUrl world setting so the no-arg PairModal (the real registerMenu
  // path) reads a real value instead of `undefined`. The world ID comes from game.world.id.
  store.set('evenfoundryvtt.bridgeUrl', 'https://bridge.local:8910');
  // Self-service pairing: the modal is now CURRENT-USER scoped. `game.user.id` is
  // 'user-1' — the same userId the tests bind their bearers to via generateBearer —
  // so `currentUserBearers()` sees them. The flag store backs the pendingPair flow.
  const flagStore = new Map<string, unknown>();
  return {
    settings: {
      get: vi.fn((moduleId: string, key: string) => store.get(`${moduleId}.${key}`)),
      set: vi.fn((moduleId: string, key: string, value: unknown) => {
        store.set(`${moduleId}.${key}`, value);
      }),
      register: vi.fn(),
      registerMenu: vi.fn(),
    },
    world: { id: 'world-abc' },
    // Self-service: the current Foundry user (mints bearers bound to their own id).
    user: {
      id: 'user-1',
      name: 'Aiacos',
      isGM: true,
      getFlag: vi.fn((scope: string, key: string) => flagStore.get(`${scope}.${key}`)),
      setFlag: vi.fn(async (scope: string, key: string, value: unknown) => {
        flagStore.set(`${scope}.${key}`, value);
      }),
      unsetFlag: vi.fn(async (scope: string, key: string) => {
        flagStore.delete(`${scope}.${key}`);
      }),
    },
    // Kept for any roster reads; no longer drives a pairing user-picker (removed).
    users: { contents: users },
    i18n: {
      lang,
      localize: vi.fn((k: string) => k),
    },
    _store: store,
    _flagStore: flagStore,
  };
};

function makeCryptoMock() {
  let callCount = 0;
  return {
    getRandomValues: (arr: Uint8Array) => {
      const seed = callCount++;
      for (let i = 0; i < arr.length; i++) {
        arr[i] = ((i * 37 + seed * 13 + 7) * 251) % 256;
      }
      return arr;
    },
  };
}

// ─── Test suite ──────────────────────────────────────────────────────────────

/**
 * Renderable view of a PairModal instance. The Foundry `HandlebarsApplicationMixin`
 * is not described by the local type declarations (`foundry.applications.api` lacks it),
 * so the mixed-in `element` / `render` / `_onRender` members are invisible on the
 * `PairModal` static type. This view restores them for test wiring only.
 */
interface RenderableModal {
  element: HTMLElement;
  render(options?: unknown): unknown;
  _onRender(context: unknown, options: unknown): void;
  close(options?: unknown): Promise<void>;
}

describe('PairModal', () => {
  let gameMock: ReturnType<typeof makeGameMock>;

  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('Application', ApplicationStub);
    vi.stubGlobal('foundry', {
      applications: {
        api: {
          ApplicationV2: ApplicationV2Stub,
          HandlebarsApplicationMixin: (Base: unknown) => Base,
        },
      },
    });
    vi.stubGlobal('Hooks', makeHooksMock());
    gameMock = makeGameMock('it');
    vi.stubGlobal('game', gameMock);
    vi.stubGlobal('crypto', makeCryptoMock());
  });

  it('PairModal class is exported', async () => {
    const { PairModal } = await import('./PairModal.js');
    expect(PairModal).toBeDefined();
    expect(typeof PairModal).toBe('function');
  });

  describe('_prepareContext() state machine', () => {
    it('returns state="empty" when no active bearers exist', async () => {
      const { PairModal } = await import('./PairModal.js');
      const modal = new PairModal();
      const data = await modal._prepareContext({});
      expect(data.state).toBe('empty');
      expect(data.token).toBeUndefined();
      expect(data.bridgeUrl).toBeUndefined();
    });

    it('returns state="active" with copyable token + bridgeUrl when a valid bearer exists', async () => {
      const { generateBearer } = await import('./bearer-registry.js');
      const entry = await generateBearer(
        'My G2',
        'https://bridge.local:8910',
        'world-abc',
        'user-1',
      );

      const { PairModal } = await import('./PairModal.js');
      const modal = new PairModal();
      const data = await modal._prepareContext({});
      expect(data.state).toBe('active');
      expect(data.token).toBe(entry.token);
      expect(data.bridgeUrl).toBe('https://bridge.local:8910');
    });

    // Regression (260614 review): registerMenu instantiates PairModal with `new type()`
    // (NO args). The old `constructor(bridgeUrl, worldId)` left those fields `undefined`,
    // so the bridge URL rendered as `undefined`. The no-arg modal must read the real
    // bridgeUrl from settings + the world ID from game.world.id at render time.
    it('no-arg construction (real registerMenu path) yields the bridgeUrl from settings, not undefined', async () => {
      const { generateBearer } = await import('./bearer-registry.js');
      const entry = await generateBearer(
        'My G2',
        'https://bridge.local:8910',
        'world-abc',
        'user-1',
      );

      // Construct via the REAL Foundry path: `new PairModal()` with no arguments.
      const { PairModal } = await import('./PairModal.js');
      const modal = new PairModal();
      const data = await modal._prepareContext({});

      // The bridge URL must come from the `bridgeUrl` world setting (seeded in makeGameMock),
      // never `undefined`.
      expect(data.bridgeUrl).toBe('https://bridge.local:8910');
      expect(data.bridgeUrl).not.toBeUndefined();
      expect(data.token).toBe(entry.token);
      // game.settings.get must have been consulted for the bridgeUrl key (settings-read path).
      expect(gameMock.settings.get).toHaveBeenCalledWith('evenfoundryvtt', 'bridgeUrl');
      // game.world.id is the world identifier surfaced to the bridge (read at render time).
      expect(gameMock.world.id).toBe('world-abc');
    });

    it('no-arg construction renders an empty bridgeUrl (not undefined) when the setting is unset', async () => {
      // Simulate an unset bridgeUrl setting: get() returns undefined for that key.
      gameMock.settings.get.mockImplementation((moduleId: string, key: string) => {
        if (key === 'bridgeUrl') return undefined;
        return gameMock._store.get(`${moduleId}.${key}`);
      });

      const { generateBearer } = await import('./bearer-registry.js');
      await generateBearer('My G2', 'https://bridge.local:8910', 'world-abc', 'user-1');

      const { PairModal } = await import('./PairModal.js');
      const modal = new PairModal();
      const data = await modal._prepareContext({});

      // Graceful fallback: empty string, never the literal `undefined` that the bug produced.
      expect(data.bridgeUrl).toBe('');
      expect(data.bridgeUrl).not.toBeUndefined();
    });

    it('returns state="expired" when the only bearer is expired', async () => {
      const { generateBearer } = await import('./bearer-registry.js');
      const entry = await generateBearer(
        'My G2',
        'https://bridge.local:8910',
        'world-abc',
        'user-1',
      );

      // Force expiration by mutating registry via settings
      const registry = gameMock.settings.get('evenfoundryvtt', 'bearerRegistry') as
        | {
            entries: Record<string, { expiresAt: number }>;
          }
        | undefined;
      if (registry?.entries[entry.token]) {
        // biome-ignore lint/style/noNonNullAssertion: safe — checked above
        registry.entries[entry.token]!.expiresAt = Date.now() - 1000;
        gameMock.settings.set('evenfoundryvtt', 'bearerRegistry', registry);
      }

      vi.resetModules();
      vi.stubGlobal('Application', ApplicationStub);
      vi.stubGlobal('foundry', {
        applications: {
          api: {
            ApplicationV2: ApplicationV2Stub,
            HandlebarsApplicationMixin: (Base: unknown) => Base,
          },
        },
      });
      vi.stubGlobal('Hooks', makeHooksMock());
      vi.stubGlobal('game', gameMock);
      vi.stubGlobal('crypto', makeCryptoMock());

      const { PairModal: PairModal2 } = await import('./PairModal.js');
      const modal = new PairModal2();
      const data = await modal._prepareContext({});
      expect(data.state).toBe('expired');
      expect(data.token).toBeUndefined();
    });

    it('returns state="refresh-needed" when TTL < 1h', async () => {
      const { generateBearer } = await import('./bearer-registry.js');
      const entry = await generateBearer(
        'My G2',
        'https://bridge.local:8910',
        'world-abc',
        'user-1',
      );

      // Set expiresAt to now + 30 minutes (< 1h threshold)
      const registry = gameMock.settings.get('evenfoundryvtt', 'bearerRegistry') as
        | {
            entries: Record<string, { expiresAt: number }>;
          }
        | undefined;
      if (registry?.entries[entry.token]) {
        // biome-ignore lint/style/noNonNullAssertion: safe — checked above
        registry.entries[entry.token]!.expiresAt = Date.now() + 30 * 60 * 1000;
        gameMock.settings.set('evenfoundryvtt', 'bearerRegistry', registry);
      }

      vi.resetModules();
      vi.stubGlobal('Application', ApplicationStub);
      vi.stubGlobal('foundry', {
        applications: {
          api: {
            ApplicationV2: ApplicationV2Stub,
            HandlebarsApplicationMixin: (Base: unknown) => Base,
          },
        },
      });
      vi.stubGlobal('Hooks', makeHooksMock());
      vi.stubGlobal('game', gameMock);
      vi.stubGlobal('crypto', makeCryptoMock());

      const { PairModal: PairModal2 } = await import('./PairModal.js');
      const modal = new PairModal2();
      const data = await modal._prepareContext({});
      expect(data.state).toBe('refresh-needed');
      expect(typeof data.token).toBe('string');
    });
  });

  describe('_prepareContext() boolean flags', () => {
    it('sets isEmpty=true and showCredentials=false for empty state', async () => {
      const { PairModal } = await import('./PairModal.js');
      const modal = new PairModal();
      const data = await modal._prepareContext({});
      expect(data.isEmpty).toBe(true);
      expect(data.isExpired).toBe(false);
      expect(data.isRefreshNeeded).toBe(false);
      expect(data.isPairing).toBe(false);
      expect(data.showCredentials).toBe(false);
    });

    it('sets isEmpty=false, showCredentials=true for active state', async () => {
      const { generateBearer } = await import('./bearer-registry.js');
      await generateBearer('My G2', 'https://bridge.local:8910', 'world-abc', 'user-1');

      const { PairModal } = await import('./PairModal.js');
      const modal = new PairModal();
      const data = await modal._prepareContext({});
      expect(data.isEmpty).toBe(false);
      expect(data.isExpired).toBe(false);
      expect(data.isRefreshNeeded).toBe(false);
      expect(data.isPairing).toBe(false);
      expect(data.showCredentials).toBe(true);
    });

    it('sets isExpired=true and showCredentials=false for expired state', async () => {
      const { generateBearer } = await import('./bearer-registry.js');
      const entry = await generateBearer(
        'My G2',
        'https://bridge.local:8910',
        'world-abc',
        'user-1',
      );

      const registry = gameMock.settings.get('evenfoundryvtt', 'bearerRegistry') as
        | { entries: Record<string, { expiresAt: number }> }
        | undefined;
      if (registry?.entries[entry.token]) {
        // biome-ignore lint/style/noNonNullAssertion: safe — checked above
        registry.entries[entry.token]!.expiresAt = Date.now() - 1000;
        gameMock.settings.set('evenfoundryvtt', 'bearerRegistry', registry);
      }

      vi.resetModules();
      vi.stubGlobal('Application', ApplicationStub);
      vi.stubGlobal('foundry', {
        applications: {
          api: {
            ApplicationV2: ApplicationV2Stub,
            HandlebarsApplicationMixin: (Base: unknown) => Base,
          },
        },
      });
      vi.stubGlobal('Hooks', makeHooksMock());
      vi.stubGlobal('game', gameMock);
      vi.stubGlobal('crypto', makeCryptoMock());

      const { PairModal: PM } = await import('./PairModal.js');
      const data = await new PM()._prepareContext({});
      expect(data.isExpired).toBe(true);
      expect(data.isEmpty).toBe(false);
      expect(data.showCredentials).toBe(false);
    });

    it('sets isRefreshNeeded=true and showCredentials=true for refresh-needed state', async () => {
      const { generateBearer } = await import('./bearer-registry.js');
      const entry = await generateBearer(
        'My G2',
        'https://bridge.local:8910',
        'world-abc',
        'user-1',
      );

      const registry = gameMock.settings.get('evenfoundryvtt', 'bearerRegistry') as
        | { entries: Record<string, { expiresAt: number }> }
        | undefined;
      if (registry?.entries[entry.token]) {
        // biome-ignore lint/style/noNonNullAssertion: safe — checked above
        registry.entries[entry.token]!.expiresAt = Date.now() + 30 * 60 * 1000;
        gameMock.settings.set('evenfoundryvtt', 'bearerRegistry', registry);
      }

      vi.resetModules();
      vi.stubGlobal('Application', ApplicationStub);
      vi.stubGlobal('foundry', {
        applications: {
          api: {
            ApplicationV2: ApplicationV2Stub,
            HandlebarsApplicationMixin: (Base: unknown) => Base,
          },
        },
      });
      vi.stubGlobal('Hooks', makeHooksMock());
      vi.stubGlobal('game', gameMock);
      vi.stubGlobal('crypto', makeCryptoMock());

      const { PairModal: PM } = await import('./PairModal.js');
      const data = await new PM()._prepareContext({});
      expect(data.isRefreshNeeded).toBe(true);
      expect(data.showCredentials).toBe(true);
    });
  });

  describe('_prepareContext() expiresAtMs', () => {
    it('provides expiresAtMs as a number (epoch ms) for active state', async () => {
      const { generateBearer } = await import('./bearer-registry.js');
      await generateBearer('My G2', 'https://bridge.local:8910', 'world-abc', 'user-1');

      const { PairModal } = await import('./PairModal.js');
      const modal = new PairModal();
      const data = await modal._prepareContext({});
      expect(typeof data.expiresAtMs).toBe('number');
      // Must be a future timestamp (epoch ms, not seconds)
      expect(data.expiresAtMs as number).toBeGreaterThan(Date.now());
    });

    it('expiresAtMs is undefined for empty state', async () => {
      const { PairModal } = await import('./PairModal.js');
      const modal = new PairModal();
      const data = await modal._prepareContext({});
      expect(data.expiresAtMs).toBeUndefined();
    });
  });

  describe('_prepareContext() i18n field', () => {
    it('includes an i18n object with required keys', async () => {
      const { PairModal } = await import('./PairModal.js');
      const modal = new PairModal();
      const data = await modal._prepareContext({});
      expect(data.i18n).toBeDefined();
      const i18n = data.i18n as Record<string, string>;
      // Must include at least these keys required by the template
      expect(i18n.title).toBeDefined();
      expect(i18n.tableHeading).toBeDefined();
      expect(i18n.emptyHeading).toBeDefined();
    });

    it('includes expiresIn key in i18n (regression: was missing from buildI18n)', async () => {
      const { PairModal } = await import('./PairModal.js');
      const modal = new PairModal();
      const data = await modal._prepareContext({});
      const i18n = data.i18n as Record<string, string>;
      expect(i18n.expiresIn).toBeDefined();
      // game.i18n.localize is stubbed to return the key unchanged
      expect(i18n.expiresIn).toBe('evf.pair.qr.expires_in');
    });

    it('includes close key in i18n (regression: was missing from buildI18n)', async () => {
      const { PairModal } = await import('./PairModal.js');
      const modal = new PairModal();
      const data = await modal._prepareContext({});
      const i18n = data.i18n as Record<string, string>;
      expect(i18n.close).toBeDefined();
      expect(i18n.close).toBe('evf.pair.modal.close');
    });

    it('includes copy/reveal i18n keys (no missing-key regression for the copy UX)', async () => {
      const { PairModal } = await import('./PairModal.js');
      const modal = new PairModal();
      const data = await modal._prepareContext({});
      const i18n = data.i18n as Record<string, string>;
      expect(i18n.copyInstruction).toBe('evf.pair.copy.instruction');
      expect(i18n.copyBridgeUrl).toBe('evf.pair.copy.bridge_url');
      expect(i18n.copyToken).toBe('evf.pair.copy.token');
      expect(i18n.copyReveal).toBe('evf.pair.copy.reveal');
      expect(i18n.copyHide).toBe('evf.pair.copy.hide');
      expect(i18n.copyButton).toBe('evf.pair.copy.copy');
      expect(i18n.copyCopied).toBe('evf.pair.copy.copied');
    });

    it('does NOT resolve the removed evf.pair.qr.scan_instruction key', async () => {
      const { PairModal } = await import('./PairModal.js');
      const modal = new PairModal();
      const data = await modal._prepareContext({});
      const i18n = data.i18n as Record<string, string>;
      expect(i18n.scanInstruction).toBeUndefined();
    });
  });

  describe('copyable credentials UX', () => {
    it('_onClickReveal toggles token mask/plain visibility and button label', async () => {
      const { PairModal } = await import('./PairModal.js');
      const modal = new PairModal() as unknown as RenderableModal & {
        _onClickReveal(event: Event): void;
      };

      const html = document.createElement('div');
      const mask = document.createElement('code');
      mask.setAttribute('data-token-mask', '');
      const plain = document.createElement('code');
      plain.setAttribute('data-token-plain', '');
      plain.classList.add('evf-hidden');
      const revealBtn = document.createElement('button');
      revealBtn.dataset.action = 'reveal-token';
      html.append(mask, plain, revealBtn);

      modal.element = html;
      modal._onRender({}, {});

      // Initially hidden
      expect(plain.classList.contains('evf-hidden')).toBe(true);
      revealBtn.click();
      expect(plain.classList.contains('evf-hidden')).toBe(false);
      expect(mask.classList.contains('evf-hidden')).toBe(true);
      // Toggle back
      revealBtn.click();
      expect(plain.classList.contains('evf-hidden')).toBe(true);
    });

    it('_onClickCopy writes data-copy-value to the clipboard', async () => {
      const writeText = vi.fn(async () => undefined);
      vi.stubGlobal('navigator', { clipboard: { writeText } });

      const { PairModal } = await import('./PairModal.js');
      const modal = new PairModal() as unknown as RenderableModal;

      const html = document.createElement('div');
      const copyBtn = document.createElement('button');
      copyBtn.dataset.action = 'copy';
      copyBtn.dataset.copyValue = 'my-secret-token';
      html.appendChild(copyBtn);

      modal.element = html;
      modal._onRender({}, {});
      copyBtn.click();

      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(writeText).toHaveBeenCalledWith('my-secret-token');
    });
  });

  describe('_prepareContext() devices list', () => {
    it('returns devices array from listBearers()', async () => {
      const { generateBearer } = await import('./bearer-registry.js');
      await generateBearer('Device 1', 'https://bridge.local:8910', 'world-abc', 'user-1');

      const { PairModal } = await import('./PairModal.js');
      const modal = new PairModal();
      const data = await modal._prepareContext({});
      const devices = data.devices as unknown[];
      expect(Array.isArray(devices)).toBe(true);
      expect(devices.length).toBeGreaterThan(0);
    });
  });

  // ── Self-service pairing: no user picker; bind to the CURRENT user ────────────

  describe('_prepareContext() self-service (ADR-0014)', () => {
    it('no longer exposes a user-selector list (the dropdown was removed)', async () => {
      const { PairModal } = await import('./PairModal.js');
      const modal = new PairModal();
      const data = await modal._prepareContext({});
      expect((data as { users?: unknown }).users).toBeUndefined();
    });

    it('scopes credentials to the CURRENT user — a bearer bound to another user is ignored', async () => {
      const { generateBearer } = await import('./bearer-registry.js');
      // Bearer bound to a DIFFERENT user than game.user.id ('user-1').
      await generateBearer('Other G2', 'https://bridge.local:8910', 'world-abc', 'user-2');

      const { PairModal } = await import('./PairModal.js');
      const data = await new PairModal()._prepareContext({});
      // No current-user bearer and no pending flag → empty.
      expect(data.state).toBe('empty');
      expect(data.devices).toEqual([]);
    });

    it('active state sets isActive + exposes the regenerate CTA label (generate-new button)', async () => {
      const { generateBearer } = await import('./bearer-registry.js');
      // Bearer bound to the current user (user-1) → active state.
      await generateBearer('My G2', 'https://bridge.local:8910', 'world-abc', 'user-1');

      const { PairModal } = await import('./PairModal.js');
      const data = await new PairModal()._prepareContext({});
      expect(data.state).toBe('active');
      expect(data.isActive).toBe(true);
      // The "generate new token" label is resolved (template gates the data-action="new-code"
      // button on isActive so the active state is no longer Revoke-only).
      expect((data.i18n as Record<string, string>).regenerate).toBeDefined();
    });

    it('surfaces a pending-pair flag as state="pairing-in-progress" with the flag token', async () => {
      vi.stubGlobal('game', gameMock);
      // Seed a pending-pair flag on the current user (the self-service mint).
      await gameMock.user.setFlag('evenfoundryvtt', 'pendingPair', {
        alias: 'My G2',
        token: 'pending-token-xyz',
        bridgeUrl: 'https://bridge.local:8910',
        worldId: 'world-abc',
        createdAt: Date.now(),
      });

      const { PairModal } = await import('./PairModal.js');
      const data = await new PairModal()._prepareContext({});
      expect(data.state).toBe('pairing-in-progress');
      expect(data.isPairing).toBe(true);
      expect(data.showCredentials).toBe(true);
      expect(data.token).toBe('pending-token-xyz');
      expect(data.bridgeUrl).toBe('https://bridge.local:8910');
    });
  });

  describe('_onClickRefresh() self-service mint (ADR-0014)', () => {
    it('writes a pendingPair flag with a client-generated token and does NOT call generateBearer', async () => {
      const registry = await import('./bearer-registry.js');
      const genSpy = vi.spyOn(registry, 'generateBearer');

      const { PairModal } = await import('./PairModal.js');
      const modal = new PairModal() as unknown as RenderableModal & {
        _onClickRefresh(e: Event): void;
      };
      modal.element = document.createElement('div');

      modal._onClickRefresh(new Event('click'));
      // Allow the async _generateForSelf microtasks to flush.
      await Promise.resolve();
      await Promise.resolve();

      // No direct registry write (a non-GM player cannot write the world setting).
      expect(genSpy).not.toHaveBeenCalled();
      // A pendingPair flag was written on the current user with a non-empty token.
      expect(gameMock.user.setFlag).toHaveBeenCalledWith(
        'evenfoundryvtt',
        'pendingPair',
        expect.objectContaining({
          token: expect.any(String),
          bridgeUrl: 'https://bridge.local:8910',
          worldId: 'world-abc',
        }),
      );
      const written = gameMock._flagStore.get('evenfoundryvtt.pendingPair') as { token: string };
      expect(written.token.length).toBeGreaterThan(0);
      genSpy.mockRestore();
    });
  });

  describe('_onRender()', () => {
    it('binds click handler to [data-action="revoke"] buttons', async () => {
      const { generateBearer } = await import('./bearer-registry.js');
      const entry = await generateBearer(
        'Device',
        'https://bridge.local:8910',
        'world-abc',
        'user-1',
      );

      const { PairModal } = await import('./PairModal.js');
      const modal = new PairModal() as unknown as RenderableModal;

      // Build minimal DOM: a div with a revoke button
      const html = document.createElement('div');
      const revokeBtn = document.createElement('button');
      revokeBtn.dataset.action = 'revoke';
      revokeBtn.dataset.tokenId = entry.token;
      html.appendChild(revokeBtn);

      // _onRender reads this.element (root content element after ApplicationV2 render)
      modal.element = html;
      modal._onRender({}, {});

      // Clicking the revoke button should call revokeBearer
      revokeBtn.click();

      const { validateBearer } = await import('./bearer-registry.js');
      const result = validateBearer(entry.token);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('revoked');
    });

    it('binds click handler to [data-action="refresh"] button', async () => {
      const { generateBearer } = await import('./bearer-registry.js');
      await generateBearer('Device', 'https://bridge.local:8910', 'world-abc', 'user-1');

      const { PairModal } = await import('./PairModal.js');
      const modal = new PairModal() as unknown as RenderableModal;

      const renderSpy = vi.spyOn(modal, 'render').mockReturnValue(modal);

      const html = document.createElement('div');
      const refreshBtn = document.createElement('button');
      refreshBtn.dataset.action = 'refresh';
      html.appendChild(refreshBtn);

      modal.element = html;
      modal._onRender({}, {});
      refreshBtn.click();

      // generateBearer returns a promise; allow microtasks to flush
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(renderSpy).toHaveBeenCalledWith({ force: true });
    });

    it('binds click handler to [data-action="new-code"] button (expired state)', async () => {
      const { generateBearer } = await import('./bearer-registry.js');
      await generateBearer('Device', 'https://bridge.local:8910', 'world-abc', 'user-1');

      const { PairModal } = await import('./PairModal.js');
      const modal = new PairModal() as unknown as RenderableModal;

      const renderSpy = vi.spyOn(modal, 'render').mockReturnValue(modal);

      const html = document.createElement('div');
      const newCodeBtn = document.createElement('button');
      newCodeBtn.dataset.action = 'new-code';
      html.appendChild(newCodeBtn);

      modal.element = html;
      modal._onRender({}, {});
      newCodeBtn.click();

      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(renderSpy).toHaveBeenCalledWith({ force: true });
    });

    it('binds click handler to [data-action="new-code"] button (empty state — first pairing)', async () => {
      // Empty state: no bearers at all. The empty-state section must still wire new-code.
      const { PairModal } = await import('./PairModal.js');
      const modal = new PairModal() as unknown as RenderableModal;

      const renderSpy = vi.spyOn(modal, 'render').mockReturnValue(modal);

      const html = document.createElement('div');
      const newCodeBtn = document.createElement('button');
      newCodeBtn.dataset.action = 'new-code';
      html.appendChild(newCodeBtn);

      modal.element = html;
      modal._onRender({}, {});
      newCodeBtn.click();

      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(renderSpy).toHaveBeenCalledWith({ force: true });
    });
  });

  describe('_onClickRevoke()', () => {
    it('does nothing when data-token-id is missing', async () => {
      const { generateBearer, listBearers } = await import('./bearer-registry.js');
      await generateBearer('Device', 'https://bridge.local:8910', 'world-abc', 'user-1');

      const { PairModal } = await import('./PairModal.js');
      const modal = new PairModal();

      const btn = document.createElement('button');
      // No dataset.tokenId
      const event = new MouseEvent('click', { bubbles: true });
      Object.defineProperty(event, 'currentTarget', { value: btn, configurable: true });

      modal._onClickRevoke(event);

      // Nothing should be revoked
      expect(listBearers().length).toBe(1);
    });
  });

  describe('close()', () => {
    it('clears the countdown interval and calls super.close()', async () => {
      const { PairModal } = await import('./PairModal.js');
      const modal = new PairModal();

      // close() should resolve without error even if no interval is running
      await expect(modal.close()).resolves.toBeUndefined();
    });
  });

  describe('formatLastSeen coverage (via devices list)', () => {
    it('shows "—" for lastSeenAt=null', async () => {
      const { generateBearer } = await import('./bearer-registry.js');
      await generateBearer('Device', 'https://bridge.local:8910', 'world-abc', 'user-1');
      // lastSeenAt is null on fresh entry

      const { PairModal } = await import('./PairModal.js');
      const modal = new PairModal();
      const data = await modal._prepareContext({});
      const devices = data.devices as Array<{ lastSeenRelative: string }>;
      expect(devices[0]?.lastSeenRelative).toBe('—');
    });

    it('shows "Online" for lastSeenAt within 2 minutes', async () => {
      const { generateBearer } = await import('./bearer-registry.js');
      const entry = await generateBearer('Dev', 'https://bridge.local:8910', 'world-abc', 'user-1');

      // Mutate lastSeenAt to 30s ago via settings
      const registry = gameMock.settings.get('evenfoundryvtt', 'bearerRegistry') as
        | {
            entries: Record<string, { lastSeenAt: number | null }>;
          }
        | undefined;
      if (registry?.entries[entry.token]) {
        // biome-ignore lint/style/noNonNullAssertion: safe — checked above
        registry.entries[entry.token]!.lastSeenAt = Date.now() - 30_000;
        gameMock.settings.set('evenfoundryvtt', 'bearerRegistry', registry);
      }

      vi.resetModules();
      vi.stubGlobal('Application', ApplicationStub);
      vi.stubGlobal('foundry', {
        applications: {
          api: {
            ApplicationV2: ApplicationV2Stub,
            HandlebarsApplicationMixin: (Base: unknown) => Base,
          },
        },
      });
      vi.stubGlobal('Hooks', makeHooksMock());
      vi.stubGlobal('game', gameMock);
      vi.stubGlobal('crypto', makeCryptoMock());

      const { PairModal: PM } = await import('./PairModal.js');
      const data = await new PM()._prepareContext({});
      const devices = data.devices as Array<{ lastSeenRelative: string }>;
      expect(devices[0]?.lastSeenRelative).toBe('Online');
    });

    it('shows "N min ago" for lastSeenAt 5 minutes ago', async () => {
      const { generateBearer } = await import('./bearer-registry.js');
      const entry = await generateBearer('Dev', 'https://bridge.local:8910', 'world-abc', 'user-1');

      const registry = gameMock.settings.get('evenfoundryvtt', 'bearerRegistry') as
        | {
            entries: Record<string, { lastSeenAt: number | null }>;
          }
        | undefined;
      if (registry?.entries[entry.token]) {
        // biome-ignore lint/style/noNonNullAssertion: safe — checked above
        registry.entries[entry.token]!.lastSeenAt = Date.now() - 5 * 60_000;
        gameMock.settings.set('evenfoundryvtt', 'bearerRegistry', registry);
      }

      vi.resetModules();
      vi.stubGlobal('Application', ApplicationStub);
      vi.stubGlobal('foundry', {
        applications: {
          api: {
            ApplicationV2: ApplicationV2Stub,
            HandlebarsApplicationMixin: (Base: unknown) => Base,
          },
        },
      });
      vi.stubGlobal('Hooks', makeHooksMock());
      vi.stubGlobal('game', gameMock);
      vi.stubGlobal('crypto', makeCryptoMock());

      const { PairModal: PM } = await import('./PairModal.js');
      const data = await new PM()._prepareContext({});
      const devices = data.devices as Array<{ lastSeenRelative: string }>;
      expect(devices[0]?.lastSeenRelative).toContain('min ago');
    });

    it('shows "N h ago" for lastSeenAt 2 hours ago', async () => {
      const { generateBearer } = await import('./bearer-registry.js');
      const entry = await generateBearer('Dev', 'https://bridge.local:8910', 'world-abc', 'user-1');

      const registry = gameMock.settings.get('evenfoundryvtt', 'bearerRegistry') as
        | {
            entries: Record<string, { lastSeenAt: number | null }>;
          }
        | undefined;
      if (registry?.entries[entry.token]) {
        // biome-ignore lint/style/noNonNullAssertion: safe — checked above
        registry.entries[entry.token]!.lastSeenAt = Date.now() - 2 * 3600_000;
        gameMock.settings.set('evenfoundryvtt', 'bearerRegistry', registry);
      }

      vi.resetModules();
      vi.stubGlobal('Application', ApplicationStub);
      vi.stubGlobal('foundry', {
        applications: {
          api: {
            ApplicationV2: ApplicationV2Stub,
            HandlebarsApplicationMixin: (Base: unknown) => Base,
          },
        },
      });
      vi.stubGlobal('Hooks', makeHooksMock());
      vi.stubGlobal('game', gameMock);
      vi.stubGlobal('crypto', makeCryptoMock());

      const { PairModal: PM } = await import('./PairModal.js');
      const data = await new PM()._prepareContext({});
      const devices = data.devices as Array<{ lastSeenRelative: string }>;
      expect(devices[0]?.lastSeenRelative).toBe('2 h ago');
    });

    it('shows ">24 h ago" for lastSeenAt 48 hours ago', async () => {
      const { generateBearer } = await import('./bearer-registry.js');
      const entry = await generateBearer('Dev', 'https://bridge.local:8910', 'world-abc', 'user-1');

      const registry = gameMock.settings.get('evenfoundryvtt', 'bearerRegistry') as
        | {
            entries: Record<string, { lastSeenAt: number | null }>;
          }
        | undefined;
      if (registry?.entries[entry.token]) {
        // biome-ignore lint/style/noNonNullAssertion: safe — checked above
        registry.entries[entry.token]!.lastSeenAt = Date.now() - 48 * 3600_000;
        gameMock.settings.set('evenfoundryvtt', 'bearerRegistry', registry);
      }

      vi.resetModules();
      vi.stubGlobal('Application', ApplicationStub);
      vi.stubGlobal('foundry', {
        applications: {
          api: {
            ApplicationV2: ApplicationV2Stub,
            HandlebarsApplicationMixin: (Base: unknown) => Base,
          },
        },
      });
      vi.stubGlobal('Hooks', makeHooksMock());
      vi.stubGlobal('game', gameMock);
      vi.stubGlobal('crypto', makeCryptoMock());

      const { PairModal: PM } = await import('./PairModal.js');
      const data = await new PM()._prepareContext({});
      const devices = data.devices as Array<{ lastSeenRelative: string }>;
      expect(devices[0]?.lastSeenRelative).toBe('>24 h ago');
    });
  });

  describe('close() with active countdown', () => {
    it('clears countdown interval when interval is active', async () => {
      const { generateBearer } = await import('./bearer-registry.js');
      await generateBearer('Device', 'https://bridge.local:8910', 'world-abc', 'user-1');

      const { PairModal } = await import('./PairModal.js');
      const modal = new PairModal() as unknown as RenderableModal;

      // Start a countdown by rendering with a time element
      const html = document.createElement('div');
      const timeEl = document.createElement('time');
      timeEl.setAttribute('data-countdown', '');
      timeEl.setAttribute('data-expires', String(Date.now() + 2 * 3600_000));
      html.appendChild(timeEl);

      modal.element = html;
      modal._onRender({}, {});

      // Interval should be set now; close() should clear it without error
      await expect(modal.close()).resolves.toBeUndefined();
    });
  });
});
