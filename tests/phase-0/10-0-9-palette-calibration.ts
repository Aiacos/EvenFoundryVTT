// Specs §10.0.9 + Pitfall 15 — sRGB-vs-linear FS dither + perceptual palette derivation via CIE L*.
// Protocol per docs/perf/phase-0/calibration/methodology.md (Plan 01):
//   1. Render uniform 16-step ramp (0/15, 1/15, ..., 15/15) on G2
//   2. Researcher photographs G2 in dim ambient + locked exposure (ISO 100, 1/30s, daylight WB)
//   3. Researcher places photo at docs/perf/phase-0/calibration/ramp-iter-{N}-{ts}.png
//      and provides per-step measured G luminance values via JSON file path
//   4. Script derives perceptual palette via inverse CIE L* mapping (linearize sRGB → L* → uniform spacing)
//   5. Script re-renders with derived palette
//   6. Researcher photographs again, provides measured luminance
//   7. Script verifies L* spacing within ±10% — pass if yes, iterate ≤3 times then fail
//
// Skip case: Hub unavailable → write skipped evidence + exit 2 (Pattern 3 capability-negotiation skip).
//
// Threat model T-00-03: ZERO network introspection. Photographs scrubbed of EXIF GPS by researcher
// per methodology.md operational protocol before commit.

import { loadHub } from "./_shared/hub.js";
import { writeJsonEvidence } from "./_shared/output.js";
import { PaletteCalibrationResult } from "./_shared/schemas.js";
import { readFile } from "node:fs/promises";

// THRESHOLDS pre-committed top-level (D-12 strict numeric, no runtime overrides).
const THRESHOLDS = {
  palette_steps: 16,
  max_iterations: 3,
  spacing_uniformity_pct_threshold: 10, // ±10% per CONTEXT.md D-13 + methodology.md
  ramp_width: 192, // 12 px per step × 16 steps
  ramp_height: 32,
} as const;

// CIE L* derivation (docs/perf/phase-0/calibration/methodology.md formulas).
function yToLstar(yNormalized: number): number {
  if (yNormalized <= 0) return 0;
  if (yNormalized > 0.008856) {
    return 116 * Math.pow(yNormalized, 1 / 3) - 16;
  }
  return 903.3 * yNormalized;
}

// Inverse CIE L* — derive sRGB step values that produce uniform L* spacing.
function deriveUniformLstarPalette(): number[] {
  const palette: number[] = [];
  for (let i = 0; i < THRESHOLDS.palette_steps; i++) {
    const targetLstar = (i / (THRESHOLDS.palette_steps - 1)) * 100;
    // Solve L* = 116·(Y/Yn)^(1/3) - 16 for Y/Yn assuming Yn=1
    const yNorm = targetLstar > 8 ? Math.pow((targetLstar + 16) / 116, 3) : targetLstar / 903.3;
    // Linear → sRGB encode (gamma 2.4 segmented)
    const linear = yNorm;
    const srgb = linear <= 0.0031308 ? linear * 12.92 : 1.055 * Math.pow(linear, 1 / 2.4) - 0.055;
    palette.push(Math.round(srgb * 255));
  }
  return palette;
}

function makeRampImage(palette: number[]): Uint8Array {
  // Pack as raw 8-bit greyscale — Plan 04 will adapt to 4-bit format once §10.0.2 verdict is known.
  const buf = new Uint8Array(THRESHOLDS.ramp_width * THRESHOLDS.ramp_height);
  const stepWidth = THRESHOLDS.ramp_width / THRESHOLDS.palette_steps;
  for (let y = 0; y < THRESHOLDS.ramp_height; y++) {
    for (let x = 0; x < THRESHOLDS.ramp_width; x++) {
      const stepIdx = Math.min(THRESHOLDS.palette_steps - 1, Math.floor(x / stepWidth));
      buf[y * THRESHOLDS.ramp_width + x] = palette[stepIdx] ?? 0;
    }
  }
  return buf;
}

