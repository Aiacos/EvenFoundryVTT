/**
 * Phone-side page shown inside the Even Realities App WebView — for setup and recovery
 * only: once the glasses are online the phone goes back in the pocket (PRODUCT.md).
 *
 * - **P03** (`unpaired` / `revoked`): «Scansiona QR» (in-app camera, when the Even App
 *   bridge is there) + the 16-char code form (grouped 4-4-4-4 as you type, or the whole
 *   link pasted) — one tap, or one code — plus the notices of a dropped pairing (revoked,
 *   code unanswered) and of the page link (legacy QR, no valid code, code already used).
 * - **Waiting** (a code sent, no `welcome` yet: `connecting` right after the code, or
 *   `offline · code-pending`): «In attesa di Foundry…», the countdown to the code expiry
 *   when this page sent the code, and «Annulla» back to P03.
 * - **P02** (otherwise): a summary first («Tutto ok: puoi mettere via il telefono» when
 *   online), then — while offline — «Collega di nuovo» with the one primary action; the
 *   facts that have a value (relay, Foundry, character, GM, latency while online);
 *   «Pausa» / «Riprendi» / «Riconnetti»; settings in a closed «Preferenze» disclosure;
 *   «Diagnostica» with the boot line, errors and «Dimentica associazione» (confirmed
 *   inline, like Foundry's «Dimenticare questi occhiali?»).
 * - The phone never says «Disconnetti»: in Foundry «Scollega» / "Disconnect" revokes the
 *   pairing, on the phone «Pausa» only stops the link (one glossary).
 * - The boot line (`app · secure · crypto · link · relay`, no secrets) lives under
 *   «Diagnostica»; pairing failures are mapped precisely: invalid code, not a pairing QR,
 *   code already used, otherwise «Collegamento non riuscito: <msg>» (logged).
 * - In debug/demo mode only (a debug log is registered), the tail of the debug channel is
 *   listed under «Diagnostica».
 *
 * Plain DOM, no framework, no external assets (Even Hub CDN constraint). Styling lives in
 * `phone.css` (Even phone tokens: hub design-guidelines "Phone-Side App UI").
 *
 * @see docs/design/g2-thirds-layout.md §P02 §P03
 * @see docs/setup-guide.md (the phone page)
 */

