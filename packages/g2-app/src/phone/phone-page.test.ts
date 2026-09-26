import { describe, expect, it, vi } from 'vitest';
import { createDebugLog, setActiveDebugLog } from '../debug/debug-log.js';
import { settle } from '../direct/__fixtures__/direct-fixtures.js';
import type { SessionInfo } from '../direct/session.js';
import { type AppState, createAppStore, initialState } from '../state/app-store.js';
import { phoneStrings } from './i18n.js';
import { DEBUG_TAIL, mountPhonePage, type PhoneSession, statusLine } from './phone-page.js';

function fakeSession(overrides: Partial<PhoneSession> = {}) {
  let info: SessionInfo = { latencyMs: null, moduleVersion: null, diagnostics: [] };
  const infoListeners = new Set<(i: SessionInfo) => void>();
  let locale: 'it' | 'en' = 'it';
  const session = {
    reconnect: vi.fn(),
    disconnect: vi.fn(),
    forget: vi.fn(async () => {}),
    pairCode: vi.fn(async (_code: string) => {}),
    pairScanned: vi.fn(async (_text: string) => {}),
    updateSettings: vi.fn(),
    locale: () => locale,
    info: () => info,
    subscribeInfo: (l: (i: SessionInfo) => void) => {
      infoListeners.add(l);
      return () => infoListeners.delete(l);
    },
    ...overrides,
  } satisfies PhoneSession;
  return {
    session,
    setInfo(next: SessionInfo) {
      info = next;
      for (const l of infoListeners) l(next);
    },
    setLocale(next: 'it' | 'en') {
      locale = next;
    },
  };
}

function online(): Partial<AppState> {
  return {
    connection: {
      status: 'online',
      server: 'evf-relay.evf-relay.workers.dev',
      userName: 'Luca',
      gmName: 'Anna',
      actorName: 'Thorin',
    },
  };
}

const field = (root: HTMLElement, name: string) =>
  root.querySelector(`[data-field="${name}"]`)?.textContent;

describe('statusLine', () => {
  const t = phoneStrings('it');
  it('describes each status with cause and countdown', () => {
    const s = initialState();
    expect(statusLine({ ...s, connection: { status: 'online' } }, t)).toBe('Collegato');
    expect(statusLine({ ...s, connection: { status: 'connecting' } }, t)).toBe('Collegamento…');
    expect(
      statusLine(
        { ...s, connection: { status: 'offline', cause: 'network', retryInMs: 7_400, attempt: 3 } },
        t,
      ),
    ).toBe('Non collegato · relay non raggiungibile · riprovo tra 8 s (tent. 3)');
    expect(statusLine({ ...s, connection: { status: 'offline' } }, phoneStrings('en'))).toBe(
      'Offline',
    );
    for (const cause of ['no-projector', 'network', 'background'] as const) {
      expect(statusLine({ ...s, connection: { status: 'offline', cause } }, t)).not.toBe(
        'Non collegato',
      );
    }
  });
});

