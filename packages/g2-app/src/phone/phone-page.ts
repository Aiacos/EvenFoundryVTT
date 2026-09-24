/**
 * Phone-side page shown inside the Even Realities App WebView.
 *
 * - **P03** (`unpaired` / `revoked`): explanation + manual "(G2)" user / 16-char code form.
 * - **P02** (otherwise): status, server, user, character, GM, latency, device settings,
 *   Reconnect / Disconnect and a collapsible diagnostics section.
 * - In debug/demo mode only (a debug log is registered), the tail of the debug channel is
 *   listed in "Diagnostica" (P02) or in its own disclosure (P03).
 *
 * Plain DOM, no framework, no external assets (Even Hub CDN constraint). Styling lives in
 * `phone.css` (Even phone tokens: hub design-guidelines "Phone-Side App UI").
 *
 * @see docs/design/g2-thirds-layout.md §P02 §P03
 */

import { activeDebugLog, type DebugLogReader } from '../debug/debug-log.js';
import type { DirectSession, SessionInfo } from '../direct/session.js';
import {
  type AppSettings,
  type AppState,
  type AppStore,
  DEFAULT_MAP_PIXEL_SIZE,
} from '../state/app-store.js';
import { type PhoneStrings, phoneStrings } from './i18n.js';

/** Session surface the phone page drives. */
export type PhoneSession = Pick<
  DirectSession,
  | 'reconnect'
  | 'disconnect'
  | 'forget'
  | 'pairManual'
  | 'listUsers'
  | 'updateSettings'
  | 'locale'
  | 'info'
  | 'subscribeInfo'
>;

type Child = Node | string;

/** Creates an element with attributes and children (text children are escaped). */
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  children: Child[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
  node.append(...children);
  return node;
}

/** A mounted view: `update` refreshes values in place. */
interface View {
  node: HTMLElement;
  update(state: AppState, info: SessionInfo): void;
}

/** Human status line for P02 (status word + offline detail). */
export function statusLine(state: AppState, t: PhoneStrings): string {
  const c = state.connection;
  if (c.status === 'online') return t.statusOnline;
  if (c.status === 'connecting') return t.statusConnecting;
  const cause = {
    'no-gm': t.causeNoGm,
    network: t.causeNetwork,
    auth: t.causeAuth,
    background: t.causeBackground,
    access: t.causeAccess,
  } as const;
  const parts = [t.statusOffline];
  if (c.cause !== undefined) parts.push(cause[c.cause]);
  if (c.retryInMs !== undefined && c.attempt !== undefined) {
    parts.push(t.retryIn(Math.ceil(c.retryInMs / 1000), c.attempt));
  }
  return parts.join(' · ');
}

/** Debug entries listed on the phone page (most recent first). */
export const DEBUG_TAIL = 15;

/**
 * Debug-channel tail block (`ul[data-field="debug-log"]`), refreshed by `update()`.
 */
function buildDebugTail(
  log: DebugLogReader,
  t: PhoneStrings,
): { node: HTMLElement; update(): void } {
  const list = el('ul', { class: 'evf-diag evf-debug', 'data-field': 'debug-log' });
  return {
    node: el('div', {}, [el('p', { class: 'evf-dim' }, [t.debugLog]), list]),
    update() {
      const tail = log.tail(DEBUG_TAIL);
      list.replaceChildren(
        ...(tail.length === 0
          ? [el('li', {}, [t.debugEmpty])]
          : [...tail]
              .reverse()
              .map((e) =>
                el('li', { 'data-level': e.level }, [
                  `${new Date(e.ts).toLocaleTimeString()} [${e.source}] ${e.message}`,
                ]),
              )),
      );
    },
  };
}

function header(title: string): HTMLElement {
  return el('header', { class: 'evf-header' }, [el('h1', {}, [title])]);
}

