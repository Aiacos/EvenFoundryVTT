// Specs §10.0.7 + Pitfall 10 — DLE detected at connect, can degrade silently mid-session.
// CONTEXT.md (D-11) extends from 30-sec to 30-min sustained per research adjustment.
//
// Branch A floor reference (D-11): 5 fps committed = ~80 KB/s ≈ 640 kbps; 15 fps stretch = ~1920 kbps
// (separate gate — 15 fps stretch only unlocks if this 30-min sustained passes AND queue depth ≤2 AND
// BLE multi-env all 3 envs hit Branch A envelope per CONTEXT.md D-09).
//
// Protocol (RESEARCH §"Don't Hand-Roll" — application-observable throughput via SDK callback timestamps):
//   - Push 4 KB tile every 100 ms for 30 min
//   - Every 2 sec, send a 50-byte heartbeat ping (Pitfall 10 mitigation 2 — inferred-MTU canary)
//   - Capture every observed throughput dip ≥50% relative to first-minute baseline as renegotiation event
//   - Compute p50/p99 sustained; verdict: pass if p99 ≥100 kbps (D-09 Branch B floor envelope), else fail
//
// Skip case: Hub unavailable → write skipped evidence + exit 2 (Pattern 3 capability-negotiation skip).
//
// Threat model T-00-03: ZERO network introspection. No navigator.connection, no SSID/BSSID capture.
// Only SDK-callback timestamps + payload size are recorded.

import { loadHub } from '../src/lib/hub.js';
import { writeCsvEvidence, writeJsonEvidence } from '../src/lib/output.js';
import { DleSustainedResult } from '../src/lib/schemas.js';
import { percentile } from '../src/lib/stats.js';