async function loadMeasuredLuminance(iteration: number): Promise<number[] | null> {
  const fpath = `docs/perf/phase-0/calibration/measured-iter-${iteration}.json`;
  try {
    const text = await readFile(fpath, "utf8");
    const parsed = JSON.parse(text) as { g_means: number[] };
    if (!Array.isArray(parsed.g_means) || parsed.g_means.length !== THRESHOLDS.palette_steps) {
      console.error(
        `[ERROR] ${fpath}: g_means must be array of ${THRESHOLDS.palette_steps} numbers`,
      );
      return null;
    }
    return parsed.g_means;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  console.log("Specs §10.0.9 — Palette calibration (Pitfall 15 mitigation)");
  console.log("=============================================================");
  console.log(`Steps: ${THRESHOLDS.palette_steps}`);
  console.log(`Max iterations: ${THRESHOLDS.max_iterations}`);
  console.log(
    `Pass threshold: spacing within ±${THRESHOLDS.spacing_uniformity_pct_threshold}% L* uniform`,
  );
  console.log();

  const hub = await loadHub();
  if (!hub.available) {
    const skipped = PaletteCalibrationResult.parse({
      schema_version: 1,
      test_id: "10-0-9-palette-calibration",
      timestamp: new Date().toISOString(),
      verdict: "skipped",
      rationale: hub.reason,
      iterations: 1,
      uniform_palette_lstar: [],
      derived_palette_lstar: [],
      spacing_uniformity_pct: 0,
      passes_within_10pct: false,
      camera_settings: { iso: 100, exposure_sec: 1 / 30, white_balance: "daylight" },
    });
    const fpath = await writeJsonEvidence(skipped);
    console.log(`[SKIP] ${hub.reason}`);
    console.log(`Evidence: ${fpath}`);
    process.exit(2);
  }

  await hub.bridge.createImageContainer({
    id: "palette-cal",
    x: 0,
    y: 0,
    w: THRESHOLDS.ramp_width,
    h: THRESHOLDS.ramp_height,
  });

  // Iteration 0: uniform sRGB ramp (this is what we know is perceptually wrong; baseline measurement)
  let palette = Array.from({ length: THRESHOLDS.palette_steps }, (_, i) =>
    Math.round((i / (THRESHOLDS.palette_steps - 1)) * 255),
  );
  let uniformLstars: number[] = [];
  let derivedLstars: number[] = [];
  let spacingUniformityPct = 0;
  let passes = false;
  let iter = 1;

  for (iter = 1; iter <= THRESHOLDS.max_iterations; iter++) {
    console.log(`Iteration ${iter}: rendering palette ${JSON.stringify(palette)}`);
    await hub.bridge.updateImageRawData("palette-cal", makeRampImage(palette));
    console.log(`Photograph G2 now (camera locked: ISO 100, 1/30s, daylight WB).`);
    console.log(`Save as: docs/perf/phase-0/calibration/ramp-iter-${iter}-{ts}.png`);
    console.log(
      `Then write per-step G luminance JSON to: docs/perf/phase-0/calibration/measured-iter-${iter}.json`,
    );
    console.log(`  Format: { "g_means": [<step0>, <step1>, ..., <step15>] }`);
    console.log(`Press Ctrl+C and re-run after the JSON file is in place.`);

    const measured = await loadMeasuredLuminance(iter);
    if (!measured) {
      console.log(
        `[WAIT] Measured luminance file not yet present. Aborting iteration loop — re-run after camera capture.`,
      );
      break;
    }

    const yMax = Math.max(...measured);
    const lstars = measured.map((g) => yToLstar(g / Math.max(0.0001, yMax)));
    if (iter === 1) uniformLstars = lstars;
    derivedLstars = lstars;

    // Compute spacing uniformity: ratio of max gap deviation to mean gap
    const gaps: number[] = [];
    for (let i = 1; i < lstars.length; i++) {
      const cur = lstars[i];
      const prev = lstars[i - 1];
      if (cur === undefined || prev === undefined) continue;
      gaps.push(cur - prev);
    }
    const meanGap = gaps.reduce((s, g) => s + g, 0) / Math.max(1, gaps.length);
    const maxDeviation = Math.max(...gaps.map((g) => Math.abs(g - meanGap)));
    spacingUniformityPct = (maxDeviation / Math.max(0.01, meanGap)) * 100;
    passes = spacingUniformityPct <= THRESHOLDS.spacing_uniformity_pct_threshold;

    console.log(
      `Iteration ${iter}: spacing uniformity = ${spacingUniformityPct.toFixed(1)}% (pass if ≤${THRESHOLDS.spacing_uniformity_pct_threshold}%)`,
    );
    if (passes) break;

    // Derive next palette via inverse CIE L*
    palette = deriveUniformLstarPalette();
  }

  const verdict: "pass" | "fail" = passes ? "pass" : "fail";
  const rationale = passes
    ? `Iteration ${iter}: spacing within ±${spacingUniformityPct.toFixed(1)}% L* uniform — palette calibrated`
    : `After ${iter} iteration(s): spacing ${spacingUniformityPct.toFixed(1)}% exceeds ±${THRESHOLDS.spacing_uniformity_pct_threshold}% threshold — needs Phase 4a follow-up (CIEDE2000 / photometer)`;

  const result = PaletteCalibrationResult.parse({
    schema_version: 1,
    test_id: "10-0-9-palette-calibration",
    timestamp: new Date().toISOString(),
    verdict,
    rationale,
    iterations: iter,
    uniform_palette_lstar: uniformLstars,
    derived_palette_lstar: derivedLstars,
    spacing_uniformity_pct: spacingUniformityPct,
    passes_within_10pct: passes,
    camera_settings: { iso: 100, exposure_sec: 1 / 30, white_balance: "daylight" },
  });
  const fpath = await writeJsonEvidence(result);
  console.log();
  console.log(`Verdict: ${verdict.toUpperCase()}`);
  console.log(`Rationale: ${rationale}`);
  console.log(`Evidence: ${fpath}`);
  process.exit(verdict === "pass" ? 0 : 1);
}

main().catch((err: unknown) => {
  console.error("Fatal:", err);
  process.exit(1);
});
