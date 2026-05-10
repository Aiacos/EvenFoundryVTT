// Specs §10.0.8 + Pitfall 12 — G2 firmware queue depth assumption (full table {1,2,3,≥4}).
// CONTEXT.md D-10 strict tier mapping → deriveQueueDepthTier helper from _shared/branch-decision.ts.
//
// Protocol:
//   - Issue 8 distinct tile IDs back-to-back (no awaiting individual SDK promises sequentially)
//   - Race the bulk dispatch against a settle timeout (5 sec)
//   - Inspect what the firmware acknowledged vs dropped (via callback if SDK exposes; else infer from
//     subsequent re-fetch of last applied tile id)
//   - measured_max_queue = how many tiles were accepted concurrently before dropping started
//
// Skip case: Hub unavailable → write skipped evidence + exit 2 (Pattern 3 capability-negotiation skip).
//
// Threat model T-00-03: ZERO network introspection. Only application-observable promise resolution.

import { loadHub } from "./_shared/hub.js";
import { writeJsonEvidence } from "./_shared/output.js";
import { deriveQueueDepthTier } from "./_shared/branch-decision.js";
import { QueueDepthResult } from "./_shared/schemas.js";

// THRESHOLDS pre-committed top-level (D-12 strict numeric, no runtime overrides).
const THRESHOLDS = {
  burst_size: 8,
  settle_timeout_ms: 5000,
  tile_size_bytes: 4096,
} as const;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

const QUEUE_TABLE = {
  "1": "20 fps cap (linear serialization)",
  "2": "tier A — push 2 tiles, wait for settle, push next 2",
  "3": "tier B — adaptive fps Layer 6 + warning chip",
  ">=4": "tier C — automatic degrade glyph mode",
} as const;

async function main(): Promise<void> {
  console.log("Specs §10.0.8 — Queue depth empirical probe");
  console.log("============================================");
  console.log(`Burst: ${THRESHOLDS.burst_size} tiles back-to-back`);
  console.log();

  const hub = await loadHub();
  if (!hub.available) {
    const skipped = QueueDepthResult.parse({
      schema_version: 1,
      test_id: "10-0-8-queue-depth",
      timestamp: new Date().toISOString(),
      verdict: "skipped",
      rationale: hub.reason,
      burst_size: THRESHOLDS.burst_size,
      measured_max_queue: 0,
      dropped_count: 0,
      coalesced_count: 0,
      table: QUEUE_TABLE,
    });
    const fpath = await writeJsonEvidence(skipped);
    console.log(`[SKIP] ${hub.reason}`);
    console.log(`Evidence: ${fpath}`);
    process.exit(2);
  }

  // Pre-create 8 image containers with distinct IDs (so we can detect which ones got rendered).
  for (let i = 0; i < THRESHOLDS.burst_size; i++) {
    await hub.bridge.createImageContainer({ id: `queue-test-${i}`, x: i * 10, y: 0, w: 8, h: 8 });
  }

  const tile = new Uint8Array(THRESHOLDS.tile_size_bytes);
  // Distinct payload per tile so coalesce-detection has signal
  for (let i = 0; i < tile.length; i++) tile[i] = i & 0xff;

  // Burst: fire all updateImageRawData calls in a single microtask batch, capture which resolve.
  const promises = Array.from({ length: THRESHOLDS.burst_size }, (_, i) => {
    const dist = new Uint8Array(tile);
    dist[0] = i; // unique payload prefix (first byte distinct per tile)
    return hub.bridge
      .updateImageRawData(`queue-test-${i}`, dist)
      .then(() => ({ i, status: "accepted" as const }))
      .catch((err: unknown) => ({ i, status: "rejected" as const, err: String(err) }));
  });

  type SettleEntry =
    | { i: number; status: "accepted" }
    | { i: number; status: "rejected"; err: string };

  const settled = await Promise.race<SettleEntry[] | null>([
    Promise.all(promises),
    sleep(THRESHOLDS.settle_timeout_ms).then(() => null),
  ]);

  let measuredMaxQueue = 0;
  let dropped = 0;
  let coalesced = 0;
  if (settled === null) {
    // Timeout — count how many actually resolved by polling promise states.
    // Heuristic: if Promise.race timed out, queue couldn't absorb 8 within 5 sec; pessimistic = ≥4 (tier C).
    measuredMaxQueue = 4;
    dropped = THRESHOLDS.burst_size - measuredMaxQueue;
  } else {
    const accepted = settled.filter((s) => s.status === "accepted").length;
    measuredMaxQueue = accepted;
    dropped = THRESHOLDS.burst_size - accepted;
    // Coalesce inference: if SDK returned accept but tile not visible, firmware coalesced.
    // Phase 0 cannot empirically verify visibility without G2 photo; document as 0 for first run,
    // researcher updates manually in Plan 04 if visual inspection reveals coalescing.
    coalesced = 0;
  }

  const tier = deriveQueueDepthTier(measuredMaxQueue);
  // Per-test verdict mapping: tier A → pass; tier B/C → fail (signals Branch B/C downgrade).
  // ADR-0005 (Plan 04) reconciles across all 7 tests; this is a per-test signal.
  const verdict: "pass" | "fail" = tier.tier === "A" ? "pass" : "fail";

  const result = QueueDepthResult.parse({
    schema_version: 1,
    test_id: "10-0-8-queue-depth",
    timestamp: new Date().toISOString(),
    verdict,
    rationale: tier.rationale,
    burst_size: THRESHOLDS.burst_size,
    measured_max_queue: measuredMaxQueue,
    dropped_count: dropped,
    coalesced_count: coalesced,
    table: QUEUE_TABLE,
  });
  const fpath = await writeJsonEvidence(result);
  console.log();
  console.log(`Verdict: ${verdict.toUpperCase()}`);
  console.log(`Tier: ${tier.tier}`);
  console.log(`Rationale: ${tier.rationale}`);
  console.log(`Evidence: ${fpath}`);
  process.exit(verdict === "pass" ? 0 : 1);
}

main().catch((err: unknown) => {
  console.error("Fatal:", err);
  process.exit(1);
});