import { formatManualCode, MANUAL_CODE_LENGTH, PAIRING_TTL_MS } from '@evf/shared-protocol';
import { activeDebugLog, type DebugLogReader } from '../debug/debug-log.js';
import { type DirectSession, PAIRING_ERROR, type SessionInfo } from '../direct/session.js';
import {
  type AppSettings,
  type AppState,
  type AppStore,
  type ConnectionState,
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
  | 'cancelPendingCode'
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

/** Sets the text only when it changed: a live region must not re-announce the same words. */
function setText(node: HTMLElement, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}

/** First letter upper-cased (cause and retry fragments shown as their own sentence). */
function sentence(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** A mounted view: `update` refreshes values in place, `dispose` stops its timers. */
interface View {
  node: HTMLElement;
  update(state: AppState, info: SessionInfo): void;
  dispose(): void;
}

/**
 * Pairing started from this page (code or scan): when it started — the code expires
 * `PAIRING_TTL_MS` after the phone stored it — so the waiting step can count down.
 * Shared by the views (the page switches from P03 to «waiting» while it runs).
 */
interface PairingFlow {
  /** Epoch ms of the code sent from this page, or null (none, or sent before a reload). */
  readonly startedAt: number | null;
  start(): void;
  /** The session refused the code (nothing stored): back to the form. */
  fail(): void;
  /** «Annulla»: drop the pending code (back to P03). */
  cancel(): void;
}

/**
 * Formats the code field as the player types: Crockford characters upper-cased in groups
 * of four (`7QK3-MX9P-2HRA-C4TE`), at most {@link MANUAL_CODE_LENGTH} characters. A
 * pasted link (anything with `#`, `?`, `=`, `/`, `:` or `.`) is left untouched — the
 * session reads the code out of it.
 */
export function formatCodeInput(raw: string): string {
  if (/[#?=/:.]/.test(raw)) return raw;
  const cleaned = raw
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .slice(0, MANUAL_CODE_LENGTH);
  return formatManualCode(cleaned);
}

/** Caret index in a formatted code after `chars` code characters (dash after each 4). */
function caretAfter(chars: number): number {
  return chars === 0 ? 0 : chars + Math.floor((chars - 1) / 4);
}

/** `m:ss` of a remaining time (rounded up to the second, never negative). */
function minutesSeconds(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * Diagnostic line (under «Diagnostica», P02 and P03): what a support screenshot needs to
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
      setText(node, text ?? '');
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

/**
 * «Diagnostica» disclosure shared by the three views: the boot line, `facts` (P02: module
 * version, errors), the debug tail (debug mode only), then `actions` (P02: «Dimentica
 * associazione» and its confirmation).
 */
function buildDiagnostics(
  t: PhoneStrings,
  debugLog: DebugLogReader | null,
  facts: Child[] = [],
  actions: Child[] = [],
): { node: HTMLDetailsElement; update(info: SessionInfo): void } {
  const boot = el('p', { class: 'evf-dim evf-boot', 'data-field': 'boot' });
  const debugTail = debugLog === null ? null : buildDebugTail(debugLog, t);
  const node = el('details', { class: 'evf-card', 'data-field': 'diag-section' }, [
    el('summary', {}, [t.diagnostics]),
    boot,
    ...facts,
    ...(debugTail === null ? [] : [debugTail.node]),
    ...actions,
  ]);
  return {
    node,
    update(info) {
      setText(boot, bootLine(info.boot));
      debugTail?.update();
    },
  };
}

/** What P02 is helping with now — decides the summary, the order and the one primary. */
type ConnectionMode = 'healthy' | 'connecting' | 'paused' | 'replaced' | 'recovery';

/**
 * P02 mode: `paused` is the link stopped from the phone («Pausa»: offline, no cause, no
 * retry); `replaced` is recovered with «Riconnetti»; every other offline state needs the
 * «Collega di nuovo» card (`recovery`).
 */
export function connectionMode(c: ConnectionState): ConnectionMode {
  if (c.status === 'online') return 'healthy';
  if (c.status !== 'offline') return 'connecting';
  if (c.cause === 'replaced') return 'replaced';
  if (c.cause === undefined && c.retryInMs === undefined) return 'paused';
  return 'recovery';
}

/** Summary lines of P02: headline (state), detail (cause / reassurance) and retry. */
export function summaryText(
  c: ConnectionState,
  t: PhoneStrings,
): { headline: string; detail: string; retry: string } {
  const cause = {
    'no-projector': t.causeNoProjector,
    network: t.causeNetwork,
    background: t.causeBackground,
    'code-pending': t.causeCodePending,
    actor: t.causeActor,
    replaced: t.causeReplaced,
  } as const;
  const retry =
    c.status === 'offline' && c.retryInMs !== undefined && c.attempt !== undefined
      ? sentence(t.retryIn(Math.ceil(c.retryInMs / 1000), c.attempt))
      : '';
  switch (connectionMode(c)) {
    case 'healthy':
      return { headline: t.allGood, detail: t.allGoodDetail, retry };
    case 'connecting':
      return { headline: t.statusConnecting, detail: '', retry };
    case 'paused':
      return { headline: t.pausedTitle, detail: t.pausedDetail, retry };
    default:
      return {
        headline: t.statusOffline,
        detail: c.cause === undefined ? '' : sentence(cause[c.cause]),
        retry,
      };
  }
}

function buildConnectionView(
  session: PhoneSession,
  t: PhoneStrings,
  camera: CameraLike | null,
  scanDeps: QrScanDeps | undefined,
  debugLog: DebugLogReader | null,
  flow: PairingFlow,
): View {
  // ── Summary: the live region carries the state; the retry countdown is outside it so
  // a ticking «riprovo tra N s» is not re-announced every second.
  const headline = el('p', { class: 'evf-headline', 'data-field': 'headline' });
  const detail = el('p', { 'data-field': 'detail' });
  const retry = el('p', { class: 'evf-dim', 'data-field': 'retry' });
  const summary = el('div', { class: 'evf-card evf-summary', 'data-field': 'summary' }, [
    el('div', { role: 'status', 'aria-live': 'polite', 'data-field': 'summary-live' }, [
      headline,
      detail,
    ]),
    retry,
  ]);

  // ── Facts: only the rows that have a value.
  const row = (name: string, label: string) => {
    const value = el('dd', { 'data-field': name });
    const node = el('div', { 'data-row': name }, [el('dt', {}, [label]), value]);
    return { node, value };
  };
  const facts = {
    server: row('server', t.server),
    user: row('user', t.user),
    character: row('character', t.character),
    gm: row('gm', t.gm),
    latency: row('latency', t.latency),
  };
  const factList = el('dl', { class: 'evf-card evf-facts', 'data-field': 'facts' }, [
    ...Object.values(facts).map((r) => r.node),
  ]);
  const showFact = (r: { node: HTMLElement; value: HTMLElement }, text: string | undefined) => {
    r.node.hidden = text === undefined;
    setText(r.value, text ?? '');
  };

  // ── Actions: «Riprendi» (paused) · «Riconnetti» · «Pausa».
  const resume = el('button', { type: 'button', class: 'evf-primary', 'data-action': 'resume' }, [
    t.resume,
  ]);
  resume.addEventListener('click', () => session.reconnect());
  const reconnect = el('button', { type: 'button', 'data-action': 'reconnect' }, [t.reconnect]);
  reconnect.addEventListener('click', () => session.reconnect());
  const pause = el('button', { type: 'button', 'data-action': 'pause' }, [t.pause]);
  pause.addEventListener('click', () => session.disconnect());
  const actions = el('div', { class: 'evf-actions', 'data-field': 'actions' }, [
    resume,
    reconnect,
    pause,
  ]);

  // ── «Collega di nuovo»: a stale or unanswered pairing is never a dead end.
  const controls = buildPairControls(session, t, camera, scanDeps, flow);
  const linkNotice = buildLinkNotice(t, true);
  const repair = el('details', { class: 'evf-card', 'data-field': 'repair' }, [
    el('summary', {}, [t.repair]),
    linkNotice.node,
    ...(controls.scan === null
      ? []
      : [controls.scan, el('p', { class: 'evf-divider' }, [t.orCode])]),
    controls.error,
    controls.form,
  ]);

  // ── «Preferenze»: device settings, closed by default (set once, rarely changed).
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
    { id: 'evf-map-cell', name: 'mapCellPx', 'aria-describedby': 'evf-map-help' },
    [6, 8, 12].map((px) => el('option', { value: String(px) }, [t.cellSize(px)])),
  );
  cell.addEventListener('change', () =>
    session.updateSettings({ mapCellPx: Number(cell.value) as AppSettings['mapCellPx'] }),
  );
  const pixel = el(
    'select',
    { id: 'evf-map-pixel', name: 'mapPixelSize', 'aria-describedby': 'evf-map-help' },
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
    'aria-describedby': 'evf-sheet-help',
  });
  autoSheet.addEventListener('change', () =>
    session.updateSettings({ autoSheetPage: autoSheet.checked }),
  );
  const preferences = el('details', { class: 'evf-card', 'data-field': 'preferences' }, [
    el('summary', {}, [t.preferences]),
    el('div', { class: 'evf-settings' }, [
      el('label', { for: 'evf-locale' }, [t.language]),
      locale,
      el('label', { for: 'evf-map-cell' }, [t.map]),
      cell,
      el('label', { for: 'evf-map-pixel' }, [t.mapArt]),
      pixel,
      el('span', {}, []),
      el('label', { class: 'evf-check' }, [follow, t.followToken]),
      el('p', { class: 'evf-dim evf-help', id: 'evf-map-help', 'data-field': 'map-help' }, [
        t.mapHelp,
      ]),
      el('span', {}, [t.sheet]),
      el('label', { class: 'evf-check' }, [autoSheet, t.autoSheet]),
      el('p', { class: 'evf-dim evf-help', id: 'evf-sheet-help' }, [t.sheetHelp]),
    ]),
  ]);

  // ── «Diagnostica»: boot line, module version, errors, «Dimentica associazione».
  const version = el('p', { class: 'evf-dim', 'data-field': 'version' });
  const errors = el('ul', { class: 'evf-diag', 'data-field': 'diagnostics' });
  const forget = el('button', { type: 'button', class: 'evf-danger', 'data-action': 'forget' }, [
    t.forget,
  ]);
  const forgetCancel = el('button', { type: 'button', 'data-action': 'forget-cancel' }, [t.cancel]);
  const forgetProceed = el(
    'button',
    { type: 'button', class: 'evf-danger', 'data-action': 'forget-proceed' },
    [t.forgetProceed],
  );
  const forgetConfirm = el('div', { class: 'evf-confirm', 'data-field': 'forget-confirm' }, [
    el('p', {}, [t.forgetConfirm]),
    el('div', { class: 'evf-actions' }, [forgetProceed, forgetCancel]),
  ]);
  forgetConfirm.hidden = true;
  const askForget = (open: boolean): void => {
    forgetConfirm.hidden = !open;
    forget.hidden = open;
    (open ? forgetCancel : forget).focus();
  };
  forget.addEventListener('click', () => askForget(true));
  forgetCancel.addEventListener('click', () => askForget(false));
  forgetProceed.addEventListener('click', () => void session.forget());
  const diagnostics = buildDiagnostics(t, debugLog, [version, errors], [forget, forgetConfirm]);

  const top = header(t.titleConnection);
  const node = el('section', { 'data-view': 'connection' });
  let shownMode: ConnectionMode | null = null;

  return {
    node,
    update(state, info) {
      const c = state.connection;
      const mode = connectionMode(c);
      if (mode !== shownMode) {
        // Offline: recovery first (summary → «Collega di nuovo» → actions → facts).
        // Otherwise the facts come before the actions. Reordered only when the mode
        // changes, so focus and the player's own disclosure toggles survive updates.
        const recovering = mode === 'recovery';
        node.replaceChildren(
          top,
          summary,
          ...(recovering ? [repair, actions, factList] : [factList, actions, repair]),
          preferences,
          diagnostics.node,
        );
        // Opens when the link is lost, closes otherwise; the player's toggle wins until
        // the mode changes again.
        repair.open = recovering;
        summary.dataset.mode = mode;
        shownMode = mode;
      }
      const text = summaryText(c, t);
      setText(headline, text.headline);
      setText(detail, text.detail);
      detail.hidden = text.detail === '';
      setText(retry, text.retry);
      retry.hidden = text.retry === '';

      showFact(facts.server, c.server ?? info.boot.relay);
      showFact(facts.user, c.userName);
      showFact(facts.character, c.actorName);
      showFact(
        facts.gm,
        c.gmName === undefined ? undefined : mode === 'healthy' ? t.gmOnline(c.gmName) : c.gmName,
      );
      showFact(
        facts.latency,
        mode === 'healthy' && info.latencyMs !== null ? `${info.latencyMs} ms` : undefined,
      );

      resume.hidden = mode !== 'paused';
      pause.hidden = mode === 'paused';
      reconnect.hidden = mode === 'healthy' || mode === 'paused';
      reconnect.classList.toggle('evf-primary', mode === 'replaced');

      controls.update(info);
      linkNotice.update(info);
      locale.value = state.settings.locale;
      cell.value = String(state.settings.mapCellPx);
      pixel.value = String(state.settings.mapPixelSize ?? DEFAULT_MAP_PIXEL_SIZE);
      follow.checked = state.settings.followToken;
      autoSheet.checked = state.settings.autoSheetPage;
      version.hidden = info.moduleVersion === null;
      setText(version, `${t.moduleVersion}: ${info.moduleVersion ?? ''}`);
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
      diagnostics.update(info);
    },
    dispose() {},
  };
}

/** Scan button + code form + error lines, shared by P03 and the P02 «Collega di nuovo». */
interface PairControls {
  /** «Scansiona QR» + its framing hint, or null without the Even App camera. */
  scan: HTMLElement | null;
  /** Scan and page-link failures (`p[data-field="error"]`). */
  error: HTMLElement;
  /** The code form; its own error line is inside it, linked to the field. */
  form: HTMLFormElement;
  /** Shows a pairing-link failure of the session (once per distinct message). */
  update(info: SessionInfo): void;
}

/** Phone text for a failed scan: the cause, and for «no QR» the photo it looked at. */
function scanErrorText(err: QrScanError, t: PhoneStrings): string {
  if (err.reason === 'camera') return t.cameraUnavailable;
  if (err.reason === 'format') return t.photoFormat(err.detail);
  return err.detail === '' ? t.noQrInPhoto : `${t.noQrInPhoto} (${err.detail})`;
}

function buildPairControls(
  session: PhoneSession,
  t: PhoneStrings,
  camera: CameraLike | null,
  scanDeps: QrScanDeps | undefined,
  flow: PairingFlow,
): PairControls {
  const error = el('p', { class: 'evf-error', role: 'alert', 'data-field': 'error' });

  let scan: HTMLElement | null = null;
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
          else {
            flow.start();
            return session.pairScanned(text);
          }
        })
        .catch((err: unknown) => {
          if (!(err instanceof QrScanError)) flow.fail();
          error.textContent =
            err instanceof QrScanError ? scanErrorText(err, t) : pairingErrorText(err, t);
        })
        .finally(() => {
          button.disabled = false;
        });
    });
    scan = el('div', { class: 'evf-scan' }, [
      button,
      el('p', { class: 'evf-dim', 'data-field': 'scan-hint' }, [t.scanHint]),
    ]);
  }

  const codeError = el('p', {
    class: 'evf-error',
    id: 'evf-code-error',
    role: 'alert',
    'data-field': 'code-error',
  });
  const code = el('input', {
    id: 'evf-code',
    name: 'code',
    type: 'text',
    inputmode: 'text',
    autocomplete: 'off',
    // Capitals on the keyboard for the code (it is upper-cased and grouped as typed
    // anyway); a pasted link is left as it is (`formatCodeInput`).
    autocapitalize: 'characters',
    autocorrect: 'off',
    spellcheck: 'false',
    enterkeyhint: 'go',
    placeholder: 'XXXX-XXXX-XXXX-XXXX',
    // Room for the whole pairing link (dev / self-host links carry `&relay=`).
    maxlength: '256',
    required: '',
    'aria-invalid': 'false',
    'aria-describedby': 'evf-code-error',
  });
  const showCodeError = (text: string): void => {
    codeError.textContent = text;
    code.setAttribute('aria-invalid', text === '' ? 'false' : 'true');
  };
  code.addEventListener('input', () => {
    if (codeError.textContent !== '') showCodeError('');
    const caret = code.selectionStart ?? code.value.length;
    const formatted = formatCodeInput(code.value);
    if (formatted === code.value) return;
    const typed = code.value.slice(0, caret).replace(/[^0-9a-z]/gi, '').length;
    code.value = formatted;
    if (document.activeElement === code) {
      const at = Math.min(caretAfter(typed), formatted.length);
      code.setSelectionRange(at, at);
    }
  });
  // Primary only when there is no «Scansiona QR» (one primary per screen).
  const submit = el(
    'button',
    camera === null ? { type: 'submit', class: 'evf-primary' } : { type: 'submit' },
    [t.connect],
  );
  const form = el('form', { class: 'evf-form', novalidate: '' }, [
    el('label', { for: 'evf-code' }, [t.code]),
    code,
    codeError,
    submit,
  ]);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    error.textContent = '';
    showCodeError('');
    submit.disabled = true;
    flow.start();
    session.pairCode(code.value).then(
      () => {
        submit.disabled = false;
      },
      (err: unknown) => {
        submit.disabled = false;
        flow.fail();
        showCodeError(pairingErrorText(err, t));
      },
    );
  });

  let shownBootError: string | null = null;
  return {
    scan,
    error,
    form,
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
  flow: PairingFlow,
): View {
  const notice = el('p', { class: 'evf-notice', role: 'alert', hidden: '' }, [t.revokedNotice]);
  const unanswered = el(
    'p',
    { class: 'evf-notice', role: 'alert', 'data-field': 'unanswered', hidden: '' },
    [t.codeUnanswered],
  );
  const linkNotice = buildLinkNotice(t, false);
  const controls = buildPairControls(session, t, camera, scanDeps, flow);
  const diagnostics = buildDiagnostics(t, debugLog);

  const node = el('section', { 'data-view': 'setup' }, [
    header(t.titleSetup),
    el('div', { class: 'evf-card' }, [
      notice,
      unanswered,
      linkNotice.node,
      el('p', {}, [t.noPairing]),
      el('p', {}, [t.easiest, ' ', t.easiestSteps]),
      ...(controls.scan === null ? [] : [controls.scan]),
      controls.error,
    ]),
    el('p', { class: 'evf-divider' }, [t.orCode]),
    el('div', { class: 'evf-card' }, [controls.form]),
    el('p', { class: 'evf-dim' }, [t.help]),
    diagnostics.node,
  ]);
  return {
    node,
    update(state, info) {
      notice.hidden = state.connection.status !== 'revoked';
      unanswered.hidden = state.connection.notice !== 'code-unanswered';
      linkNotice.update(info);
      controls.update(info);
      diagnostics.update(info);
    },
    dispose() {},
  };
}

