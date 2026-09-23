/**
 * ADR-0012 direct-sideload GO/NO-GO — pure helpers.
 *
 * ADR-0012 removes the Node bridge: the g2-app is served by Foundry itself at
 * `/modules/evenfoundryvtt/g2/index.html` and QR-sideloaded into the Even Realities
 * App WebView. This module holds the side-effect-free logic of the
 * `validate:direct-sideload` harness (`scripts/direct-sideload.ts`): URL derivation,
 * HTTP-response verdicts, the manual hardware checklist and the overall verdict.
 * All network / TTY I/O lives in the script so these functions stay unit-testable.
 *
 * Exit-code contract (shared with every harness script, see `scripts/run-all.ts`):
 *   0 — GO (all attempted checks pass)
 *   1 — NO-GO (at least one check failed)
 *   2 — skipped (missing prerequisite: FOUNDRY_URL unset, or no TTY for the manual checklist)
 *   3 — usage error
 *
 * @see docs/architecture/0012-direct-foundry-streaming.md §Confirmation / GO-NO-GO gates
 * @see https://foundryvtt.com/article/module-development/ (modules served at /modules/<id>/)
 */

/** Foundry module id (module.json `id`) under which the g2-app bundle is served. */
export const MODULE_ID = 'evenfoundryvtt';

/** Path of the sideload entry page, relative to the Foundry base URL (incl. routePrefix). */
export const G2_ENTRY_PATH = `/modules/${MODULE_ID}/g2/index.html`;

/** Foundry's unauthenticated status endpoint (optional — may be disabled or proxied away). */
export const API_STATUS_PATH = '/api/status';

/** Outcome of a single check. `skipped` never flips the overall verdict to NO-GO. */
export type CheckVerdict = 'pass' | 'fail' | 'skipped';

/** One line of the GO/NO-GO report. `detail` must never contain credentials or the URL. */
export type CheckResult = {
  id: string;
  verdict: CheckVerdict;
  detail: string;
};

/** Result of {@link normalizeFoundryUrl}. */
export type NormalizedUrl = { ok: true; base: string } | { ok: false; error: string };

/**
 * Validates and normalises the operator-supplied Foundry base URL.
 *
 * Keeps any Foundry `routePrefix` path segment, drops query/fragment and trailing
 * slashes. Scheme is NOT enforced here — {@link checkHttps} reports it as a check so
 * the operator sees every problem in one run.
 *
 * @param raw - value of the `FOUNDRY_URL` env var.
 * @returns the normalised base (no trailing slash) or a human-readable error.
 */
export function normalizeFoundryUrl(raw: string): NormalizedUrl {
  const trimmed = raw.trim();
  if (trimmed === '') return { ok: false, error: 'FOUNDRY_URL is empty' };
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, error: `FOUNDRY_URL is not an absolute URL: '${trimmed}'` };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { ok: false, error: `FOUNDRY_URL must be http(s), got '${url.protocol}'` };
  }
  const path = url.pathname.replace(/\/+$/, '');
  return { ok: true, base: `${url.protocol}//${url.host}${path}` };
}

/** @returns the absolute sideload entry URL for a normalised base. */
export function g2EntryUrl(base: string): string {
  return `${base}${G2_ENTRY_PATH}`;
}

/** @returns the absolute `/api/status` URL for a normalised base. */
export function apiStatusUrl(base: string): string {
  return `${base}${API_STATUS_PATH}`;
}

/**
 * Shape of the URL the pairing QR encodes (ADR-0012 Decision Outcome §3). The fragment
 * carries base64url(JSON `{v:1,u,p,k}`) and never reaches the server. Printed with
 * placeholders only — the harness never generates real credentials.
 */
export function qrUrlForm(base: string): string {
  return `${g2EntryUrl(base)}#evf=<base64url({"v":1,"u":"<g2UserId>","p":"<password>","k":"<K>"})>`;
}

/** ADR-0012 consequence: the phone must reach Foundry over valid HTTPS. */
export function checkHttps(base: string): CheckResult {
  return base.startsWith('https://')
    ? { id: 'https', verdict: 'pass', detail: 'Foundry base URL uses HTTPS' }
    : {
        id: 'https',
        verdict: 'fail',
        detail: 'Foundry base URL is not HTTPS — Even App WebView requires valid HTTPS (ADR-0012)',
      };
}

/** Minimal view of an HTTP exchange (or its transport failure) fed to the evaluators. */
export type HttpOutcome =
  | { kind: 'response'; status: number; contentType: string; body: string }
  | { kind: 'error'; message: string };

/**
 * Reachability of the Foundry root. Any HTTP answer below 500 counts (Foundry
 * redirects `/` to `/join` or `/setup`); a transport error (DNS, TLS, timeout) fails —
 * a self-signed LAN certificate surfaces here, which ADR-0012 lists as unsupported.
 */
export function evaluateReachability(outcome: HttpOutcome): CheckResult {
  if (outcome.kind === 'error') {
    return {
      id: 'reachable',
      verdict: 'fail',
      detail: `transport error: ${outcome.message} (self-signed TLS is unsupported — ADR-0012)`,
    };
  }
  return outcome.status < 500
    ? { id: 'reachable', verdict: 'pass', detail: `HTTP ${outcome.status}` }
    : { id: 'reachable', verdict: 'fail', detail: `server error HTTP ${outcome.status}` };
}

