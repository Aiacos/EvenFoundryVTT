// ADR-0019 relay GO/NO-GO harness — `validate:relay`.
//
// Usage:
//   pnpm --filter @evf/validation-harness validate:relay                 # interactive hardware checklist
//   pnpm --filter @evf/validation-harness validate:relay:skip-hardware   # software checks only
//   RELAY_URL=ws://127.0.0.1:8787 pnpm --filter @evf/validation-harness validate:relay:skip-hardware
//
// RELAY_URL is optional (wss/ws/https/http accepted) and defaults to DEFAULT_RELAY_URL.
//
// Software checks:
//   1. health          — GET /health is 200 `ok` (research gate G1 prerequisite)
//   2. cors            — /health carries Access-Control-Allow-Origin: * (Even Hub fetches cross-origin)
//   3. room-roundtrip  — projector + glasses on a random room: peer-up both, a frame each way
//                        forwarded verbatim, glasses close → peer-down at the projector; RTT reported
//   4. oversize        — informational (never NO-GO): a > 1 MiB frame closes the sender with 1009
//
// Hardware checklist (defer-hardware pattern — manual, research gates G1–G2):
//   --skip-hardware → printed only, verdict from software checks.
//   otherwise       → operator answers y/n per step on a TTY; no TTY → exit 2 (skipped).
//
// Exit codes: 0 GO · 1 NO-GO · 2 skipped (no TTY) · 3 usage error.
// Evidence: repo-root docs/perf/phase-0/adr-0019-relay-<ISO>.json — check verdicts only;
// NO relay URL or room id is persisted (T-00-01).
//
// @see docs/architecture/0019-relay-pairing-player-projector.md
// @see specs/004-relay-pairing/research.md §Gates G1–G3

import { webcrypto } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { DEFAULT_RELAY_URL, MAX_RELAY_FRAME_BYTES } from '@evf/shared-protocol';
import { writeJsonEvidence } from '../src/lib/output.js';
import { RelayCheckResult } from '../src/lib/schemas.js';
import {
  type CheckResult,
  evaluateCors,
  evaluateHardwareAnswers,
  evaluateHealth,
  evaluateOversize,
  evaluateRoundtrip,
  HARDWARE_CHECKLIST,
  type HealthOutcome,
  healthUrl,
  NO_GO_FALLBACK,
  normalizeRelayUrl,
  type OversizeOutcome,
  parseControl,
  parseRelayArgs,
  type RoundtripOutcome,
  roomIdFromBytes,
  roomUrl,
  summarize,
} from '../src/relay-check.js';

const TIMEOUT_MS = 10_000;
const MAX_BODY_CHARS = 1024;

/** Operator-facing report line (stdout). Errors go to `console.error`. */
function log(line = ''): void {
  process.stdout.write(`${line}\n`);
}

/** Transport error → its code (e.g. `ENOTFOUND`), never the message (may embed the host). */
function errorCode(err: unknown): string {
  const cause = err instanceof Error ? (err.cause as { code?: unknown } | undefined) : undefined;
  if (typeof cause?.code === 'string') return cause.code;
  return err instanceof Error ? err.name : 'unknown error';
}

async function probeHealth(url: string): Promise<HealthOutcome> {
  try {
    const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS) });
    const body = (await res.text()).slice(0, MAX_BODY_CHARS);
    return {
      kind: 'response',
      status: res.status,
      body,
      allowOrigin: res.headers.get('access-control-allow-origin'),
    };
  } catch (err: unknown) {
    return { kind: 'error', message: errorCode(err) };
  }
}

/** Failure of one step of the room exercise; `stage` is reported, never the URL. */
class StageError extends Error {
  constructor(
    readonly stage: string,
    message: string,
  ) {
    super(message);
  }
}

/**
 * A WebSocket whose text frames queue up so steps can await them in order. A close or
 * error while a step waits rejects that step with the close code.
 */
class Peer {
  private readonly queue: string[] = [];
  private waiter: { resolve: (v: string) => void; reject: (e: Error) => void } | null = null;
  private closed: { code: number } | null = null;
  readonly ws: WebSocket;

