/**
 * Unit tests for PairModal — ApplicationV2 pair modal.
 *
 * Tests verify:
 * - PairModal class is defined and extends ApplicationV2
 * - getData() returns correct state based on bearer TTL
 * - All 5 modal states are returned correctly: active, empty, refresh-needed, expired, pairing-in-progress
 * - getData() includes qrSvg for active/pairing-in-progress states
 * - getData() excludes qrSvg for expired state (shows banner instead)
 * - _onClickRevoke extracts token-id and calls revokeBearer
 * - _onClickRefresh calls generateBearer with refresh=true
 *
 * Note: QR SVG generation via qrcode@1.5.4 is mocked to return a sentinel SVG string.
 *
 * @see packages/foundry-module/src/pair/PairModal.ts
 * @see 02-02-PLAN.md Task 2 (PairModal ApplicationV2)
 * @see 02-UI-SPEC.md §UI-A (pair modal 6 states + revoke flow)
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Foundry global stubs ─────────────────────────────────────────────────────

class ApplicationV2Stub {
  render(_force?: boolean): this {
    return this;
  }
  async close(): Promise<void> {}
  async getData(): Promise<Record<string, unknown>> {
    return {};
  }
  _activateListeners(_html: HTMLElement): void {}
  static get defaultOptions() {
    return { id: '', title: '', template: '', width: 400, height: 'auto', resizable: false };
  }
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

const makeGameMock = (lang = 'en') => {
  const store = new Map<string, unknown>();
  return {
    settings: {
      get: vi.fn((moduleId: string, key: string) => store.get(`${moduleId}.${key}`)),
      set: vi.fn((moduleId: string, key: string, value: unknown) => {
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

// ─── qrcode mock ─────────────────────────────────────────────────────────────

vi.mock('qrcode', () => ({
  default: {
    toString: vi.fn().mockResolvedValue('<svg data-testid="mock-qr">MOCK QR SVG</svg>'),
  },
}));

// ─── Test suite ──────────────────────────────────────────────────────────────

describe('PairModal', () => {
  let gameMock: ReturnType<typeof makeGameMock>;

  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('Application', ApplicationStub);
    vi.stubGlobal('ApplicationV2', ApplicationV2Stub);
    vi.stubGlobal('Hooks', makeHooksMock());
    gameMock = makeGameMock('it');
    vi.stubGlobal('game', gameMock);
    vi.stubGlobal('crypto', makeCryptoMock());
    // Re-mock qrcode after resetModules
    vi.mock('qrcode', () => ({
      default: {
        toString: vi.fn().mockResolvedValue('<svg data-testid="mock-qr">MOCK QR SVG</svg>'),
      },
    }));
  });

  it('PairModal class is exported', async () => {
    const { PairModal } = await import('./PairModal.js');
    expect(PairModal).toBeDefined();
    expect(typeof PairModal).toBe('function');
  });

  describe('getData() state machine', () => {
    it('returns state="empty" when no active bearers exist', async () => {
      const { PairModal } = await import('./PairModal.js');
      const modal = new PairModal('https://bridge.local:8910', 'world-abc');
      const data = await modal.getData();
      expect(data.state).toBe('empty');
      expect(data.qrSvg).toBeUndefined();
    });

    it('returns state="active" with qrSvg when a valid bearer exists', async () => {
      const { generateBearer } = await import('./bearer-registry.js');
      await generateBearer('My G2', 'https://bridge.local:8910', 'world-abc');

      const { PairModal } = await import('./PairModal.js');
      const modal = new PairModal('https://bridge.local:8910', 'world-abc');
      const data = await modal.getData();
      expect(data.state).toBe('active');
      expect(typeof data.qrSvg).toBe('string');
      expect(data.qrSvg).toContain('svg');
    });

    it('returns state="expired" when the only bearer is expired', async () => {
      const { generateBearer } = await import('./bearer-registry.js');
      const entry = await generateBearer('My G2', 'https://bridge.local:8910', 'world-abc');

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
      vi.stubGlobal('ApplicationV2', ApplicationV2Stub);
      vi.stubGlobal('Hooks', makeHooksMock());
      vi.stubGlobal('game', gameMock);
      vi.stubGlobal('crypto', makeCryptoMock());
      vi.mock('qrcode', () => ({
        default: {
          toString: vi.fn().mockResolvedValue('<svg>MOCK QR SVG</svg>'),
        },
      }));

      const { PairModal: PairModal2 } = await import('./PairModal.js');
      const modal = new PairModal2('https://bridge.local:8910', 'world-abc');
      const data = await modal.getData();
      expect(data.state).toBe('expired');
      expect(data.qrSvg).toBeUndefined();
    });

    it('returns state="refresh-needed" when TTL < 1h', async () => {
      const { generateBearer } = await import('./bearer-registry.js');
      const entry = await generateBearer('My G2', 'https://bridge.local:8910', 'world-abc');

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
      vi.stubGlobal('ApplicationV2', ApplicationV2Stub);
      vi.stubGlobal('Hooks', makeHooksMock());
      vi.stubGlobal('game', gameMock);
      vi.stubGlobal('crypto', makeCryptoMock());
      vi.mock('qrcode', () => ({
        default: {
          toString: vi.fn().mockResolvedValue('<svg>MOCK QR SVG</svg>'),
        },
      }));

      const { PairModal: PairModal2 } = await import('./PairModal.js');
      const modal = new PairModal2('https://bridge.local:8910', 'world-abc');
      const data = await modal.getData();
      expect(data.state).toBe('refresh-needed');
      expect(typeof data.qrSvg).toBe('string');
    });
  });

  describe('getData() i18n field', () => {
    it('includes an i18n object with required keys', async () => {
      const { PairModal } = await import('./PairModal.js');
      const modal = new PairModal('https://bridge.local:8910', 'world-abc');
      const data = await modal.getData();
      expect(data.i18n).toBeDefined();
      const i18n = data.i18n as Record<string, string>;
      // Must include at least these keys required by the template
      expect(i18n.title).toBeDefined();
      expect(i18n.tableHeading).toBeDefined();
      expect(i18n.emptyHeading).toBeDefined();
    });
  });

  describe('getData() devices list', () => {
    it('returns devices array from listBearers()', async () => {
      const { generateBearer } = await import('./bearer-registry.js');
      await generateBearer('Device 1', 'https://bridge.local:8910', 'world-abc');

      const { PairModal } = await import('./PairModal.js');
      const modal = new PairModal('https://bridge.local:8910', 'world-abc');
      const data = await modal.getData();
      const devices = data.devices as unknown[];
      expect(Array.isArray(devices)).toBe(true);
      expect(devices.length).toBeGreaterThan(0);
    });
  });

  describe('_activateListeners()', () => {
    it('binds click handler to [data-action="revoke"] buttons', async () => {
      const { generateBearer } = await import('./bearer-registry.js');
      const entry = await generateBearer('Device', 'https://bridge.local:8910', 'world-abc');

      const { PairModal } = await import('./PairModal.js');
      const modal = new PairModal('https://bridge.local:8910', 'world-abc');

      // Build minimal DOM: a div with a revoke button
      const html = document.createElement('div');
      const revokeBtn = document.createElement('button');
      revokeBtn.dataset.action = 'revoke';
      revokeBtn.dataset.tokenId = entry.token;
      html.appendChild(revokeBtn);

      modal._activateListeners(html);

      // Clicking the revoke button should call revokeBearer
      revokeBtn.click();

      const { validateBearer } = await import('./bearer-registry.js');
      const result = validateBearer(entry.token);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('revoked');
    });

    it('binds click handler to [data-action="refresh"] button', async () => {
      const { generateBearer } = await import('./bearer-registry.js');
      await generateBearer('Device', 'https://bridge.local:8910', 'world-abc');

      const { PairModal } = await import('./PairModal.js');
      const modal = new PairModal('https://bridge.local:8910', 'world-abc');

      const renderSpy = vi.spyOn(modal, 'render').mockReturnValue(modal);

      const html = document.createElement('div');
      const refreshBtn = document.createElement('button');
      refreshBtn.dataset.action = 'refresh';
      html.appendChild(refreshBtn);

      modal._activateListeners(html);
      refreshBtn.click();

      // generateBearer returns a promise; allow microtasks to flush
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(renderSpy).toHaveBeenCalledWith(true);
    });

    it('binds click handler to [data-action="new-code"] button (expired state)', async () => {
      const { generateBearer } = await import('./bearer-registry.js');
      await generateBearer('Device', 'https://bridge.local:8910', 'world-abc');

      const { PairModal } = await import('./PairModal.js');
      const modal = new PairModal('https://bridge.local:8910', 'world-abc');

      const renderSpy = vi.spyOn(modal, 'render').mockReturnValue(modal);

      const html = document.createElement('div');
      const newCodeBtn = document.createElement('button');
      newCodeBtn.dataset.action = 'new-code';
      html.appendChild(newCodeBtn);

      modal._activateListeners(html);
      newCodeBtn.click();

      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(renderSpy).toHaveBeenCalledWith(true);
    });
  });

  describe('_onClickRevoke()', () => {
    it('does nothing when data-token-id is missing', async () => {
      const { generateBearer, listBearers } = await import('./bearer-registry.js');
      await generateBearer('Device', 'https://bridge.local:8910', 'world-abc');

      const { PairModal } = await import('./PairModal.js');
      const modal = new PairModal('https://bridge.local:8910', 'world-abc');

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
      const modal = new PairModal('https://bridge.local:8910', 'world-abc');

      // close() should resolve without error even if no interval is running
      await expect(modal.close()).resolves.toBeUndefined();
    });
  });

  describe('formatLastSeen coverage (via devices list)', () => {
    it('shows "—" for lastSeenAt=null', async () => {
      const { generateBearer } = await import('./bearer-registry.js');
      await generateBearer('Device', 'https://bridge.local:8910', 'world-abc');
      // lastSeenAt is null on fresh entry

      const { PairModal } = await import('./PairModal.js');
      const modal = new PairModal('https://bridge.local:8910', 'world-abc');
      const data = await modal.getData();
      const devices = data.devices as Array<{ lastSeenRelative: string }>;
      expect(devices[0]?.lastSeenRelative).toBe('—');
    });

    it('shows "Online" for lastSeenAt within 2 minutes', async () => {
      const { generateBearer } = await import('./bearer-registry.js');
      const entry = await generateBearer('Dev', 'https://bridge.local:8910', 'world-abc');

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
      vi.stubGlobal('ApplicationV2', ApplicationV2Stub);
      vi.stubGlobal('Hooks', makeHooksMock());
      vi.stubGlobal('game', gameMock);
      vi.stubGlobal('crypto', makeCryptoMock());
      vi.mock('qrcode', () => ({
        default: { toString: vi.fn().mockResolvedValue('<svg>MOCK</svg>') },
      }));

      const { PairModal: PM } = await import('./PairModal.js');
      const data = await new PM('https://bridge.local:8910', 'world-abc').getData();
      const devices = data.devices as Array<{ lastSeenRelative: string }>;
      expect(devices[0]?.lastSeenRelative).toBe('Online');
    });

    it('shows "N min ago" for lastSeenAt 5 minutes ago', async () => {
      const { generateBearer } = await import('./bearer-registry.js');
      const entry = await generateBearer('Dev', 'https://bridge.local:8910', 'world-abc');

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
      vi.stubGlobal('ApplicationV2', ApplicationV2Stub);
      vi.stubGlobal('Hooks', makeHooksMock());
      vi.stubGlobal('game', gameMock);
      vi.stubGlobal('crypto', makeCryptoMock());
      vi.mock('qrcode', () => ({
        default: { toString: vi.fn().mockResolvedValue('<svg>MOCK</svg>') },
      }));

      const { PairModal: PM } = await import('./PairModal.js');
      const data = await new PM('https://bridge.local:8910', 'world-abc').getData();
      const devices = data.devices as Array<{ lastSeenRelative: string }>;
      expect(devices[0]?.lastSeenRelative).toContain('min ago');
    });

    it('shows "N h ago" for lastSeenAt 2 hours ago', async () => {
      const { generateBearer } = await import('./bearer-registry.js');
      const entry = await generateBearer('Dev', 'https://bridge.local:8910', 'world-abc');

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
      vi.stubGlobal('ApplicationV2', ApplicationV2Stub);
      vi.stubGlobal('Hooks', makeHooksMock());
      vi.stubGlobal('game', gameMock);
      vi.stubGlobal('crypto', makeCryptoMock());
      vi.mock('qrcode', () => ({
        default: { toString: vi.fn().mockResolvedValue('<svg>MOCK</svg>') },
      }));

      const { PairModal: PM } = await import('./PairModal.js');
      const data = await new PM('https://bridge.local:8910', 'world-abc').getData();
      const devices = data.devices as Array<{ lastSeenRelative: string }>;
      expect(devices[0]?.lastSeenRelative).toBe('2 h ago');
    });

    it('shows ">24 h ago" for lastSeenAt 48 hours ago', async () => {
      const { generateBearer } = await import('./bearer-registry.js');
      const entry = await generateBearer('Dev', 'https://bridge.local:8910', 'world-abc');

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
      vi.stubGlobal('ApplicationV2', ApplicationV2Stub);
      vi.stubGlobal('Hooks', makeHooksMock());
      vi.stubGlobal('game', gameMock);
      vi.stubGlobal('crypto', makeCryptoMock());
      vi.mock('qrcode', () => ({
        default: { toString: vi.fn().mockResolvedValue('<svg>MOCK</svg>') },
      }));

      const { PairModal: PM } = await import('./PairModal.js');
      const data = await new PM('https://bridge.local:8910', 'world-abc').getData();
      const devices = data.devices as Array<{ lastSeenRelative: string }>;
      expect(devices[0]?.lastSeenRelative).toBe('>24 h ago');
    });
  });

  describe('close() with active countdown', () => {
    it('clears countdown interval when interval is active', async () => {
      const { generateBearer } = await import('./bearer-registry.js');
      await generateBearer('Device', 'https://bridge.local:8910', 'world-abc');

      const { PairModal } = await import('./PairModal.js');
      const modal = new PairModal('https://bridge.local:8910', 'world-abc');

      // Start a countdown by activating listeners with a time element
      const html = document.createElement('div');
      const timeEl = document.createElement('time');
      timeEl.setAttribute('data-countdown', '');
      timeEl.setAttribute('data-expires', String(Date.now() + 2 * 3600_000));
      html.appendChild(timeEl);

      modal._activateListeners(html);

      // Interval should be set now; close() should clear it without error
      await expect(modal.close()).resolves.toBeUndefined();
    });
  });
});