/**
 * The waiting step: a code was sent and Foundry has not answered yet. Not «Non collegato»
 * — nothing is wrong yet — but what to keep open, how long the code lives, and a way back.
 */
function buildWaitingView(
  t: PhoneStrings,
  debugLog: DebugLogReader | null,
  flow: PairingFlow,
): View {
  const expiry = el('p', { class: 'evf-dim', 'data-field': 'expiry' });
  const cancel = el('button', { type: 'button', 'data-action': 'cancel-code' }, [t.cancel]);
  cancel.addEventListener('click', () => flow.cancel());
  const diagnostics = buildDiagnostics(t, debugLog);
  const node = el('section', { 'data-view': 'waiting' }, [
    header(t.titleWaiting),
    el('div', { class: 'evf-card evf-waiting' }, [
      el('div', { class: 'evf-waiting-head' }, [
        el('span', { class: 'evf-spinner', 'aria-hidden': 'true' }),
        el('p', { class: 'evf-headline', role: 'status', 'data-field': 'waiting' }, [
          t.waitingTitle,
        ]),
      ]),
      el('p', { 'data-field': 'waiting-hint' }, [t.waitingHint]),
      expiry,
      el('div', { class: 'evf-actions' }, [cancel]),
    ]),
    diagnostics.node,
  ]);
  // Not a live region: the countdown is read on demand, never announced every second.
  let timer: ReturnType<typeof setInterval> | null = null;
  const tick = (): void => {
    const started = flow.startedAt;
    expiry.hidden = started === null;
    if (started === null) return;
    setText(expiry, t.codeExpiresIn(minutesSeconds(started + PAIRING_TTL_MS - Date.now())));
    timer ??= setInterval(tick, 1000);
  };
  return {
    node,
    update(_state, info) {
      tick();
      diagnostics.update(info);
    },
    dispose() {
      if (timer !== null) clearInterval(timer);
    },
  };
}

