/**
 * ADR-0019 relay GO/NO-GO — pure helpers.
 *
 * ADR-0019 replaces "the phone logs into Foundry" with an opaque WebSocket room relay
 * (`packages/relay`) between the player's Foundry tab (projector) and the G2 app
 * (glasses). This module holds the side-effect-free logic of the `validate:relay`
 * harness (`scripts/relay-check.ts`): relay URL normalisation, check verdicts, the
 * manual hardware checklist (research gates G1–G2) and the overall verdict. All network
 * / TTY I/O lives in the script so these functions stay unit-testable.
 *
 * Exit-code contract (shared with every harness script, see `scripts/run-all.ts`):
 *   0 — GO (all attempted checks pass)
 *   1 — NO-GO (at least one check failed)
 *   2 — skipped (no TTY for the manual checklist)
 *   3 — usage error (unknown flag, malformed RELAY_URL)
 *
 * @see docs/architecture/0019-relay-pairing-player-projector.md
 * @see specs/004-relay-pairing/research.md §Gates G1–G3
 * @see packages/relay/README.md (wire contract)
 */

import { RelayControlSchema, relayHealthUrl, relayRoomUrl } from '@evf/shared-protocol';

/** Outcome of a single check. `skipped` never flips the overall verdict to NO-GO. */
export type CheckVerdict = 'pass' | 'fail' | 'skipped';

/** One line of the GO/NO-GO report. `detail` must never contain the relay URL or a room id. */
export type CheckResult = {
  id: string;
  verdict: CheckVerdict;
  detail: string;
};

/** Result of {@link normalizeRelayUrl}. */
export type NormalizedRelay = { ok: true; base: string } | { ok: false; error: string };

const SCHEME_TO_WS: Readonly<Record<string, string>> = {
  'wss:': 'wss:',
  'ws:': 'ws:',
  'https:': 'wss:',
  'http:': 'ws:',
};

/**
 * Validates and normalises the relay base URL (`RELAY_URL` or `DEFAULT_RELAY_URL`).
 *
 * Accepts `wss:`/`ws:`/`https:`/`http:`; returns the WebSocket spelling (`wss:`/`ws:`),
 * keeping any path prefix and dropping query, fragment and trailing slashes.
 *
 * @param raw - operator-supplied relay URL.
 * @returns the normalised `ws(s)://host[/prefix]` base or a human-readable error.
 */
export function normalizeRelayUrl(raw: string): NormalizedRelay {
  const trimmed = raw.trim();
  if (trimmed === '') return { ok: false, error: 'RELAY_URL is empty' };
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, error: 'RELAY_URL is not an absolute URL' };
  }
  const scheme = SCHEME_TO_WS[url.protocol];
  if (scheme === undefined) {
    return { ok: false, error: `RELAY_URL must be wss/ws/https/http, got '${url.protocol}'` };
  }
  const path = url.pathname.replace(/\/+$/, '');
  return { ok: true, base: `${scheme}//${url.host}${path}` };
}

/** @returns the HTTP(S) `/health` URL of a normalised relay base. */
export function healthUrl(base: string): string {
  return relayHealthUrl(base);
}

/** @returns the WebSocket URL of `room` for `role` on a normalised relay base. */
export function roomUrl(base: string, room: string, role: 'projector' | 'glasses'): string {
  return relayRoomUrl(base, room, role);
}

/**
 * Encodes random bytes as a base64url room id (16 bytes → 22 chars, the relay minimum).
 *
 * @param bytes - caller-supplied randomness (`crypto.getRandomValues`), ≥ 16 bytes.
 * @throws Error when fewer than 16 bytes are given (the id would be rejected with 404).
 */
export function roomIdFromBytes(bytes: Uint8Array): string {
  if (bytes.length < 16) throw new Error('room id needs at least 16 random bytes');
  return Buffer.from(bytes).toString('base64url');
}

/**
 * Parses a relay control frame.
 *
 * @param data - a received text frame.
 * @returns `peer-up` / `peer-down`, or `null` for anything that is not a control frame.
 */
export function parseControl(data: string): 'peer-up' | 'peer-down' | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return null;
  }
  const result = RelayControlSchema.safeParse(parsed);
  return result.success ? result.data.relay : null;
}

/** Minimal view of the `/health` exchange (or its transport failure). */
export type HealthOutcome =
  | { kind: 'response'; status: number; body: string; allowOrigin: string | null }
  | { kind: 'error'; message: string };

/** Research G1 prerequisite: `GET /health` answers `200 ok`. */
export function evaluateHealth(outcome: HealthOutcome): CheckResult {
  const id = 'health';
  if (outcome.kind === 'error') {
    return { id, verdict: 'fail', detail: `transport error: ${outcome.message}` };
  }
  if (outcome.status !== 200) {
    return { id, verdict: 'fail', detail: `HTTP ${outcome.status} (relay deployed?)` };
  }
  return outcome.body.trim() === 'ok'
    ? { id, verdict: 'pass', detail: 'HTTP 200 ok' }
    : { id, verdict: 'fail', detail: 'HTTP 200 but body is not "ok"' };
}

