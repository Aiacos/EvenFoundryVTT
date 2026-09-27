/**
 * Phone-side page shown inside the Even Realities App WebView.
 *
 * - **P03** (`unpaired` / `revoked`): «Scansiona QR» (in-app camera, when the Even App
 *   bridge is there) + the 16-char code form — one tap, or one code, and nothing else —
 *   plus the notices of a dropped pairing (revoked, code unanswered) and of the page link
 *   (legacy QR, no valid code, code already used).
 * - **P02** (otherwise): status, relay, Foundry user, character, GM, latency, device
 *   settings, Reconnect / Disconnect, a «Collega di nuovo» card with the same scan button,
 *   code field and page-link notice (open while not online: a stale pairing is never a
 *   dead end) and a collapsible diagnostics section.
 * - Both show the boot line (`app · secure · crypto · link · relay`, no secrets) and map
 *   pairing failures precisely: invalid code, not a pairing QR, code already used,
 *   otherwise «Collegamento non riuscito: <msg>» (logged).
 * - In debug/demo mode only (a debug log is registered), the tail of the debug channel is
 *   listed in "Diagnostica" (P02) or in its own disclosure (P03).
 *
 * Plain DOM, no framework, no external assets (Even Hub CDN constraint). Styling lives in
 * `phone.css` (Even phone tokens: hub design-guidelines "Phone-Side App UI").
 *
 * @see docs/design/g2-thirds-layout.md §P02 §P03
 */

import { activeDebugLog, type DebugLogReader } from '../debug/debug-log.js';
import { type DirectSession, PAIRING_ERROR, type SessionInfo } from '../direct/session.js';
import {
  type AppSettings,
  type AppState,
  type AppStore,
  DEFAULT_MAP_PIXEL_SIZE,
} from '../state/app-store.js';
import { type PhoneStrings, phoneStrings } from './i18n.js';
import { type CameraLike, type QrScanDeps, QrScanError, scanQr } from './qr-scan.js';

/** Session surface the phone page drives. */
export type PhoneSession = Pick<
  DirectSession,
  | 'reconnect'
  | 'disconnect'
  | 'forget'
  | 'pairCode'
  | 'pairScanned'
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
    'no-projector': t.causeNoProjector,
    network: t.causeNetwork,
    background: t.causeBackground,
    'code-pending': t.causeCodePending,
    actor: t.causeActor,
    replaced: t.causeReplaced,
  } as const;
  const parts = [t.statusOffline];
  if (c.cause !== undefined) parts.push(cause[c.cause]);
  if (c.retryInMs !== undefined && c.attempt !== undefined) {
    parts.push(t.retryIn(Math.ceil(c.retryInMs / 1000), c.attempt));
  }
  return parts.join(' · ');
}

/**
 * Diagnostic line shown on P02 and P03 without `?debug`: what a support screenshot needs to
 * tell a plain-http page (no WebCrypto), a spent or legacy link and the relay apart. Tokens
 * are not translated (one format for every report); it carries no secret.
 */
export function bootLine(boot: SessionInfo['boot']): string {
  return [
    `app ${boot.app}`,
    `secure ${boot.secure ? 'yes' : 'no'}`,
    `crypto ${boot.crypto}`,
    `link ${boot.link}`,
    `relay ${boot.relay}`,
  ].join(' · ');
}

/**
 * Message for a failed pairing attempt: precise for the errors the session raises on
 * purpose, «Collegamento non riuscito: <msg>» for anything else (also logged, so a real
 * defect is never passed off as a typo).
 */
export function pairingErrorText(error: unknown, t: PhoneStrings): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message === PAIRING_ERROR.invalidCode) return t.invalidCode;
  if (message === PAIRING_ERROR.notPairingQr) return t.notPairingQr;
  if (message === PAIRING_ERROR.codeUsed) return t.codeUsed;
  console.warn(`[phone] pairing failed: ${String(error)}`);
  return t.pairFailed(message);
}

/**
 * Notice about the pairing link of the page URL (`SessionInfo.boot.link`), or null:
 * legacy `#evf=` QR, a link without a valid code, or a code already used on this phone —
 * «make a new QR» on P03 (`paired` false), «the current pairing is kept» on P02.
 */