  private constructor(ws: WebSocket) {
    this.ws = ws;
    ws.addEventListener('message', (ev) => {
      const data = typeof ev.data === 'string' ? ev.data : '<binary>';
      if (this.waiter) {
        this.waiter.resolve(data);
        this.waiter = null;
      } else this.queue.push(data);
    });
    ws.addEventListener('close', (ev) => {
      this.closed = { code: ev.code };
      this.waiter?.reject(new Error(`socket closed (${ev.code})`));
      this.waiter = null;
    });
  }

  /** Opens `url`; rejects with the stage name on error / close / timeout. */
  static open(url: string, stage: string): Promise<Peer> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      const peer = new Peer(ws);
      const timer = setTimeout(() => {
        ws.close();
        reject(new StageError(stage, `no open within ${TIMEOUT_MS} ms`));
      }, TIMEOUT_MS);
      ws.addEventListener('open', () => {
        clearTimeout(timer);
        resolve(peer);
      });
      ws.addEventListener('error', () => {
        clearTimeout(timer);
        reject(new StageError(stage, 'WebSocket error before open'));
      });
      ws.addEventListener('close', (ev) => {
        clearTimeout(timer);
        reject(new StageError(stage, `closed before open (${ev.code})`));
      });
    });
  }

  /** Next text frame, or rejection with `stage` on close / timeout. */
  next(stage: string): Promise<string> {
    const queued = this.queue.shift();
    if (queued !== undefined) return Promise.resolve(queued);
    if (this.closed) {
      return Promise.reject(new StageError(stage, `socket closed (${this.closed.code})`));
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiter = null;
        reject(new StageError(stage, `nothing received within ${TIMEOUT_MS} ms`));
      }, TIMEOUT_MS);
      this.waiter = {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(new StageError(stage, e.message));
        },
      };
    });
  }

  /** Resolves with the close code once the socket closes (or `null` on timeout). */
  closedCode(): Promise<number | null> {
    if (this.closed) return Promise.resolve(this.closed.code);
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), TIMEOUT_MS);
      this.ws.addEventListener('close', (ev) => {
        clearTimeout(timer);
        resolve(ev.code);
      });
    });
  }
}

async function expectControl(peer: Peer, kind: 'peer-up' | 'peer-down', stage: string) {
  const frame = await peer.next(stage);
  if (parseControl(frame) !== kind) throw new StageError(stage, `expected ${kind} control frame`);
}

async function expectFrame(peer: Peer, expected: string, stage: string): Promise<void> {
  const frame = await peer.next(stage);
  if (frame !== expected) throw new StageError(stage, 'frame not forwarded verbatim');
}

function randomRoom(): string {
  return roomIdFromBytes(webcrypto.getRandomValues(new Uint8Array(16)));
}

async function roomRoundtrip(base: string): Promise<RoundtripOutcome> {
  const room = randomRoom();
  const peers: Peer[] = [];
  try {
    const projector = await Peer.open(roomUrl(base, room, 'projector'), 'projector-open');
    peers.push(projector);
    const glasses = await Peer.open(roomUrl(base, room, 'glasses'), 'glasses-open');
    peers.push(glasses);
    await expectControl(projector, 'peer-up', 'projector-peer-up');
    await expectControl(glasses, 'peer-up', 'glasses-peer-up');

    const ping = JSON.stringify({ t: 'evf-harness-ping', n: randomRoom() });
    const pong = JSON.stringify({ t: 'evf-harness-pong', n: randomRoom() });
    const t0 = performance.now();
    projector.ws.send(ping);
    await expectFrame(glasses, ping, 'projector→glasses');
    glasses.ws.send(pong);
    await expectFrame(projector, pong, 'glasses→projector');
    const rttMs = performance.now() - t0;

    glasses.ws.close(1000, 'harness done');
    await expectControl(projector, 'peer-down', 'projector-peer-down');
    return { kind: 'ok', rttMs };
  } catch (err: unknown) {
    return err instanceof StageError
      ? { kind: 'error', stage: err.stage, message: err.message }
      : { kind: 'error', stage: 'unexpected', message: String(err) };
  } finally {
    for (const p of peers) p.ws.close();
  }
}