describe('P03 setup page', () => {
  const photo = { path: 'p', name: 'p', mimeType: 'image/jpeg', size: 1, base64: 'AA' };
  const scanDeps = (text: string | null) => ({
    decodeImage: vi.fn(async () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 })),
    readQr: vi.fn(async () => text),
  });

  it('without the Even App bridge: explanation + code form only; submits the code', async () => {
    const store = createAppStore();
    const { session } = fakeSession();
    const root = document.createElement('main');
    mountPhonePage(root, store, session, null);
    expect(root.querySelector('h1')?.textContent).toBe('G2 HUD · Prima configurazione');
    expect(root.lang).toBe('it');
    expect(root.querySelector('[data-action="scan"]')).toBeNull();
    const code = root.querySelector<HTMLInputElement>('#evf-code');
    if (code === null) throw new Error('form missing');
    code.value = '7QK3-MX9P-2HRA-C4TE';
    root.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(session.pairCode).toHaveBeenCalledWith('7QK3-MX9P-2HRA-C4TE');
    await settle(2);
    expect(field(root, 'error')).toBe('');
  });

  it('shows an error for an invalid code and the revoked notice', async () => {
    const store = createAppStore({ ...initialState(), connection: { status: 'revoked' } });
    const { session } = fakeSession({
      pairCode: vi.fn(async () => {
        throw new Error('invalid manual code');
      }),
    });
    const root = document.createElement('main');
    mountPhonePage(root, store, session, null);
    expect(root.querySelector<HTMLElement>('.evf-notice')?.hidden).toBe(false);
    root.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle(2);
    expect(field(root, 'error')).toContain('Codice non valido');
  });

  it('«Scansiona QR»: photo → QR text → pairScanned; cancel does nothing', async () => {
    const store = createAppStore();
    const { session } = fakeSession();
    const camera = { captureImageFromCamera: vi.fn(async () => photo) };
    const root = document.createElement('main');
    mountPhonePage(root, store, session, camera, null, scanDeps('https://x/#evf=abc'));
    const scan = root.querySelector<HTMLButtonElement>('[data-action="scan"]');
    expect(scan?.textContent).toBe('Scansiona QR');
    scan?.click();
    expect(scan?.disabled).toBe(true);
    await settle(2);
    expect(session.pairScanned).toHaveBeenCalledWith('https://x/#evf=abc');
    expect(scan?.disabled).toBe(false);
    camera.captureImageFromCamera.mockResolvedValueOnce(null as never);
    scan?.click();
    await settle(2);
    expect(session.pairScanned).toHaveBeenCalledOnce();
  });

  it('reports a photo without a QR and a QR that is not ours', async () => {
    const store = createAppStore();
    const { session } = fakeSession({
      pairScanned: vi.fn(async () => {
        throw new Error('not a pairing QR');
      }),
    });
    const camera = { captureImageFromCamera: vi.fn(async () => photo) };
    const root = document.createElement('main');
    mountPhonePage(root, store, session, camera, null, scanDeps(null));
    root.querySelector<HTMLButtonElement>('[data-action="scan"]')?.click();
    await settle(2);
    expect(field(root, 'error')).toBe(phoneStrings('it').noQrInPhoto);
    const other = document.createElement('main');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    mountPhonePage(other, store, session, camera, null, scanDeps('https://example.com'));
    other.querySelector<HTMLButtonElement>('[data-action="scan"]')?.click();
    await settle(2);
    expect(field(other, 'error')).toBe('Questo non è un QR di associazione EvenFoundryVTT.');
  });

  it('camera failure and an empty capture explain themselves instead of doing nothing', async () => {
    const store = createAppStore();
    const { session } = fakeSession();
    const camera = {
      captureImageFromCamera: vi.fn(async () => {
        throw new Error('denied');
      }),
    };
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const root = document.createElement('main');
    mountPhonePage(root, store, session, camera, null, scanDeps('x'));
    root.querySelector<HTMLButtonElement>('[data-action="scan"]')?.click();
    await settle(2);
    expect(field(root, 'error')).toBe(phoneStrings('it').cameraUnavailable);
    camera.captureImageFromCamera.mockResolvedValueOnce(null as never);
    root.querySelector<HTMLButtonElement>('[data-action="scan"]')?.click();
    await settle(2);
    expect(field(root, 'error')).toBe(phoneStrings('it').noPhoto);
    expect(session.pairScanned).not.toHaveBeenCalled();
  });

  it('the code field takes a whole pasted link: no length cap, no forced capitals', () => {
    const root = document.createElement('main');
    mountPhonePage(root, createAppStore(), fakeSession().session, null);
    const code = root.querySelector<HTMLInputElement>('#evf-code');
    expect(code?.getAttribute('autocapitalize')).toBe('none');
    expect(Number(code?.getAttribute('maxlength'))).toBeGreaterThanOrEqual(256);
  });

  it('ignores a scan click when no camera is attached (defensive)', () => {
    const store = createAppStore();
    const root = document.createElement('main');
    mountPhonePage(root, store, fakeSession().session, null);
    expect(root.querySelector('[data-action="scan"]')).toBeNull();
  });
});

