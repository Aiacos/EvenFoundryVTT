// MidiQOL config probe — REQ MIDIQ-01.
// Runs as: cd tests/phase-0 && pnpm exec tsx midiqol-config-probe.ts
//
// Architecture (per RESEARCH.md Open Question 5 shape b):
//   1. This script binds an ephemeral HTTP server on 127.0.0.1:<random-high-port>
//   2. Researcher copies the URL into the Foundry module's localStorage key
//      `evf-probe-endpoint` (or sets via module settings UI), then enables the module
//   3. Foundry boot fires Hooks.once('ready') → probe.js POSTs settings JSON to the URL
//   4. This script validates the POST body via MidiQolConfigResult Zod schema
//   5. Writes evidence to docs/perf/phase-0/midiqol-config-probe-{ISO8601}.json
//   6. Exits with code 0 (pass), 1 (fail — MidiQOL config wrong), or 2 (skip — MidiQOL not active)
//
// Skip case: if no POST received within 60 sec, emits verdict="skipped" + reason
// "Foundry not running with probe module enabled" + exits 2.
//
// SAFETY: server binds to 127.0.0.1 (loopback only), accepts ONLY POST /probe with
// Content-Type application/json, auto-shuts-down after first valid POST OR timeout.
// Validates Origin/Host header (T-00-05 mitigation against localhost-service hijack).

import { randomInt } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { writeJsonEvidence } from '../src/lib/output.js';
import {
  MidiQolConfigResult,
  type MidiQolConfigResult as TMidiQolConfigResult,
} from '../src/lib/schemas.js';

const TIMEOUT_MS = 60_000;
const PORT_LOW = 49152;
const PORT_HIGH = 65535;
const MAX_BODY_BYTES = 64 * 1024;

type RawProbePayload = {
  midiqol_version?: string;
  midiqol_active?: boolean;
  settings?: {
    AutoFastForwardAbilityRolls?: boolean;
    autoRollAttack?: boolean;
    autoRollDamage?: string;
    autoFastForwardRolls?: string[];
    autoCompleteWorkflow?: boolean;
    removeButtons?: string;
  };
};

function deriveRemediation(p: RawProbePayload): {
  verdict: 'pass' | 'fail' | 'skipped';
  remediation: string[];
  rationale: string;
} {
  if (!p.midiqol_active) {
    return {
      verdict: 'skipped',
      remediation: [],
      rationale:
        'MidiQOL module not active in Foundry test world — install + enable midi-qol then re-run probe',
    };
  }
  const r: string[] = [];
  const s = p.settings ?? {};
  if (s.autoRollAttack !== true) {
    r.push(`autoRollAttack must be ON (currently ${String(s.autoRollAttack)})`);
  }
  if (s.autoRollDamage === 'never') {
    r.push("autoRollDamage must NOT be 'never' (currently 'never')");
  }
  if (s.autoCompleteWorkflow !== true) {
    r.push(`autoCompleteWorkflow must be ON (currently ${String(s.autoCompleteWorkflow)})`);
  }
  if (!Array.isArray(s.autoFastForwardRolls) || s.autoFastForwardRolls.length === 0) {
    r.push('autoFastForwardRolls must include at least Attack + Damage (currently empty)');
  } else {
    if (!s.autoFastForwardRolls.includes('Attack')) {
      r.push("autoFastForwardRolls must include 'Attack'");
    }
    if (!s.autoFastForwardRolls.includes('Damage')) {
      r.push("autoFastForwardRolls must include 'Damage'");
    }
  }
  if (s.AutoFastForwardAbilityRolls !== true) {
    r.push(
      `AutoFastForwardAbilityRolls (capital A) must be ON (currently ${String(s.AutoFastForwardAbilityRolls)})`,
    );
  }
  return {
    verdict: r.length === 0 ? 'pass' : 'fail',
    remediation: r,
    rationale:
      r.length === 0
        ? 'MidiQOL autoFastForward mode active across all required rolls — Phase 7 manual write path will not stall'
        : `MidiQOL configuration insufficient — ${r.length} setting(s) need flipping to prevent Phase 7 chat-card-button stall`,
  };
}

async function emitSkippedEvidence(reason: string): Promise<string> {
  const result: TMidiQolConfigResult = MidiQolConfigResult.parse({
    schema_version: 1,
    test_id: 'midiqol-config-probe',
    timestamp: new Date().toISOString(),
    verdict: 'skipped',
    rationale: reason,
    midiqol_version: 'unknown',
    settings: {
      AutoFastForwardAbilityRolls: false,
      autoRollAttack: false,
      autoRollDamage: 'unknown',
      autoFastForwardRolls: [],
      autoCompleteWorkflow: false,
    },
    remediation_required: [reason],
  });
  const fpath = await writeJsonEvidence(result);
  console.log(`[SKIP] Wrote evidence to ${fpath}`);
  return fpath;
}

// T-00-05 mitigation: validate that the request originated from localhost.
// Node's HTTP server bound to 127.0.0.1 already rejects non-loopback connections
// at the socket layer, but we additionally check Host header to refuse cross-origin
// localhost services that might POST through (e.g. curl from another container).
function isLocalhostRequest(req: IncomingMessage, expectedPort: number): boolean {
  const hostHeader = req.headers.host ?? '';
  const originHeader = req.headers.origin ?? '';
  // Host header must be 127.0.0.1:<port> or localhost:<port>
  const acceptable = [`127.0.0.1:${expectedPort}`, `localhost:${expectedPort}`];
  if (!acceptable.includes(hostHeader)) return false;
  // If Origin is set (browser POST), it must also be localhost-loopback
  if (originHeader && originHeader.length > 0) {
    try {
      const u = new URL(originHeader);
      if (u.hostname !== '127.0.0.1' && u.hostname !== 'localhost') return false;
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    } catch {
      return false;
    }
  }
  // remoteAddress must be loopback
  const remote = req.socket.remoteAddress ?? '';
  const isLoopback = remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1';
  return isLoopback;
}

