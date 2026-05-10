// Specs §10.0.1 + Pitfall 5 — R1 gesture timing windows.
// Protocol per RESEARCH §"Don't Hand-Roll" + Open Question 3:
//   - n=30 samples per gesture per session × 5 sessions = 150 samples per gesture
//   - 6 gestures: tap, double-tap, scroll-up, scroll-down, long-press-1s, long-press-2s
//   - Researcher follows CLI prompts: "perform 30 taps now" → SDK callback captures t_ms timestamps
//   - Computes mean ± SD per gesture + Hartigan dip test on tap_vs_double_tap_isi distribution
//   - Outputs recommended_windows_ms (tap_max, double_tap_max, long_press_min) — Phase 6 INV-5 input
//
// Skip case: Hub unavailable → write skipped evidence + exit 2 (Pattern 3 capability-negotiation skip).
//
// Threat model T-00-03: ZERO network introspection. Only SDK-callback gesture timestamps recorded.

import { loadHub } from "./_shared/hub.js";
import { writeJsonEvidence } from "./_shared/output.js";
import { percentile, hartiganDipTest, ci95 } from "./_shared/stats.js";
import { R1TimingResult } from "./_shared/schemas.js";
import { createInterface } from "node:readline/promises";

// THRESHOLDS pre-committed top-level (D-12 strict numeric, no runtime overrides).
const THRESHOLDS = {
  samples_per_gesture_per_session: 30,
  sessions: 5,
  bimodality_p_threshold: 0.05, // tap vs double-tap distinguishable if Hartigan dip p < 0.05
  long_press_min_ms_floor: 500, // Specs §10.0.1 GO/NO-GO bar
} as const;

const GESTURES = [
  "tap",
  "double-tap",
  "scroll-up",
  "scroll-down",
  "long-press-1s",
  "long-press-2s",
] as const;
type Gesture = (typeof GESTURES)[number];

type R1EventHandler = (ev: { type: string; t_ms: number; raw: unknown }) => void;
type R1Bridge = { onR1Event: (h: R1EventHandler) => () => void };

async function captureGestureTimings(
  bridge: R1Bridge,
  gesture: Gesture,
  n: number,
  rl: ReturnType<typeof createInterface>,
): Promise<number[]> {
  await rl.question(`\n>>> Perform ${n} × [${gesture}] now. Press ENTER when ready, then perform.`);
  const samples: number[] = [];
  let lastT = 0;
  return new Promise((resolve) => {
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    const off = bridge.onR1Event((ev) => {
      // Filter: only count events whose type matches the requested gesture (best-effort firmware match)
      const gestureRoot = gesture.split("-")[0] ?? "";
      if (!ev.type.includes(gestureRoot)) return;
      if (lastT > 0) {
        const isi = ev.t_ms - lastT;
        if (isi > 0 && isi < 5000) samples.push(isi);
      }
      lastT = ev.t_ms;
      if (samples.length >= n) {
        if (timeoutHandle) clearTimeout(timeoutHandle);
        off();
        resolve(samples);
      }
    });
    // 60-sec timeout per gesture batch
    timeoutHandle = setTimeout(() => {
      off();
      resolve(samples);
    }, 60_000);
  });
}

