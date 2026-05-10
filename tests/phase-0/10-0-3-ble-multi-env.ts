// Specs §10.0.3 + Pitfall 2 + CONTEXT.md D-09 — BLE bandwidth multi-environment multi-percentile.
// Run sequence (researcher operationally controls RF env):
//   RF_ENV=clean              pnpm exec tsx 10-0-3-ble-multi-env.ts
//   RF_ENV=5ghz-loaded        pnpm exec tsx 10-0-3-ble-multi-env.ts
//   RF_ENV=2-4ghz-microwave   pnpm exec tsx 10-0-3-ble-multi-env.ts
//
// Each run is a standalone 30-min sustained measurement in one RF environment.
// ADR-0005 closure (Plan 04) reads ALL 3 evidence JSONs and calls deriveBranch() with all envs
// to produce the final A/B/C verdict.
//
// Skip case: Hub unavailable → write skipped evidence + exit 2 (Pattern 3 capability-negotiation skip).
//
// Threat model T-00-03: ZERO network introspection. RF_ENV is enum-only metadata
// {clean, 5ghz-loaded, 2-4ghz-microwave} — does NOT leak SSID/MAC/BSSID. Only application-observable
// throughput timestamps via SDK callback (no link-layer detail per RESEARCH §"Don't Hand-Roll").

import { loadHub } from "./_shared/hub.js";
import { writeJsonEvidence, writeCsvEvidence } from "./_shared/output.js";
import { percentile } from "./_shared/stats.js";
import { deriveBranch, DEFAULT_THRESHOLDS } from "./_shared/branch-decision.js";
import { BleMultiEnvResult } from "./_shared/schemas.js";

// THRESHOLDS pre-committed top-level (D-12 strict numeric, no runtime overrides).
// References DEFAULT_THRESHOLDS from _shared/branch-decision.ts (D-09 envelope locked there).
const THRESHOLDS = {
  duration_ms: 30 * 60 * 1000,
  tile_size_bytes: 4096,
  tile_interval_ms: 100,
  baseline_window_samples: 60,
  renegotiation_drop_threshold_pct: 50,
} as const;

const VALID_ENVS = ["clean", "5ghz-loaded", "2-4ghz-microwave"] as const;
type Env = (typeof VALID_ENVS)[number];

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function parseEnv(): Env {
  const v = process.env["RF_ENV"];
  if (!v) {
    console.error(
      "ERROR: RF_ENV env var is required. Set to one of: clean, 5ghz-loaded, 2-4ghz-microwave",
    );
    process.exit(3);
  }
  if (!VALID_ENVS.includes(v as Env)) {
    console.error(
      `ERROR: RF_ENV='${v}' not valid. Must be one of: ${VALID_ENVS.join(", ")}`,
    );
    process.exit(3);
  }
  return v as Env;
}

