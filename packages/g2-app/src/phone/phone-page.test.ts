import { describe, expect, it, vi } from 'vitest';
import { createDebugLog, setActiveDebugLog } from '../debug/debug-log.js';
import { settle } from '../direct/__fixtures__/direct-fixtures.js';
import type { SessionInfo } from '../direct/session.js';
import { type AppState, createAppStore, initialState } from '../state/app-store.js';
import { phoneStrings } from './i18n.js';
import { DEBUG_TAIL, mountPhonePage, type PhoneSession, statusLine } from './phone-page.js';

function fakeSession(overrides: Partial<PhoneSession> = {}) {
  let info: SessionInfo = { latencyMs: null, foundryVersion: null, diagnostics: [] };
  const infoListeners = new Set<(i: SessionInfo) => void>();
  let locale: 'it' | 'en' = 'it';
  const session = {
    reconnect: vi.fn(),
    disconnect: vi.fn(),
    forget: vi.fn(async () => {}),
    pairManual: vi.fn(async () => {}),
    listUsers: vi.fn(async () => [{ id: 'u1', name: 'Luca (G2)' }]),
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
      server: 'foundry.casa-rossi.it',
      userName: 'Luca (G2)',
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
        { ...s, connection: { status: 'offline', cause: 'no-gm', retryInMs: 7_400, attempt: 3 } },
        t,
      ),
    ).toBe('Non collegato · nessun GM connesso · riprovo tra 8 s (tent. 3)');
    expect(statusLine({ ...s, connection: { status: 'offline' } }, phoneStrings('en'))).toBe(
      'Offline',
    );
    for (const cause of ['network', 'auth', 'background'] as const) {
      expect(statusLine({ ...s, connection: { status: 'offline', cause } }, t)).not.toBe(
        'Non collegato',
      );
    }
  });
});

describe('P03 setup page', () => {
  it('renders explanation, lists (G2) users and submits the manual code', async () => {
    const store = createAppStore();
    const { session } = fakeSession();
    const root = document.createElement('main');
    mountPhonePage(root, store, session);
    expect(root.querySelector('h1')?.textContent).toBe('G2 HUD · Prima configurazione');
    expect(root.lang).toBe('it');
    await settle(2);
    const select = root.querySelector<HTMLSelectElement>('#evf-user');
    expect([...(select?.options ?? [])].map((o) => o.textContent)).toEqual(['Luca (G2)']);
    const code = root.querySelector<HTMLInputElement>('#evf-code');
    if (code === null || select === null) throw new Error('form missing');
    code.value = '7QK3-MX9P-2HRA-C4TE';
    root.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(session.pairManual).toHaveBeenCalledWith('u1', '7QK3-MX9P-2HRA-C4TE');
    await settle(2);
    expect(field(root, 'error')).toBe('');
  });

  it('shows an error for an invalid code and for a missing user', async () => {
    const store = createAppStore();
    const { session } = fakeSession({
      pairManual: vi.fn(async () => {
        throw new Error('invalid manual code');
      }),
      listUsers: vi.fn(async () => []),
    });
    const root = document.createElement('main');
    mountPhonePage(root, store, session);
    await settle(2);
    expect(field(root, 'error')).toContain('Nessun utente');
    root.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(field(root, 'error')).toBe('Scegli un utente.');
    const select = root.querySelector<HTMLSelectElement>('#evf-user');
    const option = document.createElement('option');
    option.value = 'x';
    option.textContent = 'X (G2)';
    select?.append(option);
    if (select) select.value = 'x';
    root.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle(2);
    expect(field(root, 'error')).toContain('Codice non valido');
  });

  it('reports user-list failures and shows the revoked notice', async () => {
    const store = createAppStore({ ...initialState(), connection: { status: 'revoked' } });
    const { session } = fakeSession({
      listUsers: vi.fn(async () => Promise.reject(new Error('x'))),
    });
    const root = document.createElement('main');
    mountPhonePage(root, store, session);
    await settle(2);
    expect(field(root, 'error')).toBe('Impossibile leggere gli utenti da Foundry.');
    expect(root.querySelector<HTMLElement>('.evf-notice')?.hidden).toBe(false);
  });
});

describe('P02 connection page', () => {
  it('renders status facts and settings, and wires every control', () => {
    const store = createAppStore({ ...initialState(), ...online() });
    const fake = fakeSession();
    const root = document.createElement('main');
    const unmount = mountPhonePage(root, store, fake.session);
    expect(root.querySelector('h1')?.textContent).toBe('G2 HUD · Connessione');
    expect(field(root, 'status')).toBe('Collegato');
    expect(field(root, 'server')).toBe('foundry.casa-rossi.it');
    expect(field(root, 'user')).toBe('Luca (G2)');
    expect(field(root, 'character')).toBe('Thorin');
    expect(field(root, 'gm')).toBe('Anna (online)');
    expect(field(root, 'latency')).toBe('—');
    expect(field(root, 'diagnostics')).toBe('Nessun errore recente.');

    fake.setInfo({
      latencyMs: 84,
      foundryVersion: '14.360',
      diagnostics: [{ at: 0, level: 'error', message: 'no-gm: no welcome' }],
    });
    expect(field(root, 'latency')).toBe('84 ms');
    expect(field(root, 'version')).toBe('Versione Foundry: 14.360');
    expect(root.querySelector('[data-level="error"]')?.textContent).toContain('no-gm: no welcome');

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
    mountPhonePage(root, store, fake.session);
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
      'Non collegato · Foundry non risponde · riprovo tra 3 s (tent. 2)',
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
    mountPhonePage(root, store, fakeSession().session);
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
      const unmount = mountPhonePage(root, store, fakeSession().session);
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
    mountPhonePage(root, store, fakeSession().session, log);
    expect(
      root.querySelector('[data-view="setup"] details [data-field="debug-log"]'),
    ).not.toBeNull();
    expect(tailItems(root)[0]).toMatch(/\[uncaught\] boom$/);
  });
});
