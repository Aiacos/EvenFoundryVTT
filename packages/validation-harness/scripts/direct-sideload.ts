// ADR-0016 direct-sideload GO/NO-GO harness — `validate:direct-sideload`.
//
// Usage:
//   FOUNDRY_URL=https://foundry.example.org pnpm --filter @evf/validation-harness validate:direct-sideload
//   FOUNDRY_URL=https://foundry.example.org pnpm --filter @evf/validation-harness validate:direct-sideload -- --skip-hardware
//
// Software checks (always, need FOUNDRY_URL — include any Foundry routePrefix):
//   1. https       — base URL is HTTPS (ADR-0016: valid HTTPS required from the phone)
//   2. reachable   — Foundry root answers over TLS (self-signed / DNS errors → NO-GO)
//   3. g2-entry    — /modules/evenfoundryvtt/g2/index.html served 200 text/html
//   4. api-status  — /api/status JSON (informational; absent = skipped, never NO-GO)
// Then prints the QR URL form the pairing dialog encodes.
//
// Hardware checklist (defer-hardware pattern — manual, needs real phone + G2 + R1):
//   --skip-hardware → printed only, verdict from software checks.
//   otherwise       → operator answers y/n per step on a TTY; no TTY → exit 2 (skipped).
//
// Exit codes: 0 GO · 1 NO-GO · 2 skipped (missing FOUNDRY_URL / no TTY) · 3 usage error.
// Evidence: repo-root docs/perf/phase-0/adr-0016-direct-sideload-<ISO>.json — check
// verdicts only; NO URL, credentials or QR payload are persisted (T-00-01).
//
// @see docs/architecture/0016-direct-foundry-streaming.md §Confirmation / GO-NO-GO gates

import { createInterface } from 'node:readline/promises';
import {
  apiStatusUrl,
  type CheckResult,
  checkHttps,
  evaluateApiStatus,
  evaluateEntry,
  evaluateHardwareAnswers,
  evaluateReachability,
  g2EntryUrl,
  HARDWARE_CHECKLIST,
  type HttpOutcome,
  NO_GO_FALLBACK,
  normalizeFoundryUrl,
  parseSideloadArgs,
  qrUrlForm,
  summarize,
} from '../src/direct-sideload.js';
import { writeJsonEvidence } from '../src/lib/output.js';
import { DirectSideloadResult } from '../src/lib/schemas.js';

const TIMEOUT_MS = 10_000;
const MAX_BODY_CHARS = 64 * 1024;

/** Operator-facing report line (stdout). Errors go to `console.error`. */
function log(line = ''): void {
  process.stdout.write(`${line}\n`);
}

/**
 * Performs one GET without following redirects. Transport failures are reported by
 * their error code (e.g. `DEPTH_ZERO_SELF_SIGNED_CERT`, `ENOTFOUND`) — never by the
 * message, which may embed the hostname.
 */
async function probe(url: string): Promise<HttpOutcome> {
  try {
    const res = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = (await res.text()).slice(0, MAX_BODY_CHARS);
    return {
      kind: 'response',
      status: res.status,
      contentType: res.headers.get('content-type') ?? '',
      body,
    };
  } catch (err: unknown) {
    const cause = err instanceof Error ? (err.cause as { code?: unknown } | undefined) : undefined;
    const code =
      typeof cause?.code === 'string'
        ? cause.code
        : err instanceof Error
          ? err.name
          : 'unknown error';
    return { kind: 'error', message: code };
  }
}

function printChecklist(): void {
  log('Manual hardware checklist (ADR-0016 §Confirmation):');
  for (const [i, step] of HARDWARE_CHECKLIST.entries()) {
    log(`  [${i + 1}] ${step.prompt}`);
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
    ({ skipHardware } = parseSideloadArgs(process.argv.slice(2)));
  } catch (err: unknown) {
    console.error(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(3);
  }

  log('ADR-0016 — direct sideload GO/NO-GO');
  log('===================================');
  log(`Mode: ${skipHardware ? 'SKIP-HARDWARE (software checks only)' : 'FULL'}`);
  log();

  const raw = process.env['FOUNDRY_URL'];
  if (raw === undefined || raw.trim() === '') {
    log('[SKIP] FOUNDRY_URL is not set — export the Foundry base URL (incl. routePrefix).');
    log();
    printChecklist();
    process.exit(2);
  }
  const normalized = normalizeFoundryUrl(raw);
  if (!normalized.ok) {
    console.error(`ERROR: ${normalized.error}`);
    process.exit(3);
  }
  const { base } = normalized;

  const software: CheckResult[] = [
    checkHttps(base),
    evaluateReachability(await probe(`${base}/`)),
    evaluateEntry(await probe(g2EntryUrl(base))),
    evaluateApiStatus(await probe(apiStatusUrl(base))),
  ];
  log('Software checks:');
  printResults(software);

  log('Pairing QR encodes (placeholders — real values come from the GM pairing dialog):');
  log(`  ${qrUrlForm(base)}`);
  log();

  let hardware: CheckResult[] = [];
  if (skipHardware) {
    printChecklist();
    log('[SKIP-FLAG] hardware checklist not executed (--skip-hardware).');
  } else if (!process.stdin.isTTY) {
    printChecklist();
    log('[SKIP] hardware checklist needs an interactive TTY for operator answers.');
    process.exit(2);
  } else {
    log('Hardware checklist — answer after performing each step on phone + G2:');
    hardware = evaluateHardwareAnswers(await askHardware());
    log();
    printResults(hardware);
  }

  const results = [...software, ...hardware];
  const summary = summarize(results);
  const evidence = DirectSideloadResult.parse({
    schema_version: 1,
    test_id: 'adr-0016-direct-sideload',
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
    checks: results,
  });
  const fpath = await writeJsonEvidence(evidence);

  log(`Verdict: ${summary.verdict === 'pass' ? 'GO' : 'NO-GO'}`);
  if (summary.verdict === 'fail') log(NO_GO_FALLBACK);
  log(`Evidence: ${fpath}`);
  process.exit(summary.exitCode);
}

main().catch((err: unknown) => {
  console.error('direct-sideload fatal:', err);
  process.exit(1);
});