function buildConnectionView(
  session: PhoneSession,
  t: PhoneStrings,
  debugLog: DebugLogReader | null,
): View {
  const values = {
    status: el('dd', { 'data-field': 'status', role: 'status', 'aria-live': 'polite' }),
    server: el('dd', { 'data-field': 'server' }),
    user: el('dd', { 'data-field': 'user' }),
    character: el('dd', { 'data-field': 'character' }),
    gm: el('dd', { 'data-field': 'gm' }),
    latency: el('dd', { 'data-field': 'latency' }),
  };
  const rows = el('dl', { class: 'evf-card evf-facts' }, [
    el('dt', {}, [t.status]),
    values.status,
    el('dt', {}, [t.server]),
    values.server,
    el('dt', {}, [t.user]),
    values.user,
    el('dt', {}, [t.character]),
    values.character,
    el('dt', {}, [t.gm]),
    values.gm,
    el('dt', {}, [t.latency]),
    values.latency,
  ]);

  const locale = el('select', { id: 'evf-locale', name: 'locale' }, [
    el('option', { value: 'auto' }, [t.autoLocale]),
    el('option', { value: 'it' }, [t.italian]),
    el('option', { value: 'en' }, [t.english]),
  ]);
  locale.addEventListener('change', () =>
    session.updateSettings({ locale: locale.value as AppSettings['locale'] }),
  );
  const cell = el(
    'select',
    { id: 'evf-map-cell', name: 'mapCellPx' },
    [6, 8, 12].map((px) => el('option', { value: String(px) }, [t.cellSize(px)])),
  );
  cell.addEventListener('change', () =>
    session.updateSettings({ mapCellPx: Number(cell.value) as AppSettings['mapCellPx'] }),
  );
  const pixel = el(
    'select',
    { id: 'evf-map-pixel', name: 'mapPixelSize' },
    [1, 2, 3].map((n) => el('option', { value: String(n) }, [t.mapPixel(n)])),
  );
  pixel.addEventListener('change', () =>
    session.updateSettings({
      mapPixelSize: Number(pixel.value) as NonNullable<AppSettings['mapPixelSize']>,
    }),
  );
  const follow = el('input', { id: 'evf-follow', type: 'checkbox', name: 'followToken' });
  follow.addEventListener('change', () => session.updateSettings({ followToken: follow.checked }));
  const autoSheet = el('input', {
    id: 'evf-auto-sheet',
    type: 'checkbox',
    name: 'autoSheetPage',
  });
  autoSheet.addEventListener('change', () =>
    session.updateSettings({ autoSheetPage: autoSheet.checked }),
  );
  const settings = el('div', { class: 'evf-card evf-settings' }, [
    el('label', { for: 'evf-locale' }, [t.language]),
    locale,
    el('label', { for: 'evf-map-cell' }, [t.map]),
    cell,
    el('label', { for: 'evf-map-pixel' }, [t.mapArt]),
    pixel,
    el('span', {}, []),
    el('label', { class: 'evf-check' }, [follow, t.followToken]),
    el('span', {}, [t.sheet]),
    el('label', { class: 'evf-check' }, [autoSheet, t.autoSheet]),
  ]);

  const reconnect = el(
    'button',
    { type: 'button', class: 'evf-primary', 'data-action': 'reconnect' },
    [t.reconnect],
  );
  reconnect.addEventListener('click', () => session.reconnect());
  const disconnect = el('button', { type: 'button', 'data-action': 'disconnect' }, [t.disconnect]);
  disconnect.addEventListener('click', () => session.disconnect());

  const version = el('p', { class: 'evf-dim', 'data-field': 'version' });
  const errors = el('ul', { class: 'evf-diag', 'data-field': 'diagnostics' });
  const forget = el('button', { type: 'button', class: 'evf-danger', 'data-action': 'forget' }, [
    t.forget,
  ]);
  forget.addEventListener('click', () => void session.forget());
  const debugTail = debugLog === null ? null : buildDebugTail(debugLog, t);
  const diagnostics = el('details', { class: 'evf-card' }, [
    el('summary', {}, [t.diagnostics]),
    version,
    errors,
    ...(debugTail === null ? [] : [debugTail.node]),
    forget,
  ]);

  const node = el('section', { 'data-view': 'connection' }, [
    header(t.titleConnection),
    rows,
    settings,
    el('div', { class: 'evf-actions' }, [reconnect, disconnect]),
    diagnostics,
  ]);

  return {
    node,
    update(state, info) {
      const c = state.connection;
      values.status.textContent = statusLine(state, t);
      values.status.dataset.status = c.status;
      values.server.textContent = c.server ?? t.unknown;
      values.user.textContent = c.userName ?? t.unknown;
      values.character.textContent = c.actorName ?? t.unknown;
      values.gm.textContent =
        c.gmName === undefined
          ? t.unknown
          : c.status === 'online'
            ? t.gmOnline(c.gmName)
            : c.gmName;
      values.latency.textContent = info.latencyMs === null ? t.unknown : `${info.latencyMs} ms`;
      locale.value = state.settings.locale;
      cell.value = String(state.settings.mapCellPx);
      pixel.value = String(state.settings.mapPixelSize ?? DEFAULT_MAP_PIXEL_SIZE);
      follow.checked = state.settings.followToken;
      autoSheet.checked = state.settings.autoSheetPage;
      disconnect.disabled = c.status === 'offline' && c.retryInMs === undefined;
      version.textContent = `${t.foundryVersion}: ${info.foundryVersion ?? t.unknown} · ${t.moduleVersion}: ${info.moduleVersion ?? t.unknown}`;
      errors.replaceChildren(
        ...(info.diagnostics.length === 0
          ? [el('li', {}, [t.noErrors])]
          : [...info.diagnostics]
              .reverse()
              .map((d) =>
                el('li', { 'data-level': d.level }, [
                  `${new Date(d.at).toLocaleTimeString()} ${d.message}`,
                ]),
              )),
      );
      debugTail?.update();
    },
  };
}