/**
 * The sideload entry page must be served 200 as `text/html` — otherwise the QR URL
 * opens an error page in the Even App (module not installed/enabled, or the zip was
 * released without `g2/`).
 */
export function evaluateEntry(outcome: HttpOutcome): CheckResult {
  const id = 'g2-entry';
  if (outcome.kind === 'error') {
    return { id, verdict: 'fail', detail: `transport error: ${outcome.message}` };
  }
  if (outcome.status !== 200) {
    return {
      id,
      verdict: 'fail',
      detail: `HTTP ${outcome.status} — is the ${MODULE_ID} module installed + enabled, with g2/ in its zip?`,
    };
  }
  if (!outcome.contentType.toLowerCase().startsWith('text/html')) {
    return {
      id,
      verdict: 'fail',
      detail: `HTTP 200 but content-type '${outcome.contentType || '(none)'}' is not text/html`,
    };
  }
  return { id, verdict: 'pass', detail: 'HTTP 200 text/html' };
}

/**
 * `/api/status` is informational: absent / non-JSON answers are `skipped`, never NO-GO
 * (reverse proxies often hide it). When present, reports the Foundry version.
 */
export function evaluateApiStatus(outcome: HttpOutcome): CheckResult {
  const id = 'api-status';
  if (outcome.kind === 'error') {
    return { id, verdict: 'skipped', detail: `not reachable: ${outcome.message}` };
  }
  if (outcome.status !== 200 || !outcome.contentType.toLowerCase().includes('json')) {
    return { id, verdict: 'skipped', detail: `not exposed (HTTP ${outcome.status})` };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(outcome.body);
  } catch {
    return { id, verdict: 'skipped', detail: 'HTTP 200 but body is not valid JSON' };
  }
  const version =
    typeof parsed === 'object' && parsed !== null && 'version' in parsed
      ? String((parsed as { version: unknown }).version)
      : 'unknown';
  return { id, verdict: 'pass', detail: `Foundry version ${version}` };
}

/** One manual hardware step (defer-hardware pattern: prompted, never automated). */
export type HardwareStep = { id: string; prompt: string };

/** Manual checklist from ADR-0012 §Confirmation — executed with real phone + G2. */
export const HARDWARE_CHECKLIST: ReadonlyArray<HardwareStep> = [
  {
    id: 'hw-qr-load',
    prompt: 'Even Realities App scans the pairing QR and loads the page served by Foundry',
  },
  {
    id: 'hw-sdk-bridge',
    prompt: 'EvenAppBridge is injected in that WebView (g2-app boots and draws on the G2)',
  },
  {
    id: 'hw-cookie-persist',
    prompt:
      'Foundry session cookie persists across Even App foreground exit → enter (no re-pair needed)',
  },
  {
    id: 'hw-socket-reconnect',
    prompt: 'socket.io reconnects after foreground re-entry and the HUD resumes live updates',
  },
];

/** NO-GO fallback documented by ADR-0012. */
export const NO_GO_FALLBACK =
  'NO-GO fallback (ADR-0012): serve Foundry + g2 bundle behind a same-site reverse-proxy subdomain.';

/**
 * Maps operator answers to check results. Unanswered steps are `skipped`.
 *
 * @param answers - step id → true (observed OK) / false (failed).
 */
export function evaluateHardwareAnswers(answers: Readonly<Record<string, boolean>>): CheckResult[] {
  return HARDWARE_CHECKLIST.map((step) => {
    const answer = answers[step.id];
    if (answer === undefined) {
      return { id: step.id, verdict: 'skipped', detail: 'not executed' };
    }
    return {
      id: step.id,
      verdict: answer ? 'pass' : 'fail',
      detail: answer ? 'confirmed by operator' : 'reported failing by operator',
    };
  });
}

/** Overall verdict + process exit code for a set of check results. */
export type Summary = { verdict: 'pass' | 'fail'; exitCode: 0 | 1 };

/** Any `fail` → NO-GO (exit 1); otherwise GO (exit 0). `skipped` is neutral. */
export function summarize(results: ReadonlyArray<CheckResult>): Summary {
  return results.some((r) => r.verdict === 'fail')
    ? { verdict: 'fail', exitCode: 1 }
    : { verdict: 'pass', exitCode: 0 };
}

/** Parsed CLI flags. */
export type SideloadArgs = { skipHardware: boolean };

/**
 * @param argv - `process.argv.slice(2)`.
 * @throws Error on an unknown flag (script maps it to exit 3).
 */
export function parseSideloadArgs(argv: ReadonlyArray<string>): SideloadArgs {
  let skipHardware = false;
  for (const arg of argv) {
    if (arg === '--') continue; // `pnpm <script> -- --flag` forwards the separator
    if (arg === '--skip-hardware') skipHardware = true;
    else throw new Error(`unknown argument '${arg}' (supported: --skip-hardware)`);
  }
  return { skipHardware };
}
