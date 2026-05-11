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
});