/** Which view the connection state calls for (`codeSent`: a code went out from this page). */
function viewKind(c: ConnectionState, codeSent: boolean): 'setup' | 'waiting' | 'connection' {
  if (c.status === 'unpaired' || c.status === 'revoked') return 'setup';
  if (c.status === 'offline' && c.cause === 'code-pending') return 'waiting';
  if (c.status === 'connecting' && codeSent) return 'waiting';
  return 'connection';
}

/**
 * Mounts the phone page into `root` and keeps it in sync with the store and the session
 * info. The view is rebuilt only when its kind (P03 / waiting / P02) or locale changes, so
 * form input and the disclosure states survive updates. The document language follows the
 * UI locale.
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
  let startedAt: number | null = null;
  const flow: PairingFlow = {
    get startedAt() {
      return startedAt;
    },
    start() {
      startedAt = Date.now();
    },
    fail() {
      startedAt = null;
      render();
    },
    cancel() {
      startedAt = null;
      // Like an early expiry: the pairing this code would have replaced comes back.
      void session.cancelPendingCode();
    },
  };
  const render = (): void => {
    const state = store.get();
    const c = state.connection;
    // The pairing from this page is over once Foundry answered or the code was dropped.
    if (c.status === 'online' || c.status === 'revoked' || c.notice !== undefined) {
      startedAt = null;
    }
    const locale = session.locale();
    const kind = viewKind(c, startedAt !== null);
    const nextKey = `${kind}:${locale}`;
    if (nextKey !== key || view === null) {
      key = nextKey;
      const t = phoneStrings(locale);
      view?.dispose();
      view =
        kind === 'setup'
          ? buildSetupView(session, t, camera, scanDeps, debugLog, flow)
          : kind === 'waiting'
            ? buildWaitingView(t, debugLog, flow)
            : buildConnectionView(session, t, camera, scanDeps, debugLog, flow);
      root.lang = locale;
      document.documentElement.lang = locale;
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
    view?.dispose();
    root.replaceChildren();
  };
}