/** Even Hub apps fetch `/health` cross-origin: the answer must carry `ACAO: *`. */
export function evaluateCors(outcome: HealthOutcome): CheckResult {
  const id = 'cors';
  if (outcome.kind === 'error') {
    return { id, verdict: 'fail', detail: `transport error: ${outcome.message}` };
  }
  return outcome.allowOrigin === '*'
    ? { id, verdict: 'pass', detail: 'Access-Control-Allow-Origin: *' }
    : {
        id,
        verdict: 'fail',
        detail: `Access-Control-Allow-Origin is '${outcome.allowOrigin ?? '(absent)'}', expected '*'`,
      };
}

/** Result of the projector ⇄ glasses room exercise. `stage` names the step that broke. */
export type RoundtripOutcome =
  | { kind: 'ok'; rttMs: number }
  | { kind: 'error'; stage: string; message: string };

/** Room round-trip: peer-up both ways, verbatim forwarding both ways, peer-down on close. */
export function evaluateRoundtrip(outcome: RoundtripOutcome): CheckResult {
  const id = 'room-roundtrip';
  return outcome.kind === 'ok'
    ? {
        id,
        verdict: 'pass',
        detail: `peer-up ×2, verbatim both ways, peer-down; RTT ${outcome.rttMs.toFixed(1)} ms`,
      }
    : { id, verdict: 'fail', detail: `${outcome.stage}: ${outcome.message}` };
}

/** How the relay reacted to a frame above `MAX_RELAY_FRAME_BYTES`. */
export type OversizeOutcome = { kind: 'closed'; code: number } | { kind: 'other'; message: string };

/**
 * Oversize frame is informational (never NO-GO): the relay should close the sender with
 * 1009; anything else is reported as `skipped` with what was observed.
 */
export function evaluateOversize(outcome: OversizeOutcome): CheckResult {
  const id = 'oversize';
  if (outcome.kind === 'closed' && outcome.code === 1009) {
    return { id, verdict: 'pass', detail: 'sender closed with 1009 (message too big)' };
  }
  return {
    id,
    verdict: 'skipped',
    detail:
      outcome.kind === 'closed'
        ? `informational: closed with ${outcome.code}, expected 1009`
        : `informational: ${outcome.message}`,
  };
}

/** One manual hardware step (defer-hardware pattern: prompted, never automated). */
export type HardwareStep = { id: string; prompt: string };

/** Manual checklist from research gates G1–G2 — executed with real Foundry, phone and G2. */
export const HARDWARE_CHECKLIST: ReadonlyArray<HardwareStep> = [
  {
    id: 'hw-forge-v14',
    prompt:
      'Foundry tab on a Forge private v14 game shows «Relay ✓» in «Collega occhiali G2» (no CSP block)',
  },
  {
    id: 'hw-selfhost-v13-v14',
    prompt: 'Self-hosted Foundry v13 and v14 tabs show «Relay ✓» in «Collega occhiali G2»',
  },
  {
    id: 'hw-qr-scan',
    prompt: 'Installed Even Hub build (beta) scans the QR with «Scansiona QR» on iOS and Android',
  },
  { id: 'hw-code-pair', prompt: 'The manual code path pairs the glasses' },
  { id: 'hw-lock-5min', prompt: 'Phone locked 5 minutes → HUD is still live afterwards' },
  {
    id: 'hw-kill-reopen',
    prompt: 'Kill and reopen the Even App → glasses reconnect without re-pairing',
  },
  {
    id: 'hw-projector-close',
    prompt:
      'Close the Foundry tab → glasses show «Foundry del giocatore chiuso»; reopen → back online by itself',
  },
];

/** NO-GO fallback documented by ADR-0019 / relay README (self-hosting). */
export const NO_GO_FALLBACK =
  'NO-GO fallback (ADR-0019): deploy packages/relay to your own Cloudflare account (or workerd) and set the module relay URL override.';

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
export type RelayArgs = { skipHardware: boolean };

/**
 * @param argv - `process.argv.slice(2)`.
 * @throws Error on an unknown flag (script maps it to exit 3).
 */
export function parseRelayArgs(argv: ReadonlyArray<string>): RelayArgs {
  let skipHardware = false;
  for (const arg of argv) {
    if (arg === '--') continue; // `pnpm <script> -- --flag` forwards the separator
    if (arg === '--skip-hardware') skipHardware = true;
    else throw new Error(`unknown argument '${arg}' (supported: --skip-hardware)`);
  }
  return { skipHardware };
}