async function oversize(base: string): Promise<OversizeOutcome> {
  try {
    const projector = await Peer.open(roomUrl(base, randomRoom(), 'projector'), 'oversize-open');
    projector.ws.send('x'.repeat(MAX_RELAY_FRAME_BYTES + 1));
    const code = await projector.closedCode();
    if (code === null) {
      projector.ws.close();
      return { kind: 'other', message: `socket still open after ${TIMEOUT_MS} ms` };
    }
    return { kind: 'closed', code };
  } catch (err: unknown) {
    return { kind: 'other', message: err instanceof Error ? err.message : String(err) };
  }
}

function printChecklist(): void {
  log('Manual hardware checklist (research gates G1–G2):');
  for (const [i, step] of HARDWARE_CHECKLIST.entries()) {
    log(`  [${String.fromCharCode(97 + i)}] ${step.prompt}`);
  }
  log();
}

async function askHardware(): Promise<Record<string, boolean>> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answers: Record<string, boolean> = {};
  try {
    for (const step of HARDWARE_CHECKLIST) {
      const reply = await rl.question(`  ${step.prompt}? [y/n] `);
      answers[step.id] = reply.trim().toLowerCase().startsWith('y');
    }
  } finally {
    rl.close();
  }
  return answers;
}

function printResults(results: ReadonlyArray<CheckResult>): void {
  const width = Math.max(...results.map((r) => r.id.length)) + 2;
  for (const r of results) {
    log(`  ${r.id.padEnd(width)} ${r.verdict.toUpperCase().padEnd(8)} ${r.detail}`);
  }
  log();
}

async function main(): Promise<void> {
  let skipHardware: boolean;
  try {
    ({ skipHardware } = parseRelayArgs(process.argv.slice(2)));
  } catch (err: unknown) {
    console.error(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(3);
  }

  log('ADR-0019 — relay GO/NO-GO');
  log('=========================');
  log(`Mode: ${skipHardware ? 'SKIP-HARDWARE (software checks only)' : 'FULL'}`);

  const raw = process.env['RELAY_URL'];
  const fromEnv = raw !== undefined && raw.trim() !== '';
  const normalized = normalizeRelayUrl(fromEnv ? raw : DEFAULT_RELAY_URL);
  if (!normalized.ok) {
    console.error(`ERROR: ${normalized.error}`);
    process.exit(3);
  }
  const { base } = normalized;
  log(`Relay: ${fromEnv ? 'RELAY_URL' : 'DEFAULT_RELAY_URL'} → ${base}`);
  log();

  const health = await probeHealth(healthUrl(base));
  const software: CheckResult[] = [
    evaluateHealth(health),
    evaluateCors(health),
    evaluateRoundtrip(await roomRoundtrip(base)),
    evaluateOversize(await oversize(base)),
  ];
  log('Software checks:');
  printResults(software);

  let hardware: CheckResult[] = [];
  if (skipHardware) {
    printChecklist();
    log('[SKIP-FLAG] hardware checklist not executed (--skip-hardware).');
  } else if (!process.stdin.isTTY) {
    printChecklist();
    log('[SKIP] hardware checklist needs an interactive TTY for operator answers.');
    process.exit(2);
  } else {
    log('Hardware checklist — answer after performing each step on Foundry + phone + G2:');
    hardware = evaluateHardwareAnswers(await askHardware());
    log();
    printResults(hardware);
  }

  const results = [...software, ...hardware];
  const summary = summarize(results);
  const evidence = RelayCheckResult.parse({
    schema_version: 1,
    test_id: 'adr-0019-relay',
    timestamp: new Date().toISOString(),
    verdict: summary.verdict,
    rationale:
      summary.verdict === 'pass'
        ? skipHardware
          ? 'software checks GO; hardware checklist deferred (--skip-hardware)'
          : 'software + hardware checks GO'
        : `NO-GO: ${results
            .filter((r) => r.verdict === 'fail')
            .map((r) => r.id)
            .join(', ')}`,
    skip_hardware: skipHardware,
    default_relay: !fromEnv,
    checks: results,
  });
  const fpath = await writeJsonEvidence(evidence);

  log(`Verdict: ${summary.verdict === 'pass' ? 'GO' : 'NO-GO'}`);
  if (summary.verdict === 'fail') log(NO_GO_FALLBACK);
  log(`Evidence: ${fpath}`);
  process.exit(summary.exitCode);
}

main().catch((err: unknown) => {
  console.error('relay-check fatal:', String(err));
  process.exit(1);
});