async function main(): Promise<void> {
  console.log("Specs §10.0.1 — R1 gesture timing windows");
  console.log("==========================================");
  console.log(`Sessions: ${THRESHOLDS.sessions}`);
  console.log(`Samples per gesture per session: ${THRESHOLDS.samples_per_gesture_per_session}`);
  console.log(
    `Total per gesture: ${THRESHOLDS.sessions * THRESHOLDS.samples_per_gesture_per_session}`,
  );
  console.log();

  const hub = await loadHub();
  if (!hub.available) {
    const skipped = R1TimingResult.parse({
      schema_version: 1,
      test_id: "10-0-1-r1-timing",
      timestamp: new Date().toISOString(),
      verdict: "skipped",
      rationale: hub.reason,
      sessions: 1,
      samples_per_gesture: 1,
      gestures: {},
      bimodality: {
        tap_vs_double_tap_dip: 0,
        tap_vs_double_tap_p_value: 1,
        distinguishable: false,
      },
      recommended_windows_ms: { tap_max: 250, double_tap_max: 500, long_press_min: 500 },
    });
    const fpath = await writeJsonEvidence(skipped);
    console.log(`[SKIP] ${hub.reason}`);
    console.log(`Evidence: ${fpath}`);
    process.exit(2);
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const allSamples: Record<Gesture, number[]> = {
    tap: [],
    "double-tap": [],
    "scroll-up": [],
    "scroll-down": [],
    "long-press-1s": [],
    "long-press-2s": [],
  };

  for (let session = 1; session <= THRESHOLDS.sessions; session++) {
    console.log(`\n=== Session ${session}/${THRESHOLDS.sessions} ===`);
    for (const g of GESTURES) {
      const samples = await captureGestureTimings(
        hub.bridge,
        g,
        THRESHOLDS.samples_per_gesture_per_session,
        rl,
      );
      allSamples[g].push(...samples);
      console.log(`  ${g}: captured ${samples.length} samples`);
    }
  }
  await rl.close();

  // Compute per-gesture stats
  const gestureStats: Record<string, { mean_ms: number; sd_ms: number; p95_ms: number; n: number }> = {};
  for (const g of GESTURES) {
    const samples = allSamples[g];
    const ci = ci95(samples);
    const variance =
      samples.length > 1
        ? samples.reduce((s, x) => s + (x - ci.mean) ** 2, 0) / (samples.length - 1)
        : 0;
    gestureStats[g] = {
      mean_ms: ci.mean,
      sd_ms: Math.sqrt(variance),
      p95_ms: percentile(samples, 95),
      n: samples.length,
    };
  }

  // Bimodality check on tap vs double-tap distribution
  const tapAndDouble = [...allSamples["tap"], ...allSamples["double-tap"]];
  const dip = hartiganDipTest(tapAndDouble);
  const distinguishable = dip.pValue < THRESHOLDS.bimodality_p_threshold;

  // Recommended windows: tap_max = midpoint between tap p95 and double-tap mean
  const tapP95 = gestureStats["tap"]?.p95_ms ?? 250;
  const doubleMean = gestureStats["double-tap"]?.mean_ms ?? 400;
  const longPress1Mean = gestureStats["long-press-1s"]?.mean_ms ?? 1000;
  const tapMax = Math.round(Math.max(150, Math.min(tapP95 + 50, (tapP95 + doubleMean) / 2)));
  const doubleTapMax = Math.round(Math.max(tapMax + 100, doubleMean + 100));
  const longPressMin = Math.max(THRESHOLDS.long_press_min_ms_floor, Math.round(longPress1Mean * 0.7));

  const verdict: "pass" | "fail" =
    distinguishable && longPressMin >= THRESHOLDS.long_press_min_ms_floor ? "pass" : "fail";
  const rationale =
    verdict === "pass"
      ? `Tap vs double-tap bimodal (Hartigan dip p=${dip.pValue.toFixed(3)} < ${THRESHOLDS.bimodality_p_threshold}); long_press_min=${longPressMin}ms ≥ ${THRESHOLDS.long_press_min_ms_floor}ms floor`
      : `Distinguishability failed: dip p=${dip.pValue.toFixed(3)}, long_press_min=${longPressMin}ms — INV-5 design needs explicit visual feedback chip (Pitfall 5)`;

  const result = R1TimingResult.parse({
    schema_version: 1,
    test_id: "10-0-1-r1-timing",
    timestamp: new Date().toISOString(),
    verdict,
    rationale,
    sessions: THRESHOLDS.sessions,
    samples_per_gesture: THRESHOLDS.sessions * THRESHOLDS.samples_per_gesture_per_session,
    gestures: gestureStats,
    bimodality: {
      tap_vs_double_tap_dip: dip.dip,
      tap_vs_double_tap_p_value: dip.pValue,
      distinguishable,
    },
    recommended_windows_ms: { tap_max: tapMax, double_tap_max: doubleTapMax, long_press_min: longPressMin },
  });
  const fpath = await writeJsonEvidence(result);
  console.log();
  console.log(`Verdict: ${verdict.toUpperCase()}`);
  console.log(`Rationale: ${rationale}`);
  console.log(
    `Recommended windows (Phase 6 INV-5 input): tap_max=${tapMax}ms, double_tap_max=${doubleTapMax}ms, long_press_min=${longPressMin}ms`,
  );
  console.log(`Evidence: ${fpath}`);
  process.exit(verdict === "pass" ? 0 : 1);
}

main().catch((err: unknown) => {
  console.error("Fatal:", err);
  process.exit(1);
});