function buildSetupView(
  session: PhoneSession,
  t: PhoneStrings,
  debugLog: DebugLogReader | null,
): View {
  const notice = el('p', { class: 'evf-notice', role: 'alert', hidden: '' }, [t.revokedNotice]);
  const users = el('select', { id: 'evf-user', name: 'user', required: '' }, [
    el('option', { value: '' }, [t.loadingUsers]),
  ]);
  const code = el('input', {
    id: 'evf-code',
    name: 'code',
    type: 'text',
    inputmode: 'text',
    autocomplete: 'off',
    autocapitalize: 'characters',
    spellcheck: 'false',
    placeholder: 'XXXX-XXXX-XXXX-XXXX',
    maxlength: '24',
    required: '',
  });
  const submit = el('button', { type: 'submit', class: 'evf-primary' }, [t.connect]);
  const error = el('p', { class: 'evf-error', role: 'alert', 'data-field': 'error' });
  const form = el('form', { class: 'evf-card evf-form', novalidate: '' }, [
    el('label', { for: 'evf-user' }, [t.user]),
    users,
    el('label', { for: 'evf-code' }, [t.code]),
    code,
    submit,
    error,
  ]);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    error.textContent = '';
    if (users.value === '') {
      error.textContent = t.chooseUser;
      return;
    }
    submit.disabled = true;
    session.pairManual(users.value, code.value).then(
      () => {
        submit.disabled = false;
      },
      () => {
        submit.disabled = false;
        error.textContent = t.invalidCode;
      },
    );
  });

  session.listUsers().then(
    (list) => {
      users.replaceChildren(
        ...(list.length === 0
          ? [el('option', { value: '' }, [t.noUsers])]
          : list.map((u) => el('option', { value: u.id }, [u.name]))),
      );
      if (list.length === 0) error.textContent = t.noUsers;
    },
    () => {
      users.replaceChildren(el('option', { value: '' }, [t.usersFailed]));
      error.textContent = t.usersFailed;
    },
  );

  const node = el('section', { 'data-view': 'setup' }, [
    header(t.titleSetup),
    el('div', { class: 'evf-card' }, [
      notice,
      el('p', {}, [t.noPairing]),
      el('p', {}, [t.easiest, ' ', t.easiestSteps]),
    ]),
    el('p', { class: 'evf-divider' }, [t.orCode]),
    form,
    el('p', { class: 'evf-dim' }, [t.help]),
  ]);
  const debugTail = debugLog === null ? null : buildDebugTail(debugLog, t);
  if (debugTail !== null) {
    node.append(
      el('details', { class: 'evf-card' }, [el('summary', {}, [t.diagnostics]), debugTail.node]),
    );
  }
  return {
    node,
    update(state) {
      notice.hidden = state.connection.status !== 'revoked';
      debugTail?.update();
    },
  };
}

/**
 * Mounts the phone page into `root` and keeps it in sync with the store and the session
 * info. The view is rebuilt only when its kind (P02/P03) or locale changes, so form input
 * and the diagnostics disclosure state survive updates.
 *
 * @param debugLog - Debug channel to list (defaults to the registered one; `null` in
 *   normal sessions, which hides the debug tail).
 * @returns unmount function
 */
export function mountPhonePage(
  root: HTMLElement,
  store: AppStore,
  session: PhoneSession,
  debugLog: DebugLogReader | null = activeDebugLog(),
): () => void {
  let key = '';
  let view: View | null = null;
  const render = (): void => {
    const state = store.get();
    const locale = session.locale();
    const kind =
      state.connection.status === 'unpaired' || state.connection.status === 'revoked'
        ? 'setup'
        : 'connection';
    const nextKey = `${kind}:${locale}`;
    if (nextKey !== key || view === null) {
      key = nextKey;
      const t = phoneStrings(locale);
      view =
        kind === 'setup'
          ? buildSetupView(session, t, debugLog)
          : buildConnectionView(session, t, debugLog);
      root.lang = locale;
      root.replaceChildren(view.node);
    }
    view.update(state, session.info());
  };
  const unsubscribeStore = store.subscribe(render);
  const unsubscribeInfo = session.subscribeInfo(render);
  const unsubscribeDebug = debugLog?.subscribe(render) ?? (() => {});
  render();
  return () => {
    unsubscribeStore();
    unsubscribeInfo();
    unsubscribeDebug();
    root.replaceChildren();
  };
}