async function main(): Promise<void> {
  const env = parseEnv();
  console.log(`Specs §10.0.3 — BLE bandwidth multi-env (Pitfall 2 + D-09)`);
  console.log(`============================================================`);
  console.log(`RF environment: ${env}`);
  console.log(`Duration: ${THRESHOLDS.duration_ms / 60_000} min`);
  console.log(`Tile: ${THRESHOLDS.tile_size_bytes} bytes every ${THRESHOLDS.tile_interval_ms} ms`);
  console.log();

  const hub = await loadHub();
  if (!hub.available) {
    const skipped = BleMultiEnvResult.parse({
      schema_version: 1,
      test_id: "10-0-3-ble-multi-env",
      env,
      timestamp: new Date().toISOString(),
      verdict: "skipped",
      rationale: hub.reason,
      duration_sec: 1,
      tile_size_bytes: THRESHOLDS.tile_size_bytes,
      tile_interval_ms: THRESHOLDS.tile_interval_ms,
      samples_kbps: [],
      p50_kbps: 0,
      p95_kbps: 0,
      p99_kbps: 0,
      renegotiation_events: [],
    });
    const fpath = await writeJsonEvidence(skipped);
    console.log(`[SKIP] ${hub.reason}`);
    console.log(`Evidence: ${fpath}`);
    process.exit(2);
  }

  await hub.bridge.createImageContainer({ id: "ble-test", x: 0, y: 0, w: 200, h: 100 });
  const tile = new Uint8Array(THRESHOLDS.tile_size_bytes);
  for (let i = 0; i < tile.length; i++) tile[i] = i & 0xff;

  const samples: number[] = [];
  const renegotiationEvents: Array<{ t_sec: number; p_drop_pct: number }> = [];
  let baselineKbps = 0;

  console.log(`Starting 30-min measurement at ${new Date().toISOString()}...`);
  const t0 = performance.now();
  let lastReport = t0;

  while (performance.now() - t0 < THRESHOLDS.duration_ms) {
    const tStart = performance.now();
    await hub.bridge.updateImageRawData("ble-test", tile);
    const tEnd = performance.now();
    const elapsedMs = Math.max(0.001, tEnd - tStart);
    const kbps = (THRESHOLDS.tile_size_bytes * 8) / (elapsedMs / 1000) / 1000;
    samples.push(kbps);

    if (samples.length === THRESHOLDS.baseline_window_samples) {
      baselineKbps = percentile(samples, 50);
      console.log(
        `Baseline (first ${THRESHOLDS.baseline_window_samples} samples): p50=${baselineKbps.toFixed(1)} kbps`,
      );
    }
    if (
      baselineKbps > 0 &&
      kbps < baselineKbps * (1 - THRESHOLDS.renegotiation_drop_threshold_pct / 100)
    ) {
      renegotiationEvents.push({
        t_sec: (tEnd - t0) / 1000,
        p_drop_pct: 100 - (kbps / baselineKbps) * 100,
      });
    }

    // Progress every 5 minutes
    if (tEnd - lastReport > 5 * 60 * 1000) {
      const pct = Math.round(((tEnd - t0) / THRESHOLDS.duration_ms) * 100);
      console.log(
        `[${pct}%] samples=${samples.length}, baseline=${baselineKbps.toFixed(1)} kbps, renegotiations=${renegotiationEvents.length}`,
      );
      lastReport = tEnd;
    }

    const slack = THRESHOLDS.tile_interval_ms - (performance.now() - tStart);
    if (slack > 0) await sleep(slack);
  }

  const p50 = percentile(samples, 50);
  const p95 = percentile(samples, 95);
  const p99 = percentile(samples, 99);

  // Per-env verdict using deriveBranch as if this were the only env (Plan 04 will combine all 3)
  const branch = deriveBranch([{ env, p50, p95, p99 }], DEFAULT_THRESHOLDS);
  // Branch verdict letter for evidence schema (Verdict enum allows A/B/C/borderline-A→B/borderline-B→C)
  const branchVerdict = branch.branch;

  const result = BleMultiEnvResult.parse({
    schema_version: 1,
    test_id: "10-0-3-ble-multi-env",
    env,
    timestamp: new Date().toISOString(),
    verdict: branchVerdict,
    rationale: branch.rationale,
    duration_sec: THRESHOLDS.duration_ms / 1000,
    tile_size_bytes: THRESHOLDS.tile_size_bytes,
    tile_interval_ms: THRESHOLDS.tile_interval_ms,
    samples_kbps: samples,
    p50_kbps: p50,
    p95_kbps: p95,
    p99_kbps: p99,
    renegotiation_events: renegotiationEvents,
  });
  const fpath = await writeJsonEvidence(result);
  await writeCsvEvidence(result);
  console.log();
  console.log(`Verdict (this env only): ${branchVerdict}`);
  console.log(
    `p50=${p50.toFixed(1)} kbps, p95=${p95.toFixed(1)} kbps, p99=${p99.toFixed(1)} kbps`,
  );
  console.log(`Renegotiation events: ${renegotiationEvents.length}`);
  console.log(`Rationale: ${branch.rationale}`);
  console.log(`Evidence: ${fpath}`);
  console.log();
  console.log(`(Plan 04 closure will combine all 3 RF envs for final ADR-0005 Branch verdict.)`);
  // Exit 0 if A or B or borderline (per-env), 1 if C, 2 if skipped (handled earlier)
  process.exit(branchVerdict === "C" ? 1 : 0);
}

main().catch((err: unknown) => {
  console.error("Fatal:", err);
  process.exit(1);
});