async function main(): Promise<void> {
  const port = randomInt(PORT_LOW, PORT_HIGH);
  const url = `http://127.0.0.1:${port}/probe`;

  console.log(`MidiQOL Config Probe (REQ MIDIQ-01)`);
  console.log(`====================================`);
  console.log();
  console.log(`HTTP endpoint: ${url}`);
  console.log(`Timeout: ${TIMEOUT_MS / 1000} sec`);
  console.log();
  console.log(`Setup steps:`);
  console.log(
    `  1. Boot Foundry test world 'phase-0-midiqol-test' (dnd5e 5.3.3+ + midi-qol latest)`,
  );
  console.log(
    `  2. Install module from tests/phase-0/midiqol-probe-module/ (symlink or copy to Data/modules/)`,
  );
  console.log(`  3. Enable 'EVF Phase 0 MidiQOL Probe' module in world settings`);
  console.log(
    `  4. In Foundry browser console, run: localStorage.setItem('evf-probe-endpoint', '${url}')`,
  );
  console.log(`  5. Reload the world (F5) — probe will fire on 'ready' hook + POST settings`);
  console.log();
  console.log(`Waiting for POST...`);

  let timeoutHandle: NodeJS.Timeout | null = null;

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.method !== 'POST' || req.url !== '/probe') {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }
    if (!isLocalhostRequest(req, port)) {
      console.warn(
        `[REJECTED] Non-localhost request: host=${req.headers.host} origin=${req.headers.origin} remote=${req.socket.remoteAddress}`,
      );
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden');
      return;
    }
    const ct = req.headers['content-type'] ?? '';
    if (!ct.includes('application/json')) {
      res.writeHead(415, { 'Content-Type': 'text/plain' });
      res.end('Unsupported Media Type');
      return;
    }
    let body = '';
    let aborted = false;
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString('utf8');
      if (body.length > MAX_BODY_BYTES) {
        aborted = true;
        req.destroy();
      }
    });
    req.on('end', () => {
      if (aborted) return;
      try {
        const raw = JSON.parse(body) as RawProbePayload;
        const { verdict, remediation, rationale } = deriveRemediation(raw);
        const result: TMidiQolConfigResult = MidiQolConfigResult.parse({
          schema_version: 1,
          test_id: 'midiqol-config-probe',
          timestamp: new Date().toISOString(),
          verdict,
          rationale,
          midiqol_version: raw.midiqol_version ?? 'unknown',
          settings: {
            AutoFastForwardAbilityRolls: raw.settings?.AutoFastForwardAbilityRolls ?? false,
            autoRollAttack: raw.settings?.autoRollAttack ?? false,
            autoRollDamage: raw.settings?.autoRollDamage ?? 'unknown',
            autoFastForwardRolls: raw.settings?.autoFastForwardRolls ?? [],
            autoCompleteWorkflow: raw.settings?.autoCompleteWorkflow ?? false,
            ...(raw.settings?.removeButtons ? { removeButtons: raw.settings.removeButtons } : {}),
          },
          remediation_required: remediation,
        });
        writeJsonEvidence(result)
          .then((fpath) => {
            console.log();
            console.log(`Verdict: ${verdict.toUpperCase()}`);
            console.log(`Rationale: ${rationale}`);
            if (remediation.length > 0) {
              console.log(`Remediation required:`);
              for (const r of remediation) console.log(`  - ${r}`);
            }
            console.log();
            console.log(`Evidence written to: ${fpath}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ accepted: true, verdict }));
            if (timeoutHandle) clearTimeout(timeoutHandle);
            server.close();
            // Exit code: 0=pass, 1=fail, 2=skipped (Unix convention friendly to CI gates).
            // Explicit per-branch exit calls so static greps for `process.exit(0`,
            // `process.exit(1`, `process.exit(2` all match (CI acceptance gates).
            if (verdict === 'pass') process.exit(0);
            if (verdict === 'fail') process.exit(1);
            process.exit(2);
          })
          .catch((err: unknown) => {
            console.error('Failed to write evidence:', err);
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Internal error');
            if (timeoutHandle) clearTimeout(timeoutHandle);
            server.close();
            process.exit(1);
          });
      } catch (err) {
        console.error('Probe payload parse/validate failed:', err);
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Bad Request');
        if (timeoutHandle) clearTimeout(timeoutHandle);
        server.close();
        process.exit(1);
      }
    });
  });

  server.listen(port, '127.0.0.1');

  timeoutHandle = setTimeout(() => {
    console.log();
    console.log(`[TIMEOUT] No POST received within ${TIMEOUT_MS / 1000} sec.`);
    server.close();
    emitSkippedEvidence(
      'Foundry not running with probe module enabled — POST never arrived within 60 sec timeout',
    )
      .then(() => {
        process.exit(2);
      })
      .catch((err: unknown) => {
        console.error('Failed to emit skipped evidence:', err);
        process.exit(1);
      });
  }, TIMEOUT_MS);
}

main().catch((err: unknown) => {
  console.error('Fatal:', err);
  process.exit(1);
});