export function linkNoticeText(
  link: SessionInfo['boot']['link'],
  paired: boolean,
  t: PhoneStrings,
): string | null {
  switch (link) {
    case 'legacy':
      return t.legacyLink;
    case 'invalid':
      return t.invalidLink;
    case 'used':
      return paired ? t.linkUsedKept : t.codeUsed;
    default:
      return null;
  }
}

/** The page-link notice line (`p[data-field="link-notice"]`), refreshed by `update()`. */
function buildLinkNotice(
  t: PhoneStrings,
  paired: boolean,
): { node: HTMLElement; update(info: SessionInfo): void } {
  const node = el('p', { class: 'evf-notice', role: 'alert', 'data-field': 'link-notice' });
  return {
    node,
    update(info) {
      const text = linkNoticeText(info.boot.link, paired, t);
      node.hidden = text === null;
      node.textContent = text ?? '';
    },
  };
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
  camera: CameraLike | null,
  scanDeps: QrScanDeps | undefined,
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
  const diagnostics = el('details', { class: 'evf-card', 'data-field': 'diag-section' }, [
    el('summary', {}, [t.diagnostics]),
    version,
    errors,
    ...(debugTail === null ? [] : [debugTail.node]),
    forget,
  ]);

  // «Collega di nuovo»: a stale or unanswered pairing is never a dead end. Driven by the
  // status only, so old records (without `pendingSince`) are covered too.
  const controls = buildPairControls(session, t, camera, scanDeps);
  const linkNotice = buildLinkNotice(t, true);
  const repair = el('details', { class: 'evf-card', 'data-field': 'repair' }, [
    el('summary', {}, [t.repair]),
    linkNotice.node,
    ...(controls.scan === null
      ? []
      : [controls.scan, el('p', { class: 'evf-divider' }, [t.orCode])]),
    controls.form,
    controls.error,
  ]);
  let repairWanted: boolean | null = null;
  const boot = el('p', { class: 'evf-dim', 'data-field': 'boot' });

  const node = el('section', { 'data-view': 'connection' }, [
    header(t.titleConnection),
    rows,
    repair,
    settings,
    el('div', { class: 'evf-actions' }, [reconnect, disconnect]),
    boot,
    diagnostics,
  ]);

  return {
    node,
    update(state, info) {
      const c = state.connection;
      // Opens when the link is lost, closes once online; the player's own toggle wins
      // until the status crosses that line again.
      const wanted = c.status !== 'online';
      if (wanted !== repairWanted) {
        repairWanted = wanted;
        repair.open = wanted;
      }
      controls.update(info);
      linkNotice.update(info);
      boot.textContent = bootLine(info.boot);
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
      version.textContent = `${t.moduleVersion}: ${info.moduleVersion ?? t.unknown}`;
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

/** Scan button + code form + error line, shared by P03 and the P02 «Collega di nuovo». */
interface PairControls {
  /** «Scansiona QR», or null without the Even App camera. */
  scan: HTMLButtonElement | null;
  form: HTMLFormElement;
  error: HTMLElement;
  /** Shows a pairing-link failure of the session (once per distinct message). */
  update(info: SessionInfo): void;
}

function buildPairControls(
  session: PhoneSession,
  t: PhoneStrings,
  camera: CameraLike | null,
  scanDeps: QrScanDeps | undefined,
): PairControls {
  const error = el('p', { class: 'evf-error', role: 'alert', 'data-field': 'error' });

  let scan: HTMLButtonElement | null = null;
  if (camera !== null) {
    const button = el('button', { type: 'button', class: 'evf-primary', 'data-action': 'scan' }, [
      t.scan,
    ]);
    button.addEventListener('click', () => {
      error.textContent = '';
      button.disabled = true;
      scanQr(camera, scanDeps)
        .then((text) => {
          // No photo: cancelled, or a host that silently denies the camera — say what to do.
          if (text === null) error.textContent = t.noPhoto;
          else return session.pairScanned(text);
        })
        .catch((err: unknown) => {
          error.textContent =
            err instanceof QrScanError
              ? err.reason === 'camera'
                ? t.cameraUnavailable
                : t.noQrInPhoto
              : pairingErrorText(err, t);
        })
        .finally(() => {
          button.disabled = false;
        });
    });
    scan = button;
  }

  const code = el('input', {
    id: 'evf-code',
    name: 'code',
    type: 'text',
    inputmode: 'text',
    autocomplete: 'off',
    // The field also takes the whole pairing link (pasted, or typed when a scan fails):
    // no forced capitals (the code is normalised anyway) and room for a long URL.
    autocapitalize: 'none',
    autocorrect: 'off',
    spellcheck: 'false',
    placeholder: 'XXXX-XXXX-XXXX-XXXX',
    maxlength: '512',
    required: '',
  });
  const submit = el('button', { type: 'submit' }, [t.connect]);
  const form = el('form', { class: 'evf-card evf-form', novalidate: '' }, [
    el('label', { for: 'evf-code' }, [t.code]),
    code,
    submit,
  ]);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    error.textContent = '';
    submit.disabled = true;
    session.pairCode(code.value).then(
      () => {
        submit.disabled = false;
      },
      (err: unknown) => {
        submit.disabled = false;
        error.textContent = pairingErrorText(err, t);
      },
    );
  });

  let shownBootError: string | null = null;
  return {
    scan,
    form,
    error,
    update(info) {
      if (info.pairingError === null || info.pairingError === shownBootError) return;
      shownBootError = info.pairingError;
      error.textContent = t.pairFailed(info.pairingError);
    },
  };
}

function buildSetupView(
  session: PhoneSession,
  t: PhoneStrings,
  camera: CameraLike | null,
  scanDeps: QrScanDeps | undefined,
  debugLog: DebugLogReader | null,
): View {
  const notice = el('p', { class: 'evf-notice', role: 'alert', hidden: '' }, [t.revokedNotice]);
  const unanswered = el(
    'p',
    { class: 'evf-notice', role: 'alert', 'data-field': 'unanswered', hidden: '' },
    [t.codeUnanswered],
  );
  const linkNotice = buildLinkNotice(t, false);
  const controls = buildPairControls(session, t, camera, scanDeps);
  const boot = el('p', { class: 'evf-dim', 'data-field': 'boot' });

  const node = el('section', { 'data-view': 'setup' }, [
    header(t.titleSetup),
    el('div', { class: 'evf-card' }, [
      notice,
      unanswered,
      linkNotice.node,
      el('p', {}, [t.noPairing]),
      el('p', {}, [t.easiest, ' ', t.easiestSteps]),
      ...(controls.scan === null ? [] : [controls.scan]),
    ]),
    el('p', { class: 'evf-divider' }, [t.orCode]),
    controls.form,
    controls.error,
    el('p', { class: 'evf-dim' }, [t.help]),
    boot,
  ]);
  const debugTail = debugLog === null ? null : buildDebugTail(debugLog, t);
  if (debugTail !== null) {
    node.append(
      el('details', { class: 'evf-card' }, [el('summary', {}, [t.diagnostics]), debugTail.node]),
    );
  }
  return {
    node,
    update(state, info) {
      notice.hidden = state.connection.status !== 'revoked';
      unanswered.hidden = state.connection.notice !== 'code-unanswered';
      linkNotice.update(info);
      boot.textContent = bootLine(info.boot);
      controls.update(info);
      debugTail?.update();
    },
  };
}

/**
 * Mounts the phone page into `root` and keeps it in sync with the store and the session
 * info. The view is rebuilt only when its kind (P02/P03) or locale changes, so form input
 * and the diagnostics disclosure state survive updates.
 *
 * @param camera - The Even App bridge camera (null in a plain browser: no «Scansiona QR»).
 * @param debugLog - Debug channel to list (defaults to the registered one; `null` in
 *   normal sessions, which hides the debug tail).
 * @param scanDeps - QR decoding overrides (tests).
 * @returns unmount function
 */
export function mountPhonePage(
  root: HTMLElement,
  store: AppStore,
  session: PhoneSession,
  camera: CameraLike | null,
  debugLog: DebugLogReader | null = activeDebugLog(),
  scanDeps?: QrScanDeps,
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
          ? buildSetupView(session, t, camera, scanDeps, debugLog)
          : buildConnectionView(session, t, camera, scanDeps, debugLog);
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