describe('P02 connection page', () => {
  it('renders status facts and settings, and wires every control', () => {
    const store = createAppStore({ ...initialState(), ...online() });
    const fake = fakeSession();
    const root = document.createElement('main');
    const unmount = mountPhonePage(root, store, fake.session, null);
    expect(root.querySelector('h1')?.textContent).toBe('G2 HUD · Connessione');
    expect(field(root, 'status')).toBe('Collegato');
    expect(field(root, 'server')).toBe('evf-relay.evf-relay.workers.dev');
    expect(field(root, 'user')).toBe('Luca');
    expect(field(root, 'character')).toBe('Thorin');
    expect(field(root, 'gm')).toBe('Anna (online)');
    expect(field(root, 'latency')).toBe('—');
    expect(field(root, 'diagnostics')).toBe('Nessun errore recente.');

    fake.setInfo({
      latencyMs: 84,
      moduleVersion: '0.2.0',
      diagnostics: [{ at: 0, level: 'error', message: 'network: relay down' }],
    });
    expect(field(root, 'latency')).toBe('84 ms');
    expect(field(root, 'version')).toBe('Modulo EVF: 0.2.0');
    expect(root.querySelector('[data-level="error"]')?.textContent).toContain(
      'network: relay down',
    );

    const change = (selector: string, set: (el: HTMLInputElement & HTMLSelectElement) => void) => {
      const el = root.querySelector<HTMLInputElement & HTMLSelectElement>(selector);
      if (el === null) throw new Error(`missing ${selector}`);
      set(el);
      el.dispatchEvent(new Event('change'));
    };
    change('#evf-locale', (el) => (el.value = 'en'));
    change('#evf-map-cell', (el) => (el.value = '12'));
    change('#evf-map-pixel', (el) => (el.value = '3'));
    change('#evf-follow', (el) => (el.checked = false));
    change('#evf-auto-sheet', (el) => (el.checked = false));
    expect(vi.mocked(fake.session.updateSettings).mock.calls).toEqual([
      [{ locale: 'en' }],
      [{ mapCellPx: 12 }],
      [{ mapPixelSize: 3 }],
      [{ followToken: false }],
      [{ autoSheetPage: false }],
    ]);
    root.querySelector<HTMLButtonElement>('[data-action="reconnect"]')?.click();
    root.querySelector<HTMLButtonElement>('[data-action="disconnect"]')?.click();
    root.querySelector<HTMLButtonElement>('[data-action="forget"]')?.click();
    expect(fake.session.reconnect).toHaveBeenCalledOnce();
    expect(fake.session.disconnect).toHaveBeenCalledOnce();
    expect(fake.session.forget).toHaveBeenCalledOnce();
    unmount();
    expect(root.childElementCount).toBe(0);
  });

  it('updates in place, keeps the diagnostics disclosure, and rebuilds on locale/view change', () => {
    const store = createAppStore({ ...initialState(), ...online() });
    const fake = fakeSession();
    const root = document.createElement('main');
    mountPhonePage(root, store, fake.session, null);
    const details = root.querySelector('details');
    if (details === null) throw new Error('no details');
    details.open = true;
    store.update({
      connection: {
        status: 'offline',
        cause: 'network',
        retryInMs: 3_000,
        attempt: 2,
        gmName: 'Anna',
      },
    });
    expect(root.querySelector('details')).toBe(details);
    expect(details.open).toBe(true);
    expect(field(root, 'status')).toBe(
      'Non collegato · relay non raggiungibile · riprovo tra 3 s (tent. 2)',
    );
    expect(field(root, 'gm')).toBe('Anna');
    expect(field(root, 'server')).toBe('—');
    expect(root.querySelector<HTMLButtonElement>('[data-action="disconnect"]')?.disabled).toBe(
      false,
    );
    store.update({ connection: { status: 'offline' } });
    expect(root.querySelector<HTMLButtonElement>('[data-action="disconnect"]')?.disabled).toBe(
      true,
    );

    fake.setLocale('en');
    store.update({ settings: { ...store.get().settings, locale: 'en' } });
    expect(root.querySelector('h1')?.textContent).toBe('G2 HUD · Connection');
    expect(root.lang).toBe('en');
    store.update({ connection: { status: 'unpaired' } });
    expect(root.querySelector('[data-view="setup"]')).not.toBeNull();
  });
});

describe('debug channel tail', () => {
  const tailItems = (root: HTMLElement) =>
    [...root.querySelectorAll('[data-field="debug-log"] li')].map((li) => li.textContent ?? '');

  it('is absent unless a debug log is registered (fail-closed)', () => {
    const root = document.createElement('main');
    const store = createAppStore({ ...initialState(), ...online() });
    mountPhonePage(root, store, fakeSession().session, null);
    expect(root.querySelector('[data-field="debug-log"]')).toBeNull();
    store.update({ connection: { status: 'unpaired' } });
    expect(root.querySelector('[data-field="debug-log"]')).toBeNull();
  });

  it('lists the newest entries first in P02 Diagnostica and refreshes on push', () => {
    const log = createDebugLog();
    setActiveDebugLog(log);
    try {
      const root = document.createElement('main');
      const store = createAppStore({ ...initialState(), ...online() });
      const unmount = mountPhonePage(root, store, fakeSession().session, null);
      expect(tailItems(root)).toEqual(['Nessun evento di debug.']);
      const list = root.querySelector('details [data-field="debug-log"]');
      expect(list).not.toBeNull();
      for (let i = 0; i < DEBUG_TAIL + 5; i++) log.push('warn', 'hud', `msg ${i}`);
      const items = tailItems(root);
      expect(items).toHaveLength(DEBUG_TAIL);
      expect(items[0]).toMatch(/\[hud\] msg 19$/);
      expect(root.querySelector('[data-field="debug-log"] li')?.getAttribute('data-level')).toBe(
        'warn',
      );
      unmount();
      log.push('info', 'x', 'after unmount');
      expect(root.childElementCount).toBe(0);
    } finally {
      setActiveDebugLog(null);
    }
  });

  it('adds its own disclosure on the P03 setup page', () => {
    const log = createDebugLog();
    log.push('error', 'uncaught', 'boom');
    const root = document.createElement('main');
    const store = createAppStore();
    mountPhonePage(root, store, fakeSession().session, null, log);
    expect(
      root.querySelector('[data-view="setup"] details [data-field="debug-log"]'),
    ).not.toBeNull();
    expect(tailItems(root)[0]).toMatch(/\[uncaught\] boom$/);
  });
});