// THRESHOLDS pre-committed top-level (D-12 strict numeric, no runtime overrides).
const THRESHOLDS = {
  duration_ms: 30 * 60 * 1000,
  tile_size_bytes: 4096,
  tile_interval_ms: 100,
  heartbeat_size_bytes: 50,
  heartbeat_interval_ms: 2000,
  renegotiation_drop_threshold_pct: 50,
  baseline_window_samples: 60, // first 60 samples = first minute baseline
  pass_p99_kbps: 100, // align with D-09 Branch B floor (Pitfall 10 mitigation envelope)
} as const;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main(): Promise<void> {
  console.log('Specs §10.0.7 — DLE 30-min sustained throughput');
  console.log('================================================');
  console.log(`Duration: ${THRESHOLDS.duration_ms / 60_000} min`);
  console.log(`Tile: ${THRESHOLDS.tile_size_bytes} bytes every ${THRESHOLDS.tile_interval_ms} ms`);
  console.log(
    `Heartbeat: ${THRESHOLDS.heartbeat_size_bytes} bytes every ${THRESHOLDS.heartbeat_interval_ms} ms`,
  );
  console.log();

  const hub = await loadHub();
  if (!hub.available) {
    const skipped = DleSustainedResult.parse({
      schema_version: 1,
      test_id: '10-0-7-dle-sustained',
      timestamp: new Date().toISOString(),
      verdict: 'skipped',
      rationale: hub.reason,
      duration_sec: 1,
      initial_mtu_bytes: 1,
      inferred_mtu_history: [],
      renegotiation_events: [],
      sustained_kbps_p50: 0,
      sustained_kbps_p99: 0,
    });
    const fpath = await writeJsonEvidence(skipped);
    console.log(`[SKIP] ${hub.reason}`);
    console.log(`Evidence: ${fpath}`);
    process.exit(2);
  }

  await hub.bridge.createImageContainer({ id: 'dle-test', x: 0, y: 0, w: 200, h: 100 });
  const tile = new Uint8Array(THRESHOLDS.tile_size_bytes);
  for (let i = 0; i < tile.length; i++) tile[i] = i & 0xff;
  const heartbeat = new Uint8Array(THRESHOLDS.heartbeat_size_bytes);

  const samples: number[] = [];
  const inferredMtuHistory: Array<{ t_sec: number; inferred_mtu_bytes: number }> = [];
  const renegotiationEvents: Array<{ t_sec: number; p_drop_pct: number }> = [];
  let baselineKbps = 0;
  let lastHeartbeatAt = 0;

  const t0 = performance.now();
  while (performance.now() - t0 < THRESHOLDS.duration_ms) {
    const tStart = performance.now();
    await hub.bridge.updateImageRawData('dle-test', tile);
    const tEnd = performance.now();
    const elapsedMs = Math.max(0.001, tEnd - tStart);
    const kbps = (THRESHOLDS.tile_size_bytes * 8) / (elapsedMs / 1000) / 1000;
    samples.push(kbps);

    if (samples.length === THRESHOLDS.baseline_window_samples) {
      baselineKbps = percentile(samples, 50);
      console.log(`Baseline established: p50=${baselineKbps.toFixed(1)} kbps`);
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

    // Heartbeat (inferred-MTU canary — Pitfall 10 mitigation 2)
    if (tEnd - lastHeartbeatAt >= THRESHOLDS.heartbeat_interval_ms) {
      const hbStart = performance.now();
      await hub.bridge.updateImageRawData('dle-test', heartbeat);
      const hbMs = Math.max(0.001, performance.now() - hbStart);
      // Inferred-MTU heuristic: 50-byte payload should round-trip in <50 ms when DLE-extended
      // MTU (247 bytes) is in effect. If the heartbeat takes ≥50 ms, MTU likely degraded
      // toward the BLE 4.0 default (23 bytes). Phase 4a will replace this heuristic with the
      // real getMtu() call once SDK signature is verified post-grant.
      const inferredMtu = hbMs < 50 ? 247 : 23;
      inferredMtuHistory.push({
        t_sec: (performance.now() - t0) / 1000,
        inferred_mtu_bytes: inferredMtu,
      });
      lastHeartbeatAt = tEnd;
    }

    const slack = THRESHOLDS.tile_interval_ms - (performance.now() - tStart);
    if (slack > 0) await sleep(slack);
  }

  const p50 = percentile(samples, 50);
  const p99 = percentile(samples, 99);
  const initialMtu = inferredMtuHistory[0]?.inferred_mtu_bytes ?? 247;

  const verdict: 'pass' | 'fail' = p99 >= THRESHOLDS.pass_p99_kbps ? 'pass' : 'fail';
  const rationale =
    verdict === 'pass'
      ? `30-min sustained: p50=${p50.toFixed(1)} kbps, p99=${p99.toFixed(1)} kbps; ${renegotiationEvents.length} renegotiation event(s) captured`
      : `p99=${p99.toFixed(1)} kbps below pass threshold ${THRESHOLDS.pass_p99_kbps} kbps; ${renegotiationEvents.length} renegotiation event(s)`;

  const result = DleSustainedResult.parse({
    schema_version: 1,
    test_id: '10-0-7-dle-sustained',
    timestamp: new Date().toISOString(),
    verdict,
    rationale,
    duration_sec: THRESHOLDS.duration_ms / 1000,
    initial_mtu_bytes: initialMtu,
    inferred_mtu_history: inferredMtuHistory,
    renegotiation_events: renegotiationEvents,
    sustained_kbps_p50: p50,
    sustained_kbps_p99: p99,
  });
  const fpath = await writeJsonEvidence(result);
  // CSV side-emit: writeCsvEvidence only fires for payloads with `samples_kbps`. DLE result schema
  // does not currently include the raw `samples_kbps` array (kept compact in JSON). When a Plan 04
  // researcher needs the full sample series for offline analysis, regenerate via `samples_kbps` extra
  // pass. For now, JSON-only evidence is sufficient for verdict reproducibility.
  void writeCsvEvidence;
  console.log();
  console.log(`Verdict: ${verdict.toUpperCase()}`);
  console.log(`Rationale: ${rationale}`);
  console.log(`Evidence: ${fpath}`);
  process.exit(verdict === 'pass' ? 0 : 1);
}

main().catch((err: unknown) => {
  console.error('Fatal:', err);
  process.exit(1);
});
